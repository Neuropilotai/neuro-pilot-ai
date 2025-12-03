/**
 * Inventory Counts API Routes (PostgreSQL)
 * NeuroPilot AI Enterprise v23.0
 *
 * Provides PostgreSQL-native endpoints for physical inventory counts:
 * - Draft/submit/approve workflow
 * - Link counts with vendor orders (invoices)
 * - Toggle invoice inclusion
 * - Add items by code to locations
 *
 * @version 23.0
 * @author NeuroPilot AI Team
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ============================================
// HELPERS
// ============================================

/**
 * Get org_id from request (tenant isolation)
 */
function getOrgId(req) {
  return req.user?.org_id || req.tenant?.orgId || 'default-org';
}

/**
 * Get user ID from request
 */
function getUserId(req) {
  return req.user?.email || req.user?.id || 'system';
}

/**
 * Generate a count ID
 */
function generateCountId() {
  return `CNT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// ============================================
// GET /api/counts - List all counts
// ============================================

router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const status = req.query.status || null;

    // Production schema: count_id (integer), org_id (uuid), count_name, count_date, count_type, status, counted_by, notes
    let whereConditions = ['(c.org_id::text = $1 OR c.org_id IS NULL)'];
    let params = [orgId];
    let paramIndex = 2;

    if (status) {
      whereConditions.push(`c.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_counts c WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Get counts - using actual production schema columns
    const result = await pool.query(`
      SELECT
        c.count_id as id,
        c.count_name,
        c.count_date,
        c.count_type,
        c.status,
        c.counted_by,
        c.created_at,
        c.closed_at,
        c.notes,
        c.org_id,
        (SELECT COUNT(*) FROM inventory_count_items i WHERE i.count_id = c.count_id) as item_count
      FROM inventory_counts c
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, pageSize, offset]);

    res.json({
      success: true,
      counts: result.rows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('[Counts] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch counts',
      code: 'LIST_ERROR'
    });
  }
});

// ============================================
// GET /api/counts/:id - Get single count
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const countId = parseInt(req.params.id);

    if (isNaN(countId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid count ID',
        code: 'INVALID_ID'
      });
    }

    // Get count header - production schema uses count_id (integer)
    const countResult = await pool.query(`
      SELECT
        c.count_id as id,
        c.count_name,
        c.count_date,
        c.count_type,
        c.status,
        c.counted_by,
        c.notes,
        c.created_at,
        c.updated_at,
        c.closed_at,
        c.org_id
      FROM inventory_counts c
      WHERE c.count_id = $1 AND (c.org_id::text = $2 OR c.org_id IS NULL)
    `, [countId, orgId]);

    if (countResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count not found',
        code: 'NOT_FOUND'
      });
    }

    const count = countResult.rows[0];

    // Get count items - production schema uses inventory_count_items
    const itemsResult = await pool.query(`
      SELECT
        i.count_item_id as id,
        i.item_code,
        i.quantity,
        i.location,
        i.notes,
        i.created_at,
        ii.description as item_description,
        ii.category
      FROM inventory_count_items i
      LEFT JOIN inventory_items ii ON i.item_code = ii.item_code
      WHERE i.count_id = $1
      ORDER BY i.count_item_id
    `, [countId]);

    // Get linked vendor orders (if any)
    let vendorOrders = [];
    try {
      const ordersResult = await pool.query(`
        SELECT
          cvo.id,
          cvo.vendor_order_id,
          cvo.included,
          vo.vendor_name,
          vo.order_number,
          vo.order_date,
          vo.total_cents,
          vo.total_lines
        FROM count_vendor_orders cvo
        JOIN vendor_orders vo ON vo.id = cvo.vendor_order_id
        WHERE cvo.count_id = $1::text
        ORDER BY vo.order_date DESC
      `, [countId]);
      vendorOrders = ordersResult.rows;
    } catch (e) {
      // count_vendor_orders may not exist or link may not be set up
    }

    res.json({
      success: true,
      count: {
        ...count,
        items: itemsResult.rows,
        vendorOrders: vendorOrders.map(o => ({
          id: o.id,
          vendorOrderId: o.vendor_order_id,
          included: o.included,
          vendorName: o.vendor_name,
          orderNumber: o.order_number,
          orderDate: o.order_date,
          total: o.total_cents ? (o.total_cents / 100).toFixed(2) : '0.00',
          lineCount: o.total_lines || 0
        }))
      }
    });

  } catch (error) {
    console.error('[Counts] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch count',
      code: 'GET_ERROR'
    });
  }
});

// ============================================
// POST /api/counts - Create new count
// ============================================

router.post('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const {
      locationId,
      referenceDate,
      notes,
      rows,
      status = 'draft',
      linkVendorOrdersUpToDate
    } = req.body;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'Location ID is required',
        code: 'VALIDATION_ERROR'
      });
    }

    const countId = generateCountId();

    // Create count header
    await pool.query(`
      INSERT INTO inventory_counts (
        id, org_id, location_id, status, created_by, created_at, notes, reference_date
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `, [countId, orgId, locationId, status, userId, notes || null, referenceDate || null]);

    // Insert rows if provided
    if (rows && Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        const variance = (parseFloat(row.countedQty) || 0) - (parseFloat(row.expectedQty) || 0);
        await pool.query(`
          INSERT INTO inventory_count_rows (
            count_id, item_code, expected_qty, counted_qty, variance, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          countId,
          row.itemCode,
          parseFloat(row.expectedQty) || 0,
          parseFloat(row.countedQty) || 0,
          variance,
          row.notes || null
        ]);
      }
    }

    // Link vendor orders if date specified
    if (linkVendorOrdersUpToDate) {
      await pool.query(`
        INSERT INTO count_vendor_orders (count_id, vendor_order_id, included, created_by)
        SELECT $1, id, TRUE, $3
        FROM vendor_orders
        WHERE deleted_at IS NULL
          AND order_date <= $2
          AND (org_id = $4 OR org_id IS NULL)
        ON CONFLICT (count_id, vendor_order_id) DO NOTHING
      `, [countId, linkVendorOrdersUpToDate, userId, orgId]);
    }

    // Log breadcrumb
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, ['count_created', JSON.stringify({
        countId,
        locationId,
        status,
        rowCount: rows?.length || 0,
        userId
      })]);
    } catch (e) { /* ignore */ }

    res.status(201).json({
      success: true,
      countId,
      message: 'Count created successfully'
    });

  } catch (error) {
    console.error('[Counts] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create count',
      code: 'CREATE_ERROR'
    });
  }
});

