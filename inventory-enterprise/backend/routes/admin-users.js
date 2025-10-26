/**
 * Admin Users Routes
 *
 * User management endpoints (OWNER only):
 * - List users
 * - Invite new users
 * - Change user roles
 * - Revoke sessions
 * - Force device rebind
 * - Disable/enable users
 *
 * All operations are audited and require OWNER role.
 *
 * @version 15.5.0
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const { getDatabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../security/rbac');
const { auditAction } = require('../utils/audit');
const inviteService = require('../services/inviteService');

// ============================================================================
// MIDDLEWARE: All routes require OWNER role
// ============================================================================

router.use(authenticateToken);
router.use(requireRole('OWNER'));

// ============================================================================
// GET /api/admin/users - List all users
// ============================================================================

router.get('/users', async (req, res) => {
  try {
    const db = await getDatabase();

    // Get all users with their roles and last activity
    const users = await db.all(`
      SELECT
        ur.id,
        ur.email,
        ur.role,
        ur.tenant_id,
        ur.location_id,
        ur.active,
        ur.expires_at,
        ur.last_seen,
        ur.created_at,
        uc.disabled,
        uc.force_rebind,
        uc.sessions_revoked_at,
        uc.disabled_at,
        uc.disabled_by,
        uc.disabled_reason
      FROM user_roles ur
      LEFT JOIN user_controls uc ON ur.email = uc.email
      ORDER BY ur.created_at DESC
    `);

    // Get session counts per user (from active JWT tokens - simplified)
    // In production, this would query a sessions table or Redis
    const usersWithSessions = users.map(user => ({
      ...user,
      activeSessions: 0, // TODO: implement session tracking
      locations: user.location_id ? [user.location_id] : []
    }));

    res.json({
      success: true,
      users: usersWithSessions,
      total: usersWithSessions.length
    });

  } catch (error) {
    logger.error('Failed to list users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list users'
    });
  }
});

// ============================================================================
// POST /api/admin/users/invite - Create invite token
// ============================================================================

router.post('/users/invite', async (req, res) => {
  try {
    const { email, role, tenantId, locations, expiryDays } = req.body;

    // Validate required fields
    if (!email || !role || !tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, role, tenantId'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const db = await getDatabase();

    // Create invite
    const invite = await inviteService.createInvite(db, {
      email,
      role,
      tenantId,
      locations: locations || [],
      createdBy: req.user.email,
      expiryDays: expiryDays || 7
    });

    // Audit action
    await auditAction(req, {
      action: 'user_invite_created',
      entity: 'user',
      entityId: email,
      note: `Invited ${email} with role ${role}`,
      meta: {
        role,
        tenantId,
        locations,
        expiresAt: invite.expiresAt
      }
    });

    res.json({
      success: true,
      token: invite.token,
      emailBody: invite.emailBody,
      expiresAt: invite.expiresAt
    });

  } catch (error) {
    logger.error('Failed to create invite', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /api/admin/users/role - Change user role
// ============================================================================

router.post('/users/role', async (req, res) => {
  try {
    const { userId, email, role } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userId or email'
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        error: 'Role is required'
      });
    }

    // Validate role
    const validRoles = ['READONLY', 'OPS', 'FINANCE', 'OWNER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const db = await getDatabase();

    // Get current user details
    const whereClause = userId ? 'id = ?' : 'email = ?';
    const whereValue = userId || email;

    const currentUser = await db.get(
      `SELECT id, email, role FROM user_roles WHERE ${whereClause}`,
      [whereValue]
    );

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent changing own role
    if (currentUser.email === req.user.email) {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own role'
      });
    }

    // Update role
    await db.run(
      'UPDATE user_roles SET role = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [role, currentUser.id]
    );

    // Audit action
    await auditAction(req, {
      action: 'user_role_changed',
      entity: 'user',
      entityId: currentUser.email,
      before: { role: currentUser.role },
      after: { role },
      note: `Changed role from ${currentUser.role} to ${role}`
    });

    logger.info('User role changed', {
      userId: currentUser.id,
      email: currentUser.email,
      oldRole: currentUser.role,
      newRole: role,
      changedBy: req.user.email
    });

    res.json({
      success: true,
      message: 'Role updated successfully',
      user: {
        id: currentUser.id,
        email: currentUser.email,
        role
      }
    });

  } catch (error) {
    logger.error('Failed to change user role', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to change role'
    });
  }
});

// ============================================================================
// POST /api/admin/users/revoke-sessions - Revoke all user sessions
// ============================================================================

router.post('/users/revoke-sessions', async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userId or email'
      });
    }

    const db = await getDatabase();

    // Get user
    const whereClause = userId ? 'id = ?' : 'email = ?';
    const whereValue = userId || email;

    const user = await db.get(
      `SELECT id, email FROM user_roles WHERE ${whereClause}`,
      [whereValue]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user_controls to mark sessions as revoked
    await db.run(
      `INSERT INTO user_controls (user_id, email, sessions_revoked_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         sessions_revoked_at = datetime('now'),
         updated_at = datetime('now')`,
      [user.id, user.email]
    );

    // TODO: In production, also clear Redis session cache or JWT blacklist

    // Audit action
    await auditAction(req, {
      action: 'user_sessions_revoked',
      entity: 'user',
      entityId: user.email,
      note: 'All sessions revoked'
    });

    logger.info('User sessions revoked', {
      userId: user.id,
      email: user.email,
      revokedBy: req.user.email
    });

    res.json({
      success: true,
      message: 'All sessions revoked. User will be logged out on next request.',
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (error) {
    logger.error('Failed to revoke sessions', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to revoke sessions'
    });
  }
});

// ============================================================================
// POST /api/admin/users/force-rebind - Force device rebind
// ============================================================================

router.post('/users/force-rebind', async (req, res) => {
  try {
    const { userId, email, force = true } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userId or email'
      });
    }

    const db = await getDatabase();

    // Get user
    const whereClause = userId ? 'id = ?' : 'email = ?';
    const whereValue = userId || email;

    const user = await db.get(
      `SELECT id, email FROM user_roles WHERE ${whereClause}`,
      [whereValue]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user_controls to force rebind
    await db.run(
      `INSERT INTO user_controls (user_id, email, force_rebind, last_rebind_forced_at, last_rebind_forced_by)
       VALUES (?, ?, ?, datetime('now'), ?)
       ON CONFLICT(email) DO UPDATE SET
         force_rebind = ?,
         last_rebind_forced_at = datetime('now'),
         last_rebind_forced_by = ?,
         updated_at = datetime('now')`,
      [user.id, user.email, force ? 1 : 0, req.user.email, force ? 1 : 0, req.user.email]
    );

    // Audit action
    await auditAction(req, {
      action: force ? 'user_rebind_forced' : 'user_rebind_cleared',
      entity: 'user',
      entityId: user.email,
      note: force ? 'Device rebind required on next login' : 'Device rebind requirement cleared'
    });

    logger.info('User force rebind updated', {
      userId: user.id,
      email: user.email,
      forceRebind: force,
      updatedBy: req.user.email
    });

    res.json({
      success: true,
      message: force
        ? 'User will be required to rebind device on next login'
        : 'Device rebind requirement cleared',
      user: {
        id: user.id,
        email: user.email,
        forceRebind: force
      }
    });

  } catch (error) {
    logger.error('Failed to update force rebind', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update device rebind requirement'
    });
  }
});

// ============================================================================
// POST /api/admin/users/disable - Disable/enable user account
// ============================================================================

router.post('/users/disable', async (req, res) => {
  try {
    const { userId, email, disabled = true, reason } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        error: 'Must provide userId or email'
      });
    }

    const db = await getDatabase();

    // Get user
    const whereClause = userId ? 'id = ?' : 'email = ?';
    const whereValue = userId || email;

    const user = await db.get(
      `SELECT id, email FROM user_roles WHERE ${whereClause}`,
      [whereValue]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent disabling own account
    if (user.email === req.user.email) {
      return res.status(400).json({
        success: false,
        error: 'Cannot disable your own account'
      });
    }

    // Update user_controls
    if (disabled) {
      await db.run(
        `INSERT INTO user_controls (user_id, email, disabled, disabled_at, disabled_by, disabled_reason)
         VALUES (?, ?, 1, datetime('now'), ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           disabled = 1,
           disabled_at = datetime('now'),
           disabled_by = ?,
           disabled_reason = ?,
           updated_at = datetime('now')`,
        [user.id, user.email, req.user.email, reason, req.user.email, reason]
      );

      // Also mark user_roles as inactive
      await db.run(
        'UPDATE user_roles SET active = 0, updated_at = datetime(\'now\') WHERE id = ?',
        [user.id]
      );
    } else {
      await db.run(
        `UPDATE user_controls
         SET disabled = 0,
             disabled_at = NULL,
             disabled_by = NULL,
             disabled_reason = NULL,
             updated_at = datetime('now')
         WHERE email = ?`,
        [user.email]
      );

      // Reactivate user_roles
      await db.run(
        'UPDATE user_roles SET active = 1, updated_at = datetime(\'now\') WHERE id = ?',
        [user.id]
      );
    }

    // Audit action
    await auditAction(req, {
      action: disabled ? 'user_disabled' : 'user_enabled',
      entity: 'user',
      entityId: user.email,
      note: disabled ? `Disabled: ${reason || 'No reason provided'}` : 'Account re-enabled',
      meta: { reason }
    });

    logger.info('User account status changed', {
      userId: user.id,
      email: user.email,
      disabled,
      reason,
      updatedBy: req.user.email
    });

    res.json({
      success: true,
      message: disabled ? 'User account disabled' : 'User account enabled',
      user: {
        id: user.id,
        email: user.email,
        disabled
      }
    });

  } catch (error) {
    logger.error('Failed to update user status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
});

// ============================================================================
// GET /api/admin/invite/:token - Accept invite (SSO handoff)
// ============================================================================

router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // This endpoint is called after SSO authentication
    // The user's email should be in req.user from authenticateToken middleware

    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in via SSO.'
      });
    }

    const db = await getDatabase();

    // Verify and consume token
    const inviteData = await inviteService.verifyAndConsumeToken(
      db,
      token,
      req.user.email
    );

    // Create user_roles entry
    await db.run(
      `INSERT INTO user_roles (email, role, tenant_id, location_id, active, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`,
      [
        inviteData.email,
        inviteData.role,
        inviteData.tenantId,
        inviteData.locations[0] || null
      ]
    );

    // Create user_controls entry
    await db.run(
      `INSERT INTO user_controls (user_id, email, disabled, force_rebind)
       SELECT id, email, 0, 0 FROM user_roles WHERE email = ?`,
      [inviteData.email]
    );

    // Audit action
    await auditAction(req, {
      action: 'user_invite_accepted',
      entity: 'user',
      entityId: inviteData.email,
      note: `User ${inviteData.email} accepted invite and joined with role ${inviteData.role}`
    });

    logger.info('User accepted invite', {
      email: inviteData.email,
      role: inviteData.role,
      tenantId: inviteData.tenantId
    });

    res.json({
      success: true,
      message: 'Welcome to NeuroPilot! Your account has been activated.',
      user: {
        email: inviteData.email,
        role: inviteData.role,
        tenantId: inviteData.tenantId
      },
      redirectUrl: '/owner-super-console.html'
    });

  } catch (error) {
    logger.error('Failed to accept invite', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET /api/admin/invites - List all invites (optional)
// ============================================================================

router.get('/invites', async (req, res) => {
  try {
    const { status, email, limit } = req.query;

    const db = await getDatabase();

    const invites = await inviteService.listInvites(db, {
      status,
      email,
      limit: limit ? parseInt(limit) : 100
    });

    res.json({
      success: true,
      invites,
      total: invites.length
    });

  } catch (error) {
    logger.error('Failed to list invites', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list invites'
    });
  }
});

module.exports = router;
