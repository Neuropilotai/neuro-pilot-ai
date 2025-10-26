/**
 * Phase 3 Cron Jobs - Autonomous Learning Layer
 * Scheduled tasks for AI tuning, health prediction, security scanning, governance
 * v13.0.1: Added self-healing watchdog for job recovery
 * v13.0.2: Reduced watchdog frequency to every 15 minutes and added mutex locks for database contention
 *
 * @version 13.0.2
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

// NeuroPilot v15.5.0: Order Forecasting + Recommendation Engine
const ForecastingEngine = require('../src/ai/forecast/ForecastingEngine');

// NeuroPilot v13.0: In-memory timestamp tracking
let _lastForecastRun = null;
let _lastLearningRun = null;
let _lastOrderForecastRun = null; // v15.5.0: Order forecasting

// NeuroPilot v13.0.1: Watchdog tracking and re-entrancy guards
let _forecastRunning = false;
let _learningRunning = false;
let _orderForecastRunning = false; // v15.5.0: Order forecasting guard
let _lastWatchdogCheck = null;
let _watchdogRecoveries = []; // Track recoveries in last 24h

// NeuroPilot v13.0.2: Mutex locks for preventing concurrent cron execution
let _watchdogRunning = false;

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
        // v14.4: Instantiate MenuPredictor with database
        const predictor = new MenuPredictor(this.db);
        const forecast = await predictor.getPredictedUsageForToday();

        // v13.0: Record timestamp in memory and persist breadcrumb
        _lastForecastRun = new Date().toISOString();
        await this.recordBreadcrumb('ai_forecast', _lastForecastRun);

        const duration = Date.now() - jobStart;

        logger.info('Phase3Cron: AI forecast complete', {
          date: forecast.date,
          totalItems: forecast.items?.length || 0,
          duration: duration / 1000
        });

        // v13.x: Track latency in realtimeBus for predictive health metrics
        if (this.realtimeBus && typeof this.realtimeBus.trackForecastLatency === 'function') {
          this.realtimeBus.trackForecastLatency(duration);
        }

        // v13.x: Persist to breadcrumbs with duration and metadata
        await this.db.run(`
          INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, ['ai_forecast', _lastForecastRun, 'forecast_completed', duration, JSON.stringify({ itemCount: forecast.items?.length || 0 }), _lastForecastRun]);

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_forecast', 'success', duration / 1000);
        }

        // v13.0: Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'forecast_completed',
            at: _lastForecastRun,
            ms: duration,
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
        // v14.4: Instantiate FeedbackTrainer with database
        const trainer = new FeedbackTrainer(this.db);
        const result = await trainer.applyAllPendingComments();

        // v13.0: Record timestamp in memory and persist breadcrumb
        _lastLearningRun = new Date().toISOString();
        await this.recordBreadcrumb('ai_learning', _lastLearningRun);

        const duration = Date.now() - jobStart;

        logger.info('Phase3Cron: AI learning complete', {
          processed: result.total || 0,
          applied: result.applied || 0,
          failed: result.failed || 0,
          duration: duration / 1000
        });

        // v13.x: Track latency in realtimeBus for predictive health metrics
        if (this.realtimeBus && typeof this.realtimeBus.trackLearningLatency === 'function') {
          this.realtimeBus.trackLearningLatency(duration);
        }

        // v13.x: Persist to breadcrumbs with duration and metadata
        await this.db.run(`
          INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, ['ai_learning', _lastLearningRun, 'learning_completed', duration, JSON.stringify({ processed: result.total || 0, applied: result.applied || 0 }), _lastLearningRun]);

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_learning', 'success', duration / 1000);
        }

        // v13.0: Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'learning_completed',
            at: _lastLearningRun,
            ms: duration,
            processed: result.total || 0,
            applied: result.applied || 0
          });
        }

        // Emit real-time update (legacy)
        if (global.realtimeBus) {
          global.realtimeBus.emit('learning:processed', {
            processed: result.total || 0,
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

    // ========== DAILY 02:00: AI Order Forecasting + Recommendations (v15.5.0) ==========
    const orderForecastJob = cron.schedule('0 2 * * *', async () => {
      if (_orderForecastRunning) {
        logger.warn('Phase3Cron: Order forecasting already running, skipping scheduled run');
        return;
      }

      _orderForecastRunning = true;
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 02:00] 📦 Generating AI order forecasts and recommendations');

      try {
        // v15.5.0: Instantiate ForecastingEngine with database
        const forecastEngine = new ForecastingEngine(this.db);
        const result = await forecastEngine.generateForecast({ horizonDays: 7 });

        // Calculate accuracy from past forecasts
        const accuracy = await forecastEngine.calculateAccuracy();

        // Apply pending feedback to improve future forecasts
        const learningResult = await forecastEngine.applyPendingFeedback();

        // Record forecast metrics (v15.5.0)
        if (this.metricsExporter?.recordForecastRun) {
          this.metricsExporter.recordForecastRun(result.items_forecasted);
        }
        if (this.metricsExporter?.setForecastAccuracy && accuracy.accuracy_pct !== null) {
          this.metricsExporter.setForecastAccuracy(accuracy.accuracy_pct);
        }
        if (this.metricsExporter?.recordForecastLearningApplied && learningResult.applied_count > 0) {
          this.metricsExporter.recordForecastLearningApplied();
        }

        // Record timestamp
        _lastOrderForecastRun = new Date().toISOString();
        await this.recordBreadcrumb('ai_order_forecast', _lastOrderForecastRun);

        const duration = Date.now() - jobStart;

        logger.info('Phase3Cron: AI order forecast complete', {
          run_id: result.run_id,
          items_forecasted: result.items_forecasted,
          avg_confidence: result.avg_confidence,
          forecast_accuracy: accuracy.accuracy_pct,
          feedback_applied: learningResult.applied_count,
          duration: duration / 1000
        });

        // Persist to breadcrumbs with metadata
        await this.db.run(`
          INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          'ai_order_forecast',
          _lastOrderForecastRun,
          'order_forecast_completed',
          duration,
          JSON.stringify({
            run_id: result.run_id,
            items_forecasted: result.items_forecasted,
            avg_confidence: result.avg_confidence,
            forecast_accuracy: accuracy.accuracy_pct || null,
            feedback_applied: learningResult.applied_count
          }),
          _lastOrderForecastRun
        ]);

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_order_forecast', 'success', duration / 1000);
        }

        // Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'order_forecast_completed',
            at: _lastOrderForecastRun,
            ms: duration,
            items_forecasted: result.items_forecasted,
            avg_confidence: result.avg_confidence,
            forecast_accuracy: accuracy.accuracy_pct || null
          });
        }

      } catch (error) {
        logger.error('Phase3Cron: AI order forecast failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('ai_order_forecast', 'error', (Date.now() - jobStart) / 1000);
        }
      } finally {
        _orderForecastRunning = false;
      }
    });

    this.jobs.push({ name: 'ai_order_forecast', schedule: '0 2 * * *', job: orderForecastJob });

    // ========== DAILY 02:05: Record Governance Daily Scores (v15.9.0) ==========
    const GovernanceTrendService = require('../src/governance/GovernanceTrendService');

    const governanceDailyJob = cron.schedule('5 2 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 02:05] 📊 Recording governance daily scores');

      try {
        const govTrendService = new GovernanceTrendService(this.db);
        const result = await govTrendService.recordDailyScores({ source: 'auto' });

        const duration = Date.now() - jobStart;

        logger.info('Phase3Cron: Governance daily scores recorded', {
          as_of: result.as_of,
          scores: result.scores,
          duration: duration / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_daily', 'success', duration / 1000);
        }

        // Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_daily_recorded',
            at: result.as_of,
            ms: duration,
            scores: result.scores
          });
        }

      } catch (error) {
        logger.error('Phase3Cron: Governance daily recording failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_daily', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'governance_daily', schedule: '5 2 * * *', job: governanceDailyJob });

    // ========== DAILY 02:10: Compute Governance Forecasts (v15.9.0) ==========
    const governanceForecastJob = cron.schedule('10 2 * * *', async () => {
      const jobStart = Date.now();
      logger.info('Phase3Cron: [DAILY 02:10] 🔮 Computing governance forecasts');

      try {
        const govTrendService = new GovernanceTrendService(this.db);
        const result = await govTrendService.computeForecast({
          horizons: [7, 14, 30],
          method: 'exp_smoothing'
        });

        const duration = Date.now() - jobStart;

        logger.info('Phase3Cron: Governance forecasts computed', {
          run_id: result.run_id,
          forecast_count: result.forecasts.length,
          duration: duration / 1000
        });

        // Record cron job execution
        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_forecast', 'success', duration / 1000);
        }

        // Emit AI event for activity feed
        if (this.realtimeBus) {
          this.realtimeBus.emit('ai_event', {
            type: 'governance_forecast_computed',
            at: new Date().toISOString(),
            ms: duration,
            run_id: result.run_id,
            forecast_count: result.forecasts.length
          });
        }

      } catch (error) {
        logger.error('Phase3Cron: Governance forecast failed', { error: error.message, stack: error.stack });

        if (this.metricsExporter?.recordPhase3CronExecution) {
          this.metricsExporter.recordPhase3CronExecution('governance_forecast', 'error', (Date.now() - jobStart) / 1000);
        }
      }
    });

    this.jobs.push({ name: 'governance_forecast', schedule: '10 2 * * *', job: governanceForecastJob });

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

    // ========== EVERY 15 MINUTES: Self-Healing Watchdog (v13.0.2) ==========
    const watchdogJob = cron.schedule('*/15 * * * *', async () => {
      // v13.0.2: Mutex lock to prevent concurrent watchdog execution
      if (_watchdogRunning) {
        logger.warn('Phase3Cron: Watchdog already running, skipping this cycle');
        return;
      }

      _watchdogRunning = true;
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
              // v14.4: Instantiate MenuPredictor with database
              const predictor = new MenuPredictor(this.db);
              await predictor.getPredictedUsageForToday();
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
              // v14.4: Instantiate FeedbackTrainer with database
              const trainer = new FeedbackTrainer(this.db);
              await trainer.applyAllPendingComments();
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
      } finally {
        // v13.0.2: Always release the mutex lock
        _watchdogRunning = false;
      }
    });

    this.jobs.push({ name: 'watchdog', schedule: '*/15 * * * *', job: watchdogJob });

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
            // v14.4: Instantiate MenuPredictor with database
            const predictor = new MenuPredictor(this.db);
            const forecast = await predictor.getPredictedUsageForToday();
            _lastForecastRun = new Date().toISOString();
            await this.recordBreadcrumb('ai_forecast', _lastForecastRun);

            const duration = Date.now() - jobStart;

            // v13.x: Track latency
            if (this.realtimeBus && typeof this.realtimeBus.trackForecastLatency === 'function') {
              this.realtimeBus.trackForecastLatency(duration);
            }

            // v13.x: Persist breadcrumb with duration
            await this.db.run(`
              INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `, ['ai_forecast', _lastForecastRun, 'forecast_completed', duration, JSON.stringify({ manual_trigger: true, itemCount: forecast.items?.length || 0 }), _lastForecastRun]);

            if (this.realtimeBus) {
              this.realtimeBus.emit('ai_event', { type: 'forecast_completed', at: _lastForecastRun, ms: duration, itemCount: forecast.items?.length || 0 });
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
            // v14.4: Instantiate FeedbackTrainer with database
            const trainer = new FeedbackTrainer(this.db);
            const result = await trainer.applyAllPendingComments();
            _lastLearningRun = new Date().toISOString();
            await this.recordBreadcrumb('ai_learning', _lastLearningRun);

            const duration = Date.now() - jobStart;

            // v13.x: Track latency
            if (this.realtimeBus && typeof this.realtimeBus.trackLearningLatency === 'function') {
              this.realtimeBus.trackLearningLatency(duration);
            }

            // v13.x: Persist breadcrumb with duration
            await this.db.run(`
              INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `, ['ai_learning', _lastLearningRun, 'learning_completed', duration, JSON.stringify({ manual_trigger: true, processed: result.total || 0, applied: result.applied || 0 }), _lastLearningRun]);

            if (this.realtimeBus) {
              this.realtimeBus.emit('ai_event', { type: 'learning_completed', at: _lastLearningRun, ms: duration, processed: result.total || 0, applied: result.applied || 0 });
            }
          } finally {
            _learningRunning = false;
          }
          break;

        case 'ai_order_forecast':
          if (_orderForecastRunning) {
            return { success: false, error: 'Order forecasting already running' };
          }
          _orderForecastRunning = true;
          try {
            // v15.5.0: Instantiate ForecastingEngine with database
            const forecastEngine = new ForecastingEngine(this.db);
            const forecastResult = await forecastEngine.generateForecast({ horizonDays: 7 });
            const accuracy = await forecastEngine.calculateAccuracy();
            const learningResult = await forecastEngine.applyPendingFeedback();

            // Record forecast metrics (v15.5.0)
            if (this.metricsExporter?.recordForecastRun) {
              this.metricsExporter.recordForecastRun(forecastResult.items_forecasted);
            }
            if (this.metricsExporter?.setForecastAccuracy && accuracy.accuracy_pct !== null) {
              this.metricsExporter.setForecastAccuracy(accuracy.accuracy_pct);
            }
            if (this.metricsExporter?.recordForecastLearningApplied && learningResult.applied_count > 0) {
              this.metricsExporter.recordForecastLearningApplied();
            }

            _lastOrderForecastRun = new Date().toISOString();
            await this.recordBreadcrumb('ai_order_forecast', _lastOrderForecastRun);

            const duration = Date.now() - jobStart;

            // Persist breadcrumb with duration
            await this.db.run(`
              INSERT OR REPLACE INTO ai_ops_breadcrumbs (job, ran_at, action, duration_ms, metadata, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              'ai_order_forecast',
              _lastOrderForecastRun,
              'order_forecast_completed',
              duration,
              JSON.stringify({
                manual_trigger: true,
                run_id: forecastResult.run_id,
                items_forecasted: forecastResult.items_forecasted,
                avg_confidence: forecastResult.avg_confidence,
                forecast_accuracy: accuracy.accuracy_pct || null
              }),
              _lastOrderForecastRun
            ]);

            if (this.realtimeBus) {
              this.realtimeBus.emit('ai_event', {
                type: 'order_forecast_completed',
                at: _lastOrderForecastRun,
                ms: duration,
                items_forecasted: forecastResult.items_forecasted,
                avg_confidence: forecastResult.avg_confidence
              });
            }
          } finally {
            _orderForecastRunning = false;
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