// ============================================
// PATCH /api/counts/:id - Update count status
// ============================================

router.patch('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const countId = req.params.id;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['draft', 'pending_approval', 'approved', 'rejected', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        code: 'INVALID_STATUS'
      });
    }

    // Build update
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);

      // Handle status-specific fields
      if (status === 'approved') {
        updates.push(`approved_by = $${paramIndex++}`);
        params.push(userId);
        updates.push(`approved_at = CURRENT_TIMESTAMP`);
      } else if (status === 'closed') {
        updates.push(`closed_by = $${paramIndex++}`);
        params.push(userId);
        updates.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATES'
      });
    }

    params.push(countId);
    params.push(orgId);

    const result = await pool.query(`
      UPDATE inventory_counts
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND (org_id = $${paramIndex} OR org_id IS NULL)
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count not found',
        code: 'NOT_FOUND'
      });
    }

    // If approved, update inventory quantities
    if (status === 'approved') {
      const rows = await pool.query(
        `SELECT item_code, counted_qty FROM inventory_count_rows WHERE count_id = $1`,
        [countId]
      );

      for (const row of rows.rows) {
        await pool.query(`
          UPDATE inventory_items
          SET current_quantity = $1, last_count_date = CURRENT_TIMESTAMP
          WHERE item_code = $2 AND (org_id = $3 OR org_id IS NULL)
        `, [row.counted_qty, row.item_code, orgId]);
      }
    }

    res.json({
      success: true,
      message: `Count ${status || 'updated'} successfully`,
      count: result.rows[0]
    });

  } catch (error) {
    console.error('[Counts] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update count',
      code: 'UPDATE_ERROR'
    });
  }
});

// ============================================
// GET /api/counts/:id/vendor-orders
// Get vendor orders linked to a count
// ============================================

router.get('/:countId/vendor-orders', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const countId = req.params.countId;

    // Verify count exists
    const countCheck = await pool.query(
      `SELECT id FROM inventory_counts WHERE id = $1 AND (org_id = $2 OR org_id IS NULL)`,
      [countId, orgId]
    );

    if (countCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count not found',
        code: 'NOT_FOUND'
      });
    }

    // Get linked vendor orders
    const result = await pool.query(`
      SELECT
        cvo.id,
        cvo.vendor_order_id,
        cvo.included,
        cvo.created_at,
        vo.vendor_name,
        vo.order_number,
        vo.order_date,
        vo.total_cents,
        vo.total_lines,
        vo.status as order_status
      FROM count_vendor_orders cvo
      JOIN vendor_orders vo ON vo.id = cvo.vendor_order_id
      WHERE cvo.count_id = $1
      ORDER BY vo.order_date DESC
    `, [countId]);

    res.json({
      success: true,
      countId,
      vendorOrders: result.rows.map(o => ({
        id: o.id,
        vendorOrderId: o.vendor_order_id,
        included: o.included,
        linkedAt: o.created_at,
        vendorName: o.vendor_name,
        orderNumber: o.order_number,
        orderDate: o.order_date,
        total: o.total_cents ? (o.total_cents / 100).toFixed(2) : '0.00',
        lineCount: o.total_lines || 0,
        orderStatus: o.order_status
      })),
      summary: {
        total: result.rows.length,
        included: result.rows.filter(o => o.included).length,
        excluded: result.rows.filter(o => !o.included).length
      }
    });

  } catch (error) {
    console.error('[Counts] Get vendor orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor orders',
      code: 'GET_ERROR'
    });
  }
});

// ============================================
// POST /api/counts/:id/vendor-orders/:orderId/toggle
// Toggle inclusion of a vendor order in the count
// ============================================

router.post('/:countId/vendor-orders/:orderId/toggle', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { countId, orderId } = req.params;
    const { included } = req.body;

    if (typeof included !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'included field must be a boolean',
        code: 'VALIDATION_ERROR'
      });
    }

    // Verify count exists and is not closed
    const countCheck = await pool.query(
      `SELECT id, status FROM inventory_counts WHERE id = $1 AND (org_id = $2 OR org_id IS NULL)`,
      [countId, orgId]
    );

    if (countCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count not found',
        code: 'COUNT_NOT_FOUND'
      });
    }

    if (countCheck.rows[0].status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify a closed count',
        code: 'COUNT_CLOSED'
      });
    }

    // Upsert the link with new included value
    const result = await pool.query(`
      INSERT INTO count_vendor_orders (count_id, vendor_order_id, included, created_by, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (count_id, vendor_order_id)
      DO UPDATE SET included = $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [countId, orderId, included, userId]);

    // Log breadcrumb
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, ['count_invoice_toggle', JSON.stringify({
        countId,
        vendorOrderId: orderId,
        included,
        userId
      })]);
    } catch (e) { /* ignore */ }

    res.json({
      success: true,
      message: `Vendor order ${included ? 'included in' : 'excluded from'} count`,
      result: result.rows[0]
    });

  } catch (error) {
    console.error('[Counts] Toggle vendor order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle vendor order',
      code: 'TOGGLE_ERROR'
    });
  }
});

