/**
 * Owner Training Routes - v3.1.0
 * Local AI training on Apple Silicon with REAL measured metrics
 * Owner-only access, no placeholders
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const LocalTrainer = require('../src/ai/local_training/LocalTrainer');
const db = require('../config/database');
const logger = require('../config/logger');
const { getHardwareFingerprint } = require('../src/ai/local_training/appleHardware');
const { recordTrainingMetrics } = require('../utils/metricsExporter');

// All routes require authentication + owner access
router.use(authenticateToken);
router.use(requireOwner);

/**
 * POST /api/owner/training/run
 * Train models for multiple items
 * Body: { itemCodes: string[], model: "prophet"|"arima", horizon: number }
 */
router.post('/run', async (req, res) => {
  const startTime = Date.now();
  const { itemCodes, model = 'prophet', horizon = 30 } = req.body;

  // Validation
  if (!itemCodes || !Array.isArray(itemCodes) || itemCodes.length === 0) {
    return res.status(400).json({
      error: 'itemCodes array is required and must not be empty'
    });
  }

  if (!['prophet', 'arima'].includes(model)) {
    return res.status(400).json({
      error: 'model must be "prophet" or "arima"'
    });
  }

  if (typeof horizon !== 'number' || horizon < 1 || horizon > 365) {
    return res.status(400).json({
      error: 'horizon must be a number between 1 and 365'
    });
  }

  logger.info('Starting training run', {
    itemCodes,
    model,
    horizon,
    count: itemCodes.length,
    ownerId: req.user.id
  });

  const results = [];
  const errors = [];

  try {
    // Train each item
    for (const itemCode of itemCodes) {
      try {
        let result;

        if (model === 'prophet') {
          result = await LocalTrainer.trainProphet(itemCode, horizon);
        } else {
          result = await LocalTrainer.trainARIMA(itemCode, horizon);
        }

        // Record Prometheus metrics (REAL values only)
        if (result.wallClockSec != null) {
          recordTrainingMetrics({
            model: result.modelType,
            wallSec: result.wallClockSec,
            mape: result.metrics?.mape,
            rmse: result.metrics?.rmse
          });
        }

        results.push({
          runId: result.runId,
          itemCode: result.itemCode,
          modelType: result.modelType,
          wallClockSec: result.wallClockSec,
          peakMemoryMB: result.peakMemoryMB,
          metrics: {
            mape: result.metrics?.mape ?? null,
            rmse: result.metrics?.rmse ?? null,
            mae: result.metrics?.mae ?? null,
            samples: result.samples
          },
          hardwareFingerprint: getHardwareFingerprint()
        });

      } catch (error) {
        logger.error('Training failed for item', {
          itemCode,
          error: error.message
        });

        errors.push({
          itemCode,
          error: error.message
        });
      }
    }

    // Audit log
    await db.run(
      `INSERT INTO audit_logs (
        action_code, user_id, ip_address, details, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'TRAINING_RUN',
        req.user.id,
        req.ip,
        JSON.stringify({
          count: itemCodes.length,
          model,
          horizon,
          successful: results.length,
          failed: errors.length
        }),
        new Date().toISOString()
      ]
    );

    const totalTime = (Date.now() - startTime) / 1000;

    logger.info('Training run completed', {
      totalTime: totalTime.toFixed(2),
      successful: results.length,
      failed: errors.length
    });

    res.json({
      success: true,
      runs: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: itemCodes.length,
        successful: results.length,
        failed: errors.length,
        totalWallClockSec: totalTime
      }
    });

  } catch (error) {
    logger.error('Training run failed', { error: error.message });

    res.status(500).json({
      error: 'Training run failed',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/training/runs
 * Get recent training runs
 * Query params: limit (default 50), model (prophet|arima)
 */
router.get('/runs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const model = req.query.model;

    let query = `
      SELECT
        id, item_code, model_type, horizon,
        mape, rmse, mae, wall_sec, peak_mb, samples,
        hw_fingerprint, started_at, finished_at, logs_path
      FROM ai_local_training_runs
    `;

    const params = [];

    if (model && ['prophet', 'arima'].includes(model)) {
      query += ' WHERE model_type = ?';
      params.push(model);
    }

    query += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const runs = await db.all(query, params);

    res.json({
      runs: runs.map(run => ({
        id: run.id,
        itemCode: run.item_code,
        modelType: run.model_type,
        horizon: run.horizon,
        metrics: {
          mape: run.mape,
          rmse: run.rmse,
          mae: run.mae,
          wallClockSec: run.wall_sec,
          peakMemoryMB: run.peak_mb,
          samples: run.samples
        },
        hardwareFingerprint: run.hw_fingerprint,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        logsPath: run.logs_path
      })),
      total: runs.length,
      limit
    });

  } catch (error) {
    logger.error('Failed to fetch training runs', { error: error.message });

    res.status(500).json({
      error: 'Failed to fetch training runs',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/training/metrics
 * Get aggregated training metrics (last 24 hours)
 * Returns computed statistics - NO placeholders
 */
router.get('/metrics', async (req, res) => {
  try {
    // Get stats for last 24 hours by model type
    const prophetStats = await db.get(
      `SELECT
        COUNT(*) as total_runs,
        AVG(wall_sec) as avg_wall_sec,
        MIN(wall_sec) as min_wall_sec,
        MAX(wall_sec) as max_wall_sec,
        AVG(mape) as avg_mape,
        AVG(rmse) as avg_rmse,
        AVG(peak_mb) as avg_peak_mb,
        SUM(samples) as total_samples
      FROM ai_local_training_runs
      WHERE model_type = 'prophet'
        AND started_at >= datetime('now', '-24 hours')`
    );

    const arimaStats = await db.get(
      `SELECT
        COUNT(*) as total_runs,
        AVG(wall_sec) as avg_wall_sec,
        MIN(wall_sec) as min_wall_sec,
        MAX(wall_sec) as max_wall_sec,
        AVG(mape) as avg_mape,
        AVG(rmse) as avg_rmse,
        AVG(peak_mb) as avg_peak_mb,
        SUM(samples) as total_samples
      FROM ai_local_training_runs
      WHERE model_type = 'arima'
        AND started_at >= datetime('now', '-24 hours')`
    );

    // Get median values (more robust than mean for skewed distributions)
    const prophetMedians = await db.get(
      `WITH ordered AS (
        SELECT wall_sec, mape, rmse,
               ROW_NUMBER() OVER (ORDER BY wall_sec) as row_num,
               COUNT(*) OVER () as total_count
        FROM ai_local_training_runs
        WHERE model_type = 'prophet'
          AND started_at >= datetime('now', '-24 hours')
          AND mape IS NOT NULL
      )
      SELECT
        AVG(wall_sec) as median_wall_sec,
        AVG(mape) as median_mape,
        AVG(rmse) as median_rmse
      FROM ordered
      WHERE row_num IN ((total_count + 1) / 2, (total_count + 2) / 2)`
    );

    const arimaMedians = await db.get(
      `WITH ordered AS (
        SELECT wall_sec, mape, rmse,
               ROW_NUMBER() OVER (ORDER BY wall_sec) as row_num,
               COUNT(*) OVER () as total_count
        FROM ai_local_training_runs
        WHERE model_type = 'arima'
          AND started_at >= datetime('now', '-24 hours')
          AND mape IS NOT NULL
      )
      SELECT
        AVG(wall_sec) as median_wall_sec,
        AVG(mape) as median_mape,
        AVG(rmse) as median_rmse
      FROM ordered
      WHERE row_num IN ((total_count + 1) / 2, (total_count + 2) / 2)`
    );

    // Get hardware fingerprint for current system
    const hardwareFingerprint = getHardwareFingerprint();

    res.json({
      last24h: {
        prophet: {
          totalRuns: prophetStats?.total_runs || 0,
          avgWallSec: prophetStats?.avg_wall_sec || null,
          minWallSec: prophetStats?.min_wall_sec || null,
          maxWallSec: prophetStats?.max_wall_sec || null,
          medianWallSec: prophetMedians?.median_wall_sec || null,
          avgMAPE: prophetStats?.avg_mape || null,
          medianMAPE: prophetMedians?.median_mape || null,
          avgRMSE: prophetStats?.avg_rmse || null,
          medianRMSE: prophetMedians?.median_rmse || null,
          avgPeakMB: prophetStats?.avg_peak_mb || null,
          totalSamples: prophetStats?.total_samples || 0
        },
        arima: {
          totalRuns: arimaStats?.total_runs || 0,
          avgWallSec: arimaStats?.avg_wall_sec || null,
          minWallSec: arimaStats?.min_wall_sec || null,
          maxWallSec: arimaStats?.max_wall_sec || null,
          medianWallSec: arimaMedians?.median_wall_sec || null,
          avgMAPE: arimaStats?.avg_mape || null,
          medianMAPE: arimaMedians?.median_mape || null,
          avgRMSE: arimaStats?.avg_rmse || null,
          medianRMSE: arimaMedians?.median_rmse || null,
          avgPeakMB: arimaStats?.avg_peak_mb || null,
          totalSamples: arimaStats?.total_samples || 0
        }
      },
      hardwareFingerprint,
      note: 'All values are computed from actual training runs. Null means no data available.'
    });

  } catch (error) {
    logger.error('Failed to fetch training metrics', { error: error.message });

    res.status(500).json({
      error: 'Failed to fetch training metrics',
      message: error.message
    });
  }
});

module.exports = router;
