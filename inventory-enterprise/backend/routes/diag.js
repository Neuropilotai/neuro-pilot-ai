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
  res.json({
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_has_scheme: /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || ''),
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 8080,
    JWT_SECRET: !!process.env.JWT_SECRET,
    SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED === 'true'
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
 * POST /diag/seed
 * Seed database with owner account
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
    const client = await pool.query('SELECT 1');  // Test connection

    // Check if owner exists
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

    // Create owner account
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
