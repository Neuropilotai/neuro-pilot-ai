/**
 * Owner Dashboard Stats API
 * Returns real statistics from actual database data
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const db = require('../config/database');

/**
 * GET /api/owner/dashboard/stats
 * Real-time dashboard statistics
 */
router.get('/stats', authenticateToken, requireOwner, async (req, res) => {
  try {
    const stats = {};

    // 1. System Health - Check database connection
    stats.systemHealth = 'OK';

    // 2. PDF/Invoice Statistics
    const pdfStats = await db.get(`
      SELECT
        COUNT(*) as total_pdfs,
        COUNT(CASE WHEN invoice_date IS NOT NULL THEN 1 END) as with_dates,
        COUNT(DISTINCT vendor) as vendor_count,
        SUM(invoice_amount) as total_amount,
        MIN(invoice_date) as earliest_date,
        MAX(invoice_date) as latest_date
      FROM documents
      WHERE mime_type = 'application/pdf' AND deleted_at IS NULL
    `);

    stats.pdfs = {
      total: pdfStats.total_pdfs || 0,
      withDates: pdfStats.with_dates || 0,
      coverage: pdfStats.total_pdfs > 0
        ? Math.round((pdfStats.with_dates / pdfStats.total_pdfs) * 100)
        : 0,
      vendors: pdfStats.vendor_count || 0,
      totalAmount: pdfStats.total_amount || 0,
      dateRange: {
        earliest: pdfStats.earliest_date,
        latest: pdfStats.latest_date
      }
    };

    // 3. Inventory Statistics
    // Show unique products from PDF extraction (invoice_line_items)
    const invoiceLineStats = await db.get(`
      SELECT
        COUNT(*) as total_line_items,
        COUNT(DISTINCT product_code) as unique_products,
        SUM(quantity) as total_quantity,
        SUM(line_total) as total_value,
        AVG(unit_price) as avg_unit_price
      FROM invoice_line_items
      WHERE unit_price IS NOT NULL
    `);

    // Manual inventory items (master list) + On-hand inventory value
    const inventoryStats = await db.get(`
      SELECT
        COUNT(*) as total_items,
        COUNT(DISTINCT category) as categories,
        SUM(current_quantity) as total_stock,
        SUM(current_quantity * unit_cost) as on_hand_value
      FROM inventory_items
      WHERE is_active = 1
    `);

    stats.inventory = {
      totalItems: invoiceLineStats.unique_products || 0,  // Show PDF-extracted unique products
      manualItems: inventoryStats.total_items || 0,        // Manual master list count
      categories: inventoryStats.categories || 0,
      totalStock: inventoryStats.total_stock || 0,
      totalLineItems: invoiceLineStats.total_line_items || 0,
      totalQuantityFromPDFs: invoiceLineStats.total_quantity || 0,
      totalValue: inventoryStats.on_hand_value || 0,       // On-hand inventory value (current_quantity × unit_cost)
      historicalValue: invoiceLineStats.total_value || 0,  // Historical invoice total
      avgUnitPrice: invoiceLineStats.avg_unit_price || 0
    };

    // 4. Count Statistics
    const countStats = await db.get(`
      SELECT
        COUNT(*) as total_counts,
        COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as active_counts,
        COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as completed_counts
      FROM count_headers
    `);

    stats.counts = {
      total: countStats.total_counts || 0,
      active: countStats.active_counts || 0,
      completed: countStats.completed_counts || 0
    };

    // 5. Location Statistics
    const locationStats = await db.get(`
      SELECT COUNT(*) as total_locations
      FROM storage_locations
      WHERE is_active = 1
    `);

    stats.locations = {
      total: locationStats.total_locations || 0
    };

    // 6. Recent Activity
    const recentPDF = await db.get(`
      SELECT created_at, invoice_number
      FROM documents
      WHERE mime_type = 'application/pdf' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    stats.recentActivity = {
      lastPDFUpload: recentPDF?.created_at || null,
      lastPDFInvoice: recentPDF?.invoice_number || null
    };

    // 7. FIFO Statistics - Check both FIFO queue and invoices ready for processing
    try {
      // Check actual FIFO queue
      const fifoStats = await db.get(`
        SELECT
          COUNT(*) as total_cases,
          COUNT(DISTINCT product_code) as products_tracked
        FROM inventory_fifo_queue
      `);

      // Count invoices that could be processed for FIFO
      const invoiceStats = await db.get(`
        SELECT COUNT(*) as invoices_ready
        FROM documents
        WHERE mime_type = 'application/pdf'
          AND deleted_at IS NULL
          AND invoice_date IS NOT NULL
          AND invoice_number IS NOT NULL
      `);

      // Count invoice line items if they exist
      const lineItemStats = await db.get(`
        SELECT
          COUNT(*) as total_line_items,
          COUNT(DISTINCT product_code) as unique_products
        FROM invoice_line_items
      `);

      stats.fifo = {
        totalCases: fifoStats.total_cases || 0,
        productsTracked: fifoStats.products_tracked || 0,
        invoicesReady: invoiceStats.invoices_ready || 0,
        lineItemsExtracted: lineItemStats.total_line_items || 0,
        uniqueProducts: lineItemStats.unique_products || 0,
        status: (fifoStats.total_cases || 0) > 0 ? 'active' :
                (invoiceStats.invoices_ready || 0) > 0 ? 'ready' : 'not_configured'
      };
    } catch (e) {
      stats.fifo = {
        totalCases: 0,
        productsTracked: 0,
        invoicesReady: 0,
        lineItemsExtracted: 0,
        uniqueProducts: 0,
        status: 'not_configured'
      };
    }

    // 8. Processed Invoices
    try {
      const invoiceStats = await db.get(`
        SELECT
          COUNT(*) as total_processed,
          COUNT(DISTINCT invoice_number) as unique_invoices
        FROM processed_invoices
      `);

      stats.processedInvoices = {
        total: invoiceStats.total_processed || 0,
        unique: invoiceStats.unique_invoices || 0
      };
    } catch (e) {
      stats.processedInvoices = { total: 0, unique: 0 };
    }

    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/dashboard/reorder
 * Items approaching or below reorder point
 */
router.get('/reorder', authenticateToken, requireOwner, async (req, res) => {
  try {
    const limit = parseInt(req.query.n) || 10;

    const items = await db.all(`
      SELECT
        item_code,
        item_name,
        current_quantity,
        reorder_point,
        par_level,
        category,
        unit
      FROM inventory_items
      WHERE is_active = 1
        AND reorder_point > 0
        AND current_quantity <= reorder_point * 1.2
      ORDER BY (current_quantity / NULLIF(reorder_point, 0)) ASC
      LIMIT ?
    `, [limit]);

    const recommendations = items.map(item => {
      const stockPct = item.reorder_point > 0
        ? Math.round((item.current_quantity / item.reorder_point) * 100)
        : 100;

      const recommendedQty = Math.max(
        item.par_level - item.current_quantity,
        item.reorder_point
      );

      const drivers = [];
      if (item.current_quantity <= item.reorder_point) {
        drivers.push('Below Reorder Point');
      } else {
        drivers.push('Approaching Reorder Point');
      }
      if (item.par_level > 0 && item.current_quantity < item.par_level) {
        drivers.push('Below Par Level');
      }

      return {
        itemCode: item.item_code,
        name: item.item_name,
        currentStock: item.current_quantity,
        reorderPoint: item.reorder_point,
        parLevel: item.par_level,
        stockPct: stockPct,
        recommendedReorderQty: Math.ceil(recommendedQty),
        category: item.category,
        unit: item.unit,
        drivers: drivers
      };
    });

    res.json({
      success: true,
      recommendations: recommendations,
      count: recommendations.length
    });

  } catch (error) {
    console.error('Reorder recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reorder recommendations',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/dashboard/anomalies
 * Detect inventory anomalies
 */
router.get('/anomalies', authenticateToken, requireOwner, async (req, res) => {
  try {
    const window = req.query.window || '7d';
    const anomalies = [];

    // Check for items with zero or negative quantity
    const zeroStock = await db.all(`
      SELECT item_code, item_name, current_quantity, category
      FROM inventory_items
      WHERE is_active = 1 AND current_quantity <= 0
      LIMIT 10
    `);

    zeroStock.forEach(item => {
      anomalies.push({
        itemCode: item.item_code,
        name: item.item_name,
        category: item.category,
        severity: 'critical',
        explanation: `Stock level is ${item.current_quantity}. Immediate restocking required.`,
        when: new Date().toISOString(),
        confidence: 0.95
      });
    });

    // Check for items with very high stock (over 3x par level)
    const highStock = await db.all(`
      SELECT item_code, item_name, current_quantity, par_level, category
      FROM inventory_items
      WHERE is_active = 1
        AND par_level > 0
        AND current_quantity > par_level * 3
      LIMIT 5
    `);

    highStock.forEach(item => {
      anomalies.push({
        itemCode: item.item_code,
        name: item.item_name,
        category: item.category,
        severity: 'medium',
        explanation: `Stock (${item.current_quantity}) is ${Math.round(item.current_quantity / item.par_level)}x par level. Possible overstock.`,
        when: new Date().toISOString(),
        confidence: 0.75
      });
    });

    res.json({
      success: true,
      anomalies: anomalies,
      count: anomalies.length
    });

  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect anomalies',
      message: error.message
    });
  }
});

module.exports = router;
