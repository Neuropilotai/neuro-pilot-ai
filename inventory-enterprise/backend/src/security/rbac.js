/**
 * RBAC Engine
 * Version: v2.4.0-2025-10-07
 *
 * Role-Based Access Control engine with permission checking,
 * grant/revoke, and audit logging.
 */

const db = require('../../config/database');
const { logger } = require('../../config/logger');
const { getImpliedPermissions, isValidPermission } = require('./permissions');
const metricsExporter = require('../../utils/metricsExporter');

class RBACEngine {
  /**
   * Check if user has permission
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} permission - Permission to check
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>}
   */
  async hasPermission(userId, tenantId, permission, options = {}) {
    try {
      const { auditLog = true, ipAddress = null, userAgent = null } = options;

      // Get user's role in the tenant
      const roleQuery = `
        SELECT r.role_id, r.name as role_name
        FROM tenant_users tu
        JOIN roles r ON tu.role_id = r.role_id
        WHERE tu.user_id = ? AND tu.tenant_id = ? AND tu.status = 'active'
        LIMIT 1
      `;

      const roleResult = await db.query(roleQuery, [userId, tenantId]);

      if (!roleResult.rows || roleResult.rows.length === 0) {
        await this._logPermissionCheck(
          userId,
          tenantId,
          permission,
          'denied',
          'no_role',
          ipAddress,
          userAgent,
          auditLog
        );
        return false;
      }

      const role = roleResult.rows[0];

      // Get role's permissions
      const permQuery = `
        SELECT p.name
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = ?
      `;

      const permResult = await db.query(permQuery, [role.role_id]);

      if (!permResult.rows || permResult.rows.length === 0) {
        await this._logPermissionCheck(
          userId,
          tenantId,
          permission,
          'denied',
          'no_permissions',
          ipAddress,
          userAgent,
          auditLog
        );
        return false;
      }

      // Expand permissions with hierarchy
      const grantedPermissions = new Set();
      permResult.rows.forEach(row => {
        const implied = getImpliedPermissions(row.name);
        implied.forEach(p => grantedPermissions.add(p));
      });

      const hasAccess = grantedPermissions.has(permission);

      await this._logPermissionCheck(
        userId,
        tenantId,
        permission,
        hasAccess ? 'allowed' : 'denied',
        hasAccess ? 'granted' : 'insufficient',
        ipAddress,
        userAgent,
        auditLog
      );

      // Record metric
      if (!hasAccess) {
        metricsExporter.recordRBACDenial(permission);
      }

      return hasAccess;
    } catch (error) {
      logger.error('[RBAC] Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if user can perform action on resource
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>}
   */
  async canPerformAction(userId, tenantId, resource, action, options = {}) {
    const permission = `${resource}:${action}`;
    return this.hasPermission(userId, tenantId, permission, options);
  }

  /**
   * Check if user can read resource
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} resource - Resource name
   * @returns {Promise<boolean>}
   */
  async canRead(userId, tenantId, resource) {
    return this.canPerformAction(userId, tenantId, resource, 'read');
  }

  /**
   * Check if user can write to resource
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} resource - Resource name
   * @returns {Promise<boolean>}
   */
  async canWrite(userId, tenantId, resource) {
    return this.canPerformAction(userId, tenantId, resource, 'write');
  }

  /**
   * Check if user can delete resource
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} resource - Resource name
   * @returns {Promise<boolean>}
   */
  async canDelete(userId, tenantId, resource) {
    return this.canPerformAction(userId, tenantId, resource, 'delete');
  }

  /**
   * Check if user is admin for resource
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} resource - Resource name
   * @returns {Promise<boolean>}
   */
  async canAdmin(userId, tenantId, resource) {
    return this.canPerformAction(userId, tenantId, resource, 'admin');
  }

  /**
   * Get all permissions for user in tenant
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<string[]>}
   */
  async getUserPermissions(userId, tenantId) {
    try {
      const query = `
        SELECT DISTINCT p.name
        FROM tenant_users tu
        JOIN roles r ON tu.role_id = r.role_id
        JOIN role_permissions rp ON r.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE tu.user_id = ? AND tu.tenant_id = ? AND tu.status = 'active'
      `;

      const result = await db.query(query, [userId, tenantId]);

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      // Expand with implied permissions
      const allPermissions = new Set();
      result.rows.forEach(row => {
        const implied = getImpliedPermissions(row.name);
        implied.forEach(p => allPermissions.add(p));
      });

      return Array.from(allPermissions);
    } catch (error) {
      logger.error('[RBAC] Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Get user's role in tenant
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>}
   */
  async getUserRole(userId, tenantId) {
    try {
      const query = `
        SELECT r.role_id, r.name, r.description, r.is_system
        FROM tenant_users tu
        JOIN roles r ON tu.role_id = r.role_id
        WHERE tu.user_id = ? AND tu.tenant_id = ? AND tu.status = 'active'
        LIMIT 1
      `;

      const result = await db.query(query, [userId, tenantId]);

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('[RBAC] Error getting user role:', error);
      return null;
    }
  }

  /**
   * Assign role to user in tenant
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} roleId - Role ID
   * @param {string} assignedBy - User ID of assigner
   * @returns {Promise<boolean>}
   */
  async assignRole(userId, tenantId, roleId, assignedBy) {
    try {
      // Check if role exists in tenant
      const roleCheck = await db.query(
        'SELECT role_id FROM roles WHERE role_id = ? AND tenant_id = ?',
        [roleId, tenantId]
      );

      if (!roleCheck.rows || roleCheck.rows.length === 0) {
        logger.warn(`[RBAC] Role ${roleId} not found in tenant ${tenantId}`);
        return false;
      }

      // Upsert tenant_users
      const query = `
        INSERT INTO tenant_users (tenant_id, user_id, role_id, invited_by, status)
        VALUES (?, ?, ?, ?, 'active')
        ON CONFLICT(tenant_id, user_id)
        DO UPDATE SET role_id = excluded.role_id, invited_by = excluded.invited_by
      `;

      await db.query(query, [tenantId, userId, roleId, assignedBy]);

      logger.info(`[RBAC] Assigned role ${roleId} to user ${userId} in tenant ${tenantId}`);
      return true;
    } catch (error) {
      logger.error('[RBAC] Error assigning role:', error);
      return false;
    }
  }

  /**
   * Remove user from tenant
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>}
   */
  async removeUserFromTenant(userId, tenantId) {
    try {
      const query = `
        UPDATE tenant_users
        SET status = 'removed'
        WHERE user_id = ? AND tenant_id = ?
      `;

      await db.query(query, [userId, tenantId]);

      logger.info(`[RBAC] Removed user ${userId} from tenant ${tenantId}`);
      return true;
    } catch (error) {
      logger.error('[RBAC] Error removing user from tenant:', error);
      return false;
    }
  }

  /**
   * Log permission check to audit table
   * @private
   */
  async _logPermissionCheck(
    userId,
    tenantId,
    permission,
    result,
    reason,
    ipAddress,
    userAgent,
    shouldLog
  ) {
    if (!shouldLog) return;

    try {
      const query = `
        INSERT INTO rbac_audit_log
        (tenant_id, user_id, action, resource, permission, result, ip_address, user_agent, metadata)
        VALUES (?, ?, 'permission_check', ?, ?, ?, ?, ?, ?)
      `;

      const { resource, action } = this._parsePermission(permission);
      const metadata = JSON.stringify({ reason });

      await db.query(query, [
        tenantId,
        userId,
        resource,
        permission,
        result,
        ipAddress,
        userAgent,
        metadata
      ]);
    } catch (error) {
      // Don't throw - audit logging should not break the flow
      logger.error('[RBAC] Error logging permission check:', error);
    }
  }

  /**
   * Parse permission into resource and action
   * @private
   */
  _parsePermission(permission) {
    const [resource = 'unknown', action = 'unknown'] = permission.split(':');
    return { resource, action };
  }

  /**
   * Create a new role in tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} name - Role name
   * @param {string} description - Role description
   * @param {string[]} permissions - Permission IDs
   * @param {string} createdBy - User ID
   * @returns {Promise<Object|null>}
   */
  async createRole(tenantId, name, description, permissions, createdBy) {
    try {
      // Create role
      const roleQuery = `
        INSERT INTO roles (tenant_id, name, description, is_system)
        VALUES (?, ?, ?, 0)
        RETURNING role_id
      `;

      const roleResult = await db.query(roleQuery, [tenantId, name, description]);
      const roleId = roleResult.rows[0].role_id;

      // Assign permissions
      for (const permId of permissions) {
        const permQuery = `
          INSERT INTO role_permissions (role_id, permission_id, granted_by)
          VALUES (?, ?, ?)
        `;
        await db.query(permQuery, [roleId, permId, createdBy]);
      }

      logger.info(`[RBAC] Created role ${name} (${roleId}) in tenant ${tenantId}`);

      return { roleId, name, description };
    } catch (error) {
      logger.error('[RBAC] Error creating role:', error);
      return null;
    }
  }

  /**
   * Delete a role from tenant (only non-system roles)
   * @param {string} tenantId - Tenant ID
   * @param {string} roleId - Role ID
   * @returns {Promise<boolean>}
   */
  async deleteRole(tenantId, roleId) {
    try {
      // Check if system role
      const checkQuery = `
        SELECT is_system FROM roles
        WHERE role_id = ? AND tenant_id = ?
      `;

      const checkResult = await db.query(checkQuery, [roleId, tenantId]);

      if (!checkResult.rows || checkResult.rows.length === 0) {
        return false;
      }

      if (checkResult.rows[0].is_system) {
        logger.warn(`[RBAC] Attempted to delete system role ${roleId}`);
        return false;
      }

      // Delete role
      const deleteQuery = `
        DELETE FROM roles
        WHERE role_id = ? AND tenant_id = ?
      `;

      await db.query(deleteQuery, [roleId, tenantId]);

      logger.info(`[RBAC] Deleted role ${roleId} from tenant ${tenantId}`);
      return true;
    } catch (error) {
      logger.error('[RBAC] Error deleting role:', error);
      return false;
    }
  }
}

// Singleton instance
const rbacEngine = new RBACEngine();

module.exports = rbacEngine;
