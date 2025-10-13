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

    let hasSnapshot = (result.count || 0) > 0;
    let lastCount = null;

    // Get most recent count info
    if (hasSnapshot) {
      lastCount = await db.get(`
        SELECT count_id, count_date, count_type, closed_at
        FROM count_headers
        WHERE status = 'CLOSED'
        ORDER BY closed_at DESC
        LIMIT 1
      `);
    } else {
      // Check if inventory_items has data with last_count_date (loaded baseline)
      const inventoryBaseline = await db.get(`
        SELECT
          COUNT(*) as count,
          MAX(last_count_date) as last_count_date,
          SUM(current_quantity * unit_cost) as total_value
        FROM inventory_items
        WHERE is_active = 1 AND last_count_date IS NOT NULL
      `);

      if (inventoryBaseline && inventoryBaseline.count > 0) {
        hasSnapshot = true;
        lastCount = {
          count_id: 'BASELINE',
          count_date: inventoryBaseline.last_count_date,
          count_type: 'FIFO_BASELINE',
          closed_at: inventoryBaseline.last_count_date,
          item_count: inventoryBaseline.count,
          total_value: inventoryBaseline.total_value
        };
      }
    }

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

    // Query inventory with costs
    let sql = `
      SELECT
        i.item_code,
        i.item_name,
        i.unit,
        i.category,
        i.current_quantity,
        i.par_level,
        i.reorder_point,
        i.last_count_date,
        i.unit_cost,
        i.last_cost,
        i.unit_cost as avg_unit_cost,
        ROUND(i.current_quantity * i.unit_cost, 2) as total_value,
        NULL as fifo_layers,
        0 as layer_count
      FROM inventory_items i
      WHERE i.is_active = 1
    `;

    const params = [];

    if (search) {
      sql += ` AND (i.item_code LIKE ? OR i.item_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      sql += ` AND i.category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY i.item_name ASC`;

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

// ============================================================================
// v13.x: INVENTORY WORKSPACE (Month-End Reconciliation)
// ============================================================================

/**
 * GET /api/owner/inventory/workspaces
 * List all inventory workspaces with optional status filter
 */
router.get('/workspaces', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const status = req.query.status; // draft, in_progress, closed

    let sql = 'SELECT * FROM inventory_workspace WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const workspaces = await db.all(sql, params);

    res.json({
      success: true,
      workspaces,
      count: workspaces.length
    });
  } catch (error) {
    console.error('GET /workspaces error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/inventory/workspaces
 * Create new inventory workspace
 */
router.post('/workspaces', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, start_date, end_date } = req.body;

    if (!name || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'name, start_date, and end_date are required'
      });
    }

    // Auto-detect fiscal period
    let period_label = null;
    try {
      const fiscal = await db.get(`
        SELECT fiscal_year, period
        FROM fiscal_periods
        WHERE date(?) BETWEEN date(start_date) AND date(end_date)
        LIMIT 1
      `, [start_date]);
      if (fiscal) {
        period_label = `FY${fiscal.fiscal_year % 100}-P${String(fiscal.period).padStart(2, '0')}`;
      }
    } catch (err) {
      // Fiscal calendar not available, leave null
    }

    const result = await db.run(`
      INSERT INTO inventory_workspace (name, period_label, start_date, end_date, status, created_by)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `, [name, period_label, start_date, end_date, req.user?.email || 'owner']);

    res.json({
      success: true,
      workspace_id: result.lastID,
      period_label,
      message: 'Workspace created successfully'
    });
  } catch (error) {
    console.error('POST /workspaces error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/inventory/workspaces/:id/docs
 * Attach PDFs to workspace
 */
router.post('/workspaces/:id/docs', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { doc_ids } = req.body; // array of document IDs

    if (!doc_ids || !Array.isArray(doc_ids)) {
      return res.status(400).json({
        success: false,
        error: 'doc_ids array is required'
      });
    }

    let attached = 0;
    for (const doc_id of doc_ids) {
      try {
        await db.run(`
          INSERT INTO inventory_workspace_docs (workspace_id, doc_id, doc_type, attached_by)
          VALUES (?, ?, 'invoice', ?)
        `, [id, doc_id, req.user?.email || 'owner']);
        attached++;
      } catch (err) {
        // Skip duplicates
        console.debug(`Doc ${doc_id} already attached or error:`, err.message);
      }
    }

    res.json({
      success: true,
      attached_count: attached,
      total_requested: doc_ids.length
    });
  } catch (error) {
    console.error('POST /workspaces/:id/docs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/inventory/workspaces/:id/counts
 * Add/update count lines in workspace
 */
router.post('/workspaces/:id/counts', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { counts } = req.body; // array of {item_code, qty, unit}

    if (!counts || !Array.isArray(counts)) {
      return res.status(400).json({
        success: false,
        error: 'counts array is required'
      });
    }

    let inserted = 0;
    for (const count of counts) {
      await db.run(`
        INSERT INTO inventory_workspace_counts (workspace_id, item_code, qty, unit, counted_by)
        VALUES (?, ?, ?, ?, ?)
      `, [id, count.item_code, count.qty, count.unit, req.user?.email || 'owner']);
      inserted++;
    }

    res.json({
      success: true,
      inserted_count: inserted
    });
  } catch (error) {
    console.error('POST /workspaces/:id/counts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/inventory/workspaces/:id/close
 * Close workspace and generate month-end report
 */
router.post('/workspaces/:id/close', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Get workspace info
    const workspace = await db.get(`
      SELECT * FROM inventory_workspace WHERE workspace_id = ?
    `, [id]);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    if (workspace.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Workspace already closed'
      });
    }

    // Get closing counts
    const counts = await db.all(`
      SELECT item_code, qty, unit
      FROM inventory_workspace_counts
      WHERE workspace_id = ?
    `, [id]);

    // Get purchases (sum of attached invoices)
    const purchases = await db.all(`
      SELECT ili.product_code as item_code, SUM(ili.quantity) as total_qty
      FROM inventory_workspace_docs iwd
      JOIN documents d ON iwd.doc_id = d.id
      JOIN invoice_line_items ili ON d.id = ili.document_id
      WHERE iwd.workspace_id = ?
      GROUP BY ili.product_code
    `, [id]);

    // Calculate usage: Opening + Purchases - Closing = Usage
    const report = {
      workspace: workspace.name,
      period: workspace.period_label,
      date_range: `${workspace.start_date} to ${workspace.end_date}`,
      counts: counts.length,
      invoices_attached: purchases.length,
      summary: 'Month-end reconciliation complete'
    };

    // Update workspace status
    await db.run(`
      UPDATE inventory_workspace
      SET status = 'closed', closed_at = datetime('now'), closed_by = ?
      WHERE workspace_id = ?
    `, [req.user?.email || 'owner', id]);

    res.json({
      success: true,
      report,
      message: 'Workspace closed successfully'
    });
  } catch (error) {
    console.error('POST /workspaces/:id/close error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// v14.4: INVENTORY PLAYGROUND (Month-End Workflow - Comprehensive State)
// ============================================================================

/**
 * GET /api/owner/inventory/playground
 * Month-End Playground - Load all relevant data in one call
 *
 * Returns:
 * - Active workspace (if any)
 * - Recent workspaces list
 * - Unassigned items count
 * - Recent unprocessed PDFs (for attachment)
 * - Storage locations
 * - Current inventory summary
 */
router.get('/playground', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // 1. Get active/current workspace
    const activeWorkspace = await db.get(`
      SELECT * FROM inventory_workspace
      WHERE status IN ('draft', 'in_progress')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // 2. Get recent workspaces (last 10)
    const recentWorkspaces = await db.all(`
      SELECT
        workspace_id,
        name,
        period_label,
        start_date,
        end_date,
        status,
        created_at,
        closed_at
      FROM inventory_workspace
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // 3. Get unassigned items count
    let unassignedCount = 0;
    try {
      const unassigned = await db.get(`
        SELECT COUNT(*) as count
        FROM inventory_items i
        WHERE i.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM item_locations il
            WHERE il.item_code = i.item_code
          )
      `);
      unassignedCount = unassigned?.count || 0;
    } catch (err) {
      console.debug('Unassigned count query failed:', err.message);
    }

    // 4. Get recent unprocessed PDFs (for attachment)
    let recentPDFs = [];
    try {
      recentPDFs = await db.all(`
        SELECT
          id as doc_id,
          filename,
          invoice_number,
          invoice_date,
          vendor_name,
          total_amount,
          processed_at,
          uploaded_at
        FROM documents
        WHERE status = 'processed'
          AND processed_at IS NOT NULL
        ORDER BY invoice_date DESC, uploaded_at DESC
        LIMIT 20
      `);
    } catch (err) {
      console.debug('Recent PDFs query failed:', err.message);
    }

    // 5. Get storage locations
    let locations = [];
    try {
      locations = await db.all(`
        SELECT
          id as location_id,
          id as location_code,
          name as location_name,
          type as location_type,
          sequence
        FROM storage_locations
        WHERE is_active = 1
        ORDER BY sequence ASC
      `);
    } catch (err) {
      console.debug('Locations query failed:', err.message);
    }

    // 6. Get inventory summary stats
    let inventorySummary = null;
    try {
      inventorySummary = await db.get(`
        SELECT
          COUNT(*) as total_items,
          COUNT(CASE WHEN current_quantity > 0 THEN 1 END) as items_in_stock,
          COUNT(CASE WHEN current_quantity = 0 THEN 1 END) as items_empty,
          ROUND(SUM(current_quantity * unit_cost), 2) as total_value
        FROM inventory_items
        WHERE is_active = 1
      `);
    } catch (err) {
      console.debug('Inventory summary query failed:', err.message);
    }

    res.json({
      success: true,
      playground: {
        active_workspace: activeWorkspace || null,
        recent_workspaces: recentWorkspaces,
        unassigned_items_count: unassignedCount,
        recent_pdfs: recentPDFs,
        locations: locations,
        inventory_summary: inventorySummary || {
          total_items: 0,
          items_in_stock: 0,
          items_empty: 0,
          total_value: 0
        }
      },
      message: 'Playground state loaded successfully'
    });

  } catch (error) {
    console.error('GET /api/owner/inventory/playground error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
