/**
 * Owner-Only Access Control Middleware
 * Supports multiple owner emails with Gmail dot-folding normalization
 *
 * @version 3.1.0
 * @author NeuroInnovate AI Team
 */

const { auditLog, securityLog } = require('../config/logger');

// Owner emails from env (comma-separated) or default
const OWNER_EMAILS_RAW = process.env.OWNER_EMAILS || 'neuro.pilot.ai@gmail.com,neuropilotai@gmail.com';

// Gmail local-part dot-folding: foo.bar@gmail.com → foobar@gmail.com
const normalizeEmail = (email) => {
  if (!email) return '';
  const lower = email.toLowerCase().trim();
  const [localPart, domain] = lower.split('@');
  if (!domain) return lower;

  // Remove dots from Gmail local part
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return localPart.replace(/\./g, '') + '@' + domain;
  }
  return lower;
};

// Build owner allow-list (Set for O(1) lookup)
const OWNER_EMAILS = new Set(
  OWNER_EMAILS_RAW.split(',')
    .map(e => normalizeEmail(e))
    .filter(Boolean)
);

console.log('🔐 Owner Access: Allowed emails:', Array.from(OWNER_EMAILS).join(', '));

/**
 * Middleware to require owner-level access
 * Must be used AFTER authenticateToken middleware
 * V21.1: Now accepts both email whitelist AND role='owner' from JWT
 */
const requireOwner = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user || !req.user.email) {
    securityLog('owner_access_denied', 'high', {
      reason: 'no_user',
      ip: req.ip,
      path: req.path,
      method: req.method
    }, req);

    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // V21.1: Check if user has owner role in JWT (preferred method)
  if (req.user.role && req.user.role.toLowerCase() === 'owner') {
    // Role-based access granted
    auditLog('owner_access_granted', {
      userId: req.user.id,
      email: req.user.email,
      path: req.path,
      method: req.method,
      authMethod: 'role'
    }, req);

    if (global.metricsExporter && global.metricsExporter.recordOwnerAccessGranted) {
      global.metricsExporter.recordOwnerAccessGranted();
    }

    return next();
  }

  // Fallback: Normalize user email (try email or emailNormalized)
  const userEmail = req.user.email || req.user.emailNormalized || '';
  const normalizedUserEmail = normalizeEmail(userEmail);

  // Check if user is in owner allow-list (legacy method)
  if (!OWNER_EMAILS.has(normalizedUserEmail)) {
    securityLog('owner_access_denied', 'high', {
      reason: 'not_owner',
      userEmail: req.user.email,
      normalizedEmail: normalizedUserEmail,
      userId: req.user.id,
      role: req.user.role,
      ip: req.ip,
      path: req.path,
      method: req.method
    }, req);

    auditLog('owner_access_denied', {
      userId: req.user.id,
      email: req.user.email,
      attemptedPath: req.path,
      reason: 'not_owner',
      role: req.user.role
    }, req);

    // Increment metrics if available
    if (global.metricsExporter && global.metricsExporter.recordOwnerAccessDenied) {
      global.metricsExporter.recordOwnerAccessDenied('not_owner');
    }

    return res.status(403).json({
      error: 'Owner access required',
      code: 'OWNER_ACCESS_REQUIRED'
    });
  }

  // Log successful owner access
  auditLog('owner_access_granted', {
    userId: req.user.id,
    email: req.user.email,
    path: req.path,
    method: req.method
  }, req);

  // Increment metrics if available
  if (global.metricsExporter && global.metricsExporter.recordOwnerAccessGranted) {
    global.metricsExporter.recordOwnerAccessGranted();
  }

  next();
};

module.exports = { requireOwner, OWNER_EMAILS, normalizeEmail };
