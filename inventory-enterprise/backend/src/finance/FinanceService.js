/**
 * Finance Service (v15.4.0)
 * Core business logic for finance workspace
 * KPIs, summaries, pivots, exports, data quality
 */

const { logger } = require('../../config/logger');

class FinanceService {
  /**
   * Query KPIs for a given period
   * @param {object} db - Database connection
   * @param {string} period - YYYY-Qn, YYYY-Hn, YYYY-MM..YYYY-MM
   * @returns {object} KPIs with deltas
   */
  static async queryKpis(db, period) {
    try {
      const { startDate, endDate, priorStart, priorEnd } = this.parsePeriod(period);

      // Current period
      const current = await db.get(`
        SELECT
          COUNT(DISTINCT invoice_number) as invoice_count,
          COUNT(DISTINCT vendor) as vendor_count,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as avg_invoice_value,
          SUM(subtotal) as subtotal,
          SUM(gst) as gst_collected,
          SUM(qst) as qst_collected
        FROM ai_reconcile_history
        WHERE invoice_date >= ? AND invoice_date <= ?
      `, [startDate, endDate]);

      // Prior period (for delta calculation)
      const prior = await db.get(`
        SELECT
          COUNT(DISTINCT invoice_number) as invoice_count,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as avg_invoice_value
        FROM ai_reconcile_history
        WHERE invoice_date >= ? AND invoice_date <= ?
      `, [priorStart, priorEnd]);

      // Calculate deltas
      const revenueDelta = prior.total_revenue > 0
        ? ((current.total_revenue - prior.total_revenue) / prior.total_revenue) * 100
        : 0;

      const invoiceDelta = prior.invoice_count > 0
        ? ((current.invoice_count - prior.invoice_count) / prior.invoice_count) * 100
        : 0;

      const avgDelta = prior.avg_invoice_value > 0
        ? ((current.avg_invoice_value - prior.avg_invoice_value) / prior.avg_invoice_value) * 100
        : 0;

      // Top vendor
      const topVendor = await db.get(`
        SELECT vendor, SUM(total_amount) as total
        FROM ai_reconcile_history
        WHERE invoice_date >= ? AND invoice_date <= ?
        GROUP BY vendor
        ORDER BY total DESC
        LIMIT 1
      `, [startDate, endDate]);

      return {
        success: true,
        period,
        dateRange: { start: startDate, end: endDate },
        kpis: {
          totalRevenue: {
            value: current.total_revenue || 0,
            delta: parseFloat(revenueDelta.toFixed(2)),
            formatted: `$${(current.total_revenue || 0).toFixed(2)}`
          },
          invoiceCount: {
            value: current.invoice_count || 0,
            delta: parseFloat(invoiceDelta.toFixed(2))
          },
          avgInvoiceValue: {
            value: current.avg_invoice_value || 0,
            delta: parseFloat(avgDelta.toFixed(2)),
            formatted: `$${(current.avg_invoice_value || 0).toFixed(2)}`
          },
          vendorCount: {
            value: current.vendor_count || 0
          },
          gstCollected: {
            value: current.gst_collected || 0,
            formatted: `$${(current.gst_collected || 0).toFixed(2)}`
          },
          qstCollected: {
            value: current.qst_collected || 0,
            formatted: `$${(current.qst_collected || 0).toFixed(2)}`
          },
          topVendor: {
            name: topVendor?.vendor || 'N/A',
            value: topVendor?.total || 0,
            formatted: `$${(topVendor?.total || 0).toFixed(2)}`
          }
        }
      };
    } catch (error) {
      logger.error('FinanceService.queryKpis error:', error);
      throw error;
    }
  }

