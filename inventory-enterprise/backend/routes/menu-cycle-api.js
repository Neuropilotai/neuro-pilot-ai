/**
 * Menu Cycle API - v23.0
 * 4-week rotating menu cycle management
 * Tables: menu_cycle_days, menu_cycle_items, menu_stations
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Helper to get org_id from request
function getOrgId(req) {
  return req.user?.org_id || 'default-org';
}

// ============================================
// GET /api/menu-cycle - List all weeks summary
// ============================================
router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT
        mcd.cycle_week,
        mcd.meal_period,
        COUNT(DISTINCT mcd.day_of_week) as days_count,
        COUNT(mci.id) as items_count,
        MIN(mci.created_at) as first_import,
        MAX(mci.updated_at) as last_updated
      FROM menu_cycle_days mcd
      LEFT JOIN menu_cycle_items mci ON mcd.id = mci.cycle_day_id
      WHERE mcd.org_id = $1
      GROUP BY mcd.cycle_week, mcd.meal_period
      ORDER BY mcd.cycle_week, mcd.meal_period
    `, [orgId]);

    res.json({
      success: true,
      weeks: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('[MenuCycle] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch menu cycles', code: 'LIST_ERROR' });
  }
});

// ============================================
// GET /api/menu-cycle/week/:weekNum - Get full week
// ============================================
router.get('/week/:weekNum', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const weekNum = parseInt(req.params.weekNum);
    const mealPeriod = req.query.meal || 'dinner';

    if (weekNum < 1 || weekNum > 4) {
      return res.status(400).json({ success: false, error: 'Week must be 1-4' });
    }

    // Get all items for this week grouped by day and station
    const result = await pool.query(`
      SELECT
        mcd.day_of_week,
        mcd.day_name,
        ms.code as station_code,
        ms.name as station_name,
        ms.cuisine_type,
        ms.display_order as station_order,
        mci.id as item_id,
        mci.item_name,
        mci.is_vegetarian,
        mci.is_vegan,
        mci.allergens,
        mci.display_order as item_order,
        mci.recipe_id,
        mci.inventory_item_code
      FROM menu_cycle_days mcd
      LEFT JOIN menu_cycle_items mci ON mcd.id = mci.cycle_day_id
      LEFT JOIN menu_stations ms ON mci.station_id = ms.id
      WHERE mcd.org_id = $1
        AND mcd.cycle_week = $2
        AND mcd.meal_period = $3
      ORDER BY mcd.day_of_week, ms.display_order, mci.display_order
    `, [orgId, weekNum, mealPeriod]);

    // Group by day
    const days = {};
    const dayNames = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'];

    dayNames.forEach((name, idx) => {
      days[idx] = {
        day_of_week: idx,
        day_name: name,
        stations: {}
      };
    });

    result.rows.forEach(row => {
      const day = days[row.day_of_week];
      if (!day) return;

      if (row.station_code && !day.stations[row.station_code]) {
        day.stations[row.station_code] = {
          code: row.station_code,
          name: row.station_name,
          cuisine_type: row.cuisine_type,
          order: row.station_order,
          items: []
        };
      }

      if (row.item_id && row.station_code) {
        day.stations[row.station_code].items.push({
          id: row.item_id,
          name: row.item_name,
          is_vegetarian: row.is_vegetarian,
          is_vegan: row.is_vegan,
          allergens: row.allergens,
          recipe_id: row.recipe_id,
          inventory_item_code: row.inventory_item_code
        });
      }
    });

    // Convert stations object to sorted array
    Object.values(days).forEach(day => {
      day.stations = Object.values(day.stations).sort((a, b) => a.order - b.order);
    });

    res.json({
      success: true,
      week: weekNum,
      meal_period: mealPeriod,
      days: Object.values(days)
    });
  } catch (error) {
    console.error('[MenuCycle] Week error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch week', code: 'WEEK_ERROR' });
  }
});

// ============================================
// GET /api/menu-cycle/day/:weekNum/:dayNum - Get single day
// ============================================
router.get('/day/:weekNum/:dayNum', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const weekNum = parseInt(req.params.weekNum);
    const dayNum = parseInt(req.params.dayNum);
    const mealPeriod = req.query.meal || 'dinner';

    const result = await pool.query(`
      SELECT
        mcd.id as cycle_day_id,
        mcd.day_of_week,
        mcd.day_name,
        mcd.meal_period,
        ms.id as station_id,
        ms.code as station_code,
        ms.name as station_name,
        ms.cuisine_type,
        ms.display_order as station_order,
        mci.id as item_id,
        mci.item_name,
        mci.is_vegetarian,
        mci.is_vegan,
        mci.allergens,
        mci.portion_target,
        mci.recipe_id,
        mci.display_order
      FROM menu_cycle_days mcd
      LEFT JOIN menu_cycle_items mci ON mcd.id = mci.cycle_day_id
      LEFT JOIN menu_stations ms ON mci.station_id = ms.id
      WHERE mcd.org_id = $1
        AND mcd.cycle_week = $2
        AND mcd.day_of_week = $3
        AND mcd.meal_period = $4
      ORDER BY ms.display_order, mci.display_order
    `, [orgId, weekNum, dayNum, mealPeriod]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Day not found' });
    }

    // Group by station
    const stations = {};
    const firstRow = result.rows[0];

    result.rows.forEach(row => {
      if (row.station_code && !stations[row.station_code]) {
        stations[row.station_code] = {
          id: row.station_id,
          code: row.station_code,
          name: row.station_name,
          cuisine_type: row.cuisine_type,
          items: []
        };
      }

      if (row.item_id && row.station_code) {
        stations[row.station_code].items.push({
          id: row.item_id,
          name: row.item_name,
          is_vegetarian: row.is_vegetarian,
          is_vegan: row.is_vegan,
          allergens: row.allergens,
          portion_target: row.portion_target,
          recipe_id: row.recipe_id
        });
      }
    });

    res.json({
      success: true,
      day: {
        cycle_day_id: firstRow.cycle_day_id,
        week: weekNum,
        day_of_week: firstRow.day_of_week,
        day_name: firstRow.day_name,
        meal_period: firstRow.meal_period,
        stations: Object.values(stations)
      }
    });
  } catch (error) {
    console.error('[MenuCycle] Day error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch day', code: 'DAY_ERROR' });
  }
});

// ============================================
// GET /api/menu-cycle/stations - List all stations
// ============================================
router.get('/stations', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT id, code, name, cuisine_type, display_order, is_active
      FROM menu_stations
      WHERE org_id = $1
      ORDER BY display_order
    `, [orgId]);

    res.json({
      success: true,
      stations: result.rows
    });
  } catch (error) {
    console.error('[MenuCycle] Stations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stations', code: 'STATIONS_ERROR' });
  }
});

// ============================================
// POST /api/menu-cycle/item - Add menu item
// ============================================
router.post('/item', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { cycle_day_id, station_id, item_name, is_vegetarian, is_vegan, allergens, recipe_id } = req.body;

    if (!cycle_day_id || !item_name) {
      return res.status(400).json({ success: false, error: 'cycle_day_id and item_name required' });
    }

    const normalized = item_name.trim().toLowerCase().replace(/\s+/g, ' ');

    const result = await pool.query(`
      INSERT INTO menu_cycle_items
        (org_id, cycle_day_id, station_id, item_name, item_name_normalized, is_vegetarian, is_vegan, allergens, recipe_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [orgId, cycle_day_id, station_id, item_name.trim(), normalized, is_vegetarian || false, is_vegan || false, allergens || null, recipe_id || null]);

    res.status(201).json({
      success: true,
      item: result.rows[0]
    });
  } catch (error) {
    console.error('[MenuCycle] Add item error:', error);
    res.status(500).json({ success: false, error: 'Failed to add item', code: 'ADD_ITEM_ERROR' });
  }
});

// ============================================
// PUT /api/menu-cycle/item/:id - Update menu item
// ============================================
router.put('/item/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const itemId = parseInt(req.params.id);
    const { item_name, station_id, is_vegetarian, is_vegan, allergens, recipe_id, portion_target } = req.body;

    const updates = [];
    const values = [orgId, itemId];
    let paramIdx = 3;

    if (item_name !== undefined) {
      updates.push(`item_name = $${paramIdx}, item_name_normalized = $${paramIdx + 1}`);
      values.push(item_name.trim(), item_name.trim().toLowerCase().replace(/\s+/g, ' '));
      paramIdx += 2;
    }
    if (station_id !== undefined) {
      updates.push(`station_id = $${paramIdx++}`);
      values.push(station_id);
    }
    if (is_vegetarian !== undefined) {
      updates.push(`is_vegetarian = $${paramIdx++}`);
      values.push(is_vegetarian);
    }
    if (is_vegan !== undefined) {
      updates.push(`is_vegan = $${paramIdx++}`);
      values.push(is_vegan);
    }
    if (allergens !== undefined) {
      updates.push(`allergens = $${paramIdx++}`);
      values.push(allergens);
    }
    if (recipe_id !== undefined) {
      updates.push(`recipe_id = $${paramIdx++}`);
      values.push(recipe_id);
    }
    if (portion_target !== undefined) {
      updates.push(`portion_target = $${paramIdx++}`);
      values.push(portion_target);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(`
      UPDATE menu_cycle_items
      SET ${updates.join(', ')}
      WHERE org_id = $1 AND id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    res.json({
      success: true,
      item: result.rows[0]
    });
  } catch (error) {
    console.error('[MenuCycle] Update item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update item', code: 'UPDATE_ITEM_ERROR' });
  }
});

// ============================================
// DELETE /api/menu-cycle/item/:id - Delete menu item
// ============================================
router.delete('/item/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const itemId = parseInt(req.params.id);

    const result = await pool.query(
      'DELETE FROM menu_cycle_items WHERE org_id = $1 AND id = $2 RETURNING id',
      [orgId, itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    res.json({
      success: true,
      message: 'Item deleted',
      id: itemId
    });
  } catch (error) {
    console.error('[MenuCycle] Delete item error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete item', code: 'DELETE_ITEM_ERROR' });
  }
});

// ============================================
// GET /api/menu-cycle/imports - List import logs
// ============================================
router.get('/imports', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT id, batch_id, file_name, items_imported, items_skipped, status, imported_at, completed_at
      FROM menu_import_log
      WHERE org_id = $1
      ORDER BY imported_at DESC
      LIMIT 20
    `, [orgId]);

    res.json({
      success: true,
      imports: result.rows
    });
  } catch (error) {
    console.error('[MenuCycle] Imports error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch imports', code: 'IMPORTS_ERROR' });
  }
});

// ============================================
// GET /api/menu-cycle/search - Search menu items
// ============================================
router.get('/search', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const query = req.query.q || '';
    const weekNum = req.query.week ? parseInt(req.query.week) : null;

    if (query.length < 2) {
      return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
    }

    const normalized = query.toLowerCase().replace(/\s+/g, ' ');
    let sql = `
      SELECT
        mci.id,
        mci.item_name,
        mcd.cycle_week,
        mcd.day_of_week,
        mcd.day_name,
        ms.name as station_name,
        ms.cuisine_type
      FROM menu_cycle_items mci
      JOIN menu_cycle_days mcd ON mci.cycle_day_id = mcd.id
      LEFT JOIN menu_stations ms ON mci.station_id = ms.id
      WHERE mci.org_id = $1
        AND mci.item_name_normalized LIKE $2
    `;
    const params = [orgId, `%${normalized}%`];

    if (weekNum) {
      sql += ' AND mcd.cycle_week = $3';
      params.push(weekNum);
    }

    sql += ' ORDER BY mcd.cycle_week, mcd.day_of_week LIMIT 50';

    const result = await pool.query(sql, params);

    res.json({
      success: true,
      results: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('[MenuCycle] Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed', code: 'SEARCH_ERROR' });
  }
});

module.exports = router;
