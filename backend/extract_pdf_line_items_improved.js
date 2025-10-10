const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 IMPROVED PDF LINE ITEMS EXTRACTION\n');

// Enhanced PDF line item extraction function based on actual GFS format
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
    
    // Extract line items using the actual GFS format
    const items = [];
    
    // Split the text into lines and look for item patterns
    const lines = pdfText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip headers and empty lines
      if (!line || line.includes('Item') || line.includes('Code') || line.includes('Qty') || 
          line.includes('Description') || line.includes('Price') || line.includes('Page')) {
        continue;
      }
      
      // Pattern 1: GFS format with item code at start
      // Example: "10857691APPLE GOLDEN DELICIOUSPR48.2048.20CS11x18.18 KGPacker"
      const gfsPattern1 = /^(\d{8})([A-Z\s]+?)(PR|FR|MT|CS|EA|LB|KG)(\d+\.?\d*)(\d+\.?\d*)(CS|EA|LB|KG)(.+)$/i;
      const match1 = line.match(gfsPattern1);
      
      if (match1) {
        const [, itemCode, description, priceUnit, unitPrice, totalPrice, qtyUnit, packInfo] = match1;
        
        // Calculate quantity from total/unit price
        const unitPriceNum = parseFloat(unitPrice);
        const totalPriceNum = parseFloat(totalPrice);
        const quantity = unitPriceNum > 0 ? Math.round((totalPriceNum / unitPriceNum) * 100) / 100 : 1;
        
        const item = {
          itemCode: itemCode.trim(),
          description: description.trim(),
          quantity: quantity,
          unitPrice: unitPriceNum,
          lineTotal: totalPriceNum,
          unit: qtyUnit || 'CS',
          packInfo: packInfo ? packInfo.trim() : ''
        };
        
        items.push(item);
        continue;
      }
      
      // Pattern 2: Multi-line items (description on separate line)
      // Look for lines with just item codes and prices
      const codePattern = /^(\d{8})\s*$/;
      const codeMatch = line.match(codePattern);
      
      if (codeMatch && i + 1 < lines.length) {
        const itemCode = codeMatch[1];
        const nextLine = lines[i + 1].trim();
        
        // Check if next line has description and prices
        const descPattern = /^([A-Z\s]+?)(PR|FR|MT|CS|EA|LB|KG)(\d+\.?\d*)(\d+\.?\d*)(CS|EA|LB|KG)(.*)$/i;
        const descMatch = nextLine.match(descPattern);
        
        if (descMatch) {
          const [, description, priceUnit, unitPrice, totalPrice, qtyUnit, packInfo] = descMatch;
          
          const unitPriceNum = parseFloat(unitPrice);
          const totalPriceNum = parseFloat(totalPrice);
          const quantity = unitPriceNum > 0 ? Math.round((totalPriceNum / unitPriceNum) * 100) / 100 : 1;
          
          const item = {
            itemCode: itemCode.trim(),
            description: description.trim(),
            quantity: quantity,
            unitPrice: unitPriceNum,
            lineTotal: totalPriceNum,
            unit: qtyUnit || 'CS',
            packInfo: packInfo ? packInfo.trim() : ''
          };
          
          items.push(item);
          i++; // Skip the description line
          continue;
        }
      }
      
      // Pattern 3: Look for lines with numeric patterns that could be items
      const numericPattern = /(\d{6,8})[A-Z\s]+(\d+\.?\d+).*?(\d+\.?\d+)/i;
      const numMatch = line.match(numericPattern);
      
      if (numMatch && line.length > 30) {
        // Try to extract meaningful parts
        const parts = line.split(/\s+/);
        let itemCode = '';
        let description = '';
        let prices = [];
        
        // Find item code (6-8 digits at start)
        for (const part of parts) {
          if (/^\d{6,8}$/.test(part)) {
            itemCode = part;
            break;
          }
        }
        
        // Find prices (decimal numbers)
        for (const part of parts) {
          if (/^\d+\.\d{2}$/.test(part)) {
            prices.push(parseFloat(part));
          }
        }
        
        // Extract description (text between code and first price)
        const codeIndex = line.indexOf(itemCode);
        const firstPriceIndex = prices.length > 0 ? line.indexOf(prices[0].toFixed(2)) : -1;
        
        if (codeIndex >= 0 && firstPriceIndex > codeIndex) {
          description = line.substring(codeIndex + itemCode.length, firstPriceIndex)
            .replace(/[A-Z]{2,3}$/, '').trim(); // Remove unit codes like PR, CS, etc.
        }
        
        if (itemCode && description && prices.length >= 2) {
          const unitPrice = prices[0];
          const totalPrice = prices[prices.length - 1];
          const quantity = unitPrice > 0 ? Math.round((totalPrice / unitPrice) * 100) / 100 : 1;
          
          const item = {
            itemCode: itemCode,
            description: description,
            quantity: quantity,
            unitPrice: unitPrice,
            lineTotal: totalPrice,
            unit: 'CS'
          };
          
          items.push(item);
        }
      }
    }
    
    // Remove duplicates and validate items
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
    }
    
    // Show first few items
    if (uniqueItems.length > 0) {
      console.log('  📦 Sample items:');
      uniqueItems.slice(0, 3).forEach(item => {
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

async function testImprovedExtraction() {
  // Test on the invoice we analyzed
  const testInvoices = ['9022353883', '9021570039', '9022080516'];
  
  for (const invoice of testInvoices) {
    console.log(`\n🎯 Testing ${invoice}:`);
    const result = await extractLineItemsFromPDF(invoice);
    
    if (result.success && result.items.length > 0) {
      console.log(`✅ Successfully extracted ${result.items.length} items`);
      console.log(`💰 Total: $${result.extractedItemsTotal.toFixed(2)}`);
    } else {
      console.log(`❌ Failed to extract items from ${invoice}`);
    }
    
    console.log('-'.repeat(60));
  }
}

testImprovedExtraction().catch(console.error);