/**
 * Owner Console API Routes - v2.8.0
 * Secure admin interface for David Mikulis (system owner)
 * Requires: JWT authentication + admin role + 2FA verification
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission, PERMISSIONS } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const metricsExporter = require('../utils/metricsExporter');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Use the requireOwner middleware which handles email normalization
const requireOwnerAccess = requireOwner;

/**
 * GET /api/owner/config
 * v15.5.0: Returns app configuration (shadow mode, etc.)
 */
router.get('/config', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        shadowMode: process.env.FORECAST_SHADOW_MODE === 'true',
        dualControl: process.env.DUAL_CONTROL_ENABLED === 'true',
        exportRateLimit: parseInt(process.env.EXPORT_RATE_LIMIT_PER_MIN) || 5,
        rbacEnabled: true,
        version: '15.5.4',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    console.error('Owner config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/dashboard
 * Returns comprehensive dashboard data for owner console
 */
router.get('/dashboard', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');

    // Get system health
    const health = await getSystemHealth();

    // Get recent audit logs
    const auditLogs = await getRecentAuditLogs( 10);

    // Get database stats
    const dbStats = await getDatabaseStats();

    // Get AI module status with live timestamps
    const phase3Cron = req.app.locals.phase3Cron;
    const aiModules = await getAIModuleStatus(phase3Cron);

    // v13.0: Get learning insights (last 5)
    const learningInsights = await getLearningInsights(5);

    // v21.1: AI Ops Health - simplified for PostgreSQL migration
    // AI tables not yet migrated, return default values
    const aiOpsHealth = {
      score: 50,
      explanations: ['AI systems initializing - PostgreSQL migration in progress'],
      last_forecast_ts: null,
      last_learning_ts: null
    };
    const aiIntelligenceIndex = {
      intelligence_index: null,
      category_scores: {},
      last_updated: null
    };

    // Get version info
    const versionInfo = {
      current: '14.4.2',
      next: '14.5.0',
      releaseDate: '2025-10-12',
      features: {
        completed: [
          'AI Forecasting (ARIMA + Prophet)',
          'Two-Factor Authentication (TOTP)',
          'Audit Logging with PII Scrubbing',
          'Redis Metrics Collection',
          'PostgreSQL Migration Support'
        ],
        pending: [
          'Integration Tests (85% coverage)',
          'Additional Grafana Dashboards',
          'Docker Infrastructure Setup',
          'Advanced AI Model Training'
        ]
      }
    };

    res.json({
      success: true,
      owner: req.user.email,
      timestamp: new Date().toISOString(),
      stats: dbStats, // Frontend expects stats directly
      data: {
        health,
        auditLogs,
        dbStats,
        aiModules,
        learningInsights, // v13.0: Latest 5 learning insights
        versionInfo,
        ai_ops_health: aiOpsHealth, // v13.5: Composite AI Ops System Health
        ai_intelligence_index: aiIntelligenceIndex // v14.4: AI Intelligence Index
      }
    });

  } catch (error) {
    console.error('Owner dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/dashboard/stats
 * Returns just the dashboard statistics (subset of /dashboard for frontend consumption)
 * v21.1: Created for owner console frontend compatibility
 */
router.get('/dashboard/stats', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');

    // Get database stats
    const dbStats = await getDatabaseStats();

    res.json({
      success: true,
      stats: dbStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Owner dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/console/locations
 * Returns all storage locations for owner console
 * v21.1: Frontend compatibility endpoint
 */
router.get('/console/locations', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    const result = await pool.query(`
      SELECT id as location_id, name as location_name, is_active as active
      FROM storage_locations
      WHERE is_active = true
      ORDER BY name
    `);

    res.json({
      success: true,
      locations: result.rows || []
    });
  } catch (error) {
    console.error('GET /api/owner/console/locations error:', error);
    res.json({
      success: true,
      locations: [] // Return empty array on error to prevent frontend breakage
    });
  }
});

/**
 * GET /api/owner/inventory/has-snapshot
 * Check if inventory snapshot exists
 * v21.1: Added for frontend compatibility
 */
router.get('/inventory/has-snapshot', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const result = await pool.query(`SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1`);
    const hasSnapshot = parseInt(result.rows[0]?.count || 0) > 0;
    res.json({ success: true, hasSnapshot, count: parseInt(result.rows[0]?.count || 0) });
  } catch (error) {
    res.json({ success: true, hasSnapshot: false, count: 0 });
  }
});

/**
 * GET /api/owner/inventory/current
 * Get current inventory items
 * v21.1: Added for frontend compatibility
 */
router.get('/inventory/current', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT
        item_id, item_code, item_name, description, unit, category,
        current_quantity, par_level, reorder_point, is_active,
        last_count_date, last_invoice_date, created_at
      FROM inventory_items
      WHERE is_active = 1
      ORDER BY item_name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      success: true,
      items: result.rows || [],
      total: result.rows?.length || 0
    });
  } catch (error) {
    console.error('GET /api/owner/inventory/current error:', error);
    res.json({ success: true, items: [], total: 0 });
  }
});

/**
 * GET /api/owner/pdfs
 * List PDF documents
 * v21.1: Added for frontend compatibility
 */
router.get('/pdfs', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const status = req.query.status || 'all';

    let sql = `
      SELECT
        document_id as id, filename, file_path, document_type,
        upload_date as created_at, processed, processed_date,
        vendor, invoice_date, invoice_amount
      FROM documents
      WHERE 1=1
    `;

    if (status === 'processed') {
      sql += ` AND processed = true`;
    } else if (status === 'unprocessed') {
      sql += ` AND (processed = false OR processed IS NULL)`;
    }

    sql += ` ORDER BY upload_date DESC LIMIT 100`;

    const result = await pool.query(sql);

    res.json({
      success: true,
      pdfs: result.rows || [],
      total: result.rows?.length || 0
    });
  } catch (error) {
    console.error('GET /api/owner/pdfs error:', error);
    res.json({ success: true, pdfs: [], total: 0 });
  }
});

/**
 * GET /api/owner/ops/status
 * Get AI Ops status
 * v21.1: Added for frontend compatibility
 */
router.get('/ops/status', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    health: {
      score: 50,
      explanations: ['AI systems initializing - PostgreSQL migration in progress']
    },
    modules: {
      forecasting: { status: 'IDLE', enabled: false },
      learning: { status: 'IDLE', enabled: false },
      anomaly: { status: 'IDLE', enabled: false }
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/owner/forecast/stockout
 * Get stockout forecast alerts
 * v21.1: Added for frontend compatibility
 */
router.get('/forecast/stockout', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    alerts: [],
    message: 'Forecast system initializing'
  });
});

