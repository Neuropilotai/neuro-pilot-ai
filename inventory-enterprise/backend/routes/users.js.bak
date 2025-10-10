const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { requireRole, ROLES, users, validatePassword } = require('../middleware/auth');
const { auditLog, securityLog } = require('../config/logger');

const router = express.Router();

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

// User validation rules
const userValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('firstName').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required and must be less than 50 characters'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required and must be less than 50 characters'),
  body('role').isIn(Object.values(ROLES)).withMessage('Invalid role specified'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const passwordValidation = [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

// GET /api/users - Get all users (Admin/Manager only)
router.get('/', requireRole([ROLES.ADMIN, ROLES.MANAGER]), [
  query('role').optional().isIn(Object.values(ROLES)),
  query('isActive').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], handleValidationErrors, (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 20 } = req.query;
    
    let userList = Array.from(users.values());
    
    // Apply filters
    if (role) {
      userList = userList.filter(user => user.role === role);
    }
    
    if (isActive !== undefined) {
      userList = userList.filter(user => user.isActive === (isActive === 'true'));
    }
    
    // Pagination
    const offset = (page - 1) * limit;
    const paginatedUsers = userList.slice(offset, offset + parseInt(limit));
    
    // Remove sensitive information
    const safeUsers = paginatedUsers.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdBy: user.createdBy,
      failedAttempts: user.failedAttempts || 0,
      isLocked: user.lockedUntil && user.lockedUntil > Date.now()
    }));
    
    const response = {
      users: safeUsers,
      pagination: {
        currentPage: parseInt(page),
        usersPerPage: parseInt(limit),
        totalUsers: userList.length,
        totalPages: Math.ceil(userList.length / limit)
      },
      summary: {
        totalUsers: Array.from(users.values()).length,
        activeUsers: Array.from(users.values()).filter(u => u.isActive).length,
        roleBreakdown: Object.values(ROLES).reduce((acc, role) => {
          acc[role] = Array.from(users.values()).filter(u => u.role === role).length;
          return acc;
        }, {})
      }
    };
    
    res.json(response);
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve users',
      code: 'USERS_FETCH_ERROR'
    });
  }
});

// POST /api/users - Create new user (Admin only)
router.post('/', requireRole(ROLES.ADMIN), [...userValidation, ...passwordValidation], handleValidationErrors, async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, isActive = true } = req.body;
    
    // Check if user already exists
    if (users.has(email)) {
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
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id,
      lastLogin: null,
      failedAttempts: 0,
      lockedUntil: null
    };
    
    // Store user
    users.set(email.toLowerCase(), newUser);
    
    // Audit log
    auditLog('user_created', {
      newUserId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
      createdBy: req.user.id
    }, req);
    
    // Return user info (no password)
    const userResponse = {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
      createdBy: newUser.createdBy
    };
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse,
      code: 'USER_CREATED'
    });
    
  } catch (error) {
    securityLog('user_creation_error', 'high', {
      error: error.message,
      email: req.body.email,
      createdBy: req.user.id
    }, req);
    
    res.status(500).json({
      error: 'Failed to create user',
      code: 'USER_CREATE_ERROR'
    });
  }
});

// PUT /api/users/:id - Update user (Admin only)
router.put('/:id', requireRole(ROLES.ADMIN), [
  param('id').trim().isLength({ min: 1 }).withMessage('User ID is required'),
  ...userValidation
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;
    
    // Find user
    const existingUser = Array.from(users.values()).find(user => user.id === id);
    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Check if email is being changed and new email already exists
    if (email.toLowerCase() !== existingUser.email && users.has(email.toLowerCase())) {
      return res.status(409).json({
        error: 'Email already in use',
        code: 'EMAIL_EXISTS'
      });
    }
    
    // Prevent admin from deactivating themselves
    if (req.user.id === id && isActive === false) {
      return res.status(400).json({
        error: 'Cannot deactivate your own account',
        code: 'SELF_DEACTIVATION_DENIED'
      });
    }
    
    // Track changes for audit
    const changes = [];
    if (email.toLowerCase() !== existingUser.email) changes.push(`email: ${existingUser.email} → ${email.toLowerCase()}`);
    if (firstName.trim() !== existingUser.firstName) changes.push(`firstName: ${existingUser.firstName} → ${firstName.trim()}`);
    if (lastName.trim() !== existingUser.lastName) changes.push(`lastName: ${existingUser.lastName} → ${lastName.trim()}`);
    if (role !== existingUser.role) changes.push(`role: ${existingUser.role} → ${role}`);
    if (isActive !== existingUser.isActive) changes.push(`isActive: ${existingUser.isActive} → ${isActive}`);
    
    // Remove user from old email key if email changed
    if (email.toLowerCase() !== existingUser.email) {
      users.delete(existingUser.email);
    }
    
    // Update user
    const updatedUser = {
      ...existingUser,
      email: email.toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      isActive,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    // Store updated user
    users.set(email.toLowerCase(), updatedUser);
    
    // Audit log
    auditLog('user_updated', {
      updatedUserId: id,
      email: updatedUser.email,
      changes,
      updatedBy: req.user.id
    }, req);
    
    // Return updated user info (no password)
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      role: updatedUser.role,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      updatedBy: updatedUser.updatedBy
    };
    
    res.json({
      message: 'User updated successfully',
      user: userResponse,
      changes,
      code: 'USER_UPDATED'
    });
    
  } catch (error) {
    securityLog('user_update_error', 'high', {
      error: error.message,
      userId: req.params.id,
      updatedBy: req.user.id
    }, req);
    
    res.status(500).json({
      error: 'Failed to update user',
      code: 'USER_UPDATE_ERROR'
    });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', requireRole(ROLES.ADMIN), [
  param('id').trim().isLength({ min: 1 }).withMessage('User ID is required')
], handleValidationErrors, (req, res) => {
  try {
    const { id } = req.params;
    
    // Find user
    const userToDelete = Array.from(users.values()).find(user => user.id === id);
    if (!userToDelete) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Prevent admin from deleting themselves
    if (req.user.id === id) {
      return res.status(400).json({
        error: 'Cannot delete your own account',
        code: 'SELF_DELETION_DENIED'
      });
    }
    
    // Remove user
    users.delete(userToDelete.email);
    
    // Audit log
    auditLog('user_deleted', {
      deletedUserId: id,
      email: userToDelete.email,
      role: userToDelete.role,
      deletedBy: req.user.id
    }, req);
    
    res.json({
      message: 'User deleted successfully',
      user: {
        id: userToDelete.id,
        email: userToDelete.email,
        firstName: userToDelete.firstName,
        lastName: userToDelete.lastName,
        role: userToDelete.role
      },
      code: 'USER_DELETED'
    });
    
  } catch (error) {
    securityLog('user_deletion_error', 'high', {
      error: error.message,
      userId: req.params.id,
      deletedBy: req.user.id
    }, req);
    
    res.status(500).json({
      error: 'Failed to delete user',
      code: 'USER_DELETE_ERROR'
    });
  }
});

