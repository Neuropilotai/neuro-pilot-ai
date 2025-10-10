#!/usr/bin/env node

/**
 * Lock Orders After Cut-Off
 * Locks all orders received after the count cut-off date
 * They won't appear in reports until unlocked by authorized user
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('🔒 LOCK ORDERS AFTER CUT-OFF DATE');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Check if cut-off date is configured
    const configPath = path.join(__dirname, 'data', 'inventory_counts', 'current_count_config.json');

    if (!fs.existsSync(configPath)) {
      console.log('⚠️  No cut-off date configured');
      console.log('');
      console.log('Run: node prepare_cutoff_inventory.js first');
      console.log('');
      manager.close();
      return;
    }

    const cutoffConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const cutoffDate = cutoffConfig.cutoffDate;

    console.log(`📅 Cut-off Date: ${cutoffDate}`);
    console.log('');

    // Get orders after cut-off
    const ordersToLock = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT invoice_number, order_date, COUNT(*) as item_count, SUM(line_total) as total_value
        FROM invoice_items
        WHERE order_date > ?
          AND status != 'LOCKED'
        GROUP BY invoice_number, order_date
        ORDER BY order_date ASC
      `, [cutoffDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (ordersToLock.length === 0) {
      console.log('✅ No orders to lock (all orders before cut-off or already locked)');
      console.log('');
      manager.close();
      return;
    }

    console.log(`🔒 Orders to be LOCKED (received after ${cutoffDate}):`);
    console.log('-'.repeat(80));
    console.log('Date       | Invoice     | Items | Value');
    console.log('-'.repeat(80));

    let totalValue = 0;
    let totalItems = 0;

    for (const order of ordersToLock) {
      console.log(`${order.order_date} | ${order.invoice_number} | ${String(order.item_count).padStart(5)} | $${order.total_value.toFixed(2)}`);
      totalValue += order.total_value;
      totalItems += order.item_count;
    }

    console.log('-'.repeat(80));
    console.log(`TOTAL: ${ordersToLock.length} orders | ${totalItems} items | $${totalValue.toFixed(2)}`);
    console.log('');

    console.log('⚠️  IMPORTANT:');
    console.log('-'.repeat(80));
    console.log('Once locked, these orders will:');
    console.log('  ❌ NOT appear in inventory reports');
    console.log('  ❌ NOT be included in count sheets');
    console.log('  ❌ NOT affect inventory totals');
    console.log('  ✅ Can be unlocked later by authorized user');
    console.log('');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise((resolve) => {
      rl.question('Lock these orders? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });

    if (confirm !== 'yes' && confirm !== 'y') {
      console.log('❌ Cancelled');
      manager.close();
      return;
    }

    console.log('');
    console.log('🔒 Locking orders...');

    // Lock the orders
    const locked = await new Promise((resolve, reject) => {
      manager.db.run(`
        UPDATE invoice_items
        SET status = 'LOCKED',
            locked_at = datetime('now'),
            locked_by = 'SYSTEM',
            lock_reason = ?
        WHERE order_date > ?
          AND status != 'LOCKED'
      `, [`Count cut-off: ${cutoffDate}`, cutoffDate], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    // Save lock info
    cutoffConfig.lockedAt = new Date().toISOString();
    cutoffConfig.lockedOrders = ordersToLock.length;
    cutoffConfig.lockedValue = totalValue;
    cutoffConfig.lockedBy = 'SYSTEM';

    fs.writeFileSync(configPath, JSON.stringify(cutoffConfig, null, 2));

    console.log(`✅ Locked ${locked} items from ${ordersToLock.length} orders`);
    console.log('');

    console.log('📊 Summary:');
    console.log('-'.repeat(80));
    console.log(`Locked Orders: ${ordersToLock.length}`);
    console.log(`Locked Items: ${totalItems}`);
    console.log(`Locked Value: $${totalValue.toFixed(2)}`);
    console.log(`Lock Date: ${new Date().toISOString().split('T')[0]}`);
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Export count sheet: node export_count_sheet.js');
    console.log('   (Will NOT include locked orders)');
    console.log('');
    console.log('2. Perform physical count');
    console.log('');
    console.log('3. After count, unlock orders if needed:');
    console.log('   node unlock_orders.js');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
