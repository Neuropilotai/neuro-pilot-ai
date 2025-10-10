const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔧 FIXING PDF EXTRACTION FOR 100% ACCURACY');
console.log('='.repeat(80));

// Enhanced PDF text extraction with better pattern matching
async function extractAccurateDataFromPDF(pdfFilePath, invoiceNumber) {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      return { success: false, reason: 'PDF not found' };
    }

    const dataBuffer = fs.readFileSync(pdfFilePath);
    const data = await pdf(dataBuffer);
    let pdfText = data.text;

    console.log(`\n📄 Processing ${invoiceNumber}...`);

    // Debug: Show first part of PDF text to understand structure
    console.log('PDF Preview:', pdfText.substring(0, 500).replace(/\n/g, ' '));

    // Check if this is a credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);

    // Enhanced date extraction patterns for GFS invoices
    let orderDate = null;
    const datePatterns = [
      // GFS specific patterns
      /Order\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Invoice\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+Order/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+Invoice/i,
      // Try finding dates near invoice number
      new RegExp(invoiceNumber + '[\\s\\S]{0,50}(\\d{1,2}\\/\\d{1,2}\\/\\d{4})', 'i'),
      // Look for dates in specific sections
      /Ship\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Delivery\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      // General date pattern anywhere in document
      /(\d{1,2}\/\d{1,2}\/\d{4})/
    ];

    for (const pattern of datePatterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        const dateStr = matches[1];
        const [month, day, year] = dateStr.split('/').map(s => s.padStart(2, '0'));

        // Validate year is reasonable (2020-2025)
        const yearNum = parseInt(year);
        if (yearNum >= 2020 && yearNum <= 2025) {
          orderDate = `${year}-${month}-${day}`;
          console.log(`  ✓ Found date: ${dateStr} → ${orderDate}`);
          break;
        }
      }
    }

    // Enhanced total extraction for GFS invoices
    let invoiceTotal = null;

    // First, try to find all monetary values
    const moneyPattern = /\$?\s*([\d,]+\.?\d{0,2})/g;
    const allAmounts = [];
    let match;

    while ((match = moneyPattern.exec(pdfText)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0) {
        allAmounts.push(value);
      }
    }

    // Sort amounts to find likely total (usually one of the largest values)
    allAmounts.sort((a, b) => b - a);

    // Look for specific total patterns
    const totalPatterns = [
      /Invoice\s+Total[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Total\s+Amount[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Grand\s+Total[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Amount\s+Due[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Total[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Subtotal[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      // GFS specific
      /Net\s+Amount[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Balance[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i
    ];

    for (const pattern of totalPatterns) {
      const totalMatch = pdfText.match(pattern);
      if (totalMatch) {
        let value = totalMatch[1].replace(/,/g, '');
        let numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          if (isCreditMemo && numValue > 0) {
            numValue = -numValue;
          }
          invoiceTotal = numValue;
          console.log(`  ✓ Found total: $${Math.abs(numValue).toFixed(2)}`);
          break;
        }
      }
    }

    // If no total found with patterns, use largest amount as fallback
    if (invoiceTotal === null && allAmounts.length > 0) {
      invoiceTotal = allAmounts[0];
      console.log(`  ✓ Using largest amount as total: $${invoiceTotal.toFixed(2)}`);
    }

    // Extract line items with better pattern matching
    const items = [];

    // Pattern for GFS line items (item number, description, quantity, price)
    const itemPattern = /(\d{5,7})\s+([A-Za-z\s\-\/]+?)\s+(\d+)\s+\$?([\d,]+\.?\d{0,2})/g;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(pdfText)) !== null) {
      const [_, itemCode, description, quantity, price] = itemMatch;
      if (itemCode && description && quantity && price) {
        const item = {
          itemCode: itemCode.trim(),
          description: description.trim(),
          quantity: parseInt(quantity),
          unitPrice: parseFloat(price.replace(/,/g, '')),
          totalPrice: parseInt(quantity) * parseFloat(price.replace(/,/g, ''))
        };

        // Filter out obvious non-items
        if (item.unitPrice > 0 && item.quantity > 0 && item.description.length > 2) {
          items.push(item);
        }
      }
    }

    console.log(`  ✓ Found ${items.length} line items`);

    // Extract customer/business info
    let businessName = 'Unknown Business';
    const businessPatterns = [
      /Bill\s+To[:\s\n]+([A-Za-z0-9\s&']+)/i,
      /Ship\s+To[:\s\n]+([A-Za-z0-9\s&']+)/i,
      /Customer[:\s]+([A-Za-z0-9\s&']+)/i,
      /Sold\s+To[:\s\n]+([A-Za-z0-9\s&']+)/i
    ];

    for (const pattern of businessPatterns) {
      const bizMatch = pdfText.match(pattern);
      if (bizMatch) {
        const name = bizMatch[1].trim().split('\n')[0];
        if (name && name.length > 2 && name !== 'Item') {
          businessName = name;
          console.log(`  ✓ Found business: ${businessName}`);
          break;
        }
      }
    }

    // Calculate total from items if main total not found
    if ((!invoiceTotal || invoiceTotal === 0) && items.length > 0) {
      invoiceTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      console.log(`  ✓ Calculated total from items: $${invoiceTotal.toFixed(2)}`);
    }

    console.log(`  📋 Type: ${isCreditMemo ? 'Credit Memo' : 'Invoice'}`);

    return {
      success: true,
      invoiceNumber,
      orderDate,
      totalValue: invoiceTotal,
      businessName,
      type: isCreditMemo ? 'credit' : 'invoice',
      isCreditMemo,
      items,
      itemCount: items.length
    };

  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Test with a sample PDF first
async function testSinglePDF() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const testInvoice = '9018357843';
  const pdfPath = path.join(oneDriveDir, `${testInvoice}.pdf`);

  console.log('\n📊 TESTING SINGLE PDF EXTRACTION:');
  console.log('-'.repeat(80));

  const result = await extractAccurateDataFromPDF(pdfPath, testInvoice);

  if (result.success) {
    console.log('\n✅ EXTRACTION RESULTS:');
    console.log(`  Invoice: ${result.invoiceNumber}`);
    console.log(`  Date: ${result.orderDate || 'Not found'}`);
    console.log(`  Total: $${result.totalValue ? result.totalValue.toFixed(2) : 'Not found'}`);
    console.log(`  Business: ${result.businessName}`);
    console.log(`  Items: ${result.itemCount}`);

    if (result.items.length > 0) {
      console.log('\n  Sample Items:');
      result.items.slice(0, 3).forEach(item => {
        console.log(`    - ${item.itemCode}: ${item.description} (${item.quantity} @ $${item.unitPrice})`);
      });
    }
  }

  return result;
}

// Main function to reprocess all PDFs with improved extraction
async function reprocessAllPDFsWithAccuracy() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';

  console.log('\n📦 STARTING FULL REPROCESSING WITH IMPROVED EXTRACTION');
  console.log('='.repeat(80));

  // First test one PDF
  const testResult = await testSinglePDF();

  if (!testResult.success || !testResult.orderDate) {
    console.log('\n⚠️ Test extraction did not find date. Checking PDF structure...');
    console.log('Please ensure PDFs are readable and contain date information.');

    // Continue anyway to process all files
  }

  console.log('\n📄 Ready to process all 84 PDFs with improved extraction?');
  console.log('This will update all order files with accurate dates and totals.');

  return { testResult };
}

// Run the improved extraction
reprocessAllPDFsWithAccuracy().catch(console.error);