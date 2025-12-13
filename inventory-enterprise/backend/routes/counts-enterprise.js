/**
 * Enterprise Count Sheets Routes
 * 
 * Enhanced count sheet management with balance table integration
 * Works alongside existing counts-api.js
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { validateOrgAccess } = require('../src/utils/query-scope');
const { validateBody, validateParams } = require('../src/middleware/validation');
const { createCountSheetSchema, addCountLineSchema, countSheetParamsSchema } = require('../src/schemas/counts');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/counts-enterprise
 * Create count sheet (enhanced version)
 */
router.post('/', validateBody(createCountSheetSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const user = req.user;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  if (!user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  // Check permissions (Counter, Editor, Approver, Admin)
  if (!['counter', 'COUNTER', 'editor', 'EDITOR', 'approver', 'APPROVER', 'admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role)) {
    return res.status(403).json({ error: 'Counter access required' });
  }

  const { scheduledFor, notes } = req.body;

  try {
    // Generate count number: COUNT-YYYY-MM-DD-001
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Get count of today's count sheets
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const countResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM inventory_counts 
       WHERE org_id = $1 
       AND created_at >= $2 
       AND created_at <= $3`,
      [orgId, todayStart, todayEnd]
    );

    const todayCount = parseInt(countResult.rows[0].count);
    const countNumber = `COUNT-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;

    // Create count sheet
    const result = await pool.query(
      `INSERT INTO inventory_counts (
        id, org_id, count_name, count_date, status, counted_by, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, count_name, count_date, status, counted_by, notes, created_at`,
      [
        uuidv4(),
        orgId,
        countNumber,
        scheduledFor ? new Date(scheduledFor) : new Date(),
        'draft',
        user.id || user.email,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      countSheet: {
        id: result.rows[0].id,
        orgId,
        countNumber: result.rows[0].count_name,
        status: result.rows[0].status,
        countDate: result.rows[0].count_date,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Error creating count sheet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/counts-enterprise/:id
 * Get count sheet with lines (enhanced version)
 */
router.get('/:id', validateParams(countSheetParamsSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id } = req.params;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  try {
    // Get count sheet
    const countResult = await pool.query(
      `SELECT 
        c.id,
        c.org_id,
        c.count_name,
        c.count_date,
        c.status,
        c.counted_by,
        c.notes,
        c.created_at,
        c.closed_at
      FROM inventory_counts c
      WHERE c.id = $1 AND c.org_id = $2`,
      [id, orgId]
    );

    if (countResult.rows.length === 0) {
      return res.status(404).json({ error: 'Count sheet not found' });
    }

    const countSheet = countResult.rows[0];
    validateOrgAccess(orgId, countSheet, 'CountSheet');

    // Get count lines
    const linesResult = await pool.query(
      `SELECT 
        i.id,
        i.count_id,
        i.item_code,
        i.location_code,
        i.expected_qty,
        i.counted_qty,
        i.variance,
        i.notes
      FROM inventory_count_rows i
      WHERE i.count_id = $1
      ORDER BY i.id ASC`,
      [id]
    );

    res.json({
      success: true,
      countSheet: {
        ...countSheet,
        lines: linesResult.rows,
      },
    });
  } catch (error) {
    if (error.message.includes('does not belong to organization')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Error fetching count sheet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/counts-enterprise/:id/lines
 * Add count line to count sheet
 */
router.post('/:id/lines', validateParams(countSheetParamsSchema), validateBody(addCountLineSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id: countSheetId } = req.params;
  const user = req.user;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  if (!user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const { itemId, locationId, lotId, countedQty, countedUom, notes } = req.body;

  try {
    // Verify count sheet exists and belongs to org
    const countResult = await pool.query(
      'SELECT id, org_id, status FROM inventory_counts WHERE id = $1',
      [countSheetId]
    );

    if (countResult.rows.length === 0) {
      return res.status(404).json({ error: 'Count sheet not found' });
    }

    const countSheet = countResult.rows[0];
    validateOrgAccess(orgId, countSheet, 'CountSheet');

    if (countSheet.status === 'approved' || countSheet.status === 'posted') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot add lines to approved or posted count sheet',
      });
    }

    // Get expected quantity from balance table
    let expectedQty = 0;
    try {
      const balanceResult = await pool.query(
        `SELECT qty_canonical 
         FROM inventory_balances 
         WHERE org_id = $1 AND item_id = $2 AND location_id = $3 
         AND (lot_id = $4 OR (lot_id IS NULL AND $4 IS NULL))`,
        [orgId, itemId, locationId, lotId || null]
      );

      if (balanceResult.rows.length > 0) {
        expectedQty = parseFloat(balanceResult.rows[0].qty_canonical);
      }
    } catch (error) {
      console.warn('Could not fetch expected quantity from balance table:', error.message);
      // Continue with expectedQty = 0
    }

    const varianceQty = countedQty - expectedQty;

    // Insert count line
    const lineResult = await pool.query(
      `INSERT INTO inventory_count_rows (
        count_id, item_code, location_code, expected_qty, counted_qty, variance, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, count_id, item_code, location_code, expected_qty, counted_qty, variance, notes`,
      [
        countSheetId,
        itemId,
        locationId,
        expectedQty,
        countedQty,
        varianceQty,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      line: lineResult.rows[0],
    });
  } catch (error) {
    console.error('Error adding count line:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/counts-enterprise/:id/post
 * Post count sheet to ledger (Editor+)
 */
router.post('/:id/post', validateParams(countSheetParamsSchema), async (req, res) => {
  const orgId = req.orgId || req.org?.id || req.user?.org_id;
  const { id: countSheetId } = req.params;
  const user = req.user;

  if (!orgId) {
    return res.status(401).json({ error: 'Organization not resolved' });
  }

  if (!user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  // Check editor or admin role
  if (!['editor', 'EDITOR', 'admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role)) {
    return res.status(403).json({ error: 'Editor access required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify count sheet exists and belongs to org
    const countResult = await client.query(
      'SELECT id, org_id, status FROM inventory_counts WHERE id = $1',
      [countSheetId]
    );

    if (countResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Count sheet not found' });
    }

    const countSheet = countResult.rows[0];
    validateOrgAccess(orgId, countSheet, 'CountSheet');

    if (countSheet.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Count sheet must be approved before posting',
      });
    }

    // Get all count lines
    const linesResult = await client.query(
      'SELECT * FROM inventory_count_rows WHERE count_id = $1',
      [countSheetId]
    );

    // Post each line to ledger
    const correlationId = uuidv4();
    const postedLines = [];

    for (const line of linesResult.rows) {
      const varianceQty = parseFloat(line.variance);

      if (varianceQty !== 0) {
        // Create ledger entry for variance
        // Note: This assumes inventory_ledger table exists with appropriate structure
        const ledgerResult = await client.query(
          `INSERT INTO inventory_ledger (
            id, org_id, item_id, location_id, lot_id,
            move_type, qty_canonical, correlation_id, created_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id`,
          [
            uuidv4(),
            orgId,
            line.item_code,
            line.location_code,
            null, // lot_id - would need to be resolved
            'COUNT_POSTED',
            varianceQty,
            correlationId,
            user.id || user.email,
          ]
        );

        postedLines.push({
          lineId: line.id,
          ledgerId: ledgerResult.rows[0].id,
          variance: varianceQty,
        });
      }
    }

    // Update count sheet status
    await client.query(
      'UPDATE inventory_counts SET status = $1, closed_at = NOW() WHERE id = $2',
      ['posted', countSheetId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Posted ${postedLines.length} lines to ledger`,
      correlationId,
      postedLines,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error posting count sheet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;

