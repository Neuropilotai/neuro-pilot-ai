#!/usr/bin/env node

/**
 * MERGE BARCODES INTO MAIN INVENTORY
 *
 * Takes barcodes from barcode_mapping.json and merges them into
 * clean_recalculated_inventory.json
 */

const fs = require('fs');
const path = require('path');

console.log('🔗 MERGING BARCODES INTO MAIN INVENTORY');
console.log('='.repeat(80));

// Load barcode mapping
const barcodeMappingPath = './data/barcode_mapping.json';
const barcodeMapping = JSON.parse(fs.readFileSync(barcodeMappingPath, 'utf8'));
console.log(`✓ Loaded ${Object.keys(barcodeMapping).length} barcodes from mapping`);

// Load main inventory
const inventoryPath = './data/clean_recalculated_inventory.json';
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
console.log(`✓ Loaded ${inventory.items.length} items from main inventory`);

// Merge barcodes
let matched = 0;
let notMatched = 0;

inventory.items.forEach(item => {
  const itemCode = item.itemCode || item.id;

  if (barcodeMapping[itemCode]) {
    item.barcode = barcodeMapping[itemCode].barcode;
    matched++;
  } else {
    notMatched++;
  }
});

console.log('\n📊 MERGE RESULTS:');
console.log(`  Items with barcodes added: ${matched}`);
console.log(`  Items without barcodes: ${notMatched}`);
console.log(`  Coverage: ${(matched / inventory.items.length * 100).toFixed(1)}%`);

// Save updated inventory
const backupPath = './data/clean_recalculated_inventory_backup.json';
fs.writeFileSync(backupPath, JSON.stringify(inventory, null, 2));
console.log(`\n✓ Backup saved to: ${backupPath}`);

fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
console.log(`✓ Updated inventory saved to: ${inventoryPath}`);

// Also update FIFO inventory
console.log('\n🔄 Updating FIFO inventory...');
const fifoPath = './data/fifo_inventory.json';

try {
  const fifoInventory = JSON.parse(fs.readFileSync(fifoPath, 'utf8'));

  if (Array.isArray(fifoInventory)) {
    let fifoMatched = 0;

    fifoInventory.forEach(item => {
      const itemCode = item.itemCode || item.id;
      if (barcodeMapping[itemCode]) {
        item.barcode = barcodeMapping[itemCode].barcode;
        fifoMatched++;
      }
    });

    fs.writeFileSync(fifoPath, JSON.stringify(fifoInventory, null, 2));
    console.log(`✓ Updated ${fifoMatched} items in FIFO inventory`);
  }
} catch (error) {
  console.log(`⚠️  Could not update FIFO inventory: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ BARCODE MERGE COMPLETE');
console.log('='.repeat(80));

// Show sample
console.log('\n📋 SAMPLE ITEMS WITH BARCODES:');
inventory.items.slice(0, 5).forEach(item => {
  console.log(`  ${item.itemCode}: ${item.name}`);
  console.log(`    Barcode: ${item.barcode || 'NOT FOUND'}`);
});
