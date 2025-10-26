/**
 * finance-enforcement.js (v16.2.0)
 *
 * RESTful API routes for Finance Enforcement
 *
 * Endpoints:
 *   === Mapping Rules ===
 *   GET    /api/finance/enforcement/rules           - Search mapping rules
 *   POST   /api/finance/enforcement/rules           - Create mapping rule
 *   PUT    /api/finance/enforcement/rules/:id       - Update mapping rule
 *   DELETE /api/finance/enforcement/rules/:id       - Deactivate mapping rule
 *
 *   === Invoice Import & Validation ===
 *   POST   /api/finance/enforcement/import          - Import invoice with enforcement
 *   GET    /api/finance/enforcement/validation/:id  - Get validation result
 *   GET    /api/finance/enforcement/needs-attention - Get invoices needing attention
 *
 *   === Mapping Queue ===
 *   GET    /api/finance/enforcement/needs-mapping   - Get needs mapping queue
 *   POST   /api/finance/enforcement/manual-assign   - Manually assign finance code
 *
 *   === Period Operations ===
 *   POST   /api/finance/enforcement/period/summary  - Generate period summary
 *   POST   /api/finance/enforcement/period/verify   - Verify and lock period
 *   GET    /api/finance/enforcement/period/verified/:period - Get verified totals
 *   GET    /api/finance/enforcement/period/list     - List all verified periods
 *
 *   === Bulk Operations ===
 *   POST   /api/finance/enforcement/bulk/remap      - Bulk remap invoices
 *
 *   === Dashboard & Reports ===
 *   GET    /api/finance/enforcement/dashboard       - Get dashboard statistics
 *   GET    /api/finance/enforcement/top-categories  - Get top finance categories
 *   GET    /api/finance/enforcement/report          - Generate finance report
 *
 * RBAC:
 *   - OWNER: Full access
 *   - FINANCE: Read + Write (no period lock)
 *   - OPS: Read only
 *   - READONLY: No access
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');
const { requireRole } = require('../security/rbac');
const ItemBankService = require('../src/finance/ItemBankService');
const FinanceMappingService = require('../src/finance/FinanceMappingService');
const GFSInvoiceParserV2 = require('../src/finance/GFSInvoiceParserV2');
const InvoiceImportAdapter = require('../src/finance/InvoiceImportAdapter');
const FinanceEnforcementService = require('../src/finance/FinanceEnforcementService');
const metricsExporter = require('../utils/metricsExporter');

// Initialize services
const itemBankService = new ItemBankService(db);
const mappingService = new FinanceMappingService(db, itemBankService);
const gfsParser = new GFSInvoiceParserV2();
const importAdapter = new InvoiceImportAdapter(db, gfsParser, mappingService);
const enforcementService = new FinanceEnforcementService(db, itemBankService, mappingService, importAdapter);

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/invoice-uploads',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ============================================================================
// Mapping Rules
// ============================================================================

/**
 * GET /api/finance/enforcement/rules
 * Search mapping rules
 */
