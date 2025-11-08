/**
 * Population (Headcount) Routes
 * Manages daily population tracking for meal planning
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/population - Get population data
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const org_id = req.user?.org_id || 1;
    const site_id = req.user?.site_id || null;

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

    const result = await db.query(query, params);

    res.json({ success: true, population: result.rows });
  } catch (err) {
    console.error('Error fetching population:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/population - Create or update population entry
router.post('/', async (req, res) => {
  try {
    const { date, breakfast, lunch, dinner, notes } = req.body;
    const org_id = req.user?.org_id || 1;
    const site_id = req.user?.site_id || null;

    if (!date) {
      return res.status(400).json({ success: false, error: 'date required' });
    }

    const result = await db.query(`
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

    res.json({ success: true, population: result.rows[0] });
  } catch (err) {
    console.error('Error saving population:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/population/:id - Delete population entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const org_id = req.user?.org_id || 1;

    const result = await db.query('DELETE FROM population WHERE id = $1 AND org_id = $2 RETURNING *', [id, org_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Population entry not found' });
    }

    res.json({ success: true, message: 'Population entry deleted' });
  } catch (err) {
    console.error('Error deleting population:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
