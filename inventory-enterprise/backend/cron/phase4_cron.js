/**
 * Phase 4 Cron Jobs - Governance Intelligence Layer (v16.0.0)
 * Scheduled tasks for anomaly detection, insight generation, intelligence scoring
 *
 * @version 16.0.0
 * @author NeuroPilot AI Development Team
 * @date 2025-10-18
 */

const cron = require('node-cron');
const { logger } = require('../config/logger');
const GovernanceIntelligenceService = require('../src/governance/GovernanceIntelligenceService');

// Timestamp tracking for persistence across restarts
let _lastAnomalyDetection = null;
let _lastInsightGeneration = null;
let _lastIntelligenceScore = null;
let _lastWeeklyReport = null;

// Re-entrancy guards
let _anomalyRunning = false;
let _insightRunning = false;
let _scoreRunning = false;
let _reportRunning = false;

class Phase4CronScheduler {
  constructor(db, metricsExporter, realtimeBus = null) {
    this.db = db;
    this.metricsExporter = metricsExporter;
    this.realtimeBus = realtimeBus || global.realtimeBus;
    this.jobs = [];
    this.isRunning = false;

    // Ensure ops breadcrumbs table exists for persistence across restarts
    this.ensureOpsTable();
  }

  /**
   * Ensure ai_ops_breadcrumbs table exists
   * Stores last-run timestamps for jobs to survive server restarts
   */
  async ensureOpsTable() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_ops_breadcrumbs (
          job TEXT NOT NULL,
          ran_at TEXT NOT NULL,
          action TEXT,
          duration_ms INTEGER,
          metadata TEXT,
          created_at TEXT,
          PRIMARY KEY (job)
        )
      `);
      logger.debug('Phase4Cron: Breadcrumbs table ready');
    } catch (error) {
      logger.error('Phase4Cron: Failed to create breadcrumbs table:', error);
    }
  }

  /**
   * Record job completion breadcrumb
   */
  async recordBreadcrumb(jobName, timestamp, action = null, duration = null, metadata = null) {
    try {
      await this.db.run(`
        INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [jobName, timestamp, action, duration, metadata ? JSON.stringify(metadata) : null, timestamp]);
      logger.debug(`Phase4Cron: Breadcrumb recorded for ${jobName}`);
    } catch (error) {
      logger.error(`Phase4Cron: Failed to record breadcrumb for ${jobName}:`, error);
    }
  }

  /**
   * Start all scheduled cron jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Phase4Cron: Already running');
      return;
    }

    logger.info('Phase4Cron: Starting governance intelligence jobs');

    // ========== DAILY 03:00: Run Anomaly Detection ==========
    const anomalyDetectionJob = cron.schedule('0 3 * * *', async () => {
      if (_anomalyRunning) {
        logger.warn('Phase4Cron: Anomaly detection already running, skipping scheduled run');
        return;
      }

      _anomalyRunning = true;
      const jobStart = Date.now();
      logger.info('Phase4Cron: [DAILY 03:00] 🔍 Running governance anomaly detection');

      try {
        const intelligenceService = new GovernanceIntelligenceService(this.db);
        const result = await intelligenceService.detectAnomalies({ as_of: null }); // Use today

        _lastAnomalyDetection = new Date().toISOString();
        const duration = Date.now() - jobStart;

        logger.info('Phase4Cron: Anomaly detection complete', {
          as_of: result.as_of,
          anomaly_count: result.anomalies.length,
          critical: result.anomalies.filter(a => a.severity === 'critical').length,
          high: result.anomalies.filter(a => a.severity === 'high').length,
          duration: duration / 1000
        });

        // Record breadcrumb
        await this.recordBreadcrumb('governance_anomaly_detection', _lastAnomalyDetection, 'anomaly_detection_completed', duration, {
          anomaly_count: result.anomalies.length,
          as_of: result.as_of
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_anomaly_detection', 'success', duration / 1000);
        }

        // Emit real-time event
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_anomaly_detection_completed',
            at: _lastAnomalyDetection,
            ms: duration,
            anomaly_count: result.anomalies.length
          });
        }

      } catch (error) {
        logger.error('Phase4Cron: Anomaly detection failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_anomaly_detection', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _anomalyRunning = false;
      }
    });

    this.jobs.push({ name: 'governance_anomaly_detection', schedule: '0 3 * * *', job: anomalyDetectionJob });

    // ========== DAILY 03:05: Generate Insights ==========
    const insightGenerationJob = cron.schedule('5 3 * * *', async () => {
      if (_insightRunning) {
        logger.warn('Phase4Cron: Insight generation already running, skipping scheduled run');
        return;
      }

      _insightRunning = true;
      const jobStart = Date.now();
      logger.info('Phase4Cron: [DAILY 03:05] 💡 Generating governance insights (bilingual)');

      try {
        const intelligenceService = new GovernanceIntelligenceService(this.db);
        const result = await intelligenceService.generateInsights({ as_of: null, locale: 'en' }); // Generate both EN/FR

        _lastInsightGeneration = new Date().toISOString();
        const duration = Date.now() - jobStart;

        logger.info('Phase4Cron: Insight generation complete', {
          as_of: result.as_of,
          insight_count: result.insights.length,
          avg_confidence: result.insights.reduce((sum, i) => sum + i.confidence, 0) / result.insights.length || 0,
          duration: duration / 1000
        });

        // Record breadcrumb
        await this.recordBreadcrumb('governance_insight_generation', _lastInsightGeneration, 'insight_generation_completed', duration, {
          insight_count: result.insights.length,
          as_of: result.as_of
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_insight_generation', 'success', duration / 1000);
        }

        // Emit real-time event
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_insight_generation_completed',
            at: _lastInsightGeneration,
            ms: duration,
            insight_count: result.insights.length
          });
        }

      } catch (error) {
        logger.error('Phase4Cron: Insight generation failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_insight_generation', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _insightRunning = false;
      }
    });

    this.jobs.push({ name: 'governance_insight_generation', schedule: '5 3 * * *', job: insightGenerationJob });

    // ========== DAILY 03:10: Compute Intelligence Score ==========
    const intelligenceScoreJob = cron.schedule('10 3 * * *', async () => {
      if (_scoreRunning) {
        logger.warn('Phase4Cron: Intelligence scoring already running, skipping scheduled run');
        return;
      }

      _scoreRunning = true;
      const jobStart = Date.now();
      logger.info('Phase4Cron: [DAILY 03:10] 📈 Computing governance intelligence score');

      try {
        const intelligenceService = new GovernanceIntelligenceService(this.db);
        const result = await intelligenceService.computeIntelligenceScore({ as_of: null }); // Use today

        _lastIntelligenceScore = new Date().toISOString();
        const duration = Date.now() - jobStart;

        logger.info('Phase4Cron: Intelligence score computed', {
          as_of: result.as_of,
          intelligence_score: result.intelligence_score,
          components: result.components,
          duration: duration / 1000
        });

        // Record breadcrumb
        await this.recordBreadcrumb('governance_intelligence_score', _lastIntelligenceScore, 'intelligence_score_computed', duration, {
          intelligence_score: result.intelligence_score,
          as_of: result.as_of
        });

        // Update Prometheus metric
        if (this.metricsExporter?.recordGovernanceIntelligenceScore) {
          this.metricsExporter.recordGovernanceIntelligenceScore(result.intelligence_score);
        }

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_intelligence_score', 'success', duration / 1000);
        }

        // Emit real-time event
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_intelligence_score_computed',
            at: _lastIntelligenceScore,
            ms: duration,
            intelligence_score: result.intelligence_score
          });
        }

      } catch (error) {
        logger.error('Phase4Cron: Intelligence score computation failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_intelligence_score', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _scoreRunning = false;
      }
    });

    this.jobs.push({ name: 'governance_intelligence_score', schedule: '10 3 * * *', job: intelligenceScoreJob });

    // ========== WEEKLY SUNDAY 04:00: Generate Bilingual PDF Report ==========
    const weeklyReportJob = cron.schedule('0 4 * * 0', async () => {
      if (_reportRunning) {
        logger.warn('Phase4Cron: Weekly report already running, skipping scheduled run');
        return;
      }

      _reportRunning = true;
      const jobStart = Date.now();
      logger.info('Phase4Cron: [WEEKLY SUNDAY 04:00] 📄 Generating governance intelligence PDF report (EN + FR)');

      try {
        const intelligenceService = new GovernanceIntelligenceService(this.db);

        // Generate both English and French reports
        const enResult = await intelligenceService.generatePDFReport({ locale: 'en' });
        const frResult = await intelligenceService.generatePDFReport({ locale: 'fr' });

        _lastWeeklyReport = new Date().toISOString();
        const duration = Date.now() - jobStart;

        logger.info('Phase4Cron: Weekly bilingual reports generated', {
          en_filename: enResult.filename,
          fr_filename: frResult.filename,
          duration: duration / 1000
        });

        // Record breadcrumb
        await this.recordBreadcrumb('governance_weekly_report', _lastWeeklyReport, 'weekly_report_generated', duration, {
          en_filename: enResult.filename,
          fr_filename: frResult.filename
        });

        // Update Prometheus metrics
        if (this.metricsExporter?.incrementGovernanceReportGenerations) {
          this.metricsExporter.incrementGovernanceReportGenerations('en');
          this.metricsExporter.incrementGovernanceReportGenerations('fr');
        }

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_weekly_report', 'success', duration / 1000);
        }

        // Emit real-time event
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_weekly_report_generated',
            at: _lastWeeklyReport,
            ms: duration,
            reports: [enResult.filename, frResult.filename]
          });
        }

      } catch (error) {
        logger.error('Phase4Cron: Weekly report generation failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_weekly_report', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _reportRunning = false;
      }
    });

    this.jobs.push({ name: 'governance_weekly_report', schedule: '0 4 * * 0', job: weeklyReportJob });

    this.isRunning = true;

    logger.info('Phase4Cron: All governance intelligence jobs started', {
      jobCount: this.jobs.length,
      jobs: this.jobs.map(j => ({ name: j.name, schedule: j.schedule }))
    });
  }

  /**
   * Stop all scheduled cron jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Phase4Cron: Not running');
      return;
    }

    logger.info('Phase4Cron: Stopping all governance intelligence jobs');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`Phase4Cron: Stopped job ${name}`);
    });

    this.jobs = [];
    this.isRunning = false;

    logger.info('Phase4Cron: All jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      jobs: this.jobs.map(({ name, schedule }) => ({
        name,
        schedule
      })),
      lastRuns: {
        lastAnomalyDetection: _lastAnomalyDetection,
        lastInsightGeneration: _lastInsightGeneration,
        lastIntelligenceScore: _lastIntelligenceScore,
        lastWeeklyReport: _lastWeeklyReport
      }
    };
  }

  /**
   * Get last run timestamps
   * Returns in-memory timestamps, falls back to breadcrumbs table if null
   */
  async getLastRuns() {
    const jobs = [
      { name: 'governance_anomaly_detection', current: _lastAnomalyDetection },
      { name: 'governance_insight_generation', current: _lastInsightGeneration },
      { name: 'governance_intelligence_score', current: _lastIntelligenceScore },
      { name: 'governance_weekly_report', current: _lastWeeklyReport }
    ];

    const result = {};

    for (const job of jobs) {
      if (!job.current) {
        try {
          const breadcrumb = await this.db.get(
            `SELECT ran_at FROM ai_ops_breadcrumbs WHERE job = ?`,
            [job.name]
          );
          result[job.name] = breadcrumb?.ran_at || null;
        } catch (err) {
          logger.debug(`Phase4Cron: Breadcrumb read failed for ${job.name}:`, err.message);
          result[job.name] = null;
        }
      } else {
        result[job.name] = job.current;
      }
    }

    return result;
  }

  /**
   * Manually trigger a specific job (for testing/debugging)
   */
  async triggerJob(jobName) {
    const job = this.jobs.find(j => j.name === jobName);

    if (!job) {
      logger.warn('Phase4Cron: Job not found', { jobName });
      return { success: false, error: 'Job not found' };
    }

    logger.info('Phase4Cron: Manually triggering job', { jobName });

    const jobStart = Date.now();

    try {
      const intelligenceService = new GovernanceIntelligenceService(this.db);
      let result;

      switch (jobName) {
        case 'governance_anomaly_detection':
          if (_anomalyRunning) {
            return { success: false, error: 'Anomaly detection already running' };
          }
          _anomalyRunning = true;
          try {
            result = await intelligenceService.detectAnomalies({ as_of: null });
            _lastAnomalyDetection = new Date().toISOString();
            await this.recordBreadcrumb('governance_anomaly_detection', _lastAnomalyDetection, 'manual_trigger', Date.now() - jobStart, {
              anomaly_count: result.anomalies.length
            });
          } finally {
            _anomalyRunning = false;
          }
          break;

        case 'governance_insight_generation':
          if (_insightRunning) {
            return { success: false, error: 'Insight generation already running' };
          }
          _insightRunning = true;
          try {
            result = await intelligenceService.generateInsights({ as_of: null, locale: 'en' });
            _lastInsightGeneration = new Date().toISOString();
            await this.recordBreadcrumb('governance_insight_generation', _lastInsightGeneration, 'manual_trigger', Date.now() - jobStart, {
              insight_count: result.insights.length
            });
          } finally {
            _insightRunning = false;
          }
          break;

        case 'governance_intelligence_score':
          if (_scoreRunning) {
            return { success: false, error: 'Intelligence scoring already running' };
          }
          _scoreRunning = true;
          try {
            result = await intelligenceService.computeIntelligenceScore({ as_of: null });
            _lastIntelligenceScore = new Date().toISOString();
            await this.recordBreadcrumb('governance_intelligence_score', _lastIntelligenceScore, 'manual_trigger', Date.now() - jobStart, {
              intelligence_score: result.intelligence_score
            });

            // Update Prometheus metric
            if (this.metricsExporter?.recordGovernanceIntelligenceScore) {
              this.metricsExporter.recordGovernanceIntelligenceScore(result.intelligence_score);
            }
          } finally {
            _scoreRunning = false;
          }
          break;

        case 'governance_weekly_report':
          if (_reportRunning) {
            return { success: false, error: 'Weekly report already running' };
          }
          _reportRunning = true;
          try {
            const enResult = await intelligenceService.generatePDFReport({ locale: 'en' });
            const frResult = await intelligenceService.generatePDFReport({ locale: 'fr' });
            _lastWeeklyReport = new Date().toISOString();
            await this.recordBreadcrumb('governance_weekly_report', _lastWeeklyReport, 'manual_trigger', Date.now() - jobStart, {
              en_filename: enResult.filename,
              fr_filename: frResult.filename
            });

            // Update Prometheus metrics
            if (this.metricsExporter?.incrementGovernanceReportGenerations) {
              this.metricsExporter.incrementGovernanceReportGenerations('en');
              this.metricsExporter.incrementGovernanceReportGenerations('fr');
            }

            result = { enResult, frResult };
          } finally {
            _reportRunning = false;
          }
          break;

        default:
          return { success: false, error: 'Unknown job' };
      }

      const duration = (Date.now() - jobStart) / 1000;
      logger.info('Phase4Cron: Job triggered successfully', { jobName, duration });

      return { success: true, jobName, duration, result };

    } catch (error) {
      logger.error('Phase4Cron: Job trigger failed', { jobName, error: error.message });
      return { success: false, error: error.message };
    }
  }
}

