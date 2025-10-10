const fs = require('fs');
const path = require('path');

// Function to load all GFS orders and calculate totals
function calculateOrderTotals() {
    const gfsOrdersDir = './data/gfs_orders';
    let totalValue = 0;
    let totalOrders = 0;
    let totalItems = 0;
    let creditTotal = 0;
    let regularTotal = 0;

    try {
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
            .filter(file => !file.includes('corrupted')) // Skip corrupted files
            .filter(file => !file.includes('deleted_')); // Skip deleted files

        console.log(`\n📋 Processing ${files.length} clean GFS orders...\n`);

        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                let orderTotal = 0;
                if (orderData.items && Array.isArray(orderData.items)) {
                    orderTotal = orderData.items.reduce((sum, item) => {
                        const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
                        return sum + itemTotal;
                    }, 0);
                }

                // Track credit vs regular orders
                if (orderData.type === 'credit' || orderData.status === 'credit') {
                    creditTotal += orderTotal;
                    console.log(`💳 Credit: ${orderData.orderId} = -$${orderTotal.toFixed(2)}`);
                    orderTotal = -orderTotal; // Credits are negative
                } else {
                    regularTotal += orderTotal;
                    console.log(`📦 Order: ${orderData.orderId} = $${orderTotal.toFixed(2)}`);
                }

                totalValue += orderTotal;
                totalOrders++;
                totalItems += orderData.items ? orderData.items.length : 0;

            } catch (error) {
                console.error(`❌ Error processing ${file}:`, error.message);
            }
        }

        console.log(`\n📊 TOTALS SUMMARY:`);
        console.log(`   Regular orders value: $${regularTotal.toFixed(2)}`);
        console.log(`   Credits/refunds value: -$${creditTotal.toFixed(2)}`);
        console.log(`   ═══════════════════════════════════`);
        console.log(`   NET TOTAL VALUE: $${totalValue.toFixed(2)}`);
        console.log(`   Total orders processed: ${totalOrders}`);
        console.log(`   Total items: ${totalItems}`);
        console.log(`\n🎯 Expected: $694,265.83`);
        console.log(`🔍 Actual:   $${totalValue.toFixed(2)}`);
        console.log(`📈 Difference: $${(totalValue - 694265.83).toFixed(2)}`);
        
        return { totalValue, totalOrders, totalItems, creditTotal, regularTotal };

    } catch (error) {
        console.error('❌ Error calculating totals:', error);
        return null;
    }
}

// Run the calculation
calculateOrderTotals();