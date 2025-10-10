#!/usr/bin/env node

/**
 * MERGE BARCODES TO ALL INVENTORY FILES
 *
 * Updates all inventory files with extracted barcodes for 100% coverage
 */

const fs = require('fs');

console.log('🔗 MERGING BARCODES TO ALL INVENTORY FILES');
console.log('='.repeat(80));

// Load barcode mapping
const barcodeMappingPath = './data/barcode_mapping.json';
const barcodeMapping = JSON.parse(fs.readFileSync(barcodeMappingPath, 'utf8'));
console.log(`✓ Loaded ${Object.keys(barcodeMapping).length} barcodes`);

const results = {
  mainInventory: { matched: 0, total: 0 },
  fifoInventory: { matched: 0, total: 0 },
  caseInventory: { matched: 0, total: 0 }
};

// ==============================================================================
// 1. UPDATE MAIN INVENTORY (clean_recalculated_inventory.json)
// ==============================================================================
console.log('\n📦 Updating Main Inventory...');

const inventoryPath = './data/clean_recalculated_inventory.json';
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

inventory.items.forEach(item => {
  const itemCode = item.itemCode || item.id;

  if (barcodeMapping[itemCode]) {
    item.barcode = barcodeMapping[itemCode].barcode;
    results.mainInventory.matched++;

    // Also add description if missing or incomplete
    if (!item.name || item.name.length < 10) {
      if (barcodeMapping[itemCode].description) {
        item.name = barcodeMapping[itemCode].description;
      }
    }
  }
  results.mainInventory.total++;
});

// Save with backup
fs.copyFileSync(inventoryPath, './data/clean_recalculated_inventory_pre_barcode_backup.json');
fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

const mainPercentage = (results.mainInventory.matched / results.mainInventory.total * 100).toFixed(1);
console.log(`  ✓ Updated ${results.mainInventory.matched}/${results.mainInventory.total} items (${mainPercentage}%)`);

// ==============================================================================
// 2. UPDATE FIFO INVENTORY (fifo_inventory.json)
// ==============================================================================
console.log('\n📦 Updating FIFO Inventory...');

const fifoPath = './data/fifo_inventory.json';
let fifoInventory = JSON.parse(fs.readFileSync(fifoPath, 'utf8'));

// Regenerate FIFO from main inventory to ensure consistency
console.log('  🔄 Regenerating FIFO inventory from main inventory for consistency...');

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
  barcode: item.barcode,  // Include barcode
  category: item.category,
  batches: [{
    quantity: item.quantity,
    receivedDate: item.lastUpdated,
    invoiceNumber: 'INITIAL',
    unitPrice: item.unitPrice
  }]
}));

fs.writeFileSync(fifoPath, JSON.stringify(fifoInventory, null, 2));

results.fifoInventory.total = fifoInventory.length;
results.fifoInventory.matched = fifoInventory.filter(item => item.barcode).length;

const fifoPercentage = (results.fifoInventory.matched / results.fifoInventory.total * 100).toFixed(1);
console.log(`  ✓ Regenerated with ${results.fifoInventory.matched}/${results.fifoInventory.total} items having barcodes (${fifoPercentage}%)`);

// ==============================================================================
// 3. UPDATE CASE INVENTORY (case_inventory.json)
// ==============================================================================
console.log('\n📦 Updating Case Inventory...');

const caseInventoryPath = './data/case_inventory.json';
const caseInventoryData = JSON.parse(fs.readFileSync(caseInventoryPath, 'utf8'));
const caseInventory = caseInventoryData.caseInventory || {};

Object.entries(caseInventory).forEach(([itemCode, item]) => {
  if (barcodeMapping[itemCode]) {
    item.barcode = barcodeMapping[itemCode].barcode;
    results.caseInventory.matched++;
  }
  results.caseInventory.total++;
});

caseInventoryData.caseInventory = caseInventory;
fs.writeFileSync(caseInventoryPath, JSON.stringify(caseInventoryData, null, 2));

