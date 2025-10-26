/**
 * Quantum Governance Service (v15.8.0)
 *
 * Unified governance scoring across four pillars:
 * - Finance Accuracy (30%): integer-cent validation, period balancing
 * - System Health (30%): data quality, FIFO integrity, price stability
 * - AI Intelligence (20%): learning freshness, feedback utilization
 * - Menu/Forecast (20%): forecast accuracy, coverage, signal consistency
 *
 * Design: Thin read-only layer over existing pillar systems
 * No mutations to source data; pure computation + snapshot persistence
 */

const { logger } = require('../../config/logger');

class GovernanceService {
  /**
   * @param {Object} db - SQLite database instance
   * @param {Object} deps - Pillar service dependencies
   * @param {Object} deps.metrics - Prometheus metrics exporter
   * @param {Object} deps.financeSvc - Financial accuracy service
   * @param {Object} deps.healthSvc - System health service
   * @param {Object} deps.aiSvc - AI intelligence service
   * @param {Object} deps.forecastSvc - Menu forecast service
   */
  constructor(db, deps = {}) {
    this.db = db;
    this.deps = deps;

    // Validate required dependencies
    if (!deps.metrics) {
      logger.warn('[Governance] Metrics exporter not provided, Prometheus integration disabled');
    }
  }

  /**
   * Read scores from all four pillars
   * @returns {Promise<Object>} Pillar scores (0-100 scale)
   */
  async readPillars() {
    try {
      // Parallel fetch all pillar scores
      const [finance, health, ai, menuAcc] = await Promise.all([
        this.#getFinanceAccuracy(),
        this.#getHealthScore(),
        this.#getAIIntelligenceIndex(),
        this.#getMenuForecastAccuracy()
      ]);

      return {
        finance_accuracy: this.#clamp(finance),
        health_score: this.#clamp(health),
        ai_intelligence_index: this.#clamp(ai),
        menu_forecast_accuracy: this.#clamp(menuAcc ?? 60) // Fallback if no data
      };

    } catch (error) {
      logger.error('[Governance] Error reading pillars:', error);
      throw error;
    }
  }

  /**
   * Compute weighted governance score
   * Formula: 30% finance + 30% health + 20% AI + 20% menu
   * @param {Object} p - Pillar scores
   * @returns {number} Governance score (0-100, rounded to 1 decimal)
   */
  computeScore(p) {
    const score =
      0.30 * p.finance_accuracy +
      0.30 * p.health_score +
      0.20 * p.ai_intelligence_index +
      0.20 * p.menu_forecast_accuracy;

    return Math.round(score * 10) / 10;
  }

  /**
   * Map score to status and color
   * @param {number} score - Governance score (0-100)
   * @returns {Object} {status, color}
   */
  mapStatus(score) {
    if (score >= 90) return { status: 'Healthy', color: 'green' };
    if (score >= 75) return { status: 'Warning', color: 'amber' };
    return { status: 'Action', color: 'red' };
  }

  /**
   * Detect anomalies based on pillar scores and context
   * @param {Object} p - Pillar scores
   * @param {Object} context - Additional context for alert rules
   * @returns {Array} Array of alert objects
   */
  async detectAlerts(p, context = {}) {
    const alerts = [];

    // Finance: Drift > $0.50
    if (context.financeDriftCents > 50) {
      alerts.push({
        type: 'FINANCE_DRIFT',
        severity: 'critical',
        message: `Finance drift: $${(context.financeDriftCents / 100).toFixed(2)}`,
        details_json: JSON.stringify({ driftCents: context.financeDriftCents })
      });
    }

    // AI: Stale feedback (>7 days)
    if (context.hoursSinceAIUpdate >= 168) {
      alerts.push({
        type: 'AI_STALE_FEEDBACK',
        severity: 'warning',
        message: `AI feedback stale: last applied ${context.hoursSinceAIUpdate}h ago`,
        details_json: JSON.stringify({ hoursSinceUpdate: context.hoursSinceAIUpdate })
      });
    }

    // Menu: Low accuracy (<80%)
    if (p.menu_forecast_accuracy < 80) {
      alerts.push({
        type: 'FORECAST_LOW_ACCURACY',
        severity: 'warning',
        message: `Menu forecast accuracy below threshold: ${p.menu_forecast_accuracy.toFixed(1)}%`,
        details_json: JSON.stringify({ accuracy: p.menu_forecast_accuracy })
      });
    }

    // Health: Score drop >= 10 points in 24h
    if (context.healthScoreDelta24h <= -10) {
      alerts.push({
        type: 'HEALTH_SCORE_DROP',
        severity: 'critical',
        message: `Health score dropped ${Math.abs(context.healthScoreDelta24h)} points in 24h`,
        details_json: JSON.stringify({ delta: context.healthScoreDelta24h })
      });
    }

    // Finance: Low accuracy (<90%)
    if (p.finance_accuracy < 90) {
      alerts.push({
        type: 'FINANCE_LOW_ACCURACY',
        severity: p.finance_accuracy < 75 ? 'critical' : 'warning',
        message: `Financial accuracy below target: ${p.finance_accuracy.toFixed(1)}%`,
        details_json: JSON.stringify({ accuracy: p.finance_accuracy })
      });
    }

    return alerts;
  }

