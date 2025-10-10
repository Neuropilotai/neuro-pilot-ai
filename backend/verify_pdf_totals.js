const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFYING PDF TOTALS VS SYSTEM TOTALS\n');

async function verifyTotals() {
  const gfsOrdersDir = './data/gfs_orders';
  
  // Get all valid order files
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));
  
  console.log(`📋 Found ${files.length} order files to verify\n`);
  
  let totalSystemValue = 0;
  let totalPDFValue = 0;
  let orderCount = 0;
  let matchCount = 0;
  let mismatchCount = 0;
  const mismatches = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (!order.invoiceNumber) continue;
      
      const systemValue = parseFloat(order.totalValue || 0);
      const pdfValue = parseFloat(order.originalPdfTotal?.replace(/[$,]/g, '') || 0);
      
      orderCount++;
      totalSystemValue += systemValue;
      totalPDFValue += pdfValue;
      
      const difference = Math.abs(systemValue - pdfValue);
      const percentDiff = systemValue > 0 ? (difference / systemValue) * 100 : 0;
      
      if (difference < 0.01) {
        matchCount++;
        console.log(`✅ ${order.invoiceNumber}: $${systemValue.toFixed(2)} (MATCH)`);
      } else {
        mismatchCount++;
        const mismatch = {
          invoice: order.invoiceNumber,
          systemValue,
          pdfValue,
          difference,
          percentDiff: Math.round(percentDiff * 100) / 100
        };
        mismatches.push(mismatch);
        console.log(`❌ ${order.invoiceNumber}: System=$${systemValue.toFixed(2)} PDF=$${pdfValue.toFixed(2)} Diff=$${difference.toFixed(2)} (${percentDiff.toFixed(1)}%)`);
      }
      
    } catch (error) {
      console.log(`⚠️ Error processing ${file}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TOTAL VALUES VERIFICATION');
  console.log('='.repeat(80));
  console.log(`📋 Orders processed: ${orderCount}`);
  console.log(`✅ Exact matches: ${matchCount} (${Math.round((matchCount/orderCount)*100)}%)`);
  console.log(`❌ Mismatches: ${mismatchCount} (${Math.round((mismatchCount/orderCount)*100)}%)`);
  console.log(`💰 Total System Value: $${totalSystemValue.toFixed(2)}`);
  console.log(`📄 Total PDF Value: $${totalPDFValue.toFixed(2)}`);
  console.log(`🔍 Total Difference: $${Math.abs(totalSystemValue - totalPDFValue).toFixed(2)}`);
  
  if (mismatches.length > 0) {
    console.log('\n🔍 TOP MISMATCHES:');
    mismatches
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 5)
      .forEach((m, i) => {
        console.log(`${i+1}. ${m.invoice}: $${m.difference.toFixed(2)} difference (${m.percentDiff}%)`);
      });
  }
  
  // Check item counts
  console.log('\n' + '='.repeat(80));
  console.log('📦 ITEM COUNTS VERIFICATION');
  console.log('='.repeat(80));
  
  let totalItems = 0;
  let ordersWithItems = 0;
  let ordersWithoutItems = 0;
  
  for (const file of files.slice(0, 10)) { // Check first 10 orders
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      const itemCount = order.items ? order.items.length : 0;
      totalItems += itemCount;
      
      if (itemCount > 0) {
        ordersWithItems++;
        console.log(`📦 ${order.invoiceNumber}: ${itemCount} items`);
      } else {
        ordersWithoutItems++;
        console.log(`📦 ${order.invoiceNumber}: NO ITEMS (${order.totalItems || 0} claimed)`);
      }
      
    } catch (error) {
      console.log(`⚠️ Error checking items in ${file}`);
    }
  }
  
  console.log(`\n📊 Item Summary (first 10 orders):`);
  console.log(`   Orders with items: ${ordersWithItems}`);
  console.log(`   Orders without items: ${ordersWithoutItems}`);
  console.log(`   Total items found: ${totalItems}`);
  
  // Overall accuracy assessment
  const accuracyRate = (matchCount / orderCount) * 100;
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ACCURACY ASSESSMENT');
  console.log('='.repeat(80));
  
  if (accuracyRate >= 95) {
    console.log('🟢 EXCELLENT: System values match PDF values with 95%+ accuracy');
  } else if (accuracyRate >= 85) {
    console.log('🟡 GOOD: System values match PDF values with 85%+ accuracy');
  } else if (accuracyRate >= 70) {
    console.log('🟠 FAIR: System values match PDF values with 70%+ accuracy');
  } else {
    console.log('🔴 POOR: System values do not match PDF values consistently');
  }
  
  console.log(`📈 Overall accuracy rate: ${accuracyRate.toFixed(1)}%`);
}

verifyTotals().catch(console.error);