/**
 * Inventory Reconciliation API Routes (v15.5.0)
 * PDF ingestion + physical inventory reconciliation + multi-user finance
 *
 * @version 15.5.0
 * @version 21.1.8 - Migrated to PostgreSQL (removed SQLite syntax)
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const PdfIngestService = require('../src/inventory/PdfIngestService');
const ReconcileService = require('../src/inventory/ReconcileService');
const { pool } = require('../db');

// v15.3: Financial metrics
const { incrementImportTotal } = require('../utils/financialMetrics');

// v15.5: RBAC, Audit, and PDF Import
const { requireRole, ROLES, scopeByTenantAndLocation, addScopeToData } = require('../security/rbac');
const { auditMiddleware } = require('../utils/audit');
const PDFImportService = require('../services/import/PDFImportService');
const rateLimit = require('express-rate-limit');

// Rate limiting (10 ops/min per IP)
const rateLimits = {};
const RATE_LIMIT_WINDOW = 60000; // 1 min
const RATE_LIMIT_MAX = 10;

// v15.5: Export rate limiter (5 exports per minute per user)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.EXPORT_RATE_LIMIT_PER_MIN) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.email || req.ip, // Rate limit by user email
  message: { success: false, error: 'Export rate limit exceeded. Please wait before trying again.' }
});

function checkRateLimit(ip) {
  const now = Date.now();

  if (!rateLimits[ip]) {
    rateLimits[ip] = { count: 1, window: now };
    return { allowed: true };
  }

  const entry = rateLimits[ip];

  if (now - entry.window > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.window = now;
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - entry.window)) / 1000);
    return { allowed: false, resetIn };
  }

  entry.count++;
  return { allowed: true };
}

// ============================================================================
// v15.5: Apply audit middleware to all routes
// ============================================================================

// Get database instance
const getDB = () => require('../config/database');

// Apply audit middleware (attaches req.audit() to all requests)
router.use((req, res, next) => {
  const db = getDB();
  const auditFn = auditMiddleware(db);
  auditFn(req, res, next);
});

// ============================================================================
// LEGACY ENDPOINTS (v15.2-v15.4)
// ============================================================================

/**
 * POST /api/inventory/pdfs/import
 * Import PDFs from date range
 */
