/**
 * BreakfastPredictor.js - v6.8
 * Predicts breakfast demand based on site population
 *
 * Handles:
 * - Population-based scaling (bread, eggs, bacon, ham, bologna, sausage, butter, jam)
 * - Per-person consumption rates from site_population.breakfast_profile
 * - Indian sub-population adjustments (if applicable)
 *
 * Note: Database wrapper from config/database.js already returns Promises
 */

class BreakfastPredictor {
  constructor(db) {
    this.db = db;
    // Database methods already return Promises - no promisify needed
    this.dbAll = db.all.bind(db);
    this.dbGet = db.get.bind(db);
    this.dbRun = db.run.bind(db);
  }

  /**
   * Get breakfast demand for today
   * @returns {Object} { date, population, demands[], summary }
   */
  async getBreakfastDemandForToday() {
    const date = new Date().toISOString().split('T')[0];

    try {
      // Get breakfast demand from view
      const demand = await this.dbGet(`
        SELECT
          demand_date,
          total_population,
          indian_count,
          bread_slices_per_person,
          eggs_per_person,
          bacon_strips_per_person,
          ham_slices_per_person,
          bologna_slices_per_person,
          sausage_links_per_person,
          butter_pats_per_person,
          jam_packets_per_person,
          bread_demand_slices,
          eggs_demand_ea,
          bacon_demand_strips,
          ham_demand_slices,
          bologna_demand_slices,
          sausage_demand_links,
          butter_demand_pats,
          jam_demand_packets
        FROM v_breakfast_demand_today_v2
        LIMIT 1
      `);

      if (!demand) {
        return {
          success: false,
          error: 'No breakfast demand data for today. Run population setup first.'
        };
      }

      // Build demand items array
      const demands = [
        {
          item: 'bread',
          per_person: demand.bread_slices_per_person,
          total_demand: demand.bread_demand_slices,
          unit: 'slices',
          category: 'breakfast'
        },
        {
          item: 'eggs',
          per_person: demand.eggs_per_person,
          total_demand: demand.eggs_demand_ea,
          unit: 'ea',
          category: 'breakfast'
        },
        {
          item: 'bacon',
          per_person: demand.bacon_strips_per_person,
          total_demand: demand.bacon_demand_strips,
          unit: 'strips',
          category: 'breakfast'
        },
        {
          item: 'ham',
          per_person: demand.ham_slices_per_person,
          total_demand: demand.ham_demand_slices,
          unit: 'slices',
          category: 'breakfast'
        },
        {
          item: 'bologna',
          per_person: demand.bologna_slices_per_person,
          total_demand: demand.bologna_demand_slices,
          unit: 'slices',
          category: 'breakfast'
        },
        {
          item: 'sausage',
          per_person: demand.sausage_links_per_person,
          total_demand: demand.sausage_demand_links,
          unit: 'links',
          category: 'breakfast'
        },
        {
          item: 'butter',
          per_person: demand.butter_pats_per_person,
          total_demand: demand.butter_demand_pats,
          unit: 'pats',
          category: 'breakfast'
        },
        {
          item: 'jam',
          per_person: demand.jam_packets_per_person,
          total_demand: demand.jam_demand_packets,
          unit: 'packets',
          category: 'breakfast'
        }
      ];

      // Enrich with inventory status
      const enrichedDemands = await Promise.all(
        demands.map(async (d) => {
          const alias = await this.dbGet(`
            SELECT item_code, conversion_factor, conversion_unit
            FROM item_alias_map
            WHERE alias_name = ? AND category = 'breakfast'
            LIMIT 1
          `, [d.item]);

          if (alias) {
            const inventory = await this.dbGet(`
              SELECT current_stock, par_level, unit
              FROM inventory_items
              WHERE item_code = ?
            `, [alias.item_code]);

            if (inventory) {
              const stockOutRisk = inventory.current_stock < d.total_demand ? 1 : 0;
              const shortage = stockOutRisk
                ? Math.max(0, d.total_demand - inventory.current_stock)
                : 0;

              return {
                ...d,
                item_code: alias.item_code,
                current_stock: inventory.current_stock,
                par_level: inventory.par_level,
                stock_unit: inventory.unit,
                stock_out_risk: stockOutRisk,
                shortage_qty: shortage,
                coverage_days: d.total_demand > 0
                  ? Math.floor(inventory.current_stock / d.total_demand * 10) / 10
                  : 999
              };
            }
          }

          return {
            ...d,
            item_code: null,
            current_stock: null,
            par_level: null,
            stock_unit: null,
            stock_out_risk: 0,
            shortage_qty: 0,
            coverage_days: null
          };
        })
      );

      // Calculate summary
      const summary = {
        total_population: demand.total_population,
        indian_count: demand.indian_count,
        total_items: enrichedDemands.length,
        stock_out_items: enrichedDemands.filter(d => d.stock_out_risk === 1).length,
        items_with_inventory: enrichedDemands.filter(d => d.item_code !== null).length
      };

      return {
        success: true,
        date,
        population: {
          total: demand.total_population,
          indian: demand.indian_count
        },
        demands: enrichedDemands,
        summary
      };

    } catch (error) {
      console.error('BreakfastPredictor.getBreakfastDemandForToday error:', error);
      throw error;
    }
  }

