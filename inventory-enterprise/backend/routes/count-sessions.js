/**
 * Count by Invoice (Finance-First) API Routes v15.6.0
 * Finance-driven count workflow with invoice-based reconciliation
 * 
 * RBAC: OPS creates/edits, FINANCE approves, OWNER overrides
 * CSP: No inline JS/CSS, audit logging on all state transitions
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const { requireRole, canPerformAction } = require('../security/rbac');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const FinanceMappingService = require('../src/finance/FinanceMappingService');
const { validateCountSession, checkDualControl, computeFinanceSummary } = require('../src/finance/FinanceGuardrails');
const CountReportGenerator = require('../src/reports/CountReportGenerator');

// Metrics (if available)
const incrementMetric = (metricName) => {
  if (global.metricsExporter && typeof global.metricsExporter.increment === 'function') {
    global.metricsExporter.increment(metricName);
  }
};

/**
 * POST /api/owner/counts/start
 * Start a new count session
 * RBAC: OPS, FINANCE, OWNER
 */
router.post('/start', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { mode, location_id, period_month, period_year, invoice_import_ids, notes, gst_rate, qst_rate } = req.body;

    // Validation
    if (!mode || !['from_last', 'from_invoice', 'blank'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'Invalid mode. Must be: from_last, from_invoice, or blank' });
    }

    if (!period_month || !period_year || period_month < 1 || period_month > 12) {
      return res.status(400).json({ success: false, error: 'Valid period_month (1-12) and period_year required' });
    }

    const countId = 'CNT-' + uuidv4();
    const now = new Date().toISOString();

    // Get baseline count if mode is from_last
    let baselineCountId = null;
    if (mode === 'from_last') {
      const lastLocked = await db.get(`
        SELECT count_id FROM count_sessions
        WHERE status = 'LOCKED'
          AND tenant_id = ?
          AND (location_id = ? OR location_id IS NULL)
        ORDER BY locked_at DESC
        LIMIT 1
      `, [req.user.tenant_id || 'default', location_id]);

      if (lastLocked) {
        baselineCountId = lastLocked.count_id;
      }
    }

    // Create count session
    await db.run(`
      INSERT INTO count_sessions (
        count_id, created_by, status, location_id, tenant_id,
        period_month, period_year, baseline_count_id, count_mode,
        gst_rate, qst_rate, notes, finance_code_header
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      countId,
      req.user.email,
      'OPEN',
      location_id || null,
      req.user.tenant_id || 'default',
      period_month,
      period_year,
      baselineCountId,
      mode,
      gst_rate || 0.05,
      qst_rate || 0.09975,
      notes || '',
      '{}' // Empty finance header initially
    ]);

    // Populate count lines based on mode
    if (mode === 'from_last' && baselineCountId) {
      await db.run(`
        INSERT INTO count_lines (
          count_line_id, count_id, item_code, item_desc, finance_code,
          expected_qty, expected_uom, counted_qty, counted_uom,
          unit_cost_cents, source, created_at
        )
        SELECT
          'LN-' || hex(randomblob(8)),
          ?,
          item_code,
          item_desc,
          finance_code,
          counted_qty,
          counted_uom,
          0,
          counted_uom,
          unit_cost_cents,
          'last_count',
          ?
        FROM count_lines
        WHERE count_id = ?
      `, [countId, now, baselineCountId]);
    }

    // Attach invoices if provided
    if (mode === 'from_invoice' && invoice_import_ids && invoice_import_ids.length > 0) {
      for (const documentId of invoice_import_ids) {
        await attachInvoiceToCount(countId, documentId, req.user.email);
      }
    }

    incrementMetric('count_session_started_total');

    res.json({
      success: true,
      count_id: countId,
      mode,
      baseline_count_id: baselineCountId,
      message: 'Count session created successfully'
    });

  } catch (error) {
    console.error('POST /api/owner/counts/start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/:id
 * Get count session details with lines and attachments
 * RBAC: OPS, FINANCE, OWNER
 */
router.get('/:id', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`
      SELECT * FROM count_sessions WHERE count_id = ?
    `, [id]);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }

    // Get count lines
    const lines = await db.all(`
      SELECT * FROM count_lines WHERE count_id = ? ORDER BY item_code
    `, [id]);

    // Get attached invoices
    const invoices = await db.all(`
      SELECT * FROM count_invoices WHERE count_id = ?
    `, [id]);

    // Get finance summary
    const financeSummary = await db.all(`
      SELECT finance_code, total_value_cents, variance_value_cents, item_count
      FROM v_finance_count_summary
      WHERE count_id = ?
    `, [id]);

    res.json({
      success: true,
      session: {
        ...session,
        finance_code_header: JSON.parse(session.finance_code_header || '{}')
      },
      lines,
      invoices,
      finance_summary: financeSummary
    });

  } catch (error) {
    console.error('GET /api/owner/counts/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/:id/attach-invoices
 * Attach invoices to count session
 * RBAC: OPS, FINANCE, OWNER
 */
router.post('/:id/attach-invoices', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { document_ids } = req.body;

    if (!document_ids || !Array.isArray(document_ids)) {
      return res.status(400).json({ success: false, error: 'document_ids array required' });
    }

    const session = await db.get(`SELECT status FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }
    if (session.status !== 'OPEN') {
      return res.status(400).json({ success: false, error: 'Can only attach invoices to OPEN counts' });
    }

    let attached = 0;
    for (const documentId of document_ids) {
      const result = await attachInvoiceToCount(id, documentId, req.user.email);
      if (result.success) attached++;
    }

    res.json({
      success: true,
      attached,
      message: attached + ' invoices attached successfully'
    });

  } catch (error) {
    console.error('POST /api/owner/counts/:id/attach-invoices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/:id/line
 * Upsert a count line
 * RBAC: OPS, FINANCE, OWNER
 */
router.post('/:id/line', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { item_code, item_desc, finance_code, counted_qty, counted_uom, unit_cost_cents, notes } = req.body;

    if (!item_code || !finance_code) {
      return res.status(400).json({ success: false, error: 'item_code and finance_code required' });
    }

    const session = await db.get(`SELECT status FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }
    if (session.status !== 'OPEN') {
      return res.status(400).json({ success: false, error: 'Can only edit OPEN counts' });
    }

    // Check if line exists
    const existing = await db.get(`
      SELECT count_line_id FROM count_lines WHERE count_id = ? AND item_code = ?
    `, [id, item_code]);

    const now = new Date().toISOString();

    if (existing) {
      // Update
      await db.run(`
        UPDATE count_lines
        SET counted_qty = ?, counted_uom = ?, unit_cost_cents = ?,
            finance_code = ?, updated_at = ?, updated_by = ?, notes = ?
        WHERE count_line_id = ?
      `, [counted_qty || 0, counted_uom, unit_cost_cents || 0, finance_code, now, req.user.email, notes || '', existing.count_line_id]);
    } else {
      // Insert
      const lineId = 'LN-' + uuidv4();
      await db.run(`
        INSERT INTO count_lines (
          count_line_id, count_id, item_code, item_desc, finance_code,
          expected_qty, expected_uom, counted_qty, counted_uom,
          unit_cost_cents, source, created_at, updated_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [lineId, id, item_code, item_desc || '', finance_code, 0, counted_uom, counted_qty || 0, counted_uom,
          unit_cost_cents || 0, 'manual', now, req.user.email, notes || '']);
    }

    // Update finance header summary
    await updateFinanceHeaderSummary(id);

    incrementMetric('count_line_updated_total');

    res.json({ success: true, message: 'Count line updated successfully' });

  } catch (error) {
    console.error('POST /api/owner/counts/:id/line error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/:id/submit
 * Submit count for approval (OPS → FINANCE)
 * RBAC: OPS, OWNER
 */
router.post('/:id/submit', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT status FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }
    if (session.status !== 'OPEN') {
      return res.status(400).json({ success: false, error: 'Can only submit OPEN counts' });
    }

    // Comprehensive validation using guardrails
    const validation = await validateCountSession(db, id, 'SUBMITTED');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const now = new Date().toISOString();
    await db.run(`
      UPDATE count_sessions
      SET status = 'SUBMITTED', submitted_at = ?, submitted_by = ?, updated_at = ?
      WHERE count_id = ?
    `, [now, req.user.email, now, id]);

    incrementMetric('count_session_submitted_total');

    res.json({
      success: true,
      message: 'Count submitted for approval',
      warnings: validation.warnings
    });

  } catch (error) {
    console.error('POST /api/owner/counts/:id/submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/:id/approve
 * Approve count (FINANCE role)
 * RBAC: FINANCE, OWNER
 */
router.post('/:id/approve', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT status FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }
    if (session.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Can only approve SUBMITTED counts' });
    }

    // Dual-control check: Cannot approve own submission
    const dualControlCheck = await checkDualControl(db, id, req.user.email, 'APPROVE');
    if (!dualControlCheck.valid) {
      return res.status(403).json({
        success: false,
        error: dualControlCheck.error
      });
    }

    // Comprehensive validation using guardrails
    const validation = await validateCountSession(db, id, 'APPROVED');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Compute and save finance summary
    const financeSummary = await computeFinanceSummary(db, id);

    const now = new Date().toISOString();
    await db.run(`
      UPDATE count_sessions
      SET status = 'APPROVED', approved_at = ?, approved_by = ?, updated_at = ?, finance_code_header = ?
      WHERE count_id = ?
    `, [now, req.user.email, now, JSON.stringify(financeSummary), id]);

    incrementMetric('count_session_approved_total');

    res.json({
      success: true,
      message: 'Count approved',
      warnings: validation.warnings,
      finance_summary: financeSummary
    });

  } catch (error) {
    console.error('POST /api/owner/counts/:id/approve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/:id/lock
 * Lock count (final, no more edits)
 * RBAC: FINANCE, OWNER
 */
router.post('/:id/lock', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT status FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }
    if (session.status !== 'APPROVED') {
      return res.status(400).json({ success: false, error: 'Can only lock APPROVED counts' });
    }

    // Dual-control check: Cannot lock own approval
    const dualControlCheck = await checkDualControl(db, id, req.user.email, 'LOCK');
    if (!dualControlCheck.valid) {
      return res.status(403).json({
        success: false,
        error: dualControlCheck.error
      });
    }

    // Comprehensive validation using guardrails
    const validation = await validateCountSession(db, id, 'LOCKED');
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const now = new Date().toISOString();
    await db.run(`
      UPDATE count_sessions
      SET status = 'LOCKED', locked_at = ?, locked_by = ?, updated_at = ?
      WHERE count_id = ?
    `, [now, req.user.email, now, id]);

    incrementMetric('count_session_locked_total');

    res.json({
      success: true,
      message: 'Count locked successfully',
      warnings: validation.warnings
    });

  } catch (error) {
    console.error('POST /api/owner/counts/:id/lock error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/:id/variances
 * Get variance report (item + finance code level)
 */
router.get('/:id/variances', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const variances = await db.all(`
      SELECT
        cl.item_code,
        cl.item_desc,
        cl.finance_code,
        cl.expected_qty,
        cl.counted_qty,
        cl.counted_qty - cl.expected_qty as variance_qty,
        cl.counted_uom,
        cl.unit_cost_cents,
        (cl.counted_qty - cl.expected_qty) * cl.unit_cost_cents as variance_value_cents
      FROM count_lines cl
      WHERE cl.count_id = ?
      ORDER BY ABS(cl.counted_qty - cl.expected_qty) * cl.unit_cost_cents DESC
    `, [id]);

    const financeCodeSummary = await db.all(`
      SELECT
        finance_code,
        SUM(variance_qty) as total_variance_qty,
        SUM(variance_value_cents) as total_variance_value_cents,
        COUNT(*) as item_count
      FROM (
        SELECT
          finance_code,
          counted_qty - expected_qty as variance_qty,
          (counted_qty - expected_qty) * unit_cost_cents as variance_value_cents
        FROM count_lines
        WHERE count_id = ?
      )
      GROUP BY finance_code
    `, [id]);

    res.json({
      success: true,
      count_id: id,
      variances,
      finance_summary: financeCodeSummary
    });

  } catch (error) {
    console.error('GET /api/owner/counts/:id/variances error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/needs-mapping
 * Get all unresolved invoice line mappings
 * RBAC: FINANCE, OWNER
 */
router.get('/needs-mapping', authenticateToken, requireOwner, async (req, res) => {
  try {
    const mappings = await db.all(`SELECT * FROM v_needs_mapping LIMIT 100`);

    incrementMetric('ai_mapping_needs_review_total');

    res.json({
      success: true,
      mappings,
      total: mappings.length
    });

  } catch (error) {
    console.error('GET /api/owner/counts/needs-mapping error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/owner/counts/confirm-mapping
 * Confirm an invoice line mapping
 */
router.post('/confirm-mapping', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { link_line_id, confirmed_item_code, confirmed_finance_code } = req.body;

    if (!link_line_id || !confirmed_finance_code) {
      return res.status(400).json({ success: false, error: 'link_line_id and confirmed_finance_code required' });
    }

    const now = new Date().toISOString();
    await db.run(`
      UPDATE count_invoice_lines
      SET confirmed_item_code = ?,
          confirmed_finance_code = ?,
          confirmed_by = ?,
          confirmed_at = ?,
          mapping_status = 'confirmed'
      WHERE link_line_id = ?
    `, [confirmed_item_code, confirmed_finance_code, req.user.email, now, link_line_id]);

    res.json({ success: true, message: 'Mapping confirmed' });

  } catch (error) {
    console.error('POST /api/owner/counts/confirm-mapping error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/:id/report/csv
 * Generate CSV export for count session
 */
router.get('/:id/report/csv', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT count_id, period_year, period_month FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }

    const csv = await CountReportGenerator.generateCSV(id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="count_' + id + '_' + session.period_year + '_' + String(session.period_month).padStart(2, '0') + '.csv"');
    res.send(csv);

  } catch (error) {
    console.error('GET /api/owner/counts/:id/report/csv error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/:id/report/text
 * Generate text report for count session
 */
router.get('/:id/report/text', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT count_id FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }

    const textReport = await CountReportGenerator.generateTextReport(id);

    res.setHeader('Content-Type', 'text/plain');
    res.send(textReport);

  } catch (error) {
    console.error('GET /api/owner/counts/:id/report/text error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/owner/counts/:id/report/json
 * Get count report data as JSON
 */
router.get('/:id/report/json', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const session = await db.get(`SELECT count_id FROM count_sessions WHERE count_id = ?`, [id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Count session not found' });
    }

    const reportData = await CountReportGenerator.generateReportData(id);

    res.json({
      success: true,
      report: reportData
    });

  } catch (error) {
    console.error('GET /api/owner/counts/:id/report/json error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Attach an invoice to a count session
 */
async function attachInvoiceToCount(countId, documentId, attachedBy) {
  try {
    // Get document details
    const document = await db.get(`
      SELECT id, filename, vendor, invoice_date, invoice_amount FROM documents
      WHERE id = ? AND deleted_at IS NULL
    `, [documentId]);

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    const linkId = 'LNK-' + uuidv4();
    const now = new Date().toISOString();

    // Create invoice link
    await db.run(`
      INSERT INTO count_invoices (
        link_id, count_id, document_id, vendor, invoice_date,
        subtotal_cents, gst_cents, qst_cents, total_cents,
        attached_at, attached_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      linkId,
      countId,
      documentId,
      document.vendor || 'Unknown',
      document.invoice_date || now,
      Math.round((document.invoice_amount || 0) * 100 / 1.14975), // Rough estimate
      0, // GST calculated separately
      0, // QST calculated separately
      Math.round((document.invoice_amount || 0) * 100),
      now,
      attachedBy
    ]);

    // Get processed invoice lines
    const lines = await db.all(`
      SELECT * FROM processed_invoices WHERE document_id = ?
    `, [documentId]);

    // Map lines using AI service
    for (const line of lines) {
      const mappingResult = await FinanceMappingService.mapInvoiceLine({
        raw_desc: line.item_desc || line.description,
        raw_category: line.category,
        vendor: document.vendor,
        quantity: line.quantity,
        uom: line.uom
      });

      const linkLineId = 'LNL-' + uuidv4();
      await db.run(`
        INSERT INTO count_invoice_lines (
          link_line_id, link_id, document_line_id, line_number,
          raw_desc, raw_category, quantity, uom,
          unit_price_cents, extended_cents,
          ai_item_code, ai_finance_code, ai_confidence, ai_explanation,
          mapping_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        linkLineId,
        linkId,
        line.line_id,
        line.line_number || 0,
        line.item_desc || line.description,
        line.category || '',
        line.quantity || 0,
        line.uom || '',
        Math.round((line.unit_price || 0) * 100),
        Math.round((line.extended_price || 0) * 100),
        mappingResult.item_code,
        mappingResult.finance_code,
        mappingResult.confidence,
        mappingResult.explanation,
        mappingResult.needs_review ? 'needs_review' : 'auto',
        now
      ]);
    }

    return { success: true, link_id: linkId };
  } catch (err) {
    console.error('attachInvoiceToCount error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update finance header summary for count session
 */
async function updateFinanceHeaderSummary(countId) {
  try {
    const summary = await db.all(`
      SELECT
        finance_code,
        SUM(counted_qty * unit_cost_cents) as total_cents
      FROM count_lines
      WHERE count_id = ?
      GROUP BY finance_code
    `, [countId]);

    const headerObj = {};
    summary.forEach(row => {
      headerObj[row.finance_code] = row.total_cents;
    });

    await db.run(`
      UPDATE count_sessions
      SET finance_code_header = ?
      WHERE count_id = ?
    `, [JSON.stringify(headerObj), countId]);

    return { success: true };
  } catch (err) {
    console.error('updateFinanceHeaderSummary error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = router;
