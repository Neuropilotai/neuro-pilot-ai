#!/usr/bin/env node

/**
 * Assign Item Locations from Count Data
 * Automatically populate item_locations from inventory_count_items
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📍 ASSIGN ITEM LOCATIONS FROM COUNT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();
  await manager.initialize();

  try {
    // Get latest count date
    const latestCount = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT count_date, COUNT(*) as item_count
        FROM inventory_count_items
        GROUP BY count_date
        ORDER BY count_date DESC
        LIMIT 1
      `, [], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!latestCount) {
      console.log('⚠️  No inventory counts found');
      console.log('');
      console.log('Import a count first: node import_count_from_excel.js your_file.xlsx');
      console.log('');
      manager.close();
      return;
    }

    console.log(`📅 Using count from: ${latestCount.count_date}`);
    console.log(`📊 Items in count: ${latestCount.item_count}`);
    console.log('');

    // Get all items from latest count
    const countItems = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ici.*,
          im.description,
          im.category_id
        FROM inventory_count_items ici
        LEFT JOIN item_master im ON ici.item_code = im.item_code
        WHERE ici.count_date = ?
      `, [latestCount.count_date], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log('📍 Assigning items to locations...');
    console.log('');

    let assigned = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of countItems) {
      // Map location string to location code
      const locationCode = mapLocationToCode(item.location);

      if (!locationCode) {
        skipped++;
        continue;
      }

      // Check if item-location already exists
      const existing = await new Promise((resolve, reject) => {
        manager.db.get(`
          SELECT * FROM item_locations
          WHERE item_code = ? AND location_code = ?
        `, [item.item_code, locationCode], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (existing) {
        // Update existing
        await new Promise((resolve, reject) => {
          manager.db.run(`
            UPDATE item_locations
            SET quantity_on_hand = ?,
                last_counted_date = ?,
                last_counted_qty = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE item_code = ? AND location_code = ?
          `, [
            item.counted_quantity,
            latestCount.count_date,
            item.counted_quantity,
            item.item_code,
            locationCode
          ], (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        updated++;
      } else {
        // Insert new
        await new Promise((resolve, reject) => {
          manager.db.run(`
            INSERT INTO item_locations
            (item_code, location_code, location_name, quantity_on_hand,
             last_counted_date, last_counted_qty, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            item.item_code,
            locationCode,
            item.location || locationCode,
            item.counted_quantity,
            latestCount.count_date,
            item.counted_quantity,
            item.notes
          ], (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        assigned++;
      }
    }

    console.log('✅ Location Assignment Complete');
    console.log('');
    console.log('📊 SUMMARY');
    console.log('-'.repeat(80));
    console.log(`New Assignments: ${assigned}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (no location): ${skipped}`);
    console.log('');

    // Show location distribution
    const locationStats = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          location_code,
          location_name,
          COUNT(*) as item_count,
          SUM(quantity_on_hand) as total_qty
        FROM item_locations
        GROUP BY location_code, location_name
        ORDER BY item_count DESC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log('📍 ITEMS BY LOCATION:');
    console.log('-'.repeat(80));
    locationStats.forEach(loc => {
      console.log(`${loc.location_code.padEnd(20)} ${String(loc.item_count).padStart(4)} items   ${String(loc.total_qty).padStart(6)} cases`);
    });
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Set par levels: node set_par_levels.js');
    console.log('2. Start AI monitoring: node ai_inventory_monitor.js');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    manager.close();
    process.exit(1);
  }
}

/**
 * Map location strings to location codes
 */
function mapLocationToCode(locationString) {
  if (!locationString) return null;

  const loc = locationString.toLowerCase().trim();

  // Freezer mappings
  if (loc.includes('freezer a') || loc.includes('congélateur a')) return 'FREEZER-A';
  if (loc.includes('freezer b') || loc.includes('congélateur b')) return 'FREEZER-B';
  if (loc.includes('walk') && loc.includes('freezer')) return 'WALK-IN-FREEZER';
  if (loc.includes('freezer') || loc.includes('congélateur')) return 'FREEZER-A';

  // Cooler mappings
  if (loc.includes('cooler a') || loc.includes('réfrigérateur a')) return 'COOLER-A';
  if (loc.includes('cooler b') || loc.includes('réfrigérateur b')) return 'COOLER-B';
  if (loc.includes('cooler') || loc.includes('réfrigérateur')) return 'COOLER-A';

  // Dry storage mappings
  if (loc.includes('shelf 1') || loc.includes('étagère 1')) return 'DRY-STORAGE-1';
  if (loc.includes('shelf 2') || loc.includes('étagère 2')) return 'DRY-STORAGE-2';
  if (loc.includes('shelf 3') || loc.includes('étagère 3')) return 'DRY-STORAGE-3';
  if (loc.includes('dry') || loc.includes('entreposage')) return 'DRY-STORAGE-1';

  // Other locations
  if (loc.includes('receiving') || loc.includes('réception')) return 'RECEIVING';
  if (loc.includes('prep') || loc.includes('préparation')) return 'PREP-AREA';

  return null;
}

main();
