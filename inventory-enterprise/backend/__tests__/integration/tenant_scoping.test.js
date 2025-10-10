/**
 * Integration Tests: Tenant Scoping and Isolation
 * Version: v2.4.1-2025-10-07
 *
 * Validates cross-tenant data isolation, query scoping, and index performance.
 */

const request = require('supertest');
const db = require('../../config/database');
const { seedRolesAndPermissions } = require('../../scripts/seed_roles_2025-10-07');

describe('Tenant Scoping and Isolation', () => {
  let app;
  let tenant1Id, tenant2Id;
  let user1Token, user2Token;
  let tenant1ItemId, tenant2ItemId;

  beforeAll(async () => {
    // Initialize app
    app = require('../../server');

    // Run migrations and seed data
    await db.query('BEGIN');
    await seedRolesAndPermissions();

    // Create two test tenants
    const tenant1Result = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('Test Tenant 1', 'active')
      RETURNING tenant_id
    `);
    tenant1Id = tenant1Result.rows[0].tenant_id;

    const tenant2Result = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('Test Tenant 2', 'active')
      RETURNING tenant_id
    `);
    tenant2Id = tenant2Result.rows[0].tenant_id;

    // Create users for each tenant
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    const user1Result = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('user1@tenant1.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenant1Id]);
    const user1Id = user1Result.rows[0].user_id;

    const user2Result = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('user2@tenant2.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenant2Id]);
    const user2Id = user2Result.rows[0].user_id;

    // Assign roles to users
    const adminRoleQuery = `
      SELECT role_id FROM roles
      WHERE tenant_id = ? AND name = 'Admin'
      LIMIT 1
    `;

    const role1Result = await db.query(adminRoleQuery, [tenant1Id]);
    const role1Id = role1Result.rows[0].role_id;

    const role2Result = await db.query(adminRoleQuery, [tenant2Id]);
    const role2Id = role2Result.rows[0].role_id;

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenant1Id, user1Id, role1Id]);

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenant2Id, user2Id, role2Id]);

    // Create test inventory items
    const item1Result = await db.query(`
      INSERT INTO inventory_items (tenant_id, item_code, name, quantity)
      VALUES (?, 'TENANT1-ITEM-001', 'Tenant 1 Item', 100)
      RETURNING item_id
    `, [tenant1Id]);
    tenant1ItemId = item1Result.rows[0].item_id;

    const item2Result = await db.query(`
      INSERT INTO inventory_items (tenant_id, item_code, name, quantity)
      VALUES (?, 'TENANT2-ITEM-001', 'Tenant 2 Item', 200)
      RETURNING item_id
    `, [tenant2Id]);
    tenant2ItemId = item2Result.rows[0].item_id;

    await db.query('COMMIT');

    // Get JWT tokens
    const login1 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user1@tenant1.com', password: 'Test123!' });
    user1Token = login1.body.token;

    const login2 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user2@tenant2.com', password: 'Test123!' });
    user2Token = login2.body.token;
  });

  afterAll(async () => {
    // Clean up test data
    await db.query('BEGIN');
    await db.query('DELETE FROM inventory_items WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM tenant_users WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM users WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM tenants WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('COMMIT');

    await db.close();
  });

  describe('Cross-Tenant Data Isolation', () => {
    test('User from Tenant 1 cannot see Tenant 2 inventory', async () => {
      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();

      // Should only see Tenant 1 items
      const itemCodes = response.body.items.map(item => item.item_code);
      expect(itemCodes).toContain('TENANT1-ITEM-001');
      expect(itemCodes).not.toContain('TENANT2-ITEM-001');
    });

    test('User from Tenant 2 cannot see Tenant 1 inventory', async () => {
      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();

      // Should only see Tenant 2 items
      const itemCodes = response.body.items.map(item => item.item_code);
      expect(itemCodes).toContain('TENANT2-ITEM-001');
      expect(itemCodes).not.toContain('TENANT1-ITEM-001');
    });

    test('User cannot access item from different tenant by ID', async () => {
      // Tenant 1 user trying to access Tenant 2 item
      const response = await request(app)
        .get(`/api/inventory/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(404); // Should not be found (not 403, to avoid leaking existence)
    });

    test('User cannot update item from different tenant', async () => {
      const response = await request(app)
        .put(`/api/inventory/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({ quantity: 999 });

      expect(response.status).toBe(404); // Should not be found
    });

    test('User cannot delete item from different tenant', async () => {
      const response = await request(app)
        .delete(`/api/inventory/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(404); // Should not be found
    });
  });

  describe('Tenant Header Validation', () => {
    test('Request with invalid tenant ID is rejected', async () => {
      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', 'invalid-tenant-id-12345');

      expect(response.status).toBe(403); // Access denied
      expect(response.body.code).toBe('TENANT_ACCESS_DENIED');
    });

    test('Request without tenant context uses JWT tenant', async () => {
      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`);
      // Should use tenant from JWT

      expect(response.status).toBe(200);
      const itemCodes = response.body.items.map(item => item.item_code);
      expect(itemCodes).toContain('TENANT1-ITEM-001');
    });

    test('User cannot impersonate another tenant via header', async () => {
      // Tenant 1 user trying to access Tenant 2 via header
      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('TENANT_ACCESS_DENIED');
    });
  });

  describe('Database Query Scoping', () => {
    test('All inventory queries include tenant_id filter', async () => {
      // This test uses query logging to verify WHERE clause
      const originalQuery = db.query;
      let capturedQuery = '';

      db.query = async function (sql, params) {
        capturedQuery = sql;
        return originalQuery.call(this, sql, params);
      };

      await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(capturedQuery.toLowerCase()).toContain('tenant_id');
      expect(capturedQuery.toLowerCase()).toContain('where');

      // Restore original query method
      db.query = originalQuery;
    });

    test('INSERT queries include tenant_id', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          item_code: 'TEST-INSERT-001',
          name: 'Test Insert Item',
          quantity: 50
        });

      expect(response.status).toBe(201);

      // Verify item was created with correct tenant_id
      const result = await db.query(`
        SELECT tenant_id FROM inventory_items
        WHERE item_code = 'TEST-INSERT-001'
      `);

      expect(result.rows[0].tenant_id).toBe(tenant1Id);
    });
  });

  describe('Index Performance', () => {
    test('Tenant-scoped queries use indexes efficiently', async () => {
      // Create test data
      const itemsToCreate = 100;
      for (let i = 0; i < itemsToCreate; i++) {
        await db.query(`
          INSERT INTO inventory_items (tenant_id, item_code, name, quantity)
          VALUES (?, ?, ?, ?)
        `, [tenant1Id, `PERF-TEST-${i}`, `Performance Test Item ${i}`, i]);
      }

      // Measure query time
      const startTime = Date.now();

      await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      const duration = Date.now() - startTime;

      // Should complete in under 100ms even with 100+ items
      expect(duration).toBeLessThan(100);

      // Clean up
      await db.query(`
        DELETE FROM inventory_items
        WHERE item_code LIKE 'PERF-TEST-%'
      `);
    });

    test('Composite index (tenant_id, item_code) is used', async () => {
      // Query by tenant_id + item_code
      const result = await db.query(`
        EXPLAIN QUERY PLAN
        SELECT * FROM inventory_items
        WHERE tenant_id = ? AND item_code = ?
      `, [tenant1Id, 'TENANT1-ITEM-001']);

      const plan = result.rows[0].detail || result.rows[0].QUERY_PLAN;

      // Should use index (not SCAN)
      expect(plan.toLowerCase()).toContain('index');
      expect(plan.toLowerCase()).not.toContain('scan');
    });
  });

  describe('SQL Injection Safety', () => {
    test('SQL injection in tenant_id is prevented', async () => {
      const maliciousInput = "' OR '1'='1";

      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', maliciousInput);

      // Should reject malicious input
      expect(response.status).toBe(403);
    });

    test('SQL injection in item_code is prevented', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          item_code: "'; DROP TABLE inventory_items; --",
          name: 'Malicious Item',
          quantity: 10
        });

      // Should be handled safely (parameterized query)
      expect([201, 400]).toContain(response.status);

      // Verify table still exists
      const result = await db.query('SELECT COUNT(*) as count FROM inventory_items');
      expect(result.rows[0].count).toBeGreaterThan(0);
    });
  });

  describe('Audit Logging', () => {
    test('Cross-tenant access attempts are logged', async () => {
      // Attempt cross-tenant access
      await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Tenant-Id', tenant2Id);

      // Check audit log
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM rbac_audit_log
        WHERE user_id = (SELECT user_id FROM users WHERE email = 'user1@tenant1.com')
          AND result = 'denied'
          AND created_at > datetime('now', '-1 minute')
      `);

      expect(result.rows[0].count).toBeGreaterThan(0);
    });
  });
});
