/**
 * MenuPredictor.js - v6.9
 * Predicts daily usage from menu calendar + breakfast + beverages
 *
 * Uses v_predicted_usage_today_v2 view which aggregates:
 * - Recipe-based demand from menu_calendar
 * - Population-based breakfast demand
 * - Population-based beverage demand
 *
 * Note: Database wrapper from config/database.js already returns Promises
 *
 * v6.9 Changes: Added database retry logic with exponential backoff
 * to handle SQLite lock contention during concurrent cron execution
 */

class MenuPredictor {
  constructor(db) {
    this.db = db;
    // Database methods already return Promises - no promisify needed
    this.dbAll = db.all.bind(db);
    this.dbGet = db.get.bind(db);
    this.dbRun = db.run.bind(db);
  }

  /**
   * Retry wrapper for database operations with exponential backoff
   * Handles SQLite BUSY/LOCKED errors during concurrent access
   * @private
   */
  async _withDatabaseRetry(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isSqliteError = error.code === 'SQLITE_ERROR' ||
                             error.code === 'SQLITE_BUSY' ||
                             error.code === 'SQLITE_LOCKED' ||
                             (error.message && error.message.includes('no such table'));

        if (isSqliteError && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
          console.log(`[MenuPredictor] DB retry ${attempt}/${maxRetries} after ${delay}ms - Error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Get predicted usage for today (menu + breakfast + beverages)
   * @returns {Object} { date, items[], summary }
   */
  async getPredictedUsageForToday() {
    const date = new Date().toISOString().split('T')[0];

    try {
      // Get aggregated predictions from view (with retry logic)
      const items = await this._withDatabaseRetry(() => this.dbAll(`
        SELECT
          item_code,
          item_name,
          total_predicted_qty,
          unit,
          current_stock,
          par_level,
          stock_out_risk,
          forecast_sources,
          avg_confidence,
          num_recipes_using
        FROM v_predicted_usage_today_v2
        ORDER BY stock_out_risk DESC, total_predicted_qty DESC
      `));

      // Calculate summary statistics
      const summary = {
        total_items: items.length,
        stock_out_items: items.filter(i => i.stock_out_risk === 1).length,
        avg_confidence: items.length > 0
          ? items.reduce((sum, i) => sum + i.avg_confidence, 0) / items.length
          : 0,
        sources: {
          menu: items.filter(i => i.forecast_sources.includes('menu')).length,
          breakfast: items.filter(i => i.forecast_sources.includes('breakfast_forecast')).length,
          beverage: items.filter(i => i.forecast_sources.includes('beverage_forecast')).length
        }
      };

      // Enrich items with additional context
      const enrichedItems = items.map(item => ({
        ...item,
        shortage_qty: item.stock_out_risk === 1
          ? Math.max(0, item.total_predicted_qty - item.current_stock)
          : 0,
        coverage_days: item.total_predicted_qty > 0
          ? Math.floor(item.current_stock / item.total_predicted_qty * 10) / 10
          : 999,
        risk_level: this._calculateRiskLevel(item)
      }));

      return {
        success: true,
        date,
        items: enrichedItems,
        summary
      };

    } catch (error) {
      console.error('MenuPredictor.getPredictedUsageForToday error:', error);
      throw error;
    }
  }

  /**
   * Get stock-out forecast with enhanced risk details
   * @returns {Object} { date, critical[], high[], medium[], summary }
   */
  async getStockoutForecast() {
    const date = new Date().toISOString().split('T')[0];

    try {
      const items = await this._withDatabaseRetry(() => this.dbAll(`
        SELECT
          item_code,
          item_name,
          total_predicted_qty,
          unit,
          current_stock,
          par_level,
          shortage_qty,
          shortage_pct,
          forecast_sources,
          avg_confidence,
          num_recipes_using,
          risk_level
        FROM v_stockout_forecast_v2
        ORDER BY
          CASE risk_level
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            ELSE 4
          END,
          shortage_qty DESC
      `));

      // Group by risk level
      const critical = items.filter(i => i.risk_level === 'CRITICAL');
      const high = items.filter(i => i.risk_level === 'HIGH');
      const medium = items.filter(i => i.risk_level === 'MEDIUM');

      const summary = {
        total_at_risk: items.length,
        critical_count: critical.length,
        high_count: high.length,
        medium_count: medium.length,
        total_shortage_value_cents: await this._calculateShortageValue(items)
      };

      return {
        success: true,
        date,
        critical,
        high,
        medium,
        summary
      };

    } catch (error) {
      console.error('MenuPredictor.getStockoutForecast error:', error);
      throw error;
    }
  }

  /**
   * Get population statistics for today
   * @returns {Object} { effective_date, total_count, indian_count, profiles }
   */
  async getPopulationStats() {
    try {
      const pop = await this._withDatabaseRetry(() => this.dbGet(`
        SELECT
          effective_date,
          total_population,
          indian_count,
          beverages_profile,
          breakfast_profile
        FROM site_population
        WHERE effective_date = DATE('now')
        LIMIT 1
      `));

      if (!pop) {
        return {
          success: false,
          error: 'No population data for today'
        };
      }

      return {
        success: true,
        effective_date: pop.effective_date,
        total_count: pop.total_population,
        indian_count: pop.indian_count,
        beverages_profile: JSON.parse(pop.beverages_profile || '{}'),
        breakfast_profile: JSON.parse(pop.breakfast_profile || '{}')
      };

    } catch (error) {
      console.error('MenuPredictor.getPopulationStats error:', error);
      throw error;
    }
  }

  /**
   * Update population counts for today
   * @param {number} totalCount - Total site population
   * @param {number} indianCount - Indian sub-population count
   * @returns {Object} { success, updated }
   */
  async updatePopulation(totalCount, indianCount = null) {
    try {
      const date = new Date().toISOString().split('T')[0];

      // Get existing record (with retry logic)
      const existing = await this._withDatabaseRetry(() => this.dbGet(`
        SELECT population_id, beverages_profile, breakfast_profile
        FROM site_population
        WHERE effective_date = DATE('now')
      `));

      if (existing) {
        // Update existing
        const updateFields = ['total_population = ?'];
        const params = [totalCount];

        if (indianCount !== null) {
          updateFields.push('indian_count = ?');
          params.push(indianCount);
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(existing.population_id);

        await this._withDatabaseRetry(() => this.dbRun(`
          UPDATE site_population
          SET ${updateFields.join(', ')}
          WHERE population_id = ?
        `, params));

        return {
          success: true,
          updated: true,
          effective_date: date,
          total_count: totalCount,
          indian_count: indianCount !== null ? indianCount : existing.indian_count
        };

      } else {
        // Insert new record with defaults (with retry logic)
        await this._withDatabaseRetry(() => this.dbRun(`
          INSERT INTO site_population (
            effective_date,
            total_population,
            indian_count,
            beverages_profile,
            breakfast_profile,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          date,
          totalCount,
          indianCount || 0,
          JSON.stringify({
            coffee_cups_per_person: 1.3,
            coffee_cup_size_oz: 8,
            coffee_grounds_g_per_cup: 10,
            creamer_oz_per_cup: 0.5,
            milk_oz_per_person: 4,
            tea_bags_per_person: 0.3,
            orange_juice_oz_per_person: 6,
            apple_juice_oz_per_person: 4
          }),
          JSON.stringify({
            bread_slices_per_person: 2.5,
            eggs_per_person: 1.2,
            bacon_strips_per_person: 2.0,
            ham_slices_per_person: 1.5,
            bologna_slices_per_person: 1.0,
            sausage_links_per_person: 1.5,
            butter_pats_per_person: 2,
            jam_packets_per_person: 1
          }),
          'Created via MenuPredictor'
        ]));

        return {
          success: true,
          updated: false,
          effective_date: date,
          total_count: totalCount,
          indian_count: indianCount || 0
        };
      }

    } catch (error) {
      console.error('MenuPredictor.updatePopulation error:', error);
      throw error;
    }
  }

  /**
   * Calculate risk level based on stock vs demand
   * @private
   */
  _calculateRiskLevel(item) {
    if (item.stock_out_risk === 0) {
      return 'LOW';
    }

    if (item.current_stock <= 0) {
      return 'CRITICAL';
    }

    const coveragePct = item.current_stock / item.total_predicted_qty;

    if (coveragePct < 0.5) {
      return 'HIGH';
    } else if (coveragePct < 1.0) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Calculate total shortage value in cents
   * @private
   */
  async _calculateShortageValue(items) {
    try {
      // Get latest cost per item from FIFO layers
      let totalValue = 0;

      for (const item of items) {
        const layer = await this._withDatabaseRetry(() => this.dbGet(`
          SELECT unit_cost_cents
          FROM fifo_cost_layers
          WHERE item_code = ?
            AND remaining_qty > 0
          ORDER BY received_at DESC
          LIMIT 1
        `, [item.item_code]));

        if (layer) {
          totalValue += Math.abs(item.shortage_qty) * layer.unit_cost_cents;
        }
      }

      return Math.round(totalValue);

    } catch (error) {
      console.error('MenuPredictor._calculateShortageValue error:', error);
      return 0;
    }
  }
}

module.exports = MenuPredictor;
