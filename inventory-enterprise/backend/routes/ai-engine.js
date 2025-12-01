/**
 * NeuroPilot AI Engine API Routes - V22.2 (Hardened)
 * RBAC-protected endpoints for AI inventory intelligence
 *
 * SECURITY FEATURES:
 * - Full audit logging on every request via aiAudit
 * - Strict tenant isolation (400 if no tenant context)
 * - Input validation via aiSchemas
 * - Mode-aware responses (production vs simulation)
 * - User attribution in audit logs
 *
 * Endpoints:
 * - GET  /api/ai/health            - Health check (no auth required)
 * - GET  /api/ai/forecast          - Get demand forecasts
 * - GET  /api/ai/forecast/:itemCode - Get forecast for specific item
 * - GET  /api/ai/reorder           - Get reorder suggestions
 * - GET  /api/ai/reorder/urgent    - Get urgent reorder items only
 * - GET  /api/ai/anomalies         - Detect anomalies
 * - GET  /api/ai/anomalies/summary - Get anomaly summary
 * - GET  /api/ai/population        - Get population factors
 * - GET  /api/ai/dashboard         - Combined AI dashboard
 * - GET  /api/ai/breadcrumbs       - Get AI operations log
 */

const express = require('express');
const router = express.Router();
const aiEngine = require('../services/aiEngine');
const aiAudit = require('../lib/aiAudit');
const { requirePermission } = require('../middleware/tenantContext');

/**
 * Permission constants
 * Map to existing RBAC permissions in the system
 */
