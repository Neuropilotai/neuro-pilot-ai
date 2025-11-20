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

module.exports = router;
