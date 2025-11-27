const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { 
  authenticateUser, 
  refreshAccessToken, 
  logout, 
  validatePassword,
  users,
  authenticateToken,
  ROLES
} = require('../middleware/auth');
const { auditLog, securityLog } = require('../config/logger');

const router = express.Router();

// DEBUG: Test endpoint to verify bcrypt is working
router.get('/debug-test', async (req, res) => {
  try {
    const bcryptjs = require('bcryptjs');
    const testPassword = 'NeuroPilot2025!';
    const testHash = '$2a$12$/pRgSEBx/RYsvt8EBGKpMu/HiOUq2BhznLBB4j/Pustf.rVtwyGvW';

    console.log('[DEBUG] Testing bcrypt...');
    const match = bcryptjs.compareSync(testPassword, testHash);
    console.log('[DEBUG] Bcrypt match result:', match);

    // Test user lookup
    const ownerUser = users.get('owner@neuropilot.ai');
    console.log('[DEBUG] Owner user found:', !!ownerUser);
    console.log('[DEBUG] Owner role:', ownerUser?.role);

    res.json({
      bcryptMatch: match,
      userFound: !!ownerUser,
      userRole: ownerUser?.role,
      nodeVersion: process.version,
      env: process.env.NODE_ENV
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error.name, error.message, error.stack);
    res.status(500).json({
      error: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
});

// DEBUG: Test full auth flow
router.get('/debug-auth-flow', async (req, res) => {
  const steps = [];
  try {
    steps.push('Starting auth flow test');

    // Step 1: Get user
    const email = 'owner@neuropilot.ai';
    const password = 'NeuroPilot2025!';
    steps.push('Step 1: Got email and password');

    // Step 2: Mock request
    const mockReq = { ip: req.ip, get: (h) => req.get(h) };
    steps.push('Step 2: Created mock request');

    // Step 3: Call authenticateUser
    steps.push('Step 3: Calling authenticateUser...');
    const result = await authenticateUser(email, password, mockReq);
    steps.push('Step 3 complete: authenticateUser returned, success=' + result.success);

    if (!result.success) {
      return res.json({ steps, result: { success: false, error: result.error } });
    }

    // Step 4: Check result structure
    steps.push('Step 4: Result user id=' + result.user?.id);
    steps.push('Step 4: Result user role=' + result.user?.role);
    steps.push('Step 4: Access token length=' + result.tokens?.accessToken?.length);

    // Step 5: Try to stringify response
    steps.push('Step 5: Attempting JSON.stringify...');
    const responseData = {
      message: 'Login successful',
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: '15m',
      code: 'LOGIN_SUCCESS'
    };
    const jsonStr = JSON.stringify(responseData);
    steps.push('Step 5 complete: JSON length=' + jsonStr.length);

    // Return success
    res.json({ steps, success: true, responseDataKeys: Object.keys(responseData) });
  } catch (error) {
    steps.push('ERROR: ' + error.name + ': ' + error.message);
    res.status(500).json({
      steps,
      error: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 10)
    });
  }
});

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
  body('role')
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage('Invalid role specified')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    securityLog('validation_error', 'low', {
      errors: errors.array(),
      endpoint: req.path
    }, req);

    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

// POST /api/auth/register
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = ROLES.STAFF } = req.body;

    // Check if user already exists
    if (users.has(email)) {
      securityLog('duplicate_registration', 'medium', { email }, req);
      return res.status(409).json({
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors,
        code: 'WEAK_PASSWORD'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      org_id: 'default-org',
      site_id: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      failedAttempts: 0,
      lockedUntil: null,
      createdBy: req.user ? req.user.id : 'system',
      updatedAt: new Date().toISOString()
    };

    // Store user
    users.set(email, newUser);

    // Audit log
    auditLog('user_registered', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      createdBy: req.user ? req.user.id : 'system'
    }, req);

    // Return user info (no password)
    const userResponse = {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      code: 'USER_CREATED'
    });

  } catch (error) {
    securityLog('registration_error', 'high', {
      error: error.message,
      email: req.body.email
    }, req);

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// POST /api/auth/login
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    console.log('[AUTH] Login attempt for:', req.body.email);
    const { email, password } = req.body;

    console.log('[AUTH] Calling authenticateUser...');
    const result = await authenticateUser(email, password, req);
    console.log('[AUTH] authenticateUser result:', result.success);

    if (!result.success) {
      return res.status(401).json({
        error: result.error,
        code: 'LOGIN_FAILED'
      });
    }

    // Auto-bind device for owner accounts (admin-1 / neuropilotai@gmail.com)
    if (result.user.id === 'admin-1' || result.user.role === 'admin') {
      try {
        const { bindOwnerDevice } = require('../middleware/deviceBinding');
        const bindResult = bindOwnerDevice(req);

        if (bindResult.success) {
          console.log('✅ Owner device bound:', bindResult.fingerprint.substring(0, 16) + '...');
        } else {
          console.log('ℹ️ Device binding skipped:', bindResult.message);
        }
      } catch (bindError) {
        console.warn('⚠️ Device binding error:', bindError.message);
      }
    }

    console.log('[AUTH] Setting cookie...');
    // Set secure cookie for refresh token
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('[AUTH] Building response object...');
    const responseData = {
      message: 'Login successful',
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: '15m',
      code: 'LOGIN_SUCCESS'
    };

    console.log('[AUTH] Sending JSON response...');
    res.json(responseData);
    console.log('[AUTH] Response sent successfully');

  } catch (error) {
    console.error('[AUTH] Login error details:');
    console.error('[AUTH] Error name:', error.name);
    console.error('[AUTH] Error message:', error.message);
    console.error('[AUTH] Error stack:', error.stack);

    try {
      securityLog('login_error', 'high', {
        error: error.message,
        errorName: error.name,
        email: req.body.email
      }, req);
    } catch (logError) {
      console.error('[AUTH] Failed to log security event:', logError.message);
    }

    res.status(500).json({
      error: 'Internal server error',
      code: 'LOGIN_ERROR',
      hint: error.name,
      path: req.path
    });
  }
});

