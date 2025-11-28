/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Provides role checking and tenant/location scoping for multi-user v15.5.0
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const { logger } = require('../config/logger');

// ============================================================================
// ROLE CONSTANTS
// ============================================================================

const ROLES = {
  OWNER: 'OWNER',
  FINANCE: 'FINANCE',
  OPS: 'OPS',
  READONLY: 'READONLY'
};

// Role hierarchy (higher roles inherit lower role permissions)
const ROLE_HIERARCHY = {
  OWNER: 4,
  FINANCE: 3,
  OPS: 2,
  READONLY: 1
};

// ============================================================================
// ROLE CHECKING UTILITIES
// ============================================================================

/**
 * Check if user has any of the required roles
 * @param {Object} user - User object from JWT (req.user)
 * @param {Array<string>} requiredRoles - Array of acceptable roles
 * @returns {boolean}
 */
function hasRole(user, requiredRoles) {
  if (!user || !user.roles) {
    // v22.1: Also check single role field (from auth middleware)
    if (user && user.role) {
      const userRole = user.role.toUpperCase();
      return requiredRoles.some(role => role.toUpperCase() === userRole);
    }
    return false;
  }

  // User can have multiple roles
  const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];

  // v22.1: Case-insensitive role comparison (auth uses lowercase, rbac uses uppercase)
  const normalizedUserRoles = userRoles.map(r => r.toUpperCase());
  const normalizedRequiredRoles = requiredRoles.map(r => r.toUpperCase());

  // Check if user has any of the required roles
  return normalizedRequiredRoles.some(role => normalizedUserRoles.includes(role));
}

/**
 * Check if user has at least the required role level
 * (Considers role hierarchy)
 * @param {Object} user - User object from JWT
 * @param {string} minimumRole - Minimum required role
 * @returns {boolean}
 */
function hasRoleLevel(user, minimumRole) {
  if (!user || !user.roles) {
    // v22.1: Also check single role field (from auth middleware)
    if (user && user.role) {
      const userRole = user.role.toUpperCase();
      const userLevel = ROLE_HIERARCHY[userRole] || 0;
      const minLevel = ROLE_HIERARCHY[minimumRole.toUpperCase()] || 0;
      return userLevel >= minLevel;
    }
    return false;
  }

  const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
  const minLevel = ROLE_HIERARCHY[minimumRole.toUpperCase()] || 0;

  // Check if any user role meets or exceeds the minimum level
  // v22.1: Case-insensitive role comparison
  return userRoles.some(role => {
    const userLevel = ROLE_HIERARCHY[role.toUpperCase()] || 0;
    return userLevel >= minLevel;
  });
}

// ============================================================================
// MIDDLEWARE: REQUIRE ROLE
// ============================================================================

/**
 * Express middleware to require one or more roles
 *
 * Usage:
 *   router.get('/endpoint', requireRole(ROLES.OWNER, ROLES.FINANCE), handler);
 *
 * @param {...string} roles - One or more required roles
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    try {
      // User should be set by authenticateToken middleware
      if (!req.user) {
        logger.warn('RBAC: No user object found on request', {
          path: req.path,
          method: req.method
        });
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if user has any of the required roles
      if (!hasRole(req.user, roles)) {
        logger.warn('RBAC: Access denied - insufficient role', {
          user: req.user.email,
          userRoles: req.user.roles,
          requiredRoles: roles,
          path: req.path,
          method: req.method
        });

        // Record RBAC denial in audit log if audit middleware is available
        if (req.auditLog) {
          req.auditLog({
            action: 'ACCESS_DENIED',
            entity: 'endpoint',
            entity_id: req.path,
            success: 0,
            error_message: `Required roles: ${roles.join(', ')}`
          });
        }

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          requiredRoles: roles
        });
      }

      // User has required role - proceed
      logger.debug('RBAC: Access granted', {
        user: req.user.email,
        roles: req.user.roles,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('RBAC: Error in requireRole middleware', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}

// ============================================================================
// TENANT & LOCATION SCOPING
// ============================================================================

/**
 * Scope query by tenant and location from JWT claims
 *
 * Automatically adds tenant_id and optional location_id filters to queries
 *
 * Usage:
 *   const scopedQuery = scopeByTenantAndLocation(db, req, `
 *     SELECT * FROM ai_forecast_history
 *     WHERE forecast_for_date >= ?
 *   `);
 *   // Returns: { query: "...", params: [tenant_id, location_id?, ...originalParams] }
 *
 * @param {Object} db - Database instance
 * @param {Object} req - Express request with req.user
 * @param {string} baseQuery - Base SQL query
 * @param {Object} options - Options
 * @param {boolean} options.includeLocation - Whether to scope by location (default: true if user has location_id)
 * @param {string} options.tenantColumn - Tenant column name (default: 'tenant_id')
 * @param {string} options.locationColumn - Location column name (default: 'location_id')
 * @returns {Object} { query, scopeParams } - Modified query and scope parameters
 */
