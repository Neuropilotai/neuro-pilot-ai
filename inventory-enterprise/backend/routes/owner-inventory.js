/**
 * owner-inventory.js - v3.4.0
 * Owner Inventory Management with Zero-Count Smart Mode
 *
 * Endpoints:
 * - GET    /api/owner/inventory/estimate        - Zero-Count smart estimates
 * - GET    /api/owner/inventory/current         - Current stock with FIFO
 * - GET    /api/owner/inventory/stockout        - Stock-out risk radar
 * - GET    /api/owner/inventory/items           - Search/filter items
 * - POST   /api/owner/inventory/items           - Quick add item
 * - PUT    /api/owner/inventory/items/:code     - Update item
 * - GET    /api/owner/inventory/locations       - Get all locations
 * - POST   /api/owner/inventory/locations       - Create new location
 * - PUT    /api/owner/inventory/locations/:id   - Update location
 * - DELETE /api/owner/inventory/locations/:id   - Delete (deactivate) location
 * - GET    /api/owner/inventory/has-snapshot    - Check if physical count exists
 * - POST   /api/owner/inventory/adjust          - Adjust quantity (with reason)
 */

const express = require('express');
const router = express.Router();

// Middleware: owner-only
const { requireOwner } = require('../middleware/requireOwner');

// Apply owner-only protection to all routes
router.use(requireOwner);

/**
 * GET /api/owner/inventory/has-snapshot
 * Check if a physical count/snapshot exists (determines mode)
 */
