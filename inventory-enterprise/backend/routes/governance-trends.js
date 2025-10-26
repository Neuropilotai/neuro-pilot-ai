/**
 * governance-trends.js (v15.9.0)
 *
 * API Routes for Governance Forecasting & Trend Analytics
 * - GET /api/governance/trends - fetch trends + forecasts
 * - POST /api/governance/recompute/daily - record daily scores
 * - POST /api/governance/recompute/forecast - generate forecasts
 *
 * RBAC:
 * - OWNER: full access (view + recompute)
 * - FINANCE/OPS: view only
 * - READONLY: view only
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const express = require('express');
const router = express.Router();
const GovernanceTrendService = require('../src/governance/GovernanceTrendService');
const { authenticateToken, requireRole, ROLES } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const metricsExporter = require('../utils/metricsExporter');
const db = require('../config/database');

// Cache for GET /api/governance/trends (60s TTL)
let trendsCache = {
  data: null,
  timestamp: 0,
  ttl: 60 * 1000 // 60 seconds
};

/**
 * GET /api/governance/trends
 * Fetch governance trends and forecasts
 *
 * Query params:
 * - from: YYYY-MM-DD (default: 30 days ago)
 * - to: YYYY-MM-DD (default: today)
 * - pillar: all|finance|health|ai|menu|composite (default: all)
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/trends', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { from, to, pillar } = req.query;

    // Check cache
    const cacheKey = JSON.stringify({ from, to, pillar });
    const now = Date.now();

    if (trendsCache.data && trendsCache.key === cacheKey && (now - trendsCache.timestamp) < trendsCache.ttl) {
      return res.json({
        ...trendsCache.data,
        cached: true,
        cache_age_seconds: Math.floor((now - trendsCache.timestamp) / 1000)
      });
    }

    const trendService = new GovernanceTrendService(db);

    // Default date range: last 30 days
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];

    const result = await trendService.getTrends({
      from: from || defaultFrom,
      to: to || defaultTo,
      pillar: pillar || 'all'
    });

    // Update cache
    trendsCache = {
      key: cacheKey,
      data: result,
      timestamp: now
    };

    res.json({
      ...result,
      cached: false
    });
  } catch (error) {
    console.error('❌ Error fetching governance trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch governance trends',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/recompute/daily
 * Record daily scores for all pillars
 *
 * Body (optional):
 * - as_of: YYYY-MM-DD (default: today)
 * - source: 'manual' | 'auto' (default: 'manual')
 *
 * Auth: OWNER only
 */
router.post('/recompute/daily', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { as_of, source } = req.body;

    const trendService = new GovernanceTrendService(db);
    const result = await trendService.recordDailyScores({
      as_of,
      source: source || 'manual'
    });

    // Audit log
    await audit(db, req, {
      action: 'RECOMPUTE_DAILY',
      entity: 'governance_daily',
      entity_id: result.as_of,
      after: {
        as_of: result.as_of,
        scores: result.scores,
        source: result.source
      }
    });

    // Update Prometheus metrics
    metricsExporter.recordGovernanceDailyScores(result.scores);

    // Invalidate cache
    trendsCache.data = null;

    const runtime = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      message: 'Daily governance scores recorded',
      as_of: result.as_of,
      scores: result.scores,
      runtime_seconds: runtime
    });
  } catch (error) {
    console.error('❌ Error recording daily scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record daily scores',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/recompute/forecast
 * Compute forecasts for all pillars
 *
 * Body (optional):
 * - horizons: [7, 14, 30] (default)
 * - method: 'exp_smoothing' (default)
 *
 * Auth: OWNER only
 */
router.post('/recompute/forecast', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { horizons, method } = req.body;

    const trendService = new GovernanceTrendService(db);
    const result = await trendService.computeForecast({
      horizons: horizons || [7, 14, 30],
      method: method || 'exp_smoothing'
    });

    // Audit log
    await audit(db, req, {
      action: 'RECOMPUTE_FORECAST',
      entity: 'governance_forecast',
      entity_id: result.run_id,
      after: {
        run_id: result.run_id,
        method: result.method,
        forecast_count: result.forecasts.length,
        runtime: result.runtime
      }
    });

    // Update Prometheus metrics
    metricsExporter.incrementGovernanceForecastRuns();
    metricsExporter.recordGovernanceForecastRuntime(result.runtime);

    // Invalidate cache
    trendsCache.data = null;

    const runtime = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      message: 'Governance forecasts computed',
      run_id: result.run_id,
      method: result.method,
      forecast_count: result.forecasts.length,
      runtime_seconds: runtime
    });
  } catch (error) {
    console.error('❌ Error computing forecasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute forecasts',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/stats/:pillar
 * Get statistics for a specific pillar
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/stats/:pillar', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { pillar } = req.params;

    const validPillars = ['finance', 'health', 'ai', 'menu', 'composite'];
    if (!validPillars.includes(pillar)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pillar',
        valid_pillars: validPillars
      });
    }

    const trendService = new GovernanceTrendService(db);
    const stats = await trendService.getPillarStats(pillar);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'No data found for pillar',
        pillar
      });
    }

    res.json({
      success: true,
      pillar,
      stats
    });
  } catch (error) {
    console.error('❌ Error fetching pillar stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pillar stats',
      message: error.message
    });
  }
});

module.exports = router;
