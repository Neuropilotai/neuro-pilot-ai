#!/usr/bin/env node

/**
 * AI Spot Check Recommendation System
 * Recommends which items to spot check based on risk factors
 */

const sqlite3 = require('sqlite3').verbose();

class SpotCheckRecommender {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.db = new sqlite3.Database(dbPath);
  }

  /**
   * Get spot check recommendations for a location
   */
  async getSpotCheckRecommendations(location, countDate, limit = 10) {
    return new Promise((resolve, reject) => {
      // Calculate risk scores for items in location
      this.db.all(`
        SELECT
          im.item_code,
          im.description,
          ic.category_name,
          COALESCE(ici.counted_quantity, 0) as last_count,
          COALESCE(ald.confidence_score, 0) as pattern_confidence,
          COUNT(DISTINCT avi.id) as variance_history_count,
          AVG(ABS(COALESCE(avi.variance_amount, 0))) as avg_variance,
          MAX(ABS(COALESCE(avi.variance_amount, 0))) as max_variance,
          COALESCE(ii.unit_price, 0) as unit_price
        FROM item_master im
        LEFT JOIN item_categories ic ON im.category_id = ic.category_id
        LEFT JOIN inventory_count_items ici ON im.item_code = ici.item_code
          AND ici.location = ?
        LEFT JOIN ai_learning_data ald ON im.item_code = ald.item_code
          AND ald.pattern_type = 'consumption'
        LEFT JOIN ai_variance_insights avi ON im.item_code = avi.item_code
        LEFT JOIN (
          SELECT item_code, AVG(unit_price) as unit_price
          FROM invoice_items
          GROUP BY item_code
        ) ii ON im.item_code = ii.item_code
        WHERE ici.location = ? OR ici.location IS NULL
        GROUP BY im.item_code
        ORDER BY
          -- High value items (price * quantity)
          (COALESCE(ii.unit_price, 0) * COALESCE(ici.counted_quantity, 0)) DESC,
          -- Items with variance history
          variance_history_count DESC,
          -- Items with low confidence patterns
          pattern_confidence ASC
        LIMIT ?
      `, [location, location, limit * 3], (err, rows) => {
        if (err) return reject(err);

        // Calculate risk score for each item
        const recommendations = rows.map(item => {
          const riskScore = this._calculateRiskScore(item);
          return {
            ...item,
            risk_score: riskScore,
            recommendation_reason: this._getRiskReason(item, riskScore)
          };
        });

        // Sort by risk score and take top N
        recommendations.sort((a, b) => b.risk_score - a.risk_score);
        resolve(recommendations.slice(0, limit));
      });
    });
  }

  /**
   * Calculate risk score (0-100) for an item
   */
  _calculateRiskScore(item) {
    let score = 0;

    // High value items (30 points max)
    const itemValue = item.unit_price * item.last_count;
    if (itemValue > 1000) score += 30;
    else if (itemValue > 500) score += 20;
    else if (itemValue > 100) score += 10;

    // Variance history (25 points max)
    if (item.variance_history_count > 5) score += 25;
    else if (item.variance_history_count > 2) score += 15;
    else if (item.variance_history_count > 0) score += 8;

    // Large historical variances (20 points max)
    if (item.max_variance > 50) score += 20;
    else if (item.max_variance > 20) score += 12;
    else if (item.max_variance > 10) score += 6;

    // Low pattern confidence (15 points max)
    if (item.pattern_confidence < 0.3) score += 15;
    else if (item.pattern_confidence < 0.6) score += 8;

    // High quantity items (more chance of counting errors) (10 points max)
    if (item.last_count > 100) score += 10;
    else if (item.last_count > 50) score += 6;
    else if (item.last_count > 20) score += 3;

    return Math.min(100, score);
  }

  /**
   * Get human-readable reason for recommendation
   */
  _getRiskReason(item, riskScore) {
    const reasons = [];

    const itemValue = item.unit_price * item.last_count;
    if (itemValue > 500) {
      reasons.push(`High value item ($${itemValue.toFixed(2)})`);
    }

    if (item.variance_history_count > 2) {
      reasons.push(`${item.variance_history_count} past variances`);
    }

    if (item.max_variance > 20) {
      reasons.push(`Large variance history (${item.max_variance.toFixed(0)} units)`);
    }

    if (item.pattern_confidence < 0.5) {
      reasons.push('Low prediction confidence');
    }

    if (item.last_count > 100) {
      reasons.push('High quantity (counting error risk)');
    }

    if (reasons.length === 0) {
      reasons.push('Random spot check');
    }

    return reasons.join(', ');
  }

  /**
   * Get counting sequence for a location
   * Optimizes path through location based on item storage patterns
   */
  async getCountingSequence(location) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          ici.item_code,
          im.description,
          ic.category_name,
          ici.counted_quantity,
          ici.location,
          ici.count_date,
          ROW_NUMBER() OVER (
            PARTITION BY ici.location
            ORDER BY ic.category_name, im.description
          ) as sequence_number
        FROM inventory_count_items ici
        JOIN item_master im ON ici.item_code = im.item_code
        LEFT JOIN item_categories ic ON im.category_id = ic.category_id
        WHERE ici.location = ?
          AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items WHERE location = ?)
        ORDER BY sequence_number
      `, [location, location], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Generate counting sheet for a location
   */
  async generateCountingSheet(location, countDate) {
    return new Promise((resolve, reject) => {
      // Get all items expected in this location
      this.db.all(`
        SELECT
          im.item_code,
          im.description,
          ic.category_name,
          COALESCE(prev.counted_quantity, 0) as previous_count,
          COALESCE(arp.reorder_point, 0) as reorder_point,
          ROW_NUMBER() OVER (
            ORDER BY ic.category_name, im.description
          ) as sequence_number
        FROM item_master im
        LEFT JOIN item_categories ic ON im.category_id = ic.category_id
        LEFT JOIN inventory_count_items prev ON im.item_code = prev.item_code
          AND prev.location = ?
          AND prev.count_date = (
            SELECT MAX(count_date) FROM inventory_count_items WHERE location = ?
          )
        LEFT JOIN ai_reorder_policy arp ON im.item_code = arp.item_code
        WHERE prev.item_code IS NOT NULL OR arp.item_code IS NOT NULL
        ORDER BY sequence_number
      `, [location, location], async (err, rows) => {
        if (err) return reject(err);

        // Get spot check recommendations
        const spotChecks = await this.getSpotCheckRecommendations(location, countDate, 5);
        const spotCheckCodes = new Set(spotChecks.map(s => s.item_code));

        // Mark items that need spot checking
        const sheet = rows.map(row => ({
          ...row,
          needs_spot_check: spotCheckCodes.has(row.item_code),
          spot_check_reason: spotChecks.find(s => s.item_code === row.item_code)?.recommendation_reason || null
        }));

        resolve({
          location,
          count_date: countDate,
          total_items: sheet.length,
          spot_check_items: spotChecks.length,
          items: sheet,
          spot_check_recommendations: spotChecks
        });
      });
    });
  }

  /**
   * Save counting sheet template
   */
  async saveCountingSheet(sheetData) {
    return new Promise((resolve, reject) => {
      const sheetJson = JSON.stringify(sheetData);

      this.db.run(`
        INSERT INTO counting_sheets
        (location, count_date, total_items, spot_check_count, sheet_data, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, [
        sheetData.location,
        sheetData.count_date,
        sheetData.total_items,
        sheetData.spot_check_items,
        sheetJson
      ], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...sheetData });
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = SpotCheckRecommender;

// CLI usage
if (require.main === module) {
  const recommender = new SpotCheckRecommender();

  console.log('\n🎯 AI Spot Check Recommendation System\n');

  // Get location from command line or use default
  const location = process.argv[2] || 'Main Freezer';
  const countDate = new Date().toISOString().split('T')[0];

  console.log(`Generating counting sheet for: ${location}`);
  console.log(`Count date: ${countDate}\n`);

  recommender.generateCountingSheet(location, countDate).then(sheet => {
    console.log(`📋 Counting Sheet Generated`);
    console.log(`   Location: ${sheet.location}`);
    console.log(`   Total Items: ${sheet.total_items}`);
    console.log(`   Spot Checks: ${sheet.spot_check_items}\n`);

    console.log('🎯 Top Spot Check Recommendations:\n');
    sheet.spot_check_recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec.description} (${rec.item_code})`);
      console.log(`   Risk Score: ${rec.risk_score}/100`);
      console.log(`   Reason: ${rec.recommendation_reason}\n`);
    });

    recommender.close();
  }).catch(err => {
    console.error('Error:', err);
    recommender.close();
  });
}
