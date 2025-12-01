/**
 * Security Routes
 * NeuroPilot AI Enterprise Phase 2
 *
 * SOC-2 compliant security features:
 * - Audit log access
 * - Session management
 * - API key management
 * - Security events
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticateToken, requireRole, requirePermission, ROLES } = require('../middleware/auth');
const { extractTenant } = require('../middleware/tenant');
const { logger } = require('../config/logger');

// Lazy-load pool
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = require('../db/postgres').pool;
  }
  return pool;
};

// ============================================
// AUDIT LOGS
// ============================================

/**
 * GET /api/security/audit-logs
 * Query audit logs with filters
 */
router.get('/audit-logs',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ logs: [], total: 0 });
      }

      const {
        action,
        resourceType,
        userId,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = req.query;

      const offset = (page - 1) * limit;
      const params = [req.org?.id || req.user.org_id];
      let whereClause = 'WHERE org_id = $1';
      let paramIndex = 2;

      if (action) {
        whereClause += ` AND action = $${paramIndex++}`;
        params.push(action);
      }

      if (resourceType) {
        whereClause += ` AND resource_type = $${paramIndex++}`;
        params.push(resourceType);
      }

      if (userId) {
        whereClause += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      if (startDate) {
        whereClause += ` AND created_at >= $${paramIndex++}`;
        params.push(new Date(startDate));
      }

      if (endDate) {
        whereClause += ` AND created_at <= $${paramIndex++}`;
        params.push(new Date(endDate));
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
        params
      );

      // Get logs
      params.push(limit, offset);
      const logsResult = await pool.query(
        `SELECT
          id, user_id, user_email, action, resource_type, resource_id,
          resource_name, ip_address, success, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      res.json({
        logs: logsResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
    } catch (error) {
      logger.error('Get audit logs error:', error);
      res.status(500).json({ error: 'Failed to get audit logs' });
    }
  }
);

/**
 * GET /api/security/audit-logs/:id
 * Get single audit log with full details
 */
router.get('/audit-logs/:id',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(404).json({ error: 'Log not found' });
      }

      const result = await pool.query(
        `SELECT * FROM audit_logs WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.org?.id || req.user.org_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Log not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Get audit log error:', error);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  }
);

// ============================================
// SESSIONS
// ============================================

/**
 * GET /api/security/sessions
 * Get active sessions for current user
 */
router.get('/sessions',
  authenticateToken,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ sessions: [] });
      }

      const result = await pool.query(
        `SELECT
          id, device_type, browser, os, ip_address,
          geo_country, geo_city, last_activity_at, created_at,
          CASE WHEN id = $2 THEN TRUE ELSE FALSE END as is_current
        FROM user_sessions
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY last_activity_at DESC`,
        [req.user.id, req.session?.id]
      );

      res.json({ sessions: result.rows });
    } catch (error) {
      logger.error('Get sessions error:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  }
);

/**
 * DELETE /api/security/sessions/:id
 * Revoke a specific session
 */
router.delete('/sessions/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Only allow revoking own sessions (unless admin)
      const whereClause = req.user.role === 'OWNER' || req.user.role === 'ADMIN'
        ? 'WHERE id = $1 AND org_id = $2'
        : 'WHERE id = $1 AND user_id = $2';

      const result = await pool.query(
        `UPDATE user_sessions
         SET is_active = FALSE, revoked_at = NOW(), revoked_by = $3, revoke_reason = 'manual'
         ${whereClause}
         RETURNING id`,
        [req.params.id, req.user.role === 'OWNER' ? req.org?.id : req.user.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Log security event
      await pool.query(
        `SELECT log_security_event($1, 'session_revoked', 'info', 'Session revoked', $2, $3::inet, $4)`,
        [req.org?.id, req.user.id, req.ip, { session_id: req.params.id }]
      );

      res.json({ success: true });
    } catch (error) {
      logger.error('Revoke session error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  }
);

/**
 * POST /api/security/sessions/revoke-all
 * Revoke all sessions except current
 */
router.post('/sessions/revoke-all',
  authenticateToken,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ count: 0 });
      }

      const result = await pool.query(
        `UPDATE user_sessions
         SET is_active = FALSE, revoked_at = NOW(), revoked_by = $1, revoke_reason = 'revoke_all'
         WHERE user_id = $1 AND is_active = TRUE AND id != $2
         RETURNING id`,
        [req.user.id, req.session?.id]
      );

      res.json({ count: result.rows.length });
    } catch (error) {
      logger.error('Revoke all sessions error:', error);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  }
);

