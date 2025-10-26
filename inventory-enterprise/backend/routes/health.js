/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH API ROUTES - v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RESTful API endpoints for system health monitoring and diagnostics.
 *
 * ENDPOINTS:
 * - GET  /api/health/summary     - Full health audit report
 * - GET  /api/health/score       - Quick health score only
 * - GET  /api/health/stockouts   - Stockout risks only
 * - GET  /api/health/issues      - Issues list only
 * - POST /api/health/audit       - Trigger manual audit
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const { runHealthAudit } = require('../health/health-audit.js');

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═════════════════════════════════════════════════════════════════════════

/**
 * Error handler for health routes
 */
function healthErrorHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('[Health API Error]', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════

/**
 * GET /api/health/summary
 * Returns complete health audit report
 */
router.get('/summary', healthErrorHandler(async (req, res) => {
  console.log('[Health API] Running full health audit...');

  const startTime = Date.now();
  const report = await runHealthAudit();
  const duration = Date.now() - startTime;

  console.log(`[Health API] Audit complete in ${duration}ms - Score: ${report.summary.health_score}%, Status: ${report.summary.status}`);

  res.json({
    success: true,
    data: report,
    meta: {
      duration_ms: duration,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/health/score
 * Returns quick health score only (lightweight)
 */
router.get('/score', healthErrorHandler(async (req, res) => {
  const report = await runHealthAudit();

  res.json({
    success: true,
    data: {
      health_score: report.summary.health_score,
      status: report.summary.status,
      audit_date: report.summary.audit_date
    }
  });
}));

/**
 * GET /api/health/stockouts
 * Returns stockout risks only
 */
router.get('/stockouts', healthErrorHandler(async (req, res) => {
  const report = await runHealthAudit();

  res.json({
    success: true,
    data: {
      count: report.summary.stockout_risk_count,
      risks: report.stockoutRisks
    }
  });
}));

/**
 * GET /api/health/issues
 * Returns issues list only
 */
router.get('/issues', healthErrorHandler(async (req, res) => {
  const report = await runHealthAudit();

  // Group issues by type
  const groupedIssues = {};
  for (const issue of report.issues) {
    if (!groupedIssues[issue.type]) {
      groupedIssues[issue.type] = [];
    }
    groupedIssues[issue.type].push(issue);
  }

  res.json({
    success: true,
    data: {
      total_count: report.issues.length,
      by_type: groupedIssues,
      issues: report.issues
    }
  });
}));

/**
 * POST /api/health/audit
 * Trigger manual audit (same as GET /summary but POST for semantic clarity)
 */
router.post('/audit', healthErrorHandler(async (req, res) => {
  console.log('[Health API] Manual audit triggered');

  const startTime = Date.now();
  const report = await runHealthAudit();
  const duration = Date.now() - startTime;

  console.log(`[Health API] Manual audit complete - Score: ${report.summary.health_score}%`);

  res.json({
    success: true,
    data: report,
    meta: {
      duration_ms: duration,
      triggered_by: 'manual',
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/health/status
 * Simple status check (lightweight, no full audit)
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'health-api',
      status: 'operational',
      timestamp: new Date().toISOString()
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════

module.exports = router;
