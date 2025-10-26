/**
 * Finance Workspace API Routes (v15.4.0)
 * Role-gated endpoints for finance users and owners
 * KPIs, summaries, pivots, exports, AI copilot
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const FinanceService = require('../src/finance/FinanceService');
const FinanceAICopilot = require('../src/finance/FinanceAICopilot');

// Middleware to check role
function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'user';
    if (roles.includes(userRole) || userRole === 'owner') {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Finance workspace requires finance or owner role.'
      });
    }
  };
}

/**
 * GET /api/finance/kpis
 * Get KPIs for a period with delta vs prior period
 */
router.get('/kpis', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { period } = req.query;

    if (!period) {
      return res.status(400).json({
        success: false,
        error: 'period parameter required (e.g., 2025-Q1, 2025-H1, 2025-01..2025-06)'
      });
    }

    const db = require('../config/database');
    const result = await FinanceService.queryKpis(db, period);

    res.json(result);

  } catch (error) {
    logger.error('GET /api/finance/kpis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/summary
 * Get summary grouped by dimension
 */
router.get('/summary', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { period, group } = req.query;

    if (!period) {
      return res.status(400).json({
        success: false,
        error: 'period parameter required'
      });
    }

    const groupBy = group || 'month';
    const allowedGroups = ['week', 'month', 'vendor', 'category', 'location'];

    if (!allowedGroups.includes(groupBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid group parameter. Allowed: ${allowedGroups.join(', ')}`
      });
    }

    const db = require('../config/database');
    const result = await FinanceService.querySummary(db, period, groupBy);

    res.json(result);

  } catch (error) {
    logger.error('GET /api/finance/summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/pivot
 * Run pivot table query
 */
router.get('/pivot', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { rows, cols, metrics, filters } = req.query;

    if (!rows || !cols || !metrics) {
      return res.status(400).json({
        success: false,
        error: 'rows, cols, and metrics parameters required'
      });
    }

    const params = {
      rows,
      cols,
      metrics: JSON.parse(metrics),
      filters: filters ? JSON.parse(filters) : {}
    };

    const db = require('../config/database');
    const result = await FinanceService.queryPivot(db, params);

    res.json(result);

  } catch (error) {
    logger.error('GET /api/finance/pivot error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/export
 * Export financial data to CSV/XLSX/PDF
 */
router.post('/export', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { format, params } = req.body;

    if (!format || !params) {
      return res.status(400).json({
        success: false,
        error: 'format and params required'
      });
    }

    const allowedFormats = ['csv', 'xlsx', 'pdf'];
    if (!allowedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Allowed: ${allowedFormats.join(', ')}`
      });
    }

    const db = require('../config/database');
    const { period, groupBy } = params;
    const data = await FinanceService.querySummary(db, period, groupBy || 'month');

    if (format === 'csv') {
      const csv = FinanceService.exportToCSV(data.summary, params);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="finance_export_${period}.csv"`);
      res.send(csv);
    } else {
      // XLSX and PDF would require additional libraries
      res.json({
        success: true,
        message: `${format.toUpperCase()} export not yet implemented`,
        format,
        rowcount: data.summary.length
      });
    }

  } catch (error) {
    logger.error('POST /api/finance/export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/schedule
 * Create scheduled export
 */
router.post('/schedule', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { name, cron, params, recipients } = req.body;

    if (!name || !cron || !params) {
      return res.status(400).json({
        success: false,
        error: 'name, cron, and params required'
      });
    }

    const db = require('../config/database');
    const result = await db.run(`
      INSERT INTO finance_export_schedules (name, cron, params, recipients, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [name, cron, JSON.stringify(params), JSON.stringify(recipients || []), req.user.email]);

    logger.info(`✅ Finance export schedule created: ${name} by ${req.user.email}`);

    res.json({
      success: true,
      scheduleId: result.lastID,
      name,
      cron
    });

  } catch (error) {
    logger.error('POST /api/finance/schedule error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/data-quality
 * List data quality issues
 */
router.get('/data-quality', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const db = require('../config/database');
    const result = await FinanceService.listDataQuality(db);

    res.json(result);

  } catch (error) {
    logger.error('GET /api/finance/data-quality error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/ai/query
 * AI Copilot: Convert natural language to SQL/actions
 */
router.post('/ai/query', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const { question, period, constraints } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'question parameter required'
      });
    }

    const db = require('../config/database');
    const copilot = new FinanceAICopilot(db);

    const result = await copilot.processQuery(
      question,
      req.user.email,
      req.user.role,
      { period, ...constraints }
    );

    res.json(result);

  } catch (error) {
    logger.error('POST /api/finance/ai/query error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/schedules
 * List all export schedules
 */
router.get('/schedules', requireRole('finance', 'owner'), async (req, res) => {
  try {
    const db = require('../config/database');
    const schedules = await db.all(`
      SELECT * FROM finance_export_schedules
      WHERE enabled = 1
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      count: schedules.length,
      schedules
    });

  } catch (error) {
    logger.error('GET /api/finance/schedules error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
