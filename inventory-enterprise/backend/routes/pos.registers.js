/**
 * POS Registers & Shifts Route
 * Manages cash registers and shift operations
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();

// Validation schemas
const createRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  device_id: z.string().min(1).max(100)
});

const openShiftSchema = z.object({
  register_id: z.number().int().positive(),
  opening_float_cents: z.number().int().min(0).default(0)
});

const closeShiftSchema = z.object({
  shift_id: z.number().int().positive(),
  closing_cash_cents: z.number().int().min(0),
  notes: z.string().max(500).optional()
});

/**
 * GET /registers - List all registers
 */
router.get('/registers', async (req, res) => {
  try {
    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    const result = await global.db.query(
      `SELECT
         r.id,
         r.name,
         r.device_id,
         r.is_active,
         r.created_at,
         (SELECT COUNT(*) FROM pos_shifts s WHERE s.register_id = r.id) as total_shifts,
         (SELECT id FROM pos_shifts s WHERE s.register_id = r.id AND s.status = 'open' LIMIT 1) as current_shift_id
       FROM pos_registers r
       WHERE r.org_id = $1 AND r.site_id = $2
       ORDER BY r.name`,
      [orgId, siteId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('List registers error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to list registers',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /registers - Create new register
 */
router.post('/registers', async (req, res) => {
  try {
    const data = createRegisterSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Check for duplicate device_id
    const existing = await global.db.query(
      `SELECT id FROM pos_registers
       WHERE org_id = $1 AND site_id = $2 AND device_id = $3`,
      [orgId, siteId, data.device_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Device ID already exists',
        code: 'DUPLICATE_DEVICE_ID'
      });
    }

    // Create register
    const result = await global.db.query(
      `INSERT INTO pos_registers (org_id, site_id, name, device_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, siteId, data.name, data.device_id]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, register_id, details, ip_address)
       VALUES ($1, $2, 'REGISTER_CREATE', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        result.rows[0].id,
        JSON.stringify({ name: data.name, device_id: data.device_id }),
        req.ip
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Register created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create register error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid register data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create register',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /shifts/open - Open new shift
 */
router.post('/shifts/open', async (req, res) => {
  try {
    const data = openShiftSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;
    const userId = req.user.user_id || req.user.id;

    // Check if register exists
    const register = await global.db.query(
      `SELECT id FROM pos_registers
       WHERE id = $1 AND org_id = $2 AND site_id = $3 AND is_active = true`,
      [data.register_id, orgId, siteId]
    );

    if (register.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Register not found or inactive',
        code: 'REGISTER_NOT_FOUND'
      });
    }

    // Check for existing open shift on this register
    const openShift = await global.db.query(
      `SELECT id FROM pos_shifts
       WHERE register_id = $1 AND status = 'open'`,
      [data.register_id]
    );

    if (openShift.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Register already has an open shift',
        code: 'SHIFT_ALREADY_OPEN',
        data: { shift_id: openShift.rows[0].id }
      });
    }

    // Create new shift
    const result = await global.db.query(
      `INSERT INTO pos_shifts (org_id, site_id, register_id, opened_by, opening_float_cents, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [orgId, siteId, data.register_id, userId, data.opening_float_cents]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, register_id, shift_id, details, ip_address)
       VALUES ($1, $2, 'OPEN_SHIFT', $3, $4, $5, $6, $7)`,
      [
        orgId,
        siteId,
        userId,
        data.register_id,
        result.rows[0].id,
        JSON.stringify({ opening_float_cents: data.opening_float_cents }),
        req.ip
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Shift opened successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Open shift error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid shift data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to open shift',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /shifts/close - Close shift
 */
router.post('/shifts/close', async (req, res) => {
  try {
    const data = closeShiftSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;
    const userId = req.user.user_id || req.user.id;

    // Get shift and verify it's open
    const shift = await global.db.query(
      `SELECT s.*, r.name as register_name
       FROM pos_shifts s
       JOIN pos_registers r ON r.id = s.register_id
       WHERE s.id = $1 AND s.org_id = $2 AND s.site_id = $3`,
      [data.shift_id, orgId, siteId]
    );

    if (shift.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found',
        code: 'SHIFT_NOT_FOUND'
      });
    }

    if (shift.rows[0].status !== 'open') {
      return res.status(409).json({
        success: false,
        error: 'Shift is already closed',
        code: 'SHIFT_ALREADY_CLOSED'
      });
    }

    // Calculate shift totals
    const totals = await global.db.query(
      `SELECT
         COUNT(DISTINCT o.id) as order_count,
         COALESCE(SUM(o.total_cents), 0) as total_sales_cents,
         COALESCE(SUM(o.tax_cents), 0) as total_tax_cents,
         COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount_cents ELSE 0 END), 0) as cash_total_cents,
         COALESCE(SUM(CASE WHEN p.method = 'external_card' THEN p.amount_cents ELSE 0 END), 0) as card_total_cents
       FROM pos_orders o
       LEFT JOIN pos_payments p ON p.order_id = o.id AND p.status = 'captured'
       WHERE o.shift_id = $1 AND o.status = 'paid'`,
      [data.shift_id]
    );

    const shiftTotals = totals.rows[0];
    const expectedCash = shift.rows[0].opening_float_cents + parseInt(shiftTotals.cash_total_cents);
    const overShort = data.closing_cash_cents - expectedCash;

    // Update shift to closed
    const closeResult = await global.db.query(
      `UPDATE pos_shifts
       SET status = 'closed',
           closed_by = $1,
           closed_at = CURRENT_TIMESTAMP,
           closing_cash_cents = $2,
           notes = $3
       WHERE id = $4
       RETURNING *`,
      [userId, data.closing_cash_cents, data.notes, data.shift_id]
    );

    // Get next Z report number
    const zNoResult = await global.db.query(
      `SELECT next_z_no($1, $2, $3) as z_no`,
      [orgId, siteId, shift.rows[0].register_id]
    );

    const zNo = zNoResult.rows[0].z_no;

    // Create Z report
    const zReport = {
      z_no: zNo,
      register_name: shift.rows[0].register_name,
      opened_at: shift.rows[0].opened_at,
      closed_at: closeResult.rows[0].closed_at,
      opened_by: shift.rows[0].opened_by,
      closed_by: userId,
      opening_float_cents: shift.rows[0].opening_float_cents,
      closing_cash_cents: data.closing_cash_cents,
      order_count: parseInt(shiftTotals.order_count),
      total_sales_cents: parseInt(shiftTotals.total_sales_cents),
      total_tax_cents: parseInt(shiftTotals.total_tax_cents),
      cash_total_cents: parseInt(shiftTotals.cash_total_cents),
      card_total_cents: parseInt(shiftTotals.card_total_cents),
      expected_cash_cents: expectedCash,
      over_short_cents: overShort,
      notes: data.notes
    };

    // Insert Z report
    await global.db.query(
      `INSERT INTO pos_z_reports (org_id, site_id, shift_id, register_id, z_no, totals)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, siteId, data.shift_id, shift.rows[0].register_id, zNo, JSON.stringify(zReport)]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, register_id, shift_id, details, ip_address)
       VALUES ($1, $2, 'CLOSE_SHIFT', $3, $4, $5, $6, $7)`,
      [
        orgId,
        siteId,
        userId,
        shift.rows[0].register_id,
        data.shift_id,
        JSON.stringify({
          z_no: zNo,
          closing_cash_cents: data.closing_cash_cents,
          over_short_cents: overShort
        }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Shift closed successfully',
      data: {
        shift: closeResult.rows[0],
        z_report: zReport
      }
    });

  } catch (error) {
    console.error('Close shift error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid close shift data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to close shift',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /shifts/current - Get current shift for a register
 */
router.get('/shifts/current', async (req, res) => {
  try {
    const registerIdSchema = z.object({
      register_id: z.coerce.number().int().positive()
    });

    const params = registerIdSchema.parse(req.query);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get open shift
    const shift = await global.db.query(
      `SELECT s.*, r.name as register_name
       FROM pos_shifts s
       JOIN pos_registers r ON r.id = s.register_id
       WHERE s.register_id = $1
         AND s.org_id = $2
         AND s.site_id = $3
         AND s.status = 'open'
       LIMIT 1`,
      [params.register_id, orgId, siteId]
    );

    if (shift.rows.length === 0) {
      return res.json({
        success: false,
        message: 'No open shift for this register',
        data: null
      });
    }

    // Get running totals
    const totals = await global.db.query(
      `SELECT
         COUNT(DISTINCT o.id) as order_count,
         COALESCE(SUM(o.total_cents), 0) as total_sales_cents,
         COALESCE(SUM(o.tax_cents), 0) as total_tax_cents,
         COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount_cents ELSE 0 END), 0) as cash_total_cents,
         COALESCE(SUM(CASE WHEN p.method = 'external_card' THEN p.amount_cents ELSE 0 END), 0) as card_total_cents
       FROM pos_orders o
       LEFT JOIN pos_payments p ON p.order_id = o.id AND p.status = 'captured'
       WHERE o.shift_id = $1 AND o.status = 'paid'`,
      [shift.rows[0].id]
    );

    res.json({
      success: true,
      data: {
        ...shift.rows[0],
        running_totals: totals.rows[0]
      }
    });

  } catch (error) {
    console.error('Get current shift error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get current shift',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
