/**
 * Invite Service
 *
 * Handles one-time invite token generation and verification for SSO user onboarding.
 * OWNER-only functionality.
 *
 * @version 15.5.0
 */

const crypto = require('crypto');
const { logger } = require('../config/logger');

/**
 * Generate a secure invite token
 * @returns {string} Base64-encoded random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create an invite token for a new user
 * @param {object} db - Database instance
 * @param {object} params - Invite parameters
 * @param {string} params.email - Email of invitee
 * @param {string} params.role - Role to assign (READONLY, OPS, FINANCE, OWNER)
 * @param {string} params.tenantId - Tenant ID
 * @param {string[]} params.locations - Location IDs (optional)
 * @param {string} params.createdBy - Email of inviter
 * @param {number} params.expiryDays - Days until token expires (default 7)
 * @returns {Promise<{token: string, emailBody: string}>}
 */
async function createInvite(db, params) {
  const {
    email,
    role,
    tenantId,
    locations = [],
    createdBy,
    expiryDays = 7
  } = params;

  // Validate role
  const validRoles = ['READONLY', 'OPS', 'FINANCE', 'OWNER'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of ${validRoles.join(', ')}`);
  }

  // Check if user already exists
  const existingUser = await db.get(
    'SELECT email FROM user_roles WHERE email = ? AND active = 1',
    [email]
  );

  if (existingUser) {
    throw new Error(`User ${email} already exists with active role`);
  }

  // Check for pending invites
  const pendingInvite = await db.get(
    `SELECT token FROM invite_tokens
     WHERE email = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`,
    [email]
  );

  if (pendingInvite) {
    throw new Error(`Active invite already exists for ${email}`);
  }

  // Generate token
  const token = generateToken();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  // Insert invite token
  await db.run(
    `INSERT INTO invite_tokens (
      token, email, role, tenant_id, locations, created_by, expires_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      token,
      email,
      role,
      tenantId,
      JSON.stringify(locations),
      createdBy,
      expiresAt
    ]
  );

  // Generate email body preview (for copy-paste into Gmail)
  const inviteUrl = `${process.env.BASE_URL || 'http://localhost:8083'}/api/admin/invite/${token}`;

  const emailBody = `You've been invited to NeuroPilot Inventory Enterprise!

Role: ${role}
Tenant: ${tenantId}

To accept this invitation and set up your account, click the link below:

${inviteUrl}

This invitation link will expire in ${expiryDays} days.

---

What to expect:
1. Click the link above to begin SSO authentication
2. Sign in with your ${email} account via Google or Microsoft
3. Your account will be automatically provisioned with ${role} access
4. You'll be redirected to the dashboard

If you have any questions, please contact your administrator.

---
NeuroPilot Inventory Enterprise
© 2025 All Rights Reserved`;

  logger.info('Invite token created', {
    email,
    role,
    tenantId,
    createdBy,
    expiresAt
  });

  return {
    token,
    emailBody,
    expiresAt
  };
}

/**
 * Verify and consume an invite token
 * @param {object} db - Database instance
 * @param {string} token - Invite token
 * @param {string} userEmail - Email of user consuming token (from SSO)
 * @returns {Promise<{email: string, role: string, tenantId: string, locations: string[]}>}
 */
async function verifyAndConsumeToken(db, token, userEmail) {
  // Find token
  const invite = await db.get(
    `SELECT * FROM invite_tokens
     WHERE token = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`,
    [token]
  );

  if (!invite) {
    throw new Error('Invalid or expired invite token');
  }

  // Verify email matches
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    logger.warn('Invite token email mismatch', {
      inviteEmail: invite.email,
      userEmail,
      token: token.substring(0, 8) + '...'
    });
    throw new Error('This invite is for a different email address');
  }

  // Mark token as consumed
  await db.run(
    `UPDATE invite_tokens
     SET status = 'consumed', consumed_at = datetime('now'), consumed_by = ?
     WHERE token = ?`,
    [userEmail, token]
  );

  // Parse locations
  let locations = [];
  try {
    locations = JSON.parse(invite.locations || '[]');
  } catch (err) {
    logger.warn('Failed to parse invite locations', { error: err.message });
  }

  logger.info('Invite token consumed', {
    email: userEmail,
    role: invite.role,
    tenantId: invite.tenant_id
  });

  return {
    email: invite.email,
    role: invite.role,
    tenantId: invite.tenant_id,
    locations
  };
}

/**
 * Revoke an invite token (OWNER only)
 * @param {object} db - Database instance
 * @param {string} token - Token to revoke
 * @param {string} revokedBy - Email of admin revoking
 * @returns {Promise<void>}
 */
async function revokeToken(db, token, revokedBy) {
  const result = await db.run(
    `UPDATE invite_tokens
     SET status = 'revoked', notes = 'Revoked by ' || ?
     WHERE token = ? AND status = 'pending'`,
    [revokedBy, token]
  );

  if (result.changes === 0) {
    throw new Error('Token not found or already consumed/revoked');
  }

  logger.info('Invite token revoked', {
    token: token.substring(0, 8) + '...',
    revokedBy
  });
}

/**
 * List all invite tokens (OWNER only)
 * @param {object} db - Database instance
 * @param {object} filters - Optional filters
 * @returns {Promise<Array>}
 */
async function listInvites(db, filters = {}) {
  let query = 'SELECT * FROM invite_tokens WHERE 1=1';
  const params = [];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.email) {
    query += ' AND email LIKE ?';
    params.push(`%${filters.email}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(filters.limit || 100);

  const invites = await db.all(query, params);

  return invites.map(invite => ({
    ...invite,
    locations: JSON.parse(invite.locations || '[]'),
    // Redact token for security
    token: invite.status === 'pending' ? invite.token : invite.token.substring(0, 8) + '...'
  }));
}

/**
 * Expire old tokens (cron job)
 * @param {object} db - Database instance
 * @returns {Promise<number>} Number of expired tokens
 */
async function expireOldTokens(db) {
  const result = await db.run(
    `UPDATE invite_tokens
     SET status = 'expired'
     WHERE status = 'pending' AND datetime(expires_at) <= datetime('now')`
  );

  if (result.changes > 0) {
    logger.info('Expired old invite tokens', { count: result.changes });
  }

  return result.changes;
}

module.exports = {
  createInvite,
  verifyAndConsumeToken,
  revokeToken,
  listInvites,
  expireOldTokens
};
