/**
 * Price Bank Routes
 * Tracks latest vendor pricing for items with source PDF references.
 * v23.6.13 - Initial implementation (MVP)
 *
 * Endpoints:
 * - GET /api/price-bank/items/:itemCode/latest
 * - GET /api/price-bank/items/:itemCode/history?limit=20
 * - POST /api/price-bank/ingest  (body: { items: [...] })
 *
 * Notes:
 * - Uses org/tenant scoping via req.tenant.org_id when available.
 * - Persists both current snapshot (price_bank) and append-only history (price_history).
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

const TENANT_FALLBACK = 'default';

function getOrgId(req) {
  return req.tenant?.org_id || req.org?.org_id || req.user?.org_id || TENANT_FALLBACK;
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS price_bank (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      vendor TEXT NOT NULL,
      description TEXT,
      pack_size TEXT,
      unit_cost NUMERIC(12,4) NOT NULL,
      currency TEXT DEFAULT 'USD',
      effective_date DATE NOT NULL,
      source_pdf TEXT,
      source_page INTEGER,
      hash TEXT,
      parsed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, item_code, vendor, effective_date, hash)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      vendor TEXT NOT NULL,
      description TEXT,
      pack_size TEXT,
      unit_cost NUMERIC(12,4) NOT NULL,
      currency TEXT DEFAULT 'USD',
      effective_date DATE NOT NULL,
      source_pdf TEXT,
      source_page INTEGER,
      hash TEXT,
      parsed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// POST /api/price-bank/ingest
router.post(
  '/ingest',
  body('items').isArray({ min: 1 }),
  body('items.*.item_code').isString().notEmpty(),
  body('items.*.vendor').isString().notEmpty(),
  body('items.*.unit_cost').isNumeric(),
  body('items.*.effective_date').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const orgId = getOrgId(req);
    const { items } = req.body;

    try {
      await ensureTables(global.db);

      for (const row of items) {
        const {
          item_code,
          vendor,
          description,
          pack_size,
          unit_cost,
          currency = 'USD',
          effective_date,
          source_pdf = null,
          source_page = null,
          hash = null
        } = row;

        // Upsert into price_bank
        await global.db.query(
          `
          INSERT INTO price_bank
            (org_id, item_code, vendor, description, pack_size, unit_cost, currency, effective_date, source_pdf, source_page, hash)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (org_id, item_code, vendor, effective_date, hash)
          DO UPDATE SET
            description = EXCLUDED.description,
            pack_size = EXCLUDED.pack_size,
            unit_cost = EXCLUDED.unit_cost,
            currency = EXCLUDED.currency,
            source_pdf = EXCLUDED.source_pdf,
            source_page = EXCLUDED.source_page,
            updated_at = NOW()
          `,
          [orgId, item_code, vendor, description, pack_size, unit_cost, currency, effective_date, source_pdf, source_page, hash]
        );

        // Append to history
        await global.db.query(
          `
          INSERT INTO price_history
            (org_id, item_code, vendor, description, pack_size, unit_cost, currency, effective_date, source_pdf, source_page, hash)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [orgId, item_code, vendor, description, pack_size, unit_cost, currency, effective_date, source_pdf, source_page, hash]
        );
      }

      return res.json({ success: true, ingested: items.length });
    } catch (error) {
      console.error('price-bank ingest error', error);
      return res.status(500).json({ error: 'Failed to ingest price data' });
    }
  }
);

// GET /api/price-bank/items/:itemCode/latest
router.get(
  '/items/:itemCode/latest',
  param('itemCode').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const orgId = getOrgId(req);
    const { itemCode } = req.params;

    try {
      await ensureTables(global.db);

      const result = await global.db.query(
        `
        SELECT *
        FROM price_bank
        WHERE org_id = $1 AND item_code = $2
        ORDER BY effective_date DESC, updated_at DESC
        LIMIT 1
        `,
        [orgId, itemCode]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No price found for item' });
      }

      return res.json({ latest: result.rows[0] });
    } catch (error) {
      console.error('price-bank latest error', error);
      return res.status(500).json({ error: 'Failed to fetch latest price' });
    }
  }
);

// GET /api/price-bank/items/:itemCode/history
router.get(
  '/items/:itemCode/history',
  param('itemCode').isString().notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const orgId = getOrgId(req);
    const { itemCode } = req.params;
    const limit = parseInt(req.query.limit || '50', 10);

    try {
      await ensureTables(global.db);

      const result = await global.db.query(
        `
        SELECT *
        FROM price_history
        WHERE org_id = $1 AND item_code = $2
        ORDER BY effective_date DESC, created_at DESC
        LIMIT $3
        `,
        [orgId, itemCode, limit]
      );

      return res.json({ history: result.rows });
    } catch (error) {
      console.error('price-bank history error', error);
      return res.status(500).json({ error: 'Failed to fetch price history' });
    }
  }
);

module.exports = router;

