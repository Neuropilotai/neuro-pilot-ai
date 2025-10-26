/**
 * finance-item-bank.js (v16.2.0)
 *
 * RESTful API routes for Item Bank management
 *
 * Endpoints:
 *   GET    /api/finance/item-bank         - Search items
 *   GET    /api/finance/item-bank/:id     - Get item by GFS item number
 *   POST   /api/finance/item-bank         - Create new item
 *   PUT    /api/finance/item-bank/:id     - Update item
 *   DELETE /api/finance/item-bank/:id     - Retire item (soft delete)
 *   POST   /api/finance/item-bank/:id/activate - Activate retired item
 *   POST   /api/finance/item-bank/import-csv    - Import from CSV
 *   GET    /api/finance/item-bank/export-csv    - Export to CSV
 *   GET    /api/finance/item-bank/statistics    - Get statistics
 *   POST   /api/finance/item-bank/bulk-update   - Bulk update finance codes
 *
 * RBAC:
 *   - OWNER: Full access
 *   - FINANCE: Read + Write
 *   - OPS: Read only
 *   - READONLY: No access
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../security/rbac');
const ItemBankService = require('../src/finance/ItemBankService');
const metricsExporter = require('../utils/metricsExporter');

// Initialize service
const itemBankService = new ItemBankService(db);

/**
 * GET /api/finance/item-bank
 * Search items with filters
 */
router.get('/', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const {
      q,
      finance_code,
      status,
      taxable_gst,
      taxable_qst,
      limit = 100,
      offset = 0
    } = req.query;

    const result = await itemBankService.searchItems({
      q,
      finance_code,
      status,
      taxable_gst: taxable_gst !== undefined ? parseInt(taxable_gst) : undefined,
      taxable_qst: taxable_qst !== undefined ? parseInt(taxable_qst) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Update metrics
    metricsExporter.recordItemBankActiveTotal(result.items.filter(i => i.status === 'ACTIVE').length);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Item bank search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/item-bank/statistics
 * Get item bank statistics
 */
router.get('/statistics', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const stats = await itemBankService.getStatistics();

    // Update metrics
    metricsExporter.recordItemBankActiveTotal(stats.total_active);

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Item bank statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/item-bank/export-csv
 * Export items to CSV
 */
router.get('/export-csv', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { finance_code, status } = req.query;

    const csv = await itemBankService.exportToCSV({
      finance_code,
      status
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=item-bank-export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Item bank CSV export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/item-bank/:id
 * Get item by GFS item number
 */
router.get('/:id', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const item = await itemBankService.getItem(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Item bank get error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/item-bank
 * Create new item
 */
router.post('/', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const item = await itemBankService.createItem(req.body);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Item bank create error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/finance/item-bank/:id
 * Update existing item
 */
router.put('/:id', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const item = await itemBankService.updateItem(req.params.id, req.body);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Item bank update error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/finance/item-bank/:id
 * Retire item (soft delete)
 */
router.delete('/:id', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const item = await itemBankService.retireItem(req.params.id);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Item bank retire error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/item-bank/:id/activate
 * Activate retired item
 */
router.post('/:id/activate', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const item = await itemBankService.activateItem(req.params.id);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Item bank activate error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/item-bank/import-csv
 * Import items from CSV
 */
router.post('/import-csv', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { csv_data, upsert = true } = req.body;

    if (!csv_data) {
      return res.status(400).json({
        success: false,
        error: 'Missing csv_data in request body'
      });
    }

    const result = await itemBankService.importFromCSV(csv_data, {
      upsert,
      createdBy: req.user?.username || 'system'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Item bank CSV import error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/item-bank/bulk-update
 * Bulk update finance codes
 */
router.post('/bulk-update', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { gfs_item_nos, finance_code } = req.body;

    if (!gfs_item_nos || !Array.isArray(gfs_item_nos) || gfs_item_nos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid gfs_item_nos array'
      });
    }

    if (!finance_code) {
      return res.status(400).json({
        success: false,
        error: 'Missing finance_code'
      });
    }

    const result = await itemBankService.bulkUpdateFinanceCode(gfs_item_nos, finance_code);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Item bank bulk update error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
