/**
 * Webhook Management Routes
 * Version: v2.4.0-2025-10-07
 *
 * CRUD operations for webhooks with RBAC enforcement.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const crypto = require('crypto');
const router = express.Router();

const db = require('../config/database');
const logger = require('../config/logger');
const { resolveTenant, requirePermission } = require('../middleware/tenantContext');
const { webhookDispatcher, EVENT_TYPES } = require('../services/webhookDispatcher_2025-10-07');
const { PERMISSIONS } = require('../src/security/permissions');

// Apply tenant context to all routes
router.use(resolveTenant);

/**
 * GET /api/webhooks
 * List all webhooks for tenant
 */
router.get('/',
  requirePermission(PERMISSIONS.WEBHOOKS_READ),
  async (req, res) => {
    try {
      const { tenantId } = req.tenant;

      const query = `
        SELECT
          webhook_id, name, url, events, status,
          retry_count, timeout_ms, created_at, updated_at,
          last_triggered_at, last_success_at, last_failure_at, failure_count
        FROM webhook_endpoints
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `;

      const result = await db.query(query, [tenantId]);

      // Parse events JSON
      const webhooks = result.rows.map(row => ({
        ...row,
        events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events
      }));

      res.json({
        success: true,
        webhooks,
        count: webhooks.length
      });
    } catch (error) {
      logger.error('[Webhooks] Error listing webhooks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list webhooks',
        code: 'WEBHOOKS_LIST_ERROR'
      });
    }
  }
);

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
router.get('/:id',
  requirePermission(PERMISSIONS.WEBHOOKS_READ),
  param('id').isString(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { id } = req.params;

      const query = `
        SELECT
          webhook_id, name, url, events, status, headers,
          retry_count, timeout_ms, created_at, updated_at,
          last_triggered_at, last_success_at, last_failure_at, failure_count
        FROM webhook_endpoints
        WHERE webhook_id = ? AND tenant_id = ?
      `;

      const result = await db.query(query, [id, tenantId]);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
          code: 'WEBHOOK_NOT_FOUND'
        });
      }

      const webhook = result.rows[0];

      // Parse JSON fields
      webhook.events = typeof webhook.events === 'string' ? JSON.parse(webhook.events) : webhook.events;
      webhook.headers = typeof webhook.headers === 'string' ? JSON.parse(webhook.headers) : webhook.headers;

      // Get delivery stats
      const stats = await webhookDispatcher.getDeliveryStats(id);

      res.json({
        success: true,
        webhook,
        deliveryStats: stats
      });
    } catch (error) {
      logger.error('[Webhooks] Error getting webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get webhook',
        code: 'WEBHOOK_GET_ERROR'
      });
    }
  }
);

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/',
  requirePermission(PERMISSIONS.WEBHOOKS_WRITE),
  [
    body('name').isString().trim().isLength({ min: 1, max: 255 }),
    body('url').isURL({ protocols: ['http', 'https'], require_protocol: true }),
    body('events').isArray({ min: 1 }),
    body('headers').optional().isObject(),
    body('retry_count').optional().isInt({ min: 0, max: 10 }),
    body('timeout_ms').optional().isInt({ min: 1000, max: 60000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { name, url, events, headers = {}, retry_count = 3, timeout_ms = 30000 } = req.body;

      // Validate event types
      const validEvents = events.every(e => Object.values(EVENT_TYPES).includes(e));
      if (!validEvents) {
        return res.status(400).json({
          success: false,
          message: 'Invalid event type(s)',
          code: 'INVALID_EVENT_TYPES',
          validEvents: Object.values(EVENT_TYPES)
        });
      }

      // Generate webhook secret
      const secret = crypto.randomBytes(32).toString('hex');

      const query = `
        INSERT INTO webhook_endpoints
        (tenant_id, name, url, secret, events, status, headers, retry_count, timeout_ms, created_by)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
        RETURNING webhook_id
      `;

      const result = await db.query(query, [
        tenantId,
        name,
        url,
        secret,
        JSON.stringify(events),
        JSON.stringify(headers),
        retry_count,
        timeout_ms,
        req.user.userId
      ]);

      const webhookId = result.rows[0]?.webhook_id;

      logger.info(`[Webhooks] Created webhook ${webhookId} for tenant ${tenantId}`);

      res.status(201).json({
        success: true,
        message: 'Webhook created',
        webhook: {
          webhook_id: webhookId,
          name,
          url,
          secret, // Return secret only once on creation
          events,
          status: 'active',
          retry_count,
          timeout_ms
        }
      });
    } catch (error) {
      logger.error('[Webhooks] Error creating webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create webhook',
        code: 'WEBHOOK_CREATE_ERROR'
      });
    }
  }
);

