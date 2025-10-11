/**
 * Owner Super Console - Backup & Recovery
 * USB recovery kit creation, verification, dry-run restore
 * Owner-only, localhost-only
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Audit helper
async function auditRecovery(action, userId, details, ipAddress) {
  try {
    const auditSql = `
      INSERT INTO owner_console_events (
        owner_id, event_type, event_data, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `;
    await db.run(auditSql, [
      userId,
      action,
      JSON.stringify(details),
      ipAddress,
      new Date().toISOString()
    ]).catch(() => {
      console.log(`[AUDIT] ${action}:`, details);
    });
  } catch (error) {
    console.error('Audit error:', error);
  }
}

/**
 * POST /api/owner/recovery/backup
 * Create encrypted recovery kit
 * Body: { dest: '/path/to/usb', passphrase: 'secret' }
 */
router.post('/backup', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();
  const { dest, passphrase } = req.body;

  try {
    if (!dest) {
      return res.status(400).json({
        success: false,
        error: 'Destination path required'
      });
    }

    if (!passphrase || passphrase.length < 12) {
      return res.status(400).json({
        success: false,
        error: 'Passphrase must be at least 12 characters'
      });
    }

    // Create recovery kit structure
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const kitName = `recovery_kit_${timestamp}`;
    const kitPath = path.join('/tmp', kitName);

    await fs.mkdir(kitPath, { recursive: true });

    // Step 1: Copy database
    const dbPath = path.join(__dirname, '../db/inventory_enterprise.db');
    const dbBackupPath = path.join(kitPath, 'database.db');
    await fs.copyFile(dbPath, dbBackupPath);

    // Step 2: Export public keys
    const keysPath = path.join(kitPath, 'keys.json');
    const keys = {
      quantumPublicKey: req.app.locals.quantumKeys?.getPublicKey() || null,
      timestamp: new Date().toISOString()
    };
    await fs.writeFile(keysPath, JSON.stringify(keys, null, 2));

    // Step 3: Create manifest
    const dbStats = await fs.stat(dbBackupPath);
    const manifest = {
      created: new Date().toISOString(),
      database: {
        file: 'database.db',
        size: dbStats.size,
        sha256: await calculateSHA256(dbBackupPath)
      },
      keys: {
        file: 'keys.json',
        sha256: await calculateSHA256(keysPath)
      },
      version: '3.2.0',
      creator: req.user.email
    };

    const manifestPath = path.join(kitPath, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Step 4: Create tarball
    const tarballPath = path.join('/tmp', `${kitName}.tar.gz`);
    await execAsync(`tar -czf ${tarballPath} -C /tmp ${kitName}`);

    // Step 5: Encrypt with AES-256-GCM
    const encryptedPath = `${tarballPath}.enc`;
    await encryptFile(tarballPath, encryptedPath, passphrase);

    // Calculate final checksum
    const finalSHA256 = await calculateSHA256(encryptedPath);
    const finalStats = await fs.stat(encryptedPath);

    // Step 6: Copy to destination (if writable)
    let destPath = null;
    try {
      destPath = path.join(dest, `${kitName}.tar.gz.enc`);
      await fs.copyFile(encryptedPath, destPath);
    } catch (error) {
      console.warn('Could not copy to destination:', error.message);
      destPath = encryptedPath; // Keep in /tmp
    }

    // Cleanup temp files
    await fs.rm(kitPath, { recursive: true, force: true });
    await fs.unlink(tarballPath).catch(() => {});

    // Audit
    await auditRecovery('RECOVERY_BACKUP', req.user.id, {
      manifest,
      destPath,
      sha256: finalSHA256,
      size: finalStats.size,
      duration: Date.now() - startTime
    }, req.ip);

    res.json({
      success: true,
      message: 'Recovery kit created successfully',
      kit: {
        filename: path.basename(destPath),
        path: destPath,
        size: finalStats.size,
        sha256: finalSHA256,
        manifest,
        encrypted: true
      },
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Backup error:', error);

    await auditRecovery('RECOVERY_BACKUP_FAILED', req.user.id, {
      error: error.message,
      dest
    }, req.ip);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/recovery/verify
 * Verify recovery kit integrity
 * Body: { path: '/path/to/recovery_kit.tar.gz.enc', passphrase: 'secret' }
 */
router.post('/verify', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();
  const { path: kitPath, passphrase } = req.body;

  try {
    if (!kitPath) {
      return res.status(400).json({
        success: false,
        error: 'Kit path required'
      });
    }

    // Check file exists
    await fs.access(kitPath);

    // Calculate checksum
    const sha256 = await calculateSHA256(kitPath);
    const stats = await fs.stat(kitPath);

    // Try to decrypt and extract manifest (if passphrase provided)
    let manifest = null;
    let verification = { encrypted: true, extractable: false };

    if (passphrase) {
      try {
        // Decrypt
        const decryptedPath = `${kitPath}.decrypted`;
        await decryptFile(kitPath, decryptedPath, passphrase);

        // Extract manifest
        const extractPath = `/tmp/verify_${Date.now()}`;
        await fs.mkdir(extractPath, { recursive: true });
        await execAsync(`tar -xzf ${decryptedPath} -C ${extractPath}`);

        // Read manifest
        const kitName = (await fs.readdir(extractPath))[0];
        const manifestPath = path.join(extractPath, kitName, 'manifest.json');
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

        // Verify checksums in manifest
        const dbPath = path.join(extractPath, kitName, manifest.database.file);
        const dbSHA256 = await calculateSHA256(dbPath);

        verification = {
          encrypted: true,
          extractable: true,
          manifestValid: true,
          databaseIntact: dbSHA256 === manifest.database.sha256,
          passphraseCorrect: true
        };

        // Cleanup
        await fs.unlink(decryptedPath).catch(() => {});
        await fs.rm(extractPath, { recursive: true, force: true });

      } catch (error) {
        verification = {
          encrypted: true,
          extractable: false,
          error: error.message,
          passphraseCorrect: false
        };
      }
    }

    // Audit
    await auditRecovery('RECOVERY_VERIFY', req.user.id, {
      kitPath,
      sha256,
      size: stats.size,
      verification,
      manifest: manifest || 'not_extracted'
    }, req.ip);

    res.json({
      success: true,
      message: 'Recovery kit verified',
      kit: {
        path: kitPath,
        size: stats.size,
        sha256,
        exists: true,
        readable: true
      },
      verification,
      manifest,
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Verify error:', error);

    await auditRecovery('RECOVERY_VERIFY_FAILED', req.user.id, {
      error: error.message,
      kitPath
    }, req.ip);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/recovery/restore
 * Dry-run restore from recovery kit
 * Body: { path: '/path/to/recovery_kit.tar.gz.enc', passphrase: 'secret', dryRun: true }
 */
router.post('/restore', authenticateToken, requireOwner, async (req, res) => {
  const startTime = Date.now();
  const { path: kitPath, passphrase, dryRun } = req.body;

  try {
    if (!kitPath) {
      return res.status(400).json({
        success: false,
        error: 'Kit path required'
      });
    }

    if (!passphrase) {
      return res.status(400).json({
        success: false,
        error: 'Passphrase required for restore'
      });
    }

    if (!dryRun) {
      return res.status(400).json({
        success: false,
        error: 'Only dry-run restore is supported from console (set dryRun: true)'
      });
    }

    // Decrypt
    const decryptedPath = `/tmp/restore_${Date.now()}.tar.gz`;
    await decryptFile(kitPath, decryptedPath, passphrase);

    // Extract
    const extractPath = `/tmp/restore_${Date.now()}`;
    await fs.mkdir(extractPath, { recursive: true });
    await execAsync(`tar -xzf ${decryptedPath} -C ${extractPath}`);

    // Read manifest
    const kitName = (await fs.readdir(extractPath))[0];
    const manifestPath = path.join(extractPath, kitName, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    // Verify database integrity
    const dbPath = path.join(extractPath, kitName, manifest.database.file);
    const dbSHA256 = await calculateSHA256(dbPath);
    const dbIntact = dbSHA256 === manifest.database.sha256;

    // Get database stats
    const dbStats = await fs.stat(dbPath);

    // Dry-run: simulate restore steps
    const restorePlan = [
      { step: 'backup_current_db', action: 'Copy current DB to .bak' },
      { step: 'stop_services', action: 'Stop optional services' },
      { step: 'restore_database', action: `Restore ${manifest.database.file}` },
      { step: 'restore_keys', action: 'Restore public keys' },
      { step: 'restart_services', action: 'Restart services' },
      { step: 'verify_integrity', action: 'Run integrity check' }
    ];

    // Cleanup
    await fs.unlink(decryptedPath).catch(() => {});
    await fs.rm(extractPath, { recursive: true, force: true });

    // Audit
    await auditRecovery('RECOVERY_RESTORE_DRYRUN', req.user.id, {
      kitPath,
      manifest,
      dbIntact,
      restorePlan
    }, req.ip);

    res.json({
      success: true,
      message: 'Dry-run restore completed',
      dryRun: true,
      manifest,
      verification: {
        databaseIntact: dbIntact,
        databaseSize: dbStats.size,
        expectedSHA256: manifest.database.sha256,
        actualSHA256: dbSHA256
      },
      restorePlan,
      warning: 'This was a dry-run. No changes were made to the live system.',
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Restore error:', error);

    await auditRecovery('RECOVERY_RESTORE_FAILED', req.user.id, {
      error: error.message,
      kitPath,
      dryRun
    }, req.ip);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper: Calculate SHA256 of file
async function calculateSHA256(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Helper: Encrypt file with AES-256-GCM
async function encryptFile(inputPath, outputPath, passphrase) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const input = await fs.readFile(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt(32) + iv(16) + authTag(16) + encrypted data
  const output = Buffer.concat([salt, iv, authTag, encrypted]);
  await fs.writeFile(outputPath, output);
}

// Helper: Decrypt file with AES-256-GCM
async function decryptFile(inputPath, outputPath, passphrase) {
  const algorithm = 'aes-256-gcm';
  const data = await fs.readFile(inputPath);

  const salt = data.slice(0, 32);
  const iv = data.slice(32, 48);
  const authTag = data.slice(48, 64);
  const encrypted = data.slice(64);

  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  await fs.writeFile(outputPath, decrypted);
}

module.exports = router;
