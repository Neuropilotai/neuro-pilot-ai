/**
 * Waste Tracking Routes - V21.1
 * Captures waste events with auto-cost calculation
 * Schema: waste_logs, waste_reasons (migration 009)
 */

const express = require('express');
const router = express.Router();

// GET /api/waste - List waste events with filters
router.get('/', async (req, res) => {
  const { org_id } = req.user;
  const { from, to, reason_id, item_sku, recipe_id, site_id } = req.query;

  try {
    let query = `
      SELECT wl.*, wr.reason as reason_name, wr.category
      FROM waste_logs wl
      LEFT JOIN waste_reasons wr ON wl.reason_id = wr.id
      WHERE wl.org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (site_id) {
      paramCount++;
      query += ` AND wl.site_id = $${paramCount}`;
      params.push(site_id);
    }

    if (from) {
      paramCount++;
      query += ` AND wl.event_ts >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND wl.event_ts <= $${paramCount}`;
      params.push(to + ' 23:59:59');
    }

    if (reason_id) {
      paramCount++;
      query += ` AND wl.reason_id = $${paramCount}`;
      params.push(reason_id);
    }

    if (item_sku) {
      paramCount++;
      query += ` AND wl.item_sku = $${paramCount}`;
      params.push(item_sku);
    }

    if (recipe_id) {
      paramCount++;
      query += ` AND wl.recipe_id = $${paramCount}`;
      params.push(recipe_id);
    }

    query += ' ORDER BY wl.event_ts DESC LIMIT 1000';

    const result = await global.db.query(query, params);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/waste error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/waste - Create waste event with auto-cost calculation
router.post('/', async (req, res) => {
  const { org_id, user_id } = req.user;
  const { site_id, event_ts, item_sku, recipe_id, qty, uom, reason_id, notes, photo_url } = req.body;

  if (!qty || !uom || !reason_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields: qty, uom, reason_id' });
  }

  if (!item_sku && !recipe_id) {
    return res.status(400).json({ success: false, error: 'Either item_sku or recipe_id is required' });
  }

  try {
    const timestamp = event_ts || new Date().toISOString();
    const event_date = timestamp.split('T')[0];

    let cost_at_event = 0;

    // Calculate cost based on item or recipe
    if (item_sku) {
      // Lookup vendor price at event date
      const priceResult = await global.db.query(`
        SELECT * FROM get_current_vendor_price($1, $2, $3)
      `, [org_id, item_sku, event_date]);

      if (priceResult.rows.length > 0) {
        cost_at_event = parseFloat(priceResult.rows[0].price) * parseFloat(qty);
      }
    } else if (recipe_id) {
      // Calculate recipe cost at event date
      const costResult = await global.db.query(`
        SELECT * FROM calculate_recipe_cost($1, $2)
      `, [recipe_id, event_date]);

      if (costResult.rows.length > 0) {
        cost_at_event = parseFloat(costResult.rows[0].total_cost) * parseFloat(qty);
      }
    }

    // Insert waste log
    const result = await global.db.query(`
      INSERT INTO waste_logs (
        org_id, site_id, event_ts, item_sku, recipe_id,
        qty, uom, reason_id, cost_at_event, logged_by, notes, photo_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      org_id, site_id, timestamp, item_sku, recipe_id,
      qty, uom, reason_id, cost_at_event, user_id, notes, photo_url
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/waste error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/waste/:id - Get single waste event
router.get('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const result = await global.db.query(`
      SELECT wl.*, wr.reason as reason_name, wr.category
      FROM waste_logs wl
      LEFT JOIN waste_reasons wr ON wl.reason_id = wr.id
      WHERE wl.org_id = $1 AND wl.id = $2
    `, [org_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Waste event not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/waste/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/waste/:id - Update waste event
router.put('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { qty, uom, reason_id, notes, photo_url } = req.body;

  try {
    const result = await global.db.query(`
      UPDATE waste_logs SET
        qty = COALESCE($3, qty),
        uom = COALESCE($4, uom),
        reason_id = COALESCE($5, reason_id),
        notes = COALESCE($6, notes),
        photo_url = COALESCE($7, photo_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, [org_id, id, qty, uom, reason_id, notes, photo_url]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Waste event not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/waste/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/waste/:id - Delete waste event
router.delete('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const result = await global.db.query(
      'DELETE FROM waste_logs WHERE org_id = $1 AND id = $2 RETURNING id',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Waste event not found' });
    }

    res.json({ success: true, message: 'Waste event deleted' });
  } catch (error) {
    console.error('DELETE /api/waste/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/waste/summary - Aggregate waste analytics
router.get('/summary', async (req, res) => {
  const { org_id } = req.user;
  const { from, to, group_by, site_id } = req.query;

  try {
    const groupBy = group_by || 'reason';
    let groupColumn;

    switch (groupBy) {
      case 'reason':
        groupColumn = 'wr.reason';
        break;
      case 'category':
        groupColumn = 'wr.category';
        break;
      case 'item':
        groupColumn = 'COALESCE(wl.item_sku, CAST(wl.recipe_id AS TEXT))';
        break;
      case 'date':
        groupColumn = 'DATE(wl.event_ts)';
        break;
      default:
        groupColumn = 'wr.reason';
    }

    let query = `
      SELECT
        ${groupColumn} as group_key,
        COUNT(*) as event_count,
        SUM(wl.cost_at_event) as total_cost,
        SUM(wl.qty) as total_qty,
        AVG(wl.cost_at_event) as avg_cost
      FROM waste_logs wl
      LEFT JOIN waste_reasons wr ON wl.reason_id = wr.id
      WHERE wl.org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (site_id) {
      paramCount++;
      query += ` AND wl.site_id = $${paramCount}`;
      params.push(site_id);
    }

    if (from) {
      paramCount++;
      query += ` AND wl.event_ts >= $${paramCount}`;
      params.push(from);
    }

    if (to) {
      paramCount++;
      query += ` AND wl.event_ts <= $${paramCount}`;
      params.push(to + ' 23:59:59');
    }

    query += ` GROUP BY ${groupColumn} ORDER BY total_cost DESC`;

    const result = await global.db.query(query, params);

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
  } catch (error) {
    console.error('GET /api/waste/summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/waste/reasons - Get waste reasons reference
router.get('/reasons', async (req, res) => {
  try {
    const result = await global.db.query(`
      SELECT * FROM waste_reasons ORDER BY category, reason
    `);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/waste/reasons error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/waste/reasons - Create waste reason (admin only)
router.post('/reasons', async (req, res) => {
  const { reason, category, description } = req.body;

  if (!reason || !category) {
    return res.status(400).json({ success: false, error: 'Missing required fields: reason, category' });
  }

  try {
    const result = await global.db.query(`
      INSERT INTO waste_reasons (reason, category, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [reason, category, description]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/waste/reasons error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
