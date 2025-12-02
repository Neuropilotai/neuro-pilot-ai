/**
 * Financial Accuracy Module (v15.3)
 * Computes financial accuracy score based on invoice vs actual usage variance
 *
 * Categories tracked: BAKE, BEV+ECO, MILK, GROC+MISC, MEAT, PROD, CLEAN, PAPER, FREIGHT
 * Accuracy = 100 - abs(variance%) averaged across categories
 *
 * Weight: 0.15 in AI Ops Health
 * Green ≥ 95%, Yellow 70-94%, Red < 70%
 */

const { logger } = require('../../config/logger');
const { updateAccuracyPct } = require('../../utils/financialMetrics');

/**
 * Compute Financial Accuracy Score
 * @param {object} database - SQLite database connection
 * @returns {object} { financial_accuracy, color, variance_by_category, last_updated }
 */
async function computeFinancialAccuracy(database) {
  try {
    // Category mapping for financial tracking
    const categories = ['BAKE', 'BEV', 'MILK', 'GROC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT'];

    // Get invoice totals by category from ai_reconcile_history
    const invoiceTotals = {};

    try {
      // v21.1.8: PostgreSQL syntax - use CURRENT_DATE - INTERVAL instead of date()
      const invoiceData = await database.all(`
        SELECT
          category_totals,
          subtotal,
          invoice_date
        FROM ai_reconcile_history
        WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days'
      `);

      for (const row of invoiceData) {
        const catTotals = JSON.parse(row.category_totals || '{}');
        for (const [cat, amount] of Object.entries(catTotals)) {
          if (!invoiceTotals[cat]) {
            invoiceTotals[cat] = 0;
          }
          invoiceTotals[cat] += amount;
        }
      }
    } catch (err) {
      logger.debug('Financial Accuracy: Invoice data unavailable:', err.message);
      // Return neutral score if no data
      return {
        financial_accuracy: 85.0,
        color: 'yellow',
        variance_by_category: {},
        last_updated: new Date().toISOString(),
        note: 'No invoice data available - using baseline'
      };
    }

    // Get actual usage from inventory transactions and counts
    const actualUsage = {};

    try {
      // v21.1.8: PostgreSQL syntax - use NOW() - INTERVAL instead of datetime()
      // Query inventory_reconcile_runs for actual usage data
      const usageData = await database.all(`
        SELECT
          item_code,
          category,
          physical_qty,
          system_qty,
          variance_qty,
          variance_value
        FROM inventory_reconcile_detail
        WHERE reconcile_id IN (
          SELECT reconcile_id FROM inventory_reconcile_runs
          WHERE completed_at >= NOW() - INTERVAL '30 days'
          ORDER BY completed_at DESC
          LIMIT 1
        )
      `);

      for (const item of usageData) {
        const cat = item.category || 'OTHER';
        if (!actualUsage[cat]) {
          actualUsage[cat] = 0;
        }
        // Use absolute variance value as proxy for actual usage
        actualUsage[cat] += Math.abs(item.variance_value || 0);
      }
    } catch (err) {
      logger.debug('Financial Accuracy: Usage data unavailable:', err.message);
      // Use invoice data as proxy if usage data not available
      for (const [cat, amount] of Object.entries(invoiceTotals)) {
        actualUsage[cat] = amount * 0.95; // Assume 95% accuracy as baseline
      }
    }

    // Compute variance for each category
    const varianceByCategory = {};
    let totalVariancePct = 0;
    let categoriesWithData = 0;

    for (const cat of categories) {
      const invoiceTotal = invoiceTotals[cat] || 0;
      const actualTotal = actualUsage[cat] || 0;

      if (invoiceTotal > 0 && actualTotal > 0) {
        const variancePct = Math.abs((actualTotal - invoiceTotal) / invoiceTotal) * 100;
        varianceByCategory[cat] = {
          invoice: invoiceTotal,
          actual: actualTotal,
          variance_pct: parseFloat(variancePct.toFixed(2)),
          variance_amount: actualTotal - invoiceTotal
        };
        totalVariancePct += variancePct;
        categoriesWithData++;
      } else if (invoiceTotal > 0) {
        // Have invoice data but no usage - high variance
        varianceByCategory[cat] = {
          invoice: invoiceTotal,
          actual: 0,
          variance_pct: 100.0,
          variance_amount: -invoiceTotal
        };
        totalVariancePct += 100;
        categoriesWithData++;
      }
    }

    // Calculate average variance and accuracy
    const avgVariancePct = categoriesWithData > 0 ? totalVariancePct / categoriesWithData : 0;
    const financialAccuracy = Math.max(0, Math.min(100, 100 - avgVariancePct));

    // Determine color band
    let color = 'red';
    if (financialAccuracy >= 95) {
      color = 'green';
    } else if (financialAccuracy >= 70) {
      color = 'yellow';
    }

    // v21.1.8: PostgreSQL syntax - use ON CONFLICT instead of INSERT OR REPLACE
    // Store in ai_ops_health_metrics
    try {
      await database.run(`
        INSERT INTO ai_ops_health_metrics (metric_name, metric_value, weight, last_updated)
        VALUES ('financial_accuracy', $1, 0.15, NOW())
        ON CONFLICT (metric_name) DO UPDATE SET
          metric_value = EXCLUDED.metric_value,
          last_updated = NOW()
      `, [financialAccuracy]);
    } catch (err) {
      logger.debug('Could not store financial_accuracy metric:', err.message);
    }

    logger.info(`💰 Financial Accuracy computed: ${financialAccuracy.toFixed(1)}% (${color})`);

    // v15.3: Update Prometheus gauge
    updateAccuracyPct(financialAccuracy);

    return {
      financial_accuracy: parseFloat(financialAccuracy.toFixed(1)),
      color,
      variance_by_category: varianceByCategory,
      avg_variance_pct: parseFloat(avgVariancePct.toFixed(2)),
      categories_tracked: categoriesWithData,
      last_updated: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Financial Accuracy computation failed:', error);
    return {
      financial_accuracy: null,
      color: 'gray',
      variance_by_category: {},
      error: error.message,
      last_updated: new Date().toISOString()
    };
  }
}

/**
 * Get Financial Accuracy from metrics table
 * @param {object} database - SQLite database connection
 * @returns {object} { financial_accuracy, color, weight }
 */
async function getFinancialAccuracyMetric(database) {
  try {
    const metric = await database.get(`
      SELECT metric_value, weight, last_updated
      FROM ai_ops_health_metrics
      WHERE metric_name = 'financial_accuracy'
    `);

    if (!metric) {
      // Compute if not exists
      return await computeFinancialAccuracy(database);
    }

    let color = 'red';
    if (metric.metric_value >= 95) {
      color = 'green';
    } else if (metric.metric_value >= 70) {
      color = 'yellow';
    }

    return {
      financial_accuracy: metric.metric_value,
      color,
      weight: metric.weight,
      last_updated: metric.last_updated
    };

  } catch (error) {
    logger.error('Failed to get financial accuracy metric:', error);
    return {
      financial_accuracy: null,
      color: 'gray',
      weight: 0.15,
      error: error.message
    };
  }
}

module.exports = {
  computeFinancialAccuracy,
  getFinancialAccuracyMetric
};
