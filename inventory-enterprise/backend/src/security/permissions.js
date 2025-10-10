/**
 * Permission Constants
 * Version: v2.4.0-2025-10-07
 *
 * Defines all available permissions in the system.
 * Format: resource:action
 */

const PERMISSIONS = {
  // Inventory permissions
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  INVENTORY_DELETE: 'inventory:delete',
  INVENTORY_ADMIN: 'inventory:admin',

  // Order permissions
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',
  ORDERS_DELETE: 'orders:delete',
  ORDERS_ADMIN: 'orders:admin',

  // User permissions
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_ADMIN: 'users:admin',

  // AI permissions
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write',
  AI_ADMIN: 'ai:admin',

  // Report permissions
  REPORTS_READ: 'reports:read',
  REPORTS_WRITE: 'reports:write',
  REPORTS_EXPORT: 'reports:export',

  // Tenant permissions
  TENANTS_READ: 'tenants:read',
  TENANTS_WRITE: 'tenants:write',
  TENANTS_ADMIN: 'tenants:admin',

  // Webhook permissions
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_WRITE: 'webhooks:write',
  WEBHOOKS_DELETE: 'webhooks:delete',

  // Role permissions
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',

  // System permissions
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_AUDIT: 'system:audit'
};

/**
 * Resource definitions
 */
const RESOURCES = {
  INVENTORY: 'inventory',
  ORDERS: 'orders',
  USERS: 'users',
  AI: 'ai',
  REPORTS: 'reports',
  TENANTS: 'tenants',
  WEBHOOKS: 'webhooks',
  ROLES: 'roles',
  SYSTEM: 'system'
};

/**
 * Action definitions
 */
const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ADMIN: 'admin',
  EXPORT: 'export',
  AUDIT: 'audit'
};

/**
 * Permission hierarchy - admin permissions imply lower-level permissions
 */
const PERMISSION_HIERARCHY = {
  [PERMISSIONS.INVENTORY_ADMIN]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.INVENTORY_DELETE
  ],
  [PERMISSIONS.ORDERS_ADMIN]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.ORDERS_DELETE
  ],
  [PERMISSIONS.USERS_ADMIN]: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
    PERMISSIONS.USERS_DELETE
  ],
  [PERMISSIONS.AI_ADMIN]: [
    PERMISSIONS.AI_READ,
    PERMISSIONS.AI_WRITE
  ],
  [PERMISSIONS.TENANTS_ADMIN]: [
    PERMISSIONS.TENANTS_READ,
    PERMISSIONS.TENANTS_WRITE
  ],
  [PERMISSIONS.SYSTEM_ADMIN]: Object.values(PERMISSIONS).filter(p => p !== PERMISSIONS.SYSTEM_ADMIN)
};

/**
 * Get all permissions implied by a given permission
 * @param {string} permission - Permission name
 * @returns {string[]} - Array of implied permissions
 */
function getImpliedPermissions(permission) {
  const implied = [permission];

  if (PERMISSION_HIERARCHY[permission]) {
    implied.push(...PERMISSION_HIERARCHY[permission]);
  }

  return [...new Set(implied)];
}

/**
 * Parse permission string into resource and action
 * @param {string} permission - Permission in format "resource:action"
 * @returns {{resource: string, action: string}}
 */
function parsePermission(permission) {
  const [resource, action] = permission.split(':');
  return { resource, action };
}

/**
 * Build permission string from resource and action
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {string} - Permission string
 */
function buildPermission(resource, action) {
  return `${resource}:${action}`;
}

/**
 * Check if a permission is valid
 * @param {string} permission - Permission to validate
 * @returns {boolean}
 */
function isValidPermission(permission) {
  return Object.values(PERMISSIONS).includes(permission);
}

/**
 * Get all permissions for a resource
 * @param {string} resource - Resource name
 * @returns {string[]}
 */
function getResourcePermissions(resource) {
  return Object.values(PERMISSIONS).filter(p => p.startsWith(`${resource}:`));
}

/**
 * Default role definitions
 */
const DEFAULT_ROLES = {
  ADMIN: {
    name: 'Admin',
    description: 'Full system administrator',
    permissions: [PERMISSIONS.SYSTEM_ADMIN] // Implies all permissions
  },
  MANAGER: {
    name: 'Manager',
    description: 'Operational manager with read/write access',
    permissions: [
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_WRITE,
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.ORDERS_WRITE,
      PERMISSIONS.AI_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_WRITE,
      PERMISSIONS.REPORTS_EXPORT
    ]
  },
  ANALYST: {
    name: 'Analyst',
    description: 'Read-only access with reporting capabilities',
    permissions: [
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.AI_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_WRITE,
      PERMISSIONS.REPORTS_EXPORT
    ]
  },
  AUDITOR: {
    name: 'Auditor',
    description: 'Read-only access for compliance auditing',
    permissions: [
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.AI_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.TENANTS_READ,
      PERMISSIONS.WEBHOOKS_READ,
      PERMISSIONS.SYSTEM_AUDIT
    ]
  }
};

module.exports = {
  PERMISSIONS,
  RESOURCES,
  ACTIONS,
  PERMISSION_HIERARCHY,
  DEFAULT_ROLES,
  getImpliedPermissions,
  parsePermission,
  buildPermission,
  isValidPermission,
  getResourcePermissions
};
