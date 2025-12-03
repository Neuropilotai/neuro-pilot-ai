/**
 * Vendor Order Parser Service
 * NeuroPilot AI Enterprise V22.2
 *
 * Integrates with existing OCR/PDF infrastructure to parse vendor order PDFs.
 * Supports multiple vendor formats (Sysco, GFS, US Foods, etc.)
 *
 * @version 22.2
 * @author NeuroPilot AI Team
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');
const ordersStorage = require('../config/ordersStorage');

// Import Google Drive service
let googleDriveService = null;
try {
  googleDriveService = require('./GoogleDriveService');
} catch (err) {
  console.warn('[VendorOrderParser] Google Drive service not available:', err.message);
}

// Import pdf-parse for text extraction
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.warn('[VendorOrderParser] pdf-parse not available:', err.message);
}

// Import existing OCR engine
let ocrEngine = null;
try {
  ocrEngine = require('./ocr/TesseractOCR');
} catch (err) {
  console.warn('[VendorOrderParser] OCR engine not available:', err.message);
}

// Import GFS parser for GFS-specific invoices
let gfsParser = null;
try {
  gfsParser = require('../src/finance/GFSInvoiceParserV2');
} catch (err) {
  console.warn('[VendorOrderParser] GFS parser not available:', err.message);
}

// ============================================
// CONFIGURATION
// ============================================

const PARSER_CONFIG = {
  tempDir: process.env.ORDER_TEMP_DIR || '/tmp/neuropilot-orders',
  timeout: parseInt(process.env.ORDER_PARSE_TIMEOUT_MS) || 60000,
  maxFileSize: parseInt(process.env.ORDER_MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  supportedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
};

// ============================================
// VENDOR ORDER PARSER SERVICE
// ============================================

class VendorOrderParserService {
  constructor(options = {}) {
    this.config = { ...PARSER_CONFIG, ...options };
    this.initialized = false;
  }

  /**
   * Initialize parser service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create temp directory if it doesn't exist
      await fs.mkdir(this.config.tempDir, { recursive: true });

      // Initialize OCR engine if available
      if (ocrEngine && ocrEngine.initialize) {
        await ocrEngine.initialize();
      }

      this.initialized = true;
      console.log('[VendorOrderParser] Initialized successfully');
    } catch (error) {
      console.error('[VendorOrderParser] Initialization failed:', error.message);
    }
  }

  /**
   * Parse a vendor order PDF from Google Drive
   *
   * @param {string} orderId - UUID of the vendor_order record
   * @param {string} pdfFileId - Google Drive file ID
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsing result
   */
  async parseOrderFromGoogleDrive(orderId, pdfFileId, options = {}) {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    const result = {
      orderId,
      pdfFileId,
      success: false,
      ocrConfidence: 0,
      ocrEngine: 'pdf-parse',
      parseDurationMs: 0,
      header: null,
      linesFound: 0,
      lines: [],
      errors: [],
      warnings: []
    };

    let tempFilePath = null;

    try {
      // Check if Google Drive service is available
      if (!googleDriveService || !googleDriveService.initialized) {
        throw new Error('Google Drive service not initialized');
      }

      // Check if pdf-parse is available
      if (!pdfParse) {
        throw new Error('pdf-parse library not available');
      }

      console.log('[VendorOrderParser] Downloading PDF from Google Drive:', pdfFileId);

      // Download PDF to temp file
      tempFilePath = path.join(this.config.tempDir, `${orderId}_${Date.now()}.pdf`);
      await googleDriveService.downloadFile(pdfFileId, tempFilePath);

      console.log('[VendorOrderParser] PDF downloaded to:', tempFilePath);

      // Read PDF buffer
      const pdfBuffer = await fs.readFile(tempFilePath);

      // Extract text using pdf-parse
      console.log('[VendorOrderParser] Extracting text from PDF...');
      const pdfData = await pdfParse(pdfBuffer);
      const extractedText = pdfData.text || '';

      console.log('[VendorOrderParser] Extracted', extractedText.length, 'characters from PDF');

      if (extractedText.length < 50) {
        result.warnings.push('PDF contained very little extractable text. May be image-based.');
      }

      // Parse the extracted text
      const parsed = await this.parseInvoiceText(extractedText, options);

      result.header = parsed.header;
      result.lines = parsed.lines;
      result.linesFound = parsed.lines.length;
      result.ocrConfidence = extractedText.length > 100 ? 0.85 : 0.5;

      // Save results to database
      await this.saveParseResults(orderId, result, extractedText);

      result.success = true;
      result.parseDurationMs = Date.now() - startTime;

      console.log('[VendorOrderParser] Parse complete:', {
        orderId,
        linesFound: result.linesFound,
        vendor: result.header?.vendorName,
        total: result.header?.total,
        duration: result.parseDurationMs
      });

      return result;

    } catch (error) {
      console.error('[VendorOrderParser] Parse error:', error);
      result.errors.push(error.message);
      result.parseDurationMs = Date.now() - startTime;

      // Update order status to error
      try {
        await pool.query(`
          UPDATE vendor_orders
          SET status = 'error', error_message = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [orderId, error.message]);
      } catch (dbError) {
        console.error('[VendorOrderParser] Failed to update error status:', dbError);
      }

      return result;

    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Parse a vendor order from local file path
   *
   * @param {string} orderId - UUID of the vendor_order record
   * @param {string} filePath - Local file path
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsing result
   */
  async parseOrderFromFile(orderId, filePath, options = {}) {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    const result = {
      orderId,
      filePath,
      success: false,
      ocrConfidence: 0,
      ocrEngine: 'none',
      parseDurationMs: 0,
      header: null,
      linesFound: 0,
      lines: [],
      errors: [],
      warnings: []
    };

    try {
      // Verify file exists
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      // Check file size
      if (stats.size > this.config.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
      }

      // Determine file type
      const ext = path.extname(filePath).toLowerCase();
      const isPDF = ext === '.pdf';
      const isImage = ['.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(ext);

      if (!isPDF && !isImage) {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      // Extract text using OCR
      let ocrResult;

      if (isPDF) {
        ocrResult = await this.extractTextFromPDF(filePath);
      } else {
        ocrResult = await this.extractTextFromImage(filePath);
      }

      result.ocrConfidence = ocrResult.confidence;
      result.ocrEngine = ocrResult.engine;

      if (!ocrResult.text || ocrResult.text.length < 50) {
        result.warnings.push('OCR extracted very little text. PDF may be image-based or corrupted.');
      }

      // Parse the extracted text
      const parsed = await this.parseInvoiceText(ocrResult.text, options);

      result.header = parsed.header;
      result.lines = parsed.lines;
      result.linesFound = parsed.lines.length;

      // Store results in database
      await this.saveParseResults(orderId, result, ocrResult.text);

      result.success = true;
      result.parseDurationMs = Date.now() - startTime;

      console.log('[VendorOrderParser] Parse complete:', {
        orderId,
        linesFound: result.linesFound,
        confidence: result.ocrConfidence,
        duration: result.parseDurationMs
      });

      return result;

    } catch (error) {
      console.error('[VendorOrderParser] Parse error:', error);
      result.errors.push(error.message);
      result.parseDurationMs = Date.now() - startTime;

      // Update order status to error
      try {
        await pool.query(`
          UPDATE vendor_orders
          SET status = 'error', error_message = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [orderId, error.message]);
      } catch (dbError) {
        console.error('[VendorOrderParser] Failed to update error status:', dbError);
      }

      return result;
    }
  }

  /**
   * Extract text from PDF file
   */
  async extractTextFromPDF(filePath) {
    if (ocrEngine && ocrEngine.extractTextFromPDF) {
      return await ocrEngine.extractTextFromPDF(filePath);
    }

    return {
      text: '',
      confidence: 0,
      engine: 'none',
      error: 'OCR engine not available'
    };
  }

  /**
   * Extract text from image file
   */
  async extractTextFromImage(filePath) {
    if (ocrEngine && ocrEngine.extractText) {
      return await ocrEngine.extractText(filePath);
    }

    return {
      text: '',
      confidence: 0,
      engine: 'none',
      error: 'OCR engine not available'
    };
  }

  /**
   * Parse invoice text into structured data
   * Supports multiple vendor formats
   */
  async parseInvoiceText(text, options = {}) {
    const result = {
      header: {
        orderNumber: null,
        orderDate: null,
        deliveryDate: null,
        vendorName: null,
        vendorCode: null,
        subtotal: 0,
        tax: 0,
        total: 0
      },
      lines: []
    };

    if (!text) return result;

    // Detect vendor from text
    const vendor = this.detectVendor(text);

    // Parse header (vendor-specific patterns)
    result.header = this.parseGenericHeader(text, vendor);

    // Use vendor-specific line item parser
    if (vendor === 'gfs') {
      result.lines = this.parseGFSLineItems(text);
      // If GFS parser didn't find lines, try the generic parser as fallback
      if (result.lines.length === 0) {
        console.log('[VendorOrderParser] GFS line parser found no items, trying generic parser');
        result.lines = this.parseGenericLineItems(text);
      }
    } else {
      result.lines = this.parseGenericLineItems(text);
    }

    return result;
  }

  /**
   * Detect vendor from invoice text
   */
  detectVendor(text) {
    const textLower = text.toLowerCase();

    if (textLower.includes('gordon food service') || textLower.includes('gfs')) {
      return 'gfs';
    }
    if (textLower.includes('sysco')) {
      return 'sysco';
    }
    if (textLower.includes('us foods') || textLower.includes('usfoods')) {
      return 'usfoods';
    }
    if (textLower.includes('performance food') || textLower.includes('pfg')) {
      return 'pfg';
    }

    return 'unknown';
  }

  /**
   * Parse GFS-specific invoice format
   */
  async parseGFSInvoice(text) {
    try {
      if (gfsParser) {
        const parser = new gfsParser();
        const parsed = await parser.parseInvoice({
          extracted_text: text,
          text: text,
          line_items: []
        });

        return {
          header: {
            orderNumber: parsed.header?.invoiceNumber,
            orderDate: parsed.header?.invoiceDate,
            deliveryDate: null,
            vendorName: 'Gordon Food Service',
            vendorCode: 'GFS',
            subtotal: (parsed.header?.subtotalCents || 0) / 100,
            tax: ((parsed.header?.gstCents || 0) + (parsed.header?.qstCents || 0)) / 100,
            total: (parsed.header?.totalCents || 0) / 100
          },
          lines: (parsed.lineItems || []).map((item, idx) => ({
            lineNumber: idx + 1,
            vendorSku: item.productCode,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: (item.unitPriceCents || 0) / 100,
            extendedPrice: (item.lineTotalCents || 0) / 100,
            categoryCode: item.category,
            brand: item.brand
          }))
        };
      }
    } catch (error) {
      console.warn('[VendorOrderParser] GFS parsing failed, using generic parser:', error.message);
    }

    // Fallback to generic parsing
    return {
      header: this.parseGenericHeader(text),
      lines: this.parseGenericLineItems(text)
    };
  }

  /**
   * Parse generic invoice header
   * @param {string} text - Extracted text from invoice
   * @param {string} vendor - Detected vendor code (gfs, sysco, etc.)
   */
  parseGenericHeader(text, vendor = 'unknown') {
    const header = {
      orderNumber: null,
      orderDate: null,
      deliveryDate: null,
      vendorName: null,
      vendorCode: null,
      subtotal: 0,
      tax: 0,
      total: 0
    };

    // Extract order/invoice number
    const orderMatch = text.match(/(?:order|invoice|inv|doc)[\s#:]+([A-Z0-9\-]+)/i);
    if (orderMatch) {
      header.orderNumber = orderMatch[1].trim();
    }

    // Extract date - try GFS format first (MM/DD/YYYY)
    let dateMatch = text.match(/Invoice Date\s*[\r\n]+[^\r\n]*[\r\n]+(\d{2}\/\d{2}\/\d{4})/i);
    if (!dateMatch) {
      dateMatch = text.match(/(?:date|dated)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
                  text.match(/(\d{4}-\d{2}-\d{2})/);
    }
    if (dateMatch) {
      header.orderDate = this.parseDate(dateMatch[1]);
    }

    // Set vendor based on detection
    if (vendor === 'gfs') {
      header.vendorName = 'GFS';
      header.vendorCode = 'GFS';
    } else if (vendor === 'sysco') {
      header.vendorName = 'Sysco';
      header.vendorCode = 'SYSCO';
    } else if (vendor === 'usfoods') {
      header.vendorName = 'US Foods';
      header.vendorCode = 'USFOODS';
    } else {
      // Extract vendor from text
      const vendorMatch = text.match(/(?:vendor|from|bill from|sold by)[:\s]+([^\n]+)/i);
      if (vendorMatch) {
        header.vendorName = vendorMatch[1].trim().substring(0, 100);
      } else {
        // Use first non-empty line as vendor
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          header.vendorName = lines[0].trim().substring(0, 100);
        }
      }
    }

    // GFS-specific total extraction
    if (vendor === 'gfs') {
      // Look for "Product Total\n$XX,XXX.XX" pattern (subtotal before taxes)
      const gfsProductTotal = text.match(/Product Total[\s\r\n]+\$?([\d,]+\.?\d*)/i);
      if (gfsProductTotal) {
        header.subtotal = parseFloat(gfsProductTotal[1].replace(/,/g, ''));
      }

      // Look for PST/QST and GST/HST taxes
      const gfsPstQst = text.match(/PST\/QST[\s\r\n]+\$?([\d,]+\.?\d*)/i);
      const gfsGstHst = text.match(/GST\/HST[\s\r\n]+\$?([\d,]+\.?\d*)/i);
      if (gfsPstQst) {
        header.tax = parseFloat(gfsPstQst[1].replace(/,/g, ''));
      }
      if (gfsGstHst) {
        header.tax = (header.tax || 0) + parseFloat(gfsGstHst[1].replace(/,/g, ''));
      }

      // Look for "Invoice Total" - GFS format has "Invoice Total\n$XX,XXX.XX"
      // Pattern 1: Invoice Total followed by newline and dollar sign
      let invoiceTotalMatch = text.match(/Invoice\s*Total[\s\r\n]+\$([\d,]+\.\d{2})/i);

      // Pattern 2: "Pay This Amount$XX,XXX.XX" (appears at end of GFS invoices)
      if (!invoiceTotalMatch) {
        invoiceTotalMatch = text.match(/Pay This Amount\s*\$([\d,]+\.\d{2})/i);
      }

      if (invoiceTotalMatch) {
        const parsedTotal = parseFloat(invoiceTotalMatch[1].replace(/,/g, ''));
        // Sanity check: Invoice Total should be >= subtotal
        if (parsedTotal >= (header.subtotal || 0)) {
          header.total = parsedTotal;
          console.log('[VendorOrderParser] GFS: Found Invoice Total:', header.total);
        }
      }

      // Fallback: Calculate total from subtotal + tax
      if (!header.total && header.subtotal) {
        header.total = header.subtotal + (header.tax || 0);
        console.log('[VendorOrderParser] GFS: Calculated total from subtotal + tax:', header.total);
      }
    } else {
      // Generic total extraction
      const totalMatch = text.match(/(?:invoice total|amount due|grand total)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
      if (totalMatch) {
        header.total = parseFloat(totalMatch[1].replace(/,/g, ''));
      } else {
        // Fallback: find the last "total" with amount
        const fallbackTotal = text.match(/(?:^|\s)total[:\s]+\$?[\s]*([\d,]+\.?\d*)/im);
        if (fallbackTotal) {
          header.total = parseFloat(fallbackTotal[1].replace(/,/g, ''));
        }
      }

      const taxMatch = text.match(/(?:tax|sales tax|gst|hst)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
      if (taxMatch) {
        header.tax = parseFloat(taxMatch[1].replace(/,/g, ''));
      }

      const subtotalMatch = text.match(/(?:subtotal|sub-total|sub total)[:\s]+\$?[\s]*([\d,]+\.?\d*)/i);
      if (subtotalMatch) {
        header.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
      }
    }

    return header;
  }

  /**
   * Parse GFS-specific line items from invoice text
   * Format: GFS_CODE ORD_QTY SHIP_QTY UNIT PACK_SIZE BRAND DESCRIPTION CATEGORY UNIT_PRICE EXT_PRICE
   * Example: 9752309 2 2 CS 1x18.18 KG Packer APPLE MCINTOSH 120-140CT PR 35.23 70.46
   * Next line may contain barcode: 650746000217
   * For meat: Also has case tracking lines like "CASE: 410140870551 WEIGHT: 29.07"
   */
  parseGFSLineItems(text) {
    const lines = [];
    if (!text) return lines;

    const textLines = text.split('\n');
    let lineNumber = 0;

    // GFS line item pattern:
    // GFS_CODE(7 digits) ORD_QTY SHIP_QTY UNIT PACK_SIZE BRAND DESCRIPTION CATEGORY UNIT_PRICE EXT_PRICE
    // Pattern captures: code, ord_qty, ship_qty, unit, pack_size, brand+description, category, unit_price, ext_price
    const gfsLinePattern = /^(\d{7})\s+(\d+)\s+(\d+)\s+(CS|EA|LB|KG|PK|BX|DZ|BG)\s+([\dx\.]+\s*(?:KG|LB|OZ|ML|L|G|EA)?[A-Z]*)\s+([A-Za-z][A-Za-z0-9\-&\'\s]+?)([A-Z]{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i;

    // Simpler pattern for lines that don't match the full pattern
    const simplifiedPattern = /^(\d{7})\s+(\d+)\s+(\d+)\s+(CS|EA|LB|KG|PK|BX|DZ|BG)\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i;

    // Barcode pattern (UPC/EAN codes on their own line)
    const barcodePattern = /^(\d{12,14})$/;

    // Case tracking pattern for FIFO meat (CASE: XXXXXX WEIGHT: XX.XX)
    const casePattern = /CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/i;

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i].trim();
      if (!line) continue;

      let match = line.match(gfsLinePattern);

      // Try simplified pattern if full pattern doesn't match
      if (!match) {
        match = line.match(simplifiedPattern);
      }

      if (match) {
        // Full pattern: [full, code, ord, ship, unit, pack, desc+brand, cat, uprice, eprice]
        // Simplified: [full, code, ord, ship, unit, middle, uprice, eprice]
        const isFullPattern = match.length === 10;

        const gfsCode = match[1];
        const orderedQty = parseInt(match[2]);
        const shippedQty = parseInt(match[3]);
        const unit = match[4].toUpperCase();

        let packSize, description, brand, categoryCode, unitPrice, extendedPrice;

        if (isFullPattern) {
          packSize = match[5].trim();
          // Split brand+description - brand is usually first word, all caps portions
          const brandDesc = match[6].trim();
          const brandMatch = brandDesc.match(/^([A-Z][a-z]+|[A-Z]+)\s+(.+)$/);
          if (brandMatch) {
            brand = brandMatch[1];
            description = brandMatch[2].trim();
          } else {
            brand = null;
            description = brandDesc;
          }
          categoryCode = match[7].toUpperCase();
          unitPrice = parseFloat(match[8].replace(/,/g, ''));
          extendedPrice = parseFloat(match[9].replace(/,/g, ''));
        } else {
          // Simplified pattern - parse the middle section
          const middle = match[5].trim();
          // Extract pack size (usually at start like "1x18.18 KG" or "5x4.15 KGA")
          const packMatch = middle.match(/^([\dx\.]+\s*(?:KG|LB|OZ|ML|L|G|EA)?[A-Z]*)\s+(.+)/i);
          if (packMatch) {
            packSize = packMatch[1].trim();
            const rest = packMatch[2].trim();
            // Last two chars before prices might be category
            const catMatch = rest.match(/^(.+?)\s+([A-Z]{2})$/);
            if (catMatch) {
              description = catMatch[1].trim();
              categoryCode = catMatch[2];
            } else {
              description = rest;
              categoryCode = null;
            }
          } else {
            packSize = null;
            description = middle;
            categoryCode = null;
          }
          brand = null;
          unitPrice = parseFloat(match[6].replace(/,/g, ''));
          extendedPrice = parseFloat(match[7].replace(/,/g, ''));
        }

        // Check next line for barcode
        let barcode = null;
        if (i + 1 < textLines.length) {
          const nextLine = textLines[i + 1].trim();
          const barcodeMatch = nextLine.match(barcodePattern);
          if (barcodeMatch) {
            barcode = barcodeMatch[1];
          }
        }

        // Check for case tracking info (for FIFO meat products)
        const cases = [];
        let j = i + 1;
        while (j < textLines.length && j < i + 10) { // Look at next few lines
          const caseLine = textLines[j].trim();
          const caseMatch = caseLine.match(casePattern);
          if (caseMatch) {
            cases.push({
              caseId: caseMatch[1],
              weight: parseFloat(caseMatch[2])
            });
          } else if (caseLine.match(/^(\d{7})\s+/)) {
            // Next item line, stop looking
            break;
          }
          j++;
        }

        lines.push({
          lineNumber: ++lineNumber,
          vendorSku: gfsCode,  // GFS item code as vendor SKU
          gfsCode: gfsCode,    // Also store explicitly
          description: description ? description.substring(0, 255) : 'Unknown Item',
          orderedQty: orderedQty,
          shippedQty: shippedQty,
          quantity: shippedQty, // Use shipped qty as actual quantity
          unit: unit,
          packSize: packSize,
          unitPrice: unitPrice,
          extendedPrice: extendedPrice,
          categoryCode: categoryCode,
          brand: brand,
          upcBarcode: barcode,
          cases: cases.length > 0 ? cases : null, // Case tracking for FIFO
          rawText: line
        });
      }
    }

    console.log(`[VendorOrderParser] GFS: Parsed ${lines.length} line items`);
    return lines;
  }

  /**
   * Parse generic line items from text
   */
  parseGenericLineItems(text) {
    const lines = [];
    if (!text) return lines;

    const textLines = text.split('\n');
    let lineNumber = 0;

    for (const line of textLines) {
      // Look for lines with amounts (price patterns)
      const amountMatch = line.match(/\$?[\s]*([\d,]+\.\d{2})\s*$/);

      if (amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));

        // Extract description (everything before the amount)
        const description = line.substring(0, line.lastIndexOf(amountMatch[0])).trim();

        if (description.length > 3 && amount > 0) {
          // Try to extract quantity and unit price
          const qtyMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:x|@|ea|cs|pk|lb|kg)/i);
          const priceMatch = description.match(/@\s*\$?([\d,]+\.\d{2})/);

          lines.push({
            lineNumber: ++lineNumber,
            vendorSku: null,
            description: description.substring(0, 255),
            quantity: qtyMatch ? parseFloat(qtyMatch[1]) : 1,
            unit: 'EACH',
            unitPrice: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : amount,
            extendedPrice: amount,
            categoryCode: null,
            brand: null,
            rawText: line.trim()
          });
        }
      }
    }

    return lines;
  }

  /**
   * Parse date string to YYYY-MM-DD format
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /(\d{1,2})-(\d{1,2})-(\d{4})/,
      /(\d{1,2})\/(\d{1,2})\/(\d{2})/
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format.source.startsWith('(\\d{4})')) {
          return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
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
   * Save parse results to database
   */
  async saveParseResults(orderId, parseResult, rawText) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update order header (including raw_ocr_text for case extraction)
      await client.query(`
        UPDATE vendor_orders
        SET
          order_number = COALESCE(order_number, $2),
          order_date = COALESCE(order_date, $3::DATE),
          vendor_name = COALESCE(vendor_name, $4),
          subtotal_cents = COALESCE($5, subtotal_cents),
          tax_cents = COALESCE($6, tax_cents),
          total_cents = COALESCE($7, total_cents),
          total_lines = $8,
          status = 'parsed',
          ocr_confidence = $9,
          ocr_engine = $10,
          parse_duration_ms = $11,
          raw_ocr_text = $12,
          parsed_at = CURRENT_TIMESTAMP,
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [
        orderId,
        parseResult.header?.orderNumber,
        parseResult.header?.orderDate,
        parseResult.header?.vendorName,
        parseResult.header?.subtotal ? Math.round(parseResult.header.subtotal * 100) : null,
        parseResult.header?.tax ? Math.round(parseResult.header.tax * 100) : null,
        parseResult.header?.total ? Math.round(parseResult.header.total * 100) : null,
        parseResult.linesFound,
        parseResult.ocrConfidence,
        parseResult.ocrEngine,
        parseResult.parseDurationMs,
        rawText  // Store raw OCR text for case extraction
      ]);

      // Get org_id from order
      const orderResult = await client.query(
        'SELECT org_id FROM vendor_orders WHERE id = $1',
        [orderId]
      );
      const orgId = orderResult.rows[0]?.org_id || 1;

      // Delete existing line items
      await client.query(
        'DELETE FROM vendor_order_lines WHERE order_id = $1',
        [orderId]
      );

      // Insert new line items
      for (const line of parseResult.lines) {
        await client.query(`
          INSERT INTO vendor_order_lines (
            order_id, org_id, line_number, vendor_sku, gfs_code, upc_barcode,
            description, ordered_qty, received_qty, unit, pack_size,
            unit_price_cents, extended_price_cents,
            category_code, brand, raw_text, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          orderId,
          orgId,
          line.lineNumber,
          line.vendorSku || line.gfsCode,  // vendor_sku
          line.gfsCode || null,             // gfs_code
          line.upcBarcode || null,          // upc_barcode
          line.description,
          line.orderedQty || line.quantity, // ordered_qty
          line.shippedQty || line.quantity, // received_qty (shipped = received)
          line.unit,
          line.packSize || null,            // pack_size
          line.unitPrice ? Math.round(line.unitPrice * 100) : 0,
          line.extendedPrice ? Math.round(line.extendedPrice * 100) : 0,
          line.categoryCode,
          line.brand,
          line.rawText,
          line.cases ? JSON.stringify({ cases: line.cases }) : null  // Store case tracking in metadata
        ]);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Compute SHA256 hash of file
   */
  async computeFileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

const parserService = new VendorOrderParserService();

module.exports = parserService;
module.exports.VendorOrderParserService = VendorOrderParserService;
