/**
 * GFS Invoice Parser V2 - Robust OCR Parsing with Currency Precision
 *
 * Fixes for line items corruption:
 * 1. Integer cents for all currency values
 * 2. Normalized UOM with pack size parsing
 * 3. Column alignment detection with anchors
 * 4. Line total validation against header total
 * 5. Item Bank mapping with confidence scoring
 *
 * @author NeuroPilot v15.7+
 * @date 2025-10-14
 */

const crypto = require('crypto');

// Lazy-load PostgreSQL pool for enterprise multi-tenant support
let pool = null;
const getPool = () => {
  if (!pool) {
    try {
      pool = require('../../db/postgres').pool;
    } catch (err) {
      console.warn('[GFSInvoiceParser] PostgreSQL pool not available:', err.message);
    }
  }
  return pool;
};

// Helper to run queries (PostgreSQL style)
const db = {
  async get(sql, params = []) {
    const p = getPool();
    if (!p) return null;
    // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
    let idx = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
    const result = await p.query(pgSql, params);
    return result.rows[0] || null;
  },
  async all(sql, params = []) {
    const p = getPool();
    if (!p) return [];
    let idx = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
    const result = await p.query(pgSql, params);
    return result.rows;
  },
  async run(sql, params = []) {
    const p = getPool();
    if (!p) return { changes: 0 };
    let idx = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
    const result = await p.query(pgSql, params);
    return { changes: result.rowCount };
  }
};

class GFSInvoiceParserV2 {
  constructor(options = {}) {
    this.tolerance = options.tolerance || 50; // cents
    this.minConfidence = options.minConfidence || 0.95;
    this.debug = options.debug || false;
  }

  /**
   * Parse GFS invoice from extracted text/JSON
   * @param {Object} invoice - Raw invoice data from OCR
   * @returns {Object} Parsed and validated invoice
   */
  async parseInvoice(invoice) {
    try {
      const parsed = {
        header: await this.parseHeader(invoice),
        lineItems: await this.parseLineItems(invoice),
        validation: { errors: [], warnings: [] }
      };

      // Validate totals
      await this.validateInvoiceTotals(parsed);

      // Map categories
      await this.mapCategories(parsed);

      return parsed;
    } catch (error) {
      console.error('❌ Invoice parsing failed:', error);
      throw error;
    }
  }

  /**
   * Parse invoice header with cents precision
   */
  async parseHeader(invoice) {
    const header = {
      invoiceNumber: this.cleanInvoiceNumber(invoice.invoice_number),
      invoiceDate: this.parseDate(invoice.invoice_date),
      dueDate: this.parseDate(invoice.due_date),
      vendor: invoice.vendor || 'GFS',
      customerNumber: invoice.customer_number,
      purchaseOrder: invoice.purchase_order,

      // Parse category recap if available
      categoryRecap: this.parseCategoryRecap(invoice.extracted_text || invoice.text),

      // Money values in cents
      subtotalCents: 0,
      gstCents: 0,
      qstCents: 0,
      totalCents: 0,
      freightCents: 0,
      fuelChargeCents: 0,
      miscChargesCents: 0
    };

    // Extract totals from text
    const totals = this.extractTotalsFromText(invoice.extracted_text || invoice.text || '');

    header.subtotalCents = this.dollarsToCents(totals.subtotal || invoice.subtotal || 0);
    header.gstCents = this.dollarsToCents(totals.gst || invoice.gst || 0);
    header.qstCents = this.dollarsToCents(totals.qst || invoice.qst || invoice.pst || 0);
    header.totalCents = this.dollarsToCents(totals.total || invoice.invoice_amount || invoice.total || 0);
    header.freightCents = this.dollarsToCents(totals.freight || 0);
    header.fuelChargeCents = this.dollarsToCents(totals.fuel_charge || 0);

    return header;
  }

