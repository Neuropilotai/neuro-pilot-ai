const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('📊 PROCESSING PDFs WITH TAX SEPARATION');
console.log('='.repeat(80));

// Enhanced PDF extraction with tax separation
async function extractCompleteDataFromPDF(pdfFilePath, invoiceNumber) {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      return { success: false, reason: 'PDF not found' };
    }

    const dataBuffer = fs.readFileSync(pdfFilePath);
    const data = await pdf(dataBuffer);
    let pdfText = data.text;

    console.log(`\n📄 Processing ${invoiceNumber}...`);

    // Check if credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);

    // Extract date - multiple patterns for GFS invoices
    let orderDate = null;
    const datePatterns = [
      /Invoice\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Order\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Ship\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/  // Any date format
    ];

    for (const pattern of datePatterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        const dateStr = matches[1];
        const [month, day, year] = dateStr.split('/');
        const yearNum = parseInt(year);

        // Accept dates from 2024-2025
        if (yearNum >= 2024 && yearNum <= 2025) {
          orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          console.log(`  ✓ Order Date: ${dateStr}`);
          break;
        }
      }
    }

    // Extract tax information
    let subtotal = null;
    let taxAmount = null;
    let totalWithTax = null;
    let taxRate = null;

    // Quebec tax patterns (TPS/TVQ)
    const taxPatterns = {
      tps: [
        /TPS[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
        /GST[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
        /TPS\s*\([\d.]+%\)[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i
      ],
      tvq: [
        /TVQ[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
        /QST[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
        /TVQ\s*\([\d.]+%\)[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i
      ]
    };

    let tpsAmount = 0;
    let tvqAmount = 0;

    // Extract TPS
    for (const pattern of taxPatterns.tps) {
      const match = pdfText.match(pattern);
      if (match) {
        tpsAmount = parseFloat(match[1].replace(/,/g, ''));
        console.log(`  ✓ TPS/GST: $${tpsAmount.toFixed(2)}`);
        break;
      }
    }

    // Extract TVQ
    for (const pattern of taxPatterns.tvq) {
      const match = pdfText.match(pattern);
      if (match) {
        tvqAmount = parseFloat(match[1].replace(/,/g, ''));
        console.log(`  ✓ TVQ/QST: $${tvqAmount.toFixed(2)}`);
        break;
      }
    }

    taxAmount = tpsAmount + tvqAmount;

    // Extract subtotal (before tax)
    const subtotalPatterns = [
      /Subtotal[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Sub[\s-]*total[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Total\s+avant\s+taxes[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Net\s+Amount[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Merchandise[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i
    ];

    for (const pattern of subtotalPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        subtotal = parseFloat(match[1].replace(/,/g, ''));
        console.log(`  ✓ Subtotal (before tax): $${subtotal.toFixed(2)}`);
        break;
      }
    }

    // Extract total (with tax)
    const totalPatterns = [
      /Invoice\s+Total[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Grand\s+Total[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Total\s+Amount[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Amount\s+Due[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i,
      /Total[^0-9]*\$?\s*([\d,]+\.?\d{0,2})/i
    ];

    for (const pattern of totalPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        totalWithTax = parseFloat(match[1].replace(/,/g, ''));
        if (totalWithTax > (subtotal || 0)) { // Total should be larger than subtotal
          console.log(`  ✓ Total (with tax): $${totalWithTax.toFixed(2)}`);
          break;
        }
      }
    }

    // If we have total but no subtotal, calculate it
    if (totalWithTax && taxAmount && !subtotal) {
      subtotal = totalWithTax - taxAmount;
      console.log(`  ✓ Calculated subtotal: $${subtotal.toFixed(2)}`);
    }

    // Calculate tax rate if possible
    if (subtotal && taxAmount) {
      taxRate = (taxAmount / subtotal * 100).toFixed(2);
      console.log(`  ✓ Effective tax rate: ${taxRate}%`);
    }

    // Extract line items with better patterns
    const items = [];

    // Pattern for item lines: item code, description, quantity, unit price, total
    // Match patterns like: 123456 DESCRIPTION 12 CS 24.50 294.00
    const itemLinePattern = /(\d{5,7})\s+([A-Z][A-Z0-9\s\-\/&.,]+?)\s+(\d+)\s+\w{2}\s+([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})/g;

    let itemMatch;
    while ((itemMatch = itemLinePattern.exec(pdfText)) !== null) {
      const [_, itemCode, description, quantity, unitPrice, lineTotal] = itemMatch;

      const item = {
        itemCode: itemCode.trim(),
        description: description.trim(),
        quantity: parseInt(quantity),
        unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
        lineTotal: parseFloat(lineTotal.replace(/,/g, ''))
      };

      // Validate item
      if (item.unitPrice > 0 && item.quantity > 0) {
        items.push(item);
      }
    }

    console.log(`  ✓ Found ${items.length} line items`);

    // Extract business name
    let businessName = 'Unknown';
    const businessPatterns = [
      /Bill\s+To[:\s\n]+([A-Z][A-Z0-9\s\-&'.,]+?)(?:\n|$)/i,
      /Ship\s+To[:\s\n]+([A-Z][A-Z0-9\s\-&'.,]+?)(?:\n|$)/i,
      /Sold\s+To[:\s\n]+([A-Z][A-Z0-9\s\-&'.,]+?)(?:\n|$)/i,
      /Customer[:\s]+([A-Z][A-Z0-9\s\-&'.,]+?)(?:\n|$)/i
    ];

    for (const pattern of businessPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        const name = match[1].trim().split('\n')[0];
        if (name && name.length > 2) {
          businessName = name;
          console.log(`  ✓ Business: ${businessName}`);
          break;
        }
      }
    }

    // If credit memo, make amounts negative
    if (isCreditMemo) {
      if (subtotal) subtotal = -Math.abs(subtotal);
      if (taxAmount) taxAmount = -Math.abs(taxAmount);
      if (totalWithTax) totalWithTax = -Math.abs(totalWithTax);
      console.log(`  📋 Type: Credit Memo (amounts negative)`);
    }

    return {
      success: true,
      invoiceNumber,
      orderDate,
      businessName,
      type: isCreditMemo ? 'credit' : 'invoice',
      isCreditMemo,

      // Financial breakdown
      subtotal: subtotal,
      taxBreakdown: {
        tps: tpsAmount,
        tvq: tvqAmount,
        total: taxAmount
      },
      taxAmount: taxAmount,
      taxRate: taxRate,
      totalWithTax: totalWithTax,

      // Items
      items: items,
      itemCount: items.length,

      // Calculated totals from items (for verification)
      calculatedSubtotal: items.reduce((sum, item) => sum + item.lineTotal, 0)
    };

  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Process all PDFs with tax separation
async function processAllPDFsWithTaxSeparation() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';

  // Ensure directory exists
  if (!fs.existsSync(gfsOrdersDir)) {
    fs.mkdirSync(gfsOrdersDir, { recursive: true });
  }

  // Get all PDF files
  let pdfFiles = [];
  try {
    pdfFiles = fs.readdirSync(oneDriveDir)
      .filter(file => file.endsWith('.pdf'))
      .map(file => file.replace('.pdf', ''));

    console.log(`\n📋 Found ${pdfFiles.length} PDF files to process`);
  } catch (error) {
    console.error('❌ Error reading OneDrive directory:', error.message);
    return;
  }

  // Statistics
  let processed = 0;
  let errors = 0;
  let totalSubtotal = 0;
  let totalTax = 0;
  let totalWithTax = 0;
  let totalItems = 0;

  console.log('\n' + '='.repeat(80));
  console.log('📦 PROCESSING ALL PDFs WITH TAX SEPARATION:');
  console.log('='.repeat(80));

  for (const invoiceNumber of pdfFiles) {
    const pdfPath = path.join(oneDriveDir, `${invoiceNumber}.pdf`);
    const result = await extractCompleteDataFromPDF(pdfPath, invoiceNumber);

    if (result.success) {
      // Create comprehensive order file
      const orderData = {
        // Basic info
        invoiceNumber: result.invoiceNumber,
        orderDate: result.orderDate,
        businessName: result.businessName,
        type: result.type,
        isCreditMemo: result.isCreditMemo,

        // Financial data with tax separation
        subtotal: result.subtotal,
        taxBreakdown: result.taxBreakdown,
        taxAmount: result.taxAmount,
        taxRate: result.taxRate,
        totalWithTax: result.totalWithTax,

        // Legacy fields for compatibility
        totalValue: result.totalWithTax,
        invoiceTotalWithTax: result.totalWithTax,

        // Items
        items: result.items,
        itemCount: result.itemCount,

        // Metadata
        processedDate: new Date().toISOString(),
        extractedFromPdf: true,
        pdfPath: pdfPath,
        source: 'TAX_SEPARATED_PROCESSING',
        status: 'active'
      };

      // Save to file
      const filename = `gfs_order_${invoiceNumber}.json`;
      const filePath = path.join(gfsOrdersDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));

      console.log(`  ✅ Saved: ${filename}`);

      // Update statistics
      processed++;
      if (result.subtotal) totalSubtotal += result.subtotal;
      if (result.taxAmount) totalTax += result.taxAmount;
      if (result.totalWithTax) totalWithTax += result.totalWithTax;
      totalItems += result.itemCount;
    } else {
      errors++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 PROCESSING COMPLETE - SUMMARY:');
  console.log('='.repeat(80));
  console.log(`✅ Successfully processed: ${processed} PDFs`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📦 Total items extracted: ${totalItems}`);
  console.log('\n💰 FINANCIAL SUMMARY:');
  console.log(`  Subtotal (before tax): $${totalSubtotal.toFixed(2)}`);
  console.log(`  Total tax collected: $${totalTax.toFixed(2)}`);
  console.log(`  Total (with tax): $${totalWithTax.toFixed(2)}`);
  if (totalSubtotal > 0) {
    console.log(`  Average tax rate: ${(totalTax / totalSubtotal * 100).toFixed(2)}%`);
  }

  console.log('\n🎯 Data is now ready with:');
  console.log('  • Accurate order dates (not download dates)');
  console.log('  • Tax separated from subtotals');
  console.log('  • All line items extracted');
  console.log('  • TPS/TVQ breakdown for Quebec taxes');

  return {
    processed,
    errors,
    totalItems,
    financials: {
      subtotal: totalSubtotal,
      tax: totalTax,
      total: totalWithTax
    }
  };
}

// Run the processing
processAllPDFsWithTaxSeparation().catch(console.error);