function scopeByTenantAndLocation(db, req, baseQuery, options = {}) {
  const {
    includeLocation = true,
    tenantColumn = 'tenant_id',
    locationColumn = 'location_id'
  } = options;

  const tenantId = req.user?.tenant_id || process.env.TENANT_DEFAULT || 'neuropilot';
  const locationId = req.user?.location_id;

  // Check if query already has WHERE clause
  const hasWhere = /\bWHERE\b/i.test(baseQuery);

  let scopedQuery = baseQuery;
  const scopeParams = [];

  // Add tenant scope
  if (hasWhere) {
    scopedQuery = scopedQuery.replace(/WHERE/i, `WHERE ${tenantColumn} = ? AND`);
  } else {
    scopedQuery += ` WHERE ${tenantColumn} = ?`;
  }
  scopeParams.push(tenantId);

  // Add location scope if user has location_id and option is enabled
  if (includeLocation && locationId) {
    scopedQuery += ` AND ${locationColumn} = ?`;
    scopeParams.push(locationId);
  }

  logger.debug('RBAC: Query scoped by tenant/location', {
    tenantId,
    locationId: locationId || 'all',
    user: req.user?.email
  });

  return {
    query: scopedQuery,
    scopeParams
  };
}

/**
 * Helper to add tenant/location to INSERT or UPDATE data
 *
 * @param {Object} req - Express request
 * @param {Object} data - Data object to augment
 * @returns {Object} Data with tenant_id, location_id, created_by added
 */
function addScopeToData(req, data) {
  const tenantId = req.user?.tenant_id || process.env.TENANT_DEFAULT || 'neuropilot';
  const locationId = req.user?.location_id || null;
  const createdBy = req.user?.email || 'system';

  return {
    ...data,
    tenant_id: tenantId,
    location_id: locationId,
    created_by: createdBy
  };
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

/**
 * Check if user can perform action on entity
 * (Extensible for more complex permission logic)
 *
 * @param {Object} user - User from JWT
 * @param {string} action - Action: 'CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT'
 * @param {string} resource - Resource: 'forecast', 'finance', 'documents', 'mappings'
 * @returns {boolean}
 */
function canPerformAction(user, action, resource) {
  if (!user || !user.roles) {
    return false;
  }

  const userRoles = Array.isArray(user.roles) ? user.roles : [user.roles];

  // OWNER can do everything
  if (userRoles.includes(ROLES.OWNER)) {
    return true;
  }

  // FINANCE permissions
  if (userRoles.includes(ROLES.FINANCE)) {
    if (resource === 'finance' || resource === 'documents' || resource === 'mappings') {
      return ['READ', 'CREATE', 'UPDATE', 'EXPORT', 'APPROVE'].includes(action);
    }
    if (resource === 'forecast') {
      return ['READ', 'APPROVE'].includes(action);
    }
  }

  // OPS permissions
  if (userRoles.includes(ROLES.OPS)) {
    if (resource === 'forecast') {
      return ['READ', 'CREATE', 'UPDATE'].includes(action);
    }
    if (resource === 'finance') {
      return ['READ'].includes(action);
    }
  }

  // READONLY permissions
  if (userRoles.includes(ROLES.READONLY)) {
    return action === 'READ';
  }

  return false;
}

/**
 * Express middleware to check specific permission
 *
 * Usage:
 *   router.post('/forecast', requirePermission('CREATE', 'forecast'), handler);
 *
 * @param {string} action - Action to check
 * @param {string} resource - Resource to check
 * @returns {Function} Express middleware
 */
function requirePermission(action, resource) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!canPerformAction(req.user, action, resource)) {
      logger.warn('RBAC: Permission denied', {
        user: req.user.email,
        action,
        resource,
        roles: req.user.roles
      });

      return res.status(403).json({
        success: false,
        error: `Insufficient permissions to ${action} ${resource}`
      });
    }

    next();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  ROLES,
  ROLE_HIERARCHY,

  // Utilities
  hasRole,
  hasRoleLevel,
  canPerformAction,

  // Middleware
  requireRole,
  requirePermission,

  // Scoping helpers
  scopeByTenantAndLocation,
  addScopeToData
};