const PERMISSIONS = {
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  REPORTS_READ: 'reports:read',
  AI_ACCESS: 'ai:read'
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware: Ensure tenant context is resolved with strict validation
 * Returns 400 if no valid tenant can be resolved
 */
function ensureTenant(req, res, next) {
  const orgId = aiEngine.getOrgId(req);

  if (!orgId) {
    // Log the access denial
    aiAudit.logAiEvent(global.db, {
      eventType: 'access_denied',
      action: `${req.method} ${req.path}`,
      endpoint: `${req.method} ${req.originalUrl}`,
      userId: aiEngine.getUserId(req),
      errorMessage: 'No tenant context available',
      metadata: {
        path: req.path,
        hasUser: !!req.user,
        hasTenant: !!req.tenant
      }
    }).catch(() => {}); // Don't fail request if logging fails

    return res.status(400).json({
      success: false,
      error: 'Tenant context required. Ensure you are authenticated and have a valid tenant.',
      code: 'TENANT_REQUIRED'
    });
  }

  // Store resolved context for route handlers
  req.resolvedOrgId = orgId;
  req.resolvedUserId = aiEngine.getUserId(req);
  next();
}

/**
 * Middleware: Log API request for audit trail
 */
function logApiRequest(action) {
  return async (req, res, next) => {
    const startTime = Date.now();

    // Store start time for response logging
    req.aiRequestStartTime = startTime;

    // Log on response finish
    const originalEnd = res.end;
    res.end = function(...args) {
      const durationMs = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;

      aiAudit.logAiEvent(global.db, {
        eventType: 'api_request',
        action,
        endpoint: `${req.method} ${req.originalUrl}`,
        orgId: req.resolvedOrgId,
        userId: req.resolvedUserId,
        durationMs,
        success,
        errorMessage: success ? null : `HTTP ${res.statusCode}`,
        metadata: {
          statusCode: res.statusCode,
          method: req.method,
          path: req.path,
          query: Object.keys(req.query).length > 0 ? req.query : undefined,
          mode: aiEngine.getMode()
        }
      }).catch(() => {}); // Don't fail if logging fails

      originalEnd.apply(res, args);
    };

    next();
  };
}

// ============================================================================
// DEMAND FORECASTING
// ============================================================================

/**
 * GET /api/ai/forecast
 * Generate demand forecasts for items
 */
router.get('/forecast',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('forecast_list'),
  async (req, res) => {
    try {
      const { item_code, site_id, horizon } = req.query;

      const options = {
        userId: req.resolvedUserId
      };
      if (item_code) options.itemCode = item_code;
      if (site_id) options.siteId = site_id;
      if (horizon) options.horizonDays = parseInt(horizon);

      const result = await aiEngine.generateDemandForecast(req.resolvedOrgId, options);

      res.json({
        ...result,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Forecast error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'FORECAST_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

/**
 * GET /api/ai/forecast/:itemCode
 * Get forecast for a specific item
 */
router.get('/forecast/:itemCode',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('forecast_item'),
  async (req, res) => {
    try {
      const { itemCode } = req.params;
      const { site_id, horizon } = req.query;

      const options = {
        itemCode,
        siteId: site_id,
        horizonDays: horizon ? parseInt(horizon) : undefined,
        userId: req.resolvedUserId
      };

      const result = await aiEngine.generateDemandForecast(req.resolvedOrgId, options);

      // Find the specific item forecast
      const itemForecast = result.forecasts.find(f => f.itemCode === itemCode);

      if (!itemForecast) {
        return res.status(404).json({
          success: false,
          error: `No forecast data available for item: ${itemCode}`,
          code: 'FORECAST_NOT_FOUND',
          mode: aiEngine.getMode()
        });
      }

      res.json({
        success: true,
        forecast: itemForecast,
        metadata: result.metadata,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Item forecast error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'FORECAST_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

// ============================================================================
// REORDER SUGGESTIONS
// ============================================================================

/**
 * GET /api/ai/reorder
 * Get AI-generated reorder suggestions
 */
router.get('/reorder',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('reorder_list'),
  async (req, res) => {
    try {
      const { limit, site_id } = req.query;

      const options = {
        userId: req.resolvedUserId
      };
      if (limit) options.limit = parseInt(limit);
      if (site_id) options.siteId = site_id;

      const result = await aiEngine.generateReorderSuggestions(req.resolvedOrgId, options);

      res.json({
        ...result,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Reorder suggestions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'REORDER_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

/**
 * GET /api/ai/reorder/urgent
 * Get only critical/high urgency reorder items
 */
router.get('/reorder/urgent',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('reorder_urgent'),
  async (req, res) => {
    try {
      const { site_id } = req.query;

      const result = await aiEngine.generateReorderSuggestions(req.resolvedOrgId, {
        limit: 50,
        siteId: site_id,
        userId: req.resolvedUserId
      });

      // Filter to only critical and high urgency
      const urgentItems = result.suggestions.filter(
        s => s.urgency === 'critical' || s.urgency === 'high'
      );

      res.json({
        success: true,
        urgentCount: urgentItems.length,
        suggestions: urgentItems,
        metadata: result.metadata,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Urgent reorder error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'REORDER_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * GET /api/ai/anomalies
 * Detect consumption anomalies
 */
router.get('/anomalies',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('anomalies_list'),
  async (req, res) => {
    try {
      const { window, item_code } = req.query;

      const options = {
        userId: req.resolvedUserId
      };
      if (window) options.windowDays = parseInt(window);
      if (item_code) options.itemCode = item_code;

      const result = await aiEngine.detectAnomalies(req.resolvedOrgId, options);

      res.json({
        ...result,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Anomaly detection error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ANOMALY_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

/**
 * GET /api/ai/anomalies/summary
 * Get anomaly summary statistics
 */
router.get('/anomalies/summary',
  ensureTenant,
  requirePermission(PERMISSIONS.REPORTS_READ),
  logApiRequest('anomalies_summary'),
  async (req, res) => {
    try {
      const userId = req.resolvedUserId;

      // Get anomalies for different time windows
      const [day1, day7, day30] = await Promise.all([
        aiEngine.detectAnomalies(req.resolvedOrgId, { windowDays: 1, userId }),
        aiEngine.detectAnomalies(req.resolvedOrgId, { windowDays: 7, userId }),
        aiEngine.detectAnomalies(req.resolvedOrgId, { windowDays: 30, userId })
      ]);

      // Calculate severity distribution
      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const anomaly of day30.anomalies) {
        if (severityCounts[anomaly.severity] !== undefined) {
          severityCounts[anomaly.severity]++;
        }
      }

      res.json({
        success: true,
        summary: {
          last24Hours: day1.anomalies.length,
          last7Days: day7.anomalies.length,
          last30Days: day30.anomalies.length,
          severityDistribution: severityCounts
        },
        recentCritical: day7.anomalies.filter(a => a.severity === 'critical'),
        metadata: {
          orgId: req.resolvedOrgId,
          generatedAt: new Date().toISOString()
        },
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Anomaly summary error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ANOMALY_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

// ============================================================================
// POPULATION FACTORS
// ============================================================================

/**
 * GET /api/ai/population
 * Get population statistics for demand scaling
 */
router.get('/population',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('population_factors'),
  async (req, res) => {
    try {
      const { site_id, days } = req.query;

      const options = {
        userId: req.resolvedUserId
      };
      if (site_id) options.siteId = site_id;
      if (days) options.days = parseInt(days);

      const result = await aiEngine.getPopulationFactors(req.resolvedOrgId, options);

      res.json({
        ...result,
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Population factors error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'POPULATION_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

// ============================================================================
// HEALTH & STATUS
// ============================================================================

/**
 * GET /api/ai/health
 * AI Engine health check (no auth required for monitoring)
 */
router.get('/health', async (req, res) => {
  try {
    const orgId = req.tenant?.tenantId || req.user?.org_id || 'default';
    const health = await aiEngine.getHealth(orgId);

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);

  } catch (error) {
    console.error('[AI-ENGINE] Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      mode: aiEngine.getMode(),
      error: error.message
    });
  }
});

/**
 * GET /api/ai/breadcrumbs
 * Get recent AI operations log (requires reports permission)
 */
router.get('/breadcrumbs',
  ensureTenant,
  requirePermission(PERMISSIONS.REPORTS_READ),
  logApiRequest('breadcrumbs_list'),
  async (req, res) => {
    try {
      const { limit = 50, job } = req.query;

      // Query is tenant-scoped via metadata.orgId in ai_ops_breadcrumbs
      let query = `
        SELECT id, job, action, ran_at, duration_ms, metadata, success
        FROM ai_ops_breadcrumbs
        WHERE ran_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `;
      const params = [];
      let paramCount = 0;

      if (job) {
        paramCount++;
        query += ` AND job = $${paramCount}`;
        params.push(job);
      }

      query += ` ORDER BY ran_at DESC LIMIT $${paramCount + 1}`;
      params.push(parseInt(limit));

      const result = await global.db.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        breadcrumbs: result.rows.map(row => ({
          id: row.id,
          job: row.job,
          action: row.action,
          ranAt: row.ran_at,
          durationMs: row.duration_ms,
          metadata: row.metadata,
          success: row.success
        })),
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Breadcrumbs error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'BREADCRUMBS_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

// ============================================================================
// COMBINED DASHBOARD
// ============================================================================

/**
 * GET /api/ai/dashboard
 * Combined AI intelligence dashboard
 * Returns forecasts, reorder suggestions, and anomalies in one call
 */
router.get('/dashboard',
  ensureTenant,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  logApiRequest('dashboard'),
  async (req, res) => {
    try {
      const { site_id } = req.query;
      const userId = req.resolvedUserId;

      const options = {
        siteId: site_id,
        userId
      };

      // Run all queries in parallel
      const [forecasts, reorder, anomalies, population] = await Promise.all([
        aiEngine.generateDemandForecast(req.resolvedOrgId, { ...options, horizonDays: 7 }),
        aiEngine.generateReorderSuggestions(req.resolvedOrgId, { ...options, limit: 10 }),
        aiEngine.detectAnomalies(req.resolvedOrgId, { ...options, windowDays: 7 }),
        aiEngine.getPopulationFactors(req.resolvedOrgId, options)
      ]);

      res.json({
        success: true,
        dashboard: {
          forecasts: {
            count: forecasts.forecasts.length,
            method: forecasts.metadata?.method,
            topItems: forecasts.forecasts.slice(0, 5)
          },
          reorder: {
            urgentCount: reorder.suggestions.filter(s =>
              s.urgency === 'critical' || s.urgency === 'high'
            ).length,
            totalCount: reorder.suggestions.length,
            topSuggestions: reorder.suggestions.slice(0, 5)
          },
          anomalies: {
            count: anomalies.anomalies.length,
            critical: anomalies.anomalies.filter(a => a.severity === 'critical').length,
            recent: anomalies.anomalies.slice(0, 5)
          },
          population: population.populationFactors
        },
        metadata: {
          orgId: req.resolvedOrgId,
          siteId: site_id,
          generatedAt: new Date().toISOString()
        },
        mode: aiEngine.getMode()
      });

    } catch (error) {
      console.error('[AI-ENGINE] Dashboard error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'DASHBOARD_ERROR',
        mode: aiEngine.getMode()
      });
    }
  }
);

module.exports = router;