  /**
   * Query summary grouped by dimension
   * @param {object} db - Database connection
   * @param {string} period - Date range
   * @param {string} groupBy - week|month|vendor|category|location
   * @returns {object} Summarized data
   */
  static async querySummary(db, period, groupBy = 'month') {
    try {
      const { startDate, endDate } = this.parsePeriod(period);

      let groupClause, selectClause, orderClause;

      switch (groupBy) {
        case 'week':
          selectClause = `strftime('%Y-W%W', invoice_date) as period_key`;
          groupClause = `strftime('%Y-W%W', invoice_date)`;
          orderClause = 'period_key ASC';
          break;
        case 'vendor':
          selectClause = 'vendor as period_key';
          groupClause = 'vendor';
          orderClause = 'total DESC';
          break;
        case 'category':
          selectClause = 'category_totals as period_key';
          groupClause = 'category_totals';
          orderClause = 'total DESC';
          break;
        case 'month':
        default:
          selectClause = `strftime('%Y-%m', invoice_date) as period_key`;
          groupClause = `strftime('%Y-%m', invoice_date)`;
          orderClause = 'period_key ASC';
          break;
      }

      const rows = await db.all(`
        SELECT
          ${selectClause},
          COUNT(DISTINCT invoice_number) as invoice_count,
          COUNT(DISTINCT vendor) as vendor_count,
          SUM(subtotal) as subtotal,
          SUM(gst) as gst,
          SUM(qst) as qst,
          SUM(total_amount) as total,
          AVG(total_amount) as avg_invoice
        FROM ai_reconcile_history
        WHERE invoice_date >= ? AND invoice_date <= ?
        GROUP BY ${groupClause}
        ORDER BY ${orderClause}
      `, [startDate, endDate]);

      return {
        success: true,
        period,
        groupBy,
        count: rows.length,
        summary: rows.map(row => ({
          period: row.period_key,
          invoiceCount: row.invoice_count,
          vendorCount: row.vendor_count,
          subtotal: parseFloat((row.subtotal || 0).toFixed(2)),
          gst: parseFloat((row.gst || 0).toFixed(2)),
          qst: parseFloat((row.qst || 0).toFixed(2)),
          total: parseFloat((row.total || 0).toFixed(2)),
          avgInvoice: parseFloat((row.avg_invoice || 0).toFixed(2))
        }))
      };
    } catch (error) {
      logger.error('FinanceService.querySummary error:', error);
      throw error;
    }
  }

  /**
   * Query pivot table
   * @param {object} db - Database connection
   * @param {object} params - {rows, cols, metrics, filters}
   * @returns {object} Pivot result
   */
  static async queryPivot(db, params) {
    try {
      const { rows, cols, metrics, filters } = params;
      const MAX_ROWS = 5000;

      // Build dynamic SQL (with guardrails)
      const allowedDims = ['vendor', 'category', 'month', 'week', 'quarter'];
      const allowedMetrics = ['total_amount', 'subtotal', 'gst', 'qst', 'invoice_count'];

      if (!allowedDims.includes(rows) || !allowedDims.includes(cols)) {
        throw new Error('Invalid dimension specified');
      }

      if (!Array.isArray(metrics) || !metrics.every(m => allowedMetrics.includes(m))) {
        throw new Error('Invalid metrics specified');
      }

      // For simplicity, return a flat result that frontend can pivot
      const results = await db.all(`
        SELECT
          vendor,
          strftime('%Y-%m', invoice_date) as month,
          SUM(total_amount) as total_amount,
          SUM(subtotal) as subtotal,
          SUM(gst) as gst,
          SUM(qst) as qst,
          COUNT(DISTINCT invoice_number) as invoice_count
        FROM ai_reconcile_history
        WHERE 1=1
        GROUP BY vendor, month
        ORDER BY vendor, month
        LIMIT ?
      `, [MAX_ROWS]);

      return {
        success: true,
        rows: results.length,
        data: results
      };
    } catch (error) {
      logger.error('FinanceService.queryPivot error:', error);
      throw error;
    }
  }

