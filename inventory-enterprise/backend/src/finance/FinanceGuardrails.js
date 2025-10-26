/**
 * Finance Data Quality Guardrails
 *
 * Validation rules for financial data integrity:
 * - Fiscal period validation
 * - Negative total detection
 * - Tax math validation (GST 5% + QST 9.975%)
 * - Unknown vendor detection
 * - Duplicate invoice detection
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const { logger } = require('../../config/logger');

// ============================================================================
// CONFIGURATION
// ============================================================================

const GUARDRAILS_CONFIG = {
  // Tax tolerance threshold (dollars)
  taxToleranceDollars: parseFloat(process.env.TAX_TOLERANCE_DOLLARS) || 0.50,

  // Tax rates (Canada)
  gstRate: 0.05,      // GST 5%
  qstRate: 0.09975,   // QST 9.975%

  // Fiscal period (configurable)
  fiscalYearStart: process.env.FISCAL_YEAR_START || '2025-01-01',
  fiscalYearEnd: process.env.FISCAL_YEAR_END || '2025-12-31',

  // Unknown vendor threshold (days to alert)
  unknownVendorAlertDays: parseInt(process.env.UNKNOWN_VENDOR_ALERT_DAYS) || 7,

  // Duplicate detection window (days)
  duplicateDetectionWindow: parseInt(process.env.DUPLICATE_DETECTION_WINDOW) || 90
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate fiscal period date
 *
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Object} { valid: boolean, error?: string, warning?: string }
 */
function validateFiscalPeriod(date) {
  if (!date) {
    return {
      valid: false,
      error: 'Date is required'
    };
  }

  const invoiceDate = new Date(date);
  const fiscalStart = new Date(GUARDRAILS_CONFIG.fiscalYearStart);
  const fiscalEnd = new Date(GUARDRAILS_CONFIG.fiscalYearEnd);

  if (isNaN(invoiceDate.getTime())) {
    return {
      valid: false,
      error: 'Invalid date format'
    };
  }

  if (invoiceDate < fiscalStart || invoiceDate > fiscalEnd) {
    return {
      valid: false,
      error: `Invoice date ${date} is outside fiscal year ${GUARDRAILS_CONFIG.fiscalYearStart} to ${GUARDRAILS_CONFIG.fiscalYearEnd}`
    };
  }

  return { valid: true };
}

/**
 * Validate invoice total is not negative (unless it's a credit note)
 *
 * @param {number} total - Invoice total
 * @param {boolean} isCreditNote - Whether this is a credit note
 * @returns {Object} { valid: boolean, error?: string, warning?: string }
 */
function validateNonNegativeTotal(total, isCreditNote = false) {
  if (total === null || total === undefined) {
    return {
      valid: false,
      error: 'Invoice total is required'
    };
  }

  if (typeof total !== 'number') {
    return {
      valid: false,
      error: 'Invoice total must be a number'
    };
  }

  if (total < 0 && !isCreditNote) {
    return {
      valid: false,
      error: `Invoice total $${total.toFixed(2)} is negative but not marked as credit note`
    };
  }

  if (total >= 0 && isCreditNote) {
    return {
      valid: false,
      warning: 'Invoice marked as credit note but total is positive'
    };
  }

  return { valid: true };
}

/**
 * Validate tax math: subtotal + GST + QST = total (within tolerance)
 *
 * @param {number} subtotal - Subtotal before tax
 * @param {number} gst - GST amount (should be ~5% of subtotal)
 * @param {number} qst - QST amount (should be ~9.975% of subtotal)
 * @param {number} total - Total including tax
 * @returns {Object} { valid: boolean, error?: string, warning?: string, details: {} }
 */