  /**
   * Get beverage demand for today
   * @returns {Object} { date, population, beverages[], summary }
   */
  async getBeverageDemandForToday() {
    const date = new Date().toISOString().split('T')[0];

    try {
      // Get beverage demand from view
      const demand = await this.dbGet(`
        SELECT
          demand_date,
          total_population,
          indian_count,
          coffee_cups_per_person,
          coffee_cup_size_oz,
          coffee_grounds_g_per_cup,
          coffee_demand_g,
          creamer_oz_per_cup,
          creamer_demand_oz,
          milk_oz_per_person,
          milk_demand_oz,
          tea_bags_per_person,
          tea_demand_bags,
          orange_juice_oz_per_person,
          orange_juice_demand_oz,
          apple_juice_oz_per_person,
          apple_juice_demand_oz
        FROM v_beverage_demand_today_v1
        LIMIT 1
      `);

      if (!demand) {
        return {
          success: false,
          error: 'No beverage demand data for today. Run population setup first.'
        };
      }

      // Build beverage items array
      const beverages = [
        {
          item: 'coffee',
          per_person: demand.coffee_cups_per_person,
          per_person_unit: 'cups',
          total_demand: demand.coffee_demand_g,
          unit: 'g',
          category: 'beverage',
          notes: `${demand.coffee_grounds_g_per_cup}g per ${demand.coffee_cup_size_oz}oz cup`
        },
        {
          item: 'creamer',
          per_person: demand.coffee_cups_per_person * demand.creamer_oz_per_cup,
          per_person_unit: 'oz',
          total_demand: demand.creamer_demand_oz,
          unit: 'oz',
          category: 'beverage',
          notes: `${demand.creamer_oz_per_cup}oz per cup`
        },
        {
          item: 'milk',
          per_person: demand.milk_oz_per_person,
          per_person_unit: 'oz',
          total_demand: demand.milk_demand_oz,
          unit: 'oz',
          category: 'beverage',
          notes: 'Whole milk'
        },
        {
          item: 'tea',
          per_person: demand.tea_bags_per_person,
          per_person_unit: 'bags',
          total_demand: demand.tea_demand_bags,
          unit: 'ea',
          category: 'beverage',
          notes: 'Tea bags'
        },
        {
          item: 'orange_juice',
          per_person: demand.orange_juice_oz_per_person,
          per_person_unit: 'oz',
          total_demand: demand.orange_juice_demand_oz,
          unit: 'oz',
          category: 'beverage',
          notes: 'Orange juice'
        },
        {
          item: 'apple_juice',
          per_person: demand.apple_juice_oz_per_person,
          per_person_unit: 'oz',
          total_demand: demand.apple_juice_demand_oz,
          unit: 'oz',
          category: 'beverage',
          notes: 'Apple juice'
        }
      ];

      // Enrich with inventory status
      const enrichedBeverages = await Promise.all(
        beverages.map(async (b) => {
          const alias = await this.dbGet(`
            SELECT item_code, conversion_factor, conversion_unit
            FROM item_alias_map
            WHERE alias_name = ? AND category = 'beverage'
            LIMIT 1
          `, [b.item]);

          if (alias) {
            const inventory = await this.dbGet(`
              SELECT current_stock, par_level, unit
              FROM inventory_items
              WHERE item_code = ?
            `, [alias.item_code]);

            if (inventory) {
              const stockOutRisk = inventory.current_stock < b.total_demand ? 1 : 0;
              const shortage = stockOutRisk
                ? Math.max(0, b.total_demand - inventory.current_stock)
                : 0;

              return {
                ...b,
                item_code: alias.item_code,
                current_stock: inventory.current_stock,
                par_level: inventory.par_level,
                stock_unit: inventory.unit,
                stock_out_risk: stockOutRisk,
                shortage_qty: shortage,
                coverage_days: b.total_demand > 0
                  ? Math.floor(inventory.current_stock / b.total_demand * 10) / 10
                  : 999
              };
            }
          }

          return {
            ...b,
            item_code: null,
            current_stock: null,
            par_level: null,
            stock_unit: null,
            stock_out_risk: 0,
            shortage_qty: 0,
            coverage_days: null
          };
        })
      );

      // Calculate summary
      const summary = {
        total_population: demand.total_population,
        indian_count: demand.indian_count,
        total_items: enrichedBeverages.length,
        stock_out_items: enrichedBeverages.filter(b => b.stock_out_risk === 1).length,
        items_with_inventory: enrichedBeverages.filter(b => b.item_code !== null).length
      };

      return {
        success: true,
        date,
        population: {
          total: demand.total_population,
          indian: demand.indian_count
        },
        beverages: enrichedBeverages,
        summary
      };

    } catch (error) {
      console.error('BreakfastPredictor.getBeverageDemandForToday error:', error);
      throw error;
    }
  }

