/**
 * Finance Reports API Routes
 * NeuroPilot AI Enterprise V23.5.0
 *
 * Handles finance report ingestion, parsing, and reconciliation.
 * Integrates with Google Drive for PDF retrieval and template learning.
 *
 * Endpoints:
 * - GET    /api/finance-reports           - List reports (paginated, filtered)
 * - GET    /api/finance-reports/:id       - Get single report with lines
 * - POST   /api/finance-reports           - Create report from Google Drive PDF
 * - PATCH  /api/finance-reports/:id       - Update report status/metadata
 * - DELETE /api/finance-reports/:id       - Soft delete report
 * - POST   /api/finance-reports/:id/parse - Trigger PDF parsing
 * - GET    /api/finance-reports/:id/reconcile - Get reconciliation status
 * - POST   /api/finance-reports/:id/reconcile - Trigger auto-reconciliation
 * - GET    /api/finance-reports/templates - List report templates
 * - POST   /api/finance-reports/templates - Create/update template
 *
 * V23.5.0 New Endpoints:
 * - POST   /api/finance-reports/sync      - Sync files from Google Drive
 * - GET    /api/finance-reports/coverage  - Period coverage analysis
 * - POST   /api/finance-reports/process-batch - Process unprocessed files
 * - GET    /api/finance-reports/unprocessed - List unprocessed files
 *
 * @version 23.5.0
 * @author NeuroPilot AI Team
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Import Google Drive service (optional)
let googleDriveService = null;
try {
  googleDriveService = require('../services/GoogleDriveService');
} catch (err) {
  console.warn('[FinanceReports] Google Drive service not available:', err.message);
}

// Import pdf-parse for text extraction (optional)
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.warn('[FinanceReports] pdf-parse not available:', err.message);
}

// Import FinanceReportAgent (V23.4.9)
let FinanceReportAgent = null;
try {
  FinanceReportAgent = require('../services/FinanceReportAgent');
} catch (err) {
  console.warn('[FinanceReports] FinanceReportAgent not available:', err.message);
}

// ============================================
// HELPERS
// ============================================

/**
 * Get org_id from request (tenant isolation)
 */
function getOrgId(req) {
  return req.user?.org_id || 'default-org';
}

/**
 * Get user ID from request
 */
function getUserId(req) {
  return req.user?.email || req.user?.user_id || 'system';
}

/**
 * Convert cents to dollars for response
 */
function centsToDollars(cents) {
  return cents ? (cents / 100).toFixed(2) : '0.00';
}

/**
 * Convert dollars to cents for storage
 */
function dollarsToCents(dollars) {
  if (!dollars) return 0;
  return Math.round(parseFloat(dollars) * 100);
}

/**
 * Build Google Drive preview URL
 */
function buildPreviewUrl(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

// ============================================
// GET /api/finance-reports - List Reports
// ============================================

router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // Filters
    const reportType = req.query.reportType || null;
    const status = req.query.status || null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const needsReview = req.query.needsReview === 'true';

    // Build query
    let whereConditions = ['fr.org_id = $1', 'fr.deleted_at IS NULL'];
    let params = [orgId];
    let paramIndex = 2;

    if (reportType) {
      whereConditions.push(`fr.report_type = $${paramIndex++}`);
      params.push(reportType);
    }

    if (status) {
      whereConditions.push(`fr.status = $${paramIndex++}`);
      params.push(status);
    }

    if (dateFrom) {
      whereConditions.push(`fr.period_start >= $${paramIndex++}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push(`fr.period_end <= $${paramIndex++}`);
      params.push(dateTo);
    }

    if (needsReview) {
      whereConditions.push('fr.needs_review = TRUE');
    }

    const whereClause = whereConditions.join(' AND ');

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM finance_reports fr WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Data query
    const dataResult = await pool.query(`
      SELECT
        fr.id,
        fr.report_type,
        fr.report_name,
        fr.period_start,
        fr.period_end,
        fr.fiscal_period,
        fr.total_lines,
        fr.total_amount_cents,
        fr.currency,
        fr.pdf_file_id,
        fr.pdf_file_name,
        fr.pdf_preview_url,
        fr.status,
        fr.needs_review,
        fr.review_reason,
        fr.template_id,
        rt.template_name,
        fr.template_confidence,
        fr.ocr_confidence,
        fr.parsed_at,
        fr.error_message,
        fr.created_at,
        fr.created_by
      FROM finance_reports fr
      LEFT JOIN report_templates rt ON fr.template_id = rt.id
      WHERE ${whereClause}
      ORDER BY fr.period_end DESC, fr.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, pageSize, offset]);

    // Format response
    const reports = dataResult.rows.map(row => ({
      id: row.id,
      reportType: row.report_type,
      reportName: row.report_name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      fiscalPeriod: row.fiscal_period,
      totalLines: row.total_lines,
      totalAmount: centsToDollars(row.total_amount_cents),
      currency: row.currency,
      pdfFileId: row.pdf_file_id,
      pdfFileName: row.pdf_file_name,
      pdfPreviewUrl: row.pdf_preview_url,
      status: row.status,
      needsReview: row.needs_review,
      reviewReason: row.review_reason,
      templateId: row.template_id,
      templateName: row.template_name,
      templateConfidence: row.template_confidence ? parseFloat(row.template_confidence) : null,
      ocrConfidence: row.ocr_confidence ? parseFloat(row.ocr_confidence) : null,
      parsedAt: row.parsed_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      createdBy: row.created_by
    }));

    res.json({
      success: true,
      reports,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('[FinanceReports] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch finance reports',
      code: 'LIST_ERROR'
    });
  }
});

