/**
 * Vendors & Pricing Routes - V21.1
 * Multi-vendor time-series pricing with org preferences
 * Schema: vendors, vendor_prices, org_vendor_defaults (migration 009)
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

/**
 * Helper: Check database availability and return diagnostic error
 */
function checkDbAvailable(res) {
  if (!global.db || typeof global.db.query !== 'function') {
    console.error('[vendors] Database not available - global.db:', typeof global.db);
    res.status(503).json({
      success: false,
      error: 'Database unavailable',
      code: 'DB_UNAVAILABLE',
      diagnostic: {
        globalDbExists: !!global.db,
        queryFunctionExists: typeof global.db?.query === 'function',
        hint: 'Check DATABASE_URL environment variable and database connection'
      }
    });
    return false;
  }
  return true;
}

// GET /api/vendors - List all vendors with pricing stats
router.get('/', async (req, res) => {
  if (!checkDbAvailable(res)) return;

  const org_id = getOrgId(req);

  try {
    const result = await global.db.query(`
      SELECT
        v.*,
        COUNT(DISTINCT vp.id) as price_count,
        MAX(vp.updated_at) as last_price_update,
        COUNT(DISTINCT vp.sku) as sku_count
      FROM vendors v
      LEFT JOIN vendor_prices vp ON v.id = vp.vendor_id AND vp.org_id = v.org_id
      WHERE v.org_id = $1 AND v.active = true
      GROUP BY v.id
      ORDER BY v.preferred DESC, v.name ASC
    `, [org_id]);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/vendors error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'DB_ERROR',
      diagnostic: {
        errorName: error.name,
        hint: error.code === 'ECONNREFUSED' ? 'Database connection refused - check if PostgreSQL is running' :
              error.code === '42P01' ? 'Table does not exist - run migrations' :
              'Check Railway logs for more details'
      }
    });
  }
});

