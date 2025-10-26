/**
 * InvoiceImportAdapter.js (v16.2.0)
 *
 * Invoice import adapter with finance enforcement
 *
 * Purpose:
 *   - Wraps existing GFS invoice parser
 *   - Applies finance code mapping to every line
 *   - Enforces integer-cent arithmetic (no floats)
 *   - Validates invoice balance (±2¢ tolerance)
 *   - Calculates exact GST/QST per line
 *   - Records validation results
 *
 * Tax Rates (Quebec):
 *   - GST: 5.00% (500 basis points)
 *   - QST: 9.975% (997.5 basis points)
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const crypto = require('crypto');

// Tax rates in basis points for precise calculation
const GST_RATE_BP = 500;   // 5.00%
const QST_RATE_BP = 9975;  // 9.975%

class InvoiceImportAdapter {
  constructor(db, gfsParser, mappingService) {
    this.db = db;
    this.gfsParser = gfsParser;
    this.mappingService = mappingService;
  }

  /**
   * Import and process an invoice with finance enforcement
   *
   * @param {string} filePath - Path to PDF invoice
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import result with validation
   */
  async importInvoice(filePath, options = {}) {
    const { actor = 'system', skipValidation = false } = options;

    // Step 1: Parse invoice using existing GFS parser
    const parseResult = await this.gfsParser.parsePDF(filePath);

    if (!parseResult.success) {
      return {
        success: false,
        error: 'Invoice parsing failed',
        details: parseResult.error
      };
    }

    const {
      invoice_id,
      invoice_date,
      vendor,
      lines = [],
      subtotal,
      gst,
      qst,
      total
    } = parseResult.invoice;

    // Step 2: Process each line with finance mapping and integer-cent conversion
    const processedLines = [];
    const mappingResults = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      try {
        // Map finance code
        const mapping = await this.mappingService.mapInvoiceLine({
          invoice_id,
          line_id: `${invoice_id}-L${i + 1}`,
          gfs_item_no: line.item_no || line.gfs_item_no,
          vendor_sku: line.vendor_sku,
          description: line.description || line.item_desc,
          actor
        });

        // Convert to integer cents (CRITICAL: no float math)
        const qty_units = this._parseQuantity(line.qty || line.quantity);
        const unit_price_cents = this._dollarsToCents(line.unit_price || line.price);
        const ext_price_cents = this._dollarsToCents(line.ext_price || line.extended || (qty_units * (unit_price_cents / 100)));

        // Determine taxability from item_bank or defaults
        let taxable_gst = 1;
        let taxable_qst = 1;

        if (line.gfs_item_no) {
          const item = await this.db.get(`
            SELECT taxable_gst, taxable_qst FROM item_bank
            WHERE gfs_item_no = ? AND status = 'ACTIVE'
          `, [line.gfs_item_no]);

          if (item) {
            taxable_gst = item.taxable_gst;
            taxable_qst = item.taxable_qst;
          }
        }

        // Calculate exact taxes per line (integer-cent safe)
        const gst_cents = taxable_gst ? this._calculateTax(ext_price_cents, GST_RATE_BP) : 0;
        const qst_cents = taxable_qst ? this._calculateTax(ext_price_cents, QST_RATE_BP) : 0;

        const processedLine = {
          line_id: `${invoice_id}-L${i + 1}`,
          line_num: i + 1,
          gfs_item_no: line.gfs_item_no || line.item_no,
          vendor_sku: line.vendor_sku,
          description: line.description || line.item_desc,
          qty_units: qty_units,
          unit_price_cents: unit_price_cents,
          ext_price_cents: ext_price_cents,
          finance_code: mapping.finance_code,
          taxable_gst: taxable_gst,
          taxable_qst: taxable_qst,
          gst_cents: gst_cents,
          qst_cents: qst_cents,
          mapping_confidence: mapping.confidence,
          mapping_strategy: mapping.strategy,
          mapping_audit_id: mapping.audit_id
        };

        processedLines.push(processedLine);
        mappingResults.push({
          line_num: i + 1,
          finance_code: mapping.finance_code,
          confidence: mapping.confidence,
          strategy: mapping.strategy
        });

      } catch (error) {
        return {
          success: false,
          error: `Line ${i + 1} processing failed`,
          details: error.message
        };
      }
    }

    // Step 3: Validate invoice totals (integer-cent safe)
    const validation = skipValidation ? null : await this._validateInvoice({
      invoice_id,
      lines: processedLines,
      parsed_subtotal: subtotal,
      parsed_gst: gst,
      parsed_qst: qst,
      parsed_total: total
    });

    // Step 4: Return comprehensive result
    return {
      success: true,
      invoice_id,
      invoice_date,
      vendor,
      total_lines: processedLines.length,
      mapped_lines: processedLines.filter(l => l.mapping_confidence >= 0.80).length,
      low_confidence_lines: processedLines.filter(l => l.mapping_confidence < 0.80).length,
      lines: processedLines,
      mapping_results: mappingResults,
      validation: validation
    };
  }

  /**
   * Validate invoice balance with ±2¢ tolerance
   */
  async _validateInvoice({
    invoice_id,
    lines,
    parsed_subtotal,
    parsed_gst,
    parsed_qst,
    parsed_total
  }) {
    const total_lines = lines.length;
    const mapped_lines = lines.filter(l => l.mapping_confidence >= 0.80).length;
    const unmapped_lines = total_lines - mapped_lines;
    const low_confidence_lines = lines.filter(l => l.mapping_confidence < 0.80).length;

    // Compute totals from lines (integer cents)
    const computed_subtotal_cents = lines.reduce((sum, line) => sum + line.ext_price_cents, 0);
    const computed_gst_cents = lines.reduce((sum, line) => sum + line.gst_cents, 0);
    const computed_qst_cents = lines.reduce((sum, line) => sum + line.qst_cents, 0);
    const computed_total_cents = computed_subtotal_cents + computed_gst_cents + computed_qst_cents;

    // Convert parsed values to cents
    const parsed_subtotal_cents = this._dollarsToCents(parsed_subtotal);
    const parsed_gst_cents = this._dollarsToCents(parsed_gst);
    const parsed_qst_cents = this._dollarsToCents(parsed_qst);
    const parsed_total_cents = this._dollarsToCents(parsed_total);

    // Calculate deltas
    const subtotal_delta_cents = computed_subtotal_cents - parsed_subtotal_cents;
    const gst_delta_cents = computed_gst_cents - parsed_gst_cents;
    const qst_delta_cents = computed_qst_cents - parsed_qst_cents;
    const total_delta_cents = computed_total_cents - parsed_total_cents;

    // Determine balance status (±2¢ tolerance)
    let balance_status = 'BALANCED';
    const errors = [];

    if (Math.abs(subtotal_delta_cents) > 2) {
      balance_status = 'IMBALANCE';
      errors.push({
        field: 'subtotal',
        computed: this._centsToDollars(computed_subtotal_cents),
        parsed: this._centsToDollars(parsed_subtotal_cents),
        delta_cents: subtotal_delta_cents
      });
    }

    if (Math.abs(gst_delta_cents) > 2) {
      balance_status = 'TAX_ERROR';
      errors.push({
        field: 'gst',
        computed: this._centsToDollars(computed_gst_cents),
        parsed: this._centsToDollars(parsed_gst_cents),
        delta_cents: gst_delta_cents
      });
    }

    if (Math.abs(qst_delta_cents) > 2) {
      balance_status = 'TAX_ERROR';
      errors.push({
        field: 'qst',
        computed: this._centsToDollars(computed_qst_cents),
        parsed: this._centsToDollars(parsed_qst_cents),
        delta_cents: qst_delta_cents
      });
    }

    if (Math.abs(total_delta_cents) > 2) {
      balance_status = 'IMBALANCE';
      errors.push({
        field: 'total',
        computed: this._centsToDollars(computed_total_cents),
        parsed: this._centsToDollars(parsed_total_cents),
        delta_cents: total_delta_cents
      });
    }

    // Store validation results
    const validation_id = crypto.randomUUID();

    await this.db.run(`
      INSERT INTO invoice_validation_results (
        id, invoice_id, total_lines, mapped_lines, unmapped_lines, low_confidence_lines,
        computed_subtotal_cents, parsed_subtotal_cents, subtotal_delta_cents,
        computed_gst_cents, parsed_gst_cents, gst_delta_cents,
        computed_qst_cents, parsed_qst_cents, qst_delta_cents,
        computed_total_cents, parsed_total_cents, total_delta_cents,
        balance_status, validation_errors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      validation_id, invoice_id, total_lines, mapped_lines, unmapped_lines, low_confidence_lines,
      computed_subtotal_cents, parsed_subtotal_cents, subtotal_delta_cents,
      computed_gst_cents, parsed_gst_cents, gst_delta_cents,
      computed_qst_cents, parsed_qst_cents, qst_delta_cents,
      computed_total_cents, parsed_total_cents, total_delta_cents,
      balance_status, JSON.stringify(errors)
    ]);

    return {
      validation_id,
      balance_status,
      total_lines,
      mapped_lines,
      unmapped_lines,
      low_confidence_lines,
      computed: {
        subtotal_cents: computed_subtotal_cents,
        gst_cents: computed_gst_cents,
        qst_cents: computed_qst_cents,
        total_cents: computed_total_cents,
        subtotal: this._centsToDollars(computed_subtotal_cents),
        gst: this._centsToDollars(computed_gst_cents),
        qst: this._centsToDollars(computed_qst_cents),
        total: this._centsToDollars(computed_total_cents)
      },
      parsed: {
        subtotal_cents: parsed_subtotal_cents,
        gst_cents: parsed_gst_cents,
        qst_cents: parsed_qst_cents,
        total_cents: parsed_total_cents,
        subtotal: this._centsToDollars(parsed_subtotal_cents),
        gst: this._centsToDollars(parsed_gst_cents),
        qst: this._centsToDollars(parsed_qst_cents),
        total: this._centsToDollars(parsed_total_cents)
      },
      deltas: {
        subtotal_cents: subtotal_delta_cents,
        gst_cents: gst_delta_cents,
        qst_cents: qst_delta_cents,
        total_cents: total_delta_cents
      },
      errors
    };
  }

  /**
   * Calculate tax in integer cents using basis points
   * Formula: (amount_cents * rate_bp + 5000) / 10000
   * The +5000 provides rounding to nearest cent
   */
  _calculateTax(amount_cents, rate_bp) {
    return Math.floor((amount_cents * rate_bp + 5000) / 10000);
  }

  /**
   * Convert dollars to integer cents
   * Handles: "$12.34", "12.34", 12.34, "12"
   */
  _dollarsToCents(dollars) {
    if (dollars === null || dollars === undefined) return 0;

    // Remove currency symbols and whitespace
    let cleaned = String(dollars).replace(/[$,\s]/g, '');

    // Parse as float and convert to cents
    const float_value = parseFloat(cleaned);
    if (isNaN(float_value)) return 0;

    // Round to nearest cent (avoid floating point errors)
    return Math.round(float_value * 100);
  }

  /**
   * Convert integer cents to dollar string
   */
  _centsToDollars(cents) {
    return (cents / 100).toFixed(2);
  }

  /**
   * Parse quantity (handles "12", "12.5", "12 EA", etc.)
   */
  _parseQuantity(qty) {
    if (qty === null || qty === undefined) return 0;

    // Remove units (EA, CS, LB, etc.)
    const cleaned = String(qty).replace(/[A-Z]+$/i, '').trim();
    const float_value = parseFloat(cleaned);

    return isNaN(float_value) ? 0 : float_value;
  }

  /**
   * Get validation result for an invoice
   */
  async getValidationResult(invoice_id) {
    const result = await this.db.get(`
      SELECT * FROM invoice_validation_results
      WHERE invoice_id = ?
      ORDER BY validated_at DESC
      LIMIT 1
    `, [invoice_id]);

    if (!result) return null;

    // Parse JSON errors
    if (result.validation_errors) {
      result.validation_errors = JSON.parse(result.validation_errors);
    }

    return result;
  }

  /**
   * Get invoices needing attention (imbalanced or low confidence)
   */
  async getInvoicesNeedingAttention(limit = 50) {
    const results = await this.db.all(`
      SELECT
        ivr.*,
        COUNT(ma.id) as total_mappings,
        SUM(CASE WHEN ma.confidence < 0.80 THEN 1 ELSE 0 END) as low_confidence_count
      FROM invoice_validation_results ivr
      LEFT JOIN mapping_audit ma ON ivr.invoice_id = ma.invoice_id
      WHERE ivr.balance_status != 'BALANCED' OR ivr.low_confidence_lines > 0
      GROUP BY ivr.invoice_id
      ORDER BY ivr.validated_at DESC
      LIMIT ?
    `, [limit]);

    return results.map(r => {
      if (r.validation_errors) {
        r.validation_errors = JSON.parse(r.validation_errors);
      }
      return r;
    });
  }

  /**
   * Batch import multiple invoices
   */
  async batchImport(filePaths, options = {}) {
    const results = [];
    const errors = [];

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      try {
        const result = await this.importInvoice(filePath, options);
        results.push({
          file_index: i,
          file_path: filePath,
          ...result
        });
      } catch (error) {
        errors.push({
          file_index: i,
          file_path: filePath,
          error: error.message
        });
      }
    }

    return {
      success_count: results.filter(r => r.success).length,
      error_count: errors.length,
      results,
      errors
    };
  }
}

module.exports = InvoiceImportAdapter;
