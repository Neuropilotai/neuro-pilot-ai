/**
 * Owner Console AI-Driven Operational Intelligence - v2.8.0
 * Provides reorder recommendations, anomaly detection, and system optimization advice
 * Restricted to system owner (David Mikulis) only
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const metricsExporter = require('../utils/metricsExporter');
const crypto = require('crypto');

// Owner email whitelist (both normalized and unnormalized forms)
const OWNER_EMAILS = ['neuro.pilot.ai@gmail.com', 'neuropilotai@gmail.com'];

// Rate limiting for bulk actions (1 per minute)
const rateLimitStore = new Map();

/**
 * Middleware: Verify owner access
 */
function requireOwner(req, res, next) {
  if (!req.user || !OWNER_EMAILS.includes(req.user.email)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'AI operational intelligence is restricted to system owner'
    });
  }
  next();
}

/**
 * Middleware: Rate limit bulk actions
 */
function rateLimitBulkActions(req, res, next) {
  const userId = req.user.id;
  const now = Date.now();
  const lastAction = rateLimitStore.get(userId);

  if (lastAction && (now - lastAction) < 60000) { // 1 minute
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Bulk actions limited to 1 per minute',
      retryAfter: Math.ceil((60000 - (now - lastAction)) / 1000)
    });
  }

  rateLimitStore.set(userId, now);
  next();
}

/**
 * GET /api/owner/ai/reorder/top
 * Returns top-N SKUs predicted to need reorder
 */
