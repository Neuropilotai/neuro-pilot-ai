/**
 * Count Session Report Generator v15.6.0
 * Generate PDF and CSV reports for finance-first count workflow
 */

const db = require('../../config/database');

class CountReportGenerator {
  /**
   * Generate comprehensive count report data
   * @param {string} countId - Count session ID
   * @returns {Object} Report data structure
   */
  static async generateReportData(countId) {
    // 1. Get count session header
    const session = await db.get(`
      SELECT * FROM count_sessions WHERE count_id = ?
    `, [countId]);

    if (!session) {
      throw new Error('Count session not found');
    }

    // 2. Get finance code summary
    const financeCodeTotals = await db.all(`
      SELECT
        finance_code,
        SUM(expected_qty) as total_expected_qty,
        SUM(counted_qty) as total_counted_qty,
        SUM(counted_qty - expected_qty) as total_variance_qty,
        SUM(counted_qty * unit_cost_cents) as total_value_cents,
        SUM((counted_qty - expected_qty) * unit_cost_cents) as total_variance_value_cents,
        COUNT(*) as item_count
      FROM count_lines
      WHERE count_id = ?
      GROUP BY finance_code
      ORDER BY finance_code
    `, [countId]);

    // 3. Get attached invoices
    const invoices = await db.all(`
      SELECT
        vendor,
        invoice_number,
        invoice_date,
        subtotal_cents,
        gst_cents,
        qst_cents,
        total_cents,
        attached_at
      FROM count_invoices
      WHERE count_id = ?
      ORDER BY invoice_date
    `, [countId]);

    // 4. Get count lines (item detail)
    const lines = await db.all(`
      SELECT
        item_code,
        item_desc,
        finance_code,
        expected_qty,
        counted_qty,
        counted_qty - expected_qty as variance_qty,
        counted_uom,
        unit_cost_cents,
        (counted_qty - expected_qty) * unit_cost_cents as variance_value_cents,
        source,
        notes
      FROM count_lines
      WHERE count_id = ?
      ORDER BY finance_code, item_code
    `, [countId]);

    // 5. Get unresolved mappings (exceptions)
    const unresolvedMappings = await db.all(`
      SELECT
        ci.vendor,
        ci.invoice_number,
        cil.raw_desc,
        cil.quantity,
        cil.uom,
        cil.extended_cents,
        cil.ai_item_code,
        cil.ai_finance_code,
        cil.ai_confidence,
        cil.mapping_status
      FROM count_invoice_lines cil
      JOIN count_invoices ci ON ci.link_id = cil.link_id
      WHERE ci.count_id = ? AND cil.mapping_status = 'needs_review'
    `, [countId]);

    // 6. Calculate grand totals
    const grandTotals = financeCodeTotals.reduce((acc, row) => {
      acc.total_value_cents += row.total_value_cents || 0;
      acc.total_variance_value_cents += row.total_variance_value_cents || 0;
      acc.item_count += row.item_count || 0;
      return acc;
    }, { total_value_cents: 0, total_variance_value_cents: 0, item_count: 0 });

    // 7. Calculate tax totals
    const taxTotals = invoices.reduce((acc, inv) => {
      acc.subtotal_cents += inv.subtotal_cents || 0;
      acc.gst_cents += inv.gst_cents || 0;
      acc.qst_cents += inv.qst_cents || 0;
      acc.total_cents += inv.total_cents || 0;
      return acc;
    }, { subtotal_cents: 0, gst_cents: 0, qst_cents: 0, total_cents: 0 });

    // 8. Classify finance codes
    const foodFreightCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'FREIGHT'];
    const foodFreightTotal = financeCodeTotals
      .filter(row => foodFreightCodes.includes(row.finance_code))
      .reduce((sum, row) => sum + (row.total_value_cents || 0), 0);

    const otherCostsTotal = financeCodeTotals
      .filter(row => !foodFreightCodes.includes(row.finance_code))
      .reduce((sum, row) => sum + (row.total_value_cents || 0), 0);

