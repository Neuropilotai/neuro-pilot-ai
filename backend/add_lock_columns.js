#!/usr/bin/env node

/**
 * Add Lock Columns to Database
 * Adds columns for order locking functionality
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('🔧 ADD LOCK COLUMNS TO DATABASE');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    console.log('Adding lock-related columns...');
    console.log('');

    // Add columns for locking
    const columns = [
      { name: 'locked_at', type: 'TEXT' },
      { name: 'locked_by', type: 'TEXT' },
      { name: 'lock_reason', type: 'TEXT' },
      { name: 'unlocked_at', type: 'TEXT' },
      { name: 'unlocked_by', type: 'TEXT' }
    ];

    for (const col of columns) {
      try {
        await new Promise((resolve, reject) => {
          manager.db.run(`
            ALTER TABLE invoice_items
            ADD COLUMN ${col.name} ${col.type}
          `, (err) => {
            if (err) {
              // Column might already exist
              if (err.message.includes('duplicate column name')) {
                console.log(`  ⏭️  Column ${col.name} already exists`);
                resolve();
              } else {
                reject(err);
              }
            } else {
              console.log(`  ✅ Added column: ${col.name}`);
              resolve();
            }
          });
        });
      } catch (err) {
        console.log(`  ❌ Error adding ${col.name}: ${err.message}`);
      }
    }

    console.log('');
    console.log('✅ Database schema updated');
    console.log('');
    console.log('📝 New Features Available:');
    console.log('-'.repeat(80));
    console.log('1. Lock orders after cut-off: node lock_orders_after_cutoff.js');
    console.log('2. Unlock orders (authorized): node unlock_orders.js');
    console.log('3. View locked orders: node show_locked_orders.js');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