// ============================================
// POST /api/counts/:id/link-vendor-orders
// Link all vendor orders up to a date
// ============================================

router.post('/:countId/link-vendor-orders', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const countId = req.params.countId;
    const { upToDate, vendorOrderIds } = req.body;

    // Verify count exists
    const countCheck = await pool.query(
      `SELECT id, status FROM inventory_counts WHERE id = $1 AND (org_id = $2 OR org_id IS NULL)`,
      [countId, orgId]
    );

    if (countCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count not found',
        code: 'NOT_FOUND'
      });
    }

    let linkedCount = 0;

    if (vendorOrderIds && Array.isArray(vendorOrderIds)) {
      // Link specific orders
      for (const orderId of vendorOrderIds) {
        const result = await pool.query(`
          INSERT INTO count_vendor_orders (count_id, vendor_order_id, included, created_by)
          VALUES ($1, $2, TRUE, $3)
          ON CONFLICT (count_id, vendor_order_id) DO NOTHING
          RETURNING id
        `, [countId, orderId, userId]);
        if (result.rows.length > 0) linkedCount++;
      }
    } else if (upToDate) {
      // Link all orders up to date
      const result = await pool.query(`
        INSERT INTO count_vendor_orders (count_id, vendor_order_id, included, created_by)
        SELECT $1, id, TRUE, $3
        FROM vendor_orders
        WHERE deleted_at IS NULL
          AND order_date <= $2
          AND (org_id = $4 OR org_id IS NULL)
        ON CONFLICT (count_id, vendor_order_id) DO NOTHING
        RETURNING id
      `, [countId, upToDate, userId, orgId]);
      linkedCount = result.rows.length;
    }

    res.json({
      success: true,
      message: `Linked ${linkedCount} vendor orders to count`,
      linkedCount
    });

  } catch (error) {
    console.error('[Counts] Link vendor orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link vendor orders',
      code: 'LINK_ERROR'
    });
  }
});

