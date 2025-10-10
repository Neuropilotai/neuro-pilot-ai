#!/usr/bin/env node

/**
 * Verify New Invoices
 * Check for new PDFs and show current status
 */

const fs = require('fs');
const path = require('path');

console.log('');
console.log('🔍 INVOICE VERIFICATION');
console.log('='.repeat(80));
console.log('');

// Check PDFs folder
const pdfDir = './data/pdfs';
const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
const pdfInvoices = pdfFiles.map(f => path.basename(f, '.pdf')).sort();

console.log(`📁 PDFs in ${pdfDir}: ${pdfFiles.length}`);
console.log('');

// Check JSON folder
const jsonDir = './data/gfs_orders';
const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
const jsonInvoices = jsonFiles.map(f => path.basename(f, '.json')).sort();

console.log(`📄 JSON files extracted: ${jsonFiles.length}`);
console.log('');

// Find PDFs without JSON
const unextracted = [];
for (const pdfInvoice of pdfInvoices) {
  if (!jsonInvoices.includes(pdfInvoice)) {
    unextracted.push(pdfInvoice);
  }
}

if (unextracted.length > 0) {
  console.log(`✨ NEW PDFs FOUND (not yet extracted): ${unextracted.length}`);
  console.log('');
  console.log('Invoice Numbers:');
  unextracted.forEach(inv => console.log(`  - ${inv}`));
  console.log('');
  console.log('📋 Next step: Run extraction');
  console.log('   Command: node flawless_pdf_extractor.js');
  console.log('');
} else {
  console.log('✅ All PDFs have been extracted to JSON');
  console.log('');
}

// Show summary
console.log('📊 SUMMARY');
console.log('-'.repeat(80));
console.log(`Total PDFs available: ${pdfFiles.length}`);
console.log(`Total extracted: ${jsonFiles.length - unextracted.length}`);
console.log(`Pending extraction: ${unextracted.length}`);
console.log('');

if (unextracted.length > 0) {
  console.log('⚠️  Action required: Extract new PDFs');
} else {
  console.log('✅ All invoices are up to date');
}
console.log('');
