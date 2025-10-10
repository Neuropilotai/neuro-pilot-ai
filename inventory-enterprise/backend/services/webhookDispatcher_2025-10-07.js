/**
 * Webhook Dispatcher Service
 * Version: v2.4.0-2025-10-07
 *
 * Dispatches webhook events to registered endpoints with:
 * - HMAC-SHA256 signatures
 * - Exponential backoff retry (1s, 5s, 25s)
 * - Dead-letter queue (DLQ) on exhaustion
 * - Delivery logging and metrics
 */

const crypto = require('crypto');
const axios = require('axios');
const db = require('../config/database');
const logger = require('../config/logger');
const metricsExporter = require('../utils/metricsExporter');

// Supported event types
const EVENT_TYPES = {
  INVENTORY_UPDATED: 'inventory.updated',
  INVENTORY_CREATED: 'inventory.created',
  INVENTORY_DELETED: 'inventory.deleted',
  FORECAST_UPDATED: 'forecast.updated',
  POLICY_COMMITTED: 'policy.committed',
  ANOMALY_DETECTED: 'anomaly.detected',
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  USER_CREATED: 'user.created',
  TENANT_UPDATED: 'tenant.updated'
};

class WebhookDispatcher {
  constructor() {
    this.retryDelays = [1000, 5000, 25000]; // 1s, 5s, 25s
    this.isProcessing = false;
    this.processingInterval = null;
  }

  /**
   * Emit an event to all subscribed webhooks
   * @param {string} tenantId - Tenant ID
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Promise<void>}
   */
  async emit(tenantId, eventType, payload) {
    try {
      // Validate event type
      if (!Object.values(EVENT_TYPES).includes(eventType)) {
        logger.warn(`[WebhookDispatcher] Invalid event type: ${eventType}`);
        return;
      }

      // Get all active webhooks for this tenant and event
      const webhooks = await this.getSubscribedWebhooks(tenantId, eventType);

      if (webhooks.length === 0) {
        logger.debug(`[WebhookDispatcher] No webhooks subscribed to ${eventType} for tenant ${tenantId}`);
        return;
      }

      logger.info(`[WebhookDispatcher] Emitting ${eventType} to ${webhooks.length} webhook(s) for tenant ${tenantId}`);

      // Create delivery records for each webhook
      for (const webhook of webhooks) {
        await this.createDelivery(webhook, eventType, payload);
      }

      // Process deliveries asynchronously
      setImmediate(() => this.processDeliveries());
    } catch (error) {
      logger.error('[WebhookDispatcher] Error emitting event:', error);
    }
  }

  /**
   * Get webhooks subscribed to an event
   * @param {string} tenantId - Tenant ID
   * @param {string} eventType - Event type
   * @returns {Promise<Array>}
   */
  async getSubscribedWebhooks(tenantId, eventType) {
    try {
      const query = `
        SELECT webhook_id, name, url, secret, headers, retry_count, timeout_ms
        FROM webhook_endpoints
        WHERE tenant_id = ? AND status = 'active'
          AND (events LIKE ? OR events LIKE ?)
      `;

      // Match both JSON array format: ["event"] or ["event",...]
      const eventPattern1 = `%"${eventType}"%`;
      const eventPattern2 = `%${eventType}%`;

      const result = await db.query(query, [tenantId, eventPattern1, eventPattern2]);

      return result.rows || [];
    } catch (error) {
      logger.error('[WebhookDispatcher] Error getting subscribed webhooks:', error);
      return [];
    }
  }

  /**
   * Create a delivery record
   * @param {Object} webhook - Webhook configuration
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Promise<string>} - Delivery ID
   */
  async createDelivery(webhook, eventType, payload) {
    try {
      // Generate HMAC signature
      const signature = this.generateSignature(webhook.secret, payload);

      // Create delivery record
      const query = `
        INSERT INTO webhook_deliveries
        (webhook_id, event_type, payload, signature, status, max_attempts)
        VALUES (?, ?, ?, ?, 'pending', ?)
        RETURNING delivery_id
      `;

      const result = await db.query(query, [
        webhook.webhook_id,
        eventType,
        JSON.stringify(payload),
        signature,
        webhook.retry_count || 3
      ]);

      const deliveryId = result.rows[0]?.delivery_id;

      logger.debug(`[WebhookDispatcher] Created delivery ${deliveryId} for webhook ${webhook.webhook_id}`);

      return deliveryId;
    } catch (error) {
      logger.error('[WebhookDispatcher] Error creating delivery:', error);
      return null;
    }
  }

