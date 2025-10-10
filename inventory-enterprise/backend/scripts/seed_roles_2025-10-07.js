/**
 * Seed Script: Default Roles and Permissions
 * Version: v2.4.0-2025-10-07
 *
 * Seeds the database with default roles and permissions.
 * Safe to run multiple times (uses INSERT OR IGNORE / ON CONFLICT).
 */

const db = require('../config/database');
const logger = require('../config/logger');
const { PERMISSIONS, DEFAULT_ROLES } = require('../src/security/permissions');

async function seedRolesAndPermissions() {
  try {
    logger.info('[Seed] Starting roles and permissions seeding...');

    // 1. Seed Permissions
    await seedPermissions();

    // 2. Ensure default tenant exists
    await ensureDefaultTenant();

    // 3. Seed Default Roles
    await seedDefaultRoles();

    // 4. Assign Permissions to Roles
    await assignPermissionsToRoles();

    logger.info('[Seed] ✅ Roles and permissions seeding complete');

    return { success: true };
  } catch (error) {
    logger.error('[Seed] Error seeding roles and permissions:', error);
    throw error;
  }
}

/**
 * Seed all permissions into the database
 */
async function seedPermissions() {
  logger.info('[Seed] Seeding permissions...');

  const permissionData = [
    // Inventory
    { id: 'perm-inv-read', name: PERMISSIONS.INVENTORY_READ, resource: 'inventory', action: 'read', description: 'View inventory items and stock levels' },
    { id: 'perm-inv-write', name: PERMISSIONS.INVENTORY_WRITE, resource: 'inventory', action: 'write', description: 'Create and update inventory items' },
    { id: 'perm-inv-delete', name: PERMISSIONS.INVENTORY_DELETE, resource: 'inventory', action: 'delete', description: 'Delete inventory items' },
    { id: 'perm-inv-admin', name: PERMISSIONS.INVENTORY_ADMIN, resource: 'inventory', action: 'admin', description: 'Full inventory administration' },

    // Orders
    { id: 'perm-ord-read', name: PERMISSIONS.ORDERS_READ, resource: 'orders', action: 'read', description: 'View orders and order history' },
    { id: 'perm-ord-write', name: PERMISSIONS.ORDERS_WRITE, resource: 'orders', action: 'write', description: 'Create and update orders' },
    { id: 'perm-ord-delete', name: PERMISSIONS.ORDERS_DELETE, resource: 'orders', action: 'delete', description: 'Delete orders' },
    { id: 'perm-ord-admin', name: PERMISSIONS.ORDERS_ADMIN, resource: 'orders', action: 'admin', description: 'Full order administration' },

    // Users
    { id: 'perm-usr-read', name: PERMISSIONS.USERS_READ, resource: 'users', action: 'read', description: 'View users and user profiles' },
    { id: 'perm-usr-write', name: PERMISSIONS.USERS_WRITE, resource: 'users', action: 'write', description: 'Create and update users' },
    { id: 'perm-usr-delete', name: PERMISSIONS.USERS_DELETE, resource: 'users', action: 'delete', description: 'Delete users' },
    { id: 'perm-usr-admin', name: PERMISSIONS.USERS_ADMIN, resource: 'users', action: 'admin', description: 'Full user administration' },

    // AI
    { id: 'perm-ai-read', name: PERMISSIONS.AI_READ, resource: 'ai', action: 'read', description: 'View AI forecasts and policies' },
    { id: 'perm-ai-write', name: PERMISSIONS.AI_WRITE, resource: 'ai', action: 'write', description: 'Trigger AI training and updates' },
    { id: 'perm-ai-admin', name: PERMISSIONS.AI_ADMIN, resource: 'ai', action: 'admin', description: 'Full AI system administration' },

    // Reports
    { id: 'perm-rpt-read', name: PERMISSIONS.REPORTS_READ, resource: 'reports', action: 'read', description: 'View reports and analytics' },
    { id: 'perm-rpt-write', name: PERMISSIONS.REPORTS_WRITE, resource: 'reports', action: 'write', description: 'Create custom reports' },
    { id: 'perm-rpt-export', name: PERMISSIONS.REPORTS_EXPORT, resource: 'reports', action: 'export', description: 'Export reports and data' },

    // Tenants
    { id: 'perm-ten-read', name: PERMISSIONS.TENANTS_READ, resource: 'tenants', action: 'read', description: 'View tenant information' },
    { id: 'perm-ten-write', name: PERMISSIONS.TENANTS_WRITE, resource: 'tenants', action: 'write', description: 'Manage tenant settings' },
    { id: 'perm-ten-admin', name: PERMISSIONS.TENANTS_ADMIN, resource: 'tenants', action: 'admin', description: 'Full tenant administration' },

    // Webhooks
    { id: 'perm-wh-read', name: PERMISSIONS.WEBHOOKS_READ, resource: 'webhooks', action: 'read', description: 'View webhook configurations' },
    { id: 'perm-wh-write', name: PERMISSIONS.WEBHOOKS_WRITE, resource: 'webhooks', action: 'write', description: 'Create and update webhooks' },
    { id: 'perm-wh-delete', name: PERMISSIONS.WEBHOOKS_DELETE, resource: 'webhooks', action: 'delete', description: 'Delete webhooks' },

    // Roles
    { id: 'perm-rol-read', name: PERMISSIONS.ROLES_READ, resource: 'roles', action: 'read', description: 'View roles and permissions' },
    { id: 'perm-rol-write', name: PERMISSIONS.ROLES_WRITE, resource: 'roles', action: 'write', description: 'Create and update roles' },
    { id: 'perm-rol-delete', name: PERMISSIONS.ROLES_DELETE, resource: 'roles', action: 'delete', description: 'Delete roles' },

    // System
    { id: 'perm-sys-admin', name: PERMISSIONS.SYSTEM_ADMIN, resource: 'system', action: 'admin', description: 'Full system administration' },
    { id: 'perm-sys-audit', name: PERMISSIONS.SYSTEM_AUDIT, resource: 'system', action: 'audit', description: 'Access audit logs' }
  ];

  for (const perm of permissionData) {
    const query = db.isPostgres()
      ? `
        INSERT INTO permissions (permission_id, name, resource, action, description)
        VALUES ($1::UUID, $2, $3, $4, $5)
        ON CONFLICT (name) DO NOTHING
      `
      : `
        INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description)
        VALUES (?, ?, ?, ?, ?)
      `;

    await db.query(query, [perm.id, perm.name, perm.resource, perm.action, perm.description]);
  }

  logger.info(`[Seed] ✅ Seeded ${permissionData.length} permissions`);
}

