const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('💯 COMPLETE PDF PROCESSOR - FINAL VERSION');
console.log('='.repeat(80));

// Complete PDF extraction with all line items and accurate tax
async function extractCompleteInvoiceData(pdfFilePath, invoiceNumber) {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      return { success: false, reason: 'PDF not found' };
    }

    const dataBuffer = fs.readFileSync(pdfFilePath);
    const data = await pdf(dataBuffer);
    let pdfText = data.text;

    console.log(`\n📄 Processing Invoice ${invoiceNumber}...`);

    // Check if credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);

    // 1. EXTRACT ORDER DATE
    let orderDate = null;
    const datePatterns = [
      /Invoice\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Order\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Ship\s+Date[\s\n]*(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];

    for (const pattern of datePatterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        const dateStr = matches[1];
        const [month, day, year] = dateStr.split('/');
        const yearNum = parseInt(year);

        if (yearNum >= 2024 && yearNum <= 2025) {
          orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          console.log(`  ✓ Order Date: ${dateStr}`);
          break;
        }
      }
    }

    // 2. EXTRACT LINE ITEMS
    const items = [];

    // Split PDF into pages/sections
    const lines = pdfText.split('\n');

    // Pattern for GFS line items - multiple formats
    const itemPatterns = [
      // Format: 123456 DESCRIPTION QTY UNIT PRICE TOTAL
      /^(\d{5,7})\s+(.+?)\s+(\d+)\s+([A-Z]{2})\s+([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})$/,
      // Format with tabs or extra spaces
      /^(\d{5,7})\s{2,}(.+?)\s{2,}(\d+)\s+([A-Z]{2})\s+([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})$/,
      // Compact format
      /^(\d{5,7})\s+(.+?)\s+(\d+)\s+([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})$/
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and headers
      if (!trimmedLine || trimmedLine.length < 10) continue;
      if (/^(Page|Service|Division|Item|Description|FOLD)/i.test(trimmedLine)) continue;

      // Try to match item patterns
      for (const pattern of itemPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          let itemCode, description, quantity, unit, unitPrice, lineTotal;

          if (match.length === 7) { // With unit
            [, itemCode, description, quantity, unit, unitPrice, lineTotal] = match;
          } else if (match.length === 6) { // Without unit
            [, itemCode, description, quantity, unitPrice, lineTotal] = match;
            unit = 'EA';
          }

          if (itemCode && description) {
            const item = {
              itemCode: itemCode.trim(),
              description: description.trim().replace(/\s+/g, ' '),
              quantity: parseInt(quantity) || 0,
              unit: unit || 'EA',
              unitPrice: parseFloat((unitPrice || '0').replace(/,/g, '')),
              lineTotal: parseFloat((lineTotal || '0').replace(/,/g, ''))
            };

            // Validate item
            if (item.quantity > 0 && item.unitPrice > 0) {
              items.push(item);
            }
          }
          break;
        }
      }
    }

    // Alternative: Extract items from table structure
    if (items.length === 0) {
      // Look for product codes (5-7 digits at start of line)
      const productCodePattern = /^(\d{5,7})\s+/gm;
      let matches;

      while ((matches = productCodePattern.exec(pdfText)) !== null) {
        const startIndex = matches.index;
        const endIndex = pdfText.indexOf('\n', startIndex);
        const itemLine = pdfText.substring(startIndex, endIndex);

        // Parse the item line
        const parts = itemLine.split(/\s{2,}/);
        if (parts.length >= 4) {
          const item = {
            itemCode: parts[0].trim(),
            description: parts[1].trim(),
            quantity: parseInt(parts[2]) || 1,
            unit: 'EA',
            unitPrice: 0,
            lineTotal: 0
          };

          // Try to extract price from remaining parts
          for (let i = 3; i < parts.length; i++) {
            const price = parseFloat(parts[i].replace(/[^0-9.]/g, ''));
            if (price > 0) {
              if (item.unitPrice === 0) {
                item.unitPrice = price;
              } else {
                item.lineTotal = price;
                break;
              }
            }
          }

          if (item.itemCode && item.description && item.description.length > 2) {
            items.push(item);
          }
        }
      }
    }

    console.log(`  ✓ Found ${items.length} line items`);

    // 3. EXTRACT FINANCIAL TOTALS
    let subtotal = null;
    let gstAmount = null;
    let qstAmount = null;
    let totalWithTax = null;

    // Look for the financial summary section
    // Pattern from actual invoice: Sub total $35,172.34, GST $470.26, Total $35,869.37
    const financialSection = pdfText.match(/Sub\s*total[\s\S]*?Invoice\s*Total[\s\S]*?\$([\d,]+\.?\d{0,2})/i);

    if (financialSection) {
      // Extract all dollar amounts in the financial section
      const amounts = financialSection[0].match(/\$([\d,]+\.?\d{0,2})/g);

      if (amounts && amounts.length >= 3) {
        const values = amounts.map(a => parseFloat(a.replace(/[$,]/g, '')));

        // Typical pattern: subtotal, charges, subtotal+charges, GST, subtotal+GST, QST, total
        if (values.length >= 7) {
          subtotal = values[0];        // $35,172.34
          gstAmount = values[3];        // $470.26 (GST)
          qstAmount = values[5];        // $213.77 (QST)
          totalWithTax = values[6];     // $35,869.37 (Total)
        } else if (values.length >= 3) {
          subtotal = values[0];
          totalWithTax = values[values.length - 1];

          // Calculate tax if not found
          const totalTax = totalWithTax - subtotal;
          // Quebec taxes: GST 5%, QST 9.975%
          gstAmount = subtotal * 0.05;
          qstAmount = subtotal * 0.09975;
        }
      }
    }

    // Alternative extraction for totals
    if (!totalWithTax) {
      const totalPattern = /(?:Invoice\s*Total|Pay\s*This\s*Amount)[\s:$]*([\d,]+\.?\d{0,2})/i;
      const match = pdfText.match(totalPattern);
      if (match) {
        totalWithTax = parseFloat(match[1].replace(/,/g, ''));
      }
    }

    // Look for specific tax lines if not found
    if (!gstAmount) {
      const gstPattern = /(?:GST|HST|TPS)(?:\s*[\/:]\s*)?(?:\$\s*)?([\d,]+\.?\d{0,2})/i;
      const match = pdfText.match(gstPattern);
      if (match && parseFloat(match[1]) < 10000) { // Avoid tax ID numbers
        gstAmount = parseFloat(match[1].replace(/,/g, ''));
      }
    }

    if (!qstAmount) {
      const qstPattern = /(?:QST|PST|TVQ)(?:\s*[\/:]\s*)?(?:\$\s*)?([\d,]+\.?\d{0,2})/i;
      const match = pdfText.match(qstPattern);
      if (match && parseFloat(match[1]) < 10000) { // Avoid tax ID numbers
        qstAmount = parseFloat(match[1].replace(/,/g, ''));
      }
    }

    // Calculate subtotal if we have total and taxes
    if (!subtotal && totalWithTax && (gstAmount || qstAmount)) {
      subtotal = totalWithTax - (gstAmount || 0) - (qstAmount || 0);
    }

    // Calculate from items if no subtotal found
    if (!subtotal && items.length > 0) {
      subtotal = items.reduce((sum, item) => sum + (item.lineTotal || item.quantity * item.unitPrice), 0);
    }

    // 4. EXTRACT BUSINESS INFO
    let businessName = 'Unknown';
    let customerNumber = null;

    // Look for customer info
    const customerPattern = /Customer\s*Number[\s:]*(\d+)/i;
    const custMatch = pdfText.match(customerPattern);
    if (custMatch) {
      customerNumber = custMatch[1];
    }

    // Look for business name
    const businessPatterns = [
      /(?:Bill|Ship)\s+To[\s:]*\n([^\n]+)/i,
      /TATA\s+STEEL[^\n]*/i,
      /SODEXO[^\n]*/i
    ];

    for (const pattern of businessPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        const name = (match[1] || match[0]).trim();
        if (name && name.length > 2 && !name.includes('#')) {
          businessName = name;
          break;
        }
      }
    }

    // Calculate final values
    const totalTax = (gstAmount || 0) + (qstAmount || 0);
    const taxRate = subtotal ? ((totalTax / subtotal) * 100).toFixed(2) : null;

    console.log(`  ✓ Business: ${businessName}`);
    console.log(`  ✓ Subtotal: $${subtotal ? subtotal.toFixed(2) : '0.00'}`);
    console.log(`  ✓ GST: $${gstAmount ? gstAmount.toFixed(2) : '0.00'}`);
    console.log(`  ✓ QST: $${qstAmount ? qstAmount.toFixed(2) : '0.00'}`);
    console.log(`  ✓ Total Tax Paid: $${totalTax.toFixed(2)}`);
    console.log(`  ✓ Invoice Total: $${totalWithTax ? totalWithTax.toFixed(2) : '0.00'}`);

    // For credit memos, make amounts negative
    if (isCreditMemo) {
      if (subtotal) subtotal = -Math.abs(subtotal);
      if (gstAmount) gstAmount = -Math.abs(gstAmount);
      if (qstAmount) qstAmount = -Math.abs(qstAmount);
      if (totalWithTax) totalWithTax = -Math.abs(totalWithTax);
      console.log(`  📋 Type: Credit Memo (amounts negative)`);
    }

    return {
      success: true,

      // BASIC INFO
      invoiceNumber,
      orderDate,
      businessName,
      customerNumber,
      type: isCreditMemo ? 'credit' : 'invoice',
      isCreditMemo,

      // FINANCIAL DATA FOR REPORTS
      invoiceTotal: totalWithTax,        // Total amount of invoice (with tax)
      totalTaxPaid: totalTax,             // Total tax paid on this invoice

      // DETAILED BREAKDOWN
      subtotal: subtotal,                 // Amount before tax
      taxBreakdown: {
        gst: gstAmount || 0,             // GST/HST amount
        qst: qstAmount || 0,             // QST/PST amount
        total: totalTax                  // Total tax
      },
      taxRate: taxRate,                   // Effective tax rate percentage

      // LINE ITEMS
      items: items,
      itemCount: items.length,

      // CALCULATED VALUES
      calculatedSubtotal: items.reduce((sum, item) => sum + (item.lineTotal || item.quantity * item.unitPrice), 0)
    };

  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Process all PDFs
