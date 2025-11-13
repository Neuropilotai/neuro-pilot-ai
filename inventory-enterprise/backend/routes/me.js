/**
 * /api/me - User Profile and Tenancy Routes
 * Provides authenticated user's profile information and org/site tenancy
 */

const express = require('express');
const router = express.Router();

// GET /api/me/tenancy
// Returns the authenticated user's org_id and site_id for multi-tenant operations
router.get('/tenancy', async (req, res) => {
  // req.user is populated by authGuard middleware (includes fallback for in-memory users)
  // Simply return the tenancy info that authGuard already populated
  return res.json({
    success: true,
    data: {
      org_id: req.user.org_id || 'default-org',
      site_id: req.user.site_id || null,
      org_name: 'Default Organization',
      site_name: 'Default Site'
    },
    source: 'middleware'
  });
});

// GET /api/me
// Returns authenticated user's profile information
router.get('/', async (req, res) => {
  // req.user is populated by authGuard middleware (includes fallback for in-memory users)
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.name,
      role: req.user.role,
      org_id: req.user.org_id,
      site_id: req.user.site_id,
      createdAt: req.user.created_at
    },
    source: 'middleware'
  });
});

module.exports = router;
