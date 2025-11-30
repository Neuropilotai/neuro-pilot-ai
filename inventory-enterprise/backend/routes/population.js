/**
 * Population (Headcount) Routes - V21.1
 * Daily headcount tracking by meal for planning
 * Schema: population (migration 009)
 */

const express = require('express');
const router = express.Router();

/**
 * Helper: Get org_id from request with fallback
 * Supports: tenant middleware, JWT claims, or default
 */
function getOrgId(req) {
  return req.tenant?.tenantId || req.user?.org_id || req.user?.tenant_id || 'default';
}

// GET /api/population - Get population data with date range filters
router.get('/', async (req, res) => {
  const org_id = getOrgId(req);
  const { from, to, site_id } = req.query;

  try {
    let query = 'SELECT * FROM population WHERE org_id = $1';
    const params = [org_id];
    let paramCount = 1;

    if (site_id) {
      paramCount++;
      query += ` AND site_id = $${paramCount}`;
      params.push(site_id);
    }

    if (from) {
      paramCount++;
      query += ` AND date >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND date <= $${paramCount}`;
      params.push(to);
    }

    query += ' ORDER BY date DESC LIMIT 365';

    const result = await global.db.query(query, params);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/population error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/population/:date - Get population for specific date
router.get('/:date', async (req, res) => {
  const org_id = getOrgId(req);
  const { date } = req.params;
  const { site_id } = req.query;

  try {
    let query = 'SELECT * FROM population WHERE org_id = $1 AND date = $2';
    const params = [org_id, date];

    if (site_id) {
      query += ' AND site_id = $3';
      params.push(site_id);
    }

    const result = await global.db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Population data not found for this date' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/population/:date error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/population - Create or update population entry
router.post('/', async (req, res) => {
  const org_id = getOrgId(req);
  const { site_id, date, breakfast, lunch, dinner, notes } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, error: 'date is required' });
  }

  try {
    const result = await global.db.query(`
      INSERT INTO population (org_id, site_id, date, breakfast, lunch, dinner, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (org_id, site_id, date) DO UPDATE SET
        breakfast = EXCLUDED.breakfast,
        lunch = EXCLUDED.lunch,
        dinner = EXCLUDED.dinner,
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [org_id, site_id, date, breakfast || 0, lunch || 0, dinner || 0, notes]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/population error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/population/:id - Update population entry by ID
router.put('/:id', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;
  const { breakfast, lunch, dinner, notes } = req.body;

  try {
    const result = await global.db.query(`
      UPDATE population SET
        breakfast = COALESCE($3, breakfast),
        lunch = COALESCE($4, lunch),
        dinner = COALESCE($5, dinner),
        notes = COALESCE($6, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, [org_id, id, breakfast, lunch, dinner, notes]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Population entry not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/population/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/population/:id - Delete population entry
router.delete('/:id', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;

  try {
    const result = await global.db.query(
      'DELETE FROM population WHERE org_id = $1 AND id = $2 RETURNING id',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Population entry not found' });
    }

    res.json({ success: true, message: 'Population entry deleted' });
  } catch (error) {
    console.error('DELETE /api/population/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/population/bulk - Bulk upsert population data
router.post('/bulk', async (req, res) => {
  const org_id = getOrgId(req);
  const { entries } = req.body;

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({ success: false, error: 'entries array is required' });
  }

  const imported = [];
  const errors = [];

  try {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      try {
        if (!entry.date) {
          errors.push({ line: i + 1, error: 'Missing required field: date' });
          continue;
        }

        await global.db.query(`
          INSERT INTO population (org_id, site_id, date, breakfast, lunch, dinner, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (org_id, site_id, date) DO UPDATE SET
            breakfast = EXCLUDED.breakfast,
            lunch = EXCLUDED.lunch,
            dinner = EXCLUDED.dinner,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        `, [
          org_id,
          entry.site_id || null,
          entry.date,
          entry.breakfast || 0,
          entry.lunch || 0,
          entry.dinner || 0,
          entry.notes
        ]);

        imported.push({ line: i + 1, date: entry.date });
      } catch (err) {
        console.error(`Bulk import error on entry ${i + 1}:`, err);
        errors.push({ line: i + 1, error: err.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    });
  } catch (error) {
    console.error('POST /api/population/bulk error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/population/summary - Get aggregate statistics
router.get('/summary', async (req, res) => {
  const org_id = getOrgId(req);
  const { from, to, site_id } = req.query;

  try {
    let query = `
      SELECT
        COUNT(*) as days_logged,
        AVG(breakfast) as avg_breakfast,
        AVG(lunch) as avg_lunch,
        AVG(dinner) as avg_dinner,
        AVG(total) as avg_total,
        MAX(total) as max_total,
        MIN(total) as min_total
      FROM population
      WHERE org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (site_id) {
      paramCount++;
      query += ` AND site_id = $${paramCount}`;
      params.push(site_id);
    }

    if (from) {
      paramCount++;
      query += ` AND date >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND date <= $${paramCount}`;
      params.push(to);
    }

    const result = await global.db.query(query, params);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/population/summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
