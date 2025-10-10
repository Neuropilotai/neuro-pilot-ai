const fs = require('fs');
const path = require('path');

// Function to fix invoice 9018357846 - convert from credit to regular order
function fixInvoice9018357846() {
    console.log('🔧 FIXING INVOICE 9018357846 - CONVERTING FROM CREDIT TO REGULAR ORDER\n');

    const filePath = './data/gfs_orders/gfs_order_GFS_20250909_9018357846.json';
    
    try {
        const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`📋 Current data for invoice ${orderData.invoiceNumber}:`);
        console.log(`   Current Status: ${orderData.status} (${orderData.type})`);
        console.log(`   Current Total: $${orderData.totalValue}`);
        console.log(`   Should be: Regular order from 01/18/2025, $387.00`);
        console.log();

        // Convert from credit to regular order
        orderData.status = 'received';  // Regular order status
        orderData.type = 'order';       // Change from credit to order
        orderData.totalValue = 387.00;  // Correct positive amount from invoice
        orderData.subtotal = 387.00;
        orderData.invoiceTotalWithTax = 387.00;
        
        // Set correct order date from invoice
        orderData.orderDate = '2025-01-18';  // January 18, 2025
        
        // Update order ID to reflect correct date
        orderData.orderId = 'GFS_20250118_9018357846';
        
        // Remove credit-specific fields
        delete orderData.creditDate;
        delete orderData.documentType;
        delete orderData.cleanedUp;
        delete orderData.cleanupDate;
        delete orderData.originalItemCount;
        
        orderData.description = 'Regular order - corrected from misclassified credit';
        
        // Add correction metadata
        orderData.correctedFromCredit = true;
        orderData.correctionDate = new Date().toISOString();
        orderData.correctionReason = 'Invoice 9018357846 is a regular order from 01/18/2025 for $387.00, not a credit memo';
        orderData.manuallyVerified = true;
        orderData.verifiedBy = 'User verification with invoice details';
        orderData.originalPdfTotal = '$387.00';
        
        // Save the corrected data
        fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
        
        console.log('✅ CORRECTED TO REGULAR ORDER:');
        console.log(`   New Order ID: ${orderData.orderId}`);
        console.log(`   New Status: ${orderData.status} (${orderData.type})`);
        console.log(`   Order Date: ${orderData.orderDate}`);
        console.log(`   Total Value: $${orderData.totalValue.toFixed(2)} (positive)`);
        console.log();
        
        console.log('🎯 FINANCIAL IMPACT:');
        console.log('   Previous: -$387.00 (credit)');
        console.log('   Corrected: +$387.00 (regular order)');
        console.log('   Net change: +$774.00 to total order value');
        
        return orderData;

    } catch (error) {
        console.error('❌ Error fixing invoice:', error);
        return null;
    }
}

// Run the fix
const result = fixInvoice9018357846();

if (result) {
    console.log('\n💡 RECOMMENDATION:');
    console.log('This pattern suggests more invoices from 01/18/2025 may be misclassified.');
    console.log('Consider checking other invoices with similar characteristics.');
}