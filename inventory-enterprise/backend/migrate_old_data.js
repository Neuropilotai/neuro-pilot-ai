const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const oldDb = new sqlite3.Database(path.join(__dirname, '../../backend/data/enterprise_inventory.db'));
const newDb = new sqlite3.Database(path.join(__dirname, 'db/inventory_enterprise.db'));

async function migrateLocations() {
  console.log('🔄 Migrating locations from old system...\n');

  // Get locations from old database
  const locations = await new Promise((resolve, reject) => {
    oldDb.all('SELECT * FROM location_master', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log(`Found ${locations.length} locations in old system:`);
  locations.forEach(loc => console.log(`  - ${loc.location_name}`));

  // Insert locations into new database (using INSERT OR IGNORE to skip duplicates)
  let sequence = 1;
  for (const loc of locations) {
    const locationType =
      loc.location_type === 'FREEZER' ? 'freezer' :
      loc.location_type === 'COOLER' ? 'cooler' :
      loc.location_type === 'DRY' ? 'shelf' :
      loc.location_type === 'STAGING' ? 'bin' :
      loc.location_type === 'PRODUCTION' ? 'warehouse' :
      'warehouse';

    await new Promise((resolve, reject) => {
      newDb.run(`
        INSERT OR IGNORE INTO storage_locations
        (location_name, location_type, sequence, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        loc.location_name,
        locationType,
        sequence++,
        loc.is_active || 1,
        loc.created_at || new Date().toISOString(),
        new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  console.log(`\n✅ Migrated ${locations.length} locations successfully!`);
}

async function migrateItems() {
  console.log('\n🔄 Migrating items from old system...\n');

  // Get item count
  const count = await new Promise((resolve, reject) => {
    oldDb.get('SELECT COUNT(*) as count FROM item_master', (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });

  console.log(`Found ${count} items in old system`);

  // Get first 10 items as preview
  const items = await new Promise((resolve, reject) => {
    oldDb.all('SELECT * FROM item_master LIMIT 10', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log('Sample items:');
  items.forEach(item => console.log(`  - ${item.item_name || item.item_code}`));

  // Copy all items
  const allItems = await new Promise((resolve, reject) => {
    oldDb.all('SELECT * FROM item_master', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  for (const item of allItems) {
    await new Promise((resolve, reject) => {
      newDb.run(`
        INSERT OR IGNORE INTO item_master
        (item_code, item_name, item_name_fr, category, unit, barcode, par_level, reorder_point, unit_cost, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.item_code,
        item.description, // Old DB uses 'description' not 'item_name'
        null, // Old DB has no French name field
        item.category_id ? String(item.category_id) : null, // Old DB uses numeric category_id
        item.unit || 'each',
        item.barcode,
        item.par_level || 0,
        item.reorder_point || 0,
        item.current_unit_price || 0, // Old DB uses 'current_unit_price' not 'unit_cost'
        item.is_active !== undefined ? item.is_active : 1,
        item.created_at || new Date().toISOString(),
        new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  console.log(`✅ Migrated ${allItems.length} items successfully!`);
}

async function main() {
  try {
    await migrateLocations();
    await migrateItems();

    console.log('\n🎉 Migration complete!\n');
    console.log('Summary:');

    // Get final counts
    const locationCount = await new Promise((resolve, reject) => {
      newDb.get('SELECT COUNT(*) as count FROM storage_locations', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const itemCount = await new Promise((resolve, reject) => {
      newDb.get('SELECT COUNT(*) as count FROM item_master', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    console.log(`  📍 Locations: ${locationCount}`);
    console.log(`  📦 Items: ${itemCount}`);
    console.log('\nYou can now access your locations in the Owner Console!');
    console.log('Navigate to: http://localhost:5173/dashboard/owner-console');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    oldDb.close();
    newDb.close();
  }
}

main();
