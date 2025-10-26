/**
 * FinanceEnforcementService.js (v16.2.0)
 *
 * High-level finance enforcement orchestrator
 *
 * Purpose:
 *   - Coordinate item bank, mapping, and import services
 *   - Generate period summaries by finance code
 *   - Verify period totals and lock them
 *   - Provide bulk remapping operations
 *   - Generate finance reports
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const crypto = require('crypto');

class FinanceEnforcementService {
  constructor(db, itemBankService, mappingService, importAdapter) {
    this.db = db;
    this.itemBankService = itemBankService;
    this.mappingService = mappingService;
    this.importAdapter = importAdapter;
  }

  /**
   * Generate period summary by finance code
   *
   * @param {string} period - Fiscal period (e.g., 'FY26-P01')
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date
   * @returns {Promise<Object>} Period summary with totals by finance code
   */
  async generatePeriodSummary(period, startDate, endDate) {
    // Query all validated invoices in period
    const invoices = await this.db.all(`
      SELECT
        ivr.invoice_id,
        ivr.computed_subtotal_cents,
        ivr.computed_gst_cents,
        ivr.computed_qst_cents,
        ivr.balance_status
      FROM invoice_validation_results ivr
      WHERE ivr.validated_at >= ? AND ivr.validated_at < ?
        AND ivr.balance_status = 'BALANCED'
    `, [startDate, endDate]);

    if (invoices.length === 0) {
      return {
        success: false,
        error: 'No balanced invoices found in period'
      };
    }

    // Aggregate by finance code
    const byFinanceCode = {};
    const financeCodeTotals = {};

    // Initialize all finance codes
    const allCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
    allCodes.forEach(code => {
      financeCodeTotals[code] = {
        amount_cents: 0,
        gst_cents: 0,
        qst_cents: 0,
        invoice_count: 0,
        line_count: 0
      };
    });

    // For each invoice, get line-level details from mapping_audit
    for (const invoice of invoices) {
      const lines = await this.db.all(`
        SELECT
          ma.new_code as finance_code,
          ma.gfs_item_no,
          ma.description,
          ma.confidence
        FROM mapping_audit ma
        WHERE ma.invoice_id = ?
        ORDER BY ma.timestamp DESC
      `, [invoice.invoice_id]);

      // Group lines by finance code
      const linesByCode = {};
      lines.forEach(line => {
        if (!linesByCode[line.finance_code]) {
          linesByCode[line.finance_code] = [];
        }
        linesByCode[line.finance_code].push(line);
      });

      // For each finance code, calculate proportional amounts
      // This is a simplified approach; ideally we'd have ext_price_cents per line
      const totalLines = lines.length;

      Object.keys(linesByCode).forEach(code => {
        const codeLines = linesByCode[code];
        const proportion = codeLines.length / totalLines;

        const amount_cents = Math.round(invoice.computed_subtotal_cents * proportion);
        const gst_cents = Math.round(invoice.computed_gst_cents * proportion);
        const qst_cents = Math.round(invoice.computed_qst_cents * proportion);

        if (!financeCodeTotals[code]) {
          financeCodeTotals[code] = {
            amount_cents: 0,
            gst_cents: 0,
            qst_cents: 0,
            invoice_count: 0,
            line_count: 0
          };
        }

        financeCodeTotals[code].amount_cents += amount_cents;
        financeCodeTotals[code].gst_cents += gst_cents;
        financeCodeTotals[code].qst_cents += qst_cents;
        financeCodeTotals[code].invoice_count += 1;
        financeCodeTotals[code].line_count += codeLines.length;
      });
    }

    // Convert to array for output
    const summary = Object.keys(financeCodeTotals).map(code => ({
      finance_code: code,
      amount_cents: financeCodeTotals[code].amount_cents,
      amount: (financeCodeTotals[code].amount_cents / 100).toFixed(2),
      gst_cents: financeCodeTotals[code].gst_cents,
      gst: (financeCodeTotals[code].gst_cents / 100).toFixed(2),
      qst_cents: financeCodeTotals[code].qst_cents,
      qst: (financeCodeTotals[code].qst_cents / 100).toFixed(2),
      total_cents: financeCodeTotals[code].amount_cents + financeCodeTotals[code].gst_cents + financeCodeTotals[code].qst_cents,
      total: ((financeCodeTotals[code].amount_cents + financeCodeTotals[code].gst_cents + financeCodeTotals[code].qst_cents) / 100).toFixed(2),
      invoice_count: financeCodeTotals[code].invoice_count,
      line_count: financeCodeTotals[code].line_count
    }));

    return {
      success: true,
      period,
      start_date: startDate,
      end_date: endDate,
      invoice_count: invoices.length,
      summary
    };
  }

  /**
   * Verify and lock period totals
   */
  async verifyAndLockPeriod(period, startDate, endDate, verified_by = 'system') {
    const summary = await this.generatePeriodSummary(period, startDate, endDate);

    if (!summary.success) {
      return summary;
    }

    // Delete existing verified totals for this period (if any)
    await this.db.run(`
      DELETE FROM finance_period_verified_totals WHERE period = ?
    `, [period]);

    // Insert new verified totals
    for (const item of summary.summary) {
      const id = crypto.randomUUID();

      await this.db.run(`
        INSERT INTO finance_period_verified_totals (
          id, period, finance_code, amount_cents, gst_cents, qst_cents,
          invoice_count, line_count, verified_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, period, item.finance_code, item.amount_cents, item.gst_cents, item.qst_cents,
        item.invoice_count, item.line_count, verified_by
      ]);
    }

    return {
      success: true,
      period,
      verified_totals: summary.summary,
      verified_at: new Date().toISOString(),
      verified_by
    };
  }

  /**
   * Get verified period totals
   */
  async getVerifiedPeriodTotals(period) {
    const totals = await this.db.all(`
      SELECT * FROM finance_period_verified_totals
      WHERE period = ?
      ORDER BY finance_code
    `, [period]);

    if (totals.length === 0) {
      return {
        success: false,
        error: `No verified totals found for period: ${period}`
      };
    }

    return {
      success: true,
      period,
      totals: totals.map(t => ({
        ...t,
        amount: (t.amount_cents / 100).toFixed(2),
        gst: (t.gst_cents / 100).toFixed(2),
        qst: (t.qst_cents / 100).toFixed(2),
        total: ((t.amount_cents + t.gst_cents + t.qst_cents) / 100).toFixed(2)
      }))
    };
  }

  /**
   * List all verified periods
   */
  async listVerifiedPeriods() {
    const periods = await this.db.all(`
      SELECT DISTINCT period, verified_at, verified_by
      FROM finance_period_verified_totals
      ORDER BY period DESC
    `);

    return {
      success: true,
      periods
    };
  }

  /**
   * Bulk remap all invoices in a date range (e.g., after adding new rules)
   */
  async bulkRemapInvoices(startDate, endDate, actor = 'system') {
    // Get all invoices in date range
    const invoices = await this.db.all(`
      SELECT DISTINCT invoice_id FROM mapping_audit
      WHERE timestamp >= ? AND timestamp < ?
    `, [startDate, endDate]);

    const results = [];
    const errors = [];

    for (const invoice of invoices) {
      try {
        const remapResult = await this.mappingService.remapInvoiceLines(invoice.invoice_id, actor);
        results.push({
          invoice_id: invoice.invoice_id,
          remapped_count: remapResult.remapped_count
        });
      } catch (error) {
        errors.push({
          invoice_id: invoice.invoice_id,
          error: error.message
        });
      }
    }

    return {
      success: true,
      invoices_processed: invoices.length,
      remapped_count: results.reduce((sum, r) => sum + r.remapped_count, 0),
      error_count: errors.length,
      results,
      errors
    };
  }

  /**
   * Get enforcement dashboard statistics
   */
  async getDashboardStats() {
    // Item Bank stats
    const itemBankStats = await this.itemBankService.getStatistics();

    // Mapping stats
    const mappingStats = await this.mappingService.getMappingStatistics();

    // Validation stats
    const validationStats = await this.db.all(`
      SELECT
        balance_status,
        COUNT(*) as count
      FROM invoice_validation_results
      GROUP BY balance_status
    `);

    // Recent invoices needing attention
    const needsAttention = await this.importAdapter.getInvoicesNeedingAttention(10);

    // Needs mapping queue count
    const needsMappingQueue = await this.mappingService.getNeedsMappingQueue(0, 0);

    return {
      success: true,
      item_bank: itemBankStats,
      mapping: mappingStats,
      validation: validationStats,
      needs_attention_count: needsAttention.length,
      needs_mapping_count: needsMappingQueue.total
    };
  }

  /**
   * Get top finance categories by spend (last N days)
   */
  async getTopFinanceCategories(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const topCategories = await this.db.all(`
      SELECT
        ma.new_code as finance_code,
        COUNT(*) as line_count,
        COUNT(DISTINCT ma.invoice_id) as invoice_count
      FROM mapping_audit ma
      WHERE ma.timestamp >= ?
      GROUP BY ma.new_code
      ORDER BY line_count DESC
      LIMIT 5
    `, [startDate]);

    return {
      success: true,
      period_days: days,
      categories: topCategories
    };
  }

  /**
   * Get mapping accuracy trend (by strategy)
   */
  async getMappingAccuracyTrend(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const trend = await this.db.all(`
      SELECT
        DATE(ma.timestamp) as date,
        ma.strategy,
        COUNT(*) as count,
        AVG(ma.confidence) as avg_confidence
      FROM mapping_audit ma
      WHERE ma.timestamp >= ?
      GROUP BY DATE(ma.timestamp), ma.strategy
      ORDER BY date DESC, strategy
    `, [startDate]);

    return {
      success: true,
      period_days: days,
      trend
    };
  }

  /**
   * Generate finance report for a date range
   */
  async generateFinanceReport(startDate, endDate, options = {}) {
    const { groupBy = 'finance_code', includeLowConfidence = false } = options;

    // Get all validated invoices
    const invoices = await this.importAdapter.getInvoicesNeedingAttention(1000);

    const filtered = invoices.filter(inv => {
      const validatedAt = new Date(inv.validated_at);
      return validatedAt >= new Date(startDate) && validatedAt < new Date(endDate);
    });

    // Get mapping statistics
    const mappingStats = await this.mappingService.getMappingStatistics();

    // Get item bank statistics
    const itemBankStats = await this.itemBankService.getStatistics();

    return {
      success: true,
      report_period: {
        start_date: startDate,
        end_date: endDate
      },
      invoices: {
        total: filtered.length,
        balanced: filtered.filter(i => i.balance_status === 'BALANCED').length,
        imbalanced: filtered.filter(i => i.balance_status === 'IMBALANCE').length,
        tax_errors: filtered.filter(i => i.balance_status === 'TAX_ERROR').length
      },
      mapping: mappingStats,
      item_bank: itemBankStats,
      invoices_detail: filtered
    };
  }

  /**
   * Export period summary to CSV
   */
  async exportPeriodSummaryCSV(period, startDate, endDate) {
    const summary = await this.generatePeriodSummary(period, startDate, endDate);

    if (!summary.success) {
      return summary;
    }

    const headers = [
      'finance_code', 'amount', 'gst', 'qst', 'total',
      'invoice_count', 'line_count'
    ];

    const csvLines = [headers.join(',')];

    for (const item of summary.summary) {
      const row = [
        item.finance_code,
        item.amount,
        item.gst,
        item.qst,
        item.total,
        item.invoice_count,
        item.line_count
      ];
      csvLines.push(row.join(','));
    }

    return {
      success: true,
      csv: csvLines.join('\n'),
      period,
      invoice_count: summary.invoice_count
    };
  }

  /**
   * Reconcile invoice against item bank
   * (Check which lines have no item bank entry)
   */
  async reconcileInvoiceAgainstItemBank(invoice_id) {
    const lines = await this.db.all(`
      SELECT
        ma.line_id,
        ma.gfs_item_no,
        ma.description,
        ma.strategy,
        ma.confidence
      FROM mapping_audit ma
      WHERE ma.invoice_id = ?
    `, [invoice_id]);

    const results = [];

    for (const line of lines) {
      let in_item_bank = false;

      if (line.gfs_item_no) {
        const item = await this.itemBankService.getItem(line.gfs_item_no);
        in_item_bank = (item && item.status === 'ACTIVE');
      }

      results.push({
        line_id: line.line_id,
        gfs_item_no: line.gfs_item_no,
        description: line.description,
        in_item_bank,
        strategy: line.strategy,
        confidence: line.confidence,
        needs_item_bank_entry: !in_item_bank && line.gfs_item_no
      });
    }

    const missing_count = results.filter(r => r.needs_item_bank_entry).length;

    return {
      success: true,
      invoice_id,
      total_lines: results.length,
      missing_count,
      lines: results
    };
  }
}

module.exports = FinanceEnforcementService;
