#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 COMPREHENSIVE PDF VALIDATION SYSTEM');
console.log('=' .repeat(80));
console.log('📋 OBJECTIVE: Verify 100% accuracy on ALL PDF extractions');
console.log('');

// Validation counters
let stats = {
  totalPDFs: 0,
  processedPDFs: 0,
  failedPDFs: 0,
  errors: [],
  warnings: [],
  validationResults: []
};

/**
 * Extract and validate a single PDF file
 */
async function validatePDFExtraction(pdfPath, invoiceNumber) {
  const result = {
    invoiceNumber,
    pdfPath,
    timestamp: new Date().toISOString(),
    status: 'UNKNOWN',
    errors: [],
    warnings: [],
    data: null
  };

  try {
    // 1. Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      result.status = 'FAILED';
      result.errors.push('PDF file not found');
      return result;
    }

    // 2. Read and parse PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length === 0) {
      result.status = 'FAILED';
      result.errors.push('PDF contains no extractable text');
      return result;
    }

    // 3. Check if it's a credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);

    // 4. Extract and validate invoice number
    const invoiceMatch = pdfText.match(/(?:Invoice|Order)\s*(?:Number|#)?\s*[:\s]*(\d{10})/i);
    const extractedInvoice = invoiceMatch ? invoiceMatch[1] : null;

    if (!extractedInvoice) {
      result.warnings.push('Could not extract invoice number from PDF text');
    } else if (extractedInvoice !== invoiceNumber) {
      result.errors.push(`Invoice number mismatch: Expected ${invoiceNumber}, found ${extractedInvoice}`);
    }

    // 5. Extract and validate date
    let orderDate = null;
    const datePatterns = [
      /Invoice\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Order\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Ship\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Date[\s:]+(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];

    for (const pattern of datePatterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        orderDate = matches[1];
        break;
      }
    }

    if (!orderDate) {
      result.warnings.push('Could not extract order date');
    } else {
      // Validate date format and range
      const [month, day, year] = orderDate.split('/').map(Number);
      if (year < 2024 || year > 2025 || month < 1 || month > 12 || day < 1 || day > 31) {
        result.errors.push(`Invalid date: ${orderDate}`);
      }
    }

    // 6. Extract and validate financial totals
    const financials = {
      subtotal: null,
      gst: null,
      qst: null,
      total: null
    };

    // Subtotal pattern
    const subtotalMatch = pdfText.match(/Sub\s*total[\s\$:]*([\d,]+\.?\d{0,2})/i);
    if (subtotalMatch) {
      financials.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
    } else {
      result.warnings.push('Could not extract subtotal');
    }

    // GST/HST pattern
    const gstMatch = pdfText.match(/GST\/HST[\s\$:]*([\d,]+\.?\d{0,2})/i);
    if (gstMatch) {
      financials.gst = parseFloat(gstMatch[1].replace(/,/g, ''));
    }

    // QST/PST pattern
    const qstMatch = pdfText.match(/(?:QST|PST)[\s\$:]*([\d,]+\.?\d{0,2})/i);
    if (qstMatch) {
      financials.qst = parseFloat(qstMatch[1].replace(/,/g, ''));
    }

    // Total pattern
    const totalMatch = pdfText.match(/(?:Invoice\s*)?Total[\s\$:]*([\d,]+\.?\d{0,2})/i);
    if (totalMatch) {
      financials.total = parseFloat(totalMatch[1].replace(/,/g, ''));
    } else {
      result.warnings.push('Could not extract invoice total');
    }

    // 7. Validate financial calculations
    if (financials.subtotal && financials.gst && financials.total) {
      const expectedTotal = financials.subtotal + financials.gst + (financials.qst || 0);
      const tolerance = 0.02; // Allow 2 cent tolerance for rounding

      if (Math.abs(expectedTotal - financials.total) > tolerance) {
        result.errors.push(`Financial calculation error: Subtotal ($${financials.subtotal}) + GST ($${financials.gst}) + QST ($${financials.qst || 0}) = $${expectedTotal.toFixed(2)}, but PDF shows $${financials.total}`);
      }
    }

    // 8. Extract and validate line items
    const items = extractLineItems(pdfText);

    if (items.length === 0) {
      result.warnings.push('No line items extracted from PDF');
    }

    // Validate line items
    let itemErrors = 0;
    items.forEach((item, index) => {
      // Check for required fields
      if (!item.itemCode) {
        result.warnings.push(`Item ${index + 1}: Missing item code`);
        itemErrors++;
      }
      if (!item.description) {
        result.warnings.push(`Item ${index + 1}: Missing description`);
        itemErrors++;
      }
      if (!item.quantity || item.quantity <= 0) {
        result.errors.push(`Item ${index + 1}: Invalid quantity: ${item.quantity}`);
        itemErrors++;
      }
      if (!item.unitPrice || item.unitPrice <= 0) {
        result.errors.push(`Item ${index + 1}: Invalid unit price: ${item.unitPrice}`);
        itemErrors++;
      }

      // Validate whole units don't have fractional quantities
      const wholeUnits = ['CS', 'CT', 'BX', 'PK', 'EA', 'DZ', 'PR', 'PC', 'PACK', 'CASE'];
      if (item.unit && wholeUnits.includes(item.unit.toUpperCase()) && item.quantity % 1 !== 0) {
        result.errors.push(`Item ${index + 1} (${item.description}): Fractional quantity ${item.quantity} not allowed for unit ${item.unit}`);
        itemErrors++;
      }

      // Validate line total calculation
      if (item.quantity && item.unitPrice) {
        const expectedLineTotal = item.quantity * item.unitPrice;
        if (item.lineTotal && Math.abs(expectedLineTotal - item.lineTotal) > 0.02) {
          result.errors.push(`Item ${index + 1}: Line total mismatch. Expected ${expectedLineTotal.toFixed(2)}, got ${item.lineTotal.toFixed(2)}`);
          itemErrors++;
        }
      }
    });

    // 9. Cross-validate with existing JSON if available
    const jsonPath = path.join(__dirname, 'data/gfs_orders', `${invoiceNumber}.json`);
    if (fs.existsSync(jsonPath)) {
      const existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      // Compare totals
      if (existingData.total && financials.total && Math.abs(existingData.total - financials.total) > 0.02) {
        result.errors.push(`Total mismatch with existing JSON: PDF shows $${financials.total}, JSON has $${existingData.total}`);
      }

      // Compare item counts
      if (existingData.items && existingData.items.length !== items.length) {
        result.warnings.push(`Item count mismatch: PDF has ${items.length} items, JSON has ${existingData.items.length} items`);
      }
    }

    // 10. Determine final status
    if (result.errors.length > 0) {
      result.status = 'FAILED';
    } else if (result.warnings.length > 0) {
      result.status = 'WARNING';
    } else {
      result.status = 'PASSED';
    }

    result.data = {
      isCreditMemo,
      orderDate,
      financials,
      itemCount: items.length,
      items: items.slice(0, 5) // Include first 5 items as sample
    };

  } catch (error) {
    result.status = 'FAILED';
    result.errors.push(`Exception during validation: ${error.message}`);
  }

  return result;
}