// ============================================
// GET /api/finance-reports/:id - Get Single Report
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const reportId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        code: 'INVALID_ID'
      });
    }

    // Get report header
    const reportResult = await pool.query(`
      SELECT
        fr.*,
        rt.template_name,
        rt.column_mappings
      FROM finance_reports fr
      LEFT JOIN report_templates rt ON fr.template_id = rt.id
      WHERE fr.id = $1 AND fr.org_id = $2 AND fr.deleted_at IS NULL
    `, [reportId, orgId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND'
      });
    }

    const report = reportResult.rows[0];

    // Get report lines
    const linesResult = await pool.query(`
      SELECT
        frl.*,
        v.name AS vendor_name_ref
      FROM finance_report_lines frl
      LEFT JOIN vendors v ON frl.vendor_id = v.id
      WHERE frl.report_id = $1
      ORDER BY frl.line_number
    `, [reportId]);

    // Get reconciliation status
    const reconResult = await pool.query(`
      SELECT
        ir.status,
        COUNT(*) as count
      FROM invoice_reconciliation ir
      JOIN finance_report_lines frl ON ir.report_line_id = frl.id
      WHERE frl.report_id = $1
      GROUP BY ir.status
    `, [reportId]);

    const reconciliationSummary = {};
    reconResult.rows.forEach(row => {
      reconciliationSummary[row.status] = parseInt(row.count);
    });

    // Format response
    res.json({
      success: true,
      report: {
        id: report.id,
        reportType: report.report_type,
        reportName: report.report_name,
        periodStart: report.period_start,
        periodEnd: report.period_end,
        fiscalPeriod: report.fiscal_period,
        totalLines: report.total_lines,
        totalAmount: centsToDollars(report.total_amount_cents),
        currency: report.currency,
        pdfFileId: report.pdf_file_id,
        pdfFileName: report.pdf_file_name,
        pdfFolderId: report.pdf_folder_id,
        pdfPreviewUrl: report.pdf_preview_url,
        status: report.status,
        needsReview: report.needs_review,
        reviewReason: report.review_reason,
        templateId: report.template_id,
        templateName: report.template_name,
        templateConfidence: report.template_confidence ? parseFloat(report.template_confidence) : null,
        ocrConfidence: report.ocr_confidence ? parseFloat(report.ocr_confidence) : null,
        ocrEngine: report.ocr_engine,
        parseDurationMs: report.parse_duration_ms,
        parsedAt: report.parsed_at,
        parsedBy: report.parsed_by,
        errorMessage: report.error_message,
        metadata: report.metadata,
        createdAt: report.created_at,
        createdBy: report.created_by,
        updatedAt: report.updated_at
      },
      lines: linesResult.rows.map(line => ({
        id: line.id,
        lineNumber: line.line_number,
        section: line.section,
        category: line.category,
        subcategory: line.subcategory,
        description: line.description,
        glAccount: line.gl_account,
        costCenter: line.cost_center,
        budget: centsToDollars(line.budget_cents),
        actual: centsToDollars(line.actual_cents),
        variance: centsToDollars(line.variance_cents),
        variancePct: line.variance_pct ? parseFloat(line.variance_pct) : null,
        vendorName: line.vendor_name || line.vendor_name_ref,
        vendorId: line.vendor_id,
        invoiceNumber: line.invoice_number,
        invoiceDate: line.invoice_date,
        lineConfidence: line.line_confidence ? parseFloat(line.line_confidence) : null,
        needsReview: line.needs_review,
        reviewNotes: line.review_notes,
        pageNumber: line.page_number
      })),
      reconciliation: reconciliationSummary
    });

  } catch (error) {
    console.error('[FinanceReports] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch finance report',
      code: 'GET_ERROR'
    });
  }
});