router.post('/pdfs/import', async (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { from, to, locations } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        error: 'from and to dates (ISO format) are required'
      });
    }

    logger.info(`📥 PDF import request: ${from} → ${to} by ${req.user.email}`);

    const result = await PdfIngestService.importPdfs(
      from,
      to,
      locations || ['*'],
      req.user.email
    );

    res.json(result);

  } catch (error) {
    logger.error('POST /api/inventory/pdfs/import error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/pdfs
 * Get list of imported PDFs
 */
router.get('/pdfs', async (req, res) => {
  try {
    const { from, to, page, size } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        error: 'from and to query params (ISO date) are required'
      });
    }

    const result = await PdfIngestService.getPdfs(
      from,
      to,
      parseInt(page) || 1,
      parseInt(size) || 50
    );

    res.json(result);

  } catch (error) {
    logger.error('GET /api/inventory/pdfs error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * POST /api/inventory/reconcile
 * Run reconciliation (physical vs system stock)
 */
router.post('/reconcile', async (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { as_of, locations } = req.body;

    if (!as_of) {
      return res.status(400).json({
        ok: false,
        error: 'as_of date (ISO format) is required'
      });
    }

    logger.info(`🔄 Reconciliation request: as_of=${as_of} by ${req.user.email}`);

    const result = await ReconcileService.runReconciliation(
      as_of,
      locations || ['*'],
      req.user.email
    );

    res.json(result);

  } catch (error) {
    logger.error('POST /api/inventory/reconcile error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/reconcile/list
 * Get list of all reconciliation runs (v15.2.3)
 * v21.1: Updated to use PostgreSQL
 */
router.get('/reconcile/list', async (req, res) => {
  try {
    const { pool } = require('../db');
    const limit = parseInt(req.query.limit) || 20;

    logger.info(`📊 Fetching reconciliation list (limit=${limit})`);

    const result = await pool.query(`
      SELECT
        reconcile_id,
        as_of_date,
        status,
        total_items_checked,
        total_variance_qty,
        total_variance_value,
        over_items,
        short_items,
        started_at,
        completed_at,
        triggered_by
      FROM inventory_reconcile_runs
      WHERE status = 'completed'
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      ok: true,
      success: true,
      reports: (result.rows || []).map(run => ({
        reconcile_id: run.reconcile_id,
        as_of_date: run.as_of_date,
        status: run.status,
        created_at: run.started_at,
        completed_at: run.completed_at,
        summary: {
          items: run.total_items_checked || 0,
          variance_qty: run.total_variance_qty || 0,
          variance_value: run.total_variance_value || 0,
          over_items: run.over_items || 0,
          short_items: run.short_items || 0
        }
      }))
    });

  } catch (error) {
    logger.error('GET /api/inventory/reconcile/list error:', error);
    // Return empty array on error to prevent frontend breakage
    res.json({
      ok: true,
      success: true,
      reports: [],
      _error: error.message
    });
  }
});

// ============================================================================
// v15.3: Financial Accuracy & Contract Change Integration
// ============================================================================

/**
 * POST /api/inventory/reconcile/import-pdfs
 * v15.3: Import financial data from PDFs (Jan 1 - Jun 30, 2025)
 * Extracts: vendor, date, invoice#, category, amount, GST, QST
 */
router.post('/reconcile/import-pdfs', async (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'startDate and endDate (ISO format) are required'
      });
    }

    logger.info(`💰 Financial PDF import request: ${startDate} → ${endDate} by ${req.user?.email || 'unknown'}`);

    // v21.1.8: Use PostgreSQL pool instead of SQLite db
    // Query all documents (PDFs) in date range
    const pdfsResult = await pool.query(`
      SELECT
        document_id,
        filename,
        invoice_date,
        invoice_number,
        vendor,
        total_amount,
        created_at
      FROM documents
      WHERE invoice_date >= $1 AND invoice_date <= $2
        AND filename LIKE '%.pdf'
      ORDER BY invoice_date ASC
    `, [startDate, endDate]);

    const pdfs = pdfsResult.rows;

    if (pdfs.length === 0) {
      return res.json({
        ok: true,
        success: true,
        message: 'No PDFs found in date range',
        importedCount: 0,
        vendors: [],
        totalValue: 0
      });
    }

    // Extract financial data from invoice_line_items
    const financialData = [];
    let totalValue = 0;
    const vendors = new Set();

    for (const pdf of pdfs) {
      // Get line items for this invoice
      const lineItemsResult = await pool.query(`
        SELECT
          item_code,
          description,
          quantity_ordered,
          quantity_received,
          unit_price,
          extended_price,
          category
        FROM invoice_line_items
        WHERE invoice_id IN (
          SELECT invoice_id FROM invoices WHERE invoice_number = $1
        )
      `, [pdf.invoice_number]);

      const lineItems = lineItemsResult.rows;

      // Aggregate by category (BAKE, BEV+ECO, MEAT, PROD, CLEAN, PAPER, etc.)
      const categoryTotals = {};
      for (const item of lineItems) {
        const cat = item.category || 'OTHER';
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = 0;
        }
        categoryTotals[cat] += item.extended_price || 0;
      }

      // Calculate GST (5%) and QST (9.975%) on total
      const subtotal = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
      const gst = subtotal * 0.05;
      const qst = subtotal * 0.09975;
      const total = subtotal + gst + qst;

      financialData.push({
        vendor: pdf.vendor,
        date: pdf.invoice_date,
        invoiceNumber: pdf.invoice_number,
        categories: categoryTotals,
        subtotal,
        gst,
        qst,
        total
      });

      totalValue += total;
      vendors.add(pdf.vendor);
    }

    // Store in ai_reconcile_history for audit trail
    // v21.1.8: PostgreSQL syntax with $1-$9 placeholders and NOW()
    const importId = `FIN_${Date.now()}`;
    for (const data of financialData) {
      await pool.query(`
        INSERT INTO ai_reconcile_history (
          import_id,
          vendor,
          invoice_date,
          invoice_number,
          category_totals,
          subtotal,
          gst,
          qst,
          total_amount,
          created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, NOW())
        ON CONFLICT (invoice_number, invoice_date) DO NOTHING
      `, [
        importId,
        data.vendor,
        data.date,
        data.invoiceNumber,
        JSON.stringify(data.categories),
        data.subtotal,
        data.gst,
        data.qst,
        data.total
      ]);
    }

    logger.info(`✅ Financial import complete: ${financialData.length} invoices, $${totalValue.toFixed(2)}`);

    // v15.3: Increment Prometheus counter
    incrementImportTotal(financialData.length);

    res.json({
      ok: true,
      success: true,
      importedCount: financialData.length,
      vendors: Array.from(vendors),
      totalValue: parseFloat(totalValue.toFixed(2)),
      importId,
      dateRange: { start: startDate, end: endDate },
      financialData
    });

  } catch (error) {
    logger.error('POST /api/inventory/reconcile/import-pdfs error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/reconcile/financial-summary
 * v15.3: Get financial summary for a period (weekly or monthly)
 */
router.get('/reconcile/financial-summary', async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'startDate and endDate query params required'
      });
    }

    // v21.1.8: Use PostgreSQL pool
    // Get financial data from ai_reconcile_history
    const recordsResult = await pool.query(`
      SELECT
        vendor,
        invoice_date,
        invoice_number,
        category_totals,
        subtotal,
        gst,
        qst,
        total_amount,
        created_at
      FROM ai_reconcile_history
      WHERE invoice_date >= $1 AND invoice_date <= $2
      ORDER BY invoice_date ASC
    `, [startDate, endDate]);

    const records = recordsResult.rows;

    // Group by week or month based on period parameter
    const grouped = {};
    for (const rec of records) {
      const date = new Date(rec.invoice_date);
      let key;

      if (period === 'weekly') {
        // Get week ending date (Saturday)
        const dayOfWeek = date.getDay();
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
        const weekEnding = new Date(date);
        weekEnding.setDate(date.getDate() + daysUntilSaturday);
        key = weekEnding.toISOString().split('T')[0];
      } else {
        // Monthly
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          invoices: [],
          totalInvoiceAmount: 0,
          foodFreightReimb: 0,
          otherReimb: 0,
          gstTotal: 0,
          qstTotal: 0
        };
      }

      grouped[key].invoices.push({
        vendor: rec.vendor,
        date: rec.invoice_date,
        invoiceNumber: rec.invoice_number,
        categories: JSON.parse(rec.category_totals || '{}'),
        subtotal: rec.subtotal,
        gst: rec.gst,
        qst: rec.qst,
        total: rec.total_amount
      });

      grouped[key].totalInvoiceAmount += rec.total_amount;
      grouped[key].gstTotal += rec.gst;
      grouped[key].qstTotal += rec.qst;

      // Calculate reimbursable amounts (food + freight vs other)
      const categories = JSON.parse(rec.category_totals || '{}');
      const foodFreight = (categories.BAKE || 0) + (categories.BEV || 0) + (categories.MEAT || 0) +
                          (categories.PROD || 0) + (categories.FREIGHT || 0);
      const other = (categories.CLEAN || 0) + (categories.PAPER || 0) + (categories.OTHER || 0);

      grouped[key].foodFreightReimb += foodFreight;
      grouped[key].otherReimb += other;
    }

    res.json({
      ok: true,
      success: true,
      period: period || 'monthly',
      dateRange: { start: startDate, end: endDate },
      summary: Object.values(grouped).map(g => ({
        ...g,
        totalInvoiceAmount: parseFloat(g.totalInvoiceAmount.toFixed(2)),
        foodFreightReimb: parseFloat(g.foodFreightReimb.toFixed(2)),
        otherReimb: parseFloat(g.otherReimb.toFixed(2)),
        gstTotal: parseFloat(g.gstTotal.toFixed(2)),
        qstTotal: parseFloat(g.qstTotal.toFixed(2))
      }))
    });

  } catch (error) {
    logger.error('GET /api/inventory/reconcile/financial-summary error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============================================================================
// v15.4: FINANCE WORKSPACE EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/inventory/reconcile/export.csv
 * v15.4: Export financial data as CSV (RFC4180 UTF-8)
 * v15.5: RBAC gate (FINANCE/OWNER), rate limited (5/min)
 */
router.get('/reconcile/export.csv',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  exportLimiter,
  async (req, res) => {
  try {
    const { startDate, endDate, granularity } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'startDate and endDate query params required'
      });
    }

    // v21.1.8: Use PostgreSQL pool
    // Get financial data
    const recordsResult = await pool.query(`
      SELECT
        vendor,
        invoice_date,
        invoice_number,
        category_totals,
        subtotal,
        gst,
        qst,
        total_amount
      FROM ai_reconcile_history
      WHERE invoice_date >= $1 AND invoice_date <= $2
      ORDER BY invoice_date ASC
    `, [startDate, endDate]);

    const records = recordsResult.rows;

    // Build CSV
    const csvRows = [];

    // Header
    csvRows.push([
      'Vendor', 'Date', 'Invoice #',
      'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD',
      'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'Other',
      'Subtotal', 'GST (5%)', 'QST (9.975%)', 'Total',
      'Reimb. Food+Freight', 'Reimb. Other'
    ].join(','));

    // Data rows
    for (const rec of records) {
      const categories = JSON.parse(rec.category_totals || '{}');

      const bake = categories.BAKE || 0;
      const bev = (categories.BEV || 0) + (categories.ECO || 0);
      const milk = categories.MILK || 0;
      const groc = (categories.GROC || 0) + (categories.MISC || 0);
      const meat = categories.MEAT || 0;
      const prod = categories.PROD || 0;
      const clean = categories.CLEAN || 0;
      const paper = categories.PAPER || 0;
      const freight = categories.FREIGHT || 0;
      const linen = categories.LINEN || 0;
      const propane = categories.PROPANE || 0;
      const other = categories.OTHER || 0;

      const foodFreight = bake + bev + milk + groc + meat + prod + freight;
      const otherReimb = clean + paper + linen + propane + other;

      csvRows.push([
        `"${rec.vendor}"`,
        rec.invoice_date,
        `"${rec.invoice_number}"`,
        bake.toFixed(2),
        bev.toFixed(2),
        milk.toFixed(2),
        groc.toFixed(2),
        meat.toFixed(2),
        prod.toFixed(2),
        clean.toFixed(2),
        paper.toFixed(2),
        freight.toFixed(2),
        linen.toFixed(2),
        propane.toFixed(2),
        other.toFixed(2),
        rec.subtotal.toFixed(2),
        rec.gst.toFixed(2),
        rec.qst.toFixed(2),
        rec.total_amount.toFixed(2),
        foodFreight.toFixed(2),
        otherReimb.toFixed(2)
      ].join(','));
    }

    const csv = csvRows.join('\n');

    // Increment Prometheus counter
    const { incrementExportCsvTotal } = require('../utils/financialMetrics');
    incrementExportCsvTotal();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financial_export_${startDate}_${endDate}.csv"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM for Excel compatibility

  } catch (error) {
    logger.error('GET /api/inventory/reconcile/export.csv error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/reconcile/export.gl.csv
 * v15.4: Export GL-friendly CSV with account codes
 * v15.5: RBAC gate (FINANCE/OWNER), rate limited (5/min)
 * Maps categories to GL account codes for accounting systems
 */
router.get('/reconcile/export.gl.csv',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  exportLimiter,
  async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'startDate and endDate query params required'
      });
    }

    // GL account code mapping (from spec)
    const accountCodes = {
      'BAKE': '60110010',
      'BEV': '60110020',
      'ECO': '60110020',
      'MILK': '60110030',
      'GROC': '60110040',
      'MISC': '60110040',
      'MEAT': '60110060',
      'PROD': '60110070',
      'CLEAN': '60220001',
      'PAPER': '60260010',
      'Small Equip': '60665001',
      'FREIGHT': '62421100',
      'LINEN': '60240010',
      'PROPANE': '62869010',
      'OTHER': '60110040' // Default to GROC+MISC account
    };

    // v21.1.8: Use PostgreSQL pool
    // Get financial data
    const recordsResult = await pool.query(`
      SELECT
        vendor,
        invoice_date,
        invoice_number,
        category_totals,
        subtotal,
        gst,
        qst,
        total_amount
      FROM ai_reconcile_history
      WHERE invoice_date >= $1 AND invoice_date <= $2
      ORDER BY invoice_date ASC
    `, [startDate, endDate]);

    const records = recordsResult.rows;

    // Build GL CSV
    const csvRows = [];

    // Header
    csvRows.push([
      'Date', 'Vendor', 'Invoice #', 'Account Code',
      'Description', 'Amount', 'Tax Code', 'Reimbursable'
    ].join(','));

    // Data rows - one row per category + separate rows for GST/QST
    for (const rec of records) {
      const categories = JSON.parse(rec.category_totals || '{}');

      // Add category line items
      for (const [cat, amount] of Object.entries(categories)) {
        if (amount > 0) {
          const accountCode = accountCodes[cat] || accountCodes['OTHER'];
          const isReimbursable = ['BAKE', 'BEV', 'ECO', 'MILK', 'GROC', 'MISC', 'MEAT', 'PROD', 'FREIGHT'].includes(cat);

          csvRows.push([
            rec.invoice_date,
            `"${rec.vendor}"`,
            `"${rec.invoice_number}"`,
            accountCode,
            `"${cat}"`,
            amount.toFixed(2),
            '',
            isReimbursable ? 'Y' : 'N'
          ].join(','));
        }
      }

      // Add GST line
      if (rec.gst > 0) {
        csvRows.push([
          rec.invoice_date,
          `"${rec.vendor}"`,
          `"${rec.invoice_number}"`,
          '63107000', // GST account
          '"GST (5%)"',
          rec.gst.toFixed(2),
          'GST',
          'N'
        ].join(','));
      }

      // Add QST line
      if (rec.qst > 0) {
        csvRows.push([
          rec.invoice_date,
          `"${rec.vendor}"`,
          `"${rec.invoice_number}"`,
          '63107100', // QST account
          '"QST (9.975%)"',
          rec.qst.toFixed(2),
          'QST',
          'N'
        ].join(','));
      }
    }

    const csv = csvRows.join('\n');

    // Increment Prometheus counter
    const { incrementExportCsvTotal } = require('../utils/financialMetrics');
    incrementExportCsvTotal();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gl_export_${startDate}_${endDate}.csv"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM

  } catch (error) {
    logger.error('GET /api/inventory/reconcile/export.gl.csv error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/reconcile/export.pdf
 * v15.4: Export financial summary as bilingual PDF (EN/FR)
 * v15.5: RBAC gate (FINANCE/OWNER), rate limited (5/min)
 */
router.get('/reconcile/export.pdf',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  exportLimiter,
  async (req, res) => {
  try {
    const { startDate, endDate, granularity, lang } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'startDate and endDate query params required'
      });
    }

    const language = (lang || 'en').toLowerCase();

    // v21.1.8: Use PostgreSQL pool
    // Get summary data
    const recordsResult = await pool.query(`
      SELECT
        vendor,
        invoice_date,
        invoice_number,
        category_totals,
        subtotal,
        gst,
        qst,
        total_amount
      FROM ai_reconcile_history
      WHERE invoice_date >= $1 AND invoice_date <= $2
      ORDER BY invoice_date ASC
    `, [startDate, endDate]);

    const records = recordsResult.rows;

    // Compute summary KPIs
    let totalInvoices = records.length;
    let totalAmount = 0;
    let totalGst = 0;
    let totalQst = 0;
    let foodFreightReimb = 0;
    let otherReimb = 0;

    for (const rec of records) {
      totalAmount += rec.total_amount;
      totalGst += rec.gst;
      totalQst += rec.qst;

      const categories = JSON.parse(rec.category_totals || '{}');
      const ff = (categories.BAKE || 0) + (categories.BEV || 0) + (categories.MEAT || 0) +
                 (categories.PROD || 0) + (categories.FREIGHT || 0);
      const other = (categories.CLEAN || 0) + (categories.PAPER || 0) + (categories.OTHER || 0);

      foodFreightReimb += ff;
      otherReimb += other;
    }

    // Generate PDF using FinancialReport service
    const FinancialReport = require('../src/reports/FinancialReport');
    const pdfBuffer = await FinancialReport.generatePDF({
      summary: {
        totalInvoices,
        totalAmount,
        foodFreightReimb,
        otherReimb,
        totalGst,
        totalQst,
        dateRange: { start: startDate, end: endDate }
      },
      rows: records,
      lang: language
    });

    // Increment Prometheus counter
    const { incrementExportPdfTotal } = require('../utils/financialMetrics');
    incrementExportPdfTotal();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="financial_report_${language}_${startDate}_${endDate}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error('GET /api/inventory/reconcile/export.pdf error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============================================================================
// v15.5: NEW MULTI-USER FINANCE ENDPOINTS
// ============================================================================

/**
 * POST /api/inventory/reconcile/import-pdfs-v2
 * v15.5: Import financial PDFs with OCR, idempotency, line extraction, and mapping
 * Features:
 * - SHA256 idempotency (no duplicate imports)
 * - OCR text extraction with Tesseract
 * - Automatic line item parsing
 * - Vendor category mapping rules
 * - Comprehensive audit trail
 */
router.post('/reconcile/import-pdfs-v2',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    const rateLimitCheck = checkRateLimit(req.ip);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        resetIn: rateLimitCheck.resetIn
      });
    }

    try {
      const { directory, files, skipOCR } = req.body;

      if (!directory && !files) {
        return res.status(400).json({
          success: false,
          error: 'Either directory or files array is required'
        });
      }

      const db = getDB();
      const pdfImportService = new PDFImportService(db);

      // Add tenant/location context
      const options = {
        directory,
        files,
        tenant_id: req.user?.tenant_id || process.env.TENANT_DEFAULT || 'neuropilot',
        location_id: req.user?.location_id || null,
        created_by: req.user?.email || 'system',
        skipOCR: skipOCR === true
      };

      logger.info('v15.5 PDF import started', {
        user: options.created_by,
        tenant: options.tenant_id,
        directory,
        fileCount: files?.length || 'scanning'
      });

      const result = await pdfImportService.importDocuments(options);

      // Audit the import
      await req.audit({
        action: 'IMPORT',
        entity: 'documents',
        entity_id: result.import_id,
        after: {
          imported_count: result.summary.imported_count,
          total_value: result.summary.total_value,
          vendors: Array.from(result.summary.vendors)
        },
        success: true
      });

      // Increment Prometheus counter
      incrementImportTotal(result.summary.imported_count);

      logger.info('v15.5 PDF import completed', {
        import_id: result.import_id,
        imported: result.summary.imported_count,
        skipped: result.summary.skipped_count,
        errors: result.summary.error_count,
        total_value: result.summary.total_value
      });

      res.json({
        success: true,
        import_id: result.import_id,
        summary: result.summary,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors
      });

    } catch (error) {
      logger.error('POST /reconcile/import-pdfs-v2 error:', error);

      // Audit the failure
      await req.audit({
        action: 'IMPORT',
        entity: 'documents',
        entity_id: 'failed',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/inventory/reconcile/needs-mapping
 * v15.5: Get list of unmapped document line items requiring attention
 * Returns documents with line items that have mapping_status = 'unmapped'
 */
router.get('/reconcile/needs-mapping',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    try {
      const db = getDB();
      const limit = parseInt(req.query.limit) || 50;

      // Query v_finance_unmapped_lines view with tenant scoping
      const { query, scopeParams } = scopeByTenantAndLocation(db, req, `
        SELECT
          tenant_id,
          document_id,
          vendor,
          invoice_date,
          invoice_number,
          unmapped_line_count,
          unmapped_total_amount,
          document_created_at
        FROM v_finance_unmapped_lines
        ORDER BY document_created_at DESC
        LIMIT ?
      `);

      const unmappedDocs = await db.all(query, [...scopeParams, limit]);

      // For each document, get the unmapped line items
      const results = [];
      for (const doc of unmappedDocs) {
        const lineItems = await db.all(`
          SELECT
            line_id,
            line_number,
            raw_text,
            description,
            amount,
            quantity,
            unit_price,
            unit,
            category_guess,
            confidence
          FROM document_line_items
          WHERE document_id = ? AND mapping_status = 'unmapped'
          ORDER BY line_number ASC
        `, [doc.document_id]);

        results.push({
          ...doc,
          line_items: lineItems
        });
      }

      res.json({
        success: true,
        count: results.length,
        documents: results
      });

    } catch (error) {
      logger.error('GET /reconcile/needs-mapping error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/inventory/reconcile/map-line
 * v15.5: Map a document line item to a category/GL account
 * Body: { line_id, mapped_category, mapped_gl_account, notes }
 */
router.post('/reconcile/map-line',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    const rateLimitCheck = checkRateLimit(req.ip);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        resetIn: rateLimitCheck.resetIn
      });
    }

    try {
      const { line_id, mapped_category, mapped_gl_account, notes } = req.body;

      if (!line_id || !mapped_category) {
        return res.status(400).json({
          success: false,
          error: 'line_id and mapped_category are required'
        });
      }

      const db = getDB();

      // Get line item before update
      const before = await db.get(`
        SELECT * FROM document_line_items WHERE line_id = ?
      `, [line_id]);

      if (!before) {
        return res.status(404).json({
          success: false,
          error: 'Line item not found'
        });
      }

      // Update mapping
      await db.run(`
        UPDATE document_line_items
        SET
          mapped_category = ?,
          mapped_gl_account = ?,
          mapping_status = 'mapped',
          mapped_by = ?,
          mapped_at = datetime('now'),
          mapping_notes = ?,
          updated_at = datetime('now')
        WHERE line_id = ?
      `, [
        mapped_category,
        mapped_gl_account || null,
        req.user?.email || 'system',
        notes || null,
        line_id
      ]);

      // Get line item after update
      const after = await db.get(`
        SELECT * FROM document_line_items WHERE line_id = ?
      `, [line_id]);

      // Audit the mapping
      await req.audit({
        action: 'MAP',
        entity: 'document_line_item',
        entity_id: line_id.toString(),
        before,
        after,
        success: true
      });

      logger.info('Line item mapped', {
        line_id,
        category: mapped_category,
        gl_account: mapped_gl_account,
        mapped_by: req.user?.email
      });

      res.json({
        success: true,
        line_id,
        mapped_category,
        mapped_gl_account,
        mapped_by: req.user?.email
      });

    } catch (error) {
      logger.error('POST /reconcile/map-line error:', error);

      await req.audit({
        action: 'MAP',
        entity: 'document_line_item',
        entity_id: req.body.line_id?.toString() || 'unknown',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/inventory/reconcile/map-rule
 * v15.5: Create or update vendor category mapping rule
 * Body: { vendor, vendor_pattern, description_pattern, amount_min, amount_max, category_code, gl_account, priority, auto_apply }
 */
router.post('/reconcile/map-rule',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    const rateLimitCheck = checkRateLimit(req.ip);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        resetIn: rateLimitCheck.resetIn
      });
    }

    try {
      const {
        vendor,
        vendor_pattern,
        description_pattern,
        amount_min,
        amount_max,
        category_code,
        gl_account,
        cost_center,
        priority,
        auto_apply
      } = req.body;

      if (!vendor && !vendor_pattern) {
        return res.status(400).json({
          success: false,
          error: 'Either vendor or vendor_pattern is required'
        });
      }

      if (!category_code) {
        return res.status(400).json({
          success: false,
          error: 'category_code is required'
        });
      }

      const db = getDB();

      // Add scope
      const ruleData = addScopeToData(req, {
        vendor: vendor || null,
        vendor_pattern: vendor_pattern || null,
        description_pattern: description_pattern || null,
        amount_min: amount_min || null,
        amount_max: amount_max || null,
        category_code,
        gl_account: gl_account || null,
        cost_center: cost_center || null,
        priority: priority !== undefined ? priority : 50,
        auto_apply: auto_apply !== false ? 1 : 0,
        active: 1
      });

      // Insert rule
      const result = await db.run(`
        INSERT INTO vendor_category_map (
          tenant_id, vendor, vendor_pattern, description_pattern,
          amount_min, amount_max, category_code, gl_account, cost_center,
          priority, active, auto_apply, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        ruleData.tenant_id,
        ruleData.vendor,
        ruleData.vendor_pattern,
        ruleData.description_pattern,
        ruleData.amount_min,
        ruleData.amount_max,
        ruleData.category_code,
        ruleData.gl_account,
        ruleData.cost_center,
        ruleData.priority,
        ruleData.active,
        ruleData.auto_apply,
        ruleData.created_by
      ]);

      const rule_id = result.lastID;

      // Audit the rule creation
      await req.audit({
        action: 'CREATE',
        entity: 'vendor_category_map',
        entity_id: rule_id.toString(),
        after: ruleData,
        success: true
      });

      logger.info('Mapping rule created', {
        rule_id,
        vendor: ruleData.vendor,
        category: ruleData.category_code,
        created_by: ruleData.created_by
      });

      res.json({
        success: true,
        rule_id,
        ...ruleData
      });

    } catch (error) {
      logger.error('POST /reconcile/map-rule error:', error);

      await req.audit({
        action: 'CREATE',
        entity: 'vendor_category_map',
        entity_id: 'failed',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/inventory/reconcile/out-of-tolerance
 * v15.5: Get documents with tolerance violations (tax mismatch, total variance, unknown vendor, etc.)
 * Returns results from v_finance_out_of_tolerance view
 */
router.get('/reconcile/out-of-tolerance',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    try {
      const db = getDB();
      const limit = parseInt(req.query.limit) || 100;
      const issue_type = req.query.issue_type; // Optional filter

      // Query v_finance_out_of_tolerance view with tenant scoping
      let baseQuery = `
        SELECT
          tenant_id,
          document_id,
          vendor,
          invoice_date,
          invoice_number,
          invoice_total,
          tax_amount,
          subtotal,
          line_items_total,
          total_variance,
          tax_math_variance,
          issue_type,
          created_at
        FROM v_finance_out_of_tolerance
      `;

      if (issue_type) {
        baseQuery += ` WHERE issue_type = ?`;
      }

      baseQuery += ` ORDER BY created_at DESC LIMIT ?`;

      const { query, scopeParams } = scopeByTenantAndLocation(db, req, baseQuery);

      const params = [...scopeParams];
      if (issue_type) {
        params.push(issue_type);
      }
      params.push(limit);

      const violations = await db.all(query, params);

      res.json({
        success: true,
        count: violations.length,
        violations
      });

    } catch (error) {
      logger.error('GET /reconcile/out-of-tolerance error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/inventory/reconcile/mark-exception
 * v15.5: Mark a tolerance exception as resolved with notes
 * Records in finance_quick_fixes table for audit trail
 * Body: { document_id, line_id, exception_reason, notes }
 */
router.post('/reconcile/mark-exception',
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    const rateLimitCheck = checkRateLimit(req.ip);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        resetIn: rateLimitCheck.resetIn
      });
    }

    try {
      const { document_id, line_id, exception_reason, notes } = req.body;

      if (!document_id || !exception_reason) {
        return res.status(400).json({
          success: false,
          error: 'document_id and exception_reason are required'
        });
      }

      const db = getDB();

      // Get document details before marking exception
      const document = await db.get(`
        SELECT
          document_id,
          vendor,
          invoice_number,
          invoice_date,
          invoice_total,
          tax_amount,
          subtotal
        FROM documents
        WHERE document_id = ?
      `, [document_id]);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Get line details if line_id provided
      let lineDetail = null;
      if (line_id) {
        lineDetail = await db.get(`
          SELECT * FROM document_line_items WHERE line_id = ?
        `, [line_id]);
      }

      // Build before/after snapshots
      const beforeValue = {
        document_id: document.document_id,
        vendor: document.vendor,
        invoice_number: document.invoice_number,
        invoice_total: document.invoice_total,
        tax_amount: document.tax_amount,
        subtotal: document.subtotal,
        line_detail: lineDetail
      };

      const afterValue = {
        ...beforeValue,
        exception_marked: true,
        exception_reason,
        notes,
        marked_by: req.user?.email
      };

      // Record in finance_quick_fixes table
      const result = await db.run(`
        INSERT INTO finance_quick_fixes (
          fix_type,
          document_id,
          line_id,
          exception_reason,
          fixer_email,
          fixer_role,
          tenant_id,
          before_value,
          after_value,
          created_at
        ) VALUES (
          'tolerance_exception',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          datetime('now')
        )
      `, [
        document_id,
        line_id || null,
        exception_reason,
        req.user?.email || 'system',
        req.user?.role || 'FINANCE',
        req.user?.tenant_id || 'default',
        JSON.stringify(beforeValue),
        JSON.stringify(afterValue)
      ]);

      const fix_id = result.lastID;

      // Update document status to indicate exception has been reviewed
      await db.run(`
        UPDATE documents
        SET
          status = 'exception_marked',
          updated_at = datetime('now')
        WHERE document_id = ?
      `, [document_id]);

      // Audit the exception marking
      await req.audit({
        action: 'MARK_EXCEPTION',
        entity: 'document',
        entity_id: document_id.toString(),
        before: beforeValue,
        after: afterValue,
        success: true
      });

      logger.info('Tolerance exception marked', {
        fix_id,
        document_id,
        line_id,
        exception_reason,
        marked_by: req.user?.email
      });

      res.json({
        success: true,
        fix_id,
        document_id,
        line_id,
        exception_reason,
        marked_by: req.user?.email,
        marked_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('POST /reconcile/mark-exception error:', error);

      await req.audit({
        action: 'MARK_EXCEPTION',
        entity: 'document',
        entity_id: req.body.document_id?.toString() || 'unknown',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/inventory/reconcile/documents
 * v15.5: Get list of imported documents with pagination and filters
 */
router.get('/reconcile/documents',
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS, ROLES.READONLY),
  async (req, res) => {
    try {
      const db = getDB();
      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 50;
      const status = req.query.status; // Optional filter
      const vendor = req.query.vendor; // Optional filter
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;

      const offset = (page - 1) * size;

      // Build query with filters
      let baseQuery = `
        SELECT
          document_id,
          tenant_id,
          location_id,
          vendor,
          vendor_normalized,
          invoice_date,
          invoice_number,
          invoice_total,
          tax_amount,
          subtotal,
          sha256,
          file_name,
          file_size_bytes,
          ocr_confidence,
          ocr_engine,
          status,
          created_by,
          created_at,
          updated_at,
          reconciled_at
        FROM documents
      `;

      const conditions = [];
      const params = [];

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (vendor) {
        conditions.push('(vendor LIKE ? OR vendor_normalized LIKE ?)');
        params.push(`%${vendor}%`, `%${vendor}%`);
      }

      if (startDate) {
        conditions.push('invoice_date >= ?');
        params.push(startDate);
      }

      if (endDate) {
        conditions.push('invoice_date <= ?');
        params.push(endDate);
      }

      // Add WHERE clause for conditions
      if (conditions.length > 0) {
        baseQuery += ' WHERE ' + conditions.join(' AND ');
      }

      baseQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

      // Apply tenant scoping
      const { query, scopeParams } = scopeByTenantAndLocation(db, req, baseQuery);

      const documents = await db.all(query, [...scopeParams, ...params, size, offset]);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM documents';
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }

      const { query: countQueryScoped, scopeParams: countScopeParams } = scopeByTenantAndLocation(db, req, countQuery);
      const { total } = await db.get(countQueryScoped, [...countScopeParams, ...params]);

      res.json({
        success: true,
        page,
        size,
        total,
        pages: Math.ceil(total / size),
        documents
      });

    } catch (error) {
      logger.error('GET /reconcile/documents error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/inventory/reconcile/document/:id
 * v15.5: Get document details including all line items
 */
router.get('/reconcile/document/:id',
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS, ROLES.READONLY),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = getDB();

      // Get document with tenant scoping
      const { query, scopeParams } = scopeByTenantAndLocation(db, req, `
        SELECT * FROM documents WHERE document_id = ?
      `);

      const document = await db.get(query, [...scopeParams, id]);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Get line items
      const lineItems = await db.all(`
        SELECT
          line_id,
          line_number,
          raw_text,
          description,
          quantity,
          unit_price,
          amount,
          unit,
          category_guess,
          confidence,
          mapped_category,
          mapped_gl_account,
          mapping_status,
          mapped_by,
          mapped_at,
          mapping_notes
        FROM document_line_items
        WHERE document_id = ?
        ORDER BY line_number ASC
      `, [id]);

      res.json({
        success: true,
        document: {
          ...document,
          // Don't send BLOB bytes to client unless explicitly requested
          bytes: undefined
        },
        line_items: lineItems,
        summary: {
          total_lines: lineItems.length,
          unmapped_lines: lineItems.filter(li => li.mapping_status === 'unmapped').length,
          mapped_lines: lineItems.filter(li => li.mapping_status === 'mapped').length,
          line_items_total: lineItems.reduce((sum, li) => sum + (li.amount || 0), 0)
        }
      });

    } catch (error) {
      logger.error('GET /reconcile/document/:id error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================================
// Catch-all routes (must be last to avoid intercepting specific routes)
// ============================================================================

/**
 * GET /api/inventory/reconcile/:id
 * Get reconciliation details
 */
router.get('/reconcile/:id', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`📊 Fetching reconciliation: ${id}`);

    const result = await ReconcileService.getReconciliationDetails(id);

    res.json(result);

  } catch (error) {
    logger.error(`GET /api/inventory/reconcile/${req.params.id} error:`, error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        ok: false,
        error: error.message
      });
    }

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/reconcile/:id/csv
 * Download reconciliation CSV
 */
router.get('/reconcile/:id/csv', async (req, res) => {
  try {
    const { id } = req.params;

    const details = await ReconcileService.getReconciliationDetails(id);

    if (!details.artifacts || !details.artifacts.csv) {
      return res.status(404).json({
        ok: false,
        error: 'CSV artifact not found'
      });
    }

    res.download(details.artifacts.csv, `reconcile_${id}.csv`);

  } catch (error) {
    logger.error(`GET /api/inventory/reconcile/${req.params.id}/csv error:`, error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/inventory/reconcile/:id
 * Delete reconciliation report and associated data (v15.3)
 */
router.delete('/reconcile/:id', async (req, res) => {
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    const { id } = req.params;

    logger.info(`🗑️ Deleting reconciliation report: ${id} by ${req.user?.email || 'unknown'}`);

    // v21.1.8: Use PostgreSQL pool
    // Check if reconciliation exists
    const reconcileResult = await pool.query(`
      SELECT reconcile_id, status FROM inventory_reconcile_runs WHERE reconcile_id = $1
    `, [id]);

    if (reconcileResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'Reconciliation report not found'
      });
    }

    // Delete diff records first (foreign key constraint)
    await pool.query(`
      DELETE FROM inventory_reconcile_diffs
      WHERE run_id = (SELECT id FROM inventory_reconcile_runs WHERE reconcile_id = $1)
    `, [id]);

    // Delete the reconciliation run record
    await pool.query(`
      DELETE FROM inventory_reconcile_runs WHERE reconcile_id = $1
    `, [id]);

    logger.info(`✅ Reconciliation report ${id} deleted successfully`);

    res.json({
      ok: true,
      success: true,
      message: 'Reconciliation report deleted successfully',
      reconcile_id: id
    });

  } catch (error) {
    logger.error(`DELETE /api/inventory/reconcile/${req.params.id} error:`, error);
    res.status(500).json({
      ok: false,
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
