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
    const orgId = req.user?.org_id || 1;

    const result = await global.db.query(`
      SELECT
        location_id,
        name,
        location_type,
        temp_min,
        temp_max,
        capacity_units,
        is_active,
        created_at
      FROM locations
      WHERE org_id = $1 AND is_active = TRUE
      ORDER BY name ASC
    `, [orgId]);

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
    const orgId = req.user?.org_id || 1;
    const { id } = req.params;

    const result = await global.db.query(`
      SELECT
        location_id,
        name,
        location_type,
        temp_min,
        temp_max,
        capacity_units,
        is_active,
        created_at
      FROM locations
      WHERE location_id = $1 AND org_id = $2
    `, [id, orgId]);

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
    const orgId = req.user?.org_id || 1;
    const { name, location_type, temp_min, temp_max, capacity_units } = req.body;

    // Validate required fields
    if (!name || !location_type) {
      return res.status(400).json({
        success: false,
        error: 'Name and location_type are required'
      });
    }

    const result = await global.db.query(`
      INSERT INTO locations (name, location_type, temp_min, temp_max, capacity_units, org_id, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      RETURNING *
    `, [name, location_type, temp_min || null, temp_max || null, capacity_units || 0, orgId]);

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
    const orgId = req.user?.org_id || 1;
    const { id } = req.params;
    const { name, location_type, temp_min, temp_max, capacity_units, is_active } = req.body;

    const result = await global.db.query(`
      UPDATE locations
      SET
        name = COALESCE($1, name),
        location_type = COALESCE($2, location_type),
        temp_min = COALESCE($3, temp_min),
        temp_max = COALESCE($4, temp_max),
        capacity_units = COALESCE($5, capacity_units),
        is_active = COALESCE($6, is_active)
      WHERE location_id = $7 AND org_id = $8
      RETURNING *
    `, [name, location_type, temp_min, temp_max, capacity_units, is_active, id, orgId]);

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
    const orgId = req.user?.org_id || 1;
    const { id } = req.params;

    const result = await global.db.query(`
      UPDATE locations
      SET is_active = FALSE
      WHERE location_id = $1 AND org_id = $2
      RETURNING *
    `, [id, orgId]);

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