// ============================================
// API KEYS
// ============================================

/**
 * GET /api/security/api-keys
 * List API keys for organization
 */
router.get('/api-keys',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ keys: [] });
      }

      const result = await pool.query(
        `SELECT
          id, name, description, key_prefix, scopes,
          last_used_at, total_requests, is_active, expires_at, created_at
        FROM api_keys
        WHERE org_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC`,
        [req.org?.id || req.user.org_id]
      );

      res.json({ keys: result.rows });
    } catch (error) {
      logger.error('Get API keys error:', error);
      res.status(500).json({ error: 'Failed to get API keys' });
    }
  }
);

/**
 * POST /api/security/api-keys
 * Create new API key
 */
router.post('/api-keys',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const { name, description, scopes = [], expiresInDays } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      // Generate API key
      const keyBytes = crypto.randomBytes(32);
      const apiKey = `np_live_${keyBytes.toString('hex')}`;
      const keyPrefix = apiKey.substring(0, 16);
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const result = await pool.query(
        `INSERT INTO api_keys (org_id, created_by, name, description, key_prefix, key_hash, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, key_prefix, scopes, expires_at, created_at`,
        [
          req.org?.id || req.user.org_id,
          req.user.id,
          name,
          description,
          keyPrefix,
          keyHash,
          scopes,
          expiresAt
        ]
      );

      // Log security event
      await pool.query(
        `SELECT log_security_event($1, 'api_key_created', 'info', 'API key created', $2, $3::inet, $4)`,
        [req.org?.id, req.user.id, req.ip, { key_name: name, key_prefix: keyPrefix }]
      );

      res.json({
        key: {
          ...result.rows[0],
          // Only return full key once at creation!
          apiKey
        },
        warning: 'Store this API key securely. It will not be shown again.'
      });
    } catch (error) {
      logger.error('Create API key error:', error);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  }
);

/**
 * DELETE /api/security/api-keys/:id
 * Revoke API key
 */
router.delete('/api-keys/:id',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(404).json({ error: 'Key not found' });
      }

      const result = await pool.query(
        `UPDATE api_keys
         SET is_active = FALSE, revoked_at = NOW(), revoked_by = $3, revoke_reason = $4
         WHERE id = $1 AND org_id = $2
         RETURNING id, name, key_prefix`,
        [req.params.id, req.org?.id || req.user.org_id, req.user.id, req.body.reason || 'manual']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Key not found' });
      }

      // Log security event
      await pool.query(
        `SELECT log_security_event($1, 'api_key_revoked', 'medium', 'API key revoked', $2, $3::inet, $4)`,
        [req.org?.id, req.user.id, req.ip, { key_name: result.rows[0].name }]
      );

      res.json({ success: true });
    } catch (error) {
      logger.error('Revoke API key error:', error);
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  }
);

/**
 * POST /api/security/api-keys/:id/rotate
 * Rotate API key (create new, grace period for old)
 */
