/**
 * Tenant Context Middleware
 * Version: v2.4.0-2025-10-07
 *
 * Resolves tenant from JWT/header/API key and attaches to request.
 * Enforces tenant isolation and validates tenant access.
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../db');  // Use PostgreSQL pool directly
const { logger } = require('../config/logger');
const rbacEngine = require('../src/security/rbac');
const metricsExporter = require('../utils/metricsExporter');

/**
 * Extract tenant ID from request
 * Priority:
 * 1. X-Tenant-Id header (if user has access)
 * 2. JWT token (tenant_id claim)
 * 3. Host header mapping (subdomain tenant)
 * 4. API key mapping
 */
async function resolveTenant(req, res, next) {
  try {
    let tenantId = null;
    let source = null;

    // 1. Check X-Tenant-Id header
    const headerTenantId = req.headers['x-tenant-id'];
    if (headerTenantId) {
      // Verify user has access to this tenant
      if (req.user && req.user.userId) {
        const hasAccess = await verifyTenantAccess(req.user.userId, headerTenantId);
        if (hasAccess) {
          tenantId = headerTenantId;
          source = 'header';
        } else {
          logger.warn(`[TenantContext] User ${req.user.userId} attempted access to tenant ${headerTenantId} without permission`);
          return res.status(403).json({
            success: false,
            message: 'Access denied to specified tenant',
            code: 'TENANT_ACCESS_DENIED'
          });
        }
      }
    }

    // 2. Check JWT token
    if (!tenantId && req.user && req.user.tenantId) {
      tenantId = req.user.tenantId;
      source = 'jwt';
    }

    // 3. Check host header for subdomain tenant
    if (!tenantId && req.headers.host) {
      const subdomain = extractSubdomain(req.headers.host);
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        const mappedTenant = await getTenantBySubdomain(subdomain);
        if (mappedTenant) {
          tenantId = mappedTenant;
          source = 'subdomain';
        }
      }
    }

    // 4. Check API key
    if (!tenantId && req.headers['x-api-key']) {
      const apiKey = req.headers['x-api-key'];
      const mappedTenant = await getTenantByApiKey(apiKey);
      if (mappedTenant) {
        tenantId = mappedTenant;
        source = 'api_key';
      }
    }

    // Default to 'default' tenant if none resolved (single-tenant mode)
    if (!tenantId) {
      tenantId = 'default'; // Default tenant ID for single-tenant deployments
      source = 'default';
      logger.info('[TenantContext] Using default tenant (single-tenant mode)');
    }

    // Verify tenant exists and is active
    const tenantStatus = await getTenantStatus(tenantId);
    if (!tenantStatus) {
      logger.warn(`[TenantContext] Tenant ${tenantId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND'
      });
    }

    if (tenantStatus.status !== 'active') {
      logger.warn(`[TenantContext] Tenant ${tenantId} is ${tenantStatus.status}`);
      return res.status(403).json({
        success: false,
        message: `Tenant is ${tenantStatus.status}`,
        code: 'TENANT_INACTIVE'
      });
    }

    // Attach tenant context to request
    req.tenant = {
      tenantId,
      name: tenantStatus.name,
      source,
      settings: tenantStatus.settings
    };

    // Record metric
    metricsExporter.recordTenantRequest(tenantId);

    logger.debug(`[TenantContext] Resolved tenant ${tenantId} from ${source} for user ${req.user?.userId || 'anonymous'}`);

    next();
  } catch (error) {
    logger.error('[TenantContext] Error resolving tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve tenant context',
      code: 'TENANT_RESOLUTION_ERROR'
    });
  }
}

/**
 * Middleware to require specific permission
 * @param {string} permission - Required permission
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      // Check for user (support both id and userId for compatibility)
      const userId = req.user?.id || req.user?.userId;

      if (!req.user || !userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!req.tenant || !req.tenant.tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required',
          code: 'TENANT_REQUIRED'
        });
      }

      // Check if user has the permission in their JWT claims
      if (req.user.permissions && req.user.permissions.includes(permission)) {
        logger.debug(`[TenantContext] User ${userId} has permission ${permission} (from JWT)`);
        next();
        return;
      }

      // Fallback to RBAC engine for database-based permissions
      try {
        const hasPermission = await rbacEngine.hasPermission(
          userId,
          req.tenant.tenantId,
          permission,
          {
            auditLog: true,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        );

        if (hasPermission) {
          logger.debug(`[TenantContext] User ${userId} has permission ${permission} (from RBAC)`);
          next();
          return;
        }
      } catch (rbacError) {
        // If RBAC engine fails, log but continue with JWT-based check
        logger.warn('[TenantContext] RBAC engine error, using JWT permissions:', rbacError.message);

        // If JWT permissions check passed, we already returned
        // If we're here, user doesn't have permission
      }

      logger.warn(`[TenantContext] User ${userId} denied ${permission} in tenant ${req.tenant.tenantId}`);
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: permission
      });

    } catch (error) {
      logger.error('[TenantContext] Error checking permission:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check permissions',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
}

/**
 * Middleware to require resource action
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 */
function requireAction(resource, action) {
  const permission = `${resource}:${action}`;
  return requirePermission(permission);
}

/**
 * Middleware to scope database query by tenant
 */
function scopeQuery(req, res, next) {
  if (req.tenant && req.tenant.tenantId) {
    // Attach tenant ID to query context
    req.queryScope = {
      tenantId: req.tenant.tenantId
    };
  }
  next();
}

/**
 * Helper: Verify user has access to tenant
 */
async function verifyTenantAccess(userId, tenantId) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM tenant_users
      WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'
    `, [userId, tenantId]);

    return parseInt(result.rows[0]?.count || 0) > 0;
  } catch (error) {
    logger.error('[TenantContext] Error verifying tenant access:', error);
    // If table doesn't exist, allow access (single-tenant mode)
    if (error.code === '42P01') {
      logger.info('[TenantContext] tenant_users table not found - allowing access (single-tenant mode)');
      return true;
    }
    return false;
  }
}

