#!/usr/bin/env node

/**
 * Show Locked Orders
 * Display all currently locked orders
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('🔒 LOCKED ORDERS REPORT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    const lockedOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          purchaseOrderNote,
          locked_at,
          locked_by,
          lock_reason,
          COUNT(*) as item_count,
          SUM(line_total) as total_value
        FROM invoice_items
        WHERE status = 'LOCKED'
        GROUP BY invoice_number, order_date, purchaseOrderNote, locked_at, locked_by, lock_reason
        ORDER BY order_date ASC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (lockedOrders.length === 0) {
      console.log('✅ No locked orders');
      console.log('');
      console.log('All orders are currently active and available.');
      console.log('');
      manager.close();
      return;
    }

    console.log(`Found ${lockedOrders.length} locked orders`);
    console.log('');
    console.log('Date       | Invoice     | Note         | Locked     | By     | Value');
    console.log('-'.repeat(80));

    let totalValue = 0;
    let totalItems = 0;

    for (const order of lockedOrders) {
      const note = (order.purchaseOrderNote || '').substring(0, 11).padEnd(11);
      const lockedDate = order.locked_at ? order.locked_at.split('T')[0] : 'Unknown   ';
      const lockedBy = (order.locked_by || 'Unknown').substring(0, 6).padEnd(6);

      console.log(`${order.order_date} | ${order.invoice_number} | ${note} | ${lockedDate} | ${lockedBy} | $${order.total_value.toFixed(2)}`);

      totalValue += order.total_value;
      totalItems += order.item_count;
    }

    console.log('-'.repeat(80));
    console.log(`TOTAL: ${lockedOrders.length} orders | ${totalItems} items | $${totalValue.toFixed(2)}`);
    console.log('');

    console.log('📊 Lock Reasons:');
    console.log('-'.repeat(80));

    const reasons = {};
    for (const order of lockedOrders) {
      const reason = order.lock_reason || 'Unknown';
      if (!reasons[reason]) {
        reasons[reason] = { count: 0, value: 0 };
      }
      reasons[reason].count++;
      reasons[reason].value += order.total_value;
    }

    for (const [reason, data] of Object.entries(reasons)) {
      console.log(`${reason}: ${data.count} orders, $${data.value.toFixed(2)}`);
    }

    console.log('');
    console.log('🔓 To unlock orders:');
    console.log('-'.repeat(80));
    console.log('Run: node unlock_orders.js');
    console.log('(Requires authorization)');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
