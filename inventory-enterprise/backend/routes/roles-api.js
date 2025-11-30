/**
 * Role & Permission Management API Routes
 * Version: v2.4.1-2025-10-07
 *
 * CRUD operations for RBAC role and permission management.
 * All routes secured with RBAC permissions.
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { PERMISSIONS, PERMISSION_CATEGORIES } = require('../src/security/permissions');
const { requirePermission } = require('../middleware/tenantContext');

/**
 * GET /api/roles
 * List all roles for current tenant
 *
 * Query params:
 *   - include_system (default: true) - Include system-defined roles
 *
 * Access: Requires ROLES_READ permission
 */
router.get('/',
  requirePermission(PERMISSIONS.ROLES_READ),
  [
    query('include_system').optional().isBoolean().toBoolean()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const includeSystem = req.query.include_system !== false;

    try {
      let whereClause = 'WHERE tenant_id = $1';
      const params = [tenantId];

      if (!includeSystem) {
        whereClause += ' AND is_system = false';
      }

      const rolesResult = await db.query(`
        SELECT
          role_id,
          name,
          description,
          is_system,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM role_permissions WHERE role_id = roles.role_id) as permission_count,
          (SELECT COUNT(*) FROM tenant_users WHERE role_id = roles.role_id) as user_count
        FROM roles
        ${whereClause}
        ORDER BY is_system DESC, name ASC
      `, params);

      res.json({
        roles: rolesResult.rows
      });

    } catch (error) {
      console.error('Error listing roles:', error);
      res.status(500).json({
        error: 'Failed to list roles',
        code: 'ROLES_LIST_ERROR'
      });
    }
  }
);

/**
 * POST /api/roles
 * Create a new custom role
 *
 * Body:
 *   - name (required, max 100 chars)
 *   - description (optional, max 500 chars)
 *   - permissions (optional, array of permission IDs)
 *
 * Access: Requires ROLES_WRITE permission
 */
router.post('/',
  requirePermission(PERMISSIONS.ROLES_WRITE),
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }).notEmpty(),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('permissions').optional().isArray()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { name, description = '', permissions = [] } = req.body;

    try {
      // Check if role name already exists in this tenant
      const existingRole = await db.query(
        'SELECT role_id FROM roles WHERE tenant_id = $1 AND name = $2',
        [tenantId, name]
      );

      if (existingRole.rows.length > 0) {
        return res.status(409).json({
          error: 'Role name already exists in this tenant',
          code: 'ROLE_NAME_EXISTS'
        });
      }

      // Create role
      const roleResult = await db.query(`
        INSERT INTO roles (tenant_id, name, description, is_system)
        VALUES ($1, $2, $3, false)
        RETURNING role_id, name, description, is_system, created_at
      `, [tenantId, name, description]);

      const newRole = roleResult.rows[0];

      // Assign permissions if provided
      if (permissions.length > 0) {
        // Verify all permissions exist (build $1, $2, ... placeholders)
        const permissionPlaceholders = permissions.map((_, i) => `$${i + 1}`).join(',');
        const permissionCheck = await db.query(
          `SELECT permission_id FROM permissions WHERE permission_id IN (${permissionPlaceholders})`,
          permissions
        );

        if (permissionCheck.rows.length !== permissions.length) {
          // Rollback role creation
          await db.query('DELETE FROM roles WHERE role_id = $1', [newRole.role_id]);
          return res.status(400).json({
            error: 'One or more invalid permission IDs',
            code: 'INVALID_PERMISSION_IDS'
          });
        }

        // Insert role-permission mappings
        const insertPromises = permissions.map(permissionId =>
          db.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [newRole.role_id, permissionId]
          )
        );
        await Promise.all(insertPromises);
      }

      console.log(`✅ Created role: ${name} (${newRole.role_id}) for tenant ${tenantId}`);

      res.status(201).json({
        role: {
          ...newRole,
          permission_count: permissions.length
        }
      });

    } catch (error) {
      console.error('Error creating role:', error);
      res.status(500).json({
        error: 'Failed to create role',
        code: 'ROLE_CREATE_ERROR'
      });
    }
  }
);

/**
 * GET /api/roles/:id
 * Get role details with permissions
 *
 * Access: Requires ROLES_READ permission
 */