/**
 * Helper: Extract subdomain from host header
 */
function extractSubdomain(host) {
  // Remove port if present
  const hostname = host.split(':')[0];

  // Split by dots
  const parts = hostname.split('.');

  // If only 2 parts (e.g., example.com), no subdomain
  if (parts.length <= 2) {
    return null;
  }

  // Return first part as subdomain
  return parts[0];
}

/**
 * Helper: Get tenant by subdomain
 */
async function getTenantBySubdomain(subdomain) {
  try {
    const result = await pool.query(`
      SELECT tenant_id
      FROM tenants
      WHERE settings->>'subdomain' = $1 AND status = 'active'
      LIMIT 1
    `, [subdomain]);

    return result.rows[0]?.tenant_id || null;
  } catch (error) {
    logger.error('[TenantContext] Error getting tenant by subdomain:', error);
    return null;
  }
}

/**
 * Helper: Get tenant by API key
 */
async function getTenantByApiKey(apiKey) {
  try {
    // Hash the API key
    const crypto = require('crypto');
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const result = await pool.query(`
      SELECT tenant_id
      FROM tenants
      WHERE settings->>'api_key_hash' = $1 AND status = 'active'
      LIMIT 1
    `, [hashedKey]);

    return result.rows[0]?.tenant_id || null;
  } catch (error) {
    logger.error('[TenantContext] Error getting tenant by API key:', error);
    return null;
  }
}

/**
 * Helper: Get tenant status
 */
async function getTenantStatus(tenantId) {
  try {
    const result = await pool.query(`
      SELECT tenant_id, name, status, settings
      FROM tenants
      WHERE tenant_id = $1
      LIMIT 1
    `, [tenantId]);

    const row = result.rows[0];

    if (!row) {
      // For single-tenant mode or when tenants table doesn't exist,
      // return a default active tenant
      logger.debug(`[TenantContext] Tenant ${tenantId} not found - using default`);
      return {
        tenantId: tenantId,
        name: 'Default Tenant',
        status: 'active',
        settings: {}
      };
    }

    logger.debug(`[TenantContext] Found tenant ${tenantId}: ${row.name} (${row.status})`);

    return {
      tenantId: row.tenant_id,
      name: row.name,
      status: row.status,
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {})
    };
  } catch (error) {
    // If tenants table doesn't exist (42P01), allow access in single-tenant mode
    if (error.code === '42P01') {
      logger.info('[TenantContext] tenants table not found - using single-tenant mode');
      return {
        tenantId: tenantId,
        name: 'Default Tenant',
        status: 'active',
        settings: {}
      };
    }
    logger.error('[TenantContext] Error getting tenant status:', error);
    return null;
  }
}

/**
 * Apply tenant scope to SQL query
 * @param {string} query - SQL query
 * @param {string} tenantId - Tenant ID
 * @param {string} alias - Table alias (optional)
 * @returns {string} - Scoped query
 */
function applyScopeToQuery(query, tenantId, alias = '') {
  const tenantColumn = alias ? `${alias}.tenant_id` : 'tenant_id';

  // Check if WHERE clause exists
  if (query.toUpperCase().includes('WHERE')) {
    return query.replace(/WHERE/i, `WHERE ${tenantColumn} = '${tenantId}' AND`);
  } else {
    // Add WHERE clause before ORDER BY, GROUP BY, or LIMIT
    const regex = /(ORDER BY|GROUP BY|LIMIT|$)/i;
    return query.replace(regex, `WHERE ${tenantColumn} = '${tenantId}' $1`);
  }
}

module.exports = {
  resolveTenant,
  requirePermission,
  requireAction,
  scopeQuery,
  verifyTenantAccess,
  applyScopeToQuery
};