  /**
   * Parse line items with robust column alignment
   */
  async parseLineItems(invoice) {
    const lineItems = [];
    const rawLines = invoice.line_items || [];

    for (const rawLine of rawLines) {
      try {
        const lineItem = await this.parseLineItem(rawLine, invoice);
        if (lineItem) {
          lineItems.push(lineItem);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to parse line item:`, error.message);
        console.warn(`   Raw data:`, JSON.stringify(rawLine));
      }
    }

    return lineItems;
  }

  /**
   * Parse single line item with normalization
   */
  async parseLineItem(rawLine, invoice) {
    // Extract fields with multiple fallback strategies
    const itemNo = rawLine.product_code || rawLine.item_no || rawLine.product_no || '';
    const description = rawLine.description || rawLine.item_name || '';
    const quantity = this.parseQuantity(rawLine.quantity);
    const unit = this.normalizeUnit(rawLine.unit || rawLine.uom || 'EACH');
    const packSize = rawLine.pack_size || this.extractPackSize(description);

    // Price parsing with multiple strategies
    let unitPriceCents = 0;
    let lineTotalCents = 0;

    // Strategy 1: Use line_total if available (most reliable from GFS invoices)
    if (rawLine.line_total !== null && rawLine.line_total !== undefined) {
      lineTotalCents = this.dollarsToCents(rawLine.line_total);

      // Back-calculate unit price from line total
      if (quantity > 0) {
        unitPriceCents = Math.round(lineTotalCents / quantity);
      }
    }
    // Strategy 2: Calculate from unit_price * quantity
    else if (rawLine.unit_price !== null && rawLine.unit_price !== undefined) {
      unitPriceCents = this.dollarsToCents(rawLine.unit_price);
      lineTotalCents = Math.round(unitPriceCents * quantity);
    }
    // Strategy 3: Parse from text if structured data missing
    else {
      const parsed = this.parseLineFromText(rawLine.raw_text || '');
      unitPriceCents = parsed.unitPriceCents;
      lineTotalCents = parsed.lineTotalCents;
    }

    // Normalize quantity and UOM
    const normalized = await this.normalizeQuantityAndUom(quantity, unit, packSize);

    const lineItem = {
      lineItemId: this.generateLineItemId(invoice.invoice_number, itemNo, description),
      invoiceNumber: invoice.invoice_number,
      productCode: itemNo,
      description,
      category: rawLine.category || null,

      // Raw values
      quantity,
      unit,
      packSize,

      // Normalized values
      normalizedQuantity: normalized.quantity,
      normalizedUom: normalized.uom,

      // Money in cents
      unitPriceCents,
      lineTotalCents,

      // Metadata
      brand: rawLine.brand || null,
      barcode: rawLine.barcode || null,
      validationStatus: 'PENDING',
      validationError: null
    };

    // Validate line item
    this.validateLineItem(lineItem);

    return lineItem;
  }

  /**
   * Parse category recap from invoice text (GFS provides this)
   */
  parseCategoryRecap(text) {
    if (!text) return null;

    const recap = {};
    const recapSection = text.match(/CATEGORY RECAP([\s\S]*?)(?:Total|Sub total|$)/i);

    if (!recapSection) return null;

    // Parse lines like: "Produce 2824.07 2.000 1137.18"
    const lines = recapSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Za-z\s]+)\s+([\d,]+\.[\d]+)/);
      if (match) {
        const category = match[1].trim();
        const amount = parseFloat(match[2].replace(/,/g, ''));
        recap[category] = this.dollarsToCents(amount);
      }
    }

    return Object.keys(recap).length > 0 ? recap : null;
  }

  /**
   * Extract totals from invoice text using anchored patterns
   */
  extractTotalsFromText(text) {
    const totals = {
      subtotal: 0,
      gst: 0,
      qst: 0,
      pst: 0,
      total: 0,
      freight: 0,
      fuel_charge: 0
    };

    if (!text) return totals;

    // Anchored patterns with context
    const patterns = {
      subtotal: /(?:Sub total|Subtotal|Product Total)[\s:$]*\$?([\d,]+\.[\d]{2})/i,
      gst: /(?:GST\/HST|GST)[\s:$]*\$?([\d,]+\.[\d]{2})/i,
      qst: /(?:PST\/QST|QST|PST)[\s:$]*\$?([\d,]+\.[\d]{2})/i,
      total: /(?:Invoice Total|Total)[\s:$]*\$?([\d,]+\.[\d]{2})/i,
      freight: /(?:Freight|Shipping)[\s:$]*\$?([\d,]+\.[\d]{2})/i,
      fuel_charge: /(?:Fuel Charge)[\s:$]*\$?([\d,]+\.[\d]{2})/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        totals[key] = parseFloat(match[1].replace(/,/g, ''));
      }
    }

    return totals;
  }

  /**
   * Normalize quantity and UOM using pack size parsing
   */
  async normalizeQuantityAndUom(quantity, unit, packSize) {
    // Parse pack size (e.g., "6x2kg" -> multiplier 12 if unit is KG)
    const packMultiplier = this.parsePackSizeMultiplier(packSize, unit);

    // Look up UOM conversion
    const conversion = await this.lookupUomConversion(unit);

    return {
      quantity: quantity * packMultiplier * conversion.multiplier,
      uom: conversion.toUom
    };
  }

  /**
   * Parse pack size to get multiplier
   * Examples: "6x2kg" -> 12, "12/1lb" -> 12, "24ct" -> 24
   */
  parsePackSizeMultiplier(packSize, unit) {
    if (!packSize) return 1;

    // Pattern: 6x2kg
    const multPattern = packSize.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (multPattern) {
      return parseInt(multPattern[1]) * parseInt(multPattern[2]);
    }

    // Pattern: 12/1lb or 12ct
    const countPattern = packSize.match(/(\d+)\s*[\/\-]|(\d+)\s*ct/i);
    if (countPattern) {
      return parseInt(countPattern[1] || countPattern[2]);
    }

    return 1;
  }

  /**
   * Extract pack size from description
   */
  extractPackSize(description) {
    if (!description) return null;

    const patterns = [
      /(\d+[xX]\d+\w+)/,           // 6x2kg
      /(\d+\/\d+\w+)/,             // 12/1lb
      /(\d+\s*ct)/i,               // 24ct
      /(\d+\s*[pP][kK])/,          // 12pk
      /(\d+\s*[cC][aA][sS][eE])/   // 6case
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Look up UOM conversion from database
   */
  async lookupUomConversion(fromUom) {
    try {
      const result = await db.get(
        `SELECT to_uom, multiplier FROM uom_conversions
         WHERE from_uom = ? AND vendor = 'GFS' LIMIT 1`,
        [fromUom.toUpperCase()]
      );

      if (result) {
        return { toUom: result.to_uom, multiplier: result.multiplier };
      }

      // Default: assume 1:1 conversion
      return { toUom: fromUom.toUpperCase(), multiplier: 1.0 };
    } catch (error) {
      console.warn(`UOM conversion lookup failed for ${fromUom}:`, error);
      return { toUom: fromUom.toUpperCase(), multiplier: 1.0 };
    }
  }

  /**
   * Map line items to categories using Item Bank and rules
   */
  async mapCategories(parsed) {
    for (const lineItem of parsed.lineItems) {
      try {
        // Try Item Bank lookup first
        const itemBankMatch = await this.lookupItemBank(lineItem.productCode);

        if (itemBankMatch) {
          lineItem.itemId = itemBankMatch.item_id;
          lineItem.categoryCode = itemBankMatch.category_code;
          lineItem.taxProfileId = itemBankMatch.tax_profile_id;
          lineItem.mappingConfidence = 1.0;
          lineItem.mappingSource = 'ITEM_BANK';
          continue;
        }

        // Try GFS category from invoice
        if (lineItem.category) {
          const categoryMatch = await this.mapGfsCategory(lineItem.category);
          if (categoryMatch) {
            lineItem.categoryCode = categoryMatch.category_code;
            lineItem.taxProfileId = categoryMatch.tax_profile_id;
            lineItem.mappingConfidence = categoryMatch.confidence;
            lineItem.mappingSource = 'GFS_CATEGORY';
            continue;
          }
        }

        // Try mapping rules
        const ruleMatch = await this.applyMappingRules(lineItem.description);

        if (ruleMatch && ruleMatch.confidence >= this.minConfidence) {
          lineItem.categoryCode = ruleMatch.category_code;
          lineItem.taxProfileId = ruleMatch.tax_profile_id;
          lineItem.mappingConfidence = ruleMatch.confidence;
          lineItem.mappingSource = 'MAPPING_RULE';
        } else {
          // Queue for manual mapping
          await this.queueForMapping(lineItem, ruleMatch);
          lineItem.validationStatus = 'NEEDS_MAPPING';
          lineItem.validationError = 'Category mapping confidence below threshold';
        }

      } catch (error) {
        console.error(`Failed to map category for line item:`, error);
        lineItem.validationStatus = 'ERROR';
        lineItem.validationError = error.message;
      }
    }
  }

  /**
   * Lookup item in Item Bank
   */
  async lookupItemBank(productCode) {
    if (!productCode) return null;

    try {
      return await db.get(
        `SELECT item_id, category_code, tax_profile_id
         FROM item_bank
         WHERE vendor = 'GFS' AND item_no = ? AND status = 'ACTIVE'
         LIMIT 1`,
        [productCode]
      );
    } catch (error) {
      console.warn(`Item Bank lookup failed for ${productCode}:`, error);
      return null;
    }
  }

  /**
   * Map GFS category name to our category code
   */
  async mapGfsCategory(gfsCategoryName) {
    if (!gfsCategoryName) return null;

    try {
      const result = await db.get(
        `SELECT category_code, confidence FROM gfs_category_patterns
         WHERE gfs_category_name = ? LIMIT 1`,
        [gfsCategoryName]
      );

      if (result) {
        // Get default tax profile for category
        const taxProfile = await db.get(
          `SELECT tax_profile_id FROM tax_profiles WHERE profile_name = 'ZERO_RATED' LIMIT 1`
        );

        return {
          category_code: result.category_code,
          tax_profile_id: taxProfile ? taxProfile.tax_profile_id : 5,
          confidence: result.confidence
        };
      }

      return null;
    } catch (error) {
      console.warn(`GFS category mapping failed for ${gfsCategoryName}:`, error);
      return null;
    }
  }

  /**
   * Apply keyword-based mapping rules
   */
  async applyMappingRules(description) {
    if (!description) return null;

    try {
      const rules = await db.all(
        `SELECT category_code, tax_profile_id, confidence, priority
         FROM finance_mapping_rules
         WHERE vendor = 'GFS' AND active = 1 AND rule_type = 'KEYWORD'
         ORDER BY priority ASC`
      );

      const descUpper = description.toUpperCase();
      let bestMatch = null;

      for (const rule of rules) {
        const pattern = await db.get(
          `SELECT pattern FROM finance_mapping_rules WHERE rule_id = ?`,
          [rule.rule_id]
        );

        if (pattern && descUpper.includes(pattern.pattern.toUpperCase())) {
          if (!bestMatch || rule.confidence > bestMatch.confidence) {
            bestMatch = rule;
          }
        }
      }

      return bestMatch;
    } catch (error) {
      console.warn(`Mapping rules application failed:`, error);
      return null;
    }
  }

  /**
   * Queue unmapped item for manual review
   */
  async queueForMapping(lineItem, suggestedMatch) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO needs_mapping
         (vendor, item_no, description, uom, pack_size, suggested_category,
          confidence_score, invoice_number, line_total_cents, occurrences, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING')
         ON CONFLICT(vendor, item_no) DO UPDATE SET
           occurrences = occurrences + 1,
           line_total_cents = line_total_cents + excluded.line_total_cents`,
        [
          'GFS',
          lineItem.productCode,
          lineItem.description,
          lineItem.unit,
          lineItem.packSize,
          suggestedMatch ? suggestedMatch.category_code : null,
          suggestedMatch ? suggestedMatch.confidence : 0,
          lineItem.invoiceNumber,
          lineItem.lineTotalCents
        ]
      );
    } catch (error) {
      console.error(`Failed to queue item for mapping:`, error);
    }
  }

  /**
   * Validate invoice totals
   */
  async validateInvoiceTotals(parsed) {
    // Sum line item totals
    const lineItemsSum = parsed.lineItems.reduce(
      (sum, item) => sum + (item.lineTotalCents || 0),
      0
    );

    // Calculate expected header total (subtotal + taxes)
    const expectedTotal = parsed.header.subtotalCents +
                         parsed.header.gstCents +
                         parsed.header.qstCents +
                         parsed.header.freightCents +
                         parsed.header.fuelChargeCents +
                         parsed.header.miscChargesCents;

    // Validate line items sum against subtotal
    const subtotalVariance = Math.abs(lineItemsSum - parsed.header.subtotalCents);

    if (subtotalVariance > this.tolerance) {
      parsed.validation.errors.push({
        type: 'SUBTOTAL_MISMATCH',
        message: `Line items sum (${this.centsToDollars(lineItemsSum)}) does not match subtotal (${this.centsToDollars(parsed.header.subtotalCents)})`,
        variance: subtotalVariance,
        severity: 'ERROR'
      });
    }

    // Validate total
    const totalVariance = Math.abs(expectedTotal - parsed.header.totalCents);

    if (totalVariance > this.tolerance) {
      parsed.validation.warnings.push({
        type: 'TOTAL_CALC_VARIANCE',
        message: `Calculated total variance: ${this.centsToDollars(totalVariance)}`,
        variance: totalVariance,
        severity: 'WARNING'
      });
    }

    parsed.validation.lineItemsSumCents = lineItemsSum;
    parsed.validation.expectedTotalCents = expectedTotal;
    parsed.validation.subtotalVariance = subtotalVariance;
    parsed.validation.totalVariance = totalVariance;
    parsed.validation.isValid = parsed.validation.errors.length === 0;
  }

  /**
   * Validate single line item
   */
  validateLineItem(lineItem) {
    // Check for required fields
    if (!lineItem.description) {
      lineItem.validationStatus = 'ERROR';
      lineItem.validationError = 'Missing description';
      return;
    }

    if (lineItem.quantity <= 0) {
      lineItem.validationStatus = 'ERROR';
      lineItem.validationError = 'Invalid quantity';
      return;
    }

    if (lineItem.lineTotalCents < 0) {
      lineItem.validationStatus = 'ERROR';
      lineItem.validationError = 'Negative line total';
      return;
    }

    // Check reasonableness
    if (lineItem.unitPriceCents > 100000000) { // $1M per unit
      lineItem.validationStatus = 'WARNING';
      lineItem.validationError = 'Unit price seems very high';
    }
  }

  /**
   * Currency conversion utilities
   */
  dollarsToCents(dollars) {
    if (dollars === null || dollars === undefined || dollars === '') return 0;
    return Math.round(parseFloat(dollars) * 100);
  }

  centsToDollars(cents) {
    return (cents / 100).toFixed(2);
  }

  /**
   * Normalize unit strings
   */
  normalizeUnit(unit) {
    const normalized = unit.toUpperCase().trim();
    const unitMap = {
      'EA': 'EACH', 'PC': 'EACH', 'PIECE': 'EACH',
      'CS': 'CASE', 'BX': 'BOX',
      'PK': 'PACK', 'PKG': 'PACK',
      'LB': 'LB', 'POUND': 'LB',
      'KG': 'KG', 'KILO': 'KG',
      'CTN': 'CARTON', 'CRTN': 'CARTON'
    };
    return unitMap[normalized] || normalized;
  }

  /**
   * Clean invoice number
   */
  cleanInvoiceNumber(invoiceNo) {
    if (!invoiceNo) return '';
    return String(invoiceNo).replace(/[^0-9A-Z]/gi, '');
  }

  /**
   * Parse date flexibly
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.substring(0, 10);
    }

    // Try MM/DD/YYYY
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return null;
  }

  /**
   * Generate deterministic line item ID
   */
  generateLineItemId(invoiceNumber, productCode, description) {
    const hash = crypto.createHash('md5')
      .update(`${invoiceNumber}-${productCode}-${description}`)
      .digest('hex');
    return `LI-${hash.substring(0, 12)}`;
  }

  /**
   * Parse line from raw text (fallback strategy)
   */
  parseLineFromText(text) {
    // Try to extract price and total from free-form text
    const prices = text.match(/\$?([\d,]+\.[\d]{2})/g) || [];

    let unitPriceCents = 0;
    let lineTotalCents = 0;

    if (prices.length >= 2) {
      // Assume last price is line total, second-to-last is unit price
      lineTotalCents = this.dollarsToCents(prices[prices.length - 1]);
      unitPriceCents = this.dollarsToCents(prices[prices.length - 2]);
    } else if (prices.length === 1) {
      lineTotalCents = this.dollarsToCents(prices[0]);
    }

    return { unitPriceCents, lineTotalCents };
  }
}

module.exports = GFSInvoiceParserV2;
