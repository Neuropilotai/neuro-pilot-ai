/**
 * GFS Case Extractor Service
 * NeuroPilot AI Enterprise v22.3
 *
 * Extracts individual CASE numbers and weights from GFS invoice OCR text.
 * Supports per-case meat weight tracking and box ID management.
 *
 * Ported from: scripts/extract_with_fifo.js (lines 42-65)
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

/**
 * GfsCaseExtractor Class
 * Extracts case-level data from GFS invoice text
 */
class GfsCaseExtractor {
  /**
   * Regex pattern for GFS case extraction
   * Matches: "CASE: 410143069783 WEIGHT: 25.70"
   */
  static CASE_PATTERN = /CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/gi;

  /**
   * Regex pattern for product codes (7-9 digit GFS item codes)
   */
  static PRODUCT_CODE_PATTERN = /^(\d{7,9})/;

  /**
   * GFS meat category codes (first 2 digits of item code)
   * These categories typically have individual case weights
   */
  static MEAT_CATEGORIES = ['01', '02', '03', '04', '05', '10', '11', '12'];

  /**
   * Keywords that indicate meat products
   */
  static MEAT_KEYWORDS = [
    'beef', 'pork', 'chicken', 'lamb', 'turkey', 'meat', 'steak', 'roast',
    'ground', 'patty', 'sausage', 'bacon', 'ham', 'brisket', 'ribeye',
    'sirloin', 'tenderloin', 'chuck', 'rib', 'wing', 'breast', 'thigh',
    'drumstick', 'veal', 'duck', 'seafood', 'fish', 'salmon', 'shrimp'
  ];

  /**
   * Section ending markers
   */
  static SECTION_MARKERS = ['Page Total', 'Group Summary', 'CATEGORY RECAP', 'TOTAL WEIGHT:'];

  /**
   * Determine if an item is a meat product that should have case tracking
   *
   * @param {string} itemCode - GFS item code
   * @param {string} description - Item description
   * @returns {boolean}
   */
  isMeatProduct(itemCode, description = '') {
    // Check if item code starts with a meat category
    if (itemCode) {
      const categoryCode = itemCode.substring(0, 2);
      if (GfsCaseExtractor.MEAT_CATEGORIES.includes(categoryCode)) {
        return true;
      }
    }

    // Check description for meat keywords
    if (description) {
      const descLower = description.toLowerCase();
      return GfsCaseExtractor.MEAT_KEYWORDS.some(kw => descLower.includes(kw));
    }

    return false;
  }

  /**
   * Extract cases from raw text for a specific product code
   *
   * @param {string} rawText - Full OCR text from invoice
   * @param {string} productCode - The item code to find cases for
   * @returns {Array<Object>} Array of { caseNumber, weight, weightUnit, sequenceNumber }
   */
  extractCasesFromText(rawText, productCode) {
    if (!rawText || !productCode) {
      return [];
    }

    const cases = [];
    const lines = rawText.split('\n');

    // Find the line containing this product code
    let productLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith(productCode) || line.includes(productCode)) {
        productLineIndex = i;
        break;
      }
    }

    if (productLineIndex === -1) {
      return cases;
    }

    // Scan lines after the product for CASE entries
    let sequenceNumber = 0;
    for (let i = productLineIndex + 1; i < Math.min(productLineIndex + 30, lines.length); i++) {
      const line = lines[i].trim();

      // Stop if we hit another product code (7-9 digit pattern at start)
      if (GfsCaseExtractor.PRODUCT_CODE_PATTERN.test(line)) {
        break;
      }

      // Stop if we hit a section marker
      if (GfsCaseExtractor.SECTION_MARKERS.some(marker => line.includes(marker))) {
        break;
      }

      // Match CASE: pattern
      const caseMatch = line.match(/CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/i);
      if (caseMatch) {
        sequenceNumber++;
        cases.push({
          caseNumber: caseMatch[1],
          weight: parseFloat(caseMatch[2]),
          weightUnit: 'KG',
          sequenceNumber: sequenceNumber
        });
      }
    }

    return cases;
  }

  /**
   * Extract all cases for all line items in an invoice
   *
   * @param {string} rawText - Full OCR text from invoice
   * @param {Array<Object>} lineItems - Array of { productCode, description, lineNumber }
   * @returns {Map<string, Array<Object>>} Map of productCode -> cases[]
   */
  extractAllCases(rawText, lineItems) {
    const casesMap = new Map();

    if (!rawText || !lineItems || lineItems.length === 0) {
      return casesMap;
    }

    for (const item of lineItems) {
      const productCode = item.productCode || item.vendor_sku || item.vendorSku;
      const description = item.description || '';

      // Only extract cases for meat products
      if (this.isMeatProduct(productCode, description)) {
        const cases = this.extractCasesFromText(rawText, productCode);
        if (cases.length > 0) {
          casesMap.set(productCode, cases);
        }
      }
    }

    return casesMap;
  }

  /**
   * Parse raw text and extract all detectable cases (without requiring line items)
   * Useful for debugging and validation
   *
   * @param {string} rawText - Full OCR text from invoice
   * @returns {Array<Object>} Array of all detected cases with product codes
   */
  extractAllDetectedCases(rawText) {
    if (!rawText) {
      return [];
    }

    const allCases = [];
    const lines = rawText.split('\n');

    let currentProductCode = null;
    let sequenceNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a product line
      const productMatch = line.match(GfsCaseExtractor.PRODUCT_CODE_PATTERN);
      if (productMatch) {
        currentProductCode = productMatch[1];
        sequenceNumber = 0;
        continue;
      }

      // Check for CASE entries
      const caseMatch = line.match(/CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/i);
      if (caseMatch && currentProductCode) {
        sequenceNumber++;
        allCases.push({
          productCode: currentProductCode,
          caseNumber: caseMatch[1],
          weight: parseFloat(caseMatch[2]),
          weightUnit: 'KG',
          sequenceNumber: sequenceNumber,
          rawLine: line
        });
      }
    }

    return allCases;
  }

  /**
   * Get total weight for all cases of a product
   *
   * @param {Array<Object>} cases - Array of case objects
   * @returns {number} Total weight in KG
   */
  getTotalWeight(cases) {
    if (!cases || cases.length === 0) {
      return 0;
    }
    return cases.reduce((sum, c) => sum + (c.weight || 0), 0);
  }

  /**
   * Convert KG to LB
   *
   * @param {number} kg - Weight in kilograms
   * @returns {number} Weight in pounds
   */
  static kgToLb(kg) {
    return kg * 2.20462;
  }
}

module.exports = GfsCaseExtractor;
