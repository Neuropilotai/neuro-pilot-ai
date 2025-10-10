#!/usr/bin/env node

/**
 * Create Inventory Snapshot
 * After completing an inventory count, create a snapshot/baseline
 * Future reports can reference this snapshot and add/remove orders
 */

const fs = require('fs');
const path = require('path');
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
console.log('📸 CREATE INVENTORY SNAPSHOT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Create snapshots table if it doesn't exist
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_name TEXT NOT NULL,
          snapshot_date TEXT NOT NULL,
          cutoff_date TEXT NOT NULL,
          last_included_invoice TEXT,
          counted_value REAL,
          expected_value REAL,
          variance_value REAL,
          total_items_counted INTEGER,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Create snapshot_items table to store item counts
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_id INTEGER NOT NULL,
          item_code TEXT NOT NULL,
          description TEXT,
          category_id TEXT,
          counted_quantity REAL,
          counted_value REAL,
          expected_quantity REAL,
          expected_value REAL,
          variance_quantity REAL,
          variance_value REAL,
          FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(id)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('📋 Recent Inventory Counts:');
    console.log('-'.repeat(80));

    // Get recent counts
    const recentCounts = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          count_date,
          COUNT(DISTINCT item_code) as items_counted,
          SUM(counted_quantity) as total_counted,
          SUM(expected_quantity) as total_expected,
          SUM(variance_value) as total_variance
        FROM inventory_counts
        GROUP BY count_date
        ORDER BY count_date DESC
        LIMIT 10
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (recentCounts.length === 0) {
      console.log('⚠️  No inventory counts found');
      console.log('');
      console.log('Please complete an inventory count first:');
      console.log('1. node prepare_cutoff_inventory.js');
      console.log('2. node export_count_sheet.js');
      console.log('3. Do physical count');
      console.log('4. node import_inventory_count.js [file]');
      console.log('');
      rl.close();
      manager.close();
      return;
    }

    recentCounts.forEach(count => {
      const variance = count.total_variance || 0;
      const varianceStr = variance > 0 ? `+$${variance.toFixed(2)}` : `$${variance.toFixed(2)}`;
      console.log(`${count.count_date} - ${count.items_counted} items - Variance: ${varianceStr}`);
    });

    console.log('');
    const countDate = await question('Enter count date to create snapshot (YYYY-MM-DD): ');

    if (!countDate) {
      console.log('❌ No date provided');
      rl.close();
      manager.close();
      return;
    }

    // Get count data for this date
    const countData = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ic.*,
          ii.description,
          im.category_id,
          ii.unit
        FROM inventory_counts ic
        LEFT JOIN invoice_items ii ON ic.item_code = ii.item_code
        LEFT JOIN item_master im ON ic.item_code = im.item_code
        WHERE ic.count_date = ?
        GROUP BY ic.item_code
      `, [countDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (countData.length === 0) {
      console.log(`❌ No count data found for ${countDate}`);
      rl.close();
      manager.close();
      return;
    }

    console.log('');
    console.log(`✅ Found count data: ${countData.length} items`);
    console.log('');

    // Load cut-off config if exists
    const configPath = path.join(__dirname, 'data', 'inventory_counts', 'current_count_config.json');
    let cutoffDate = countDate;
    let lastInvoice = null;

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      cutoffDate = config.cutoffDate || countDate;
      console.log(`📅 Cut-off Date: ${cutoffDate}`);
      console.log('');
    }

    // Get last included invoice
    const lastInvoiceData = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT invoice_number, order_date, SUM(line_total) as total
        FROM invoice_items
        WHERE order_date <= ?
        ORDER BY order_date DESC, invoice_number DESC
        LIMIT 1
      `, [cutoffDate], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (lastInvoiceData) {
      lastInvoice = lastInvoiceData.invoice_number;
      console.log(`📦 Last Included Invoice: ${lastInvoice} (${lastInvoiceData.order_date}) - $${lastInvoiceData.total.toFixed(2)}`);
      console.log('');
    }

    const snapshotName = await question(`Snapshot name (e.g., "July 2025 Month-End"): `);
    const notes = await question('Notes (optional): ');
    const createdBy = await question('Your name: ');

    console.log('');
    console.log('📊 Calculating totals...');

    const totals = countData.reduce((acc, item) => {
      acc.counted += item.counted_quantity || 0;
      acc.expected += item.expected_quantity || 0;
      acc.countedValue += (item.counted_quantity || 0) * (item.expected_value / (item.expected_quantity || 1));
      acc.expectedValue += item.expected_value || 0;
      acc.varianceValue += item.variance_value || 0;
      return acc;
    }, { counted: 0, expected: 0, countedValue: 0, expectedValue: 0, varianceValue: 0 });

    console.log('');
    console.log('📊 Snapshot Summary:');
    console.log('-'.repeat(80));
    console.log(`Name: ${snapshotName}`);
    console.log(`Date: ${countDate}`);
    console.log(`Cut-off: ${cutoffDate}`);
    console.log(`Last Invoice: ${lastInvoice}`);
    console.log(`Items: ${countData.length}`);
    console.log(`Counted Value: $${totals.countedValue.toFixed(2)}`);
    console.log(`Expected Value: $${totals.expectedValue.toFixed(2)}`);
    console.log(`Variance: $${totals.varianceValue.toFixed(2)}`);
    console.log('');

    const confirm = await question('Create this snapshot? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      manager.close();
      return;
    }

    console.log('');
    console.log('💾 Creating snapshot...');

    // Create snapshot
    const snapshotId = await new Promise((resolve, reject) => {
      manager.db.run(`
        INSERT INTO inventory_snapshots
        (snapshot_name, snapshot_date, cutoff_date, last_included_invoice,
         counted_value, expected_value, variance_value, total_items_counted,
         notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        snapshotName,
        countDate,
        cutoffDate,
        lastInvoice,
        totals.countedValue,
        totals.expectedValue,
        totals.varianceValue,
        countData.length,
        notes,
        createdBy
      ], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });

    // Save snapshot items
    console.log('💾 Saving item details...');

    for (const item of countData) {
      const itemValue = (item.counted_quantity || 0) * (item.expected_value / (item.expected_quantity || 1));

      await new Promise((resolve, reject) => {
        manager.db.run(`
          INSERT INTO inventory_snapshot_items
          (snapshot_id, item_code, description, category_id,
           counted_quantity, counted_value,
           expected_quantity, expected_value,
           variance_quantity, variance_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          snapshotId,
          item.item_code,
          item.description,
          item.category_id,
          item.counted_quantity,
          itemValue,
          item.expected_quantity,
          item.expected_value,
          item.variance,
          item.variance_value
        ], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    console.log(`✅ Snapshot created (ID: ${snapshotId})`);
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. View snapshots: node list_snapshots.js');
    console.log('2. Create report from snapshot: node report_from_snapshot.js');
    console.log('3. Compare snapshots: node compare_snapshots.js');
    console.log('');
    console.log('💡 This snapshot is now your baseline!');
    console.log('   Future reports can add/remove orders from this point.');
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