// GET /api/vendors/:id - Get vendor details
router.get('/:id', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;

  try {
    const vendor = await global.db.query(
      'SELECT * FROM vendors WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (vendor.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.json({ success: true, data: vendor.rows[0] });
  } catch (error) {
    console.error('GET /api/vendors/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vendors - Create new vendor
router.post('/', async (req, res) => {
  const org_id = getOrgId(req);
  const { name, contact_name, contact_email, contact_phone, address, city, state, zip, country, payment_terms, lead_time_days, notes, preferred } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Vendor name is required' });
  }

  try {
    const result = await global.db.query(`
      INSERT INTO vendors (
        org_id, name, contact_name, contact_email, contact_phone,
        address, city, state, zip, country, payment_terms,
        lead_time_days, notes, preferred, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
      RETURNING *
    `, [
      org_id, name, contact_name, contact_email, contact_phone,
      address, city, state, zip, country, payment_terms,
      lead_time_days || 7, notes, preferred || false
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/vendors error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;
  const { name, contact_name, contact_email, contact_phone, address, city, state, zip, country, payment_terms, lead_time_days, notes, preferred, active } = req.body;

  try {
    const result = await global.db.query(`
      UPDATE vendors SET
        name = COALESCE($3, name),
        contact_name = COALESCE($4, contact_name),
        contact_email = COALESCE($5, contact_email),
        contact_phone = COALESCE($6, contact_phone),
        address = COALESCE($7, address),
        city = COALESCE($8, city),
        state = COALESCE($9, state),
        zip = COALESCE($10, zip),
        country = COALESCE($11, country),
        payment_terms = COALESCE($12, payment_terms),
        lead_time_days = COALESCE($13, lead_time_days),
        notes = COALESCE($14, notes),
        preferred = COALESCE($15, preferred),
        active = COALESCE($16, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, [org_id, id, name, contact_name, contact_email, contact_phone, address, city, state, zip, country, payment_terms, lead_time_days, notes, preferred, active]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/vendors/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/vendors/:id - Soft delete vendor
router.delete('/:id', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;

  try {
    const result = await global.db.query(
      'UPDATE vendors SET active = false, updated_at = CURRENT_TIMESTAMP WHERE org_id = $1 AND id = $2 RETURNING id',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.json({ success: true, message: 'Vendor deactivated' });
  } catch (error) {
    console.error('DELETE /api/vendors/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/vendors/:id/prices - Get all prices for a vendor
router.get('/:id/prices', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;

  try {
    const result = await global.db.query(`
      SELECT vp.*, v.name as vendor_name
      FROM vendor_prices vp
      JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.org_id = $1 AND vp.vendor_id = $2
      ORDER BY vp.sku ASC, vp.valid_from DESC
    `, [org_id, id]);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/vendors/:id/prices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vendors/prices/import - Bulk import vendor prices from CSV
router.post('/prices/import', async (req, res) => {
  const org_id = getOrgId(req);
  const user_id = req.user?.id || req.user?.userId || req.user?.user_id || 'system';
  const { rows } = req.body;

  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ success: false, error: 'Request body must contain "rows" array' });
  }

  const imported = [];
  const errors = [];

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Validate required fields
        if (!row.vendor || !row.item_sku || !row.price) {
          errors.push({ line: i + 2, error: 'Missing required fields: vendor, item_sku, price' });
          continue;
        }

        // Get or create vendor
        let vendor = await global.db.query(
          'SELECT id FROM vendors WHERE org_id = $1 AND name = $2',
          [org_id, row.vendor]
        );

        if (vendor.rows.length === 0) {
          vendor = await global.db.query(
            'INSERT INTO vendors (org_id, name, active) VALUES ($1, $2, true) RETURNING id',
            [org_id, row.vendor]
          );
        }

        const vendor_id = vendor.rows[0].id;

        // Parse dates
        const valid_from = row.effective_from || new Date().toISOString().split('T')[0];
        const valid_to = row.effective_to || null;

        // Upsert vendor price
        await global.db.query(`
          INSERT INTO vendor_prices (
            org_id, vendor_id, sku, price, currency, uom,
            valid_from, valid_to, source, imported_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (org_id, vendor_id, sku, valid_from)
          DO UPDATE SET
            price = EXCLUDED.price,
            currency = EXCLUDED.currency,
            uom = EXCLUDED.uom,
            valid_to = EXCLUDED.valid_to,
            updated_at = CURRENT_TIMESTAMP
        `, [
          org_id,
          vendor_id,
          row.item_sku,
          parseFloat(row.price),
          row.currency || 'USD',
          row.uom || 'EA',
          valid_from,
          valid_to,
          'csv_import',
          user_id
        ]);

        imported.push({ line: i + 2, vendor: row.vendor, sku: row.item_sku, price: row.price });
      } catch (err) {
        console.error(`Import error on row ${i + 2}:`, err);
        errors.push({ line: i + 2, error: err.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    });
  } catch (error) {
    console.error('POST /api/vendors/prices/import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/vendors/prices/lookup - Lookup current price for a SKU using helper function
router.get('/prices/lookup', async (req, res) => {
  const org_id = getOrgId(req);
  const { sku, date } = req.query;

  if (!sku) {
    return res.status(400).json({ success: false, error: 'SKU parameter required' });
  }

  const lookup_date = date || new Date().toISOString().split('T')[0];

  try {
    const result = await global.db.query(`
      SELECT * FROM get_current_vendor_price($1, $2, $3)
    `, [org_id, sku, lookup_date]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No price found for SKU' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/vendors/prices/lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vendors/:id/set-preferred - Set vendor as preferred
router.post('/:id/set-preferred', async (req, res) => {
  const org_id = getOrgId(req);
  const { id } = req.params;

  try {
    // Unset all other preferred vendors
    await global.db.query(
      'UPDATE vendors SET preferred = false WHERE org_id = $1',
      [org_id]
    );

    // Set this vendor as preferred
    const result = await global.db.query(
      'UPDATE vendors SET preferred = true, updated_at = CURRENT_TIMESTAMP WHERE org_id = $1 AND id = $2 RETURNING *',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/vendors/:id/set-preferred error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