function validateTaxMath(subtotal, gst, qst, total) {
  if (subtotal === null || subtotal === undefined || total === null || total === undefined) {
    return {
      valid: false,
      error: 'Subtotal and total are required for tax validation'
    };
  }

  const tolerance = GUARDRAILS_CONFIG.taxToleranceDollars;

  // Calculate expected tax amounts
  const expectedGST = subtotal * GUARDRAILS_CONFIG.gstRate;
  const expectedQST = subtotal * GUARDRAILS_CONFIG.qstRate;
  const expectedTotal = subtotal + expectedGST + expectedQST;

  // Calculate variances
  const gstVariance = gst !== null && gst !== undefined ? Math.abs(gst - expectedGST) : null;
  const qstVariance = qst !== null && qst !== undefined ? Math.abs(qst - expectedQST) : null;
  const totalVariance = Math.abs(total - expectedTotal);

  const details = {
    subtotal,
    gst: gst || 0,
    qst: qst || 0,
    total,
    expectedGST: parseFloat(expectedGST.toFixed(2)),
    expectedQST: parseFloat(expectedQST.toFixed(2)),
    expectedTotal: parseFloat(expectedTotal.toFixed(2)),
    gstVariance: gstVariance !== null ? parseFloat(gstVariance.toFixed(2)) : null,
    qstVariance: qstVariance !== null ? parseFloat(qstVariance.toFixed(2)) : null,
    totalVariance: parseFloat(totalVariance.toFixed(2)),
    tolerance
  };

  // Check if subtotal + taxes = total
  if (gst !== null && qst !== null) {
    const calculatedTotal = subtotal + gst + qst;
    const calculatedVariance = Math.abs(total - calculatedTotal);

    if (calculatedVariance > tolerance) {
      return {
        valid: false,
        error: `Subtotal + GST + QST ($${calculatedTotal.toFixed(2)}) does not match total ($${total.toFixed(2)}), variance: $${calculatedVariance.toFixed(2)}`,
        details
      };
    }
  }

  // Check if GST is within tolerance
  if (gstVariance !== null && gstVariance > tolerance) {
    return {
      valid: false,
      warning: `GST amount $${gst.toFixed(2)} differs from expected $${expectedGST.toFixed(2)} by $${gstVariance.toFixed(2)} (tolerance: $${tolerance})`,
      details
    };
  }

  // Check if QST is within tolerance
  if (qstVariance !== null && qstVariance > tolerance) {
    return {
      valid: false,
      warning: `QST amount $${qst.toFixed(2)} differs from expected $${expectedQST.toFixed(2)} by $${qstVariance.toFixed(2)} (tolerance: $${tolerance})`,
      details
    };
  }

  return { valid: true, details };
}

/**
 * Validate vendor is known (exists in vendor master or has prior invoices)
 *
 * @param {Object} db - Database instance
 * @param {string} vendor - Vendor name
 * @param {string} tenant_id - Tenant ID
 * @returns {Promise<Object>} { valid: boolean, error?: string, warning?: string, vendorInfo?: {} }
 */
async function validateKnownVendor(db, vendor, tenant_id) {
  if (!vendor || vendor.trim() === '') {
    return {
      valid: false,
      error: 'Vendor is required'
    };
  }

  try {
    // Check if vendor exists in documents table (has prior invoices)
    const priorInvoices = await db.get(`
      SELECT
        COUNT(*) as invoice_count,
        MIN(invoice_date) as first_invoice_date,
        MAX(invoice_date) as last_invoice_date
      FROM documents
      WHERE (vendor = ? OR vendor_normalized = ?)
        AND tenant_id = ?
        AND status != 'error'
    `, [vendor, vendor.toLowerCase().trim(), tenant_id]);

    if (priorInvoices && priorInvoices.invoice_count > 0) {
      return {
        valid: true,
        vendorInfo: {
          vendor,
          invoice_count: priorInvoices.invoice_count,
          first_invoice: priorInvoices.first_invoice_date,
          last_invoice: priorInvoices.last_invoice_date,
          known: true
        }
      };
    }

    // Check if vendor has mapping rules
    const mappingRules = await db.get(`
      SELECT COUNT(*) as rule_count
      FROM vendor_category_map
      WHERE (vendor = ? OR vendor_pattern LIKE ?)
        AND tenant_id = ?
        AND active = 1
    `, [vendor, `%${vendor}%`, tenant_id]);

    if (mappingRules && mappingRules.rule_count > 0) {
      return {
        valid: true,
        vendorInfo: {
          vendor,
          has_mapping_rules: true,
          rule_count: mappingRules.rule_count,
          known: true
        }
      };
    }

    // Unknown vendor
    return {
      valid: false,
      warning: `Vendor "${vendor}" is unknown (no prior invoices or mapping rules)`,
      vendorInfo: {
        vendor,
        known: false
      }
    };

  } catch (error) {
    logger.error('Guardrails: validateKnownVendor error', { error: error.message, vendor });
    return {
      valid: true, // Don't block on validation errors
      warning: 'Could not validate vendor'
    };
  }
}

