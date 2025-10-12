#!/usr/bin/env node

/**
 * NeuroPilot v13.1 - Batch Update Real Invoice Dates
 * Extracts REAL invoice dates from PDF content (not file modification dates)
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();

const oneDriveDir = '/Users/davidmikulis/OneDrive/GFS Order PDF';
const dbPath = path.join(__dirname, 'data/enterprise_inventory.db');

// Statistics
const stats = {
  total: 0,
  updated: 0,
  failed: 0,
  notFound: 0
};

/**
 * Extract invoice number from PDF text
 * Handles: regular invoices, credit memos, debit memos, concatenated format
 */
function extractInvoiceNumber(text) {
  // Pattern 1: Credit Memo
  if (text.includes('CREDIT MEMO')) {
    // Credit memo format: "Credit\nOriginal Invoice\n9020563793\n2002254859"
    const creditMatch = text.match(/Credit\s+Original\s+Invoice\s+(\d{10})\s+(\d{10})/i);
    if (creditMatch) {
      return creditMatch[2]; // Return the credit number (2002254859)
    }
  }

  // Pattern 2: Debit Memo
  // Debit memo format: "PO Number\nDate\nDebit\n9022080517\n2002373141\n05/08/2025"
  const debitMatch = text.match(/Debit\s+(\d{10})\s+(\d{10})/i);
  if (debitMatch) {
    return debitMatch[2]; // Return the debit number (2002373141)
  }

  // Pattern 3: Concatenated format "Invoice9021570042"
  const concatMatch = text.match(/Invoice(\d{10})/i);
  if (concatMatch) {
    return concatMatch[1];
  }

  // Pattern 4: Separate lines format
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^Invoice$/i)) {
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

/**
 * Extract invoice date from PDF text
 * Handles: regular invoices, credit memos, debit memos
 * Enhanced: Prioritizes date after invoice number, excludes due dates
 */
function extractInvoiceDate(text, invoiceNumber) {
  // Pattern 1: Credit Memo
  if (text.includes('CREDIT MEMO')) {
    // Credit memo format: "Credit Date\nCredit\nOriginal Invoice\n9020563793\n2002254859\n04/01/2025"
    const creditDateMatch = text.match(/Credit\s+Date.*?(\d{2}\/\d{2}\/\d{4})/is);
    if (creditDateMatch) {
      const [month, day, year] = creditDateMatch[1].split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Pattern 2: Debit Memo
  // Debit memo format: "Date\nDebit\n9022080517\n2002373141\n05/08/2025"
  const debitMatch = text.match(/Date\s+Debit\s+\d{10}\s+\d{10}\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (debitMatch) {
    const [month, day, year] = debitMatch[1].split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // If we have the invoice number, look for date immediately after it
  if (invoiceNumber) {
    // Pattern 1: Invoice number followed by date (most accurate)
    // Handles: "9027091043\n09/20/2025" or "Invoice9027091043\n09/20/2025"
    const afterInvoiceMatch = text.match(new RegExp(`${invoiceNumber}[\\s\\n]+?(\\d{2}\\/\\d{2}\\/\\d{4})`));
    if (afterInvoiceMatch) {
      // Make sure this isn't a due date
      const context = text.substring(
        text.indexOf(afterInvoiceMatch[0]) - 50,
        text.indexOf(afterInvoiceMatch[0]) + 50
      );
      if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
        const [month, day, year] = afterInvoiceMatch[1].split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // Pattern 2: Regular invoice format - 10-digit number followed by date
  const match = text.match(/(\d{10})\s*(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    // Verify this isn't a due date
    const idx = text.indexOf(match[0]);
    const context = text.substring(Math.max(0, idx - 50), idx + 50);
    if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
      const [month, day, year] = match[2].split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Pattern 3: Look for "Invoice Date" label followed by date
  const labelMatch = text.match(/Invoice\s+Date[^\n]*\n[^\n]*?(\d{2}\/\d{2}\/\d{4})/i);
  if (labelMatch) {
    const [month, day, year] = labelMatch[1].split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback: First date pattern in document (exclude due dates)
  const allDates = text.match(/(\d{2}\/\d{2}\/\d{4})/g);
  if (allDates && allDates.length > 0) {
    // Find first date that's not a due date
    for (const dateStr of allDates) {
      const idx = text.indexOf(dateStr);
      const context = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + 50));
      if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
        const [month, day, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/**
 * Extract invoice date from a single PDF file
 */
async function extractDateFromPDF(pdfPath) {
  try {
    const dataBuffer = fsSync.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    const invoiceNumber = extractInvoiceNumber(text);
    const invoiceDate = extractInvoiceDate(text, invoiceNumber); // Pass invoice number for better accuracy

    return { invoiceNumber, invoiceDate };
  } catch (error) {
    console.error(`Failed to extract from ${pdfPath}:`, error.message);
    return { invoiceNumber: null, invoiceDate: null };
  }
}

/**
 * Update database with real invoice date
 */
async function updateInvoiceDate(db, invoiceNumber, invoiceDate) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE documents SET invoice_date = ? WHERE invoice_number = ?',
      [invoiceDate, invoiceNumber],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

/**
 * Main batch processing
 */
async function batchUpdateDates() {
  console.log('🚀 NeuroPilot v13.1 - Batch Update Real Invoice Dates');
  console.log('='.repeat(80));
  console.log('');

  // Open database
  const db = new sqlite3.Database(dbPath);

  // Get all PDF files
  const files = await fs.readdir(oneDriveDir);
  const pdfFiles = files.filter(f => f.endsWith('.pdf'));
  stats.total = pdfFiles.length;

  console.log(`📁 Found ${pdfFiles.length} PDF files in OneDrive folder`);
  console.log('📝 Extracting real invoice dates from PDF content...\n');

  // Process each file
  for (let i = 0; i < pdfFiles.length; i++) {
    const filename = pdfFiles[i];
    const filePath = path.join(oneDriveDir, filename);

    process.stdout.write(`\r[${i + 1}/${pdfFiles.length}] Processing ${filename}...`);

    try {
      // Extract invoice data from PDF content
      const { invoiceNumber, invoiceDate } = await extractDateFromPDF(filePath);

      if (!invoiceNumber) {
        console.log(`\n   ⚠️  ${filename}: Could not extract invoice number`);
        stats.failed++;
        continue;
      }

      if (!invoiceDate) {
        console.log(`\n   ⚠️  ${filename}: Could not extract invoice date`);
        stats.failed++;
        continue;
      }

      // Update database
      const changes = await updateInvoiceDate(db, invoiceNumber, invoiceDate);

      if (changes > 0) {
        console.log(`\n   ✅ ${invoiceNumber}: Updated to ${invoiceDate}`);
        stats.updated++;
      } else {
        console.log(`\n   ⚠️  ${invoiceNumber}: Not found in database`);
        stats.notFound++;
      }

    } catch (error) {
      console.log(`\n   ❌ ${filename}: ${error.message}`);
      stats.failed++;
    }
  }

  db.close();

  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 BATCH UPDATE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total PDFs processed: ${stats.total}`);
  console.log(`✅ Successfully updated: ${stats.updated}`);
  console.log(`⚠️  Not found in DB: ${stats.notFound}`);
  console.log(`❌ Failed to extract: ${stats.failed}`);
  console.log('');

  const successRate = stats.total > 0 ? ((stats.updated / stats.total) * 100).toFixed(1) : 0;
  console.log(`🎯 Success Rate: ${successRate}%`);
  console.log('');

  if (successRate >= 90) {
    console.log('🎉 EXCELLENT! Most invoice dates updated successfully');
  } else if (successRate >= 70) {
    console.log('✅ GOOD! Majority of dates updated');
  } else {
    console.log('⚠️  Review failures above - some dates may need manual update');
  }
}

// Run batch update
batchUpdateDates()
  .then(() => {
    console.log('\n✅ Batch update complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Batch update failed:', error);
    process.exit(1);
  });
