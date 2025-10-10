/**
 * ENTERPRISE INVENTORY MANAGEMENT API
 * RESTful API endpoints for Phase 1 implementation
 */

const express = require('express');
const router = express.Router();
const EnterpriseInventoryManager = require('../enterprise_inventory_manager');

// Initialize manager
const manager = new EnterpriseInventoryManager();
manager.initialize().catch(console.error);

// ============================================================================
// PENDING PLACEMENTS
// ============================================================================

/**
 * GET /api/enterprise-inventory/pending-placements
 * Get all items pending location assignment
 */
router.get('/pending-placements', async (req, res) => {
  try {
    const items = await manager.getPendingPlacements();
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/pending-placements/by-invoice/:invoiceNumber
 * Get pending items for a specific invoice
 */
router.get('/pending-placements/by-invoice/:invoiceNumber', async (req, res) => {
  try {
    const items = await manager.getPendingPlacements();
    const filtered = items.filter(i => i.invoice_number === req.params.invoiceNumber);
    res.json({
      success: true,
      invoice_number: req.params.invoiceNumber,
      count: filtered.length,
      items: filtered
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// LOCATION ASSIGNMENTS
// ============================================================================

/**
 * POST /api/enterprise-inventory/assign-location
 * Assign location to a single item
 * Body: { invoiceNumber, itemCode, locationId, assignedBy, notes }
 */
router.post('/assign-location', async (req, res) => {
  try {
    const { invoiceNumber, itemCode, locationId, assignedBy, notes } = req.body;

    if (!invoiceNumber || !itemCode || !locationId || !assignedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: invoiceNumber, itemCode, locationId, assignedBy'
      });
    }

    const result = await manager.assignLocation(
      invoiceNumber,
      itemCode,
      locationId,
      assignedBy,
      notes || ''
    );

    res.json({
      success: true,
      message: 'Location assigned successfully',
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/bulk-assign-location
 * Assign location to all items in an invoice
 * Body: { invoiceNumber, locationId, assignedBy, notes }
 */
router.post('/bulk-assign-location', async (req, res) => {
  try {
    const { invoiceNumber, locationId, assignedBy, notes } = req.body;

    if (!invoiceNumber || !locationId || !assignedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: invoiceNumber, locationId, assignedBy'
      });
    }

    const result = await manager.bulkAssignLocation(
      invoiceNumber,
      locationId,
      assignedBy,
      notes || ''
    );

    res.json({
      success: true,
      message: `Assigned ${result.itemsAssigned} items to location`,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PHYSICAL COUNTS
// ============================================================================

/**
 * POST /api/enterprise-inventory/counts/create
 * Create a new physical count
 * Body: { cutOffDate, performedBy, notes }
 */
router.post('/counts/create', async (req, res) => {
  try {
    const { cutOffDate, performedBy, notes } = req.body;

    if (!cutOffDate || !performedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cutOffDate, performedBy'
      });
    }

    const result = await manager.createPhysicalCount(cutOffDate, performedBy, notes || '');

    res.json({
      success: true,
      message: 'Physical count created',
      count: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/counts/:countId/items-to-count
 * Get items to count for a specific count (based on cut-off date)
 */
router.get('/counts/:countId/items-to-count', async (req, res) => {
  try {
    const { countId } = req.params;
    const { locationId } = req.query;

    // Get cut-off date for this count
    const countInfo = await new Promise((resolve, reject) => {
      manager.db.get(
        'SELECT cut_off_date FROM inventory_counts WHERE count_id = ?',
        [countId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!countInfo) {
      return res.status(404).json({ success: false, error: 'Count not found' });
    }

    const items = await manager.getItemsToCount(countInfo.cut_off_date, locationId || null);

    res.json({
      success: true,
      countId: parseInt(countId),
      cutOffDate: countInfo.cut_off_date,
      locationId: locationId || 'ALL',
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/counts/:countId/record-count
 * Record physical count for an item
 * Body: { itemCode, locationId, countedQuantity, countedBy, notes }
 */
router.post('/counts/:countId/record-count', async (req, res) => {
  try {
    const { countId } = req.params;
    const { itemCode, locationId, countedQuantity, countedBy, notes } = req.body;

    if (!itemCode || !locationId || countedQuantity === undefined || !countedBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: itemCode, locationId, countedQuantity, countedBy'
      });
    }

    const result = await manager.recordCount(
      parseInt(countId),
      itemCode,
      locationId,
      parseFloat(countedQuantity),
      countedBy,
      notes || ''
    );

    res.json({
      success: true,
      message: 'Count recorded',
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/counts/:countId/complete
 * Complete a physical count
 */
router.post('/counts/:countId/complete', async (req, res) => {
  try {
    const { countId } = req.params;
    const result = await manager.completePhysicalCount(parseInt(countId));

    res.json({
      success: true,
      message: 'Physical count completed successfully',
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/counts/latest
 * Get latest count summary
 */
router.get('/counts/latest', async (req, res) => {
  try {
    const summary = await manager.getLatestCountSummary();

    if (!summary) {
      return res.json({
        success: true,
        message: 'No counts performed yet',
        summary: null
      });
    }

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// INVENTORY VIEWS
// ============================================================================

/**
 * GET /api/enterprise-inventory/current
 * Get current inventory (all PLACED and COUNTED items)
 */
router.get('/current', async (req, res) => {
  try {
    const { locationId } = req.query;
    const inventory = await manager.getCurrentInventory(locationId ? parseInt(locationId) : null);

    res.json({
      success: true,
      count: inventory.length,
      inventory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MIN/MAX MANAGEMENT
// ============================================================================

/**
 * POST /api/enterprise-inventory/min-max/calculate-all
 * Calculate min/max levels for all items (after first count)
 * Body: { weeks } (optional, default: 12)
 */
router.post('/min-max/calculate-all', async (req, res) => {
  try {
    const { weeks } = req.body;
    const results = await manager.calculateAllMinMax(weeks || 12);

    res.json({
      success: true,
      message: `Calculated min/max levels for ${results.length} items`,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/min-max/calculate/:itemCode
 * Calculate min/max for specific item
 * Body: { weeks } (optional, default: 12)
 */
router.post('/min-max/calculate/:itemCode', async (req, res) => {
  try {
    const { itemCode } = req.params;
    const { weeks } = req.body;
    const result = await manager.calculateMinMaxLevels(itemCode, weeks || 12);

    res.json({
      success: true,
      message: 'Min/max levels calculated',
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/reorder-alerts
 * Get items that need reordering (below min level)
 */
router.get('/reorder-alerts', async (req, res) => {
  try {
    const alerts = await manager.getReorderAlerts();

    res.json({
      success: true,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DATA IMPORT
// ============================================================================

/**
 * POST /api/enterprise-inventory/import-invoices
 * Import invoices from JSON files (with duplicate prevention)
 */
router.post('/import-invoices', async (req, res) => {
  try {
    const result = await manager.importInvoicesFromJSON();

    res.json({
      success: true,
      message: `Imported ${result.invoicesImported} invoices (${result.duplicatesSkipped} duplicates skipped)`,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DUPLICATE PREVENTION
// ============================================================================

/**
 * GET /api/enterprise-inventory/duplicates/stats
 * Get duplicate prevention statistics
 */
router.get('/duplicates/stats', async (req, res) => {
  try {
    const stats = await manager.getDuplicateStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/duplicates/scan
 * Scan directory for duplicates before processing
 * Body: { pdfDir } (optional)
 */
router.post('/duplicates/scan', async (req, res) => {
  try {
    const { pdfDir } = req.body;
    const results = await manager.scanForDuplicates(pdfDir || './data/invoices');

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ORDER PROCESSING & INVENTORY VALUE
// ============================================================================

/**
 * GET /api/enterprise-inventory/orders/stats
 * Get order processing statistics
 */
router.get('/orders/stats', async (req, res) => {
  try {
    const stats = await manager.getOrderProcessingStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/inventory-value
 * Get accurate inventory total value
 */
router.get('/inventory-value', async (req, res) => {
  try {
    const value = await manager.getInventoryTotalValue();

    res.json({
      success: true,
      inventoryValue: value
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/inventory-value/by-status
 * Get inventory value breakdown by status
 */
router.get('/inventory-value/by-status', async (req, res) => {
  try {
    const breakdown = await manager.getInventoryValueByStatus();

    res.json({
      success: true,
      breakdown
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

/**
 * POST /api/enterprise-inventory/categories/initialize
 * Initialize category system
 */
router.post('/categories/initialize', async (req, res) => {
  try {
    await manager.initializeCategories();

    res.json({
      success: true,
      message: 'Category system initialized with default categories'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/categories/load-accounting
 * Load accounting categories (with account codes)
 */
router.post('/categories/load-accounting', async (req, res) => {
  try {
    await manager.initializeCategories();
    await manager.loadAccountingCategories();

    res.json({
      success: true,
      message: 'Accounting categories loaded with GL account codes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/categories
 * Get all main categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await manager.getCategories();

    res.json({
      success: true,
      count: categories.length,
      categories
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/categories/:categoryId/subcategories
 * Get subcategories for a category
 */
router.get('/categories/:categoryId/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await manager.getSubcategories(parseInt(categoryId));

    res.json({
      success: true,
      categoryId: parseInt(categoryId),
      count: subcategories.length,
      subcategories
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/categories
 * Create new category
 * Body: { name, code, description, parentId, displayOrder }
 */
router.post('/categories', async (req, res) => {
  try {
    const { name, code, description, parentId, displayOrder } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, code'
      });
    }

    const result = await manager.createCategory(
      name,
      code,
      description || '',
      parentId || null,
      displayOrder || 0
    );

    res.json({
      success: true,
      message: 'Category created successfully',
      category: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/enterprise-inventory/categories/auto-categorize
 * Auto-categorize all items
 */
router.post('/categories/auto-categorize', async (req, res) => {
  try {
    const results = await manager.autoCategorizeAllItems();

    res.json({
      success: true,
      message: `Categorized ${results.categorized} items`,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/categories/inventory
 * Get inventory statistics by category
 */
router.get('/categories/inventory', async (req, res) => {
  try {
    const inventory = await manager.getCategoryInventory();

    res.json({
      success: true,
      categories: inventory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/categories/inventory/value
 * Get inventory value by category
 */
router.get('/categories/inventory/value', async (req, res) => {
  try {
    const valueByCategory = await manager.getInventoryValueByCategory();

    res.json({
      success: true,
      categories: valueByCategory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/enterprise-inventory/subcategories/inventory
 * Get inventory statistics by subcategory
 */
router.get('/subcategories/inventory', async (req, res) => {
  try {
    const inventory = await manager.getSubcategoryInventory();

    res.json({
      success: true,
      subcategories: inventory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * GET /api/enterprise-inventory/dashboard
 * Get comprehensive dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      pending,
      latestCount,
      reorderAlerts,
      currentInventory,
      duplicateStats,
      orderStats,
      inventoryValue,
      valueByStatus
    ] = await Promise.all([
      manager.getPendingPlacements(),
      manager.getLatestCountSummary(),
      manager.getReorderAlerts(),
      manager.getCurrentInventory(),
      manager.getDuplicateStats(),
      manager.getOrderProcessingStats(),
      manager.getInventoryTotalValue(),
      manager.getInventoryValueByStatus()
    ]);

    const stats = {
      // Order processing metrics
      orders: {
        total: orderStats.total_orders,
        processed: orderStats.processed_orders,
        pending: orderStats.pending_orders,
        earliestDate: orderStats.earliest_order_date,
        latestDate: orderStats.latest_order_date,
        totalItems: orderStats.total_line_items,
        processedItems: orderStats.processed_items,
        pendingItems: orderStats.pending_items
      },

      // Inventory value (100% accurate)
      inventoryValue: {
        total: inventoryValue.total_value,
        uniqueItems: inventoryValue.unique_items,
        totalLineItems: inventoryValue.total_line_items,
        totalQuantity: inventoryValue.total_quantity,
        byStatus: valueByStatus
      },

      // Legacy metrics (for compatibility)
      pendingPlacements: pending.length,
      totalInventoryItems: currentInventory.length,
      reorderAlertsCount: reorderAlerts.length,
      duplicatesBlocked: duplicateStats.total_attempts || 0,

      // Physical count info
      lastCount: latestCount ? {
        date: latestCount.count_date,
        cutOffDate: latestCount.cut_off_date,
        itemsCounted: latestCount.total_items_counted,
        status: latestCount.status
      } : null
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
