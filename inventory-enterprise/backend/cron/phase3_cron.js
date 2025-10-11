/**
 * Phase 3 Cron Jobs - Autonomous Learning Layer
 * Scheduled tasks for AI tuning, health prediction, security scanning, governance
 * v13.0.1: Added self-healing watchdog for job recovery
 *
 * @version 13.0.1
 * @author NeuroInnovate AI Team
 */

const cron = require('node-cron');
const { logger } = require('../config/logger');

// AI Services
const AITunerService = require('../src/ai/learning/AITunerService');
const HealthPredictionService = require('../src/ai/learning/HealthPredictionService');
const SecurityScannerService = require('../src/ai/security/SecurityScannerService');
const GovernanceReportService = require('../src/ai/governance/GovernanceReportService');

// NeuroPilot v12.5: Real-Time AI Forecasting & Learning
const MenuPredictor = require('../src/ai/forecast/MenuPredictor');
const FeedbackTrainer = require('../src/ai/forecast/FeedbackTrainer');

// NeuroPilot v13.0: In-memory timestamp tracking
let _lastForecastRun = null;
let _lastLearningRun = null;

// NeuroPilot v13.0.1: Watchdog tracking and re-entrancy guards
let _forecastRunning = false;
let _learningRunning = false;
let _lastWatchdogCheck = null;
let _watchdogRecoveries = []; // Track recoveries in last 24h

class Phase3CronScheduler {
  constructor(db, metricsExporter, realtimeBus = null) {
    this.db = db;
    this.metricsExporter = metricsExporter;
    this.realtimeBus = realtimeBus || global.realtimeBus;
    this.jobs = [];
    this.isRunning = false;

    // v13.0: Ensure ops breadcrumbs table exists for persistence across restarts
    this.ensureOpsTable();
  }

