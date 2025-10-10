#!/usr/bin/env node

/**
 * Create Report from Snapshot
 * Start with a snapshot baseline and add/remove specific orders
 * This gives you flexible reporting for any date range
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
console.log('📊 CREATE REPORT FROM SNAPSHOT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Get available snapshots
    const snapshots = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT *
        FROM inventory_snapshots
        ORDER BY snapshot_date DESC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (snapshots.length === 0) {
      console.log('⚠️  No snapshots found');
      console.log('');
      console.log('Create a snapshot first: node create_inventory_snapshot.js');
      console.log('');
      rl.close();
      manager.close();
      return;
    }

    console.log('📸 Available Snapshots:');
    console.log('-'.repeat(80));

    snapshots.forEach((snap, idx) => {
      console.log(`${idx + 1}. ${snap.snapshot_name}`);
      console.log(`   Date: ${snap.snapshot_date} | Cut-off: ${snap.cutoff_date}`);
      console.log(`   Last Invoice: ${snap.last_included_invoice}`);
      console.log(`   Value: $${snap.counted_value.toFixed(2)} | Variance: $${snap.variance_value.toFixed(2)}`);
      console.log('');
    });

    const snapshotChoice = await question('Choose snapshot (1-N): ');
    const snapshotIndex = parseInt(snapshotChoice) - 1;

    if (snapshotIndex < 0 || snapshotIndex >= snapshots.length) {
      console.log('❌ Invalid choice');
      rl.close();
      manager.close();
      return;
    }

    const snapshot = snapshots[snapshotIndex];

    console.log('');
    console.log(`✅ Using snapshot: ${snapshot.snapshot_name}`);
    console.log(`   Baseline Date: ${snapshot.snapshot_date}`);
    console.log(`   Baseline Value: $${snapshot.counted_value.toFixed(2)}`);
    console.log(`   Cut-off: ${snapshot.cutoff_date}`);
    console.log('');

    // Get orders after cut-off
    const ordersAfterCutoff = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          purchaseOrderNote,
          SUM(line_total) as total_value,
          COUNT(*) as item_count
        FROM invoice_items
        WHERE order_date > ?
          AND status != 'LOCKED'
        GROUP BY invoice_number, order_date, purchaseOrderNote
        ORDER BY order_date ASC
      `, [snapshot.cutoff_date], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log(`📦 Orders Received AFTER Baseline (${snapshot.cutoff_date}):`);
    console.log('-'.repeat(80));

    if (ordersAfterCutoff.length === 0) {
      console.log('✅ No orders after baseline');
      console.log('');
      rl.close();
      manager.close();
      return;
    }

    console.log('Date       | Invoice     | Note             | Value      | Include?');
    console.log('-'.repeat(80));

    const selectedOrders = [];

    for (const order of ordersAfterCutoff) {
      const note = (order.purchaseOrderNote || '').substring(0, 15).padEnd(15);
      console.log(`${order.order_date} | ${order.invoice_number} | ${note} | $${order.total_value.toFixed(2)}`);

      const include = await question('  Include in report? (y/n/q=quit): ');

      if (include.toLowerCase() === 'q') {
        break;
      }

      if (include.toLowerCase() === 'y' || include.toLowerCase() === 'yes') {
        selectedOrders.push(order);
        console.log('  ✅ Included');
      } else {
        console.log('  ⏭️  Skipped');
      }
    }

    console.log('');
    console.log('📊 REPORT SUMMARY');
    console.log('='.repeat(80));
    console.log('');

    const baselineValue = snapshot.counted_value;
    const addedValue = selectedOrders.reduce((sum, o) => sum + o.total_value, 0);
    const totalValue = baselineValue + addedValue;

    console.log(`📸 Baseline: ${snapshot.snapshot_name}`);
    console.log(`   Date: ${snapshot.snapshot_date}`);
    console.log(`   Value: $${baselineValue.toFixed(2)}`);
    console.log('');

    if (selectedOrders.length > 0) {
      console.log(`📦 Added Orders (${selectedOrders.length}):`);
      console.log('-'.repeat(80));

      for (const order of selectedOrders) {
        const note = order.purchaseOrderNote ? ` (${order.purchaseOrderNote})` : '';
        console.log(`   ${order.order_date} - ${order.invoice_number}${note}: $${order.total_value.toFixed(2)}`);
      }

      console.log('-'.repeat(80));
      console.log(`   Total Added: $${addedValue.toFixed(2)}`);
      console.log('');
    }

    console.log('📊 FINAL INVENTORY VALUE');
    console.log('-'.repeat(80));
    console.log(`Baseline (counted):  $${baselineValue.toFixed(2)}`);
    console.log(`Added orders:        $${addedValue.toFixed(2)}`);
    console.log('─'.repeat(80));
    console.log(`TOTAL:               $${totalValue.toFixed(2)}`);
    console.log('');

    console.log('💡 This report shows:');
    console.log(`   • Your ${snapshot.snapshot_name} count: $${baselineValue.toFixed(2)}`);
    console.log(`   • Plus ${selectedOrders.length} orders received after: $${addedValue.toFixed(2)}`);
    console.log(`   • Current inventory total: $${totalValue.toFixed(2)}`);
    console.log('');

    const saveReport = await question('Save this report configuration? (yes/no): ');

    if (saveReport.toLowerCase() === 'yes' || saveReport.toLowerCase() === 'y') {
      const reportName = await question('Report name: ');

      // Save report configuration
      await new Promise((resolve, reject) => {
        manager.db.run(`
          CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_name TEXT NOT NULL,
            snapshot_id INTEGER NOT NULL,
            included_invoices TEXT,
            total_value REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const invoiceList = selectedOrders.map(o => o.invoice_number).join(',');

      await new Promise((resolve, reject) => {
        manager.db.run(`
          INSERT INTO saved_reports
          (report_name, snapshot_id, included_invoices, total_value)
          VALUES (?, ?, ?, ?)
        `, [reportName, snapshot.id, invoiceList, totalValue], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      console.log('');
      console.log(`✅ Report saved: ${reportName}`);
      console.log('');
    }

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
