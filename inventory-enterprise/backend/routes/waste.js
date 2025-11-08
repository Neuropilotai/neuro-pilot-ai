/**
 * Waste Tracking Routes
 * Captures waste events with cost analysis and analytics
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { computeWasteCost } = require('../services/costing');

// GET /api/waste - List waste events with filters
router.get('/', async (req, res) => {
  try {
    const { from, to, reason, item_sku, recipe_code } = req.query;
    const org_id = req.user?.org_id || 1;

    let query = 'SELECT * FROM waste_events WHERE org_id = $1';
    const params = [org_id];
    let paramCount = 1;

    if (from) {
      paramCount++;
      query += ` AND ts >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND ts <= $${paramCount}`;
      params.push(to + ' 23:59:59');
    }

    if (reason) {
      paramCount++;
      query += ` AND reason = $${paramCount}`;
      params.push(reason);
    }

    if (item_sku) {
      paramCount++;
      query += ` AND item_sku = $${paramCount}`;
      params.push(item_sku);
    }

    if (recipe_code) {
      paramCount++;
      query += ` AND recipe_code = $${paramCount}`;
      params.push(recipe_code);
    }

    query += ' ORDER BY ts DESC LIMIT 500';

    const result = await db.query(query, params);

    res.json({ success: true, events: result.rows });
  } catch (err) {
    console.error('Error fetching waste events:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/waste - Create waste event
router.post('/', async (req, res) => {
  try {
    const { ts, item_sku, recipe_code, qty, uom, reason, subreason, photo_url, notes } = req.body;
    const org_id = req.user?.org_id || 1;
    const site_id = req.user?.site_id || null;
    const user_id = req.user?.id || null;

    if (!qty || !uom || !reason) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!item_sku && !recipe_code) {
      return res.status(400).json({ success: false, error: 'Either item_sku or recipe_code required' });
    }

    const eventTs = ts || new Date().toISOString();
    const eventDate = eventTs.split('T')[0];

    // Compute cost at event
    const costAtEvent = await computeWasteCost(org_id, item_sku, recipe_code, qty, eventDate);

    const result = await db.query(`
      INSERT INTO waste_events (org_id, site_id, ts, item_sku, recipe_code, qty, uom, reason, subreason, photo_url, user_id, notes, cost_at_event)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [org_id, site_id, eventTs, item_sku, recipe_code, qty, uom, reason, subreason, photo_url, user_id, notes, costAtEvent]);

    res.json({ success: true, event: result.rows[0] });
  } catch (err) {
    console.error('Error creating waste event:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/waste/summary - Aggregate waste analytics
router.get('/summary', async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const org_id = req.user?.org_id || 1;

    const groupBy = group || 'reason';
    let groupColumn;

    switch (groupBy) {
      case 'reason':
        groupColumn = 'reason';
        break;
      case 'item':
        groupColumn = 'COALESCE(item_sku, recipe_code)';
        break;
      case 'recipe':
        groupColumn = 'recipe_code';
        break;
      default:
        groupColumn = 'reason';
    }

    let query = `
      SELECT
        ${groupColumn} as group_key,
        COUNT(*) as event_count,
        SUM(cost_at_event) as total_cost,
        SUM(qty) as total_qty
      FROM waste_events
      WHERE org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (from) {
      paramCount++;
      query += ` AND ts >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND ts <= $${paramCount}`;
      params.push(to + ' 23:59:59');
    }

    query += ` GROUP BY ${groupColumn} ORDER BY total_cost DESC`;

    const result = await db.query(query, params);

    // Calculate totals
    const totalCost = result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    const totalQty = result.rows.reduce((sum, row) => sum + parseFloat(row.total_qty || 0), 0);
    const totalEvents = result.rows.reduce((sum, row) => sum + parseInt(row.event_count || 0), 0);

    res.json({
      success: true,
      summary: result.rows,
      totals: {
        total_cost: parseFloat(totalCost.toFixed(2)),
        total_qty: parseFloat(totalQty.toFixed(2)),
        total_events: totalEvents
      }
    });
  } catch (err) {
    console.error('Error fetching waste summary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/waste/reasons - Get waste reasons reference
router.get('/reasons', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM waste_reasons ORDER BY reason');
    res.json({ success: true, reasons: result.rows });
  } catch (err) {
    console.error('Error fetching waste reasons:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
