/**
 * NeuroInnovate v5 Ascension - Unified API Routes
 * All v5 endpoints mounted under /api/v5
 */

const express = require('express');
const router = express.Router();

// v5 Add-on Modules
const AIOptimizerRL = require('../../v5_addons/ai_optimizer_rl');
const CacheOptimizerV2 = require('../../v5_addons/cache_optimizer');
const ComplianceEngine = require('../../v5_addons/compliance_engine');
const PredictiveReorder = require('../../v5_addons/predictive_reorder');
const SystemHealthV2 = require('../../v5_addons/system_health_v2');

// Initialize modules (singleton instances)
const aiOptimizer = new AIOptimizerRL();
const cacheOptimizer = new CacheOptimizerV2();
const complianceEngine = new ComplianceEngine();
const predictiveReorder = new PredictiveReorder();
const systemHealth = new SystemHealthV2();

// Initialize async modules
let modulesInitialized = false;

async function initializeModules() {
  if (modulesInitialized) return;

  try {
    await aiOptimizer.initialize();
    await predictiveReorder.initialize();
    modulesInitialized = true;
    console.log('✓ v5 modules initialized');
  } catch (error) {
    console.error('❌ Failed to initialize v5 modules:', error);
  }
}

// Initialize on first request
router.use(async (req, res, next) => {
  if (!modulesInitialized) {
    await initializeModules();
  }
  next();
});

// ═══════════════════════════════════════════════════════════
//  AI Optimizer RL Routes
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v5/ai/optimizer/feedback
 * Submit feedback for reinforcement learning
 */
router.post('/ai/optimizer/feedback', async (req, res) => {
  try {
    const { itemCode, actual, predicted, tenantId } = req.body;

    if (!itemCode || actual === undefined || predicted === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: itemCode, actual, predicted'
      });
    }

    const result = await aiOptimizer.learnFromFeedback(itemCode, actual, predicted, tenantId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process feedback',
      message: error.message
    });
  }
});

/**
 * POST /api/v5/ai/optimizer/train
 * Trigger model retraining
 */
router.post('/ai/optimizer/train', async (req, res) => {
  try {
    const { tenantId } = req.body;

    const result = await aiOptimizer.retrainModels(tenantId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Training failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/ai/optimizer/metrics
 * Get training metrics
 */
router.get('/ai/optimizer/metrics', async (req, res) => {
  try {
    const { itemCode, limit } = req.query;

    const metrics = await aiOptimizer.getMetrics(itemCode, parseInt(limit) || 100);

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/ai/optimizer/performance
 * Get performance report
 */
router.get('/api/optimizer/performance', async (req, res) => {
  try {
    const { tenantId } = req.query;

    const report = await aiOptimizer.getPerformanceReport(tenantId);

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  Performance & Cache Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v5/performance/metrics
 * Get comprehensive performance metrics
 */
router.get('/performance/metrics', async (req, res) => {
  try {
    const metrics = await cacheOptimizer.getComprehensiveMetrics();

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve performance metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/performance/cache/stats
 * Get cache statistics
 */
router.get('/performance/cache/stats', (req, res) => {
  try {
    const stats = cacheOptimizer.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve cache stats',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v5/performance/cache/:type
 * Invalidate cache by type (or 'all')
 */
router.delete('/performance/cache/:type', async (req, res) => {
  try {
    const { type } = req.params;

    await cacheOptimizer.invalidate(type);

    res.json({
      success: true,
      message: `Cache '${type}' invalidated`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Cache invalidation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/performance/report
 * Generate performance report
 */
router.get('/performance/report', async (req, res) => {
  try {
    const report = await cacheOptimizer.generateReport();

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate performance report',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  Compliance Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v5/compliance/score
 * Get current compliance score
 */
router.get('/compliance/score', async (req, res) => {
  try {
    const result = await complianceEngine.calculateScore();

    res.json({
      success: true,
      compliance: result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to calculate compliance score',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/compliance/report
 * Get full compliance report
 */
router.get('/compliance/report', async (req, res) => {
  try {
    const report = await complianceEngine.generateReport();

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate compliance report',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  Predictive Reorder Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v5/ai/reorder/recommendations
 * Get AI-powered reorder recommendations
 */
router.get('/ai/reorder/recommendations', async (req, res) => {
  try {
    const { tenantId, horizon } = req.query;

    const result = await predictiveReorder.generateRecommendations(
      tenantId,
      { horizon: parseInt(horizon) || 30 }
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/ai/reorder/confidence/:itemCode
 * Get confidence breakdown for an item
 */
router.get('/ai/reorder/confidence/:itemCode', async (req, res) => {
  try {
    const { itemCode } = req.params;
    const { tenantId } = req.query;

    const breakdown = await predictiveReorder.getConfidenceBreakdown(itemCode, tenantId);

    res.json({
      success: true,
      breakdown
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get confidence breakdown',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/ai/reorder/drafts
 * Get draft purchase orders
 */
router.get('/ai/reorder/drafts', async (req, res) => {
  try {
    const { tenantId, onlyActive } = req.query;

    const drafts = await predictiveReorder.getDraftPOs(tenantId, {
      onlyActive: onlyActive !== 'false'
    });

    res.json({
      success: true,
      drafts
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve draft POs',
      message: error.message
    });
  }
});

/**
 * POST /api/v5/ai/reorder/apply-draft
 * Apply a draft purchase order
 */
router.post('/ai/reorder/apply-draft', async (req, res) => {
  try {
    const { draftId } = req.body;

    if (!draftId) {
      return res.status(400).json({
        error: 'Missing required field: draftId'
      });
    }

    const result = await predictiveReorder.applyDraftPO(draftId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to apply draft PO',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  System Health v2 Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v5/health
 * Get comprehensive system health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await systemHealth.getSystemHealth();

    res.json({
      success: true,
      health
    });
  } catch (error) {
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v5/health/score
 * Get system health score
 */
router.get('/health/score', async (req, res) => {
  try {
    const score = await systemHealth.getHealthScore();

    res.json({
      success: true,
      score
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to calculate health score',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  v5 Meta Route
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v5
 * v5 API info
 */
router.get('/', (req, res) => {
  res.json({
    version: '5.0.0',
    name: 'NeuroInnovate Ascension',
    status: 'operational',
    modules: {
      aiOptimizer: 'Reinforcement Learning AI Optimizer',
      cache: 'Performance Cache Layer v2',
      compliance: 'SOC2 & ISO27001 Compliance Engine',
      predictiveReorder: 'AI-Powered Predictive Reordering',
      systemHealth: 'System Health Monitor v2'
    },
    endpoints: {
      aiOptimizer: '/api/v5/ai/optimizer/*',
      performance: '/api/v5/performance/*',
      compliance: '/api/v5/compliance/*',
      reorder: '/api/v5/ai/reorder/*',
      health: '/api/v5/health'
    },
    security: {
      binding: '127.0.0.1 (localhost-only)',
      encryption: 'Ed25519 + Kyber512',
      authentication: 'JWT + Touch ID'
    }
  });
});

module.exports = router;
