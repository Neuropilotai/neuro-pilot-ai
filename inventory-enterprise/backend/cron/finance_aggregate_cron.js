/**
 * Finance Aggregate Cron (v15.4.0)
 * Nightly materialization of finance aggregates
 * Emits Prometheus metrics
 */

const cron = require('node-cron');
const { logger } = require('../config/logger');

class FinanceAggregateCron {
  constructor(db, metricsExporter) {
    this.db = db;
    this.metrics = metricsExporter;
    this.job = null;

    // Register Prometheus metrics
    if (this.metrics && this.metrics.register) {
      this.jobDuration = new this.metrics.register.constructor.Histogram({
        name: 'finance_aggregate_job_duration_seconds',
        help: 'Duration of finance aggregation job in seconds',
        labelNames: ['status']
      });

      this.exportsTotal = new this.metrics.register.constructor.Counter({
        name: 'finance_exports_total',
        help: 'Total number of finance exports generated'
      });

      this.aiQueriesTotal = new this.metrics.register.constructor.Counter({
        name: 'finance_ai_queries_total',
        help: 'Total number of AI copilot queries processed',
        labelNames: ['status']
      });

      this.metrics.register.registerMetric(this.jobDuration);
      this.metrics.register.registerMetric(this.exportsTotal);
      this.metrics.register.registerMetric(this.aiQueriesTotal);
    }
  }

  /**
   * Start nightly aggregation job (runs at 2 AM)
   */
  start() {
    // Run every day at 2 AM
    this.job = cron.schedule('0 2 * * *', async () => {
      await this.runAggregation();
    });

    logger.info('✅ Finance aggregate cron started (daily at 2 AM)');
  }

  /**
   * Run aggregation logic
   */
  async runAggregation() {
    const startTime = Date.now();
    logger.info('🔄 Starting finance aggregation job...');

    try {
      // Aggregate daily facts
      await this.aggregateDailyFacts();

      // Aggregate weekly rollups
      await this.aggregateWeekly();

      // Aggregate monthly tax summaries
      await this.aggregateMonthlyTax();

      // Generate KPI snapshots
      await this.generateKPISnapshots();

      const duration = (Date.now() - startTime) / 1000;

      if (this.jobDuration) {
        this.jobDuration.labels('success').observe(duration);
      }

      logger.info(`✅ Finance aggregation complete in ${duration.toFixed(2)}s`);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      if (this.jobDuration) {
        this.jobDuration.labels('error').observe(duration);
      }

      logger.error('❌ Finance aggregation failed:', error);
    }
  }

  /**
   * Aggregate daily finance facts
   */
  async aggregateDailyFacts() {
    await this.db.run(`
      INSERT OR REPLACE INTO finance_fact_daily (
        date_key, vendor, category, invoice_count, subtotal, gst, qst, total_amount, food_freight, other_reimb, updated_at
      )
      SELECT
        DATE(invoice_date) as date_key,
        vendor,
        'ALL' as category,
        COUNT(DISTINCT invoice_number) as invoice_count,
        SUM(subtotal) as subtotal,
        SUM(gst) as gst,
        SUM(qst) as qst,
        SUM(total_amount) as total_amount,
        0 as food_freight,
        0 as other_reimb,
        datetime('now') as updated_at
      FROM ai_reconcile_history
      WHERE invoice_date >= DATE('now', '-30 days')
      GROUP BY DATE(invoice_date), vendor
    `);

    logger.debug('Daily facts aggregated');
  }

  /**
   * Aggregate weekly rollups
   */
  async aggregateWeekly() {
    await this.db.run(`
      INSERT OR REPLACE INTO finance_agg_weekly (
        week_key, week_start, week_end, vendor, invoice_count, subtotal, gst, qst, total_amount, avg_invoice_value, updated_at
      )
      SELECT
        strftime('%Y-W%W', invoice_date) as week_key,
        DATE(invoice_date, 'weekday 1', '-7 days') as week_start,
        DATE(invoice_date, 'weekday 0') as week_end,
        vendor,
        COUNT(DISTINCT invoice_number) as invoice_count,
        SUM(subtotal) as subtotal,
        SUM(gst) as gst,
        SUM(qst) as qst,
        SUM(total_amount) as total_amount,
        AVG(total_amount) as avg_invoice_value,
        datetime('now') as updated_at
      FROM ai_reconcile_history
      WHERE invoice_date >= DATE('now', '-90 days')
      GROUP BY week_key, vendor
    `);

    logger.debug('Weekly aggregates computed');
  }

  /**
   * Aggregate monthly tax summaries
   */
  async aggregateMonthlyTax() {
    await this.db.run(`
      INSERT OR REPLACE INTO finance_tax_monthly (
        month_key, period_name, quarter, half, subtotal, gst_collected, qst_collected, total_with_tax, invoice_count, vendor_count, avg_invoice_value, updated_at
      )
      SELECT
        strftime('%Y-%m', invoice_date) as month_key,
        strftime('%Y Q', invoice_date) || CAST((CAST(strftime('%m', invoice_date) AS INT) + 2) / 3 AS TEXT) as period_name,
        (CAST(strftime('%m', invoice_date) AS INT) + 2) / 3 as quarter,
        CASE WHEN CAST(strftime('%m', invoice_date) AS INT) <= 6 THEN 1 ELSE 2 END as half,
        SUM(subtotal) as subtotal,
        SUM(gst) as gst_collected,
        SUM(qst) as qst_collected,
        SUM(total_amount) as total_with_tax,
        COUNT(DISTINCT invoice_number) as invoice_count,
        COUNT(DISTINCT vendor) as vendor_count,
        AVG(total_amount) as avg_invoice_value,
        datetime('now') as updated_at
      FROM ai_reconcile_history
      WHERE invoice_date >= DATE('now', '-12 months')
      GROUP BY month_key
    `);

    logger.debug('Monthly tax aggregates computed');
  }

  /**
   * Generate KPI snapshots for trend analysis
   */
  async generateKPISnapshots() {
    // Current month snapshot
    await this.db.run(`
      INSERT OR REPLACE INTO finance_kpi_snapshots (
        period_key, period_type, total_revenue, total_invoices, avg_invoice_value, top_vendor, top_category, gst_pct, qst_pct, created_at
      )
      SELECT
        strftime('%Y-%m', 'now') as period_key,
        'month' as period_type,
        SUM(total_amount) as total_revenue,
        COUNT(DISTINCT invoice_number) as total_invoices,
        AVG(total_amount) as avg_invoice_value,
        (SELECT vendor FROM ai_reconcile_history WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now') GROUP BY vendor ORDER BY SUM(total_amount) DESC LIMIT 1) as top_vendor,
        'ALL' as top_category,
        (SUM(gst) / SUM(subtotal)) * 100 as gst_pct,
        (SUM(qst) / SUM(subtotal)) * 100 as qst_pct,
        datetime('now') as created_at
      FROM ai_reconcile_history
      WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')
    `);

    logger.debug('KPI snapshots generated');
  }

  /**
   * Track AI query
   */
  trackAIQuery(status) {
    if (this.aiQueriesTotal) {
      this.aiQueriesTotal.labels(status).inc();
    }
  }

  /**
   * Track export
   */
  trackExport() {
    if (this.exportsTotal) {
      this.exportsTotal.inc();
    }
  }

  /**
   * Stop cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('Finance aggregate cron stopped');
    }
  }
}

module.exports = FinanceAggregateCron;
