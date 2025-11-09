/**
 * Two-Factor Authentication (TOTP) Middleware - v2.8.0
 * Implements TOTP-based 2FA with backup codes
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

class TwoFactorAuth {
  constructor(db) {
    this.db = db;
    this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY, 'hex');
    this.require2FAForAdmins = process.env.REQUIRE_2FA_FOR_ADMINS === 'true';

    if (!this.encryptionKey || this.encryptionKey.length !== 32) {
      console.warn('⚠ ENCRYPTION_KEY not properly configured for 2FA');
    }
  }

  /**
   * Setup 2FA for a user
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @returns {Promise<Object>} - QR code and backup codes
   */
  async setupTOTP(userId, userEmail) {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `NeuroInnovate Inventory (${userEmail})`,
        issuer: 'NeuroInnovate',
        length: 32
      });

      // Generate QR code as base64 PNG
      const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes(10);

      // Encrypt secret and backup codes
      const secretEncrypted = this.encrypt(secret.base32);
      const backupCodesEncrypted = JSON.stringify(
        backupCodes.map(code => this.hashBackupCode(code))
      );

      // Check if user already has 2FA
      const existing = await this.db.get(
        'SELECT * FROM two_factor_auth WHERE user_id = ?',
        [userId]
      );

      if (existing) {
        // Update existing
        await this.db.run(
          `UPDATE two_factor_auth
           SET secret_encrypted = ?, backup_codes = ?, enabled = 0, created_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [secretEncrypted, backupCodesEncrypted, userId]
        );
      } else {
        // Insert new
        await this.db.run(
          `INSERT INTO two_factor_auth (user_id, secret_encrypted, backup_codes, enabled)
           VALUES (?, ?, ?, 0)`,
          [userId, secretEncrypted, backupCodesEncrypted]
        );
      }

      console.log(`2FA setup initiated for user: ${userId}`);

      return {
        secret: secret.base32,
        otpauthURL: secret.otpauth_url,
        qrCode: qrCodeDataURL,
        backupCodes: backupCodes // Show once, then user must save
      };

    } catch (error) {
      console.error('2FA setup error:', error);
      throw new Error(`Failed to setup 2FA: ${error.message}`);
    }
  }

  /**
   * Verify TOTP token and enable 2FA
   * @param {string} userId - User ID
   * @param {string} token - 6-digit TOTP token
   * @returns {Promise<Object>} - Verification result
   */
  async verifyTOTP(userId, token) {
    try {
      // Get user's 2FA data
      const user2FA = await this.db.get(
        'SELECT secret_encrypted, enabled FROM two_factor_auth WHERE user_id = ?',
        [userId]
      );

      if (!user2FA) {
        return {
          valid: false,
          reason: '2FA not configured. Call /setup first.'
        };
      }

      // Decrypt secret
      const secret = this.decrypt(user2FA.secret_encrypted);

      // Verify token with 30-second window (±1 time step)
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 1
      });

      if (verified) {
        // Enable 2FA on first successful verification
        if (!user2FA.enabled) {
          await this.db.run(
            'UPDATE two_factor_auth SET enabled = 1, last_used_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [userId]
          );
          console.log(`2FA enabled for user: ${userId}`);
        } else {
          // Update last used timestamp
          await this.db.run(
            'UPDATE two_factor_auth SET last_used_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [userId]
          );
        }

        return {
          valid: true,
          message: '2FA verified successfully'
        };
      } else {
        return {
          valid: false,
          reason: 'Invalid token'
        };
      }

    } catch (error) {
      console.error('2FA verification error:', error);
      return {
        valid: false,
        reason: 'Verification failed',
        error: error.message
      };
    }
  }

  /**
   * Verify backup code
   * @param {string} userId - User ID
   * @param {string} code - Backup code
   * @returns {Promise<Object>} - Verification result
   */
  async verifyBackupCode(userId, code) {
    try {
      const user2FA = await this.db.get(
        'SELECT backup_codes FROM two_factor_auth WHERE user_id = ? AND enabled = 1',
        [userId]
      );

      if (!user2FA) {
        return {
          valid: false,
          reason: '2FA not enabled'
        };
      }

      const backupCodes = JSON.parse(user2FA.backup_codes);
      const codeHash = this.hashBackupCode(code);

      const validIndex = backupCodes.findIndex(hash => hash === codeHash);

      if (validIndex !== -1) {
        // Remove used backup code
        backupCodes.splice(validIndex, 1);

        await this.db.run(
          'UPDATE two_factor_auth SET backup_codes = ?, last_used_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [JSON.stringify(backupCodes), userId]
        );

        console.log(`Backup code used for user: ${userId} (${backupCodes.length} remaining)`);

        return {
          valid: true,
          message: 'Backup code accepted',
          remainingCodes: backupCodes.length
        };
      }

      return {
        valid: false,
        reason: 'Invalid backup code'
      };

    } catch (error) {
      console.error('Backup code verification error:', error);
      return {
        valid: false,
        reason: 'Verification failed',
        error: error.message
      };
    }
  }

  /**
   * Disable 2FA for a user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async disable2FA(userId) {
    try {
      await this.db.run(
        'DELETE FROM two_factor_auth WHERE user_id = ?',
        [userId]
      );

      console.log(`2FA disabled for user: ${userId}`);
      return true;

    } catch (error) {
      console.error('2FA disable error:', error);
      throw new Error(`Failed to disable 2FA: ${error.message}`);
    }
  }

  /**
   * Check if user has 2FA enabled
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async is2FAEnabled(userId) {
    try {
      const user2FA = await this.db.get(
        'SELECT enabled FROM two_factor_auth WHERE user_id = ?',
        [userId]
      );

      return user2FA?.enabled === 1 || user2FA?.enabled === true;

    } catch (error) {
      console.error('2FA status check error:', error);
      return false;
    }
  }

  /**
   * Get 2FA stats for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async get2FAStats(userId) {
    try {
      const user2FA = await this.db.get(
        'SELECT enabled, created_at, last_used_at, backup_codes FROM two_factor_auth WHERE user_id = ?',
        [userId]
      );

      if (!user2FA) {
        return {
          enabled: false
        };
      }

      const backupCodes = JSON.parse(user2FA.backup_codes || '[]');

      return {
        enabled: user2FA.enabled === 1 || user2FA.enabled === true,
        createdAt: user2FA.created_at,
        lastUsedAt: user2FA.last_used_at,
        remainingBackupCodes: backupCodes.length
      };

    } catch (error) {
      console.error('2FA stats error:', error);
      return { enabled: false };
    }
  }

  /**
   * Generate backup codes
   * @param {number} count - Number of codes to generate
   * @returns {Array<string>}
   */
  generateBackupCodes(count = 10) {
    return Array.from({ length: count }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
  }

  /**
   * Hash backup code for storage
   * @param {string} code - Backup code
   * @returns {string} - SHA-256 hash
   */
  hashBackupCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} text - Plain text
   * @returns {string} - Encrypted JSON
   */
  encrypt(text) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted: encrypted,
      authTag: authTag.toString('hex')
    });
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encryptedData - Encrypted JSON
   * @returns {string} - Plain text
   */
  decrypt(encryptedData) {
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);
    const algorithm = 'aes-256-gcm';

    const decipher = crypto.createDecipheriv(
      algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Middleware to require 2FA verification
   * Call after authentication middleware
   */
  require2FAVerification() {
    return async (req, res, next) => {
      // Skip if 2FA not required globally
      if (!this.require2FAForAdmins) {
        return next();
      }

      // Skip if user is not admin
      if (req.user?.role !== 'admin') {
        return next();
      }

      // Check if user has 2FA enabled
      const is2FAEnabled = await this.is2FAEnabled(req.user.id);

      if (!is2FAEnabled) {
        return res.status(403).json({
          error: '2FA required for admin users',
          message: 'Please enable 2FA at /api/2fa/setup'
        });
      }

      // Check if 2FA verified in session
      if (!req.session?.twoFactorVerified) {
        return res.status(403).json({
          error: '2FA verification required',
          message: 'Please verify 2FA at /api/2fa/verify',
          twoFactorRequired: true
        });
      }

      next();
    };
  }
}

module.exports = TwoFactorAuth;
