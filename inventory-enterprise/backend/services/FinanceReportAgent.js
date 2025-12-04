/**
 * FinanceReportAgent - Finance Brain AI Agent
 * NeuroPilot AI Enterprise V23.6.0
 *
 * Responsible for:
 * - Parsing month-end finance reports from Google Drive PDFs
 * - Extracting line items with GL accounts, budgets, actuals, variances
 * - Template learning: detecting and storing report formats
 * - Auto-reconciliation against vendor_orders
 *
 * V23.5.0 Additions:
 * - syncDriveFiles(): Scan Google Drive folders, upsert to finance_reports
 * - getPeriodCoverage(): Analyze fiscal period coverage & reconciliation
 * - processBatch(): Process multiple unprocessed files in batch
 * - getUnprocessedFiles(): List files needing parsing
 *
 * V23.6.0 Additions:
 * - Enhanced confidence scoring with multiple factors
 * - Human review queue integration (finance_questions)
 * - createFinanceQuestion(): Create review question when uncertain
 * - applyOwnerAnswer(): Apply owner's answer to improve parsing
 * - DriveWatch integration for full file tracking
 *
 * Dependencies:
 * - GoogleDriveService: Download PDFs from Google Drive
 * - pdf-parse: Extract text from PDFs
 * - PostgreSQL: Store parsed data
 */

const { Pool } = require('pg');
const GoogleDriveService = require('./GoogleDriveService');
const pdf = require('pdf-parse');
const crypto = require('crypto');

// Lazy-load pool to avoid circular dependency (same pattern as middleware/tenant.js)
let pool = null;
const getPool = () => {
  if (!pool) {
    // Try to get pool from server exports, or create new one
    try {
      pool = require('../db/postgres').pool;
    } catch (e) {
      // Fallback: create pool directly from env
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    }
  }
  return pool;
};

class FinanceReportAgent {
  constructor(options = {}) {
    this.orgId = options.orgId || 'default-org';
    this.siteId = options.siteId || null;
    this.userId = options.userId || 'system';
    this.driveService = null;

    // Parsing configuration
    this.config = {
      minConfidenceThreshold: 0.7,
      maxLinesPerPage: 100,
      amountPattern: /\$?\s*-?[\d,]+\.?\d*/g,
      datePattern: /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/g,
      glAccountPattern: /\d{4,6}(-\d{2,4})?/g,
      ...options.config
    };

    // Known section markers (will be augmented by templates)
    this.sectionMarkers = [
      { text: 'FOOD COST', section: 'Food Cost' },
      { text: 'FOOD EXPENSES', section: 'Food Cost' },
      { text: 'LABOR', section: 'Labor' },
      { text: 'LABOUR', section: 'Labor' },
      { text: 'WAGES', section: 'Labor' },
      { text: 'OVERHEAD', section: 'Overhead' },
      { text: 'UTILITIES', section: 'Utilities' },
      { text: 'SUPPLIES', section: 'Supplies' },
      { text: 'EQUIPMENT', section: 'Equipment' },
      { text: 'MAINTENANCE', section: 'Maintenance' },
      { text: 'ADMINISTRATIVE', section: 'Administrative' },
      { text: 'TOTAL', section: 'Summary' }
    ];
  }

  /**
   * Initialize Google Drive service
   * Uses singleton instance for shared auth across operations
   */
  async initDriveService() {
    if (!this.driveService) {
      // Use singleton instance (imported at top)
      this.driveService = GoogleDriveService;
      await this.driveService.initialize();
    }
    return this.driveService;
  }

  /**
   * Parse a finance report from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @param {Object} options - Parsing options
   * @returns {Object} Parsed report data
   */
  async parseFromGoogleDrive(fileId, options = {}) {
    const pool = getPool();
    const startTime = Date.now();

    try {
      // Initialize Drive service
      await this.initDriveService();

      // Get file metadata
      const fileInfo = await this.driveService.getFileMetadata(fileId);
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }

      console.log(`[FinanceReportAgent] Parsing file: ${fileInfo.name}`);

      // Download PDF content as buffer
      const pdfBuffer = await this.driveService.downloadFileAsBuffer(fileId);
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error(`Failed to download file: ${fileId}`);
      }

      // Parse PDF
      const parseResult = await this.parsePdfBuffer(pdfBuffer, {
        fileName: fileInfo.name,
        fileId: fileId,
        ...options
      });

      // Calculate parsing duration
      parseResult.parse_duration_ms = Date.now() - startTime;
      parseResult.pdf_file_id = fileId;
      parseResult.pdf_file_name = fileInfo.name;
      parseResult.pdf_folder_id = fileInfo.parents?.[0] || null;