  /**
   * Ensure ai_ops_breadcrumbs table exists (v13.0)
   * Stores last-run timestamps for jobs to survive server restarts
   */
  async ensureOpsTable() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_ops_breadcrumbs (
          job TEXT NOT NULL,
          ran_at TEXT NOT NULL,
          PRIMARY KEY (job)
        )
      `);
      logger.debug('Phase3Cron: Breadcrumbs table ready');
    } catch (error) {
      logger.error('Phase3Cron: Failed to create breadcrumbs table:', error);
    }
  }

  /**
   * Record job completion breadcrumb (v13.0)
   */
  async recordBreadcrumb(jobName, timestamp) {
    try {
      await this.db.run(`
        INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at)
        VALUES (?, ?)
      `, [jobName, timestamp]);
      logger.debug(`Phase3Cron: Breadcrumb recorded for ${jobName}`);
    } catch (error) {
      logger.error(`Phase3Cron: Failed to record breadcrumb for ${jobName}:`, error);
    }
  }

  /**
   * Start all scheduled cron jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Phase3Cron: Already running');
      return;
    }

    logger.info('Phase3Cron: Starting all scheduled jobs');

    // ========== HOURLY: Health Prediction ==========
    const healthPredictionJob = cron.schedule('0 * * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [HOURLY] Running health prediction');

      try {
        const healthService = new HealthPredictionService(this.db, this.metricsExporter);
        const prediction = await healthService.predict({ tenantId: 'default' });

        logger.info('Phase3Cron: Health prediction complete', {
          riskPct: prediction.riskPct,
          riskLevel: prediction.riskLevel,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('health_prediction', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Health prediction failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('health_prediction', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'health_prediction', schedule: '0 * * * *', job: healthPredictionJob });

    // ========== DAILY 06:00: Generate AI Forecast (NeuroPilot v12.5) ==========
    const forecastJob = cron.schedule('0 6 * * *', async () => {
      if (_forecastRunning) {
        logger.warn('Phase3Cron: Forecast already running, skipping scheduled run');
        return;
      }

      _forecastRunning = true;
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 06:00] 🔮 Generating AI forecast for today');

      try {
        const forecast = await MenuPredictor.generateDailyForecast();

        // v13.0: Record timestamp in memory and persist breadcrumb
        _lastForecastRun = new Date().toISOString();
        await this.recordBreadcrumb('ai_forecast', _lastForecastRun);

        logger.info('Phase3Cron: AI forecast complete', {
          date: forecast.date,
          totalItems: forecast.items?.length || 0,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_forecast', 'success', (Date.now() - jobStart) / 1000);
        }

        // v13.0: Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'forecast_completed',
            at: _lastForecastRun,
            ms: Date.now() - jobStart,
            itemCount: forecast.items?.length || 0
          });
        }

        // Emit real-time update (legacy)
        if (global.realtimeBus) {
          global.realtimeBus.emit('forecast:generated', {
            date: forecast.date,
            itemCount: forecast.items?.length || 0,
            timestamp: _lastForecastRun
          });
        }

      } catch (error) {
        logger.error('Phase3Cron: AI forecast failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_forecast', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _forecastRunning = false;
      }
    });

    this.jobs.push({ name: 'ai_forecast', schedule: '0 6 * * *', job: forecastJob });

    // ========== DAILY 21:00: Process AI Learning Feedback (NeuroPilot v12.5) ==========
    const learningJob = cron.schedule('0 21 * * *', async () => {
      if (_learningRunning) {
        logger.warn('Phase3Cron: Learning already running, skipping scheduled run');
        return;
      }

      _learningRunning = true;
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 21:00] 🧠 Processing AI learning feedback');

      try {
        const result = await FeedbackTrainer.processComments();

        // v13.0: Record timestamp in memory and persist breadcrumb
        _lastLearningRun = new Date().toISOString();
        await this.recordBreadcrumb('ai_learning', _lastLearningRun);

        logger.info('Phase3Cron: AI learning complete', {
          processed: result.processed || 0,
          applied: result.applied || 0,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_learning', 'success', (Date.now() - jobStart) / 1000);
        }

        // v13.0: Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'learning_completed',
            at: _lastLearningRun,
            ms: Date.now() - jobStart,
            processed: result.processed || 0,
            applied: result.applied || 0
          });
        }

        // Emit real-time update (legacy)
        if (global.realtimeBus) {
          global.realtimeBus.emit('learning:processed', {
            processed: result.processed || 0,
            applied: result.applied || 0,
            timestamp: _lastLearningRun
          });
        }

      } catch (error) {
        logger.error('Phase3Cron: AI learning failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_learning', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _learningRunning = false;
      }
    });

    this.jobs.push({ name: 'ai_learning', schedule: '0 21 * * *', job: learningJob });

    // ========== DAILY 02:20: Generate AI Tuning Proposals ==========
    const generateProposalsJob = cron.schedule('20 2 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 02:20] Generating AI tuning proposals');

      try {
        const tuner = new AITunerService(this.db, this.metricsExporter);

        // Analyze daily metrics
        const analysis = await tuner.analyzeDailyMetrics();
        logger.info('Phase3Cron: Daily metrics analyzed', {
          cacheHitRate: analysis.metrics.cacheHitRate,
          forecastMAPE: analysis.metrics.forecastMAPE,
          issues: analysis.issues.length,
          opportunities: analysis.opportunities.length
        });

        // Generate proposals
        const proposals = await tuner.generateProposals(analysis);
        logger.info('Phase3Cron: Proposals generated', {
          count: proposals.length,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('generate_proposals', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Proposal generation failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('generate_proposals', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'generate_proposals', schedule: '20 2 * * *', job: generateProposalsJob });

    // ========== DAILY 02:40: Auto-Apply Approved Proposals ==========
    const applyProposalsJob = cron.schedule('40 2 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 02:40] Auto-applying approved proposals');

      try {
        const tuner = new AITunerService(this.db, this.metricsExporter);

        // Apply safe proposals (confidence >= 0.85, risk = low)
        const applied = await tuner.applySafeProposals();

        logger.info('Phase3Cron: Proposals applied', {
          appliedCount: applied.length,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('apply_proposals', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Proposal application failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('apply_proposals', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'apply_proposals', schedule: '40 2 * * *', job: applyProposalsJob });

    // ========== DAILY 03:00: Security Scan ==========
    const securityScanJob = cron.schedule('0 3 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 03:00] Running security scan');

      try {
        const scanner = new SecurityScannerService(this.db, this.metricsExporter);

        // Scan last 24 hours
        const findings = await scanner.scanAuditLogs(24);

        logger.info('Phase3Cron: Security scan complete', {
          findingsCount: findings.length,
          critical: findings.filter(f => f.severity === 'critical').length,
          high: findings.filter(f => f.severity === 'high').length,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('security_scan', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Security scan failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('security_scan', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'security_scan', schedule: '0 3 * * *', job: securityScanJob });

    // ========== WEEKLY SUNDAY 03:00: Generate Governance Report ==========
    const governanceReportJob = cron.schedule('0 3 * * 0', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [WEEKLY SUNDAY 03:00] Generating governance report');

      try {
        const governanceService = new GovernanceReportService(this.db, this.metricsExporter);

        // Generate report for previous week
        const weekEnd = new Date();
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

        const report = await governanceService.generateWeeklyReport(weekStart, weekEnd);

        logger.info('Phase3Cron: Governance report generated', {
          reportId: report.reportId,
          filename: report.filename,
          path: report.filePath,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_report', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Governance report generation failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_report', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'governance_report', schedule: '0 3 * * 0', job: governanceReportJob });

    // ========== EVERY 6 HOURS: Cleanup Old Data ==========
    const cleanupJob = cron.schedule('0 */6 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [EVERY 6 HOURS] Running data cleanup');

      try {
        // Cleanup old audit logs (keep 90 days)
        const auditCleanup = await this.db.run(
          `DELETE FROM audit_logs WHERE created_at < datetime('now', '-90 days')`
        );

        // Cleanup old health predictions (keep 30 days)
        const healthCleanup = await this.db.run(
          `DELETE FROM ai_health_predictions WHERE created_at < datetime('now', '-30 days')`
        );

        // Cleanup old security findings (keep resolved for 60 days)
        const securityCleanup = await this.db.run(
          `DELETE FROM ai_security_findings
           WHERE status = 'resolved' AND resolved_at < datetime('now', '-60 days')`
        );

        logger.info('Phase3Cron: Cleanup complete', {
          auditLogsDeleted: auditCleanup.changes || 0,
          healthPredictionsDeleted: healthCleanup.changes || 0,
          securityFindingsDeleted: securityCleanup.changes || 0,
          duration: (Date.now() - jobStart) / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('cleanup', 'success', (Date.now() - jobStart) / 1000);
        }

      } catch (error) {
        logger.error('Phase3Cron: Cleanup failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('cleanup', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'cleanup', schedule: '0 */6 * * *', job: cleanupJob });

    // ========== EVERY 10 MINUTES: Self-Healing Watchdog (v13.0.1) ==========
    const watchdogJob = cron.schedule('*/10 * * * *', async () => {
      _lastWatchdogCheck = new Date().toISOString();
      const now = Date.now();
      const STALE_THRESHOLD = 26 * 60 * 60 * 1000; // 26 hours in ms

      try {
        // Clean up old recoveries (keep last 24h)
        _watchdogRecoveries = _watchdogRecoveries.filter(r => {
          const age = now - new Date(r.at).getTime();
          return age < 24 * 60 * 60 * 1000;
        });

        // Check forecast staleness
        if (_lastForecastRun) {
          const forecastAge = now - new Date(_lastForecastRun).getTime();
          if (forecastAge > STALE_THRESHOLD && !_forecastRunning) {
            logger.warn('Phase3Cron: Watchdog detected stale forecast, triggering recovery');
            _forecastRunning = true;
            try {
              await MenuPredictor.generateDailyForecast();
              _lastForecastRun = new Date().toISOString();
              await this.recordBreadcrumb('ai_forecast', _lastForecastRun);

              const recovery = { job: 'forecast', at: _lastForecastRun, reason: 'stale_26h' };
              _watchdogRecoveries.push(recovery);

              if (this.realtimeBus) {
                this.realtimeBus.emit('ai_event', {
                  type: 'watchdog:recovery',
                  job: 'forecast',
                  when: _lastForecastRun,
                  reason: 'stale_26h'
                });
              }
              logger.info('Phase3Cron: Watchdog recovery successful', { job: 'forecast' });
            } catch (err) {
              logger.error('Phase3Cron: Watchdog forecast recovery failed', { error: err.message });
            } finally {
              _forecastRunning = false;
            }
          }
        }

        // Check learning staleness
        if (_lastLearningRun) {
          const learningAge = now - new Date(_lastLearningRun).getTime();
          if (learningAge > STALE_THRESHOLD && !_learningRunning) {
            logger.warn('Phase3Cron: Watchdog detected stale learning, triggering recovery');
            _learningRunning = true;
            try {
              await FeedbackTrainer.processComments();
              _lastLearningRun = new Date().toISOString();
              await this.recordBreadcrumb('ai_learning', _lastLearningRun);

              const recovery = { job: 'learning', at: _lastLearningRun, reason: 'stale_26h' };
              _watchdogRecoveries.push(recovery);

              if (this.realtimeBus) {
                this.realtimeBus.emit('ai_event', {
                  type: 'watchdog:recovery',
                  job: 'learning',
                  when: _lastLearningRun,
                  reason: 'stale_26h'
                });
              }
              logger.info('Phase3Cron: Watchdog recovery successful', { job: 'learning' });
            } catch (err) {
              logger.error('Phase3Cron: Watchdog learning recovery failed', { error: err.message });
            } finally {
              _learningRunning = false;
            }
          }
        }

      } catch (error) {
        logger.error('Phase3Cron: Watchdog check failed', { error: error.message });
      }
    });

    this.jobs.push({ name: 'watchdog', schedule: '*/10 * * * *', job: watchdogJob });

    this.isRunning = true;

    logger.info('Phase3Cron: All jobs started', {
      jobCount: this.jobs.length,
      jobs: this.jobs.map(j => ({ name: j.name, schedule: j.schedule }))
    });
  }

  /**
   * Stop all scheduled cron jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Phase3Cron: Not running');
      return;
    }

    logger.info('Phase3Cron: Stopping all scheduled jobs');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`Phase3Cron: Stopped job ${name}`);
    });

    this.jobs = [];
    this.isRunning = false;

    logger.info('Phase3Cron: All jobs stopped');
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
        schedule,
        nextRun: this.getNextRunTime(schedule)
      }))
    };
  }

  /**
   * Get last run timestamps (v13.0)
   * Returns in-memory timestamps, falls back to breadcrumbs table if null
   */
  async getLastRuns() {
    let forecastRun = _lastForecastRun;
    let learningRun = _lastLearningRun;

    // Fallback to breadcrumbs table if in-memory is null (after restart)
    if (!forecastRun) {
      try {
        const breadcrumb = await this.db.get(
          `SELECT ran_at FROM ai_ops_breadcrumbs WHERE job = ?`,
          ['ai_forecast']
        );
        forecastRun = breadcrumb?.ran_at || null;
        if (forecastRun) {
          _lastForecastRun = forecastRun; // Restore to memory
        }
      } catch (err) {
        logger.debug('Phase3Cron: Breadcrumb read failed for ai_forecast:', err.message);
      }
    }

    if (!learningRun) {
      try {
        const breadcrumb = await this.db.get(
          `SELECT ran_at FROM ai_ops_breadcrumbs WHERE job = ?`,
          ['ai_learning']
        );
        learningRun = breadcrumb?.ran_at || null;
        if (learningRun) {
          _lastLearningRun = learningRun; // Restore to memory
        }
      } catch (err) {
        logger.debug('Phase3Cron: Breadcrumb read failed for ai_learning:', err.message);
      }
    }

    return {
      lastForecastRun: forecastRun,
      lastLearningRun: learningRun
    };
  }

  /**
   * Get watchdog status (v13.0.1)
   * Returns last check time and recent recoveries
   */
  getWatchdogStatus() {
    return {
      last_check_iso: _lastWatchdogCheck,
      last_recovery_iso: _watchdogRecoveries.length > 0
        ? _watchdogRecoveries[_watchdogRecoveries.length - 1].at
        : null,
      recoveries_24h: _watchdogRecoveries.length,
      recent_recoveries: _watchdogRecoveries.slice(-5) // Last 5
    };
  }

  /**
   * Get next run time for a cron schedule
   * @private
   */
  getNextRunTime(schedule) {
    // Simple helper - in production use a library like cron-parser
    const parts = schedule.split(' ');
    return 'Calculated by node-cron (use cron-parser for exact time)';
  }

  /**
   * Manually trigger a specific job (for testing/debugging)
   */
  async triggerJob(jobName) {
    const job = this.jobs.find(j => j.name === jobName);

    if (!job) {
      logger.warn('Phase3Cron: Job not found', { jobName });
      return { success: false, error: 'Job not found' };
    }

    logger.info('Phase3Cron: Manually triggering job', { jobName });

    try {
      // Execute the job's task function
      // Note: This is a simplified trigger - the actual task is in the schedule callback
      const jobStart = Date.now();

      switch (jobName) {
        case 'health_prediction':
          const healthService = new HealthPredictionService(this.db, this.metricsExporter);
          await healthService.predict({ tenantId: 'default' });
          break;

        case 'generate_proposals':
          const tuner = new AITunerService(this.db, this.metricsExporter);
          const analysis = await tuner.analyzeDailyMetrics();
          await tuner.generateProposals(analysis);
          break;

        case 'apply_proposals':
          const tunerApply = new AITunerService(this.db, this.metricsExporter);
          await tunerApply.applySafeProposals();
          break;

        case 'security_scan':
          const scanner = new SecurityScannerService(this.db, this.metricsExporter);
          await scanner.scanAuditLogs(24);
          break;

        case 'governance_report':
          const governanceService = new GovernanceReportService(this.db, this.metricsExporter);
          const weekEnd = new Date();
          const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
          await governanceService.generateWeeklyReport(weekStart, weekEnd);
          break;

        case 'ai_forecast':
          if (_forecastRunning) {
            return { success: false, error: 'Forecast already running' };
          }
          _forecastRunning = true;
          try {
            await MenuPredictor.generateDailyForecast();
            _lastForecastRun = new Date().toISOString();
            await this.recordBreadcrumb('ai_forecast', _lastForecastRun);
            if (this.realtimeBus) {
              this.realtimeBus.emit('ai_event', { type: 'forecast_completed', at: _lastForecastRun, ms: Date.now() - jobStart });
            }
          } finally {
            _forecastRunning = false;
          }
          break;

        case 'ai_learning':
          if (_learningRunning) {
            return { success: false, error: 'Learning already running' };
          }
          _learningRunning = true;
          try {
            await FeedbackTrainer.processComments();
            _lastLearningRun = new Date().toISOString();
            await this.recordBreadcrumb('ai_learning', _lastLearningRun);
            if (this.realtimeBus) {
              this.realtimeBus.emit('ai_event', { type: 'learning_completed', at: _lastLearningRun, ms: Date.now() - jobStart });
            }
          } finally {
            _learningRunning = false;
          }
          break;

        default:
          return { success: false, error: 'Unknown job' };
      }

      const duration = (Date.now() - jobStart) / 1000;
      logger.info('Phase3Cron: Job triggered successfully', { jobName, duration });

      return { success: true, jobName, duration };

    } catch (error) {
      logger.error('Phase3Cron: Job trigger failed', { jobName, error: error.message });
      return { success: false, error: error.message };
    }
  }
}

// Export class for use in server.js
module.exports = Phase3CronScheduler;

// If run directly, start scheduler (for testing)
if (require.main === module) {
  const { logger } = require('../config/logger');

  logger.info('Phase3Cron: Starting in standalone mode');

  // Mock database and metrics for testing
  const db = {
    run: async (sql, params) => ({ changes: 0, lastID: 1 }),
    get: async (sql, params) => null,
    all: async (sql, params) => []
  };

  const metricsExporter = {
    recordPhase3CronExecution: (job, status, duration) => {
      console.log(`Metric: phase3_cron_execution{job="${job}",status="${status}"} ${duration}`);
    }
  };

  const scheduler = new Phase3CronScheduler(db, metricsExporter);
  scheduler.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Phase3Cron: Received SIGINT, shutting down');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Phase3Cron: Received SIGTERM, shutting down');
    scheduler.stop();
    process.exit(0);
  });

  logger.info('Phase3Cron: Standalone mode running. Press Ctrl+C to stop.');
}
