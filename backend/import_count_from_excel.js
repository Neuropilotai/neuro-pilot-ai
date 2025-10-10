#!/usr/bin/env node

/**
 * Import Inventory Count from Excel
 * Read physical count results from Excel file
 * Supports both .xlsx and .csv formats
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

// Check if xlsx library is available
let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.log('');
  console.log('⚠️  Excel support not installed');
  console.log('');
  console.log('Install with: npm install xlsx');
  console.log('');
  console.log('For now, you can:');
  console.log('1. Save your Excel file as CSV');
  console.log('2. Use: node import_inventory_count.js [file.csv]');
  console.log('');
  process.exit(1);
}

if (process.argv.length < 3) {
  console.log('');
  console.log('📥 IMPORT COUNT FROM EXCEL');
  console.log('='.repeat(80));
  console.log('');
  console.log('Usage: node import_count_from_excel.js <excel_file>');
  console.log('');
  console.log('Supported formats:');
  console.log('  • Excel (.xlsx, .xls)');
  console.log('  • CSV (.csv)');
  console.log('');
  console.log('Excel file should have columns:');
  console.log('  • Item_Code (required)');
  console.log('  • Description (optional)');
  console.log('  • Counted_Cases (required) - Full cases counted');
  console.log('  • Counted_Units (optional) - Loose units counted');
  console.log('  • Location (optional) - Storage location');
  console.log('  • Notes (optional)');
  console.log('');
  console.log('Example:');
  console.log('  node import_count_from_excel.js july_count.xlsx');
  console.log('');
  process.exit(1);
}

const excelFile = process.argv[2];

console.log('');
console.log('📥 IMPORT COUNT FROM EXCEL');
console.log('='.repeat(80));
console.log('');

async function parseExcel(filepath) {
  console.log(`📄 Reading: ${filepath}`);
  console.log('');

  // Read the workbook
  const workbook = XLSX.readFile(filepath);

  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  console.log(`📋 Sheet: ${sheetName}`);

  // Convert to JSON
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log(`✅ Found ${data.length} rows`);
  console.log('');

  return data;
}

async function main() {
  if (!fs.existsSync(excelFile)) {
    console.error(`❌ File not found: ${excelFile}`);
    process.exit(1);
  }

  const manager = new EnterpriseInventoryManager();
  await manager.initialize();

  try {
    const data = await parseExcel(excelFile);

    if (data.length === 0) {
      console.log('⚠️  No data found in Excel file');
      manager.close();
      return;
    }

    // Detect columns
    const firstRow = data[0];
    const columns = Object.keys(firstRow);

    console.log('📊 Detected Columns:');
    console.log('-'.repeat(80));
    columns.forEach(col => console.log(`  • ${col}`));
    console.log('');

    // Validate required columns
    const hasItemCode = columns.some(c =>
      c.toLowerCase().includes('item') && c.toLowerCase().includes('code')
    );
    const hasCounted = columns.some(c =>
      c.toLowerCase().includes('counted')
    );

    if (!hasItemCode) {
      console.log('❌ Missing required column: Item_Code');
      console.log('');
      console.log('Your Excel file must have a column with item codes.');
      console.log('Column name should contain "Item" and "Code"');
      console.log('');
      manager.close();
      return;
    }

    if (!hasCounted) {
      console.log('⚠️  No "Counted" column found');
      console.log('Looking for columns with numbers...');
      console.log('');
    }

    // Map column names (flexible matching)
    const getColumn = (keywords) => {
      return columns.find(c =>
        keywords.some(k => c.toLowerCase().includes(k.toLowerCase()))
      );
    };

    const itemCodeCol = getColumn(['Item_Code', 'ItemCode', 'Item Code', 'Code']);
    const countedCasesCol = getColumn(['Counted_Cases', 'Cases', 'Boîte', 'Boite']);
    const countedUnitsCol = getColumn(['Counted_Units', 'Units', 'Unité', 'Unite', 'Loose']);
    const locationCol = getColumn(['Location', 'Storage', 'Area', 'Zone']);
    const notesCol = getColumn(['Notes', 'Comments', 'Remarks']);

    console.log('📋 Using Columns:');
    console.log('-'.repeat(80));
    console.log(`  Item Code: ${itemCodeCol || 'NOT FOUND'}`);
    console.log(`  Counted Cases: ${countedCasesCol || 'NOT FOUND'}`);
    console.log(`  Counted Units: ${countedUnitsCol || 'Not provided'}`);
    console.log(`  Location: ${locationCol || 'Not provided'}`);
    console.log(`  Notes: ${notesCol || 'Not provided'}`);
    console.log('');

    // Create inventory_count_items table if needed
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_count_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          count_date TEXT NOT NULL,
          item_code TEXT NOT NULL,
          expected_quantity REAL,
          counted_quantity REAL,
          counted_units REAL,
          variance REAL,
          variance_value REAL,
          location TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const countDate = new Date().toISOString().split('T')[0];
    let imported = 0;
    let skipped = 0;
    let totalVariance = 0;

    console.log('🔄 Importing counts...');
    console.log('');

    for (const row of data) {
      const itemCode = row[itemCodeCol];

      if (!itemCode) {
        skipped++;
        continue;
      }

      const countedCases = countedCasesCol ? parseFloat(row[countedCasesCol]) || 0 : 0;
      const countedUnits = countedUnitsCol ? parseFloat(row[countedUnitsCol]) || 0 : 0;
      const location = locationCol ? row[locationCol] : null;
      const notes = notesCol ? row[notesCol] : null;

      // Total quantity = cases + units (units stored separately for reference)
      const countedQty = countedCases;

      // Get expected quantity from system
      const expectedData = await new Promise((resolve, reject) => {
        manager.db.get(`
          SELECT
            SUM(quantity) as expected_qty,
            SUM(line_total) as expected_value
          FROM invoice_items
          WHERE item_code = ?
            AND status IN ('PLACED', 'READY_TO_COUNT')
            AND (status != 'LOCKED' OR status IS NULL)
        `, [itemCode], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      const expectedQty = expectedData?.expected_qty || 0;
      const expectedValue = expectedData?.expected_value || 0;
      const variance = countedQty - expectedQty;
      const valuePerCase = expectedQty > 0 ? expectedValue / expectedQty : 0;
      const varianceValue = variance * valuePerCase;

      // Insert count
      await new Promise((resolve, reject) => {
        manager.db.run(`
          INSERT INTO inventory_count_items
          (count_date, item_code, expected_quantity, counted_quantity, counted_units,
           variance, variance_value, location, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [countDate, itemCode, expectedQty, countedQty, countedUnits, variance, varianceValue, location, notes],
        (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Update invoice_items status
      await new Promise((resolve, reject) => {
        manager.db.run(`
          UPDATE invoice_items
          SET status = 'COUNTED'
          WHERE item_code = ?
            AND status IN ('PLACED', 'READY_TO_COUNT')
        `, [itemCode], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      totalVariance += varianceValue;
      imported++;

      if (imported % 100 === 0) {
        console.log(`  Processed ${imported} items...`);
      }
    }

    console.log('');
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(80));
    console.log(`Items Imported: ${imported}`);
    console.log(`Items Skipped: ${skipped}`);
    console.log(`Total Variance Value: $${totalVariance.toFixed(2)}`);
    console.log(`Count Date: ${countDate}`);
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Review variance report: node inventory_variance_report.js');
    console.log('2. Create snapshot: node create_inventory_snapshot.js');
    console.log('3. Generate reports: node report_from_snapshot.js');
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