// ============================================
// POST /api/finance-reports - Create Report
// ============================================

router.post('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = req.body;

    // Validate required fields
    if (!data.pdf_file_id && !data.report_name) {
      return res.status(400).json({
        success: false,
        error: 'Either pdf_file_id or report_name is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Check for duplicate by pdf_file_id
    if (data.pdf_file_id) {
      const existingResult = await pool.query(
        'SELECT id, status FROM finance_reports WHERE org_id = $1 AND pdf_file_id = $2 AND deleted_at IS NULL',
        [orgId, data.pdf_file_id]
      );

      if (existingResult.rows.length > 0) {
        return res.status(200).json({
          success: true,
          alreadyExists: true,
          message: 'Report already exists for this PDF',
          report: {
            id: existingResult.rows[0].id,
            status: existingResult.rows[0].status
          }
        });
      }
    }

    // Build preview URL
    const pdfPreviewUrl = data.pdf_file_id ? buildPreviewUrl(data.pdf_file_id) : null;

    // Insert new report
    const insertResult = await pool.query(`
      INSERT INTO finance_reports (
        org_id,
        site_id,
        report_type,
        report_name,
        period_start,
        period_end,
        fiscal_period,
        pdf_file_id,
        pdf_file_name,
        pdf_folder_id,
        pdf_preview_url,
        status,
        created_by,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      orgId,
      data.site_id || null,
      data.report_type || 'month_end',
      data.report_name || data.pdf_file_name || 'Untitled Report',
      data.period_start || null,
      data.period_end || null,
      data.fiscal_period || null,
      data.pdf_file_id || null,
      data.pdf_file_name || null,
      data.pdf_folder_id || null,
      pdfPreviewUrl,
      'new',
      userId,
      data.metadata ? JSON.stringify(data.metadata) : '{}'
    ]);

    const newReport = insertResult.rows[0];

    res.status(201).json({
      success: true,
      alreadyExists: false,
      message: 'Report created successfully',
      report: {
        id: newReport.id,
        reportType: newReport.report_type,
        reportName: newReport.report_name,
        status: newReport.status,
        pdfFileId: newReport.pdf_file_id,
        pdfPreviewUrl: newReport.pdf_preview_url
      }
    });

  } catch (error) {
    console.error('[FinanceReports] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create finance report',
      code: 'CREATE_ERROR'
    });
  }
});

// ============================================
// PATCH /api/finance-reports/:id - Update Report
// ============================================

router.patch('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const reportId = req.params.id;
    const data = req.body;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        code: 'INVALID_ID'
      });
    }

    // Check report exists
    const existingResult = await pool.query(
      'SELECT id FROM finance_reports WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [reportId, orgId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND'
      });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    // Allowed update fields
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (data.needs_review !== undefined) {
      updates.push(`needs_review = $${paramIndex++}`);
      params.push(data.needs_review);
    }
    if (data.review_reason !== undefined) {
      updates.push(`review_reason = $${paramIndex++}`);
      params.push(data.review_reason);
    }
    if (data.period_start !== undefined) {
      updates.push(`period_start = $${paramIndex++}`);
      params.push(data.period_start);
    }
    if (data.period_end !== undefined) {
      updates.push(`period_end = $${paramIndex++}`);
      params.push(data.period_end);
    }
    if (data.fiscal_period !== undefined) {
      updates.push(`fiscal_period = $${paramIndex++}`);
      params.push(data.fiscal_period);
    }
    if (data.error_message !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      params.push(data.error_message);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid update fields provided',
        code: 'NO_UPDATES'
      });
    }

    // Add audit fields
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`updated_by = $${paramIndex++}`);
    params.push(userId);
    params.push(reportId);
    params.push(orgId);

    // Execute update
    await pool.query(
      `UPDATE finance_reports SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND org_id = $${paramIndex}`,
      params
    );

    res.json({
      success: true,
      message: 'Report updated successfully'
    });

  } catch (error) {
    console.error('[FinanceReports] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update finance report',
      code: 'UPDATE_ERROR'
    });
  }
});

// ============================================
// DELETE /api/finance-reports/:id - Soft Delete
// ============================================

router.delete('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const reportId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
        code: 'INVALID_ID'
      });
    }

    // Soft delete
    const result = await pool.query(`
      UPDATE finance_reports
      SET deleted_at = CURRENT_TIMESTAMP, updated_by = $3
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
      RETURNING id
    `, [reportId, orgId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('[FinanceReports] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete finance report',
      code: 'DELETE_ERROR'
    });
  }
});

// ============================================
// POST /api/finance-reports/:id/parse - Trigger Parsing
// ============================================

router.post('/:id/parse', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const reportId = req.params.id;

    // Get report
    const reportResult = await pool.query(
      'SELECT * FROM finance_reports WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [reportId, orgId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'NOT_FOUND'
      });
    }

    const report = reportResult.rows[0];

    if (!report.pdf_file_id) {
      return res.status(400).json({
        success: false,
        error: 'Report has no PDF file ID to parse',
        code: 'NO_PDF'
      });
    }

    // Check if Google Drive service is available
    if (!googleDriveService) {
      return res.status(503).json({
        success: false,
        error: 'Google Drive service not available',
        code: 'DRIVE_UNAVAILABLE'
      });
    }

    // Update status to parsing
    await pool.query(
      `UPDATE finance_reports SET status = 'parsing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [reportId]
    );

    // Use FinanceReportAgent if available
    if (FinanceReportAgent) {
      try {
        const agent = new FinanceReportAgent({
          orgId,
          siteId: report.site_id,
          userId
        });

        // Parse from Google Drive
        const parseResult = await agent.parseFromGoogleDrive(report.pdf_file_id);

        if (!parseResult.success) {
          // Update report with error
          await pool.query(`
            UPDATE finance_reports
            SET status = 'error', error_message = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [reportId, parseResult.error]);

          return res.status(422).json({
            success: false,
            error: parseResult.error,
            code: 'PARSE_FAILED'
          });
        }

        // Save parsed data
        const saveResult = await agent.saveReport({
          ...parseResult,
          pdf_file_id: report.pdf_file_id,
          pdf_file_name: report.pdf_file_name,
          pdf_folder_id: report.pdf_folder_id
        });

        // Delete the original 'new' report record since saveReport creates a new one
        await pool.query(`DELETE FROM finance_reports WHERE id = $1`, [reportId]);

        return res.json({
          success: true,
          message: 'Report parsed successfully',
          reportId: saveResult.report_id,
          linesExtracted: parseResult.lines?.length || 0,
          totalAmount: parseResult.total_amount_cents / 100,
          ocrConfidence: parseResult.ocr_confidence,
          needsReview: parseResult.needs_review,
          reviewReason: parseResult.review_reason
        });

      } catch (agentError) {
        console.error('[FinanceReports] Agent error:', agentError);
        await pool.query(`
          UPDATE finance_reports
          SET status = 'error', error_message = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [reportId, agentError.message]);

        return res.status(500).json({
          success: false,
          error: 'Agent parsing failed: ' + agentError.message,
          code: 'AGENT_ERROR'
        });
      }
    }

    // Fallback: FinanceReportAgent not available
    res.json({
      success: true,
      message: 'Parsing initiated (V23.4.9 - FinanceReportAgent not loaded)',
      reportId,
      pdfFileId: report.pdf_file_id,
      hint: 'Ensure FinanceReportAgent service is properly deployed'
    });

  } catch (error) {
    console.error('[FinanceReports] Parse error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate parsing',
      code: 'PARSE_ERROR'
    });
  }
});

// ============================================
// GET /api/finance-reports/:id/reconcile - Get Reconciliation Status
// ============================================

router.get('/:id/reconcile', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const reportId = req.params.id;

    // Get reconciliation details
    const result = await pool.query(`
      SELECT
        ir.*,
        frl.line_number,
        frl.description,
        frl.invoice_number,
        vo.order_number AS matched_order_number,
        vo.vendor_name AS matched_vendor_name
      FROM invoice_reconciliation ir
      JOIN finance_report_lines frl ON ir.report_line_id = frl.id
      LEFT JOIN vendor_orders vo ON ir.vendor_order_id = vo.id
      WHERE frl.report_id = $1 AND frl.org_id = $2
      ORDER BY frl.line_number
    `, [reportId, orgId]);

    // Calculate summary
    const summary = {
      total: result.rows.length,
      matched: result.rows.filter(r => r.status === 'matched').length,
      partial: result.rows.filter(r => r.status === 'partial').length,
      unmatched: result.rows.filter(r => r.status === 'unmatched').length,
      pending: result.rows.filter(r => r.status === 'pending').length
    };

    res.json({
      success: true,
      reportId,
      summary,
      reconciliations: result.rows.map(r => ({
        id: r.id,
        lineNumber: r.line_number,
        description: r.description,
        invoiceNumber: r.invoice_number,
        matchType: r.match_type,
        matchConfidence: r.match_confidence ? parseFloat(r.match_confidence) : null,
        matchMethod: r.match_method,
        reportAmount: centsToDollars(r.report_amount_cents),
        orderAmount: centsToDollars(r.order_amount_cents),
        difference: centsToDollars(r.difference_cents),
        status: r.status,
        matchedOrderNumber: r.matched_order_number,
        matchedVendorName: r.matched_vendor_name,
        matchedAt: r.matched_at
      }))
    });

  } catch (error) {
    console.error('[FinanceReports] Reconcile get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reconciliation status',
      code: 'RECONCILE_GET_ERROR'
    });
  }
});

