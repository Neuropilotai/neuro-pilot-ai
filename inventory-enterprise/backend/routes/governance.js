/**
 * Quantum Governance API Routes (v15.8.0)
 *
 * Unified governance status and scoring across Finance, Health, AI, Menu pillars
 *
 * Endpoints:
 * - GET  /api/governance/status        → Current governance status (OWNER/FINANCE/OPS)
 * - GET  /api/governance/report/latest → Latest snapshot with full details (OWNER/FINANCE)
 * - POST /api/governance/recompute     → Force recomputation (OWNER only)
 *
 * RBAC Enforcement:
 * - All endpoints require authentication (authenticateToken)
 * - Role-based access via requireRole middleware
 * - Device binding enforced where configured (requireOwnerDevice)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireRole, ROLES } = require('../security/rbac');
const GovernanceService = require('../src/governance/GovernanceService');
const db = require('../config/database');
const { pool } = require('../db'); // v22.1: PostgreSQL pool for trends queries
const metricsExporter = require('../utils/metricsExporter');
const { logger } = require('../config/logger');

// Initialize Governance Service
const governanceService = new GovernanceService(db, {
  metrics: metricsExporter
});

// ============================================================================
// GET /api/governance/status
// ============================================================================
/**
 * Get current governance status
 *
 * Returns latest snapshot if available, otherwise computes new one
 *
 * RBAC: OWNER | FINANCE | OPS
 *
 * Response:
 * {
 *   "success": true,
 *   "as_of": "2025-10-18T12:34:56Z",
 *   "pillars": {
 *     "finance_accuracy": 98.7,
 *     "health_score": 95.0,
 *     "ai_intelligence_index": 82.0,
 *     "menu_forecast_accuracy": 91.0
 *   },
 *   "governance_score": 91.7,
 *   "status": "Healthy",
 *   "color": "green",
 *   "alerts": [...]
 * }
 */
router.get(
  '/status',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.FINANCE, ROLES.OPS]),
  async (req, res) => {
    try {
      // Try to get latest snapshot (fast path)
      const latest = await governanceService.getLatest();

      if (latest) {
        // Use cached snapshot if < 5 minutes old
        const age = Date.now() - new Date(latest.created_at).getTime();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (age < maxAge) {
          // Get active alerts
          const alerts = await governanceService.getActiveAlerts();

          return res.json({
            success: true,
            as_of: latest.created_at,
            pillars: {
              finance_accuracy: latest.finance_accuracy,
              health_score: latest.health_score,
              ai_intelligence_index: latest.ai_intelligence_index,
              menu_forecast_accuracy: latest.menu_forecast_accuracy
            },
            governance_score: latest.governance_score,
            status: latest.status,
            color: latest.color,
            alerts: alerts.map(a => ({
              type: a.type,
              severity: a.severity,
              message: a.message,
              since: a.created_at
            })),
            links: {
              report: '/api/governance/report/latest'
            },
            cached: true,
            cache_age_seconds: Math.floor(age / 1000)
          });
        }
      }

      // No cached snapshot or too old → recompute
      const status = await governanceService.computeStatus();

      res.json({
        success: true,
        ...status,
        links: {
          report: '/api/governance/report/latest'
        },
        cached: false
      });

    } catch (error) {
      logger.error('[Governance API] Error fetching status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch governance status',
        message: error.message
      });
    }
  }
);

// ============================================================================
// GET /api/governance/report/latest
// ============================================================================
/**
 * Get latest governance report with full details
 *
 * RBAC: OWNER | FINANCE
 *
 * Response:
 * {
 *   "success": true,
 *   "snapshot": {...},
 *   "alerts": [...],
 *   "markdown_summary": "..."
 * }
 */
