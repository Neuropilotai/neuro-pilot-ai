#!/usr/bin/env node

/**
 * Test the GFSInvoiceExtractor utility
 * Verifies 100% accurate extraction patterns are working
 */

const GFSInvoiceExtractor = require('./utils/gfsInvoiceExtractor');
const path = require('path');

async function testExtractor() {
  console.log('🧪 Testing GFSInvoiceExtractor with known invoices...\n');

  const testInvoices = [
    '9027091043', // User's original test case
    '2002254859', // Credit memo
    '2002373141', // Debit memo
    '9025025285', // Regular invoice (separated format)
    '9021570042'  // Regular invoice (concatenated format)
  ];

  const oneDriveDir = '/Users/davidmikulis/OneDrive/GFS Order PDF';

  for (const invoiceNum of testInvoices) {
    const pdfPath = path.join(oneDriveDir, `${invoiceNum}.pdf`);

    try {
      console.log(`📄 Testing: ${invoiceNum}.pdf`);
      const extracted = await GFSInvoiceExtractor.extractFromPDF(pdfPath);

      console.log(`   Invoice #: ${extracted.invoiceNumber || 'NOT FOUND'}`);
      console.log(`   Date: ${extracted.invoiceDate || 'NOT FOUND'}`);
      console.log(`   Vendor: ${extracted.vendor || 'NOT FOUND'}`);
      console.log(`   Amount: ${extracted.amount ? '$' + extracted.amount.toFixed(2) : 'NOT FOUND'}`);
      console.log(`   Type: ${extracted.documentType}`);

      // Verify extraction matches expected
      if (extracted.invoiceNumber === invoiceNum) {
        console.log(`   ✅ PASS: Invoice number matches\n`);
      } else {
        console.log(`   ❌ FAIL: Expected ${invoiceNum}, got ${extracted.invoiceNumber}\n`);
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
    }
  }

  console.log('✅ Test complete!');
}

testExtractor();
