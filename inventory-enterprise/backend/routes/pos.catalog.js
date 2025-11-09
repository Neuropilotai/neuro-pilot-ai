/**
 * POS Catalog Route
 * Provides sellable items, recipes, and quick tiles for POS frontend
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();

// Validation schemas
const catalogQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  markup: z.coerce.number().min(1.0).max(10.0).default(1.30)
});

/**
 * GET / - Get merged sellable catalog (items + recipes)
 */
router.get('/', async (req, res) => {
  try {
    // Validate query params
    const params = catalogQuerySchema.parse(req.query);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get sellable items
    const itemsResult = await global.db.query(
      `SELECT * FROM get_sellable_items($1, $2, $3, $4, $5)`,
      [orgId, siteId, params.search || null, params.limit, params.offset]
    );

    // Get sellable recipes
    const recipesResult = await global.db.query(
      `SELECT * FROM get_sellable_recipes($1, $2, $3, $4, $5, $6)`,
      [orgId, siteId, params.search || null, params.markup, params.limit, params.offset]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, details, ip_address)
       VALUES ($1, $2, 'CATALOG_VIEW', $3, $4, $5)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        JSON.stringify({ search: params.search, category: params.category }),
        req.ip
      ]
    );

    res.json({
      success: true,
      data: {
        items: itemsResult.rows.map(item => ({
          kind: 'item',
          sku: item.sku,
          name: item.name,
          category: item.category,
          uom: item.uom,
          price_cents: item.current_price_cents,
          vendor: item.vendor_name,
          in_stock: item.in_stock
        })),
        recipes: recipesResult.rows.map(recipe => ({
          kind: 'recipe',
          code: recipe.code,
          name: recipe.name,
          category: recipe.category,
          portion_size: parseFloat(recipe.portion_size),
          portion_uom: recipe.portion_uom,
          cost_cents: recipe.cost_cents,
          price_cents: recipe.suggested_price_cents
        })),
        pagination: {
          limit: params.limit,
          offset: params.offset,
          has_more: itemsResult.rows.length === params.limit || recipesResult.rows.length === params.limit
        }
      }
    });

  } catch (error) {
    console.error('Catalog error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to load catalog',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /quick - Get curated quick tiles
 */
router.get('/quick', async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get quick tiles from settings or defaults
    const settingsResult = await global.db.query(
      `SELECT value FROM pos_settings
       WHERE org_id = $1 AND site_id = $2 AND key = 'quick_tiles'`,
      [orgId, siteId]
    );

    let quickTiles = [];

    if (settingsResult.rows.length > 0 && settingsResult.rows[0].value) {
      quickTiles = settingsResult.rows[0].value.tiles || [];
    } else {
      // Default quick tiles - most popular items
      const popularItems = await global.db.query(
        `SELECT
           ol.sku_or_code,
           ol.kind,
           ol.name_snapshot,
           COUNT(*) as sale_count,
           AVG(ol.unit_price_cents)::INTEGER as avg_price_cents
         FROM pos_order_lines ol
         JOIN pos_orders o ON o.id = ol.order_id
         WHERE o.org_id = $1
           AND o.site_id = $2
           AND o.status = 'paid'
           AND o.paid_at > CURRENT_DATE - INTERVAL '30 days'
         GROUP BY ol.sku_or_code, ol.kind, ol.name_snapshot
         ORDER BY sale_count DESC
         LIMIT 20`,
        [orgId, siteId]
      );

      quickTiles = popularItems.rows.map(item => ({
        kind: item.kind,
        sku_or_code: item.sku_or_code,
        name: item.name_snapshot,
        price_cents: item.avg_price_cents,
        color: item.kind === 'item' ? 'blue' : 'green'
      }));
    }

    res.json({
      success: true,
      data: {
        tiles: quickTiles
      }
    });

  } catch (error) {
    console.error('Quick tiles error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to load quick tiles',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * PUT /quick - Update quick tiles
 */
router.put('/quick', async (req, res) => {
  try {
    const updateSchema = z.object({
      tiles: z.array(z.object({
        kind: z.enum(['item', 'recipe', 'misc']),
        sku_or_code: z.string(),
        name: z.string(),
        price_cents: z.number().int().min(0),
        color: z.string().optional()
      })).max(50)
    });

    const data = updateSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Upsert quick tiles settings
    await global.db.query(
      `INSERT INTO pos_settings (org_id, site_id, key, value)
       VALUES ($1, $2, 'quick_tiles', $3)
       ON CONFLICT (org_id, site_id, key)
       DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP`,
      [orgId, siteId, JSON.stringify(data)]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, details, ip_address)
       VALUES ($1, $2, 'QUICK_TILES_UPDATE', $3, $4, $5)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        JSON.stringify({ tile_count: data.tiles.length }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Quick tiles updated successfully',
      data: data
    });

  } catch (error) {
    console.error('Update quick tiles error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tile data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update quick tiles',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