router.get(
  '/report/latest',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.FINANCE]),
  async (req, res) => {
    try {
      const latest = await governanceService.getLatest();

      if (!latest) {
        return res.status(404).json({
          success: false,
          error: 'No governance snapshot found',
          message: 'Trigger a recompute to generate initial snapshot'
        });
      }

      const alerts = await governanceService.getActiveAlerts();

      // Parse payload JSON
      let payload = {};
      try {
        payload = JSON.parse(latest.payload_json || '{}');
      } catch (e) {
        logger.warn('[Governance] Invalid payload JSON in snapshot');
      }

      // Generate markdown summary
      const markdown = generateMarkdownSummary(latest, alerts);

      res.json({
        success: true,
        snapshot: {
          id: latest.id,
          created_at: latest.created_at,
          pillars: {
            finance_accuracy: latest.finance_accuracy,
            health_score: latest.health_score,
            ai_intelligence_index: latest.ai_intelligence_index,
            menu_forecast_accuracy: latest.menu_forecast_accuracy
          },
          governance_score: latest.governance_score,
          status: latest.status,
          color: latest.color,
          payload: payload
        },
        alerts: alerts,
        markdown_summary: markdown
      });

    } catch (error) {
      logger.error('[Governance API] Error fetching report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch governance report',
        message: error.message
      });
    }
  }
);

// ============================================================================
// POST /api/governance/recompute
// ============================================================================
/**
 * Force governance score recomputation
 *
 * RBAC: OWNER only
 *
 * Response:
 * {
 *   "success": true,
 *   "as_of": "...",
 *   "pillars": {...},
 *   "governance_score": 91.7,
 *   "status": "Healthy",
 *   "alerts": [...]
 * }
 */
