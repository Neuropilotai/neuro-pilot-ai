const fs = require('fs');
const path = require('path');

console.log('🔍 IDENTIFYING MISSING ORDERS');
console.log('='.repeat(80));

// Get all order files
const ordersDir = './data/gfs_orders';
const allFiles = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));

console.log(`Total order files: ${allFiles.length}`);

// Track processed and skipped orders
const processedOrders = [];
const skippedOrders = [];
const emptyOrders = [];
const corruptedOrders = [];

// Check each order file
for (const file of allFiles) {
  try {
    const filePath = path.join(ordersDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    if (!content || content.trim() === '') {
      emptyOrders.push(file);
      continue;
    }

    const order = JSON.parse(content);

    // Check why orders might be skipped
    const issues = [];

    if (!order.orderDate) issues.push('Missing order date');
    if (!order.invoiceTotal && order.invoiceTotal !== 0) issues.push('Missing invoice total');
    if (!order.items || !Array.isArray(order.items)) issues.push('Missing or invalid items array');
    if (order.items && order.items.length === 0) issues.push('Empty items array');
    if (!order.invoiceNumber) issues.push('Missing invoice number');

    if (issues.length > 0) {
      skippedOrders.push({
        file,
        issues,
        hasItems: order.items ? order.items.length : 0,
        total: order.invoiceTotal || 0
      });
    } else {
      processedOrders.push({
        file,
        invoiceNumber: order.invoiceNumber,
        date: order.orderDate,
        total: order.invoiceTotal,
        itemCount: order.items.length
      });
    }
  } catch (error) {
    corruptedOrders.push({
      file,
      error: error.message
    });
  }
}

console.log('\n📊 PROCESSING SUMMARY:');
console.log(`  ✅ Successfully processed: ${processedOrders.length} orders`);
console.log(`  ❌ Skipped orders: ${skippedOrders.length}`);
console.log(`  📄 Empty files: ${emptyOrders.length}`);
console.log(`  💔 Corrupted files: ${corruptedOrders.length}`);
console.log(`  Total files: ${allFiles.length}`);

if (skippedOrders.length > 0) {
  console.log('\n❌ SKIPPED ORDERS (Missing required fields):');
  skippedOrders.forEach((order, i) => {
    console.log(`\n${i + 1}. ${order.file}`);
    console.log(`   Issues: ${order.issues.join(', ')}`);
    console.log(`   Has ${order.hasItems} items, Total: $${order.total}`);
  });
}

if (emptyOrders.length > 0) {
  console.log('\n📄 EMPTY ORDER FILES:');
  emptyOrders.forEach(file => {
    console.log(`  - ${file}`);
  });
}

if (corruptedOrders.length > 0) {
  console.log('\n💔 CORRUPTED ORDER FILES:');
  corruptedOrders.forEach(order => {
    console.log(`  - ${order.file}: ${order.error}`);
  });
}

// Check which orders are in reconciled but not in original processing
const reconciledDir = './data/reconciled/orders';
if (fs.existsSync(reconciledDir)) {
  const reconciledFiles = fs.readdirSync(reconciledDir).filter(f => f.endsWith('.json'));
  console.log(`\n📦 RECONCILED ORDERS: ${reconciledFiles.length} files`);

  // Find orders that were fixed in reconciliation
  const fixedInReconciliation = skippedOrders.filter(skip =>
    reconciledFiles.some(recon => recon.includes(skip.file.replace('.json', '')))
  );

  if (fixedInReconciliation.length > 0) {
    console.log('\n✨ Orders that were FIXED during reconciliation:');
    fixedInReconciliation.forEach(order => {
      console.log(`  - ${order.file}`);
    });
  }
}

console.log('\n💡 RECOMMENDATION:');
console.log('  To achieve 100% order processing for an enterprise system:');
console.log('  1. Fix missing order dates in skipped orders');
console.log('  2. Add missing invoice totals');
console.log('  3. Ensure all orders have valid items arrays');
console.log('  4. Re-run reconciliation to include ALL 84 orders');

console.log('\n' + '='.repeat(80));