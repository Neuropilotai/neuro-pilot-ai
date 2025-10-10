const fs = require('fs');
const path = require('path');

// Function to debug bacon inventory consolidation
function debugBaconInventory() {
    console.log('🥓 DEBUGGING BACON INVENTORY CONSOLIDATION\n');

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

    // Collect all bacon items
    let allBaconItems = [];
    gfsOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                if (item.productName && item.productName.toLowerCase().includes('bacon')) {
                    allBaconItems.push({
                        orderId: order.orderId,
                        orderDate: order.orderDate,
                        productName: item.productName,
                        productCode: item.productCode || '',
                        quantity: item.quantity || 0,
                        unit: item.unit || '',
                        unitPrice: item.unitPrice || 0,
                        normalizedName: item.productName.replace(/^[0-9]+/, '').trim(),
                        consolidationKey: (() => {
                            const normalizedName = item.productName.replace(/^[0-9]+/, '').trim();
                            let consolidationCode = item.productCode || '';
                            if (normalizedName.toLowerCase().includes('bacon raw')) {
                                consolidationCode = 'BACON_RAW_18-22CT';
                            } else if (consolidationCode && consolidationCode.length >= 6) {
                                consolidationCode = consolidationCode.substring(0, 6);
                            }
                            return `${normalizedName}_${consolidationCode}`.toLowerCase();
                        })()
                    });
                }
            });
        }
    });

    console.log(`🔍 Found ${allBaconItems.length} bacon items across all orders:`);
    allBaconItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.productName} - ${item.quantity} ${item.unit} (Order: ${item.orderId})`);
        console.log(`     Consolidation Key: "${item.consolidationKey}"`);
        console.log();
    });

    // Simulate consolidation like the server does
    const consolidatedItems = {};
    
    allBaconItems.forEach(item => {
        const key = item.consolidationKey;
        
        if (consolidatedItems[key]) {
            consolidatedItems[key].quantity += item.quantity;
            consolidatedItems[key].totalValue += (item.quantity * item.unitPrice);
            consolidatedItems[key].orderIds.push(item.orderId);
            if (item.orderDate > consolidatedItems[key].lastOrderDate) {
                consolidatedItems[key].lastOrderDate = item.orderDate;
            }
        } else {
            consolidatedItems[key] = {
                productName: item.normalizedName,
                productCode: item.productCode,
                quantity: item.quantity,
                unit: item.unit,
                totalValue: item.quantity * item.unitPrice,
                orderIds: [item.orderId],
                lastOrderDate: item.orderDate || '1970-01-01'
            };
        }
    });

    console.log(`📊 CONSOLIDATED BACON INVENTORY (${Object.keys(consolidatedItems).length} unique products):`);
    console.log();
    
    Object.entries(consolidatedItems).forEach(([key, item], index) => {
        console.log(`${index + 1}. ${item.productName}`);
        console.log(`   Quantity: ${item.quantity} ${item.unit}`);
        console.log(`   Total Value: $${item.totalValue.toFixed(2)}`);
        console.log(`   From Orders: ${item.orderIds.length} orders`);
        console.log(`   Key: "${key}"`);
        console.log();
    });

    // Show the issue with prefixes
    console.log('🔍 ANALYSIS OF BACON PRODUCT NAME VARIATIONS:');
    const baconVariations = {};
    allBaconItems.forEach(item => {
        const baseName = item.productName.replace(/^[0-9]/g, ''); // Remove leading digits
        if (!baconVariations[baseName]) {
            baconVariations[baseName] = [];
        }
        baconVariations[baseName].push({
            fullName: item.productName,
            quantity: item.quantity,
            orderId: item.orderId
        });
    });

    Object.entries(baconVariations).forEach(([baseName, items]) => {
        if (items.length > 1) {
            console.log(`\n📝 Base Product: "${baseName}"`);
            console.log('   Variations found:');
            items.forEach(item => {
                console.log(`     - "${item.fullName}" (${item.quantity} units from ${item.orderId})`);
            });
            const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
            console.log(`   🔢 Total if consolidated: ${totalQty} units`);
        }
    });
}

// Run the debug
debugBaconInventory();