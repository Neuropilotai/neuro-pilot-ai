/**
 * PDF Import Service with OCR and Idempotency
 *
 * Handles financial document import with:
 * - SHA256-based deduplication
 * - OCR text extraction
 * - Line item parsing
 * - Vendor category mapping
 * - Reconciliation record creation
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../config/logger');
const ocrEngine = require('../ocr/TesseractOCR');
const { validateDocument } = require('../../src/finance/FinanceGuardrails');

class PDFImportService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Import PDF documents from directory or file list
   *
   * @param {Object} options
   * @param {string} [options.directory] - Directory path
   * @param {Array<string>} [options.files] - Array of file paths
   * @param {string} options.tenant_id - Tenant ID
   * @param {string} [options.location_id] - Location ID
   * @param {string} options.created_by - User email
   * @param {boolean} [options.skipOCR=false] - Skip OCR even if enabled
   * @returns {Promise<Object>} Import results
   */
  async importDocuments(options) {
    const {
      directory,
      files: fileList,
      tenant_id,
      location_id,
      created_by,
      skipOCR = false
    } = options;

    const startTime = Date.now();
    const results = {
      import_id: this.generateImportId(),
      imported: [],
      skipped: [],
      errors: [],
      summary: {
        total_files: 0,
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        total_value: 0,
        vendors: new Set(),
        unmapped_lines: 0
      }
    };

    try {
      // Get list of PDF files to process
      let pdfFiles = [];

      if (directory) {
        pdfFiles = await this.findPDFsInDirectory(directory);
      } else if (fileList && Array.isArray(fileList)) {
        pdfFiles = fileList;
      } else {
        throw new Error('Must provide either directory or files array');
      }

      results.summary.total_files = pdfFiles.length;

      logger.info('PDFImport: Starting import', {
        import_id: results.import_id,
        total_files: pdfFiles.length,
        tenant_id,
        skipOCR
      });

      // Process each PDF
      for (const filePath of pdfFiles) {
        try {
          const result = await this.importSingleDocument({
            filePath,
            tenant_id,
            location_id,
            created_by,
            skipOCR,
            import_id: results.import_id
          });

          if (result.imported) {
            results.imported.push(result);
            results.summary.imported_count++;
            results.summary.total_value += result.invoice_total || 0;
            if (result.vendor) {
              results.summary.vendors.add(result.vendor);
            }
            results.summary.unmapped_lines += result.unmapped_lines || 0;
          } else if (result.skipped) {
            results.skipped.push(result);
            results.summary.skipped_count++;
          }

        } catch (error) {
          logger.error('PDFImport: Failed to import document', {
            filePath,
            error: error.message
          });

          results.errors.push({
            file: filePath,
            error: error.message
          });
          results.summary.error_count++;
        }
      }

      // Convert vendors Set to Array
      results.summary.vendors = Array.from(results.summary.vendors);

      const duration = Date.now() - startTime;

      logger.info('PDFImport: Import complete', {
        import_id: results.import_id,
        imported: results.summary.imported_count,
        skipped: results.summary.skipped_count,
        errors: results.summary.error_count,
        duration_ms: duration
      });

      results.duration_ms = duration;

      return results;

    } catch (error) {
      logger.error('PDFImport: Import failed', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Import single PDF document
   */
  async importSingleDocument(options) {
    const {
      filePath,
      tenant_id,
      location_id,
      created_by,
      skipOCR,
      import_id
    } = options;

    // Read file
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const fileSize = fileBuffer.length;

    // Compute SHA256 for idempotency
    const sha256 = this.computeSHA256(fileBuffer);

    // Check if already imported
    const existing = await this.db.get(`
      SELECT document_id, status, invoice_number, invoice_date
      FROM documents
      WHERE tenant_id = ? AND sha256 = ?
    `, [tenant_id, sha256]);

    if (existing) {
      logger.debug('PDFImport: Document already imported', {
        sha256,
        document_id: existing.document_id,
        invoice: existing.invoice_number
      });

      return {
        skipped: true,
        reason: 'already_imported',
        sha256,
        existing_document_id: existing.document_id,
        file: fileName
      };
    }

    // Generate document ID
    const document_id = this.generateDocumentId();

    // Perform OCR or text extraction
    let text = '';
    let ocr_confidence = 0;
    let ocr_engine_name = 'none';
    let ocr_duration_ms = 0;

    if (!skipOCR) {
      const ocrResult = await ocrEngine.extractTextFromPDF(filePath);
      text = ocrResult.text || '';
      ocr_confidence = ocrResult.confidence || 0;
      ocr_engine_name = ocrResult.engine || 'none';
      ocr_duration_ms = ocrResult.duration_ms || 0;
    }

    // Parse invoice metadata from text
    const metadata = this.parseInvoiceMetadata(text, fileName);

    // Extract line items from text (do this before validation)
    const lineItems = this.extractLineItems(text, document_id, tenant_id);

    // v15.5: Run finance guardrails validation
    const validationResult = await validateDocument(this.db, {
      vendor: metadata.vendor,
      invoice_number: metadata.invoice_number,
      invoice_date: metadata.invoice_date,
      invoice_total: metadata.invoice_total,
      subtotal: metadata.subtotal,
      tax_amount: metadata.tax_amount,
      gst: null, // Not extracted yet
      qst: null, // Not extracted yet
      is_credit_note: false,
      tenant_id
    }, lineItems, {
      skipDuplicateCheck: false,
      skipVendorCheck: false
    });

    // Log validation warnings (but don't block import)
    if (validationResult.warnings.length > 0) {
      logger.warn('PDFImport: Validation warnings', {
        document_id,
        file: fileName,
        warnings: validationResult.warnings
      });
    }

    // If validation fails with errors, still import but mark status as needing review
    let initialStatus = 'ocr_complete';
    let error_message = null;

    if (!validationResult.valid) {
      logger.error('PDFImport: Validation errors', {
        document_id,
        file: fileName,
        errors: validationResult.errors
      });
      initialStatus = 'error';
      error_message = validationResult.errors.join('; ');
    }

    // Insert document record
    await this.db.run(`
      INSERT INTO documents (
        document_id, tenant_id, location_id, vendor, vendor_normalized,
        invoice_date, invoice_number, invoice_total, tax_amount, subtotal,
        sha256, file_name, file_size_bytes, mime_type, source_path,
        text, ocr_confidence, ocr_engine, ocr_duration_ms,
        status, error_message, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      document_id, tenant_id, location_id,
      metadata.vendor, this.normalizeVendor(metadata.vendor),
      metadata.invoice_date, metadata.invoice_number,
      metadata.invoice_total, metadata.tax_amount, metadata.subtotal,
      sha256, fileName, fileSize, 'application/pdf', filePath,
      text, ocr_confidence, ocr_engine_name, ocr_duration_ms,
      initialStatus, error_message, created_by
    ]);

    // Apply vendor category mapping rules
    const mappedItems = await this.applyMappingRules(lineItems, metadata.vendor, tenant_id);

    // Insert line items
    let unmapped_count = 0;
    for (const item of mappedItems) {
      await this.db.run(`
        INSERT INTO document_line_items (
          document_id, tenant_id, line_number, raw_text, description,
          quantity, unit_price, amount, unit,
          category_guess, confidence, mapped_category, mapped_gl_account,
          mapping_status, mapped_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        document_id, tenant_id, item.line_number, item.raw_text, item.description,
        item.quantity, item.unit_price, item.amount, item.unit,
        item.category_guess, item.confidence, item.mapped_category, item.mapped_gl_account,
        item.mapping_status, item.mapping_status === 'mapped' ? 'auto' : null
      ]);

      if (item.mapping_status === 'unmapped') {
        unmapped_count++;
      }
    }

    // Update document status (only if no validation errors)
    let finalStatus = initialStatus;
    if (initialStatus !== 'error') {
      finalStatus = unmapped_count > 0 ? 'ocr_complete' : 'mapped';
    }

    await this.db.run(`
      UPDATE documents SET status = ?, updated_at = datetime('now')
      WHERE document_id = ?
    `, [finalStatus, document_id]);

    logger.info('PDFImport: Document imported', {
      document_id,
      vendor: metadata.vendor,
      invoice_number: metadata.invoice_number,
      total: metadata.invoice_total,
      line_items: lineItems.length,
      unmapped: unmapped_count,
      validation_errors: validationResult.errors.length,
      validation_warnings: validationResult.warnings.length
    });

    return {
      imported: true,
      document_id,
      sha256,
      file: fileName,
      vendor: metadata.vendor,
      invoice_number: metadata.invoice_number,
      invoice_date: metadata.invoice_date,
      invoice_total: metadata.invoice_total,
      line_items_count: lineItems.length,
      unmapped_lines: unmapped_count,
      ocr_confidence,
      ocr_engine: ocr_engine_name,
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      }
    };
  }

  /**
   * Find all PDF files in directory (recursive)
   */
  async findPDFsInDirectory(directory) {
    const pdfFiles = [];

    async function scan(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(fullPath);
        }
      }
    }

    await scan(directory);
    return pdfFiles;
  }

  /**
   * Compute SHA256 hash of buffer
   */
  computeSHA256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Parse invoice metadata from OCR text
   */
  parseInvoiceMetadata(text, fileName) {
    const metadata = {
      vendor: null,
      invoice_number: null,
      invoice_date: null,
      invoice_total: null,
      tax_amount: null,
      subtotal: null
    };

    if (!text) return metadata;

    // Extract vendor (first line or after "Vendor:", "From:", etc.)
    const vendorMatch = text.match(/(?:vendor|from|bill from)[:\s]+([^\n]+)/i);
    if (vendorMatch) {
      metadata.vendor = vendorMatch[1].trim().substring(0, 100);
    } else {
      // Use first non-empty line as vendor
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        metadata.vendor = lines[0].trim().substring(0, 100);
      }
    }

    // Extract invoice number
    const invoiceMatch = text.match(/(?:invoice|inv|doc)[\s#:]+([A-Z0-9\-]+)/i);
    if (invoiceMatch) {
      metadata.invoice_number = invoiceMatch[1].trim();
    }

    // Extract date (various formats)
    const dateMatch = text.match(/(?:date|dated)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
                     text.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      metadata.invoice_date = this.parseDate(dateMatch[1]);
    }

    // Extract totals
    const totalMatch = text.match(/(?:total|amount due)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
    if (totalMatch) {
      metadata.invoice_total = parseFloat(totalMatch[1].replace(/,/g, ''));
    }

    const taxMatch = text.match(/(?:tax|sales tax)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
    if (taxMatch) {
      metadata.tax_amount = parseFloat(taxMatch[1].replace(/,/g, ''));
    }

    const subtotalMatch = text.match(/(?:subtotal|sub-total)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
    if (subtotalMatch) {
      metadata.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
    }

    return metadata;
  }

  /**
   * Parse date string to YYYY-MM-DD
   */
  parseDate(dateStr) {
    // Try to parse various date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/, // 2025-01-15
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // 01/15/2025
      /(\d{1,2})-(\d{1,2})-(\d{4})/, // 01-15-2025
      /(\d{1,2})\/(\d{1,2})\/(\d{2})/ // 01/15/25
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format.source.startsWith('(\\d{4})')) {
          // YYYY-MM-DD
          return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          // MM/DD/YYYY or MM/DD/YY
          const month = match[1].padStart(2, '0');
          const day = match[2].padStart(2, '0');
          let year = match[3];
          if (year.length === 2) {
            year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
          }
          return `${year}-${month}-${day}`;
        }
      }
    }

    return null;
  }

  /**
   * Extract line items from OCR text
   */
  extractLineItems(text, document_id, tenant_id) {
    const lines = [];
    if (!text) return lines;

    // Split into lines and look for patterns like:
    // "Item Name    Qty    Price    Total"
    // "Widget A     5      10.00    50.00"

    const textLines = text.split('\n');
    let lineNumber = 0;

    for (const line of textLines) {
      // Look for lines with dollar amounts
      const amountMatch = line.match(/\$?[\s]*([\d,]+\.\d{2})\s*$/);

      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));

        // Extract description (everything before the amount)
        const description = line.substring(0, line.lastIndexOf(amountMatch[0])).trim();

        if (description.length > 0 && amount > 0) {
          lines.push({
            line_number: ++lineNumber,
            raw_text: line.trim(),
            description: description.substring(0, 200),
            amount,
            quantity: null,
            unit_price: null,
            unit: null,
            category_guess: null,
            confidence: 0.5,
            mapping_status: 'unmapped'
          });
        }
      }
    }

    logger.debug('PDFImport: Extracted line items', {
      document_id,
      count: lines.length
    });

    return lines;
  }

  /**
   * Apply vendor category mapping rules to line items
   */
  async applyMappingRules(lineItems, vendor, tenant_id) {
    // Get active mapping rules for this vendor
    const rules = await this.db.all(`
      SELECT rule_id, vendor_pattern, description_pattern, amount_min, amount_max,
             category_code, gl_account, priority
      FROM vendor_category_map
      WHERE tenant_id = ? AND active = 1
      AND (vendor = ? OR vendor_pattern IS NOT NULL)
      ORDER BY priority DESC
    `, [tenant_id, vendor]);

    for (const item of lineItems) {
      // Try to match against rules
      for (const rule of rules) {
        let matches = false;

        // Check vendor match
        if (rule.vendor === vendor || this.matchPattern(vendor, rule.vendor_pattern)) {
          matches = true;

          // Check description pattern if present
          if (rule.description_pattern && !this.matchPattern(item.description, rule.description_pattern)) {
            matches = false;
          }

          // Check amount range if present
          if (rule.amount_min && item.amount < rule.amount_min) matches = false;
          if (rule.amount_max && item.amount > rule.amount_max) matches = false;
        }

        if (matches) {
          item.mapped_category = rule.category_code;
          item.mapped_gl_account = rule.gl_account;
          item.mapping_status = 'mapped';
          item.confidence = 0.9;

          // Update rule usage
          await this.db.run(`
            UPDATE vendor_category_map
            SET usage_count = usage_count + 1, last_used_at = datetime('now')
            WHERE rule_id = ?
          `, [rule.rule_id]);

          break; // Use first matching rule
        }
      }
    }

    return lineItems;
  }

  /**
   * Match string against pattern (LIKE or regex)
   */
  matchPattern(text, pattern) {
    if (!pattern || !text) return false;

    // Convert SQL LIKE pattern to regex
    const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
    const regex = new RegExp(regexPattern, 'i');

    return regex.test(text);
  }

  /**
   * Normalize vendor name for matching
   */
  normalizeVendor(vendor) {
    if (!vendor) return null;
    return vendor.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Generate unique import ID
   */
  generateImportId() {
    return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique document ID
   */
  generateDocumentId() {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = PDFImportService;
