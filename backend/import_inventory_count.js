#!/usr/bin/env node

/**
 * Import Inventory Count
 * Imports physical count data and calculates variances
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

if (process.argv.length < 3) {
  console.log('');
  console.log('Usage: node import_inventory_count.js <count_file.csv>');
  console.log('');
  console.log('Example:');
  console.log('  node import_inventory_count.js data/inventory_counts/inventory_count_sheet_2025-10-04.csv');
  console.log('');
  process.exit(1);
}

const countFile = process.argv[2];

console.log('');
console.log('📥 IMPORT INVENTORY COUNT');
console.log('='.repeat(80));
console.log('');

async function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  const header = lines[0].split(',');
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');

    // Handle quoted descriptions
    const row = {};
    let inQuotes = false;
    let currentValue = '';
    let fieldIndex = 0;

    for (let char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row[header[fieldIndex]] = currentValue.trim();
        currentValue = '';
        fieldIndex++;
      } else {
        currentValue += char;
      }
    }
    row[header[fieldIndex]] = currentValue.trim(); // Last field

    // Only include rows with counted data
    if (row.Counted_Cases && row.Counted_Cases.trim() !== '') {
      data.push(row);
    }
  }

  return data;
}

async function main() {
  if (!fs.existsSync(countFile)) {
    console.error(`❌ File not found: ${countFile}`);
    process.exit(1);
  }

  const manager = new EnterpriseInventoryManager();

  try {
    console.log(`📄 Reading count file: ${countFile}`);
    console.log('');

    const counts = await parseCSV(countFile);

    console.log(`✅ Found ${counts.length} counted items`);
    console.log('');

    // Create inventory_counts table if it doesn't exist
    await new Promise((resolve, reject) => {
      manager.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_counts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          count_date TEXT NOT NULL,
          item_code TEXT NOT NULL,
          expected_quantity REAL,
          counted_quantity REAL,
          variance REAL,
          variance_value REAL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('🔄 Processing counts...');
    console.log('');

    let processed = 0;
    let variances = 0;
    let totalVarianceValue = 0;

    const countDate = new Date().toISOString().split('T')[0];

    for (const count of counts) {
      const itemCode = count.Item_Code;
      const countedCases = parseFloat(count.Counted_Cases) || 0;
      const expectedCases = parseFloat(count.Expected_Cases) || 0;
      const expectedValue = parseFloat(count.Expected_Value) || 0;
      const notes = count.Notes || '';

      const variance = countedCases - expectedCases;
      const valuePerCase = expectedCases > 0 ? expectedValue / expectedCases : 0;
      const varianceValue = variance * valuePerCase;

      // Insert count record
      await new Promise((resolve, reject) => {
        manager.db.run(`
          INSERT INTO inventory_counts
          (count_date, item_code, expected_quantity, counted_quantity, variance, variance_value, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [countDate, itemCode, expectedCases, countedCases, variance, varianceValue, notes],
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
          WHERE item_code = ? AND status IN ('PLACED', 'READY_TO_COUNT')
        `, [itemCode], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (Math.abs(variance) > 0.01) {
        variances++;
        totalVarianceValue += varianceValue;
        console.log(`  ${itemCode}: ${variance > 0 ? '+' : ''}${variance.toFixed(2)} cases ($${varianceValue.toFixed(2)})`);
      }

      processed++;
    }

    console.log('');
    console.log('📊 IMPORT SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Items Counted: ${processed}`);
    console.log(`Items with Variances: ${variances}`);
    console.log(`Total Variance Value: $${totalVarianceValue.toFixed(2)}`);
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Review variance report: node inventory_variance_report.js');
    console.log('2. Investigate high-value variances');
    console.log('3. Adjust inventory if needed');
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
