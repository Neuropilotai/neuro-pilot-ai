/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHEDULED HEALTH CHECK SERVICE - v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automated health monitoring with intelligent retrain governance.
 * Runs periodic health audits and triggers retraining when appropriate.
 *
 * FEATURES:
 * ✅ Scheduled health audits (configurable interval)
 * ✅ Intelligent retrain governance (throttled)
 * ✅ Health score tracking over time
 * ✅ Alert notifications for critical issues
 * ✅ Graceful shutdown handling
 *
 * USAGE:
 *   const healthService = require('./health/scheduled-health-check');
 *   healthService.start();
 *   // Later: healthService.stop();
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const cron = require('node-cron');
const { runHealthAudit } = require('./health-audit.js');

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Cron schedule (default: every 6 hours)
  SCHEDULE: process.env.HEALTH_CHECK_SCHEDULE || '0 */6 * * *',

  // Health score thresholds for alerts
  ALERT_THRESHOLD_CRITICAL: 60,
  ALERT_THRESHOLD_WARNING: 75,

  // Retrain configuration
  ENABLE_AUTO_RETRAIN: process.env.ENABLE_AUTO_RETRAIN !== 'false',
  RETRAIN_COOLDOWN_HOURS: 24, // Minimum hours between retrains

  // Logging
  VERBOSE: process.env.HEALTH_CHECK_VERBOSE === 'true'
};

// ═════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════

let cronTask = null;
let isRunning = false;
let lastRunTimestamp = null;
let lastHealthScore = null;
let lastRetrainTimestamp = null;
let auditHistory = [];

// ═════════════════════════════════════════════════════════════════════════
// RETRAIN INTEGRATION (STUB)
// ═════════════════════════════════════════════════════════════════════════

/**
 * Trigger forecast model retraining
 * (Replace with actual retrain logic)
 */
async function retrainForecastModel(options = {}) {
  console.log('[Health Service] 🧠 Retrain triggered:', options.reason);

  // TODO: Integrate with your actual ML retrain service
  // Example:
  // const { ForecastingEngine } = require('../src/ai/forecast/ForecastingEngine');
  // await ForecastingEngine.retrain();

  lastRetrainTimestamp = new Date();

  return {
    success: true,
    reason: options.reason,
    timestamp: lastRetrainTimestamp.toISOString()
  };
}

/**
 * Check if enough time has passed since last retrain
 */
function canRetrain() {
  if (!lastRetrainTimestamp) return true;

  const hoursSince = (Date.now() - lastRetrainTimestamp.getTime()) / (1000 * 60 * 60);
  return hoursSince >= CONFIG.RETRAIN_COOLDOWN_HOURS;
}

// ═════════════════════════════════════════════════════════════════════════
// ALERT HANDLING
// ═════════════════════════════════════════════════════════════════════════

/**
 * Send alert notification
 * (Replace with actual alerting service: Slack, email, PagerDuty, etc.)
 */
async function sendAlert(level, message, data = {}) {
  console.log(`[Health Service] 🚨 ALERT [${level}]: ${message}`, data);

  // TODO: Integrate with your alerting service
  // Example:
  // if (level === 'critical') {
  //   await sendSlackAlert(message, data);
  //   await sendEmailAlert(message, data);
  // }
}

/**
 * Check health score and send alerts if needed
 */
