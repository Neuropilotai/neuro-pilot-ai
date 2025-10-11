/**
 * FeedbackTrainer.js - v6.8
 * AI learning from owner free-text comments
 *
 * Parses comments like:
 *   "coffee 1.3 cups/person"
 *   "500 sandwiches/day"
 *   "eggs 1.5 per person for breakfast"
 *   "increase bacon to 2.5 strips/person"
 *
 * Applies learning to:
 *   - site_population.beverages_profile
 *   - site_population.breakfast_profile
 *   - menu_calendar quantities
 *
 * Note: Database wrapper from config/database.js already returns Promises
 */

const BeverageMath = require('./BeverageMath');

class FeedbackTrainer {
  constructor(db) {
    this.db = db;
    // Database methods already return Promises - no promisify needed
    this.dbAll = db.all.bind(db);
    this.dbGet = db.get.bind(db);
    this.dbRun = db.run.bind(db);
    this.beverageMath = new BeverageMath();

    // Pattern matchers
    this.patterns = {
      // "coffee 1.3 cups/person" or "coffee 1.3 cups per person"
      beveragePerPerson: /(\w+)\s+([\d.]+)\s+(\w+)\s*(?:\/|per)\s*person/i,

      // "creamer 0.5 oz/cup" or "creamer 0.5 oz per cup"
      beveragePerCup: /(\w+)\s+([\d.]+)\s+(\w+)\s*(?:\/|per)\s*cup/i,

      // "eggs 1.5 per person" or "bacon 2.5 strips/person"
      breakfastPerPerson: /(bread|eggs|bacon|ham|bologna|sausage|butter|jam)\s+([\d.]+)\s+(?:(\w+)\s+)?(?:\/|per)\s*person/i,

      // "500 sandwiches/day" or "250 sandwiches per day"
      recipePerDay: /(\d+)\s+(\w+)\s*(?:\/|per)\s*day/i,

      // "set population to 250" or "population 250"
      setPopulation: /(?:set\s+)?population\s+(?:to\s+)?(\d+)/i,

      // "indian population 20" or "set indian count to 20"
      setIndianPopulation: /(?:set\s+)?indian\s+(?:population|count)\s+(?:to\s+)?(\d+)/i
    };
  }

  /**
   * Store comment in database
   * @param {string} commentText - Free-text comment from owner
   * @param {string} userEmail - Owner email
   * @param {string} source - 'owner_console', 'cli', 'api'
   * @returns {Object} { success, comment_id }
   */
  async storeComment(commentText, userEmail = 'owner@neuroinnovate.local', source = 'owner_console') {
    try {
      const result = await this.dbRun(`
        INSERT INTO ai_feedback_comments (
          comment_text,
          comment_source,
          user_email,
          applied,
          created_at
        ) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
      `, [commentText, source, userEmail]);

      return {
        success: true,
        comment_id: result.lastID
      };

    } catch (error) {
      console.error('FeedbackTrainer.storeComment error:', error);
      throw error;
    }
  }

  /**
   * Parse comment and extract intent
   * @param {string} commentText - Free-text comment
   * @returns {Object} { intent, item, value, unit, per, confidence }
   */
  parseComment(commentText) {
    if (!commentText || typeof commentText !== 'string') {
      return { intent: 'unknown', confidence: 0 };
    }

    const normalized = commentText.toLowerCase().trim();

    // Check beverage per person
    let match = normalized.match(this.patterns.beveragePerPerson);
    if (match) {
      return {
        intent: 'set_beverage_per_person',
        item: match[1],
        value: parseFloat(match[2]),
        unit: match[3],
        per: 'person',
        confidence: 0.9
      };
    }

    // Check beverage per cup
    match = normalized.match(this.patterns.beveragePerCup);
    if (match) {
      return {
        intent: 'set_beverage_per_cup',
        item: match[1],
        value: parseFloat(match[2]),
        unit: match[3],
        per: 'cup',
        confidence: 0.9
      };
    }

    // Check breakfast per person
    match = normalized.match(this.patterns.breakfastPerPerson);
    if (match) {
      return {
        intent: 'set_breakfast_per_person',
        item: match[1],
        value: parseFloat(match[2]),
        unit: match[3] || 'ea',
        per: 'person',
        confidence: 0.85
      };
    }

    // Check recipe per day
    match = normalized.match(this.patterns.recipePerDay);
    if (match) {
      return {
        intent: 'set_recipe_qty',
        recipe: match[2],
        value: parseInt(match[1]),
        unit: 'ea',
        per: 'day',
        confidence: 0.85
      };
    }

    // Check set population
    match = normalized.match(this.patterns.setPopulation);
    if (match) {
      return {
        intent: 'set_population',
        value: parseInt(match[1]),
        confidence: 0.95
      };
    }

    // Check set Indian population
    match = normalized.match(this.patterns.setIndianPopulation);
    if (match) {
      return {
        intent: 'set_indian_population',
        value: parseInt(match[1]),
        confidence: 0.95
      };
    }

    return { intent: 'unknown', confidence: 0 };
  }

