#!/usr/bin/env node

/**
 * Prepare Cut-off Date Inventory Count
 * Allows you to count inventory up to a specific date (last order included)
 * Then only show orders received AFTER that date
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

console.log('');
console.log('📅 PREPARE CUT-OFF DATE INVENTORY COUNT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Show recent orders to help choose cut-off date
    console.log('📋 Recent Orders (Last 20):');
    console.log('-'.repeat(80));

    const recentOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          SUM(line_total) as total_value,
          COUNT(*) as item_count
        FROM invoice_items
        WHERE order_date IS NOT NULL
        GROUP BY invoice_number, order_date
        ORDER BY order_date DESC
        LIMIT 20
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    for (const order of recentOrders) {
      console.log(`${order.order_date} - Invoice ${order.invoice_number} - $${order.total_value.toFixed(2)} (${order.item_count} items)`);
    }

    console.log('');
    console.log('🎯 Cut-off Date Concept:');
    console.log('-'.repeat(80));
    console.log('Choose the date of the LAST order you want INCLUDED in your count.');
    console.log('');
    console.log('Example: If you count on July 31st and the last order you received');
    console.log('         was on July 28th, use 2025-07-28 as your cut-off date.');
    console.log('');
    console.log('The system will then:');
    console.log('  1. Include ALL orders up to and including July 28th');
    console.log('  2. EXCLUDE all orders after July 28th');
    console.log('  3. After you input counts, only show orders received after July 28th');
    console.log('');

    const cutoffDate = await question('Enter cut-off date (YYYY-MM-DD) or invoice number: ');

    if (!cutoffDate) {
      console.log('❌ No date provided');
      rl.close();
      manager.close();
      return;
    }

    let actualCutoffDate;

    // Check if it's an invoice number
    if (/^\d{10}$/.test(cutoffDate)) {
      const invoiceInfo = await new Promise((resolve, reject) => {
        manager.db.get(`
          SELECT order_date, invoice_number
          FROM invoice_items
          WHERE invoice_number = ?
          LIMIT 1
        `, [cutoffDate], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (!invoiceInfo) {
        console.log(`❌ Invoice ${cutoffDate} not found`);
        rl.close();
        manager.close();
        return;
      }

      actualCutoffDate = invoiceInfo.order_date;
      console.log(`✅ Using invoice ${cutoffDate} date: ${actualCutoffDate}`);
    } else {
      actualCutoffDate = cutoffDate;
    }

    console.log('');
    console.log('📊 Analyzing inventory up to cut-off date...');
    console.log('');

    // Get orders included in count (up to and including cut-off)
    const includedOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          SUM(line_total) as total_value
        FROM invoice_items
        WHERE order_date <= ?
        GROUP BY invoice_number, order_date
        ORDER BY order_date DESC
      `, [actualCutoffDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    // Get orders excluded from count (after cut-off)
    const excludedOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          SUM(line_total) as total_value
        FROM invoice_items
        WHERE order_date > ?
        GROUP BY invoice_number, order_date
        ORDER BY order_date ASC
      `, [actualCutoffDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log('📊 Cut-off Date Summary');
    console.log('-'.repeat(80));
    console.log(`Cut-off Date: ${actualCutoffDate}`);
    console.log('');
    console.log(`✅ Orders INCLUDED in count (up to ${actualCutoffDate}): ${includedOrders.length}`);
    console.log(`   Total Value: $${includedOrders.reduce((sum, o) => sum + o.total_value, 0).toFixed(2)}`);
    console.log('');
    console.log(`⏭️  Orders EXCLUDED from count (after ${actualCutoffDate}): ${excludedOrders.length}`);
    console.log(`   Total Value: $${excludedOrders.reduce((sum, o) => sum + o.total_value, 0).toFixed(2)}`);
    console.log('');

    if (excludedOrders.length > 0) {
      console.log('Orders that will NOT be in your count sheet:');
      console.log('-'.repeat(80));
      excludedOrders.slice(0, 10).forEach(o => {
        console.log(`  ${o.order_date} - Invoice ${o.invoice_number} - $${o.total_value.toFixed(2)}`);
      });
      if (excludedOrders.length > 10) {
        console.log(`  ... and ${excludedOrders.length - 10} more`);
      }
      console.log('');
    }

    const confirm = await question(`Proceed with cut-off date ${actualCutoffDate}? (yes/no): `);

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      manager.close();
      return;
    }

    console.log('');
    console.log('🔄 Preparing inventory count...');

    // Mark items up to cut-off date as READY_TO_COUNT
    const markedItems = await new Promise((resolve, reject) => {
      manager.db.run(`
        UPDATE invoice_items
        SET status = 'READY_TO_COUNT'
        WHERE order_date <= ?
          AND status = 'PLACED'
      `, [actualCutoffDate], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    console.log(`✅ Marked ${markedItems} items as READY_TO_COUNT`);
    console.log('');

    // Save cut-off date for reference
    const fs = require('fs');
    const path = require('path');

    const countConfig = {
      cutoffDate: actualCutoffDate,
      preparedAt: new Date().toISOString(),
      includedOrders: includedOrders.length,
      excludedOrders: excludedOrders.length,
      includedValue: includedOrders.reduce((sum, o) => sum + o.total_value, 0),
      excludedValue: excludedOrders.reduce((sum, o) => sum + o.total_value, 0)
    };

    const configDir = path.join(__dirname, 'data', 'inventory_counts');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(configDir, 'current_count_config.json'),
      JSON.stringify(countConfig, null, 2)
    );

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Export count sheet: node export_count_sheet.js');
    console.log(`   (Will include orders up to ${actualCutoffDate})`);
    console.log('');
    console.log('2. Perform physical count');
    console.log('');
    console.log('3. Import counts: node import_inventory_count.js [file]');
    console.log('');
    console.log('4. After count, orders received after this date will be added');
    console.log(`   to your inventory automatically (${excludedOrders.length} orders pending)`);
    console.log('');
    console.log('🎯 Inventory prepared for cut-off date counting!');
    console.log('');

    rl.close();
    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    rl.close();
    manager.close();
    process.exit(1);
  }
}

main();
