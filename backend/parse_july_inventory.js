#!/usr/bin/env node

/**
 * Parse July Inventory Count from Text File
 */

const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/enterprise_inventory.db');

// Read the July inventory file
const content = fs.readFileSync('./data/inventory_counts/july_inventory_count.txt', 'utf8');

// Parse items - pattern: #ITEM_CODE | Brand | Description... Qty Total
const itemRegex = /#(\d{7})\s*\|[^|]+\|[^|]+\s+(?:Boîte|Unité|CS)["\s]*([0-9,]+(?:\.\d+)?)\s*\$\s*(\d+)\s*([0-9,]+(?:\.\d+)?)\s*\$/g;

const items = [];
let match;

while ((match = itemRegex.exec(content)) !== null) {
  const itemCode = match[1];
  const unitPrice = parseFloat(match[2].replace(',', ''));
  const quantity = parseInt(match[3]);
  const lineTotal = parseFloat(match[4].replace(/\s/g, '').replace(',', '.'));

  items.push({
    item_code: itemCode,
    quantity: quantity,
    unit_price: unitPrice,
    line_total: lineTotal
  });
}

console.log(`\n📦 Parsed ${items.length} items from July inventory\n`);

// Clear existing inventory count
db.run('DELETE FROM inventory_count_items', (err) => {
  if (err) {
    console.error('Error clearing inventory:', err);
    process.exit(1);
  }

  // Insert parsed items
  const stmt = db.prepare(`
    INSERT INTO inventory_count_items
    (count_date, item_code, expected_quantity, counted_quantity, counted_units, variance, variance_value, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  items.forEach(item => {
    stmt.run(
      '2025-07-04',
      item.item_code,
      0,
      item.quantity,
      0,
      item.quantity,
      item.line_total,
      'Storage'
    );
    inserted++;
  });

  stmt.finalize(() => {
    db.get('SELECT COUNT(*) as count, SUM(counted_quantity) as qty, SUM(variance_value) as value FROM inventory_count_items', (err, row) => {
      if (err) {
        console.error('Error:', err);
      } else {
        console.log('✅ June Inventory Count Imported');
        console.log('─'.repeat(80));
        console.log(`Items:         ${row.count}`);
        console.log(`Total Units:   ${row.qty}`);
        console.log(`Total Value:   $${row.value.toFixed(2)}`);
        console.log(`Count Date:    July 4, 2025`);
        console.log('');
      }
      db.close();
    });
  });
});