// ============================================
// POST /api/locations/:locationId/items/add-by-code
// Add item to location by item code
// ============================================

router.post('/locations/:locationId/items/add-by-code', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const locationId = req.params.locationId;
    const { itemCode, quantity, unit } = req.body;

    if (!itemCode) {
      return res.status(400).json({
        success: false,
        error: 'Item code is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Look up item by code
    const itemResult = await pool.query(`
      SELECT id, item_code, description, category, unit, unit_cost
      FROM inventory_items
      WHERE item_code = $1 AND (org_id = $2 OR org_id IS NULL) AND is_active = 1
    `, [itemCode, orgId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item code not found in catalog',
        code: 'ITEM_NOT_FOUND',
        hint: `No item with code "${itemCode}" found. Check the code or add the item to the catalog first.`
      });
    }

    const item = itemResult.rows[0];

    // Verify location exists
    const locationResult = await pool.query(`
      SELECT id, name FROM storage_locations
      WHERE id = $1 AND (tenant_id::text = $2 OR tenant_id IS NULL) AND is_active = TRUE
    `, [locationId, orgId]);

    if (locationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
        code: 'LOCATION_NOT_FOUND'
      });
    }

    const location = locationResult.rows[0];

    // Check if item_location_assignments table exists and use it
    // Otherwise update the item's location directly
    let assignmentResult;
    try {
      assignmentResult = await pool.query(`
        INSERT INTO item_location_assignments (
          item_id, location_id, quantity, unit, org_id, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (item_id, location_id)
        DO UPDATE SET
          quantity = item_location_assignments.quantity + EXCLUDED.quantity,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [item.id, locationId, parseFloat(quantity) || 1, unit || item.unit || 'EACH', orgId, userId]);
    } catch (tableError) {
      // Table may not exist - update item directly
      await pool.query(`
        UPDATE inventory_items
        SET location = $1, current_quantity = current_quantity + $2
        WHERE id = $3
      `, [locationId, parseFloat(quantity) || 1, item.id]);

      assignmentResult = { rows: [{ item_id: item.id, location_id: locationId, quantity: quantity }] };
    }

    // Log breadcrumb
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, ['item_added_to_location', JSON.stringify({
        itemCode,
        itemId: item.id,
        locationId,
        locationName: location.name,
        quantity,
        userId
      })]);
    } catch (e) { /* ignore */ }

    res.json({
      success: true,
      message: `Added ${quantity || 1} ${unit || item.unit || 'units'} of "${item.description || itemCode}" to ${location.name}`,
      item: {
        id: item.id,
        code: item.item_code,
        description: item.description,
        category: item.category
      },
      location: {
        id: location.id,
        name: location.name
      },
      assignment: assignmentResult.rows[0]
    });

  } catch (error) {
    console.error('[Counts] Add item by code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add item to location',
      code: 'ADD_ERROR',
      details: error.message
    });
  }
});

// ============================================
// GET /api/counts/stats - Get count statistics
// ============================================

router.get('/stats/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_counts,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'pending_approval' OR status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'approved' OR status = 'completed' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count,
        MAX(created_at) as last_count_date
      FROM inventory_counts
      WHERE (org_id::text = $1 OR org_id IS NULL)
    `, [orgId]);

    const stats = result.rows[0];

    res.json({
      success: true,
      stats: {
        totalCounts: parseInt(stats.total_counts) || 0,
        byStatus: {
          draft: parseInt(stats.draft_count) || 0,
          pendingApproval: parseInt(stats.pending_count) || 0,
          approved: parseInt(stats.approved_count) || 0,
          closed: parseInt(stats.closed_count) || 0
        },
        lastCountDate: stats.last_count_date
      }
    });

  } catch (error) {
    console.error('[Counts] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      code: 'STATS_ERROR'
    });
  }
});

