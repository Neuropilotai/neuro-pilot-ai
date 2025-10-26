/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH SYSTEM PROMETHEUS METRICS - v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prometheus metrics for health audit system monitoring.
 */

const { register, Counter, Gauge, Histogram } = require('prom-client');

// ═════════════════════════════════════════════════════════════════════════
// METRICS DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Total number of health audit runs
 */
const healthAuditRunsTotal = new Counter({
  name: 'health_audit_runs_total',
  help: 'Total number of health audit runs',
  labelNames: ['mode', 'status'],
  registers: [register]
});

/**
 * Current health score (0-100)
 */
const healthScoreCurrent = new Gauge({
  name: 'health_score_current',
  help: 'Current system health score (0-100)',
  registers: [register]
});

/**
 * Health penalties by type
 */
const healthPenaltiesTotal = new Counter({
  name: 'health_penalties_total',
  help: 'Total health score penalties by issue type',
  labelNames: ['type'],
  registers: [register]
});

/**
 * Auto-fixes applied by type
 */
const healthAutofixTotal = new Counter({
  name: 'health_autofix_total',
  help: 'Total auto-fixes applied by type',
  labelNames: ['type', 'success'],
  registers: [register]
});

/**
 * Issue count by type
 */
const healthIssueCount = new Gauge({
  name: 'health_issue_count',
  help: 'Current number of issues by type',
  labelNames: ['type'],
  registers: [register]
});

/**
 * Stockout risk count
 */
const healthStockoutRiskCount = new Gauge({
  name: 'health_stockout_risk_count',
  help: 'Number of items at stockout risk',
  registers: [register]
});

/**
 * Audit duration histogram
 */
const healthAuditDuration = new Histogram({
  name: 'health_audit_duration_seconds',
  help: 'Health audit duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// ═════════════════════════════════════════════════════════════════════════
// METRIC UPDATERS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Record health audit run
 */
function recordAuditRun(mode, status) {
  healthAuditRunsTotal.labels(mode, status).inc();
}

/**
 * Update health score
 */
function updateHealthScore(score) {
  healthScoreCurrent.set(score);
}

/**
 * Record penalty
 */
function recordPenalty(type, points) {
  healthPenaltiesTotal.labels(type).inc(points);
}

/**
 * Record auto-fix
 */
function recordAutofix(type, success) {
  healthAutofixTotal.labels(type, success ? 'true' : 'false').inc();
}

/**
 * Update issue counts
 */
function updateIssueCounts(issuesByType) {
  // Reset all gauges first
  healthIssueCount.reset();

  // Set new values
  for (const [type, count] of Object.entries(issuesByType)) {
    healthIssueCount.labels(type).set(count);
  }
}

/**
 * Update stockout risk count
 */
function updateStockoutRiskCount(count) {
  healthStockoutRiskCount.set(count);
}

/**
 * Record audit duration
 */
function recordAuditDuration(durationSeconds) {
  healthAuditDuration.observe(durationSeconds);
}

/**
 * Update all metrics from health report
 */
function updateMetricsFromReport(report, mode, durationMs) {
  // Record run
  const status = report.summary.health_score >= 75 ? 'success' : 'warning';
  recordAuditRun(mode, status);

  // Update score
  updateHealthScore(report.summary.health_score);

  // Update issue counts
  const issuesByType = {};
  for (const issue of report.issues || []) {
    issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
  }
  updateIssueCounts(issuesByType);

  // Update stockout risks
  updateStockoutRiskCount(report.summary.stockout_risk_count || 0);

  // Record duration
  recordAuditDuration(durationMs / 1000);

  // Record auto-fixes if present
  if (report.autofixes) {
    for (const fix of report.autofixes) {
      recordAutofix(fix.type, fix.success);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  // Metrics
  healthAuditRunsTotal,
  healthScoreCurrent,
  healthPenaltiesTotal,
  healthAutofixTotal,
  healthIssueCount,
  healthStockoutRiskCount,
  healthAuditDuration,

  // Updaters
  recordAuditRun,
  updateHealthScore,
  recordPenalty,
  recordAutofix,
  updateIssueCounts,
  updateStockoutRiskCount,
  recordAuditDuration,
  updateMetricsFromReport
};
