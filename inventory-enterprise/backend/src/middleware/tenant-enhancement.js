/**
 * Enhanced Tenant Resolution Middleware
 * 
 * Extends existing tenant middleware with additional resolution methods:
 * - X-Org-Id header support
 * - API key lookup
 * - Subdomain parsing
 * 
 * Integrates with existing middleware/tenant.js
 */

const { pool } = require('../../db');

/**
 * Extract subdomain from hostname
 */
function extractSubdomain(hostname) {
  if (!hostname) return null;
  const host = hostname.split(':')[0];
  const parts = host.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}

/**
 * Resolve organization by subdomain
 */
async function resolveOrgBySubdomain(subdomain) {
  const result = await pool.query(
    'SELECT id, name, slug, billing_status FROM organizations WHERE slug = $1 AND deleted_at IS NULL',
    [subdomain]
  );
  return result.rows[0] || null;
}

/**
 * Resolve organization by API key
 * Note: This assumes organizations table has an api_key column
 * If not, this will need to be added in a migration
 */
async function resolveOrgByApiKey(apiKey) {
  // Check if api_key column exists
  const columnCheck = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'api_key'
  `);
  
  if (columnCheck.rows.length === 0) {
    return null; // API key column doesn't exist yet
  }
  
  const result = await pool.query(
    'SELECT id, name, slug, billing_status FROM organizations WHERE api_key = $1 AND deleted_at IS NULL',
    [apiKey]
  );
  return result.rows[0] || null;
}

/**
 * Enhanced tenant resolution middleware
 * Works alongside existing tenant middleware
 */
async function enhanceTenantResolution(req, res, next) {
  // Skip if org already resolved by existing middleware
  if (req.org || req.orgId) {
    return next();
  }

  // Skip for health checks
  const path = req.path || req.url || '';
  if (path.startsWith('/health') || path.startsWith('/ping') || path.startsWith('/metrics')) {
    return next();
  }

  try {
    let orgId = null;
    let org = null;

    // Priority 1: X-Org-Id header
    if (req.headers['x-org-id']) {
      orgId = req.headers['x-org-id'].trim();
      const result = await pool.query(
        'SELECT id, name, slug, billing_status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );
      org = result.rows[0] || null;
    }
    
    // Priority 2: Subdomain parsing (only if org not resolved yet)
    if (!org && (req.hostname || req.headers.host)) {
      const hostname = req.hostname || req.headers.host || '';
      const subdomain = extractSubdomain(hostname);
      if (subdomain) {
        org = await resolveOrgBySubdomain(subdomain);
        if (org) {
          orgId = org.id;
        }
      }
    }
    
    // Priority 3: API key lookup (only if org not resolved yet)
    if (!org && req.headers['x-api-key']) {
      const apiKey = req.headers['x-api-key'].trim();
      org = await resolveOrgByApiKey(apiKey);
      if (org) {
        orgId = org.id;
      }
    }
    
    // Priority 4: Default org from environment (only if org not resolved yet)
    if (!org && process.env.DEFAULT_ORG_ID) {
      orgId = process.env.DEFAULT_ORG_ID;
      const result = await pool.query(
        'SELECT id, name, slug, billing_status FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [orgId]
      );
      org = result.rows[0] || null;
    }

    if (org && orgId) {
      // Validate organization is active
      if (org.billing_status !== 'active' && org.billing_status !== 'trialing') {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Organization ${org.name} is not active`,
        });
      }

      // Attach to request
      req.orgId = orgId;
      req.org = org;
      return next();
    }

    // If no org resolved, continue (existing middleware may handle it)
    return next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resolve organization',
    });
  }
}

module.exports = {
  enhanceTenantResolution,
  extractSubdomain,
  resolveOrgBySubdomain,
  resolveOrgByApiKey,
};

