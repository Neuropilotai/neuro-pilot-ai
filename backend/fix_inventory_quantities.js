#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 INVENTORY QUANTITY ANALYSIS & CORRECTION');
console.log('=' .repeat(60));

// Read all order files to get expected quantities
const ordersDir = './data/gfs_orders';
const orderFiles = fs.existsSync(ordersDir) ? fs.readdirSync(ordersDir).filter(f => f.endsWith('.json')) : [];

// Track all items from orders
const expectedInventory = new Map();
let totalOrderValue = 0;
let processedFiles = 0;

console.log(`📦 Processing ${orderFiles.length} order files...`);

orderFiles.forEach(file => {
    try {
        const orderData = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));

        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach(item => {
                const itemCode = item.itemCode || item.id;
                const quantity = parseFloat(item.quantity || 0);
                const price = parseFloat(item.unitPrice || item.price || 0);

                if (itemCode && quantity > 0) {
                    if (expectedInventory.has(itemCode)) {
                        const existing = expectedInventory.get(itemCode);
                        existing.quantity += quantity;
                        existing.totalValue += (quantity * price);
                        existing.orderCount++;
                    } else {
                        expectedInventory.set(itemCode, {
                            itemCode: itemCode,
                            name: item.name || item.description,
                            quantity: quantity,
                            unitPrice: price,
                            totalValue: quantity * price,
                            orderCount: 1,
                            unit: item.unit || 'CS'
                        });
                    }
                }
            });

            totalOrderValue += parseFloat(orderData.total || orderData.totalValue || 0);
            processedFiles++;
        }
    } catch (error) {
        console.log(`⚠️  Skipping ${file}: ${error.message}`);
    }
});

console.log(`✅ Processed ${processedFiles} order files`);
console.log(`📊 Found ${expectedInventory.size} unique items`);
console.log(`💰 Total Order Value: $${totalOrderValue.toFixed(2)}`);
console.log('');

// Analyze quantity issues
const fractionalItems = [];
const roundedItems = [];

expectedInventory.forEach((item, itemCode) => {
    const originalQty = item.quantity;

    // Check if quantity has fractional part
    if (originalQty % 1 !== 0) {
        fractionalItems.push({
            itemCode,
            name: item.name,
            originalQty,
            suggestedQty: Math.ceil(originalQty), // Round up to ensure we have enough
            difference: Math.ceil(originalQty) - originalQty
        });

        // Update to rounded quantity
        item.quantity = Math.ceil(originalQty);
        item.totalValue = item.quantity * item.unitPrice;
        roundedItems.push(item);
    }
});

console.log('🔍 QUANTITY ANALYSIS RESULTS:');
console.log('-'.repeat(60));

if (fractionalItems.length > 0) {
    console.log(`❌ Found ${fractionalItems.length} items with fractional quantities:`);
    console.log('');

    fractionalItems.forEach(item => {
        console.log(`  📦 ${item.name}`);
        console.log(`     Item Code: ${item.itemCode}`);
        console.log(`     Original: ${item.originalQty}`);
        console.log(`     Fixed to: ${item.suggestedQty}`);
        console.log(`     Added: +${item.difference.toFixed(2)}`);
        console.log('');
    });
} else {
    console.log('✅ No fractional quantities found in orders');
}

// Create corrected inventory data
const correctedInventory = [];
let correctedTotalValue = 0;

expectedInventory.forEach((item) => {
    const correctedItem = {
        id: item.itemCode,
        itemCode: item.itemCode,
        name: item.name,
        quantity: item.quantity, // Already rounded up if needed
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalValue: item.totalValue,
        location: 'DRY_STORAGE_C1', // Default location until assigned
        lastUpdated: new Date().toISOString().split('T')[0],
        source: 'ORDERS',
        orderCount: item.orderCount
    };

    correctedInventory.push(correctedItem);
    correctedTotalValue += correctedItem.totalValue;
});

// Save corrected inventory
const correctedFile = './data/corrected_inventory_quantities.json';
fs.writeFileSync(correctedFile, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalItems: correctedInventory.length,
    totalValue: correctedTotalValue,
    source: 'ORDER_BASED_CORRECTED',
    corrections: {
        fractionalItemsFixed: fractionalItems.length,
        totalAdjustment: fractionalItems.reduce((sum, item) => sum + item.difference, 0)
    },
    items: correctedInventory
}, null, 2));

// Update unified system totals
const unifiedTotalsPath = './data/unified_system_totals.json';
if (fs.existsSync(unifiedTotalsPath)) {
    const unifiedTotals = JSON.parse(fs.readFileSync(unifiedTotalsPath, 'utf8'));

    unifiedTotals.inventory.totalValue = correctedTotalValue;
    unifiedTotals.inventory.uniqueItems = correctedInventory.length;
    unifiedTotals.inventory.itemsWithPositiveQty = correctedInventory.length;
    unifiedTotals.inventory.note = "Corrected - all fractional quantities rounded up";
    unifiedTotals.lastCalculated = new Date().toISOString();

    fs.writeFileSync(unifiedTotalsPath, JSON.stringify(unifiedTotals, null, 2));
    console.log('✅ Updated unified system totals');
}

console.log('📋 CORRECTION SUMMARY:');
console.log('=' .repeat(60));
console.log(`🔧 Items corrected: ${fractionalItems.length}`);
console.log(`📦 Total inventory items: ${correctedInventory.length}`);
console.log(`💰 Corrected total value: $${correctedTotalValue.toFixed(2)}`);
console.log(`📄 Saved to: ${correctedFile}`);
console.log('');

if (fractionalItems.length > 0) {
    console.log('🎯 RECOMMENDATIONS:');
    console.log('• Fractional quantities have been rounded UP to ensure adequate stock');
    console.log('• Only physical inventory counts should create fractional quantities');
    console.log('• Review ordering processes to avoid fractional order quantities');
    console.log('• Use this corrected data as baseline until first physical count');
}

console.log('\n✅ Inventory quantity correction completed!');