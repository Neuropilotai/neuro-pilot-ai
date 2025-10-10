/**
 * Internal Event Bus
 * Version: v2.3.0-2025-10-07
 *
 * Lightweight pub/sub system for real-time AI events
 * Events: FORECAST_UPDATED, POLICY_COMMITTED, ANOMALY_DETECTED, FEEDBACK_INGESTED
 */

const EventEmitter = require('events');
const logger = require('../config/logger');

class AIEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent listeners
    this.eventStats = new Map();

    // Event type definitions
    this.EVENT_TYPES = {
      FORECAST_UPDATED: 'forecast:updated',
      POLICY_COMMITTED: 'policy:committed',
      ANOMALY_DETECTED: 'anomaly:detected',
      FEEDBACK_INGESTED: 'feedback:ingested',
      MODEL_RETRAINED: 'model:retrained',
      DRIFT_DETECTED: 'drift:detected'
    };

    this.setupLogging();
  }

  /**
   * Setup event logging for monitoring
   */
  setupLogging() {
    Object.values(this.EVENT_TYPES).forEach(eventType => {
      this.on(eventType, (data) => {
        this.recordEvent(eventType, data);
      });
    });
  }

  /**
   * Record event for statistics
   */
  recordEvent(eventType, data) {
    if (!this.eventStats.has(eventType)) {
      this.eventStats.set(eventType, {
        count: 0,
        lastEmitted: null,
        lastData: null
      });
    }

    const stats = this.eventStats.get(eventType);
    stats.count++;
    stats.lastEmitted = new Date();
    stats.lastData = data;

    logger.debug(`[EventBus] ${eventType} emitted`, {
      count: stats.count,
      data
    });
  }

  /**
   * Emit forecast update event
   */
  emitForecastUpdate(itemCode, forecast, modelType) {
    this.emit(this.EVENT_TYPES.FORECAST_UPDATED, {
      itemCode,
      forecast,
      modelType,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit policy commit event
   */
  emitPolicyCommit(itemCode, policy, improvementPercent, reward) {
    this.emit(this.EVENT_TYPES.POLICY_COMMITTED, {
      itemCode,
      policy,
      improvementPercent,
      reward,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit anomaly detection event
   */
  emitAnomalyDetected(itemCode, anomalyType, severity, details) {
    this.emit(this.EVENT_TYPES.ANOMALY_DETECTED, {
      itemCode,
      anomalyType,
      severity,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit feedback ingestion event
   */
  emitFeedbackIngested(itemCode, actual, forecast, mape, rmse, source) {
    this.emit(this.EVENT_TYPES.FEEDBACK_INGESTED, {
      itemCode,
      actual,
      forecast,
      mape,
      rmse,
      source,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit model retrain event
   */
  emitModelRetrained(itemCode, modelType, metrics, duration) {
    this.emit(this.EVENT_TYPES.MODEL_RETRAINED, {
      itemCode,
      modelType,
      metrics,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit drift detection event
   */
  emitDriftDetected(itemCode, driftType, currentValue, threshold, metrics) {
    this.emit(this.EVENT_TYPES.DRIFT_DETECTED, {
      itemCode,
      driftType,
      currentValue,
      threshold,
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get event statistics
   */
  getStats() {
    const stats = {};
    this.eventStats.forEach((value, key) => {
      stats[key] = {
        count: value.count,
        lastEmitted: value.lastEmitted
      };
    });
    return stats;
  }

  /**
   * Get listener count for event type
   */
  getListenerCount(eventType) {
    return this.listenerCount(eventType);
  }

  /**
   * Clear all listeners (for testing)
   */
  clearAllListeners() {
    this.removeAllListeners();
    this.eventStats.clear();
    this.setupLogging();
  }
}

// Singleton instance
const eventBus = new AIEventBus();

module.exports = eventBus;