/**
 * Check for duplicate invoice (same invoice_number + vendor + date within window)
 *
 * @param {Object} db - Database instance
 * @param {string} vendor - Vendor name
 * @param {string} invoice_number - Invoice number
 * @param {string} invoice_date - Invoice date
 * @param {string} tenant_id - Tenant ID
 * @param {string} exclude_document_id - Exclude this document ID from search (for updates)
 * @returns {Promise<Object>} { valid: boolean, error?: string, warning?: string, duplicates?: [] }
 */
async function checkDuplicateInvoice(db, vendor, invoice_number, invoice_date, tenant_id, exclude_document_id = null) {
  if (!vendor || !invoice_number || !invoice_date) {
    return {
      valid: true, // Missing data will be caught by other validators
      warning: 'Cannot check for duplicates without vendor, invoice number, and date'
    };
  }

  try {
    const windowDays = GUARDRAILS_CONFIG.duplicateDetectionWindow;

    let query = `
      SELECT
        document_id,
        vendor,
        invoice_number,
        invoice_date,
        invoice_total,
        status,
        created_at
      FROM documents
      WHERE vendor = ?
        AND invoice_number = ?
        AND tenant_id = ?
        AND ABS(julianday(invoice_date) - julianday(?)) <= ?
        AND status != 'error'
    `;

    const params = [vendor, invoice_number, tenant_id, invoice_date, windowDays];

    if (exclude_document_id) {
      query += ' AND document_id != ?';
      params.push(exclude_document_id);
    }

    const duplicates = await db.all(query, params);

    if (duplicates.length > 0) {
      return {
        valid: false,
        error: `Duplicate invoice detected: ${vendor} invoice #${invoice_number} dated ${invoice_date} (${duplicates.length} match${duplicates.length > 1 ? 'es' : ''})`,
        duplicates: duplicates.map(d => ({
          document_id: d.document_id,
          invoice_date: d.invoice_date,
          invoice_total: d.invoice_total,
          status: d.status,
          created_at: d.created_at
        }))
      };
    }

    return { valid: true };

  } catch (error) {
    logger.error('Guardrails: checkDuplicateInvoice error', { error: error.message, vendor, invoice_number });
    return {
      valid: true, // Don't block on validation errors
      warning: 'Could not check for duplicate invoices'
    };
  }
}

/**
 * Validate line items sum to invoice total (within tolerance)
 *
 * @param {Array} lineItems - Array of line items with amount property
 * @param {number} invoiceTotal - Invoice total
 * @returns {Object} { valid: boolean, error?: string, warning?: string, details: {} }
 */
function validateLineItemsTotal(lineItems, invoiceTotal) {
  if (!lineItems || lineItems.length === 0) {
    return {
      valid: true,
      warning: 'No line items to validate'
    };
  }

  if (invoiceTotal === null || invoiceTotal === undefined) {
    return {
      valid: false,
      error: 'Invoice total is required'
    };
  }

  const lineItemsSum = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const variance = Math.abs(invoiceTotal - lineItemsSum);
  const tolerance = GUARDRAILS_CONFIG.taxToleranceDollars;

  const details = {
    line_items_count: lineItems.length,
    line_items_sum: parseFloat(lineItemsSum.toFixed(2)),
    invoice_total: parseFloat(invoiceTotal.toFixed(2)),
    variance: parseFloat(variance.toFixed(2)),
    tolerance
  };

  if (variance > tolerance) {
    return {
      valid: false,
      error: `Line items sum ($${lineItemsSum.toFixed(2)}) does not match invoice total ($${invoiceTotal.toFixed(2)}), variance: $${variance.toFixed(2)}`,
      details
    };
  }

  return { valid: true, details };
}

