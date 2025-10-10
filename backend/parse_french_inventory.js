#!/usr/bin/env node

/**
 * Parse French Inventory Count Document
 * Extracts item codes, descriptions, quantities from GFS French format
 */

const fs = require('fs');
const path = require('path');

// Read the inventory text from file
const inputFile = process.argv[2];

if (!inputFile) {
  console.log('');
  console.log('📄 PARSE FRENCH INVENTORY COUNT');
  console.log('='.repeat(80));
  console.log('');
  console.log('Usage: node parse_french_inventory.js <input_file.txt>');
  console.log('');
  console.log('This will extract:');
  console.log('  • Item codes (#1234567)');
  console.log('  • Item descriptions');
  console.log('  • Quantities counted');
  console.log('  • Unit types (Boîte, Unité, Seau)');
  console.log('');
  console.log('Output: CSV file ready for Excel import');
  console.log('');
  process.exit(1);
}

console.log('');
console.log('📄 PARSE FRENCH INVENTORY COUNT');
console.log('='.repeat(80));
console.log('');

const text = fs.readFileSync(inputFile, 'utf8');

console.log('📋 Reading document...');
console.log('');

// Extract header information
const clientMatch = text.match(/CLIENT\s*\n\s*([^\n]+)/);
const linesMatch = text.match(/LIGNES\s+(\d+)/);
const quantityMatch = text.match(/QUANTITÉ TOTALE\s+([\d\s]+)/);
const costMatch = text.match(/COÛT ESTIMÉ\s+([\d\s,]+)/);

if (clientMatch) console.log(`📦 Client: ${clientMatch[1].trim()}`);
if (linesMatch) console.log(`📊 Line Items: ${linesMatch[1]}`);
if (quantityMatch) console.log(`📈 Total Quantity: ${quantityMatch[1].trim()}`);
if (costMatch) console.log(`💰 Estimated Cost: $${costMatch[1].trim()}`);
console.log('');

const items = [];
let lineNumber = 0;

// Split into logical sections - each item may span multiple lines
const lines = text.split('\n');

let currentItem = null;
let inItemSection = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Skip header and empty lines
  if (!line || line.includes('RÉSUMÉ') || line.includes('CLIENT') ||
      line.includes('EXPÉDITION') || line.includes('COMMANDE')) {
    continue;
  }

  // Check if line contains item code pattern #1234567
  const itemCodeMatch = line.match(/#(\d{7})/);

  if (itemCodeMatch) {
    // Save previous item if exists
    if (currentItem && currentItem.itemCode && currentItem.quantity > 0) {
      items.push({...currentItem});
    }

    // Start new item
    currentItem = {
      itemCode: itemCodeMatch[1],
      description: '',
      quantity: 0,
      unit: 'Boîte',
      price: 0,
      total: 0
    };

    // Try to extract description from previous line(s)
    if (i > 0) {
      let descLine = lines[i - 1].trim();
      // Remove quotes and clean up
      descLine = descLine.replace(/^"/, '').replace(/"$/, '').trim();
      if (descLine && !descLine.includes('$') && !descLine.match(/^\d+$/)) {
        currentItem.description = descLine;
      }
    }

    // Check current line for additional info after item code
    const afterCode = line.substring(line.indexOf(itemCodeMatch[0]) + itemCodeMatch[0].length).trim();
    if (afterCode && afterCode.includes('|')) {
      const parts = afterCode.split('|');
      if (parts.length > 0 && parts[0].trim()) {
        currentItem.description += (currentItem.description ? ' - ' : '') + parts[0].trim();
      }
    }
  }

  // Look for quantity and price patterns
  // Pattern: "Boîte" followed by price, quantity, total
  // Example: Boîte    83,88 $    6    503,28 $
  const dataMatch = line.match(/(Boîte|Unité|Seau)\s+([\d,]+)\s*\$\s+(\d+)\s+([\d,]+)\s*\$/);

  if (dataMatch && currentItem) {
    currentItem.unit = dataMatch[1];
    currentItem.price = parseFloat(dataMatch[2].replace(',', '.'));
    currentItem.quantity = parseInt(dataMatch[3]);
    currentItem.total = parseFloat(dataMatch[4].replace(/\s/g, '').replace(',', '.'));
  }

  // Alternative pattern: Just unit and quantity
  // Sometimes quantity appears on next line
  const qtyMatch = line.match(/(Boîte|Unité|Seau)\s+([\d,]+)\s*\$\s+(\d+)/);
  if (qtyMatch && currentItem && currentItem.quantity === 0) {
    currentItem.unit = qtyMatch[1];
    currentItem.price = parseFloat(qtyMatch[2].replace(',', '.'));
    currentItem.quantity = parseInt(qtyMatch[3]);
  }
}

// Add last item
if (currentItem && currentItem.itemCode && currentItem.quantity > 0) {
  items.push(currentItem);
}

console.log('✅ Extraction Complete');
console.log('');
console.log('📊 SUMMARY');
console.log('-'.repeat(80));
console.log(`Items Extracted: ${items.length}`);
console.log(`Total Quantity: ${items.reduce((sum, item) => sum + item.quantity, 0)}`);
console.log(`Total Value: $${items.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`);
console.log('');

// Show first 5 items as sample
console.log('📋 Sample Items (first 5):');
console.log('-'.repeat(80));
items.slice(0, 5).forEach(item => {
  console.log(`${item.itemCode} - ${item.description.substring(0, 40)}`);
  console.log(`  Qty: ${item.quantity} ${item.unit} @ $${item.price.toFixed(2)} = $${item.total.toFixed(2)}`);
});
console.log('');

// Create CSV for Excel import
const outputFile = inputFile.replace(/\.(txt|pdf)$/i, '_parsed.csv');
const csvLines = ['Item_Code,Description,Counted_Cases,Location,Notes'];

items.forEach(item => {
  // Escape description for CSV
  const desc = item.description.replace(/"/g, '""');
  csvLines.push(`${item.itemCode},"${desc}",${item.quantity},,`);
});

fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf8');

console.log('💾 CSV File Created:');
console.log(`   ${outputFile}`);
console.log('');
console.log('📝 Next Steps:');
console.log('-'.repeat(80));
console.log('1. Review CSV file in Excel');
console.log('2. Add Location column if needed');
console.log('3. Import with: node import_count_from_excel.js ' + path.basename(outputFile));
console.log('');
