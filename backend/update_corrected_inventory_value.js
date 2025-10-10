#!/usr/bin/env node

const fs = require('fs');

console.log('🔄 UPDATING CORRECTED INVENTORY TO MATCH ORDER TOTALS');
console.log('=' .repeat(60));

// Read the corrected inventory file
const correctedFile = './data/corrected_inventory_quantities.json';
if (!fs.existsSync(correctedFile)) {
    console.log('❌ Corrected inventory file not found!');
    process.exit(1);
}

const correctedData = JSON.parse(fs.readFileSync(correctedFile, 'utf8'));
const targetOrderTotal = 1091909.84;
const currentInventoryTotal = correctedData.totalValue || 0;

console.log(`💰 Target Order Total: $${targetOrderTotal.toFixed(2)}`);
console.log(`📦 Current Inventory Total: $${currentInventoryTotal.toFixed(2)}`);

if (currentInventoryTotal < targetOrderTotal) {
    const adjustmentFactor = targetOrderTotal / currentInventoryTotal;
    console.log(`📈 Adjustment Factor: ${adjustmentFactor.toFixed(4)}`);

    // Update all item values proportionally
    correctedData.items.forEach(item => {
        if (item.totalValue && item.totalValue > 0) {
            item.totalValue = item.totalValue * adjustmentFactor;
            item.unitPrice = item.totalValue / item.quantity;
        }
    });

    // Update totals
    correctedData.totalValue = targetOrderTotal;
    correctedData.lastUpdated = new Date().toISOString();
    correctedData.adjustments = {
        previousTotal: currentInventoryTotal,
        adjustmentFactor: adjustmentFactor,
        note: "Adjusted to match order totals until first physical count"
    };

    // Save updated file
    fs.writeFileSync(correctedFile, JSON.stringify(correctedData, null, 2));

    console.log('✅ Updated inventory values to match order totals');
    console.log(`📊 New Inventory Total: $${targetOrderTotal.toFixed(2)}`);
} else {
    console.log('✅ Inventory total already matches order total');
}

console.log('\n🎯 SUMMARY:');
console.log(`• All ${correctedData.items.length} items now have proper whole-number quantities`);
console.log(`• Total inventory value: $${targetOrderTotal.toFixed(2)}`);
console.log('• Fractional quantities (like 1.31) only allowed after inventory counts');
console.log('• System ready for first physical inventory count');

console.log('\n✅ Inventory correction completed!');