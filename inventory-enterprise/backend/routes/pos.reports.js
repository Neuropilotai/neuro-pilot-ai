/**
 * POS Reports Route
 * X/Z reports, sales analytics, and exports
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();

// Validation schemas
const xReportSchema = z.object({
  shift_id: z.coerce.number().int().positive()
});

const salesQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  register_id: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

/**
 * GET /x - Get X report (current shift running totals)
 */
router.get('/x', async (req, res) => {
  try {
    const params = xReportSchema.parse(req.query);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get shift details
    const shift = await global.db.query(
      `SELECT s.*, r.name as register_name
       FROM pos_shifts s
       JOIN pos_registers r ON r.id = s.register_id
       WHERE s.id = $1 AND s.org_id = $2 AND s.site_id = $3`,
      [params.shift_id, orgId, siteId]
    );

    if (shift.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found',
        code: 'SHIFT_NOT_FOUND'
      });
    }

    const shiftData = shift.rows[0];

    // Get order totals
    const totals = await global.db.query(
      `SELECT
         COUNT(DISTINCT o.id) as order_count,
         COUNT(DISTINCT CASE WHEN o.status = 'void' THEN o.id END) as void_count,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.subtotal_cents ELSE 0 END), 0) as gross_sales_cents,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.discount_cents ELSE 0 END), 0) as discount_cents,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.tax_cents ELSE 0 END), 0) as tax_cents,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_cents ELSE 0 END), 0) as net_sales_cents
       FROM pos_orders o
       WHERE o.shift_id = $1`,
      [params.shift_id]
    );

    // Get payment method breakdown
    const payments = await global.db.query(
      `SELECT
         p.method,
         COUNT(*) as payment_count,
         SUM(p.amount_cents) as total_cents
       FROM pos_payments p
       JOIN pos_orders o ON o.id = p.order_id
       WHERE o.shift_id = $1
         AND p.status = 'captured'
       GROUP BY p.method`,
      [params.shift_id]
    );

    // Get tax breakdown
    const taxBreakdown = await global.db.query(
      `SELECT
         ol.tax_rate_pct,
         SUM(ol.line_subtotal_cents) as taxable_amount_cents,
         SUM(ol.tax_cents) as tax_collected_cents
       FROM pos_order_lines ol
       JOIN pos_orders o ON o.id = ol.order_id
       WHERE o.shift_id = $1
         AND o.status = 'paid'
         AND ol.tax_rate_pct > 0
       GROUP BY ol.tax_rate_pct
       ORDER BY ol.tax_rate_pct`,
      [params.shift_id]
    );

    // Get top selling items
    const topSelling = await global.db.query(
      `SELECT
         ol.kind,
         ol.sku_or_code,
         ol.name_snapshot,
         SUM(ol.qty) as total_qty,
         COUNT(DISTINCT o.id) as order_count,
         SUM(ol.line_total_cents) as revenue_cents
       FROM pos_order_lines ol
       JOIN pos_orders o ON o.id = ol.order_id
       WHERE o.shift_id = $1
         AND o.status = 'paid'
       GROUP BY ol.kind, ol.sku_or_code, ol.name_snapshot
       ORDER BY revenue_cents DESC
       LIMIT 10`,
      [params.shift_id]
    );

    const totalsData = totals.rows[0];
    const paymentsByMethod = {};
    payments.rows.forEach(p => {
      paymentsByMethod[p.method] = {
        count: parseInt(p.payment_count),
        total_cents: parseInt(p.total_cents)
      };
    });

    const xReport = {
      shift: {
        id: shiftData.id,
        register_name: shiftData.register_name,
        opened_at: shiftData.opened_at,
        opened_by: shiftData.opened_by,
        opening_float_cents: shiftData.opening_float_cents,
        status: shiftData.status
      },
      summary: {
        order_count: parseInt(totalsData.order_count),
        void_count: parseInt(totalsData.void_count),
        gross_sales_cents: parseInt(totalsData.gross_sales_cents),
        discount_cents: parseInt(totalsData.discount_cents),
        tax_cents: parseInt(totalsData.tax_cents),
        net_sales_cents: parseInt(totalsData.net_sales_cents)
      },
      payments: {
        cash: paymentsByMethod.cash || { count: 0, total_cents: 0 },
        external_card: paymentsByMethod.external_card || { count: 0, total_cents: 0 }
      },
      tax_breakdown: taxBreakdown.rows.map(t => ({
        rate_pct: parseFloat(t.tax_rate_pct),
        taxable_amount_cents: parseInt(t.taxable_amount_cents),
        tax_collected_cents: parseInt(t.tax_collected_cents)
      })),
      top_selling: topSelling.rows.map(t => ({
        kind: t.kind,
        sku_or_code: t.sku_or_code,
        name: t.name_snapshot,
        qty: parseFloat(t.total_qty),
        order_count: parseInt(t.order_count),
        revenue_cents: parseInt(t.revenue_cents)
      })),
      generated_at: new Date().toISOString()
    };

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, shift_id, details, ip_address)
       VALUES ($1, $2, 'X_REPORT', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        params.shift_id,
        JSON.stringify({ net_sales_cents: xReport.summary.net_sales_cents }),
        req.ip
      ]
    );

    res.json({
      success: true,
      data: xReport
    });

  } catch (error) {
    console.error('X report error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate X report',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /z/:shiftId - Get Z report for closed shift
 */
router.get('/z/:shiftId', async (req, res) => {
  try {
    const shiftId = parseInt(req.params.shiftId);
    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get Z report
    const zReport = await global.db.query(
      `SELECT * FROM pos_z_reports
       WHERE shift_id = $1 AND org_id = $2 AND site_id = $3`,
      [shiftId, orgId, siteId]
    );

    if (zReport.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Z report not found - shift may not be closed',
        code: 'Z_REPORT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        ...zReport.rows[0],
        totals: zReport.rows[0].totals
      }
    });

  } catch (error) {
    console.error('Z report error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get Z report',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /sales - Get sales data with filters
 */
router.get('/sales', async (req, res) => {
  try {
    const params = salesQuerySchema.parse(req.query);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    let query = `
      SELECT
        o.order_date,
        COUNT(DISTINCT o.id) as order_count,
        SUM(o.subtotal_cents) as gross_sales_cents,
        SUM(o.discount_cents) as discount_cents,
        SUM(o.tax_cents) as tax_cents,
        SUM(o.total_cents) as net_sales_cents,
        COUNT(DISTINCT CASE WHEN o.status = 'void' THEN o.id END) as void_count
      FROM pos_orders o
      WHERE o.org_id = $1
        AND o.site_id = $2
        AND o.order_date >= $3
        AND o.order_date <= $4
        AND o.status IN ('paid', 'void', 'refunded')
    `;

    const queryParams = [orgId, siteId, params.from_date, params.to_date];

    if (params.register_id) {
      query += ` AND o.shift_id IN (SELECT id FROM pos_shifts WHERE register_id = $${queryParams.length + 1})`;
      queryParams.push(params.register_id);
    }

    query += ` GROUP BY o.order_date ORDER BY o.order_date DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(params.limit, params.offset);

    const result = await global.db.query(query, queryParams);

    // Get item-level breakdown if requested
    const itemBreakdown = await global.db.query(
      `SELECT
         ol.kind,
         ol.sku_or_code,
         ol.name_snapshot,
         SUM(ol.qty) as total_qty,
         COUNT(DISTINCT o.id) as order_count,
         SUM(ol.line_total_cents) as revenue_cents
       FROM pos_order_lines ol
       JOIN pos_orders o ON o.id = ol.order_id
       WHERE o.org_id = $1
         AND o.site_id = $2
         AND o.order_date >= $3
         AND o.order_date <= $4
         AND o.status = 'paid'
       GROUP BY ol.kind, ol.sku_or_code, ol.name_snapshot
       ORDER BY revenue_cents DESC
       LIMIT 20`,
      [orgId, siteId, params.from_date, params.to_date]
    );

    res.json({
      success: true,
      data: {
        daily_summary: result.rows.map(row => ({
          date: row.order_date,
          order_count: parseInt(row.order_count),
          void_count: parseInt(row.void_count),
          gross_sales_cents: parseInt(row.gross_sales_cents),
          discount_cents: parseInt(row.discount_cents),
          tax_cents: parseInt(row.tax_cents),
          net_sales_cents: parseInt(row.net_sales_cents)
        })),
        top_items: itemBreakdown.rows.map(row => ({
          kind: row.kind,
          sku_or_code: row.sku_or_code,
          name: row.name_snapshot,
          total_qty: parseFloat(row.total_qty),
          order_count: parseInt(row.order_count),
          revenue_cents: parseInt(row.revenue_cents)
        })),
        pagination: {
          limit: params.limit,
          offset: params.offset,
          has_more: result.rows.length === params.limit
        }
      }
    });

  } catch (error) {
    console.error('Sales report error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate sales report',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * GET /sales/export - Export sales data as CSV
 */
router.get('/sales/export', async (req, res) => {
  try {
    const params = salesQuerySchema.parse(req.query);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    const result = await global.db.query(
      `SELECT
         o.order_date,
         o.order_no,
         o.status,
         ol.kind,
         ol.sku_or_code,
         ol.name_snapshot,
         ol.qty,
         ol.uom,
         ol.unit_price_cents / 100.0 as unit_price,
         ol.line_subtotal_cents / 100.0 as line_subtotal,
         ol.tax_rate_pct,
         ol.tax_cents / 100.0 as tax,
         ol.discount_cents / 100.0 as discount,
         ol.line_total_cents / 100.0 as line_total,
         p.method as payment_method
       FROM pos_order_lines ol
       JOIN pos_orders o ON o.id = ol.order_id
       LEFT JOIN pos_payments p ON p.order_id = o.id AND p.status = 'captured'
       WHERE o.org_id = $1
         AND o.site_id = $2
         AND o.order_date >= $3
         AND o.order_date <= $4
         AND o.status IN ('paid', 'void', 'refunded')
       ORDER BY o.order_date DESC, o.order_no, ol.line_no`,
      [orgId, siteId, params.from_date, params.to_date]
    );

    // Generate CSV
    const headers = [
      'Date', 'Order No', 'Status', 'Type', 'SKU/Code', 'Item Name',
      'Qty', 'UOM', 'Unit Price', 'Subtotal', 'Tax Rate %', 'Tax',
      'Discount', 'Line Total', 'Payment Method'
    ];

    const csv = [
      headers.join(','),
      ...result.rows.map(row =>
        [
          row.order_date,
          row.order_no,
          row.status,
          row.kind,
          `"${row.sku_or_code}"`,
          `"${row.name_snapshot}"`,
          row.qty,
          row.uom,
          row.unit_price,
          row.line_subtotal,
          row.tax_rate_pct,
          row.tax,
          row.discount,
          row.line_total,
          row.payment_method || ''
        ].join(',')
      )
    ].join('\n');

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, details, ip_address)
       VALUES ($1, $2, 'SALES_EXPORT', $3, $4, $5)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        JSON.stringify({ from: params.from_date, to: params.to_date, rows: result.rows.length }),
        req.ip
      ]
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales_${params.from_date}_to_${params.to_date}.csv"`);
    res.send(csv);

  } catch (error) {
    console.error('Sales export error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to export sales',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
