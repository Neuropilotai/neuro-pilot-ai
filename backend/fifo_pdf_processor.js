const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('📦 FIFO-ENABLED PDF PROCESSOR WITH ACCURATE LINE ITEM EXTRACTION');
console.log('='.repeat(80));

// Extract complete invoice with proper Qty Ship and FIFO tracking
async function extractInvoiceWithFIFO(pdfFilePath, invoiceNumber) {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      return { success: false, reason: 'PDF not found' };
    }

    const dataBuffer = fs.readFileSync(pdfFilePath);
    const data = await pdf(dataBuffer);

    // Use pdftotext with layout for better structure
    const { execSync } = require('child_process');
    let structuredText = '';
    try {
      structuredText = execSync(`pdftotext -layout "${pdfFilePath}" -`, { encoding: 'utf-8' });
    } catch (e) {
      structuredText = data.text;
    }

    console.log(`\n📄 Processing Invoice ${invoiceNumber}...`);

    // Check if credit memo
    const isCreditMemo = /credit\s*memo/i.test(structuredText) || /^2002\d{6}$/.test(invoiceNumber);

    // 1. EXTRACT ORDER DATE
    let orderDate = null;
    const datePatterns = [
      /Invoice\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Order\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Ship\s+Date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];

    for (const pattern of datePatterns) {
      const matches = structuredText.match(pattern);
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

    // 2. EXTRACT LINE ITEMS WITH QTY SHIP
    const items = [];
    const lines = structuredText.split('\n');

    // Pattern for GFS line items with layout preservation
    // Format: ItemCode QtyOrd QtyShip Unit Pack Brand Description ... Price Total
    const itemPattern = /^(\d{5,7})\s+(\d+)\s+(\d+)\s+([A-Z]{2})\s+([^\s]+)\s+(\w+)\s+(.+?)\s+([\d.]+)\s+([\d,]+\.?\d{0,2})$/;

    // Alternative pattern with more flexibility
    const flexPattern = /^(\d{5,7})\s+(\d+)\s+(\d+)\s+([A-Z]{2})\s+.+?\s+([\d.]+)\s+([\d,]+\.?\d{0,2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and headers
      if (!line || line.length < 20) continue;
      if (/^(Item|Page|Service|Division|FOLD|Qty\s+Ord)/i.test(line)) continue;

      // Check if line starts with item code (5-7 digits)
      if (/^\d{5,7}\s/.test(line)) {
        // Extract columns from fixed-width format
        const parts = line.split(/\s{2,}/);

        // Parse based on typical GFS invoice structure
        if (parts.length >= 6) {
          const itemCode = parts[0].trim();

          // Find the quantity columns (usually 2nd and 3rd numeric values after item code)
          const lineNumbers = [];
          for (let j = 1; j < parts.length; j++) {
            const part = parts[j].trim();
            if (/^\d+$/.test(part) && parseInt(part) < 1000000) { // Exclude item codes
              lineNumbers.push(parseInt(part));
            }
          }

          let qtyOrdered = 0;
          let qtyShipped = 0;

          if (lineNumbers.length >= 2) {
            qtyOrdered = lineNumbers[0];
            qtyShipped = lineNumbers[1];
          } else if (lineNumbers.length === 1) {
            qtyShipped = lineNumbers[0]; // If only one qty, assume it's shipped
            qtyOrdered = qtyShipped;
          }

          // Find unit (usually CS, EA, etc.)
          const unitMatch = line.match(/\s+([A-Z]{2})\s+/);
          const unit = unitMatch ? unitMatch[1] : 'EA';

          // Find description (text between unit and price)
          let description = '';
          const descMatch = line.match(/[A-Z]{2}\s+[\dx.]+\s+\w+\s+(.+?)\s+[A-Z]{2}\s+[\d.]+\s+[\d,]+\.?\d{0,2}$/);
          if (descMatch) {
            description = descMatch[1].trim();
          } else {
            // Try to extract from middle of line
            const midParts = parts.slice(3, -2);
            description = midParts.filter(p => isNaN(parseFloat(p.replace(/,/g, '')))).join(' ');
          }

          // Find prices (usually last two numeric values with decimals)
          const pricePattern = /([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})$/;
          const priceMatch = line.match(pricePattern);

          let unitPrice = 0;
          let lineTotal = 0;

          if (priceMatch) {
            unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            lineTotal = parseFloat(priceMatch[2].replace(/,/g, ''));
          }

          // Check next line for barcode/UPC
          let barcode = '';
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (/^\d{10,13}$/.test(nextLine)) {
              barcode = nextLine;
              i++; // Skip barcode line
            }
          }

          // Only add if we have valid data
          if (itemCode && qtyShipped > 0 && description && description.length > 2) {
            const item = {
              itemCode: itemCode,
              description: description.replace(/\s+/g, ' '),
              qtyOrdered: qtyOrdered,
              qtyShipped: qtyShipped,  // THIS IS WHAT WE USE FOR INVENTORY
              unit: unit,
              unitPrice: unitPrice,
              lineTotal: lineTotal,
              barcode: barcode,

              // FIFO tracking fields
              orderDate: orderDate,
              invoiceNumber: invoiceNumber,
              priceHistory: [{
                date: orderDate,
                invoice: invoiceNumber,
                price: unitPrice,
                quantity: qtyShipped
              }]
            };

            items.push(item);
            console.log(`  ✓ Item: ${itemCode} - ${description} (Shipped: ${qtyShipped} ${unit} @ $${unitPrice})`);
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

    // Look for totals section
    const totalsSection = structuredText.match(/Sub\s*total[\s\S]*?Invoice\s*Total[\s\S]*?\$([\d,]+\.?\d{0,2})/i);

    if (totalsSection) {
      const amounts = totalsSection[0].match(/\$([\d,]+\.?\d{0,2})/g);

      if (amounts && amounts.length >= 3) {
        const values = amounts.map(a => parseFloat(a.replace(/[$,]/g, '')));

        if (values.length >= 7) {
          subtotal = values[0];
          gstAmount = values[3];
          qstAmount = values[5];
          totalWithTax = values[6];
        }
      }
    }

    // Alternative extraction
    if (!totalWithTax) {
      const totalPattern = /(?:Invoice\s*Total|Pay\s*This\s*Amount)[\s:$]*([\d,]+\.?\d{0,2})/i;
      const match = structuredText.match(totalPattern);
      if (match) {
        totalWithTax = parseFloat(match[1].replace(/,/g, ''));
      }
    }

    // Calculate from items if no subtotal
    if (!subtotal && items.length > 0) {
      subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    }

    // 4. EXTRACT BUSINESS INFO
    let businessName = 'Unknown';
    let customerNumber = null;

    const customerPattern = /Customer\s*Number[\s:]*(\d+)/i;
    const custMatch = structuredText.match(customerPattern);
    if (custMatch) {
      customerNumber = custMatch[1];
    }

    const businessPatterns = [
      /(?:Bill|Ship)\s+To[\s:]*\n([^\n]+)/i,
      /TATA\s+STEEL[^\n]*/i,
      /SODEXO[^\n]*/i
    ];

    for (const pattern of businessPatterns) {
      const match = structuredText.match(pattern);
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
    console.log(`  ✓ Total Tax: $${totalTax.toFixed(2)}`);
    console.log(`  ✓ Invoice Total: $${totalWithTax ? totalWithTax.toFixed(2) : '0.00'}`);

    // For credit memos, make amounts negative
    if (isCreditMemo) {
      if (subtotal) subtotal = -Math.abs(subtotal);
      if (gstAmount) gstAmount = -Math.abs(gstAmount);
      if (qstAmount) qstAmount = -Math.abs(qstAmount);
      if (totalWithTax) totalWithTax = -Math.abs(totalWithTax);

      // Also adjust item quantities for returns
      items.forEach(item => {
        item.qtyShipped = -Math.abs(item.qtyShipped);
      });

      console.log(`  📋 Type: Credit Memo (quantities and amounts negative)`);
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
      invoiceTotal: totalWithTax,
      totalTaxPaid: totalTax,

      // DETAILED BREAKDOWN
      subtotal: subtotal,
      taxBreakdown: {
        gst: gstAmount || 0,
        qst: qstAmount || 0,
        total: totalTax
      },
      taxRate: taxRate,

      // LINE ITEMS WITH QTY SHIPPED FOR INVENTORY
      items: items,
      itemCount: items.length,

      // SUMMARY FOR INVENTORY
      totalItemsShipped: items.reduce((sum, item) => sum + Math.abs(item.qtyShipped), 0),
      totalItemsOrdered: items.reduce((sum, item) => sum + item.qtyOrdered, 0)
    };

  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Test with bacon invoice
async function testBaconInvoice() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const testInvoice = '9018357843';
  const pdfPath = path.join(oneDriveDir, `${testInvoice}.pdf`);

  console.log('\n📊 TESTING BACON INVOICE EXTRACTION:');
  console.log('-'.repeat(80));

  const result = await extractInvoiceWithFIFO(pdfPath, testInvoice);

  if (result.success) {
    console.log('\n✅ EXTRACTION RESULTS:');
    console.log(`  Invoice: ${result.invoiceNumber}`);
    console.log(`  Date: ${result.orderDate}`);
    console.log(`  Items Found: ${result.itemCount}`);
    console.log(`  Total Items Shipped: ${result.totalItemsShipped}`);

    // Look for bacon specifically
    const baconItems = result.items.filter(item =>
      item.description.toUpperCase().includes('BACON') ||
      item.itemCode === '1206417'
    );

    if (baconItems.length > 0) {
      console.log('\n🥓 BACON ITEMS FOUND:');
      baconItems.forEach(item => {
        console.log(`  Item Code: ${item.itemCode}`);
        console.log(`  Description: ${item.description}`);
        console.log(`  Qty Ordered: ${item.qtyOrdered} ${item.unit}`);
        console.log(`  Qty Shipped: ${item.qtyShipped} ${item.unit} ← USED FOR INVENTORY`);
        console.log(`  Unit Price: $${item.unitPrice}`);
        console.log(`  Line Total: $${item.lineTotal}`);
      });
    }

    // Show other items
    if (result.items.length > baconItems.length) {
      console.log('\n📦 OTHER ITEMS:');
      result.items.filter(item => !item.description.toUpperCase().includes('BACON'))
        .slice(0, 3)
        .forEach(item => {
          console.log(`  ${item.itemCode}: ${item.description} (${item.qtyShipped} ${item.unit})`);
        });
    }
  }

  return result;
}

// Process all PDFs with FIFO tracking using the new system
async function processAllInvoicesWithFIFO() {
  const FIFOInventoryManager = require('./fifo_inventory_system');
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';

  // Initialize FIFO system
  const fifo = new FIFOInventoryManager();

  // First test
  const testResult = await testBaconInvoice();

  if (!testResult.success || testResult.itemCount === 0) {
    console.log('\n⚠️ Test extraction found no items. Checking extraction logic...');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('Ready to process all 84 PDFs with FIFO tracking?');
  console.log('This will:');
  console.log('  • Extract all line items using Qty Shipped');
  console.log('  • Build comprehensive FIFO inventory');
  console.log('  • Track multiple prices per item');
  console.log('  • Enable accurate inventory counts');
  console.log('  • Separate tax from subtotals');

  // Get all PDF files
  const pdfFiles = fs.readdirSync(oneDriveDir)
    .filter(file => file.endsWith('.pdf'))
    .map(file => file.replace('.pdf', ''))
    .sort(); // Process in order

  console.log(`\n📋 Found ${pdfFiles.length} PDF files to process with FIFO tracking`);

  let processed = 0;
  let errors = 0;
  let totalItems = 0;

  for (const invoiceNumber of pdfFiles) {
    const pdfPath = path.join(oneDriveDir, `${invoiceNumber}.pdf`);
    const result = await extractInvoiceWithFIFO(pdfPath, invoiceNumber);

    if (result.success && result.items.length > 0) {
      // Add items to FIFO system
      const itemsAdded = fifo.addOrderItems(
        result.orderDate || new Date().toISOString().split('T')[0],
        result.invoiceNumber,
        result.items
      );

      // Save order data with FIFO tracking
      const orderData = {
        ...result,
        processedDate: new Date().toISOString(),
        source: 'FIFO_EXTRACTION',
        fifoProcessed: true
      };

      // Ensure directory exists
      if (!fs.existsSync(gfsOrdersDir)) {
        fs.mkdirSync(gfsOrdersDir, { recursive: true });
      }

      const filename = `gfs_order_${invoiceNumber}.json`;
      const filePath = path.join(gfsOrdersDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));

      console.log(`  ✅ ${filename}: ${result.itemCount} items, $${(result.totalWithTax || 0).toFixed(2)}`);

      processed++;
      totalItems += result.itemCount;
    } else {
      console.log(`  ❌ ${invoiceNumber}: extraction failed`);
      errors++;
    }
  }

  // Save FIFO inventory data
  fifo.saveData();

  // Generate comprehensive report
  console.log('\n' + '='.repeat(80));
  console.log('📊 FIFO PROCESSING COMPLETE');
  console.log('='.repeat(80));
  console.log(`✅ Successfully processed: ${processed} invoices`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📦 Total items in FIFO system: ${totalItems}`);

  const report = fifo.generateReport();

  console.log('\n🎯 FIFO SYSTEM READY:');
  console.log('  ✅ Qty Shipped used for all inventory calculations');
  console.log('  ✅ Multiple price tracking per item');
  console.log('  ✅ Inventory count validation with AI guidance');
  console.log('  ✅ Complete price history for all items');
  console.log('  ✅ Date-based batch tracking');

  // Show some examples
  console.log('\n📦 Sample FIFO Items:');
  const baconStatus = fifo.getInventoryStatus('1206417');
  if (baconStatus) {
    console.log(`\n🥓 Bacon (${baconStatus.itemCode}):`);
    console.log(`   Total: ${baconStatus.totalQuantity} ${baconStatus.unit}`);
    console.log(`   Value: $${baconStatus.totalValue.toFixed(2)}`);
    console.log(`   Batches: ${baconStatus.batchCount}`);
  }

  return {
    processed,
    errors,
    totalItems,
    fifoSystem: fifo
  };
}

// Run the processing
processAllInvoicesWithFIFO().catch(console.error);