  /**
   * Generate HMAC-SHA256 signature
   * @param {string} secret - Webhook secret
   * @param {Object} payload - Payload to sign
   * @returns {string} - Signature
   */
  generateSignature(secret, payload) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   * @param {string} secret - Webhook secret
   * @param {Object} payload - Payload to verify
   * @param {string} signature - Signature to check
   * @returns {boolean}
   */
  verifySignature(secret, payload, signature) {
    const expectedSignature = this.generateSignature(secret, payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process pending deliveries
   */
  async processDeliveries() {
    if (this.isProcessing) {
      logger.debug('[WebhookDispatcher] Already processing deliveries');
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending deliveries
      const query = `
        SELECT
          d.delivery_id, d.webhook_id, d.event_type, d.payload,
          d.signature, d.attempts, d.max_attempts,
          w.url, w.headers, w.timeout_ms, w.name
        FROM webhook_deliveries d
        JOIN webhook_endpoints w ON d.webhook_id = w.webhook_id
        WHERE d.status = 'pending'
          AND (d.next_retry_at IS NULL OR d.next_retry_at <= datetime('now'))
        ORDER BY d.created_at ASC
        LIMIT 100
      `;

      const result = await db.query(query, []);

      if (!result.rows || result.rows.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info(`[WebhookDispatcher] Processing ${result.rows.length} pending deliveries`);

      for (const delivery of result.rows) {
        await this.deliverWebhook(delivery);
      }
    } catch (error) {
      logger.error('[WebhookDispatcher] Error processing deliveries:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Deliver a single webhook
   * @param {Object} delivery - Delivery record
   */
  async deliverWebhook(delivery) {
    const startTime = Date.now();

    try {
      // Parse payload and headers
      const payload = typeof delivery.payload === 'string'
        ? JSON.parse(delivery.payload)
        : delivery.payload;

      const customHeaders = typeof delivery.headers === 'string'
        ? JSON.parse(delivery.headers)
        : (delivery.headers || {});

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Inventory-Enterprise-Webhook/2.4.0',
        'X-Webhook-Signature': delivery.signature,
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Delivery': delivery.delivery_id,
        'X-Webhook-Attempt': delivery.attempts + 1,
        ...customHeaders
      };

      // Send request
      const response = await axios.post(delivery.url, payload, {
        headers,
        timeout: delivery.timeout_ms || 30000,
        validateStatus: () => true // Don't throw on non-2xx status
      });

      const duration = Date.now() - startTime;

      // Check response status
      if (response.status >= 200 && response.status < 300) {
        // Success
        await this.markDeliverySuccess(delivery, response, duration);
        metricsExporter.recordWebhookDelivery(delivery.event_type, 'success');
        logger.info(`[WebhookDispatcher] ✅ Delivered ${delivery.event_type} to ${delivery.name} (${duration}ms)`);
      } else if (response.status >= 500) {
        // Server error - retry
        await this.markDeliveryFailed(delivery, response, duration, true);
        metricsExporter.recordWebhookDelivery(delivery.event_type, 'failed_retry');
      } else {
        // Client error - no retry
        await this.markDeliveryFailed(delivery, response, duration, false);
        metricsExporter.recordWebhookDelivery(delivery.event_type, 'failed_permanent');
      }
    } catch (error) {
      // Network error or timeout - retry
      const duration = Date.now() - startTime;
      await this.markDeliveryFailed(delivery, null, duration, true, error.message);
      metricsExporter.recordWebhookDelivery(delivery.event_type, 'failed_error');
      logger.error(`[WebhookDispatcher] ❌ Failed to deliver to ${delivery.name}:`, error.message);
    }
  }

  /**
   * Mark delivery as successful
   */
  async markDeliverySuccess(delivery, response, duration) {
    try {
      const query = `
        UPDATE webhook_deliveries
        SET status = 'sent',
            http_status = ?,
            response_body = ?,
            sent_at = datetime('now'),
            completed_at = datetime('now')
        WHERE delivery_id = ?
      `;

      await db.query(query, [
        response.status,
        JSON.stringify(response.data).substring(0, 1000), // Limit response body
        delivery.delivery_id
      ]);

      // Update webhook success stats
      await this.updateWebhookStats(delivery.webhook_id, true);
    } catch (error) {
      logger.error('[WebhookDispatcher] Error marking delivery success:', error);
    }
  }

  /**
   * Mark delivery as failed
   */
  async markDeliveryFailed(delivery, response, duration, shouldRetry, errorMessage = null) {
    try {
      const newAttempts = delivery.attempts + 1;
      const maxAttempts = delivery.max_attempts || 3;

      let status = 'pending';
      let nextRetryAt = null;

      if (!shouldRetry || newAttempts >= maxAttempts) {
        // Move to DLQ
        status = 'dlq';
        logger.warn(`[WebhookDispatcher] Delivery ${delivery.delivery_id} moved to DLQ after ${newAttempts} attempts`);
      } else {
        // Schedule retry with exponential backoff
        const delayMs = this.retryDelays[Math.min(newAttempts - 1, this.retryDelays.length - 1)];
        nextRetryAt = new Date(Date.now() + delayMs).toISOString();
        logger.info(`[WebhookDispatcher] Scheduling retry ${newAttempts} for ${delivery.delivery_id} in ${delayMs}ms`);
      }

      const query = `
        UPDATE webhook_deliveries
        SET status = ?,
            attempts = ?,
            http_status = ?,
            response_body = ?,
            error_message = ?,
            next_retry_at = ?,
            sent_at = datetime('now')
        WHERE delivery_id = ?
      `;

      await db.query(query, [
        status,
        newAttempts,
        response?.status || null,
        response ? JSON.stringify(response.data).substring(0, 1000) : null,
        errorMessage,
        nextRetryAt,
        delivery.delivery_id
      ]);

      // Update webhook failure stats
      await this.updateWebhookStats(delivery.webhook_id, false);
    } catch (error) {
      logger.error('[WebhookDispatcher] Error marking delivery failed:', error);
    }
  }

  /**
   * Update webhook statistics
   */
  async updateWebhookStats(webhookId, success) {
    try {
      if (success) {
        const query = `
          UPDATE webhook_endpoints
          SET last_triggered_at = datetime('now'),
              last_success_at = datetime('now'),
              failure_count = 0
          WHERE webhook_id = ?
        `;
        await db.query(query, [webhookId]);
      } else {
        const query = `
          UPDATE webhook_endpoints
          SET last_triggered_at = datetime('now'),
              last_failure_at = datetime('now'),
              failure_count = failure_count + 1
          WHERE webhook_id = ?
        `;
        await db.query(query, [webhookId]);

        // Check if webhook should be auto-disabled
        const checkQuery = `
          SELECT failure_count
          FROM webhook_endpoints
          WHERE webhook_id = ?
        `;
        const result = await db.query(checkQuery, [webhookId]);

        if (result.rows[0]?.failure_count >= 10) {
          logger.warn(`[WebhookDispatcher] Auto-disabling webhook ${webhookId} after 10 consecutive failures`);
          await db.query(
            `UPDATE webhook_endpoints SET status = 'failed' WHERE webhook_id = ?`,
            [webhookId]
          );
        }
      }
    } catch (error) {
      logger.error('[WebhookDispatcher] Error updating webhook stats:', error);
    }
  }

  /**
   * Start background processor
   */
  start() {
    if (this.processingInterval) {
      logger.warn('[WebhookDispatcher] Already started');
      return;
    }

    // Process deliveries every 10 seconds
    this.processingInterval = setInterval(() => {
      this.processDeliveries();
    }, 10000);

    logger.info('[WebhookDispatcher] Background processor started');
  }

  /**
   * Stop background processor
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('[WebhookDispatcher] Background processor stopped');
    }
  }

  /**
   * Get delivery stats for a webhook
   * @param {string} webhookId - Webhook ID
   * @returns {Promise<Object>}
   */
  async getDeliveryStats(webhookId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'dlq' THEN 1 ELSE 0 END) as dlq,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM webhook_deliveries
        WHERE webhook_id = ?
      `;

      const result = await db.query(query, [webhookId]);
      return result.rows[0] || {};
    } catch (error) {
      logger.error('[WebhookDispatcher] Error getting delivery stats:', error);
      return {};
    }
  }
}

// Singleton instance
const webhookDispatcher = new WebhookDispatcher();

module.exports = {
  webhookDispatcher,
  EVENT_TYPES
};
