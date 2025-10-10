#!/usr/bin/env node

/**
 * ENTERPRISE SYSTEM DATA IMPORT
 * Imports GFS orders and locations into PORT 8083 enterprise system
 *
 * © 2025 NeuroInnovate · Proprietary System · Owned and operated by David Mikulis
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('📦 ENTERPRISE SYSTEM DATA IMPORT');
console.log('   NeuroInnovate Inventory Enterprise v2.7.0');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const DB_PATH = './database.db';
const GFS_ORDERS_PATH = '../../backend/data/gfs_orders';
const LOCATIONS_PATH = '../../backend/data/locations.json';

const db = new sqlite3.Database(DB_PATH);

// Step 1: Create inventory schema tables
async function createInventoryTables() {
  console.log('📋 Step 1: Creating Inventory Schema Tables');
  console.log('─'.repeat(70));

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Item Master table
      db.run(`
        CREATE TABLE IF NOT EXISTS item_master (
          item_id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_code TEXT UNIQUE NOT NULL,
          item_name TEXT NOT NULL,
          item_name_fr TEXT,
          category TEXT,
          unit TEXT DEFAULT 'each',
          barcode TEXT,
          par_level REAL DEFAULT 0,
          reorder_point REAL DEFAULT 0,
          unit_cost REAL DEFAULT 0,
          active INTEGER DEFAULT 1,
          tenant_id TEXT DEFAULT 'default',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          version INTEGER DEFAULT 1
        )
      `, (err) => {
        if (err) console.error('  ⚠️  item_master:', err.message);
        else console.log('  ✅ item_master table created');
      });

      // Processed Invoices table
      db.run(`
        CREATE TABLE IF NOT EXISTS processed_invoices (
          invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_number TEXT UNIQUE,
          supplier TEXT DEFAULT 'GFS',
          invoice_date TEXT,
          total_amount REAL,
          tax_amount REAL,
          subtotal REAL,
          gst REAL DEFAULT 0,
          qst REAL DEFAULT 0,
          status TEXT DEFAULT 'processed',
          tenant_id TEXT DEFAULT 'default',
          extraction_quality TEXT,
          is_credit_memo INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          version INTEGER DEFAULT 1
        )
      `, (err) => {
        if (err) console.error('  ⚠️  processed_invoices:', err.message);
        else console.log('  ✅ processed_invoices table created');
      });

      // Invoice Items table
      db.run(`
        CREATE TABLE IF NOT EXISTS invoice_items (
          invoice_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER,
          item_code TEXT NOT NULL,
          item_name TEXT,
          quantity REAL DEFAULT 0,
          unit TEXT DEFAULT 'CS',
          unit_price REAL DEFAULT 0,
          total_price REAL DEFAULT 0,
          barcode TEXT,
          line_number INTEGER,
          tenant_id TEXT DEFAULT 'default',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          version INTEGER DEFAULT 1,
          FOREIGN KEY (invoice_id) REFERENCES processed_invoices(invoice_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('  ⚠️  invoice_items:', err.message);
        else console.log('  ✅ invoice_items table created');
      });

      // Storage Locations table
      db.run(`
        CREATE TABLE IF NOT EXISTS storage_locations (
          location_id INTEGER PRIMARY KEY AUTOINCREMENT,
          location_code TEXT UNIQUE NOT NULL,
          location_name TEXT NOT NULL,
          location_type TEXT,
          capacity REAL,
          current_occupancy REAL DEFAULT 0,
          zone TEXT,
          temp_min REAL,
          temp_max REAL,
          active INTEGER DEFAULT 1,
          tenant_id TEXT DEFAULT 'default',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('  ⚠️  storage_locations:', err.message);
        else console.log('  ✅ storage_locations table created');
      });

      // Inventory Count Items table
      db.run(`
        CREATE TABLE IF NOT EXISTS inventory_count_items (
          count_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
          count_id INTEGER,
          item_code TEXT NOT NULL,
          quantity REAL DEFAULT 0,
          location TEXT,
          counted_by TEXT,
          notes TEXT,
          tenant_id TEXT DEFAULT 'default',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('  ⚠️  inventory_count_items:', err.message);
        else console.log('  ✅ inventory_count_items table created');
        resolve();
      });
    });
  });
}

// Step 2: Import GFS Orders
async function importGFSOrders() {
  console.log('');
  console.log('📦 Step 2: Importing GFS Orders');
  console.log('─'.repeat(70));

  const ordersDir = path.resolve(__dirname, GFS_ORDERS_PATH);

  if (!fs.existsSync(ordersDir)) {
    console.log(`  ⚠️  Orders directory not found: ${ordersDir}`);
    return { imported: 0, items: 0, skipped: 0 };
  }

  const orderFiles = fs.readdirSync(ordersDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'));

  console.log(`  Found ${orderFiles.length} order files`);

  let importedOrders = 0;
  let totalItems = 0;
  let skippedOrders = 0;

  for (const file of orderFiles) {
    try {
      const filePath = path.join(ordersDir, file);
      const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Skip if not a valid GFS invoice
      if (!orderData.invoiceNumber || !/^\d{10}$/.test(orderData.invoiceNumber)) {
        skippedOrders++;
        continue;
      }

      // Check if already imported
      const exists = await new Promise((resolve) => {
        db.get(
          'SELECT invoice_id FROM processed_invoices WHERE invoice_number = ?',
          [orderData.invoiceNumber],
          (err, row) => resolve(!!row)
        );
      });

      if (exists) {
        console.log(`  ⏭️  Skipping duplicate: ${orderData.invoiceNumber}`);
        skippedOrders++;
        continue;
      }

      // Insert invoice
      const invoiceId = await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO processed_invoices (
            invoice_number, supplier, invoice_date, total_amount,
            tax_amount, subtotal, gst, qst, status, extraction_quality,
            is_credit_memo, tenant_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          orderData.invoiceNumber,
          'GFS',
          orderData.orderDate,
          orderData.financials?.total || 0,
          (orderData.financials?.gst || 0) + (orderData.financials?.qst || 0),
          orderData.financials?.subtotal || 0,
          orderData.financials?.gst || 0,
          orderData.financials?.qst || 0,
          'processed',
          orderData.extractionQuality || 'GOOD',
          orderData.isCreditMemo ? 1 : 0,
          'default'
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      // Insert items
      if (orderData.items && orderData.items.length > 0) {
        for (let i = 0; i < orderData.items.length; i++) {
          const item = orderData.items[i];

          // Upsert item master
          await new Promise((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO item_master (
                item_code, item_name, unit, barcode, unit_cost, tenant_id
              ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
              item.itemCode,
              item.description,
              item.unit || 'CS',
              item.barcode || null,
              item.unitPrice || 0,
              'default'
            ], () => resolve());
          });

          // Insert invoice item
          await new Promise((resolve) => {
            db.run(`
              INSERT INTO invoice_items (
                invoice_id, item_code, item_name, quantity, unit,
                unit_price, total_price, barcode, line_number, tenant_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              invoiceId,
              item.itemCode,
              item.description,
              item.quantity || 0,
              item.unit || 'CS',
              item.unitPrice || 0,
              item.lineTotal || 0,
              item.barcode || null,
              i + 1,
              'default'
            ], () => resolve());
          });

          totalItems++;
        }
      }

      importedOrders++;
      if (importedOrders % 10 === 0) {
        console.log(`  ✅ Imported ${importedOrders} orders, ${totalItems} items...`);
      }

    } catch (error) {
      console.error(`  ❌ Error importing ${file}:`, error.message);
      skippedOrders++;
    }
  }

  console.log('');
  console.log(`  ✅ Import complete:`);
  console.log(`     Imported: ${importedOrders} orders`);
  console.log(`     Total items: ${totalItems}`);
  console.log(`     Skipped: ${skippedOrders}`);

  return { imported: importedOrders, items: totalItems, skipped: skippedOrders };
}

// Step 3: Import Locations
async function importLocations() {
  console.log('');
  console.log('📍 Step 3: Importing Storage Locations');
  console.log('─'.repeat(70));

  const locationsPath = path.resolve(__dirname, LOCATIONS_PATH);

  if (!fs.existsSync(locationsPath)) {
    console.log(`  ⚠️  Locations file not found: ${locationsPath}`);
    return 0;
  }

  const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
  const locations = locationsData.locations || [];

  console.log(`  Found ${locations.length} locations to import`);

  let importedCount = 0;

  for (const loc of locations) {
    try {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO storage_locations (
            location_code, location_name, location_type, capacity,
            current_occupancy, zone, temp_min, temp_max, active, tenant_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          loc.id,
          loc.name,
          loc.type,
          loc.capacity || 0,
          loc.currentStock || 0,
          loc.type || 'general',
          loc.temp || 20,
          loc.temp || 20,
          1,
          'default'
        ], (err) => {
          if (err) reject(err);
          else {
            importedCount++;
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`  ❌ Error importing location ${loc.id}:`, error.message);
    }
  }

  console.log(`  ✅ Imported ${importedCount} locations`);
  return importedCount;
}

// Step 4: Generate Summary Report
async function generateSummary() {
  console.log('');
  console.log('📊 Step 4: System Summary');
  console.log('─'.repeat(70));

  const stats = await new Promise((resolve) => {
    const data = {};

    db.get('SELECT COUNT(*) as count FROM processed_invoices', (err, row) => {
      data.invoices = row?.count || 0;

      db.get('SELECT COUNT(*) as count FROM item_master', (err, row) => {
        data.items = row?.count || 0;

        db.get('SELECT COUNT(*) as count FROM invoice_items', (err, row) => {
          data.lineItems = row?.count || 0;

          db.get('SELECT COUNT(*) as count FROM storage_locations', (err, row) => {
            data.locations = row?.count || 0;

            db.get('SELECT SUM(total_amount) as total FROM processed_invoices', (err, row) => {
              data.totalValue = row?.total || 0;
              resolve(data);
            });
          });
        });
      });
    });
  });

  console.log(`  Invoices imported: ${stats.invoices}`);
  console.log(`  Unique items: ${stats.items}`);
  console.log(`  Total line items: ${stats.lineItems}`);
  console.log(`  Storage locations: ${stats.locations}`);
  console.log(`  Total order value: $${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  return stats;
}

// Main execution
async function main() {
  try {
    await createInventoryTables();
    const orderStats = await importGFSOrders();
    const locationCount = await importLocations();
    const summary = await generateSummary();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ IMPORT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Your enterprise system is now ready with:');
    console.log(`  • ${summary.invoices} GFS orders`);
    console.log(`  • ${summary.items} unique items`);
    console.log(`  • ${summary.locations} storage locations`);
    console.log(`  • $${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} total inventory value`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Access system: http://localhost:8083');
    console.log('  2. Default admin: admin@neuro-pilot.ai / Admin123!@#');
    console.log('  3. Begin first inventory count');
    console.log('');
    console.log('© 2025 NeuroInnovate · Proprietary System · David Mikulis');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Import failed:', error);
    console.error('');
  } finally {
    db.close();
  }
}

main();
