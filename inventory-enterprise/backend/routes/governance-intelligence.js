/**
 * governance-intelligence.js (v16.0.0)
 *
 * API Routes for Governance Intelligence Dashboard
 * - GET /api/governance/intelligence/status - fetch intelligence score, anomalies, insights
 * - POST /api/governance/intelligence/recompute - run anomaly detection + insight generation
 * - POST /api/governance/intelligence/report - generate bilingual PDF report
 *
 * RBAC:
 * - OWNER: full access (view + recompute + report)
 * - FINANCE/OPS: view only
 * - READONLY: no access
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const express = require('express');
const router = express.Router();
const GovernanceIntelligenceService = require('../src/governance/GovernanceIntelligenceService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const metricsExporter = require('../utils/metricsExporter');
const db = require('../config/database');

// Cache for GET /api/governance/intelligence/status (30s TTL)
let statusCache = {
  data: null,
  timestamp: 0,
  ttl: 30 * 1000 // 30 seconds
};

/**
 * GET /api/governance/intelligence/status
 * Fetch current intelligence score, anomalies, and insights
 *
 * Query params:
 * - locale: 'en' | 'fr' (default: 'en')
 * - resolved: 'true' | 'false' (default: false - show unresolved only)
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/status', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { locale, resolved } = req.query;

    // Check cache
    const cacheKey = JSON.stringify({ locale, resolved });
    const now = Date.now();

    if (statusCache.data && statusCache.key === cacheKey && (now - statusCache.timestamp) < statusCache.ttl) {
      return res.json({
        ...statusCache.data,
        cached: true,
        cache_age_seconds: Math.floor((now - statusCache.timestamp) / 1000)
      });
    }

    const intelligenceService = new GovernanceIntelligenceService(db);

    const result = await intelligenceService.getIntelligenceStatus({
      locale: locale || 'en',
      resolved: resolved === 'true'
    });

    // Update cache
    statusCache = {
      key: cacheKey,
      data: result,
      timestamp: now
    };

    res.json({
      ...result,
      cached: false
    });
  } catch (error) {
    console.error('❌ Error fetching intelligence status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch intelligence status',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/intelligence/recompute
 * Run anomaly detection and insight generation
 *
 * Body (optional):
 * - as_of: YYYY-MM-DD (default: today)
 * - locale: 'en' | 'fr' (default: 'en')
 *
 * Auth: OWNER only
 */
router.post('/recompute', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { as_of, locale } = req.body;

    const intelligenceService = new GovernanceIntelligenceService(db);

    // Step 1: Detect anomalies
    const anomalyResult = await intelligenceService.detectAnomalies({ as_of });

    // Step 2: Generate insights
    const insightResult = await intelligenceService.generateInsights({ as_of, locale: locale || 'en' });

    // Step 3: Compute intelligence score
    const scoreResult = await intelligenceService.computeIntelligenceScore({ as_of });

    // Audit log
    await audit(db, req, {
      action: 'RECOMPUTE_INTELLIGENCE',
      entity: 'governance_intelligence',
      entity_id: as_of || new Date().toISOString().split('T')[0],
      after: {
        as_of: anomalyResult.as_of,
        anomaly_count: anomalyResult.anomalies.length,
        insight_count: insightResult.insights.length,
        intelligence_score: scoreResult.intelligence_score
      }
    });

    // Update Prometheus metrics
    metricsExporter.recordGovernanceIntelligenceScore(scoreResult.intelligence_score);

    // Count anomalies by pillar and severity
    const anomalyCounts = {};
    const pillars = ['finance', 'health', 'ai', 'menu', 'composite'];
    const severities = ['low', 'medium', 'high', 'critical'];

    pillars.forEach(pillar => {
      severities.forEach(severity => {
        const count = anomalyResult.anomalies.filter(a => a.pillar === pillar && a.severity === severity).length;
        metricsExporter.recordGovernanceAnomalyCount(pillar, severity, count);
      });
    });

    // Invalidate cache
    statusCache.data = null;

    const runtime = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      message: 'Governance intelligence recomputed',
      as_of: anomalyResult.as_of,
      anomaly_count: anomalyResult.anomalies.length,
      insight_count: insightResult.insights.length,
      intelligence_score: scoreResult.intelligence_score,
      runtime_seconds: runtime
    });
  } catch (error) {
    console.error('❌ Error recomputing intelligence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recompute intelligence',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/intelligence/report
 * Generate bilingual PDF report
 *
 * Body (optional):
 * - as_of: YYYY-MM-DD (default: today)
 * - locale: 'en' | 'fr' (default: 'en')
 * - include_trends: boolean (default: true)
 *
 * Auth: OWNER only
 */
router.post('/report', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  const startTime = Date.now();

  try {
    const { as_of, locale, include_trends } = req.body;

    const intelligenceService = new GovernanceIntelligenceService(db);

    const result = await intelligenceService.generatePDFReport({
      as_of,
      locale: locale || 'en',
      include_trends: include_trends !== false
    });

    // Audit log
    await audit(db, req, {
      action: 'GENERATE_INTELLIGENCE_REPORT',
      entity: 'governance_report',
      entity_id: result.filename,
      after: {
        as_of: result.as_of,
        filename: result.filename,
        path: result.path,
        locale: result.locale
      }
    });

    // Update Prometheus metrics
    metricsExporter.incrementGovernanceReportGenerations();

    const runtime = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      message: 'Governance intelligence report generated',
      as_of: result.as_of,
      filename: result.filename,
      path: result.path,
      locale: result.locale,
      runtime_seconds: runtime
    });
  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/intelligence/anomalies
 * Get anomalies with optional filtering
 *
 * Query params:
 * - pillar: 'finance' | 'health' | 'ai' | 'menu' | 'composite' | 'all' (default: all)
 * - severity: 'low' | 'medium' | 'high' | 'critical' | 'all' (default: all)
 * - resolved: 'true' | 'false' (default: false)
 * - limit: number (default: 50)
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/anomalies', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { pillar, severity, resolved, limit } = req.query;

    let query = `
      SELECT id, as_of, pillar, type, delta, severity, message, resolved, created_at
      FROM governance_anomalies
      WHERE 1=1
    `;
    const params = [];

    if (pillar && pillar !== 'all') {
      query += ` AND pillar = ?`;
      params.push(pillar);
    }

    if (severity && severity !== 'all') {
      query += ` AND severity = ?`;
      params.push(severity);
    }

    if (resolved !== undefined) {
      query += ` AND resolved = ?`;
      params.push(resolved === 'true' ? 1 : 0);
    } else {
      // Default: unresolved only
      query += ` AND resolved = 0`;
    }

    query += `
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        as_of DESC
      LIMIT ?
    `;
    params.push(parseInt(limit) || 50);

    const anomalies = await db.all(query, params);

    res.json({
      success: true,
      count: anomalies.length,
      anomalies
    });
  } catch (error) {
    console.error('❌ Error fetching anomalies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anomalies',
      message: error.message
    });
  }
});

