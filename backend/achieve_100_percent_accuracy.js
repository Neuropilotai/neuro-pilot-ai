const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🎯 ACHIEVING 100% ACCURACY FOR INVENTORY SYSTEM\n');
console.log('='.repeat(80));

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

// Enhanced PDF extraction with multiple fallback patterns
async function extractInvoiceTotalFromPDF(invoiceNumber) {
  try {
    const invoicesPath = getDataPath('invoices');
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      return { success: false, total: null, reason: 'PDF not found' };
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    // Check if this is a credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);
    
    // Comprehensive patterns for invoice totals (ordered by priority)
    const patterns = [
      // Most specific patterns first
      /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /Invoice\s+Total\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      
      // After tax calculations
      /GST\/HST\s*\$?[\d,]+\.?\d*\s*(?:\n|\r|\s)*(?:.*?\n)*?\s*(?:INVOICE\s+)?TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/is,
      /PST\/QST\s*\$?[\d,]+\.?\d*\s*(?:\n|\r|\s)*GST\/HST\s*\$?[\d,]+\.?\d*\s*(?:\n|\r|\s)*(?:.*?\n)*?\s*\$?([\d,]+\.?\d*)/is,
      
      // Total amount patterns
      /TOTAL\s+AMOUNT\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /BALANCE\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      
      // Grand total patterns
      /GRAND\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /NET\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      
      // Credit memo specific
      /CREDIT\s+MEMO\s*[:.]?\s*\$?-?([\d,]+\.?\d*)/i,
      /CREDIT\s+AMOUNT\s*[:.]?\s*\$?-?([\d,]+\.?\d*)/i,
      
      // Generic total (last resort)
      /TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i
    ];
    
    let extractedTotal = null;
    let matchedPattern = null;
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const matches = pdfText.match(pattern);
      
      if (matches) {
        // Get all matches and use the last one (usually the final total)
        const value = matches[matches.length - 1].replace(/,/g, '');
        let numValue = parseFloat(value);
        
        // For credit memos, ensure negative value
        if (isCreditMemo && numValue > 0) {
          numValue = -numValue;
        }
        
        extractedTotal = numValue;
        matchedPattern = i + 1;
        break;
      }
    }
    
    return {
      success: extractedTotal !== null,
      total: extractedTotal,
      isCreditMemo: isCreditMemo,
      patternUsed: matchedPattern,
      reason: extractedTotal === null ? 'No pattern matched' : 'Success'
    };
    
  } catch (error) {
    return {
      success: false,
      total: null,
      reason: `Error: ${error.message}`
    };
  }
}

