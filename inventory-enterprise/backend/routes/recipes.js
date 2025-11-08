/**
 * Recipes Routes
 * Manages recipes, ingredients, and costing
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { computeRecipeCost } = require('../services/costing');

// GET /api/recipes - List recipes
router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query;
    const org_id = req.user?.org_id || 1;

    let query = 'SELECT * FROM recipes WHERE org_id = $1';
    const params = [org_id];
    let paramCount = 1;

    if (active !== undefined) {
      paramCount++;
      query += ` AND active = $${paramCount}`;
      params.push(active === 'true');
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);

    res.json({ success: true, recipes: result.rows });
  } catch (err) {
    console.error('Error fetching recipes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/recipes - Create recipe
router.post('/', async (req, res) => {
  try {
    const { code, name, yield_qty, yield_uom, prep_loss_pct, allergens } = req.body;
    const org_id = req.user?.org_id || 1;

    if (!code || !name || !yield_qty || !yield_uom) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await db.query(`
      INSERT INTO recipes (org_id, code, name, yield_qty, yield_uom, prep_loss_pct, allergens)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [org_id, code, name, yield_qty, yield_uom, prep_loss_pct || 0, JSON.stringify(allergens || [])]);

    res.json({ success: true, recipe: result.rows[0] });
  } catch (err) {
    console.error('Error creating recipe:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/recipes/:id - Update recipe
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, yield_qty, yield_uom, prep_loss_pct, allergens, active } = req.body;
    const org_id = req.user?.org_id || 1;

    const result = await db.query(`
      UPDATE recipes
      SET code = COALESCE($1, code),
          name = COALESCE($2, name),
          yield_qty = COALESCE($3, yield_qty),
          yield_uom = COALESCE($4, yield_uom),
          prep_loss_pct = COALESCE($5, prep_loss_pct),
          allergens = COALESCE($6, allergens),
          active = COALESCE($7, active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND org_id = $9
      RETURNING *
    `, [code, name, yield_qty, yield_uom, prep_loss_pct, allergens ? JSON.stringify(allergens) : null, active, id, org_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    res.json({ success: true, recipe: result.rows[0] });
  } catch (err) {
    console.error('Error updating recipe:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/recipes/:id - Delete recipe
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const org_id = req.user?.org_id || 1;

    const result = await db.query('DELETE FROM recipes WHERE id = $1 AND org_id = $2 RETURNING *', [id, org_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    res.json({ success: true, message: 'Recipe deleted' });
  } catch (err) {
    console.error('Error deleting recipe:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/recipes/:id/ingredients - Get recipe ingredients
router.get('/:id/ingredients', async (req, res) => {
  try {
    const { id } = req.params;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await db.query('SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY id', [id]);

    res.json({ success: true, ingredients: result.rows });
  } catch (err) {
    console.error('Error fetching ingredients:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/recipes/:id/ingredients - Add ingredient to recipe
router.post('/:id/ingredients', async (req, res) => {
  try {
    const { id } = req.params;
    const { item_sku, qty, uom, notes } = req.body;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    if (!item_sku || !qty || !uom) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await db.query(`
      INSERT INTO recipe_ingredients (recipe_id, item_sku, qty, uom, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, item_sku, qty, uom, notes]);

    res.json({ success: true, ingredient: result.rows[0] });
  } catch (err) {
    console.error('Error adding ingredient:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/recipes/:id/ingredients/:ingId - Update ingredient
router.put('/:id/ingredients/:ingId', async (req, res) => {
  try {
    const { id, ingId } = req.params;
    const { item_sku, qty, uom, notes } = req.body;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await db.query(`
      UPDATE recipe_ingredients
      SET item_sku = COALESCE($1, item_sku),
          qty = COALESCE($2, qty),
          uom = COALESCE($3, uom),
          notes = COALESCE($4, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND recipe_id = $6
      RETURNING *
    `, [item_sku, qty, uom, notes, ingId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    res.json({ success: true, ingredient: result.rows[0] });
  } catch (err) {
    console.error('Error updating ingredient:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/recipes/:id/ingredients/:ingId - Delete ingredient
router.delete('/:id/ingredients/:ingId', async (req, res) => {
  try {
    const { id, ingId } = req.params;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await db.query('DELETE FROM recipe_ingredients WHERE id = $1 AND recipe_id = $2 RETURNING *', [ingId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }

    res.json({ success: true, message: 'Ingredient deleted' });
  } catch (err) {
    console.error('Error deleting ingredient:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/recipes/:id/cost - Compute recipe cost
router.get('/:id/cost', async (req, res) => {
  try {
    const { id } = req.params;
    const { at } = req.query;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const atDate = at || new Date().toISOString().split('T')[0];
    const costInfo = await computeRecipeCost(org_id, id, atDate);

    res.json({ success: true, ...costInfo, date: atDate });
  } catch (err) {
    console.error('Error computing recipe cost:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/recipes/:id/cost/snapshot - Save cost snapshot
router.post('/:id/cost/snapshot', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const org_id = req.user?.org_id || 1;

    // Verify recipe belongs to org
    const recipeCheck = await db.query('SELECT id FROM recipes WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    // Compute current cost
    const costInfo = await computeRecipeCost(org_id, id);

    // Save snapshot
    const result = await db.query(`
      INSERT INTO recipe_cost_snapshots (recipe_id, unit_cost, currency, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, costInfo.unit_cost, costInfo.currency, notes]);

    res.json({ success: true, snapshot: result.rows[0] });
  } catch (err) {
    console.error('Error saving cost snapshot:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