  /**
   * Persist governance snapshot to database
   * @param {Object} p - Pillar scores
   * @param {number} score - Governance score
   * @param {string} status - Status (Healthy/Warning/Action)
   * @param {string} color - Color (green/amber/red)
   * @param {Object} payload - Full raw inputs for audit
   * @returns {Promise<number>} Snapshot ID
   */
  async snapshot(p, score, status, color, payload = {}) {
    const stmt = `
      INSERT INTO governance_snapshots
        (finance_accuracy, health_score, ai_intelligence_index, menu_forecast_accuracy,
         governance_score, status, color, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const result = await this.db.run(stmt, [
        p.finance_accuracy,
        p.health_score,
        p.ai_intelligence_index,
        p.menu_forecast_accuracy,
        score,
        status,
        color,
        JSON.stringify(payload)
      ]);

      logger.info(`[Governance] Snapshot saved: score=${score}, status=${status}, id=${result.lastID}`);
      return result.lastID;

    } catch (error) {
      logger.error('[Governance] Failed to save snapshot:', error);
      throw error;
    }
  }

  /**
   * Save alerts to database
   * @param {Array} alerts - Array of alert objects
   * @returns {Promise<void>}
   */
  async saveAlerts(alerts) {
    if (alerts.length === 0) return;

    const stmt = `
      INSERT INTO governance_alerts (type, severity, message, details_json)
      VALUES (?, ?, ?, ?)
    `;

    try {
      for (const alert of alerts) {
        await this.db.run(stmt, [
          alert.type,
          alert.severity,
          alert.message,
          alert.details_json || '{}'
        ]);

        // Update Prometheus counter
        if (this.deps.metrics?.governanceAlertsCounter) {
          this.deps.metrics.governanceAlertsCounter.inc({
            type: alert.type,
            severity: alert.severity
          });
        }
      }

      logger.info(`[Governance] Saved ${alerts.length} alerts`);

    } catch (error) {
      logger.error('[Governance] Failed to save alerts:', error);
      throw error;
    }
  }

  /**
   * Get latest governance snapshot
   * @returns {Promise<Object|null>} Latest snapshot or null
   */
  async getLatest() {
    try {
      return await this.db.get('SELECT * FROM v_governance_latest');
    } catch (error) {
      logger.error('[Governance] Error fetching latest snapshot:', error);
      return null;
    }
  }

  /**
   * Get active alerts (unresolved)
   * @returns {Promise<Array>} Array of active alerts
   */
  async getActiveAlerts() {
    try {
      return await this.db.all('SELECT * FROM v_governance_active_alerts');
    } catch (error) {
      logger.error('[Governance] Error fetching active alerts:', error);
      return [];
    }
  }

  /**
   * Compute full governance status (pillars + score + alerts)
   * This is the main entry point for generating governance reports
   * @returns {Promise<Object>} Complete governance status
   */
  async computeStatus() {
    try {
      // Read pillar scores
      const pillars = await this.readPillars();

      // Compute composite score
      const score = this.computeScore(pillars);
      const { status, color } = this.mapStatus(score);

      // Get context for alert detection
      const context = await this.#getAlertContext(pillars);

      // Detect alerts
      const alerts = await this.detectAlerts(pillars, context);

      // Persist snapshot
      const snapshotId = await this.snapshot(pillars, score, status, color, {
        pillars,
        context,
        timestamp: new Date().toISOString()
      });

      // Save alerts
      if (alerts.length > 0) {
        await this.saveAlerts(alerts);
      }

      // Update Prometheus metrics
      this.#updateMetrics(pillars, score, status);

      return {
        as_of: new Date().toISOString(),
        pillars: {
          finance_accuracy: pillars.finance_accuracy,
          health_score: pillars.health_score,
          ai_intelligence_index: pillars.ai_intelligence_index,
          menu_forecast_accuracy: pillars.menu_forecast_accuracy
        },
        governance_score: score,
        status: status,
        color: color,
        alerts: alerts.map(a => ({
          type: a.type,
          severity: a.severity,
          message: a.message
        })),
        snapshot_id: snapshotId
      };

    } catch (error) {
      logger.error('[Governance] Error computing status:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE METHODS (Pillar Data Readers)
  // ============================================================================

  /**
   * Get financial accuracy score (0-100)
   * Source: ai_ops_health_metrics.financial_accuracy OR finance_verified_totals
   */
  async #getFinanceAccuracy() {
    try {
      // Try v2 health metrics first
      const metric = await this.db.get(`
        SELECT metric_value
        FROM ai_ops_health_metrics
        WHERE metric_name = 'financial_accuracy'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (metric && metric.metric_value !== null) {
        return parseFloat(metric.metric_value);
      }

      // Fallback: compute from finance_verified_totals
      const stats = await this.db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN is_verified = 1 AND cent_precision_valid = 1 THEN 1 END) as valid
        FROM processed_invoices
        WHERE created_at >= datetime('now', '-30 days')
      `);

      if (stats && stats.total > 0) {
        return (stats.valid / stats.total) * 100;
      }

      // No data available
      return 0;

    } catch (error) {
      logger.warn('[Governance] Error reading finance accuracy:', error);
      return 0;
    }
  }

  /**
   * Get system health score (0-100)
   * Source: health_score_current metric OR computed from system metrics
   */
  async #getHealthScore() {
    try {
      // Try v2 health score
      const health = await this.db.get(`
        SELECT metric_value
        FROM ai_ops_health_metrics
        WHERE metric_name = 'health_score'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (health && health.metric_value !== null) {
        return parseFloat(health.metric_value);
      }

