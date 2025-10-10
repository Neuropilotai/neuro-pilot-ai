/**
 * Two-Factor Authentication API Routes - v2.8.0
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const TwoFactorAuth = require('../middleware/security_2fa');

// Will be initialized with DB
let twoFactorAuth = null;

/**
 * Initialize 2FA service
 */
function initialize2FA(db) {
  twoFactorAuth = new TwoFactorAuth(db);
  console.log('✓ 2FA service initialized');
}

/**
 * Validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /api/2fa/setup
 * Initialize 2FA for current user
 */
router.post('/setup', async (req, res) => {
  try {
    if (!twoFactorAuth) {
      return res.status(503).json({
        error: '2FA service unavailable'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const { id: userId, email } = req.user;

    const setup = await twoFactorAuth.setupTOTP(userId, email);

    res.json({
      success: true,
      message: 'Scan QR code with authenticator app (Google Authenticator, Authy, etc.)',
      qrCode: setup.qrCode,
      otpauthURL: setup.otpauthURL,
      backupCodes: setup.backupCodes,
      warning: 'Save backup codes in a secure location. They will not be shown again.'
    });

  } catch (error) {
    console.error('2FA setup error:', error);

    res.status(500).json({
      error: 'Failed to setup 2FA',
      message: error.message
    });
  }
});

/**
 * POST /api/2fa/verify
 * Verify TOTP token and enable 2FA
 */
router.post('/verify',
  [
    body('token').trim().isLength({ min: 6, max: 6 }).isNumeric()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      if (!twoFactorAuth) {
        return res.status(503).json({
          error: '2FA service unavailable'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      const { token } = req.body;
      const { id: userId } = req.user;

      const result = await twoFactorAuth.verifyTOTP(userId, token);

      if (result.valid) {
        // Set session flag for 2FA verification
        if (req.session) {
          req.session.twoFactorVerified = true;
        }

        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Invalid 2FA token',
          reason: result.reason
        });
      }

    } catch (error) {
      console.error('2FA verification error:', error);

      res.status(500).json({
        error: 'Failed to verify 2FA',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/2fa/verify-backup
 * Verify backup code
 */
router.post('/verify-backup',
  [
    body('code').trim().notEmpty()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      if (!twoFactorAuth) {
        return res.status(503).json({
          error: '2FA service unavailable'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      const { code } = req.body;
      const { id: userId } = req.user;

      const result = await twoFactorAuth.verifyBackupCode(userId, code);

      if (result.valid) {
        // Set session flag for 2FA verification
        if (req.session) {
          req.session.twoFactorVerified = true;
        }

        res.json({
          success: true,
          message: result.message,
          remainingCodes: result.remainingCodes,
          warning: result.remainingCodes < 3 ? 'Low backup codes remaining. Generate new ones soon.' : null
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Invalid backup code',
          reason: result.reason
        });
      }

    } catch (error) {
      console.error('Backup code verification error:', error);

      res.status(500).json({
        error: 'Failed to verify backup code',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/2fa/disable
 * Disable 2FA for current user
 */
router.post('/disable', async (req, res) => {
  try {
    if (!twoFactorAuth) {
      return res.status(503).json({
        error: '2FA service unavailable'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const { id: userId } = req.user;

    await twoFactorAuth.disable2FA(userId);

    // Clear session flag
    if (req.session) {
      req.session.twoFactorVerified = false;
    }

    res.json({
      success: true,
      message: '2FA has been disabled'
    });

  } catch (error) {
    console.error('2FA disable error:', error);

    res.status(500).json({
      error: 'Failed to disable 2FA',
      message: error.message
    });
  }
});

/**
 * GET /api/2fa/status
 * Get 2FA status for current user
 */
router.get('/status', async (req, res) => {
  try {
    if (!twoFactorAuth) {
      return res.status(503).json({
        error: '2FA service unavailable'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const { id: userId } = req.user;

    const stats = await twoFactorAuth.get2FAStats(userId);

    res.json({
      success: true,
      twoFactor: stats,
      sessionVerified: req.session?.twoFactorVerified || false
    });

  } catch (error) {
    console.error('2FA status error:', error);

    res.status(500).json({
      error: 'Failed to get 2FA status',
      message: error.message
    });
  }
});

module.exports = {
  router,
  initialize2FA
};
