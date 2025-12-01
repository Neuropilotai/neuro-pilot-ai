/**
 * Multi-Tenant Middleware
 * NeuroPilot AI Enterprise Phase 2
 *
 * Provides tenant isolation via org_id:
 * - Extracts org_id from JWT token
 * - Sets PostgreSQL session variable for RLS
 * - Enforces plan limits
 */

const { Pool } = require('pg');
const { logger } = require('../config/logger');

// Lazy-load pool to avoid circular dependency
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = require('../db/postgres').pool;
  }
  return pool;
};

/**
 * Extract and validate tenant (org) from request
 * Sets req.org with organization details
 */
const extractTenant = async (req, res, next) => {
  try {
    // org_id comes from JWT token (set by authenticateToken middleware)
    const orgId = req.user?.org_id;

    if (!orgId) {
      // Allow requests without org_id for system-level endpoints
      req.org = null;
      return next();
    }

    // Cache org details in request
    req.org = {
      id: orgId,
      // Additional org details loaded on demand
    };

    next();
  } catch (error) {
    logger.error('Tenant extraction error:', error);
    next(error);
  }
};

/**
 * Set PostgreSQL session variable for Row-Level Security
 * Must be called before any database queries in the request
 */
const setTenantContext = async (req, res, next) => {
  if (!req.org?.id) {
    return next();
  }

  try {
    const pool = getPool();
    if (pool) {
      // Set session variable for RLS policies
      await pool.query(`SET app.current_org_id = $1`, [req.org.id]);
    }
    next();
  } catch (error) {
    logger.error('Failed to set tenant context:', error);
    // Don't fail the request, RLS will still filter
    next();
  }
};

/**
 * Load full organization details
 * Use when org details are needed (billing, limits, etc.)
 */
const loadOrgDetails = async (req, res, next) => {
  if (!req.org?.id) {
    return next();
  }

  try {
    const pool = getPool();
    if (!pool) {
      return next();
    }

    const result = await pool.query(
      `SELECT
        o.id,
        o.slug,
        o.name,
        o.billing_plan,
        o.billing_status,
        o.max_users,
        o.max_items,
        o.max_locations,
        o.max_api_calls_per_day,
        o.features,
        o.timezone,
        o.currency,
        o.trial_ends_at
      FROM organizations o
      WHERE o.id = $1
        AND o.deleted_at IS NULL`,
      [req.org.id]
    );

    if (result.rows.length > 0) {
      req.org = { ...req.org, ...result.rows[0] };
    }

    next();
  } catch (error) {
    logger.error('Failed to load org details:', error);
    next();
  }
};

/**
 * Enforce plan limits middleware factory
 * @param {string} limitType - Type of limit to check (users, items, locations, api_calls)
 */
const enforcePlanLimit = (limitType) => {
  return async (req, res, next) => {
    if (!req.org?.id) {
      return next();
    }

    try {
      const pool = getPool();
      if (!pool) {
        return next();
      }

      // Load org if not already loaded
      if (!req.org.billing_plan) {
        const orgResult = await pool.query(
          `SELECT billing_plan, max_users, max_items, max_locations, max_api_calls_per_day
           FROM organizations WHERE id = $1`,
          [req.org.id]
        );

        if (orgResult.rows.length > 0) {
          Object.assign(req.org, orgResult.rows[0]);
        }
      }

      // Get current usage
      let currentCount = 0;
      let maxLimit = 0;

      switch (limitType) {
        case 'users':
          const userResult = await pool.query(
            `SELECT COUNT(*) FROM organization_members
             WHERE org_id = $1 AND is_active = TRUE`,
            [req.org.id]
          );
          currentCount = parseInt(userResult.rows[0].count, 10);
          maxLimit = req.org.max_users || 3;
          break;

        case 'items':
          const itemResult = await pool.query(
            `SELECT COUNT(*) FROM inventory_items
             WHERE org_id = $1 AND is_active = 1`,
            [req.org.id]
          );
          currentCount = parseInt(itemResult.rows[0].count, 10);
          maxLimit = req.org.max_items || 500;
          break;

        case 'locations':
          const locationResult = await pool.query(
            `SELECT COUNT(*) FROM sites
             WHERE org_id = $1 AND is_active = TRUE`,
            [req.org.id]
          );
          currentCount = parseInt(locationResult.rows[0].count, 10);
          maxLimit = req.org.max_locations || 5;
          break;

        case 'api_calls':
          const apiResult = await pool.query(
            `SELECT COALESCE(SUM(quantity), 0) as count
             FROM billing_usage_records
             WHERE org_id = $1
               AND metric_name = 'api_calls'
               AND period_start >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`,
            [req.org.id]
          );
          currentCount = parseInt(apiResult.rows[0].count, 10);
          maxLimit = req.org.max_api_calls_per_day || 1000;
          break;

        default:
          return next();
      }

      // Check if limit exceeded
      if (currentCount >= maxLimit) {
        logger.warn('Plan limit exceeded', {
          orgId: req.org.id,
          limitType,
          currentCount,
          maxLimit,
          plan: req.org.billing_plan
        });

        return res.status(402).json({
          error: 'Plan limit exceeded',
          code: 'PLAN_LIMIT_EXCEEDED',
          limitType,
          currentCount,
          maxLimit,
          plan: req.org.billing_plan,
          message: `You have reached the maximum ${limitType} for your ${req.org.billing_plan} plan. Please upgrade to continue.`
        });
      }

      next();
    } catch (error) {
      logger.error('Plan limit check error:', error);
      // Don't block on error, just log
      next();
    }
  };
};

/**
 * Check if organization has a specific feature enabled
 * @param {string} featureName - Feature to check
 */
const requireFeature = (featureName) => {
  return async (req, res, next) => {
    if (!req.org?.id) {
      return res.status(403).json({
        error: 'Organization required',
        code: 'ORG_REQUIRED'
      });
    }

    try {
      const pool = getPool();
      if (!pool) {
        return next();
      }

      // Check feature via SQL function
      const result = await pool.query(
        `SELECT org_has_feature($1, $2) as has_feature`,
        [req.org.id, featureName]
      );

      if (!result.rows[0]?.has_feature) {
        return res.status(403).json({
          error: 'Feature not available',
          code: 'FEATURE_NOT_AVAILABLE',
          feature: featureName,
          message: `The ${featureName} feature is not available on your current plan. Please upgrade to access this feature.`
        });
      }

      next();
    } catch (error) {
      logger.error('Feature check error:', error);
      // Allow on error - better UX than blocking
      next();
    }
  };
};

/**
 * Track API usage for billing
 */
const trackApiUsage = async (req, res, next) => {
  if (!req.org?.id) {
    return next();
  }

  // Track asynchronously - don't block request
  setImmediate(async () => {
    try {
      const pool = getPool();
      if (pool) {
        await pool.query(`SELECT record_api_usage($1, 1)`, [req.org.id]);
      }
    } catch (error) {
      logger.error('API usage tracking error:', error);
    }
  });

  next();
};

/**
 * Require specific org for cross-org access
 * Used for admin/super-admin routes
 */
const requireOrg = (req, res, next) => {
  if (!req.org?.id) {
    return res.status(400).json({
      error: 'Organization context required',
      code: 'ORG_REQUIRED'
    });
  }
  next();
};

module.exports = {
  extractTenant,
  setTenantContext,
  loadOrgDetails,
  enforcePlanLimit,
  requireFeature,
  trackApiUsage,
  requireOrg
};
