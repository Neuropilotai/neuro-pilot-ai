/**
 * Version API - NeuroPilot AI Enterprise
 * Exposes app version for diagnostics and UI
 */

const express = require('express');
const router = express.Router();
const { APP_VERSION, APP_VERSION_SHORT } = require('../version');

/**
 * GET /api/version
 * Returns current application version info
 * No authentication required (public endpoint for health checks)
 */
router.get('/version', (req, res) => {
  res.json({
    app: 'NeuroInnovate Inventory Enterprise',
    version: APP_VERSION,
    version_short: APP_VERSION_SHORT,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