// ============================================================================
// COMPREHENSIVE VALIDATION
// ============================================================================

/**
 * Run all validation rules on a document
 *
 * @param {Object} db - Database instance
 * @param {Object} document - Document object with vendor, invoice_number, invoice_date, invoice_total, etc.
 * @param {Array} lineItems - Array of line items
 * @param {Object} options - Validation options
 * @param {boolean} [options.skipDuplicateCheck] - Skip duplicate check
 * @param {boolean} [options.skipVendorCheck] - Skip vendor check
 * @param {string} [options.exclude_document_id] - Exclude document from duplicate check
 * @returns {Promise<Object>} { valid: boolean, errors: [], warnings: [], details: {} }
 */
async function validateDocument(db, document, lineItems = [], options = {}) {
  const errors = [];
  const warnings = [];
  const details = {};

  const {
    vendor,
    invoice_number,
    invoice_date,
    invoice_total,
    subtotal,
    tax_amount,
    gst,
    qst,
    is_credit_note,
    tenant_id
  } = document;

  // 1. Validate fiscal period
  const fiscalResult = validateFiscalPeriod(invoice_date);
  if (!fiscalResult.valid) {
    if (fiscalResult.error) errors.push(fiscalResult.error);
    if (fiscalResult.warning) warnings.push(fiscalResult.warning);
  }
  details.fiscal_period = fiscalResult;

  // 2. Validate non-negative total
  const nonNegativeResult = validateNonNegativeTotal(invoice_total, is_credit_note);
  if (!nonNegativeResult.valid) {
    if (nonNegativeResult.error) errors.push(nonNegativeResult.error);
    if (nonNegativeResult.warning) warnings.push(nonNegativeResult.warning);
  }
  details.non_negative_total = nonNegativeResult;

  // 3. Validate tax math
  if (subtotal !== null && subtotal !== undefined) {
    const taxResult = validateTaxMath(subtotal, gst || 0, qst || 0, invoice_total);
    if (!taxResult.valid) {
      if (taxResult.error) errors.push(taxResult.error);
      if (taxResult.warning) warnings.push(taxResult.warning);
    }
    details.tax_math = taxResult;
  }

  // 4. Validate known vendor
  if (!options.skipVendorCheck && vendor) {
    const vendorResult = await validateKnownVendor(db, vendor, tenant_id);
    if (!vendorResult.valid) {
      if (vendorResult.error) errors.push(vendorResult.error);
      if (vendorResult.warning) warnings.push(vendorResult.warning);
    }
    details.vendor = vendorResult;
  }

  // 5. Check for duplicate invoice
  if (!options.skipDuplicateCheck && vendor && invoice_number && invoice_date) {
    const duplicateResult = await checkDuplicateInvoice(
      db,
      vendor,
      invoice_number,
      invoice_date,
      tenant_id,
      options.exclude_document_id
    );
    if (!duplicateResult.valid) {
      if (duplicateResult.error) errors.push(duplicateResult.error);
      if (duplicateResult.warning) warnings.push(duplicateResult.warning);
      details.duplicate_check = duplicateResult;
    }
  }

  // 6. Validate line items sum
  if (lineItems && lineItems.length > 0) {
    const lineItemsResult = validateLineItemsTotal(lineItems, invoice_total);
    if (!lineItemsResult.valid) {
      if (lineItemsResult.error) errors.push(lineItemsResult.error);
      if (lineItemsResult.warning) warnings.push(lineItemsResult.warning);
    }
    details.line_items = lineItemsResult;
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('Guardrails: Document validation failed', {
      vendor,
      invoice_number,
      invoice_date,
      errors,
      warnings
    });
  }

  return {
    valid,
    errors,
    warnings,
    details
  };
}

// ============================================================================
// COUNT SESSION VALIDATION (v15.6.0)
// ============================================================================

const TAX_TOLERANCE_CENTS = 50; // $0.50
const VARIANCE_SIGMA_THRESHOLD = 2.0; // 2 standard deviations
const MIN_HISTORICAL_COUNTS = 3; // Need 3+ past counts for statistical checks

