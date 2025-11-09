/**
 * POS PDF Generation Route
 * Generates Z reports and sales summary PDFs
 */

const express = require('express');
const { z } = require('zod');
const PDFDocument = require('pdfkit');
const router = express.Router();

// Validation schemas
const zReportPdfSchema = z.object({
  shift_id: z.number().int().positive()
});

const salesSummaryPdfSchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

/**
 * Helper: Format cents to currency
 */
function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * POST /z-report - Generate Z Report PDF
 */
router.post('/z-report', async (req, res) => {
  try {
    const data = zReportPdfSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get Z report
    const zReport = await global.db.query(
      `SELECT * FROM pos_z_reports
       WHERE shift_id = $1 AND org_id = $2 AND site_id = $3`,
      [data.shift_id, orgId, siteId]
    );

    if (zReport.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Z report not found',
        code: 'Z_REPORT_NOT_FOUND'
      });
    }

    const report = zReport.rows[0];
    const totals = report.totals;

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="z-report-${report.z_no}-${data.shift_id}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Neuro.Pilot.AI Commissary', { align: 'center' });
    doc.fontSize(16).text('Z Report', { align: 'center' });
    doc.moveDown();

    // Report details
    doc.fontSize(10);
    doc.text(`Z Report #: ${report.z_no}`, { continued: true });
    doc.text(`Register: ${totals.register_name}`, { align: 'right' });
    doc.text(`Org ID: ${orgId}`, { continued: true });
    doc.text(`Site ID: ${siteId}`, { align: 'right' });
    doc.text(`Generated: ${new Date(report.generated_at).toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Shift information
    doc.fontSize(12).text('Shift Information', { underline: true });
    doc.fontSize(10);
    doc.text(`Opened: ${new Date(totals.opened_at).toLocaleString()}`);
    doc.text(`Closed: ${new Date(totals.closed_at).toLocaleString()}`);
    doc.text(`Duration: ${Math.round((new Date(totals.closed_at) - new Date(totals.opened_at)) / 1000 / 60)} minutes`);
    doc.moveDown();

    // Sales summary
    doc.fontSize(12).text('Sales Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Orders: ${totals.order_count}`);
    doc.text(`Gross Sales: ${formatCurrency(totals.total_sales_cents)}`);
    doc.text(`Tax Collected: ${formatCurrency(totals.total_tax_cents)}`);
    doc.text(`Net Sales: ${formatCurrency(totals.total_sales_cents + totals.total_tax_cents)}`);
    doc.moveDown();

    // Tender breakdown
    doc.fontSize(12).text('Tender Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Cash: ${formatCurrency(totals.cash_total_cents)}`);
    doc.text(`External Card: ${formatCurrency(totals.card_total_cents)}`);
    doc.text(`Total: ${formatCurrency(totals.cash_total_cents + totals.card_total_cents)}`);
    doc.moveDown();

    // Cash reconciliation
    doc.fontSize(12).text('Cash Reconciliation', { underline: true });
    doc.fontSize(10);
    doc.text(`Opening Float: ${formatCurrency(totals.opening_float_cents)}`);
    doc.text(`Cash Sales: ${formatCurrency(totals.cash_total_cents)}`);
    doc.text(`Expected Cash: ${formatCurrency(totals.expected_cash_cents)}`);
    doc.text(`Actual Cash: ${formatCurrency(totals.closing_cash_cents)}`);

    const overShort = totals.over_short_cents;
    const overShortLabel = overShort >= 0 ? 'Over' : 'Short';
    const overShortStyle = overShort >= 0 ? {} : { color: 'red' };

    doc.text(`${overShortLabel}: ${formatCurrency(Math.abs(overShort))}`, overShortStyle);
    doc.moveDown();

    // Notes
    if (totals.notes) {
      doc.fontSize(12).text('Notes', { underline: true });
      doc.fontSize(10).text(totals.notes);
      doc.moveDown();
    }

    // Footer
    doc.fontSize(8).text('This is a computer-generated document.', { align: 'center' });
    doc.text(`Printed by: ${req.user.email || req.user.id}`, { align: 'center' });

    // Finalize PDF
    doc.end();

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, shift_id, details, ip_address)
       VALUES ($1, $2, 'Z_REPORT_PDF', $3, $4, $5, $6)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        data.shift_id,
        JSON.stringify({ z_no: report.z_no }),
        req.ip
      ]
    );

  } catch (error) {
    console.error('Z report PDF error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate Z report PDF',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * POST /sales-summary - Generate Sales Summary PDF
 */
router.post('/sales-summary', async (req, res) => {
  try {
    const data = salesSummaryPdfSchema.parse(req.body);

    const orgId = req.user.org_id || 1;
    const siteId = req.user.site_id || 1;

    // Get sales data
    const salesData = await global.db.query(
      `SELECT
         o.order_date,
         COUNT(DISTINCT o.id) as order_count,
         SUM(o.subtotal_cents) as gross_sales_cents,
         SUM(o.discount_cents) as discount_cents,
         SUM(o.tax_cents) as tax_cents,
         SUM(o.total_cents) as net_sales_cents
       FROM pos_orders o
       WHERE o.org_id = $1
         AND o.site_id = $2
         AND o.order_date >= $3
         AND o.order_date <= $4
         AND o.status = 'paid'
       GROUP BY o.order_date
       ORDER BY o.order_date`,
      [orgId, siteId, data.from_date, data.to_date]
    );

    // Get item breakdown
    const itemBreakdown = await global.db.query(
      `SELECT
         ol.kind,
         ol.sku_or_code,
         ol.name_snapshot,
         SUM(ol.qty) as total_qty,
         COUNT(DISTINCT o.id) as order_count,
         SUM(ol.line_subtotal_cents) as subtotal_cents,
         SUM(ol.tax_cents) as tax_cents,
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
       LIMIT 25`,
      [orgId, siteId, data.from_date, data.to_date]
    );

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales-summary-${data.from_date}-to-${data.to_date}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Neuro.Pilot.AI Commissary', { align: 'center' });
    doc.fontSize(16).text('Sales Summary Report', { align: 'center' });
    doc.moveDown();

    // Report details
    doc.fontSize(10);
    doc.text(`Period: ${data.from_date} to ${data.to_date}`, { align: 'center' });
    doc.text(`Org ID: ${orgId} | Site ID: ${siteId}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Daily summary
    if (salesData.rows.length > 0) {
      doc.fontSize(12).text('Daily Sales Summary', { underline: true });
      doc.fontSize(9);

      // Calculate totals
      let totalOrders = 0;
      let totalGross = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let totalNet = 0;

      salesData.rows.forEach(row => {
        const date = new Date(row.order_date).toLocaleDateString();
        const orders = parseInt(row.order_count);
        const gross = parseInt(row.gross_sales_cents);
        const discount = parseInt(row.discount_cents);
        const tax = parseInt(row.tax_cents);
        const net = parseInt(row.net_sales_cents);

        doc.text(
          `${date}: ${orders} orders | Gross: ${formatCurrency(gross)} | ` +
          `Disc: ${formatCurrency(discount)} | Tax: ${formatCurrency(tax)} | ` +
          `Net: ${formatCurrency(net)}`
        );

        totalOrders += orders;
        totalGross += gross;
        totalDiscount += discount;
        totalTax += tax;
        totalNet += net;
      });

      doc.moveDown();
      doc.fontSize(10).text('Period Totals:', { underline: true });
      doc.text(`Total Orders: ${totalOrders}`);
      doc.text(`Gross Sales: ${formatCurrency(totalGross)}`);
      doc.text(`Discounts: ${formatCurrency(totalDiscount)}`);
      doc.text(`Tax: ${formatCurrency(totalTax)}`);
      doc.text(`Net Sales: ${formatCurrency(totalNet)}`);
      doc.moveDown();
    }

    // Top selling items
    if (itemBreakdown.rows.length > 0) {
      doc.addPage();
      doc.fontSize(12).text('Top Selling Items', { underline: true });
      doc.fontSize(8);

      itemBreakdown.rows.forEach((item, index) => {
        doc.text(
          `${index + 1}. ${item.name_snapshot} (${item.sku_or_code}) - ` +
          `${item.kind} | Qty: ${parseFloat(item.total_qty).toFixed(2)} | ` +
          `Revenue: ${formatCurrency(parseInt(item.revenue_cents))}`
        );
      });
    }

    // Footer
    doc.fontSize(8).text('This is a computer-generated document.', { align: 'center' });
    doc.text(`Printed by: ${req.user.email || req.user.id}`, { align: 'center' });

    // Finalize PDF
    doc.end();

    // Audit log
    await global.db.query(
      `INSERT INTO pos_audit_log (org_id, site_id, event_type, user_id, details, ip_address)
       VALUES ($1, $2, 'SALES_SUMMARY_PDF', $3, $4, $5)`,
      [
        orgId,
        siteId,
        req.user.user_id || req.user.id,
        JSON.stringify({ from: data.from_date, to: data.to_date }),
        req.ip
      ]
    );

  } catch (error) {
    console.error('Sales summary PDF error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate sales summary PDF',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
