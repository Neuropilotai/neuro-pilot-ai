/**
 * governance-predictive.js (v16.5.0)
 *
 * Predictive Governance API for Real-Time UI
 * - GET /api/governance/predictive/trend - real-time forecast with 7-day projection
 * - GET /api/governance/predictive/unified - unified status for command center
 * - POST /api/governance/predictive/recompute - force recompute all forecasts
 *
 * RBAC:
 * - OWNER: full access
 * - FINANCE/OPS: view only
 * - READONLY: no access
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-19
 */

const express = require('express');
const router = express.Router();
const GovernanceTrendService = require('../src/governance/GovernanceTrendService');
const GovernanceService = require('../src/governance/GovernanceService');
const GovernanceIntelligenceService = require('../src/governance/GovernanceIntelligenceService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const metricsExporter = require('../utils/metricsExporter');
const db = require('../config/database');

// Cache for predictive trend (30s TTL for real-time UI)
let trendCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 1000 // 30 seconds
};

// Cache for unified status (15s TTL for command center)
let unifiedCache = {
  data: null,
  timestamp: 0,
  ttl: 15 * 1000 // 15 seconds
};

/**
 * GET /api/governance/predictive/trend
 * Get real-time governance trend with forecast overlay
 *
 * Query params:
 * - pillar: finance|health|ai|menu|composite (default: composite)
 * - days: forecast horizon in days (default: 7, max: 30)
 * - lookback: historical days to include (default: 30, max: 90)
 *
 * Response:
 * {
 *   pillar: "composite",
 *   current_score: 87.5,
 *   historical: [{as_of, score}, ...],
 *   forecast: [{as_of, score, lower, upper}, ...],
 *   trend: "rising"|"stable"|"falling",
 *   change_7d: +2.3,
 *   confidence: 0.82
 * }
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/trend', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { pillar = 'composite', days = 7, lookback = 30 } = req.query;

    const horizon = Math.min(parseInt(days) || 7, 30);
    const lookbackDays = Math.min(parseInt(lookback) || 30, 90);

    // Validate pillar
    const validPillars = ['finance', 'health', 'ai', 'menu', 'composite'];
    if (!validPillars.includes(pillar)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pillar',
        valid_pillars: validPillars
      });
    }

    // Check cache
    const cacheKey = `${pillar}_${horizon}_${lookbackDays}`;
    const now = Date.now();

    if (trendCache.data && trendCache.key === cacheKey && (now - trendCache.timestamp) < trendCache.ttl) {
      metricsExporter.incrementUIHit('governance_predictive_trend_cached');
      return res.json({
        ...trendCache.data,
        cached: true,
        cache_age_ms: now - trendCache.timestamp
      });
    }

    const trendService = new GovernanceTrendService(db);
    const govService = new GovernanceService(db);

    // Get current status for live score
    const status = await govService.computeStatus();
    const currentScore = pillar === 'composite'
      ? status.governance_score
      : status.pillars[pillar === 'finance' ? 'finance_accuracy' :
                        pillar === 'health' ? 'health_score' :
                        pillar === 'ai' ? 'ai_intelligence_index' :
                        'menu_forecast_accuracy'];

    // Get historical data
    const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const historical = await db.all(`
      SELECT as_of, score
      FROM governance_daily
      WHERE pillar = ? AND as_of >= ? AND as_of <= ?
      ORDER BY as_of ASC
    `, [pillar, fromDate, toDate]);

    // Generate forecast using exponential smoothing
    const forecast = [];
    if (historical.length >= 3) {
      const values = historical.map(h => h.score);

      // Calculate adaptive alpha
      const alpha = calculateAdaptiveAlpha(values);

      // Smooth the series
      let smoothed = values[0];
      for (let i = 1; i < values.length; i++) {
        smoothed = alpha * values[i] + (1 - alpha) * smoothed;
      }

      // Calculate confidence bands
      const residuals = [];
      let s = values[0];
      for (let i = 1; i < values.length; i++) {
        s = alpha * values[i] + (1 - alpha) * s;
        residuals.push(values[i] - s);
      }

      const stdDev = calculateStdDev(residuals);
      const confidence = Math.max(0.5, Math.min(0.95, 1 - (stdDev / 20))); // normalize to [0.5, 0.95]

      // Generate forecast points
      for (let d = 1; d <= horizon; d++) {
        const forecastDate = new Date(Date.now() + d * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];

        const margin = 1.28 * stdDev * Math.sqrt(d / 7);

        forecast.push({
          as_of: forecastDate,
          score: Math.max(0, Math.min(100, smoothed)),
          lower: Math.max(0, smoothed - margin),
          upper: Math.min(100, smoothed + margin),
          confidence
        });
      }
    }

    // Calculate trend direction
    let trend = 'stable';
    let change_7d = 0;
    if (historical.length >= 2) {
      const recent = historical.slice(-7);
      if (recent.length >= 2) {
        change_7d = recent[recent.length - 1].score - recent[0].score;
        if (change_7d > 2) trend = 'rising';
        else if (change_7d < -2) trend = 'falling';
      }
    }

    const result = {
      success: true,
      pillar,
      current_score: currentScore,
      historical,
      forecast,
      trend,
      change_7d: parseFloat(change_7d.toFixed(2)),
      confidence: forecast.length > 0 ? forecast[0].confidence : 0,
      horizon_days: horizon,
      lookback_days: lookbackDays,
      cached: false
    };

    // Update cache
    trendCache = {
      key: cacheKey,
      data: result,
      timestamp: now
    };

    metricsExporter.incrementUIHit('governance_predictive_trend');

    res.json(result);
  } catch (error) {
    console.error('❌ Error in predictive trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate predictive trend',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/predictive/unified
 * Get unified status for Command Center panel
 *
 * Combines:
 * - Composite Governance Score
 * - Finance Integrity Badge
 * - AI Intelligence Index
 * - Health Score
 *
 * Response:
 * {
 *   governance_score: 87.5,
 *   finance_integrity: { score: 92, status: "ok", badge: "🟢" },
 *   ai_intelligence: { index: 78, status: "degraded", badge: "🟡" },
 *   health_score: { score: 85, status: "ok", badge: "🟢" },
 *   overall_status: "ok"|"degraded"|"critical",
 *   alerts: [...],
 *   last_update: "2025-10-19T19:45:00Z"
 * }
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/unified', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const now = Date.now();

    // Check cache
    if (unifiedCache.data && (now - unifiedCache.timestamp) < unifiedCache.ttl) {
      metricsExporter.incrementUIHit('governance_unified_cached');
      return res.json({
        ...unifiedCache.data,
        cached: true,
        cache_age_ms: now - unifiedCache.timestamp
      });
    }

    const govService = new GovernanceService(db);
    const intelligenceService = new GovernanceIntelligenceService(db);

    // Get governance status
    const govStatus = await govService.computeStatus();

    // Get intelligence status
    const intelligenceStatus = await intelligenceService.getIntelligenceStatus();

    // Determine status badges
    const financeIntegrity = {
      score: govStatus.pillars.finance_accuracy,
      status: govStatus.pillars.finance_accuracy >= 90 ? 'ok' :
              govStatus.pillars.finance_accuracy >= 75 ? 'degraded' : 'critical',
      badge: govStatus.pillars.finance_accuracy >= 90 ? '🟢' :
             govStatus.pillars.finance_accuracy >= 75 ? '🟡' : '🔴'
    };

    const aiIntelligence = {
      index: govStatus.pillars.ai_intelligence_index,
      status: govStatus.pillars.ai_intelligence_index >= 80 ? 'ok' :
              govStatus.pillars.ai_intelligence_index >= 60 ? 'degraded' : 'critical',
      badge: govStatus.pillars.ai_intelligence_index >= 80 ? '🟢' :
             govStatus.pillars.ai_intelligence_index >= 60 ? '🟡' : '🔴'
    };

    const healthScore = {
      score: govStatus.pillars.health_score,
      status: govStatus.pillars.health_score >= 85 ? 'ok' :
              govStatus.pillars.health_score >= 70 ? 'degraded' : 'critical',
      badge: govStatus.pillars.health_score >= 85 ? '🟢' :
             govStatus.pillars.health_score >= 70 ? '🟡' : '🔴'
    };

    // Determine overall status
    const statuses = [financeIntegrity.status, aiIntelligence.status, healthScore.status];
    const overallStatus = statuses.includes('critical') ? 'critical' :
                          statuses.includes('degraded') ? 'degraded' : 'ok';

    // Collect alerts from intelligence
    const alerts = intelligenceStatus.recent_anomalies || [];

    const result = {
      success: true,
      governance_score: govStatus.governance_score,
      finance_integrity: financeIntegrity,
      ai_intelligence: aiIntelligence,
      health_score: healthScore,
      overall_status: overallStatus,
      alerts: alerts.slice(0, 5), // top 5 alerts
      last_update: new Date().toISOString(),
      cached: false
    };

    // Update cache
    unifiedCache = {
      data: result,
      timestamp: now
    };

    metricsExporter.incrementUIHit('governance_unified');

    res.json(result);
  } catch (error) {
    console.error('❌ Error in unified status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unified status',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/predictive/recompute
 * Force recompute all forecasts and clear caches
 *
 * Auth: OWNER only
 */
