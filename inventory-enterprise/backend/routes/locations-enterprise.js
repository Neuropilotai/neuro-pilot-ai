/**
 * Enterprise Locations Routes
 * 
 * Enhanced location management endpoints with tenant isolation
 * Integrates with existing locations.js routes
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { validateOrgAccess } = require('../src/utils/query-scope');
const { validateBody, validateQuery, validateParams } = require('../src/middleware/validation');
const { createLocationSchema, locationQuerySchema, locationParamsSchema } = require('../src/schemas/locations');

/**
 * GET /api/locations-enterprise
 * List locations with filtering
 */
router.get('/', validateQuery(locationQuerySchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  const { kind, site, isActive } = req.query;

  try {
    let query = `
      SELECT 
        l.location_id,
        l.location_code,
        l.location_name,
        l.location_type,
        l.sequence,
        l.is_active,
        l.created_at
      FROM item_locations l
      WHERE l.org_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (kind) {
      query += ` AND l.location_type = $${paramIndex}`;
      params.push(kind);
      paramIndex++;
    }

    if (isActive !== undefined) {
      query += ` AND l.is_active = $${paramIndex}`;
      params.push(isActive === 'true' ? 1 : 0);
      paramIndex++;
    }

    query += ` ORDER BY l.sequence ASC, l.location_name ASC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      locations: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error listing locations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/locations-enterprise/:id
 * Get single location
 */
router.get('/:id', validateParams(locationParamsSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id } = req.params;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  try {
    const result = await pool.query(
      `SELECT 
        l.location_id,
        l.location_code,
        l.location_name,
        l.location_type,
        l.sequence,
        l.is_active,
        l.created_at
      FROM item_locations l
      WHERE l.location_id = $1 AND l.org_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const location = result.rows[0];
    validateOrgAccess(orgId, location, 'Location');

    res.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error getting location:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/locations-enterprise
 * Create location (Admin only)
 */
router.post('/', validateBody(createLocationSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  // Check admin role
  if (!req.user || !['admin', 'ADMIN', 'owner', 'OWNER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, site, kind, sortOrder } = req.body;

  try {
    // Generate location code from name
    const locationCode = name.toUpperCase().replace(/\s+/g, '-').substring(0, 50);

    // Check if location code already exists for this org
    const existing = await pool.query(
      'SELECT location_id FROM item_locations WHERE location_code = $1 AND org_id = $2',
      [locationCode, orgId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Location ${name} already exists`,
      });
    }

    const result = await pool.query(
      `INSERT INTO item_locations (
        location_code, location_name, location_type, sequence, org_id, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, 1, NOW())
      RETURNING location_id, location_code, location_name, location_type, sequence, org_id, is_active`,
      [
        locationCode,
        name,
        kind,
        sortOrder || 0,
        orgId,
      ]
    );

    res.status(201).json({
      success: true,
      location: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

module.exports = router;