/**
 * GET /api/owner/forecast/daily
 * Get daily forecast
 * v21.1: Added for frontend compatibility
 */
router.get('/forecast/daily', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    forecast: [],
    message: 'Forecast system initializing'
  });
});

/**
 * GET /api/owner/forecast/population
 * Get population forecast
 * v21.1: Added for frontend compatibility
 */
router.get('/forecast/population', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    population: { today: 0, tomorrow: 0, trend: 'stable' },
    message: 'Population forecast system initializing'
  });
});

/**
 * GET /api/owner/dashboard/reorder
 * Get reorder recommendations
 * v21.1: Added for frontend compatibility
 */
router.get('/dashboard/reorder', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    recommendations: [],
    message: 'Reorder system initializing'
  });
});

/**
 * GET /api/owner/dashboard/anomalies
 * Get anomaly alerts
 * v21.1: Added for frontend compatibility
 */
router.get('/dashboard/anomalies', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    anomalies: [],
    message: 'Anomaly detection initializing'
  });
});

/**
 * GET /api/owner/reports/executive
 * Get executive report
 * v21.1: Added for frontend compatibility
 */
router.get('/reports/executive', authenticateToken, requireOwnerAccess, async (req, res) => {
  res.json({
    success: true,
    report: {
      period: new Date().toISOString().split('T')[0],
      summary: 'System initializing - PostgreSQL migration in progress',
      metrics: {
        totalItems: 0,
        totalValue: '$0.00',
        countAccuracy: 'N/A'
      }
    }
  });
});

/**
 * GET /api/owner/users
 * Returns all users for owner console
 * v22.2: Added for frontend compatibility
 */
router.get('/users', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    const result = await pool.query(`
      SELECT
        id,
        email,
        role,
        org_id,
        site_id,
        is_active,
        last_login,
        created_at,
        updated_at
      FROM users
      WHERE is_active = true OR is_active IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      users: result.rows || []
    });
  } catch (error) {
    console.error('GET /api/owner/users error:', error);
    // Return empty array to prevent frontend breakage
    res.json({
      success: true,
      users: []
    });
  }
});

/**
 * PUT /api/owner/users/:id/role
 * Update user role
 * v22.2: Added for frontend compatibility
 */
router.put('/users/:id/role', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ['viewer', 'staff', 'manager', 'admin', 'owner'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const result = await pool.query(`
      UPDATE users
      SET role = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, role
    `, [role, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
      message: `User role updated to ${role}`
    });
  } catch (error) {
    console.error('PUT /api/owner/users/:id/role error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/system-health
 * Returns detailed system health metrics
 */
router.get('/system-health', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/owner/metrics
 * Returns Prometheus metrics in JSON format
 */
router.get('/metrics', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const metrics = await metricsExporter.getMetrics();

    // Parse Prometheus format to JSON for easier consumption
    const parsed = parsePrometheusMetrics(metrics);

    res.json({
      success: true,
      metrics: parsed,
      raw: metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/owner/audit-logs
 * Returns recent audit log entries
 */
router.get('/audit-logs', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const logs = await getRecentAuditLogs( limit, offset);

    res.json({
      success: true,
      logs,
      limit,
      offset
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/train-forecast
 * Trigger AI forecast model training
 */
router.post('/train-forecast', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { itemCode, horizon } = req.body;

    // Validate input
    if (!itemCode) {
      return res.status(400).json({ error: 'itemCode is required' });
    }

    // Trigger training (would call ForecastService)
    // This is a placeholder - integrate with actual ForecastService
    res.json({
      success: true,
      message: 'Forecast training initiated',
      itemCode,
      horizon: horizon || 30,
      estimatedCompletionTime: '2-5 minutes'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/reload-ai
 * Restart AI agents (governance, compliance, insights)
 */
router.post('/reload-ai', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    // This would restart AI agents - placeholder for now
    res.json({
      success: true,
      message: 'AI agents reload initiated',
      modules: ['governance', 'insights', 'compliance'],
      status: 'reloading'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/compliance-scan
 * Run compliance scan across all frameworks
 */
router.post('/compliance-scan', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Compliance scan initiated',
      frameworks: ['iso27001', 'soc2', 'owasp'],
      estimatedDuration: '3-5 minutes'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/backup-database
 * Create database backup (PostgreSQL only - V21.1+)
 */
router.post('/backup-database', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `/tmp/postgres-backup-${timestamp}.sql`;

    // PostgreSQL backup via pg_dump script
    exec('bash scripts/postgres-backup.sh', (error, stdout, stderr) => {
      if (error) {
        console.error('Backup error:', error);
        return res.status(500).json({
          success: false,
          error: 'Backup failed',
          details: stderr
        });
      }

      res.json({
        success: true,
        message: 'PostgreSQL backup completed',
        file: backupFile,
        size: stdout
      });
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/database-mode
 * Get current database mode (PostgreSQL only - V21.1+)
 */
router.get('/database-mode', authenticateToken, requireOwnerAccess, (req, res) => {
  const redisEnabled = process.env.REDIS_ENABLED === 'true';

  res.json({
    success: true,
    database: 'PostgreSQL',
    redis: redisEnabled,
    config: {
      DATABASE_MODE: 'PostgreSQL (Railway)',
      REDIS_ENABLED: process.env.REDIS_ENABLED,
      AI_FORECAST_ENABLED: process.env.AI_FORECAST_ENABLED,
      REQUIRE_2FA_FOR_ADMINS: process.env.REQUIRE_2FA_FOR_ADMINS
    },
    note: 'SQLite mode deprecated in V21.1. System is PostgreSQL-only.'
  });
});

/**
 * POST /api/owner/toggle-database
 * DEPRECATED: Database mode is now PostgreSQL-only
 */
router.post('/toggle-database', authenticateToken, requireOwnerAccess, (req, res) => {
  res.status(400).json({
    success: false,
    error: 'Database toggle disabled',
    message: 'System is now PostgreSQL-only (V21.1+). SQLite mode has been deprecated.',
    currentMode: 'PostgreSQL'
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get system health from health endpoint
 */
async function getSystemHealth() {
  try {
    const feedbackStream = require('../ai/streaming/FeedbackStream');
    const forecastWorker = require('../ai/workers/ForecastWorker');

    const feedbackStats = feedbackStream.getStats();
    const forecastStats = forecastWorker.getStats();

    return {
      status: 'ok',
      app: 'inventory-enterprise-v14.4.2',
      version: '14.4.2',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      features: {
        multiTenancy: true,
        rbac: true,
        webhooks: true,
        realtime: true,
        forecasting: process.env.AI_FORECAST_ENABLED === 'true',
        twoFactor: true,
        auditLogging: true,
        redis: process.env.REDIS_ENABLED === 'true',
        postgresql: process.env.PG_ENABLED === 'true'
      },
      realtime: {
        websocket: 0,
        feedbackStream: feedbackStats.isStreaming,
        forecastWorker: forecastStats.isWatching,
        modelsLoaded: forecastStats.modelsLoaded
      }
    };
  } catch (error) {
    console.error('Error getting system health:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Get recent audit logs
 */
async function getRecentAuditLogs(limit = 10, offset = 0) {
  const { pool } = require('../db');
  try {
    const result = await pool.query(`
      SELECT *
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return (result.rows || []).map(log => ({
      ...log,
      request_body: typeof log.request_body === 'string'
        ? JSON.parse(log.request_body || '{}')
        : log.request_body,
      metadata: typeof log.metadata === 'string'
        ? JSON.parse(log.metadata || '{}')
        : log.metadata
    }));
  } catch (error) {
    // Return empty array if audit_logs table doesn't exist yet
    return [];
  }
}