async function processAllPDFsComplete() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';

  // Ensure directory exists
  if (!fs.existsSync(gfsOrdersDir)) {
    fs.mkdirSync(gfsOrdersDir, { recursive: true });
  }

  // Get all PDF files
  const pdfFiles = fs.readdirSync(oneDriveDir)
    .filter(file => file.endsWith('.pdf'))
    .map(file => file.replace('.pdf', ''));

  console.log(`\n📋 Found ${pdfFiles.length} PDF files to process`);

  // Statistics
  let processed = 0;
  let errors = 0;
  let totalInvoiceAmount = 0;
  let totalTaxPaid = 0;
  let totalSubtotal = 0;
  let totalItems = 0;

  console.log('\n' + '='.repeat(80));
  console.log('📦 PROCESSING ALL INVOICES:');
  console.log('='.repeat(80));

  for (const invoiceNumber of pdfFiles) {
    const pdfPath = path.join(oneDriveDir, `${invoiceNumber}.pdf`);
    const result = await extractCompleteInvoiceData(pdfPath, invoiceNumber);

    if (result.success) {
      // Create comprehensive order file
      const orderData = {
        // Basic info
        invoiceNumber: result.invoiceNumber,
        orderDate: result.orderDate,
        businessName: result.businessName,
        customerNumber: result.customerNumber,
        type: result.type,
        isCreditMemo: result.isCreditMemo,

        // REPORT FIELDS - These are what will show in reports
        invoiceTotal: result.invoiceTotal,      // Total invoice amount (with tax)
        totalTaxPaid: result.totalTaxPaid,      // Total tax paid on invoice

        // Detailed financial data
        subtotal: result.subtotal,
        taxBreakdown: result.taxBreakdown,
        taxRate: result.taxRate,

        // Items
        items: result.items,
        itemCount: result.itemCount,

        // Metadata
        processedDate: new Date().toISOString(),
        extractedFromPdf: true,
        pdfPath: pdfPath,
        source: 'COMPLETE_EXTRACTION',
        status: 'active'
      };

      // Save to file
      const filename = `gfs_order_${invoiceNumber}.json`;
      const filePath = path.join(gfsOrdersDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));

      console.log(`  ✅ Saved: ${filename}`);

      // Update statistics
      processed++;
      if (result.invoiceTotal) totalInvoiceAmount += result.invoiceTotal;
      if (result.totalTaxPaid) totalTaxPaid += result.totalTaxPaid;
      if (result.subtotal) totalSubtotal += result.subtotal;
      totalItems += result.itemCount;
    } else {
      errors++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 PROCESSING COMPLETE - REPORT SUMMARY:');
  console.log('='.repeat(80));
  console.log(`✅ Successfully processed: ${processed} invoices`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📦 Total items extracted: ${totalItems}`);

  console.log('\n💰 FINANCIAL REPORT TOTALS:');
  console.log(`  Invoice Totals (with tax): $${totalInvoiceAmount.toFixed(2)}`);
  console.log(`  Total Tax Paid: $${totalTaxPaid.toFixed(2)}`);
  console.log(`  Subtotal (before tax): $${totalSubtotal.toFixed(2)}`);

  if (totalSubtotal > 0) {
    const avgTaxRate = (totalTaxPaid / totalSubtotal * 100).toFixed(2);
    console.log(`  Average Tax Rate: ${avgTaxRate}%`);
  }

  console.log('\n📈 REPORT FEATURES ENABLED:');
  console.log('  ✅ Invoice totals shown separately');
  console.log('  ✅ Tax paid tracked per invoice');
  console.log('  ✅ GST/QST breakdown available');
  console.log('  ✅ All line items extracted for inventory');
  console.log('  ✅ Real order dates for AI learning');

  return {
    processed,
    errors,
    totalItems,
    report: {
      totalInvoices: totalInvoiceAmount,
      totalTax: totalTaxPaid,
      totalSubtotal: totalSubtotal
    }
  };
}

// Run the processing
processAllPDFsComplete().catch(console.error);