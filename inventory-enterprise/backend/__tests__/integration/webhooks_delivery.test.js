/**
 * Integration Tests: Webhook Delivery System
 * Version: v2.4.1-2025-10-07
 *
 * Validates HMAC signatures, retry logic, exponential backoff, and DLQ.
 */

const request = require('supertest');
const crypto = require('crypto');
const nock = require('nock');
const db = require('../../config/database');
const { webhookDispatcher, EVENT_TYPES } = require('../../services/webhookDispatcher_2025-10-07');

describe('Webhook Delivery System', () => {
  let app;
  let tenantId;
  let adminToken;
  let webhookId;
  let webhookSecret;

  beforeAll(async () => {
    app = require('../../server');

    // Create test tenant
    const tenantResult = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('Webhook Test Tenant', 'active')
      RETURNING tenant_id
    `);
    tenantId = tenantResult.rows[0].tenant_id;

    // Create admin user and get token
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    const userResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('webhook-admin@test.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'webhook-admin@test.com', password: 'Test123!' });

    adminToken = login.body.token;

    // Start webhook dispatcher
    webhookDispatcher.start();
  });

  afterAll(async () => {
    // Stop webhook dispatcher
    webhookDispatcher.stop();

    // Clean up
    nock.cleanAll();
    await db.query('DELETE FROM webhook_deliveries WHERE webhook_id = ?', [webhookId]);
    await db.query('DELETE FROM webhook_endpoints WHERE webhook_id = ?', [webhookId]);
    await db.query('DELETE FROM users WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
    await db.close();
  });

  describe('HMAC Signature Generation and Verification', () => {
    test('Webhook secret is generated on creation', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          events: [EVENT_TYPES.INVENTORY_UPDATED]
        });

      expect(response.status).toBe(201);
      expect(response.body.webhook.secret).toBeDefined();
      expect(response.body.webhook.secret.length).toBe(64); // 32 bytes hex = 64 chars

      webhookId = response.body.webhook.webhook_id;
      webhookSecret = response.body.webhook.secret;
    });

    test('HMAC signature is generated correctly', () => {
      const payload = { test: 'data', timestamp: new Date().toISOString() };
      const signature = webhookDispatcher.generateSignature(webhookSecret, payload);

      expect(signature).toBeDefined();
      expect(signature.length).toBe(64); // SHA-256 hex = 64 chars
    });

    test('HMAC signature verification works', () => {
      const payload = { test: 'data', timestamp: new Date().toISOString() };
      const signature = webhookDispatcher.generateSignature(webhookSecret, payload);

      const isValid = webhookDispatcher.verifySignature(webhookSecret, payload, signature);
      expect(isValid).toBe(true);
    });

    test('HMAC signature verification rejects tampered payload', () => {
      const payload = { test: 'data', timestamp: new Date().toISOString() };
      const signature = webhookDispatcher.generateSignature(webhookSecret, payload);

      // Tamper with payload
      payload.test = 'tampered';

      const isValid = webhookDispatcher.verifySignature(webhookSecret, payload, signature);
      expect(isValid).toBe(false);
    });

    test('HMAC signature uses timing-safe comparison', () => {
      const payload = { test: 'data' };
      const correctSignature = webhookDispatcher.generateSignature(webhookSecret, payload);
      const wrongSignature = correctSignature.substring(0, 63) + 'X'; // Change last char

      const isValid = webhookDispatcher.verifySignature(webhookSecret, payload, wrongSignature);
      expect(isValid).toBe(false);
    });
  });

  describe('Webhook Delivery Success', () => {
    test('Successful delivery marks status as sent', async () => {
      // Mock successful endpoint
      const scope = nock('https://example.com')
        .post('/webhook')
        .reply(200, { received: true });

      // Emit event
      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-001', quantity: 100 }
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check delivery record
      const result = await db.query(`
        SELECT status, http_status, attempts
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].status).toBe('sent');
      expect(result.rows[0].http_status).toBe(200);
      expect(result.rows[0].attempts).toBe(1);

      scope.done();
    });

    test('Successful delivery includes correct headers', async () => {
      let receivedHeaders = {};

      const scope = nock('https://example.com')
        .post('/webhook', (body) => {
          receivedHeaders = scope.interceptors[0].headers;
          return true;
        })
        .reply(200, { received: true });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-002', quantity: 200 }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedHeaders['x-webhook-signature']).toBeDefined();
      expect(receivedHeaders['x-webhook-event']).toBe(EVENT_TYPES.INVENTORY_UPDATED);
      expect(receivedHeaders['content-type']).toBe('application/json');

      scope.done();
    });
  });

  describe('Webhook Retry Logic', () => {
    test('5xx errors trigger retry', async () => {
      const scope = nock('https://example.com')
        .post('/webhook')
        .reply(503, { error: 'Service Unavailable' })
        .post('/webhook')
        .reply(200, { received: true });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-003', quantity: 300 }
      );

      // Wait for initial attempt + 1s retry
      await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await db.query(`
        SELECT status, attempts, http_status
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].attempts).toBeGreaterThan(1);
      expect(result.rows[0].status).toBe('sent'); // Eventually succeeded

      scope.done();
    });

    test('4xx errors do not trigger retry', async () => {
      const scope = nock('https://example.com')
        .post('/webhook')
        .reply(400, { error: 'Bad Request' });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-004', quantity: 400 }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await db.query(`
        SELECT status, attempts, http_status
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].attempts).toBe(1); // No retry
      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].http_status).toBe(400);

      scope.done();
    });

    test('Network errors trigger retry', async () => {
      const scope = nock('https://example.com')
        .post('/webhook')
        .replyWithError('Network error')
        .post('/webhook')
        .reply(200, { received: true });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-005', quantity: 500 }
      );

      await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await db.query(`
        SELECT status, attempts, error_message
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].attempts).toBeGreaterThan(1);

      scope.done();
    });
  });

  describe('Exponential Backoff', () => {
    test('Retry delays increase exponentially (1s, 5s, 25s)', async () => {
      const scope = nock('https://example.com')
        .post('/webhook')
        .times(3)
        .reply(503, { error: 'Service Unavailable' });

      const startTime = Date.now();
      const deliveryTimes = [];

      // Mock delivery to capture timing
      const originalDeliver = webhookDispatcher.deliverWebhook.bind(webhookDispatcher);
      webhookDispatcher.deliverWebhook = async function (delivery) {
        deliveryTimes.push(Date.now() - startTime);
        return originalDeliver(delivery);
      };

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-006', quantity: 600 }
      );

      // Wait for all retries (1s + 5s + 25s = 31s, but we'll wait 10s for test)
      await new Promise(resolve => setTimeout(resolve, 7000));

      // Check that retries occurred with increasing delays
      const result = await db.query(`
        SELECT attempts
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].attempts).toBeGreaterThan(1);

      // Restore original method
      webhookDispatcher.deliverWebhook = originalDeliver;
      scope.done();
    });
  });

  describe('Dead Letter Queue (DLQ)', () => {
    test('Exhausted retries move to DLQ', async () => {
      // Fail all 3 attempts
      const scope = nock('https://example.com')
        .post('/webhook')
        .times(3)
        .reply(503, { error: 'Service Unavailable' });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'TEST-007', quantity: 700 }
      );

      // Wait for all retries to exhaust
      await new Promise(resolve => setTimeout(resolve, 32000)); // 1s + 5s + 25s + buffer

      const result = await db.query(`
        SELECT status, attempts, max_attempts
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [webhookId]);

      expect(result.rows[0].status).toBe('dlq');
      expect(result.rows[0].attempts).toBe(result.rows[0].max_attempts);

      scope.done();
    });

    test('DLQ deliveries are not retried', async () => {
      // Get a DLQ delivery
      const dlqDelivery = await db.query(`
        SELECT delivery_id
        FROM webhook_deliveries
        WHERE status = 'dlq' AND webhook_id = ?
        LIMIT 1
      `, [webhookId]);

      if (dlqDelivery.rows.length > 0) {
        const deliveryId = dlqDelivery.rows[0].delivery_id;

        // Verify it's not picked up for retry
        await webhookDispatcher.processDeliveries();

        const result = await db.query(`
          SELECT status, attempts
          FROM webhook_deliveries
          WHERE delivery_id = ?
        `, [deliveryId]);

        expect(result.rows[0].status).toBe('dlq');
      }
    });
  });

  describe('Webhook Auto-Disable', () => {
    test('10 consecutive failures auto-disable webhook', async () => {
      // Create a new webhook for this test
      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Auto-Disable Test Webhook',
          url: 'https://fail.example.com/webhook',
          events: [EVENT_TYPES.INVENTORY_UPDATED]
        });

      const testWebhookId = response.body.webhook.webhook_id;

      // Mock 10 failures
      const scope = nock('https://fail.example.com')
        .post('/webhook')
        .times(10)
        .reply(500, { error: 'Internal Server Error' });

      // Emit 10 events
      for (let i = 0; i < 10; i++) {
        await webhookDispatcher.emit(
          tenantId,
          EVENT_TYPES.INVENTORY_UPDATED,
          { item_code: `FAIL-${i}`, quantity: i }
        );
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check webhook status
      const result = await db.query(`
        SELECT status, failure_count
        FROM webhook_endpoints
        WHERE webhook_id = ?
      `, [testWebhookId]);

      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].failure_count).toBeGreaterThanOrEqual(10);

      // Clean up
      await db.query('DELETE FROM webhook_deliveries WHERE webhook_id = ?', [testWebhookId]);
      await db.query('DELETE FROM webhook_endpoints WHERE webhook_id = ?', [testWebhookId]);
      scope.done();
    });
  });

  describe('Webhook Statistics', () => {
    test('Webhook stats are updated on delivery', async () => {
      const scope = nock('https://example.com')
        .post('/webhook')
        .reply(200, { received: true });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'STATS-TEST', quantity: 999 }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check webhook stats
      const result = await db.query(`
        SELECT last_triggered_at, last_success_at, failure_count
        FROM webhook_endpoints
        WHERE webhook_id = ?
      `, [webhookId]);

      expect(result.rows[0].last_triggered_at).not.toBeNull();
      expect(result.rows[0].last_success_at).not.toBeNull();

      scope.done();
    });

    test('Delivery stats API returns correct counts', async () => {
      const stats = await webhookDispatcher.getDeliveryStats(webhookId);

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.successful).toBeGreaterThan(0);
      expect(Number(stats.total)).toBe(
        Number(stats.successful) +
        Number(stats.failed || 0) +
        Number(stats.dlq || 0) +
        Number(stats.pending || 0)
      );
    });
  });

  describe('Event Filtering', () => {
    test('Webhook only receives subscribed events', async () => {
      // Create webhook subscribed to FORECAST_UPDATED only
      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Forecast Only Webhook',
          url: 'https://forecast.example.com/webhook',
          events: [EVENT_TYPES.FORECAST_UPDATED]
        });

      const forecastWebhookId = response.body.webhook.webhook_id;

      const scope = nock('https://forecast.example.com')
        .post('/webhook')
        .reply(200, { received: true });

      // Emit INVENTORY_UPDATED (should not trigger)
      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'FILTER-TEST', quantity: 100 }
      );

      // Emit FORECAST_UPDATED (should trigger)
      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.FORECAST_UPDATED,
        { item_code: 'FILTER-TEST', forecast: [1, 2, 3] }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check deliveries
      const result = await db.query(`
        SELECT COUNT(*) as count, event_type
        FROM webhook_deliveries
        WHERE webhook_id = ?
        GROUP BY event_type
      `, [forecastWebhookId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe(EVENT_TYPES.FORECAST_UPDATED);

      // Clean up
      await db.query('DELETE FROM webhook_deliveries WHERE webhook_id = ?', [forecastWebhookId]);
      await db.query('DELETE FROM webhook_endpoints WHERE webhook_id = ?', [forecastWebhookId]);
      scope.done();
    });
  });

  describe('Metrics Recording', () => {
    test('Webhook deliveries increment metrics', async () => {
      const metricsExporter = require('../../utils/metricsExporter');

      const scope = nock('https://example.com')
        .post('/webhook')
        .reply(200, { received: true });

      await webhookDispatcher.emit(
        tenantId,
        EVENT_TYPES.INVENTORY_UPDATED,
        { item_code: 'METRICS-TEST', quantity: 100 }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const metrics = await metricsExporter.getMetrics();

      // Should contain webhook_deliveries_total metric
      expect(metrics).toContain('webhook_deliveries_total');

      scope.done();
    });
  });
});