router.get('/:id',
  requirePermission(PERMISSIONS.ROLES_READ),
  [
    param('id').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { id } = req.params;

    try {
      // Get role
      const roleResult = await db.query(`
        SELECT
          role_id,
          name,
          description,
          is_system,
          created_at,
          updated_at
        FROM roles
        WHERE role_id = $1 AND tenant_id = $2
      `, [id, tenantId]);

      if (roleResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      const role = roleResult.rows[0];

      // Get permissions
      const permissionsResult = await db.query(`
        SELECT
          p.permission_id,
          p.name,
          p.description,
          p.category,
          p.resource,
          p.action
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.category, p.name
      `, [id]);

      // Get user count
      const userCountResult = await db.query(
        'SELECT COUNT(*) as count FROM tenant_users WHERE role_id = $1',
        [id]
      );

      res.json({
        role: {
          ...role,
          permissions: permissionsResult.rows,
          user_count: userCountResult.rows[0].count
        }
      });

    } catch (error) {
      console.error('Error fetching role:', error);
      res.status(500).json({
        error: 'Failed to fetch role',
        code: 'ROLE_FETCH_ERROR'
      });
    }
  }
);

/**
 * PUT /api/roles/:id
 * Update role details
 *
 * Body:
 *   - name (optional)
 *   - description (optional)
 *
 * Note: Cannot modify system roles
 *
 * Access: Requires ROLES_WRITE permission
 */
router.put('/:id',
  requirePermission(PERMISSIONS.ROLES_WRITE),
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { id } = req.params;
    const { name, description } = req.body;

    try {
      // Get existing role
      const existingRole = await db.query(
        'SELECT role_id, name, is_system FROM roles WHERE role_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (existingRole.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Prevent modifying system roles
      if (existingRole.rows[0].is_system) {
        return res.status(400).json({
          error: 'Cannot modify system-defined roles',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }

      // If name is being changed, check for conflicts
      if (name && name !== existingRole.rows[0].name) {
        const nameConflict = await db.query(
          'SELECT role_id FROM roles WHERE tenant_id = $1 AND name = $2 AND role_id != $3',
          [tenantId, name, id]
        );

        if (nameConflict.rows.length > 0) {
          return res.status(409).json({
            error: 'Role name already exists',
            code: 'ROLE_NAME_EXISTS'
          });
        }
      }

      // Build update query with PostgreSQL $n placeholders
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (name) {
        updates.push(`name = $${paramIndex++}`);
        params.push(name);
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: 'No fields to update',
          code: 'NO_UPDATE_FIELDS'
        });
      }

      updates.push('updated_at = NOW()');
      params.push(id, tenantId);

      await db.query(`
        UPDATE roles
        SET ${updates.join(', ')}
        WHERE role_id = $${paramIndex++} AND tenant_id = $${paramIndex}
      `, params);

      // Fetch updated role
      const updatedRole = await db.query(
        'SELECT * FROM roles WHERE role_id = $1',
        [id]
      );

      console.log(`✅ Updated role: ${id}`);

      res.json({
        role: updatedRole.rows[0]
      });

    } catch (error) {
      console.error('Error updating role:', error);
      res.status(500).json({
        error: 'Failed to update role',
        code: 'ROLE_UPDATE_ERROR'
      });
    }
  }
);

/**
 * DELETE /api/roles/:id
 * Delete custom role
 *
 * Note: Cannot delete system roles or roles with active users
 *
 * Access: Requires ROLES_DELETE permission
 */
router.delete('/:id',
  requirePermission(PERMISSIONS.ROLES_DELETE),
  [
    param('id').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { id } = req.params;

    try {
      // Get role
      const roleResult = await db.query(
        'SELECT role_id, name, is_system FROM roles WHERE role_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (roleResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Prevent deleting system roles
      if (roleResult.rows[0].is_system) {
        return res.status(400).json({
          error: 'Cannot delete system-defined roles',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }

      // Check if role has active users
      const userCount = await db.query(
        'SELECT COUNT(*) as count FROM tenant_users WHERE role_id = $1',
        [id]
      );

      if (parseInt(userCount.rows[0].count, 10) > 0) {
        return res.status(400).json({
          error: 'Cannot delete role with active users',
          code: 'ROLE_HAS_USERS',
          user_count: parseInt(userCount.rows[0].count, 10)
        });
      }

      // Delete role permissions first
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

      // Delete role
      await db.query('DELETE FROM roles WHERE role_id = $1', [id]);

      console.log(`✅ Deleted role: ${id}`);

      res.json({
        message: 'Role deleted successfully',
        role_id: id
      });

    } catch (error) {
      console.error('Error deleting role:', error);
      res.status(500).json({
        error: 'Failed to delete role',
        code: 'ROLE_DELETE_ERROR'
      });
    }
  }
);

/**
 * GET /api/roles/:id/permissions
 * Get role's permissions
 *
 * Access: Requires ROLES_READ permission
 */
router.get('/:id/permissions',
  requirePermission(PERMISSIONS.ROLES_READ),
  [
    param('id').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { id } = req.params;

    try {
      // Verify role exists and belongs to tenant
      const role = await db.query(
        'SELECT role_id FROM roles WHERE role_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (role.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Get permissions
      const permissionsResult = await db.query(`
        SELECT
          p.permission_id,
          p.name,
          p.description,
          p.category,
          p.resource,
          p.action
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.category, p.name
      `, [id]);

      res.json({
        role_id: id,
        permissions: permissionsResult.rows
      });

    } catch (error) {
      console.error('Error fetching role permissions:', error);
      res.status(500).json({
        error: 'Failed to fetch role permissions',
        code: 'ROLE_PERMISSIONS_FETCH_ERROR'
      });
    }
  }
);

/**
 * PUT /api/roles/:id/permissions
 * Update role's permissions (replace all)
 *
 * Body:
 *   - permissions (required, array of permission IDs)
 *
 * Note: Cannot modify system roles
 *
 * Access: Requires ROLES_WRITE permission
 */
router.put('/:id/permissions',
  requirePermission(PERMISSIONS.ROLES_WRITE),
  [
    param('id').isString().notEmpty(),
    body('permissions').isArray()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.tenant;
    const { id } = req.params;
    const { permissions } = req.body;

    try {
      // Verify role exists and belongs to tenant
      const role = await db.query(
        'SELECT role_id, is_system FROM roles WHERE role_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (role.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Prevent modifying system roles
      if (role.rows[0].is_system) {
        return res.status(400).json({
          error: 'Cannot modify permissions of system-defined roles',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }

      // Verify all permissions exist
      if (permissions.length > 0) {
        const permissionPlaceholders = permissions.map((_, i) => `$${i + 1}`).join(',');
        const permissionCheck = await db.query(
          `SELECT permission_id FROM permissions WHERE permission_id IN (${permissionPlaceholders})`,
          permissions
        );

        if (permissionCheck.rows.length !== permissions.length) {
          return res.status(400).json({
            error: 'One or more invalid permission IDs',
            code: 'INVALID_PERMISSION_IDS'
          });
        }
      }

      // Delete existing permissions
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

      // Insert new permissions
      if (permissions.length > 0) {
        const insertPromises = permissions.map(permissionId =>
          db.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [id, permissionId]
          )
        );
        await Promise.all(insertPromises);
      }

      console.log(`✅ Updated permissions for role: ${id}`);

      res.json({
        message: 'Role permissions updated successfully',
        role_id: id,
        permission_count: permissions.length
      });

    } catch (error) {
      console.error('Error updating role permissions:', error);
      res.status(500).json({
        error: 'Failed to update role permissions',
        code: 'ROLE_PERMISSIONS_UPDATE_ERROR'
      });
    }
  }
);

/**
 * GET /api/permissions
 * List all available permissions
 *
 * Query params:
 *   - category (optional) - Filter by category
 *
 * Access: Requires ROLES_READ permission
 */
router.get('/permissions',
  requirePermission(PERMISSIONS.ROLES_READ),
  [
    query('category').optional().isString()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category } = req.query;

    try {
      let whereClause = '';
      const params = [];

      if (category) {
        whereClause = 'WHERE category = $1';
        params.push(category);
      }

      const permissionsResult = await db.query(`
        SELECT
          permission_id,
          name,
          description,
          category,
          resource,
          action
        FROM permissions
        ${whereClause}
        ORDER BY category, name
      `, params);

      // Group permissions by category
      const groupedPermissions = permissionsResult.rows.reduce((acc, perm) => {
        if (!acc[perm.category]) {
          acc[perm.category] = [];
        }
        acc[perm.category].push(perm);
        return acc;
      }, {});

      res.json({
        permissions: permissionsResult.rows,
        grouped: groupedPermissions,
        categories: Object.keys(PERMISSION_CATEGORIES)
      });

    } catch (error) {
      console.error('Error listing permissions:', error);
      res.status(500).json({
        error: 'Failed to list permissions',
        code: 'PERMISSIONS_LIST_ERROR'
      });
    }
  }
);

module.exports = router;