/**
 * PATCH /api/governance/intelligence/anomalies/:id/resolve
 * Mark an anomaly as resolved
 *
 * Auth: OWNER only
 */
router.patch('/anomalies/:id/resolve', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if anomaly exists
    const anomaly = await db.get(`
      SELECT id, as_of, pillar, type, severity, message, resolved
      FROM governance_anomalies
      WHERE id = ?
    `, [id]);

    if (!anomaly) {
      return res.status(404).json({
        success: false,
        error: 'Anomaly not found',
        id
      });
    }

    if (anomaly.resolved === 1) {
      return res.status(400).json({
        success: false,
        error: 'Anomaly already resolved',
        id
      });
    }

    // Mark as resolved
    await db.run(`
      UPDATE governance_anomalies
      SET resolved = 1
      WHERE id = ?
    `, [id]);

    // Audit log
    await audit(db, req, {
      action: 'RESOLVE_ANOMALY',
      entity: 'governance_anomaly',
      entity_id: id,
      before: { resolved: 0 },
      after: { resolved: 1 }
    });

    // Invalidate cache
    statusCache.data = null;

    res.json({
      success: true,
      message: 'Anomaly marked as resolved',
      id
    });
  } catch (error) {
    console.error('❌ Error resolving anomaly:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve anomaly',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/intelligence/insights
 * Get insights with optional filtering
 *
 * Query params:
 * - pillar: 'finance' | 'health' | 'ai' | 'menu' | 'composite' | 'all' (default: all)
 * - locale: 'en' | 'fr' (default: 'en')
 * - limit: number (default: 30)
 *
 * Auth: FINANCE, OPS, OWNER
 */
router.get('/insights', authenticateToken, requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const { pillar, locale, limit } = req.query;
    const lang = locale || 'en';

    let query = `
      SELECT
        id,
        as_of,
        pillar,
        ${lang === 'fr' ? 'insight_fr' : 'insight_en'} as insight,
        confidence,
        author,
        created_at
      FROM governance_insights
      WHERE 1=1
    `;
    const params = [];

    if (pillar && pillar !== 'all') {
      query += ` AND pillar = ?`;
      params.push(pillar);
    }

    query += `
      ORDER BY as_of DESC, pillar
      LIMIT ?
    `;
    params.push(parseInt(limit) || 30);

    const insights = await db.all(query, params);

    res.json({
      success: true,
      count: insights.length,
      locale: lang,
      insights
    });
  } catch (error) {
    console.error('❌ Error fetching insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch insights',
      message: error.message
    });
  }
});

module.exports = router;