// ============================================
// POST /api/finance-reports/:id/reconcile - Trigger Auto-Reconciliation
// ============================================

router.post('/:id/reconcile', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const reportId = req.params.id;
    const useAgent = req.query.useAgent === 'true' || req.body.useAgent === true;

    // Use FinanceReportAgent for comprehensive reconciliation if available and requested
    if (useAgent && FinanceReportAgent) {
      try {
        const agent = new FinanceReportAgent({
          orgId,
          userId
        });

        const result = await agent.reconcileReport(reportId);

        return res.json({
          success: true,
          message: `Agent reconciliation complete`,
          result: {
            reportId,
            totalLines: result.total_lines,
            matched: result.matched,
            partial: result.partial,
            unmatched: result.unmatched,
            errors: result.errors?.length || 0
          }
        });

      } catch (agentError) {
        console.error('[FinanceReports] Agent reconcile error:', agentError);
        // Fall through to basic reconciliation
      }
    }

    // Basic reconciliation using database function
    const linesResult = await pool.query(`
      SELECT id, invoice_number, actual_cents
      FROM finance_report_lines
      WHERE report_id = $1 AND org_id = $2 AND invoice_number IS NOT NULL
    `, [reportId, orgId]);

    let matched = 0;
    let failed = 0;

    // Try to auto-reconcile each line
    for (const line of linesResult.rows) {
      try {
        const reconcileResult = await pool.query(
          'SELECT auto_reconcile_by_invoice($1, $2, $3, $4) AS reconciliation_id',
          [line.id, orgId, line.invoice_number, line.actual_cents]
        );

        if (reconcileResult.rows[0]?.reconciliation_id) {
          matched++;
        }
      } catch (lineError) {
        console.warn('[FinanceReports] Reconcile line error:', lineError.message);
        failed++;
      }
    }

    // Update report status if all reconciled
    if (matched > 0 && failed === 0) {
      await pool.query(
        `UPDATE finance_reports SET status = 'reconciled', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1`,
        [reportId, userId]
      );
    }

    res.json({
      success: true,
      message: `Auto-reconciliation complete: ${matched} matched, ${failed} failed`,
      result: {
        reportId,
        linesProcessed: linesResult.rows.length,
        matched,
        failed
      }
    });

  } catch (error) {
    console.error('[FinanceReports] Reconcile post error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run auto-reconciliation',
      code: 'RECONCILE_ERROR'
    });
  }
});