// ============================================
// V23.3 INVOICE-AWARE COUNTS
// Link and exclude invoices from counts
// ============================================

// POST /api/counts/:countId/invoices - Link invoice to count
router.post('/:countId/invoices', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { countId } = req.params;
    const { vendor_order_id } = req.body;

    if (!vendor_order_id) {
      return res.status(400).json({
        success: false,
        error: 'vendor_order_id required',
        code: 'MISSING_PARAM'
      });
    }

    // Use the link_invoice_to_count function
    const result = await pool.query(
      'SELECT link_invoice_to_count($1, $2, $3, $4) AS link_id',
      [orgId, countId, vendor_order_id, userId]
    );

    res.status(201).json({
      success: true,
      message: 'Invoice linked to count',
      link_id: result.rows[0].link_id,
      count_id: parseInt(countId),
      vendor_order_id
    });

  } catch (error) {
    console.error('[Counts] Link invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link invoice',
      code: 'LINK_ERROR'
    });
  }
});

// GET /api/counts/:countId/invoices - Get invoices linked to count
router.get('/:countId/invoices', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { countId } = req.params;

    const result = await pool.query(`
      SELECT
        ici.*,
        vo.status AS current_invoice_status,
        vo.total_lines
      FROM inventory_count_invoices ici
      LEFT JOIN vendor_orders vo ON ici.vendor_order_id = vo.id
      WHERE ici.org_id = $1 AND ici.count_id = $2
      ORDER BY ici.invoice_order_date DESC
    `, [orgId, countId]);

    // Get summary
    const summary = await pool.query(`
      SELECT * FROM count_invoice_summary
      WHERE org_id = $1 AND count_id = $2
    `, [orgId, countId]);

    res.json({
      success: true,
      count_id: parseInt(countId),
      invoices: result.rows,
      summary: summary.rows[0] || null
    });

  } catch (error) {
    console.error('[Counts] Get invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invoices',
      code: 'GET_INVOICES_ERROR'
    });
  }
});

