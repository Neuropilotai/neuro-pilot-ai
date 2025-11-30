/**
 * @deprecated DEPRECATED IN V21.1 - SQLite-only, not used in production
 *
 * This module uses SQLite (better-sqlite3) which is not available in the
 * Railway PostgreSQL production environment. Will be re-implemented with
 * PostgreSQL in a future version.
 *
 * Original description:
 * Cron Auto-Throttle Controller
 * Dynamically adjusts cron job frequency based on system load and DB contention
 *
 * Features:
 * - Reads cron_min_interval_min from stability_policy
 * - Monitors lock events and failed operations
 * - Provides throttle recommendations for Phase 3/4 cron schedulers
 * - Integrates with existing watchdog mutex pattern
 *
 * @version 16.3.0 (DEPRECATED)
 * @author NeuroInnovate AI Team
 */

const Database = require('better-sqlite3');
const path = require('path');
const { logger } = require('../../config/logger');

class CronAutoThrottle {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../../database.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    // Throttle state
    this.currentIntervalMin = 15;
    this.lastCheck = null;
    this.throttleEvents = 0;

    // Load initial policy
    this.refreshPolicy();

    logger.info('CronAutoThrottle initialized', {
      current_interval_min: this.currentIntervalMin
    });
  }

  /**
   * Refresh policy from database
   */
  refreshPolicy() {
    try {
      const stmt = this.db.prepare('SELECT * FROM stability_policy WHERE id = 1');
      const policy = stmt.get();

      if (policy && policy.enabled) {
        this.currentIntervalMin = policy.cron_min_interval_min;
      }

      return policy;
    } catch (error) {
      logger.error('CronAutoThrottle: Failed to refresh policy', { error: error.message });
      return null;
    }
  }

  /**
   * Get current throttle interval in minutes
   */
  getIntervalMinutes() {
    return this.currentIntervalMin;
  }

  /**
   * Get current throttle interval as cron expression
   * Returns: '* /15 * * * *' format (without space after *)
   */
  getCronExpression() {
    return `*/${this.currentIntervalMin} * * * *`;
  }

  /**
   * Check if system should throttle based on recent observations
   * Returns: { shouldThrottle: boolean, reason: string, recommendedInterval: number }
   */
  checkThrottleStatus() {
    const policy = this.refreshPolicy();

    if (!policy || !policy.enabled) {
      return {
        shouldThrottle: false,
        reason: 'Stability policy disabled',
        recommendedInterval: this.currentIntervalMin
      };
    }

    // Get recent lock events (last 1 hour)
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_ops,
        SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) as lock_events,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_ops,
        ROUND(100.0 * SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as lock_rate,
        ROUND(100.0 * SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as failure_rate
      FROM stability_observations
      WHERE ts >= datetime('now', '-1 hour')
    `);

    const metrics = stmt.get();

    if (!metrics || metrics.total_ops === 0) {
      return {
        shouldThrottle: false,
        reason: 'No recent operations',
        recommendedInterval: this.currentIntervalMin,
        metrics: metrics
      };
    }

    // Throttle rules
    const lockRateThreshold = 10.0; // 10% lock rate
    const failureRateThreshold = 10.0; // 10% failure rate
    const minOpsForDecision = 10;

    if (metrics.total_ops < minOpsForDecision) {
      return {
        shouldThrottle: false,
        reason: 'Insufficient data for throttle decision',
        recommendedInterval: this.currentIntervalMin,
        metrics: metrics
      };
    }

    let shouldThrottle = false;
    let reason = 'System stable';
    let recommendedInterval = this.currentIntervalMin;

    // High lock rate → increase interval
    if (metrics.lock_rate > lockRateThreshold) {
      shouldThrottle = true;
      reason = `High lock rate (${metrics.lock_rate}%)`;
      recommendedInterval = Math.min(this.currentIntervalMin + 5, 30);
    }

    // High failure rate → increase interval
    if (metrics.failure_rate > failureRateThreshold) {
      shouldThrottle = true;
      reason += reason === 'System stable' ? `High failure rate (${metrics.failure_rate}%)` : `, high failure rate (${metrics.failure_rate}%)`;
      recommendedInterval = Math.min(this.currentIntervalMin + 5, 30);
    }

    // Excellent performance → decrease interval
    if (metrics.lock_rate < 1.0 && metrics.failure_rate < 1.0 && this.currentIntervalMin > 10) {
      shouldThrottle = false;
      reason = `Excellent stability (${metrics.lock_rate}% locks, ${metrics.failure_rate}% failures)`;
      recommendedInterval = Math.max(this.currentIntervalMin - 5, 10);
    }

    this.lastCheck = new Date().toISOString();

    if (shouldThrottle) {
      this.throttleEvents++;
    }

    return {
      shouldThrottle,
      reason,
      recommendedInterval,
      currentInterval: this.currentIntervalMin,
      metrics
    };
  }

  /**
   * Update interval (typically called by admin or tuner)
   */
  updateInterval(newIntervalMin, updatedBy = 'SYSTEM') {
    if (newIntervalMin < 5 || newIntervalMin > 120) {
      throw new Error('Interval must be between 5 and 120 minutes');
    }

    const stmt = this.db.prepare(`
      UPDATE stability_policy
      SET cron_min_interval_min = ?,
          updated_by = ?
      WHERE id = 1
    `);

    stmt.run(newIntervalMin, updatedBy);
    this.currentIntervalMin = newIntervalMin;

    logger.info(`CronAutoThrottle: Updated interval to ${newIntervalMin} minutes`, {
      updated_by: updatedBy
    });

    return {
      old_interval: this.currentIntervalMin,
      new_interval: newIntervalMin,
      cron_expression: this.getCronExpression()
    };
  }

  /**
   * Get throttle statistics
   */
  getStatistics() {
    const status = this.checkThrottleStatus();

    return {
      current_interval_min: this.currentIntervalMin,
      cron_expression: this.getCronExpression(),
      throttle_events: this.throttleEvents,
      last_check: this.lastCheck,
      status: status
    };
  }

  /**
   * Should skip current cron cycle (for integration with existing mutex pattern)
   * Returns true if system is under high load
   */
  shouldSkipCycle() {
    const status = this.checkThrottleStatus();
    return status.shouldThrottle;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      logger.info('CronAutoThrottle: Database connection closed');
    }
  }
}

module.exports = CronAutoThrottle;
