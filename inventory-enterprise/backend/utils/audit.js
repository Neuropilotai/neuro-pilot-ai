/**
 * Audit Logging Utility
 *
 * Comprehensive audit trail for all mutating operations
 * Tracks who did what, when, and what changed
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const { logger } = require('../config/logger');
const crypto = require('crypto');

// ============================================================================
// AUDIT LOG WRITER
// ============================================================================

/**
 * Write audit log entry
 *
 * @param {Object} db - Database instance
 * @param {Object} req - Express request object
 * @param {Object} details - Audit details
 * @param {string} details.action - Action performed (CREATE, UPDATE, DELETE, IMPORT, EXPORT, APPROVE, ADJUST, MAP)
 * @param {string} details.entity - Entity type (forecast, reconcile, document, mapping, vendor_rule)
 * @param {string} details.entity_id - Entity identifier
 * @param {Object} [details.before] - State before change (optional)
 * @param {Object} [details.after] - State after change (optional)
 * @param {boolean} [details.success=true] - Whether operation succeeded
 * @param {string} [details.error_message] - Error message if failed
 * @returns {Promise<number>} Audit log ID
 */
async function audit(db, req, details) {
  try {
    const {
      action,
      entity,
      entity_id,
      before = null,
      after = null,
      success = true,
      error_message = null
    } = details;

    // Validate required fields
    if (!action || !entity || !entity_id) {
      logger.warn('Audit: Missing required fields', { action, entity, entity_id });
      return null;
    }

    // Extract user context from request
    const userEmail = req.user?.email || 'anonymous';
    const userRole = req.user?.roles ? (Array.isArray(req.user.roles) ? req.user.roles[0] : req.user.roles) : null;
    const tenantId = req.user?.tenant_id || process.env.TENANT_DEFAULT || 'neuropilot';
    const locationId = req.user?.location_id || null;

    // Extract request metadata
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;
    const requestId = req.id || req.headers['x-request-id'] || generateRequestId();

    // Serialize before/after states
    const beforeJson = before ? JSON.stringify(before) : null;
    const afterJson = after ? JSON.stringify(after) : null;

    // Insert audit log entry
    const result = await db.run(`
      INSERT INTO ai_audit_log (
        timestamp,
        user_email,
        user_role,
        tenant_id,
        location_id,
        action,
        entity,
        entity_id,
        before_json,
        after_json,
        ip_address,
        user_agent,
        request_id,
        success,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      new Date().toISOString(),
      userEmail,
      userRole,
      tenantId,
      locationId,
      action,
      entity,
      entity_id,
      beforeJson,
      afterJson,
      ipAddress,
      userAgent,
      requestId,
      success ? 1 : 0,
      error_message
    ]);

    logger.info('Audit log entry created', {
      audit_id: result.lastID,
      user: userEmail,
      action,
      entity,
      entity_id,
      success
    });

    return result.lastID;

  } catch (error) {
    // Never let audit failures break the main operation
    logger.error('Audit: Failed to write audit log', {
      error: error.message,
      stack: error.stack,
      details
    });
    return null;
  }
}

/**
 * Create audit middleware that attaches audit function to req
 *
 * Usage:
 *   app.use(auditMiddleware(db));
 *
 *   // Then in routes:
 *   await req.audit({ action: 'CREATE', entity: 'forecast', entity_id: forecast.id, after: forecast });
 *
 * @param {Object} db - Database instance
 * @returns {Function} Express middleware
 */
function auditMiddleware(db) {
  return (req, res, next) => {
    // Attach audit function to request
    req.audit = async (details) => {
      return audit(db, req, details);
    };

    // Also attach as req.auditLog for compatibility
    req.auditLog = req.audit;

    next();
  };
}

// ============================================================================
// AUDIT HELPERS
// ============================================================================

/**
 * Compare two objects and return diff summary
 *
 * @param {Object} before - Before state
 * @param {Object} after - After state
 * @returns {Object} { changed: [...fields], added: [...fields], removed: [...fields] }
 */
function compareObjects(before, after) {
  const diff = {
    changed: [],
    added: [],
    removed: []
  };

  if (!before || !after) {
    return diff;
  }

  // Find changed and removed fields
  for (const key in before) {
    if (!(key in after)) {
      diff.removed.push(key);
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff.changed.push(key);
    }
  }

  // Find added fields
  for (const key in after) {
    if (!(key in before)) {
      diff.added.push(key);
    }
  }

  return diff;
}

/**
 * Generate unique request ID
 * @returns {string}
 */
function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get audit trail for entity
 *
 * @param {Object} db - Database instance
 * @param {string} entity - Entity type
 * @param {string} entity_id - Entity ID
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Max records to return
 * @param {string} [options.tenant_id] - Filter by tenant
 * @returns {Promise<Array>} Audit log entries
 */
async function getAuditTrail(db, entity, entity_id, options = {}) {
  try {
    const { limit = 50, tenant_id } = options;

    let query = `
      SELECT
        id,
        timestamp,
        user_email,
        user_role,
        tenant_id,
        action,
        entity,
        entity_id,
        before_json,
        after_json,
        success,
        error_message
      FROM ai_audit_log
      WHERE entity = ? AND entity_id = ?
    `;

    const params = [entity, entity_id];

    if (tenant_id) {
      query += ' AND tenant_id = ?';
      params.push(tenant_id);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const entries = await db.all(query, params);

    // Parse JSON fields
    return entries.map(entry => ({
      ...entry,
      before: entry.before_json ? JSON.parse(entry.before_json) : null,
      after: entry.after_json ? JSON.parse(entry.after_json) : null
    }));

  } catch (error) {
    logger.error('Audit: Failed to get audit trail', {
      error: error.message,
      entity,
      entity_id
    });
    return [];
  }
}

/**
 * Get recent audit activity for user
 *
 * @param {Object} db - Database instance
 * @param {string} user_email - User email
 * @param {Object} options - Query options
 * @param {number} [options.limit=100] - Max records
 * @param {number} [options.days=7] - Days to look back
 * @returns {Promise<Array>} Recent audit entries
 */
async function getUserActivity(db, user_email, options = {}) {
  try {
    const { limit = 100, days = 7 } = options;

    const entries = await db.all(`
      SELECT
        id,
        timestamp,
        tenant_id,
        action,
        entity,
        entity_id,
        success
      FROM ai_audit_log
      WHERE user_email = ?
        AND timestamp >= datetime('now', '-${days} days')
      ORDER BY timestamp DESC
      LIMIT ?
    `, [user_email, limit]);

    return entries;

  } catch (error) {
    logger.error('Audit: Failed to get user activity', {
      error: error.message,
      user_email
    });
    return [];
  }
}

/**
 * Get audit statistics for tenant
 *
 * @param {Object} db - Database instance
 * @param {string} tenant_id - Tenant ID
 * @param {number} days - Days to analyze
 * @returns {Promise<Object>} Statistics
 */
async function getAuditStats(db, tenant_id, days = 30) {
  try {
    const stats = await db.get(`
      SELECT
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_email) as unique_users,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_actions,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_actions,
        MAX(timestamp) as last_action_at
      FROM ai_audit_log
      WHERE tenant_id = ?
        AND timestamp >= datetime('now', '-${days} days')
    `, [tenant_id]);

    const actionsByType = await db.all(`
      SELECT action, COUNT(*) as count
      FROM ai_audit_log
      WHERE tenant_id = ?
        AND timestamp >= datetime('now', '-${days} days')
      GROUP BY action
      ORDER BY count DESC
    `, [tenant_id]);

    return {
      ...stats,
      actions_by_type: actionsByType
    };

  } catch (error) {
    logger.error('Audit: Failed to get audit stats', {
      error: error.message,
      tenant_id
    });
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main audit function
  audit,

  // Middleware
  auditMiddleware,

  // Helpers
  compareObjects,
  generateRequestId,

  // Query functions
  getAuditTrail,
  getUserActivity,
  getAuditStats
};
