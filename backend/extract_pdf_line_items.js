const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 EXTRACTING PDF LINE ITEMS FROM ALL INVOICES\n');

// Helper function for data paths
function getDataPath(type, filename) {
  const baseDir = './data';
  
  switch (type) {
    case 'invoices':
      return '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    case 'gfs_orders':
      return path.join(baseDir, 'gfs_orders');
    default:
      return path.join(baseDir, type, filename);
  }
}

// Enhanced PDF line item extraction function
async function extractLineItemsFromPDF(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found: ${invoiceNumber}.pdf`);
      return { success: false, items: [], total: null };
    }
    
    // Read and parse PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    console.log(`🔍 Extracting line items from ${invoiceNumber}...`);
    
    // Check if this is a credit memo
    const isCreditMemo = /credit/i.test(pdfText) || /2002\d{6}/.test(pdfText);
    
    // Extract invoice total first (using our proven patterns)
    const totalPatterns = [
      /INVOICE\s+TOTAL\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /GRAND\s+TOTAL\s*[:.]\s*\$?([\d,]+\.?\d*)/i,
      /GST\/HST\s*\$[\d,]+\.?\d*\s*.*?TOTAL\s*[:.]\s*\$?([\d,]+\.?\d*)/is,
      /PST\/QST\s*\$[\d,]+\.?\d*\s*.*?GST\/HST\s*\$[\d,]+\.?\d*\s*.*?\$?([\d,]+\.?\d*)/is,
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
    
    // Extract line items using multiple patterns
    const items = [];
    
    // Pattern 1: Standard GFS line item format
    // Example: "12345 ITEM NAME                    $12.34 EA    5    $61.70"
    const pattern1 = /(\d{4,})\s+([A-Z][^$\n]*?)\s+\$?([\d,]+\.?\d*)\s+(EA|LB|KG|CS|BX|PK|CT|UN)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.?\d*)/gi;
    
    // Pattern 2: Alternative format with prices at end
    // Example: "ITEM NAME                        QTY: 5    PRICE: $12.34    TOTAL: $61.70"
    const pattern2 = /([A-Z][^$\n]*?)\s+QTY:\s*(\d+(?:\.\d+)?)\s+PRICE:\s*\$?([\d,]+\.?\d*)\s+TOTAL:\s*\$?([\d,]+\.?\d*)/gi;
    
    // Pattern 3: Simple format with item code first
    // Example: "123456  PRODUCT NAME               5.00   $12.34   $61.70"
    const pattern3 = /(\d{4,})\s+([A-Z][^\d\n]*?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/gi;
    
    // Pattern 4: Table format extraction
    // Look for structured table data between headers
    const lines = pdfText.split('\n');
    let inItemSection = false;
    let itemSectionStarted = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect start of item section
      if (/item\s*code|product|description|qty|quantity|price|amount|total/i.test(line) && !itemSectionStarted) {
        inItemSection = true;
        itemSectionStarted = true;
        continue;
      }
      
      // Detect end of item section
      if (inItemSection && (/subtotal|sub\s*total|tax|gst|pst|hst|total/i.test(line))) {
        inItemSection = false;
        break;
      }
      
      // Extract items from the section
      if (inItemSection && line.length > 10) {
        // Try to parse structured line data
        const itemMatch = line.match(/(\d{4,})?[^\d]*?([A-Z][^$\d]*?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/i);
        if (itemMatch) {
          const [, itemCode, description, quantity, unitPrice, lineTotal] = itemMatch;
          
          const parsedItem = {
            itemCode: itemCode || 'N/A',
            description: description.trim(),
            quantity: parseFloat(quantity),
            unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
            lineTotal: parseFloat(lineTotal.replace(/,/g, '')),
            unit: 'EA' // Default unit
          };
          
          // Validate the item
          if (parsedItem.quantity > 0 && parsedItem.unitPrice > 0 && 
              Math.abs((parsedItem.quantity * parsedItem.unitPrice) - parsedItem.lineTotal) < 0.02) {
            items.push(parsedItem);
          }
        }
      }
    }
    
    // Apply all patterns to extract items
    let match;
    
    // Pattern 1
    while ((match = pattern1.exec(pdfText)) !== null) {
      const [, itemCode, description, unitPrice, unit, quantity, lineTotal] = match;
      
      const parsedItem = {
        itemCode: itemCode.trim(),
        description: description.trim(),
        quantity: parseFloat(quantity),
        unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
        lineTotal: parseFloat(lineTotal.replace(/,/g, '')),
        unit: unit
      };
      
      // Validate the item calculation
      if (Math.abs((parsedItem.quantity * parsedItem.unitPrice) - parsedItem.lineTotal) < 0.02) {
        items.push(parsedItem);
      }
    }
    
    // Pattern 3 (simpler format)
    while ((match = pattern3.exec(pdfText)) !== null) {
      const [, itemCode, description, quantity, unitPrice, lineTotal] = match;
      
      const parsedItem = {
        itemCode: itemCode.trim(),
        description: description.trim(),
        quantity: parseFloat(quantity),
        unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
        lineTotal: parseFloat(lineTotal.replace(/,/g, '')),
        unit: 'EA'
      };
      
      // Validate the item calculation
      if (Math.abs((parsedItem.quantity * parsedItem.unitPrice) - parsedItem.lineTotal) < 0.02) {
        items.push(parsedItem);
      }
    }
    
    // Remove duplicates based on itemCode and description
    const uniqueItems = [];
    const seenItems = new Set();
    
    for (const item of items) {
      const key = `${item.itemCode}-${item.description.substring(0, 20)}`;
      if (!seenItems.has(key)) {
        seenItems.add(key);
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

async function processAllInvoices() {
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
  let errors = 0;
  
  // Process a sample first to test patterns
  const sampleFiles = files.slice(0, 5);
  
  for (const file of sampleFiles) {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (order.invoiceNumber && availablePdfs.includes(order.invoiceNumber)) {
        console.log(`\n🔍 Processing ${order.invoiceNumber}...`);
        
        // Extract line items
        const extractionResult = await extractLineItemsFromPDF(order.invoiceNumber);
        
        if (extractionResult.success && extractionResult.items.length > 0) {
          const originalItemCount = order.items ? order.items.length : 0;
          
          // Update order with extracted items
          order.items = extractionResult.items;
          order.totalItems = extractionResult.items.length;
          order.itemsExtracted = true;
          order.itemsExtractionDate = new Date().toISOString();
          order.extractedItemsTotal = extractionResult.extractedItemsTotal;
          
          // Verify totals match
          if (extractionResult.total !== null) {
            const totalDifference = Math.abs(extractionResult.extractedItemsTotal - Math.abs(extractionResult.total));
            if (totalDifference > 1.0) { // Allow $1 difference for rounding/tax
              order.itemsTotalMismatch = true;
              order.itemsTotalDifference = totalDifference;
            }
          }
          
          // Save the updated order
          fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
          
          console.log(`  ✅ Added ${extractionResult.items.length} items (was ${originalItemCount})`);
          itemsAdded += extractionResult.items.length;
          updated++;
        } else {
          console.log(`  ⚠️ No line items extracted from ${order.invoiceNumber}`);
        }
      } else {
        console.log(`  ⏭️ Skipped ${order.invoiceNumber || 'unknown'} (no PDF)`);
      }
      
      processed++;
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 LINE ITEMS EXTRACTION SUMMARY (SAMPLE):');
  console.log('='.repeat(60));
  console.log(`📁 Orders processed: ${processed}`);
  console.log(`✅ Orders updated with items: ${updated}`);
  console.log(`📦 Total items added: ${itemsAdded}`);
  console.log(`❌ Errors: ${errors}`);
  
  if (updated > 0) {
    console.log('\n🎉 Line items successfully extracted!');
    console.log('📝 Sample results look good. Run full extraction on all files?');
  } else {
    console.log('\n⚠️ No items were extracted. Need to improve extraction patterns.');
  }
}

processAllInvoices().catch(console.error);