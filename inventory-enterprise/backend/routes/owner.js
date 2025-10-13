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

    // v13.5+: Get AI Ops System Health via direct import (no HTTP call)
    let aiOpsHealth = { score: 45, explanations: ['No data available yet'], last_forecast_ts: null, last_learning_ts: null };
    // v14.4: Get AI Intelligence Index
    let aiIntelligenceIndex = { intelligence_index: null, category_scores: {}, last_updated: null };

    try {
      const { computeAIOpsHealth, computeAIIntelligenceIndex } = require('./owner-ops');
      const realtimeBus = require('../utils/realtimeBus');

      // Gather metrics for AI Ops Health computation
      // Get last run timestamps using 3-tier fallback
      let lastForecastTs = null;
      let lastLearningTs = null;

      // Tier 1: Try cron memory
      if (phase3Cron && typeof phase3Cron.getLastRuns === 'function') {
        try {
          const runs = await phase3Cron.getLastRuns();
          lastForecastTs = runs.lastForecastRun;
          lastLearningTs = runs.lastLearningRun;
        } catch (err) {
          console.debug('Cron getLastRuns failed:', err.message);
        }
      }

      // Tier 2: Fallback to breadcrumbs
      if (!lastForecastTs) {
        try {
          const breadcrumb = await db.get(`
            SELECT created_at FROM ai_ops_breadcrumbs
            WHERE action = 'forecast_completed'
            ORDER BY created_at DESC LIMIT 1
          `);
          if (breadcrumb) lastForecastTs = breadcrumb.created_at;
        } catch (err) {
          console.debug('Breadcrumb forecast lookup failed:', err.message);
        }
      }

      if (!lastLearningTs) {
        try {
          const breadcrumb = await db.get(`
            SELECT created_at FROM ai_ops_breadcrumbs
            WHERE action = 'learning_completed'
            ORDER BY created_at DESC LIMIT 1
          `);
          if (breadcrumb) lastLearningTs = breadcrumb.created_at;
        } catch (err) {
          console.debug('Breadcrumb learning lookup failed:', err.message);
        }
      }

      // Tier 3: Fallback to result tables
      if (!lastForecastTs) {
        try {
          const cache = await db.get(`SELECT MAX(created_at) as ts FROM ai_daily_forecast_cache`);
          if (cache?.ts) lastForecastTs = cache.ts;
        } catch (err) {
          console.debug('Forecast cache lookup failed:', err.message);
        }
      }

      if (!lastLearningTs) {
        try {
          const insights = await db.get(`SELECT MAX(created_at) as ts FROM ai_learning_insights`);
          if (insights?.ts) lastLearningTs = insights.ts;
        } catch (err) {
          console.debug('Learning insights lookup failed:', err.message);
        }
      }

      // Get AI confidence (7d with fallbacks)
      let aiConfidenceAvg = null;
      try {
        let conf = await db.get(`
          SELECT ROUND(AVG(confidence) * 100) as avg
          FROM ai_learning_insights
          WHERE created_at >= datetime('now', '-7 days')
            AND confidence IS NOT NULL AND confidence > 0
        `);
        if (conf?.avg) {
          aiConfidenceAvg = conf.avg;
        } else {
          // 30d fallback
          conf = await db.get(`
            SELECT ROUND(AVG(confidence) * 100) as avg
            FROM ai_learning_insights
            WHERE created_at >= datetime('now', '-30 days')
              AND confidence IS NOT NULL AND confidence > 0
          `);
          if (conf?.avg) aiConfidenceAvg = conf.avg;
        }
      } catch (err) {
        console.debug('Confidence lookup failed:', err.message);
      }

      // Get forecast accuracy
      let forecastAccuracy = null;
      try {
        const acc = await db.get(`
          SELECT AVG(accuracy_pct) as avg
          FROM forecast_results
          WHERE created_at >= datetime('now', '-7 days')
        `);
        if (acc?.avg) forecastAccuracy = Math.round(acc.avg);
      } catch (err) {
        console.debug('Accuracy lookup failed:', err.message);
      }

      // Get latencies
      let forecastLatency = null;
      let learningLatency = null;
      try {
        const fLat = await db.get(`
          SELECT AVG(duration_ms) as avg
          FROM ai_ops_breadcrumbs
          WHERE action = 'forecast_completed'
            AND created_at >= datetime('now', '-7 days')
        `);
        if (fLat?.avg) forecastLatency = Math.round(fLat.avg);

        const lLat = await db.get(`
          SELECT AVG(duration_ms) as avg
          FROM ai_ops_breadcrumbs
          WHERE action = 'learning_completed'
            AND created_at >= datetime('now', '-7 days')
        `);
        if (lLat?.avg) learningLatency = Math.round(lLat.avg);
      } catch (err) {
        console.debug('Latency lookup failed:', err.message);
      }

      // Build metrics object
      const metrics = {
        lastForecastTs,
        lastLearningTs,
        aiConfidenceAvg,
        forecastAccuracy,
        forecastLatency,
        learningLatency,
        realtimeStatus: realtimeBus.getStatus()
      };

      // Call computeAIOpsHealth with proper metrics
      aiOpsHealth = await computeAIOpsHealth(db, phase3Cron, metrics);

      // v14.4: Compute AI Intelligence Index
      aiIntelligenceIndex = await computeAIIntelligenceIndex(db);
    } catch (err) {
      console.error('Failed to compute AI Ops Health for dashboard:', err.message);
    }

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
      const result = await db.get(`SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1`);
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
 * v13.x: Enhanced 3-tier fallback (in-memory → breadcrumbs → database → forecast_cache)
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
      console.debug('Phase3Cron.getLastRuns failed:', err.message);
    }
  }

  // Tier 2: Try breadcrumbs table directly (v13.x fix)
  if (!lastForecastRun) {
    try {
      const breadcrumb = await db.get(`
        SELECT ran_at, created_at
        FROM ai_ops_breadcrumbs
        WHERE job = 'ai_forecast'
          AND (ran_at IS NOT NULL OR created_at IS NOT NULL)
        ORDER BY COALESCE(created_at, ran_at) DESC
        LIMIT 1
      `);
      if (breadcrumb) {
        lastForecastRun = breadcrumb.created_at || breadcrumb.ran_at;
      }
    } catch (err) {
      console.debug('Breadcrumb forecast lookup failed:', err.message);
    }
  }

  if (!lastLearningRun) {
    try {
      const breadcrumb = await db.get(`
        SELECT ran_at, created_at
        FROM ai_ops_breadcrumbs
        WHERE job = 'ai_learning'
          AND (ran_at IS NOT NULL OR created_at IS NOT NULL)
        ORDER BY COALESCE(created_at, ran_at) DESC
        LIMIT 1
      `);
      if (breadcrumb) {
        lastLearningRun = breadcrumb.created_at || breadcrumb.ran_at;
      }
    } catch (err) {
      console.debug('Breadcrumb learning lookup failed:', err.message);
    }
  }

  // Tier 3: Fallback to forecast/learning result tables
  if (!lastForecastRun) {
    try {
      const result = await db.get(`SELECT MAX(created_at) AS ts FROM ai_daily_forecast_cache WHERE created_at IS NOT NULL`);
      if (result && result.ts) {
        lastForecastRun = result.ts;
      }
    } catch (err) {
      console.debug('Forecast cache timestamp fallback failed:', err.message);
    }
  }

  if (!lastLearningRun) {
    try {
      const result = await db.get(`SELECT MAX(applied_at) AS ts FROM ai_learning_insights WHERE applied_at IS NOT NULL`);
      if (result && result.ts) {
        lastLearningRun = result.ts;
      }
    } catch (err) {
      console.debug('Learning insights timestamp fallback failed:', err.message);
    }
  }

  // Tier 4: Final fallback - check feedback comments table
  if (!lastLearningRun) {
    try {
      const result = await db.get(`SELECT MAX(created_at) AS ts FROM ai_feedback_comments WHERE created_at IS NOT NULL`);
      if (result && result.ts) {
        lastLearningRun = result.ts;
      }
    } catch (err) {
      console.debug('Feedback comments timestamp fallback failed:', err.message);
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

// ============================================================================
// Locations: Unassigned Items & Multi-Location Assignment
// ============================================================================

/**
 * GET /api/owner/locations/unassigned
 * List all inventory items with no location mapping
 */
router.get('/locations/unassigned', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    const { q = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Ensure unique index exists (idempotent)
    await db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_item_locations_item_loc
      ON item_locations(item_code, location_id)
    `).catch(() => {}); // Ignore if already exists

    // Query unassigned items
    const items = await db.all(`
      SELECT ii.item_code, ii.item_name, ii.unit
      FROM inventory_items ii
      WHERE ii.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM item_locations il
          WHERE il.item_code = ii.item_code AND il.is_active = 1
        )
        AND (
          :q IS NULL OR :q = ''
          OR ii.item_code LIKE '%' || :q || '%'
          OR ii.item_name LIKE '%' || :q || '%'
        )
      ORDER BY ii.item_name
      LIMIT :limit OFFSET :offset
    `, { ':q': q, ':limit': parseInt(limit), ':offset': offset });

    // Get total count for pagination
    const countResult = await db.get(`
      SELECT COUNT(1) AS total
      FROM inventory_items ii
      WHERE ii.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM item_locations il
          WHERE il.item_code = ii.item_code AND il.is_active = 1
        )
        AND (
          :q IS NULL OR :q = ''
          OR ii.item_code LIKE '%' || :q || '%'
          OR ii.item_name LIKE '%' || :q || '%'
        )
    `, { ':q': q });

    res.json({
      success: true,
      items,
      total: countResult.total,
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
 */
router.post('/locations/assign', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
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
    const tenantResult = await db.get(`SELECT id FROM tenants LIMIT 1`);
    const tenantId = tenantResult?.id || 'default';

    let inserted = 0;

    // Transaction for bulk insert
    await db.run('BEGIN TRANSACTION');

    try {
      for (const itemCode of itemCodes) {
        for (const locationId of locationIds) {
          // Generate unique id
          const id = `${itemCode}-${locationId}-${Date.now()}`.substring(0, 255);

          // INSERT OR IGNORE to handle duplicates
          const result = await db.run(`
            INSERT OR IGNORE INTO item_locations (id, tenant_id, location_id, item_code, sequence, is_active)
            VALUES (?, ?, ?, ?, 0, 1)
          `, [id, tenantId, locationId, itemCode]);

          if (result.changes > 0) {
            inserted++;
          }
        }
      }

      await db.run('COMMIT');

      res.json({
        success: true,
        inserted,
        message: `Successfully assigned ${inserted} item-location mappings`
      });

    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
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
 */
router.post('/locations/unassign', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    const { itemCode, locationId } = req.body;

    // Validate input
    if (!itemCode || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'itemCode and locationId are required'
      });
    }

    // Delete the mapping
    const result = await db.run(`
      DELETE FROM item_locations
      WHERE item_code = ? AND location_id = ?
    `, [itemCode, locationId]);

    res.json({
      success: true,
      removed: result.changes,
      message: result.changes > 0 ? 'Mapping removed successfully' : 'Mapping not found'
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
 */
router.post('/count/workspaces/:id/items', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

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
    const workspace = await db.get(`SELECT status FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    let added = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    // Insert items
    for (const itemCode of itemCodes) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO workspace_items (workspace_id, item_code, added_at)
          VALUES (?, ?, ?)
        `, [id, itemCode, now]);

        const changes = await db.get(`SELECT changes() as changes`);
        if (changes.changes > 0) {
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
 */
router.get('/counts/available', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');

    // Get all inventory counts (both open and closed)
    const counts = await db.all(`
      SELECT
        ic.id,
        ic.created_at,
        sl.name as location_name,
        ic.status,
        COUNT(icr.id) as item_count
      FROM inventory_counts ic
      LEFT JOIN storage_locations sl ON sl.id = ic.location_id
      LEFT JOIN inventory_count_rows icr ON icr.count_id = ic.id
      GROUP BY ic.id
      ORDER BY ic.created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      counts: counts || []
    });

  } catch (error) {
    console.error('GET /api/owner/counts/available error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/attach-count
 * Attach an existing inventory count to workspace
 */
router.post('/count/workspaces/:id/attach-count', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

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
    const workspace = await db.get(`SELECT status FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    // Verify count exists and get location_id
    const count = await db.get(`SELECT * FROM inventory_counts WHERE id = ?`, [count_id]);
    if (!count) {
      return res.status(404).json({ success: false, error: 'Inventory count not found' });
    }

    // Get count details and add them to workspace
    const countDetails = await db.all(`
      SELECT
        icr.item_code,
        icr.counted_qty
      FROM inventory_count_rows icr
      WHERE icr.count_id = ?
    `, [count_id]);

    const now = new Date().toISOString();
    let added = 0;

    await db.run('BEGIN TRANSACTION');

    try {
      for (const detail of countDetails) {
        // Add item to workspace items if not already present
        await db.run(`
          INSERT OR IGNORE INTO workspace_items (workspace_id, item_code, added_at)
          VALUES (?, ?, ?)
        `, [id, detail.item_code, now]);

        // Add count to workspace_counts (using location_id from parent count)
        await db.run(`
          INSERT INTO workspace_counts (workspace_id, location_id, item_code, qty, counted_at, counted_by)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(workspace_id, location_id, item_code)
          DO UPDATE SET qty = excluded.qty, counted_at = excluded.counted_at
        `, [id, count.location_id, detail.item_code, detail.counted_qty, now, 'from_count_' + count_id]);

        added++;
      }

      await db.run('COMMIT');

      res.json({
        success: true,
        message: `Attached inventory count with ${added} items`,
        added
      });

    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
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
 */
router.get('/pdfs/available', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
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

    if (vendor) {
      sql += ` AND LOWER(d.vendor) = LOWER(?)`;
      params.push(vendor);
    }

    sql += ` ORDER BY d.invoice_date DESC, d.created_at DESC LIMIT 100`;

    const documents = await db.all(sql, params);

    // Enrich with service window inference
    const enriched = documents.map(doc => ({
      ...doc,
      inferredServiceWindow: inferServiceWindow(doc.invoice_date, doc.vendor || 'GFS')
    }));

    res.json({
      success: true,
      documents: enriched
    });

  } catch (error) {
    console.error('GET /api/owner/pdfs/available error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/count/workspaces/:id/attach-pdfs
 * Attach multiple PDF documents to workspace
 */
router.post('/count/workspaces/:id/attach-pdfs', authenticateToken, requireOwnerAccess, async (req, res) => {
  try {
    const db = require('../config/database');
    await ensureWorkspaceTables(db);

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
    const workspace = await db.get(`SELECT status FROM count_workspaces WHERE id = ?`, [id]);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    if (workspace.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Workspace is closed' });
    }

    const now = new Date().toISOString();
    let attached = 0;
    let skipped = 0;

    await db.run('BEGIN TRANSACTION');

    try {
      for (const documentId of document_ids) {
        // Verify document exists
        const document = await db.get(`SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL`, [documentId]);

        if (!document) {
          console.warn(`Document ${documentId} not found, skipping`);
          skipped++;
          continue;
        }

        // Insert into workspace_invoices
        const result = await db.run(`
          INSERT OR IGNORE INTO workspace_invoices (workspace_id, document_id, attached_at)
          VALUES (?, ?, ?)
        `, [id, documentId, now]);

        if (result.changes > 0) {
          attached++;
        } else {
          skipped++;
        }
      }

      await db.run('COMMIT');

      res.json({
        success: true,
        message: `Attached ${attached} PDFs, skipped ${skipped} duplicates`,
        attached,
        skipped
      });

    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
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
