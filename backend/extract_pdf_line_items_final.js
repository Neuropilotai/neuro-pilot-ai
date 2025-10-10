const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 FINAL PDF LINE ITEMS EXTRACTION\n');

// Final PDF line item extraction based on actual GFS table structure
async function extractLineItemsFromPDF(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found: ${invoiceNumber}.pdf`);
      return { success: false, items: [], total: null };
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    console.log(`🔍 Extracting line items from ${invoiceNumber}...`);
    
    // Check if this is a credit memo
    const isCreditMemo = /credit/i.test(pdfText) || /2002\d{6}/.test(pdfText);
    
    // Extract invoice total
    const totalPatterns = [
      /INVOICE\s+TOTAL\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /GRAND\s+TOTAL\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
    ];
    
    let invoiceTotal = null;
    for (const pattern of totalPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        let value = match[1].replace(/,/g, '');
        let numValue = parseFloat(value);
        if (isCreditMemo && numValue > 0) {
          numValue = -numValue;
        }
        invoiceTotal = numValue;
        break;
      }
    }
    
    const items = [];
    const lines = pdfText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip non-item lines
      if (!line || line.length < 30 || 
          /^(Item|Code|Qty|Unit|Description|Price|Page|Tax|Ship|Pack|Brand|Service|Division|Invoice|Purchase)/i.test(line) ||
          /^\d{1,3}$/.test(line) || // Skip standalone numbers
          /^[A-Z\s]{2,10}$/.test(line)) { // Skip short text headers
        continue;
      }
      
      // Look for lines starting with 8-digit item codes
      const itemCodeMatch = line.match(/^(\d{8})/);
      if (!itemCodeMatch) continue;
      
      const itemCode = itemCodeMatch[1];
      let remainder = line.substring(8);
      
      // Parse the GFS table format:
      // ItemCode + Description + UnitType + UnitPrice + ExtendedPrice + PackInfo + Brand
      
      // Extract description (everything up to a unit type like MT, PR, FR, CS, EA)
      const descMatch = remainder.match(/^([A-Z0-9\s\-\/]+?)(MT|PR|FR|CS|EA|LB|KG|UN|CT|BX|PK)(.*)$/i);
      if (!descMatch) continue;
      
      const description = descMatch[1].trim();
      const unitType = descMatch[2];
      const numbersAndRest = descMatch[3];
      
      // Find all decimal numbers in the remaining text
      const decimalNumbers = numbersAndRest.match(/\d+\.?\d*/g);
      if (!decimalNumbers || decimalNumbers.length < 2) continue;
      
      // Convert to floats
      const numbers = decimalNumbers.map(n => parseFloat(n));
      
      // In GFS format, we typically have:
      // - Unit price (first significant number)
      // - Extended price (larger number that makes sense as a total)
      
      let unitPrice, extendedPrice, quantity;
      
      // Try to identify unit price vs extended price
      // Usually unit price is smaller and extended price is larger
      if (numbers.length >= 2) {
        // Sort numbers to find potential unit price (smaller) and extended price (larger)
        const sortedNumbers = [...numbers].sort((a, b) => a - b);
        
        // Look for reasonable price combinations
        for (let j = 0; j < numbers.length - 1; j++) {
          const potentialUnitPrice = numbers[j];
          for (let k = j + 1; k < numbers.length; k++) {
            const potentialExtendedPrice = numbers[k];
            
            // Calculate quantity
            if (potentialUnitPrice > 0) {
              const calculatedQty = potentialExtendedPrice / potentialUnitPrice;
              
              // Check if quantity makes sense (between 1 and 1000, reasonable precision)
              if (calculatedQty >= 0.1 && calculatedQty <= 1000 && 
                  Math.abs(calculatedQty - Math.round(calculatedQty * 100) / 100) < 0.01) {
                
                unitPrice = potentialUnitPrice;
                extendedPrice = potentialExtendedPrice;
                quantity = Math.round(calculatedQty * 100) / 100;
                break;
              }
            }
          }
          if (unitPrice) break;
        }
      }
      
      // If we found valid values, create the item
      if (unitPrice && extendedPrice && quantity && 
          description.length > 3 && unitPrice < extendedPrice) {
        
        const item = {
          itemCode: itemCode,
          description: description,
          quantity: quantity,
          unitPrice: unitPrice,
          lineTotal: extendedPrice,
          unit: unitType,
          calculationCheck: `${quantity} × ${unitPrice} = ${(quantity * unitPrice).toFixed(2)}`
        };
        
        items.push(item);
      }
    }
    
    // Remove duplicates
    const uniqueItems = [];
    const seenCodes = new Set();
    
    for (const item of items) {
      if (!seenCodes.has(item.itemCode) && item.quantity > 0) {
        seenCodes.add(item.itemCode);
        uniqueItems.push(item);
      }
    }
    
    // Calculate extracted total
    const extractedTotal = uniqueItems.reduce((sum, item) => sum + item.lineTotal, 0);
    
    console.log(`  📊 Found ${uniqueItems.length} line items`);
    console.log(`  💰 Items total: $${extractedTotal.toFixed(2)}`);
    if (invoiceTotal !== null) {
      console.log(`  💰 Invoice total: $${Math.abs(invoiceTotal).toFixed(2)}`);
      const difference = Math.abs(extractedTotal - Math.abs(invoiceTotal));
      console.log(`  📏 Difference: $${difference.toFixed(2)}`);
      const percentMatch = (1 - (difference / Math.abs(invoiceTotal))) * 100;
      console.log(`  📊 Match: ${percentMatch.toFixed(1)}%`);
    }
    
    // Show sample items
    if (uniqueItems.length > 0) {
      console.log('  📦 Sample items:');
      uniqueItems.slice(0, 5).forEach(item => {
        console.log(`    ${item.itemCode}: ${item.description.substring(0, 30)}... (${item.quantity} × $${item.unitPrice} = $${item.lineTotal})`);
      });
    }
    
    return {
      success: true,
      items: uniqueItems,
      total: invoiceTotal,
      extractedItemsTotal: extractedTotal,
      itemCount: uniqueItems.length
    };
    
  } catch (error) {
    console.error(`❌ Error extracting from ${invoiceNumber}: ${error.message}`);
    return { success: false, items: [], total: null };
  }
}

// Function to update all order files with extracted line items
async function updateOrderFilesWithLineItems() {
  const gfsOrdersDir = './data/gfs_orders';
  const invoicesDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  
  // Get all PDF files
  let availablePdfs = [];
  try {
    const invoiceFiles = fs.readdirSync(invoicesDir);
    availablePdfs = invoiceFiles
      .filter(file => file.endsWith('.pdf'))
      .map(file => file.replace('.pdf', ''));
    console.log(`📋 Found ${availablePdfs.length} PDF invoice files`);
  } catch (error) {
    console.error('❌ Could not load invoice directory:', error.message);
    return;
  }
  
  // Get all order files
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));
  
  console.log(`📂 Processing ${files.length} order files...\n`);
  
  let processed = 0;
  let updated = 0;
  let itemsAdded = 0;
  let totalExtracted = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Skip if already has items extracted
      if (order.itemsExtracted || (order.items && order.items.length > 0)) {
        console.log(`⏭️ Skipping ${order.invoiceNumber || 'unknown'} - already has items`);
        processed++;
        continue;
      }
      
      if (order.invoiceNumber && availablePdfs.includes(order.invoiceNumber)) {
        console.log(`\n🔍 Processing ${order.invoiceNumber}...`);
        
        // Extract line items
        const extractionResult = await extractLineItemsFromPDF(order.invoiceNumber);
        
        if (extractionResult.success && extractionResult.items.length > 0) {
          // Update order with extracted items
          order.items = extractionResult.items;
          order.totalItems = extractionResult.items.length;
          order.itemsExtracted = true;
          order.itemsExtractionDate = new Date().toISOString();
          order.extractedItemsTotal = extractionResult.extractedItemsTotal;
          
          // Update totals if they match well
          if (extractionResult.total !== null) {
            const difference = Math.abs(extractionResult.extractedItemsTotal - Math.abs(extractionResult.total));
            if (difference < Math.abs(extractionResult.total) * 0.1) { // Within 10%
              order.itemsMatchInvoiceTotal = true;
            }
          }
          
          // Save the updated order
          fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
          
          console.log(`  ✅ Updated with ${extractionResult.items.length} items`);
          itemsAdded += extractionResult.items.length;
          totalExtracted += extractionResult.extractedItemsTotal;
          updated++;
        } else {
          console.log(`  ⚠️ No line items extracted from ${order.invoiceNumber}`);
        }
      } else {
        console.log(`  ⏭️ Skipped ${order.invoiceNumber || 'unknown'} (no PDF)`);
      }
      
      processed++;
      
      // Process in batches to avoid memory issues
      if (processed % 10 === 0) {
        console.log(`\n📈 Progress: ${processed}/${files.length} files processed`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 LINE ITEMS EXTRACTION SUMMARY:');
  console.log('='.repeat(60));
  console.log(`📁 Orders processed: ${processed}`);
  console.log(`✅ Orders updated with items: ${updated}`);
  console.log(`📦 Total items extracted: ${itemsAdded}`);
  console.log(`💰 Total value extracted: $${totalExtracted.toFixed(2)}`);
  console.log(`❌ Errors: ${errors}`);
  
  if (updated > 0) {
    console.log('\n🎉 Line items extraction completed successfully!');
    console.log(`📈 Average items per order: ${(itemsAdded / updated).toFixed(1)}`);
    console.log(`💵 Average order value: $${(totalExtracted / updated).toFixed(2)}`);
  } else {
    console.log('\n⚠️ No line items were extracted.');
  }
}

async function testFinalExtraction() {
  // Test on specific invoices first
  const testInvoices = ['9022353883', '9021570039', '9022080516'];
  
  console.log('🧪 TESTING FINAL EXTRACTION ON SAMPLE INVOICES:\n');
  
  for (const invoice of testInvoices) {
    console.log(`\n🎯 Testing ${invoice}:`);
    const result = await extractLineItemsFromPDF(invoice);
    console.log('-'.repeat(60));
  }
  
  console.log('\n🚀 Starting full extraction...\n');
  await updateOrderFilesWithLineItems();
}

testFinalExtraction().catch(console.error);