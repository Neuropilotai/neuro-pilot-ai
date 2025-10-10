const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 FIXED PDF LINE ITEMS EXTRACTION\n');

// Enhanced PDF line item extraction function with correct GFS format parsing
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
    
    // Extract invoice total first
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
    
    // Extract line items using the CORRECT GFS format
    const items = [];
    
    // Split the text into lines and look for item patterns
    const lines = pdfText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip headers and empty lines
      if (!line || line.includes('Item') || line.includes('Code') || line.includes('Qty') || 
          line.includes('Description') || line.includes('Price') || line.includes('Page') ||
          line.includes('Tax') || line.includes('Ship') || line.includes('Pack Size') ||
          line.includes('Brand') || line.length < 20) {
        continue;
      }
      
      // Correct GFS format analysis from the PDF:
      // 120641740BACON RAW 18-22CT SLCD L/O FRSHMT65.012,600.40CS401x5 KGSodexo
      // Pattern: [ItemCode][Description][UnitType][Quantity][UnitPrice][ExtendedPrice][Unit][PackSize][Brand]
      
      // Try to parse the complex GFS line format
      // Look for lines starting with 8-digit item codes
      const itemCodeMatch = line.match(/^(\d{8})/);
      if (!itemCodeMatch) continue;
      
      const itemCode = itemCodeMatch[1];
      let remainingLine = line.substring(8);
      
      // Extract description (ends with unit type like MT, PR, FR, CS)
      const descMatch = remainingLine.match(/^([A-Z\s\-\/]+?)(MT|PR|FR|CS|EA|LB|KG)(.+)$/i);
      if (!descMatch) continue;
      
      const description = descMatch[1].trim();
      const unitType = descMatch[2];
      const numbersSection = descMatch[3];
      
      // Extract numbers from the remaining section
      // Pattern should be: [Quantity][UnitPrice][ExtendedPrice][PackInfo]
      const numbers = numbersSection.match(/(\d+(?:\.\d+)?)/g);
      if (!numbers || numbers.length < 3) continue;
      
      // In the GFS format:
      // - First number is quantity
      // - Second number is unit price  
      // - Third number is extended price
      const quantity = parseFloat(numbers[0]);
      const unitPrice = parseFloat(numbers[1]);
      const extendedPrice = parseFloat(numbers[2]);
      
      // Validate the calculation (quantity × unitPrice should ≈ extendedPrice)
      const calculatedTotal = quantity * unitPrice;
      const difference = Math.abs(calculatedTotal - extendedPrice);
      const tolerance = Math.max(0.01, extendedPrice * 0.01); // 1% tolerance or 1 cent
      
      if (difference <= tolerance) {
        const item = {
          itemCode: itemCode,
          description: description,
          quantity: quantity,
          unitPrice: unitPrice,
          lineTotal: extendedPrice,
          unit: unitType || 'CS',
          calculationCheck: `${quantity} × ${unitPrice} = ${calculatedTotal.toFixed(2)} (actual: ${extendedPrice})`
        };
        
        items.push(item);
      } else {
        // If the calculation doesn't match, try alternative parsing
        // Sometimes the format might be different
        console.log(`⚠️ Calculation mismatch for ${itemCode}: ${quantity} × ${unitPrice} = ${calculatedTotal.toFixed(2)} vs ${extendedPrice}`);
      }
    }
    
    // Remove duplicates
    const uniqueItems = [];
    const seenCodes = new Set();
    
    for (const item of items) {
      if (!seenCodes.has(item.itemCode) && 
          item.quantity > 0 && 
          item.unitPrice > 0 && 
          item.lineTotal > 0 &&
          item.description.length > 3) {
        
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
      if (difference < 100) { // Within $100 is reasonable given tax/misc charges
        console.log(`  ✅ Totals match reasonably well!`);
      }
    }
    
    // Show first few items with calculations
    if (uniqueItems.length > 0) {
      console.log('  📦 Sample items:');
      uniqueItems.slice(0, 3).forEach(item => {
        console.log(`    ${item.itemCode}: ${item.description.substring(0, 25)}... (${item.quantity} × $${item.unitPrice} = $${item.lineTotal})`);
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

async function testFixedExtraction() {
  // Test on the invoice we analyzed
  const testInvoices = ['9022353883', '9021570039', '9022080516'];
  
  for (const invoice of testInvoices) {
    console.log(`\n🎯 Testing ${invoice}:`);
    const result = await extractLineItemsFromPDF(invoice);
    
    if (result.success && result.items.length > 0) {
      console.log(`✅ Successfully extracted ${result.items.length} items`);
      console.log(`💰 Total: $${result.extractedItemsTotal.toFixed(2)}`);
      
      // Show accuracy
      if (result.total !== null) {
        const accuracy = (1 - Math.abs(result.extractedItemsTotal - Math.abs(result.total)) / Math.abs(result.total)) * 100;
        console.log(`📊 Extraction accuracy: ${accuracy.toFixed(1)}%`);
      }
    } else {
      console.log(`❌ Failed to extract items from ${invoice}`);
    }
    
    console.log('-'.repeat(60));
  }
}

testFixedExtraction().catch(console.error);