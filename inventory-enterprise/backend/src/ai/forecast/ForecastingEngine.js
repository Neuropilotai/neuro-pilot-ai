/**
 * ForecastingEngine.js - v15.5.0
 * AI-Powered Forecasting + Order Recommendation Engine
 *
 * Uses exponential smoothing + population signals + menu rotation + feedback learning
 * to predict future demand and generate optimal order recommendations.
 *
 * Core Features:
 * - Exponential Smoothing with adaptive alpha
 * - Multi-signal fusion (usage history, population, menu, seasonality)
 * - Feedback-driven weight adjustments
 * - Confidence scoring with uncertainty quantification
 * - Order quantity optimization (considers PAR levels, lead time, safety stock)
 *
 * @author NeuroPilot AI Team
 * @version 15.5.0
 */

const { v4: uuidv4 } = require('uuid');

class ForecastingEngine {
  constructor(db) {
    this.db = db;
    this.MODEL_VERSION = 'v15.5.0-exp-smoothing';

    // Default weight vector for signal fusion
    this.defaultWeights = {
      usage_history: 0.40,      // Historical usage patterns (40%)
      population: 0.25,          // Population-based demand (25%)
      menu_rotation: 0.15,       // Menu calendar influence (15%)
      par_level: 0.10,           // Par level compliance (10%)
      seasonality: 0.10          // Seasonal trends (10%)
    };

    // Exponential smoothing parameters
    this.alpha = 0.3; // Smoothing factor (0.3 = balanced, 0.1 = slow, 0.5 = fast)
    this.beta = 0.1;  // Trend factor
  }

