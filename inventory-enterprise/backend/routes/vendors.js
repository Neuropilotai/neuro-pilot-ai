/**
 * Vendors & Pricing Routes
 * Manages vendors, vendor items, pricing imports, and org preferences
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { resolveEffectivePrice } = require('../services/costing');

// GET /api/vendors - List all vendors
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, code, active, created_at, updated_at
      FROM vendors
      ORDER BY name
    `);

    res.json({ success: true, vendors: result.rows });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vendors - Create vendor
router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, error: 'Name and code required' });
    }

    const result = await db.query(
      'INSERT INTO vendors (name, code) VALUES ($1, $2) RETURNING *',
      [name, code]
    );

    res.json({ success: true, vendor: result.rows[0] });
  } catch (err) {
    console.error('Error creating vendor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vendors/prices/import - Import vendor prices from CSV
router.post('/prices/import', async (req, res) => {
  try {
    const { rows } = req.body; // Array of {vendor, item_sku, price, currency, effective_from, vendor_sku?, pack_size?, uom?}
    const org_id = req.user?.org_id || 1;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided' });
    }

    const imported = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2; // +2 for header and 1-indexed

      try {
        // Validate required fields
        if (!row.vendor || !row.item_sku || !row.price || !row.effective_from) {
          errors.push({ line: lineNum, error: 'Missing required fields (vendor, item_sku, price, effective_from)' });
          continue;
        }

        // Get or create vendor
        let vendorQuery = await db.query('SELECT id FROM vendors WHERE code = $1', [row.vendor]);
        let vendorId;

        if (vendorQuery.rows.length === 0) {
          // Create vendor if doesn't exist
          const newVendor = await db.query(
            'INSERT INTO vendors (name, code) VALUES ($1, $2) RETURNING id',
            [row.vendor, row.vendor]
          );
          vendorId = newVendor.rows[0].id;
        } else {
          vendorId = vendorQuery.rows[0].id;
        }

        // Get or create vendor_item
        let vendorItemQuery = await db.query(
          'SELECT id FROM vendor_items WHERE vendor_id = $1 AND item_sku = $2',
          [vendorId, row.item_sku]
        );
        let vendorItemId;

        if (vendorItemQuery.rows.length === 0) {
          const newVendorItem = await db.query(`
            INSERT INTO vendor_items (vendor_id, item_sku, vendor_sku, pack_size, uom)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [vendorId, row.item_sku, row.vendor_sku || null, row.pack_size || null, row.uom || null]);
          vendorItemId = newVendorItem.rows[0].id;
        } else {
          vendorItemId = vendorItemQuery.rows[0].id;
        }

        // Insert vendor price
        await db.query(`
          INSERT INTO vendor_prices (vendor_item_id, price, currency, effective_from, source)
          VALUES ($1, $2, $3, $4, $5)
        `, [vendorItemId, row.price, row.currency || 'USD', row.effective_from, 'csv_import']);

        imported.push({ line: lineNum, item_sku: row.item_sku, vendor: row.vendor });
      } catch (err) {
        errors.push({ line: lineNum, error: err.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    });
  } catch (err) {
    console.error('Error importing vendor prices:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/vendors/prices - Get effective price for an item
router.get('/prices', async (req, res) => {
  try {
    const { item_sku, at } = req.query;
    const org_id = req.user?.org_id || 1;

    if (!item_sku) {
      return res.status(400).json({ success: false, error: 'item_sku required' });
    }

    const atDate = at || new Date().toISOString().split('T')[0];

    const priceInfo = await resolveEffectivePrice(org_id, item_sku, atDate);

    // Get vendor name
    const vendorQuery = await db.query('SELECT name FROM vendors WHERE id = $1', [priceInfo.vendor_id]);
    const vendorName = vendorQuery.rows[0]?.name || 'Unknown';

    res.json({
      success: true,
      item_sku,
      price: priceInfo.price,
      currency: priceInfo.currency,
      vendor_id: priceInfo.vendor_id,
      vendor_name: vendorName,
      source: priceInfo.source,
      date: atDate
    });
  } catch (err) {
    console.error('Error getting vendor price:', err);
    res.status(404).json({ success: false, error: err.message });
  }
});

// PUT /api/org/vendor-default - Set preferred vendor for org
router.put('/org/vendor-default', async (req, res) => {
  try {
    const { vendor_id } = req.body;
    const org_id = req.user?.org_id || 1;

    if (!vendor_id) {
      return res.status(400).json({ success: false, error: 'vendor_id required' });
    }

    // Upsert org vendor default
    await db.query(`
      INSERT INTO org_vendor_defaults (org_id, preferred_vendor_id)
      VALUES ($1, $2)
      ON CONFLICT (org_id) DO UPDATE SET preferred_vendor_id = $2, updated_at = CURRENT_TIMESTAMP
    `, [org_id, vendor_id]);

    res.json({ success: true, message: 'Preferred vendor updated' });
  } catch (err) {
    console.error('Error setting vendor default:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/org/vendor-default - Get preferred vendor for org
router.get('/org/vendor-default', async (req, res) => {
  try {
    const org_id = req.user?.org_id || 1;

    const result = await db.query(`
      SELECT ovd.preferred_vendor_id, v.name, v.code
      FROM org_vendor_defaults ovd
      JOIN vendors v ON ovd.preferred_vendor_id = v.id
      WHERE ovd.org_id = $1
    `, [org_id]);

    if (result.rows.length === 0) {
      return res.json({ success: true, vendor: null });
    }

    res.json({ success: true, vendor: result.rows[0] });
  } catch (err) {
    console.error('Error getting vendor default:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