router.get('/has-snapshot', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Check if any closed count exists
    const result = await db.get(`
      SELECT COUNT(*) as count
      FROM count_headers
      WHERE status = 'CLOSED'
    `);

    const hasSnapshot = (result.count || 0) > 0;

    // Get most recent count info
    const lastCount = await db.get(`
      SELECT count_id, count_date, count_type, closed_at
      FROM count_headers
      WHERE status = 'CLOSED'
      ORDER BY closed_at DESC
      LIMIT 1
    `);

    res.json({
      success: true,
      hasSnapshot,
      mode: hasSnapshot ? 'NORMAL' : 'ZERO_COUNT',
      lastCount: lastCount || null
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/has-snapshot error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/inventory/estimate
 * Zero-Count Smart Mode: inferred quantities
 */
router.get('/estimate', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const confidenceMin = parseFloat(req.query.confidence_min) || 0;

    let sql = `
      SELECT
        item_code,
        item_name,
        unit,
        category,
        par_level,
        ROUND(inferred_qty, 2) as inferred_qty,
        ROUND(confidence, 2) as confidence,
        source,
        last_invoice_date,
        last_invoice_no,
        last_count_date,
        has_forecast
      FROM v_current_inventory_estimate
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      sql += ` AND (item_code LIKE ? OR item_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (confidenceMin > 0) {
      sql += ` AND confidence >= ?`;
      params.push(confidenceMin);
    }

    sql += ` ORDER BY item_name ASC`;

    const items = await db.all(sql, params);

    // Get summary stats
    const stats = await db.get(`
      SELECT
        COUNT(*) as total_items,
        ROUND(AVG(confidence), 2) as avg_confidence,
        SUM(CASE WHEN confidence < 0.5 THEN 1 ELSE 0 END) as low_confidence_count
      FROM v_current_inventory_estimate
    `);

    res.json({
      success: true,
      mode: 'ZERO_COUNT',
      items,
      stats,
      count: items.length
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/estimate error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/inventory/current
 * Normal Mode: actual stock with FIFO layers
 */
router.get('/current', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const search = req.query.search || '';
    const category = req.query.category || '';

    let sql = `
      SELECT
        item_code,
        item_name,
        unit,
        category,
        current_quantity,
        par_level,
        reorder_point,
        last_count_date,
        fifo_layers,
        ROUND(avg_unit_cost, 2) as avg_unit_cost,
        layer_count
      FROM v_inventory_with_fifo
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      sql += ` AND (item_code LIKE ? OR item_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY item_name ASC`;

    const items = await db.all(sql, params);

    // Parse JSON FIFO layers
    items.forEach(item => {
      if (item.fifo_layers) {
        try {
          item.fifo_layers = JSON.parse(item.fifo_layers);
        } catch (e) {
          item.fifo_layers = [];
        }
      } else {
        item.fifo_layers = [];
      }
    });

    res.json({
      success: true,
      mode: 'NORMAL',
      items,
      count: items.length
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/current error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/inventory/stockout
 * Stock-out Risk Radar (both modes)
 */
router.get('/stockout', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const minRisk = req.query.min_risk || 'MEDIUM';  // CRITICAL, HIGH, MEDIUM

    let sql = `
      SELECT
        item_code,
        item_name,
        unit,
        ROUND(available_qty, 2) as available_qty,
        ROUND(predicted_24h, 2) as predicted_24h,
        ROUND(shortage_qty, 2) as shortage_qty,
        risk_level,
        reason,
        ROUND(confidence, 2) as confidence,
        estimate_source,
        forecast_sources,
        last_invoice_date,
        last_count_date
      FROM v_stockout_risk_detailed
      WHERE 1=1
    `;

    const params = [];

    if (minRisk === 'CRITICAL') {
      sql += ` AND risk_level = 'CRITICAL'`;
    } else if (minRisk === 'HIGH') {
      sql += ` AND risk_level IN ('CRITICAL', 'HIGH')`;
    }

    sql += ` ORDER BY
      CASE risk_level
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        ELSE 4
      END,
      shortage_qty DESC
    `;

    const items = await db.all(sql, params);

    // Group by risk level
    const critical = items.filter(i => i.risk_level === 'CRITICAL');
    const high = items.filter(i => i.risk_level === 'HIGH');
    const medium = items.filter(i => i.risk_level === 'MEDIUM');

    res.json({
      success: true,
      critical,
      high,
      medium,
      total: items.length
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/stockout error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/inventory/items
 * Search/filter items with pagination
 */
router.get('/items', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let sql = `
      SELECT
        item_id,
        item_code,
        item_name,
        description,
        unit,
        category,
        cost_code,
        par_level,
        reorder_point,
        current_quantity,
        last_count_date,
        last_invoice_date,
        is_active
      FROM inventory_items
      WHERE is_active = 1
    `;

    const params = [];

    if (search) {
      sql += ` AND (item_code LIKE ? OR item_name LIKE ? OR description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY item_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const items = await db.all(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM inventory_items WHERE is_active = 1`;
    const countParams = [];

    if (search) {
      countSql += ` AND (item_code LIKE ? OR item_name LIKE ? OR description LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const { total } = await db.get(countSql, countParams);

    res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/items error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/inventory/items
 * Quick add new item (owner only)
 */
router.post('/items', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      item_code,
      item_name,
      description,
      unit,
      category,
      cost_code,
      par_level,
      reorder_point
    } = req.body;

    if (!item_code || !item_name || !unit) {
      return res.status(400).json({
        success: false,
        error: 'item_code, item_name, and unit are required'
      });
    }

    // Check for duplicate
    const existing = await db.get(`
      SELECT item_code FROM inventory_items WHERE item_code = ?
    `, [item_code]);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Item ${item_code} already exists`
      });
    }

    // Insert item
    const result = await db.run(`
      INSERT INTO inventory_items (
        item_code, item_name, description, unit, category, cost_code,
        par_level, reorder_point, current_quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      item_code,
      item_name,
      description || null,
      unit,
      category || null,
      cost_code || null,
      par_level || 0,
      reorder_point || 0
    ]);

    res.json({
      success: true,
      item_id: result.lastID,
      item_code,
      message: 'Item created successfully'
    });

  } catch (error) {
    console.error('POST /api/owner/inventory/items error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/owner/inventory/items/:code
 * Update item details
 */
router.put('/items/:code', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { code } = req.params;
    const updates = req.body;

    // Build update SQL dynamically
    const allowedFields = [
      'item_name', 'description', 'unit', 'category', 'cost_code',
      'par_level', 'reorder_point', 'is_active', 'notes'
    ];

    const setClause = [];
    const params = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        params.push(updates[key]);
      }
    });

    if (setClause.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(code);

    await db.run(`
      UPDATE inventory_items
      SET ${setClause.join(', ')}
      WHERE item_code = ?
    `, params);

    res.json({
      success: true,
      message: 'Item updated successfully'
    });

  } catch (error) {
    console.error('PUT /api/owner/inventory/items/:code error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/inventory/locations
 * Get all storage locations
 */
router.get('/locations', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const locations = await db.all(`
      SELECT
        id as location_id,
        id as location_code,
        name as location_name,
        type as location_type,
        sequence,
        is_active
      FROM storage_locations
      WHERE is_active = 1
      ORDER BY sequence ASC
    `);

    res.json({
      success: true,
      locations,
      count: locations.length
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/locations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/inventory/locations
 * Create new storage location
 */
router.post('/locations', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id, name, type, sequence } = req.body;

    if (!id || !name) {
      return res.status(400).json({
        success: false,
        error: 'id and name are required'
      });
    }

    // Check for duplicate
    const existing = await db.get(`
      SELECT id FROM storage_locations WHERE id = ?
    `, [id]);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Location ${id} already exists`
      });
    }

    // Insert location
    await db.run(`
      INSERT INTO storage_locations (id, tenant_id, name, type, sequence, is_active)
      VALUES (?, 'default', ?, ?, ?, 1)
    `, [id, name, type || 'storage', sequence || 0]);

    res.json({
      success: true,
      location: { id, name, type: type || 'storage', sequence: sequence || 0 },
      message: 'Location created successfully'
    });

  } catch (error) {
    console.error('POST /api/owner/inventory/locations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/owner/inventory/locations/:id
 * Update storage location
 */
router.put('/locations/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, type, sequence, is_active } = req.body;

    // Check if location exists
    const existing = await db.get(`
      SELECT id FROM storage_locations WHERE id = ?
    `, [id]);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Location ${id} not found`
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (sequence !== undefined) {
      updates.push('sequence = ?');
      params.push(sequence);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    params.push(id);

    await db.run(`
      UPDATE storage_locations
      SET ${updates.join(', ')}
      WHERE id = ?
    `, params);

    res.json({
      success: true,
      message: 'Location updated successfully'
    });

  } catch (error) {
    console.error('PUT /api/owner/inventory/locations/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/owner/inventory/locations/:id
 * Delete (deactivate) storage location
 */
router.delete('/locations/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Check if location exists
    const existing = await db.get(`
      SELECT id FROM storage_locations WHERE id = ?
    `, [id]);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Location ${id} not found`
      });
    }

    // Soft delete by setting is_active = 0
    await db.run(`
      UPDATE storage_locations
      SET is_active = 0
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Location deactivated successfully'
    });

  } catch (error) {
    console.error('DELETE /api/owner/inventory/locations/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/owner/inventory/adjust
 * Adjust quantity with reason (creates adjustment record)
 */
router.post('/adjust', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { item_code, adjustment, reason } = req.body;

    if (!item_code || adjustment === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: 'item_code, adjustment, and reason are required'
      });
    }

    // Get current quantity
    const item = await db.get(`
      SELECT current_quantity FROM inventory_items WHERE item_code = ?
    `, [item_code]);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: `Item ${item_code} not found`
      });
    }

    const newQty = Math.max(0, (item.current_quantity || 0) + adjustment);

    // Update quantity
    await db.run(`
      UPDATE inventory_items
      SET current_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE item_code = ?
    `, [newQty, item_code]);

    // TODO: Log adjustment to audit table

    res.json({
      success: true,
      item_code,
      old_quantity: item.current_quantity,
      adjustment,
      new_quantity: newQty,
      reason
    });

  } catch (error) {
    console.error('POST /api/owner/inventory/adjust error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
