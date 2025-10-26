/**
 * GovernanceTrendService.js (v15.9.0)
 *
 * Purpose: Track daily governance scores and generate forecasts
 * - Record daily pillar scores (finance, health, ai, menu, composite)
 * - Compute short-term forecasts (7/14/30 days) using exponential smoothing
 * - Provide trend analytics for Owner Console visualization
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const GovernanceService = require('./GovernanceService');

class GovernanceTrendService {
  constructor(db) {
    this.db = db;
    this.govService = new GovernanceService(db);
  }

  /**
   * Record daily scores for all pillars + composite
   * @param {Object} options - { as_of?: 'YYYY-MM-DD', source?: 'auto'|'manual'|'backfill' }
   * @returns {Promise<Object>} - { success: true, as_of, scores: {...} }
   */
  async recordDailyScores(options = {}) {
    const as_of = options.as_of || new Date().toISOString().split('T')[0];
    const source = options.source || 'auto';

    try {
      // Get current governance status (reuse v15.8 logic)
      const status = await this.govService.computeStatus();

      const pillars = {
        finance: status.pillars.finance_accuracy,
        health: status.pillars.health_score,
        ai: status.pillars.ai_intelligence_index,
        menu: status.pillars.menu_forecast_accuracy,
        composite: status.governance_score
      };

      // Insert or replace daily scores (idempotent)
      for (const [pillar, score] of Object.entries(pillars)) {
        await this.db.run(`
          INSERT OR REPLACE INTO governance_daily (as_of, pillar, score, source)
          VALUES (?, ?, ?, ?)
        `, [as_of, pillar, score, source]);
      }

      console.log(`✅ Recorded daily scores for ${as_of}:`, pillars);

      return {
        success: true,
        as_of,
        scores: pillars,
        source
      };
    } catch (error) {
      console.error('❌ Error recording daily scores:', error);
      throw error;
    }
  }

  /**
   * Compute forecasts for all pillars using exponential smoothing
   * @param {Object} options - { horizons?: [7,14,30], method?: 'exp_smoothing' }
   * @returns {Promise<Object>} - { run_id, forecasts: [...] }
   */
  async computeForecast(options = {}) {
    const horizons = options.horizons || [7, 14, 30];
    const method = options.method || 'exp_smoothing';
    const run_id = new Date().toISOString();

    const startTime = Date.now();

    try {
      const pillars = ['finance', 'health', 'ai', 'menu', 'composite'];
      const forecasts = [];

      for (const pillar of pillars) {
        // Fetch historical data (last 90 days or all available)
        const series = await this.db.all(`
          SELECT as_of, score
          FROM governance_daily
          WHERE pillar = ?
          ORDER BY as_of ASC
          LIMIT 90
        `, [pillar]);

        if (series.length < 3) {
          console.warn(`⚠️  Insufficient data for ${pillar} (${series.length} points), skipping forecast`);
          continue;
        }

        // Generate forecasts for each horizon
        for (const horizon of horizons) {
          const forecast = this._forecastExponentialSmoothing(series, horizon);

          forecasts.push({
            run_id,
            pillar,
            horizon,
            ...forecast
          });
        }
      }

      // Insert forecasts
      for (const fc of forecasts) {
        const as_of = this._addDays(new Date(), fc.horizon).toISOString().split('T')[0];
        await this.db.run(`
          INSERT INTO governance_forecast (run_id, as_of, horizon, pillar, score, lower, upper, method)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [fc.run_id, as_of, fc.horizon, fc.pillar, fc.score, fc.lower, fc.upper, method]);
      }

      const runtime = (Date.now() - startTime) / 1000;
      console.log(`✅ Computed ${forecasts.length} forecasts in ${runtime.toFixed(2)}s`);

      return {
        success: true,
        run_id,
        method,
        forecasts,
        runtime
      };
    } catch (error) {
      console.error('❌ Error computing forecasts:', error);
      throw error;
    }
  }

  /**
   * Get trends for a specific pillar and date range
   * @param {Object} options - { from, to, pillar }
   * @returns {Promise<Object>} - { series: [...], forecasts: [...] }
   */
  async getTrends(options = {}) {
    const { from, to, pillar } = options;

    try {
      // Fetch historical series
      let query = `
        SELECT as_of, pillar, score, source
        FROM governance_daily
        WHERE 1=1
      `;
      const params = [];

      if (from) {
        query += ` AND as_of >= ?`;
        params.push(from);
      }

      if (to) {
        query += ` AND as_of <= ?`;
        params.push(to);
      }

      if (pillar && pillar !== 'all') {
        query += ` AND pillar = ?`;
        params.push(pillar);
      }

      query += ` ORDER BY pillar, as_of ASC`;

      const series = await this.db.all(query, params);

      // Fetch latest forecasts
      const forecastQuery = `
        SELECT pillar, as_of, horizon, score, lower, upper, method
        FROM v_governance_latest_forecast
        ${pillar && pillar !== 'all' ? 'WHERE pillar = ?' : ''}
        ORDER BY pillar, horizon ASC
      `;

      const forecasts = pillar && pillar !== 'all'
        ? await this.db.all(forecastQuery, [pillar])
        : await this.db.all(forecastQuery, []);

      return {
        success: true,
        series,
        forecasts,
        from: from || series[0]?.as_of || null,
        to: to || series[series.length - 1]?.as_of || null
      };
    } catch (error) {
      console.error('❌ Error fetching trends:', error);
      throw error;
    }
  }

  /**
   * Exponential smoothing forecast with adaptive alpha
   * @private
   */
  _forecastExponentialSmoothing(series, horizon) {
    const values = series.map(s => s.score);
    const n = values.length;

    // Calculate adaptive alpha based on recent volatility
    const alpha = this._calculateAdaptiveAlpha(values);

    // Exponential smoothing
    let smoothed = values[0];
    for (let i = 1; i < n; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }

    // Forecast is the last smoothed value (level)
    const forecast = smoothed;

    // Calculate residuals for confidence bands
    const residuals = [];
    let s = values[0];
    for (let i = 1; i < n; i++) {
      s = alpha * values[i] + (1 - alpha) * s;
      residuals.push(values[i] - s);
    }

    const stdDev = this._stdDev(residuals);

    // 80% confidence interval (±1.28 * σ)
    const margin = 1.28 * stdDev * Math.sqrt(horizon / 7); // scale by horizon

    return {
      score: Math.max(0, Math.min(100, forecast)), // clamp to [0, 100]
      lower: Math.max(0, forecast - margin),
      upper: Math.min(100, forecast + margin)
    };
  }

  /**
   * Calculate adaptive alpha based on recent volatility
   * @private
   */
  _calculateAdaptiveAlpha(values) {
    const n = values.length;
    if (n < 7) return 0.3; // default

    // Calculate recent volatility (last 7 points)
    const recent = values.slice(-7);
    const volatility = this._stdDev(recent);

    // Adaptive alpha: high volatility → higher alpha (more responsive)
    // Low volatility → lower alpha (more smoothing)
    const baseAlpha = 0.3;
    const adaptiveFactor = Math.min(volatility / 10, 0.3); // normalize

    return Math.max(0.2, Math.min(0.6, baseAlpha + adaptiveFactor));
  }

  /**
   * Calculate standard deviation
   * @private
   */
  _stdDev(values) {
    const n = values.length;
    if (n === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;

    return Math.sqrt(variance);
  }

  /**
   * Add days to a date
   * @private
   */
  _addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Get statistics for a pillar
   */
  async getPillarStats(pillar) {
    try {
      const stats = await this.db.get(`
        SELECT
          COUNT(*) as point_count,
          MIN(as_of) as first_date,
          MAX(as_of) as last_date,
          AVG(score) as avg_score,
          MIN(score) as min_score,
          MAX(score) as max_score
        FROM governance_daily
        WHERE pillar = ?
      `, [pillar]);

      return stats || null;
    } catch (error) {
      console.error(`❌ Error fetching stats for ${pillar}:`, error);
      return null;
    }
  }
}

module.exports = GovernanceTrendService;