async function checkHealthAlerts(report) {
  const { health_score, status, stockout_risk_count } = report.summary;

  // Critical health score
  if (health_score < CONFIG.ALERT_THRESHOLD_CRITICAL) {
    await sendAlert('critical', `System health critical: ${health_score}%`, {
      status,
      issues: report.issues.length,
      stockouts: stockout_risk_count
    });
  }
  // Warning health score
  else if (health_score < CONFIG.ALERT_THRESHOLD_WARNING) {
    await sendAlert('warning', `System health warning: ${health_score}%`, {
      status,
      issues: report.issues.length,
      stockouts: stockout_risk_count
    });
  }

  // High stockout risk
  if (stockout_risk_count > 10) {
    await sendAlert('warning', `High stockout risk: ${stockout_risk_count} items`, {
      top_risks: report.stockoutRisks.slice(0, 5)
    });
  }

  // Significant health score drop
  if (lastHealthScore !== null && (lastHealthScore - health_score) > 15) {
    await sendAlert('warning', `Health score dropped significantly: ${lastHealthScore}% → ${health_score}%`, {
      previous: lastHealthScore,
      current: health_score,
      drop: lastHealthScore - health_score
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════
// HEALTH CHECK EXECUTION
// ═════════════════════════════════════════════════════════════════════════

/**
 * Execute health check
 */
async function executeHealthCheck() {
  if (isRunning) {
    console.log('[Health Service] ⏭️  Skipping health check (already running)');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[Health Service] 🏥 Running scheduled health audit...');

    // Run health audit
    const report = await runHealthAudit();
    const duration = Date.now() - startTime;

    // Log results
    console.log(`[Health Service] ✅ Health audit complete in ${duration}ms`);
    console.log(`[Health Service] 📊 Score: ${report.summary.health_score}% (${report.summary.status})`);
    console.log(`[Health Service] 🔧 Fixed: ${report.summary.fixed_mutations} mutations`);
    console.log(`[Health Service] ⚠️  Issues: ${report.issues.length}`);
    console.log(`[Health Service] 📦 Stockout Risks: ${report.summary.stockout_risk_count}`);

    if (CONFIG.VERBOSE && report.issues.length > 0) {
      console.log('[Health Service] Issues breakdown:');
      const issueTypes = {};
      for (const issue of report.issues) {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      }
      for (const [type, count] of Object.entries(issueTypes)) {
        console.log(`  - ${type}: ${count}`);
      }
    }

    // Check for alerts
    await checkHealthAlerts(report);

    // Handle retraining
    if (report.summary.should_retrain && CONFIG.ENABLE_AUTO_RETRAIN && canRetrain()) {
      console.log(`[Health Service] 🧠 Initiating retrain (${report.summary.should_retrain} new invoices)`);

      try {
        await retrainForecastModel({
          reason: 'enough_new_invoices',
          new_invoice_count: report.summary.should_retrain
        });

        console.log('[Health Service] ✅ Retrain completed successfully');
      } catch (retrainError) {
        console.error('[Health Service] ❌ Retrain failed:', retrainError.message);
        await sendAlert('error', 'Forecast retrain failed', {
          error: retrainError.message
        });
      }
    } else if (report.summary.should_retrain && !canRetrain()) {
      console.log('[Health Service] ⏸️  Retrain needed but in cooldown period');
    }

    // Update state
    lastRunTimestamp = new Date();
    lastHealthScore = report.summary.health_score;

    // Store audit history (keep last 100)
    auditHistory.unshift({
      timestamp: lastRunTimestamp.toISOString(),
      score: report.summary.health_score,
      status: report.summary.status,
      issues: report.issues.length,
      stockouts: report.summary.stockout_risk_count,
      duration_ms: duration
    });

    if (auditHistory.length > 100) {
      auditHistory = auditHistory.slice(0, 100);
    }

  } catch (error) {
    console.error('[Health Service] ❌ Health check failed:', error);
    await sendAlert('error', 'Health check failed', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    isRunning = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SERVICE CONTROL
// ═════════════════════════════════════════════════════════════════════════

/**
 * Start scheduled health checks
 */
function start() {
  if (cronTask) {
    console.log('[Health Service] ⚠️  Health service already running');
    return;
  }

  console.log('[Health Service] 🚀 Starting health service');
  console.log(`[Health Service] 📅 Schedule: ${CONFIG.SCHEDULE}`);
  console.log(`[Health Service] 🔄 Auto-retrain: ${CONFIG.ENABLE_AUTO_RETRAIN ? 'enabled' : 'disabled'}`);

  // Schedule cron job
  cronTask = cron.schedule(CONFIG.SCHEDULE, async () => {
    await executeHealthCheck();
  });

  // Run initial check
  setImmediate(() => {
    executeHealthCheck();
  });

  console.log('[Health Service] ✅ Health service started');
}

/**
 * Stop scheduled health checks
 */
function stop() {
  if (!cronTask) {
    console.log('[Health Service] ⚠️  Health service not running');
    return;
  }

  console.log('[Health Service] 🛑 Stopping health service...');

  cronTask.stop();
  cronTask = null;

  console.log('[Health Service] ✅ Health service stopped');
}

/**
 * Get service status
 */
function getStatus() {
  return {
    running: cronTask !== null,
    isExecuting: isRunning,
    lastRun: lastRunTimestamp ? lastRunTimestamp.toISOString() : null,
    lastScore: lastHealthScore,
    lastRetrain: lastRetrainTimestamp ? lastRetrainTimestamp.toISOString() : null,
    schedule: CONFIG.SCHEDULE,
    autoRetrainEnabled: CONFIG.ENABLE_AUTO_RETRAIN,
    auditHistoryCount: auditHistory.length
  };
}

/**
 * Get audit history
 */
function getHistory() {
  return auditHistory;
}

/**
 * Manually trigger health check
 */
async function triggerManual() {
  console.log('[Health Service] 👆 Manual health check triggered');
  await executeHealthCheck();
}

// ═════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═════════════════════════════════════════════════════════════════════════

process.on('SIGTERM', () => {
  console.log('[Health Service] 📡 SIGTERM received, shutting down gracefully...');
  stop();
});

process.on('SIGINT', () => {
  console.log('[Health Service] 📡 SIGINT received, shutting down gracefully...');
  stop();
});

// ═════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  start,
  stop,
  getStatus,
  getHistory,
  triggerManual,
  executeHealthCheck,
  CONFIG
};
