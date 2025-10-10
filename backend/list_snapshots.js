#!/usr/bin/env node

/**
 * List Inventory Snapshots
 * Show all saved inventory snapshots
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📸 INVENTORY SNAPSHOTS');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
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
      console.log('📭 No snapshots found');
      console.log('');
      console.log('Create your first snapshot:');
      console.log('  1. Complete inventory count');
      console.log('  2. Run: node create_inventory_snapshot.js');
      console.log('');
      manager.close();
      return;
    }

    console.log(`Found ${snapshots.length} snapshot(s):`);
    console.log('');

    for (const snap of snapshots) {
      console.log('─'.repeat(80));
      console.log(`📸 ${snap.snapshot_name}`);
      console.log(`   ID: ${snap.id}`);
      console.log(`   Count Date: ${snap.snapshot_date}`);
      console.log(`   Cut-off Date: ${snap.cutoff_date}`);
      console.log(`   Last Invoice: ${snap.last_included_invoice}`);
      console.log(`   Items Counted: ${snap.total_items_counted}`);
      console.log(`   Counted Value: $${snap.counted_value.toFixed(2)}`);
      console.log(`   Expected Value: $${snap.expected_value.toFixed(2)}`);
      console.log(`   Variance: $${snap.variance_value.toFixed(2)}`);
      console.log(`   Created: ${snap.created_at} by ${snap.created_by || 'Unknown'}`);
      if (snap.notes) {
        console.log(`   Notes: ${snap.notes}`);
      }
      console.log('');
    }

    console.log('─'.repeat(80));
    console.log('');
    console.log('📝 Actions:');
    console.log('  • Create report from snapshot: node report_from_snapshot.js');
    console.log('  • Compare snapshots: node compare_snapshots.js');
    console.log('  • View snapshot details: node view_snapshot.js [id]');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