/**
 * Extract line items from PDF text
 */
function extractLineItems(pdfText) {
  const items = [];

  // Pattern for GFS line items: Item Code, Description, Quantity, Unit, Price, Total
  const linePattern = /(\d{6,8})\s+([A-Z\s\-,&'.()]+?)\s+(\d+(?:\.\d+)?)\s+(CS|CT|BX|PK|EA|LB|KG|DZ|PR|PC|PACK|CASE)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/gi;

  let match;
  while ((match = linePattern.exec(pdfText)) !== null) {
    items.push({
      itemCode: match[1],
      description: match[2].trim(),
      quantity: parseFloat(match[3]),
      unit: match[4],
      unitPrice: parseFloat(match[5].replace(/,/g, '')),
      lineTotal: parseFloat(match[6].replace(/,/g, ''))
    });
  }

  return items;
}

/**
 * Main validation function
 */
async function validateAllPDFs() {
  console.log('🔍 Scanning for PDF files...');

  const invoicesDir = path.join(__dirname, 'data/invoices');

  if (!fs.existsSync(invoicesDir)) {
    console.error('❌ Invoices directory not found:', invoicesDir);
    return;
  }

  const pdfFiles = fs.readdirSync(invoicesDir).filter(f => f.endsWith('.pdf'));
  stats.totalPDFs = pdfFiles.length;

  console.log(`📦 Found ${pdfFiles.length} PDF files to validate`);
  console.log('');

  // Process each PDF
  for (let i = 0; i < pdfFiles.length; i++) {
    const filename = pdfFiles[i];
    const invoiceNumber = path.basename(filename, '.pdf');
    const pdfPath = path.join(invoicesDir, filename);

    process.stdout.write(`\r[${i + 1}/${pdfFiles.length}] Validating ${invoiceNumber}...`);

    try {
      const result = await validatePDFExtraction(pdfPath, invoiceNumber);
      stats.validationResults.push(result);

      if (result.status === 'PASSED') {
        stats.processedPDFs++;
      } else if (result.status === 'FAILED') {
        stats.failedPDFs++;
        stats.errors.push({
          invoice: invoiceNumber,
          errors: result.errors
        });
      } else if (result.status === 'WARNING') {
        stats.processedPDFs++;
        stats.warnings.push({
          invoice: invoiceNumber,
          warnings: result.warnings
        });
      }

    } catch (error) {
      stats.failedPDFs++;
      stats.errors.push({
        invoice: invoiceNumber,
        errors: [`Validation exception: ${error.message}`]
      });
    }
  }

  console.log(''); // New line after progress
  console.log('');
}

/**
 * Generate detailed report
 */
function generateReport() {
  console.log('📊 VALIDATION SUMMARY');
  console.log('=' .repeat(80));
  console.log(`📦 Total PDFs: ${stats.totalPDFs}`);
  console.log(`✅ Passed: ${stats.validationResults.filter(r => r.status === 'PASSED').length}`);
  console.log(`⚠️  Warnings: ${stats.validationResults.filter(r => r.status === 'WARNING').length}`);
  console.log(`❌ Failed: ${stats.validationResults.filter(r => r.status === 'FAILED').length}`);

  const accuracy = ((stats.validationResults.filter(r => r.status === 'PASSED').length / stats.totalPDFs) * 100).toFixed(2);
  console.log(`🎯 Accuracy: ${accuracy}%`);
  console.log('');

  // Show errors
  if (stats.errors.length > 0) {
    console.log('❌ ERRORS FOUND:');
    console.log('-'.repeat(80));
    stats.errors.slice(0, 10).forEach(err => {
      console.log(`📄 Invoice ${err.invoice}:`);
      err.errors.forEach(e => console.log(`   • ${e}`));
    });
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
    console.log('');
  }

  // Show warnings
  if (stats.warnings.length > 0) {
    console.log('⚠️  WARNINGS FOUND:');
    console.log('-'.repeat(80));
    stats.warnings.slice(0, 10).forEach(warn => {
      console.log(`📄 Invoice ${warn.invoice}:`);
      warn.warnings.forEach(w => console.log(`   • ${w}`));
    });
    if (stats.warnings.length > 10) {
      console.log(`   ... and ${stats.warnings.length - 10} more warnings`);
    }
    console.log('');
  }

  // Save detailed report
  const reportPath = path.join(__dirname, 'data/pdf_validation_report.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPDFs: stats.totalPDFs,
      passed: stats.validationResults.filter(r => r.status === 'PASSED').length,
      warnings: stats.validationResults.filter(r => r.status === 'WARNING').length,
      failed: stats.validationResults.filter(r => r.status === 'FAILED').length,
      accuracy: parseFloat(accuracy)
    },
    detailedResults: stats.validationResults
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`💾 Detailed report saved to: ${reportPath}`);
  console.log('');

  // Recommendations
  console.log('🔧 RECOMMENDATIONS:');
  console.log('-'.repeat(80));
  if (parseFloat(accuracy) < 100) {
    console.log('1. Review and fix all failed validations');
    console.log('2. Improve PDF extraction patterns for missing data');
    console.log('3. Re-run validation after fixes');
  } else {
    console.log('✅ All PDFs validated successfully!');
    console.log('✅ System is operating at 100% accuracy');
  }
  console.log('');
}

// Main execution
(async () => {
  try {
    await validateAllPDFs();
    generateReport();
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
})();
