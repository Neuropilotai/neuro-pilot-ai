/**
 * Real-Time Event Bus (NeuroPilot v12.5)
 * Centralized event distribution for live Owner Console updates
 *
 * @version 12.5.0
 * @author NeuroInnovate AI Team
 */

const EventEmitter = require('events');
const { logger } = require('../config/logger');

class RealtimeBus extends EventEmitter {
  constructor() {
    super();
    this.lastEmit = {};
    this.emitCount = {};
    this.connectedClients = new Set();
  }

  /**
   * Emit real-time event with automatic logging and metrics
   * @param {string} event - Event name (e.g., 'inventory:updated')
   * @param {object} data - Event data payload
   */
  emit(event, data) {
    // Record emit timestamp
    this.lastEmit[event] = Date.now();
    this.emitCount[event] = (this.emitCount[event] || 0) + 1;

    // Log emit (debug level to avoid spam)
    logger.debug('RealtimeBus: Event emitted', {
      event,
      clientCount: this.connectedClients.size,
      timestamp: new Date().toISOString()
    });

    // Emit to all listeners
    super.emit(event, {
      ...data,
      _meta: {
        event,
        timestamp: new Date().toISOString(),
        emitCount: this.emitCount[event]
      }
    });

    // Emit to wildcard listeners
    super.emit('*', {
      event,
      data,
      _meta: {
        timestamp: new Date().toISOString()
      }
    });

    return this;
  }

  /**
   * Register a WebSocket/SSE client
   */
  registerClient(clientId) {
    this.connectedClients.add(clientId);
    logger.info('RealtimeBus: Client registered', {
      clientId,
      totalClients: this.connectedClients.size
    });
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId) {
    this.connectedClients.delete(clientId);
    logger.info('RealtimeBus: Client unregistered', {
      clientId,
      totalClients: this.connectedClients.size
    });
  }

  /**
   * Get real-time bus status
   */
  getStatus() {
    const now = Date.now();
    const recentEvents = Object.entries(this.lastEmit)
      .filter(([_, timestamp]) => (now - timestamp) < 60000) // Last 60 seconds
      .map(([event, timestamp]) => ({
        event,
        lastEmit: new Date(timestamp).toISOString(),
        ageSeconds: Math.floor((now - timestamp) / 1000),
        totalEmits: this.emitCount[event]
      }));

    return {
      healthy: recentEvents.length > 0 || this.connectedClients.size > 0,
      connectedClients: this.connectedClients.size,
      totalEvents: Object.keys(this.emitCount).length,
      recentEvents,
      allEventCounts: this.emitCount,
      lastEmitTimestamps: this.lastEmit
    };
  }

  /**
   * Get health status for each event channel (v13.0)
   * Returns last emit timestamp per channel category
   */
  getHealth() {
    const now = Date.now();
    const channelHealth = {};

    // Group events by category
    const categories = {
      inventory: ['inventory:updated', 'count:updated'],
      forecast: ['forecast:updated', 'forecast:generated'],
      learning: ['learning:event', 'learning:processed'],
      pdf: ['pdf:processed'],
      system: ['system:alert'],
      ai_ops: ['ai_event'] // v13.0: AI Ops activity feed
    };

    for (const [category, events] of Object.entries(categories)) {
      const categoryEmits = events
        .filter(event => this.lastEmit[event])
        .map(event => ({
          event,
          lastEmit: this.lastEmit[event],
          ageMs: now - this.lastEmit[event],
          count: this.emitCount[event] || 0
        }))
        .sort((a, b) => b.lastEmit - a.lastEmit);

      channelHealth[category] = {
        active: categoryEmits.length > 0,
        lastEvent: categoryEmits[0]?.event || null,
        lastEmit: categoryEmits[0]?.lastEmit ? new Date(categoryEmits[0].lastEmit).toISOString() : null,
        ageSeconds: categoryEmits[0]?.ageMs ? Math.floor(categoryEmits[0].ageMs / 1000) : null,
        totalEvents: categoryEmits.reduce((sum, e) => sum + e.count, 0)
      };
    }

    return {
      timestamp: new Date().toISOString(),
      overallHealthy: Object.values(channelHealth).some(ch => ch.active) || this.connectedClients.size > 0,
      channels: channelHealth,
      connectedClients: this.connectedClients.size
    };
  }

  /**
   * Broadcast inventory update
   */
  emitInventoryUpdate(data) {
    this.emit('inventory:updated', {
      type: 'inventory_update',
      ...data
    });
  }

  /**
   * Broadcast count update
   */
  emitCountUpdate(data) {
    this.emit('count:updated', {
      type: 'count_update',
      ...data
    });
  }

  /**
   * Broadcast forecast update
   */
  emitForecastUpdate(data) {
    this.emit('forecast:updated', {
      type: 'forecast_update',
      ...data
    });
  }

  /**
   * Broadcast PDF processing update
   */
  emitPDFUpdate(data) {
    this.emit('pdf:processed', {
      type: 'pdf_update',
      ...data
    });
  }

  /**
   * Broadcast AI learning event
   */
  emitLearningEvent(data) {
    this.emit('learning:event', {
      type: 'learning_event',
      ...data
    });
  }

  /**
   * Broadcast system alert
   */
  emitAlert(level, message, data = {}) {
    this.emit('system:alert', {
      type: 'alert',
      level,
      message,
      ...data
    });
  }
}

// Create singleton instance
const realtimeBus = new RealtimeBus();

// Export for use throughout application
module.exports = realtimeBus;

// Also attach to global for use in cron jobs
global.realtimeBus = realtimeBus;