  /**
   * Apply learning from a comment
   * @param {number} commentId - Comment ID from ai_feedback_comments
   * @returns {Object} { success, applied, changes }
   */
  async applyLearningFromComment(commentId) {
    try {
      // Get comment
      const comment = await this.dbGet(`
        SELECT comment_id, comment_text, applied
        FROM ai_feedback_comments
        WHERE comment_id = ?
      `, [commentId]);

      if (!comment) {
        return {
          success: false,
          error: 'Comment not found'
        };
      }

      if (comment.applied === 1) {
        return {
          success: false,
          error: 'Comment already applied'
        };
      }

      // Parse comment
      const parsed = this.parseComment(comment.comment_text);

      if (parsed.intent === 'unknown' || parsed.confidence < 0.5) {
        await this.dbRun(`
          UPDATE ai_feedback_comments
          SET parsed_intent = 'unknown',
              updated_at = CURRENT_TIMESTAMP
          WHERE comment_id = ?
        `, [commentId]);

        return {
          success: false,
          error: 'Could not parse comment',
          parsed
        };
      }

      // Apply based on intent
      let changes = {};

      switch (parsed.intent) {
        case 'set_beverage_per_person':
          changes = await this._applyBeveragePerPerson(parsed);
          break;

        case 'set_beverage_per_cup':
          changes = await this._applyBeveragePerCup(parsed);
          break;

        case 'set_breakfast_per_person':
          changes = await this._applyBreakfastPerPerson(parsed);
          break;

        case 'set_recipe_qty':
          changes = await this._applyRecipeQty(parsed);
          break;

        case 'set_population':
          changes = await this._applySetPopulation(parsed);
          break;

        case 'set_indian_population':
          changes = await this._applySetIndianPopulation(parsed);
          break;

        default:
          return {
            success: false,
            error: `Unhandled intent: ${parsed.intent}`
          };
      }

      // Mark comment as applied
      await this.dbRun(`
        UPDATE ai_feedback_comments
        SET parsed_intent = ?,
            parsed_item_code = ?,
            parsed_value = ?,
            parsed_unit = ?,
            applied = 1,
            applied_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE comment_id = ?
      `, [parsed.intent, parsed.item || parsed.recipe || null, parsed.value, parsed.unit, commentId]);

      return {
        success: true,
        applied: true,
        parsed,
        changes
      };

    } catch (error) {
      console.error('FeedbackTrainer.applyLearningFromComment error:', error);
      throw error;
    }
  }

  /**
   * Apply learning from all pending comments
   * @returns {Object} { success, total, applied, failed }
   */
  async applyAllPendingComments() {
    try {
      const pending = await this.dbAll(`
        SELECT comment_id
        FROM ai_feedback_comments
        WHERE applied = 0
        ORDER BY created_at ASC
      `);

      const results = {
        total: pending.length,
        applied: 0,
        failed: 0,
        details: []
      };

      for (const comment of pending) {
        try {
          const result = await this.applyLearningFromComment(comment.comment_id);
          if (result.success) {
            results.applied++;
          } else {
            results.failed++;
          }
          results.details.push({
            comment_id: comment.comment_id,
            ...result
          });
        } catch (error) {
          results.failed++;
          results.details.push({
            comment_id: comment.comment_id,
            success: false,
            error: error.message
          });
        }
      }

      return {
        success: true,
        ...results
      };

    } catch (error) {
      console.error('FeedbackTrainer.applyAllPendingComments error:', error);
      throw error;
    }
  }

  /**
   * Apply beverage per person adjustment
   * @private
   */
  async _applyBeveragePerPerson(parsed) {
    const { item, value, unit } = parsed;

    const pop = await this.dbGet(`
      SELECT population_id, beverages_profile
      FROM site_population
      WHERE effective_date = DATE('now')
      LIMIT 1
    `);

    if (!pop) {
      throw new Error('No population record for today');
    }

    const profile = JSON.parse(pop.beverages_profile || '{}');

    // Map item to profile key
    const keyMap = {
      coffee: 'coffee_cups_per_person',
      tea: 'tea_bags_per_person',
      milk: 'milk_oz_per_person',
      orange_juice: 'orange_juice_oz_per_person',
      apple_juice: 'apple_juice_oz_per_person'
    };

    const key = keyMap[item];
    if (!key) {
      throw new Error(`Unknown beverage item: ${item}`);
    }

    const oldValue = profile[key] || 0;
    profile[key] = value;

    await this.dbRun(`
      UPDATE site_population
      SET beverages_profile = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE population_id = ?
    `, [JSON.stringify(profile), pop.population_id]);

    return {
      table: 'site_population',
      field: 'beverages_profile',
      key,
      old_value: oldValue,
      new_value: value
    };
  }