/**
 * Validate a count session before state transition
 * Returns { valid: boolean, errors: [], warnings: [] }
 */
async function validateCountSession(db, countId, transitionTo) {
  const errors = [];
  const warnings = [];

  const session = await db.get(`
    SELECT * FROM count_sessions WHERE count_id = ?
  `, [countId]);

  if (!session) {
    errors.push('Count session not found');
    return { valid: false, errors, warnings };
  }

  // Validation rules by transition
  switch (transitionTo) {
    case 'SUBMITTED':
      await validateForSubmit(db, session, errors, warnings);
      break;
    case 'APPROVED':
      await validateForApproval(db, session, errors, warnings);
      break;
    case 'LOCKED':
      await validateForLock(db, session, errors, warnings);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate for OPEN → SUBMITTED transition
 */
async function validateForSubmit(db, session, errors, warnings) {
  const countId = session.count_id;

  // 1. Check for negative counts
  const negativeLines = await db.all(`
    SELECT item_code, item_desc, counted_qty
    FROM count_lines
    WHERE count_id = ? AND counted_qty < 0
  `, [countId]);

  if (negativeLines.length > 0) {
    errors.push({
      code: 'NEGATIVE_COUNTS',
      message: 'Cannot submit count with negative quantities',
      details: negativeLines.map(l => ({
        item_code: l.item_code,
        item_desc: l.item_desc,
        counted_qty: l.counted_qty
      }))
    });
  }

  // 2. Check for missing item codes
  const missingItemCodes = await db.all(`
    SELECT count_line_id, item_desc
    FROM count_lines
    WHERE count_id = ? AND (item_code IS NULL OR item_code = '')
  `, [countId]);

  if (missingItemCodes.length > 0) {
    errors.push({
      code: 'MISSING_ITEM_CODES',
      message: 'All lines must have item codes before submission',
      details: missingItemCodes
    });
  }

  // 3. Check for missing finance codes
  const missingFinanceCodes = await db.all(`
    SELECT count_line_id, item_code, item_desc
    FROM count_lines
    WHERE count_id = ? AND (finance_code IS NULL OR finance_code = '')
  `, [countId]);

  if (missingFinanceCodes.length > 0) {
    errors.push({
      code: 'MISSING_FINANCE_CODES',
      message: 'All lines must have finance codes before submission',
      details: missingFinanceCodes
    });
  }

  // 4. Reasonability check: Compare to historical counts
  await checkHistoricalVariances(db, countId, warnings);
}

/**
 * Validate for SUBMITTED → APPROVED transition
 */
async function validateForApproval(db, session, errors, warnings) {
  const countId = session.count_id;

  // 1. Check for unresolved AI mappings
  const unresolvedMappings = await db.all(`
    SELECT cil.link_line_id, cil.raw_desc, cil.ai_confidence, ci.vendor, ci.invoice_number
    FROM count_invoice_lines cil
    JOIN count_invoices ci ON ci.link_id = cil.link_id
    WHERE ci.count_id = ? AND cil.mapping_status = 'needs_review'
  `, [countId]);

  if (unresolvedMappings.length > 0) {
    errors.push({
      code: 'UNRESOLVED_MAPPINGS',
      message: 'All invoice lines must be reviewed before approval',
      details: unresolvedMappings.map(m => ({
        invoice: m.vendor + ' ' + m.invoice_number,
        description: m.raw_desc,
        confidence: m.ai_confidence
      }))
    });
  }

  // 2. Tax validation: Recompute GST/QST and compare to invoice totals
  await validateCountTaxes(db, countId, errors, warnings);

  // 3. Check for large variances (>$5000 on any finance code)
  const largeVariances = await db.all(`
    SELECT
      finance_code,
      SUM((counted_qty - expected_qty) * unit_cost_cents) as variance_cents
    FROM count_lines
    WHERE count_id = ?
    GROUP BY finance_code
    HAVING ABS(variance_cents) > 500000
  `, [countId]);

  if (largeVariances.length > 0) {
    warnings.push({
      code: 'LARGE_VARIANCES',
      message: 'Large variances detected (>$5000) on finance codes',
      details: largeVariances.map(v => ({
        finance_code: v.finance_code,
        variance_dollars: (v.variance_cents / 100).toFixed(2)
      }))
    });
  }
}

/**
 * Validate for APPROVED → LOCKED transition
 */
async function validateForLock(db, session, errors, warnings) {
  // LOCKED is final - only basic validation
  if (session.status !== 'APPROVED') {
    errors.push({
      code: 'INVALID_STATUS',
      message: 'Can only lock an approved count',
      current_status: session.status
    });
  }

  // Check that finance summary is populated
  if (!session.finance_code_header) {
    warnings.push({
      code: 'MISSING_FINANCE_SUMMARY',
      message: 'Finance code summary not populated'
    });
  }
}

/**
 * Tax validation: Recompute GST/QST from count lines and compare to invoice totals
 */
async function validateCountTaxes(db, countId, errors, warnings) {
  // Get invoice totals
  const invoiceTotals = await db.get(`
    SELECT
      SUM(subtotal_cents) as total_subtotal_cents,
      SUM(gst_cents) as total_gst_cents,
      SUM(qst_cents) as total_qst_cents
    FROM count_invoices
    WHERE count_id = ?
  `, [countId]);

  if (!invoiceTotals || !invoiceTotals.total_subtotal_cents) {
    // No invoices attached, skip tax validation
    return;
  }

  // Get session tax rates
  const session = await db.get(`
    SELECT gst_rate, qst_rate FROM count_sessions WHERE count_id = ?
  `, [countId]);

  // Recompute taxes from subtotal
  const expectedGstCents = Math.round(invoiceTotals.total_subtotal_cents * session.gst_rate);
  const expectedQstCents = Math.round(invoiceTotals.total_subtotal_cents * session.qst_rate);

  const gstDiffCents = Math.abs(expectedGstCents - invoiceTotals.total_gst_cents);
  const qstDiffCents = Math.abs(expectedQstCents - invoiceTotals.total_qst_cents);

  if (gstDiffCents > TAX_TOLERANCE_CENTS) {
    warnings.push({
      code: 'GST_MISMATCH',
      message: 'GST total differs from expected calculation',
      expected_dollars: (expectedGstCents / 100).toFixed(2),
      actual_dollars: (invoiceTotals.total_gst_cents / 100).toFixed(2),
      diff_dollars: (gstDiffCents / 100).toFixed(2)
    });
  }

  if (qstDiffCents > TAX_TOLERANCE_CENTS) {
    warnings.push({
      code: 'QST_MISMATCH',
      message: 'QST total differs from expected calculation',
      expected_dollars: (expectedQstCents / 100).toFixed(2),
      actual_dollars: (invoiceTotals.total_qst_cents / 100).toFixed(2),
      diff_dollars: (qstDiffCents / 100).toFixed(2)
    });
  }
}

/**
 * Compare current counted quantities to historical counts
 * Flag items that deviate >2σ from past 3 counts
 */
async function checkHistoricalVariances(db, countId, warnings) {
  const currentLines = await db.all(`
    SELECT item_code, counted_qty
    FROM count_lines
    WHERE count_id = ?
  `, [countId]);

  const outliers = [];

  for (const line of currentLines) {
    const historical = await db.all(`
      SELECT cl.counted_qty
      FROM count_lines cl
      JOIN count_sessions cs ON cs.count_id = cl.count_id
      WHERE cl.item_code = ?
        AND cs.count_id != ?
        AND cs.status = 'LOCKED'
      ORDER BY cs.locked_at DESC
      LIMIT ?
    `, [line.item_code, countId, MIN_HISTORICAL_COUNTS]);

    if (historical.length < MIN_HISTORICAL_COUNTS) {
      // Not enough history for statistical check
      continue;
    }

    const quantities = historical.map(h => h.counted_qty);
    const mean = quantities.reduce((sum, q) => sum + q, 0) / quantities.length;
    const variance = quantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / quantities.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      // No variance in historical data, skip
      continue;
    }

    const zScore = Math.abs((line.counted_qty - mean) / stdDev);

    if (zScore > VARIANCE_SIGMA_THRESHOLD) {
      outliers.push({
        item_code: line.item_code,
        current_qty: line.counted_qty,
        historical_mean: mean.toFixed(2),
        std_dev: stdDev.toFixed(2),
        z_score: zScore.toFixed(2)
      });
    }
  }

  if (outliers.length > 0) {
    warnings.push({
      code: 'STATISTICAL_OUTLIERS',
      message: 'Items with counts deviating >' + VARIANCE_SIGMA_THRESHOLD + 'σ from historical average',
      details: outliers
    });
  }
}

/**
 * Check dual-control: User performing action must be different from previous step
 */
async function checkDualControl(db, countId, currentUser, actionType) {
  const session = await db.get(`
    SELECT submitted_by, approved_by FROM count_sessions WHERE count_id = ?
  `, [countId]);

  if (!session) {
    return { valid: false, error: 'Count session not found' };
  }

  switch (actionType) {
    case 'APPROVE':
      if (session.submitted_by === currentUser) {
        return {
          valid: false,
          error: 'Dual-control violation: Cannot approve a count you submitted',
          submitted_by: session.submitted_by
        };
      }
      break;

    case 'LOCK':
      if (session.approved_by === currentUser) {
        return {
          valid: false,
          error: 'Dual-control violation: Cannot lock a count you approved',
          approved_by: session.approved_by
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * Compute finance code summary for a count session
 * Returns JSON object: { "BAKE": 12500, "MEAT": 45000, "GST": 2875, "QST": 5738, ... }
 */
async function computeFinanceSummary(db, countId) {
  const summary = {};

  // Sum by finance code
  const financeCodeTotals = await db.all(`
    SELECT
      finance_code,
      SUM(counted_qty * unit_cost_cents) as total_cents
    FROM count_lines
    WHERE count_id = ?
    GROUP BY finance_code
  `, [countId]);

  for (const row of financeCodeTotals) {
    summary[row.finance_code] = row.total_cents;
  }

  // Add tax totals from invoices
  const taxTotals = await db.get(`
    SELECT
      SUM(gst_cents) as total_gst_cents,
      SUM(qst_cents) as total_qst_cents
    FROM count_invoices
    WHERE count_id = ?
  `, [countId]);

  if (taxTotals) {
    summary.GST = taxTotals.total_gst_cents || 0;
    summary.QST = taxTotals.total_qst_cents || 0;
  }

  return summary;
}

/**
 * Check if user has required role for action
 */
function checkRole(userRoles, requiredRole) {
  if (!userRoles || !Array.isArray(userRoles)) {
    return false;
  }

  // OWNER can do anything
  if (userRoles.includes('OWNER')) {
    return true;
  }

  // Check for specific role
  return userRoles.includes(requiredRole);
}

/**
 * Get validation rules for frontend display
 */
function getValidationRules() {
  return {
    tax_tolerance_cents: TAX_TOLERANCE_CENTS,
    variance_sigma_threshold: VARIANCE_SIGMA_THRESHOLD,
    min_historical_counts: MIN_HISTORICAL_COUNTS,
    finance_codes: [
      'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD',
      'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
    ],
    workflow: {
      OPEN: 'Data entry in progress',
      SUBMITTED: 'Awaiting finance review',
      APPROVED: 'Approved, ready to lock',
      LOCKED: 'Final, immutable baseline'
    },
    rbac: {
      OPS: 'Can create and submit counts',
      FINANCE: 'Can approve counts',
      OWNER: 'Can override all actions'
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  GUARDRAILS_CONFIG,

  // Individual validators (v15.5.0)
  validateFiscalPeriod,
  validateNonNegativeTotal,
  validateTaxMath,
  validateKnownVendor,
  checkDuplicateInvoice,
  validateLineItemsTotal,

  // Comprehensive validation (v15.5.0)
  validateDocument,

  // Count session validators (v15.6.0)
  validateCountSession,
  validateForSubmit,
  validateForApproval,
  validateForLock,
  validateCountTaxes,
  checkHistoricalVariances,
  checkDualControl,
  computeFinanceSummary,
  checkRole,
  getValidationRules
};
