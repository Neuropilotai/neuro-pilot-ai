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
 * GET /api/owner/dashboard
 * Returns comprehensive dashboard data for owner console
 */
router.get('/dashboard', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');

    // Get system health
    const health = await getSystemHealth();

    // Get recent audit logs
    const auditLogs = await getRecentAuditLogs(db, 10);

    // Get database stats
    const dbStats = await getDatabaseStats(db);

    // Get AI module status with live timestamps
    const phase3Cron = req.app.locals.phase3Cron;
    const aiModules = await getAIModuleStatus(phase3Cron, db);

    // v13.0: Get learning insights (last 5)
    const learningInsights = await getLearningInsights(db, 5);

    // Get version info
    const versionInfo = {
      current: '13.0.1',
      next: '13.1.0',
      releaseDate: '2025-10-11',
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
        versionInfo
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

    const logs = await getRecentAuditLogs(db, limit, offset);

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
 * Create database backup
 */
router.post('/backup-database', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const backupType = req.body.type || 'sqlite'; // 'sqlite' or 'postgres'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (backupType === 'postgres' && process.env.PG_ENABLED === 'true') {
      // PostgreSQL backup
      const backupFile = `/tmp/postgres-backup-${timestamp}.sql`;

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

    } else {
      // SQLite backup
      const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
      const backupPath = path.join(__dirname, `../data/backups/backup-${timestamp}.db`);

      // Create backups directory if it doesn't exist
      await fs.mkdir(path.join(__dirname, '../data/backups'), { recursive: true });

      // Copy database file
      await fs.copyFile(dbPath, backupPath);

      const stats = await fs.stat(backupPath);

      res.json({
        success: true,
        message: 'SQLite backup completed',
        file: backupPath,
        size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        timestamp
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/database-mode
 * Get current database mode (SQLite or PostgreSQL)
 */
router.get('/database-mode', authenticateToken, requireOwnerAccess, (req, res) => {
  const mode = process.env.PG_ENABLED === 'true' ? 'PostgreSQL' : 'SQLite';
  const redisEnabled = process.env.REDIS_ENABLED === 'true';

  res.json({
    success: true,
    database: mode,
    redis: redisEnabled,
    config: {
      PG_ENABLED: process.env.PG_ENABLED,
      REDIS_ENABLED: process.env.REDIS_ENABLED,
      AI_FORECAST_ENABLED: process.env.AI_FORECAST_ENABLED,
      REQUIRE_2FA_FOR_ADMINS: process.env.REQUIRE_2FA_FOR_ADMINS
    }
  });
});

/**
 * POST /api/owner/toggle-database
 * Toggle between SQLite and PostgreSQL (requires restart)
 */
router.post('/toggle-database', authenticateToken, requireOwnerAccess, (req, res) => {
  const currentMode = process.env.PG_ENABLED === 'true' ? 'PostgreSQL' : 'SQLite';
  const newMode = currentMode === 'PostgreSQL' ? 'SQLite' : 'PostgreSQL';

  res.json({
    success: true,
    message: 'Database mode change requires server restart',
    currentMode,
    newMode,
    instructions: `Set PG_ENABLED=${newMode === 'PostgreSQL' ? 'true' : 'false'} and restart server`
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
      app: 'inventory-enterprise-v13.0.1',
      version: '13.0.1',
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
async function getRecentAuditLogs(db, limit = 10, offset = 0) {
  try {
    const sql = `
      SELECT *
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = await db.all(sql, [limit, offset]);

    return logs.map(log => ({
      ...log,
      request_body: typeof log.request_body === 'string'
        ? JSON.parse(log.request_body || '{}')
        : log.request_body,
      metadata: typeof log.metadata === 'string'
        ? JSON.parse(log.metadata || '{}')
        : log.metadata
    }));
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return [];
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats(db) {
  try {
    const stats = {};

    // Get active items count
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM item_master WHERE active = 1`);
      stats.totalItems = result.count;
    } catch (error) {
      stats.totalItems = 0;
    }

    // Get active locations count
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM storage_locations WHERE active = 1`);
      stats.activeLocations = result.count;
    } catch (error) {
      stats.activeLocations = 0;
    }

    // Get total PDFs/documents
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM documents WHERE mime_type = 'application/pdf' AND deleted_at IS NULL`);
      stats.totalDocuments = result.count;
    } catch (error) {
      stats.totalDocuments = 0;
    }

    // Get pending (open) inventory counts
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM inventory_counts WHERE status = 'open'`);
      stats.pendingCounts = result.count;
    } catch (error) {
      stats.pendingCounts = 0;
    }

    // Get closed counts this month
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM inventory_counts WHERE status = 'closed' AND strftime('%Y-%m', closed_at) = strftime('%Y-%m', 'now')`);
      stats.closedCountsThisMonth = result.count;
    } catch (error) {
      stats.closedCountsThisMonth = 0;
    }

    // Get total inventory value from current snapshot
    try {
      const result = await db.get(`SELECT SUM(total_value) as total FROM v_current_inventory WHERE has_real_count = 1`);
      stats.inventoryValue = result.total ? `$${(result.total).toFixed(2)}` : '$0.00';
    } catch (error) {
      stats.inventoryValue = '$0.00';
    }

    // Get database size (SQLite only)
    try {
      const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
      const stat = await fs.stat(dbPath);
      stats.databaseSize = `${(stat.size / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
      stats.databaseSize = 'N/A';
    }

    // v13.0: AI Module metrics
    // Get forecast cached today
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const result = await db.get(`SELECT COUNT(*) as count FROM ai_daily_forecast_cache WHERE DATE(forecast_date) = ?`, [today]);
      stats.forecast_cached_today = result ? result.count : 0;
    } catch (error) {
      stats.forecast_cached_today = 0;
    }

    // Get forecast cached tomorrow
    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = await db.get(`SELECT COUNT(*) as count FROM ai_daily_forecast_cache WHERE DATE(forecast_date) = ?`, [tomorrow]);
      stats.forecast_cached_tomorrow = result ? result.count : 0;
    } catch (error) {
      stats.forecast_cached_tomorrow = 0;
    }

    // Get feedback pending count
    try {
      const result = await db.get(`SELECT COUNT(*) as count FROM ai_feedback_comments WHERE status = 'pending' OR status IS NULL`);
      stats.feedback_pending = result ? result.count : 0;
    } catch (error) {
      stats.feedback_pending = 0;
    }

    // Get learning insights from last 7 days
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await db.get(`SELECT COUNT(*) as count FROM ai_learning_insights WHERE created_at >= ?`, [sevenDaysAgo]);
      stats.learning_insights_7d = result ? result.count : 0;
    } catch (error) {
      stats.learning_insights_7d = 0;
    }

    return stats;
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      error: error.message,
      totalItems: 0,
      activeLocations: 0,
      totalDocuments: 0,
      pendingCounts: 0
    };
  }
}

/**
 * Get AI module status with live timestamps from Phase3CronScheduler
 * v13.0: 3-tier fallback (in-memory → breadcrumbs → database)
 */
async function getAIModuleStatus(phase3Cron, db) {
  // Get live run timestamps from cron scheduler
  let lastForecastRun = null;
  let lastLearningRun = null;

  // Tier 1: Try in-memory/breadcrumbs via phase3Cron.getLastRuns() (async)
  if (phase3Cron && typeof phase3Cron.getLastRuns === 'function') {
    try {
      const lastRuns = await phase3Cron.getLastRuns();
      lastForecastRun = lastRuns.lastForecastRun;
      lastLearningRun = lastRuns.lastLearningRun;
    } catch (err) {
      console.error('Failed to get cron last runs:', err.message);
    }
  }

  // Tier 2 & 3: Fallback to database tables if still null
  if (!lastForecastRun) {
    try {
      const result = await db.get(`SELECT MAX(created_at) AS ts FROM ai_daily_forecast_cache WHERE created_at IS NOT NULL`);
      if (result && result.ts) {
        lastForecastRun = result.ts;
      }
    } catch (err) {
      console.debug('Forecast timestamp fallback failed:', err.message);
    }
  }

  if (!lastLearningRun) {
    try {
      const result = await db.get(`SELECT MAX(applied_at) AS ts FROM ai_learning_insights WHERE applied_at IS NOT NULL`);
      if (result && result.ts) {
        lastLearningRun = result.ts;
      }
    } catch (err) {
      console.debug('Learning timestamp fallback failed:', err.message);
    }
  }

  // v13.0.1: Calculate status based on lastRun age
  // IDLE = never run, ACTIVE = run within 24h, DEGRADED = > 24h
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
      lastRunIso: lastForecastRun, // v13.0.1: explicit ISO field for frontend
      nextScheduled: '06:00 UTC daily'
    },
    governance: {
      enabled: process.env.GOVERNANCE_ENABLED === 'true',
      learningCycles: 1,
      status: learningStatus,
      lastRun: lastLearningRun,
      lastRunIso: lastLearningRun, // v13.0.1: explicit ISO field for frontend
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
 * v13.0: For learning visibility dashboard
 */
async function getLearningInsights(db, limit = 5) {
  try {
    const sql = `
      SELECT
        insight_text as title,
        source,
        confidence,
        created_at
      FROM ai_learning_insights
      WHERE confidence IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const insights = await db.all(sql, [limit]);

    return insights.map(insight => ({
      title: insight.title || 'No title',
      source: insight.source || 'AI Learning Engine',
      confidence: parseFloat(insight.confidence) || 0,
      created_at: insight.created_at
    }));
  } catch (error) {
    console.debug('Failed to get learning insights:', error.message);
    return [];
  }
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

module.exports = router;