      // Fallback: default to 70 if no health data
      logger.warn('[Governance] No health score found, using fallback: 70');
      return 70;

    } catch (error) {
      logger.warn('[Governance] Error reading health score:', error);
      return 70;
    }
  }

  /**
   * Get AI intelligence index (0-100)
   * Source: Existing Owner Ops status OR computed from AI metrics
   */
  async #getAIIntelligenceIndex() {
    try {
      // Try intelligence index metric
      const ai = await this.db.get(`
        SELECT metric_value
        FROM ai_ops_health_metrics
        WHERE metric_name = 'ai_intelligence_index'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (ai && ai.metric_value !== null) {
        return parseFloat(ai.metric_value);
      }

      // Fallback: compute from feedback apply rate + model freshness
      const feedbackRate = await this.#getAIFeedbackApplyRate();
      const freshnessScore = await this.#getAIFreshnessScore();

      // Weighted: 60% feedback rate, 40% freshness
      return (feedbackRate * 0.6) + (freshnessScore * 0.4);

    } catch (error) {
      logger.warn('[Governance] Error reading AI intelligence index:', error);
      return 60; // Default fallback
    }
  }

  /**
   * Get menu forecast accuracy (0-100)
   * Source: ai_forecast_accuracy (MAPE → accuracy = 100 - MAPE%)
   */
  async #getMenuForecastAccuracy() {
    try {
      // Get MAPE from forecast accuracy table
      const forecast = await this.db.get(`
        SELECT AVG(mape) as avg_mape
        FROM ai_forecast_accuracy
        WHERE created_at >= datetime('now', '-7 days')
      `);

      if (forecast && forecast.avg_mape !== null) {
        // Convert MAPE to accuracy: accuracy = 100 - MAPE
        const accuracy = 100 - parseFloat(forecast.avg_mape);
        return Math.max(0, Math.min(100, accuracy));
      }

      // Fallback: check if menu_calendar has coverage
      const coverage = await this.db.get(`
        SELECT COUNT(DISTINCT plan_date) as days_covered
        FROM menu_calendar
        WHERE plan_date >= date('now')
          AND plan_date <= date('now', '+7 days')
      `);

      if (coverage && coverage.days_covered > 0) {
        // Return coverage-based proxy: 60 + (days_covered * 5)
        return Math.min(95, 60 + (coverage.days_covered * 5));
      }

      // No data: return conservative 60%
      return 60;

    } catch (error) {
      logger.warn('[Governance] Error reading menu forecast accuracy:', error);
      return 60;
    }
  }

  /**
   * Get AI feedback apply rate (0-100)
   */
  async #getAIFeedbackApplyRate() {
    try {
      const stats = await this.db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN applied = 1 THEN 1 END) as applied
        FROM ai_feedback_comments
        WHERE created_at >= datetime('now', '-30 days')
      `);

      if (stats && stats.total > 0) {
        return (stats.applied / stats.total) * 100;
      }

      return 80; // Default if no feedback data

    } catch (error) {
      return 80;
    }
  }

  /**
   * Get AI freshness score (0-100 based on hours since last update)
   */
  async #getAIFreshnessScore() {
    try {
      const lastUpdate = await this.db.get(`
        SELECT
          MAX(applied_at) as last_applied
        FROM ai_feedback_comments
        WHERE applied = 1
      `);

      if (lastUpdate && lastUpdate.last_applied) {
        const hoursSince = this.#hoursSince(lastUpdate.last_applied);

        // Score formula: 100 - (hours / 2)
        // Perfect (100) if <1h, 90 if 20h, 76 if 48h, 58 if 84h (3.5 days)
        const score = Math.max(0, 100 - (hoursSince / 2));
        return score;
      }

      return 70; // Default if no data

    } catch (error) {
      return 70;
    }
  }

  /**
   * Get alert context (additional metrics for alert detection)
   */
  async #getAlertContext(pillars) {
    try {
      // Finance drift
      const financeDrift = await this.db.get(`
        SELECT
          ABS(SUM(extended_cost) - SUM(verified_total)) * 100 as drift_cents
        FROM processed_invoices
        WHERE created_at >= datetime('now', '-7 days')
      `);

      // AI update recency
      const aiUpdate = await this.db.get(`
        SELECT MAX(applied_at) as last_applied
        FROM ai_feedback_comments
        WHERE applied = 1
      `);

      // Health score 24h ago
      const healthPrev = await this.db.get(`
        SELECT metric_value
        FROM ai_ops_health_metrics
        WHERE metric_name = 'health_score'
          AND created_at <= datetime('now', '-24 hours')
        ORDER BY created_at DESC
        LIMIT 1
      `);

      return {
        financeDriftCents: financeDrift?.drift_cents || 0,
        hoursSinceAIUpdate: aiUpdate?.last_applied ? this.#hoursSince(aiUpdate.last_applied) : 999,
        healthScoreDelta24h: healthPrev?.metric_value ? (pillars.health_score - parseFloat(healthPrev.metric_value)) : 0
      };

    } catch (error) {
      logger.warn('[Governance] Error getting alert context:', error);
      return {
        financeDriftCents: 0,
        hoursSinceAIUpdate: 0,
        healthScoreDelta24h: 0
      };
    }
  }

  /**
   * Update Prometheus metrics
   */
  #updateMetrics(pillars, score, status) {
    if (!this.deps.metrics) return;

    try {
      // Update composite score
      if (this.deps.metrics.governanceScoreGauge) {
        this.deps.metrics.governanceScoreGauge.set({ status }, score);
      }

      // Update pillar gauges
      if (this.deps.metrics.governancePillarGauge) {
        this.deps.metrics.governancePillarGauge.set({ pillar: 'finance' }, pillars.finance_accuracy);
        this.deps.metrics.governancePillarGauge.set({ pillar: 'health' }, pillars.health_score);
        this.deps.metrics.governancePillarGauge.set({ pillar: 'ai' }, pillars.ai_intelligence_index);
        this.deps.metrics.governancePillarGauge.set({ pillar: 'menu' }, pillars.menu_forecast_accuracy);
      }

      // Increment snapshot counter
      if (this.deps.metrics.governanceSnapshotCounter) {
        this.deps.metrics.governanceSnapshotCounter.inc();
      }

    } catch (error) {
      logger.warn('[Governance] Error updating metrics:', error);
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clamp value to [0, 100] range
   * @param {*} v - Value to clamp
   * @returns {number} Clamped value
   */
  #clamp(v) {
    return Math.max(0, Math.min(100, Number(v || 0)));
  }

  /**
   * Calculate hours since timestamp
   * @param {string} timestamp - ISO8601 timestamp
   * @returns {number} Hours since timestamp
   */
  #hoursSince(timestamp) {
    const then = new Date(timestamp);
    const now = new Date();
    return (now - then) / (1000 * 60 * 60);
  }
}

module.exports = GovernanceService;
