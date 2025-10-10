const fs = require('fs');
const path = require('path');

// Function to verify Apple Golden Delicious quantities by tracing through orders
function verifyAppleGoldenDelicious() {
    console.log('🍎 VERIFYING APPLE GOLDEN DELICIOUS QUANTITIES BY ITEM NUMBER\n');

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

    // Search for Apple Golden Delicious in all orders
    let appleGoldenItems = [];
    let allAppleItems = [];
    
    gfsOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                // Check for Apple Golden Delicious specifically
                if (item.productName && item.productName.toLowerCase().includes('apple') && 
                    item.productName.toLowerCase().includes('golden') && 
                    item.productName.toLowerCase().includes('delicious')) {
                    
                    appleGoldenItems.push({
                        orderId: order.orderId,
                        orderDate: order.orderDate,
                        productName: item.productName,
                        productCode: item.productCode,
                        quantity: item.quantity || 0,
                        unit: item.unit || 'Each',
                        unitPrice: item.unitPrice || 0,
                        totalPrice: item.totalPrice || 0,
                        originalName: item.productName // Keep original before normalization
                    });
                }
                
                // Also collect all apple-related items for comparison
                if (item.productName && item.productName.toLowerCase().includes('apple')) {
                    allAppleItems.push({
                        orderId: order.orderId,
                        orderDate: order.orderDate,
                        productName: item.productName,
                        productCode: item.productCode,
                        quantity: item.quantity || 0,
                        unit: item.unit || 'Each',
                        unitPrice: item.unitPrice || 0,
                        originalName: item.productName,
                        normalizedName: item.productName.replace(/^[0-9]+/, '').trim()
                    });
                }
            });
        }
    });

    console.log(`🔍 APPLE GOLDEN DELICIOUS VERIFICATION:\n`);
    
    if (appleGoldenItems.length === 0) {
        console.log('❌ No direct "Apple Golden Delicious" items found in orders.');
        console.log('Let me check for variations and normalized names...\n');
        
        // Check for variations that might normalize to "APPLE GOLDEN DELICIOUS"
        const goldenAppleVariations = allAppleItems.filter(item => 
            item.normalizedName.toLowerCase().includes('apple') && 
            item.normalizedName.toLowerCase().includes('golden') && 
            item.normalizedName.toLowerCase().includes('delicious')
        );
        
        if (goldenAppleVariations.length > 0) {
            console.log(`📝 Found ${goldenAppleVariations.length} Apple Golden Delicious variations:\n`);
            
            let totalQuantity = 0;
            goldenAppleVariations.forEach((item, index) => {
                console.log(`${index + 1}. Order: ${item.orderId} (${item.orderDate})`);
                console.log(`   Original Name: "${item.originalName}"`);
                console.log(`   Normalized Name: "${item.normalizedName}"`);
                console.log(`   Product Code: ${item.productCode}`);
                console.log(`   Quantity: ${item.quantity} ${item.unit}`);
                console.log(`   Unit Price: $${item.unitPrice}`);
                console.log();
                totalQuantity += item.quantity;
            });
            
            console.log(`📊 TOTAL APPLE GOLDEN DELICIOUS: ${totalQuantity} CS`);
            console.log(`📈 From ${goldenAppleVariations.length} order entries`);
            
        } else {
            console.log('❌ No Apple Golden Delicious variations found.');
        }
    } else {
        console.log(`✅ Found ${appleGoldenItems.length} Apple Golden Delicious entries:\n`);
        
        let totalQuantity = 0;
        appleGoldenItems.forEach((item, index) => {
            console.log(`${index + 1}. Order: ${item.orderId} (${item.orderDate})`);
            console.log(`   Product: ${item.productName}`);
            console.log(`   Product Code: ${item.productCode}`);
            console.log(`   Quantity: ${item.quantity} ${item.unit}`);
            console.log(`   Unit Price: $${item.unitPrice}`);
            console.log();
            totalQuantity += item.quantity;
        });
        
        console.log(`📊 TOTAL APPLE GOLDEN DELICIOUS: ${totalQuantity} CS`);
    }

    // Show all apple items for context
    console.log(`\n🍏 ALL APPLE ITEMS IN ORDERS (for context):\n`);
    
    // Group by normalized name
    const appleGroups = {};
    allAppleItems.forEach(item => {
        const key = item.normalizedName.toLowerCase();
        if (!appleGroups[key]) {
            appleGroups[key] = [];
        }
        appleGroups[key].push(item);
    });
    
    Object.entries(appleGroups).forEach(([normalizedName, items]) => {
        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        console.log(`🍎 "${items[0].normalizedName}"`);
        console.log(`   Total Quantity: ${totalQty} units from ${items.length} orders`);
        console.log(`   Product Codes: ${[...new Set(items.map(item => item.productCode))].join(', ')}`);
        console.log(`   Original Names: ${[...new Set(items.map(item => item.originalName))].slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''}`);
        console.log();
    });

    console.log(`\n✅ VERIFICATION COMPLETE`);
    console.log(`Expected inventory display: The system should show the consolidated total based on normalized product names.`);
}

// Run the verification
verifyAppleGoldenDelicious();