    return {
      session,
      financeCodeTotals,
      invoices,
      lines,
      unresolvedMappings,
      grandTotals,
      taxTotals,
      foodFreightTotal,
      otherCostsTotal,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate CSV export (GL-friendly format)
   * @param {string} countId - Count session ID
   * @returns {string} CSV content
   */
  static async generateCSV(countId) {
    const data = await this.generateReportData(countId);
    const lines = [];

    // Header section
    lines.push('Count Session Report - GL Export');
    lines.push('Count ID,' + data.session.count_id);
    lines.push('Period,' + data.session.period_year + '-' + String(data.session.period_month).padStart(2, '0'));
    lines.push('Status,' + data.session.status);
    lines.push('Created By,' + data.session.created_by);
    lines.push('Generated At,' + data.generatedAt);
    lines.push('');

    // Finance Code Summary
    lines.push('Finance Code Summary');
    lines.push('Finance Code,Expected Qty,Counted Qty,Variance Qty,Value (Cents),Variance Value (Cents),Item Count');
    for (const row of data.financeCodeTotals) {
      lines.push([
        row.finance_code,
        row.total_expected_qty || 0,
        row.total_counted_qty || 0,
        row.total_variance_qty || 0,
        row.total_value_cents || 0,
        row.total_variance_value_cents || 0,
        row.item_count || 0
      ].join(','));
    }
    lines.push('');

    // Grand Totals
    lines.push('Grand Totals');
    lines.push('Total Value (Cents),' + data.grandTotals.total_value_cents);
    lines.push('Total Variance (Cents),' + data.grandTotals.total_variance_value_cents);
    lines.push('Total Items,' + data.grandTotals.item_count);
    lines.push('');

    // Food + Freight Reimbursable
    lines.push('Food + Freight Reimbursable (Cents),' + data.foodFreightTotal);
    lines.push('Other Costs (Cents),' + data.otherCostsTotal);
    lines.push('');

    // Tax Summary
    lines.push('Tax Summary');
    lines.push('Subtotal (Cents),' + data.taxTotals.subtotal_cents);
    lines.push('GST (Cents),' + data.taxTotals.gst_cents);
    lines.push('QST (Cents),' + data.taxTotals.qst_cents);
    lines.push('Total with Tax (Cents),' + data.taxTotals.total_cents);
    lines.push('');

    // Attached Invoices
    lines.push('Attached Invoices');
    lines.push('Vendor,Invoice Number,Invoice Date,Subtotal (Cents),GST (Cents),QST (Cents),Total (Cents)');
    for (const inv of data.invoices) {
      lines.push([
        this.escapeCsv(inv.vendor),
        this.escapeCsv(inv.invoice_number),
        inv.invoice_date,
        inv.subtotal_cents || 0,
        inv.gst_cents || 0,
        inv.qst_cents || 0,
        inv.total_cents || 0
      ].join(','));
    }
    lines.push('');

    // Line Item Detail
    lines.push('Line Item Detail');
    lines.push('Item Code,Item Description,Finance Code,Expected Qty,Counted Qty,Variance Qty,UOM,Unit Cost (Cents),Variance Value (Cents),Source,Notes');
    for (const line of data.lines) {
      lines.push([
        this.escapeCsv(line.item_code),
        this.escapeCsv(line.item_desc),
        line.finance_code,
        line.expected_qty || 0,
        line.counted_qty || 0,
        line.variance_qty || 0,
        this.escapeCsv(line.counted_uom),
        line.unit_cost_cents || 0,
        line.variance_value_cents || 0,
        line.source,
        this.escapeCsv(line.notes)
      ].join(','));
    }
    lines.push('');

    // Exceptions (Unresolved Mappings)
    if (data.unresolvedMappings.length > 0) {
      lines.push('Exceptions - Unresolved Mappings');
      lines.push('Vendor,Invoice Number,Description,Quantity,UOM,Extended (Cents),AI Item Code,AI Finance Code,Confidence,Status');
      for (const mapping of data.unresolvedMappings) {
        lines.push([
          this.escapeCsv(mapping.vendor),
          this.escapeCsv(mapping.invoice_number),
          this.escapeCsv(mapping.raw_desc),
          mapping.quantity || 0,
          this.escapeCsv(mapping.uom),
          mapping.extended_cents || 0,
          this.escapeCsv(mapping.ai_item_code),
          mapping.ai_finance_code,
          mapping.ai_confidence || 0,
          mapping.mapping_status
        ].join(','));
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate text-based report (for terminal/email)
   * @param {string} countId - Count session ID
   * @returns {string} Text report
   */
  static async generateTextReport(countId) {
    const data = await this.generateReportData(countId);
    const lines = [];

    // Header
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('  COUNT SESSION REPORT v15.6.0');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('Count ID:       ' + data.session.count_id);
    lines.push('Period:         ' + data.session.period_year + '-' + String(data.session.period_month).padStart(2, '0'));
    lines.push('Status:         ' + data.session.status);
    lines.push('Created By:     ' + data.session.created_by);
    lines.push('Created At:     ' + data.session.created_at);
    if (data.session.submitted_at) {
      lines.push('Submitted At:   ' + data.session.submitted_at);
      lines.push('Submitted By:   ' + data.session.submitted_by);
    }
    if (data.session.approved_at) {
      lines.push('Approved At:    ' + data.session.approved_at);
      lines.push('Approved By:    ' + data.session.approved_by);
    }
    if (data.session.locked_at) {
      lines.push('Locked At:      ' + data.session.locked_at);
      lines.push('Locked By:      ' + data.session.locked_by);
    }
    lines.push('');

    // Finance Code Summary
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('  FINANCE CODE SUMMARY');
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push(this.padRight('Code', 12) + this.padLeft('Value ($)', 12) + this.padLeft('Variance ($)', 14) + this.padLeft('Items', 8));
    lines.push('─'.repeat(46));

    for (const row of data.financeCodeTotals) {
      const value = (row.total_value_cents / 100).toFixed(2);
      const variance = (row.total_variance_value_cents / 100).toFixed(2);
      lines.push(
        this.padRight(row.finance_code, 12) +
        this.padLeft(value, 12) +
        this.padLeft(variance, 14) +
        this.padLeft(String(row.item_count), 8)
      );
    }
    lines.push('─'.repeat(46));
    lines.push(
      this.padRight('TOTAL', 12) +
      this.padLeft((data.grandTotals.total_value_cents / 100).toFixed(2), 12) +
      this.padLeft((data.grandTotals.total_variance_value_cents / 100).toFixed(2), 14) +
      this.padLeft(String(data.grandTotals.item_count), 8)
    );
    lines.push('');

    // Reimbursable vs Other
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('  COST CLASSIFICATION');
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('Food + Freight (Reimbursable):    $' + (data.foodFreightTotal / 100).toFixed(2));
    lines.push('Other Costs:                      $' + (data.otherCostsTotal / 100).toFixed(2));
    lines.push('');

    // Tax Summary
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('  TAX SUMMARY');
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('Subtotal:       $' + (data.taxTotals.subtotal_cents / 100).toFixed(2));
    lines.push('GST (5%):       $' + (data.taxTotals.gst_cents / 100).toFixed(2));
    lines.push('QST (9.975%):   $' + (data.taxTotals.qst_cents / 100).toFixed(2));
    lines.push('Total with Tax: $' + (data.taxTotals.total_cents / 100).toFixed(2));
    lines.push('');

    // Attached Invoices
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('  ATTACHED INVOICES (' + data.invoices.length + ')');
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('');
    if (data.invoices.length > 0) {
      for (const inv of data.invoices) {
        lines.push(inv.vendor + ' #' + inv.invoice_number + ' - $' + (inv.total_cents / 100).toFixed(2));
        lines.push('  Date: ' + inv.invoice_date);
      }
    } else {
      lines.push('No invoices attached.');
    }
    lines.push('');

    // Exceptions
    if (data.unresolvedMappings.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────');
      lines.push('  EXCEPTIONS - UNRESOLVED MAPPINGS (' + data.unresolvedMappings.length + ')');
      lines.push('───────────────────────────────────────────────────────────────────');
      lines.push('');
      for (const mapping of data.unresolvedMappings) {
        lines.push(mapping.vendor + ' #' + mapping.invoice_number);
        lines.push('  ' + mapping.raw_desc + ' (' + mapping.quantity + ' ' + mapping.uom + ')');
        lines.push('  AI Suggestion: ' + (mapping.ai_item_code || 'N/A') + ' / ' + mapping.ai_finance_code + ' (confidence: ' + (mapping.ai_confidence * 100).toFixed(0) + '%)');
        lines.push('');
      }
    }

    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('Generated at: ' + new Date(data.generatedAt).toLocaleString());
    lines.push('═══════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Helper: Escape CSV field
   */
  static escapeCsv(field) {
    if (!field) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Helper: Pad string to right
   */
  static padRight(str, length) {
    return String(str).padEnd(length, ' ');
  }

  /**
   * Helper: Pad string to left
   */
  static padLeft(str, length) {
    return String(str).padStart(length, ' ');
  }
}

module.exports = CountReportGenerator;