  /**
   * Apply beverage per cup adjustment
   * @private
   */
  async _applyBeveragePerCup(parsed) {
    const { item, value, unit } = parsed;

    const pop = await this.dbGet(`
      SELECT population_id, beverages_profile
      FROM site_population
      WHERE effective_date = DATE('now')
      LIMIT 1
    `);

    if (!pop) {
      throw new Error('No population record for today');
    }

    const profile = JSON.parse(pop.beverages_profile || '{}');

    // Map item to profile key
    const keyMap = {
      creamer: 'creamer_oz_per_cup',
      coffee: 'coffee_grounds_g_per_cup'
    };

    const key = keyMap[item];
    if (!key) {
      throw new Error(`Unknown per-cup beverage: ${item}`);
    }

    const oldValue = profile[key] || 0;
    profile[key] = value;

    await this.dbRun(`
      UPDATE site_population
      SET beverages_profile = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE population_id = ?
    `, [JSON.stringify(profile), pop.population_id]);

    return {
      table: 'site_population',
      field: 'beverages_profile',
      key,
      old_value: oldValue,
      new_value: value
    };
  }

  /**
   * Apply breakfast per person adjustment
   * @private
   */
  async _applyBreakfastPerPerson(parsed) {
    const { item, value, unit } = parsed;

    const pop = await this.dbGet(`
      SELECT population_id, breakfast_profile
      FROM site_population
      WHERE effective_date = DATE('now')
      LIMIT 1
    `);

    if (!pop) {
      throw new Error('No population record for today');
    }

    const profile = JSON.parse(pop.breakfast_profile || '{}');

    // Map item to profile key
    const keyMap = {
      bread: 'bread_slices_per_person',
      eggs: 'eggs_per_person',
      bacon: 'bacon_strips_per_person',
      ham: 'ham_slices_per_person',
      bologna: 'bologna_slices_per_person',
      sausage: 'sausage_links_per_person',
      butter: 'butter_pats_per_person',
      jam: 'jam_packets_per_person'
    };

    const key = keyMap[item];
    if (!key) {
      throw new Error(`Unknown breakfast item: ${item}`);
    }

    const oldValue = profile[key] || 0;
    profile[key] = value;

    await this.dbRun(`
      UPDATE site_population
      SET breakfast_profile = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE population_id = ?
    `, [JSON.stringify(profile), pop.population_id]);

    return {
      table: 'site_population',
      field: 'breakfast_profile',
      key,
      old_value: oldValue,
      new_value: value
    };
  }

  /**
   * Apply recipe quantity adjustment
   * @private
   */
  async _applyRecipeQty(parsed) {
    const { recipe, value } = parsed;

    // Find matching recipe (fuzzy match on display_name)
    const recipeRecord = await this.dbGet(`
      SELECT recipe_code, display_name
      FROM recipes
      WHERE LOWER(display_name) LIKE ?
         OR LOWER(recipe_code) LIKE ?
      LIMIT 1
    `, [`%${recipe}%`, `%${recipe}%`]);

    if (!recipeRecord) {
      throw new Error(`Recipe not found: ${recipe}`);
    }

    // Update menu_calendar for today
    const date = new Date().toISOString().split('T')[0];

    const existing = await this.dbGet(`
      SELECT calendar_id, qty
      FROM menu_calendar
      WHERE recipe_code = ? AND plan_date = ?
    `, [recipeRecord.recipe_code, date]);

    if (existing) {
      const oldValue = existing.qty;
      await this.dbRun(`
        UPDATE menu_calendar
        SET qty = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE calendar_id = ?
      `, [value, existing.calendar_id]);

      return {
        table: 'menu_calendar',
        recipe_code: recipeRecord.recipe_code,
        old_value: oldValue,
        new_value: value
      };

    } else {
      await this.dbRun(`
        INSERT INTO menu_calendar (recipe_code, plan_date, qty)
        VALUES (?, ?, ?)
      `, [recipeRecord.recipe_code, date, value]);

      return {
        table: 'menu_calendar',
        recipe_code: recipeRecord.recipe_code,
        old_value: 0,
        new_value: value
      };
    }
  }

  /**
   * Apply set population
   * @private
   */
  async _applySetPopulation(parsed) {
    const { value } = parsed;

    const pop = await this.dbGet(`
      SELECT population_id, total_count
      FROM site_population
      WHERE effective_date = DATE('now')
      LIMIT 1
    `);

    if (pop) {
      const oldValue = pop.total_count;
      await this.dbRun(`
        UPDATE site_population
        SET total_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE population_id = ?
      `, [value, pop.population_id]);

      return {
        table: 'site_population',
        field: 'total_count',
        old_value: oldValue,
        new_value: value
      };
    }

    throw new Error('No population record for today');
  }

  /**
   * Apply set Indian population
   * @private
   */
  async _applySetIndianPopulation(parsed) {
    const { value } = parsed;

    const pop = await this.dbGet(`
      SELECT population_id, indian_count
      FROM site_population
      WHERE effective_date = DATE('now')
      LIMIT 1
    `);

    if (pop) {
      const oldValue = pop.indian_count;
      await this.dbRun(`
        UPDATE site_population
        SET indian_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE population_id = ?
      `, [value, pop.population_id]);

      return {
        table: 'site_population',
        field: 'indian_count',
        old_value: oldValue,
        new_value: value
      };
    }

    throw new Error('No population record for today');
  }
}

module.exports = FeedbackTrainer;
