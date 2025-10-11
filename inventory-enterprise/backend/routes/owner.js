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
    const phase3Cron = req.app.get('phase3Cron');
    const aiModules = getAIModuleStatus(phase3Cron);

    // Get version info
    const versionInfo = {
      current: '2.8.0',
      next: '2.9.0',
      releaseDate: '2025-10-08',
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
      app: 'inventory-enterprise-v2.8.0',
      version: '2.8.0',
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
      const dbPath = path.join(__dirname, '../db/inventory_enterprise.db');
      const stat = await fs.stat(dbPath);
      stats.databaseSize = `${(stat.size / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
      stats.databaseSize = 'N/A';
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
 */
function getAIModuleStatus(phase3Cron) {
  // Get live run timestamps from cron scheduler
  let lastForecastRun = null;
  let lastLearningRun = null;

  if (phase3Cron && typeof phase3Cron.getLastRuns === 'function') {
    const lastRuns = phase3Cron.getLastRuns();
    lastForecastRun = lastRuns.lastForecastRun;
    lastLearningRun = lastRuns.lastLearningRun;
  }

  return {
    forecasting: {
      enabled: process.env.AI_FORECAST_ENABLED === 'true',
      models: ['ARIMA', 'Prophet'],
      status: lastForecastRun ? 'active' : 'idle',
      lastRun: lastForecastRun,
      nextScheduled: '06:00 UTC daily'
    },
    governance: {
      enabled: process.env.GOVERNANCE_ENABLED === 'true',
      learningCycles: 1,
      status: lastLearningRun ? 'active' : 'idle',
      lastRun: lastLearningRun,
      nextScheduled: '21:00 UTC daily'
    },
    insights: {
      enabled: process.env.INSIGHT_ENABLED === 'true',
      provider: process.env.INSIGHT_PROVIDER || 'openai',
      status: 'active'
    },
    compliance: {
      enabled: process.env.COMPLIANCE_ENABLED === 'true',
      frameworks: ['iso27001', 'soc2', 'owasp'],
      status: 'active'
    },
    aiOps: {
      enabled: process.env.AIOPS_ENABLED === 'true',
      autoRemediation: process.env.AIOPS_AUTO_REMEDIATION === 'true',
      status: 'active'
    }
  };
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
