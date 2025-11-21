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
      code: error.code
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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

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

module.exports = router;
