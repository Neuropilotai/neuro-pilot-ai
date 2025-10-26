/**
 * Stability Layer Cron Jobs
 * Periodic tuning, metrics export, and health scoring
 *
 * Jobs:
 * - Tuning cycle (every 6 hours) - analyze observations and generate recommendations
 * - Metrics export (every 5 minutes) - push current stability metrics to Prometheus
 * - Daily rollup (daily at 00:15) - aggregate observations into daily metrics
 *
 * @version 16.3.0
 * @author NeuroInnovate AI Team
 */

const cron = require('node-cron');
const { logger } = require('../config/logger');
const AdaptiveRetryTuner = require('../src/stability/AdaptiveRetryTuner');
const CronAutoThrottle = require('../src/stability/CronAutoThrottle');
const Database = require('better-sqlite3');
const path = require('path');

class StabilityCronScheduler {
  constructor() {
    this.jobs = [];
    this.tuner = new AdaptiveRetryTuner();
    this.throttle = new CronAutoThrottle();
    this.metricsExporter = null; // Set during init

    logger.info('StabilityCronScheduler: Initializing...');
  }

  /**
   * Initialize all scheduled jobs
   */
  init(metricsExporter = null) {
    this.metricsExporter = metricsExporter;

    // Job 1: Tuning Cycle (every 6 hours)
    const tuningJob = cron.schedule('0 */6 * * *', async () => {
      try {
        logger.info('StabilityCron: Running tuning cycle');

        const recId = await this.tuner.runTuningCycle();

        if (recId) {
          logger.info(`StabilityCron: Generated recommendation ${recId}`);

          if (this.metricsExporter) {
            this.metricsExporter.recordStabilityRecommendation('AUTO', false);
            this.metricsExporter.recordStabilityTuningCycle();
          }
        } else {
          logger.info('StabilityCron: No tuning changes needed (system stable)');
        }
      } catch (error) {
        logger.error('StabilityCron: Tuning cycle failed', { error: error.message });
      }
    });

    // Job 2: Metrics Export (every 5 minutes)
    const metricsJob = cron.schedule('*/5 * * * *', () => {
      try {
        if (!this.metricsExporter) return;

        const stats = this.tuner.getStatistics();

        // Export policy values
        this.metricsExporter.setStabilityPolicyValues(stats.policy);

        // Export current metrics
        if (stats.metrics.observation_count > 0) {
          this.metricsExporter.setStabilitySuccessRate(stats.metrics.success_rate || 0);
          this.metricsExporter.setStabilityAvgAttempts(stats.metrics.avg_attempts || 0);
          this.metricsExporter.setStabilityLockRate(stats.metrics.lock_rate || 0);
        }

        // Export health score
        const db = new Database(path.join(__dirname, '../database.db'));
        const health = db.prepare('SELECT * FROM v_stability_health').get();
        db.close();

        if (health) {
          this.metricsExporter.setStabilityScore(health.stability_score || 0);
        }

        logger.debug('StabilityCron: Metrics exported to Prometheus');
      } catch (error) {
        logger.error('StabilityCron: Metrics export failed', { error: error.message });
      }
    });

    // Job 3: Daily Rollup (daily at 00:15 UTC)
    const rollupJob = cron.schedule('15 0 * * *', () => {
      try {
        logger.info('StabilityCron: Running daily rollup');

        const db = new Database(path.join(__dirname, '../database.db'));

        // Aggregate yesterday's observations
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO stability_metrics_daily (
            date, service, operation,
            total_operations, successful_operations, failed_operations,
            total_retries, total_duration_ms, lock_events,
            avg_attempts, success_rate, p95_duration_ms,
            updated_at
          )
          SELECT
            DATE(ts) as date,
            service,
            operation,
            COUNT(*) as total_operations,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_operations,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_operations,
            SUM(attempts - 1) as total_retries,
            SUM(duration_ms) as total_duration_ms,
            SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) as lock_events,
            ROUND(AVG(attempts), 2) as avg_attempts,
            ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
            (
              SELECT duration_ms FROM stability_observations
              WHERE DATE(ts) = DATE('now', '-1 day')
                AND service = s.service
                AND operation = s.operation
              ORDER BY duration_ms DESC
              LIMIT 1 OFFSET CAST(COUNT(*) * 0.05 AS INTEGER)
            ) as p95_duration_ms,
            datetime('now') as updated_at
          FROM stability_observations s
          WHERE DATE(ts) = DATE('now', '-1 day')
          GROUP BY DATE(ts), service, operation
        `);

        const result = stmt.run();
        db.close();

        logger.info(`StabilityCron: Daily rollup complete (${result.changes} rows aggregated)`);
      } catch (error) {
        logger.error('StabilityCron: Daily rollup failed', { error: error.message });
      }
    });

    this.jobs = [
      { name: 'Tuning Cycle', schedule: '0 */6 * * *', job: tuningJob },
      { name: 'Metrics Export', schedule: '*/5 * * * *', job: metricsJob },
      { name: 'Daily Rollup', schedule: '15 0 * * *', job: rollupJob }
    ];

    logger.info(`StabilityCron: ${this.jobs.length} jobs scheduled`, {
      jobs: this.jobs.map(j => ({ name: j.name, schedule: j.schedule }))
    });

    return this;
  }

  /**
   * Start all jobs
   */
  start() {
    this.jobs.forEach(({ name, job }) => {
      job.start();
      logger.info(`StabilityCron: Started job "${name}"`);
    });

    logger.info('✨ Stability Layer Cron Jobs ACTIVE');
  }

  /**
   * Stop all jobs
   */
  stop() {
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`StabilityCron: Stopped job "${name}"`);
    });

    // Close tuner and throttle DB connections
    if (this.tuner) {
      this.tuner.close();
    }
    if (this.throttle) {
      this.throttle.close();
    }

    logger.info('StabilityCron: All jobs stopped');
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      total_jobs: this.jobs.length,
      jobs: this.jobs.map(({ name, schedule }) => ({ name, schedule })),
      tuner_running: this.tuner.isRunning,
      last_tune: this.tuner.lastTuneTimestamp,
      tune_count: this.tuner.tuneCount
    };
  }
}

module.exports = StabilityCronScheduler;