router.get('/rules', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const {
      match_type,
      finance_code,
      source,
      active = 1,
      limit = 100,
      offset = 0
    } = req.query;

    const result = await mappingService.searchMappingRules({
      match_type,
      finance_code,
      source,
      active: active !== undefined ? parseInt(active) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Mapping rules search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/enforcement/rules
 * Create mapping rule
 */
router.post('/rules', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const rule = await mappingService.createMappingRule({
      ...req.body,
      created_by: req.user?.username || 'system'
    });

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    console.error('Mapping rule create error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/finance/enforcement/rules/:id
 * Update mapping rule
 */
router.put('/rules/:id', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const rule = await mappingService.updateMappingRule(req.params.id, req.body);

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    console.error('Mapping rule update error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/finance/enforcement/rules/:id
 * Deactivate mapping rule
 */
router.delete('/rules/:id', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const rule = await mappingService.deactivateMappingRule(req.params.id);

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    console.error('Mapping rule deactivate error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Invoice Import & Validation
// ============================================================================

/**
 * POST /api/finance/enforcement/import
 * Import invoice with finance enforcement
 */
router.post('/import', requireRole(['OWNER', 'FINANCE']), upload.single('invoice_pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const result = await importAdapter.importInvoice(req.file.path, {
      actor: req.user?.username || 'system',
      skipValidation: req.body.skip_validation === 'true'
    });

    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});

    // Update metrics
    if (result.validation) {
      metricsExporter.recordFinanceNeedsMappingTotal(result.low_confidence_lines);
      if (result.validation.balance_status !== 'BALANCED') {
        metricsExporter.recordInvoiceImbalanceTotal(1);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Invoice import error:', error);

    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/validation/:id
 * Get validation result for invoice
 */
router.get('/validation/:id', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const result = await importAdapter.getValidationResult(req.params.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Validation result not found'
      });
    }

    res.json({
      success: true,
      validation: result
    });
  } catch (error) {
    console.error('Get validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/needs-attention
 * Get invoices needing attention
 */
router.get('/needs-attention', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const invoices = await importAdapter.getInvoicesNeedingAttention(limit);

    res.json({
      success: true,
      invoices
    });
  } catch (error) {
    console.error('Get needs attention error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Mapping Queue
// ============================================================================

/**
 * GET /api/finance/enforcement/needs-mapping
 * Get needs mapping queue
 */
router.get('/needs-mapping', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const result = await mappingService.getNeedsMappingQueue(limit, offset);

    // Update metrics
    metricsExporter.recordFinanceNeedsMappingTotal(result.total);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get needs mapping error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/enforcement/manual-assign
 * Manually assign finance code to a line
 */
router.post('/manual-assign', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { line_data, finance_code } = req.body;

    if (!line_data || !finance_code) {
      return res.status(400).json({
        success: false,
        error: 'Missing line_data or finance_code'
      });
    }

    const result = await mappingService.manualAssign(
      line_data,
      finance_code,
      req.user?.username || 'system'
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Manual assign error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Period Operations
// ============================================================================

/**
 * POST /api/finance/enforcement/period/summary
 * Generate period summary
 */
router.post('/period/summary', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { period, start_date, end_date } = req.body;

    if (!period || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: period, start_date, end_date'
      });
    }

    const result = await enforcementService.generatePeriodSummary(period, start_date, end_date);

    res.json(result);
  } catch (error) {
    console.error('Generate period summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/finance/enforcement/period/verify
 * Verify and lock period totals (OWNER only)
 */
router.post('/period/verify', requireRole(['OWNER']), async (req, res) => {
  try {
    const { period, start_date, end_date } = req.body;

    if (!period || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: period, start_date, end_date'
      });
    }

    const result = await enforcementService.verifyAndLockPeriod(
      period,
      start_date,
      end_date,
      req.user?.username || 'system'
    );

    // Update metrics
    if (result.success) {
      metricsExporter.recordFinancePeriodVerifiedTotal(period, 1);
    }

    res.json(result);
  } catch (error) {
    console.error('Verify period error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/period/verified/:period
 * Get verified period totals
 */
router.get('/period/verified/:period', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const result = await enforcementService.getVerifiedPeriodTotals(req.params.period);

    res.json(result);
  } catch (error) {
    console.error('Get verified period error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/period/list
 * List all verified periods
 */
router.get('/period/list', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const result = await enforcementService.listVerifiedPeriods();

    res.json(result);
  } catch (error) {
    console.error('List verified periods error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * POST /api/finance/enforcement/bulk/remap
 * Bulk remap invoices (OWNER only)
 */
router.post('/bulk/remap', requireRole(['OWNER']), async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: start_date, end_date'
      });
    }

    const result = await enforcementService.bulkRemapInvoices(
      start_date,
      end_date,
      req.user?.username || 'system'
    );

    res.json(result);
  } catch (error) {
    console.error('Bulk remap error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Dashboard & Reports
// ============================================================================

/**
 * GET /api/finance/enforcement/dashboard
 * Get dashboard statistics
 */
router.get('/dashboard', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const stats = await enforcementService.getDashboardStats();

    // Update metrics
    metricsExporter.recordItemBankActiveTotal(stats.item_bank.total_active);
    metricsExporter.recordFinanceNeedsMappingTotal(stats.needs_mapping_count);

    res.json(stats);
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/top-categories
 * Get top finance categories by spend
 */
router.get('/top-categories', requireRole(['OWNER', 'FINANCE', 'OPS']), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await enforcementService.getTopFinanceCategories(days);

    res.json(result);
  } catch (error) {
    console.error('Get top categories error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/finance/enforcement/report
 * Generate finance report
 */
router.get('/report', requireRole(['OWNER', 'FINANCE']), async (req, res) => {
  try {
    const { start_date, end_date, group_by, include_low_confidence } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: start_date, end_date'
      });
    }

    const result = await enforcementService.generateFinanceReport(start_date, end_date, {
      groupBy: group_by || 'finance_code',
      includeLowConfidence: include_low_confidence === 'true'
    });

    res.json(result);
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