  /**
   * Export to CSV
   * @param {array} data - Result rows
   * @param {object} meta - Metadata
   * @returns {string} CSV content
   */
  static exportToCSV(data, meta) {
    if (!data || data.length === 0) {
      return 'No data to export\n';
    }

    const headers = Object.keys(data[0]);
    let csv = headers.join(',') + '\n';

    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
      });
      csv += values.join(',') + '\n';
    }

    return csv;
  }

  /**
   * List data quality issues
   * @param {object} db - Database connection
   * @returns {object} Issues by type
   */
  static async listDataQuality(db) {
    try {
      // Check for duplicate invoices
      const duplicates = await db.all(`
        SELECT invoice_number, COUNT(*) as count
        FROM ai_reconcile_history
        GROUP BY invoice_number
        HAVING count > 1
      `);

      // Check for missing categories
      const missingCategory = await db.all(`
        SELECT invoice_number, vendor
        FROM ai_reconcile_history
        WHERE category_totals IS NULL OR category_totals = '{}'
        LIMIT 100
      `);

      // Check for negative amounts
      const negativeAmounts = await db.all(`
        SELECT invoice_number, vendor, total_amount
        FROM ai_reconcile_history
        WHERE total_amount < 0
        LIMIT 100
      `);

      const issues = [];

      if (duplicates.length > 0) {
        issues.push({
          type: 'duplicate_invoice',
          severity: 'warning',
          count: duplicates.length,
          sample: duplicates.slice(0, 5)
        });
      }

      if (missingCategory.length > 0) {
        issues.push({
          type: 'missing_category',
          severity: 'warning',
          count: missingCategory.length,
          sample: missingCategory.slice(0, 5)
        });
      }

      if (negativeAmounts.length > 0) {
        issues.push({
          type: 'negative_amount',
          severity: 'critical',
          count: negativeAmounts.length,
          sample: negativeAmounts.slice(0, 5)
        });
      }

      return {
        success: true,
        issueCount: issues.length,
        issues
      };
    } catch (error) {
      logger.error('FinanceService.listDataQuality error:', error);
      throw error;
    }
  }

  /**
   * Parse period string to date range
   * @param {string} period - YYYY-Qn, YYYY-Hn, YYYY-MM..YYYY-MM
   * @returns {object} {startDate, endDate, priorStart, priorEnd}
   */
  static parsePeriod(period) {
    const currentYear = new Date().getFullYear();
    let startDate, endDate, priorStart, priorEnd;

    // Quarter: YYYY-Q1, YYYY-Q2, etc.
    if (period.match(/^\d{4}-Q[1-4]$/)) {
      const [year, qtr] = period.split('-');
      const q = parseInt(qtr.replace('Q', ''));
      const startMonth = (q - 1) * 3 + 1;
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      endDate = `${year}-${String(startMonth + 2).padStart(2, '0')}-31`;

      // Prior quarter
      const priorQ = q === 1 ? 4 : q - 1;
      const priorYear = q === 1 ? parseInt(year) - 1 : year;
      const priorMonth = (priorQ - 1) * 3 + 1;
      priorStart = `${priorYear}-${String(priorMonth).padStart(2, '0')}-01`;
      priorEnd = `${priorYear}-${String(priorMonth + 2).padStart(2, '0')}-31`;
    }
    // Half: YYYY-H1, YYYY-H2
    else if (period.match(/^\d{4}-H[12]$/)) {
      const [year, half] = period.split('-');
      const h = parseInt(half.replace('H', ''));
      startDate = h === 1 ? `${year}-01-01` : `${year}-07-01`;
      endDate = h === 1 ? `${year}-06-30` : `${year}-12-31`;

      // Prior half
      const priorH = h === 1 ? 2 : 1;
      const priorYear = h === 1 ? parseInt(year) - 1 : year;
      priorStart = priorH === 1 ? `${priorYear}-01-01` : `${priorYear}-07-01`;
      priorEnd = priorH === 1 ? `${priorYear}-06-30` : `${priorYear}-12-31`;
    }
    // Range: YYYY-MM..YYYY-MM
    else if (period.includes('..')) {
      [startDate, endDate] = period.split('..');
      startDate = `${startDate}-01`;
      // Calculate last day of end month
      const endParts = endDate.split('-');
      const lastDay = new Date(parseInt(endParts[0]), parseInt(endParts[1]), 0).getDate();
      endDate = `${endDate}-${String(lastDay).padStart(2, '0')}`;

      // Prior period (same length)
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diff = end - start;
      const priorEndDate = new Date(start);
      priorEndDate.setDate(priorEndDate.getDate() - 1);
      priorEnd = priorEndDate.toISOString().split('T')[0];
      const priorStartDate = new Date(priorEndDate);
      priorStartDate.setTime(priorStartDate.getTime() - diff);
      priorStart = priorStartDate.toISOString().split('T')[0];
    }
    // Default to current month
    else {
      const now = new Date();
      startDate = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
      endDate = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

      // Prior month
      const priorMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const priorYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;
      priorStart = `${priorYear}-${String(priorMonth).padStart(2, '0')}-01`;
      const priorLastDay = new Date(priorYear, priorMonth, 0).getDate();
      priorEnd = `${priorYear}-${String(priorMonth).padStart(2, '0')}-${priorLastDay}`;
    }

    return { startDate, endDate, priorStart, priorEnd };
  }
}

module.exports = FinanceService;
