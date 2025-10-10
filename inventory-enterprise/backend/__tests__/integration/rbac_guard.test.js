/**
 * Integration Tests: RBAC Guard and Permission Enforcement
 * Version: v2.4.1-2025-10-07
 *
 * Validates role-based access control, permission checks, and audit logging.
 */

const request = require('supertest');
const db = require('../../config/database');
const rbacEngine = require('../../src/security/rbac');
const { PERMISSIONS } = require('../../src/security/permissions');

describe('RBAC Guard and Permission Enforcement', () => {
  let app;
  let tenantId;
  let adminUser, managerUser, analystUser, auditorUser;
  let adminToken, managerToken, analystToken, auditorToken;

  beforeAll(async () => {
    app = require('../../server');

    // Create test tenant
    const tenantResult = await db.query(`
      INSERT INTO tenants (name, status)
      VALUES ('RBAC Test Tenant', 'active')
      RETURNING tenant_id
    `);
    tenantId = tenantResult.rows[0].tenant_id;

    // Get role IDs
    const adminRoleResult = await db.query(`
      SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Admin'
    `);
    const adminRoleId = adminRoleResult.rows[0].role_id;

    const managerRoleResult = await db.query(`
      SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Manager'
    `);
    const managerRoleId = managerRoleResult.rows[0].role_id;

    const analystRoleResult = await db.query(`
      SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Analyst'
    `);
    const analystRoleId = analystRoleResult.rows[0].role_id;

    const auditorRoleResult = await db.query(`
      SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Auditor'
    `);
    const auditorRoleId = auditorRoleResult.rows[0].role_id;

    // Create test users
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    // Admin user
    const adminResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('admin@rbac-test.com', ?, 'admin', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    adminUser = { id: adminResult.rows[0].user_id, email: 'admin@rbac-test.com' };

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenantId, adminUser.id, adminRoleId]);

    // Manager user
    const managerResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('manager@rbac-test.com', ?, 'user', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    managerUser = { id: managerResult.rows[0].user_id, email: 'manager@rbac-test.com' };

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenantId, managerUser.id, managerRoleId]);

    // Analyst user
    const analystResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('analyst@rbac-test.com', ?, 'user', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    analystUser = { id: analystResult.rows[0].user_id, email: 'analyst@rbac-test.com' };

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenantId, analystUser.id, analystRoleId]);

    // Auditor user
    const auditorResult = await db.query(`
      INSERT INTO users (email, password_hash, role, tenant_id)
      VALUES ('auditor@rbac-test.com', ?, 'user', ?)
      RETURNING user_id
    `, [hashedPassword, tenantId]);
    auditorUser = { id: auditorResult.rows[0].user_id, email: 'auditor@rbac-test.com' };

    await db.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `, [tenantId, auditorUser.id, auditorRoleId]);

    // Get tokens
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin@rbac-test.com',
      password: 'Test123!'
    });
    adminToken = adminLogin.body.token;

    const managerLogin = await request(app).post('/api/auth/login').send({
      email: 'manager@rbac-test.com',
      password: 'Test123!'
    });
    managerToken = managerLogin.body.token;

    const analystLogin = await request(app).post('/api/auth/login').send({
      email: 'analyst@rbac-test.com',
      password: 'Test123!'
    });
    analystToken = analystLogin.body.token;

    const auditorLogin = await request(app).post('/api/auth/login').send({
      email: 'auditor@rbac-test.com',
      password: 'Test123!'
    });
    auditorToken = auditorLogin.body.token;
  });

  afterAll(async () => {
    // Clean up
    await db.query('DELETE FROM tenant_users WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM users WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
    await db.close();
  });

  describe('Admin Role Permissions', () => {
    test('Admin can read inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        adminUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Admin can write inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        adminUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_WRITE
      );
      expect(hasPermission).toBe(true);
    });

    test('Admin can delete inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        adminUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_DELETE
      );
      expect(hasPermission).toBe(true);
    });

    test('Admin can manage users', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        adminUser.id,
        tenantId,
        PERMISSIONS.USERS_ADMIN
      );
      expect(hasPermission).toBe(true);
    });

    test('Admin can manage webhooks', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        adminUser.id,
        tenantId,
        PERMISSIONS.WEBHOOKS_WRITE
      );
      expect(hasPermission).toBe(true);
    });
  });

  describe('Manager Role Permissions', () => {
    test('Manager can read inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Manager can write inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_WRITE
      );
      expect(hasPermission).toBe(true);
    });

    test('Manager CANNOT delete inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_DELETE
      );
      expect(hasPermission).toBe(false);
    });

    test('Manager CANNOT manage users', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.USERS_ADMIN
      );
      expect(hasPermission).toBe(false);
    });

    test('Manager can read AI forecasts', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.AI_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Manager CANNOT write AI policies', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.AI_WRITE
      );
      expect(hasPermission).toBe(false);
    });
  });

  describe('Analyst Role Permissions', () => {
    test('Analyst can read inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Analyst CANNOT write inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_WRITE
      );
      expect(hasPermission).toBe(false);
    });

    test('Analyst can read reports', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.REPORTS_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Analyst can export reports', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.REPORTS_EXPORT
      );
      expect(hasPermission).toBe(true);
    });

    test('Analyst CANNOT manage webhooks', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.WEBHOOKS_WRITE
      );
      expect(hasPermission).toBe(false);
    });
  });

  describe('Auditor Role Permissions', () => {
    test('Auditor can read inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        auditorUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Auditor can read users', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        auditorUser.id,
        tenantId,
        PERMISSIONS.USERS_READ
      );
      expect(hasPermission).toBe(true);
    });

    test('Auditor CANNOT write inventory', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        auditorUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_WRITE
      );
      expect(hasPermission).toBe(false);
    });

    test('Auditor CANNOT write users', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        auditorUser.id,
        tenantId,
        PERMISSIONS.USERS_WRITE
      );
      expect(hasPermission).toBe(false);
    });

    test('Auditor can read webhooks', async () => {
      const hasPermission = await rbacEngine.hasPermission(
        auditorUser.id,
        tenantId,
        PERMISSIONS.WEBHOOKS_READ
      );
      expect(hasPermission).toBe(true);
    });
  });

  describe('HTTP Route Guards', () => {
    test('Manager can POST to /api/inventory', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          item_code: 'RBAC-TEST-001',
          name: 'RBAC Test Item',
          quantity: 50
        });

      expect(response.status).toBe(201);
    });

    test('Analyst CANNOT POST to /api/inventory', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${analystToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          item_code: 'RBAC-TEST-002',
          name: 'Should Fail',
          quantity: 50
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    test('Auditor can GET /api/inventory but not POST', async () => {
      const getResponse = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('X-Tenant-Id', tenantId);

      expect(getResponse.status).toBe(200);

      const postResponse = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('X-Tenant-Id', tenantId)
        .send({
          item_code: 'SHOULD-FAIL',
          name: 'Should Fail',
          quantity: 50
        });

      expect(postResponse.status).toBe(403);
    });
  });

  describe('Permission Hierarchy', () => {
    test('Admin permission implies read/write/delete', async () => {
      const permissions = await rbacEngine.getUserPermissions(adminUser.id, tenantId);

      expect(permissions).toContain(PERMISSIONS.INVENTORY_ADMIN);
      expect(permissions).toContain(PERMISSIONS.INVENTORY_READ);
      expect(permissions).toContain(PERMISSIONS.INVENTORY_WRITE);
      expect(permissions).toContain(PERMISSIONS.INVENTORY_DELETE);
    });

    test('System admin has all permissions', async () => {
      const permissions = await rbacEngine.getUserPermissions(adminUser.id, tenantId);

      // Admin should have system:admin which implies everything
      expect(permissions.length).toBeGreaterThan(20);
      expect(permissions).toContain(PERMISSIONS.SYSTEM_ADMIN);
    });
  });

  describe('Audit Logging', () => {
    test('Permission checks are logged to audit table', async () => {
      // Perform permission check
      await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_WRITE,
        { auditLog: true }
      );

      // Check audit log
      const result = await db.query(`
        SELECT * FROM rbac_audit_log
        WHERE user_id = ? AND permission = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [analystUser.id, PERMISSIONS.INVENTORY_WRITE]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].result).toBe('denied');
      expect(result.rows[0].resource).toBe('inventory');
      expect(result.rows[0].action).toBe('permission_check');
    });

    test('Denied access increments metrics', async () => {
      const metricsExporter = require('../../utils/metricsExporter');
      const initialMetrics = await metricsExporter.getMetrics();

      // Perform denied action
      await rbacEngine.hasPermission(
        analystUser.id,
        tenantId,
        PERMISSIONS.USERS_DELETE
      );

      const finalMetrics = await metricsExporter.getMetrics();

      // Should have incremented rbac_denied_total
      expect(finalMetrics).toContain('rbac_denied_total');
    });
  });

  describe('Dynamic Role Changes', () => {
    test('User permissions update after role change', async () => {
      // Check initial permissions
      const beforePermissions = await rbacEngine.getUserPermissions(analystUser.id, tenantId);
      expect(beforePermissions).not.toContain(PERMISSIONS.INVENTORY_WRITE);

      // Change role to Manager
      const managerRoleResult = await db.query(`
        SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Manager'
      `);
      const managerRoleId = managerRoleResult.rows[0].role_id;

      await db.query(`
        UPDATE tenant_users
        SET role_id = ?
        WHERE user_id = ? AND tenant_id = ?
      `, [managerRoleId, analystUser.id, tenantId]);

      // Check updated permissions
      const afterPermissions = await rbacEngine.getUserPermissions(analystUser.id, tenantId);
      expect(afterPermissions).toContain(PERMISSIONS.INVENTORY_WRITE);

      // Restore original role
      const analystRoleResult = await db.query(`
        SELECT role_id FROM roles WHERE tenant_id = 'default' AND name = 'Analyst'
      `);
      const analystRoleId = analystRoleResult.rows[0].role_id;

      await db.query(`
        UPDATE tenant_users
        SET role_id = ?
        WHERE user_id = ? AND tenant_id = ?
      `, [analystRoleId, analystUser.id, tenantId]);
    });
  });

  describe('Edge Cases', () => {
    test('User with no role has no permissions', async () => {
      // Create user without role assignment
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('Test123!', 10);

      const noRoleResult = await db.query(`
        INSERT INTO users (email, password_hash, role, tenant_id)
        VALUES ('norole@rbac-test.com', ?, 'user', ?)
        RETURNING user_id
      `, [hashedPassword, tenantId]);
      const noRoleUserId = noRoleResult.rows[0].user_id;

      const hasPermission = await rbacEngine.hasPermission(
        noRoleUserId,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );

      expect(hasPermission).toBe(false);

      // Clean up
      await db.query('DELETE FROM users WHERE user_id = ?', [noRoleUserId]);
    });

    test('Suspended user cannot access resources', async () => {
      // Suspend manager user
      await db.query(`
        UPDATE tenant_users
        SET status = 'suspended'
        WHERE user_id = ? AND tenant_id = ?
      `, [managerUser.id, tenantId]);

      const hasPermission = await rbacEngine.hasPermission(
        managerUser.id,
        tenantId,
        PERMISSIONS.INVENTORY_READ
      );

      expect(hasPermission).toBe(false);

      // Restore
      await db.query(`
        UPDATE tenant_users
        SET status = 'active'
        WHERE user_id = ? AND tenant_id = ?
      `, [managerUser.id, tenantId]);
    });
  });
});
