const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔄 FORCING PDF VALUE UPDATE FOR ALL ORDERS\n');

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

// PDF extraction function (copied from main system)
async function extractInvoiceTotalFromPDF(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found: ${invoiceNumber}.pdf`);
      return null;
    }
    
    // Read and parse PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    // Check if this is a credit memo
    const isCreditMemo = /credit/i.test(pdfText) || /2002\d{6}/.test(pdfText);
    
    // Common patterns for invoice totals (ordered by priority - most specific first)
    const patterns = [
      // Final totals after all taxes
      /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /BALANCE\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      // Tax inclusive totals
      /TOTAL\s+INCLUDING\s+TAXES?\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+WITH\s+TAX(?:ES)?\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /GRAND\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      // Final total after GST/PST
      /GST\/HST\s*\$[\d,]+\.?\d*\s*.*?TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/is,
      /PST\/QST\s*\$[\d,]+\.?\d*\s*.*?GST\/HST\s*\$[\d,]+\.?\d*\s*.*?\$?([\d,]+\.?\d*)/is,
      // Subtotals and taxes pattern matching
      /Sub\s+total\s*\$[\d,]+\.?\d*\s*.*?(?:PST|QST|GST|HST).*?\$?([\d,]+\.?\d*)/is,
      // Generic total patterns (lower priority)
      /TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /CREDIT\s+MEMO\s*[:.]?\s*\$?-?([\d,]+\.?\d*)/i,
      // Credit memo patterns
      /\$?([\d,]+\.?\d*)\s*CR/i,
    ];
    
    for (const pattern of patterns) {
      const match = pdfText.match(pattern);
      if (match) {
        let value = match[1].replace(/,/g, ''); // Remove commas
        let numValue = parseFloat(value);
        
        // For credit memos, make the value negative
        if (isCreditMemo && numValue > 0) {
          numValue = -numValue;
        }
        
        console.log(`💰 PDF extracted: ${invoiceNumber} = $${numValue} (${isCreditMemo ? 'Credit' : 'Invoice'})`);
        return numValue;
      }
    }
    
    console.log(`⚠️ No total found in PDF: ${invoiceNumber}`);
    return null;
  } catch (error) {
    console.log(`❌ Error extracting from ${invoiceNumber}: ${error.message}`);
    return null;
  }
}

async function forcePdfUpdate() {
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
  let errors = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (order.invoiceNumber && availablePdfs.includes(order.invoiceNumber)) {
        console.log(`🔍 Processing ${order.invoiceNumber}...`);
        
        // Extract PDF value
        const pdfTotal = await extractInvoiceTotalFromPDF(order.invoiceNumber);
        
        if (pdfTotal !== null && !isNaN(pdfTotal) && isFinite(pdfTotal)) {
          const originalTotal = order.totalValue;
          
          // Update order values
          order.totalValue = pdfTotal;
          order.originalPdfTotal = `$${Math.abs(pdfTotal).toFixed(2)}`;
          order.subtotal = pdfTotal;
          order.totalWithTax = pdfTotal;
          order.invoiceTotalWithTax = pdfTotal;
          order.pdfUpdated = true;
          order.pdfUpdateDate = new Date().toISOString();
          
          // Save the updated order
          fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
          
          if (Math.abs(originalTotal - pdfTotal) > 0.01) {
            console.log(`  ✅ Updated: $${originalTotal.toFixed(2)} → $${pdfTotal.toFixed(2)}`);
          } else {
            console.log(`  ✅ Confirmed: $${pdfTotal.toFixed(2)}`);
          }
          updated++;
        } else {
          console.log(`  ⚠️ Failed to extract PDF value for ${order.invoiceNumber}`);
          errors++;
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
  console.log('📊 PDF UPDATE SUMMARY:');
  console.log('='.repeat(60));
  console.log(`📁 Orders processed: ${processed}`);
  console.log(`✅ Values updated: ${updated}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('\n🎉 PDF value update completed!');
  console.log('🔄 Run verification script to check accuracy improvement');
}

forcePdfUpdate().catch(console.error);