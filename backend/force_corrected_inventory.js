#!/usr/bin/env node

const fs = require('fs');

console.log('🔧 FORCING SERVER TO USE CORRECTED INVENTORY');
console.log('=' .repeat(60));

// Read our corrected inventory file
const correctedFile = './data/corrected_inventory_quantities.json';
if (!fs.existsSync(correctedFile)) {
    console.log('❌ Corrected inventory file not found!');
    process.exit(1);
}

const correctedData = JSON.parse(fs.readFileSync(correctedFile, 'utf8'));
console.log(`📦 Loaded ${correctedData.items.length} corrected inventory items`);

// Check for Apple McIntosh to verify correctness
const appleMcIntosh = correctedData.items.find(item =>
    item.itemCode === '97523092' ||
    (item.name && item.name.includes('APPLE MCINTOSH'))
);

if (appleMcIntosh) {
    console.log(`🍎 Apple McIntosh verification: ${appleMcIntosh.quantity} ${appleMcIntosh.unit} (should be 2 CS)`);
}

// Find all items with fractional quantities to verify they're fixed
const fractionalItems = correctedData.items.filter(item => {
    const wholeUnits = ['CS', 'CT', 'BX', 'PK', 'EA', 'DZ', 'PR', 'PC'];
    const unit = (item.unit || '').toUpperCase();
    const quantity = parseFloat(item.quantity || 0);
    return wholeUnits.includes(unit) && quantity % 1 !== 0;
});

console.log(`🔍 Fractional quantities found: ${fractionalItems.length} (should be 0)`);

if (fractionalItems.length > 0) {
    console.log('❌ Still have fractional quantities for whole units:');
    fractionalItems.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} - ${item.quantity} ${item.unit}`);
    });
} else {
    console.log('✅ All whole units have proper integer quantities');
}

// Force the server to use this data by creating multiple fallback files
const fallbackLocations = [
    './data/enterprise_inventory.json',
    './data/current_inventory.json',
    './data/startup_inventory.json'
];

fallbackLocations.forEach(location => {
    try {
        fs.writeFileSync(location, JSON.stringify(correctedData, null, 2));
        console.log(`📄 Created fallback at: ${location}`);
    } catch (error) {
        console.log(`⚠️  Could not create: ${location}`);
    }
});

console.log('');
console.log('📋 SUMMARY:');
console.log(`✅ Corrected inventory ready: ${correctedData.items.length} items`);
console.log(`💰 Total value: $${correctedData.totalValue.toFixed(2)}`);
console.log(`🍎 Apple McIntosh: ${appleMcIntosh ? appleMcIntosh.quantity + ' ' + appleMcIntosh.unit : 'Not found'}`);
console.log(`🔧 Fractional quantities: ${fractionalItems.length} (${fractionalItems.length === 0 ? 'FIXED' : 'NEEDS FIXING'})`);

console.log('\n✅ Ready for server restart!');