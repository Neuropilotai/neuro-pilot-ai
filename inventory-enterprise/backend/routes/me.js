/**
 * /api/me - User Profile and Tenancy Routes
 * Provides authenticated user's profile information and org/site tenancy
 */

const express = require('express');
const router = express.Router();

// GET /api/me/tenancy
// Returns the authenticated user's org_id and site_id for multi-tenant operations
router.get('/tenancy', async (req, res) => {
  try {
    // req.user is populated by authGuard middleware
    const userId = req.user.user_id || req.user.id;

    // Query database for user's org and site associations
    // V21.1: Users can belong to multiple orgs/sites, return primary association
    const result = await global.db.query(
      `SELECT
        u.org_id,
        u.site_id,
        o.name as org_name,
        s.name as site_name
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      LEFT JOIN sites s ON u.site_id = s.id
      WHERE u.id = $1 AND u.is_active = true
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // User not found in database, return defaults from JWT
      // This handles cases where auth uses in-memory users (legacy)
      return res.json({
        success: true,
        data: {
          org_id: req.user.org_id || 1,
          site_id: req.user.site_id || 1,
          org_name: req.user.org_name || 'Default Organization',
          site_name: req.user.site_name || 'Default Site'
        },
        source: 'jwt_fallback'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        org_id: user.org_id,
        site_id: user.site_id,
        org_name: user.org_name,
        site_name: user.site_name
      },
      source: 'database'
    });

  } catch (error) {
    console.error('Tenancy lookup error:', error);

    // Fail gracefully with defaults
    res.json({
      success: true,
      data: {
        org_id: req.user?.org_id || 1,
        site_id: req.user?.site_id || 1,
        org_name: 'Default Organization',
        site_name: 'Default Site'
      },
      source: 'error_fallback',
      warning: 'Database query failed, using defaults'
    });
  }
});

// GET /api/me
// Returns authenticated user's profile information
router.get('/', async (req, res) => {
  try {
    const userId = req.user.user_id || req.user.id;

    // Try to get user from database
    const result = await global.db.query(
      `SELECT
        id,
        email,
        first_name,
        last_name,
        role,
        org_id,
        site_id,
        is_active,
        created_at,
        last_login
      FROM users
      WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Fallback to JWT data
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
          org_id: req.user.org_id,
          site_id: req.user.site_id
        },
        source: 'jwt'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        org_id: user.org_id,
        site_id: user.site_id,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLogin: user.last_login
      },
      source: 'database'
    });

  } catch (error) {
    console.error('User profile error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user profile',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
