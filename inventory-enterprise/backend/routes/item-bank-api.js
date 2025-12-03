/**
 * Item Bank API - V23.3
 * NeuroPilot AI Enterprise
 *
 * Search and manage the centralized Item Bank (master_items, supplier_items, supplier_item_prices)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Helper to get org_id from request
function getOrgId(req) {
  return req.user?.org_id || 'default-org';
}

// ============================================
// GET /api/item-bank/search
// Search Item Bank by code, description, or UPC
// ============================================
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { q, vendor_id, limit = 50 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters',
        code: 'INVALID_QUERY'
      });
    }

    const searchTerm = `%${q.toLowerCase()}%`;
    const params = [orgId, searchTerm, searchTerm, searchTerm, parseInt(limit)];
    let vendorFilter = '';

    if (vendor_id) {
      vendorFilter = 'AND si.vendor_id = $6';
      params.push(parseInt(vendor_id));
    }

    const result = await pool.query(`
      SELECT
        si.id AS supplier_item_id,
        si.supplier_item_code,
        si.description,
        si.pack_size,
        si.unit_of_measure,
        si.brand,
        si.upc_barcode,
        si.vendor_id,
        v.name AS vendor_name,
        si.master_item_id,
        mi.item_code AS master_item_code,
        mi.category AS master_category,
        -- Latest price info
        sip.unit_price_cents AS latest_price_cents,
        sip.effective_date AS price_date,
        -- Format price for display
        ROUND(sip.unit_price_cents / 100.0, 2) AS latest_price_dollars
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      LEFT JOIN master_items mi ON si.master_item_id = mi.id
      LEFT JOIN LATERAL (
        SELECT unit_price_cents, effective_date
        FROM supplier_item_prices
        WHERE supplier_item_id = si.id
        ORDER BY effective_date DESC
        LIMIT 1
      ) sip ON TRUE
      WHERE si.org_id = $1
        AND si.is_active = TRUE
        AND (
          LOWER(si.supplier_item_code) LIKE $2
          OR LOWER(si.description) LIKE $3
          OR si.upc_barcode LIKE $4
        )
        ${vendorFilter}
      ORDER BY
        CASE WHEN LOWER(si.supplier_item_code) = LOWER($2) THEN 0 ELSE 1 END,
        si.description
      LIMIT $5
    `, params);

    res.json({
      success: true,
      query: q,
      count: result.rows.length,
      items: result.rows
    });

  } catch (error) {
    console.error('[ItemBank] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      code: 'SEARCH_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/lookup/:code
// Lookup single item by exact code
// ============================================
router.get('/lookup/:code', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { code } = req.params;
    const { vendor_id } = req.query;

    const params = [orgId, code];
    let vendorFilter = '';

    if (vendor_id) {
      vendorFilter = 'AND si.vendor_id = $3';
      params.push(parseInt(vendor_id));
    }

    const result = await pool.query(`
      SELECT
        si.id AS supplier_item_id,
        si.supplier_item_code,
        si.description,
        si.pack_size,
        si.unit_of_measure,
        si.brand,
        si.upc_barcode,
        si.vendor_id,
        v.name AS vendor_name,
        si.master_item_id,
        mi.item_code AS master_item_code,
        mi.description AS master_description,
        mi.category AS master_category,
        mi.fifo_category,
        mi.is_perishable,
        -- All price history
        COALESCE(
          (SELECT json_agg(prices ORDER BY prices.effective_date DESC)
           FROM (
             SELECT unit_price_cents, effective_date, source
             FROM supplier_item_prices
             WHERE supplier_item_id = si.id
             ORDER BY effective_date DESC
             LIMIT 10
           ) prices
          ), '[]'::json
        ) AS price_history,
        -- Latest price
        (SELECT unit_price_cents FROM supplier_item_prices
         WHERE supplier_item_id = si.id
         ORDER BY effective_date DESC LIMIT 1) AS latest_price_cents
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      LEFT JOIN master_items mi ON si.master_item_id = mi.id
      WHERE si.org_id = $1
        AND si.supplier_item_code = $2
        ${vendorFilter}
      LIMIT 1
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      item: result.rows[0]
    });

  } catch (error) {
    console.error('[ItemBank] Lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Lookup failed',
      code: 'LOOKUP_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/stats
// Get Item Bank statistics
// ============================================
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM master_items WHERE org_id = $1) AS master_items_count,
        (SELECT COUNT(*) FROM supplier_items WHERE org_id = $1 AND is_active = TRUE) AS supplier_items_count,
        (SELECT COUNT(*) FROM supplier_item_prices sip
         JOIN supplier_items si ON sip.supplier_item_id = si.id
         WHERE si.org_id = $1) AS price_records_count,
        (SELECT COUNT(DISTINCT vendor_id) FROM supplier_items WHERE org_id = $1) AS vendors_with_items,
        (SELECT MAX(effective_date) FROM supplier_item_prices sip
         JOIN supplier_items si ON sip.supplier_item_id = si.id
         WHERE si.org_id = $1) AS latest_price_date
    `, [orgId]);

    res.json({
      success: true,
      stats: result.rows[0]
    });

  } catch (error) {
    console.error('[ItemBank] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      code: 'STATS_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/vendors
// Get vendors with Item Bank item counts
// ============================================
router.get('/vendors', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.code AS vendor_code,
        COUNT(si.id) AS item_count,
        MAX(si.updated_at) AS last_item_update
      FROM vendors v
      LEFT JOIN supplier_items si ON v.id = si.vendor_id AND si.org_id = $1 AND si.is_active = TRUE
      WHERE v.org_id = $1 OR v.org_id IS NULL
      GROUP BY v.id, v.name, v.code
      HAVING COUNT(si.id) > 0
      ORDER BY item_count DESC, v.name
    `, [orgId]);

    res.json({
      success: true,
      vendors: result.rows
    });

  } catch (error) {
    console.error('[ItemBank] Vendors error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get vendors',
      code: 'VENDORS_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/price-history/:supplierItemId
// Get full price history for an item
// ============================================
router.get('/price-history/:supplierItemId', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { supplierItemId } = req.params;

    // Verify item belongs to org
    const itemCheck = await pool.query(
      'SELECT id FROM supplier_items WHERE id = $1 AND org_id = $2',
      [supplierItemId, orgId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
        code: 'NOT_FOUND'
      });
    }

    const result = await pool.query(`
      SELECT
        sip.id,
        sip.unit_price_cents,
        ROUND(sip.unit_price_cents / 100.0, 2) AS unit_price_dollars,
        sip.effective_date,
        sip.source,
        sip.source_order_id,
        vo.order_number,
        vo.order_date AS invoice_date
      FROM supplier_item_prices sip
      LEFT JOIN vendor_orders vo ON sip.source_order_id = vo.id
      WHERE sip.supplier_item_id = $1
      ORDER BY sip.effective_date DESC
      LIMIT 100
    `, [supplierItemId]);

    res.json({
      success: true,
      supplier_item_id: parseInt(supplierItemId),
      price_history: result.rows
    });

  } catch (error) {
    console.error('[ItemBank] Price history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get price history',
      code: 'PRICE_HISTORY_ERROR'
    });
  }
});

// ============================================
// POST /api/item-bank/link-master
// Link a supplier item to a master item
// ============================================
router.post('/link-master', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { supplier_item_id, master_item_id } = req.body;

    if (!supplier_item_id) {
      return res.status(400).json({
        success: false,
        error: 'supplier_item_id required',
        code: 'MISSING_PARAM'
      });
    }

    // Update supplier_item with master_item_id
    const result = await pool.query(`
      UPDATE supplier_items
      SET master_item_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND org_id = $2
      RETURNING id, supplier_item_code, description, master_item_id
    `, [supplier_item_id, orgId, master_item_id || null]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier item not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: master_item_id ? 'Linked to master item' : 'Unlinked from master item',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('[ItemBank] Link master error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link master item',
      code: 'LINK_ERROR'
    });
  }
});

// ============================================
// POST /api/item-bank/master-items
// Create a new master item
// ============================================
router.post('/master-items', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id || 'system';
    const {
      item_code,
      description,
      category,
      fifo_category,
      is_perishable = false,
      default_unit = 'EACH'
    } = req.body;

    if (!item_code || !description) {
      return res.status(400).json({
        success: false,
        error: 'item_code and description required',
        code: 'MISSING_PARAMS'
      });
    }

    const result = await pool.query(`
      INSERT INTO master_items (org_id, item_code, description, category, fifo_category, is_perishable, default_unit, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (org_id, item_code) DO UPDATE SET
        description = EXCLUDED.description,
        category = COALESCE(EXCLUDED.category, master_items.category),
        fifo_category = COALESCE(EXCLUDED.fifo_category, master_items.fifo_category),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [orgId, item_code, description, category, fifo_category, is_perishable, default_unit, userId]);

    res.status(201).json({
      success: true,
      master_item: result.rows[0]
    });

  } catch (error) {
    console.error('[ItemBank] Create master item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create master item',
      code: 'CREATE_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/master-items
// List all master items
// ============================================
router.get('/master-items', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { category, limit = 100, offset = 0 } = req.query;

    let whereClause = 'WHERE org_id = $1';
    const params = [orgId];

    if (category) {
      whereClause += ' AND category = $2';
      params.push(category);
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(`
      SELECT
        mi.*,
        (SELECT COUNT(*) FROM supplier_items si WHERE si.master_item_id = mi.id) AS supplier_items_count
      FROM master_items mi
      ${whereClause}
      ORDER BY mi.item_code
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM master_items ${whereClause}`,
      params.slice(0, category ? 2 : 1)
    );

    res.json({
      success: true,
      master_items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[ItemBank] List master items error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list master items',
      code: 'LIST_ERROR'
    });
  }
});

// ============================================
// POST /api/item-bank/add-to-location
// Add item from Item Bank to a location
// ============================================
router.post('/add-to-location', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id || 'system';
    const {
      location_id,
      location_name,
      supplier_item_id,
      master_item_id,
      item_code,
      par_level,
      reorder_point,
      initial_quantity
    } = req.body;

    if (!location_id || (!supplier_item_id && !master_item_id && !item_code)) {
      return res.status(400).json({
        success: false,
        error: 'location_id and at least one of supplier_item_id, master_item_id, or item_code required',
        code: 'MISSING_PARAMS'
      });
    }

    // Look up item details from Item Bank
    let itemDetails = null;
    let resolvedSupplierItemId = supplier_item_id;
    let resolvedMasterItemId = master_item_id;
    let resolvedItemCode = item_code;
    let itemDescription = null;
    let supplierName = null;
    let latestPriceCents = null;

    if (supplier_item_id) {
      // Look up by supplier_item_id
      const siResult = await pool.query(`
        SELECT si.*, v.name AS vendor_name,
          (SELECT unit_price_cents FROM supplier_item_prices WHERE supplier_item_id = si.id ORDER BY effective_date DESC LIMIT 1) AS latest_price
        FROM supplier_items si
        JOIN vendors v ON si.vendor_id = v.id
        WHERE si.id = $1 AND si.org_id = $2
      `, [supplier_item_id, orgId]);

      if (siResult.rows.length > 0) {
        itemDetails = siResult.rows[0];
        resolvedItemCode = itemDetails.supplier_item_code;
        resolvedMasterItemId = itemDetails.master_item_id;
        itemDescription = itemDetails.description;
        supplierName = itemDetails.vendor_name;
        latestPriceCents = itemDetails.latest_price;
      }
    } else if (item_code) {
      // Look up by item_code (search supplier_items first, then master_items)
      const siResult = await pool.query(`
        SELECT si.*, v.name AS vendor_name,
          (SELECT unit_price_cents FROM supplier_item_prices WHERE supplier_item_id = si.id ORDER BY effective_date DESC LIMIT 1) AS latest_price
        FROM supplier_items si
        JOIN vendors v ON si.vendor_id = v.id
        WHERE si.supplier_item_code = $1 AND si.org_id = $2
        LIMIT 1
      `, [item_code, orgId]);

      if (siResult.rows.length > 0) {
        itemDetails = siResult.rows[0];
        resolvedSupplierItemId = itemDetails.id;
        resolvedMasterItemId = itemDetails.master_item_id;
        itemDescription = itemDetails.description;
        supplierName = itemDetails.vendor_name;
        latestPriceCents = itemDetails.latest_price;
      } else {
        // Try master_items
        const miResult = await pool.query(
          'SELECT * FROM master_items WHERE item_code = $1 AND org_id = $2 LIMIT 1',
          [item_code, orgId]
        );
        if (miResult.rows.length > 0) {
          itemDetails = miResult.rows[0];
          resolvedMasterItemId = itemDetails.id;
          itemDescription = itemDetails.description;
        }
      }
    } else if (master_item_id) {
      // Look up by master_item_id
      const miResult = await pool.query(
        'SELECT * FROM master_items WHERE id = $1 AND org_id = $2',
        [master_item_id, orgId]
      );
      if (miResult.rows.length > 0) {
        itemDetails = miResult.rows[0];
        resolvedItemCode = itemDetails.item_code;
        itemDescription = itemDetails.description;
      }
    }

    if (!itemDetails) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in Item Bank',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // Insert into location_item_assignments
    const result = await pool.query(`
      INSERT INTO location_item_assignments (
        org_id, location_id, location_name,
        master_item_id, supplier_item_id,
        item_code, item_description, supplier_name,
        par_level, reorder_point, quantity_on_hand,
        last_known_price_cents, price_snapshot_date,
        created_by
      ) VALUES (
        $1, $2, $3,
        $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, CURRENT_DATE,
        $13
      )
      ON CONFLICT (org_id, location_id, item_code) DO UPDATE SET
        item_description = EXCLUDED.item_description,
        supplier_name = EXCLUDED.supplier_name,
        par_level = COALESCE(EXCLUDED.par_level, location_item_assignments.par_level),
        reorder_point = COALESCE(EXCLUDED.reorder_point, location_item_assignments.reorder_point),
        last_known_price_cents = EXCLUDED.last_known_price_cents,
        price_snapshot_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP,
        is_active = TRUE
      RETURNING *
    `, [
      orgId,
      location_id,
      location_name || location_id,
      resolvedMasterItemId,
      resolvedSupplierItemId,
      resolvedItemCode,
      itemDescription,
      supplierName,
      par_level || 0,
      reorder_point || 0,
      initial_quantity || 0,
      latestPriceCents,
      userId
    ]);

    res.status(201).json({
      success: true,
      message: 'Item added to location',
      assignment: result.rows[0],
      item_bank_source: {
        supplier_item_id: resolvedSupplierItemId,
        master_item_id: resolvedMasterItemId,
        item_code: resolvedItemCode
      }
    });

  } catch (error) {
    console.error('[ItemBank] Add to location error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add item to location',
      code: 'ADD_TO_LOCATION_ERROR'
    });
  }
});

// ============================================
// GET /api/item-bank/location/:locationId/items
// Get all Item Bank items assigned to a location
// ============================================
router.get('/location/:locationId/items', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { locationId } = req.params;

    const result = await pool.query(`
      SELECT
        lia.*,
        mi.category AS master_category,
        mi.fifo_category,
        si.pack_size,
        si.vendor_id,
        v.name AS vendor_name,
        ROUND(lia.last_known_price_cents / 100.0, 2) AS price_dollars
      FROM location_item_assignments lia
      LEFT JOIN master_items mi ON lia.master_item_id = mi.id
      LEFT JOIN supplier_items si ON lia.supplier_item_id = si.id
      LEFT JOIN vendors v ON si.vendor_id = v.id
      WHERE lia.org_id = $1
        AND lia.location_id = $2
        AND lia.is_active = TRUE
      ORDER BY lia.item_code
    `, [orgId, locationId]);

    res.json({
      success: true,
      location_id: locationId,
      items: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[ItemBank] Get location items error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get location items',
      code: 'GET_LOCATION_ITEMS_ERROR'
    });
  }
});

// ============================================
// DELETE /api/item-bank/location/:locationId/items/:itemCode
// Remove an item from a location
// ============================================
router.delete('/location/:locationId/items/:itemCode', authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { locationId, itemCode } = req.params;

    // Soft delete by setting is_active = FALSE
    const result = await pool.query(`
      UPDATE location_item_assignments
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND location_id = $2 AND item_code = $3
      RETURNING id, item_code
    `, [orgId, locationId, itemCode]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in location',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Item removed from location',
      removed: result.rows[0]
    });

  } catch (error) {
    console.error('[ItemBank] Remove from location error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove item from location',
      code: 'REMOVE_ERROR'
    });
  }
});

module.exports = router;
