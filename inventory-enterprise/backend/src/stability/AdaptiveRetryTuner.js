/**
 * @deprecated DEPRECATED IN V21.1 - SQLite-only, not used in production
 *
 * This module uses SQLite (better-sqlite3) which is not available in the
 * Railway PostgreSQL production environment. Will be re-implemented with
 * PostgreSQL in a future version.
 *
 * Original description:
 * Adaptive Retry Tuner - Learns optimal DB retry parameters from telemetry
 *
 * Analyzes stability_observations to detect patterns:
 * - High failure rate → increase retries or base delay
 * - High lock contention → increase jitter or cron interval
 * - Consistent success with low attempts → reduce delay (faster response)
 * - P95 duration spikes → increase base delay
 *
 * @version 16.3.0 (DEPRECATED)
 * @author NeuroInnovate AI Team
 */

const Database = require('better-sqlite3');
const path = require('path');
const { logger } = require('../../config/logger');

class AdaptiveRetryTuner {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../../database.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.isRunning = false;
    this.lastTuneTimestamp = null;
    this.tuneCount = 0;

    logger.info('AdaptiveRetryTuner initialized');
  }

  /**
   * Get current stability policy
   */
  getCurrentPolicy() {
    const stmt = this.db.prepare(`
      SELECT * FROM stability_policy WHERE id = 1
    `);
    return stmt.get();
  }

  /**
   * Get recent stability metrics (last N days)
   */
  getRecentMetrics(windowDays = 7) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as observation_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_ops,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_ops,
        ROUND(AVG(attempts), 2) as avg_attempts,
        ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
        ROUND(AVG(duration_ms), 0) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) as lock_events,
        ROUND(100.0 * SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as lock_rate,
        -- P95 calculations
        (
          SELECT duration_ms FROM stability_observations
          WHERE ts >= datetime('now', '-' || ? || ' days')
          ORDER BY duration_ms DESC
          LIMIT 1 OFFSET CAST(COUNT(*) * 0.05 AS INTEGER)
        ) as p95_duration_ms,
        (
          SELECT attempts FROM stability_observations
          WHERE ts >= datetime('now', '-' || ? || ' days')
          ORDER BY attempts DESC
          LIMIT 1 OFFSET CAST(COUNT(*) * 0.05 AS INTEGER)
        ) as p95_attempts
      FROM stability_observations
      WHERE ts >= datetime('now', '-' || ? || ' days')
    `);
    return stmt.get(windowDays, windowDays, windowDays);
  }

  /**
   * Analyze metrics and generate tuning recommendation
   */
  analyzeAndRecommend() {
    const policy = this.getCurrentPolicy();

    if (!policy.enabled || !policy.auto_tune_enabled) {
      logger.info('AdaptiveRetryTuner: Auto-tuning disabled in policy');
      return null;
    }

    const metrics = this.getRecentMetrics(policy.observation_window_days);

    if (metrics.observation_count < policy.tune_threshold_events) {
      logger.info(`AdaptiveRetryTuner: Insufficient data (${metrics.observation_count} < ${policy.tune_threshold_events})`);
      return null;
    }

    const recommendation = {
      from: {
        max_retries: policy.max_retries,
        base_delay_ms: policy.base_delay_ms,
        jitter_pct: policy.jitter_pct,
        cron_min_interval_min: policy.cron_min_interval_min
      },
      to: {
        max_retries: policy.max_retries,
        base_delay_ms: policy.base_delay_ms,
        jitter_pct: policy.jitter_pct,
        cron_min_interval_min: policy.cron_min_interval_min
      },
      reasons: [],
      metrics: metrics
    };

    // Rule 1: Low success rate (< 95%) → increase retries
    if (metrics.success_rate < 95.0 && policy.max_retries < 5) {
      recommendation.to.max_retries = Math.min(policy.max_retries + 1, 5);
      recommendation.reasons.push(`Low success rate (${metrics.success_rate}%) requires more retries`);
    }

    // Rule 2: Very high success rate (> 99.5%) with low avg attempts → reduce delay for speed
    if (metrics.success_rate > 99.5 && metrics.avg_attempts < 1.1 && policy.base_delay_ms > 100) {
      recommendation.to.base_delay_ms = Math.max(policy.base_delay_ms - 50, 100);
      recommendation.reasons.push(`Excellent success rate (${metrics.success_rate}%) allows faster retries`);
    }

    // Rule 3: High lock rate (> 5%) → increase jitter and cron interval
    if (metrics.lock_rate > 5.0) {
      if (policy.jitter_pct < 50) {
        recommendation.to.jitter_pct = Math.min(policy.jitter_pct + 10, 50);
        recommendation.reasons.push(`High lock rate (${metrics.lock_rate}%) needs more jitter to spread retries`);
      }
      if (policy.cron_min_interval_min < 20) {
        recommendation.to.cron_min_interval_min = Math.min(policy.cron_min_interval_min + 5, 30);
        recommendation.reasons.push(`High lock rate (${metrics.lock_rate}%) requires less frequent cron jobs`);
      }
    }

    // Rule 4: P95 duration spikes (> 2000ms) → increase base delay to reduce contention
    if (metrics.p95_duration_ms > 2000 && policy.base_delay_ms < 500) {
      recommendation.to.base_delay_ms = Math.min(policy.base_delay_ms + 100, 500);
      recommendation.reasons.push(`P95 duration spike (${metrics.p95_duration_ms}ms) indicates contention`);
    }

    // Rule 5: High average attempts (> 2.0) but good success rate → increase delay
    if (metrics.avg_attempts > 2.0 && metrics.success_rate > 95.0 && policy.base_delay_ms < 400) {
      recommendation.to.base_delay_ms = Math.min(policy.base_delay_ms + 50, 400);
      recommendation.reasons.push(`High retry count (${metrics.avg_attempts} avg) needs longer delays`);
    }

    // Rule 6: Excellent stability (99%+ success, <1.2 avg attempts, <1% locks) → optimize for speed
    if (metrics.success_rate > 99.0 && metrics.avg_attempts < 1.2 && metrics.lock_rate < 1.0) {
      if (policy.cron_min_interval_min > 10) {
        recommendation.to.cron_min_interval_min = Math.max(policy.cron_min_interval_min - 5, 10);
        recommendation.reasons.push(`Excellent stability allows more frequent cron jobs`);
      }
    }

    // Check if any changes were recommended
    const hasChanges =
      recommendation.to.max_retries !== recommendation.from.max_retries ||
      recommendation.to.base_delay_ms !== recommendation.from.base_delay_ms ||
      recommendation.to.jitter_pct !== recommendation.from.jitter_pct ||
      recommendation.to.cron_min_interval_min !== recommendation.from.cron_min_interval_min;

    if (!hasChanges) {
      logger.info('AdaptiveRetryTuner: No tuning changes recommended (system stable)');
      return null;
    }

    return recommendation;
  }

  /**
   * Store recommendation in database
   */
  storeRecommendation(recommendation) {
    const stmt = this.db.prepare(`
      INSERT INTO stability_recommendations (
        from_max_retries, from_base_delay_ms, from_jitter_pct, from_cron_min_interval_min,
        to_max_retries, to_base_delay_ms, to_jitter_pct, to_cron_min_interval_min,
        reason, author,
        observation_count, success_rate, avg_attempts, p95_duration_ms, lock_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      recommendation.from.max_retries,
      recommendation.from.base_delay_ms,
      recommendation.from.jitter_pct,
      recommendation.from.cron_min_interval_min,
      recommendation.to.max_retries,
      recommendation.to.base_delay_ms,
      recommendation.to.jitter_pct,
      recommendation.to.cron_min_interval_min,
      recommendation.reasons.join('; '),
      'AUTO',
      recommendation.metrics.observation_count,
      recommendation.metrics.success_rate,
      recommendation.metrics.avg_attempts,
      recommendation.metrics.p95_duration_ms,
      recommendation.metrics.lock_rate
    );

    return result.lastInsertRowid;
  }

  /**
   * Apply recommendation (update policy)
   */
  applyRecommendation(recommendationId, appliedBy = 'AUTO') {
    const rec = this.db.prepare('SELECT * FROM stability_recommendations WHERE id = ?').get(recommendationId);

    if (!rec) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    if (rec.applied) {
      throw new Error(`Recommendation ${recommendationId} already applied`);
    }

    // Update policy
    const updateStmt = this.db.prepare(`
      UPDATE stability_policy
      SET max_retries = ?,
          base_delay_ms = ?,
          jitter_pct = ?,
          cron_min_interval_min = ?,
          updated_by = ?
      WHERE id = 1
    `);

    updateStmt.run(
      rec.to_max_retries,
      rec.to_base_delay_ms,
      rec.to_jitter_pct,
      rec.to_cron_min_interval_min,
      appliedBy
    );

    // Mark recommendation as applied
    const markStmt = this.db.prepare(`
      UPDATE stability_recommendations
      SET applied = 1,
          applied_at = datetime('now'),
          applied_by = ?
      WHERE id = ?
    `);

    markStmt.run(appliedBy, recommendationId);

    logger.info(`AdaptiveRetryTuner: Applied recommendation ${recommendationId}`, {
      to_max_retries: rec.to_max_retries,
      to_base_delay_ms: rec.to_base_delay_ms,
      to_jitter_pct: rec.to_jitter_pct,
      to_cron_min_interval_min: rec.to_cron_min_interval_min,
      applied_by: appliedBy
    });

    return true;
  }

  /**
   * Run tuning cycle (analyze + store recommendation)
   * Returns recommendation ID if created, null if no changes needed
   */
  async runTuningCycle() {
    if (this.isRunning) {
      logger.warn('AdaptiveRetryTuner: Tuning cycle already in progress');
      return null;
    }

    this.isRunning = true;

    try {
      logger.info('AdaptiveRetryTuner: Starting tuning cycle');

      const recommendation = this.analyzeAndRecommend();

      if (!recommendation) {
        return null;
      }

      const recId = this.storeRecommendation(recommendation);
      this.tuneCount++;
      this.lastTuneTimestamp = new Date().toISOString();

      logger.info(`AdaptiveRetryTuner: Created recommendation ${recId}`, {
        changes: recommendation.to,
        reasons: recommendation.reasons
      });

      // Auto-apply if configured (not in this iteration - manual approval recommended)
      // this.applyRecommendation(recId, 'AUTO');

      return recId;

    } catch (error) {
      logger.error('AdaptiveRetryTuner: Error in tuning cycle', { error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get tuning statistics
   */
  getStatistics() {
    const policy = this.getCurrentPolicy();
    const metrics = this.getRecentMetrics(policy.observation_window_days);

    const pendingStmt = this.db.prepare('SELECT COUNT(*) as count FROM stability_recommendations WHERE applied = 0');
    const appliedStmt = this.db.prepare('SELECT COUNT(*) as count FROM stability_recommendations WHERE applied = 1');

    const pending = pendingStmt.get();
    const applied = appliedStmt.get();

    return {
      policy: policy,
      metrics: metrics,
      recommendations: {
        pending: pending.count,
        applied: applied.count,
        total: pending.count + applied.count
      },
      tuner: {
        is_running: this.isRunning,
        last_tune: this.lastTuneTimestamp,
        tune_count: this.tuneCount
      }
    };
  }

  /**
   * Record an observation (called by retry wrapper)
   */
  recordObservation(service, operation, attempts, success, durationMs, errorClass = null, locked = false) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO stability_observations (
          service, operation, attempts, success, duration_ms, error_class, locked
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(service, operation, attempts, success ? 1 : 0, durationMs, errorClass, locked ? 1 : 0);
    } catch (error) {
      logger.error('AdaptiveRetryTuner: Failed to record observation', { error: error.message });
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      logger.info('AdaptiveRetryTuner: Database connection closed');
    }
  }
}

module.exports = AdaptiveRetryTuner;
