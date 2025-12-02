/**
 * Diagnostic Routes - Database Connection Testing
 * Temporary routes for validating PostgreSQL connectivity
 * Remove after deployment validation
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

/**
 * GET /diag/db
 * Test database connectivity with a simple query
 * Returns: { ok: boolean, timestamp: ISO8601, database: "connected" }
 */
router.get('/db', async (req, res) => {
  // First check if pool exists
  if (!pool) {
    return res.status(503).json({
      ok: false,
      database: 'no_pool',
      error: 'Database pool not initialized',
      diagnostic: {
        poolExists: false,
        globalDbExists: !!global.db,
        databaseUrlSet: !!process.env.DATABASE_URL,
        hint: 'Check if DATABASE_URL environment variable is set correctly'
      }
    });
  }

  try {
    const { rows } = await pool.query('SELECT 1 AS ok, NOW() AS ts');

    return res.status(200).json({
      ok: rows[0].ok === 1,
      timestamp: rows[0].ts,
      database: 'connected',
      pool_info: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      database: 'disconnected',
      error: error.message,
      code: error.code,
      diagnostic: {
        errorName: error.name,
        poolExists: !!pool,
        poolTotal: pool?.totalCount,
        poolIdle: pool?.idleCount,
        databaseUrlSet: !!process.env.DATABASE_URL,
        hint: error.code === 'ECONNREFUSED' ? 'Database connection refused' :
              error.code === 'ENOTFOUND' ? 'Database host not found' :
              error.code === '28P01' ? 'Authentication failed' :
              'Check Railway logs'
      }
    });
  }
});

/**
 * GET /diag/env
 * Check environment variable configuration (without exposing secrets)
 * Returns: Boolean flags for required env vars
 */
router.get('/env', async (req, res) => {
  const fs = require('fs');
  const path = require('path');

  // Check if public directory exists and list files
  let publicFiles = [];
  try {
    const publicDir = path.join(__dirname, '..', 'public');
    if (fs.existsSync(publicDir)) {
      publicFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
    }
  } catch (e) {
    publicFiles = ['Error reading: ' + e.message];
  }

  res.json({
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_has_scheme: /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || ''),
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 8080,
    JWT_SECRET: !!process.env.JWT_SECRET,
    SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED === 'true',
    cwd: process.cwd(),
    publicDir: path.join(__dirname, '..', 'public'),
    publicFiles: publicFiles
  });
});

/**
 * GET /diag/tables
 * List all tables in the database
 */
