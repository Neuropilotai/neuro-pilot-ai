const fs = require('fs');
const path = require('path');

// Function to test comprehensive product consolidation and learning features
function testComprehensiveConsolidation() {
    console.log('🧠 TESTING COMPREHENSIVE PRODUCT CONSOLIDATION & LEARNING\n');

    // Load GFS orders
    const gfsOrdersDir = './data/gfs_orders';
    let gfsOrders = [];
    
    try {
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
            .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                gfsOrders.push(orderData);
            } catch (error) {
                console.error(`❌ Error reading ${file}:`, error.message);
            }
        }
    } catch (error) {
        console.error('❌ Error reading GFS orders directory:', error);
        return;
    }

    console.log(`📋 Loaded ${gfsOrders.length} GFS orders\n`);

    // Enhanced consolidation logic (matching the server)
    const consolidatedItems = {};
    let totalItems = 0;

    gfsOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                totalItems++;
                
                // Normalize product name by removing leading digits
                const normalizedName = item.productName.replace(/^[0-9]+/, '').trim();
                
                // Smart consolidation family logic
                const lowerName = normalizedName.toLowerCase();
                let consolidationCode = item.productCode;
                
                // Apply comprehensive product family grouping
                if (lowerName.includes('bacon raw')) {
                    consolidationCode = 'BACON_RAW';
                } else if (lowerName.includes('bacon')) {
                    consolidationCode = 'BACON_OTHER';
                } else if (lowerName.includes('chicken breast') || lowerName.includes('chkn brst')) {
                    consolidationCode = 'CHICKEN_BREAST';
                } else if (lowerName.includes('chicken') || lowerName.includes('chkn')) {
                    consolidationCode = 'CHICKEN_OTHER';
                } else if (lowerName.includes('beef') || lowerName.includes('ground beef')) {
                    consolidationCode = 'BEEF';
                } else if (lowerName.includes('pork')) {
                    consolidationCode = 'PORK';
                } else if (lowerName.includes('salmon') || lowerName.includes('fish salmon')) {
                    consolidationCode = 'SALMON';
                } else if (lowerName.includes('fish') || lowerName.includes('seafood')) {
                    consolidationCode = 'SEAFOOD';
                } else if (lowerName.includes('potato') || lowerName.includes('potatoes')) {
                    consolidationCode = 'POTATO';
                } else if (lowerName.includes('cheese') && lowerName.includes('cheddar')) {
                    consolidationCode = 'CHEESE_CHEDDAR';
                } else if (lowerName.includes('cheese') && lowerName.includes('mozzarella')) {
                    consolidationCode = 'CHEESE_MOZZARELLA';
                } else if (lowerName.includes('cheese')) {
                    consolidationCode = 'CHEESE_OTHER';
                } else if (lowerName.includes('oil') && lowerName.includes('olive')) {
                    consolidationCode = 'OIL_OLIVE';
                } else if (lowerName.includes('oil') && lowerName.includes('vegetable')) {
                    consolidationCode = 'OIL_VEGETABLE';
                } else if (lowerName.includes('oil')) {
                    consolidationCode = 'OIL_OTHER';
                } else if (lowerName.includes('apple') || lowerName.includes('apples')) {
                    consolidationCode = 'APPLE';
                } else if (lowerName.includes('banana') || lowerName.includes('bananas')) {
                    consolidationCode = 'BANANA';
                } else if (item.productCode && item.productCode.length >= 6) {
                    consolidationCode = item.productCode.substring(0, 4);
                }
                
                const key = `${normalizedName}_${consolidationCode}`.toLowerCase();
                
                if (consolidatedItems[key]) {
                    consolidatedItems[key].quantity += item.quantity || 0;
                    consolidatedItems[key].orderCount++;
                    consolidatedItems[key].orderQuantities.push(item.quantity || 0);
                    consolidatedItems[key].totalOrderValue += (item.quantity || 0) * (item.unitPrice || 0);
                    consolidatedItems[key].orderIds.push(order.orderId);
                } else {
                    consolidatedItems[key] = {
                        productName: normalizedName,
                        consolidationFamily: consolidationCode,
                        quantity: item.quantity || 0,
                        unit: item.unit || 'Each',
                        orderCount: 1,
                        orderQuantities: [item.quantity || 0],
                        totalOrderValue: (item.quantity || 0) * (item.unitPrice || 0),
                        orderIds: [order.orderId]
                    };
                }
            });
        }
    });

    const consolidatedCount = Object.keys(consolidatedItems).length;
    console.log(`🎯 CONSOLIDATION RESULTS:`);
    console.log(`   Total individual items: ${totalItems}`);
    console.log(`   Consolidated to: ${consolidatedCount} unique products`);
    console.log(`   Consolidation efficiency: ${((totalItems - consolidatedCount) / totalItems * 100).toFixed(1)}%\n`);

    // Show product families and their consolidation
    const familyGroups = {};
    Object.values(consolidatedItems).forEach(item => {
        if (!familyGroups[item.consolidationFamily]) {
            familyGroups[item.consolidationFamily] = [];
        }
        familyGroups[item.consolidationFamily].push(item);
    });

    console.log(`📊 PRODUCT FAMILY CONSOLIDATION (${Object.keys(familyGroups).length} families):\n`);
    
    // Show the most consolidated families
    const sortedFamilies = Object.entries(familyGroups)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 15); // Top 15 families

    sortedFamilies.forEach(([family, items]) => {
        if (items.length > 1) {
            console.log(`🏷️  ${family}: ${items.length} products consolidated`);
            
            let totalQuantity = 0;
            let totalOrders = 0;
            items.forEach(item => {
                totalQuantity += item.quantity;
                totalOrders += item.orderCount;
                console.log(`     • ${item.productName}: ${item.quantity} ${item.unit} (${item.orderCount} orders)`);
            });
            
            console.log(`     📈 Family Total: ${totalQuantity} units from ${totalOrders} orders`);
            
            // Calculate smart min/max for the family
            const allQuantities = items.flatMap(item => item.orderQuantities);
            const maxQty = Math.max(...allQuantities);
            const minQty = Math.min(...allQuantities);
            const avgQty = Math.round(allQuantities.reduce((sum, q) => sum + q, 0) / allQuantities.length);
            
            const smartMinQuantity = Math.max(Math.ceil(avgQty * 0.5), minQty, 1);
            const smartMaxQuantity = Math.max(maxQty + Math.ceil((maxQty - minQty) * 0.3), totalQuantity * 1.5, smartMinQuantity * 3);
            
            console.log(`     🎯 Smart Min/Max: ${smartMinQuantity} - ${smartMaxQuantity} units`);
            console.log();
        }
    });

    // Show learning insights
    console.log(`🧠 LEARNING INSIGHTS:\n`);
    
    const highFrequencyItems = Object.values(consolidatedItems).filter(item => item.orderCount > 5);
    const mediumFrequencyItems = Object.values(consolidatedItems).filter(item => item.orderCount > 2 && item.orderCount <= 5);
    const lowFrequencyItems = Object.values(consolidatedItems).filter(item => item.orderCount <= 2);
    
    console.log(`📊 Demand Patterns:`);
    console.log(`   High Frequency (>5 orders): ${highFrequencyItems.length} items`);
    console.log(`   Medium Frequency (3-5 orders): ${mediumFrequencyItems.length} items`);
    console.log(`   Low Frequency (1-2 orders): ${lowFrequencyItems.length} items\n`);
    
    if (highFrequencyItems.length > 0) {
        console.log(`🔥 TOP HIGH-FREQUENCY ITEMS (Critical for min/max):`);
        highFrequencyItems
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 5)
            .forEach((item, index) => {
                console.log(`   ${index + 1}. ${item.productName}`);
                console.log(`      Orders: ${item.orderCount} | Total: ${item.quantity} ${item.unit}`);
                console.log(`      Family: ${item.consolidationFamily}`);
            });
    }
    
    console.log(`\n✅ COMPREHENSIVE CONSOLIDATION COMPLETE!`);
    console.log(`   Ready for accurate min/max learning and AI optimization`);
}

// Run the comprehensive test
testComprehensiveConsolidation();