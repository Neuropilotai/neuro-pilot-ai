/**
 * Enhanced Authentication Middleware
 * 
 * JWT authentication and user context injection for Express
 * Integrates with existing auth.js middleware
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../../db');

/**
 * Verify JWT token and extract user information
 */
async function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.warn('JWT_SECRET not configured');
      return null;
    }

    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Enhanced authentication middleware
 * Verifies JWT token and injects user context
 */
async function enhanceAuth(req, res, next) {
  // Skip if user already authenticated by existing middleware
  if (req.user) {
    return next();
  }

  // Skip authentication for health checks
  const path = req.path || req.url || '';
  if (
    path.startsWith('/health') ||
    path.startsWith('/ping') ||
    path.startsWith('/metrics')
  ) {
    return next();
  }

  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
  }

  // Extract token (Bearer <token>)
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected: Bearer <token>',
    });
  }

  const token = parts[1];

  // Verify token
  const payload = await verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }

  // Fetch user from database to get latest role/permissions
  try {
    const result = await pool.query(
      `SELECT user_id, email, role, active, org_id 
       FROM users 
       WHERE user_id = $1 AND active = true`,
      [payload.userId || payload.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    const user = result.rows[0];

    if (!user.active) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User account is inactive',
      });
    }

    // Verify orgId matches (extra security check)
    if (payload.orgId && user.org_id && payload.orgId !== user.org_id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Organization mismatch',
      });
    }

    // Inject user context into request
    req.user = {
      id: user.user_id.toString(),
      email: user.email,
      role: user.role,
      orgId: user.org_id,
    };

    next();
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate user',
    });
  }
}

/**
 * Role-based access control helpers
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`,
        userRole: req.user.role,
      });
    }

    next();
  };
}

const requireAdmin = requireRole('admin', 'ADMIN');
const requireEditor = requireRole('editor', 'EDITOR', 'admin', 'ADMIN');
const requireCounter = requireRole('counter', 'COUNTER', 'editor', 'EDITOR', 'admin', 'ADMIN');

module.exports = {
  enhanceAuth,
  requireRole,
  requireAdmin,
  requireEditor,
  requireCounter,
};

