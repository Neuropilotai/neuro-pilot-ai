const fs = require('fs');
const path = require('path');

console.log('🔧 FIXING MISSING BARCODES IN MAPPING');
console.log('='.repeat(80));

// Manual barcode overrides from enterprise system
const manualBarcodeOverrides = {
  '1030954': '10057483521109', // PASTRY BRIOCHE CINN RTB
  '8780438': '90065137513642', // TURKEY BRST RST CKD SMKD B/S 19PCT FRSH
  '1206417': '10061853000972', // BACON RAW 18-22CT SLCD L/O FRSH
};

function fixBarcodeMapping() {
  try {
    const barcodeFile = path.join('./data', 'barcode_mapping.json');

    if (!fs.existsSync(barcodeFile)) {
      console.log('❌ Barcode mapping file not found');
      return false;
    }

    console.log('📋 Loading current barcode mapping...');
    const barcodeData = JSON.parse(fs.readFileSync(barcodeFile, 'utf8'));

    console.log(`✓ Loaded ${Object.keys(barcodeData).length} items`);

    let updatedCount = 0;

    // Update items with manual overrides
    for (const [itemCode, barcode] of Object.entries(manualBarcodeOverrides)) {
      if (barcodeData[itemCode]) {
        console.log(`🔄 Updating ${itemCode}: "${barcodeData[itemCode].barcode}" → "${barcode}"`);

        barcodeData[itemCode].barcode = barcode;

        // Add to allBarcodes if not already there
        if (!barcodeData[itemCode].allBarcodes.includes(barcode)) {
          barcodeData[itemCode].allBarcodes.push(barcode);
        }

        // Update description with clean name
        if (itemCode === '1206417') {
          barcodeData[itemCode].description = 'BACON RAW 18-22CT SLCD L/O FRSH';
        } else if (itemCode === '1030954') {
          barcodeData[itemCode].description = 'PASTRY BRIOCHE CINN RTB';
        } else if (itemCode === '8780438') {
          barcodeData[itemCode].description = 'TURKEY BRST RST CKD SMKD B/S 19PCT FRSH';
        }

        updatedCount++;
      } else {
        console.log(`⚠️ Item ${itemCode} not found in barcode mapping`);
      }
    }

    // Create backup
    const backupFile = path.join('./data', `barcode_mapping_backup_${Date.now()}.json`);
    fs.copyFileSync(barcodeFile, backupFile);
    console.log(`💾 Backup created: ${backupFile}`);

    // Save updated mapping
    fs.writeFileSync(barcodeFile, JSON.stringify(barcodeData, null, 2));
    console.log('✅ Updated barcode mapping saved');

    console.log('\n📊 SUMMARY:');
    console.log(`  Items updated: ${updatedCount}`);
    console.log(`  Manual overrides applied: ${Object.keys(manualBarcodeOverrides).length}`);

    // Verify the updates
    console.log('\n🔍 VERIFICATION:');
    const verifyData = JSON.parse(fs.readFileSync(barcodeFile, 'utf8'));
    for (const [itemCode, expectedBarcode] of Object.entries(manualBarcodeOverrides)) {
      const actualBarcode = verifyData[itemCode]?.barcode;
      const status = actualBarcode === expectedBarcode ? '✅' : '❌';
      console.log(`  ${itemCode}: ${status} ${actualBarcode}`);
    }

    return true;

  } catch (error) {
    console.error('❌ Error fixing barcode mapping:', error.message);
    return false;
  }
}

// Run the fix
if (require.main === module) {
  fixBarcodeMapping();
}

module.exports = { fixBarcodeMapping };