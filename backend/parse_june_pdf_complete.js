#!/usr/bin/env node

const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/enterprise_inventory.db');
const content = fs.readFileSync('./data/inventory_counts/june_inventory_full.txt', 'utf8');

console.log('\n📦 PARSING JUNE INVENTORY PDF - COMPLETE\n');

const lines = content.split('\n');
const items = [];
let currentItem = null;
let lineData = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Item code line
  if (line.match(/^#(\d{7})/)) {
    currentItem = line.match(/^#(\d{7})/)[1];
    lineData = {};
  }
  
  // Format line (Boîte, Unité, CS)
  if (currentItem && (line === 'Boîte' || line === 'Unité' || line === 'CS')) {
    lineData.format = line;
  }
  
  // Price line (ends with $)
  if (currentItem && line.match(/^([0-9,]+(?:\.\d+)?)\s*\$$/)) {
    lineData.price = parseFloat(line.replace(',', '.').replace('$', '').trim());
  }
  
  // Quantity line (just a number)
  if (currentItem && lineData.price && line.match(/^\d+$/)) {
    lineData.quantity = parseInt(line);
  }
  
  // Total line (ends with $, has spaces/commas)
  if (currentItem && lineData.quantity && line.match(/^[0-9,\s]+\$$/)) {
    lineData.total = parseFloat(line.replace(/[\s,]/g, '').replace('$', ''));
    
    // Save complete line item
    items.push({
      item_code: currentItem,
      format: lineData.format || 'Unit',
      unit_price: lineData.price,
      quantity: lineData.quantity,
      line_total: lineData.total
    });
    
    lineData = {}; // Reset for next format of same item
  }
}

console.log(`✅ Parsed ${items.length} line items from PDF\n`);

const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
const totalValue = items.reduce((sum, item) => sum + item.line_total, 0);

console.log('📊 Summary:');
console.log('-'.repeat(80));
console.log(`Line Items:   ${items.length}`);
console.log(`Total Units:  ${totalQty.toLocaleString()}`);
console.log(`Total Value:  $${totalValue.toLocaleString()}`);
console.log('');

// Import to database
db.run('DELETE FROM inventory_count_items', (err) => {
  if (err) { console.error(err); process.exit(1); }
  
  const stmt = db.prepare(`
    INSERT INTO inventory_count_items
    (count_date, item_code, expected_quantity, counted_quantity, counted_units, variance, variance_value, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  items.forEach((item, idx) => {
    stmt.run(
      '2025-07-04',
      item.item_code,
      0,
      item.quantity,
      0,
      item.quantity,
      item.line_total,
      'Storage',
      `${item.format} - Line ${idx + 1}`
    );
  });
  
  stmt.finalize(() => {
    db.get('SELECT COUNT(*) as count, SUM(counted_quantity) as qty, SUM(variance_value) as value FROM inventory_count_items', (err, row) => {
      console.log('✅ June Inventory Imported');
      console.log('-'.repeat(80));
      console.log(`Line Items:   ${row.count}`);
      console.log(`Total Units:  ${row.qty}`);
      console.log(`Total Value:  $${row.value.toFixed(2)}`);
      console.log('');
      db.close();
    });
  });
});
