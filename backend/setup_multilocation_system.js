#!/usr/bin/env node

/**
 * Setup Multi-Location Inventory System
 * Allows items to be stored in multiple locations with separate quantities
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📍 SETUP MULTI-LOCATION INVENTORY SYSTEM');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();
  await manager.initialize();

  try {
    console.log('Creating multi-location tables...');
    console.log('');

    // Table: item_locations - Track which items are in which locations with quantities
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS item_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_code TEXT NOT NULL,
          location_code TEXT NOT NULL,
          location_name TEXT NOT NULL,
          location_type TEXT,
          quantity_on_hand REAL DEFAULT 0,
          min_quantity REAL DEFAULT 0,
          max_quantity REAL DEFAULT 0,
          reorder_point REAL DEFAULT 0,
          last_counted_date TEXT,
          last_counted_qty REAL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(item_code, location_code)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('✅ item_locations table created');

    // Table: location_master - Define all storage locations
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS location_master (
          location_code TEXT PRIMARY KEY,
          location_name TEXT NOT NULL,
          location_name_fr TEXT,
          location_type TEXT,
          parent_location TEXT,
          capacity REAL,
          temperature_zone TEXT,
          is_active INTEGER DEFAULT 1,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('✅ location_master table created');

    // Table: par_level_history - Track changes to min/max over time
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS par_level_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_code TEXT NOT NULL,
          location_code TEXT NOT NULL,
          old_min REAL,
          new_min REAL,
          old_max REAL,
          new_max REAL,
          adjustment_reason TEXT,
          adjusted_by TEXT,
          adjusted_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('✅ par_level_history table created');

    // Insert default locations
    console.log('');
    console.log('📦 Creating default locations...');
    console.log('');

    const defaultLocations = [
      { code: 'FREEZER-A', name: 'Freezer A', name_fr: 'Congélateur A', type: 'FREEZER', temp: 'FROZEN' },
      { code: 'FREEZER-B', name: 'Freezer B', name_fr: 'Congélateur B', type: 'FREEZER', temp: 'FROZEN' },
      { code: 'COOLER-A', name: 'Cooler A', name_fr: 'Réfrigérateur A', type: 'COOLER', temp: 'REFRIGERATED' },
      { code: 'COOLER-B', name: 'Cooler B', name_fr: 'Réfrigérateur B', type: 'COOLER', temp: 'REFRIGERATED' },
      { code: 'DRY-STORAGE-1', name: 'Dry Storage - Shelf 1', name_fr: 'Entreposage sec - Étagère 1', type: 'DRY', temp: 'AMBIENT' },
      { code: 'DRY-STORAGE-2', name: 'Dry Storage - Shelf 2', name_fr: 'Entreposage sec - Étagère 2', type: 'DRY', temp: 'AMBIENT' },
      { code: 'DRY-STORAGE-3', name: 'Dry Storage - Shelf 3', name_fr: 'Entreposage sec - Étagère 3', type: 'DRY', temp: 'AMBIENT' },
      { code: 'WALK-IN-FREEZER', name: 'Walk-in Freezer', name_fr: 'Congélateur-chambre', type: 'FREEZER', temp: 'FROZEN' },
      { code: 'RECEIVING', name: 'Receiving Area', name_fr: 'Zone de réception', type: 'STAGING', temp: 'AMBIENT' },
      { code: 'PREP-AREA', name: 'Prep Area', name_fr: 'Zone de préparation', type: 'PRODUCTION', temp: 'AMBIENT' }
    ];

    for (const loc of defaultLocations) {
      await new Promise((resolve, reject) => {
        manager.db.run(`
          INSERT OR IGNORE INTO location_master
          (location_code, location_name, location_name_fr, location_type, temperature_zone)
          VALUES (?, ?, ?, ?, ?)
        `, [loc.code, loc.name, loc.name_fr, loc.type, loc.temp], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      console.log(`  ✅ ${loc.name} (${loc.name_fr})`);
    }

    console.log('');
    console.log('✅ Multi-location system ready!');
    console.log('');
    console.log('📋 Available Locations:');
    console.log('-'.repeat(80));

    const locations = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT * FROM location_master ORDER BY location_type, location_code
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    locations.forEach(loc => {
      console.log(`${loc.location_code.padEnd(20)} ${loc.location_name} / ${loc.location_name_fr}`);
    });

    console.log('');
    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Assign items to locations: node assign_item_locations.js');
    console.log('2. Set par levels: node set_par_levels.js');
    console.log('3. Start AI monitoring: node start_inventory_monitor.js');
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
