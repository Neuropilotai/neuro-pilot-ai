#!/usr/bin/env node

/**
 * Set Initial Par Levels
 * Auto-calculate min/max/reorder based on current inventory
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📊 SET INITIAL PAR LEVELS');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();
  await manager.initialize();

  try {
    // Get all item-locations
    const itemLocations = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT * FROM item_locations
        WHERE quantity_on_hand > 0
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log(`📦 Setting par levels for ${itemLocations.length} items...`);
    console.log('');

    let updated = 0;

    for (const item of itemLocations) {
      // Simple initial calculation:
      // - Min = 50% of current on-hand
      // - Max = 150% of current on-hand
      // - Reorder = 75% of current on-hand

      const currentQty = item.quantity_on_hand;
      const min = Math.ceil(currentQty * 0.5);
      const max = Math.ceil(currentQty * 1.5);
      const reorder = Math.ceil(currentQty * 0.75);

      await new Promise((resolve, reject) => {
        manager.db.run(`
          UPDATE item_locations
          SET min_quantity = ?,
              max_quantity = ?,
              reorder_point = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE item_code = ? AND location_code = ?
        `, [min, max, reorder, item.item_code, item.location_code], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      updated++;
    }

    console.log(`✅ Updated ${updated} item-locations with par levels`);
    console.log('');

    // Show sample
    const samples = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          il.item_code,
          il.location_code,
          il.quantity_on_hand as current,
          il.min_quantity as min,
          il.reorder_point as reorder,
          il.max_quantity as max
        FROM item_locations il
        WHERE il.quantity_on_hand > 0
        ORDER BY il.quantity_on_hand DESC
        LIMIT 10
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log('📊 SAMPLE PAR LEVELS:');
    console.log('-'.repeat(80));
    console.log('Item Code    Location          Current   Min   Reorder   Max');
    console.log('-'.repeat(80));

    samples.forEach(s => {
      console.log(
        `${s.item_code.padEnd(12)} ` +
        `${s.location_code.padEnd(16)} ` +
        `${String(s.current).padStart(7)} ` +
        `${String(s.min).padStart(5)} ` +
        `${String(s.reorder).padStart(7)} ` +
        `${String(s.max).padStart(5)}`
      );
    });

    console.log('');
    console.log('💡 These are initial estimates based on current inventory.');
    console.log('   AI will learn and adjust these after your second count.');
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Run AI monitor: node ai_inventory_monitor.js');
    console.log('2. After second count, AI will learn and recommend adjustments');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    manager.close();
    process.exit(1);
  }
}

main();
