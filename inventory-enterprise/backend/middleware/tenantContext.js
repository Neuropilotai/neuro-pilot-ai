/**
 * Tenant Context Middleware
 * Version: v3.0.0 - P1 Hardening
 * 
 * Resolves org_id from JWT/header/API key/subdomain and attaches to request.
 * Enforces multi-tenant isolation using org_id (UUID).
 * 
 * Priority:
 * 1. X-Org-Id header (if user has access)
 * 2. JWT token (org_id claim)
 * 3. API key mapping
 * 4. Host header mapping (subdomain → org slug)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { logger } = require('../config/logger');
const rbacEngine = require('../src/security/rbac');
const metricsExporter = require('../utils/metricsExporter');

/**
 * Resolve org_id from request
 * P1 Hardening: Uses org_id (UUID) instead of tenant_id
 */
async function resolveTenant(req, res, next) {
  const ctx = {
    cid: req.headers['x-correlation-id'] || crypto.randomUUID(),
    path: req.path,
    method: req.method,
    ip: req.ip
  };

  try {
    let orgId = null;
    let source = null;

    // 1. Check X-Org-Id header (P1: New header support)
    const headerOrgId = req.headers['x-org-id'] || req.headers['X-Org-Id'];
    if (headerOrgId) {
      // Verify user has access to this org
      if (req.user && req.user.id) {
        const hasAccess = await verifyOrgAccess(req.user.id, headerOrgId);
        if (hasAccess) {
          orgId = headerOrgId;
          source = 'header';
        } else {
          logger.warn(`[TenantContext] User ${req.user.id} attempted access to org ${headerOrgId} without permission`);
          return res.status(403).json({
            success: false,
            message: 'Access denied to specified organization',
            code: 'ORG_ACCESS_DENIED'
          });
        }
      } else {
        // Allow header for API key requests (no user context)
        orgId = headerOrgId;
        source = 'header';
      }
    }

    // 2. Check JWT token (org_id claim) - P1: Primary source
    if (!orgId && req.user && req.user.org_id) {
      orgId = req.user.org_id;
      source = 'jwt';
      logger.debug({ ...ctx, orgId, source }, '[TenantContext] Resolved from JWT');
    }

    // 3. Check API key mapping
    if (!orgId && req.headers['x-api-key']) {
      const apiKey = req.headers['x-api-key'];
      const mappedOrgId = await getOrgByApiKey(apiKey);
      if (mappedOrgId) {
        orgId = mappedOrgId;
        source = 'api_key';
        logger.debug({ ...ctx, orgId, source }, '[TenantContext] Resolved from API key');
      }
    }

    // 4. Check host header for subdomain → org slug mapping
    if (!orgId && req.headers.host) {
      const subdomain = extractSubdomain(req.headers.host);
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        const mappedOrgId = await getOrgBySubdomain(subdomain);
        if (mappedOrgId) {
          orgId = mappedOrgId;
          source = 'subdomain';
          logger.debug({ ...ctx, orgId, source, hostname: req.headers.host }, '[TenantContext] Resolved from subdomain');
        }
      }
    }

    // Default to default org if none resolved
    if (!orgId) {
      // Try to use default org UUID from organizations table
      const defaultOrg = await getDefaultOrg();
      if (defaultOrg) {
        orgId = defaultOrg.id;
        source = 'default';
      } else {
        // Fallback for single-tenant mode
        orgId = '00000000-0000-0000-0000-000000000001'; // Default org UUID
        source = 'default';
        logger.info('[TenantContext] Using default org (single-tenant mode)');
      }
    }

    // Verify org exists and is active
    const orgStatus = await getOrgStatus(orgId);
    if (!orgStatus) {
      logger.warn(`[TenantContext] Organization ${orgId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
        code: 'ORG_NOT_FOUND'
      });
    }

    if (orgStatus.deleted_at) {
      logger.warn(`[TenantContext] Organization ${orgId} is deleted`);
      return res.status(403).json({
        success: false,
        message: 'Organization not found',
        code: 'ORG_DELETED'
      });
    }

    // Attach org context to request (backward compatible with req.tenant)
    req.org = {
      org_id: orgId,
      name: orgStatus.name,
      slug: orgStatus.slug,
      source,
      settings: orgStatus.settings
    };

    // Backward compatibility: also set req.tenant
    req.tenant = {
      tenantId: orgId,  // Legacy support
      org_id: orgId,    // New field
      name: orgStatus.name,
      source,
      settings: orgStatus.settings
    };

    // Also set req.org_id for backward compatibility
    req.org_id = orgId;

    // Set session variable for RLS (if using PostgreSQL RLS)
    try {
      await pool.query('SET LOCAL app.current_org_id = $1', [orgId]);
    } catch (rlsError) {
      // RLS not enabled or not in transaction - ignore
      logger.debug('[TenantContext] Could not set RLS session variable:', rlsError.message);
    }

    // Record metric
    if (metricsExporter && typeof metricsExporter.recordTenantRequest === 'function') {
      metricsExporter.recordTenantRequest(orgId);
    }

    logger.debug({ ...ctx, orgId, source, userId: req.user?.id || 'anonymous' }, '[TenantContext] Resolved successfully');

    next();
  } catch (error) {
    logger.error({ ...ctx, error: error.message, stack: error.stack }, '[TenantContext] Error resolving org context');
    res.status(500).json({
      success: false,
      message: 'Failed to resolve organization context',
      code: 'ORG_RESOLUTION_ERROR',
      correlationId: ctx.cid
    });
  }
}

/**
 * Middleware to require specific permission
 * @param {string} permission - Required permission
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    const ctx = {
      cid: req.headers['x-correlation-id'] || crypto.randomUUID(),
      permission
    };

    try {
      // Check for user (support both id and userId for compatibility)
      const userId = req.user?.id || req.user?.userId;

      if (!req.user || !userId) {
        logger.warn({ ...ctx }, '[TenantContext] Permission check failed: no user');
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          correlationId: ctx.cid
        });
      }

      if (!req.tenant || !req.tenant.tenantId) {
        logger.warn({ ...ctx, userId }, '[TenantContext] Permission check failed: no tenant');
        return res.status(400).json({
          error: 'Tenant context required',
          code: 'TENANT_REQUIRED',
          correlationId: ctx.cid
        });
      }

      // Check if user has the permission in their JWT claims
      if (req.user.permissions && req.user.permissions.includes(permission)) {
        logger.debug({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantContext] Permission granted (JWT)');
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
          logger.debug({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantContext] Permission granted (RBAC)');
          next();
          return;
        }
      } catch (rbacError) {
        // If RBAC engine fails, log but continue with JWT-based check
        logger.warn({ ...ctx, error: rbacError.message }, '[TenantContext] RBAC engine error, using JWT permissions');
        // If JWT permissions check passed, we already returned
        // If we're here, user doesn't have permission
      }

      logger.warn({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantContext] Permission denied');
      return res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: permission,
        correlationId: ctx.cid
      });

    } catch (error) {
      logger.error({ ...ctx, error: error.message }, '[TenantContext] Permission check error');
      res.status(500).json({
        error: 'Failed to check permissions',
        code: 'PERMISSION_CHECK_ERROR',
        correlationId: ctx.cid
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
 * Helper: Extract subdomain from hostname
 * Examples:
 *   - camp-alpha.neuropilot.dev → camp-alpha
 *   - api.neuropilot.dev → null (reserved)
 *   - neuropilot.dev → null (no subdomain)
 */
function extractSubdomain(hostname) {
  // Remove port if present
  const host = hostname.split(':')[0];

  // Split by dots
  const parts = host.split('.');

  // If only 2 parts (e.g., example.com), no subdomain
  if (parts.length <= 2) {
    return null;
  }

  // Extract subdomain (first part)
  const subdomain = parts[0];

  // Skip reserved subdomains
  const reserved = ['www', 'api', 'app', 'admin', 'staging', 'dev', 'test'];
  if (reserved.includes(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Helper: Verify user has access to organization
 * P1: Updated to use org_id and organization_members table
 */
async function verifyOrgAccess(userId, orgId) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM organization_members
      WHERE user_id = $1 AND org_id = $2 AND is_active = TRUE
    `, [userId, orgId]);

    const hasAccess = parseInt(result.rows[0]?.count || 0) > 0;

    // Also check if user's default org matches (from app_user table)
    if (!hasAccess) {
      const userResult = await pool.query(`
        SELECT org_id FROM app_user WHERE id = $1
      `, [userId]);

      const userOrgId = userResult.rows[0]?.org_id;
      return userOrgId === orgId;
    }

    return hasAccess;
  } catch (error) {
    logger.error('[TenantContext] Error verifying org access:', error);
    // If table doesn't exist, allow access (single-tenant mode)
    if (error.code === '42P01') {
      logger.info('[TenantContext] organization_members table not found - allowing access (single-tenant mode)');
      return true;
    }
    return false;
  }
}

