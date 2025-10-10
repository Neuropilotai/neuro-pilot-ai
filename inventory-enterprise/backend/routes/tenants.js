/**
 * Tenant Management API Routes
 * Version: v2.4.1-2025-10-07
 *
 * CRUD operations for multi-tenant administration.
 * All routes secured with RBAC permissions.
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { PERMISSIONS } = require('../src/security/permissions');
const { requirePermission } = require('../middleware/tenantContext');
const { metricsExporter } = require('../utils/metricsExporter');

/**
 * GET /api/tenants
 * List all tenants (paginated)
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50, max: 200)
 *   - status (optional: active, suspended, inactive)
 *   - search (optional: search by name)
 *
 * Access: Requires SYSTEM_ADMIN permission
 */
router.get('/',
  requirePermission(PERMISSIONS.SYSTEM_ADMIN),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('status').optional().isIn(['active', 'suspended', 'inactive']),
    query('search').optional().isString().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;

    try {
      // Build query
      let whereClause = '';
      const params = [];

      if (status) {
        whereClause = 'WHERE status = ?';
        params.push(status);
      }

      if (search) {
        whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'name LIKE ?';
        params.push(`%${search}%`);
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM tenants ${whereClause}`,
        params
      );
      const total = countResult.rows[0].total;

      // Get tenants
      const tenantsResult = await db.query(`
        SELECT
          tenant_id,
          name,
          status,
          settings,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM tenant_users WHERE tenant_id = tenants.tenant_id) as user_count
        FROM tenants
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      res.json({
        tenants: tenantsResult.rows.map(tenant => ({
          ...tenant,
          settings: typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : tenant.settings
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Error listing tenants:', error);
      res.status(500).json({
        error: 'Failed to list tenants',
        code: 'TENANT_LIST_ERROR'
      });
    }
  }
);

/**
 * POST /api/tenants
 * Create a new tenant
 *
 * Body:
 *   - name (required, unique)
 *   - settings (optional, JSON object)
 *   - status (optional, default: active)
 *
 * Access: Requires SYSTEM_ADMIN permission
 */
router.post('/',
  requirePermission(PERMISSIONS.SYSTEM_ADMIN),
  [
    body('name').isString().trim().isLength({ min: 1, max: 255 }).notEmpty(),
    body('settings').optional().isObject(),
    body('status').optional().isIn(['active', 'suspended', 'inactive'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, settings = {}, status = 'active' } = req.body;

    try {
      // Check if tenant name already exists
      const existingTenant = await db.query(
        'SELECT tenant_id FROM tenants WHERE name = ?',
        [name]
      );

      if (existingTenant.rows.length > 0) {
        return res.status(409).json({
          error: 'Tenant name already exists',
          code: 'TENANT_NAME_EXISTS'
        });
      }

      // Create tenant
      const result = await db.query(`
        INSERT INTO tenants (name, status, settings)
        VALUES (?, ?, ?)
        RETURNING tenant_id, name, status, settings, created_at
      `, [name, status, JSON.stringify(settings)]);

      const newTenant = result.rows[0];

      // Seed default roles for this tenant
      const { seedRolesAndPermissions } = require('../scripts/seed_roles_2025-10-07');
      await seedRolesAndPermissions(newTenant.tenant_id);

      console.log(`✅ Created tenant: ${name} (${newTenant.tenant_id})`);

      res.status(201).json({
        tenant: {
          ...newTenant,
          settings: typeof newTenant.settings === 'string' ? JSON.parse(newTenant.settings) : newTenant.settings
        }
      });

    } catch (error) {
      console.error('Error creating tenant:', error);
      res.status(500).json({
        error: 'Failed to create tenant',
        code: 'TENANT_CREATE_ERROR'
      });
    }
  }
);

/**
 * GET /api/tenants/:id
 * Get tenant details
 *
 * Access: Requires SYSTEM_ADMIN or access to specific tenant
 */
router.get('/:id',
  requirePermission(PERMISSIONS.SYSTEM_ADMIN),
  [
    param('id').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    try {
      const result = await db.query(`
        SELECT
          tenant_id,
          name,
          status,
          settings,
          created_at,
          updated_at
        FROM tenants
        WHERE tenant_id = ?
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      const tenant = result.rows[0];

      // Get user count
      const userCountResult = await db.query(
        'SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ?',
        [id]
      );

      // Get role count
      const roleCountResult = await db.query(
        'SELECT COUNT(*) as count FROM roles WHERE tenant_id = ?',
        [id]
      );

      res.json({
        tenant: {
          ...tenant,
          settings: typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : tenant.settings,
          stats: {
            user_count: userCountResult.rows[0].count,
            role_count: roleCountResult.rows[0].count
          }
        }
      });

    } catch (error) {
      console.error('Error fetching tenant:', error);
      res.status(500).json({
        error: 'Failed to fetch tenant',
        code: 'TENANT_FETCH_ERROR'
      });
    }
  }
);

/**
 * PUT /api/tenants/:id
 * Update tenant
 *
 * Body:
 *   - name (optional)
 *   - status (optional)
 *   - settings (optional, merged with existing)
 *
 * Access: Requires SYSTEM_ADMIN permission
 */
router.put('/:id',
  requirePermission(PERMISSIONS.SYSTEM_ADMIN),
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('status').optional().isIn(['active', 'suspended', 'inactive']),
    body('settings').optional().isObject()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, status, settings } = req.body;

    try {
      // Check if tenant exists
      const existingTenant = await db.query(
        'SELECT tenant_id, name, status, settings FROM tenants WHERE tenant_id = ?',
        [id]
      );

      if (existingTenant.rows.length === 0) {
        return res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Prevent updating default tenant's critical fields
      if (id === 'default' && (name || status === 'inactive')) {
        return res.status(400).json({
          error: 'Cannot rename or deactivate default tenant',
          code: 'DEFAULT_TENANT_PROTECTED'
        });
      }

      // If name is being changed, check for conflicts
      if (name && name !== existingTenant.rows[0].name) {
        const nameConflict = await db.query(
          'SELECT tenant_id FROM tenants WHERE name = ? AND tenant_id != ?',
          [name, id]
        );

        if (nameConflict.rows.length > 0) {
          return res.status(409).json({
            error: 'Tenant name already exists',
            code: 'TENANT_NAME_EXISTS'
          });
        }
      }

      // Build update query
      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }

      if (status) {
        updates.push('status = ?');
        params.push(status);
      }

      if (settings) {
        // Merge settings
        const existingSettings = typeof existingTenant.rows[0].settings === 'string'
          ? JSON.parse(existingTenant.rows[0].settings)
          : existingTenant.rows[0].settings;
        const mergedSettings = { ...existingSettings, ...settings };
        updates.push('settings = ?');
        params.push(JSON.stringify(mergedSettings));
      }

      updates.push('updated_at = datetime(\'now\')');

      params.push(id);

      await db.query(`
        UPDATE tenants
        SET ${updates.join(', ')}
        WHERE tenant_id = ?
      `, params);

      // Fetch updated tenant
      const updatedTenant = await db.query(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [id]
      );

      console.log(`✅ Updated tenant: ${id}`);

      res.json({
        tenant: {
          ...updatedTenant.rows[0],
          settings: typeof updatedTenant.rows[0].settings === 'string'
            ? JSON.parse(updatedTenant.rows[0].settings)
            : updatedTenant.rows[0].settings
        }
      });

    } catch (error) {
      console.error('Error updating tenant:', error);
      res.status(500).json({
        error: 'Failed to update tenant',
        code: 'TENANT_UPDATE_ERROR'
      });
    }
  }
);

/**
 * DELETE /api/tenants/:id
 * Soft delete tenant (sets status to 'inactive')
 *
 * Note: Does not delete data, only deactivates tenant
 *
 * Access: Requires SYSTEM_ADMIN permission
 */
router.delete('/:id',
  requirePermission(PERMISSIONS.SYSTEM_ADMIN),
  [
    param('id').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    try {
      // Prevent deleting default tenant
      if (id === 'default') {
        return res.status(400).json({
          error: 'Cannot delete default tenant',
          code: 'DEFAULT_TENANT_PROTECTED'
        });
      }

      // Check if tenant exists
      const existingTenant = await db.query(
        'SELECT tenant_id, name, status FROM tenants WHERE tenant_id = ?',
        [id]
      );

      if (existingTenant.rows.length === 0) {
        return res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Soft delete: set status to inactive
      await db.query(`
        UPDATE tenants
        SET status = 'inactive', updated_at = datetime('now')
        WHERE tenant_id = ?
      `, [id]);

      // Deactivate all tenant users
      await db.query(`
        UPDATE tenant_users
        SET status = 'inactive'
        WHERE tenant_id = ?
      `, [id]);

      console.log(`✅ Deactivated tenant: ${id}`);

      res.json({
        message: 'Tenant deactivated successfully',
        tenant_id: id
      });

    } catch (error) {
      console.error('Error deleting tenant:', error);
      res.status(500).json({
        error: 'Failed to delete tenant',
        code: 'TENANT_DELETE_ERROR'
      });
    }
  }
);

/**
 * GET /api/tenants/:id/users
 * List users in tenant
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50)
 *   - status (optional: active, inactive, suspended)
 *
 * Access: Requires SYSTEM_ADMIN or USERS_READ in tenant
 */
router.get('/:id/users',
  requirePermission(PERMISSIONS.USERS_READ),
  [
    param('id').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    try {
      // Check if tenant exists
      const tenant = await db.query('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [id]);
      if (tenant.rows.length === 0) {
        return res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Build query
      let whereClause = 'WHERE tu.tenant_id = ?';
      const params = [id];

      if (status) {
        whereClause += ' AND tu.status = ?';
        params.push(status);
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM tenant_users tu ${whereClause}`,
        params
      );
      const total = countResult.rows[0].total;

      // Get users
      const usersResult = await db.query(`
        SELECT
          u.user_id,
          u.email,
          u.username,
          u.role,
          tu.status,
          tu.joined_at,
          r.name as role_name,
          r.role_id
        FROM tenant_users tu
        JOIN users u ON tu.user_id = u.user_id
        LEFT JOIN roles r ON tu.role_id = r.role_id
        ${whereClause}
        ORDER BY tu.joined_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      res.json({
        users: usersResult.rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Error listing tenant users:', error);
      res.status(500).json({
        error: 'Failed to list tenant users',
        code: 'TENANT_USERS_LIST_ERROR'
      });
    }
  }
);

/**
 * POST /api/tenants/:id/users
 * Add user to tenant
 *
 * Body:
 *   - user_id (required)
 *   - role_id (required)
 *   - status (optional, default: active)
 *
 * Access: Requires SYSTEM_ADMIN or USERS_WRITE in tenant
 */
router.post('/:id/users',
  requirePermission(PERMISSIONS.USERS_WRITE),
  [
    param('id').isString().notEmpty(),
    body('user_id').isString().notEmpty(),
    body('role_id').isString().notEmpty(),
    body('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: tenantId } = req.params;
    const { user_id, role_id, status = 'active' } = req.body;

    try {
      // Verify tenant exists
      const tenant = await db.query('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [tenantId]);
      if (tenant.rows.length === 0) {
        return res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Verify user exists
      const user = await db.query('SELECT user_id FROM users WHERE user_id = ?', [user_id]);
      if (user.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Verify role exists and belongs to tenant
      const role = await db.query(
        'SELECT role_id FROM roles WHERE role_id = ? AND tenant_id = ?',
        [role_id, tenantId]
      );
      if (role.rows.length === 0) {
        return res.status(404).json({
          error: 'Role not found or does not belong to this tenant',
          code: 'ROLE_NOT_FOUND'
        });
      }

      // Check if user is already in tenant
      const existing = await db.query(
        'SELECT tenant_user_id FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
        [tenantId, user_id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'User already exists in tenant',
          code: 'USER_ALREADY_IN_TENANT'
        });
      }

      // Add user to tenant
      await db.query(`
        INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
        VALUES (?, ?, ?, ?)
      `, [tenantId, user_id, role_id, status]);

      console.log(`✅ Added user ${user_id} to tenant ${tenantId} with role ${role_id}`);

      res.status(201).json({
        message: 'User added to tenant successfully',
        tenant_id: tenantId,
        user_id,
        role_id,
        status
      });

    } catch (error) {
      console.error('Error adding user to tenant:', error);
      res.status(500).json({
        error: 'Failed to add user to tenant',
        code: 'TENANT_USER_ADD_ERROR'
      });
    }
  }
);

/**
 * DELETE /api/tenants/:id/users/:userId
 * Remove user from tenant
 *
 * Access: Requires SYSTEM_ADMIN or USERS_DELETE in tenant
 */
router.delete('/:id/users/:userId',
  requirePermission(PERMISSIONS.USERS_DELETE),
  [
    param('id').isString().notEmpty(),
    param('userId').isString().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: tenantId, userId } = req.params;

    try {
      // Check if user is in tenant
      const existing = await db.query(
        'SELECT tenant_user_id FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
        [tenantId, userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found in tenant',
          code: 'USER_NOT_IN_TENANT'
        });
      }

      // Remove user from tenant
      await db.query(
        'DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
        [tenantId, userId]
      );

      console.log(`✅ Removed user ${userId} from tenant ${tenantId}`);

      res.json({
        message: 'User removed from tenant successfully',
        tenant_id: tenantId,
        user_id: userId
      });

    } catch (error) {
      console.error('Error removing user from tenant:', error);
      res.status(500).json({
        error: 'Failed to remove user from tenant',
        code: 'TENANT_USER_REMOVE_ERROR'
      });
    }
  }
);

module.exports = router;