  /**
   * Update breakfast profile for today
   * @param {Object} profile - { bread_slices_per_person, eggs_per_person, ... }
   * @returns {Object} { success, updated }
   */
  async updateBreakfastProfile(profile) {
    try {
      const existing = await this.dbGet(`
        SELECT population_id, breakfast_profile
        FROM site_population
        WHERE effective_date = DATE('now')
        LIMIT 1
      `);

      if (!existing) {
        return {
          success: false,
          error: 'No population record for today. Set population first.'
        };
      }

      const currentProfile = JSON.parse(existing.breakfast_profile || '{}');
      const updatedProfile = { ...currentProfile, ...profile };

      await this.dbRun(`
        UPDATE site_population
        SET breakfast_profile = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE population_id = ?
      `, [JSON.stringify(updatedProfile), existing.population_id]);

      return {
        success: true,
        updated: true,
        profile: updatedProfile
      };

    } catch (error) {
      console.error('BreakfastPredictor.updateBreakfastProfile error:', error);
      throw error;
    }
  }

  /**
   * Update beverage profile for today
   * @param {Object} profile - { coffee_cups_per_person, creamer_oz_per_cup, ... }
   * @returns {Object} { success, updated }
   */
  async updateBeverageProfile(profile) {
    try {
      const existing = await this.dbGet(`
        SELECT population_id, beverages_profile
        FROM site_population
        WHERE effective_date = DATE('now')
        LIMIT 1
      `);

      if (!existing) {
        return {
          success: false,
          error: 'No population record for today. Set population first.'
        };
      }

      const currentProfile = JSON.parse(existing.beverages_profile || '{}');
      const updatedProfile = { ...currentProfile, ...profile };

      await this.dbRun(`
        UPDATE site_population
        SET beverages_profile = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE population_id = ?
      `, [JSON.stringify(updatedProfile), existing.population_id]);

      return {
        success: true,
        updated: true,
        profile: updatedProfile
      };

    } catch (error) {
      console.error('BreakfastPredictor.updateBeverageProfile error:', error);
      throw error;
    }
  }
}

module.exports = BreakfastPredictor;