// PUT /api/counts/:countId/invoices/:invoiceId/exclude - Exclude invoice from count
router.put('/:countId/invoices/:invoiceId/exclude', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { countId, invoiceId } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      'SELECT exclude_invoice_from_count($1, $2, $3, $4, $5) AS excluded',
      [orgId, countId, invoiceId, userId, reason || null]
    );

    if (!result.rows[0].excluded) {
      return res.status(404).json({
        success: false,
        error: 'Invoice link not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Invoice excluded from count',
      count_id: parseInt(countId),
      vendor_order_id: invoiceId
    });

  } catch (error) {
    console.error('[Counts] Exclude invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to exclude invoice',
      code: 'EXCLUDE_ERROR'
    });
  }
});

// PUT /api/counts/:countId/invoices/:invoiceId/include - Re-include previously excluded invoice
router.put('/:countId/invoices/:invoiceId/include', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { countId, invoiceId } = req.params;

    const result = await pool.query(`
      UPDATE inventory_count_invoices
      SET is_excluded = FALSE, excluded_at = NULL, excluded_by = NULL, exclusion_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND count_id = $2 AND vendor_order_id = $3
      RETURNING id
    `, [orgId, countId, invoiceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice link not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Invoice re-included in count',
      count_id: parseInt(countId),
      vendor_order_id: invoiceId
    });

  } catch (error) {
    console.error('[Counts] Include invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to include invoice',
      code: 'INCLUDE_ERROR'
    });
  }
});

// GET /api/counts/:countId/theoretical - Calculate theoretical quantities
router.get('/:countId/theoretical', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { countId } = req.params;

    // Get all items that have received quantities from linked, non-excluded invoices
    const result = await pool.query(`
      SELECT
        vol.vendor_sku AS item_code,
        vol.description AS item_description,
        SUM(vol.received_qty) AS received_quantity,
        COUNT(DISTINCT ici.vendor_order_id) AS invoices_count
      FROM inventory_count_invoices ici
      JOIN vendor_order_lines vol ON ici.vendor_order_id = vol.order_id
      WHERE ici.org_id = $1
        AND ici.count_id = $2
        AND ici.is_excluded = FALSE
      GROUP BY vol.vendor_sku, vol.description
      ORDER BY vol.description
    `, [orgId, countId]);

    res.json({
      success: true,
      count_id: parseInt(countId),
      theoretical_items: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Counts] Theoretical calc error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate theoretical quantities',
      code: 'THEORETICAL_ERROR'
    });
  }
});

// GET /api/counts/linkable-invoices - Get invoices available to link
router.get('/linkable-invoices', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { from_date, to_date, vendor_id } = req.query;

    let whereConditions = ["vo.org_id = $1 OR vo.org_id = 'default-org'"];
    let params = [orgId];
    let paramIndex = 2;

    whereConditions.push("vo.status IN ('received', 'parsed', 'approved')");
    whereConditions.push("vo.deleted_at IS NULL");

    if (from_date) {
      whereConditions.push(`vo.order_date >= $${paramIndex++}`);
      params.push(from_date);
    }
    if (to_date) {
      whereConditions.push(`vo.order_date <= $${paramIndex++}`);
      params.push(to_date);
    }
    if (vendor_id) {
      whereConditions.push(`vo.vendor_id = $${paramIndex++}`);
      params.push(vendor_id);
    }

    const result = await pool.query(`
      SELECT
        vo.id AS vendor_order_id,
        vo.order_number,
        vo.order_date,
        vo.vendor_name,
        vo.vendor_id,
        vo.total_lines,
        vo.total_cents,
        vo.status,
        EXISTS (
          SELECT 1 FROM inventory_count_invoices ici
          WHERE ici.vendor_order_id = vo.id
        ) AS is_linked_to_any_count
      FROM vendor_orders vo
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY vo.order_date DESC
      LIMIT 100
    `, params);

    res.json({
      success: true,
      invoices: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Counts] Linkable invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get linkable invoices',
      code: 'LINKABLE_ERROR'
    });
  }
});

module.exports = router;
