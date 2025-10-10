const fs = require('fs');
const path = require('path');

// Function to fix the specific invoice 9018357843 with correct data
function fixInvoice9018357843() {
    console.log('🔧 FIXING INVOICE 9018357843 WITH CORRECT TOTAL\n');

    const filePath = './data/gfs_orders/gfs_order_GFS_20250909_9018357843.json';
    
    try {
        const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`Current data for ${orderData.invoiceNumber}:`);
        console.log(`   Current Total: $${Math.abs(orderData.totalValue).toFixed(2)}`);
        console.log(`   Current Items: ${orderData.totalItems}`);
        console.log(`   Status: ${orderData.status}`);
        console.log();

        // Update with the correct information
        // Since this is a credit memo, the value should be negative
        const correctTotal = -35869.37; // Negative because it's a credit
        
        orderData.totalValue = correctTotal;
        orderData.subtotal = Math.abs(correctTotal);
        orderData.invoiceTotalWithTax = Math.abs(correctTotal);
        
        // Add a note about the manual correction
        orderData.manuallyVerified = true;
        orderData.verifiedDate = new Date().toISOString();
        orderData.verifiedBy = "User verification";
        orderData.originalPdfTotal = "$35,869.37";
        orderData.note = "Total corrected based on actual PDF invoice amount";
        
        // Remove the cleanup flags since this is now properly verified
        delete orderData.cleanedUp;
        delete orderData.cleanupDate;
        delete orderData.originalItemCount;

        // Save the corrected data
        fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
        
        console.log('✅ CORRECTED INVOICE DATA:');
        console.log(`   Invoice Number: ${orderData.invoiceNumber}`);
        console.log(`   Corrected Total: $${Math.abs(orderData.totalValue).toFixed(2)} (credit)`);
        console.log(`   Status: ${orderData.status}`);
        console.log(`   Document Type: ${orderData.documentType}`);
        console.log(`   Credit Date: ${orderData.creditDate}`);
        console.log(`   Manually Verified: ${orderData.manuallyVerified}`);
        console.log();
        
        console.log('🎯 NEXT STEPS:');
        console.log('1. Restart the server to reload the corrected data');
        console.log('2. The total order value will increase by $35,399.11 (difference between -$470.26 and -$35,869.37)');
        console.log('3. Consider manually re-processing the PDF if you need line-item details');
        
        return orderData;

    } catch (error) {
        console.error('❌ Error fixing invoice:', error);
        return null;
    }
}

// Run the fix
const result = fixInvoice9018357843();

if (result) {
    console.log(`\n💰 Impact on Total Order Value:`);
    console.log(`   Previous credit value: -$470.26`);
    console.log(`   Corrected credit value: -$35,869.37`);
    console.log(`   Difference: -$35,399.11 (total will decrease by this amount)`);
    console.log(`   This credit is much larger than originally calculated`);
}