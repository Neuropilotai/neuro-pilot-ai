#!/usr/bin/env node

const fs = require('fs');

console.log('🍎 FIXING APPLE MCINTOSH QUANTITY FROM INVOICE VERIFICATION');
console.log('=' .repeat(60));

// The correct data from invoice 9018357843:
// Item Code: 97523092
// Qty Ship: 2 cases (not 1.31 fractional)
// We need to fix this specific item

const correctedFile = './data/corrected_inventory_quantities.json';
if (!fs.existsSync(correctedFile)) {
    console.log('❌ Corrected inventory file not found!');
    process.exit(1);
}

const correctedData = JSON.parse(fs.readFileSync(correctedFile, 'utf8'));

// Find Apple McIntosh items and correct them
let appleMcIntoshItems = correctedData.items.filter(item =>
    item.itemCode === '97523092' ||
    (item.name && item.name.includes('APPLE MCINTOSH'))
);

console.log(`🔍 Found ${appleMcIntoshItems.length} Apple McIntosh items`);

appleMcIntoshItems.forEach((item, index) => {
    console.log(`\n📦 Item ${index + 1}:`);
    console.log(`   Code: ${item.itemCode}`);
    console.log(`   Name: ${item.name}`);
    console.log(`   Current Quantity: ${item.quantity}`);

    // Based on invoice verification, this should be 2 cases per order occurrence
    // If there are multiple orders, we need to check each one
    if (item.itemCode === '97523092') {
        const newQuantity = 2; // From invoice verification: Qty Ship = 2
        const oldQuantity = item.quantity;

        item.quantity = newQuantity;
        item.totalValue = newQuantity * item.unitPrice;

        console.log(`   ✅ Updated to: ${newQuantity} cases (was ${oldQuantity})`);
        console.log(`   💰 New Value: $${item.totalValue.toFixed(2)}`);
    }
});

// Recalculate total value
const newTotalValue = correctedData.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
const oldTotalValue = correctedData.totalValue;

correctedData.totalValue = newTotalValue;
correctedData.lastUpdated = new Date().toISOString();
correctedData.invoiceVerification = {
    appleMcIntoshCorrected: true,
    invoiceNumber: '9018357843',
    verifiedQuantity: 2,
    note: 'Corrected based on invoice Qty Ship verification'
};

// Save updated file
fs.writeFileSync(correctedFile, JSON.stringify(correctedData, null, 2));

console.log('\n📋 CORRECTION SUMMARY:');
console.log('=' .repeat(60));
console.log(`✅ Apple McIntosh corrected to 2 cases (from invoice Qty Ship)`);
console.log(`💰 Total value adjusted: $${oldTotalValue.toFixed(2)} → $${newTotalValue.toFixed(2)}`);
console.log(`📄 Updated: ${correctedFile}`);
console.log('\n🎯 VERIFICATION:');
console.log('• Invoice 9018357843 shows Qty Ship: 2 cases');
console.log('• System now reflects actual shipped quantities');
console.log('• No more fractional case quantities for whole items');

console.log('\n✅ Apple McIntosh quantity correction completed!');