/**
 * Ensure default tenant exists
 */
async function ensureDefaultTenant() {
  logger.info('[Seed] Ensuring default tenant exists...');

  const query = db.isPostgres()
    ? `
      INSERT INTO tenants (tenant_id, name, status, settings)
      VALUES ('default'::UUID, 'Default Organization', 'active', '{"is_default": true}'::JSONB)
      ON CONFLICT (name) DO NOTHING
    `
    : `
      INSERT OR IGNORE INTO tenants (tenant_id, name, status, settings)
      VALUES ('default', 'Default Organization', 'active', '{"is_default": true}')
    `;

  await db.query(query, []);

  logger.info('[Seed] ✅ Default tenant ensured');
}

/**
 * Seed default roles for default tenant
 */
async function seedDefaultRoles() {
  logger.info('[Seed] Seeding default roles...');

  const roles = [
    {
      id: 'role-default-admin',
      tenantId: 'default',
      name: DEFAULT_ROLES.ADMIN.name,
      description: DEFAULT_ROLES.ADMIN.description,
      isSystem: true
    },
    {
      id: 'role-default-manager',
      tenantId: 'default',
      name: DEFAULT_ROLES.MANAGER.name,
      description: DEFAULT_ROLES.MANAGER.description,
      isSystem: true
    },
    {
      id: 'role-default-analyst',
      tenantId: 'default',
      name: DEFAULT_ROLES.ANALYST.name,
      description: DEFAULT_ROLES.ANALYST.description,
      isSystem: true
    },
    {
      id: 'role-default-auditor',
      tenantId: 'default',
      name: DEFAULT_ROLES.AUDITOR.name,
      description: DEFAULT_ROLES.AUDITOR.description,
      isSystem: true
    }
  ];

  for (const role of roles) {
    const query = db.isPostgres()
      ? `
        INSERT INTO roles (role_id, tenant_id, name, description, is_system)
        VALUES ($1::UUID, $2::UUID, $3, $4, $5)
        ON CONFLICT (tenant_id, name) DO NOTHING
      `
      : `
        INSERT OR IGNORE INTO roles (role_id, tenant_id, name, description, is_system)
        VALUES (?, ?, ?, ?, ?)
      `;

    await db.query(query, [role.id, role.tenantId, role.name, role.description, role.isSystem]);
  }

  logger.info(`[Seed] ✅ Seeded ${roles.length} default roles`);
}

/**
 * Assign permissions to roles
 */
async function assignPermissionsToRoles() {
  logger.info('[Seed] Assigning permissions to roles...');

  // Admin: all permissions
  const adminPermissions = Object.values(PERMISSIONS);
  await assignPermissionsToRole('role-default-admin', adminPermissions);

  // Manager: read/write on inventory, orders, reports
  await assignPermissionsToRole('role-default-manager', DEFAULT_ROLES.MANAGER.permissions);

  // Analyst: read + reports
  await assignPermissionsToRole('role-default-analyst', DEFAULT_ROLES.ANALYST.permissions);

  // Auditor: read-only
  await assignPermissionsToRole('role-default-auditor', DEFAULT_ROLES.AUDITOR.permissions);

  logger.info('[Seed] ✅ Permissions assigned to roles');
}

/**
 * Assign permissions to a role
 */
async function assignPermissionsToRole(roleId, permissions) {
  for (const permName of permissions) {
    // Get permission ID
    const getPermQuery = `
      SELECT permission_id
      FROM permissions
      WHERE name = ?
      LIMIT 1
    `;

    const permResult = await db.query(getPermQuery, [permName]);

    if (!permResult.rows || permResult.rows.length === 0) {
      logger.warn(`[Seed] Permission ${permName} not found, skipping`);
      continue;
    }

    const permId = permResult.rows[0].permission_id;

    // Assign permission to role
    const assignQuery = db.isPostgres()
      ? `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1::UUID, $2::UUID)
        ON CONFLICT DO NOTHING
      `
      : `
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        VALUES (?, ?)
      `;

    await db.query(assignQuery, [roleId, permId]);
  }

  logger.info(`[Seed] Assigned ${permissions.length} permissions to role ${roleId}`);
}

/**
 * Run as standalone script
 */
if (require.main === module) {
  seedRolesAndPermissions()
    .then(() => {
      logger.info('[Seed] Seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('[Seed] Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedRolesAndPermissions };
