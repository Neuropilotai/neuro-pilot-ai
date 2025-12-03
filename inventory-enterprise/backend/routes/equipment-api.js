/**
 * Equipment API Routes (v23.4.0)
 * API for managing equipment/furniture items from Item Bank
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../db/postgres');

// ============================================================================
// GET /api/equipment/stats - Get equipment statistics
// ============================================================================
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const orgId = req.user?.org_id || 'default-org';

    // Get stats from supplier_items and vendors with equipment type
    const statsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT si.id) as total_items,
        COALESCE(SUM(sip.unit_price_cents), 0) as total_value_cents,
        COUNT(DISTINCT v.id) as vendor_count,
        COUNT(DISTINCT CASE WHEN mi.is_capital_asset = TRUE THEN mi.id END) as capital_assets
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      LEFT JOIN master_items mi ON si.master_item_id = mi.id
      LEFT JOIN LATERAL (
        SELECT unit_price_cents
        FROM supplier_item_prices
        WHERE supplier_item_id = si.id
        ORDER BY effective_date DESC
        LIMIT 1
      ) sip ON true
      WHERE si.org_id = $1
        AND si.is_active = TRUE
        AND (si.item_type = 'equipment' OR v.vendor_type = 'equipment')
    `, [orgId]);

    const stats = statsResult.rows[0] || {};

    res.json({
      success: true,
      stats: {
        totalItems: parseInt(stats.total_items) || 0,
        totalValue: (parseInt(stats.total_value_cents) || 0) / 100,
        vendorCount: parseInt(stats.vendor_count) || 0,
        capitalAssets: parseInt(stats.capital_assets) || 0
      }
    });
  } catch (error) {
    console.error('[Equipment API] Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/equipment/items - Get equipment items with pagination
// ============================================================================
router.get('/items', async (req, res) => {
  try {
    const pool = getPool();
    const orgId = req.user?.org_id || 'default-org';
    const { limit = 50, offset = 0, q, vendor_id, category } = req.query;

    let whereClause = `
      WHERE si.org_id = $1
        AND si.is_active = TRUE
        AND (si.item_type = 'equipment' OR v.vendor_type = 'equipment')
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (q) {
      whereClause += ` AND (
        si.supplier_description ILIKE $${paramIndex}
        OR si.supplier_item_code ILIKE $${paramIndex}
        OR si.manufacturer ILIKE $${paramIndex}
        OR si.model_number ILIKE $${paramIndex}
        OR v.name ILIKE $${paramIndex}
      )`;
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (vendor_id) {
      whereClause += ` AND si.vendor_id = $${paramIndex}`;
      params.push(vendor_id);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND si.supplier_category ILIKE $${paramIndex}`;
      params.push(`%${category}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Get items with latest price
    params.push(parseInt(limit), parseInt(offset));
    const itemsResult = await pool.query(`
      SELECT
        si.id,
        si.supplier_item_code,
        si.supplier_description as description,
        si.manufacturer,
        si.model_number,
        si.pack_size,
        si.supplier_category as category,
        v.name as supplier_name,
        v.id as vendor_id,
        sip.unit_price_cents,
        sip.effective_date as price_date,
        mi.item_code as master_code,
        mi.is_capital_asset,
        mi.warranty_months
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      LEFT JOIN master_items mi ON si.master_item_id = mi.id
      LEFT JOIN LATERAL (
        SELECT unit_price_cents, effective_date
        FROM supplier_item_prices
        WHERE supplier_item_id = si.id
        ORDER BY effective_date DESC
        LIMIT 1
      ) sip ON true
      ${whereClause}
      ORDER BY si.supplier_description ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    res.json({
      success: true,
      items: itemsResult.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Equipment API] Items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/equipment/vendors - Get equipment vendors
// ============================================================================
router.get('/vendors', async (req, res) => {
  try {
    const pool = getPool();
    const orgId = req.user?.org_id || 'default-org';

    const result = await pool.query(`
      SELECT
        v.id,
        v.name,
        v.vendor_type,
        v.website,
        v.contact_email,
        COUNT(si.id) as item_count
      FROM vendors v
      LEFT JOIN supplier_items si ON v.id = si.vendor_id AND si.is_active = TRUE
      WHERE v.org_id = $1
        AND v.vendor_type = 'equipment'
      GROUP BY v.id, v.name, v.vendor_type, v.website, v.contact_email
      ORDER BY v.name ASC
    `, [orgId]);

    res.json({
      success: true,
      vendors: result.rows
    });
  } catch (error) {
    console.error('[Equipment API] Vendors error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/equipment/purchases - Get recent equipment purchases
// ============================================================================
router.get('/purchases', async (req, res) => {
  try {
    const pool = getPool();
    const orgId = req.user?.org_id || 'default-org';
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT
        vo.id,
        vo.order_number,
        vo.order_date,
        vo.vendor_name,
        vo.total_lines,
        vo.total_cents,
        vo.status
      FROM vendor_orders vo
      JOIN vendors v ON vo.vendor_id = v.id
      WHERE vo.org_id = $1
        AND vo.deleted_at IS NULL
        AND v.vendor_type = 'equipment'
      ORDER BY vo.order_date DESC
      LIMIT $2
    `, [orgId, parseInt(limit)]);

    res.json({
      success: true,
      purchases: result.rows
    });
  } catch (error) {
    console.error('[Equipment API] Purchases error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/equipment/export-csv - Export equipment to CSV
// ============================================================================
router.get('/export-csv', async (req, res) => {
  try {
    const pool = getPool();
    const orgId = req.user?.org_id || 'default-org';
    const { q, vendor_id, category } = req.query;

    let whereClause = `
      WHERE si.org_id = $1
        AND si.is_active = TRUE
        AND (si.item_type = 'equipment' OR v.vendor_type = 'equipment')
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (q) {
      whereClause += ` AND (
        si.supplier_description ILIKE $${paramIndex}
        OR si.supplier_item_code ILIKE $${paramIndex}
        OR si.manufacturer ILIKE $${paramIndex}
      )`;
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (vendor_id) {
      whereClause += ` AND si.vendor_id = $${paramIndex}`;
      params.push(vendor_id);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND si.supplier_category ILIKE $${paramIndex}`;
      params.push(`%${category}%`);
      paramIndex++;
    }

    const result = await pool.query(`
      SELECT
        si.supplier_item_code as "Item Code",
        si.supplier_description as "Description",
        v.name as "Vendor",
        si.manufacturer as "Manufacturer",
        si.model_number as "Model Number",
        si.pack_size as "Pack Size",
        si.supplier_category as "Category",
        ROUND(sip.unit_price_cents / 100.0, 2) as "Unit Price",
        mi.is_capital_asset as "Capital Asset",
        mi.warranty_months as "Warranty (months)"
      FROM supplier_items si
      JOIN vendors v ON si.vendor_id = v.id
      LEFT JOIN master_items mi ON si.master_item_id = mi.id
      LEFT JOIN LATERAL (
        SELECT unit_price_cents
        FROM supplier_item_prices
        WHERE supplier_item_id = si.id
        ORDER BY effective_date DESC
        LIMIT 1
      ) sip ON true
      ${whereClause}
      ORDER BY si.supplier_description ASC
    `, params);

    // Generate CSV
    const rows = result.rows;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No equipment items found' });
    }

    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      )
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="equipment-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('[Equipment API] Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
