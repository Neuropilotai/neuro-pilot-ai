#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 REBUILDING BARCODE MAPPING FROM FIFO INVENTORY');
console.log('='.repeat(60));

// Load FIFO inventory
const fifoPath = path.join(__dirname, 'data/fifo_inventory.json');
if (!fs.existsSync(fifoPath)) {
  console.error('❌ FIFO inventory not found!');
  process.exit(1);
}

const fifoData = JSON.parse(fs.readFileSync(fifoPath, 'utf8'));
const barcodeMapping = {};

// Build barcode mapping from FIFO inventory
let itemCount = 0;
for (const [itemCode, itemData] of fifoData.inventory) {
  if (itemCode && itemData && itemData.description) {
    barcodeMapping[itemCode] = {
      description: itemData.description,
      unit: itemData.unit || 'EA',
      unitPrice: itemData.unitPrice || itemData.pricePerUnit || 0,
      location: itemData.location || 'UNKNOWN',
      category: categorizeItem(itemData.description)
    };
    itemCount++;
  }
}

// Function to categorize items
function categorizeItem(description) {
  const desc = (description || '').toLowerCase();

  if (desc.includes('beef') || desc.includes('chicken') || desc.includes('pork') ||
      desc.includes('bacon') || desc.includes('meat') || desc.includes('turkey')) {
    return 'MEAT';
  } else if (desc.includes('milk') || desc.includes('cheese') || desc.includes('yogurt') ||
             desc.includes('butter') || desc.includes('cream')) {
    return 'DAIRY';
  } else if (desc.includes('apple') || desc.includes('banana') || desc.includes('orange') ||
             desc.includes('tomato') || desc.includes('lettuce') || desc.includes('potato') ||
             desc.includes('onion') || desc.includes('carrot')) {
    return 'PRODUCE';
  } else if (desc.includes('bread') || desc.includes('bagel') || desc.includes('muffin') ||
             desc.includes('cake') || desc.includes('pastry')) {
    return 'BAKERY';
  } else if (desc.includes('frozen')) {
    return 'FROZEN';
  } else if (desc.includes('sauce') || desc.includes('spice') || desc.includes('salt') ||
             desc.includes('pepper') || desc.includes('seasoning')) {
    return 'CONDIMENTS';
  }

  return 'GENERAL';
}

// Save barcode mapping
const barcodePath = path.join(__dirname, 'data/barcode_mapping.json');
fs.writeFileSync(barcodePath, JSON.stringify(barcodeMapping, null, 2));

console.log(`✅ Rebuilt barcode mapping with ${itemCount} items`);
console.log(`📁 Saved to: ${barcodePath}`);

// Display sample items
console.log('\n📦 Sample Items:');
const sampleItems = Object.entries(barcodeMapping).slice(0, 5);
for (const [code, data] of sampleItems) {
  console.log(`  ${code}: ${data.description} - $${data.unitPrice.toFixed(2)}/${data.unit}`);
}

console.log('\n✅ Barcode mapping successfully rebuilt!');