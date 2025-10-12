#!/usr/bin/env node

/**
 * NeuroPilot v13.1 - Test Case-Level Invoice Extraction
 * Tests extraction of individual case numbers and weights for FIFO tracking
 */

const fs = require('fs');
const pdf = require('pdf-parse');

// Test with special order invoice (BEN 1-2, non-stock item)
const testPdfPath = process.argv[2] || '/Users/davidmikulis/OneDrive/GFS Order PDF/9025025288.pdf';

async function extractFullInvoiceData(pdfPath) {
  try {
    console.log(`📄 Extracting invoice from: ${pdfPath}\n`);

    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    console.log('='.repeat(80));
    console.log('RAW PDF TEXT (first 2000 characters)');
    console.log('='.repeat(80));
    console.log(text.substring(0, 2000));
    console.log('\n' + '='.repeat(80) + '\n');

    // Extract invoice header
    const invoiceNumber = extractInvoiceNumber(text);
    const invoiceDate = extractInvoiceDate(text);
    const totalAmount = extractTotalAmount(text);
    const customerNumber = extractCustomerNumber(text);
    const purchaseOrder = extractPurchaseOrder(text);

    console.log('📋 INVOICE HEADER:');
    console.log(`   Invoice #: ${invoiceNumber}`);
    console.log(`   Date: ${invoiceDate}`);
    console.log(`   Total: $${totalAmount?.toFixed(2) || 'N/A'}`);
    console.log(`   Customer #: ${customerNumber}`);
    console.log(`   PO #: ${purchaseOrder}\n`);

    // Extract order intelligence
    const orderIntel = parseOrderIntelligence(purchaseOrder);
    if (orderIntel) {
      console.log('🧠 ORDER INTELLIGENCE:');
      if (orderIntel.orderedBy) {
        console.log(`   Ordered By: ${orderIntel.orderedBy}`);
      }
      if (orderIntel.weekTags.length > 0) {
        console.log(`   Week Tags: ${orderIntel.weekTags.join(', ')}`);
      }
      console.log('');
    }

    // Extract constraints and special orders
    const constraints = extractOrderConstraints(text);
    if (constraints.specialOrderItems.length > 0 || constraints.nonStockItems.length > 0) {
      console.log('⚠️  ORDER CONSTRAINTS & WARNINGS:');
      constraints.specialOrderItems.forEach(item => {
        console.log(`   🔴 Special Order #${item.orderNumber}`);
        console.log(`      - Longer lead time expected`);
        if (item.nonReturnable) {
          console.log(`      - ⚠️  MAY NOT BE RETURNED`);
        }
      });
      constraints.nonStockItems.forEach(code => {
        console.log(`   🟡 Non-Stock Item: Product ${code}`);
      });
      if (constraints.warnings.length > 0) {
        console.log(`   💡 AI Learning Notes:`);
        constraints.warnings.forEach(w => console.log(`      - ${w}`));
      }
      console.log('');
    }

    // Extract line items with case details
    const lineItems = extractLineItemsWithCases(text);

    console.log('📦 LINE ITEMS WITH CASE-LEVEL DETAILS:\n');
    lineItems.forEach((item, index) => {
      console.log(`Item ${index + 1}:`);
      console.log(`   Product Code: ${item.productCode}`);
      console.log(`   Description: ${item.description}`);
      console.log(`   Quantity: ${item.quantity} ${item.unit}`);
      console.log(`   Unit Price: $${item.unitPrice?.toFixed(2) || 'N/A'}`);
      console.log(`   Line Total: $${item.lineTotal?.toFixed(2) || 'N/A'}`);

      if (item.cases && item.cases.length > 0) {
        console.log(`   ✅ CASE-LEVEL TRACKING (FIFO):`);
        item.cases.forEach((caseInfo, idx) => {
          console.log(`      Case ${idx + 1}: ${caseInfo.caseNumber} - ${caseInfo.weight} ${caseInfo.unit}`);
        });
        if (item.totalWeight) {
          console.log(`      Total Weight: ${item.totalWeight} KG`);
          const pricePerKg = item.lineTotal / item.totalWeight;
          console.log(`      Price per KG: $${pricePerKg.toFixed(2)}`);
        }
      }
      console.log('');
    });

    console.log(`\n✅ Extraction complete! Found ${lineItems.length} line items`);
    const itemsWithCases = lineItems.filter(item => item.cases && item.cases.length > 0);
    console.log(`📊 Items with case-level tracking: ${itemsWithCases.length}`);

    return {
      header: {
        invoiceNumber,
        invoiceDate,
        totalAmount,
        customerNumber,
        purchaseOrder
      },
      orderIntelligence: orderIntel,
      constraints: constraints,
      lineItems
    };

  } catch (error) {
    console.error('❌ Extraction failed:', error.message);
    throw error;
  }
}

