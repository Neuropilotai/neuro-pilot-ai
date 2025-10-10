#!/usr/bin/env node

/**
 * Import June Inventory from PDF Extract
 */

const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/enterprise_inventory.db');
const content = fs.readFileSync('./data/inventory_counts/june_inventory_full.txt', 'utf8');

console.log('\n📦 IMPORTING JUNE INVENTORY FROM PDF\n');
console.log('='.repeat(80));

// Parse items - looking for patterns like:
// #ITEM_CODE | Brand | Description
// Followed by: Format  Price  Qty  Total

const lines = content.split('\n');
const items = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Look for item code line
  const itemMatch = line.match(/^#(\d{7})\s*\|/);
  if (itemMatch) {
    const itemCode = itemMatch[1];

    // Look at next few lines for price and quantity
    let quantity = 0;
    let unitPrice = 0;
    let lineTotal = 0;

    for (let j = i + 1; j < i + 5 && j < lines.length; j++) {
      const dataLine = lines[j].trim();

      // Match pattern: Format  Price  Qty  Total
      // Examples: "Boîte  50,83 $  25  1 270,75 $"
      const dataMatch = dataLine.match(/([0-9,]+(?:\.\d+)?)\s*\$\s+(\d+)\s+([0-9,\s]+(?:\.\d+)?)\s*\$/);
      if (dataMatch) {
        unitPrice = parseFloat(dataMatch[1].replace(',', '.'));
        quantity = parseInt(dataMatch[2]);
        lineTotal = parseFloat(dataMatch[3].replace(/[\s,]/g, '').replace(',', '.'));
        break;
      }
    }

    if (quantity > 0) {
      items.push({
        item_code: itemCode,
        quantity: quantity,
        unit_price: unitPrice,
        line_total: lineTotal
      });
    }
  }
}

console.log(`✅ Parsed ${items.length} items from PDF\n`);

// Calculate totals
const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
const totalValue = items.reduce((sum, item) => sum + item.line_total, 0);

console.log('📊 Summary:');
console.log('-'.repeat(80));
console.log(`Items:        ${items.length}`);
console.log(`Total Units:  ${totalQty.toLocaleString()}`);
console.log(`Total Value:  $${totalValue.toLocaleString()}`);
console.log('');

// Clear and import to database
db.run('DELETE FROM inventory_count_items', (err) => {
  if (err) {
    console.error('Error clearing inventory:', err);
    process.exit(1);
  }

  const stmt = db.prepare(`
    INSERT INTO inventory_count_items
    (count_date, item_code, expected_quantity, counted_quantity, counted_units, variance, variance_value, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach(item => {
    stmt.run(
      '2025-07-04',
      item.item_code,
      0,
      item.quantity,
      0,
      item.quantity,
      item.line_total,
      'Storage',
      'June 2025 Inventory - from PDF'
    );
  });

  stmt.finalize(() => {
    db.get(`
      SELECT
        COUNT(*) as count,
        SUM(counted_quantity) as qty,
        SUM(variance_value) as value
      FROM inventory_count_items
    `, (err, row) => {
      if (err) {
        console.error('Error:', err);
      } else {
        console.log('✅ June Inventory Imported to Database');
        console.log('-'.repeat(80));
        console.log(`Items in DB:   ${row.count}`);
        console.log(`Total Units:   ${row.qty}`);
        console.log(`Total Value:   $${row.value.toFixed(2)}`);
        console.log(`Count Date:    2025-07-04`);
        console.log('');
        console.log('🎯 Inventory ready for location assignment!');
        console.log('');
      }
      db.close();
    });
  });
});
