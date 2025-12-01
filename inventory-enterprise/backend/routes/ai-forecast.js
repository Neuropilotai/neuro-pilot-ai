/**
 * AI Forecasting API Routes - v2.8.0
 * ARIMA + Prophet hybrid forecasting system
 */

const express = require('express');
const router = express.Router();
const { requirePermission, PERMISSIONS } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const ForecastService = require('../src/ai/forecast/ForecastService');
const metricsExporter = require('../utils/metricsExporter');

// Initialize forecasting service (will be set up with Redis and DB)
let forecastService = null;

/**
 * Initialize forecasting service with dependencies
 */
function initializeForecastService(redisClient, db) {
  forecastService = new ForecastService(redisClient, db);
  console.log('✓ Forecasting service initialized');
}

/**
 * Validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /api/ai/forecast/train
 * Train forecast model for specific item(s)
 */
router.post('/train',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  [
    body('item_code').optional().trim().notEmpty(),
    body('tenant_id').optional().trim().notEmpty(),
    body('horizon').optional().isInt({ min: 1, max: 365 })
  ],
  handleValidationErrors,
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (!forecastService || !forecastService.enabled) {
        return res.status(503).json({
          error: 'Forecasting service unavailable',
          message: 'Set AI_FORECAST_ENABLED=true to enable'
        });
      }

      const { item_code, horizon = 30 } = req.body;
      const { tenantId } = req.tenant;

      metricsExporter.recordForecastRequest('train', tenantId);

      if (!item_code) {
        return res.status(400).json({
          error: 'item_code is required'
        });
      }

      const forecast = await forecastService.forecast(item_code, tenantId, horizon);

      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('train', duration);

      res.json({
        success: true,
        itemCode: item_code,
        horizon,
        model: forecast.model,
        metrics: forecast.metrics,
        trainingDuration: duration,
        generatedAt: forecast.generatedAt
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('train', duration);
      metricsExporter.recordForecastError('train', error.message);

      console.error('Forecast training error:', error);

      res.status(500).json({
        error: 'Forecast training failed',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/ai/forecast/:itemCode
 * Get forecast for specific item
 */
router.get('/:itemCode',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  [
    query('horizon').optional().isInt({ min: 1, max: 365 })
  ],
  handleValidationErrors,
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (!forecastService || !forecastService.enabled) {
        return res.status(503).json({
          error: 'Forecasting service unavailable',
          message: 'Set AI_FORECAST_ENABLED=true to enable'
        });
      }

      const { itemCode } = req.params;
      const { horizon = 30 } = req.query;
      const { tenantId } = req.tenant;

      metricsExporter.recordForecastRequest('get', tenantId);

      const forecast = await forecastService.forecast(itemCode, tenantId, parseInt(horizon));

      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('get', duration);

      if (forecast.cached) {
        metricsExporter.recordCacheHit('forecast');
      }

      res.json({
        success: true,
        forecast: forecast.predictions,
        metadata: {
          itemCode,
          model: forecast.model,
          horizon: forecast.horizon,
          generatedAt: forecast.generatedAt,
          historicalSampleSize: forecast.historicalSampleSize
        },
        confidence: forecast.confidence,
        metrics: forecast.metrics
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('get', duration);
      metricsExporter.recordForecastError('get', error.message);

      console.error('Forecast retrieval error:', error);

      res.status(500).json({
        error: 'Forecast retrieval failed',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/ai/forecast/bulk-train
 * Bulk train forecasts for multiple items
 */
router.post('/bulk-train',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  [
    body('item_codes').isArray({ min: 1, max: 100 }),
    body('item_codes.*').trim().notEmpty(),
    body('horizon').optional().isInt({ min: 1, max: 365 })
  ],
  handleValidationErrors,
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (!forecastService || !forecastService.enabled) {
        return res.status(503).json({
          error: 'Forecasting service unavailable',
          message: 'Set AI_FORECAST_ENABLED=true to enable'
        });
      }

      const { item_codes, horizon = 30 } = req.body;
      const { tenantId } = req.tenant;

      metricsExporter.recordForecastRequest('bulk-train', tenantId);

      const result = await forecastService.bulkTrain(item_codes, tenantId, horizon);

      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('bulk-train', duration);

      res.json({
        success: true,
        summary: {
          totalItems: result.totalItems,
          successful: result.successful,
          failed: result.failed,
          duration: duration
        },
        results: result.results.map(r => ({
          itemCode: r.itemCode,
          model: r.forecast.model,
          metrics: r.forecast.metrics
        })),
        errors: result.errors
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsExporter.recordForecastLatency('bulk-train', duration);
      metricsExporter.recordForecastError('bulk-train', error.message);

      console.error('Bulk training error:', error);

      res.status(500).json({
        error: 'Bulk training failed',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/ai/forecast/accuracy/metrics
 * Get forecast accuracy metrics
 */
router.get('/accuracy/metrics',
  requirePermission(PERMISSIONS.REPORTS_READ),
  [
    query('item_code').optional().trim(),
    query('days').optional().isInt({ min: 1, max: 365 })
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      if (!forecastService || !forecastService.enabled) {
        return res.status(503).json({
          error: 'Forecasting service unavailable'
        });
      }

      const { item_code, days = 30 } = req.query;
      const { tenantId } = req.tenant;

      const metrics = await forecastService.getAccuracyMetrics(
        tenantId,
        item_code || null,
        parseInt(days)
      );

      res.json({
        success: true,
        metrics
      });

    } catch (error) {
      console.error('Accuracy metrics error:', error);

      res.status(500).json({
        error: 'Failed to retrieve accuracy metrics',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/ai/forecast/cache/:itemCode
 * Invalidate cached forecasts for an item
 */
router.delete('/cache/:itemCode',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  async (req, res) => {
    try {
      if (!forecastService || !forecastService.enabled) {
        return res.status(503).json({
          error: 'Forecasting service unavailable'
        });
      }

      const { itemCode } = req.params;
      const { tenantId } = req.tenant;

      await forecastService.invalidateCache(tenantId, itemCode);

      res.json({
        success: true,
        message: `Cache invalidated for ${itemCode}`
      });

    } catch (error) {
      console.error('Cache invalidation error:', error);

      res.status(500).json({
        error: 'Cache invalidation failed',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/ai/forecast/health
 * Health check for forecasting service
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      enabled: forecastService?.enabled || false,
      pythonAvailable: false,
      redisAvailable: forecastService?.cacheEnabled || false,
      databaseAvailable: !!forecastService?.db
    };

    // Check if Python is available
    if (forecastService) {
      const { spawn } = require('child_process');
      const python = spawn(forecastService.pythonBin, ['--version']);

      python.on('close', (code) => {
        health.pythonAvailable = code === 0;
      });

      // Wait a bit for Python check
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const status = health.enabled && health.pythonAvailable && health.databaseAvailable
      ? 'healthy'
      : 'degraded';

    res.status(status === 'healthy' ? 200 : 503).json({
      status,
      health
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Export only the router for app.use() compatibility
// initializeForecastService is not needed in production (ForecastService initializes lazily)
module.exports = router;
