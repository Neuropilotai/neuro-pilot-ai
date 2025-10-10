const fs = require('fs');
const path = require('path');

// Function to calculate total value of all orders
function calculateTotalOrderValue() {
    console.log('💰 CALCULATING TOTAL VALUE OF ALL ORDERS\n');

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

    let grandTotalValue = 0;
    let totalRegularOrders = 0;
    let totalCreditOrders = 0;
    let regularOrdersValue = 0;
    let creditOrdersValue = 0;
    let totalItems = 0;
    let ordersWithNoValue = 0;

    const orderSummary = [];

    console.log('📊 ORDER-BY-ORDER BREAKDOWN:\n');

    gfsOrders.forEach((order, index) => {
        let orderTotal = 0;
        let itemCount = 0;

        // Calculate order total from items
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
                orderTotal += itemTotal;
                itemCount++;
            });
        }

        // Use stored totalValue, invoiceTotal, or subtotal if available and items calculation is 0
        if (orderTotal === 0) {
            if (order.invoiceTotal && order.invoiceTotal !== 0) {
                orderTotal = order.invoiceTotal;
            } else if (order.totalValue && order.totalValue !== 0) {
                orderTotal = order.totalValue;
            } else if (order.subtotal && order.subtotal !== 0) {
                // For credit memos, use subtotal (typically negative)
                orderTotal = order.subtotal;
            }
        }

        const isCredit = order.type === 'credit' || order.status === 'credit' || orderTotal < 0;
        const orderType = isCredit ? 'CREDIT' : 'REGULAR';
        const displayValue = Math.abs(orderTotal);

        const orderId = order.invoiceNumber || order.orderId || 'N/A';
        console.log(`${index + 1}. ${orderId} (${order.orderDate || 'No date'})`);
        console.log(`   Type: ${orderType} | Items: ${itemCount} | Value: ${isCredit ? '-' : ''}$${displayValue.toFixed(2)}`);
        console.log(`   Invoice: ${order.invoiceNumber || 'N/A'} | File: ${order.originalFileName || 'N/A'}`);

        if (orderTotal === 0) {
            ordersWithNoValue++;
            console.log(`   ⚠️  Zero value order`);
        }

        console.log();

        // Accumulate totals
        grandTotalValue += orderTotal;
        totalItems += itemCount;

        if (isCredit) {
            totalCreditOrders++;
            creditOrdersValue += Math.abs(orderTotal);
        } else {
            totalRegularOrders++;
            regularOrdersValue += orderTotal;
        }

        orderSummary.push({
            orderId: orderId,
            orderDate: order.orderDate,
            type: orderType,
            value: orderTotal,
            itemCount: itemCount,
            invoiceNumber: order.invoiceNumber
        });
    });

    console.log('\n' + '='.repeat(60));
    console.log('📈 GRAND TOTAL SUMMARY');
    console.log('='.repeat(60));
    console.log();

    console.log(`📋 Order Counts:`);
    console.log(`   Total Orders: ${gfsOrders.length}`);
    console.log(`   Regular Orders: ${totalRegularOrders}`);
    console.log(`   Credit Orders: ${totalCreditOrders}`);
    console.log(`   Zero Value Orders: ${ordersWithNoValue}`);
    console.log();

    console.log(`💰 Financial Summary:`);
    console.log(`   Regular Orders Total: $${regularOrdersValue.toFixed(2)}`);
    console.log(`   Credits/Refunds Total: -$${creditOrdersValue.toFixed(2)}`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   NET TOTAL VALUE: $${grandTotalValue.toFixed(2)}`);
    console.log();

    console.log(`📦 Items Summary:`);
    console.log(`   Total Items Across All Orders: ${totalItems.toLocaleString()}`);
    console.log(`   Average Items per Order: ${(totalItems / gfsOrders.length).toFixed(1)}`);
    console.log();

    console.log(`📊 Statistics:`);
    console.log(`   Average Regular Order Value: $${totalRegularOrders > 0 ? (regularOrdersValue / totalRegularOrders).toFixed(2) : '0.00'}`);
    console.log(`   Average Credit Value: $${totalCreditOrders > 0 ? (creditOrdersValue / totalCreditOrders).toFixed(2) : '0.00'}`);
    console.log(`   Net Average per Order: $${(grandTotalValue / gfsOrders.length).toFixed(2)}`);
    console.log();

    // Show top 5 highest value orders
    const topOrders = orderSummary
        .filter(order => order.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    if (topOrders.length > 0) {
        console.log(`🏆 TOP 5 HIGHEST VALUE ORDERS:`);
        topOrders.forEach((order, index) => {
            console.log(`   ${index + 1}. ${order.orderId}: $${order.value.toFixed(2)} (${order.itemCount} items)`);
        });
        console.log();
    }

    // Monthly breakdown if we have dates
    const monthlyBreakdown = {};
    orderSummary.forEach(order => {
        if (order.orderDate && order.orderDate !== '') {
            const month = order.orderDate.substring(0, 7); // YYYY-MM
            if (!monthlyBreakdown[month]) {
                monthlyBreakdown[month] = { count: 0, value: 0, regularCount: 0, creditCount: 0 };
            }
            monthlyBreakdown[month].count++;
            monthlyBreakdown[month].value += order.value;
            if (order.type === 'CREDIT') {
                monthlyBreakdown[month].creditCount++;
            } else {
                monthlyBreakdown[month].regularCount++;
            }
        }
    });

    if (Object.keys(monthlyBreakdown).length > 0) {
        console.log(`📅 MONTHLY BREAKDOWN:`);
        Object.entries(monthlyBreakdown)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([month, data]) => {
                console.log(`   ${month}: ${data.count} orders | $${data.value.toFixed(2)} | ${data.regularCount} regular, ${data.creditCount} credits`);
            });
        console.log();
    }

    console.log(`✅ CALCULATION COMPLETE`);
    console.log(`💵 FINAL TOTAL: $${grandTotalValue.toFixed(2)}`);

    return {
        grandTotal: grandTotalValue,
        regularOrdersValue,
        creditOrdersValue,
        totalOrders: gfsOrders.length,
        totalItems
    };
}

// Run the calculation
const result = calculateTotalOrderValue();
console.log(`\n🎯 RESULT: Total value of all orders is $${result.grandTotal.toFixed(2)}`);