/**
 * POS Orders Route
 * Manages order creation, line items, discounts, and void operations
 * 
 * v23.6.13: Added tenant scoping for multi-tenant isolation
 * - Uses req.tenant.org_id for tenant context
 * - All queries scoped by org_id and site_id
 * - Maintains backward compatibility with req.user.org_id
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();

// Validation schemas
const createOrderSchema = z.object({
  shift_id: z.number().int().positive(),
  customer_note: z.string().max(500).optional()
});

const addLineSchema = z.object({
  kind: z.enum(['item', 'recipe', 'misc']),
  sku_or_code: z.string().min(1).max(100),
  qty: z.number().positive(),
  unit_price_cents: z.number().int().min(0).optional(), // Server will fetch if not provided
  uom: z.string().max(20).optional()
});

const applyDiscountSchema = z.object({
  discount_id: z.number().int().positive().optional(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().positive()
});

/**
 * Helper: Get default price for item or recipe
 */
async function getDefaultPrice(kind, skuOrCode, orgId, siteId) {
  if (kind === 'item') {
    const result = await global.db.query(
      `SELECT * FROM get_sellable_items($1, $2, $3, 1, 0)
       WHERE sku = $3`,
      [orgId, siteId, skuOrCode]
    );

    return result.rows.length > 0 ? {
      price_cents: result.rows[0].current_price_cents,
      name: result.rows[0].name,
      uom: result.rows[0].uom
    } : null;

  } else if (kind === 'recipe') {
    const result = await global.db.query(
      `SELECT * FROM get_sellable_recipes($1, $2, $3, 1.30, 1, 0)
       WHERE code = $3`,
      [orgId, siteId, skuOrCode]
    );

    return result.rows.length > 0 ? {
      price_cents: result.rows[0].suggested_price_cents,
      name: result.rows[0].name,
      uom: result.rows[0].portion_uom
    } : null;
  }

  return null;
}

/**
 * Helper: Get applicable tax rates
 */
async function getApplicableTaxes(kind, orgId, siteId) {
  const result = await global.db.query(
    `SELECT id, name, rate_pct
     FROM pos_taxes
     WHERE org_id = $1
       AND site_id = $2
       AND active = true
       AND (scope = 'all' OR scope = $3)
     ORDER BY rate_pct DESC`,
    [orgId, siteId, kind]
  );

  return result.rows;
}

/**
 * Helper: Recalculate order totals
 */
async function recalculateOrder(orderId) {
  // Get all lines
  const lines = await global.db.query(
    `SELECT * FROM pos_order_lines WHERE order_id = $1 ORDER BY line_no`,
    [orderId]
  );

  let subtotalCents = 0;
  let totalTaxCents = 0;
  let totalDiscountCents = 0;

  for (const line of lines.rows) {
    subtotalCents += parseInt(line.line_subtotal_cents);
    totalTaxCents += parseInt(line.tax_cents);
    totalDiscountCents += parseInt(line.discount_cents);
  }

  const totalCents = subtotalCents + totalTaxCents - totalDiscountCents;

  // Update order
  await global.db.query(
    `UPDATE pos_orders
     SET subtotal_cents = $1,
         tax_cents = $2,
         discount_cents = $3,
         total_cents = $4
     WHERE id = $5`,
    [subtotalCents, totalTaxCents, totalDiscountCents, totalCents, orderId]
  );

  return { subtotalCents, totalTaxCents, totalDiscountCents, totalCents };
}

/**
 * POST / - Create new order
 */