/**
 * Helper: Get org_id by subdomain (maps to organizations.slug)
 * P1: Updated to use organizations table
 */
async function getOrgBySubdomain(subdomain) {
  try {
    const result = await pool.query(`
      SELECT id
      FROM organizations
      WHERE slug = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [subdomain]);

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('[TenantContext] Error getting org by subdomain:', error);
    // If organizations table doesn't exist, return null
    if (error.code === '42P01') {
      logger.debug('[TenantContext] organizations table not found');
      return null;
    }
    return null;
  }
}

/**
 * Helper: Get org_id by API key
 * P1: Updated to use api_keys table (if exists) or organizations.settings
 */
async function getOrgByApiKey(apiKey) {
  try {
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Try api_keys table first (if it exists)
    try {
      const result = await pool.query(`
        SELECT org_id
        FROM api_keys
        WHERE key_hash = $1 AND is_active = TRUE AND expires_at > NOW()
        LIMIT 1
      `, [hashedKey]);

      if (result.rows.length > 0) {
        return result.rows[0].org_id;
      }
    } catch (apiKeysError) {
      // api_keys table doesn't exist - try organizations.settings
      if (apiKeysError.code !== '42P01') {
        throw apiKeysError;
      }
    }

    // Fallback: Check organizations.settings for api_key_hash
    const result = await pool.query(`
      SELECT id
      FROM organizations
      WHERE settings->>'api_key_hash' = $1 AND deleted_at IS NULL
      LIMIT 1
    `, [hashedKey]);

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('[TenantContext] Error getting org by API key:', error);
    if (error.code === '42P01') {
      logger.debug('[TenantContext] organizations table not found');
      return null;
    }
    return null;
  }
}

/**
 * Helper: Get organization status
 * P1: Updated to use organizations table with UUID org_id
 */
async function getOrgStatus(orgId) {
  try {
    // Check organizations table
    const result = await pool.query(`
      SELECT id, slug, name, settings, deleted_at, billing_status
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `, [orgId]);

    const row = result.rows[0];

    if (!row) {
      logger.debug(`[TenantContext] Organization ${orgId} not found`);
      return null;
    }

    logger.debug(`[TenantContext] Found organization ${orgId}: ${row.name} (${row.slug})`);

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      deleted_at: row.deleted_at,
      billing_status: row.billing_status,
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {})
    };
  } catch (error) {
    // If organizations table doesn't exist (42P01), return default org
    if (error.code === '42P01') {
      logger.info('[TenantContext] organizations table not found - using default org');
      return {
        id: orgId,
        slug: 'default',
        name: 'Default Organization',
        deleted_at: null,
        billing_status: 'active',
        settings: {}
      };
    }
    logger.error('[TenantContext] Error getting org status:', error);
    return null;
  }
}

/**
 * Helper: Get default organization
 * P1: Returns the default org UUID
 */
async function getDefaultOrg() {
  try {
    const result = await pool.query(`
      SELECT id, slug, name, settings
      FROM organizations
      WHERE slug = 'default' AND deleted_at IS NULL
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return {
        id: result.rows[0].id,
        slug: result.rows[0].slug,
        name: result.rows[0].name,
        settings: typeof result.rows[0].settings === 'string' 
          ? JSON.parse(result.rows[0].settings) 
          : (result.rows[0].settings || {})
      };
    }

    // Return hardcoded default org UUID if not found
    return {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'default',
      name: 'Default Organization',
      settings: {}
    };
  } catch (error) {
    if (error.code === '42P01') {
      logger.debug('[TenantContext] organizations table not found');
    } else {
      logger.error('[TenantContext] Error getting default org:', error);
    }
    // Return hardcoded default
    return {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'default',
      name: 'Default Organization',
      settings: {}
    };
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
  const tenantColumn = alias ? `${alias}.org_id` : 'org_id';

  // Check if WHERE clause exists
  if (query.toUpperCase().includes('WHERE')) {
    return query.replace(/WHERE/i, `WHERE ${tenantColumn} = '${tenantId}' AND`);
  } else {
    // Add WHERE clause before ORDER BY, GROUP BY, or LIMIT
    const regex = /(ORDER BY|GROUP BY|LIMIT|$)/i;
    return query.replace(regex, `WHERE ${tenantColumn} = '${tenantId}' $1`);
  }
}

/**
 * Mask sensitive headers for logging
 */
function maskSensitiveHeaders(headers) {
  const masked = { ...headers };
  if (masked['x-api-key']) {
    masked['x-api-key'] = masked['x-api-key'].substring(0, 8) + '***';
  }
  if (masked['authorization']) {
    masked['authorization'] = 'Bearer ***';
  }
  return masked;
}

module.exports = {
  resolveTenant,
  requirePermission,
  requireAction,
  scopeQuery,
  verifyTenantAccess: verifyOrgAccess,  // Backward compatibility
  verifyOrgAccess,  // New function
  applyScopeToQuery
};