// POST /api/auth/device-login
// Owner device fingerprint authentication - no password required
router.post('/device-login', async (req, res) => {
  try {
    const { verifyOwnerDevice } = require('../middleware/deviceBinding');
    const { generateTokens } = require('../middleware/auth');

    // Verify device fingerprint
    const verification = verifyOwnerDevice(req);

    if (!verification.verified) {
      securityLog('device_login_failed', 'high', {
        reason: verification.reason,
        ip: req.ip,
        userAgent: req.get('user-agent')
      }, req);

      return res.status(403).json({
        success: false,
        error: verification.message,
        code: verification.reason,
        hint: 'This device is not authorized for owner access. Please login with email/password from the authorized device first.'
      });
    }

    // Device verified - find owner user and generate tokens
    const ownerUser = Array.from(users.values()).find(u => u.id === 'admin-1');

    if (!ownerUser || !ownerUser.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Owner account not found or inactive',
        code: 'OWNER_NOT_FOUND'
      });
    }

    // Update last login
    ownerUser.lastLogin = new Date().toISOString();

    // Generate JWT tokens
    const tokens = generateTokens(ownerUser);

    // Set secure cookie for refresh token
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    auditLog('device_login_success', {
      userId: ownerUser.id,
      email: ownerUser.email,
      deviceVerified: true
    }, req);

    return res.json({
      success: true,
      message: 'Device authenticated successfully',
      user: {
        id: ownerUser.id,
        email: ownerUser.email,
        role: ownerUser.role,
        firstName: ownerUser.firstName,
        lastName: ownerUser.lastName
      },
      accessToken: tokens.accessToken,
      expiresIn: '15m',
      code: 'DEVICE_LOGIN_SUCCESS'
    });

  } catch (error) {
    securityLog('device_login_error', 'high', {
      error: error.message
    }, req);

    return res.status(500).json({
      success: false,
      error: 'Device authentication failed',
      details: error.message,
      code: 'DEVICE_LOGIN_ERROR'
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const cookieToken = req.cookies?.refreshToken;
    
    const token = refreshToken || cookieToken;

    if (!token) {
      return res.status(401).json({
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }

    const result = refreshAccessToken(token);

    if (!result.success) {
      // Clear invalid cookie
      res.clearCookie('refreshToken');
      
      return res.status(401).json({
        error: result.error,
        code: 'REFRESH_FAILED'
      });
    }

    // Set new refresh token cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    auditLog('token_refreshed', {
      userId: req.user ? req.user.id : 'unknown'
    }, req);

    res.json({
      accessToken: result.tokens.accessToken,
      expiresIn: '15m',
      code: 'TOKEN_REFRESHED'
    });

  } catch (error) {
    securityLog('refresh_error', 'medium', {
      error: error.message
    }, req);

    res.status(500).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const cookieToken = req.cookies?.refreshToken;
    
    const token = refreshToken || cookieToken;

    if (token) {
      logout(token);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    auditLog('user_logout', {
      userId: req.user.id,
      email: req.user.email
    }, req);

    res.json({
      message: 'Logout successful',
      code: 'LOGOUT_SUCCESS'
    });

  } catch (error) {
    securityLog('logout_error', 'low', {
      error: error.message,
      userId: req.user ? req.user.id : null
    }, req);

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

// GET /api/auth/device-status
// Check device binding status (diagnostic endpoint)
router.get('/device-status', (req, res) => {
  try {
    const { getDeviceBindingStatus, generateDeviceFingerprint } = require('../middleware/deviceBinding');
    const status = getDeviceBindingStatus();
    const currentFingerprint = generateDeviceFingerprint(req);

    return res.json({
      success: true,
      ...status,
      currentDeviceFingerprint: currentFingerprint.substring(0, 16) + '...',
      currentDeviceMatches: status.ownerFingerprint === (currentFingerprint.substring(0, 16) + '...'),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    // Get fresh user data
    const user = Array.from(users.values()).find(u => u.id === req.user.id);

    if (!user || !user.isActive) {
      return res.status(404).json({
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: req.user.permissions,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    };

    res.json({
      user: userResponse,
      code: 'USER_INFO'
    });

  } catch (error) {
    securityLog('user_info_error', 'low', {
      error: error.message,
      userId: req.user.id
    }, req);

    res.status(500).json({
      error: 'Failed to get user information',
      code: 'USER_INFO_ERROR'
    });
  }
});

// GET /api/auth/capabilities
// v15.5.0: Get user capabilities and role constants for frontend RBAC
router.get('/capabilities', authenticateToken, (req, res) => {
  try {
    const { ROLES: RBAC_ROLES, ROLE_HIERARCHY, canPerformAction } = require('../security/rbac');

    // Get fresh user data
    const user = Array.from(users.values()).find(u => u.id === req.user.id);

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    // Build capabilities object based on user role
    // v15.5.3: Normalize role to uppercase for consistent comparison
    const userRole = (user.role || 'READONLY').toUpperCase();

    // Determine what actions user can perform
    const capabilities = {
      canViewFinance: canPerformAction(req.user, 'READ', 'finance'),
      canExportFinance: canPerformAction(req.user, 'EXPORT', 'finance'),
      canEditFinance: canPerformAction(req.user, 'UPDATE', 'finance'),
      canApproveFinance: canPerformAction(req.user, 'APPROVE', 'finance'),

      canViewForecast: canPerformAction(req.user, 'READ', 'forecast'),
      canCreateForecast: canPerformAction(req.user, 'CREATE', 'forecast'),
      canApproveForecast: canPerformAction(req.user, 'APPROVE', 'forecast'),

      canManageUsers: userRole === 'OWNER',
      canViewSettings: userRole === 'OWNER',

      canViewDocuments: canPerformAction(req.user, 'READ', 'documents'),
      canMapCategories: canPerformAction(req.user, 'UPDATE', 'mappings'),

      // Tab-level visibility
      showFinanceTab: ['FINANCE', 'OWNER'].includes(userRole),
      showForecastTab: ['OPS', 'FINANCE', 'OWNER'].includes(userRole),
      showSettingsTab: userRole === 'OWNER',
      showReportsTab: ['FINANCE', 'OWNER'].includes(userRole)
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: userRole,
        roleLevel: ROLE_HIERARCHY[userRole] || 0
      },
      capabilities,
      roles: RBAC_ROLES,
      roleHierarchy: ROLE_HIERARCHY
    });

  } catch (error) {
    securityLog('capabilities_error', 'medium', {
      error: error.message,
      userId: req.user?.id
    }, req);

    res.status(500).json({
      success: false,
      error: 'Failed to get user capabilities',
      code: 'CAPABILITIES_ERROR'
    });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, [
  body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
], handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get current user
    const user = Array.from(users.values()).find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      securityLog('invalid_password_change', 'medium', {
        userId: user.id,
        email: user.email
      }, req);

      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'New password does not meet security requirements',
        details: passwordValidation.errors,
        code: 'WEAK_PASSWORD'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update user password
    user.password = hashedPassword;
    user.updatedAt = new Date().toISOString();
    
    // Store updated user
    users.set(user.email, user);

    auditLog('password_changed', {
      userId: user.id,
      email: user.email
    }, req);

    res.json({
      message: 'Password changed successfully',
      code: 'PASSWORD_CHANGED'
    });

  } catch (error) {
    securityLog('password_change_error', 'high', {
      error: error.message,
      userId: req.user.id
    }, req);

    res.status(500).json({
      error: 'Password change failed',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

module.exports = router;