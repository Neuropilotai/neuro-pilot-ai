const fs = require('fs');
const path = require('path');

console.log('🔍 EXTRACTING ALL BARCODES FROM ORDER DATA');
console.log('='.repeat(80));

const ordersDir = './data/gfs_orders';
const barcodeMapping = {};

// Read all order files
const orderFiles = fs.readdirSync(ordersDir).filter(file => file.endsWith('.json'));

console.log(`📋 Processing ${orderFiles.length} order files...`);

let totalItems = 0;
let itemsWithBarcodes = 0;

for (const file of orderFiles) {
  try {
    const filePath = path.join(ordersDir, file);
    const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        totalItems++;

        if (item.itemCode) {
          // Initialize if not exists
          if (!barcodeMapping[item.itemCode]) {
            barcodeMapping[item.itemCode] = {
              itemCode: item.itemCode,
              description: item.description || '',
              barcodes: new Set(),
              foundInInvoices: []
            };
          }

          // Add barcode if present and not empty
          if (item.barcode && item.barcode.trim() !== '') {
            barcodeMapping[item.itemCode].barcodes.add(item.barcode.trim());
            barcodeMapping[item.itemCode].foundInInvoices.push(orderData.invoiceNumber);
            itemsWithBarcodes++;
          }

          // Keep the most complete description
          if (item.description && item.description.length > barcodeMapping[item.itemCode].description.length) {
            barcodeMapping[item.itemCode].description = item.description;
          }
        }
      }
    }
  } catch (error) {
    console.log(`⚠️ Error processing ${file}:`, error.message);
  }
}

// Convert Sets to Arrays and create final mapping
const finalMapping = {};
const itemsWithBarcodesArray = [];

for (const [itemCode, data] of Object.entries(barcodeMapping)) {
  const barcodesArray = Array.from(data.barcodes);

  finalMapping[itemCode] = {
    itemCode: data.itemCode,
    description: data.description,
    barcode: barcodesArray.length > 0 ? barcodesArray[0] : '', // Use first barcode found
    allBarcodes: barcodesArray,
    foundInInvoices: data.foundInInvoices
  };

  if (barcodesArray.length > 0) {
    itemsWithBarcodesArray.push(finalMapping[itemCode]);
  }
}

console.log('📊 BARCODE EXTRACTION RESULTS:');
console.log(`Total Items Processed: ${totalItems}`);
console.log(`Unique Item Codes: ${Object.keys(barcodeMapping).length}`);
console.log(`Items with Barcodes: ${itemsWithBarcodesArray.length}`);
console.log(`Items without Barcodes: ${Object.keys(barcodeMapping).length - itemsWithBarcodesArray.length}`);

console.log('\n🏷️ ITEMS WITH BARCODES:');
itemsWithBarcodesArray
  .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
  .forEach(item => {
    console.log(`${item.itemCode}: ${item.barcode} - ${item.description.substring(0, 50)}...`);
  });

console.log('\n❌ ITEMS WITHOUT BARCODES (first 10):');
Object.values(finalMapping)
  .filter(item => item.allBarcodes.length === 0)
  .slice(0, 10)
  .forEach(item => {
    console.log(`${item.itemCode}: (no barcode) - ${item.description.substring(0, 50)}...`);
  });

// Save the mapping to a file
const outputFile = './data/barcode_mapping.json';
fs.writeFileSync(outputFile, JSON.stringify(finalMapping, null, 2));

console.log(`\n💾 Barcode mapping saved to: ${outputFile}`);

// Generate JavaScript mapping for the enterprise system
const jsMapping = {};
Object.values(finalMapping).forEach(item => {
  if (item.barcode) {
    jsMapping[item.itemCode] = item.barcode;
  }
});

console.log('\n📝 JAVASCRIPT BARCODE MAPPING FOR ENTERPRISE SYSTEM:');
console.log('const knownBarcodes = {');
Object.entries(jsMapping)
  .slice(0, 20) // Show first 20 for readability
  .forEach(([itemCode, barcode]) => {
    const description = finalMapping[itemCode].description.substring(0, 30);
    console.log(`  '${itemCode}': '${barcode}', // ${description}...`);
  });
if (Object.keys(jsMapping).length > 20) {
  console.log(`  // ... and ${Object.keys(jsMapping).length - 20} more items`);
}
console.log('};');

console.log(`\n✅ Found barcodes for ${Object.keys(jsMapping).length} items!`);