// Export class for use in server.js
module.exports = Phase4CronScheduler;

// If run directly, start scheduler (for testing)
if (require.main === module) {
  const { logger } = require('../config/logger');

  logger.info('Phase4Cron: Starting in standalone mode');

  // Mock database and metrics for testing
  const db = {
    run: async (sql, params) => ({ changes: 0, lastID: 1 }),
    get: async (sql, params) => null,
    all: async (sql, params) => []
  };

  const metricsExporter = {
    recordPhase3CronExecution: (job, status, duration) => {
      console.log(`Metric: phase3_cron_execution{job="${job}",status="${status}"} ${duration}`);
    },
    recordGovernanceIntelligenceScore: (score) => {
      console.log(`Metric: governance_intelligence_score ${score}`);
    },
    incrementGovernanceReportGenerations: (locale) => {
      console.log(`Metric: governance_report_generations_total{locale="${locale}"} +1`);
    }
  };

  const scheduler = new Phase4CronScheduler(db, metricsExporter);
  scheduler.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Phase4Cron: Received SIGINT, shutting down');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Phase4Cron: Received SIGTERM, shutting down');
    scheduler.stop();
    process.exit(0);
  });

  logger.info('Phase4Cron: Standalone mode running. Press Ctrl+C to stop.');
}
