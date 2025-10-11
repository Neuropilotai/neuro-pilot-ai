/**
 * Owner Super Console - Tiered Reporting Center
 * Read-only aggregated reports for different roles
 * Owner-only, localhost-only
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const db = require('../config/database');

/**
 * GET /api/owner/reports/executive
 * Owner Executive Summary
 * - Today vs Tomorrow demand from forecast
 * - Stockout list (CRITICAL/HIGH only)
 * - AI confidence trend
 */
router.get('/executive', authenticateToken, requireOwner, async (req, res) => {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      reportType: 'executive_summary'
    };

    // Today vs Tomorrow demand (from existing forecast API data)
    // Note: This would typically come from forecast_results table
    const demandSql = `
      SELECT
        item_code,
        predicted_quantity,
        unit,
        confidence_score,
        prediction_date,
        source
      FROM forecast_results
      WHERE prediction_date IN (date('now'), date('now', '+1 day'))
      ORDER BY prediction_date, item_code
      LIMIT 100
    `;

    let demandData = [];
    try {
      demandData = await db.all(demandSql);
    } catch (error) {
      // Table may not exist, use empty array
      demandData = [];
    }

    report.demand = {
      today: demandData.filter(d => d.prediction_date === new Date().toISOString().split('T')[0]),
      tomorrow: demandData.filter(d => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return d.prediction_date === tomorrow.toISOString().split('T')[0];
      })
    };

    // Stockout list (CRITICAL/HIGH)
    const stockoutSql = `
      SELECT
        item_code,
        severity,
        projected_stockout_date,
        current_quantity,
        predicted_demand
      FROM ai_anomaly_predictions
      WHERE severity IN ('CRITICAL', 'HIGH')
        AND prediction_type = 'stockout'
        AND projected_stockout_date >= date('now')
      ORDER BY projected_stockout_date ASC
      LIMIT 50
    `;

    let stockouts = [];
    try {
      stockouts = await db.all(stockoutSql);
    } catch (error) {
      stockouts = [];
    }

    report.stockouts = stockouts;

    // AI confidence trend (last 7 days average)
    const confidenceSql = `
      SELECT
        DATE(created_at) as date,
        AVG(confidence_score) as avg_confidence,
        COUNT(*) as prediction_count
      FROM forecast_results
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    let confidenceTrend = [];
    try {
      confidenceTrend = await db.all(confidenceSql);
    } catch (error) {
      confidenceTrend = [];
    }

    report.aiConfidenceTrend = confidenceTrend;

    // Overall system health summary
    const itemCountSql = `SELECT COUNT(*) as total FROM inventory_items`;
    const locationCountSql = `SELECT COUNT(*) as total FROM storage_locations WHERE active = 1`;
    const pdfCountSql = `SELECT COUNT(*) as total FROM documents WHERE type = 'invoice'`;

    const itemCount = await db.get(itemCountSql).catch(() => ({ total: 0 }));
    const locationCount = await db.get(locationCountSql).catch(() => ({ total: 0 }));
    const pdfCount = await db.get(pdfCountSql).catch(() => ({ total: 0 }));

    report.systemHealth = {
      totalItems: itemCount.total,
      activeLocations: locationCount.total,
      pdfsStored: pdfCount.total
    };

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Executive report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/reports/ops
 * Ops Manager Report
 * - Count throughput last 14 days
 * - Open vs closed counts
 * - "include-orders" usage (PDFs attached to counts)
 * - Top 20 spot-check targets (high-variance items)
 */
router.get('/ops', authenticateToken, requireOwner, async (req, res) => {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      reportType: 'ops_manager'
    };

    // Count throughput (last 14 days)
    const throughputSql = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as counts_started,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as counts_completed,
        COUNT(DISTINCT owner_id) as unique_counters
      FROM inventory_counts
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    let throughput = [];
    try {
      throughput = await db.all(throughputSql);
    } catch (error) {
      throughput = [];
    }

    report.countThroughput = throughput;

    // Open vs closed counts
    const countStatusSql = `
      SELECT
        status,
        COUNT(*) as count,
        AVG(item_count) as avg_items_per_count
      FROM inventory_counts
      GROUP BY status
    `;

    let countStatus = [];
    try {
      countStatus = await db.all(countStatusSql);
    } catch (error) {
      countStatus = [];
    }

    report.countStatus = {
      open: countStatus.find(s => s.status === 'open') || { count: 0, avg_items_per_count: 0 },
      closed: countStatus.find(s => s.status === 'closed') || { count: 0, avg_items_per_count: 0 }
    };

    // "include-orders" usage (PDFs attached to counts)
    const pdfUsageSql = `
      SELECT
        COUNT(DISTINCT count_id) as counts_with_pdfs,
        COUNT(DISTINCT document_id) as unique_pdfs_included,
        COUNT(*) as total_pdf_attachments
      FROM count_pdfs
    `;

    let pdfUsage = { counts_with_pdfs: 0, unique_pdfs_included: 0, total_pdf_attachments: 0 };
    try {
      pdfUsage = await db.get(pdfUsageSql) || pdfUsage;
    } catch (error) {
      // Table may not exist
    }

    report.pdfUsage = pdfUsage;

    // Top 20 spot-check targets (items with high variance or frequent counts)
    const spotCheckSql = `
      SELECT
        ii.item_code,
        ii.item_name,
        COUNT(ici.id) as count_frequency,
        AVG(ici.quantity) as avg_counted_qty,
        ii.current_quantity as system_qty,
        ABS(AVG(ici.quantity) - ii.current_quantity) as variance
      FROM inventory_items ii
      LEFT JOIN inventory_count_items ici ON ii.item_code = ici.item_code
      WHERE ici.created_at >= datetime('now', '-30 days')
      GROUP BY ii.item_code, ii.item_name, ii.current_quantity
      ORDER BY variance DESC, count_frequency DESC
      LIMIT 20
    `;

    let spotCheckTargets = [];
    try {
      spotCheckTargets = await db.all(spotCheckSql);
    } catch (error) {
      spotCheckTargets = [];
    }

    report.spotCheckTargets = spotCheckTargets;

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Ops report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/reports/production
 * Chef/Production Report
 * - Make list for today (recipes linked)
 * - Ingredient pulls with FIFO layer references
 */
router.get('/production', authenticateToken, requireOwner, async (req, res) => {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      reportType: 'production'
    };

    // Make list for today (forecasted demand)
    const makeListSql = `
      SELECT
        item_code,
        predicted_quantity as quantity_needed,
        unit,
        confidence_score,
        source
      FROM forecast_results
      WHERE prediction_date = date('now')
        AND source IN ('menu', 'breakfast', 'beverage')
      ORDER BY source, item_code
    `;

    let makeList = [];
    try {
      makeList = await db.all(makeListSql);
    } catch (error) {
      makeList = [];
    }

    report.makeList = makeList;

    // Ingredient pulls with FIFO (oldest first)
    const fifoSql = `
      SELECT
        item_code,
        item_name,
        current_quantity,
        unit,
        storage_location,
        fifo_layer,
        received_date,
        expiry_date
      FROM inventory_items
      WHERE current_quantity > 0
      ORDER BY received_date ASC NULLS LAST, item_code
      LIMIT 100
    `;

    let fifoIngredients = [];
    try {
      fifoIngredients = await db.all(fifoSql);
    } catch (error) {
      fifoIngredients = [];
    }

    report.fifoIngredients = fifoIngredients;

    // Group by item_code for easier kitchen workflow
    const groupedIngredients = {};
    fifoIngredients.forEach(item => {
      if (!groupedIngredients[item.item_code]) {
        groupedIngredients[item.item_code] = {
          item_code: item.item_code,
          item_name: item.item_name,
          unit: item.unit,
          layers: []
        };
      }
      groupedIngredients[item.item_code].layers.push({
        location: item.storage_location,
        quantity: item.current_quantity,
        received_date: item.received_date,
        expiry_date: item.expiry_date,
        fifo_layer: item.fifo_layer
      });
    });

    report.ingredientsByFIFO = Object.values(groupedIngredients);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Production report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/reports/purchasing
 * Purchasing Report
 * - PDF invoice summary
 * - Deltas vs forecast (over/under ordering)
 * - Reorder recommendations
 */
router.get('/purchasing', authenticateToken, requireOwner, async (req, res) => {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      reportType: 'purchasing'
    };

    // PDF invoice summary (last 30 days)
    const pdfSummarySql = `
      SELECT
        COUNT(*) as total_invoices,
        SUM(total_value) as total_value,
        SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) as processed_count,
        SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) as unprocessed_count,
        AVG(total_value) as avg_invoice_value
      FROM documents
      WHERE type = 'invoice'
        AND created_at >= datetime('now', '-30 days')
    `;

    let pdfSummary = {
      total_invoices: 0,
      total_value: 0,
      processed_count: 0,
      unprocessed_count: 0,
      avg_invoice_value: 0
    };
    try {
      pdfSummary = await db.get(pdfSummarySql) || pdfSummary;
    } catch (error) {
      // Use defaults
    }

    report.pdfSummary = pdfSummary;

    // Recent invoices (last 10)
    const recentInvoicesSql = `
      SELECT
        id,
        filename,
        invoice_number,
        invoice_date,
        total_value,
        processed,
        created_at
      FROM documents
      WHERE type = 'invoice'
      ORDER BY invoice_date DESC NULLS LAST, created_at DESC
      LIMIT 10
    `;

    let recentInvoices = [];
    try {
      recentInvoices = await db.all(recentInvoicesSql);
    } catch (error) {
      recentInvoices = [];
    }

    report.recentInvoices = recentInvoices;

    // Deltas vs forecast (items over/under ordered)
    const deltasSql = `
      SELECT
        ii.item_code,
        ii.item_name,
        ii.current_quantity as actual_qty,
        COALESCE(fr.predicted_quantity, 0) as forecast_qty,
        (ii.current_quantity - COALESCE(fr.predicted_quantity, 0)) as delta,
        ii.unit
      FROM inventory_items ii
      LEFT JOIN forecast_results fr ON ii.item_code = fr.item_code
        AND fr.prediction_date = date('now')
      WHERE ii.current_quantity > 0
      ORDER BY ABS(ii.current_quantity - COALESCE(fr.predicted_quantity, 0)) DESC
      LIMIT 30
    `;

    let deltas = [];
    try {
      deltas = await db.all(deltasSql);
    } catch (error) {
      deltas = [];
    }

    report.deltas = deltas;

    // Reorder recommendations (from AI)
    const reorderSql = `
      SELECT
        item_code,
        recommended_quantity,
        unit,
        priority,
        reason,
        created_at
      FROM ai_reorder_recommendations
      WHERE created_at >= datetime('now', '-7 days')
        AND priority IN ('HIGH', 'CRITICAL')
      ORDER BY
        CASE priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 20
    `;

    let reorderRecs = [];
    try {
      reorderRecs = await db.all(reorderSql);
    } catch (error) {
      reorderRecs = [];
    }

    report.reorderRecommendations = reorderRecs;

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Purchasing report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/owner/reports/finance
 * Finance Report
 * - Month-end summary
 * - Counts closed (this month)
 * - PDFs included in counts
 * - Variance markers (budget vs actual)
 */
router.get('/finance', authenticateToken, requireOwner, async (req, res) => {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      reportType: 'finance',
      period: {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      }
    };

    // Counts closed this month
    const countsThisMonthSql = `
      SELECT
        COUNT(*) as total_counts,
        SUM(item_count) as total_items_counted,
        AVG(item_count) as avg_items_per_count
      FROM inventory_counts
      WHERE status = 'closed'
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `;

    let countsThisMonth = { total_counts: 0, total_items_counted: 0, avg_items_per_count: 0 };
    try {
      countsThisMonth = await db.get(countsThisMonthSql) || countsThisMonth;
    } catch (error) {
      // Use defaults
    }

    report.countsThisMonth = countsThisMonth;

    // PDFs included in counts (this month)
    const pdfsInCountsSql = `
      SELECT
        COUNT(DISTINCT cp.document_id) as pdfs_included,
        COUNT(DISTINCT cp.count_id) as counts_with_pdfs,
        SUM(d.total_value) as total_invoice_value
      FROM count_pdfs cp
      JOIN documents d ON cp.document_id = d.id
      JOIN inventory_counts ic ON cp.count_id = ic.id
      WHERE strftime('%Y-%m', ic.created_at) = strftime('%Y-%m', 'now')
    `;

    let pdfsInCounts = { pdfs_included: 0, counts_with_pdfs: 0, total_invoice_value: 0 };
    try {
      pdfsInCounts = await db.get(pdfsInCountsSql) || pdfsInCounts;
    } catch (error) {
      // Use defaults
    }

    report.pdfsInCounts = pdfsInCounts;

    // Current inventory value
    const inventoryValueSql = `
      SELECT
        SUM(current_quantity * unit_cost) as total_inventory_value,
        COUNT(DISTINCT item_code) as unique_items
      FROM inventory_items
      WHERE current_quantity > 0
    `;

    let inventoryValue = { total_inventory_value: 0, unique_items: 0 };
    try {
      inventoryValue = await db.get(inventoryValueSql) || inventoryValue;
    } catch (error) {
      // Use defaults
    }

    report.currentInventoryValue = inventoryValue;

    // Variance markers (compare this month vs last month)
    const varianceSql = `
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count_frequency,
        SUM(item_count) as items_counted
      FROM inventory_counts
      WHERE status = 'closed'
        AND created_at >= datetime('now', '-2 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `;

    let variance = [];
    try {
      variance = await db.all(varianceSql);
    } catch (error) {
      variance = [];
    }

    if (variance.length >= 2) {
      const thisMonth = variance[0];
      const lastMonth = variance[1];
      report.varianceIndicators = {
        countFrequencyChange: thisMonth.count_frequency - lastMonth.count_frequency,
        itemsCountedChange: thisMonth.items_counted - lastMonth.items_counted,
        percentChange: ((thisMonth.count_frequency - lastMonth.count_frequency) / lastMonth.count_frequency * 100).toFixed(2)
      };
    } else {
      report.varianceIndicators = {
        countFrequencyChange: 0,
        itemsCountedChange: 0,
        percentChange: '0.00',
        note: 'Insufficient data for comparison'
      };
    }

    // Recent closed counts (this month)
    const recentClosedSql = `
      SELECT
        id,
        count_id,
        created_at,
        closed_at,
        item_count,
        owner_id,
        notes
      FROM inventory_counts
      WHERE status = 'closed'
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      ORDER BY closed_at DESC
      LIMIT 10
    `;

    let recentClosed = [];
    try {
      recentClosed = await db.all(recentClosedSql);
    } catch (error) {
      recentClosed = [];
    }

    report.recentClosedCounts = recentClosed;

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Finance report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
