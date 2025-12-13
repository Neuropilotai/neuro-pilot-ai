/**
 * Enterprise Items Routes
 * 
 * Enhanced item management endpoints with tenant isolation
 * Integrates with existing inventory.js routes
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { validateOrgAccess } = require('../src/utils/query-scope');
const { validateBody, validateQuery, validateParams } = require('../src/middleware/validation');
const { createItemSchema, updateItemSchema, itemQuerySchema, itemParamsSchema } = require('../src/schemas/items');

/**
 * GET /api/items-enterprise
 * List items with filtering (enterprise version)
 */
router.get('/', validateQuery(itemQuerySchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  
  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  const { category, isActive, search } = req.query;

  try {
    let query = `
      SELECT 
        i.item_id,
        i.item_code,
        i.item_name,
        i.item_name_fr,
        i.category,
        i.unit,
        i.par_level,
        i.reorder_point,
        i.current_quantity,
        i.is_active,
        i.created_at,
        i.updated_at
      FROM inventory_items i
      WHERE i.org_id = $1
    `;
    const params = [orgId];

    let paramIndex = 2;

    if (category) {
      query += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (isActive !== undefined) {
      query += ` AND i.is_active = $${paramIndex}`;
      params.push(isActive === 'true' ? 1 : 0);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        i.item_name ILIKE $${paramIndex} OR
        i.item_code ILIKE $${paramIndex} OR
        i.item_name_fr ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY i.item_code ASC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      items: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error listing items:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/items-enterprise/:id
 * Get single item
 */
router.get('/:id', validateParams(itemParamsSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id } = req.params;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  try {
    const result = await pool.query(
      `SELECT 
        i.item_id,
        i.item_code,
        i.item_name,
        i.item_name_fr,
        i.category,
        i.unit,
        i.par_level,
        i.reorder_point,
        i.current_quantity,
        i.is_active,
        i.created_at,
        i.updated_at
      FROM inventory_items i
      WHERE i.item_id = $1 AND i.org_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = result.rows[0];
    validateOrgAccess(orgId, item, 'Item');

    res.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('Error getting item:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/items-enterprise
 * Create item (Admin only)
 */
router.post('/', validateBody(createItemSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  
  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  // Check admin role
  if (!req.user || !['admin', 'ADMIN', 'owner', 'OWNER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { itemNumber, name, nameEn, nameFr, category, canonicalUom, isPerishable, requiresLot, parLevel } = req.body;

  try {
    // Check if item number already exists for this org
    const existing = await pool.query(
      'SELECT item_id FROM inventory_items WHERE item_code = $1 AND org_id = $2',
      [itemNumber, orgId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Item number ${itemNumber} already exists`,
      });
    }

    const result = await pool.query(
      `INSERT INTO inventory_items (
        item_code, item_name, item_name_fr, category, unit,
        par_level, org_id, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())
      RETURNING item_id, item_code, item_name, item_name_fr, category, unit, par_level, org_id, is_active`,
      [
        itemNumber,
        name,
        nameFr || null,
        category || null,
        canonicalUom || 'EA',
        parLevel || 0,
        orgId,
      ]
    );

    res.status(201).json({
      success: true,
      item: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/items-enterprise/:id
 * Update item (Admin/Editor only)
 */
router.patch('/:id', validateParams(itemParamsSchema), validateBody(updateItemSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id } = req.params;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  // Check editor or admin role
  if (!req.user || !['admin', 'ADMIN', 'editor', 'EDITOR', 'owner', 'OWNER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Editor access required' });
  }

  try {
    // Verify item exists and belongs to org
    const existing = await pool.query(
      'SELECT item_id, org_id FROM inventory_items WHERE item_id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    validateOrgAccess(orgId, existing.rows[0], 'Item');

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    const { name, nameEn, nameFr, category, canonicalUom, isPerishable, requiresLot, parLevel, isActive } = req.body;

    if (name !== undefined) {
      updates.push(`item_name = $${paramIndex++}`);
      params.push(name);
    }
    if (nameFr !== undefined) {
      updates.push(`item_name_fr = $${paramIndex++}`);
      params.push(nameFr);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (canonicalUom !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      params.push(canonicalUom);
    }
    if (parLevel !== undefined) {
      updates.push(`par_level = $${paramIndex++}`);
      params.push(parLevel);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id, orgId);

    const result = await pool.query(
      `UPDATE inventory_items 
       SET ${updates.join(', ')}
       WHERE item_id = $${paramIndex} AND org_id = $${paramIndex + 1}
       RETURNING item_id, item_code, item_name, item_name_fr, category, unit, par_level, org_id, is_active`,
      params
    );

    res.json({
      success: true,
      item: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

module.exports = router;

