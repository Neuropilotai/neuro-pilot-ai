/**
 * Tenant Context Middleware
 * Version: v2.5.0-P1-Hardening
 *
 * P1 Hardening Updates:
 * - Priority order: JWT org_id → API key → subdomain → X-Org-Id header
 * - TENANT_FAIL_OPEN_FOR_OWNER flag for owner device fallback
 * - Structured debug logs with correlation ID
 * - Better error diagnostics
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { logger } = require('../config/logger');
const rbacEngine = require('../src/security/rbac');
const metricsExporter = require('../utils/metricsExporter');

/**
 * Extract tenant ID from request - P1 Hardening Priority Order:
 * 1. JWT token (org_id claim)
 * 2. API key mapping (X-Api-Key header)
 * 3. Subdomain parsing (tenant.neuropilot.dev)
 * 4. X-Org-Id header (explicit tenant override)
 * 5. Fail-open for owner (if TENANT_FAIL_OPEN_FOR_OWNER=true)
 */
async function resolveTenant(req, res, next) {
  const ctx = {
    cid: req.headers['x-correlation-id'] || crypto.randomUUID(),
    path: req.path,
    method: req.method,
    ip: req.ip
  };

  try {
    let tenantId = null;
    let source = null;

    logger.debug({ ...ctx, step: 'start' }, '[TenantResolver] Starting tenant resolution');

    // PRIORITY 1: JWT org_id claim
    const orgFromJwt = req.user?.org_id || req.user?.tenant_id || req.user?.tenantId;
    if (orgFromJwt) {
      tenantId = orgFromJwt;
      source = 'jwt';
      logger.debug({ ...ctx, tenantId, source }, '[TenantResolver] Resolved from JWT');
    }

    // PRIORITY 2: API key lookup
    if (!tenantId && req.headers['x-api-key']) {
      const apiKey = req.headers['x-api-key'];
      const orgFromKey = await getTenantByApiKey(apiKey);
      if (orgFromKey) {
        tenantId = orgFromKey;
        source = 'api_key';
        logger.debug({ ...ctx, tenantId, source }, '[TenantResolver] Resolved from API key');
      } else {
        logger.warn({ ...ctx, apiKeyPrefix: apiKey.substring(0, 8) }, '[TenantResolver] API key not found');
      }
    }

    // PRIORITY 3: Subdomain parsing
    if (!tenantId && req.headers.host) {
      const orgFromSub = parseOrgFromSubdomain(req.headers.host);
      if (orgFromSub) {
        tenantId = orgFromSub;
        source = 'subdomain';
        logger.debug({ ...ctx, tenantId, source, hostname: req.headers.host }, '[TenantResolver] Resolved from subdomain');
      }
    }

    // PRIORITY 4: X-Org-Id header
    if (!tenantId && req.headers['x-org-id']) {
      const orgFromHdr = req.headers['x-org-id'];
      // Verify user has access to this org (if authenticated)
      if (req.user && req.user.userId) {
        const hasAccess = await verifyTenantAccess(req.user.userId, orgFromHdr);
        if (hasAccess) {
          tenantId = orgFromHdr;
          source = 'header';
          logger.debug({ ...ctx, tenantId, source }, '[TenantResolver] Resolved from X-Org-Id header');
        } else {
          logger.warn({ ...ctx, userId: req.user.userId, requestedOrg: orgFromHdr }, '[TenantResolver] User denied access to org in header');
          return res.status(403).json({
            error: 'Access denied to specified tenant',
            code: 'TENANT_ACCESS_DENIED',
            correlationId: ctx.cid
          });
        }
      } else {
        tenantId = orgFromHdr;
        source = 'header_unauthenticated';
        logger.debug({ ...ctx, tenantId, source }, '[TenantResolver] Resolved from X-Org-Id (unauthenticated)');
      }
    }

    // PRIORITY 5: Fail-open for owner device (fallback)
    if (!tenantId) {
      const failOpenEnabled = process.env.TENANT_FAIL_OPEN_FOR_OWNER === 'true';
      const isOwner = req.user?.role === 'owner' || req.user?.role === 'OWNER';
      const isDeviceBound = req.user?.device_bound === true;
      const ownerOrgId = req.user?.owner_org_id || req.user?.org_id;

      if (failOpenEnabled && isOwner && isDeviceBound && ownerOrgId) {
        tenantId = ownerOrgId;
        source = 'owner_failopen';
        logger.warn({ ...ctx, tenantId, source, userId: req.user.userId }, '[TenantResolver] FAIL-OPEN: Owner device fallback');
      }
    }

    // Final check: no tenant resolved
    if (!tenantId) {
      logger.error({ ...ctx, userId: req.user?.userId, headers: maskSensitiveHeaders(req.headers) }, '[TenantResolver] No org_id resolved');
      return res.status(400).json({
        error: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
        correlationId: ctx.cid,
        hint: 'Ensure JWT contains org_id claim, or provide X-Org-Id header, or use valid API key'
      });
    }

    // Verify tenant exists and is active
    const tenantStatus = await getTenantStatus(tenantId);
    if (!tenantStatus) {
      logger.warn({ ...ctx, tenantId }, '[TenantResolver] Tenant not found in database');
      return res.status(404).json({
        error: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
        correlationId: ctx.cid
      });
    }

    if (tenantStatus.status !== 'active') {
      logger.warn({ ...ctx, tenantId, status: tenantStatus.status }, '[TenantResolver] Tenant inactive');
      return res.status(403).json({
        error: `Tenant is ${tenantStatus.status}`,
        code: 'TENANT_INACTIVE',
        correlationId: ctx.cid
      });
    }

    // Attach tenant context to request
    req.tenant = {
      tenantId,
      name: tenantStatus.name,
      source,
      settings: tenantStatus.settings
    };

    // Backward compatibility: also set req.org_id
    req.org_id = tenantId;

    // Record metric
    try {
      metricsExporter.recordTenantRequest(tenantId);
    } catch (metricError) {
      // Non-fatal - log and continue
      logger.debug({ ...ctx, error: metricError.message }, '[TenantResolver] Metric recording failed');
    }

    logger.info({ ...ctx, tenantId, source, userId: req.user?.userId || 'anonymous' }, '[TenantResolver] Resolved successfully');

    next();
  } catch (error) {
    logger.error({ ...ctx, error: error.message, stack: error.stack }, '[TenantResolver] Tenant resolution error');
    res.status(500).json({
      error: 'Tenant resolution error',
      code: 'TENANT_RESOLUTION_ERROR',
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
        logger.warn({ ...ctx }, '[TenantResolver] Permission check failed: no user');
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          correlationId: ctx.cid
        });
      }

      if (!req.tenant || !req.tenant.tenantId) {
        logger.warn({ ...ctx, userId }, '[TenantResolver] Permission check failed: no tenant');
        return res.status(400).json({
          error: 'Tenant context required',
          code: 'TENANT_REQUIRED',
          correlationId: ctx.cid
        });
      }

      // Check if user has the permission in their JWT claims
      if (req.user.permissions && req.user.permissions.includes(permission)) {
        logger.debug({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantResolver] Permission granted (JWT)');
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
          logger.debug({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantResolver] Permission granted (RBAC)');
          next();
          return;
        }
      } catch (rbacError) {
        // If RBAC engine fails, log but continue with JWT-based check
        logger.warn({ ...ctx, error: rbacError.message }, '[TenantResolver] RBAC engine error, using JWT permissions');
        // If JWT permissions check passed, we already returned
        // If we're here, user doesn't have permission
      }

      logger.warn({ ...ctx, userId, tenantId: req.tenant.tenantId }, '[TenantResolver] Permission denied');
      return res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: permission,
        correlationId: ctx.cid
      });

    } catch (error) {
      logger.error({ ...ctx, error: error.message }, '[TenantResolver] Permission check error');
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
 * Helper: Verify user has access to tenant
 */
async function verifyTenantAccess(userId, tenantId) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM organization_members
      WHERE user_id = $1 AND org_id = $2
    `, [userId, tenantId]);

    const hasAccess = parseInt(result.rows[0]?.count || 0) > 0;

    // Also check if user's default org matches (from app_user table)
    if (!hasAccess) {
      const userResult = await pool.query(`
        SELECT org_id FROM app_user WHERE id = $1
      `, [userId]);

      const userOrgId = userResult.rows[0]?.org_id;
      return userOrgId === tenantId;
    }

    return hasAccess;
  } catch (error) {
    logger.error('[TenantResolver] Error verifying tenant access:', error);
    // If table doesn't exist, allow access (single-tenant mode)
    if (error.code === '42P01') {
      logger.info('[TenantResolver] organization_members table not found - allowing access (single-tenant mode)');
      return true;
    }
    return false;
  }
}

/**
 * Helper: Parse org_id from subdomain
 * Examples:
 *   - camp-alpha.neuropilot.dev → camp-alpha
 *   - api.neuropilot.dev → null (reserved)
 *   - neuropilot.dev → null (no subdomain)
 */
function parseOrgFromSubdomain(hostname) {
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

  // Return subdomain as org_id (could also do DB lookup here)
  return subdomain;
}

/**
 * Helper: Get tenant by API key
 */
async function getTenantByApiKey(apiKey) {
  try {
    // Hash the API key for lookup
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Check api_keys table (assumes table exists from migration 027)
    const result = await pool.query(`
      SELECT org_id
      FROM api_keys
      WHERE key_hash = $1 AND status = 'active'
      LIMIT 1
    `, [hashedKey]);

    if (result.rows.length > 0) {
      return result.rows[0].org_id;
    }

    // Fallback: check tenants table settings
    const tenantResult = await pool.query(`
      SELECT org_id
      FROM organizations
      WHERE settings->>'api_key_hash' = $1 AND status = 'active'
      LIMIT 1
    `, [hashedKey]);

    return tenantResult.rows[0]?.org_id || null;
  } catch (error) {
    logger.error('[TenantResolver] Error getting tenant by API key:', error);
    // Table not found - single-tenant mode
    if (error.code === '42P01') {
      return null;
    }
    return null;
  }
}

/**
 * Helper: Get tenant status
 */
async function getTenantStatus(tenantId) {
  try {
    // Check organizations table
    const result = await pool.query(`
      SELECT org_id, name, status, settings
      FROM organizations
      WHERE org_id = $1
      LIMIT 1
    `, [tenantId]);

    const row = result.rows[0];

    if (!row) {
      // For single-tenant mode or when organizations table doesn't exist,
      // return a default active tenant
      logger.debug(`[TenantResolver] Org ${tenantId} not found in DB - using default`);
      return {
        tenantId: tenantId,
        name: 'Default Organization',
        status: 'active',
        settings: {}
      };
    }

    logger.debug(`[TenantResolver] Found org ${tenantId}: ${row.name} (${row.status})`);

    return {
      tenantId: row.org_id,
      name: row.name,
      status: row.status,
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {})
    };
  } catch (error) {
    // If organizations table doesn't exist (42P01), allow access in single-tenant mode
    if (error.code === '42P01') {
      logger.info('[TenantResolver] organizations table not found - using single-tenant mode');
      return {
        tenantId: tenantId,
        name: 'Default Organization',
        status: 'active',
        settings: {}
      };
    }
    logger.error('[TenantResolver] Error getting tenant status:', error);
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
  verifyTenantAccess,
  applyScopeToQuery
};