function extractInvoiceNumber(text) {
  // GFS format varies:
  // 1. "Invoice\nInventaire\n9025025285" (some invoices)
  // 2. "Invoice\nBEN 1-2\n9025025288" (when PO is present)
  // Look for 10-digit number after "Invoice" within 3 lines
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^Invoice$/i)) {
      // Check next 3 lines for 10-digit invoice number
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const match = lines[j].trim().match(/^(\d{10})$/);
        if (match) {
          return match[1];
        }
      }
    }
  }
  return null;
}

function extractInvoiceDate(text) {
  // GFS format: Invoice number followed by date on next line
  // Find 10-digit number, then look for date pattern
  const match = text.match(/(\d{10})\s*(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const [month, day, year] = match[2].split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function extractTotalAmount(text) {
  const match = text.match(/(?:Invoice\s+Total|Pay\s+This\s+Amount)[:\s]*\$?([\d,]+\.\d{2})/i);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

function extractCustomerNumber(text) {
  const match = text.match(/Customer\s+Number[:\s]+(\d+)/i);
  return match ? match[1] : null;
}

function extractPurchaseOrder(text) {
  // GFS format: "Purchase Order\nInvoice Date\nInvoice\nBEN 1-2\n9025025288"
  // The PO value is on the line after "Invoice" header but before the 10-digit invoice number
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^Invoice$/i) && i + 2 < lines.length) {
      const nextLine = lines[i + 1].trim();
      // If next line is NOT a 10-digit number, it's the PO
      if (!nextLine.match(/^\d{10}$/)) {
        return nextLine;
      }
    }
  }
  return null;
}

/**
 * Parse order intelligence from Purchase Order field
 * Examples:
 *   "BEN 1-2" → { orderedBy: "BEN", weekTags: ["week 1", "week 2"] }
 *   "MARIE W3" → { orderedBy: "MARIE", weekTags: ["week 3"] }
 */
function parseOrderIntelligence(purchaseOrder) {
  if (!purchaseOrder) return null;

  const intelligence = {
    orderedBy: null,
    weekTags: [],
    rawPO: purchaseOrder
  };

  // Extract person name (first word/code)
  const nameMatch = purchaseOrder.match(/^([A-Z]+)/i);
  if (nameMatch) {
    intelligence.orderedBy = nameMatch[1];
  }

  // Extract week tags (patterns: "1-2", "W1-W2", "WEEK 1", etc.)
  const weekPattern = /(?:W(?:EEK)?)?[\s-]*(\d)(?:[\s-]+(?:W(?:EEK)?)?[\s-]*(\d))?/gi;
  let weekMatch;
  while ((weekMatch = weekPattern.exec(purchaseOrder)) !== null) {
    const week1 = parseInt(weekMatch[1]);
    const week2 = weekMatch[2] ? parseInt(weekMatch[2]) : null;

    if (week1 >= 1 && week1 <= 4 && !intelligence.weekTags.includes(`week ${week1}`)) {
      intelligence.weekTags.push(`week ${week1}`);
    }
    if (week2 && week2 >= 1 && week2 <= 4 && !intelligence.weekTags.includes(`week ${week2}`)) {
      intelligence.weekTags.push(`week ${week2}`);
    }
  }

  return intelligence;
}

/**
 * Extract special order items and constraints
 */
function extractOrderConstraints(text) {
  const constraints = {
    specialOrderItems: [],
    nonStockItems: [],
    warnings: []
  };

  // Special order items pattern (handle multi-line)
  // Remove newlines within the special order notice
  const cleanText = text.replace(/\n/g, ' ');
  const specialOrderPattern = /THE ITEM LISTED ABOVE IS A SPECIAL ORDER.*?ITEM.*?#(\d+).*?(MAY NOT BE RETURNED)?/gi;
  let specialMatch;
  while ((specialMatch = specialOrderPattern.exec(cleanText)) !== null) {
    const orderNumber = specialMatch[1];
    const nonReturnable = !!specialMatch[2];
    constraints.specialOrderItems.push({
      orderNumber: orderNumber,
      nonReturnable: nonReturnable,
      longerLeadTime: true
    });
    constraints.warnings.push(`Special order item #${orderNumber} - longer lead time expected`);
    if (nonReturnable) {
      constraints.warnings.push(`Special order #${orderNumber} - NON-RETURNABLE`);
    }
  }

  // Non-stock items (look for product codes marked with "N" spec key)
  // Pattern: Product code followed by spec key "N" and "Non-stock"
  const nonStockPattern = /(\d{7,8})[^\n]*?[A-Z]{2,3}\s+[^\n]*?N\s*10057\d+/gi;
  let nonStockMatch;
  while ((nonStockMatch = nonStockPattern.exec(text)) !== null) {
    const productCode = nonStockMatch[1];
    if (!constraints.nonStockItems.includes(productCode)) {
      constraints.nonStockItems.push(productCode);
      constraints.warnings.push(`Product ${productCode} is non-stock (special order)`);
    }
  }

  return constraints;
}

/**
 * Extract line items with individual case tracking
 * Handles GFS format:
 * 67635054HAM TOUPIE SMKD BNLS WHL FRSHMT10.47542.56CS42x6.5 KGAOlymel
 * CASE: 410147424516 WEIGHT: 12.82
 */
function extractLineItemsWithCases(text) {
  const lineItems = [];
  const lines = text.split('\n');

  let currentItem = null;
  let lookingForCases = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Try to match a GFS product line (concatenated format)
    // Pattern: 8 digits + qty digit + description + MT/CP/etc + price + price + CS/EA + qty + pack + brand
    // Example: 67635054HAM TOUPIE SMKD BNLS WHL FRSHMT10.47542.56CS42x6.5 KGAOlymel
    const productMatch = line.match(/^(\d{7,8})(\d)([A-Z\s&'-]+?)([A-Z]{2,3})([\d.]+)([\d.]+)([A-Z]{2,3})(\d+)([\dx.]+\s*[A-Z]{2,3}[A-Z]?)(.*?)(\d{10,})?$/);

    if (productMatch) {
      // Save previous item if exists
      if (currentItem) {
        lineItems.push(currentItem);
      }

      const [_, productCode, qty, description, category, unitPrice, lineTotal, unit, qtyShip, packSize, brand, barcode] = productMatch;

      currentItem = {
        productCode: productCode,
        quantity: parseInt(qty),
        description: description.trim(),
        category: category,
        unitPrice: parseFloat(unitPrice),
        lineTotal: parseFloat(lineTotal),
        unit: unit,
        quantityShipped: parseInt(qtyShip),
        packSize: packSize.trim(),
        brand: brand.trim(),
        barcode: barcode || null,
        cases: [],
        totalWeight: null
      };

      lookingForCases = true;
    }
    // Check for CASE: WEIGHT: pattern
    else if (lookingForCases && line.match(/^CASE:\s*(\S+)\s+WEIGHT:\s*([\d.]+)/)) {
      const caseMatch = line.match(/^CASE:\s*(\S+)\s+WEIGHT:\s*([\d.]+)/);
      if (caseMatch && currentItem) {
        const [_, caseNumber, weight] = caseMatch;
        currentItem.cases.push({
          caseNumber: caseNumber,
          weight: parseFloat(weight),
          unit: 'KG'
        });
      }
    }
    // Check for TOTAL WEIGHT line
    else if (lookingForCases && line.match(/^TOTAL\s+WEIGHT:\s*([\d.]+)/)) {
      const totalMatch = line.match(/^TOTAL\s+WEIGHT:\s*([\d.]+)/);
      if (totalMatch && currentItem) {
        currentItem.totalWeight = parseFloat(totalMatch[1]);
        lookingForCases = false; // End of this item's case section
      }
    }
  }

  // Add last item
  if (currentItem) {
    lineItems.push(currentItem);
  }

  return lineItems;
}

// Run extraction
extractFullInvoiceData(testPdfPath)
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