router.post(
  '/recompute',
  authenticateToken,
  requireRole([ROLES.OWNER]),
  async (req, res) => {
    try {
      logger.info(`[Governance] Manual recompute triggered by ${req.user.email}`);

      // Compute fresh status
      const status = await governanceService.computeStatus();

      // Audit log
      try {
        await db.run(
          `INSERT INTO audit_logs (event_type, action, user_email, metadata, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            'GOVERNANCE_RECOMPUTE',
            'POST',
            req.user.email,
            JSON.stringify({
              governance_score: status.governance_score,
              status: status.status,
              snapshot_id: status.snapshot_id
            }),
            new Date().toISOString()
          ]
        );
      } catch (auditError) {
        logger.warn('[Governance] Audit log failed (non-fatal):', auditError);
      }

      res.json({
        success: true,
        message: 'Governance score recomputed successfully',
        ...status
      });

    } catch (error) {
      logger.error('[Governance API] Error recomputing:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to recompute governance score',
        message: error.message
      });
    }
  }
);

// ============================================================================
// GET /api/governance/trends
// ============================================================================
/**
 * Get governance trends for sparkline charts
 *
 * Query params:
 * - days: Number of days (default 30, max 90)
 * - pillars: Comma-separated pillar names (default all)
 *
 * RBAC: OWNER | FINANCE | OPS
 *
 * Response:
 * {
 *   "success": true,
 *   "days": 30,
 *   "trends": {
 *     "composite": [{ "date": "2025-01-15", "score": 91.2 }, ...],
 *     "finance": [...],
 *     "health": [...],
 *     "ai": [...],
 *     "menu": [...]
 *   },
 *   "summary": {
 *     "composite": { "current": 91.2, "avg": 89.5, "min": 85.0, "max": 94.0, "trend": "up" }
 *   }
 * }
 */
router.get(
  '/trends',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.FINANCE, ROLES.OPS]),
  async (req, res) => {
    try {
      // v22.1: Debug - verify pool is available
      if (!pool) {
        logger.error('[Governance API] PostgreSQL pool not available');
        return res.status(500).json({
          success: false,
          error: 'Database pool not initialized'
        });
      }

      const days = Math.min(parseInt(req.query.days) || 30, 90);

      // v22.1: Support both 'pillar' and 'pillars' query params, and 'all' value
      const pillarParam = req.query.pillars || req.query.pillar || 'all';
      const validPillars = ['composite', 'finance', 'health', 'ai', 'menu'];

      let requestedPillars;
      if (pillarParam.toLowerCase() === 'all') {
        requestedPillars = validPillars;
      } else {
        requestedPillars = pillarParam.split(',').map(p => p.trim().toLowerCase());
      }

      // Validate pillar names
      const pillars = requestedPillars.filter(p => validPillars.includes(p));

      if (pillars.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid pillars',
          message: `Valid pillars: ${validPillars.join(', ')} or 'all'`
        });
      }

      // Query governance_daily for each pillar (using PostgreSQL pool)
      const trends = {};
      const summary = {};

      for (const pillar of pillars) {
        let rows = [];
        try {
          const result = await pool.query(`
            SELECT as_of as date, score
            FROM governance_daily
            WHERE pillar = $1
              AND as_of >= CURRENT_DATE - INTERVAL '${days} days'
            ORDER BY as_of ASC
          `, [pillar]);
          rows = result.rows;
        } catch (dbErr) {
          // Table might not exist yet - return empty data
          logger.warn(`[Governance API] governance_daily query failed for ${pillar}:`, dbErr.message);
          rows = [];
        }

        trends[pillar] = rows.map(r => ({
          date: r.date,
          score: Math.round(r.score * 10) / 10
        }));

        // Calculate summary stats
        if (rows.length > 0) {
          const scores = rows.map(r => r.score);
          const current = scores[scores.length - 1];
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const min = Math.min(...scores);
          const max = Math.max(...scores);

          // Determine trend (compare last 7 days avg to previous 7 days)
          let trend = 'stable';
          if (rows.length >= 14) {
            const recent = scores.slice(-7);
            const previous = scores.slice(-14, -7);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
            const delta = recentAvg - previousAvg;

            if (delta > 2) trend = 'up';
            else if (delta < -2) trend = 'down';
          }

          summary[pillar] = {
            current: Math.round(current * 10) / 10,
            avg: Math.round(avg * 10) / 10,
            min: Math.round(min * 10) / 10,
            max: Math.round(max * 10) / 10,
            trend,
            dataPoints: rows.length
          };
        } else {
          summary[pillar] = {
            current: null,
            avg: null,
            min: null,
            max: null,
            trend: 'no_data',
            dataPoints: 0
          };
        }
      }

      res.json({
        success: true,
        days,
        pillars,
        trends,
        summary,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[Governance API] Error fetching trends:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch governance trends',
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate markdown summary of governance report
 */
function generateMarkdownSummary(snapshot, alerts) {
  const activeAlerts = alerts.filter(a => !a.resolved_at);

  return `# NeuroPilot Governance Report

**Generated:** ${snapshot.created_at}
**Governance Score:** ${snapshot.governance_score} / 100
**Status:** ${snapshot.status} (${snapshot.color})

---

## Pillar Scores

| Pillar                   | Score   | Weight |
|--------------------------|---------|--------|
| 💰 Finance Accuracy      | ${snapshot.finance_accuracy.toFixed(1)}%  | 30%    |
| 🏥 System Health         | ${snapshot.health_score.toFixed(1)}%  | 30%    |
| 🧠 AI Intelligence       | ${snapshot.ai_intelligence_index.toFixed(1)}%  | 20%    |
| 📊 Menu/Forecast         | ${snapshot.menu_forecast_accuracy.toFixed(1)}%  | 20%    |

**Composite Score:** ${snapshot.governance_score} = (0.30 × ${snapshot.finance_accuracy.toFixed(1)}) + (0.30 × ${snapshot.health_score.toFixed(1)}) + (0.20 × ${snapshot.ai_intelligence_index.toFixed(1)}) + (0.20 × ${snapshot.menu_forecast_accuracy.toFixed(1)})

---

## Active Alerts

${activeAlerts.length === 0 ? '✅ No active alerts' : ''}
${activeAlerts.map(a => `- **[${a.severity.toUpperCase()}]** ${a.type}: ${a.message} _(since ${a.created_at})_`).join('\n')}

---

## Recommendations

${snapshot.governance_score >= 90 ? '✅ System is operating at optimal levels. Continue monitoring.' : ''}
${snapshot.governance_score >= 75 && snapshot.governance_score < 90 ? '⚠️ System performance is acceptable but has room for improvement. Review warning alerts.' : ''}
${snapshot.governance_score < 75 ? '🚨 Action required. Address critical alerts immediately.' : ''}

---

_Generated by NeuroPilot Quantum Governance v15.8.0_
`;
}

module.exports = router;