// POST /api/users/:id/reset-password - Reset user password (Admin only)
router.post('/:id/reset-password', requireRole(ROLES.ADMIN), [
  param('id').trim().isLength({ min: 1 }).withMessage('User ID is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    // Find user
    const userToUpdate = Array.from(users.values()).find(user => user.id === id);
    if (!userToUpdate) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Validate password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors,
        code: 'WEAK_PASSWORD'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update user password and reset failed attempts
    userToUpdate.password = hashedPassword;
    userToUpdate.failedAttempts = 0;
    userToUpdate.lockedUntil = null;
    userToUpdate.updatedAt = new Date().toISOString();
    userToUpdate.updatedBy = req.user.id;
    
    // Store updated user
    users.set(userToUpdate.email, userToUpdate);
    
    // Audit log
    auditLog('password_reset', {
      targetUserId: id,
      email: userToUpdate.email,
      resetBy: req.user.id
    }, req);
    
    securityLog('admin_password_reset', 'medium', {
      targetUserId: id,
      targetEmail: userToUpdate.email,
      resetBy: req.user.id
    }, req);
    
    res.json({
      message: 'Password reset successfully',
      code: 'PASSWORD_RESET'
    });
    
  } catch (error) {
    securityLog('password_reset_error', 'high', {
      error: error.message,
      targetUserId: req.params.id,
      resetBy: req.user.id
    }, req);
    
    res.status(500).json({
      error: 'Failed to reset password',
      code: 'PASSWORD_RESET_ERROR'
    });
  }
});

// POST /api/users/:id/unlock - Unlock user account (Admin only)
router.post('/:id/unlock', requireRole(ROLES.ADMIN), [
  param('id').trim().isLength({ min: 1 }).withMessage('User ID is required')
], handleValidationErrors, (req, res) => {
  try {
    const { id } = req.params;
    
    // Find user
    const userToUnlock = Array.from(users.values()).find(user => user.id === id);
    if (!userToUnlock) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Check if user is actually locked
    if (!userToUnlock.lockedUntil || userToUnlock.lockedUntil <= Date.now()) {
      return res.status(400).json({
        error: 'User account is not locked',
        code: 'USER_NOT_LOCKED'
      });
    }
    
    // Unlock user
    userToUnlock.failedAttempts = 0;
    userToUnlock.lockedUntil = null;
    userToUnlock.updatedAt = new Date().toISOString();
    userToUnlock.updatedBy = req.user.id;
    
    // Store updated user
    users.set(userToUnlock.email, userToUnlock);
    
    // Audit log
    auditLog('account_unlocked', {
      unlockedUserId: id,
      email: userToUnlock.email,
      unlockedBy: req.user.id
    }, req);
    
    res.json({
      message: 'User account unlocked successfully',
      code: 'ACCOUNT_UNLOCKED'
    });
    
  } catch (error) {
    securityLog('account_unlock_error', 'medium', {
      error: error.message,
      targetUserId: req.params.id,
      unlockedBy: req.user.id
    }, req);
    
    res.status(500).json({
      error: 'Failed to unlock account',
      code: 'ACCOUNT_UNLOCK_ERROR'
    });
  }
});

// GET /api/users/profile - Get current user's profile
router.get('/profile', (req, res) => {
  try {
    // Get fresh user data
    const user = Array.from(users.values()).find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const userProfile = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: req.user.permissions,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    res.json({
      profile: userProfile,
      code: 'PROFILE_DATA'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get user profile',
      code: 'PROFILE_ERROR'
    });
  }
});

module.exports = router;