  /**
   * Generate forecast for all active inventory items
   * @param {object} options - Forecast configuration
   * @param {boolean} [options.shadowMode=true] - v15.5: Shadow mode (no auto-apply)
   * @param {string} [options.tenant_id] - v15.5: Tenant ID for multi-tenancy
   * @param {string} [options.location_id] - v15.5: Location ID
   * @param {string} [options.created_by] - v15.5: User email
   * @returns {object} { run_id, forecasts[], summary, duration_ms, shadow_mode }
   */
  async generateForecast(options = {}) {
    const startTime = Date.now();
    const runId = options.runId || `forecast_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const forecastDate = options.date || new Date().toISOString().split('T')[0];
    const horizonDays = options.horizonDays || 7;

    // v15.5: Shadow mode enabled by default (no auto-apply)
    const shadowMode = options.shadowMode !== false; // Default true
    const tenantId = options.tenant_id || process.env.TENANT_DEFAULT || 'neuropilot';
    const locationId = options.location_id || null;
    const createdBy = options.created_by || 'system';

    try {
      // Initialize forecast run record
      await this.db.run(`
        INSERT INTO ai_forecast_runs (
          run_id, forecast_date, forecast_horizon_days, model_version, status,
          input_data_sources, shadow_mode, tenant_id, location_id, created_by
        ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)
      `, [
        runId,
        forecastDate,
        horizonDays,
        this.MODEL_VERSION,
        JSON.stringify({
          usage_history: true,
          menu_rotation: true,
          population: true,
          par_levels: true,
          fifo_layers: true
        }),
        shadowMode ? 1 : 0,
        tenantId,
        locationId,
        createdBy
      ]);

      // Get active inventory items
      const items = await this.db.all(`
        SELECT
          item_code,
          item_name,
          category,
          unit,
          par_level,
          storage_location,
          current_stock
        FROM inventory_items
        WHERE is_active = 1
        ORDER BY category, item_name
      `);

      const forecasts = [];
      let totalConfidence = 0;
      let totalPredictedValue = 0;

      // Generate forecast for each item
      for (const item of items) {
        const forecast = await this._forecastItem(item, runId, forecastDate, horizonDays);
        if (forecast) {
          forecasts.push(forecast);
          totalConfidence += forecast.confidence_score;
          totalPredictedValue += forecast.recommended_order_qty * (forecast.unit_cost || 0);
        }
      }

      const avgConfidence = forecasts.length > 0 ? totalConfidence / forecasts.length : 0;
      const executionTime = Date.now() - startTime;

      // Update forecast run record
      await this.db.run(`
        UPDATE ai_forecast_runs
        SET
          items_forecasted = ?,
          avg_confidence = ?,
          total_predicted_value = ?,
          execution_time_ms = ?,
          status = 'completed',
          completed_at = datetime('now')
        WHERE run_id = ?
      `, [
        forecasts.length,
        avgConfidence,
        totalPredictedValue / 100, // Convert cents to dollars
        executionTime,
        runId
      ]);

      return {
        success: true,
        run_id: runId,
        forecast_date: forecastDate,
        horizon_days: horizonDays,
        items_forecasted: forecasts.length,
        avg_confidence: Math.round(avgConfidence * 100),
        total_predicted_value: totalPredictedValue / 100,
        duration_ms: executionTime,
        shadow_mode: shadowMode, // v15.5: Shadow mode flag
        forecasts
      };

    } catch (error) {
      // Mark forecast run as failed
      await this.db.run(`
        UPDATE ai_forecast_runs
        SET status = 'failed', error_message = ?, completed_at = datetime('now')
        WHERE run_id = ?
      `, [error.message, runId]);

      throw error;
    }
  }

  /**
   * Forecast demand for a single item
   * @private
   */
  async _forecastItem(item, runId, forecastDate, horizonDays) {
    try {
      // 1. Get historical usage data (last 30 days)
      const usageHistory = await this._getUsageHistory(item.item_code, 30);

      // 2. Get population data
      const population = await this._getPopulationData();

      // 3. Get menu rotation influence
      const menuInfluence = await this._getMenuInfluence(item.item_code, horizonDays);

      // 4. Calculate base prediction using exponential smoothing
      const basePrediction = this._exponentialSmoothing(usageHistory, horizonDays);

      // 5. Get custom weights from feedback loop (if available)
      const weights = await this._getLearnedWeights(item.item_code);

      // 6. Fuse signals with weighted combination
      const signals = {
        usage_history: basePrediction,
        population: population.demand_factor || 1.0,
        menu_rotation: menuInfluence.factor || 1.0,
        par_level: item.par_level || 0,
        seasonality: 1.0 // TODO: Implement seasonality detection
      };

      // Weighted prediction
      const predictedUsage =
        (signals.usage_history * weights.usage_history) +
        (signals.population * weights.population * basePrediction) +
        (signals.menu_rotation * weights.menu_rotation * basePrediction) +
        (signals.seasonality * weights.seasonality * basePrediction);

      // 7. Calculate confidence score
      const confidence = this._calculateConfidence(usageHistory, signals);

      // 8. Calculate recommended order quantity
      const recommendation = this._calculateOrderRecommendation({
        item,
        predicted_usage: predictedUsage,
        current_stock: item.current_stock,
        par_level: item.par_level,
        lead_time_days: 3, // Default lead time
        safety_stock_pct: 0.20 // 20% safety buffer
      });

      // 9. Get unit cost from latest FIFO layer
      const costLayer = await this.db.get(`
        SELECT unit_cost_cents
        FROM fifo_cost_layers
        WHERE item_code = ? AND remaining_qty > 0
        ORDER BY received_at DESC
        LIMIT 1
      `, [item.item_code]);

      // 10. Save forecast to history
      const forecastForDate = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const leadTimeDays = 3; // Default lead time

      await this.db.run(`
        INSERT INTO ai_forecast_history (
          run_id, item_code, item_name, forecast_date, forecast_for_date,
          predicted_usage, confidence_score, prediction_method,
          input_signals, weight_vector, storage_location, category, unit,
          par_level, recommended_order_qty, order_status,
          safety_stock, lead_time_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `, [
        runId,
        item.item_code,
        item.item_name,
        forecastDate,
        forecastForDate,
        predictedUsage,
        confidence,
        'exponential_smoothing_v2',
        JSON.stringify(signals),
        JSON.stringify(weights),
        item.storage_location,
        item.category,
        item.unit,
        item.par_level,
        recommendation.order_qty,
        recommendation.safety_stock, // v15.5: Store safety stock
        leadTimeDays // v15.5: Store lead time
      ]);

      return {
        item_code: item.item_code,
        item_name: item.item_name,
        category: item.category,
        predicted_usage: Math.round(predictedUsage * 100) / 100,
        confidence_score: confidence,
        recommended_order_qty: recommendation.order_qty,
        order_reason: recommendation.reason,
        current_stock: item.current_stock,
        par_level: item.par_level,
        unit_cost: costLayer?.unit_cost_cents || 0,
        signals,
        weights
      };

    } catch (error) {
      console.error(`Forecast error for ${item.item_code}:`, error);
      return null;
    }
  }

  /**
   * Get usage history for an item
   * @private
   */
  async _getUsageHistory(itemCode, days) {
    try {
      // Get usage from ai_reconcile_history (actual counts)
      const history = await this.db.all(`
        SELECT
          reconcile_date as date,
          (system_count - physical_count) as usage_qty
        FROM ai_reconcile_history
        WHERE item_code = ?
          AND reconcile_date >= date('now', '-${days} days')
        ORDER BY reconcile_date ASC
      `, [itemCode]);

      return history.map(h => ({
        date: h.date,
        qty: Math.abs(h.usage_qty || 0)
      }));
    } catch (error) {
      console.error('_getUsageHistory error:', error);
      return [];
    }
  }

  /**
   * Get population data and demand factor
   * @private
   */
  async _getPopulationData() {
    try {
      const pop = await this.db.get(`
        SELECT total_population, indian_count
        FROM site_population
        WHERE effective_date = DATE('now')
        LIMIT 1
      `);

      if (!pop) {
        return { total_population: 150, demand_factor: 1.0 };
      }

      // Demand factor based on population (normalized to 150 baseline)
      const demandFactor = pop.total_population / 150;

      return {
        total_population: pop.total_population,
        indian_count: pop.indian_count,
        demand_factor: demandFactor
      };
    } catch (error) {
      return { total_population: 150, demand_factor: 1.0 };
    }
  }

  /**
   * Get menu rotation influence for an item
   * @private
   */
  async _getMenuInfluence(itemCode, horizonDays) {
    try {
      // Check if item is used in upcoming menu recipes
      const forecastDate = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const menuCount = await this.db.get(`
        SELECT COUNT(*) as count
        FROM menu_calendar mc
        JOIN recipe_ingredients ri ON mc.recipe_id = ri.recipe_id
        WHERE ri.item_code = ?
          AND mc.menu_date BETWEEN DATE('now') AND ?
      `, [itemCode, forecastDate]);

      // If item is on menu, increase demand factor
      const factor = menuCount.count > 0 ? 1.5 : 1.0;

      return {
        menu_appearances: menuCount.count,
        factor
      };
    } catch (error) {
      return { menu_appearances: 0, factor: 1.0 };
    }
  }

  /**
   * Exponential smoothing forecast
   * @private
   */
  _exponentialSmoothing(history, horizonDays) {
    if (!history || history.length === 0) {
      return 0;
    }

    // Calculate smoothed values
    let S = history[0].qty; // Initial smoothed value
    let T = 0; // Initial trend

    for (let i = 1; i < history.length; i++) {
      const prevS = S;
      S = this.alpha * history[i].qty + (1 - this.alpha) * (S + T);
      T = this.beta * (S - prevS) + (1 - this.beta) * T;
    }

    // Forecast h steps ahead
    const forecast = S + horizonDays * T;

    return Math.max(0, forecast);
  }

  /**
   * Get learned weights from feedback loop
   * @private
   */
  async _getLearnedWeights(itemCode) {
    try {
      // Get most recent feedback for this item
      const feedback = await this.db.get(`
        SELECT weight_adjustments
        FROM ai_feedback_loop
        WHERE item_code = ? AND applied = 1
        ORDER BY submitted_at DESC
        LIMIT 1
      `, [itemCode]);

      if (feedback && feedback.weight_adjustments) {
        const adjustments = JSON.parse(feedback.weight_adjustments);

        // Apply adjustments to default weights
        const learnedWeights = { ...this.defaultWeights };
        for (const [key, delta] of Object.entries(adjustments)) {
          if (learnedWeights[key] !== undefined) {
            learnedWeights[key] = Math.max(0, Math.min(1, learnedWeights[key] + delta));
          }
        }

        // Normalize weights to sum to 1.0
        const sum = Object.values(learnedWeights).reduce((a, b) => a + b, 0);
        for (const key in learnedWeights) {
          learnedWeights[key] /= sum;
        }

        return learnedWeights;
      }

      return this.defaultWeights;
    } catch (error) {
      return this.defaultWeights;
    }
  }

  /**
   * Calculate confidence score based on data quality
   * @private
   */
  _calculateConfidence(history, signals) {
    let confidence = 0.5; // Base confidence

    // Factor 1: Historical data availability (up to +0.3)
    if (history.length >= 7) {
      confidence += 0.3;
    } else if (history.length >= 3) {
      confidence += 0.15;
    }

    // Factor 2: Data consistency (variance check, up to +0.2)
    if (history.length >= 3) {
      const values = history.map(h => h.qty);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // Coefficient of variation

      if (cv < 0.3) {
        confidence += 0.2; // Low variance = high confidence
      } else if (cv < 0.6) {
        confidence += 0.1;
      }
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Calculate recommended order quantity
   * @private
   */
  _calculateOrderRecommendation(params) {
    const {
      item,
      predicted_usage,
      current_stock,
      par_level,
      lead_time_days,
      safety_stock_pct
    } = params;

    // Calculate safety stock
    const safetyStock = predicted_usage * safety_stock_pct;

    // Calculate reorder point
    const reorderPoint = (predicted_usage * lead_time_days / 7) + safetyStock;

    // Determine order quantity
    let orderQty = 0;
    let reason = 'sufficient_stock';

    if (current_stock < reorderPoint) {
      // Stock below reorder point - order to reach par level + safety stock
      const targetStock = par_level || (predicted_usage * 2);
      orderQty = Math.max(0, targetStock + safetyStock - current_stock);
      reason = 'below_reorder_point';
    } else if (par_level && current_stock < par_level * 0.8) {
      // Stock below 80% of par level
      orderQty = Math.max(0, par_level - current_stock);
      reason = 'below_par_level';
    }

    // Round to reasonable order units
    orderQty = Math.ceil(orderQty);

    return {
      order_qty: orderQty,
      reason,
      reorder_point: Math.round(reorderPoint * 10) / 10,
      safety_stock: Math.round(safetyStock * 10) / 10
    };
  }

  /**
   * Submit feedback and learn from human adjustments
   * @param {object} feedback - Feedback data
   * @returns {object} { success, feedback_id, weight_adjustments }
   */
  async submitFeedback(feedback) {
    try {
      const {
        forecast_id,
        item_code,
        feedback_type, // 'adjustment', 'approval', 'rejection'
        original_prediction,
        human_adjustment,
        adjustment_reason,
        submitted_by
      } = feedback;

      // Calculate adjustment delta
      const adjustmentDelta = human_adjustment - original_prediction;
      const adjustmentDeltaPct = original_prediction > 0
        ? (adjustmentDelta / original_prediction) * 100
        : 0;

      // Calculate weight adjustments based on feedback type
      let weightAdjustments = {};

      if (feedback_type === 'adjustment' && Math.abs(adjustmentDeltaPct) > 10) {
        // Significant adjustment - learn from it
        if (adjustment_reason && adjustment_reason.includes('menu')) {
          weightAdjustments.menu_rotation = +0.05;
          weightAdjustments.usage_history = -0.05;
        } else if (adjustment_reason && adjustment_reason.includes('population')) {
          weightAdjustments.population = +0.05;
          weightAdjustments.usage_history = -0.05;
        }
      }

      // Insert feedback record
      const result = await this.db.run(`
        INSERT INTO ai_feedback_loop (
          forecast_id, item_code, feedback_type,
          original_prediction, human_adjustment, adjustment_reason,
          adjustment_delta, adjustment_delta_pct, weight_adjustments,
          submitted_by, applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [
        forecast_id,
        item_code,
        feedback_type,
        original_prediction,
        human_adjustment,
        adjustment_reason,
        adjustmentDelta,
        adjustmentDeltaPct,
        JSON.stringify(weightAdjustments),
        submitted_by
      ]);

      return {
        success: true,
        feedback_id: result.lastID,
        adjustment_delta: adjustmentDelta,
        adjustment_delta_pct: Math.round(adjustmentDeltaPct * 10) / 10,
        weight_adjustments: weightAdjustments
      };

    } catch (error) {
      console.error('submitFeedback error:', error);
      throw error;
    }
  }