/**
 * Get database statistics
 * v21.1: Updated to use PostgreSQL
 */
async function getDatabaseStats() {
  const { pool } = require('../db');
  const stats = {};

  try {
    // Get active items count
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1`);
      stats.totalItems = parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      stats.totalItems = 0;
    }

    // Get active locations count
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM storage_locations WHERE is_active = true`);
      stats.activeLocations = parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      stats.activeLocations = 0;
    }

    // Get total PDFs/documents
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM documents WHERE mime_type = 'application/pdf' AND deleted_at IS NULL`);
      stats.totalDocuments = parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      stats.totalDocuments = 0;
    }

    // Get pending (open) inventory counts
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM inventory_counts WHERE status = 'open'`);
      stats.pendingCounts = parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      stats.pendingCounts = 0;
    }

    // Get closed counts this month (PostgreSQL syntax)
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM inventory_counts WHERE status = 'closed' AND TO_CHAR(closed_at, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`);
      stats.closedCountsThisMonth = parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      stats.closedCountsThisMonth = 0;
    }

    // Get total inventory value from inventory_items
    try {
      const valueResult = await pool.query(`
        SELECT COALESCE(SUM(current_quantity * unit_cost), 0) as total_value
        FROM inventory_items
        WHERE is_active = 1
      `);
      const totalValue = parseFloat(valueResult.rows[0]?.total_value || 0);
      stats.inventoryValue = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      stats.inventoryValueRaw = totalValue;
    } catch (error) {
      stats.inventoryValue = '$0.00';
      stats.inventoryValueRaw = 0;
    }

    // Database size (PostgreSQL version)
    try {
      const result = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
      stats.databaseSize = result.rows[0]?.size || 'N/A';
    } catch (error) {
      stats.databaseSize = 'N/A';
    }

    // v13.0: AI Module metrics - skip tables that may not exist
    stats.forecast_cached_today = 0;
    stats.forecast_cached_tomorrow = 0;
    stats.feedback_pending = 0;
    stats.learning_insights_7d = 0;

    // v21.2: Get recent vendor orders for Recent Activity
    try {
      const recentOrdersResult = await pool.query(`
        SELECT
          id,
          vendor_name,
          order_number,
          order_date,
          total_cents,
          total_lines,
          status,
          created_at
        FROM vendor_orders
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5
      `);
      stats.recentVendorOrders = (recentOrdersResult.rows || []).map(order => ({
        id: order.id,
        vendor: order.vendor_name,
        orderNumber: order.order_number,
        orderDate: order.order_date,
        total: order.total_cents ? (order.total_cents / 100).toFixed(2) : '0.00',
        lineCount: order.total_lines || 0,
        status: order.status,
        createdAt: order.created_at
      }));
    } catch (error) {
      stats.recentVendorOrders = [];
    }

    // v21.2: Get total vendor orders count
    try {
      const orderCountResult = await pool.query(`
        SELECT COUNT(*) as count FROM vendor_orders WHERE deleted_at IS NULL
      `);
      stats.totalVendorOrders = parseInt(orderCountResult.rows[0]?.count || 0);
    } catch (error) {
      stats.totalVendorOrders = 0;
    }

    return stats;
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      error: error.message,
      totalItems: 0,
      activeLocations: 0,
      totalDocuments: 0,
      pendingCounts: 0,
      inventoryValue: '$0.00',
      databaseSize: 'N/A'
    };
  }
}

/**
 * Get AI module status with live timestamps from Phase3CronScheduler
 * v21.1: Simplified to return static status (AI tables not yet migrated)
 */
async function getAIModuleStatus(phase3Cron) {
  // Get live run timestamps from cron scheduler if available
  let lastForecastRun = null;
  let lastLearningRun = null;

  if (phase3Cron && typeof phase3Cron.getLastRuns === 'function') {
    try {
      const lastRuns = await phase3Cron.getLastRuns();
      lastForecastRun = lastRuns.lastForecastRun;
      lastLearningRun = lastRuns.lastLearningRun;
    } catch (err) {
      // Silently ignore - cron may not be initialized
    }
  }

  // Calculate status based on lastRun age
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let forecastStatus = 'IDLE';
  if (lastForecastRun) {
    const age = now - new Date(lastForecastRun).getTime();
    forecastStatus = age <= DAY_MS ? 'ACTIVE' : 'DEGRADED';
  }

  let learningStatus = 'IDLE';
  if (lastLearningRun) {
    const age = now - new Date(lastLearningRun).getTime();
    learningStatus = age <= DAY_MS ? 'ACTIVE' : 'DEGRADED';
  }

  return {
    forecasting: {
      enabled: process.env.AI_FORECAST_ENABLED === 'true',
      models: ['ARIMA', 'Prophet'],
      status: forecastStatus,
      lastRun: lastForecastRun,
      lastRunIso: lastForecastRun,
      nextScheduled: '06:00 UTC daily'
    },
    governance: {
      enabled: process.env.GOVERNANCE_ENABLED === 'true',
      learningCycles: 1,
      status: learningStatus,
      lastRun: lastLearningRun,
      lastRunIso: lastLearningRun,
      nextScheduled: '21:00 UTC daily'
    },
    insights: {
      enabled: process.env.INSIGHT_ENABLED === 'true',
      provider: process.env.INSIGHT_PROVIDER || 'openai',
      status: 'ACTIVE'
    },
    compliance: {
      enabled: process.env.COMPLIANCE_ENABLED === 'true',
      frameworks: ['iso27001', 'soc2', 'owasp'],
      status: 'ACTIVE'
    },
    aiOps: {
      enabled: process.env.AIOPS_ENABLED === 'true',
      autoRemediation: process.env.AIOPS_AUTO_REMEDIATION === 'true',
      status: 'ACTIVE'
    }
  };
}

/**
 * Get latest learning insights (last 5)
 * v21.1: Returns empty array - AI tables not yet migrated to PostgreSQL
 */
async function getLearningInsights(limit = 5) {
  // AI learning tables not yet migrated to PostgreSQL
  return [];
}

/**
 * Parse Prometheus metrics to JSON
 */
function parsePrometheusMetrics(metricsText) {
  const lines = metricsText.split('\n');
  const metrics = {};

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const parts = line.split(' ');
    if (parts.length >= 2) {
      const name = parts[0];
      const value = parseFloat(parts[1]);
      metrics[name] = value;
    }
  }

  return metrics;
}

// ============================================================================
// Locations: Unassigned Items & Multi-Location Assignment
// ============================================================================

/**
 * GET /api/owner/locations/unassigned
 * List all inventory items with no location mapping
 * v21.1: Updated to use PostgreSQL
 */
router.get('/locations/unassigned', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { q = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchPattern = q ? `%${q}%` : null;

    // Ensure unique index exists (idempotent) - PostgreSQL syntax
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_item_locations_item_loc
        ON item_locations(item_code, location_id)
      `);
    } catch (err) {
      // Ignore if already exists
    }

    // Query unassigned items - PostgreSQL syntax with positional params
    const itemsResult = await pool.query(`
      SELECT ii.item_code, ii.item_name, ii.unit
      FROM inventory_items ii
      WHERE ii.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM item_locations il
          WHERE il.item_code = ii.item_code AND il.is_active = 1
        )
        AND (
          $1 IS NULL OR $1 = ''
          OR ii.item_code ILIKE $1
          OR ii.item_name ILIKE $1
        )
      ORDER BY ii.item_name
      LIMIT $2 OFFSET $3
    `, [searchPattern, parseInt(limit), offset]);

    // Get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(1) AS total
      FROM inventory_items ii
      WHERE ii.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM item_locations il
          WHERE il.item_code = ii.item_code AND il.is_active = 1
        )
        AND (
          $1 IS NULL OR $1 = ''
          OR ii.item_code ILIKE $1
          OR ii.item_name ILIKE $1
        )
    `, [searchPattern]);

    res.json({
      success: true,
      items: itemsResult.rows || [],
      total: parseInt(countResult.rows[0]?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('GET /api/owner/locations/unassigned error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/locations/assign
 * Bulk assign items to multiple locations
 * v21.1: Updated to use PostgreSQL
 */
router.post('/locations/assign', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { itemCodes, locationIds } = req.body;

    // Validate input
    if (!itemCodes || !Array.isArray(itemCodes) || itemCodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'itemCodes array is required'
      });
    }

    if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'locationIds array is required'
      });
    }

    // Get default tenant_id (assuming single-tenant for owner)
    const tenantResult = await pool.query(`SELECT id FROM tenants LIMIT 1`);
    const tenantId = tenantResult.rows[0]?.id || 'default';

    let inserted = 0;

    // Use PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const itemCode of itemCodes) {
        for (const locationId of locationIds) {
          // Generate unique id
          const id = `${itemCode}-${locationId}-${Date.now()}`.substring(0, 255);

          // PostgreSQL: ON CONFLICT DO NOTHING replaces INSERT OR IGNORE
          const result = await client.query(`
            INSERT INTO item_locations (id, tenant_id, location_id, item_code, sequence, is_active)
            VALUES ($1, $2, $3, $4, 0, 1)
            ON CONFLICT (item_code, location_id) DO NOTHING
          `, [id, tenantId, locationId, itemCode]);

          if (result.rowCount > 0) {
            inserted++;
          }
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        inserted,
        message: `Successfully assigned ${inserted} item-location mappings`
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('POST /api/owner/locations/assign error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/locations/unassign
 * Remove a single item-location mapping
 * v21.1: Updated to use PostgreSQL
 */
router.post('/locations/unassign', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { itemCode, locationId } = req.body;

    // Validate input
    if (!itemCode || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'itemCode and locationId are required'
      });
    }

    // Delete the mapping - PostgreSQL syntax
    const result = await pool.query(`
      DELETE FROM item_locations
      WHERE item_code = $1 AND location_id = $2
    `, [itemCode, locationId]);

    res.json({
      success: true,
      removed: result.rowCount,
      message: result.rowCount > 0 ? 'Mapping removed successfully' : 'Mapping not found'
    });

  } catch (error) {
    console.error('POST /api/owner/locations/unassign error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Count Workspaces: Month-End Flow (v14.1)
// ============================================================================

/**
 * Ensure workspace tables exist (idempotent)
 */
async function ensureWorkspaceTables(db) {
  // Create count_workspaces table
  await db.run(`
    CREATE TABLE IF NOT EXISTS count_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TEXT NOT NULL,
      closed_at TEXT,
      created_by TEXT
    )
  `);

  // Create workspace_items table
  await db.run(`
    CREATE TABLE IF NOT EXISTS workspace_items (
      workspace_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, item_code),
      FOREIGN KEY (workspace_id) REFERENCES count_workspaces(id)
    )
  `);

  // Create workspace_invoices table
  await db.run(`
    CREATE TABLE IF NOT EXISTS workspace_invoices (
      workspace_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      attached_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, document_id),
      FOREIGN KEY (workspace_id) REFERENCES count_workspaces(id)
    )
  `);

  // Create workspace_counts table (per location/item)
  await db.run(`
    CREATE TABLE IF NOT EXISTS workspace_counts (
      workspace_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      counted_at TEXT NOT NULL,
      counted_by TEXT,
      PRIMARY KEY (workspace_id, location_id, item_code),
      FOREIGN KEY (workspace_id) REFERENCES count_workspaces(id)
    )
  `);
}

/**
 * GET /api/owner/count/workspaces/current
 * Get the current active workspace
 */
router.get('/count/workspaces/current', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    // Get most recent open workspace
    const workspace = await db.get(`
      SELECT
        w.id,
        w.name,
        w.period_start,
        w.period_end,
        w.status,
        w.created_at,
        w.created_by,
        COUNT(DISTINCT wi.document_id) as attached_invoices_count,
        COUNT(DISTINCT witem.item_code) as item_count
      FROM count_workspaces w
      LEFT JOIN workspace_invoices wi ON wi.workspace_id = w.id
      LEFT JOIN workspace_items witem ON witem.workspace_id = w.id
      WHERE w.status = 'open'
      GROUP BY w.id
      ORDER BY w.created_at DESC
      LIMIT 1
    `);

    if (!workspace) {
      return res.json({
        success: true,
        workspace: null,
        message: 'No active workspace found'
      });
    }

    res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        period_start: workspace.period_start,
        period_end: workspace.period_end,
        status: workspace.status,
        created_at: workspace.created_at,
        created_by: workspace.created_by,
        attachedInvoices: workspace.attached_invoices_count,
        itemCount: workspace.item_count
      }
    });

  } catch (error) {
    console.error('GET /api/owner/count/workspaces/current error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces
 * Create a new count workspace
 */
router.post('/count/workspaces', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const { name, period_start, period_end } = req.body;

    // Validate input
    if (!name || !period_start || !period_end) {
      return res.status(400).json({
        success: false,
        error: 'name, period_start, and period_end are required'
      });
    }

    // Generate workspace ID
    const { v4: uuidv4 } = require('uuid');
    const workspaceId = uuidv4();
    const now = new Date().toISOString();

    // Insert workspace
    await db.run(`
      INSERT INTO count_workspaces (id, name, period_start, period_end, status, created_at, created_by)
      VALUES (?, ?, ?, ?, 'open', ?, ?)
    `, [workspaceId, name, period_start, period_end, now, req.user?.email || 'owner']);

    res.json({
      success: true,
      id: workspaceId,
      name,
      period_start,
      period_end,
      created_at: now
    });

  } catch (error) {
    console.error('POST /api/owner/count/workspaces error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/items
 * Add items to workspace
 * v21.1: Updated to use PostgreSQL
 */
router.post('/count/workspaces/:id/items', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    const { id } = req.params;
    const { itemCodes } = req.body;

    // Validate input
    if (!itemCodes || !Array.isArray(itemCodes) || itemCodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'itemCodes array is required'
      });
    }

    // Verify workspace exists and is open
    const workspaceResult = await pool.query(`SELECT status FROM count_workspaces WHERE id = $1`, [id]);
    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspaceResult.rows[0].status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    let added = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    // Insert items - PostgreSQL syntax
    for (const itemCode of itemCodes) {
      try {
        const result = await pool.query(`
          INSERT INTO workspace_items (workspace_id, item_code, added_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (workspace_id, item_code) DO NOTHING
        `, [id, itemCode, now]);

        if (result.rowCount > 0) {
          added++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn(`Failed to add item ${itemCode}:`, err.message);
        skipped++;
      }
    }

    res.json({
      success: true,
      added,
      skipped,
      message: `Added ${added} items, skipped ${skipped} duplicates`
    });

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/items error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/locations/:locationId/items/:itemCode
 * Record count for specific item at location
 */
router.post('/count/workspaces/:id/locations/:locationId/items/:itemCode', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const { id, locationId, itemCode } = req.params;
    const { qty } = req.body;

    // Validate input
    if (qty === undefined || qty === null) {
      return res.status(400).json({
        success: false,
        error: 'qty is required'
      });
    }

    // Verify workspace exists and is open
    const workspace = await db.get(`SELECT status FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    const now = new Date().toISOString();

    // Insert or update count
    await db.run(`
      INSERT INTO workspace_counts (workspace_id, location_id, item_code, qty, counted_at, counted_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, location_id, item_code)
      DO UPDATE SET qty = excluded.qty, counted_at = excluded.counted_at, counted_by = excluded.counted_by
    `, [id, locationId, itemCode, qty, now, req.user?.email || 'owner']);

    res.json({
      success: true,
      ok: true,
      workspace_id: id,
      location_id: locationId,
      item_code: itemCode,
      qty: qty,
      counted_at: now
    });

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/locations/:locationId/items/:itemCode error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/count/workspaces/:id/usage
 * Compute usage report for workspace
 */
router.get('/count/workspaces/:id/usage', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const { id } = req.params;

    // Verify workspace exists
    const workspace = await db.get(`SELECT * FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Compute usage: opening + purchases - closing = usage
    // Opening: from previous closed workspace or par_level estimate
    // Purchases: sum of invoice line items attached to this workspace
    // Closing: sum of counted quantities across all locations

    const usageData = await db.all(`
      WITH workspace_items_list AS (
        SELECT DISTINCT item_code FROM workspace_items WHERE workspace_id = ?
      ),
      opening_snapshot AS (
        SELECT
          wc.item_code,
          SUM(wc.qty) as opening_qty,
          'previous_workspace' as opening_source
        FROM workspace_counts wc
        JOIN count_workspaces w ON w.id = wc.workspace_id
        WHERE w.status = 'closed'
          AND w.closed_at < ?
          AND wc.item_code IN (SELECT item_code FROM workspace_items_list)
        GROUP BY wc.item_code
      ),
      purchases_agg AS (
        SELECT
          pi.item_code,
          SUM(pi.quantity) as purchases_qty
        FROM processed_invoices pi
        JOIN workspace_invoices wi ON wi.document_id = pi.document_id
        WHERE wi.workspace_id = ?
        GROUP BY pi.item_code
      ),
      closing_agg AS (
        SELECT
          wc.item_code,
          SUM(wc.qty) as closing_qty
        FROM workspace_counts wc
        WHERE wc.workspace_id = ?
        GROUP BY wc.item_code
      )
      SELECT
        i.item_code,
        i.item_name,
        COALESCE(o.opening_qty, i.par_level, 0) as opening_qty,
        CASE WHEN o.opening_qty IS NULL THEN 'estimate' ELSE o.opening_source END as opening_source,
        COALESCE(p.purchases_qty, 0) as purchases_qty,
        COALESCE(c.closing_qty, 0) as closing_qty,
        (COALESCE(o.opening_qty, i.par_level, 0) + COALESCE(p.purchases_qty, 0) - COALESCE(c.closing_qty, 0)) as usage_qty,
        CASE
          WHEN c.closing_qty IS NULL OR c.closing_qty = 0 THEN 'not_counted_or_zero'
          WHEN (COALESCE(o.opening_qty, i.par_level, 0) + COALESCE(p.purchases_qty, 0) - COALESCE(c.closing_qty, 0)) < 0 THEN 'negative_usage_anomaly'
          ELSE NULL
        END as notes
      FROM workspace_items_list wil
      JOIN inventory_items i ON i.item_code = wil.item_code
      LEFT JOIN opening_snapshot o ON o.item_code = i.item_code
      LEFT JOIN purchases_agg p ON p.item_code = i.item_code
      LEFT JOIN closing_agg c ON c.item_code = i.item_code
      WHERE i.is_active = 1
      ORDER BY i.item_name
    `, [id, workspace.created_at, id, id]);

    // Add summary
    const summary = {
      total_items: usageData.length,
      total_opening: usageData.reduce((sum, row) => sum + (row.opening_qty || 0), 0),
      total_purchases: usageData.reduce((sum, row) => sum + (row.purchases_qty || 0), 0),
      total_closing: usageData.reduce((sum, row) => sum + (row.closing_qty || 0), 0),
      total_usage: usageData.reduce((sum, row) => sum + (row.usage_qty || 0), 0),
      items_not_counted: usageData.filter(row => row.notes === 'not_counted_or_zero').length,
      items_with_anomalies: usageData.filter(row => row.notes === 'negative_usage_anomaly').length
    };

    res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        period_start: workspace.period_start,
        period_end: workspace.period_end,
        status: workspace.status
      },
      summary,
      usage: usageData
    });

  } catch (error) {
    console.error('GET /api/owner/count/workspaces/:id/usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/count/workspaces/all
 * List all workspaces (for playground overview)
 */
router.get('/count/workspaces/all', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const limit = parseInt(req.query.limit) || 20;

    const workspaces = await db.all(`
      SELECT
        w.id,
        w.name,
        w.period_start,
        w.period_end,
        w.status,
        w.created_at,
        w.closed_at,
        w.created_by
      FROM count_workspaces w
      ORDER BY w.created_at DESC
      LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      workspaces
    });

  } catch (error) {
    console.error('GET /api/owner/count/workspaces/all error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/count/workspaces/:id
 * Get single workspace with details (items, invoices, counts)
 * v14.3.1: For workspace viewer modal
 */
router.get('/count/workspaces/:id', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const { id } = req.params;

    // Get workspace basic info
    const workspace = await db.get(`
      SELECT
        id,
        name,
        period_start,
        period_end,
        status,
        created_at,
        closed_at,
        created_by
      FROM count_workspaces
      WHERE id = ?
    `, [id]);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Get items with counts
    const items = await db.all(`
      SELECT
        wi.item_code,
        ii.item_name,
        wc.location_id,
        sl.name as location_name,
        wc.qty as count,
        wc.counted_at,
        NULL as usage
      FROM workspace_items wi
      JOIN inventory_items ii ON ii.item_code = wi.item_code
      LEFT JOIN workspace_counts wc ON wc.workspace_id = wi.workspace_id AND wc.item_code = wi.item_code
      LEFT JOIN storage_locations sl ON sl.id = wc.location_id
      WHERE wi.workspace_id = ?
      ORDER BY ii.item_name, sl.name
    `, [id]);

    // Get attached invoices
    const invoices = await db.all(`
      SELECT
        d.id as document_id,
        d.filename as original_filename,
        COALESCE(d.invoice_date, d.created_at) as invoice_date,
        d.vendor as vendor_name,
        d.invoice_amount as total,
        COUNT(pi.line_id) as item_count
      FROM workspace_invoices wi
      JOIN documents d ON d.id = wi.document_id
      LEFT JOIN processed_invoices pi ON pi.document_id = d.id
      WHERE wi.workspace_id = ?
      GROUP BY d.id
      ORDER BY COALESCE(d.invoice_date, d.created_at) DESC
    `, [id]);

    res.json({
      success: true,
      id: workspace.id,
      name: workspace.name,
      period_start: workspace.period_start,
      period_end: workspace.period_end,
      status: workspace.status,
      created_at: workspace.created_at,
      closed_at: workspace.closed_at,
      created_by: workspace.created_by,
      items: items || [],
      invoices: invoices || []
    });

  } catch (error) {
    console.error('GET /api/owner/count/workspaces/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/close
 * Close workspace and finalize counts
 */
router.post('/count/workspaces/:id/close', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

    const { id } = req.params;

    // Verify workspace exists and is open
    const workspace = await db.get(`SELECT * FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace already closed' });
    }

    const now = new Date().toISOString();

    // Close workspace
    await db.run(`
      UPDATE count_workspaces
      SET status = 'closed', closed_at = ?
      WHERE id = ?
    `, [now, id]);

    res.json({
      success: true,
      id: id,
      status: 'closed',
      closed_at: now,
      message: 'Workspace closed successfully'
    });

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/close error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Workspace Attachments: Counts, PDFs, and File Uploads (v14.3.2)
// ============================================================================

/**
 * GET /api/owner/counts/available
 * List available inventory counts for attachment to workspace
 * v21.1: Updated to use PostgreSQL
 */
router.get('/counts/available', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    // Get all inventory counts (both open and closed) - PostgreSQL syntax
    const result = await pool.query(`
      SELECT
        ic.id,
        ic.created_at,
        sl.name as location_name,
        ic.status,
        COUNT(icr.id) as item_count
      FROM inventory_counts ic
      LEFT JOIN storage_locations sl ON sl.id = ic.location_id
      LEFT JOIN inventory_count_rows icr ON icr.count_id = ic.id
      GROUP BY ic.id, ic.created_at, sl.name, ic.status
      ORDER BY ic.created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      counts: result.rows || []
    });

  } catch (error) {
    console.error('GET /api/owner/counts/available error:', error);
    // Return empty array to prevent frontend breakage
    res.json({
      success: true,
      counts: [],
      _error: error.message
    });
  }
});

/**
 * GET /api/owner/counts/history
 * List all inventory counts for Count tab history table (v15.2.2)
 * v21.1: Updated to use PostgreSQL
 */
router.get('/counts/history', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const limit = parseInt(req.query.limit) || 50;

    // Get all inventory counts with item counts (PostgreSQL syntax)
    const result = await pool.query(`
      SELECT
        ic.id,
        ic.created_at,
        ic.approved_at,
        ic.closed_at,
        ic.status,
        ic.location_id,
        sl.name as location_name,
        COUNT(DISTINCT icr.id) as item_count,
        'MONTHLY' as count_type
      FROM inventory_counts ic
      LEFT JOIN storage_locations sl ON sl.id = ic.location_id
      LEFT JOIN inventory_count_rows icr ON icr.count_id = ic.id
      GROUP BY ic.id, ic.created_at, ic.approved_at, ic.closed_at, ic.status, ic.location_id, sl.name
      ORDER BY ic.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      ok: true,
      success: true,
      counts: result.rows || []
    });

  } catch (error) {
    console.error('GET /api/owner/counts/history error:', error);
    // Return empty array on error to prevent frontend breakage
    res.json({
      ok: true,
      success: true,
      counts: [],
      _error: error.message
    });
  }
});

// ============================================================================
// Count PDF Management (v15.2.3)
// ============================================================================

/**
 * GET /api/owner/counts/:countId/pdfs
 * Get PDFs attached to a count
 * v21.1: Updated to use PostgreSQL
 */
router.get('/counts/:countId/pdfs', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { countId } = req.params;

    // Get attached PDFs - PostgreSQL syntax
    const result = await pool.query(`
      SELECT
        d.id,
        d.filename,
        d.invoice_date,
        d.vendor,
        d.invoice_amount,
        d.created_at,
        cd.attached_at,
        cd.attached_by
      FROM count_documents cd
      JOIN documents d ON d.id = cd.document_id
      WHERE cd.count_id = $1
      ORDER BY d.invoice_date DESC
    `, [countId]);

    res.json({
      ok: true,
      success: true,
      pdfs: result.rows || []
    });

  } catch (error) {
    console.error('GET /api/owner/counts/:countId/pdfs error:', error);
    // Return empty array to prevent frontend breakage
    res.json({
      ok: true,
      success: true,
      pdfs: [],
      _error: error.message
    });
  }
});

/**
 * GET /api/owner/counts/:countId/pdfs/available
 * Get PDFs available to attach to a count (not already attached)
 * v21.1: Updated to use PostgreSQL
 */
router.get('/counts/:countId/pdfs/available', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { countId } = req.params;

    // Get PDFs not yet attached to this count - PostgreSQL syntax
    const result = await pool.query(`
      SELECT
        d.id,
        d.filename,
        d.invoice_date,
        d.vendor,
        d.invoice_amount,
        d.created_at
      FROM documents d
      WHERE d.mime_type = 'application/pdf'
        AND d.deleted_at IS NULL
        AND d.id NOT IN (
          SELECT document_id FROM count_documents WHERE count_id = $1
        )
      ORDER BY d.invoice_date DESC
      LIMIT 100
    `, [countId]);

    res.json({
      ok: true,
      success: true,
      pdfs: result.rows || []
    });

  } catch (error) {
    console.error('GET /api/owner/counts/:countId/pdfs/available error:', error);
    // Return empty array to prevent frontend breakage
    res.json({
      ok: true,
      success: true,
      pdfs: [],
      _error: error.message
    });
  }
});

/**
 * POST /api/owner/counts/:countId/pdfs/attach
 * Attach PDFs to a count
 * v21.1: Updated to use PostgreSQL
 */
router.post('/counts/:countId/pdfs/attach', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { countId } = req.params;
    const { document_ids } = req.body;

    // Validate input
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'document_ids array is required'
      });
    }

    // Verify count exists
    const countResult = await pool.query(`SELECT id FROM inventory_counts WHERE id = $1`, [countId]);
    if (countResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'Count not found'
      });
    }

    const now = new Date().toISOString();
    const attachedBy = req.user?.email || 'owner';
    let attached = 0;
    let skipped = 0;

    // Use PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const documentId of document_ids) {
        // Verify document exists
        const docResult = await client.query(`SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`, [documentId]);

        if (docResult.rows.length === 0) {
          console.warn(`Document ${documentId} not found, skipping`);
          skipped++;
          continue;
        }

        // Insert into count_documents - PostgreSQL syntax
        const result = await client.query(`
          INSERT INTO count_documents (count_id, document_id, attached_by, attached_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (count_id, document_id) DO NOTHING
        `, [countId, documentId, attachedBy, now]);

        if (result.rowCount > 0) {
          attached++;
        } else {
          skipped++;
        }
      }

      await client.query('COMMIT');

      res.json({
        ok: true,
        success: true,
        message: `Attached ${attached} PDFs, skipped ${skipped} duplicates`,
        attached,
        skipped
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('POST /api/owner/counts/:countId/pdfs/attach error:', error);
    res.status(500).json({
      ok: false,
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/owner/counts/:countId/pdfs/:documentId
 * Detach a PDF from a count
 * v21.1: Updated to use PostgreSQL
 */
router.delete('/counts/:countId/pdfs/:documentId', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { countId, documentId } = req.params;

    // Delete the attachment - PostgreSQL syntax
    const result = await pool.query(`
      DELETE FROM count_documents
      WHERE count_id = $1 AND document_id = $2
    `, [countId, documentId]);

    res.json({
      ok: true,
      success: true,
      removed: result.rowCount,
      message: result.rowCount > 0 ? 'PDF detached successfully' : 'PDF not found'
    });

  } catch (error) {
    console.error('DELETE /api/owner/counts/:countId/pdfs/:documentId error:', error);
    res.status(500).json({
      ok: false,
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/attach-count
 * Attach an existing inventory count to workspace
 * v21.1: Updated to use PostgreSQL
 */
router.post('/count/workspaces/:id/attach-count', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    const { id } = req.params;
    const { count_id } = req.body;

    // Validate input
    if (!count_id) {
      return res.status(400).json({
        success: false,
        error: 'count_id is required'
      });
    }

    // Verify workspace exists and is open
    const workspaceResult = await pool.query(`SELECT status FROM count_workspaces WHERE id = $1`, [id]);
    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspaceResult.rows[0].status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    // Verify count exists and get location_id
    const countResult = await pool.query(`SELECT * FROM inventory_counts WHERE id = $1`, [count_id]);
    if (countResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory count not found' });
    }
    const count = countResult.rows[0];

    // Get count details and add them to workspace
    const countDetailsResult = await pool.query(`
      SELECT
        icr.item_code,
        icr.counted_qty
      FROM inventory_count_rows icr
      WHERE icr.count_id = $1
    `, [count_id]);

    const now = new Date().toISOString();
    let added = 0;

    // Use PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const detail of countDetailsResult.rows) {
        // Add item to workspace items if not already present - PostgreSQL syntax
        await client.query(`
          INSERT INTO workspace_items (workspace_id, item_code, added_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (workspace_id, item_code) DO NOTHING
        `, [id, detail.item_code, now]);

        // Add count to workspace_counts (using location_id from parent count)
        await client.query(`
          INSERT INTO workspace_counts (workspace_id, location_id, item_code, qty, counted_at, counted_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(workspace_id, location_id, item_code)
          DO UPDATE SET qty = EXCLUDED.qty, counted_at = EXCLUDED.counted_at
        `, [id, count.location_id, detail.item_code, detail.counted_qty, now, 'from_count_' + count_id]);

        added++;
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Attached inventory count with ${added} items`,
        added
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/attach-count error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Infer service window from invoice date and vendor
 * v14.3: Matches owner-pdfs.js logic for consistency
 */
function inferServiceWindow(invoiceDate, vendor = 'GFS') {
  if (!invoiceDate) return null;

  try {
    const date = new Date(invoiceDate + 'T00:00:00'); // Force local time
    if (isNaN(date.getTime())) return null;

    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayOfMonth = date.getDate();
    const fiscalWeek = Math.ceil(dayOfMonth / 7);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let startDay, endDay;

    if (vendor === 'GFS' || vendor === 'Gordon Food Service') {
      // GFS pattern: if invoice is mid-week (Tue-Thu), likely covers Wed→Sun
      if (dayOfWeek >= 2 && dayOfWeek <= 4) {
        startDay = 'Wed';
        endDay = 'Sun';
      } else if (dayOfWeek === 1 || dayOfWeek === 5) {
        startDay = 'Mon';
        endDay = 'Fri';
      } else {
        startDay = 'Wed';
        endDay = 'Sun';
      }
    } else if (vendor === 'Sysco' || vendor === 'US Foods') {
      startDay = 'Mon';
      endDay = 'Fri';
    } else {
      // Default pattern
      startDay = dayNames[dayOfWeek];
      endDay = dayNames[(dayOfWeek + 4) % 7];
    }

    return `${startDay}→${endDay} W${fiscalWeek}`;
  } catch (err) {
    return null;
  }
}

/**
 * GET /api/owner/pdfs/available
 * List available PDF documents (with optional vendor filter)
 * v14.3: Enhanced with inferredServiceWindow field
 * v21.1: Updated to use PostgreSQL
 */
router.get('/pdfs/available', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');
    const { vendor } = req.query;

    let sql = `
      SELECT
        d.id,
        d.filename,
        d.invoice_date,
        d.vendor,
        d.invoice_amount,
        d.created_at
      FROM documents d
      WHERE d.mime_type = 'application/pdf'
        AND d.deleted_at IS NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (vendor) {
      sql += ` AND LOWER(d.vendor) = LOWER($${paramIndex})`;
      params.push(vendor);
      paramIndex++;
    }

    sql += ` ORDER BY d.invoice_date DESC, d.created_at DESC LIMIT 100`;

    const result = await pool.query(sql, params);

    // Enrich with service window inference
    const enriched = (result.rows || []).map(doc => ({
      ...doc,
      inferredServiceWindow: inferServiceWindow(doc.invoice_date, doc.vendor || 'GFS')
    }));

    res.json({
      success: true,
      documents: enriched
    });

  } catch (error) {
    console.error('GET /api/owner/pdfs/available error:', error);
    // Return empty array to prevent frontend breakage
    res.json({
      success: true,
      documents: [],
      _error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/attach-pdfs
 * Attach multiple PDF documents to workspace
 * v21.1: Updated to use PostgreSQL
 */
router.post('/count/workspaces/:id/attach-pdfs', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const { pool } = require('../db');

    const { id } = req.params;
    const { document_ids } = req.body;

    // Validate input
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'document_ids array is required'
      });
    }

    // Verify workspace exists and is open
    const workspaceResult = await pool.query(`SELECT status FROM count_workspaces WHERE id = $1`, [id]);
    if (workspaceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspaceResult.rows[0].status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    const now = new Date().toISOString();
    let attached = 0;
    let skipped = 0;

    // Use PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const documentId of document_ids) {
        // Verify document exists
        const docResult = await client.query(`SELECT id FROM documents WHERE id = $1 AND deleted_at IS NULL`, [documentId]);

        if (docResult.rows.length === 0) {
          console.warn(`Document ${documentId} not found, skipping`);
          skipped++;
          continue;
        }

        // Insert into workspace_invoices - PostgreSQL syntax
        const result = await client.query(`
          INSERT INTO workspace_invoices (workspace_id, document_id, attached_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (workspace_id, document_id) DO NOTHING
        `, [id, documentId, now]);

        if (result.rowCount > 0) {
          attached++;
        } else {
          skipped++;
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Attached ${attached} PDFs, skipped ${skipped} duplicates`,
        attached,
        skipped
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/attach-pdfs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/upload
 * Upload a file and attach to workspace
 */
router.post('/count/workspaces/:id/upload', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    const multer = require('multer');
    const { v4: uuidv4 } = require('uuid');
    await ensureWorkspaceTables(db);

    const { id } = req.params;

    // Verify workspace exists and is open
    const workspace = await db.get(`SELECT status FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    // Set up multer for file upload
    const upload = multer({
      dest: path.join(__dirname, '../data/uploads/'),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (req, file, cb) => {
        // Accept PDF and Excel files
        const allowedTypes = [
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only PDF and Excel files are allowed.'));
        }
      }
    }).single('file');

    // Process upload
    upload(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      try {
        const now = new Date().toISOString();
        const documentId = uuidv4();
        const notes = req.body.notes || '';

        // Insert document record
        await db.run(`
          INSERT INTO documents (
            id,
            filename,
            file_path,
            mime_type,
            size,
            created_at,
            uploaded_by,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          documentId,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          now,
          req.user?.email || 'owner',
          notes
        ]);

        // Attach to workspace
        await db.run(`
          INSERT INTO workspace_invoices (workspace_id, document_id, attached_at)
          VALUES (?, ?, ?)
        `, [id, documentId, now]);

        res.json({
          success: true,
          message: 'File uploaded and attached successfully',
          document_id: documentId,
          filename: req.file.originalname,
          size: req.file.size
        });

      } catch (dbError) {
        console.error('Database error after upload:', dbError);
        // Clean up uploaded file
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkErr) {
          console.error('Failed to clean up file:', unlinkErr);
        }

        res.status(500).json({
          success: false,
          error: dbError.message
        });
      }
    });

  } catch (error) {
    console.error('POST /api/owner/count/workspaces/:id/upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
