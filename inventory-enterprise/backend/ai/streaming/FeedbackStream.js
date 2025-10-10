/**
 * Streaming Feedback Bridge
 * Version: v2.3.0-2025-10-07
 *
 * Listens for new ai_feedback entries, pushes deltas to event bus,
 * triggers incremental retraining if drift > threshold
 */

const db = require('../../config/database');
const logger = require('../../config/logger');
const eventBus = require('../../events');
const autoTrainer = require('../autotrainer/AutoTrainer');
const metricsExporter = require('../../utils/metricsExporter');

class FeedbackStream {
  constructor() {
    this.isStreaming = false;
    this.lastProcessedId = 0;
    this.pollInterval = null;
    this.config = {
      pollIntervalMs: parseInt(process.env.FEEDBACK_POLL_INTERVAL || '5000'), // 5 seconds
      batchSize: parseInt(process.env.FEEDBACK_BATCH_SIZE || '100'),
      driftCheckThreshold: parseFloat(process.env.FEEDBACK_DRIFT_THRESHOLD || '0.15'), // 15% MAPE
      incrementalRetrainEnabled: process.env.INCREMENTAL_RETRAIN_ENABLED !== 'false'
    };

    this.itemDriftCache = new Map(); // Track MAPE per item
  }

  /**
   * Start streaming feedback
   */
  async start() {
    if (this.isStreaming) {
      logger.warn('[FeedbackStream] Already streaming');
      return;
    }

    try {
      // Get last processed ID
      this.lastProcessedId = await this.getLastProcessedId();

      this.isStreaming = true;
      this.pollInterval = setInterval(() => this.poll(), this.config.pollIntervalMs);

      logger.info(`[FeedbackStream] Started streaming feedback (poll: ${this.config.pollIntervalMs}ms, lastId: ${this.lastProcessedId})`);
    } catch (error) {
      logger.error('[FeedbackStream] Error starting stream:', error);
      throw error;
    }
  }

  /**
   * Stop streaming feedback
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.isStreaming = false;
    logger.info('[FeedbackStream] Stopped streaming feedback');
  }

  /**
   * Get last processed feedback ID from database
   */
  async getLastProcessedId() {
    try {
      const query = `
        SELECT MAX(id) as max_id
        FROM ai_feedback
      `;

      const result = await db.query(query, []);
      return result.rows && result.rows[0]?.max_id ? result.rows[0].max_id : 0;
    } catch (error) {
      logger.error('[FeedbackStream] Error getting last processed ID:', error);
      return 0;
    }
  }

  /**
   * Poll for new feedback entries
   */
  async poll() {
    if (!this.isStreaming) return;

    try {
      const startTime = Date.now();

      // Query new feedback entries
      const query = `
        SELECT *
        FROM ai_feedback
        WHERE id > ?
        ORDER BY id ASC
        LIMIT ?
      `;

      const result = await db.query(query, [this.lastProcessedId, this.config.batchSize]);

      if (!result.rows || result.rows.length === 0) {
        return; // No new entries
      }

      logger.debug(`[FeedbackStream] Processing ${result.rows.length} new feedback entries`);

      // Process each entry
      for (const row of result.rows) {
        await this.processFeedbackEntry(row);
        this.lastProcessedId = row.id;
      }

      // Record processing metrics
      const duration = (Date.now() - startTime) / 1000;
      metricsExporter.recordFeedbackStreamProcessing(result.rows.length, duration);

      logger.debug(`[FeedbackStream] Processed ${result.rows.length} entries in ${duration.toFixed(2)}s`);
    } catch (error) {
      logger.error('[FeedbackStream] Error polling feedback:', error);
    }
  }

  /**
   * Process single feedback entry
   */
  async processFeedbackEntry(entry) {
    const { item_code, forecast, actual, mape, rmse, source } = entry;

    try {
      // Emit to event bus (triggers WebSocket broadcast)
      eventBus.emitFeedbackIngested(
        item_code,
        actual,
        forecast,
        mape,
        rmse,
        source
      );

      // Update item drift cache
      this.updateItemDriftCache(item_code, mape);

      // Check if incremental retraining needed
      if (this.config.incrementalRetrainEnabled) {
        await this.checkIncrementalRetrain(item_code);
      }

      // Update Prometheus metrics
      metricsExporter.recordAccuracyMetric(item_code, mape, rmse);
    } catch (error) {
      logger.error(`[FeedbackStream] Error processing entry for ${item_code}:`, error);
    }
  }

  /**
   * Update item drift cache with rolling window
   */
  updateItemDriftCache(itemCode, mape) {
    if (!this.itemDriftCache.has(itemCode)) {
      this.itemDriftCache.set(itemCode, {
        mapeValues: [],
        lastCheck: Date.now(),
        driftCount: 0
      });
    }

    const cache = this.itemDriftCache.get(itemCode);
    cache.mapeValues.push(mape);

    // Keep only last 20 values (rolling window)
    if (cache.mapeValues.length > 20) {
      cache.mapeValues.shift();
    }
  }

  /**
   * Check if incremental retraining is needed
   */
  async checkIncrementalRetrain(itemCode) {
    const cache = this.itemDriftCache.get(itemCode);
    if (!cache || cache.mapeValues.length < 10) {
      return; // Need at least 10 samples
    }

    // Calculate recent average MAPE
    const recentMape = cache.mapeValues.reduce((sum, val) => sum + val, 0) / cache.mapeValues.length;

    // Check if drift exceeds threshold
    if (recentMape > this.config.driftCheckThreshold * 100) {
      const timeSinceLastCheck = Date.now() - cache.lastCheck;

      // Only trigger if > 1 hour since last check (prevent thrashing)
      if (timeSinceLastCheck > 60 * 60 * 1000) {
        logger.info(`[FeedbackStream] Drift detected for ${itemCode}: MAPE=${recentMape.toFixed(2)}% > ${this.config.driftCheckThreshold * 100}%`);

        // Emit drift event
        eventBus.emitDriftDetected(
          itemCode,
          'incremental_mape',
          recentMape,
          this.config.driftCheckThreshold * 100,
          { recentMape, threshold: this.config.driftCheckThreshold * 100 }
        );

        // Trigger incremental retrain
        try {
          await autoTrainer.triggerRetrain({
            itemCode,
            trigger: 'incremental_drift',
            reason: `Streaming MAPE ${recentMape.toFixed(2)}% exceeds threshold ${this.config.driftCheckThreshold * 100}%`,
            metrics: { recentMape }
          });

          cache.lastCheck = Date.now();
          cache.driftCount++;

          logger.info(`[FeedbackStream] Incremental retrain triggered for ${itemCode}`);
        } catch (error) {
          logger.error(`[FeedbackStream] Error triggering retrain for ${itemCode}:`, error);
        }
      }
    }
  }

  /**
   * Get streaming statistics
   */
  getStats() {
    return {
      isStreaming: this.isStreaming,
      lastProcessedId: this.lastProcessedId,
      pollIntervalMs: this.config.pollIntervalMs,
      itemsTracked: this.itemDriftCache.size,
      itemsWithDrift: Array.from(this.itemDriftCache.entries())
        .filter(([_, cache]) => cache.driftCount > 0)
        .length
    };
  }

  /**
   * Clear drift cache (for testing)
   */
  clearCache() {
    this.itemDriftCache.clear();
    logger.debug('[FeedbackStream] Drift cache cleared');
  }
}

// Singleton instance
const feedbackStream = new FeedbackStream();

module.exports = feedbackStream;
