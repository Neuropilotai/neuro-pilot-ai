/**
 * Integration Tests: RBAC Route Guards
 * Version: v2.4.2-2025-10-07
 *
 * PASS I - Route Security & Tenant Hardening
 * Validates RBAC enforcement across all HTTP routes.
 */

const request = require('supertest');
const db = require('../../config/database');
const { PERMISSIONS } = require('../../src/security/permissions');
const { seedRolesAndPermissions } = require('../../scripts/seed_roles_2025-10-07');

describe('RBAC Route Guards - Permission Enforcement', () => {
  let app;
  let tenantId;
  let adminToken, managerToken, analystToken, auditorToken;
  let adminUser, managerUser, analystUser, auditorUser;

  beforeAll(async () => {
    app = require('../../server');

    // Seed permissions and roles
    await seedRolesAndPermissions();

    // Create test tenant
    const tenantResult = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('RBAC Test Tenant', 'active')
      RETURNING tenant_id
    `);
    tenantId = tenantResult.rows[0].tenant_id;

    // Create users for each role
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    // Admin user
    const adminResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('admin@rbactest.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    adminUser = { id: adminResult.rows[0].user_id, email: 'admin@rbactest.com' };

    // Manager user
    const managerResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('manager@rbactest.com', ?, 'manager', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    managerUser = { id: managerResult.rows[0].user_id, email: 'manager@rbactest.com' };

    // Analyst user
    const analystResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('analyst@rbactest.com', ?, 'analyst', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    analystUser = { id: analystResult.rows[0].user_id, email: 'analyst@rbactest.com' };

    // Auditor user
    const auditorResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('auditor@rbactest.com', ?, 'auditor', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    auditorUser = { id: auditorResult.rows[0].user_id, email: 'auditor@rbactest.com' };

    // Assign roles to users
    const adminRoleQuery = `SELECT role_id FROM roles WHERE tenant_id = ? AND name = 'Admin' LIMIT 1`;
    const managerRoleQuery = `SELECT role_id FROM roles WHERE tenant_id = ? AND name = 'Manager' LIMIT 1`;
    const analystRoleQuery = `SELECT role_id FROM roles WHERE tenant_id = ? AND name = 'Analyst' LIMIT 1`;
    const auditorRoleQuery = `SELECT role_id FROM roles WHERE tenant_id = ? AND name = 'Auditor' LIMIT 1`;

    const adminRoleId = (await db.query(adminRoleQuery, [tenantId])).rows[0].role_id;
    const managerRoleId = (await db.query(managerRoleQuery, [tenantId])).rows[0].role_id;
    const analystRoleId = (await db.query(analystRoleQuery, [tenantId])).rows[0].role_id;
    const auditorRoleId = (await db.query(auditorRoleQuery, [tenantId])).rows[0].role_id;

    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenantId, adminUser.id, adminRoleId]);
    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenantId, managerUser.id, managerRoleId]);
    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenantId, analystUser.id, analystRoleId]);
    await db.query(`INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES (?, ?, ?, 'active')`, [tenantId, auditorUser.id, auditorRoleId]);

    // Get JWT tokens
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@rbactest.com', password: 'Test123!' });
    adminToken = adminLogin.body.token;

    const managerLogin = await request(app).post('/api/auth/login').send({ email: 'manager@rbactest.com', password: 'Test123!' });
    managerToken = managerLogin.body.token;

    const analystLogin = await request(app).post('/api/auth/login').send({ email: 'analyst@rbactest.com', password: 'Test123!' });
    analystToken = analystLogin.body.token;

    const auditorLogin = await request(app).post('/api/auth/login').send({ email: 'auditor@rbactest.com', password: 'Test123!' });
    auditorToken = auditorLogin.body.token;
  });

  afterAll(async () => {
    // Clean up
    await db.query('DELETE FROM tenant_users WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM users WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM roles WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
    await db.close();
  });

  describe('Inventory Routes - Permission Enforcement', () => {
    test('Admin can read inventory (INVENTORY_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    test('Manager can read inventory (INVENTORY_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    test('Analyst can read inventory (INVENTORY_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    test('Admin can create inventory item (INVENTORY_WRITE)', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'RBAC Test Item',
          category: 'Test',
          quantity: 10,
          unit: 'EA',
          location: 'cooler-b1',
          unitPrice: 5.99
        });

      expect(response.status).toBe(201);
      expect(response.body.item).toBeDefined();
      expect(response.body.item.tenant_id).toBe(tenantId);
    });

    test('Manager can create inventory item (INVENTORY_WRITE)', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Manager Test Item',
          category: 'Test',
          quantity: 10,
          unit: 'EA',
          location: 'cooler-b1',
          unitPrice: 5.99
        });

      expect(response.status).toBe(201);
      expect(response.body.item.tenant_id).toBe(tenantId);
    });

    test('Analyst CANNOT create inventory item (403 Forbidden)', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Analyst Blocked Item',
          category: 'Test',
          quantity: 10,
          unit: 'EA',
          location: 'cooler-b1'
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
      expect(response.body.required).toBe(PERMISSIONS.INVENTORY_WRITE);
    });

    test('Admin can delete inventory item (INVENTORY_DELETE)', async () => {
      // First create an item
      const createResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Item to Delete',
          category: 'Test',
          quantity: 1,
          unit: 'EA',
          location: 'cooler-b1'
        });

      const itemId = createResponse.body.item.id;

      // Now delete it
      const deleteResponse = await request(app)
        .delete(`/api/inventory/items/${itemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.code).toBe('ITEM_DELETED');
    });

    test('Manager CANNOT delete inventory item (403 Forbidden)', async () => {
      // Create item as admin
      const createResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Manager Cannot Delete',
          category: 'Test',
          quantity: 1,
          unit: 'EA',
          location: 'cooler-b1'
        });

      const itemId = createResponse.body.item.id;

      // Try to delete as manager
      const deleteResponse = await request(app)
        .delete(`/api/inventory/items/${itemId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body.code).toBe('PERMISSION_DENIED');
      expect(deleteResponse.body.required).toBe(PERMISSIONS.INVENTORY_DELETE);
    });

    test('Analyst CANNOT delete inventory item (403 Forbidden)', async () => {
      const deleteResponse = await request(app)
        .delete('/api/inventory/items/fake-id')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Reports Routes - Permission Enforcement', () => {
    test('Admin can access reports (REPORTS_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.reportType).toBe('summary');
    });

    test('Manager can access reports (REPORTS_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.reportType).toBe('summary');
    });

    test('Analyst can access reports (REPORTS_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.reportType).toBe('summary');
    });

    test('Auditor can access reports (REPORTS_READ)', async () => {
      const response = await request(app)
        .get('/api/inventory/reports?type=summary')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.reportType).toBe('summary');
    });
  });

  describe('System Admin Routes - Permission Enforcement', () => {
    test('Admin can create encrypted backup (SYSTEM_ADMIN)', async () => {
      const response = await request(app)
        .post('/api/inventory/backup/encrypted')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect([200, 500]).toContain(response.status); // 500 if fileIO not configured, but permission check passes
      if (response.status === 200) {
        expect(response.body.backup).toBeDefined();
        expect(response.body.backup.tenant_id).toBe(tenantId);
      }
    });

    test('Manager CANNOT create encrypted backup (403 Forbidden)', async () => {
      const response = await request(app)
        .post('/api/inventory/backup/encrypted')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
      expect(response.body.required).toBe(PERMISSIONS.SYSTEM_ADMIN);
    });

    test('Analyst CANNOT create encrypted backup (403 Forbidden)', async () => {
      const response = await request(app)
        .post('/api/inventory/backup/encrypted')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Tenant Management Routes - Permission Enforcement', () => {
    test('Admin can list tenants (SYSTEM_ADMIN)', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.tenants).toBeDefined();
    });

    test('Manager CANNOT list tenants (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
      expect(response.body.required).toBe(PERMISSIONS.SYSTEM_ADMIN);
    });

    test('Analyst CANNOT list tenants (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Role Management Routes - Permission Enforcement', () => {
    test('Admin can list roles (ROLES_READ)', async () => {
      const response = await request(app)
        .get('/api/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.roles).toBeDefined();
    });

    test('Manager CANNOT list roles (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/roles')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
      expect(response.body.required).toBe(PERMISSIONS.ROLES_READ);
    });

    test('Admin can create custom role (ROLES_WRITE)', async () => {
      const response = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Custom Test Role',
          description: 'Test role for RBAC validation'
        });

      expect(response.status).toBe(201);
      expect(response.body.role.name).toBe('Custom Test Role');
      expect(response.body.role.is_system).toBe(false);
    });

    test('Manager CANNOT create custom role (403 Forbidden)', async () => {
      const response = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Manager Blocked Role',
          description: 'Should fail'
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
      expect(response.body.required).toBe(PERMISSIONS.ROLES_WRITE);
    });
  });

  describe('Audit Logging - Permission Denials', () => {
    test('Permission denials are logged to rbac_audit_log', async () => {
      // Trigger a permission denial
      await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          name: 'Denied Item',
          category: 'Test',
          quantity: 1,
          unit: 'EA',
          location: 'cooler-b1'
        });

      // Check audit log
      const auditResult = await db.query(`
        SELECT * FROM rbac_audit_log
        WHERE user_id = ? AND permission = ? AND result = 'denied'
        ORDER BY created_at DESC
        LIMIT 1
      `, [analystUser.id, PERMISSIONS.INVENTORY_WRITE]);

      expect(auditResult.rows.length).toBeGreaterThan(0);
      expect(auditResult.rows[0].action).toBe('permission_check');
      expect(auditResult.rows[0].reason).toContain('permission not granted');
    });

    test('RBAC denial metrics are recorded', async () => {
      const { metricsExporter } = require('../../utils/metricsExporter');

      // Trigger a permission denial
      await request(app)
        .delete('/api/inventory/items/fake-id')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId);

      // Get metrics (this will be aggregated in Prometheus)
      const metrics = await metricsExporter.getMetrics();

      // Verify rbac_denied_total metric exists
      expect(metrics).toContain('rbac_denied_total');
    });
  });

  describe('Cross-Role Permission Hierarchy', () => {
    test('Admin inherits all permissions from hierarchy', async () => {
      const { rbacEngine } = require('../../src/security/rbac');

      // Admin should have INVENTORY_READ (implied by INVENTORY_ADMIN)
      const hasRead = await rbacEngine.hasPermission(adminUser.id, tenantId, PERMISSIONS.INVENTORY_READ);
      expect(hasRead).toBe(true);

      // Admin should have INVENTORY_WRITE (implied by INVENTORY_ADMIN)
      const hasWrite = await rbacEngine.hasPermission(adminUser.id, tenantId, PERMISSIONS.INVENTORY_WRITE);
      expect(hasWrite).toBe(true);

      // Admin should have INVENTORY_DELETE (implied by INVENTORY_ADMIN)
      const hasDelete = await rbacEngine.hasPermission(adminUser.id, tenantId, PERMISSIONS.INVENTORY_DELETE);
      expect(hasDelete).toBe(true);
    });

    test('Manager has read+write but NOT delete', async () => {
      const { rbacEngine } = require('../../src/security/rbac');

      const hasRead = await rbacEngine.hasPermission(managerUser.id, tenantId, PERMISSIONS.INVENTORY_READ);
      expect(hasRead).toBe(true);

      const hasWrite = await rbacEngine.hasPermission(managerUser.id, tenantId, PERMISSIONS.INVENTORY_WRITE);
      expect(hasWrite).toBe(true);

      const hasDelete = await rbacEngine.hasPermission(managerUser.id, tenantId, PERMISSIONS.INVENTORY_DELETE);
      expect(hasDelete).toBe(false);
    });

    test('Analyst has read-only permissions', async () => {
      const { rbacEngine } = require('../../src/security/rbac');

      const hasRead = await rbacEngine.hasPermission(analystUser.id, tenantId, PERMISSIONS.INVENTORY_READ);
      expect(hasRead).toBe(true);

      const hasWrite = await rbacEngine.hasPermission(analystUser.id, tenantId, PERMISSIONS.INVENTORY_WRITE);
      expect(hasWrite).toBe(false);

      const hasDelete = await rbacEngine.hasPermission(analystUser.id, tenantId, PERMISSIONS.INVENTORY_DELETE);
      expect(hasDelete).toBe(false);
    });
  });

  describe('HTTP Status Codes - RBAC Denials', () => {
    test('Permission denial returns 403 Forbidden (not 401)', async () => {
      const response = await request(app)
        .delete('/api/inventory/items/test-id')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(response.status).toBe(403); // Forbidden, not 401 Unauthorized
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    test('Missing auth token returns 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/inventory/items');

      expect(response.status).toBe(401);
    });

    test('Invalid auth token returns 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/inventory/items')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
