#!/usr/bin/env node

/**
 * Re-extract specific invoices that are missing dates
 * Forces re-extraction by temporarily removing from duplicate tracking
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

// Invoices known to be missing dates
const missingDateInvoices = [
  '9021033005', '9021033009', '9021053495', '9021570043', '9021819131',
  '9022080518', '9022353897', '9022613266', '9022613272', '9023102242',
  '9023349211', '9023843552', '9023843557', '9023843558', '9023843559',
  '9024082412', '9024309029', '9026031906'
];

console.log('');
console.log('🔄 RE-EXTRACTING INVOICES WITH MISSING DATES');
console.log('='.repeat(80));
console.log('');

async function extractInvoiceDate(pdfPath, invoiceNumber) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    let orderDate = null;
    let purchaseOrderNote = null;

    // Try all date patterns
    let invoiceDateMatch = text.match(/Invoice\s*Date\s*\n\s*Invoice\d{10}\s*\n\s*(\d{2}\/\d{2}\/\d{4})/);

    if (!invoiceDateMatch) {
      invoiceDateMatch = text.match(/Invoice\s*Date[:\s]*(\d{2}\/\d{2}\/\d{4})/);
    }

    if (!invoiceDateMatch) {
      invoiceDateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})[^\d]*Invoice/);
    }

    if (!invoiceDateMatch) {
      invoiceDateMatch = text.match(/Purchase\s*Order\s+[^\n]+\s+Invoice\s*Date\s+(\d{2}\/\d{2}\/\d{4})/i);
    }

    // MM/DD/YYYYInvoice Date pattern
    if (!invoiceDateMatch) {
      invoiceDateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})Invoice\s*Date/i);
    }

    if (!invoiceDateMatch) {
      invoiceDateMatch = text.match(/Invoice\s*Date[:\s\n]+(\d{2}\/\d{2}\/\d{4})/i);
    }

    if (invoiceDateMatch) {
      const [month, day, year] = invoiceDateMatch[1].split('/');
      orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Extract purchase order note
    const purchaseOrderMatch = text.match(/(\d{2}\/\d{2}\/\d{4})Invoice\s*Date\s*\n\s*([^\n]+)/i);
    if (purchaseOrderMatch && purchaseOrderMatch[2].trim()) {
      purchaseOrderNote = purchaseOrderMatch[2].trim();
    }

    return { orderDate, purchaseOrderNote };

  } catch (err) {
    return { orderDate: null, purchaseOrderNote: null, error: err.message };
  }
}

async function main() {
  const ordersDir = './data/gfs_orders';
  const pdfsDir = './data/pdfs';

  let updated = 0;
  let failed = 0;

  console.log(`Processing ${missingDateInvoices.length} invoices...\n`);

  for (const invoice of missingDateInvoices) {
    const jsonPath = path.join(ordersDir, `${invoice}.json`);
    const pdfPath = path.join(pdfsDir, `${invoice}.pdf`);

    if (!fs.existsSync(jsonPath)) {
      console.log(`⚠️  ${invoice}: JSON file not found`);
      failed++;
      continue;
    }

    if (!fs.existsSync(pdfPath)) {
      console.log(`⚠️  ${invoice}: PDF file not found`);
      failed++;
      continue;
    }

    const { orderDate, purchaseOrderNote, error } = await extractInvoiceDate(pdfPath, invoice);

    if (error) {
      console.log(`❌ ${invoice}: ${error}`);
      failed++;
      continue;
    }

    if (orderDate) {
      // Update JSON file
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      data.orderDate = orderDate;
      if (purchaseOrderNote) {
        data.purchaseOrderNote = purchaseOrderNote;
      }
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

      const noteStr = purchaseOrderNote ? ` (${purchaseOrderNote})` : '';
      console.log(`✅ ${invoice}: ${orderDate}${noteStr}`);
      updated++;
    } else {
      console.log(`⚠️  ${invoice}: Date not found in PDF`);
      failed++;
    }
  }

  console.log('');
  console.log('📊 SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  if (updated > 0) {
    console.log('🔄 Next Steps:');
    console.log('   1. Re-import: node clean_import_real_data.js');
    console.log('   2. Analyze: node analyze_invoice_coverage.js');
    console.log('');
  }
}

main();
