#!/usr/bin/env node

const fs = require('fs');

console.log('🔧 FIXING ALL FRACTIONAL QUANTITIES FOR WHOLE UNITS');
console.log('=' .repeat(60));

// Units that should NEVER have fractional quantities
const wholeUnits = ['CS', 'CT', 'BX', 'PK', 'EA', 'DZ', 'PR', 'PC'];

const correctedFile = './data/corrected_inventory_quantities.json';
if (!fs.existsSync(correctedFile)) {
    console.log('❌ Corrected inventory file not found!');
    process.exit(1);
}

const correctedData = JSON.parse(fs.readFileSync(correctedFile, 'utf8'));
let itemsFixed = 0;
let totalAdjustment = 0;

console.log(`📦 Analyzing ${correctedData.items.length} inventory items...`);
console.log('');

// Find all items with fractional quantities that should be whole
const fractionalItems = correctedData.items.filter(item => {
    const unit = (item.unit || '').toUpperCase();
    const quantity = parseFloat(item.quantity || 0);
    return wholeUnits.includes(unit) && quantity % 1 !== 0;
});

console.log(`🚨 Found ${fractionalItems.length} items with invalid fractional quantities:`);
console.log('');

fractionalItems.forEach((item, index) => {
    const oldQuantity = item.quantity;
    const newQuantity = Math.ceil(oldQuantity); // Round UP to ensure adequate stock
    const adjustment = newQuantity - oldQuantity;

    console.log(`${index + 1}. ${item.name}`);
    console.log(`   Code: ${item.itemCode}`);
    console.log(`   Unit: ${item.unit} (whole unit - cannot be fractional)`);
    console.log(`   Old Quantity: ${oldQuantity}`);
    console.log(`   New Quantity: ${newQuantity}`);
    console.log(`   Adjustment: +${adjustment.toFixed(3)}`);
    console.log(`   Old Value: $${item.totalValue.toFixed(2)}`);

    // Update the item
    item.quantity = newQuantity;
    item.totalValue = newQuantity * item.unitPrice;

    console.log(`   New Value: $${item.totalValue.toFixed(2)}`);
    console.log('');

    itemsFixed++;
    totalAdjustment += adjustment;
});

// Recalculate total inventory value
const newTotalValue = correctedData.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
const oldTotalValue = correctedData.totalValue;

// Update metadata
correctedData.totalValue = newTotalValue;
correctedData.totalQuantity = correctedData.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
correctedData.lastUpdated = new Date().toISOString();
correctedData.fractionalQuantityFix = {
    itemsFixed: itemsFixed,
    totalQuantityAdjustment: totalAdjustment,
    wholeUnitsFixed: wholeUnits,
    note: 'All whole units (CS, CT, BX, PK, EA, DZ, PR, PC) now have proper integer quantities'
};

// Save updated file
fs.writeFileSync(correctedFile, JSON.stringify(correctedData, null, 2));

console.log('📋 COMPREHENSIVE FIX SUMMARY:');
console.log('=' .repeat(60));
console.log(`✅ Items fixed: ${itemsFixed}`);
console.log(`📦 Total quantity adjustment: +${totalAdjustment.toFixed(3)} units`);
console.log(`💰 Total value: $${oldTotalValue.toFixed(2)} → $${newTotalValue.toFixed(2)}`);
console.log(`📊 Value adjustment: $${(newTotalValue - oldTotalValue).toFixed(2)}`);
console.log('');

console.log('🎯 UNITS FIXED:');
wholeUnits.forEach(unit => {
    const fixedForUnit = fractionalItems.filter(item => (item.unit || '').toUpperCase() === unit).length;
    if (fixedForUnit > 0) {
        console.log(`   ${unit}: ${fixedForUnit} items fixed`);
    }
});

console.log('');
console.log('✅ PRINCIPLE ENFORCED:');
console.log('• Cases (CS), Cartons (CT), Boxes (BX) = Whole numbers only');
console.log('• Packages (PK), Each (EA), Dozen (DZ) = Whole numbers only');
console.log('• Pairs (PR), Pieces (PC) = Whole numbers only');
console.log('• Fractional quantities only allowed for weight/volume units after physical count');

console.log('\n✅ All fractional quantity issues fixed!');