/**
 * PUT /api/webhooks/:id
 * Update webhook
 */
router.put('/:id',
  requirePermission(PERMISSIONS.WEBHOOKS_WRITE),
  [
    param('id').isString(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('url').optional().isURL({ protocols: ['http', 'https'], require_protocol: true }),
    body('events').optional().isArray({ min: 1 }),
    body('headers').optional().isObject(),
    body('retry_count').optional().isInt({ min: 0, max: 10 }),
    body('timeout_ms').optional().isInt({ min: 1000, max: 60000 }),
    body('status').optional().isIn(['active', 'paused'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { id } = req.params;
      const updates = req.body;

      // Validate event types if provided
      if (updates.events) {
        const validEvents = updates.events.every(e => Object.values(EVENT_TYPES).includes(e));
        if (!validEvents) {
          return res.status(400).json({
            success: false,
            message: 'Invalid event type(s)',
            code: 'INVALID_EVENT_TYPES',
            validEvents: Object.values(EVENT_TYPES)
          });
        }
      }

      // Build update query dynamically
      const updateFields = [];
      const values = [];

      if (updates.name) {
        updateFields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.url) {
        updateFields.push('url = ?');
        values.push(updates.url);
      }
      if (updates.events) {
        updateFields.push('events = ?');
        values.push(JSON.stringify(updates.events));
      }
      if (updates.headers !== undefined) {
        updateFields.push('headers = ?');
        values.push(JSON.stringify(updates.headers));
      }
      if (updates.retry_count !== undefined) {
        updateFields.push('retry_count = ?');
        values.push(updates.retry_count);
      }
      if (updates.timeout_ms !== undefined) {
        updateFields.push('timeout_ms = ?');
        values.push(updates.timeout_ms);
      }
      if (updates.status) {
        updateFields.push('status = ?');
        values.push(updates.status);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update',
          code: 'NO_UPDATES'
        });
      }

      updateFields.push('updated_at = datetime(\'now\')');
      values.push(id, tenantId);

      const query = `
        UPDATE webhook_endpoints
        SET ${updateFields.join(', ')}
        WHERE webhook_id = ? AND tenant_id = ?
      `;

      const result = await db.query(query, values);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
          code: 'WEBHOOK_NOT_FOUND'
        });
      }

      logger.info(`[Webhooks] Updated webhook ${id} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: 'Webhook updated'
      });
    } catch (error) {
      logger.error('[Webhooks] Error updating webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update webhook',
        code: 'WEBHOOK_UPDATE_ERROR'
      });
    }
  }
);

/**
 * DELETE /api/webhooks/:id
 * Delete webhook
 */
router.delete('/:id',
  requirePermission(PERMISSIONS.WEBHOOKS_DELETE),
  param('id').isString(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { id } = req.params;

      const query = `
        DELETE FROM webhook_endpoints
        WHERE webhook_id = ? AND tenant_id = ?
      `;

      const result = await db.query(query, [id, tenantId]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
          code: 'WEBHOOK_NOT_FOUND'
        });
      }

      logger.info(`[Webhooks] Deleted webhook ${id} for tenant ${tenantId}`);

      res.json({
        success: true,
        message: 'Webhook deleted'
      });
    } catch (error) {
      logger.error('[Webhooks] Error deleting webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete webhook',
        code: 'WEBHOOK_DELETE_ERROR'
      });
    }
  }
);

/**
 * POST /api/webhooks/:id/test
 * Test webhook delivery
 */
router.post('/:id/test',
  requirePermission(PERMISSIONS.WEBHOOKS_WRITE),
  param('id').isString(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { id } = req.params;

      // Get webhook
      const query = `
        SELECT webhook_id, name, url, secret, events
        FROM webhook_endpoints
        WHERE webhook_id = ? AND tenant_id = ?
      `;

      const result = await db.query(query, [id, tenantId]);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
          code: 'WEBHOOK_NOT_FOUND'
        });
      }

      // Emit test event
      const testPayload = {
        event: 'webhook.test',
        tenant_id: tenantId,
        webhook_id: id,
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook delivery'
      };

      await webhookDispatcher.emit(tenantId, 'webhook.test', testPayload);

      logger.info(`[Webhooks] Sent test event to webhook ${id}`);

      res.json({
        success: true,
        message: 'Test webhook sent',
        note: 'Check webhook_deliveries table for delivery status'
      });
    } catch (error) {
      logger.error('[Webhooks] Error testing webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test webhook',
        code: 'WEBHOOK_TEST_ERROR'
      });
    }
  }
);

/**
 * GET /api/webhooks/:id/deliveries
 * Get webhook deliveries
 */
router.get('/:id/deliveries',
  requirePermission(PERMISSIONS.WEBHOOKS_READ),
  [
    param('id').isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isIn(['pending', 'sent', 'failed', 'dlq'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { tenantId } = req.tenant;
      const { id } = req.params;
      const { limit = 50, offset = 0, status } = req.query;

      // Verify webhook belongs to tenant
      const checkQuery = `
        SELECT webhook_id FROM webhook_endpoints
        WHERE webhook_id = ? AND tenant_id = ?
      `;

      const checkResult = await db.query(checkQuery, [id, tenantId]);

      if (!checkResult.rows || checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
          code: 'WEBHOOK_NOT_FOUND'
        });
      }

      // Get deliveries
      let query = `
        SELECT
          delivery_id, event_type, status, attempts, max_attempts,
          http_status, error_message, created_at, sent_at, completed_at
        FROM webhook_deliveries
        WHERE webhook_id = ?
      `;

      const values = [id];

      if (status) {
        query += ' AND status = ?';
        values.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      values.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, values);

      res.json({
        success: true,
        deliveries: result.rows || [],
        count: result.rows?.length || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('[Webhooks] Error getting deliveries:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get deliveries',
        code: 'DELIVERIES_GET_ERROR'
      });
    }
  }
);

/**
 * GET /api/webhooks/events
 * List available event types
 */
router.get('/events',
  requirePermission(PERMISSIONS.WEBHOOKS_READ),
  (req, res) => {
    res.json({
      success: true,
      events: Object.values(EVENT_TYPES).map(event => ({
        type: event,
        description: getEventDescription(event)
      }))
    });
  }
);

/**
 * Get event description
 */
function getEventDescription(event) {
  const descriptions = {
    [EVENT_TYPES.INVENTORY_UPDATED]: 'Inventory item updated (quantity, price, etc.)',
    [EVENT_TYPES.INVENTORY_CREATED]: 'New inventory item created',
    [EVENT_TYPES.INVENTORY_DELETED]: 'Inventory item deleted',
    [EVENT_TYPES.FORECAST_UPDATED]: 'AI forecast updated for an item',
    [EVENT_TYPES.POLICY_COMMITTED]: 'RL policy committed (reorder point change)',
    [EVENT_TYPES.ANOMALY_DETECTED]: 'Anomaly detected in inventory or orders',
    [EVENT_TYPES.ORDER_CREATED]: 'New order created',
    [EVENT_TYPES.ORDER_UPDATED]: 'Order updated',
    [EVENT_TYPES.USER_CREATED]: 'New user created',
    [EVENT_TYPES.TENANT_UPDATED]: 'Tenant settings updated'
  };

  return descriptions[event] || 'Unknown event';
}

module.exports = router;