router.post('/', async (req, res) => {
  try {
    const data = createOrderSchema.parse(req.body);

    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;
    const userId = req.user?.user_id || req.user?.id;

    // Verify shift is open
    const shift = await global.db.query(
      `SELECT id, register_id FROM pos_shifts
       WHERE id = $1 AND org_id = $2 AND site_id = $3 AND status = 'open'`,
      [data.shift_id, orgId, siteId]
    );

    if (shift.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found or not open',
        code: 'SHIFT_NOT_OPEN'
      });
    }

    // Get next order number
    const orderNoResult = await global.db.query(
      `SELECT next_order_no($1, $2, CURRENT_DATE) as order_no`,
      [orgId, siteId]
    );

    const orderNo = orderNoResult.rows[0].order_no;

    // Create order
    const result = await global.db.query(
      `INSERT INTO pos_orders (
         org_id, site_id, shift_id, order_no, order_date,
         customer_note, cashier_id, status
       )
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, 'open')
       RETURNING *`,
      [orgId, siteId, data.shift_id, orderNo, data.customer_note, userId]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, shift_id, order_id, details, ip_address)
       VALUES ($1, $2, 'ORDER_CREATE', $3, $4, $5, $6, $7)`,
      [
        orgId,
        siteId,
        userId,
        data.shift_id,
        result.rows[0].id,
        JSON.stringify({ order_no: orderNo }),
        req.ip
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create order error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /:orderId/line - Add line to order
 */
router.post('/:orderId/line', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const data = addLineSchema.parse(req.body);

    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;
    const userId = req.user?.user_id || req.user?.id;

    // Verify order exists and is open
    const order = await global.db.query(
      `SELECT id, shift_id FROM pos_orders
       WHERE id = $1 AND org_id = $2 AND site_id = $3 AND status = 'open'`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or not open',
        code: 'ORDER_NOT_OPEN'
      });
    }

    // Get item/recipe details if price not provided
    let unitPriceCents = data.unit_price_cents;
    let nameSnapshot = '';
    let uom = data.uom || 'EA';

    if (!unitPriceCents || !data.uom) {
      const priceInfo = await getDefaultPrice(data.kind, data.sku_or_code, orgId, siteId);

      if (!priceInfo) {
        return res.status(404).json({
          success: false,
          error: `${data.kind} not found in catalog`,
          code: 'ITEM_NOT_FOUND'
        });
      }

      unitPriceCents = unitPriceCents || priceInfo.price_cents;
      nameSnapshot = priceInfo.name;
      uom = data.uom || priceInfo.uom;
    }

    // Calculate line subtotal
    const lineSubtotalCents = Math.round(data.qty * unitPriceCents);

    // Get applicable taxes
    const taxes = await getApplicableTaxes(data.kind, orgId, siteId);
    let totalTaxRate = 0;
    taxes.forEach(tax => {
      totalTaxRate += parseFloat(tax.rate_pct);
    });

    const lineTaxCents = Math.round(lineSubtotalCents * (totalTaxRate / 100));

    // Get next line number
    const lineNoResult = await global.db.query(
      `SELECT COALESCE(MAX(line_no), 0) + 1 as line_no
       FROM pos_order_lines
       WHERE order_id = $1`,
      [orderId]
    );

    const lineNo = lineNoResult.rows[0].line_no;

    // If no name provided, try to get from item
    if (!nameSnapshot) {
      const itemResult = await global.db.query(
        `SELECT name FROM items WHERE sku = $1 AND org_id = $2 AND site_id = $3
         UNION ALL
         SELECT name FROM recipes WHERE code = $1 AND org_id = $2 AND site_id = $3
         LIMIT 1`,
        [data.sku_or_code, orgId, siteId]
      );

      nameSnapshot = itemResult.rows.length > 0 ? itemResult.rows[0].name : data.sku_or_code;
    }

    const lineTotalCents = lineSubtotalCents + lineTaxCents;

    // Insert line
    const result = await global.db.query(
      `INSERT INTO pos_order_lines (
         org_id, site_id, order_id, line_no, kind, sku_or_code,
         name_snapshot, qty, uom, unit_price_cents, line_subtotal_cents,
         tax_rate_pct, tax_cents, line_total_cents
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        orgId, siteId, orderId, lineNo, data.kind, data.sku_or_code,
        nameSnapshot, data.qty, uom, unitPriceCents, lineSubtotalCents,
        totalTaxRate, lineTaxCents, lineTotalCents
      ]
    );

    // Recalculate order totals
    const totals = await recalculateOrder(orderId);

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'ORDER_LINE_ADD', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({ kind: data.kind, sku_or_code: data.sku_or_code, qty: data.qty }),
        req.ip
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Line added successfully',
      data: {
        line: result.rows[0],
        order_totals: totals
      }
    });

  } catch (error) {
    console.error('Add line error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid line data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to add line',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * DELETE /:orderId/line/:lineId - Remove line from order
 */
router.delete('/:orderId/line/:lineId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const lineId = parseInt(req.params.lineId);

    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;
    const userId = req.user?.user_id || req.user?.id;

    // Delete line
    const result = await global.db.query(
      `DELETE FROM pos_order_lines
       WHERE id = $1 AND order_id = $2 AND org_id = $3 AND site_id = $4
       RETURNING *`,
      [lineId, orderId, orgId, siteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Line not found',
        code: 'LINE_NOT_FOUND'
      });
    }

    // Recalculate order totals
    const totals = await recalculateOrder(orderId);

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'ORDER_LINE_DELETE', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({ line_id: lineId }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Line deleted successfully',
      data: {
        order_totals: totals
      }
    });

  } catch (error) {
    console.error('Delete line error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to delete line',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /:orderId/discount - Apply discount to order
 */
router.post('/:orderId/discount', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const data = applyDiscountSchema.parse(req.body);

    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;
    const userId = req.user?.user_id || req.user?.id;

    // Get order
    const order = await global.db.query(
      `SELECT subtotal_cents FROM pos_orders
       WHERE id = $1 AND org_id = $2 AND site_id = $3 AND status = 'open'`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or not open',
        code: 'ORDER_NOT_OPEN'
      });
    }

    // Calculate discount amount
    let discountCents = 0;
    if (data.type === 'percent') {
      discountCents = Math.round(order.rows[0].subtotal_cents * (data.value / 100));
    } else {
      discountCents = Math.round(data.value * 100); // Convert to cents
    }

    // Apply discount to order
    await global.db.query(
      `UPDATE pos_orders
       SET discount_cents = discount_cents + $1
       WHERE id = $2`,
      [discountCents, orderId]
    );

    // Recalculate order totals
    const totals = await recalculateOrder(orderId);

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'ORDER_DISCOUNT', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({ type: data.type, value: data.value, discount_cents: discountCents }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Discount applied successfully',
      data: {
        discount_cents: discountCents,
        order_totals: totals
      }
    });

  } catch (error) {
    console.error('Apply discount error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to apply discount',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /:orderId/void - Void order
 */
router.post('/:orderId/void', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;
    const userId = req.user?.user_id || req.user?.id;

    // Verify order is not paid
    const order = await global.db.query(
      `SELECT status FROM pos_orders
       WHERE id = $1 AND org_id = $2 AND site_id = $3`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    if (order.rows[0].status === 'paid') {
      return res.status(409).json({
        success: false,
        error: 'Cannot void paid order - use refund instead',
        code: 'ORDER_PAID'
      });
    }

    // Void order
    await global.db.query(
      `UPDATE pos_orders SET status = 'void' WHERE id = $1`,
      [orderId]
    );

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, order_id, details, ip_address)
       VALUES ($1, $2, 'ORDER_VOID', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        userId,
        orderId,
        JSON.stringify({ previous_status: order.rows[0].status }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Order voided successfully'
    });

  } catch (error) {
    console.error('Void order error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to void order',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /:orderId - Get order details
 */
router.get('/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    // v23.6.13: Use tenant context if available, fallback to user context
    const orgId = req.tenant?.org_id || req.org?.org_id || req.user?.org_id || 1;
    const siteId = req.user?.site_id || 1;

    // Get order
    const order = await global.db.query(
      `SELECT * FROM pos_orders
       WHERE id = $1 AND org_id = $2 AND site_id = $3`,
      [orderId, orgId, siteId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Get lines
    const lines = await global.db.query(
      `SELECT * FROM pos_order_lines
       WHERE order_id = $1
       ORDER BY line_no`,
      [orderId]
    );

    // Get payments
    const payments = await global.db.query(
      `SELECT * FROM pos_payments
       WHERE order_id = $1
       ORDER BY paid_at`,
      [orderId]
    );

    res.json({
      success: true,
      data: {
        order: order.rows[0],
        lines: lines.rows,
        payments: payments.rows
      }
    });

  } catch (error) {
    console.error('Get order error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get order',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
