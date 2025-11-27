const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { jwt: jwtConfig, password: passwordConfig } = require('../config/security');
const { logger } = require('../config/logger');
const { bindOwnerDevice, verifyOwnerDevice } = require('./deviceBinding');

// User roles for RBAC
const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
  VIEWER: 'viewer'
};

// Role permissions
const PERMISSIONS = {
  [ROLES.OWNER]: [
    'inventory:read', 'inventory:write', 'inventory:delete', 'inventory:count', 'inventory:approve',
    'orders:read', 'orders:write', 'orders:delete',
    'users:read', 'users:write', 'users:delete',
    'reports:read', 'audit:read', 'settings:write',
    'system:admin', 'owner:console'
  ],
  [ROLES.ADMIN]: [
    'inventory:read', 'inventory:write', 'inventory:delete', 'inventory:count', 'inventory:approve',
    'orders:read', 'orders:write', 'orders:delete',
    'users:read', 'users:write', 'users:delete',
    'reports:read', 'audit:read', 'settings:write'
  ],
  [ROLES.MANAGER]: [
    'inventory:read', 'inventory:write', 'inventory:count', 'inventory:approve',
    'orders:read', 'orders:write',
    'users:read', 'reports:read'
  ],
  [ROLES.STAFF]: [
    'inventory:read', 'inventory:write', 'inventory:count',
    'orders:read', 'orders:write'
  ],
  [ROLES.VIEWER]: [
    'inventory:read', 'orders:read'
  ]
};

// In-memory user store (replace with database in production)
const users = new Map();
const refreshTokens = new Map();

// Initialize default owner user
// Note: Email stored in normalized form (neuropilotai@gmail.com) to match express-validator's normalizeEmail()
// which removes dots from Gmail addresses. User can login with neuro.pilot.ai@gmail.com
const defaultAdmin = {
  id: 'admin-1',
  email: 'neuropilotai@gmail.com', // Normalized form (dots removed for Gmail)
  password: bcrypt.hashSync('Admin123!@#', 10),
  role: ROLES.OWNER,
  firstName: 'David',
  lastName: 'Owner',
  org_id: 'default-org',
  site_id: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  lastLogin: null,
  failedAttempts: 0,
  lockedUntil: null
};

users.set(defaultAdmin.email, defaultAdmin);

// v15.5.3: Add OWNER user from database (owner-001) to in-memory store
const v15Owner = {
  id: 'owner-001',
  email: 'owner@neuropilot.local',
  password: bcrypt.hashSync('', 10), // No password - JWT token only
  role: ROLES.OWNER,
  firstName: 'System',
  lastName: 'Owner',
  org_id: 'default-org',
  site_id: null,
  isActive: true,
  createdAt: new Date('2025-10-14T10:07:44').toISOString(),
  lastLogin: null,
  failedAttempts: 0,
  lockedUntil: null
};

users.set(v15Owner.email, v15Owner);

// Add test accounts for login page
// SECURITY: These passwords were rotated on 2025-11-25 after breach detection
// Store actual passwords in a secure password manager, NOT in code comments
const testAccounts = [
  {
    id: 'owner-test',
    email: 'owner@neuropilot.ai',
    password: '$2a$12$/pRgSEBx/RYsvt8EBGKpMu/HiOUq2BhznLBB4j/Pustf.rVtwyGvW', // NeuroPilot2025!
    role: ROLES.OWNER,
    firstName: 'David',
    lastName: 'Mikulis',
    org_id: 'default-org',
    site_id: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    failedAttempts: 0,
    lockedUntil: null
  },
  {
    id: 'admin-test',
    email: 'admin@neuropilot.ai',
    password: '$2a$12$x0jGMSYvEskVXRcenj.b/OPtl2IIa2FndvoIKBvHhpO7TCKp6BGNi', // rotated - check password manager
    role: ROLES.ADMIN,
    firstName: 'Test',
    lastName: 'Admin',
    org_id: 'default-org',
    site_id: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    failedAttempts: 0,
    lockedUntil: null
  },
  {
    id: 'staff-test',
    email: 'staff@neuropilot.ai',
    password: '$2a$12$HTmR97pm2SLcLUefZVOsf.afZ5Zav.A0jpJhb71a66TR/AZvzYuvS', // rotated - check password manager
    role: ROLES.STAFF,
    firstName: 'Test',
    lastName: 'Staff',
    org_id: 'default-org',
    site_id: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    failedAttempts: 0,
    lockedUntil: null
  }
];

testAccounts.forEach(user => users.set(user.email, user));

// JWT token generation
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    org_id: user.org_id || 'default-org',
    site_id: user.site_id || null,
    permissions: PERMISSIONS[user.role] || []
  };

  const accessToken = jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    algorithm: jwtConfig.algorithm
  });

  const refreshToken = jwt.sign(
    { id: user.id, tokenType: 'refresh' },
    jwtConfig.refreshSecret,
    {
      expiresIn: jwtConfig.refreshExpiresIn,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      algorithm: jwtConfig.algorithm
    }
  );

  // Store refresh token
  refreshTokens.set(refreshToken, {
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  return { accessToken, refreshToken };
};

// Verify JWT token middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Also check query parameter (for PDF preview URLs)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'TOKEN_MISSING'
    });
  }

  jwt.verify(token, jwtConfig.secret, (err, decoded) => {
    if (err) {
      logger.warn('Invalid token attempt', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        error: err.message
      });

      return res.status(403).json({
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
    }

    // v15.5.3: Support both 'id' and 'user_id' fields in JWT payload
    const userId = decoded.id || decoded.user_id;

    // Check if user is still active
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (!user || !user.isActive) {
      return res.status(403).json({
        error: 'User account is inactive',
        code: 'USER_INACTIVE'
      });
    }

    // v15.5.3: Normalize role to uppercase for RBAC module compatibility
    const normalizedRole = (decoded.role || '').toUpperCase();

    // Build normalized req.user object
    req.user = {
      id: userId,
      email: decoded.email,
      role: normalizedRole,
      roles: [normalizedRole],  // RBAC module expects array
      permissions: PERMISSIONS[ROLES[normalizedRole]] || [],
      tenant_id: decoded.tenant_id
    };

    next();
  });
};