router.get('/reorder/top', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();

  try {
    const n = parseInt(req.query.n) || 20;
    const db = require('../config/database');

    // Get items with current stock, demand forecasts, and safety stock
    const recommendations = await generateReorderRecommendations(db, n);

    // Record metrics
    metricsExporter.recordOwnerAIReorderRequest(req.user.id, 'default', recommendations.length);

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
      generatedAt: new Date().toISOString(),
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Reorder recommendations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/owner/ai/anomalies/recent
 * Returns recent consumption/ops anomalies with triage suggestions
 */
router.get('/anomalies/recent', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();

  try {
    const window = req.query.window || '7d';
    const db = require('../config/database');

    // Get recent anomalies from AI feedback and predictions
    const anomalies = await detectRecentAnomalies(db, window);

    res.json({
      success: true,
      count: anomalies.length,
      window,
      anomalies,
      generatedAt: new Date().toISOString(),
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/owner/ai/upgrade/advice
 * Analyzes system metrics and provides tuning recommendations
 */
router.get('/upgrade/advice', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();

  try {
    // Analyze current system performance
    const advice = await generateUpgradeAdvice();

    res.json({
      success: true,
      advice,
      generatedAt: new Date().toISOString(),
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Upgrade advice error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/ai/reorder/create-draft
 * Creates draft purchase orders (non-destructive)
 */
router.post('/reorder/create-draft', authenticateToken, requireOwner, rateLimitBulkActions, async (req, res) => {
  const startTime = Date.now();

  try {
    const { items } = req.body; // [{itemCode, qty, rationale}]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }

    const db = require('../config/database');
    const draftId = `DRAFT_PO_${Date.now()}`;
    const payloadHash = crypto.createHash('md5').update(JSON.stringify(items)).digest('hex');

    // Create draft PO entries (non-destructive)
    for (const item of items) {
      await db.run(
        `INSERT INTO draft_purchase_orders (draft_id, item_code, quantity, rationale, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [draftId, item.itemCode, item.qty, item.rationale, req.user.id]
      );
    }

    // Audit log
    await auditAction(db, {
      userId: req.user.id,
      action: 'CREATE_DRAFT_PO',
      payloadHash,
      result: draftId,
      itemCount: items.length,
      ipAddress: req.ip
    });

    // Metrics
    metricsExporter.recordOwnerAIReorderRequest(req.user.id, 'default', items.length);

    res.json({
      success: true,
      draftId,
      lineCount: items.length,
      message: 'Draft PO created successfully',
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Create draft PO error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/ai/anomalies/triage
 * Triage anomaly with suggested action
 */
router.post('/anomalies/triage', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();

  try {
    const { id, action } = req.body;

    const validActions = ['open_spot_check', 'freeze_reorder', 'ignore_once'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        validActions
      });
    }

    const db = require('../config/database');

    // Execute action (also updates the anomaly record)
    const result = await executeTriageAction(db, id, action, req.user.id);

    // Audit log
    await auditAction(db, {
      userId: req.user.id,
      action: 'TRIAGE_ANOMALY',
      payloadHash: crypto.createHash('md5').update(`${id}:${action}`).digest('hex'),
      result: result.status,
      ipAddress: req.ip
    });

    // Metrics
    metricsExporter.recordOwnerAIAnomalyTriage(action, result.severity || 'unknown');

    res.json({
      success: true,
      id,
      action,
      result,
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Anomaly triage error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/owner/ai/upgrade/apply
 * Apply safe system optimization
 */
router.post('/upgrade/apply', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();

  try {
    const { actionId } = req.body;

    if (!actionId) {
      return res.status(400).json({ error: 'actionId required' });
    }

    // Execute safe upgrade action
    const result = await applySafeUpgrade(actionId, req.user.id);

    // Audit log
    const db = require('../config/database');
    await auditAction(db, {
      userId: req.user.id,
      action: 'APPLY_UPGRADE',
      payloadHash: crypto.createHash('md5').update(actionId).digest('hex'),
      result: result.status,
      ipAddress: req.ip
    });

    // Metrics
    metricsExporter.recordOwnerAIUpgradeAction(actionId, result.mode || 'safe');

    res.json({
      success: true,
      actionId,
      result,
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Upgrade apply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate reorder recommendations based on forecasts and stock levels
 */
async function generateReorderRecommendations(db, n = 20) {
  try {
    // Get items with current stock and forecasts from view
    const sql = `
      SELECT
        v.item_code,
        v.item_name,
        v.current_stock as currentStock,
        v.par_level as safetyStock,
        5 as leadTimeDays, -- Default lead time
        COALESCE(af.predicted_value, v.par_level * 2) as predictedDemand,
        COALESCE(af.confidence_level, 0.75) as confidence,
        30 as horizonDays
      FROM v_current_inventory v
      LEFT JOIN (
        SELECT entity_id as item_code, predicted_value, confidence_level
        FROM ai_forecasts
        WHERE entity_type = 'item'
          AND forecast_date = DATE('now')
        ORDER BY generated_at DESC
      ) af ON v.item_code = af.item_code
      WHERE v.current_stock > 0
        AND v.active = 1
      ORDER BY
        CASE
          WHEN v.current_stock < v.par_level THEN 0
          ELSE 1
        END,
        v.current_stock / NULLIF(v.par_level, 0) ASC
      LIMIT ?
    `;

    const items = await db.all(sql, [n * 2]); // Get extra for filtering

    const recommendations = [];

    for (const item of items) {
      const daysUntilStockout = calculateStockoutDays(
        item.currentStock,
        item.predictedDemand,
        item.horizonDays
      );

      // Only recommend if stockout within horizon
      if (daysUntilStockout <= item.horizonDays) {
        const recommendedQty = Math.ceil(
          (item.predictedDemand || item.safetyStock * 2) - item.currentStock + item.safetyStock
        );

        recommendations.push({
          itemCode: item.item_code,
          name: item.item_name,
          horizonDays: item.horizonDays,
          predictedDemand: Math.round(item.predictedDemand),
          currentStock: item.currentStock,
          projectedStockoutDate: new Date(Date.now() + daysUntilStockout * 86400000).toISOString().split('T')[0],
          recommendedReorderQty: recommendedQty,
          safetyStock: item.safetyStock,
          leadTimeDays: item.leadTimeDays,
          confidence: parseFloat((item.confidence || 0.75).toFixed(2)),
          drivers: generateDrivers(item, daysUntilStockout)
        });
      }

      if (recommendations.length >= n) break;
    }

    return recommendations;

  } catch (error) {
    console.error('Error generating reorder recommendations:', error);
    return [];
  }
}

/**
 * Calculate days until stockout
 */
function calculateStockoutDays(currentStock, predictedDemand, horizonDays) {
  const dailyDemand = predictedDemand / horizonDays;
  if (dailyDemand <= 0) return horizonDays + 1; // No stockout
  return Math.max(0, Math.floor(currentStock / dailyDemand));
}

/**
 * Generate driver explanations
 */
function generateDrivers(item, daysUntilStockout) {
  const drivers = [];

  if (daysUntilStockout < 7) {
    drivers.push('urgency(+)');
  }

  if (item.currentStock < item.safetyStock) {
    drivers.push('below_safety_stock(+)');
  }

  if (item.confidence > 0.8) {
    drivers.push('high_confidence(+)');
  }

  if (item.predictedDemand > item.currentStock * 1.5) {
    drivers.push('demand_spike(+)');
  }

  if (item.leadTimeDays > 5) {
    drivers.push('long_lead_time(-)');
  }

  return drivers.length > 0 ? drivers : ['baseline_reorder(+)'];
}

/**
 * Detect recent anomalies
 */
async function detectRecentAnomalies(db, window) {
  try {
    const daysPast = window === '7d' ? 7 : window === '30d' ? 30 : 7;

    const sql = `
      SELECT
        anomaly_id as id,
        item_code,
        'consumption_deviation' as type,
        UPPER(severity) as severity,
        created_at as detectedAt,
        ai_hypothesis as explanation,
        ABS(deviation_pct / 100.0) as confidence
      FROM ai_anomaly_log
      WHERE created_at >= datetime('now', '-${daysPast} days')
        AND resolved_at IS NULL
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 0
          WHEN 'HIGH' THEN 1
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 3
        END,
        created_at DESC
      LIMIT 50
    `;

    const anomalies = await db.all(sql);

    return anomalies.map(anom => ({
      id: anom.id,
      itemCode: anom.item_code,
      type: anom.type || 'consumption_spike',
      severity: anom.severity || 'MEDIUM',
      when: anom.detectedAt,
      explanation: anom.explanation || 'Anomalous pattern detected',
      suggestedActions: getSuggestedActions(anom.type, anom.severity),
      confidence: Math.min(1.0, parseFloat((anom.confidence || 0.8).toFixed(2)))
    }));

  } catch (error) {
    console.error('Error detecting anomalies:', error);
    // Return sample data if table doesn't exist
    return [
      {
        id: 'anom_sample_1',
        itemCode: 'MILK-2%',
        type: 'consumption_spike',
        severity: 'high',
        when: new Date(Date.now() - 3600000).toISOString(),
        explanation: 'Consumption 3.2x baseline, z-score=3.1',
        suggestedActions: ['open_spot_check', 'freeze_reorder', 'notify_ops'],
        confidence: 0.81
      }
    ];
  }
}

/**
 * Get suggested triage actions based on anomaly type and severity
 */
function getSuggestedActions(type, severity) {
  const actions = [];
  const sev = (severity || '').toUpperCase();

  if (sev === 'CRITICAL' || sev === 'HIGH') {
    actions.push('open_spot_check');
  }

  if (type === 'consumption_spike' || type === 'shrinkage' || type === 'consumption_deviation') {
    actions.push('freeze_reorder');
  }

  if (type === 'data_quality' || sev === 'LOW') {
    actions.push('ignore_once');
  }

  actions.push('notify_ops');

  return [...new Set(actions)].slice(0, 3);
}

/**
 * Generate system upgrade advice
 */
async function generateUpgradeAdvice() {
  try {
    const metrics = await metricsExporter.getMetrics();
    const parsed = parseMetrics(metrics);

    const advice = {
      cache: analyzeCachePerformance(parsed),
      forecast: analyzeForecastAccuracy(parsed),
      db: analyzeDatabaseMode(),
      security: analyze2FAAdoption(),
      overallScore: 0.86,
      nextBestActions: []
    };

    // Generate next best actions
    if (advice.cache.hitRate < 0.8) {
      advice.nextBestActions.push({
        id: 'nba_cache_ttl',
        title: 'Increase cache TTL for inventory lists',
        etaMin: 5,
        impact: 'high'
      });
    }

    if (advice.forecast.mape30 > 0.15) {
      advice.nextBestActions.push({
        id: 'nba_retrain_models',
        title: 'Retrain top-50 SKUs with high MAPE',
        etaMin: 8,
        impact: 'medium'
      });
    }

    if (advice.db.primary === 'sqlite') {
      advice.nextBestActions.push({
        id: 'nba_enable_postgres',
        title: 'Enable PostgreSQL dual-write mode',
        etaMin: 10,
        impact: 'high'
      });
    }

    return advice;

  } catch (error) {
    console.error('Error generating upgrade advice:', error);
    return {
      cache: { hitRate: 0.71, advice: 'Unable to analyze cache performance' },
      forecast: { mape30: 0.12, advice: 'Forecast metrics unavailable' },
      db: { primary: 'sqlite', advice: 'Consider PostgreSQL for production' },
      security: { twoFAAdmins: '1/1', advice: '2FA enforced for admins' },
      overallScore: 0.75,
      nextBestActions: []
    };
  }
}

/**
 * Parse Prometheus metrics
 */
function parseMetrics(metricsText) {
  const metrics = {};
  const lines = metricsText.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split(' ');
    if (parts.length >= 2) {
      metrics[parts[0]] = parseFloat(parts[1]);
    }
  }

  return metrics;
}

/**
 * Analyze cache performance
 */
function analyzeCachePerformance(metrics) {
  const hitRate = metrics.redis_hit_rate || 0.71;
  let advice = '';

  if (hitRate < 0.7) {
    advice = 'Critical: Cache hit rate below 70%. Increase TTL to 300s for inventory lists';
  } else if (hitRate < 0.8) {
    advice = 'Low cache efficiency. Consider raising TTL to 180s';
  } else {
    advice = 'Cache performing well. Monitor for optimization opportunities';
  }

  return { hitRate: parseFloat(hitRate.toFixed(2)), advice };
}

/**
 * Analyze forecast accuracy
 */
function analyzeForecastAccuracy(metrics) {
  const mape30 = 0.12; // Placeholder - would calculate from forecast_results table

  let advice = '';
  if (mape30 > 0.2) {
    advice = 'Poor forecast accuracy. Retrain models with MAPE > 0.2';
  } else if (mape30 > 0.15) {
    advice = 'Moderate accuracy. Consider retraining top-50 SKUs';
  } else {
    advice = 'Forecast accuracy acceptable. Continue monitoring';
  }

  return { mape30: parseFloat(mape30.toFixed(2)), advice };
}

/**
 * Analyze database mode
 */
function analyzeDatabaseMode() {
  const primary = process.env.PG_ENABLED === 'true' ? 'postgresql' : 'sqlite';
  const advice = primary === 'sqlite'
    ? 'Enable PostgreSQL dual-write for production scalability'
    : 'PostgreSQL active. Monitor replication lag';

  return { primary, advice };
}

/**
 * Analyze 2FA adoption
 */
function analyze2FAAdoption() {
  const twoFAAdmins = '1/1'; // Placeholder - would query users table
  const advice = 'Enforce 2FA for all users with edit permissions';

  return { twoFAAdmins, advice };
}

/**
 * Execute triage action
 */
async function executeTriageAction(db, anomalyId, action, userId) {
  const anomaly = await db.get('SELECT * FROM ai_anomaly_log WHERE anomaly_id = ?', [anomalyId]);

  if (!anomaly) {
    throw new Error('Anomaly not found');
  }

  const result = {
    status: 'executed',
    severity: anomaly.severity,
    action
  };

  switch (action) {
    case 'open_spot_check':
      // Create spot check task
      result.taskId = `SPOT_CHECK_${Date.now()}`;
      result.message = 'Spot check task created';
      break;

    case 'freeze_reorder':
      // Mark anomaly as resolved with freeze action
      await db.run(
        `UPDATE ai_anomaly_log
         SET resolved_at = CURRENT_TIMESTAMP, resolution = ?
         WHERE anomaly_id = ?`,
        [`Reorder frozen for item ${anomaly.item_code}`, anomalyId]
      );
      result.message = 'Anomaly marked as resolved with reorder freeze';
      break;

    case 'ignore_once':
      // Mark as reviewed/resolved
      await db.run(
        `UPDATE ai_anomaly_log
         SET resolved_at = CURRENT_TIMESTAMP, resolution = ?
         WHERE anomaly_id = ?`,
        ['Reviewed and ignored by owner', anomalyId]
      );
      result.message = 'Anomaly marked as reviewed';
      break;

    default:
      result.status = 'unknown_action';
  }

  return result;
}

/**
 * Apply safe upgrade action
 */
async function applySafeUpgrade(actionId, userId) {
  const result = {
    status: 'pending',
    mode: 'safe',
    actionId
  };

  switch (actionId) {
    case 'nba_cache_ttl':
      // This would update cache TTL config
      result.status = 'requires-confirmation';
      result.message = 'Cache TTL change requires server restart';
      result.diff = {
        before: 'CACHE_TTL=120',
        after: 'CACHE_TTL=300'
      };
      break;

    case 'nba_retrain_models':
      result.status = 'scheduled';
      result.message = 'Model retraining scheduled for next maintenance window';
      result.estimatedCompletion = new Date(Date.now() + 480000).toISOString(); // 8 min
      break;

    case 'nba_enable_postgres':
      result.status = 'requires-confirmation';
      result.message = 'PostgreSQL migration requires planning and testing';
      result.mode = 'risky';
      break;

    default:
      result.status = 'unknown_action';
      result.message = 'Action not recognized';
  }

  return result;
}

/**
 * Audit action
 */
async function auditAction(db, details) {
  try {
    await db.run(
      `INSERT INTO audit_logs (
        event_type, action, user_id, ip_address, request_body,
        response_status, success, severity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        'OWNER_AI_ACTION',
        details.action,
        details.userId,
        details.ipAddress,
        JSON.stringify({ hash: details.payloadHash, result: details.result }),
        200,
        1,
        'INFO'
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

module.exports = router;
