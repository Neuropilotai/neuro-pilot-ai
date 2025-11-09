/**
 * JWT Authentication & RBAC Middleware - v20.1
 * Simplified auth for inventory backend staging
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Static user database for staging
 * In production, replace with database lookup
 */
const USERS = {
  'admin@local': {
    id: 1,
    email: 'admin@local',
    password: 'admin123', // In production: bcrypt hash
    role: 'admin',
    name: 'Admin User',
  },
  'staff@local': {
    id: 2,
    email: 'staff@local',
    password: 'staff123',
    role: 'staff',
    name: 'Staff User',
  },
  'viewer@local': {
    id: 3,
    email: 'viewer@local',
    password: 'viewer123',
    role: 'viewer',
    name: 'Viewer User',
  },
};

/**
 * Role hierarchy (higher index = more permissions)
 */
const ROLE_HIERARCHY = ['viewer', 'staff', 'admin'];

/**
 * Issue JWT token
 */
function issueJWT(payload) {
  const { sub, role, email, name } = payload;

  const token = jwt.sign(
    {
      sub,
      role,
      email,
      name,
      iat: Math.floor(Date.now() / 1000),
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
    }
  );

  return {
    token,
    expiresIn: config.jwt.expiresIn,
  };
}

/**
 * Verify JWT token
 */
function verifyJWT(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

/**
 * Login handler
 */
function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required',
    });
  }

  const user = USERS[email];

  if (!user || user.password !== password) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
    });
  }

  const tokenData = issueJWT({
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  });

  res.json({
    success: true,
    data: {
      token: tokenData.token,
      expiresIn: tokenData.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  });
}

/**
 * Auth middleware with RBAC
 * @param {string[]} requiredRoles - Roles allowed to access route
 */
function authGuard(requiredRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7);
    const payload = verifyJWT(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Attach user info to request
    req.user = payload;

    // Check role permissions
    if (requiredRoles.length > 0) {
      const userRoleIndex = ROLE_HIERARCHY.indexOf(payload.role);
      const hasPermission = requiredRoles.some(
        (role) => ROLE_HIERARCHY.indexOf(role) <= userRoleIndex
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`,
        });
      }
    }

    next();
  };
}

/**
 * Optional auth middleware (attaches user if token present, but doesn't require it)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyJWT(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

module.exports = {
  issueJWT,
  verifyJWT,
  login,
  authGuard,
  optionalAuth,
  USERS,
  ROLE_HIERARCHY,
};