      return parseResult;

    } catch (error) {
      console.error('[FinanceReportAgent] Parse error:', error.message);
      return {
        success: false,
        error: error.message,
        parse_duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Parse PDF buffer and extract finance report data
   * @param {Buffer} pdfBuffer - PDF file content
   * @param {Object} options - Parsing options
   * @returns {Object} Parsed report data
   */
  async parsePdfBuffer(pdfBuffer, options = {}) {
    const pool = getPool();

    try {
      // Extract text from PDF
      const pdfData = await pdf(pdfBuffer);
      const text = pdfData.text;
      const pageCount = pdfData.numpages;

      console.log(`[FinanceReportAgent] Extracted ${text.length} chars from ${pageCount} pages`);

      // Try to match against known templates
      const template = await this.findMatchingTemplate(text);

      // Extract header information
      const headerInfo = this.extractHeaderInfo(text, options.fileName);

      // Extract line items
      const lines = template
        ? this.parseWithTemplate(text, template)
        : this.parseGeneric(text);

      // Calculate totals
      const totals = this.calculateTotals(lines);

      // Determine if human review is needed
      const needsReview = this.assessReviewNeeded(lines, headerInfo);

      return {
        success: true,
        report_type: headerInfo.reportType || 'month_end',
        report_name: headerInfo.reportName || options.fileName,
        period_start: headerInfo.periodStart,
        period_end: headerInfo.periodEnd,
        fiscal_period: headerInfo.fiscalPeriod,
        total_lines: lines.length,
        total_amount_cents: totals.totalActualCents,
        currency: headerInfo.currency || 'CAD',
        template_id: template?.id || null,
        template_confidence: template?.confidence || null,
        ocr_confidence: this.calculateOverallConfidence(lines),
        ocr_engine: 'pdf-parse',
        lines: lines,
        needs_review: needsReview.needed,
        review_reason: needsReview.reason,
        raw_text_preview: text.substring(0, 2000)
      };

    } catch (error) {
      console.error('[FinanceReportAgent] PDF parse error:', error.message);
      throw error;
    }
  }

  /**
   * Extract header information from report text
   */
  extractHeaderInfo(text, fileName = '') {
    const info = {
      reportType: 'month_end',
      reportName: null,
      periodStart: null,
      periodEnd: null,
      fiscalPeriod: null,
      currency: 'CAD'
    };

    // Detect report type from keywords
    const upperText = text.toUpperCase();
    if (upperText.includes('WEEKLY') || upperText.includes('WEEK ENDING')) {
      info.reportType = 'week_end';
    } else if (upperText.includes('QUARTERLY') || upperText.includes('Q1') || upperText.includes('Q2') || upperText.includes('Q3') || upperText.includes('Q4')) {
      info.reportType = 'quarter_end';
    } else if (upperText.includes('ANNUAL') || upperText.includes('YEAR END')) {
      info.reportType = 'year_end';
    }

    // Extract dates
    const dateMatches = text.match(this.config.datePattern) || [];
    if (dateMatches.length >= 2) {
      info.periodStart = this.parseDate(dateMatches[0]);
      info.periodEnd = this.parseDate(dateMatches[1]);
    } else if (dateMatches.length === 1) {
      info.periodEnd = this.parseDate(dateMatches[0]);
    }

    // Extract fiscal period (e.g., "January 2025", "P01-2025")
    const monthMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (monthMatch) {
      const monthNum = this.monthToNumber(monthMatch[1]);
      info.fiscalPeriod = `${monthMatch[2]}-${String(monthNum).padStart(2, '0')}`;
    }

    const periodMatch = text.match(/P(\d{1,2})[-\s]?(\d{4})/i);
    if (periodMatch) {
      info.fiscalPeriod = `${periodMatch[2]}-${periodMatch[1].padStart(2, '0')}`;
    }

    // Detect currency
    if (text.includes('USD') || text.includes('US$')) {
      info.currency = 'USD';
    }

    // Report name from first non-empty line or filename
    const firstLines = text.split('\n').slice(0, 5).filter(l => l.trim().length > 5);
    info.reportName = firstLines[0]?.trim() || fileName;

    return info;
  }

  /**
   * Find matching template for this report format
   */
  async findMatchingTemplate(text) {
    const pool = getPool();

    try {
      // Extract potential header row
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const headerCandidates = lines.slice(0, 20);

      // Look for column headers
      const headerPattern = [];
      for (const line of headerCandidates) {
        if (this.looksLikeHeaderRow(line)) {
          headerPattern.push(...line.split(/\s{2,}|\t/).map(h => h.trim().toUpperCase()));
          break;
        }
      }

      if (headerPattern.length === 0) {
        return null;
      }

      // Query for matching template
      const result = await pool.query(`
        SELECT id, template_name, column_mappings, section_markers, avg_confidence
        FROM report_templates
        WHERE org_id = $1
          AND is_active = TRUE
          AND header_pattern && $2::text[]
        ORDER BY times_used DESC, avg_confidence DESC
        LIMIT 1
      `, [this.orgId, headerPattern]);

      if (result.rows.length > 0) {
        const template = result.rows[0];

        // Update usage count
        await pool.query(`
          UPDATE report_templates
          SET times_used = times_used + 1, last_used_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [template.id]);

        return {
          ...template,
          confidence: template.avg_confidence || 0.8
        };
      }

      return null;

    } catch (error) {
      console.error('[FinanceReportAgent] Template lookup error:', error.message);
      return null;
    }
  }

  /**
   * Check if a line looks like a header row
   */
  looksLikeHeaderRow(line) {
    const upperLine = line.toUpperCase();
    const headerKeywords = ['DESCRIPTION', 'BUDGET', 'ACTUAL', 'VARIANCE', 'AMOUNT', 'GL', 'ACCOUNT', 'CATEGORY', 'ITEM'];
    const matchCount = headerKeywords.filter(kw => upperLine.includes(kw)).length;
    return matchCount >= 2;
  }

  /**
   * Parse report using a known template
   */
  parseWithTemplate(text, template) {
    const lines = [];
    const textLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const mappings = template.column_mappings || {};

    let currentSection = null;
    let lineNumber = 0;

    // Get section markers from template or use defaults
    const sectionMarkers = template.section_markers || this.sectionMarkers;

    for (const textLine of textLines) {
      // Check for section markers
      const sectionMatch = this.detectSection(textLine, sectionMarkers);
      if (sectionMatch) {
        currentSection = sectionMatch;
        continue;
      }

      // Skip header-like lines
      if (this.looksLikeHeaderRow(textLine)) {
        continue;
      }

      // Try to parse as data line
      const parsedLine = this.parseDataLine(textLine, mappings, ++lineNumber, currentSection);
      if (parsedLine) {
        lines.push(parsedLine);
      }
    }

    return lines;
  }

  /**
   * Parse report without template (generic parsing)
   */
  parseGeneric(text) {
    const lines = [];
    const textLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentSection = null;
    let lineNumber = 0;
    let inDataSection = false;

    for (const textLine of textLines) {
      // Check for section markers
      const sectionMatch = this.detectSection(textLine, this.sectionMarkers);
      if (sectionMatch) {
        currentSection = sectionMatch;
        inDataSection = true;
        continue;
      }

      // Skip obvious non-data lines
      if (textLine.length < 10) continue;
      if (this.looksLikeHeaderRow(textLine)) {
        inDataSection = true;
        continue;
      }

      // Try to extract amounts from line
      const amounts = this.extractAmounts(textLine);
      if (amounts.length === 0) continue;

      // Parse the line
      const parsedLine = this.parseDataLine(textLine, {}, ++lineNumber, currentSection);
      if (parsedLine) {
        lines.push(parsedLine);
      }
    }

    return lines;
  }

  /**
   * Parse a single data line
   */
  parseDataLine(textLine, mappings, lineNumber, currentSection) {
    // Split line into columns (by multiple spaces or tabs)
    const columns = textLine.split(/\s{2,}|\t/).map(c => c.trim()).filter(c => c.length > 0);

    if (columns.length < 2) return null;

    // Extract amounts from the line
    const amounts = this.extractAmounts(textLine);
    if (amounts.length === 0) return null;

    // Try to identify GL account
    const glMatch = textLine.match(this.config.glAccountPattern);

    // Build line item
    const lineItem = {
      line_number: lineNumber,
      section: currentSection,
      description: columns[0] || 'Unknown Item',
      gl_account: glMatch ? glMatch[0] : null,
      budget_cents: 0,
      actual_cents: 0,
      variance_cents: 0,
      variance_pct: null,
      line_confidence: 0.7,
      raw_text: textLine
    };

    // Assign amounts based on column count
    if (amounts.length >= 3) {
      // Likely: Budget, Actual, Variance
      lineItem.budget_cents = this.dollarsToCents(amounts[0]);
      lineItem.actual_cents = this.dollarsToCents(amounts[1]);
      lineItem.variance_cents = this.dollarsToCents(amounts[2]);
      lineItem.line_confidence = 0.85;
    } else if (amounts.length === 2) {
      // Could be: Budget/Actual or Actual/Variance
      lineItem.actual_cents = this.dollarsToCents(amounts[0]);
      lineItem.variance_cents = this.dollarsToCents(amounts[1]);
      lineItem.line_confidence = 0.75;
    } else if (amounts.length === 1) {
      // Just actual amount
      lineItem.actual_cents = this.dollarsToCents(amounts[0]);
      lineItem.line_confidence = 0.65;
    }

    // Calculate variance percentage
    if (lineItem.budget_cents !== 0) {
      lineItem.variance_pct = ((lineItem.actual_cents - lineItem.budget_cents) / lineItem.budget_cents) * 100;
    }

    return lineItem;
  }

  /**
   * Detect section from text line
   */
  detectSection(line, markers) {
    const upperLine = line.toUpperCase();
    for (const marker of markers) {
      if (upperLine.includes(marker.text.toUpperCase())) {
        return marker.section;
      }
    }
    return null;
  }

  /**
   * Extract monetary amounts from text
   */
  extractAmounts(text) {
    const amounts = [];
    const matches = text.match(this.config.amountPattern) || [];

    for (const match of matches) {
      const cleaned = match.replace(/[$,\s]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && Math.abs(num) > 0.001) {
        amounts.push(num);
      }
    }

    return amounts;
  }

  /**
   * Convert dollars to cents
   */
  dollarsToCents(dollars) {
    return Math.round(dollars * 100);
  }

  /**
   * Calculate totals from parsed lines
   */
  calculateTotals(lines) {
    return {
      totalBudgetCents: lines.reduce((sum, l) => sum + (l.budget_cents || 0), 0),
      totalActualCents: lines.reduce((sum, l) => sum + (l.actual_cents || 0), 0),
      totalVarianceCents: lines.reduce((sum, l) => sum + (l.variance_cents || 0), 0),
      lineCount: lines.length
    };
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence(lines) {
    if (lines.length === 0) return 0;
    const sum = lines.reduce((acc, l) => acc + (l.line_confidence || 0), 0);
    return Math.round((sum / lines.length) * 10000) / 10000;
  }

  /**
   * Assess if human review is needed
   */
  assessReviewNeeded(lines, headerInfo) {
    const reasons = [];

    // Low overall confidence
    const avgConfidence = this.calculateOverallConfidence(lines);
    if (avgConfidence < this.config.minConfidenceThreshold) {
      reasons.push(`Low parsing confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    }

    // No lines extracted
    if (lines.length === 0) {
      reasons.push('No line items extracted');
    }

    // Missing critical info
    if (!headerInfo.periodEnd) {
      reasons.push('Period end date not detected');
    }

    // Large variances
    const largeVariances = lines.filter(l => Math.abs(l.variance_pct || 0) > 50);
    if (largeVariances.length > 5) {
      reasons.push(`${largeVariances.length} items with >50% variance`);
    }

    return {
      needed: reasons.length > 0,
      reason: reasons.join('; ')
    };
  }

  /**
   * Save parsed report to database
   * @param {Object} reportData - Parsed report data
   * @returns {Object} Saved report with ID
   */
  async saveReport(reportData) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert report header
      const reportResult = await client.query(`
        INSERT INTO finance_reports (
          org_id, site_id, report_type, report_name,
          period_start, period_end, fiscal_period,
          pdf_file_id, pdf_file_name, pdf_folder_id,
          total_lines, total_amount_cents, currency,
          template_id, template_confidence,
          ocr_confidence, ocr_engine, parse_duration_ms,
          parsed_at, parsed_by,
          status, needs_review, review_reason,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          CURRENT_TIMESTAMP, $19,
          CASE WHEN $20 THEN 'needs_review' ELSE 'parsed' END,
          $20, $21, $19
        )
        RETURNING id
      `, [
        this.orgId,
        this.siteId,
        reportData.report_type,
        reportData.report_name,
        reportData.period_start,
        reportData.period_end,
        reportData.fiscal_period,
        reportData.pdf_file_id,
        reportData.pdf_file_name,
        reportData.pdf_folder_id,
        reportData.total_lines,
        reportData.total_amount_cents,
        reportData.currency,
        reportData.template_id,
        reportData.template_confidence,
        reportData.ocr_confidence,
        reportData.ocr_engine || 'pdf-parse',
        reportData.parse_duration_ms,
        this.userId,
        reportData.needs_review,
        reportData.review_reason
      ]);

      const reportId = reportResult.rows[0].id;

      // Insert line items
      if (reportData.lines && reportData.lines.length > 0) {
        for (const line of reportData.lines) {
          await client.query(`
            INSERT INTO finance_report_lines (
              report_id, org_id, line_number, section, category,
              description, gl_account,
              budget_cents, actual_cents, variance_cents, variance_pct,
              line_confidence, needs_review, raw_text
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
          `, [
            reportId,
            this.orgId,
            line.line_number,
            line.section,
            line.category || line.section,
            line.description,
            line.gl_account,
            line.budget_cents,
            line.actual_cents,
            line.variance_cents,
            line.variance_pct,
            line.line_confidence,
            line.line_confidence < this.config.minConfidenceThreshold,
            line.raw_text
          ]);
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        report_id: reportId,
        lines_saved: reportData.lines?.length || 0
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[FinanceReportAgent] Save error:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Learn a new template from a validated report
   * @param {string} reportId - Report ID to learn from
   * @param {Object} templateData - Template configuration
   */
  async learnTemplate(reportId, templateData) {
    const pool = getPool();

    try {
      // Get report and lines
      const reportResult = await pool.query(`
        SELECT fr.*, array_agg(DISTINCT frl.raw_text) as sample_lines
        FROM finance_reports fr
        LEFT JOIN finance_report_lines frl ON frl.report_id = fr.id
        WHERE fr.id = $1 AND fr.org_id = $2
        GROUP BY fr.id
      `, [reportId, this.orgId]);

      if (reportResult.rows.length === 0) {
        throw new Error('Report not found');
      }

      const report = reportResult.rows[0];

      // Generate signature hash from column mappings
      const signatureHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(templateData.columnMappings || {}))
        .digest('hex');

      // Insert or update template
      const result = await pool.query(`
        INSERT INTO report_templates (
          org_id, template_name, template_type, vendor_name,
          signature_hash, header_pattern, column_mappings, section_markers,
          is_active, created_by
        ) VALUES (
          $1, $2, 'finance_report', $3, $4, $5, $6, $7, TRUE, $8
        )
        ON CONFLICT (signature_hash) WHERE org_id = $1
        DO UPDATE SET
          template_name = EXCLUDED.template_name,
          column_mappings = EXCLUDED.column_mappings,
          section_markers = EXCLUDED.section_markers,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        this.orgId,
        templateData.name || `Template from ${report.report_name}`,
        templateData.vendorName || null,
        signatureHash,
        templateData.headerPattern || [],
        JSON.stringify(templateData.columnMappings || {}),
        JSON.stringify(templateData.sectionMarkers || this.sectionMarkers),
        this.userId
      ]);

      // Link template to report
      await pool.query(`
        UPDATE finance_reports
        SET template_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [result.rows[0].id, reportId]);

      return {
        success: true,
        template_id: result.rows[0].id
      };

    } catch (error) {
      console.error('[FinanceReportAgent] Learn template error:', error.message);
      throw error;
    }
  }

  /**
   * Auto-reconcile report against vendor orders
   * @param {string} reportId - Report ID to reconcile
   */
  async reconcileReport(reportId) {
    const pool = getPool();

    try {
      // Get unreconciled lines with potential vendor info
      const linesResult = await pool.query(`
        SELECT frl.id, frl.description, frl.vendor_name, frl.invoice_number,
               frl.actual_cents, frl.invoice_date
        FROM finance_report_lines frl
        LEFT JOIN invoice_reconciliation ir ON ir.report_line_id = frl.id
        WHERE frl.report_id = $1
          AND frl.org_id = $2
          AND ir.id IS NULL
      `, [reportId, this.orgId]);

      const results = {
        matched: 0,
        partial: 0,
        unmatched: 0,
        errors: []
      };

      for (const line of linesResult.rows) {
        try {
          // Try auto-reconcile by invoice number
          if (line.invoice_number) {
            const reconcileResult = await pool.query(`
              SELECT auto_reconcile_by_invoice($1, $2, $3, $4)
            `, [line.id, this.orgId, line.invoice_number, line.actual_cents]);

            if (reconcileResult.rows[0].auto_reconcile_by_invoice) {
              results.matched++;
              continue;
            }
          }

          // Try fuzzy match by amount and date range
          const fuzzyResult = await this.fuzzyMatchVendorOrder(line);
          if (fuzzyResult) {
            await pool.query(`
              INSERT INTO invoice_reconciliation (
                org_id, report_line_id, vendor_order_id,
                match_type, match_confidence, match_method,
                report_amount_cents, order_amount_cents, difference_cents,
                status, matched_at
              ) VALUES (
                $1, $2, $3, 'suggested', $4, 'amount_fuzzy',
                $5, $6, ABS($5 - $6),
                CASE WHEN ABS($5 - $6) < 100 THEN 'matched' ELSE 'partial' END,
                CURRENT_TIMESTAMP
              )
            `, [
              this.orgId, line.id, fuzzyResult.order_id,
              fuzzyResult.confidence,
              line.actual_cents, fuzzyResult.amount_cents
            ]);

            if (Math.abs(line.actual_cents - fuzzyResult.amount_cents) < 100) {
              results.matched++;
            } else {
              results.partial++;
            }
          } else {
            results.unmatched++;
          }

        } catch (lineError) {
          results.errors.push({ line_id: line.id, error: lineError.message });
        }
      }

      // Update report status
      const newStatus = results.matched === linesResult.rows.length ? 'reconciled' : 'validated';
      await pool.query(`
        UPDATE finance_reports
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newStatus, reportId]);

      return {
        success: true,
        ...results,
        total_lines: linesResult.rows.length
      };

    } catch (error) {
      console.error('[FinanceReportAgent] Reconcile error:', error.message);
      throw error;
    }
  }

  /**
   * Fuzzy match a line against vendor orders
   */
  async fuzzyMatchVendorOrder(line) {
    const pool = getPool();

    // Search for orders with similar amounts within date range
    const tolerance = Math.max(100, line.actual_cents * 0.05); // 5% or $1

    const result = await pool.query(`
      SELECT id, total_cents, vendor_name, order_number, order_date
      FROM vendor_orders
      WHERE org_id = $1
        AND deleted_at IS NULL
        AND ABS(total_cents - $2) < $3
        ${line.invoice_date ? 'AND order_date BETWEEN $4 - INTERVAL \'30 days\' AND $4 + INTERVAL \'30 days\'' : ''}
      ORDER BY ABS(total_cents - $2) ASC
      LIMIT 1
    `, line.invoice_date
      ? [this.orgId, line.actual_cents, tolerance, line.invoice_date]
      : [this.orgId, line.actual_cents, tolerance]
    );

    if (result.rows.length > 0) {
      const match = result.rows[0];
      const diff = Math.abs(match.total_cents - line.actual_cents);
      const confidence = 1 - (diff / Math.max(line.actual_cents, match.total_cents));

      return {
        order_id: match.id,
        amount_cents: match.total_cents,
        vendor_name: match.vendor_name,
        confidence: Math.max(0.5, Math.min(0.95, confidence))
      };
    }

    return null;
  }

  /**
   * Helper: Parse date string to Date object
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Try ISO format first
    if (dateStr.includes('-')) {
      return new Date(dateStr);
    }

    // Try MM/DD/YYYY or MM/DD/YY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
    }

    return null;
  }

  /**
   * Helper: Convert month name to number
   */
  monthToNumber(monthName) {
    const months = {
      january: 1, february: 2, march: 3, april: 4,
      may: 5, june: 6, july: 7, august: 8,
      september: 9, october: 10, november: 11, december: 12
    };
    return months[monthName.toLowerCase()] || 1;
  }

  // ============================================
  // V23.5.0: Finance Brain Extension Methods
  // ============================================

  /**
   * Sync files from Google Drive folders to finance_reports table
   * Scans configured folders and upserts based on google_file_id
   *
   * @param {Object} options - Sync options
   * @param {string[]} options.folderIds - Array of Google Drive folder IDs to scan
   * @param {boolean} options.parseImmediately - Whether to parse files immediately (default: false)
   * @returns {Object} Sync summary with counts
   */
  async syncDriveFiles(options = {}) {
    const pool = getPool();
    await this.initDriveService();

    const folderIds = options.folderIds || [
      process.env.FINANCE_ORDERS_FOLDER_ID,
      process.env.FINANCE_REPORTS_FOLDER_ID
    ].filter(Boolean);

    if (folderIds.length === 0) {
      return {
        success: false,
        error: 'No folder IDs configured. Set FINANCE_ORDERS_FOLDER_ID or FINANCE_REPORTS_FOLDER_ID.'
      };
    }

    const results = {
      created_count: 0,
      updated_count: 0,
      skipped_count: 0,
      total_files: 0,
      errors: [],
      files: []
    };

    for (const folderId of folderIds) {
      try {
        console.log(`[FinanceReportAgent] Scanning folder: ${folderId}`);

        // List PDF files in folder
        const files = await this.driveService.listFiles(folderId, 'application/pdf');
        results.total_files += files.length;

        for (const file of files) {
          try {
            // Check if file already exists in database
            const existing = await pool.query(`
              SELECT id, pdf_file_name, status, updated_at
              FROM finance_reports
              WHERE org_id = $1 AND pdf_file_id = $2 AND deleted_at IS NULL
            `, [this.orgId, file.id]);

            if (existing.rows.length > 0) {
              const existingReport = existing.rows[0];

              // Check if file was modified since last sync
              const fileModified = new Date(file.modifiedTime);
              const dbUpdated = new Date(existingReport.updated_at);

              if (fileModified > dbUpdated) {
                // Update existing record
                await pool.query(`
                  UPDATE finance_reports
                  SET pdf_file_name = $1,
                      pdf_folder_id = $2,
                      status = CASE WHEN status = 'error' THEN 'new' ELSE status END,
                      updated_at = CURRENT_TIMESTAMP,
                      updated_by = $3
                  WHERE id = $4
                `, [file.name, folderId, this.userId, existingReport.id]);

                results.updated_count++;
                results.files.push({
                  file_id: file.id,
                  name: file.name,
                  action: 'updated',
                  report_id: existingReport.id
                });
              } else {
                results.skipped_count++;
                results.files.push({
                  file_id: file.id,
                  name: file.name,
                  action: 'skipped',
                  reason: 'no_changes'
                });
              }
            } else {
              // Insert new record
              const insertResult = await pool.query(`
                INSERT INTO finance_reports (
                  org_id, site_id, report_type, report_name,
                  pdf_file_id, pdf_file_name, pdf_folder_id,
                  status, created_by
                ) VALUES (
                  $1, $2, 'month_end', $3, $4, $3, $5, 'new', $6
                )
                RETURNING id
              `, [this.orgId, this.siteId, file.name, file.id, folderId, this.userId]);

              results.created_count++;
              results.files.push({
                file_id: file.id,
                name: file.name,
                action: 'created',
                report_id: insertResult.rows[0].id
              });

              // Optionally parse immediately
              if (options.parseImmediately) {
                try {
                  const parseResult = await this.parseFromGoogleDrive(file.id);
                  if (parseResult.success) {
                    await this.saveReport({
                      ...parseResult,
                      pdf_file_id: file.id,
                      pdf_file_name: file.name,
                      pdf_folder_id: folderId
                    });
                  }
                } catch (parseError) {
                  results.errors.push({
                    file_id: file.id,
                    name: file.name,
                    error: `Parse failed: ${parseError.message}`
                  });
                }
              }
            }

          } catch (fileError) {
            results.errors.push({
              file_id: file.id,
              name: file.name,
              error: fileError.message
            });
          }
        }

      } catch (folderError) {
        results.errors.push({
          folder_id: folderId,
          error: `Folder scan failed: ${folderError.message}`
        });
      }
    }

    results.success = results.errors.length === 0;
    console.log(`[FinanceReportAgent] Sync complete: ${results.created_count} created, ${results.updated_count} updated, ${results.skipped_count} skipped`);

    return results;
  }

  /**
   * Get period coverage analysis
   * Checks which fiscal periods have reports and their reconciliation status
   *
   * @param {Object} options - Coverage options
   * @param {string} options.startPeriod - Start fiscal period (e.g., "2024-01")
   * @param {string} options.endPeriod - End fiscal period (e.g., "2025-01")
   * @returns {Object} Coverage analysis
   */
  async getPeriodCoverage(options = {}) {
    const pool = getPool();

    const startPeriod = options.startPeriod || '2024-01';
    const endPeriod = options.endPeriod || new Date().toISOString().slice(0, 7).replace('-', '-');

    try {
      // Get all reports with their reconciliation status
      const reportsResult = await pool.query(`
        SELECT
          fr.fiscal_period,
          fr.report_type,
          fr.status,
          fr.total_lines,
          fr.total_amount_cents,
          COUNT(DISTINCT frl.id) AS line_count,
          COUNT(DISTINCT ir.id) AS reconciled_count,
          COUNT(DISTINCT CASE WHEN ir.status = 'matched' THEN ir.id END) AS matched_count,
          COUNT(DISTINCT CASE WHEN ir.status = 'unmatched' THEN ir.id END) AS unmatched_count
        FROM finance_reports fr
        LEFT JOIN finance_report_lines frl ON frl.report_id = fr.id
        LEFT JOIN invoice_reconciliation ir ON ir.report_line_id = frl.id
        WHERE fr.org_id = $1
          AND fr.deleted_at IS NULL
          AND fr.fiscal_period >= $2
          AND fr.fiscal_period <= $3
        GROUP BY fr.id, fr.fiscal_period, fr.report_type, fr.status, fr.total_lines, fr.total_amount_cents
        ORDER BY fr.fiscal_period DESC
      `, [this.orgId, startPeriod, endPeriod]);

      // Generate expected periods list
      const expectedPeriods = this.generatePeriodRange(startPeriod, endPeriod);

      // Map coverage
      const coverage = {};
      for (const period of expectedPeriods) {
        coverage[period] = {
          period,
          has_report: false,
          reports: [],
          total_amount: 0,
          reconciliation_pct: 0
        };
      }

      // Fill in actual data
      for (const row of reportsResult.rows) {
        if (row.fiscal_period && coverage[row.fiscal_period]) {
          coverage[row.fiscal_period].has_report = true;
          coverage[row.fiscal_period].reports.push({
            type: row.report_type,
            status: row.status,
            lines: row.line_count,
            amount: row.total_amount_cents / 100,
            reconciled: row.reconciled_count,
            matched: row.matched_count,
            unmatched: row.unmatched_count
          });
          coverage[row.fiscal_period].total_amount += (row.total_amount_cents || 0) / 100;

          // Calculate reconciliation percentage
          if (row.line_count > 0) {
            const pct = (row.matched_count / row.line_count) * 100;
            coverage[row.fiscal_period].reconciliation_pct = Math.max(
              coverage[row.fiscal_period].reconciliation_pct,
              pct
            );
          }
        }
      }

      // Calculate summary
      const periods = Object.values(coverage);
      const coveredPeriods = periods.filter(p => p.has_report).length;
      const totalPeriods = periods.length;
      const fullyReconciled = periods.filter(p => p.reconciliation_pct >= 95).length;

      return {
        success: true,
        start_period: startPeriod,
        end_period: endPeriod,
        total_periods: totalPeriods,
        covered_periods: coveredPeriods,
        coverage_pct: totalPeriods > 0 ? (coveredPeriods / totalPeriods) * 100 : 0,
        fully_reconciled: fullyReconciled,
        missing_periods: periods.filter(p => !p.has_report).map(p => p.period),
        periods: coverage
      };

    } catch (error) {
      console.error('[FinanceReportAgent] Coverage check error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Helper: Generate list of fiscal periods between start and end
   */
  generatePeriodRange(startPeriod, endPeriod) {
    const periods = [];
    const [startYear, startMonth] = startPeriod.split('-').map(Number);
    const [endYear, endMonth] = endPeriod.split('-').map(Number);

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      periods.push(`${year}-${String(month).padStart(2, '0')}`);
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    return periods;
  }

  /**
   * Get unprocessed files that need parsing
   * @returns {Array} List of files with status 'new'
   */
  async getUnprocessedFiles() {
    const pool = getPool();

    const result = await pool.query(`
      SELECT id, pdf_file_id, pdf_file_name, pdf_folder_id, created_at
      FROM finance_reports
      WHERE org_id = $1
        AND deleted_at IS NULL
        AND status = 'new'
      ORDER BY created_at ASC
      LIMIT 50
    `, [this.orgId]);

    return result.rows;
  }

  /**
   * Process a batch of unprocessed files
   * @param {number} batchSize - Number of files to process (default: 10)
   * @returns {Object} Processing results
   */
  async processBatch(batchSize = 10) {
    const pool = getPool();
    const files = await this.getUnprocessedFiles();
    const batch = files.slice(0, batchSize);

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const file of batch) {
      results.processed++;

      try {
        // Mark as parsing
        await pool.query(`
          UPDATE finance_reports
          SET status = 'parsing', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [file.id]);

        // Parse the file
        const parseResult = await this.parseFromGoogleDrive(file.pdf_file_id);

        if (parseResult.success) {
          // Update report with parsed data
          await pool.query(`
            UPDATE finance_reports
            SET
              report_type = $1,
              report_name = COALESCE($2, report_name),
              period_start = $3,
              period_end = $4,
              fiscal_period = $5,
              total_lines = $6,
              total_amount_cents = $7,
              currency = $8,
              template_id = $9,
              template_confidence = $10,
              ocr_confidence = $11,
              ocr_engine = $12,
              parse_duration_ms = $13,
              parsed_at = CURRENT_TIMESTAMP,
              parsed_by = $14,
              status = CASE WHEN $15 THEN 'needs_review' ELSE 'parsed' END,
              needs_review = $15,
              review_reason = $16,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $17
          `, [
            parseResult.report_type,
            parseResult.report_name,
            parseResult.period_start,
            parseResult.period_end,
            parseResult.fiscal_period,
            parseResult.total_lines,
            parseResult.total_amount_cents,
            parseResult.currency,
            parseResult.template_id,
            parseResult.template_confidence,
            parseResult.ocr_confidence,
            parseResult.ocr_engine,
            parseResult.parse_duration_ms,
            this.userId,
            parseResult.needs_review,
            parseResult.review_reason,
            file.id
          ]);

          // Save line items
          if (parseResult.lines && parseResult.lines.length > 0) {
            for (const line of parseResult.lines) {
              await pool.query(`
                INSERT INTO finance_report_lines (
                  report_id, org_id, line_number, section, category,
                  description, gl_account,
                  budget_cents, actual_cents, variance_cents, variance_pct,
                  line_confidence, needs_review, raw_text
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
                ON CONFLICT DO NOTHING
              `, [
                file.id,
                this.orgId,
                line.line_number,
                line.section,
                line.category || line.section,
                line.description,
                line.gl_account,
                line.budget_cents,
                line.actual_cents,
                line.variance_cents,
                line.variance_pct,
                line.line_confidence,
                line.line_confidence < this.config.minConfidenceThreshold,
                line.raw_text
              ]);
            }
          }

          results.succeeded++;
        } else {
          // Mark as error
          await pool.query(`
            UPDATE finance_reports
            SET status = 'error', error_message = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [parseResult.error, file.id]);

          results.failed++;
          results.errors.push({
            report_id: file.id,
            file_name: file.pdf_file_name,
            error: parseResult.error
          });
        }

      } catch (error) {
        // Mark as error
        await pool.query(`
          UPDATE finance_reports
          SET status = 'error', error_message = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [error.message, file.id]);

        results.failed++;
        results.errors.push({
          report_id: file.id,
          file_name: file.pdf_file_name,
          error: error.message
        });
      }
    }

    return results;
  }

  // ============================================
  // V23.6.0: Enhanced Confidence & Human Review
  // ============================================

  /**
   * Confidence thresholds (configurable via env)
   */
  static get CONFIDENCE_THRESHOLDS() {
    return {
      OK: parseFloat(process.env.FINANCE_CONFIDENCE_OK || '0.8'),
      WARN: parseFloat(process.env.FINANCE_CONFIDENCE_WARN || '0.5'),
      LOW: parseFloat(process.env.FINANCE_CONFIDENCE_LOW || '0.3')
    };
  }

  /**
   * Compute comprehensive confidence score for a parse result
   * Considers multiple factors:
   * - Template match
   * - Vendor detection
   * - Header totals alignment
   * - Line parsing success rate
   * - Period detection
   *
   * @param {Object} parseResult - Result from parsePdfBuffer
   * @param {Object} context - Additional context
   * @returns {Object} Confidence details
   */
  computeConfidenceScore(parseResult, context = {}) {
    const scores = {
      template: 0,
      vendor: 0,
      totals: 0,
      lines: 0,
      period: 0
    };
    const weights = {
      template: 0.30,
      vendor: 0.15,
      totals: 0.25,
      lines: 0.20,
      period: 0.10
    };
    const issues = [];

    // Template match score
    if (parseResult.template_id) {
      scores.template = parseResult.template_confidence || 0.8;
    } else {
      issues.push('No matching template found');
    }

    // Vendor detection score
    if (context.detectedVendor || parseResult.detected_vendor) {
      scores.vendor = 1.0;
    } else {
      scores.vendor = 0;
      issues.push('Vendor could not be detected');
    }

    // Header totals alignment score
    if (parseResult.lines && parseResult.lines.length > 0) {
      const calculatedTotal = parseResult.lines.reduce((sum, l) => sum + (l.actual_cents || 0), 0);
      const headerTotal = parseResult.total_amount_cents || 0;

      if (headerTotal > 0) {
        const diff = Math.abs(calculatedTotal - headerTotal);
        const pctDiff = diff / headerTotal;

        if (pctDiff < 0.01) {
          scores.totals = 1.0;
        } else if (pctDiff < 0.05) {
          scores.totals = 0.8;
        } else if (pctDiff < 0.10) {
          scores.totals = 0.5;
          issues.push(`Totals differ by ${(pctDiff * 100).toFixed(1)}%`);
        } else {
          scores.totals = 0.2;
          issues.push(`Totals differ significantly (${(pctDiff * 100).toFixed(1)}%)`);
        }
      } else {
        scores.totals = 0.5; // Can't verify, neutral score
      }
    }

    // Line parsing success rate
    if (parseResult.lines && parseResult.lines.length > 0) {
      const avgLineConfidence = parseResult.lines.reduce((sum, l) => sum + (l.line_confidence || 0.5), 0) / parseResult.lines.length;
      scores.lines = avgLineConfidence;

      if (avgLineConfidence < 0.6) {
        issues.push(`Low average line confidence: ${(avgLineConfidence * 100).toFixed(0)}%`);
      }
    } else {
      scores.lines = 0;
      issues.push('No line items extracted');
    }

    // Period detection score
    if (parseResult.fiscal_period || parseResult.period_end) {
      scores.period = 1.0;
    } else {
      scores.period = 0;
      issues.push('Period could not be detected');
    }

    // Calculate weighted overall score
    let overallScore = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      overallScore += scores[factor] * weight;
    }

    // Determine status based on thresholds
    const thresholds = FinanceReportAgent.CONFIDENCE_THRESHOLDS;
    let status = 'parsed_ok';
    let needsHumanReview = false;

    if (overallScore < thresholds.LOW) {
      status = 'parse_failed';
      needsHumanReview = true;
    } else if (overallScore < thresholds.WARN) {
      status = 'parsed_with_warnings';
      needsHumanReview = true;
    } else if (overallScore < thresholds.OK) {
      status = 'parsed_with_warnings';
    }

    return {
      overall: Math.round(overallScore * 10000) / 10000,
      scores,
      weights,
      status,
      needsHumanReview,
      issues,
      thresholds
    };
  }

  /**
   * Create a finance question when the system is uncertain
   *
   * @param {Object} options - Question options
   * @param {UUID} options.financeReportId - Report ID
   * @param {number} options.driveWatchId - DriveWatch ID (optional)
   * @param {string} options.googleFileId - Google file ID
   * @param {string} options.questionType - Type of question
   * @param {string} options.questionText - Human-readable question
   * @param {string} options.systemGuess - System's best guess
   * @param {number} options.confidence - System's confidence in guess
   * @param {Array} options.options - Possible answers
   * @param {Object} options.context - Additional context
   * @returns {Object} Created question
   */
  async createFinanceQuestion(options) {
    const pool = getPool();

    const {
      financeReportId,
      driveWatchId,
      googleFileId,
      questionType,
      questionText,
      systemGuess,
      confidence,
      options: answerOptions,
      context = {},
      priority = 'normal'
    } = options;

    try {
      // Get file/vendor/period context from related records
      let vendor = context.vendor;
      let period = context.period;
      let fileName = context.fileName;

      if (financeReportId && (!vendor || !fileName)) {
        const reportResult = await pool.query(`
          SELECT pdf_file_name, detected_vendor, fiscal_period
          FROM finance_reports
          WHERE id = $1
        `, [financeReportId]);

        if (reportResult.rows.length > 0) {
          const report = reportResult.rows[0];
          fileName = fileName || report.pdf_file_name;
          vendor = vendor || report.detected_vendor;
          period = period || report.fiscal_period;
        }
      }

      // Insert question
      const result = await pool.query(`
        INSERT INTO finance_questions (
          org_id, question_type, question_text,
          google_file_id, finance_report_id, drive_watch_id,
          vendor, period, file_name,
          system_guess, system_confidence, options,
          question_context, priority, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        RETURNING question_id, created_at
      `, [
        this.orgId,
        questionType,
        questionText,
        googleFileId,
        financeReportId,
        driveWatchId,
        vendor,
        period,
        fileName,
        systemGuess,
        confidence,
        answerOptions ? JSON.stringify(answerOptions) : null,
        JSON.stringify(context),
        priority,
        'FinanceReportAgent'
      ]);

      const question = result.rows[0];

      // Record in history
      await pool.query(`
        INSERT INTO finance_question_history (
          question_id, action, actor, new_status, payload
        ) VALUES ($1, 'created', 'FinanceReportAgent', 'open', $2)
      `, [
        question.question_id,
        JSON.stringify({ questionType, fileName, vendor })
      ]);

      // Update finance_report if linked
      if (financeReportId) {
        await pool.query(`
          UPDATE finance_reports
          SET needs_human_review = TRUE,
              process_status = 'needs_question',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [financeReportId]);
      }

      // Update drive_files_watch if linked
      if (driveWatchId) {
        await pool.query(`
          UPDATE drive_files_watch
          SET process_status = 'needs_question'
          WHERE id = $1
        `, [driveWatchId]);
      }

      console.log(`[FinanceReportAgent] Created question ${question.question_id} (${questionType})`);

      return {
        success: true,
        questionId: question.question_id,
        createdAt: question.created_at
      };

    } catch (error) {
      console.error('[FinanceReportAgent] Create question error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get open questions for this org
   * @param {Object} filters - Optional filters
   * @returns {Array} Open questions
   */
  async getOpenQuestions(filters = {}) {
    const pool = getPool();

    const { questionType, vendor, limit = 50 } = filters;

    let whereClause = 'WHERE fq.org_id = $1 AND fq.status = \'open\'';
    const params = [this.orgId];
    let paramIndex = 2;

    if (questionType) {
      whereClause += ` AND fq.question_type = $${paramIndex++}`;
      params.push(questionType);
    }
    if (vendor) {
      whereClause += ` AND fq.vendor = $${paramIndex++}`;
      params.push(vendor);
    }

    try {
      const result = await pool.query(`
        SELECT
          fq.question_id,
          fq.created_at,
          fq.question_type,
          fq.question_text,
          fq.vendor,
          fq.period,
          fq.file_name,
          fq.google_file_id,
          fq.finance_report_id,
          fq.drive_watch_id,
          fq.system_guess,
          fq.system_confidence,
          fq.options,
          fq.priority,
          fr.total_amount_cents / 100.0 as report_total_amount,
          fr.total_lines as report_line_count
        FROM finance_questions fq
        LEFT JOIN finance_reports fr ON fq.finance_report_id = fr.id
        ${whereClause}
        ORDER BY
          CASE fq.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END,
          fq.created_at ASC
        LIMIT $${paramIndex}
      `, [...params, limit]);

      return result.rows;

    } catch (error) {
      console.error('[FinanceReportAgent] Get questions error:', error.message);
      return [];
    }
  }

  /**
   * Get a single question by ID
   * @param {number} questionId
   * @returns {Object} Question details
   */
  async getQuestionById(questionId) {
    const pool = getPool();

    try {
      const result = await pool.query(`
        SELECT
          fq.*,
          fr.report_name,
          fr.pdf_file_name,
          fr.total_amount_cents,
          fr.total_lines,
          fr.fiscal_period,
          fr.status as report_status,
          dfw.google_file_name as watch_file_name,
          dfw.detected_vendor as watch_vendor
        FROM finance_questions fq
        LEFT JOIN finance_reports fr ON fq.finance_report_id = fr.id
        LEFT JOIN drive_files_watch dfw ON fq.drive_watch_id = dfw.id
        WHERE fq.question_id = $1 AND fq.org_id = $2
      `, [questionId, this.orgId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[FinanceReportAgent] Get question error:', error.message);
      return null;
    }
  }

  /**
   * Apply owner's answer to a question
   * Updates related records based on the answer type
   *
   * @param {number} questionId - Question ID
   * @param {string} answer - Text answer
   * @param {Object} answerPayload - Structured answer data
   * @param {string} answeredBy - User ID
   * @returns {Object} Result
   */
  async applyOwnerAnswer(questionId, answer, answerPayload, answeredBy) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get question details
      const questionResult = await client.query(`
        SELECT * FROM finance_questions
        WHERE question_id = $1 AND org_id = $2
      `, [questionId, this.orgId]);

      if (questionResult.rows.length === 0) {
        throw new Error('Question not found');
      }

      const question = questionResult.rows[0];

      // Update question status
      await client.query(`
        UPDATE finance_questions
        SET
          status = 'answered',
          owner_answer = $1,
          answer_payload = $2,
          answered_by = $3,
          resolved_at = CURRENT_TIMESTAMP
        WHERE question_id = $4
      `, [answer, JSON.stringify(answerPayload), answeredBy, questionId]);

      // Record in history
      await client.query(`
        INSERT INTO finance_question_history (
          question_id, action, actor, old_status, new_status, payload
        ) VALUES ($1, 'answered', $2, 'open', 'answered', $3)
      `, [questionId, answeredBy, JSON.stringify({ answer, payload: answerPayload })]);

      // Apply answer based on question type
      const updates = await this.applyAnswerByType(client, question, answerPayload);

      await client.query('COMMIT');

      console.log(`[FinanceReportAgent] Applied answer to question ${questionId}`);

      return {
        success: true,
        questionId,
        appliedUpdates: updates
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[FinanceReportAgent] Apply answer error:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Apply answer based on question type
   * @param {Object} client - DB client
   * @param {Object} question - Question record
   * @param {Object} payload - Answer payload
   * @returns {Object} Applied updates
   */
  async applyAnswerByType(client, question, payload) {
    const updates = { updated: [] };

    switch (question.question_type) {
      case 'unknown_vendor':
        if (payload.correct_vendor && question.finance_report_id) {
          await client.query(`
            UPDATE finance_reports
            SET detected_vendor = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [payload.correct_vendor, question.finance_report_id]);
          updates.updated.push('finance_reports.detected_vendor');
        }
        if (payload.correct_vendor && question.drive_watch_id) {
          await client.query(`
            UPDATE drive_files_watch
            SET detected_vendor = $1
            WHERE id = $2
          `, [payload.correct_vendor, question.drive_watch_id]);
          updates.updated.push('drive_files_watch.detected_vendor');
        }
        break;

      case 'unknown_period':
        if (payload.correct_period && question.finance_report_id) {
          await client.query(`
            UPDATE finance_reports
            SET fiscal_period = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [payload.correct_period, question.finance_report_id]);
          updates.updated.push('finance_reports.fiscal_period');
        }
        if (payload.correct_period && question.drive_watch_id) {
          await client.query(`
            UPDATE drive_files_watch
            SET period_hint = $1
            WHERE id = $2
          `, [payload.correct_period, question.drive_watch_id]);
          updates.updated.push('drive_files_watch.period_hint');
        }
        break;

      case 'unknown_template':
        if (payload.template_corrections && question.finance_report_id) {
          // Learn new template from corrections
          const templateData = {
            name: payload.template_name || `Template from Q${question.question_id}`,
            vendorName: payload.vendor || question.vendor,
            columnMappings: payload.column_mappings || {},
            headerPattern: payload.header_pattern || []
          };
          await this.learnTemplate(question.finance_report_id, templateData);
          updates.updated.push('report_templates');

          // Optionally trigger re-parse
          if (payload.reparse) {
            updates.reparse_requested = true;
          }
        }
        break;

      case 'misclassified_file_type':
        if (payload.correct_file_type) {
          if (question.finance_report_id) {
            await client.query(`
              UPDATE finance_reports
              SET file_type = $1, report_type = $2, updated_at = CURRENT_TIMESTAMP
              WHERE id = $3
            `, [
              payload.correct_file_type,
              payload.correct_file_type === 'vendor_invoice' ? 'custom' : 'month_end',
              question.finance_report_id
            ]);
            updates.updated.push('finance_reports.file_type');
          }
          if (question.drive_watch_id) {
            await client.query(`
              UPDATE drive_files_watch
              SET file_type = $1
              WHERE id = $2
            `, [payload.correct_file_type, question.drive_watch_id]);
            updates.updated.push('drive_files_watch.file_type');
          }
        }
        break;

      case 'low_confidence':
        // Mark as reviewed/validated
        if (payload.confirmed_correct && question.finance_report_id) {
          await client.query(`
            UPDATE finance_reports
            SET status = 'validated',
                needs_human_review = FALSE,
                process_status = 'parsed_ok',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [question.finance_report_id]);
          updates.updated.push('finance_reports.status');
        } else if (payload.corrections && question.finance_report_id) {
          // Apply manual corrections
          await client.query(`
            UPDATE finance_reports
            SET metadata = metadata || $1,
                needs_human_review = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [JSON.stringify({ manual_corrections: payload.corrections }), question.finance_report_id]);
          updates.updated.push('finance_reports.metadata');
        }
        break;

      case 'bad_totals':
        if (payload.correct_total_cents && question.finance_report_id) {
          await client.query(`
            UPDATE finance_reports
            SET total_amount_cents = $1,
                metadata = metadata || '{"totals_manually_corrected": true}'::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [payload.correct_total_cents, question.finance_report_id]);
          updates.updated.push('finance_reports.total_amount_cents');
        }
        break;

      default:
        // Generic update: clear review flag if confirmed
        if (payload.confirmed_reviewed && question.finance_report_id) {
          await client.query(`
            UPDATE finance_reports
            SET needs_human_review = FALSE,
                process_status = CASE WHEN process_status = 'needs_question' THEN 'parsed_ok' ELSE process_status END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [question.finance_report_id]);
          updates.updated.push('finance_reports.needs_human_review');
        }
    }

    return updates;
  }

  /**
   * Auto-create questions for a low-confidence parse result
   * @param {Object} parseResult - Parse result
   * @param {Object} confidenceDetails - From computeConfidenceScore
   * @param {Object} context - File context
   */
  async createQuestionsForLowConfidence(parseResult, confidenceDetails, context) {
    const questions = [];

    // Create question for each major issue
    for (const issue of confidenceDetails.issues) {
      let questionType = 'other';
      let questionText = issue;
      let systemGuess = null;
      let options = null;

      // Determine question type from issue
      if (issue.includes('template')) {
        questionType = 'unknown_template';
        questionText = `No matching template found for this document. The system detected ${parseResult.total_lines || 0} line items but cannot confidently map the columns.`;
        systemGuess = 'This appears to be a finance report but the layout is unfamiliar.';
      } else if (issue.includes('Vendor')) {
        questionType = 'unknown_vendor';
        questionText = `Cannot identify the vendor for file: ${context.fileName}`;
        options = ['GFS', 'Sysco', 'US Foods', 'Costco', 'Other'];
      } else if (issue.includes('Period')) {
        questionType = 'unknown_period';
        questionText = `Cannot determine the fiscal period for this report.`;
        systemGuess = parseResult.fiscal_period || 'Unknown';
      } else if (issue.includes('Totals')) {
        questionType = 'bad_totals';
        questionText = issue;
        systemGuess = `Calculated: $${(parseResult.total_amount_cents / 100).toFixed(2)}`;
      } else if (issue.includes('line')) {
        questionType = 'low_confidence';
        questionText = issue;
      }

      const result = await this.createFinanceQuestion({
        financeReportId: context.financeReportId,
        driveWatchId: context.driveWatchId,
        googleFileId: context.googleFileId,
        questionType,
        questionText,
        systemGuess,
        confidence: confidenceDetails.overall,
        options,
        context: {
          fileName: context.fileName,
          vendor: context.vendor,
          period: context.period,
          issue
        },
        priority: confidenceDetails.overall < 0.3 ? 'high' : 'normal'
      });

      if (result.success) {
        questions.push(result.questionId);
      }
    }

    return questions;
  }

  /**
   * Process file with confidence evaluation and question creation
   * Enhanced version of processBatch that includes DriveWatch integration
   *
   * @param {number} watchId - drive_files_watch ID
   * @returns {Object} Processing result
   */
  async processWatchedFile(watchId) {
    const pool = getPool();

    try {
      // Get file info from drive_files_watch
      const fileResult = await pool.query(`
        SELECT
          dfw.*,
          fr.id as finance_report_id,
          fr.status as report_status
        FROM drive_files_watch dfw
        LEFT JOIN finance_reports fr ON dfw.finance_report_id = fr.id
        WHERE dfw.id = $1 AND dfw.org_id = $2
      `, [watchId, this.orgId]);

      if (fileResult.rows.length === 0) {
        return { success: false, error: 'File not found' };
      }

      const file = fileResult.rows[0];

      // Update status to processing
      await pool.query(`
        UPDATE drive_files_watch
        SET process_status = 'processing', process_attempts = process_attempts + 1
        WHERE id = $1
      `, [watchId]);

      // Parse the file
      const parseResult = await this.parseFromGoogleDrive(file.google_file_id);

      if (!parseResult.success) {
        // Mark as failed
        await pool.query(`
          UPDATE drive_files_watch
          SET process_status = 'parse_failed', error_message = $1, last_processed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [parseResult.error, watchId]);

        return { success: false, error: parseResult.error };
      }

      // Compute confidence score
      const confidenceDetails = this.computeConfidenceScore(parseResult, {
        detectedVendor: file.detected_vendor,
        fileName: file.google_file_name
      });

      // Update finance_report with parsed data
      let reportId = file.finance_report_id;
      if (reportId) {
        await pool.query(`
          UPDATE finance_reports
          SET
            report_type = $1,
            report_name = COALESCE($2, report_name),
            period_start = $3,
            period_end = $4,
            fiscal_period = $5,
            total_lines = $6,
            total_amount_cents = $7,
            currency = $8,
            template_id = $9,
            template_confidence = $10,
            ocr_confidence = $11,
            confidence = $12,
            process_status = $13,
            needs_human_review = $14,
            last_processed_at = CURRENT_TIMESTAMP,
            parsed_at = CURRENT_TIMESTAMP,
            parsed_by = $15,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $16
        `, [
          parseResult.report_type,
          parseResult.report_name,
          parseResult.period_start,
          parseResult.period_end,
          parseResult.fiscal_period,
          parseResult.total_lines,
          parseResult.total_amount_cents,
          parseResult.currency,
          parseResult.template_id,
          parseResult.template_confidence,
          parseResult.ocr_confidence,
          confidenceDetails.overall,
          confidenceDetails.status,
          confidenceDetails.needsHumanReview,
          this.userId,
          reportId
        ]);
      }

      // Update drive_files_watch
      await pool.query(`
        UPDATE drive_files_watch
        SET
          process_status = $1,
          confidence = $2,
          last_processed_at = CURRENT_TIMESTAMP,
          error_message = NULL
        WHERE id = $3
      `, [confidenceDetails.status, confidenceDetails.overall, watchId]);

      // Create questions if needed
      let questionIds = [];
      if (confidenceDetails.needsHumanReview && confidenceDetails.issues.length > 0) {
        questionIds = await this.createQuestionsForLowConfidence(parseResult, confidenceDetails, {
          financeReportId: reportId,
          driveWatchId: watchId,
          googleFileId: file.google_file_id,
          fileName: file.google_file_name,
          vendor: file.detected_vendor,
          period: file.period_hint
        });
      }

      return {
        success: true,
        watchId,
        reportId,
        confidence: confidenceDetails.overall,
        status: confidenceDetails.status,
        needsHumanReview: confidenceDetails.needsHumanReview,
        issues: confidenceDetails.issues,
        questionsCreated: questionIds.length,
        linesParsed: parseResult.total_lines
      };

    } catch (error) {
      console.error('[FinanceReportAgent] Process watched file error:', error.message);

      // Mark as failed
      await pool.query(`
        UPDATE drive_files_watch
        SET process_status = 'parse_failed', error_message = $1, last_processed_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [error.message, watchId]);

      return { success: false, error: error.message };
    }
  }
}

module.exports = FinanceReportAgent;
