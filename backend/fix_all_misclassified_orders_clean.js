const fs = require('fs');
const path = require('path');

// Function to fix all misclassified orders at once
function fixAllMisclassifiedOrders() {
    console.log('🔧 FIXING ALL MISCLASSIFIED ORDERS - MASS CONVERSION FROM CREDITS TO REGULAR ORDERS\n');
    console.log('✅ RULE: Only invoices starting with "200" are real credits');
    console.log('✅ RULE: All other invoices should be regular orders\n');

    const gfsOrdersDir = './data/gfs_orders';
    let fixedCount = 0;
    let totalValueChange = 0;
    let errors = 0;
    
    try {
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
            .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

        console.log(`📊 Processing ${files.length} order files...\n`);
        
        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Skip if already fixed
                if (orderData.correctedFromCredit === true) {
                    console.log(`⏭️  Skipping ${orderData.invoiceNumber} - already fixed`);
                    continue;
                }
                
                // Check if this should be fixed (not starting with "200" but marked as credit)
                const isRealCreditPattern = orderData.invoiceNumber && orderData.invoiceNumber.toString().startsWith('200');
                const isCurrentlyMarkedAsCredit = orderData.type === 'credit' || orderData.status === 'credit';
                
                if (!isRealCreditPattern && isCurrentlyMarkedAsCredit) {
                    // This needs to be fixed - convert from credit to regular order
                    console.log(`🔄 Fixing Invoice ${orderData.invoiceNumber}: $${Math.abs(orderData.totalValue).toFixed(2)}`);
                    
                    const originalValue = orderData.totalValue;
                    const correctPositiveValue = Math.abs(originalValue);
                    
                    // Convert from credit to regular order
                    orderData.status = 'received';
                    orderData.type = 'order';
                    orderData.totalValue = correctPositiveValue;
                    orderData.subtotal = correctPositiveValue;
                    orderData.invoiceTotalWithTax = correctPositiveValue;
                    
                    // Remove fake September date and use empty date
                    orderData.orderDate = '';
                    
                    // Update order ID to generic format
                    orderData.orderId = `GFS_ORDER_${orderData.invoiceNumber}`;
                    
                    // Remove credit-specific fields
                    delete orderData.creditDate;
                    delete orderData.documentType;
                    delete orderData.cleanedUp;
                    delete orderData.cleanupDate;
                    delete orderData.originalItemCount;
                    
                    orderData.description = 'Regular order - mass corrected from misclassified credit (invoice pattern analysis)';
                    
                    // Add correction metadata
                    orderData.correctedFromCredit = true;
                    orderData.correctionDate = new Date().toISOString();
                    orderData.correctionReason = `Invoice ${orderData.invoiceNumber} does not start with "200" - should be regular order, not credit memo`;
                    orderData.massCorrection = true;
                    orderData.originalPdfTotal = `$${correctPositiveValue.toFixed(2)}`;
                    
                    // Save the corrected data
                    fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
                    
                    fixedCount++;
                    totalValueChange += (correctPositiveValue * 2); // From negative to positive
                    
                    console.log(`   ✅ ${originalValue.toFixed(2)} → +${correctPositiveValue.toFixed(2)} (net: +${(correctPositiveValue * 2).toFixed(2)})`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${file}:`, error.message);
                errors++;
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('🎯 MASS CORRECTION COMPLETED');
        console.log('='.repeat(80));
        console.log();
        
        console.log(`📊 RESULTS:`);
        console.log(`   • Orders Fixed: ${fixedCount}`);
        console.log(`   • Errors: ${errors}`);
        console.log(`   • Total Value Change: +$${totalValueChange.toFixed(2)}`);
        console.log();
        
        if (fixedCount > 0) {
            console.log(`💰 FINANCIAL IMPACT:`);
            console.log(`   • Previous total credits: -$${(totalValueChange / 2).toFixed(2)}`);
            console.log(`   • Now regular orders: +$${(totalValueChange / 2).toFixed(2)}`);
            console.log(`   • Net improvement to total order value: +$${totalValueChange.toFixed(2)}`);
            console.log();
            
            console.log(`🔄 NEXT STEPS:`);
            console.log(`   1. Restart server to reload corrected data`);
            console.log(`   2. All ${fixedCount} orders now correctly classified as regular orders`);
            console.log(`   3. Total order value should increase by $${totalValueChange.toFixed(2)}`);
        }
        
        return {
            fixedCount,
            totalValueChange,
            errors
        };

    } catch (error) {
        console.error('❌ Error in mass correction:', error);
        return null;
    }
}

// Run the mass correction
const result = fixAllMisclassifiedOrders();

if (result && result.fixedCount > 0) {
    console.log(`\n🏆 SUCCESS: Fixed ${result.fixedCount} misclassified orders!`);
    console.log(`💵 Total order value improved by $${result.totalValueChange.toFixed(2)}`);
}