router.post('/recompute', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  const startTime = Date.now();

  try {
    const trendService = new GovernanceTrendService(db);

    // Record today's scores
    await trendService.recordDailyScores({ source: 'manual' });

    // Compute forecasts
    const result = await trendService.computeForecast({
      horizons: [7, 14, 30],
      method: 'exp_smoothing'
    });

    // Clear caches
    trendCache.data = null;
    unifiedCache.data = null;

    // Audit log
    await audit(db, req, {
      action: 'RECOMPUTE_PREDICTIVE',
      entity: 'governance_forecast',
      entity_id: result.run_id,
      after: {
        run_id: result.run_id,
        forecast_count: result.forecasts.length
      }
    });

    metricsExporter.incrementUIAction('governance_predictive_recompute');

    const runtime = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      message: 'Predictive forecasts recomputed',
      run_id: result.run_id,
      forecast_count: result.forecasts.length,
      runtime_seconds: runtime
    });
  } catch (error) {
    console.error('❌ Error in predictive recompute:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recompute forecasts',
      message: error.message
    });
  }
});

// Helper functions

function calculateAdaptiveAlpha(values) {
  const n = values.length;
  if (n < 7) return 0.3;

  const recent = values.slice(-7);
  const volatility = calculateStdDev(recent);

  const baseAlpha = 0.3;
  const adaptiveFactor = Math.min(volatility / 10, 0.3);

  return Math.max(0.2, Math.min(0.6, baseAlpha + adaptiveFactor));
}

function calculateStdDev(values) {
  const n = values.length;
  if (n === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;

  return Math.sqrt(variance);
}

module.exports = router;
