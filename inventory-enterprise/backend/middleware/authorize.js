// RBAC Authorization Middleware
// Neuro.Pilot.AI V21.1 - Production-ready RBAC enforcement
// NO PLACEHOLDERS - Complete implementation

const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { Counter } = require('prom-client');

// Prometheus metrics
const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['result', 'role']
});

const permissionDenials = new Counter({
  name: 'permission_denials_total',
  help: 'Total permission denials',
  labelNames: ['role', 'permission', 'route']
});

// Role-Permission Matrix (Production-safe, complete)
const ROLE_PERMISSIONS = {
  owner: ['*'], // Full access
  admin: [
    'items:read', 'items:create', 'items:update', 'items:delete',
    'vendors:read', 'vendors:create', 'vendors:update', 'vendors:delete',
    'recipes:read', 'recipes:create', 'recipes:update', 'recipes:delete',
    'menu:read', 'menu:create', 'menu:update', 'menu:delete',
    'population:read', 'population:create', 'population:update', 'population:delete',
    'forecast:read', 'forecast:create', 'forecast:update',
    'orders:read', 'orders:create', 'orders:update', 'orders:delete',
    'pos:read', 'pos:create', 'pos:update', 'pos:delete',
    'reports:read', 'reports:create', 'reports:export',
    'users:read', 'users:create', 'users:update',
    'sites:read', 'sites:create', 'sites:update',
    'audit:read', 'privacy:read'
  ],
  manager: [
    'items:read', 'items:create', 'items:update',
    'vendors:read', 'vendors:create', 'vendors:update',
    'recipes:read', 'recipes:create', 'recipes:update',
    'menu:read', 'menu:update',
    'population:read', 'population:update',
    'forecast:read', 'forecast:update',
    'orders:read', 'orders:create', 'orders:update',
    'pos:read', 'pos:create', 'pos:update',
    'reports:read', 'reports:create', 'reports:export',
    'users:read',
    'sites:read'
  ],
  staff: [
    'items:read',
    'vendors:read',
    'recipes:read',
    'menu:read',
    'orders:read', 'orders:create', 'orders:update',
    'pos:read', 'pos:create', 'pos:update',
    'reports:read',
    'forecast:read'
  ],
  viewer: [
    'items:read',
    'vendors:read',
    'recipes:read',
    'menu:read',
    'population:read',
    'forecast:read',
    'orders:read',
    'reports:read'
  ],
  auditor: [
    'audit:read', 'audit:export',
    'reports:read', 'reports:export',
    'items:read', 'vendors:read', 'recipes:read',
    'orders:read', 'pos:read',
    'users:read', 'sites:read',
    'privacy:read'
  ]
};

// Check if role has permission
function hasPermission(role, permission) {
  if (!role || !permission) return false;

  const permissions = ROLE_PERMISSIONS[role.toLowerCase()];
  if (!permissions) return false;

  // Owner has wildcard access
  if (permissions.includes('*')) return true;

  // Check exact permission
  if (permissions.includes(permission)) return true;

  // Check wildcard resource (e.g., 'items:*')
  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) return true;

  return false;
}

// Auth Guard Middleware - Verifies JWT and loads user
function authGuard(requiredRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        authAttempts.inc({ result: 'missing_token', role: 'none' });
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No token provided'
        });
      }

      const token = authHeader.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET || 'neuro-pilot-secret-v21';

      // Verify JWT
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        authAttempts.inc({ result: 'invalid_token', role: 'none' });
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      // Load user from database with role
      const userResult = await pool.query(`
        SELECT
          u.id, u.email, u.display_name as name, u.role, u.created_at,
          COALESCE(ur.org_id, 'default-org') AS org_id,
          ur.site_id
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1
      `, [decoded.userId]);

      if (userResult.rows.length === 0) {
        authAttempts.inc({ result: 'user_not_found', role: 'none' });
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found or inactive'
        });
      }

      const user = userResult.rows[0];
      req.user = user;
      req.tenancy = {
        org_id: user.org_id,
        site_id: user.site_id || null
      };

      // Check role requirement
      if (requiredRoles.length > 0) {
        const normalizedRoles = requiredRoles.map(r => r.toLowerCase());
        const userRole = (user.role || 'viewer').toLowerCase();

        if (!normalizedRoles.includes(userRole)) {
          authAttempts.inc({ result: 'insufficient_role', role: userRole });
          return res.status(403).json({
            error: 'Forbidden',
            message: `Requires role: ${requiredRoles.join(' or ')}`,
            userRole: user.role
          });
        }
      }

      authAttempts.inc({ result: 'success', role: user.role || 'viewer' });
      next();
    } catch (err) {
      console.error('[RBAC] Auth guard error:', err);
      authAttempts.inc({ result: 'error', role: 'none' });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed'
      });
    }
  };
}

// Permission Guard Middleware - Fine-grained permission check
function requirePermissions(...permissions) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const userRole = (req.user.role || 'viewer').toLowerCase();
      const missingPermissions = [];

      for (const permission of permissions) {
        if (!hasPermission(userRole, permission)) {
          missingPermissions.push(permission);
          permissionDenials.inc({
            role: userRole,
            permission,
            route: req.path
          });
        }
      }

      if (missingPermissions.length > 0) {
        console.warn(`[RBAC] Permission denied: ${req.user.email} (${userRole}) attempted ${missingPermissions.join(', ')} on ${req.path}`);

        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions',
          required: missingPermissions,
          userRole
        });
      }

      next();
    } catch (err) {
      console.error('[RBAC] Permission guard error:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission check failed'
      });
    }
  };
}

// Helper: Get user's permissions
async function getUserPermissions(userId) {
  try {
    const result = await pool.query(`
      SELECT COALESCE(ur.role, 'viewer') AS role
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return [];
    }

    const role = (result.rows[0].role || 'viewer').toLowerCase();
    return ROLE_PERMISSIONS[role] || [];
  } catch (err) {
    console.error('[RBAC] Failed to get user permissions:', err);
    return [];
  }
}

// Helper: Check if user can perform action
async function canPerform(userId, permission) {
  const permissions = await getUserPermissions(userId);

  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;

  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) return true;

  return false;
}

module.exports = {
  authGuard,
  requirePermissions,
  hasPermission,
  getUserPermissions,
  canPerform,
  ROLE_PERMISSIONS
};
