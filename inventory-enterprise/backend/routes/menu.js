/**
 * Menu Planning Routes - V21.1
 * 4-week menu cycle management with recipe assignments
 * Schema: menus, menu_days, menu_recipes (migration 009)
 */

const express = require('express');
const router = express.Router();

// GET /api/menu - List all menus (4-week cycles)
router.get('/', async (req, res) => {
  const { org_id } = req.user;
  const { site_id, active } = req.query;

  try {
    let query = `
      SELECT m.*,
        COUNT(DISTINCT md.id) as day_count,
        COUNT(DISTINCT mr.id) as recipe_count
      FROM menus m
      LEFT JOIN menu_days md ON m.id = md.menu_id
      LEFT JOIN menu_recipes mr ON md.id = mr.menu_day_id
      WHERE m.org_id = $1
    `;
    const params = [org_id];
    let paramCount = 1;

    if (site_id) {
      paramCount++;
      query += ` AND m.site_id = $${paramCount}`;
      params.push(site_id);
    }

    if (active !== undefined) {
      paramCount++;
      query += ` AND m.active = $${paramCount}`;
      params.push(active === 'true');
    }

    query += ' GROUP BY m.id ORDER BY m.cycle_week DESC, m.created_at DESC';

    const result = await global.db.query(query, params);

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('GET /api/menu error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/menu/:id - Get menu with all days and recipes
router.get('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    // Get menu
    const menu = await global.db.query(
      'SELECT * FROM menus WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (menu.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    // Get all days with recipes
    const days = await global.db.query(`
      SELECT
        md.*,
        json_agg(
          json_build_object(
            'id', mr.id,
            'recipe_id', mr.recipe_id,
            'meal', mr.meal,
            'portion_target', mr.portion_target,
            'recipe_name', r.name,
            'recipe_code', r.code
          ) ORDER BY mr.meal
        ) FILTER (WHERE mr.id IS NOT NULL) as recipes
      FROM menu_days md
      LEFT JOIN menu_recipes mr ON md.id = mr.menu_day_id
      LEFT JOIN recipes r ON mr.recipe_id = r.id
      WHERE md.menu_id = $1
      GROUP BY md.id
      ORDER BY md.date
    `, [id]);

    res.json({
      success: true,
      data: {
        ...menu.rows[0],
        days: days.rows
      }
    });
  } catch (error) {
    console.error('GET /api/menu/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/menu - Create new menu cycle
router.post('/', async (req, res) => {
  const { org_id } = req.user;
  const { site_id, cycle_week, name, notes } = req.body;

  if (!cycle_week) {
    return res.status(400).json({ success: false, error: 'cycle_week is required (1-52)' });
  }

  try {
    const result = await global.db.query(`
      INSERT INTO menus (org_id, site_id, cycle_week, name, notes, active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [org_id, site_id, cycle_week, name, notes]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/menu error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/menu/:id - Update menu
router.put('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { cycle_week, name, notes, active } = req.body;

  try {
    const result = await global.db.query(`
      UPDATE menus SET
        cycle_week = COALESCE($3, cycle_week),
        name = COALESCE($4, name),
        notes = COALESCE($5, notes),
        active = COALESCE($6, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, [org_id, id, cycle_week, name, notes, active]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/menu/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/menu/:id - Delete menu
router.delete('/:id', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const result = await global.db.query(
      'DELETE FROM menus WHERE org_id = $1 AND id = $2 RETURNING id',
      [org_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    res.json({ success: true, message: 'Menu deleted' });
  } catch (error) {
    console.error('DELETE /api/menu/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/menu/:id/days - Add day to menu
router.post('/:id/days', async (req, res) => {
  const { org_id } = req.user;
  const { id } = req.params;
  const { date, notes } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, error: 'date is required' });
  }

  try {
    // Verify menu belongs to org
    const menuCheck = await global.db.query(
      'SELECT id FROM menus WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (menuCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    const result = await global.db.query(`
      INSERT INTO menu_days (menu_id, date, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (menu_id, date) DO UPDATE SET
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [id, date, notes]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/menu/:id/days error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/menu/:id/days/:dayId - Get day with recipes
router.get('/:id/days/:dayId', async (req, res) => {
  const { org_id } = req.user;
  const { id, dayId } = req.params;

  try {
    // Verify menu belongs to org
    const menuCheck = await global.db.query(
      'SELECT id FROM menus WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (menuCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    // Get day with recipes
    const result = await global.db.query(`
      SELECT
        md.*,
        json_agg(
          json_build_object(
            'id', mr.id,
            'recipe_id', mr.recipe_id,
            'meal', mr.meal,
            'portion_target', mr.portion_target,
            'recipe_name', r.name,
            'recipe_code', r.code
          ) ORDER BY mr.meal
        ) FILTER (WHERE mr.id IS NOT NULL) as recipes
      FROM menu_days md
      LEFT JOIN menu_recipes mr ON md.id = mr.menu_day_id
      LEFT JOIN recipes r ON mr.recipe_id = r.id
      WHERE md.id = $1 AND md.menu_id = $2
      GROUP BY md.id
    `, [dayId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu day not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/menu/:id/days/:dayId error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/menu/:id/days/:dayId/recipes - Add recipe to day
router.post('/:id/days/:dayId/recipes', async (req, res) => {
  const { org_id } = req.user;
  const { id, dayId } = req.params;
  const { recipe_id, meal, portion_target } = req.body;

  if (!recipe_id || !meal) {
    return res.status(400).json({ success: false, error: 'recipe_id and meal are required' });
  }

  try {
    // Verify menu belongs to org
    const menuCheck = await global.db.query(
      'SELECT id FROM menus WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (menuCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    // Verify recipe belongs to org
    const recipeCheck = await global.db.query(
      'SELECT id FROM recipes WHERE org_id = $1 AND id = $2',
      [org_id, recipe_id]
    );

    if (recipeCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const result = await global.db.query(`
      INSERT INTO menu_recipes (menu_day_id, recipe_id, meal, portion_target)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [dayId, recipe_id, meal, portion_target]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/menu/:id/days/:dayId/recipes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/menu/:id/days/:dayId/recipes/:recipeId - Remove recipe from day
router.delete('/:id/days/:dayId/recipes/:recipeId', async (req, res) => {
  const { org_id } = req.user;
  const { id, dayId, recipeId } = req.params;

  try {
    // Verify menu belongs to org
    const menuCheck = await global.db.query(
      'SELECT id FROM menus WHERE org_id = $1 AND id = $2',
      [org_id, id]
    );

    if (menuCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu not found' });
    }

    const result = await global.db.query(
      'DELETE FROM menu_recipes WHERE id = $1 AND menu_day_id = $2 RETURNING id',
      [recipeId, dayId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Menu recipe assignment not found' });
    }

    res.json({ success: true, message: 'Recipe removed from day' });
  } catch (error) {
    console.error('DELETE /api/menu/:id/days/:dayId/recipes/:recipeId error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/menu/week/:weekNum - Get current active menu for a specific week
router.get('/week/:weekNum', async (req, res) => {
  const { org_id } = req.user;
  const { weekNum } = req.params;
  const { site_id } = req.query;

  try {
    let query = `
      SELECT m.*,
        json_agg(
          json_build_object(
            'id', md.id,
            'date', md.date,
            'notes', md.notes,
            'recipes', (
              SELECT json_agg(
                json_build_object(
                  'id', mr2.id,
                  'recipe_id', mr2.recipe_id,
                  'meal', mr2.meal,
                  'portion_target', mr2.portion_target,
                  'recipe_name', r2.name,
                  'recipe_code', r2.code
                )
              )
              FROM menu_recipes mr2
              JOIN recipes r2 ON mr2.recipe_id = r2.id
              WHERE mr2.menu_day_id = md.id
            )
          ) ORDER BY md.date
        ) as days
      FROM menus m
      LEFT JOIN menu_days md ON m.id = md.menu_id
      WHERE m.org_id = $1 AND m.cycle_week = $2 AND m.active = true
    `;
    const params = [org_id, weekNum];

    if (site_id) {
      query += ' AND m.site_id = $3';
      params.push(site_id);
    }

    query += ' GROUP BY m.id LIMIT 1';

    const result = await global.db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No active menu found for this week' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/menu/week/:weekNum error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