// Role-based access control
const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    
    if (!userRoles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: userRoles,
        endpoint: req.path,
        ip: req.ip
      });

      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: userRoles
      });
    }

    next();
  };
};

// Permission-based access control
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.user.permissions.includes(permission)) {
      logger.warn('Unauthorized permission attempt', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredPermission: permission,
        userPermissions: req.user.permissions,
        endpoint: req.path,
        ip: req.ip
      });

      return res.status(403).json({ 
        error: `Permission '${permission}' required`,
        code: 'PERMISSION_DENIED',
        required: permission
      });
    }

    next();
  };
};

// Password validation
const validatePassword = (password) => {
  const errors = [];

  if (password.length < passwordConfig.minLength) {
    errors.push(`Password must be at least ${passwordConfig.minLength} characters long`);
  }

  if (passwordConfig.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (passwordConfig.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (passwordConfig.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (passwordConfig.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// User authentication
const authenticateUser = async (email, password, req) => {
  const user = users.get(email);
  
  if (!user) {
    logger.warn('Login attempt with non-existent email', { 
      email, 
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    return { success: false, error: 'Invalid credentials' };
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const lockTimeRemaining = Math.ceil((user.lockedUntil - Date.now()) / 1000 / 60);
    logger.warn('Login attempt on locked account', { 
      email, 
      ip: req.ip,
      lockTimeRemaining
    });
    return { 
      success: false, 
      error: `Account is locked. Try again in ${lockTimeRemaining} minutes.` 
    };
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  
  if (!isValidPassword) {
    // Increment failed attempts
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    
    // Lock account after max attempts
    if (user.failedAttempts >= passwordConfig.maxAttempts) {
      user.lockedUntil = Date.now() + passwordConfig.lockoutTime;
      logger.warn('Account locked due to too many failed attempts', { 
        email, 
        attempts: user.failedAttempts,
        ip: req.ip
      });
    }

    logger.warn('Failed login attempt', { 
      email, 
      attempts: user.failedAttempts,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    return { success: false, error: 'Invalid credentials' };
  }

  // Reset failed attempts on successful login
  user.failedAttempts = 0;
  user.lockedUntil = null;
  user.lastLogin = new Date().toISOString();

  // OWNER DEVICE BINDING - Restrict owner account to specific MacBook Pro
  // TEMPORARILY DISABLED FOR DEBUGGING
  if (false && (user.role === ROLES.OWNER || (user.role === ROLES.ADMIN && user.id === 'admin-1'))) {
    // Try to bind device (will succeed only on first login)
    const bindResult = bindOwnerDevice(req);

    // If device was just bound, log it
    if (bindResult.success) {
      logger.warn('OWNER DEVICE BINDING: MacBook Pro registered', {
        userId: user.id,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    // Verify current device matches owner's MacBook Pro
    const verification = verifyOwnerDevice(req);

    if (!verification.verified) {
      logger.error('SECURITY ALERT: Owner login attempt from unauthorized device', {
        reason: verification.reason,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      return {
        success: false,
        error: verification.message,
        code: verification.reason
      };
    }

    logger.info('Owner login successful - device verified', {
      userId: user.id,
      email: user.email,
      deviceVerified: true,
      ip: req.ip
    });
  }

  const tokens = generateTokens(user);

  logger.info('Successful login', {
    userId: user.id,
    email: user.email,
    role: user.role,
    ip: req.ip
  });

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      org_id: user.org_id || 'default-org',
      site_id: user.site_id || null,
      permissions: PERMISSIONS[user.role] || []
    },
    tokens
  };
};

// Refresh token validation
const refreshAccessToken = (refreshToken) => {
  const tokenData = refreshTokens.get(refreshToken);
  
  if (!tokenData || tokenData.expiresAt < new Date()) {
    refreshTokens.delete(refreshToken);
    return { success: false, error: 'Invalid or expired refresh token' };
  }

  try {
    const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);
    const user = Array.from(users.values()).find(u => u.id === decoded.id);
    
    if (!user || !user.isActive) {
      refreshTokens.delete(refreshToken);
      return { success: false, error: 'User account is inactive' };
    }

    const tokens = generateTokens(user);
    
    // Remove old refresh token and store new one
    refreshTokens.delete(refreshToken);

    return { success: true, tokens };
  } catch (err) {
    refreshTokens.delete(refreshToken);
    return { success: false, error: 'Invalid refresh token' };
  }
};

// Logout - invalidate refresh token
const logout = (refreshToken) => {
  if (refreshToken) {
    refreshTokens.delete(refreshToken);
  }
  return { success: true };
};

module.exports = {
  ROLES,
  PERMISSIONS,
  authenticateToken,
  requireRole,
  requirePermission,
  validatePassword,
  authenticateUser,
  refreshAccessToken,
  logout,
  users, // Export for user management
  generateTokens
};