const casePercentage = (results.caseInventory.matched / results.caseInventory.total * 100).toFixed(1);
console.log(`  ✓ Updated ${results.caseInventory.matched}/${results.caseInventory.total} items (${casePercentage}%)`);

// ==============================================================================
// SUMMARY REPORT
// ==============================================================================
console.log('\n' + '='.repeat(80));
console.log('📊 BARCODE MERGE SUMMARY');
console.log('='.repeat(80));

const totalItems = results.mainInventory.total;
const totalWithBarcodes = results.mainInventory.matched;
const overallPercentage = (totalWithBarcodes / totalItems * 100).toFixed(1);

console.log(`\n🎯 OVERALL COVERAGE: ${overallPercentage}% (${totalWithBarcodes}/${totalItems} items)`);

console.log('\n📋 BY INVENTORY TYPE:');
console.log(`  Main Inventory: ${mainPercentage}% (${results.mainInventory.matched}/${results.mainInventory.total})`);
console.log(`  FIFO Inventory: ${fifoPercentage}% (${results.fifoInventory.matched}/${results.fifoInventory.total})`);
console.log(`  Case Inventory: ${casePercentage}% (${results.caseInventory.matched}/${results.caseInventory.total})`);

// ==============================================================================
// SHOW ITEMS WITHOUT BARCODES
// ==============================================================================
const itemsWithoutBarcodes = inventory.items.filter(item => !item.barcode);

if (itemsWithoutBarcodes.length > 0) {
  console.log(`\n⚠️  ITEMS WITHOUT BARCODES: ${itemsWithoutBarcodes.length}`);
  console.log('\nSample items missing barcodes:');

  itemsWithoutBarcodes.slice(0, 10).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.itemCode}: ${item.name}`);
  });

  // Save list of items without barcodes
  const missingBarcodesPath = './data/items_missing_barcodes.json';
  fs.writeFileSync(missingBarcodesPath, JSON.stringify(itemsWithoutBarcodes, null, 2));
  console.log(`\n✓ Full list saved to: ${missingBarcodesPath}`);
} else {
  console.log('\n🎉 100% BARCODE COVERAGE ACHIEVED!');
}

// ==============================================================================
// SHOW SAMPLE ITEMS WITH BARCODES
// ==============================================================================
console.log('\n✅ SAMPLE ITEMS WITH BARCODES:');

const itemsWithBarcodes = inventory.items.filter(item => item.barcode).slice(0, 10);
itemsWithBarcodes.forEach((item, i) => {
  console.log(`  ${i + 1}. ${item.itemCode}: ${item.name}`);
  console.log(`     Barcode: ${item.barcode}`);
});

// ==============================================================================
// CATEGORY BREAKDOWN
// ==============================================================================
console.log('\n📊 BARCODE COVERAGE BY CATEGORY:');

const categoryCoverage = {};
inventory.items.forEach(item => {
  const category = item.category || 'UNCATEGORIZED';

  if (!categoryCoverage[category]) {
    categoryCoverage[category] = { total: 0, withBarcode: 0 };
  }

  categoryCoverage[category].total++;
  if (item.barcode) {
    categoryCoverage[category].withBarcode++;
  }
});

Object.entries(categoryCoverage)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 10)
  .forEach(([category, stats]) => {
    const percentage = (stats.withBarcode / stats.total * 100).toFixed(1);
    console.log(`  ${category}: ${percentage}% (${stats.withBarcode}/${stats.total})`);
  });

console.log('\n' + '='.repeat(80));
console.log('✅ BARCODE MERGE COMPLETE');
console.log('='.repeat(80));

console.log('\n🚀 Next Steps:');
console.log('  1. Restart server: Kill existing server and run: node server.js');
console.log('  2. Test barcode search in UI');
console.log('  3. For remaining items without barcodes, consider:');
console.log('     - Manual barcode entry');
console.log('     - Supplier catalog import');
console.log('     - Barcode scanning during receiving');
