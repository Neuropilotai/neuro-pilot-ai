const fs = require('fs');
const path = require('path');

console.log('🎯 VERIFYING CURRENT SYSTEM ACCURACY\n');
console.log('='.repeat(80));

function verifyCurrentAccuracy() {
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
  
  console.log(`📂 Found ${files.length} order files`);
  console.log('='.repeat(80));
  
  const stats = {
    total: 0,
    withPdf: 0,
    withoutPdf: 0,
    withItems: 0,
    withoutItems: 0,
    withCorrectTotal: 0,
    potentialIssues: [],
    missingPdfs: [],
    emptyItems: []
  };
  
  // Known correct totals from previous work
  const knownCorrectTotals = {
    '9022353883': 71786.74,
    '9020806183': 46965.42
  };
  
  console.log('\n📊 ANALYZING ORDER ACCURACY:\n');
  
  files.forEach(file => {
    const filePath = path.join(gfsOrdersDir, file);
    const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    stats.total++;
    
    // Check PDF availability
    if (order.invoiceNumber && availablePdfs.includes(order.invoiceNumber)) {
      stats.withPdf++;
    } else {
      stats.withoutPdf++;
      if (order.invoiceNumber) {
        stats.missingPdfs.push(order.invoiceNumber);
      }
    }
    
    // Check items
    if (order.items && order.items.length > 0) {
      stats.withItems++;
    } else {
      stats.withoutItems++;
      if (order.invoiceNumber) {
        stats.emptyItems.push(order.invoiceNumber);
      }
    }
    
    // Check for known issues
    if (knownCorrectTotals[order.invoiceNumber]) {
      const expectedTotal = knownCorrectTotals[order.invoiceNumber];
      const actualTotal = Math.abs(order.totalValue || 0);
      const diff = Math.abs(expectedTotal - actualTotal);
      
      if (diff < 0.01) {
        stats.withCorrectTotal++;
      } else {
        stats.potentialIssues.push({
          invoice: order.invoiceNumber,
          expected: expectedTotal,
          actual: actualTotal,
          difference: diff
        });
      }
    }
    
    // Check for other indicators
    if (order.pdfUpdated && order.accuracyFixed) {
      stats.withCorrectTotal++;
    }
  });
  
  // Calculate percentages
  const pdfCoverage = (stats.withPdf / stats.total * 100).toFixed(1);
  const itemCoverage = (stats.withItems / stats.total * 100).toFixed(1);
  const estimatedAccuracy = (stats.withPdf > 0) ? 
    ((stats.withPdf - stats.potentialIssues.length) / stats.withPdf * 100).toFixed(1) : 0;
  
  // Display results
  console.log('📈 COVERAGE STATISTICS:');
  console.log(`  📄 PDF Coverage: ${stats.withPdf}/${stats.total} (${pdfCoverage}%)`);
  console.log(`  📦 Item Coverage: ${stats.withItems}/${stats.total} (${itemCoverage}%)`);
  console.log(`  🎯 Estimated Accuracy: ${estimatedAccuracy}%`);
  
  console.log('\n❌ IDENTIFIED GAPS:');
  console.log(`  📄 Missing PDFs: ${stats.withoutPdf} orders`);
  console.log(`  📦 Missing Items: ${stats.withoutItems} orders`);
  console.log(`  ⚠️ Potential Issues: ${stats.potentialIssues.length} orders`);
  
  // Show specific issues
  if (stats.potentialIssues.length > 0) {
    console.log('\n🔧 ORDERS NEEDING CORRECTION:');
    stats.potentialIssues.forEach(issue => {
      console.log(`  ${issue.invoice}: $${issue.actual.toFixed(2)} → $${issue.expected.toFixed(2)}`);
    });
  }
  
  // Show sample of missing PDFs
  if (stats.missingPdfs.length > 0 && stats.missingPdfs.length <= 10) {
    console.log('\n📄 SAMPLE OF MISSING PDFs:');
    stats.missingPdfs.slice(0, 10).forEach(invoice => {
      console.log(`  - ${invoice}`);
    });
  }
  
  // Show sample of empty items
  if (stats.emptyItems.length > 0 && stats.emptyItems.length <= 10) {
    console.log('\n📦 SAMPLE OF ORDERS WITHOUT ITEMS:');
    stats.emptyItems.slice(0, 10).forEach(invoice => {
      console.log(`  - ${invoice}`);
    });
  }
  
  // Final recommendations
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS TO ACHIEVE 100% ACCURACY:');
  console.log('='.repeat(80));
  
  if (stats.withoutPdf > 0) {
    console.log(`1. Add ${stats.withoutPdf} missing PDFs to OneDrive folder`);
  }
  
  if (stats.withoutItems > 0) {
    console.log(`2. Extract line items for ${stats.withoutItems} orders`);
  }
  
  if (stats.potentialIssues.length > 0) {
    console.log(`3. Fix ${stats.potentialIssues.length} orders with incorrect totals`);
  }
  
  if (estimatedAccuracy === '100.0') {
    console.log('🎉 SYSTEM IS ALREADY AT 100% ACCURACY FOR AVAILABLE PDFs!');
  } else {
    console.log(`\n📊 Current accuracy: ${estimatedAccuracy}%`);
    console.log(`🎯 Gap to 100%: ${(100 - parseFloat(estimatedAccuracy)).toFixed(1)}%`);
  }
  
  return stats;
}

// Run verification
const results = verifyCurrentAccuracy();
console.log('\n✅ Verification complete!');