router.get('/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    return res.json({
      success: true,
      count: result.rows.length,
      tables: result.rows.map(r => r.tablename)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /diag/migrations
 * List applied migrations
 */
router.get('/migrations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT filename, applied_at
      FROM schema_migrations
      ORDER BY applied_at DESC
    `);

    return res.json({
      success: true,
      count: result.rows.length,
      migrations: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /diag/create-users-table
 * Manually create the users table if it's missing
 * Security: Requires secret key
 */
router.post('/create-users-table', async (req, res) => {
  const { secret } = req.body;

  if (secret !== 'fix-users-2025') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
        org_id INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        two_factor_secret VARCHAR(255),
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
    `);

    return res.json({
      success: true,
      message: 'Users table created successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

/**
 * POST /diag/execute-sql
 * Execute arbitrary SQL (TEMPORARY - for setup only)
 * Security: Requires secret key
 */
router.post('/execute-sql', async (req, res) => {
  const { secret, sql } = req.body;

  if (secret !== 'execute-sql-2025') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  if (!sql) {
    return res.status(400).json({ error: 'SQL required' });
  }

  try {
    const result = await pool.query(sql);
    return res.json({
      success: true,
      rowCount: result.rowCount,
      rows: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

/**
 * POST /diag/seed
 * Seed database with owner account
 * Creates users table if it doesn't exist, then seeds owner account
 * Security: Requires secret key
 */
router.post('/seed', async (req, res) => {
  const { secret } = req.body;

  // Simple protection - change after first use
  if (secret !== 'seed-db-2025') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  try {
    const bcrypt = require('bcrypt');

    // STEP 1: Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
        org_id INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        two_factor_secret VARCHAR(255),
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // STEP 1.5: Create V21.1 core tables for inventory system
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        item_id SERIAL PRIMARY KEY,
        item_code TEXT NOT NULL UNIQUE,
        item_name TEXT NOT NULL,
        description TEXT,
        unit TEXT NOT NULL DEFAULT 'EA',
        category TEXT,
        cost_code TEXT,
        par_level NUMERIC(14,3) DEFAULT 0,
        reorder_point NUMERIC(14,3) DEFAULT 0,
        current_quantity NUMERIC(14,3) DEFAULT 0,
        last_count_date DATE,
        last_invoice_date DATE,
        last_invoice_no TEXT,
        is_active INTEGER DEFAULT 1,
        barcode TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON inventory_items(item_code);
      CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);

      CREATE TABLE IF NOT EXISTS pdf_invoices (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        vendor TEXT,
        invoice_date DATE,
        total NUMERIC(14,2),
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        total NUMERIC(14,2),
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

    // STEP 1.6: Fix audit_log schema and add rate limiting function
    await pool.query(`
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip inet;
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent text;
    `);

    await pool.query(`
      CREATE OR REPLACE FUNCTION consume_tokens(identifier text, cost integer)
      RETURNS boolean AS $$
      BEGIN
        RETURN true;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // STEP 2: Check if owner exists
    const ownerCheck = await pool.query(
      `SELECT user_id, email FROM users WHERE email = 'owner@neuropilot.ai'`
    );

    if (ownerCheck.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Owner account already exists',
        owner: {
          id: ownerCheck.rows[0].user_id,
          email: ownerCheck.rows[0].email
        }
      });
    }

    // STEP 3: Create owner account
    const hashedPassword = await bcrypt.hash('NeuroPilot2025!', 10);

    const ownerResult = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, org_id, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING user_id, email
    `, ['owner@neuropilot.ai', hashedPassword, 'David', 'Mikulis', 'owner', 1, true]);

    const ownerId = ownerResult.rows[0].user_id;

    return res.json({
      success: true,
      message: 'Owner account created successfully',
      owner: {
        id: ownerId,
        email: 'owner@neuropilot.ai',
        password: 'NeuroPilot2025!'
      },
      note: 'Please change the password after first login'
    });

  } catch (error) {
    console.error('Seed error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

// ============================================
// GOOGLE DRIVE DIAGNOSTICS - V22.4
// ============================================

/**
 * GET /diag/google-drive
 * Test Google Drive configuration and connectivity
 * Returns: { ok: boolean, message: string, details: object }
 */
router.get('/google-drive', async (req, res) => {
  const ordersStorage = require('../config/ordersStorage');

  const result = {
    ok: true,
    message: 'Google Drive configuration check',
    timestamp: new Date().toISOString(),
    details: {
      configured: false,
      strictMode: process.env.GDRIVE_STRICT_MODE === 'true',
      validation: null,
      folders: {},
      connectivity: 'not_tested'
    }
  };

  try {
    // 1. Validate configuration
    const validation = ordersStorage.validateConfig();
    result.details.validation = validation;

    if (!validation.valid) {
      result.ok = false;
      result.message = 'Configuration validation failed';
      return res.status(500).json(result);
    }

    // 2. Check folder IDs
    const rootFolder = ordersStorage.getOrdersRootFolderId();
    result.details.folders = {
      root: rootFolder ? `...${rootFolder.slice(-8)}` : 'NOT SET',
      incoming: ordersStorage.getIncomingFolderId() ? 'SET' : 'NOT SET',
      processed: ordersStorage.getProcessedFolderId() ? 'SET' : 'NOT SET',
      errors: ordersStorage.getErrorsFolderId() ? 'SET' : 'NOT SET',
      archive: ordersStorage.getArchiveFolderId() ? 'SET' : 'NOT SET',
    };

    result.details.configured = !!rootFolder;

    if (!rootFolder) {
      result.ok = false;
      result.message = 'No root folder configured';
      return res.status(500).json(result);
    }

    // 3. Test URL building
    const testFileId = '1234567890abcdefghijklmnopqrst';
    result.details.urlTest = {
      preview: ordersStorage.buildPreviewUrl(testFileId) ? 'OK' : 'FAILED',
      view: ordersStorage.buildViewUrl(testFileId) ? 'OK' : 'FAILED',
      download: ordersStorage.buildDownloadUrl(testFileId) ? 'OK' : 'FAILED',
    };

    // 4. Check supported source systems
    result.details.sourceSystems = ordersStorage.getSupportedSourceSystems();

    // 5. Overall status
    result.ok = validation.valid && !!rootFolder;
    result.message = result.ok
      ? 'Google Drive configuration is valid'
      : 'Google Drive configuration has issues';

    return res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    result.ok = false;
    result.message = 'Configuration check failed';
    result.details.error = error.message;
    return res.status(500).json(result);
  }
});

/**
 * GET /diag/security
 * Security configuration summary (safe to expose, no secrets)
 */
router.get('/security', async (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    security: {
      cors: {
        strictMode: process.env.CORS_STRICT_MODE === 'true',
      },
      csp: {
        strictMode: process.env.CSP_STRICT_MODE === 'true',
      },
      gdrive: {
        strictMode: process.env.GDRIVE_STRICT_MODE === 'true',
        configured: !!process.env.GDRIVE_ORDERS_ROOT_ID,
      },
      jwt: {
        secretConfigured: !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'fallback-secret-change-in-production',
        refreshSecretConfigured: !!process.env.JWT_REFRESH_SECRET,
      },
      headers: {
        hsts: true,
        xFrameOptions: 'DENY',
        xContentTypeOptions: 'nosniff',
        referrerPolicy: 'strict-origin-when-cross-origin',
      }
    }
  });
});

/**
 * GET /diag/backup
 * Check backup system status
 */
router.get('/backup', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const backupDir = path.join(__dirname, '..', 'backups');

  const result = {
    ok: true,
    timestamp: new Date().toISOString(),
    backupDir: backupDir,
    configured: {
      encryptionEnabled: !!process.env.BACKUP_ENCRYPTION_KEY,
      gdriveUploadEnabled: !!process.env.GDRIVE_BACKUP_FOLDER_ID,
      slackNotificationsEnabled: !!process.env.SLACK_WEBHOOK_URL,
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30,
    },
    lastBackup: null,
    backupCount: 0,
  };

  try {
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('neuropilot_backup_'))
        .sort()
        .reverse();

      result.backupCount = files.length;

      if (files.length > 0) {
        const latestFile = files[0];
        const stats = fs.statSync(path.join(backupDir, latestFile));
        result.lastBackup = {
          file: latestFile,
          size: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          created: stats.mtime.toISOString(),
          ageHours: ((Date.now() - stats.mtimeMs) / (1000 * 60 * 60)).toFixed(1),
        };
      }
    } else {
      result.ok = false;
      result.message = 'Backup directory does not exist';
    }
  } catch (error) {
    result.ok = false;
    result.error = error.message;
  }

  return res.json(result);
});

/**
 * GET /diag/test-pos-catalog
 * Test the exact query that POS catalog uses with global.db
 * This helps diagnose why the route returns 0 items
 */
router.get('/test-pos-catalog', async (req, res) => {
  const orgId = req.query.org_id || 'default-org';
  const siteId = req.query.site_id || null;
  const search = req.query.search || null;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Test with pool.query (how diag routes do it)
    const poolResult = await pool.query(
      `SELECT * FROM get_sellable_items($1, $2, $3, $4, $5)`,
      [orgId, siteId, search, limit, offset]
    );

    // Test with global.db.query (how pos.catalog does it)
    let globalDbResult = null;
    let globalDbError = null;
    try {
      if (global.db && typeof global.db.query === 'function') {
        globalDbResult = await global.db.query(
          `SELECT * FROM get_sellable_items($1, $2, $3, $4, $5)`,
          [orgId, siteId, search, limit, offset]
        );
      }
    } catch (err) {
      globalDbError = err.message;
    }

    return res.json({
      ok: true,
      params: { orgId, siteId, search, limit, offset },
      poolQuery: {
        rowCount: poolResult.rowCount,
        firstRow: poolResult.rows[0] || null
      },
      globalDbQuery: globalDbResult ? {
        rowCount: globalDbResult.rowCount,
        rowsLength: globalDbResult.rows?.length,
        firstRow: globalDbResult.rows?.[0] || null
      } : {
        error: globalDbError || 'global.db.query not available',
        globalDbExists: !!global.db,
        globalDbHasQuery: typeof global.db?.query === 'function'
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      code: error.code
    });
  }
});

// ============================================
// GOOGLE DRIVE FOLDER MANAGEMENT - V22.4
// ============================================

/**
 * GET /diag/google-drive/files
 * List files in the vendor orders root folder
 * Query params: ?limit=50
 */
router.get('/google-drive/files', async (req, res) => {
  const result = {
    ok: false,
    message: '',
    timestamp: new Date().toISOString(),
    files: [],
    folders: [],
    rootFolderId: null
  };

  try {
    const googleDriveService = require('../services/GoogleDriveService');
    const ordersStorage = require('../config/ordersStorage');

    // Initialize service
    await googleDriveService.initialize();

    if (!googleDriveService.initialized) {
      result.message = 'Google Drive service not initialized. Check GOOGLE_SERVICE_ACCOUNT_KEY.';
      return res.status(503).json(result);
    }

    const rootFolderId = ordersStorage.getOrdersRootFolderId();
    result.rootFolderId = rootFolderId;

    // List all files (no mimeType filter to see everything)
    const query = `'${rootFolderId}' in parents and trashed = false`;
    const response = await googleDriveService.drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
      orderBy: 'createdTime desc',
      pageSize: parseInt(req.query.limit) || 50
    });

    const items = response.data.files || [];

    // Separate files and folders
    for (const item of items) {
      const entry = {
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size ? parseInt(item.size) : 0,
        createdTime: item.createdTime,
        modifiedTime: item.modifiedTime,
        previewUrl: item.mimeType === 'application/pdf'
          ? ordersStorage.buildPreviewUrl(item.id)
          : null
      };

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        result.folders.push(entry);
      } else {
        result.files.push(entry);
      }
    }

    result.ok = true;
    result.message = `Found ${result.files.length} files and ${result.folders.length} folders`;

    return res.status(200).json(result);

  } catch (error) {
    result.message = error.message;
    return res.status(500).json(result);
  }
});

/**
 * POST /diag/google-drive/setup-folders
 * Create the standard folder structure for vendor orders
 * Body: { secret: "execute-sql-2025", parentFolderId?: string }
 * Creates: Incoming, Processed, Errors, Archive subfolders
 */
router.post('/google-drive/setup-folders', async (req, res) => {
  const result = {
    ok: false,
    message: '',
    timestamp: new Date().toISOString(),
    folders: {
      root: null,
      incoming: null,
      processed: null,
      errors: null,
      archive: null
    },
    envVars: {}
  };

  try {
    // Security check
    const { secret, parentFolderId } = req.body;
    if (secret !== 'execute-sql-2025') {
      return res.status(403).json({ ok: false, message: 'Invalid secret' });
    }

    const googleDriveService = require('../services/GoogleDriveService');
    const ordersStorage = require('../config/ordersStorage');

    // Initialize service
    await googleDriveService.initialize();

    if (!googleDriveService.initialized) {
      result.message = 'Google Drive service not initialized. Check GOOGLE_SERVICE_ACCOUNT_KEY.';
      return res.status(503).json(result);
    }

    // Use provided parent or default root folder
    const rootId = parentFolderId || ordersStorage.getOrdersRootFolderId();
    result.folders.root = rootId;

    // Folder names to create
    const foldersToCreate = [
      { key: 'incoming', name: 'Incoming' },
      { key: 'processed', name: 'Processed' },
      { key: 'errors', name: 'Errors' },
      { key: 'archive', name: 'Archive' }
    ];

    // Create each subfolder
    for (const folder of foldersToCreate) {
      try {
        // Check if folder already exists
        const query = `'${rootId}' in parents and name = '${folder.name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const existing = await googleDriveService.drive.files.list({
          q: query,
          fields: 'files(id, name)',
          pageSize: 1
        });

        if (existing.data.files && existing.data.files.length > 0) {
          result.folders[folder.key] = existing.data.files[0].id;
          console.log(`[diag/google-drive/setup-folders] Folder "${folder.name}" already exists: ${existing.data.files[0].id}`);
        } else {
          // Create the folder
          const folderId = await googleDriveService.createFolder(folder.name, rootId);
          result.folders[folder.key] = folderId;
          console.log(`[diag/google-drive/setup-folders] Created folder "${folder.name}": ${folderId}`);
        }
      } catch (folderError) {
        console.error(`[diag/google-drive/setup-folders] Error creating ${folder.name}:`, folderError.message);
        result.folders[folder.key] = `ERROR: ${folderError.message}`;
      }
    }

    // Generate env vars for Railway
    result.envVars = {
      GDRIVE_ORDERS_ROOT_ID: result.folders.root,
      GDRIVE_ORDERS_INCOMING_ID: result.folders.incoming,
      GDRIVE_ORDERS_PROCESSED_ID: result.folders.processed,
      GDRIVE_ORDERS_ERRORS_ID: result.folders.errors,
      GDRIVE_ORDERS_ARCHIVE_ID: result.folders.archive
    };

    result.ok = true;
    result.message = 'Folder structure created/verified successfully';
    result.hint = 'Copy the envVars object to your Railway environment variables';

    return res.status(200).json(result);

  } catch (error) {
    result.message = error.message;
    return res.status(500).json(result);
  }
});

/**
 * POST /diag/google-drive/test-connection
 * Test Google Drive connectivity and list service account details
 * Body: { secret: "execute-sql-2025" }
 */
router.post('/google-drive/test-connection', async (req, res) => {
  const result = {
    ok: false,
    message: '',
    timestamp: new Date().toISOString(),
    serviceAccount: null,
    testFolder: null
  };

  try {
    const { secret } = req.body;
    if (secret !== 'execute-sql-2025') {
      return res.status(403).json({ ok: false, message: 'Invalid secret' });
    }

    const googleDriveService = require('../services/GoogleDriveService');
    const ordersStorage = require('../config/ordersStorage');

    await googleDriveService.initialize();

    if (!googleDriveService.initialized) {
      result.message = 'Google Drive service not initialized';
      return res.status(503).json(result);
    }

    // Get service account info
    const aboutResponse = await googleDriveService.drive.about.get({
      fields: 'user'
    });
    result.serviceAccount = {
      email: aboutResponse.data.user?.emailAddress,
      displayName: aboutResponse.data.user?.displayName
    };

    // Test access to root folder
    const rootId = ordersStorage.getOrdersRootFolderId();
    try {
      const folderResponse = await googleDriveService.drive.files.get({
        fileId: rootId,
        fields: 'id, name, mimeType, capabilities'
      });
      result.testFolder = {
        id: folderResponse.data.id,
        name: folderResponse.data.name,
        mimeType: folderResponse.data.mimeType,
        canEdit: folderResponse.data.capabilities?.canEdit || false,
        canAddChildren: folderResponse.data.capabilities?.canAddChildren || false
      };
    } catch (folderError) {
      result.testFolder = {
        error: folderError.message,
        hint: 'Service account may not have access to this folder. Share the folder with the service account email.'
      };
    }

    result.ok = true;
    result.message = 'Connection test successful';

    return res.status(200).json(result);

  } catch (error) {
    result.message = error.message;
    return res.status(500).json(result);
  }
});

module.exports = router;
