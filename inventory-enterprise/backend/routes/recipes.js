/**
 * Recipes Routes - V21.1
 * Recipe management with live cost calculation
 * Schema: recipes, recipe_items, recipe_cost_snapshots (migration 009)
 */

const express = require('express');
const router = express.Router();

// GET /api/recipes - List recipes with optional search
router.get('/', async (req, res) => {
  const { org_id } = req.user;
  const { search, active } = req.query;

  try {
    let query = `
      SELECT r.*,
        COUNT(DISTINCT ri.id) as ingredient_count
      FROM recipes r
      LEFT JOIN recipe_items ri ON r.id = ri.recipe_id
      WHERE r.org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (active !== undefined) {
      paramCount++;
      query += ` AND r.active = $${paramCount}`;
      params.push(active === 'true');
    }

    if (search) {
      paramCount++;
      query += ` AND (r.name ILIKE $${paramCount} OR r.code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' GROUP BY r.id ORDER BY r.name ASC';

    const result = await global.db.query(query, params);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/recipes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/recipes/:id - Get recipe with ingredients
router.get('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const recipe = await global.db.query(
      'SELECT * FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipe.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const items = await global.db.query(
      'SELECT * FROM recipe_items WHERE recipe_id = $1 ORDER BY id',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...recipe.rows[0],
        items: items.rows
      }
    });
  } catch (error) {
    console.error('GET /api/recipes/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/recipes - Create new recipe
router.post('/', async (req, res) => {
  const { org_id } = req.user;
  const { code, name, yield_qty, yield_uom, prep_loss_pct, allergens, nutrition, notes } = req.body;

  if (!code || !name || !yield_qty || !yield_uom) {
    return res.status(400).json({ success: false, error: 'Missing required fields: code, name, yield_qty, yield_uom' });
  }

  try {
    const result = await global.db.query(`
      INSERT INTO recipes (
        org_id, code, name, yield_qty, yield_uom,
        prep_loss_pct, allergens, nutrition, notes, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *
    `, [
      org_id, code, name, yield_qty, yield_uom,
      prep_loss_pct || 0,
      allergens ? JSON.stringify(allergens) : '[]',
      nutrition ? JSON.stringify(nutrition) : '{}',
      notes
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/recipes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/recipes/:id - Update recipe
router.put('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { code, name, yield_qty, yield_uom, prep_loss_pct, allergens, nutrition, notes, active } = req.body;

  try {
    const result = await global.db.query(`
      UPDATE recipes SET
        code = COALESCE($3, code),
        name = COALESCE($4, name),
        yield_qty = COALESCE($5, yield_qty),
        yield_uom = COALESCE($6, yield_uom),
        prep_loss_pct = COALESCE($7, prep_loss_pct),
        allergens = COALESCE($8, allergens),
        nutrition = COALESCE($9, nutrition),
        notes = COALESCE($10, notes),
        active = COALESCE($11, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, [
      org_id, id, code, name, yield_qty, yield_uom, prep_loss_pct,
      allergens ? JSON.stringify(allergens) : null,
      nutrition ? JSON.stringify(nutrition) : null,
      notes, active
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/recipes/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/recipes/:id - Soft delete recipe
router.delete('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const result = await global.db.query(
      'UPDATE recipes SET active = false, updated_at = CURRENT_TIMESTAMP WHERE org_id = $1 AND id = $2 RETURNING id',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    res.json({ success: true, message: 'Recipe deactivated' });
  } catch (error) {
    console.error('DELETE /api/recipes/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/recipes/:id/items - Get recipe ingredients
router.get('/:id/items', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(
      'SELECT * FROM recipe_items WHERE recipe_id = $1 ORDER BY id',
      [id]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/recipes/:id/items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/recipes/:id/items - Add ingredient to recipe
router.post('/:id/items', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { item_sku, qty, uom, notes } = req.body;

  if (!item_sku || !qty || !uom) {
    return res.status(400).json({ success: false, error: 'Missing required fields: item_sku, qty, uom' });
  }

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(`
      INSERT INTO recipe_items (recipe_id, item_sku, qty, uom, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, item_sku, qty, uom, notes]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/recipes/:id/items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/recipes/:id/items/:itemId - Update ingredient
router.put('/:id/items/:itemId', async (req, res) => {
  const { org_id } = req.user;
  const { id, itemId } = req.params;
  const { item_sku, qty, uom, notes } = req.body;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(`
      UPDATE recipe_items SET
        item_sku = COALESCE($1, item_sku),
        qty = COALESCE($2, qty),
        uom = COALESCE($3, uom),
        notes = COALESCE($4, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND recipe_id = $6
      RETURNING *
    `, [item_sku, qty, uom, notes, itemId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/recipes/:id/items/:itemId error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/recipes/:id/items/:itemId - Delete ingredient
router.delete('/:id/items/:itemId', async (req, res) => {
  const { org_id } = req.user;
  const { id, itemId } = req.params;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(
      'DELETE FROM recipe_items WHERE id = $1 AND recipe_id = $2 RETURNING id',
      [itemId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    res.json({ success: true, message: 'Ingredient deleted' });
  } catch (error) {
    console.error('DELETE /api/recipes/:id/items/:itemId error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/recipes/:id/cost - Calculate recipe cost using helper function
router.get('/:id/cost', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { date } = req.query;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const cost_date = date || new Date().toISOString().split('T')[0];

    // Call calculate_recipe_cost helper function
    const result = await global.db.query(`
      SELECT * FROM calculate_recipe_cost($1, $2)
    `, [id, cost_date]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          total_cost: 0,
          cost_per_portion: 0,
          items_costed: 0,
          items_missing_price: 0
        }
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/recipes/:id/cost error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/recipes/:id/cost/snapshot - Save cost snapshot
router.post('/:id/cost/snapshot', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { notes } = req.body;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    // Calculate current cost
    const costResult = await global.db.query(`
      SELECT * FROM calculate_recipe_cost($1, CURRENT_DATE)
    `, [id]);

    if (costResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Cannot calculate recipe cost' });
    }

    const costData = costResult.rows[0];

    // Save snapshot
    const result = await global.db.query(`
      INSERT INTO recipe_cost_snapshots (
        recipe_id, unit_cost, currency, items_costed,
        items_missing_price, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      costData.total_cost,
      'USD',
      costData.items_costed,
      costData.items_missing_price,
      notes
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/recipes/:id/cost/snapshot error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/recipes/:id/cost/history - Get cost snapshots
router.get('/:id/cost/history', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(
      'SELECT * FROM recipe_cost_snapshots WHERE recipe_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/recipes/:id/cost/history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BATCH RECIPE COSTING - P1 Hardening: New Read API
// ============================================================================

/**
 * POST /api/recipes/cost/batch
 * Calculate cost for multiple recipes at once
 * P1: New read API (batch operation)
 * 
 * Request body:
 * {
 *   "recipe_ids": [1, 2, 3],
 *   "date": "2025-12-08" (optional, defaults to today)
 * }
 */
router.post('/cost/batch', async (req, res) => {
  const { org_id } = req.user;
  const { recipe_ids, date } = req.body;

  if (!recipe_ids || !Array.isArray(recipe_ids) || recipe_ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'recipe_ids array is required and must not be empty'
    });
  }

  if (recipe_ids.length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 100 recipes per batch request'
    });
  }

  try {
    const cost_date = date || new Date().toISOString().split('T')[0];

    // Verify all recipes belong to org
    const placeholders = recipe_ids.map((_, i) => `$${i + 1}`).join(',');
    const recipeCheck = await global.db.query(
      `SELECT id FROM recipes WHERE org_id = $1 AND id IN (${placeholders})`,
      [org_id, ...recipe_ids]
    );

    const validRecipeIds = recipeCheck.rows.map(r => r.id);
    const invalidIds = recipe_ids.filter(id => !validRecipeIds.includes(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Recipes not found or not accessible: ${invalidIds.join(', ')}`,
        invalid_ids: invalidIds
      });
    }

    // Calculate cost for each recipe
    const results = await Promise.all(
      validRecipeIds.map(async (recipeId) => {
        try {
          // Call calculate_recipe_cost helper function
          const result = await global.db.query(`
            SELECT * FROM calculate_recipe_cost($1, $2)
          `, [recipeId, cost_date]);

          if (result.rows.length === 0) {
            return {
              recipe_id: recipeId,
              success: false,
              error: 'Cost calculation returned no results',
              total_cost: 0,
              cost_per_portion: 0,
              items_costed: 0,
              items_missing_price: 0
            };
          }

          return {
            recipe_id: recipeId,
            success: true,
            ...result.rows[0]
          };
        } catch (error) {
          return {
            recipe_id: recipeId,
            success: false,
            error: error.message,
            total_cost: 0,
            cost_per_portion: 0,
            items_costed: 0,
            items_missing_price: 0
          };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      date: cost_date,
      total_requested: recipe_ids.length,
      successful,
      failed,
      results,
      summary: {
        total_cost: results.reduce((sum, r) => sum + parseFloat(r.total_cost || 0), 0),
        total_items_costed: results.reduce((sum, r) => sum + parseInt(r.items_costed || 0), 0),
        total_items_missing_price: results.reduce((sum, r) => sum + parseInt(r.items_missing_price || 0), 0)
      }
    });

  } catch (error) {
    console.error('POST /api/recipes/cost/batch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