// ============================================
// GET /api/finance-reports/templates - List Templates
// ============================================

router.get('/templates', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const result = await pool.query(`
      SELECT
        id,
        template_name,
        template_type,
        vendor_name,
        header_pattern,
        times_used,
        avg_confidence,
        last_used_at,
        is_active,
        is_default,
        created_at
      FROM report_templates
      WHERE org_id = $1
      ORDER BY times_used DESC, template_name
    `, [orgId]);

    res.json({
      success: true,
      templates: result.rows.map(t => ({
        id: t.id,
        templateName: t.template_name,
        templateType: t.template_type,
        vendorName: t.vendor_name,
        headerPattern: t.header_pattern,
        timesUsed: t.times_used,
        avgConfidence: t.avg_confidence ? parseFloat(t.avg_confidence) : null,
        lastUsedAt: t.last_used_at,
        isActive: t.is_active,
        isDefault: t.is_default,
        createdAt: t.created_at
      }))
    });

  } catch (error) {
    console.error('[FinanceReports] Templates list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      code: 'TEMPLATES_ERROR'
    });
  }
});

// ============================================
// POST /api/finance-reports/templates - Create/Update Template
// ============================================

router.post('/templates', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = req.body;

    if (!data.template_name) {
      return res.status(400).json({
        success: false,
        error: 'template_name is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // If ID provided, update existing
    if (data.id) {
      await pool.query(`
        UPDATE report_templates SET
          template_name = $3,
          vendor_name = $4,
          header_pattern = $5,
          column_mappings = $6,
          section_markers = $7,
          is_active = $8,
          is_default = $9,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $10
        WHERE id = $1 AND org_id = $2
      `, [
        data.id,
        orgId,
        data.template_name,
        data.vendor_name || null,
        data.header_pattern || null,
        data.column_mappings ? JSON.stringify(data.column_mappings) : '{}',
        data.section_markers ? JSON.stringify(data.section_markers) : '[]',
        data.is_active !== false,
        data.is_default || false,
        userId
      ]);

      res.json({
        success: true,
        message: 'Template updated',
        templateId: data.id
      });

    } else {
      // Create new template
      const result = await pool.query(`
        INSERT INTO report_templates (
          org_id,
          template_name,
          template_type,
          vendor_name,
          header_pattern,
          column_mappings,
          section_markers,
          is_active,
          is_default,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        orgId,
        data.template_name,
        data.template_type || 'finance_report',
        data.vendor_name || null,
        data.header_pattern || null,
        data.column_mappings ? JSON.stringify(data.column_mappings) : '{}',
        data.section_markers ? JSON.stringify(data.section_markers) : '[]',
        data.is_active !== false,
        data.is_default || false,
        userId
      ]);

      res.status(201).json({
        success: true,
        message: 'Template created',
        templateId: result.rows[0].id
      });
    }

  } catch (error) {
    console.error('[FinanceReports] Template save error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save template',
      code: 'TEMPLATE_SAVE_ERROR'
    });
  }
});

// ============================================
// V23.5.0: POST /api/finance-reports/sync - Sync from Google Drive
// ============================================

router.post('/sync', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { folderIds, parseImmediately } = req.body;

    if (!FinanceReportAgent) {
      return res.status(503).json({
        success: false,
        error: 'FinanceReportAgent not available',
        code: 'AGENT_UNAVAILABLE'
      });
    }

    const agent = new FinanceReportAgent({
      orgId,
      userId
    });

    const result = await agent.syncDriveFiles({
      folderIds: folderIds || undefined,
      parseImmediately: parseImmediately || false
    });

    res.json({
      success: result.success,
      message: result.success
        ? `Sync complete: ${result.created_count} new, ${result.updated_count} updated, ${result.skipped_count} skipped`
        : result.error,
      result: {
        created: result.created_count,
        updated: result.updated_count,
        skipped: result.skipped_count,
        total: result.total_files,
        errors: result.errors?.length || 0
      },
      files: result.files,
      errors: result.errors
    });

  } catch (error) {
    console.error('[FinanceReports] Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync from Google Drive',
      code: 'SYNC_ERROR',
      details: error.message
    });
  }
});

// ============================================
// V23.5.0: GET /api/finance-reports/coverage - Period Coverage Check
// ============================================

router.get('/coverage', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { startPeriod, endPeriod } = req.query;

    if (!FinanceReportAgent) {
      return res.status(503).json({
        success: false,
        error: 'FinanceReportAgent not available',
        code: 'AGENT_UNAVAILABLE'
      });
    }

    const agent = new FinanceReportAgent({ orgId });

    const result = await agent.getPeriodCoverage({
      startPeriod: startPeriod || undefined,
      endPeriod: endPeriod || undefined
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        code: 'COVERAGE_ERROR'
      });
    }

    res.json({
      success: true,
      coverage: {
        startPeriod: result.start_period,
        endPeriod: result.end_period,
        totalPeriods: result.total_periods,
        coveredPeriods: result.covered_periods,
        coveragePct: result.coverage_pct.toFixed(1),
        fullyReconciled: result.fully_reconciled,
        missingPeriods: result.missing_periods
      },
      periods: result.periods
    });

  } catch (error) {
    console.error('[FinanceReports] Coverage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get period coverage',
      code: 'COVERAGE_ERROR',
      details: error.message
    });
  }
});

// ============================================
// V23.5.0: POST /api/finance-reports/process-batch - Process Unprocessed Files
// ============================================

router.post('/process-batch', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { batchSize } = req.body;

    if (!FinanceReportAgent) {
      return res.status(503).json({
        success: false,
        error: 'FinanceReportAgent not available',
        code: 'AGENT_UNAVAILABLE'
      });
    }

    const agent = new FinanceReportAgent({
      orgId,
      userId
    });

    const result = await agent.processBatch(batchSize || 10);

    res.json({
      success: true,
      message: `Processed ${result.processed} files: ${result.succeeded} succeeded, ${result.failed} failed`,
      result: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        errors: result.errors
      }
    });

  } catch (error) {
    console.error('[FinanceReports] Process batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process batch',
      code: 'BATCH_ERROR',
      details: error.message
    });
  }
});

// ============================================
// V23.5.0: GET /api/finance-reports/unprocessed - List Unprocessed Files
// ============================================

router.get('/unprocessed', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    if (!FinanceReportAgent) {
      return res.status(503).json({
        success: false,
        error: 'FinanceReportAgent not available',
        code: 'AGENT_UNAVAILABLE'
      });
    }

    const agent = new FinanceReportAgent({ orgId });
    const files = await agent.getUnprocessedFiles();

    res.json({
      success: true,
      count: files.length,
      files: files.map(f => ({
        id: f.id,
        pdfFileId: f.pdf_file_id,
        pdfFileName: f.pdf_file_name,
        pdfFolderId: f.pdf_folder_id,
        createdAt: f.created_at
      }))
    });

  } catch (error) {
    console.error('[FinanceReports] Unprocessed list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list unprocessed files',
      code: 'LIST_ERROR'
    });
  }
});

// ============================================
// GET /api/finance-reports/stats/summary - Statistics
// ============================================

router.get('/stats/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const statsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT fr.id) AS total_reports,
        COUNT(DISTINCT frl.id) AS total_lines,
        COALESCE(SUM(fr.total_amount_cents), 0) AS total_value_cents,
        COUNT(CASE WHEN fr.status = 'new' THEN 1 END) AS new_count,
        COUNT(CASE WHEN fr.status = 'parsed' THEN 1 END) AS parsed_count,
        COUNT(CASE WHEN fr.status = 'reconciled' THEN 1 END) AS reconciled_count,
        COUNT(CASE WHEN fr.status = 'needs_review' THEN 1 END) AS needs_review_count,
        COUNT(CASE WHEN fr.status = 'error' THEN 1 END) AS error_count,
        COUNT(DISTINCT fr.template_id) AS templates_used
      FROM finance_reports fr
      LEFT JOIN finance_report_lines frl ON frl.report_id = fr.id
      WHERE fr.org_id = $1 AND fr.deleted_at IS NULL
    `, [orgId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      stats: {
        totalReports: parseInt(stats.total_reports),
        totalLines: parseInt(stats.total_lines),
        totalValue: centsToDollars(stats.total_value_cents),
        statusCounts: {
          new: parseInt(stats.new_count),
          parsed: parseInt(stats.parsed_count),
          reconciled: parseInt(stats.reconciled_count),
          needs_review: parseInt(stats.needs_review_count),
          error: parseInt(stats.error_count)
        },
        templatesUsed: parseInt(stats.templates_used)
      }
    });

  } catch (error) {
    console.error('[FinanceReports] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      code: 'STATS_ERROR'
    });
  }
});

module.exports = router;