router.post('/api-keys/:id/rotate',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(404).json({ error: 'Key not found' });
      }

      const { gracePeriodHours = 24 } = req.body;

      // Get existing key
      const existingResult = await pool.query(
        `SELECT id, name, description, scopes, expires_at
         FROM api_keys WHERE id = $1 AND org_id = $2 AND is_active = TRUE`,
        [req.params.id, req.org?.id || req.user.org_id]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Key not found' });
      }

      const existing = existingResult.rows[0];

      // Generate new API key
      const keyBytes = crypto.randomBytes(32);
      const apiKey = `np_live_${keyBytes.toString('hex')}`;
      const keyPrefix = apiKey.substring(0, 16);
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Create new key
      const newResult = await pool.query(
        `INSERT INTO api_keys (org_id, created_by, name, description, key_prefix, key_hash, scopes, expires_at, rotated_from_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, key_prefix, scopes, expires_at, created_at`,
        [
          req.org?.id || req.user.org_id,
          req.user.id,
          existing.name,
          existing.description,
          keyPrefix,
          keyHash,
          existing.scopes,
          existing.expires_at,
          existing.id
        ]
      );

      // Set grace period on old key
      await pool.query(
        `UPDATE api_keys
         SET rotated_at = NOW(),
             grace_period_until = NOW() + INTERVAL '${gracePeriodHours} hours'
         WHERE id = $1`,
        [req.params.id]
      );

      // Log security event
      await pool.query(
        `SELECT log_security_event($1, 'api_key_rotated', 'medium', 'API key rotated', $2, $3::inet, $4)`,
        [req.org?.id, req.user.id, req.ip, { key_name: existing.name, grace_period_hours: gracePeriodHours }]
      );

      res.json({
        key: {
          ...newResult.rows[0],
          apiKey
        },
        gracePeriodEnds: new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000),
        warning: 'Store this API key securely. It will not be shown again.'
      });
    } catch (error) {
      logger.error('Rotate API key error:', error);
      res.status(500).json({ error: 'Failed to rotate API key' });
    }
  }
);

// ============================================
// SECURITY EVENTS
// ============================================

/**
 * GET /api/security/events
 * Get security events
 */
router.get('/events',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.json({ events: [], total: 0 });
      }

      const { status, severity, eventType, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;
      const params = [req.org?.id || req.user.org_id];
      let whereClause = 'WHERE org_id = $1';
      let paramIndex = 2;

      if (status) {
        whereClause += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (severity) {
        whereClause += ` AND severity = $${paramIndex++}`;
        params.push(severity);
      }

      if (eventType) {
        whereClause += ` AND event_type = $${paramIndex++}`;
        params.push(eventType);
      }

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM security_events ${whereClause}`,
        params
      );

      params.push(limit, offset);
      const eventsResult = await pool.query(
        `SELECT
          id, event_type, severity, title, user_email, ip_address,
          status, created_at
        FROM security_events
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      res.json({
        events: eventsResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
    } catch (error) {
      logger.error('Get security events error:', error);
      res.status(500).json({ error: 'Failed to get security events' });
    }
  }
);

/**
 * PATCH /api/security/events/:id
 * Update security event status
 */
router.patch('/events/:id',
  authenticateToken,
  requireRole([ROLES.OWNER, ROLES.ADMIN]),
  extractTenant,
  async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const { status, resolutionNotes } = req.body;
      const validStatuses = ['new', 'investigating', 'resolved', 'false_positive'];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const updates = ['status = $3', 'updated_at = NOW()'];
      const params = [req.params.id, req.org?.id || req.user.org_id, status];
      let paramIndex = 4;

      if (status === 'resolved' || status === 'false_positive') {
        updates.push(`resolved_at = NOW()`);
        updates.push(`resolved_by = $${paramIndex++}`);
        params.push(req.user.id);
      }

      if (resolutionNotes) {
        updates.push(`resolution_notes = $${paramIndex++}`);
        params.push(resolutionNotes);
      }

      const result = await pool.query(
        `UPDATE security_events
         SET ${updates.join(', ')}
         WHERE id = $1 AND org_id = $2
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Update security event error:', error);
      res.status(500).json({ error: 'Failed to update security event' });
    }
  }
);

module.exports = router;
