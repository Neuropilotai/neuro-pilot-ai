#!/usr/bin/env node

/**
 * Demo Cut-Off Date Counting
 * Shows how cut-off date counting would work for July
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📅 CUT-OFF DATE COUNTING DEMO (July Example)');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Get July orders
    const julyOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT invoice_number, order_date, purchaseOrderNote, SUM(line_total) as total
        FROM invoice_items
        WHERE order_date BETWEEN '2025-07-01' AND '2025-07-31'
        GROUP BY invoice_number, order_date, purchaseOrderNote
        ORDER BY order_date DESC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    // Get orders after July
    const afterJuly = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT invoice_number, order_date, purchaseOrderNote, SUM(line_total) as total
        FROM invoice_items
        WHERE order_date > '2025-07-31'
        GROUP BY invoice_number, order_date, purchaseOrderNote
        ORDER BY order_date ASC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    // Get totals
    const julyTotal = julyOrders.reduce((sum, o) => sum + o.total, 0);
    const afterTotal = afterJuly.reduce((sum, o) => sum + o.total, 0);
    const allTotal = julyTotal + afterTotal;

    console.log('📊 SCENARIO: Counting Inventory as of July 31, 2025');
    console.log('-'.repeat(80));
    console.log('');

    console.log('✅ Orders INCLUDED in July count (Jan - July):');
    console.log('-'.repeat(80));
    console.log('Date       | Invoice     | Note             | Value');
    console.log('-'.repeat(80));

    julyOrders.forEach(o => {
      const note = (o.purchaseOrderNote || '').substring(0, 15).padEnd(15);
      console.log(`${o.order_date} | ${o.invoice_number} | ${note} | $${o.total.toFixed(2)}`);
    });

    console.log('-'.repeat(80));
    console.log(`TOTAL: ${julyOrders.length} orders = $${julyTotal.toFixed(2)}`);
    console.log('');

    console.log('⏭️  Orders EXCLUDED from July count (Aug - Oct):');
    console.log('-'.repeat(80));
    console.log('Date       | Invoice     | Note             | Value');
    console.log('-'.repeat(80));

    afterJuly.slice(0, 10).forEach(o => {
      const note = (o.purchaseOrderNote || '').substring(0, 15).padEnd(15);
      console.log(`${o.order_date} | ${o.invoice_number} | ${note} | $${o.total.toFixed(2)}`);
    });

    if (afterJuly.length > 10) {
      console.log(`... and ${afterJuly.length - 10} more orders`);
    }

    console.log('-'.repeat(80));
    console.log(`TOTAL: ${afterJuly.length} orders = $${afterTotal.toFixed(2)}`);
    console.log('');

    console.log('💡 HOW IT WORKS:');
    console.log('-'.repeat(80));
    console.log('');
    console.log('1. COUNT PREPARATION:');
    console.log(`   - Set cut-off date: July 31, 2025`);
    console.log(`   - Expected value: $${julyTotal.toFixed(2)} (${julyOrders.length} orders)`);
    console.log(`   - Excluded: $${afterTotal.toFixed(2)} (${afterJuly.length} orders)`);
    console.log('');

    console.log('2. YOUR PHYSICAL COUNT:');
    console.log('   - You count what you actually have');
    console.log(`   - Let's say you count: $${(julyTotal * 0.75).toFixed(2)}`);
    console.log(`   - Variance: -$${(julyTotal * 0.25).toFixed(2)} (25% used/consumed)`);
    console.log('');

    console.log('3. AFTER COUNT RECONCILIATION:');
    console.log(`   - Counted inventory: $${(julyTotal * 0.75).toFixed(2)}`);
    console.log(`   - Plus pending orders: $${afterTotal.toFixed(2)}`);
    console.log(`   - Total current inventory: $${(julyTotal * 0.75 + afterTotal).toFixed(2)}`);
    console.log('');

    console.log('4. BENEFITS:');
    console.log('   ✅ Know exactly what you had on July 31');
    console.log('   ✅ Track monthly consumption/usage');
    console.log('   ✅ Proper month-end reporting');
    console.log('   ✅ Orders after July automatically added');
    console.log('');

    console.log('🎯 TO DO THIS FOR REAL:');
    console.log('-'.repeat(80));
    console.log('Run: node prepare_cutoff_inventory.js');
    console.log('Enter: 2025-07-31 (or last July invoice number)');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
