/**
 * Integration Tests: Tenant Scope Enforcement
 * Version: v2.4.2-2025-10-07
 *
 * PASS I - Route Security & Tenant Hardening
 * Validates tenant_id scoping prevents cross-tenant data access.
 */

const request = require('supertest');
const db = require('../../config/database');
const { getDatabaseAdapter } = require('../../utils/databaseAdapter');
const { seedRolesAndPermissions } = require('../../scripts/seed_roles_2025-10-07');

describe('Tenant Scope Enforcement - Cross-Tenant Isolation', () => {
  let app;
  let tenant1Id, tenant2Id;
  let tenant1Token, tenant2Token;
  let tenant1AdminId, tenant2AdminId;
  let tenant1ItemId, tenant2ItemId;

  beforeAll(async () => {
    app = require('../../server');

    // Seed permissions
    await seedRolesAndPermissions();

    // Create two test tenants
    const tenant1Result = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('Tenant 1 Scope Test', 'active')
      RETURNING tenant_id
    `);
    tenant1Id = tenant1Result.rows[0].tenant_id;

    const tenant2Result = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('Tenant 2 Scope Test', 'active')
      RETURNING tenant_id
    `);
    tenant2Id = tenant2Result.rows[0].tenant_id;

    // Create admin users for each tenant
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    const user1Result = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('tenant1admin@scope.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenant1Id]);
    tenant1AdminId = user1Result.rows[0].user_id;

    const user2Result = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('tenant2admin@scope.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenant2Id]);
    tenant2AdminId = user2Result.rows[0].user_id;

    // Assign admin roles
    const adminRoleQuery = `SELECT role_id FROM roles WHERE tenant_id = ? AND name = 'Admin' LIMIT 1`;
    const role1Id = (await db.query(adminRoleQuery, [tenant1Id])).rows[0].role_id;
    const role2Id = (await db.query(adminRoleQuery, [tenant2Id])).rows[0].role_id;

    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenant1Id, tenant1AdminId, role1Id]);
    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenant2Id, tenant2AdminId, role2Id]);

    // Get JWT tokens
    const login1 = await request(app).post('/api/auth/login').send({ email: 'tenant1admin@scope.com', password: 'Test123!' });
    tenant1Token = login1.body.token;

    const login2 = await request(app).post('/api/auth/login').send({ email: 'tenant2admin@scope.com', password: 'Test123!' });
    tenant2Token = login2.body.token;

    // Create test items for each tenant
    const item1Response = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .set('X-Tenant-Id', tenant1Id)
      .send({
        name: 'Tenant 1 Item',
        category: 'Test',
        quantity: 100,
        unit: 'EA',
        location: 'cooler-b1',
        unitPrice: 10.00
      });
    tenant1ItemId = item1Response.body.item.id;

    const item2Response = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${tenant2Token}`)
      .set('X-Tenant-Id', tenant2Id)
      .send({
        name: 'Tenant 2 Item',
        category: 'Test',
        quantity: 200,
        unit: 'EA',
        location: 'cooler-b1',
        unitPrice: 20.00
      });
    tenant2ItemId = item2Response.body.item.id;
  });

  afterAll(async () => {
    // Clean up
    await db.query('DELETE FROM tenant_users WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM users WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM roles WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM tenants WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await db.close();
  });

  describe('Cross-Tenant Read Isolation', () => {
    test('Tenant 1 can only see their own inventory items', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();

      const itemNames = response.body.items.map(item => item.name);
      expect(itemNames).toContain('Tenant 1 Item');
      expect(itemNames).not.toContain('Tenant 2 Item');

      // Verify all items have correct tenant_id
      response.body.items.forEach(item => {
        expect(item.tenant_id).toBe(tenant1Id);
      });
    });

    test('Tenant 2 can only see their own inventory items', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();

      const itemNames = response.body.items.map(item => item.name);
      expect(itemNames).toContain('Tenant 2 Item');
      expect(itemNames).not.toContain('Tenant 1 Item');

      // Verify all items have correct tenant_id
      response.body.items.forEach(item => {
        expect(item.tenant_id).toBe(tenant2Id);
      });
    });

    test('Tenant 1 CANNOT read Tenant 2 item by ID (404, not 403)', async () => {
      const response = await request(app)
        .get(`/api/inventory/items/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      // Should return 404 to avoid leaking existence of other tenant's data
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('Tenant 2 CANNOT read Tenant 1 item by ID (404)', async () => {
      const response = await request(app)
        .get(`/api/inventory/items/${tenant1ItemId}`)
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });
  });

  describe('Cross-Tenant Write Isolation', () => {
    test('Tenant 1 can create items scoped to their tenant', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          name: 'Tenant 1 New Item',
          category: 'Test',
          quantity: 50,
          unit: 'EA',
          location: 'cooler-b1',
          unitPrice: 5.00
        });

      expect(response.status).toBe(201);
      expect(response.body.item.tenant_id).toBe(tenant1Id);
      expect(response.body.item.name).toBe('Tenant 1 New Item');
    });

    test('Tenant 2 can create items scoped to their tenant', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id)
        .send({
          name: 'Tenant 2 New Item',
          category: 'Test',
          quantity: 75,
          unit: 'EA',
          location: 'freezer-a2',
          unitPrice: 7.50
        });

      expect(response.status).toBe(201);
      expect(response.body.item.tenant_id).toBe(tenant2Id);
      expect(response.body.item.name).toBe('Tenant 2 New Item');
    });

    test('Tenant 1 CANNOT update Tenant 2 item (404)', async () => {
      const response = await request(app)
        .put(`/api/inventory/items/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          name: 'Hijacked Item',
          category: 'Test',
          quantity: 999,
          unit: 'EA',
          location: 'cooler-b1'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('Tenant 2 CANNOT update Tenant 1 item (404)', async () => {
      const response = await request(app)
        .put(`/api/inventory/items/${tenant1ItemId}`)
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id)
        .send({
          name: 'Hijacked Item',
          category: 'Test',
          quantity: 999,
          unit: 'EA',
          location: 'freezer-a2'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('Update preserves tenant_id (immutable)', async () => {
      const response = await request(app)
        .put(`/api/inventory/items/${tenant1ItemId}`)
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          name: 'Updated Tenant 1 Item',
          category: 'Test',
          quantity: 150,
          unit: 'EA',
          location: 'cooler-b1',
          unitPrice: 12.00
        });

      expect(response.status).toBe(200);
      expect(response.body.item.tenant_id).toBe(tenant1Id); // Immutable
      expect(response.body.item.name).toBe('Updated Tenant 1 Item');
    });
  });

  describe('Cross-Tenant Delete Isolation', () => {
    test('Tenant 1 CANNOT delete Tenant 2 item (404)', async () => {
      const response = await request(app)
        .delete(`/api/inventory/items/${tenant2ItemId}`)
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('Tenant 2 CANNOT delete Tenant 1 item (404)', async () => {
      const response = await request(app)
        .delete(`/api/inventory/items/${tenant1ItemId}`)
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('Tenant 1 can delete their own item', async () => {
      // Create item to delete
      const createResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id)
        .send({
          name: 'Item to Delete',
          category: 'Test',
          quantity: 1,
          unit: 'EA',
          location: 'cooler-b1'
        });

      const itemId = createResponse.body.item.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/inventory/items/${itemId}`)
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.code).toBe('ITEM_DELETED');
      expect(deleteResponse.body.item.tenant_id).toBe(tenant1Id);
    });
  });

  describe('Tenant Context Resolution', () => {
    test('Request without X-Tenant-Id header uses JWT tenant', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`);
      // No X-Tenant-Id header → should use tenant from JWT

      expect(response.status).toBe(200);
      const itemNames = response.body.items.map(item => item.name);
      expect(itemNames).toContain('Tenant 1 Item');
      expect(itemNames).not.toContain('Tenant 2 Item');
    });

    test('User CANNOT impersonate another tenant via header', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant2Id); // Try to access Tenant 2 data

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('TENANT_ACCESS_DENIED');
    });

    test('Invalid tenant ID is rejected (403)', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', 'invalid-tenant-id-12345');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('TENANT_ACCESS_DENIED');
    });
  });

  describe('Report Scoping - Cross-Tenant Isolation', () => {
    test('Tenant 1 reports only include their data', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(200);
      expect(response.body.tenant.tenant_id).toBe(tenant1Id);
      expect(response.body.tenant.isolation_verified).toBe(true);

      // Reports should not include Tenant 2 data
      expect(response.body.totalItems).toBeGreaterThan(0);
    });

    test('Tenant 2 reports only include their data', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(200);
      expect(response.body.tenant.tenant_id).toBe(tenant2Id);
      expect(response.body.tenant.isolation_verified).toBe(true);
    });

    test('Low-stock reports are tenant-scoped', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=low-stock')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(200);
      expect(response.body.reportType).toBe('low-stock');

      // All items in report should belong to Tenant 1
      if (response.body.lowStockItems && response.body.lowStockItems.length > 0) {
        response.body.lowStockItems.forEach(item => {
          expect(item.id).toContain(tenant1Id);
        });
      }
    });
  });

  describe('Storage Locations - Tenant Scoping', () => {
    test('Tenant 1 can only see their storage locations', async () => {
      const response = await request(app)
        .get('/api/inventory/locations')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      expect(response.status).toBe(200);
      expect(response.body.locations).toBeDefined();
      expect(response.body.tenant.tenant_id).toBe(tenant1Id);
      expect(response.body.tenant.isolation_verified).toBe(true);

      // Verify all locations have correct tenant_id
      response.body.locations.forEach(location => {
        expect(location.tenant_id).toBe(tenant1Id);
      });
    });

    test('Tenant 2 can only see their storage locations', async () => {
      const response = await request(app)
        .get('/api/inventory/locations')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      expect(response.status).toBe(200);
      expect(response.body.locations).toBeDefined();

      response.body.locations.forEach(location => {
        expect(location.tenant_id).toBe(tenant2Id);
      });
    });
  });

  describe('Database Adapter - Tenant Scoping', () => {
    test('DatabaseAdapter enforces tenant scoping on queries', async () => {
      const adapter = getDatabaseAdapter();

      // Insert item for tenant1
      const item1 = await adapter.insertWithTenantScope(tenant1Id, 'test_table', {
        name: 'Adapter Test Item 1',
        value: 100
      });

      expect(item1.tenant_id).toBe(tenant1Id);

      // Insert item for tenant2
      const item2 = await adapter.insertWithTenantScope(tenant2Id, 'test_table', {
        name: 'Adapter Test Item 2',
        value: 200
      });

      expect(item2.tenant_id).toBe(tenant2Id);

      // Query for tenant1 items
      const tenant1Items = await adapter.queryWithTenantScope(tenant1Id, 'test_table');
      expect(tenant1Items.every(item => item.tenant_id === tenant1Id)).toBe(true);
      expect(tenant1Items.some(item => item.tenant_id === tenant2Id)).toBe(false);

      // Query for tenant2 items
      const tenant2Items = await adapter.queryWithTenantScope(tenant2Id, 'test_table');
      expect(tenant2Items.every(item => item.tenant_id === tenant2Id)).toBe(true);
      expect(tenant2Items.some(item => item.tenant_id === tenant1Id)).toBe(false);
    });

    test('DatabaseAdapter verifyCrossTenantIsolation detects leaks', async () => {
      const adapter = getDatabaseAdapter();

      const isIsolated = await adapter.verifyCrossTenantIsolation(tenant1Id, tenant2Id, 'test_table');

      expect(isIsolated).toBe(true); // No data leakage
    });
  });

  describe('Tenant Metrics Tracking', () => {
    test('Each tenant request is tracked separately', async () => {
      const { metricsExporter } = require('../../utils/metricsExporter');

      // Make requests for both tenants
      await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-Id', tenant1Id);

      await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .set('X-Tenant-Id', tenant2Id);

      // Get metrics
      const metrics = await metricsExporter.getMetrics();

      // Verify tenant_request_rate metric exists
      expect(metrics).toContain('tenant_request_rate');
      expect(metrics).toContain(`tenant_id="${tenant1Id}"`);
      expect(metrics).toContain(`tenant_id="${tenant2Id}"`);
    });
  });
});
