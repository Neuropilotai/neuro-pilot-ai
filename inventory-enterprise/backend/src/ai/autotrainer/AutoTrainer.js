/**
 * AI Auto-Trainer
 * Version: v2.2.0-2025-10-07
 *
 * Monitors forecast accuracy drift and triggers automatic retraining
 * when MAPE exceeds thresholds or RMSE degrades significantly.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const { logger } = require('../../config/logger');
const metricsExporter = require('../../utils/metricsExporter');
const feedbackIngestor = require('../feedback/ingest');
const policySync = require('./policySync');

class AutoTrainer {
  constructor() {
    this.config = {
      // Drift thresholds
      mapeThreshold7Day: parseFloat(process.env.AI_MAPE_THRESHOLD_7D || '15'),  // 15%
      mapeThreshold28Day: parseFloat(process.env.AI_MAPE_THRESHOLD_28D || '20'), // 20%
      rmseDriftPercent: parseFloat(process.env.AI_RMSE_DRIFT_PERCENT || '20'),   // 20%

      // Minimum data requirements
      minDataPoints: parseInt(process.env.AI_MIN_DATA_POINTS || '14'),

      // Retraining cooldown (don't retrain same item within N hours)
      retrainCooldownHours: parseInt(process.env.AI_RETRAIN_COOLDOWN_HOURS || '24'),

      // Training config
      trainingDays: parseInt(process.env.AI_TRAINING_DAYS || '365'),
      forecastPeriods: parseInt(process.env.AI_FORECAST_PERIODS || '30'),

      // Cron schedule (default: 02:40 daily)
      cronSchedule: process.env.AI_AUTOTRAIN_CRON || '40 2 * * *'
    };

    logger.info('[AutoTrainer] Initialized with config:', this.config);
  }

  /**
   * Run drift detection and retrain models that need it
   * @param {Object} options - Options
   * @returns {Promise<Object>} Results
   */
  async runDriftDetection(options = {}) {
    const startTime = Date.now();
    logger.info('[AutoTrainer] Starting drift detection run...');

    const results = {
      itemsChecked: 0,
      driftDetected: 0,
      retrainTriggered: 0,
      retrainSuccess: 0,
      retrainFailed: 0,
      errors: []
    };

    try {
      // Get all items with trained models
      const items = await this.getItemsWithModels();
      results.itemsChecked = items.length;

      logger.info(`[AutoTrainer] Checking ${items.length} items for drift...`);

      for (const item of items) {
        try {
          const driftResult = await this.checkDrift(item.item_code);

          if (driftResult.driftDetected) {
            results.driftDetected++;
            logger.warn(`[AutoTrainer] Drift detected for ${item.item_code}: ${driftResult.reason}`);

            // Check cooldown
            if (await this.isInCooldown(item.item_code)) {
              logger.info(`[AutoTrainer] ${item.item_code} in cooldown, skipping retrain`);
              continue;
            }

            // Trigger retrain
            const retrainResult = await this.triggerRetrain({
              itemCode: item.item_code,
              trigger: 'drift',
              reason: driftResult.reason,
              metrics: driftResult.metrics
            });

            results.retrainTriggered++;

            if (retrainResult.success) {
              results.retrainSuccess++;
            } else {
              results.retrainFailed++;
              results.errors.push({
                item_code: item.item_code,
                error: retrainResult.error
              });
            }
          }
        } catch (error) {
          logger.error(`[AutoTrainer] Error processing item ${item.item_code}:`, error);
          results.errors.push({
            item_code: item.item_code,
            error: error.message
          });
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      logger.info(`[AutoTrainer] Drift detection complete: ${results.driftDetected}/${results.itemsChecked} drift detected, ${results.retrainSuccess}/${results.retrainTriggered} retrained (${duration}s)`);

      // Record metrics
      metricsExporter.recordAutotrainRun(results);

      return results;
    } catch (error) {
      logger.error('[AutoTrainer] Fatal error in drift detection:', error);
      throw error;
    }
  }

  /**
   * Check if an item's model has drifted beyond acceptable thresholds
   * @param {string} itemCode - Item code
   * @returns {Promise<Object>} Drift check result
   */
  async checkDrift(itemCode) {
    // Get recent accuracy metrics
    const metrics7d = await feedbackIngestor.getAccuracyMetrics(itemCode, 7);
    const metrics28d = await feedbackIngestor.getAccuracyMetrics(itemCode, 28);

    if (!metrics7d || !metrics28d) {
      return {
        driftDetected: false,
        reason: 'Insufficient data for drift detection'
      };
    }

    // Check if we have enough data points
    if (metrics7d.total_records < this.config.minDataPoints) {
      return {
        driftDetected: false,
        reason: `Insufficient data points (${metrics7d.total_records} < ${this.config.minDataPoints})`
      };
    }

    // Check 7-day median MAPE
    if (metrics7d.median_mape > this.config.mapeThreshold7Day) {
      return {
        driftDetected: true,
        reason: `7-day median MAPE ${metrics7d.median_mape.toFixed(2)}% > threshold ${this.config.mapeThreshold7Day}%`,
        metrics: {
          mape_7d: metrics7d.median_mape,
          mape_28d: metrics28d.median_mape,
          rmse_7d: metrics7d.median_rmse,
          rmse_28d: metrics28d.median_rmse
        }
      };
    }

    // Check 28-day median MAPE
    if (metrics28d.median_mape > this.config.mapeThreshold28Day) {
      return {
        driftDetected: true,
        reason: `28-day median MAPE ${metrics28d.median_mape.toFixed(2)}% > threshold ${this.config.mapeThreshold28Day}%`,
        metrics: {
          mape_7d: metrics7d.median_mape,
          mape_28d: metrics28d.median_mape,
          rmse_7d: metrics7d.median_rmse,
          rmse_28d: metrics28d.median_rmse
        }
      };
    }

    // Check RMSE drift (7-day vs 28-day)
    const rmseDrift = ((metrics7d.median_rmse - metrics28d.median_rmse) / metrics28d.median_rmse) * 100;
    if (Math.abs(rmseDrift) > this.config.rmseDriftPercent) {
      return {
        driftDetected: true,
        reason: `RMSE drift ${rmseDrift.toFixed(2)}% > threshold ${this.config.rmseDriftPercent}%`,
        metrics: {
          mape_7d: metrics7d.median_mape,
          mape_28d: metrics28d.median_mape,
          rmse_7d: metrics7d.median_rmse,
          rmse_28d: metrics28d.median_rmse,
          rmse_drift: rmseDrift
        }
      };
    }

    return {
      driftDetected: false,
      reason: 'No significant drift detected',
      metrics: {
        mape_7d: metrics7d.median_mape,
        mape_28d: metrics28d.median_mape,
        rmse_7d: metrics7d.median_rmse,
        rmse_28d: metrics28d.median_rmse
      }
    };
  }

  /**
   * Trigger a retraining job
   * @param {Object} params - {itemCode, trigger, reason, metrics}
   * @returns {Promise<Object>} Result
   */
  async triggerRetrain(params) {
    const { itemCode, trigger = 'manual', reason = '', metrics = {} } = params;
    const jobId = uuidv4();

    logger.info(`[AutoTrainer] Triggering retrain for ${itemCode} (trigger: ${trigger})`);

    // Create job record
    await this.createJob({
      jobId,
      itemCode,
      trigger,
      status: 'pending'
    });

    // Record metric
    metricsExporter.recordAutotrainTrigger(trigger);

    try {
      // Update job to running
      await this.updateJob(jobId, { status: 'running', started_at: new Date() });

      // Perform training (calls existing forecaster)
      const trainStart = Date.now();
      const trainResult = await this.trainModel(itemCode);
      const trainDuration = (Date.now() - trainStart) / 1000;

      if (trainResult.success) {
        // Update job to success
        await this.updateJob(jobId, {
          status: 'success',
          finished_at: new Date(),
          metrics: JSON.stringify({
            ...trainResult.metrics,
            training_duration: trainDuration,
            drift_reason: reason,
            pre_training_metrics: metrics
          })
        });

        // Sync policy (invalidate caches, bump version)
        await policySync.syncAfterRetrain(itemCode);

        // Record success metric
        metricsExporter.recordAutotrainDuration(trainDuration, 'success');

        logger.info(`[AutoTrainer] Retrain success for ${itemCode} (${trainDuration}s)`);

        return {
          success: true,
          jobId,
          duration: trainDuration,
          metrics: trainResult.metrics
        };
      } else {
        // Training failed
        await this.updateJob(jobId, {
          status: 'failed',
          finished_at: new Date(),
          error_message: trainResult.error
        });

        // Record failure metric
        metricsExporter.recordAutotrainFailure(trigger);

        logger.error(`[AutoTrainer] Retrain failed for ${itemCode}: ${trainResult.error}`);

        return {
          success: false,
          jobId,
          error: trainResult.error
        };
      }
    } catch (error) {
      // Unexpected error
      await this.updateJob(jobId, {
        status: 'failed',
        finished_at: new Date(),
        error_message: error.message
      });

      metricsExporter.recordAutotrainFailure(trigger);

      logger.error(`[AutoTrainer] Retrain error for ${itemCode}:`, error);

      return {
        success: false,
        jobId,
        error: error.message
      };
    }
  }

  /**
   * Train model for an item (calls existing forecaster)
   * @param {string} itemCode - Item code
   * @returns {Promise<Object>} Training result
   */
  async trainModel(itemCode) {
    try {
      // Get existing model to determine model type
      const existingModel = await this.getModel(itemCode);
      const modelType = existingModel?.model_type || 'prophet';

      // Import forecaster (assuming it exists from v2.1)
      const forecaster = require('../../utils/aiForecaster');

      // Train model
      const result = await forecaster.train({
        itemCode,
        modelType,
        trainingDays: this.config.trainingDays,
        forecastPeriods: this.config.forecastPeriods
      });

      return {
        success: true,
        metrics: {
          mape: result.accuracy?.mape || null,
          rmse: result.accuracy?.rmse || null,
          model_type: modelType
        }
      };
    } catch (error) {
      logger.error(`[AutoTrainer] Training error for ${itemCode}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all items that have trained models
   * @returns {Promise<Array>} Items
   */
  async getItemsWithModels() {
    const query = `
      SELECT DISTINCT entity_id as item_code
      FROM ai_models
      WHERE entity_type = 'item'
        AND status = 'active'
      ORDER BY entity_id
    `;

    const result = await db.query(query);
    return result.rows || [];
  }

  /**
   * Get model for an item
   * @param {string} itemCode - Item code
   * @returns {Promise<Object|null>} Model
   */
  async getModel(itemCode) {
    const query = `
      SELECT *
      FROM ai_models
      WHERE entity_id = ?
        AND entity_type = 'item'
        AND status = 'active'
      ORDER BY trained_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, [itemCode]);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if item is in cooldown period
   * @param {string} itemCode - Item code
   * @returns {Promise<boolean>} True if in cooldown
   */
  async isInCooldown(itemCode) {
    const query = `
      SELECT COUNT(*) as count
      FROM ai_autotrain_jobs
      WHERE item_code = ?
        AND status = 'success'
        AND finished_at > DATETIME('now', '-' || ? || ' hours')
    `;

    const result = await db.query(query, [itemCode, this.config.retrainCooldownHours]);
    return result.rows && result.rows[0].count > 0;
  }

  /**
   * Create autotrain job record
   * @param {Object} job - Job data
   */
  async createJob(job) {
    const query = `
      INSERT INTO ai_autotrain_jobs (job_id, item_code, trigger, status, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await db.query(query, [job.jobId, job.itemCode, job.trigger, job.status]);
  }

  /**
   * Update autotrain job record
   * @param {string} jobId - Job ID
   * @param {Object} updates - Updates
   */
  async updateJob(jobId, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }

    values.push(jobId);

    const query = `
      UPDATE ai_autotrain_jobs
      SET ${fields.join(', ')}
      WHERE job_id = ?
    `;

    await db.query(query, values);
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} Job
   */
  async getJob(jobId) {
    const query = `
      SELECT *
      FROM ai_autotrain_jobs
      WHERE job_id = ?
    `;

    const result = await db.query(query, [jobId]);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get recent jobs for an item
   * @param {string} itemCode - Item code
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Jobs
   */
  async getJobsForItem(itemCode, limit = 10) {
    const query = `
      SELECT *
      FROM ai_autotrain_jobs
      WHERE item_code = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const result = await db.query(query, [itemCode, limit]);
    return result.rows || [];
  }
}

module.exports = new AutoTrainer();
