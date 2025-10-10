#!/usr/bin/env node

/**
 * MERGE BARCODES FROM CASE INVENTORY INTO MAIN INVENTORY
 *
 * Takes barcodes from case_inventory.json (which has them from PDF extraction)
 * and merges them into clean_recalculated_inventory.json
 */

const fs = require('fs');

console.log('🔗 MERGING BARCODES FROM CASE INVENTORY');
console.log('='.repeat(80));

// Load case inventory (has barcodes from PDF extraction)
const caseInventoryData = JSON.parse(fs.readFileSync('./data/case_inventory.json', 'utf8'));
const caseInventory = caseInventoryData.caseInventory || {};
console.log(`✓ Loaded ${Object.keys(caseInventory).length} items from case inventory`);

// Build barcode lookup
const barcodeLookup = {};
Object.entries(caseInventory).forEach(([itemCode, item]) => {
  if (item.barcode) {
    barcodeLookup[itemCode] = item.barcode;
  }
});
console.log(`✓ Found ${Object.keys(barcodeLookup).length} barcodes in case inventory`);

// Load main inventory
const inventoryPath = './data/clean_recalculated_inventory.json';
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
console.log(`✓ Loaded ${inventory.items.length} items from main inventory`);

// Merge barcodes
let matched = 0;
let notMatched = 0;

inventory.items.forEach(item => {
  const itemCode = item.itemCode || item.id;

  if (barcodeLookup[itemCode]) {
    item.barcode = barcodeLookup[itemCode];
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
  let fifoInventory = JSON.parse(fs.readFileSync(fifoPath, 'utf8'));

  // Check if it's the weird format
  if (Array.isArray(fifoInventory) && fifoInventory.length === 1 && typeof fifoInventory[0] === 'string') {
    console.log('  ⚠️  FIFO inventory has wrong format, regenerating from main inventory...');

    // Regenerate FIFO from main inventory
    fifoInventory = inventory.items.map(item => ({
      itemCode: item.itemCode,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalValue: item.totalValue,
      location: item.location,
      lastUpdated: item.lastUpdated,
      source: item.source,
      barcode: item.barcode,
      batches: [{
        quantity: item.quantity,
        receivedDate: item.lastUpdated,
        invoiceNumber: 'INITIAL',
        unitPrice: item.unitPrice
      }]
    }));

    fs.writeFileSync(fifoPath, JSON.stringify(fifoInventory, null, 2));
    console.log(`  ✓ Regenerated FIFO inventory with ${fifoInventory.length} items`);
  } else if (Array.isArray(fifoInventory)) {
    let fifoMatched = 0;

    fifoInventory.forEach(item => {
      const itemCode = item.itemCode || item.id;
      if (barcodeLookup[itemCode]) {
        item.barcode = barcodeLookup[itemCode];
        fifoMatched++;
      }
    });

    fs.writeFileSync(fifoPath, JSON.stringify(fifoInventory, null, 2));
    console.log(`  ✓ Updated ${fifoMatched} items in FIFO inventory`);
  }
} catch (error) {
  console.log(`  ⚠️  Could not update FIFO inventory: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ BARCODE MERGE COMPLETE');
console.log('='.repeat(80));

// Show sample
console.log('\n📋 SAMPLE ITEMS WITH BARCODES:');
const samplesWithBarcodes = inventory.items.filter(item => item.barcode).slice(0, 5);
samplesWithBarcodes.forEach(item => {
  console.log(`  ${item.itemCode}: ${item.name}`);
  console.log(`    Barcode: ${item.barcode}`);
});

if (samplesWithBarcodes.length === 0) {
  console.log('  ⚠️  No items with barcodes found');
  console.log('\n📋 Items in main inventory (sample):');
  inventory.items.slice(0, 3).forEach(item => {
    console.log(`  ${item.itemCode}: ${item.name}`);
  });

  console.log('\n📋 Items in case inventory with barcodes (sample):');
  Object.entries(caseInventory).slice(0, 3).forEach(([code, item]) => {
    console.log(`  ${code}: ${item.description} - Barcode: ${item.barcode}`);
  });
}
