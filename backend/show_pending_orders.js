#!/usr/bin/env node

/**
 * Show Pending Orders
 * Display orders that were received AFTER the count cut-off date
 * These will be added to inventory after the count is complete
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📦 PENDING ORDERS (After Count Cut-off)');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Load cut-off config
    const configPath = path.join(__dirname, 'data', 'inventory_counts', 'current_count_config.json');

    if (!fs.existsSync(configPath)) {
      console.log('⚠️  No cut-off date configured');
      console.log('');
      console.log('Run: node prepare_cutoff_inventory.js to set up a cut-off date');
      console.log('');
      manager.close();
      return;
    }

    const cutoffConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    console.log(`📅 Count Cut-off Date: ${cutoffConfig.cutoffDate}`);
    console.log(`   Orders included in count: ${cutoffConfig.includedOrders} ($${cutoffConfig.includedValue.toFixed(2)})`);
    console.log('');

    // Get pending orders (after cut-off)
    const pendingOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          purchaseOrderNote,
          SUM(line_total) as total_value,
          COUNT(*) as item_count
        FROM invoice_items
        WHERE order_date > ?
        GROUP BY invoice_number, order_date, purchaseOrderNote
        ORDER BY order_date ASC
      `, [cutoffConfig.cutoffDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (pendingOrders.length === 0) {
      console.log('✅ No pending orders - all orders are included in count');
      console.log('');
      manager.close();
      return;
    }

    console.log(`📦 Orders Received AFTER ${cutoffConfig.cutoffDate}:`);
    console.log('-'.repeat(80));
    console.log('Date       | Invoice     | Note/Context        | Items | Value');
    console.log('-'.repeat(80));

    let totalValue = 0;
    let totalItems = 0;

    for (const order of pendingOrders) {
      const note = order.purchaseOrderNote || '';
      const noteStr = note.substring(0, 18).padEnd(18);
      console.log(`${order.order_date} | ${order.invoice_number} | ${noteStr} | ${String(order.item_count).padStart(5)} | $${order.total_value.toFixed(2)}`);
      totalValue += order.total_value;
      totalItems += order.item_count;
    }

    console.log('-'.repeat(80));
    console.log(`TOTAL: ${pendingOrders.length} orders | ${totalItems} items | $${totalValue.toFixed(2)}`);
    console.log('');

    console.log('📊 What This Means:');
    console.log('-'.repeat(80));
    console.log('These orders were received AFTER your count cut-off date.');
    console.log('They are NOT included in your count sheet.');
    console.log('');
    console.log('After you complete your count and input the data:');
    console.log('  1. Your counted inventory = actual physical count');
    console.log(`  2. These ${pendingOrders.length} orders will be ADDED to your inventory`);
    console.log(`  3. Your new inventory = counted + $${totalValue.toFixed(2)} from pending orders`);
    console.log('');

    // Show summary by category
    const byCategory = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          im.category_id,
          SUM(ii.line_total) as total_value,
          COUNT(DISTINCT ii.item_code) as unique_items
        FROM invoice_items ii
        LEFT JOIN item_master im ON ii.item_code = im.item_code
        WHERE ii.order_date > ?
        GROUP BY im.category_id
        ORDER BY total_value DESC
      `, [cutoffConfig.cutoffDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (byCategory.length > 0) {
      console.log('📊 Pending Orders by Category:');
      console.log('-'.repeat(80));
      console.log('Category     | Unique Items | Value');
      console.log('-'.repeat(80));

      for (const cat of byCategory) {
        const catName = (cat.category_id || 'UNCATEGORIZED').padEnd(12);
        const items = String(cat.unique_items).padStart(12);
        console.log(`${catName} | ${items} | $${cat.total_value.toFixed(2)}`);
      }
      console.log('');
    }

    console.log('💡 TIP: After your count, run this script again to verify');
    console.log('   these orders were properly added to your inventory.');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
