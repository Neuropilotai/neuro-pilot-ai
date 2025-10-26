/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH API ROUTES - v2.0.0 (Production Hardened)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enhanced health monitoring API with:
 * - Dry-run mode support
 * - Auto-fix capabilities (OWNER only)
 * - Prometheus metrics
 * - Audit logging
 * - Report persistence
 * - RBAC enforcement
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { runHealthAudit } = require('../health/health-audit-simple');
const { applyAutoFixes } = require('../health/health-autofix');
const {updateMetricsFromReport } = require('../health/health-metrics');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════

const REPORTS_DIR = path.join(__dirname, '../reports/health');
const MAX_REPORTS_STORED = 100;

// Ensure reports directory exists
fs.mkdir(REPORTS_DIR, { recursive: true }).catch(console.error);

// ═════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE (for last report)
// ═════════════════════════════════════════════════════════════════════════

let lastReport = null;
let lastReportTimestamp = null;

// ═════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═════════════════════════════════════════════════════════════════════════

/**
 * RBAC: Require OWNER or FINANCE role for read operations
 */
function requireHealthRead(req, res, next) {
  const userRole = req.user?.role || 'unknown';

  if (userRole === 'OWNER' || userRole === 'FINANCE' || userRole === 'ADMIN') {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: OWNER or FINANCE role required',
    requiredRoles: ['OWNER', 'FINANCE']
  });
}

/**
 * RBAC: Require OWNER role for write operations (auto-fixes)
 */
function requireHealthWrite(req, res, next) {
  const userRole = req.user?.role || 'unknown';

  if (userRole === 'OWNER') {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: OWNER role required for mutations',
    requiredRoles: ['OWNER']
  });
}

/**
 * Error handler
 */
function healthErrorHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error('[Health API Error]', error);

      // Log structured error
      logHealthEvent('error', {
        endpoint: req.path,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════
// LOGGING
// ═════════════════════════════════════════════════════════════════════════

/**
 * Log health event (structured JSON)
 */
function logHealthEvent(type, data) {
  const logEntry = {
    svc: 'health',
    type,
    ts: new Date().toISOString(),
    ...data
  };

  console.log(JSON.stringify(logEntry));
}

// ═════════════════════════════════════════════════════════════════════════
// REPORT PERSISTENCE
// ═════════════════════════════════════════════════════════════════════════

/**
 * Save health report to disk
 */
async function saveHealthReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `HEALTH_REPORT_${timestamp}.json`;
  const filepath = path.join(REPORTS_DIR, filename);

  await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf8');

  // Cleanup old reports (keep last MAX_REPORTS_STORED)
  try {
    const files = await fs.readdir(REPORTS_DIR);
    const healthReports = files
      .filter(f => f.startsWith('HEALTH_REPORT_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (healthReports.length > MAX_REPORTS_STORED) {
      const toDelete = healthReports.slice(MAX_REPORTS_STORED);
      for (const file of toDelete) {
        await fs.unlink(path.join(REPORTS_DIR, file));
      }
    }
  } catch (err) {
    console.error('[Health] Error cleaning old reports:', err);
  }

  return filepath;
}

/**
 * Load last health report from disk
 */
async function loadLastHealthReport() {
  try {
    const files = await fs.readdir(REPORTS_DIR);
    const healthReports = files
      .filter(f => f.startsWith('HEALTH_REPORT_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (healthReports.length > 0) {
      const filepath = path.join(REPORTS_DIR, healthReports[0]);
      const content = await fs.readFile(filepath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Health] Error loading last report:', err);
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════

/**
 * GET /api/health/status
 * Simple status check (no auth required)
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'health-api',
      status: 'operational',
      version: '2.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/health/summary
 * Full health audit report (read-only)
 */
router.get('/summary', authenticateToken, requireHealthRead, healthErrorHandler(async (req, res) => {
  logHealthEvent('audit_request', { user: req.user?.email, endpoint: 'summary' });

  const startTime = Date.now();
  const report = await runHealthAudit();
  const duration = Date.now() - startTime;

  // Update metrics
  updateMetricsFromReport(report, 'read-only', duration);

  // Cache report
  lastReport = report;
  lastReportTimestamp = new Date().toISOString();

  // Save to disk
  await saveHealthReport(report);

  logHealthEvent('audit_complete', {
    score: report.summary.health_score,
    status: report.summary.status,
    issues: report.issues.length,
    duration_ms: duration
  });

  res.json({
    success: true,
    data: report,
    meta: {
      duration_ms: duration,
      timestamp: lastReportTimestamp
    }
  });
}));

/**
 * POST /api/health/audit/run
 * Run health audit with optional auto-fixes
 */
router.post('/audit/run', authenticateToken, requireHealthWrite, healthErrorHandler(async (req, res) => {
  const { mode = 'dry-run', period } = req.body;

  // Validate mode
  if (!['dry-run', 'apply'].includes(mode)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid mode. Must be "dry-run" or "apply"'
    });
  }

  logHealthEvent('audit_triggered', {
    user: req.user?.email,
    mode,
    period: period || 'all'
  });

  const startTime = Date.now();

  // Run audit
  const report = await runHealthAudit();

  // Apply auto-fixes if mode=apply
  let autofixes = [];
  if (mode === 'apply') {
    const db = require('../config/database');

    // Build context for auto-fix
    const context = {
      lastInvoiceCosts: {} // TODO: extract from report
    };

    autofixes = await applyAutoFixes(db, report.issues, context, false);

    // Log each auto-fix
    for (const fix of autofixes) {
      if (fix.success) {
        logHealthEvent('autofix_applied', {
          type: fix.type,
          before: fix.before,
          after: fix.after
        });
      } else if (fix.error) {
        logHealthEvent('autofix_failed', {
          type: fix.type,
          error: fix.error
        });
      }
    }
  } else {
    // Dry-run: generate recommendations only
    const db = require('../config/database');
    autofixes = await applyAutoFixes(db, report.issues, {}, true);
  }

  // Add autofixes to report
  report.autofixes = autofixes;
  report.mode = mode;

  const duration = Date.now() - startTime;

  // Update metrics
  updateMetricsFromReport(report, mode, duration);

  // Cache and save
  lastReport = report;
  lastReportTimestamp = new Date().toISOString();
  await saveHealthReport(report);

  logHealthEvent('audit_run_complete', {
    mode,
    score: report.summary.health_score,
    issues: report.issues.length,
    autofixes: autofixes.filter(f => f.success).length,
    duration_ms: duration
  });

  res.json({
    success: true,
    data: report,
    meta: {
      mode,
      duration_ms: duration,
      timestamp: lastReportTimestamp,
      autofixes_applied: autofixes.filter(f => f.success && !f.dryRun).length,
      autofixes_recommended: autofixes.filter(f => f.recommendation).length
    }
  });
}));

/**
 * GET /api/health/last-report
 * Retrieve last health report (from cache or disk)
 */
router.get('/last-report', authenticateToken, requireHealthRead, healthErrorHandler(async (req, res) => {
  // Try cache first
  if (lastReport) {
    return res.json({
      success: true,
      data: lastReport,
      meta: {
        source: 'cache',
        timestamp: lastReportTimestamp
      }
    });
  }

  // Load from disk
  const report = await loadLastHealthReport();

  if (report) {
    return res.json({
      success: true,
      data: report,
      meta: {
        source: 'disk',
        timestamp: report.summary?.audit_date
      }
    });
  }

  // No report found
  res.status(404).json({
    success: false,
    error: 'No health report found. Run an audit first.'
  });
}));

/**
 * GET /api/health/score
 * Quick health score only (lightweight)
 */
router.get('/score', authenticateToken, requireHealthRead, healthErrorHandler(async (req, res) => {
  // Return cached score if recent (< 5 minutes old)
  if (lastReport && lastReportTimestamp) {
    const age = Date.now() - new Date(lastReportTimestamp).getTime();
    if (age < 5 * 60 * 1000) {
      return res.json({
        success: true,
        data: {
          health_score: lastReport.summary.health_score,
          status: lastReport.summary.status,
          audit_date: lastReport.summary.audit_date
        },
        meta: {
          cached: true,
          age_seconds: Math.round(age / 1000)
        }
      });
    }
  }

  // Run fresh audit
  const report = await runHealthAudit();

  res.json({
    success: true,
    data: {
      health_score: report.summary.health_score,
      status: report.summary.status,
      audit_date: report.summary.audit_date
    },
    meta: {
      cached: false
    }
  });
}));

/**
 * GET /api/health/stockouts
 * Stockout risks only
 */
router.get('/stockouts', authenticateToken, requireHealthRead, healthErrorHandler(async (req, res) => {
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
 * Issues list only
 */
router.get('/issues', authenticateToken, requireHealthRead, healthErrorHandler(async (req, res) => {
  const report = await runHealthAudit();

  // Group by type
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
 * Alias for audit/run (backward compatibility)
 */
router.post('/audit', authenticateToken, requireHealthWrite, healthErrorHandler(async (req, res) => {
  req.url = '/audit/run';
  req.body.mode = req.body.mode || 'dry-run';
  return router.handle(req, res);
}));

// ═════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════

module.exports = router;
