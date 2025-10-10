#!/usr/bin/env node

const fs = require('fs');

console.log('Converting corrected inventory to FIFO format...');

// Load the corrected inventory
const correctedData = JSON.parse(fs.readFileSync('./data/clean_recalculated_inventory.json', 'utf8'));

// Convert to FIFO format
const fifoInventory = {
  inventory: correctedData.items.map(item => [
    item.itemCode,
    {
      description: item.name,
      totalQuantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      location: item.location || 'DRY_STORAGE_C1',
      lastUpdated: item.lastUpdated,
      batches: [{
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        pricePerUnit: item.unitPrice, // Add pricePerUnit for compatibility
        receivedDate: item.lastUpdated,
        expirationDate: null,
        location: item.location || 'DRY_STORAGE_C1'
      }],
      pricePerUnit: item.unitPrice // Also add at root level
    }
  ])
};

// Save as FIFO inventory
fs.writeFileSync('./data/fifo_inventory.json', JSON.stringify(fifoInventory, null, 2));

console.log(`✅ Converted ${correctedData.items.length} items to FIFO format`);
console.log('📁 Saved to ./data/fifo_inventory.json');

// Verify Apple McIntosh
const appleMcIntosh = fifoInventory.inventory.find(([code]) => code === '97523092');
if (appleMcIntosh) {
  console.log(`\n🍎 Apple McIntosh verified:`);
  console.log(`   Name: ${appleMcIntosh[1].description}`);
  console.log(`   Quantity: ${appleMcIntosh[1].totalQuantity} ${appleMcIntosh[1].unit}`);
  console.log(`   Unit Price: $${appleMcIntosh[1].unitPrice}`);
}

// Verify BEEF PASTRAMI
const beefPastrami = fifoInventory.inventory.find(([code]) => code === '13316352');
if (beefPastrami) {
  console.log(`\n🥩 Beef Pastrami verified:`);
  console.log(`   Name: ${beefPastrami[1].description}`);
  console.log(`   Quantity: ${beefPastrami[1].totalQuantity} ${beefPastrami[1].unit}`);
  console.log(`   Unit Price: $${beefPastrami[1].unitPrice}`);
}