/**
 * Locations API Routes
 * V21.1 PostgreSQL Support
 * Manages storage locations for inventory items
 */

const express = require('express');
const router = express.Router();

// GET /api/locations - List all active locations
router.get('/', async (req, res) => {
  try {
    // Support both tenant_id (from middleware) and org_id (legacy)
    const tenantId = req.tenant?.tenantId || req.user?.tenant_id || req.user?.org_id || 'default';

    const result = await global.db.query(`
      SELECT
        id as location_id,
        name,
        type as location_type,
        is_active,
        sequence,
        latitude,
        longitude,
        created_at
      FROM storage_locations
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY sequence ASC, name ASC
    `, [tenantId]);

    res.json({
      success: true,
      locations: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Locations list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations',
      message: error.message
    });
  }
});

// GET /api/locations/:id - Get single location
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId || req.user?.tenant_id || req.user?.org_id || 'default';
    const { id } = req.params;

    const result = await global.db.query(`
      SELECT
        id as location_id,
        name,
        type as location_type,
        is_active,
        sequence,
        latitude,
        longitude,
        created_at
      FROM storage_locations
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Location fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location'
    });
  }
});

// POST /api/locations - Create new location
router.post('/', async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId || req.user?.tenant_id || req.user?.org_id || 'default';
    const { name, location_type, latitude, longitude, sequence } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    // Generate a unique ID
    const locationId = `LOC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const result = await global.db.query(`
      INSERT INTO storage_locations (id, name, type, latitude, longitude, sequence, tenant_id, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
      RETURNING id as location_id, name, type as location_type, is_active, sequence, latitude, longitude, created_at
    `, [locationId, name, location_type || 'warehouse', latitude || null, longitude || null, sequence || 0, tenantId]);

    res.json({
      success: true,
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Location creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create location',
      message: error.message
    });
  }
});

// PUT /api/locations/:id - Update location
router.put('/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId || req.user?.tenant_id || req.user?.org_id || 'default';
    const { id } = req.params;
    const { name, location_type, latitude, longitude, sequence, is_active } = req.body;

    const result = await global.db.query(`
      UPDATE storage_locations
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        latitude = COALESCE($3, latitude),
        longitude = COALESCE($4, longitude),
        sequence = COALESCE($5, sequence),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE id = $7 AND tenant_id = $8
      RETURNING id as location_id, name, type as location_type, is_active, sequence, latitude, longitude, created_at
    `, [name, location_type, latitude, longitude, sequence, is_active, id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update location'
    });
  }
});

// DELETE /api/locations/:id - Soft delete location
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.tenantId || req.user?.tenant_id || req.user?.org_id || 'default';
    const { id } = req.params;

    const result = await global.db.query(`
      UPDATE storage_locations
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id as location_id, name, type as location_type, is_active
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      message: 'Location deactivated',
      location: result.rows[0]
    });
  } catch (error) {
    console.error('Location deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete location'
    });
  }
});

module.exports = router;