  /**
   * Apply pending feedback to update model weights
   * @returns {object} { applied_count, updated_items }
   */
  async applyPendingFeedback() {
    try {
      // Get all pending feedback
      const pendingFeedback = await this.db.all(`
        SELECT
          feedback_id,
          item_code,
          weight_adjustments,
          adjustment_delta_pct
        FROM ai_feedback_loop
        WHERE applied = 0
        ORDER BY submitted_at DESC
      `);

      let appliedCount = 0;
      const updatedItems = new Set();

      for (const feedback of pendingFeedback) {
        // Mark as applied
        await this.db.run(`
          UPDATE ai_feedback_loop
          SET applied = 1, applied_at = datetime('now')
          WHERE feedback_id = ?
        `, [feedback.feedback_id]);

        appliedCount++;
        updatedItems.add(feedback.item_code);
      }

      return {
        success: true,
        applied_count: appliedCount,
        updated_items: Array.from(updatedItems)
      };

    } catch (error) {
      console.error('applyPendingFeedback error:', error);
      throw error;
    }
  }

  /**
   * Calculate forecast accuracy for past predictions
   * @returns {object} { accuracy_pct, total_forecasts, accurate_count }
   */
  async calculateAccuracy() {
    try {
      // Get forecasts that now have actual usage data
      const forecasts = await this.db.all(`
        SELECT
          h.forecast_id,
          h.item_code,
          h.predicted_usage,
          r.system_count - r.physical_count as actual_usage
        FROM ai_forecast_history h
        LEFT JOIN ai_reconcile_history r
          ON h.item_code = r.item_code
          AND h.forecast_for_date = r.reconcile_date
        WHERE h.forecast_for_date < DATE('now')
          AND r.system_count IS NOT NULL
          AND h.created_at >= datetime('now', '-30 days')
      `);

      if (forecasts.length === 0) {
        return {
          accuracy_pct: null,
          total_forecasts: 0,
          accurate_count: 0,
          avg_variance_pct: null
        };
      }

      let accurateCount = 0;
      let totalVariance = 0;

      for (const forecast of forecasts) {
        const actualUsage = Math.abs(forecast.actual_usage || 0);
        const variance = actualUsage > 0
          ? Math.abs((forecast.predicted_usage - actualUsage) / actualUsage) * 100
          : 0;

        // Update forecast record with actual values
        await this.db.run(`
          UPDATE ai_forecast_history
          SET
            actual_usage = ?,
            variance = ?,
            variance_pct = ?,
            updated_at = datetime('now')
          WHERE forecast_id = ?
        `, [
          actualUsage,
          forecast.predicted_usage - actualUsage,
          variance,
          forecast.forecast_id
        ]);

        // Accurate if variance <= 10%
        if (variance <= 10) {
          accurateCount++;
        }

        totalVariance += variance;
      }

      const accuracyPct = (accurateCount / forecasts.length) * 100;
      const avgVariancePct = totalVariance / forecasts.length;

      // Store accuracy metric
      const today = new Date().toISOString().split('T')[0];
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await this.db.run(`
        INSERT INTO ai_forecast_accuracy (
          calculation_date, period_start, period_end,
          total_forecasts, accurate_forecasts, accuracy_pct, avg_variance_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        today,
        periodStart,
        today,
        forecasts.length,
        accurateCount,
        accuracyPct,
        avgVariancePct
      ]);

      return {
        accuracy_pct: Math.round(accuracyPct * 10) / 10,
        total_forecasts: forecasts.length,
        accurate_count: accurateCount,
        avg_variance_pct: Math.round(avgVariancePct * 10) / 10
      };

    } catch (error) {
      console.error('calculateAccuracy error:', error);
      throw error;
    }
  }

  /**
   * Approve and apply forecast recommendations (v15.5 Shadow Mode)
   * Requires FINANCE or OWNER role
   *
   * @param {object} options - Approval options
   * @param {string} options.forecast_id - Forecast ID or run_id
   * @param {Array<string>} [options.item_codes] - Specific items to approve (optional, approve all if omitted)
   * @param {string} options.approved_by - User email
   * @param {string} [options.notes] - Approval notes
   * @returns {Promise<object>} { approved_count, items_updated, total_value }
   */
  async approveForecast(options) {
    const { forecast_id, item_codes, approved_by, notes } = options;

    try {
      let query = `
        UPDATE ai_forecast_history
        SET
          order_status = 'approved',
          approved_by = ?,
          approved_at = datetime('now'),
          approval_notes = ?
        WHERE run_id = ?
          AND order_status = 'pending'
      `;

      const params = [approved_by, notes || null, forecast_id];

      // If specific items provided, filter by them
      if (item_codes && Array.isArray(item_codes) && item_codes.length > 0) {
        const placeholders = item_codes.map(() => '?').join(',');
        query += ` AND item_code IN (${placeholders})`;
        params.push(...item_codes);
      }

      const result = await this.db.run(query, params);

      // Get approved items summary
      let summaryQuery = `
        SELECT
          COUNT(*) as approved_count,
          SUM(recommended_order_qty) as total_qty,
          GROUP_CONCAT(item_code) as items
        FROM ai_forecast_history
        WHERE run_id = ?
          AND order_status = 'approved'
          AND approved_by = ?
      `;

      const summaryParams = [forecast_id, approved_by];

      if (item_codes && Array.isArray(item_codes) && item_codes.length > 0) {
        const placeholders = item_codes.map(() => '?').join(',');
        summaryQuery += ` AND item_code IN (${placeholders})`;
        summaryParams.push(...item_codes);
      }

      const summary = await this.db.get(summaryQuery, summaryParams);

      return {
        success: true,
        approved_count: result.changes || 0,
        items: summary.items ? summary.items.split(',') : [],
        total_qty: summary.total_qty || 0,
        approved_by,
        approved_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('approveForecast error:', error);
      throw error;
    }
  }

  /**
   * Reject forecast recommendations (v15.5 Shadow Mode)
   *
   * @param {object} options - Rejection options
   * @param {string} options.forecast_id - Forecast ID or run_id
   * @param {Array<string>} [options.item_codes] - Specific items to reject
   * @param {string} options.rejected_by - User email
   * @param {string} options.reason - Rejection reason
   * @returns {Promise<object>} { rejected_count }
   */
  async rejectForecast(options) {
    const { forecast_id, item_codes, rejected_by, reason } = options;

    try {
      let query = `
        UPDATE ai_forecast_history
        SET
          order_status = 'rejected',
          approved_by = ?,
          approved_at = datetime('now'),
          approval_notes = ?
        WHERE run_id = ?
          AND order_status = 'pending'
      `;

      const params = [rejected_by, reason, forecast_id];

      if (item_codes && Array.isArray(item_codes) && item_codes.length > 0) {
        const placeholders = item_codes.map(() => '?').join(',');
        query += ` AND item_code IN (${placeholders})`;
        params.push(...item_codes);
      }

      const result = await this.db.run(query, params);

      return {
        success: true,
        rejected_count: result.changes || 0,
        rejected_by,
        reason
      };

    } catch (error) {
      console.error('rejectForecast error:', error);
      throw error;
    }
  }
}

module.exports = ForecastingEngine;
