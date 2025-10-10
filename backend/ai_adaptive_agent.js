#!/usr/bin/env node

/**
 * Adaptive AI Agent - "Inventory Brain"
 * Self-learning system that monitors variance, consumption patterns, and optimizes operations
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

class AdaptiveInventoryAgent {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.db = new sqlite3.Database(dbPath);
    this.learningRate = 0.1;
    this.confidenceThreshold = 0.7;
  }

  /**
   * Learn consumption patterns from historical data
   */
  async learnConsumptionPatterns(itemCode = null) {
    return new Promise((resolve, reject) => {
      const query = itemCode
        ? `SELECT * FROM ai_consumption_history WHERE item_code = ? ORDER BY consumption_date DESC LIMIT 90`
        : `SELECT * FROM ai_consumption_history ORDER BY consumption_date DESC LIMIT 1000`;

      const params = itemCode ? [itemCode] : [];

      this.db.all(query, params, (err, rows) => {
        if (err) return reject(err);

        const patterns = this._analyzeConsumptionPatterns(rows);
        this._storeLearnedPatterns(patterns);

        resolve(patterns);
      });
    });
  }

  /**
   * Analyze consumption data to find patterns
   */
  _analyzeConsumptionPatterns(data) {
    if (data.length === 0) return [];

    const patterns = [];
    const itemGroups = {};

    // Group by item
    data.forEach(row => {
      if (!itemGroups[row.item_code]) {
        itemGroups[row.item_code] = [];
      }
      itemGroups[row.item_code].push(row);
    });

    // Analyze each item
    Object.keys(itemGroups).forEach(itemCode => {
      const itemData = itemGroups[itemCode];

      // Weekly pattern
      const weeklyConsumption = this._calculateWeeklyPattern(itemData);

      // Trend detection
      const trend = this._detectTrend(itemData);

      // Seasonality
      const seasonality = this._detectSeasonality(itemData);

      // Variability
      const variability = this._calculateVariability(itemData);

      patterns.push({
        item_code: itemCode,
        pattern_type: 'consumption',
        pattern_data: JSON.stringify({
          weekly: weeklyConsumption,
          trend: trend,
          seasonality: seasonality,
          variability: variability,
          avg_daily: this._average(itemData.map(d => d.quantity_consumed)),
          std_dev: this._stdDev(itemData.map(d => d.quantity_consumed))
        }),
        confidence_score: this._calculateConfidence(itemData.length),
        sample_size: itemData.length
      });
    });

    return patterns;
  }

  /**
   * Calculate weekly consumption pattern
   */
  _calculateWeeklyPattern(data) {
    const weekDays = [0, 0, 0, 0, 0, 0, 0];
    const weekCounts = [0, 0, 0, 0, 0, 0, 0];

    data.forEach(row => {
      const dayOfWeek = row.day_of_week || new Date(row.consumption_date).getDay();
      weekDays[dayOfWeek] += row.quantity_consumed;
      weekCounts[dayOfWeek]++;
    });

    return weekDays.map((total, idx) =>
      weekCounts[idx] > 0 ? total / weekCounts[idx] : 0
    );
  }

  /**
   * Detect trend (increasing, decreasing, stable)
   */
  _detectTrend(data) {
    if (data.length < 7) return 'insufficient_data';

    const sorted = data.sort((a, b) =>
      new Date(a.consumption_date) - new Date(b.consumption_date)
    );

    const firstHalf = sorted.slice(0, Math.floor(data.length / 2));
    const secondHalf = sorted.slice(Math.floor(data.length / 2));

    const firstAvg = this._average(firstHalf.map(d => d.quantity_consumed));
    const secondAvg = this._average(secondHalf.map(d => d.quantity_consumed));

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Detect seasonality patterns
   */
  _detectSeasonality(data) {
    const weeklyGroups = {};

    data.forEach(row => {
      const week = row.week_of_year || this._getWeekNumber(new Date(row.consumption_date));
      if (!weeklyGroups[week]) weeklyGroups[week] = [];
      weeklyGroups[week].push(row.quantity_consumed);
    });

    const weeklyAvgs = Object.values(weeklyGroups).map(week =>
      this._average(week)
    );

    const overallAvg = this._average(weeklyAvgs);
    const variance = this._variance(weeklyAvgs);

    // High variance suggests seasonality
    return variance > (overallAvg * 0.3) ? 'seasonal' : 'non_seasonal';
  }

  /**
   * Calculate variability score
   */
  _calculateVariability(data) {
    const values = data.map(d => d.quantity_consumed);
    const avg = this._average(values);
    const stdDev = this._stdDev(values);

    return stdDev / avg; // Coefficient of variation
  }

  /**
   * Detect variance root causes
   */
  async detectVarianceCauses(itemCode, countDate, varianceAmount) {
    return new Promise((resolve, reject) => {
      // Gather evidence from multiple sources
      const evidence = [];
      const queries = [
        // Check consumption patterns
        this._checkConsumptionAnomaly(itemCode, countDate),
        // Check receiving accuracy
        this._checkReceivingIssues(itemCode, countDate),
        // Check temperature logs (if available)
        this._checkTemperatureIssues(itemCode, countDate),
        // Check past variance patterns
        this._checkHistoricalVariance(itemCode)
      ];

      Promise.all(queries).then(results => {
        const [consumption, receiving, temperature, historical] = results;

        let detectedCause = 'unknown';
        let confidence = 0.3;

        // Rule-based inference
        if (Math.abs(varianceAmount) > 100 && receiving.hasIssues) {
          detectedCause = 'receiving_error';
          confidence = 0.85;
          evidence.push('Large variance matches receiving discrepancy pattern');
        } else if (consumption.isAnomaly) {
          detectedCause = 'over_portioning';
          confidence = 0.75;
          evidence.push('Consumption rate significantly higher than average');
        } else if (temperature.hasIssues) {
          detectedCause = 'spoilage';
          confidence = 0.80;
          evidence.push('Temperature logs show out-of-range readings');
        } else if (varianceAmount < 0 && Math.abs(varianceAmount) < 10) {
          detectedCause = 'wrong_unit';
          confidence = 0.65;
          evidence.push('Small negative variance suggests unit conversion error');
        } else if (historical.hasStealingPattern) {
          detectedCause = 'theft';
          confidence = 0.70;
          evidence.push('Pattern matches historical theft incidents');
        }

        // Store insight
        this.db.run(`
          INSERT INTO ai_variance_insights
          (item_code, count_date, variance_amount, detected_cause, confidence, evidence, status)
          VALUES (?, ?, ?, ?, ?, ?, 'detected')
        `, [itemCode, countDate, varianceAmount, detectedCause, confidence, JSON.stringify(evidence)]);

        resolve({
          detectedCause,
          confidence,
          evidence,
          correctiveAction: this._suggestCorrectiveAction(detectedCause)
        });
      }).catch(reject);
    });
  }

  /**
   * Check for consumption anomalies
   */
  async _checkConsumptionAnomaly(itemCode, date) {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT AVG(quantity_consumed) as avg_consumption,
               MAX(quantity_consumed) as max_consumption
        FROM ai_consumption_history
        WHERE item_code = ?
          AND consumption_date < ?
        LIMIT 30
      `, [itemCode, date], (err, rows) => {
        if (err || rows.length === 0) {
          return resolve({ isAnomaly: false });
        }

        const avg = rows[0].avg_consumption || 0;
        const max = rows[0].max_consumption || 0;

        // Check if recent consumption is anomalous
        resolve({
          isAnomaly: max > (avg * 1.5),
          avgConsumption: avg,
          maxConsumption: max
        });
      });
    });
  }

  /**
   * Check receiving issues
   */
  async _checkReceivingIssues(itemCode, date) {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT ii.quantity, ii.unit_price, pi.invoice_date
        FROM invoice_items ii
        JOIN processed_invoices pi ON ii.invoice_number = pi.invoice_number
        WHERE ii.item_code = ?
          AND pi.invoice_date <= ?
        ORDER BY pi.invoice_date DESC
        LIMIT 5
      `, [itemCode, date], (err, rows) => {
        if (err || rows.length === 0) {
          return resolve({ hasIssues: false });
        }

        // Check for quantity or price anomalies
        const quantities = rows.map(r => r.quantity);
        const avgQty = this._average(quantities);
        const stdDev = this._stdDev(quantities);

        const hasIssues = rows.some(r => Math.abs(r.quantity - avgQty) > (stdDev * 2));

        resolve({ hasIssues, recentOrders: rows });
      });
    });
  }

  /**
   * Check temperature issues (placeholder - would connect to IoT sensors)
   */
  async _checkTemperatureIssues(itemCode, date) {
    // In real implementation, query temperature logs from IoT devices
    return Promise.resolve({ hasIssues: false });
  }

  /**
   * Check historical variance patterns
   */
  async _checkHistoricalVariance(itemCode) {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT variance, count_date
        FROM inventory_count_items
        WHERE item_code = ?
          AND ABS(variance) > 0
        ORDER BY count_date DESC
        LIMIT 10
      `, [itemCode], (err, rows) => {
        if (err || rows.length === 0) {
          return resolve({ hasStealingPattern: false });
        }

        // Check if there's a pattern of consistent negative variance
        const negativeCount = rows.filter(r => r.variance < 0).length;
        const hasStealingPattern = negativeCount >= 5;

        resolve({ hasStealingPattern, historicalVariances: rows });
      });
    });
  }

  /**
   * Suggest corrective action
   */
  _suggestCorrectiveAction(cause) {
    const actions = {
      'theft': 'Review security footage, implement portion control monitoring',
      'wrong_unit': 'Verify unit conversions in system, retrain staff on counting procedures',
      'over_portioning': 'Review portion sizes, implement portion control training',
      'spoilage': 'Check temperature logs, review FIFO compliance',
      'receiving_error': 'Audit receiving process, verify invoice against physical count',
      'unknown': 'Manual investigation required'
    };

    return actions[cause] || actions['unknown'];
  }

  /**
   * Store learned patterns
   */
  _storeLearnedPatterns(patterns) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ai_learning_data
      (item_code, pattern_type, pattern_data, confidence_score, sample_size, last_updated)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    patterns.forEach(pattern => {
      stmt.run([
        pattern.item_code,
        pattern.pattern_type,
        pattern.pattern_data,
        pattern.confidence_score,
        pattern.sample_size
      ]);
    });

    stmt.finalize();
  }

  /**
   * Calculate confidence based on sample size
   */
  _calculateConfidence(sampleSize) {
    if (sampleSize < 7) return 0.3;
    if (sampleSize < 30) return 0.6;
    if (sampleSize < 90) return 0.8;
    return 0.95;
  }

  // Utility functions
  _average(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  _variance(arr) {
    const avg = this._average(arr);
    return this._average(arr.map(x => Math.pow(x - avg, 2)));
  }

  _stdDev(arr) {
    return Math.sqrt(this._variance(arr));
  }

  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export for use in server
module.exports = AdaptiveInventoryAgent;

// CLI usage
if (require.main === module) {
  const agent = new AdaptiveInventoryAgent();

  console.log('\n🧠 Adaptive AI Agent - Learning from inventory data\n');

  agent.learnConsumptionPatterns().then(patterns => {
    console.log(`✅ Learned ${patterns.length} consumption patterns`);

    patterns.slice(0, 5).forEach(p => {
      const data = JSON.parse(p.pattern_data);
      console.log(`\nItem: ${p.item_code}`);
      console.log(`  Avg Daily: ${data.avg_daily.toFixed(2)}`);
      console.log(`  Trend: ${data.trend}`);
      console.log(`  Seasonality: ${data.seasonality}`);
      console.log(`  Confidence: ${(p.confidence_score * 100).toFixed(0)}%`);
    });

    agent.close();
  }).catch(err => {
    console.error('Error:', err);
    agent.close();
  });
}