// Analyze and fix all accuracy issues
async function achieveFullAccuracy() {
  const gfsOrdersDir = getDataPath('gfs_orders');
  const invoicesDir = getDataPath('invoices');
  
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
  
  console.log(`📂 Found ${files.length} order files`);
  console.log('='.repeat(80));
  
  const results = {
    total: 0,
    withPdf: 0,
    withoutPdf: 0,
    exactMatch: 0,
    mismatch: 0,
    fixed: 0,
    errors: 0,
    mismatches: [],
    noPdfOrders: []
  };
  
  console.log('\n🔍 ANALYZING ALL ORDERS FOR ACCURACY:\n');
  
  for (const file of files) {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      results.total++;
      
      if (!order.invoiceNumber) {
        results.errors++;
        console.log(`⚠️ No invoice number in ${file}`);
        continue;
      }
      
      // Check if PDF exists
      if (!availablePdfs.includes(order.invoiceNumber)) {
        results.withoutPdf++;
        results.noPdfOrders.push(order.invoiceNumber);
        continue;
      }
      
      results.withPdf++;
      
      // Extract PDF value
      const extraction = await extractInvoiceTotalFromPDF(order.invoiceNumber);
      
      if (!extraction.success) {
        console.log(`❌ Failed to extract ${order.invoiceNumber}: ${extraction.reason}`);
        results.errors++;
        continue;
      }
      
      const pdfTotal = Math.abs(extraction.total);
      const orderTotal = Math.abs(order.totalValue || 0);
      const difference = Math.abs(pdfTotal - orderTotal);
      
      // Check if values match (within 1 cent tolerance)
      if (difference < 0.01) {
        results.exactMatch++;
      } else {
        results.mismatch++;
        results.mismatches.push({
          invoice: order.invoiceNumber,
          orderTotal: orderTotal,
          pdfTotal: pdfTotal,
          difference: difference,
          percentDiff: (difference / pdfTotal * 100).toFixed(2)
        });
        
        // Fix the mismatch
        console.log(`🔧 Fixing ${order.invoiceNumber}: $${orderTotal.toFixed(2)} → $${pdfTotal.toFixed(2)}`);
        
        order.totalValue = extraction.total;
        order.originalPdfTotal = `$${pdfTotal.toFixed(2)}`;
        order.subtotal = extraction.total;
        order.totalWithTax = extraction.total;
        order.invoiceTotalWithTax = extraction.total;
        order.accuracyFixed = true;
        order.accuracyFixDate = new Date().toISOString();
        order.previousTotal = orderTotal;
        
        // Update credit memo status if needed
        if (extraction.isCreditMemo && order.type !== 'credit') {
          order.type = 'credit';
          order.creditMemoDetected = true;
        }
        
        // Save the corrected order
        fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
        results.fixed++;
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${file}: ${error.message}`);
      results.errors++;
    }
  }
  
  // Display comprehensive results
  console.log('\n' + '='.repeat(80));
  console.log('📊 ACCURACY ANALYSIS COMPLETE:');
  console.log('='.repeat(80));
  
  console.log('\n📈 OVERALL STATISTICS:');
  console.log(`  📁 Total orders: ${results.total}`);
  console.log(`  📄 Orders with PDFs: ${results.withPdf} (${(results.withPdf/results.total*100).toFixed(1)}%)`);
  console.log(`  ❌ Orders without PDFs: ${results.withoutPdf} (${(results.withoutPdf/results.total*100).toFixed(1)}%)`);
  
  console.log('\n✅ ACCURACY METRICS:');
  const accuracyRate = results.withPdf > 0 ? (results.exactMatch / results.withPdf * 100) : 0;
  console.log(`  🎯 Exact matches: ${results.exactMatch}/${results.withPdf} (${accuracyRate.toFixed(1)}%)`);
  console.log(`  🔧 Fixed mismatches: ${results.fixed}`);
  console.log(`  ❌ Errors: ${results.errors}`);
  
  const newAccuracy = results.withPdf > 0 ? ((results.exactMatch + results.fixed) / results.withPdf * 100) : 0;
  console.log(`\n🏆 NEW ACCURACY: ${newAccuracy.toFixed(1)}%`);
  
  // Show top mismatches that were fixed
  if (results.mismatches.length > 0) {
    console.log('\n🔧 FIXED MISMATCHES (Top 10):');
    console.log('─'.repeat(80));
    results.mismatches
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 10)
      .forEach(m => {
        console.log(`  ${m.invoice}: $${m.orderTotal.toFixed(2)} → $${m.pdfTotal.toFixed(2)} (${m.percentDiff}% diff)`);
      });
  }
  
  // Show orders without PDFs
  if (results.noPdfOrders.length > 0 && results.noPdfOrders.length <= 20) {
    console.log('\n📄 ORDERS MISSING PDFs:');
    console.log('─'.repeat(80));
    results.noPdfOrders.forEach(invoice => {
      console.log(`  - ${invoice}`);
    });
    console.log('\n💡 Add these PDFs to OneDrive folder to achieve 100% coverage');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(80));
  if (newAccuracy === 100) {
    console.log('🎉 PERFECT 100% ACCURACY ACHIEVED!');
  } else if (newAccuracy >= 99) {
    console.log('🎊 NEAR-PERFECT ACCURACY ACHIEVED!');
  } else {
    console.log(`📈 ACCURACY IMPROVED TO ${newAccuracy.toFixed(1)}%`);
    console.log(`📝 Add ${results.withoutPdf} missing PDFs to reach 100% coverage`);
  }
  console.log('='.repeat(80));
  
  return results;
}

// Run the accuracy improvement
achieveFullAccuracy().catch(console.error);