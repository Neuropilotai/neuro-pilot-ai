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
                    orderData.status = 'received';  // Regular order status
                    orderData.type = 'order';       // Change from credit to order
                    orderData.totalValue = correctPositiveValue; // Make positive
                    orderData.subtotal = correctPositiveValue;
                    orderData.invoiceTotalWithTax = correctPositiveValue;
                    
                    // Remove fake September date and use empty date (will be filled when real date is known)
                    orderData.orderDate = '';
                    
                    // Update order ID to generic format (since we don't know real dates yet)
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
                    orderData.originalPdfTotal = `$${correctPositiveValue.toFixed(2)}`;\n                    \n                    // Save the corrected data\n                    fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));\n                    \n                    fixedCount++;\n                    totalValueChange += (correctPositiveValue * 2); // From negative to positive\n                    \n                    console.log(`   ✅ ${originalValue.toFixed(2)} → +${correctPositiveValue.toFixed(2)} (net: +${(correctPositiveValue * 2).toFixed(2)})`);\n                }\n                \n            } catch (error) {\n                console.error(`❌ Error processing ${file}:`, error.message);\n                errors++;\n            }\n        }\n        \n        console.log('\\n' + '='.repeat(80));\n        console.log('🎯 MASS CORRECTION COMPLETED');\n        console.log('='.repeat(80));\n        console.log();\n        \n        console.log(`📊 RESULTS:`);\n        console.log(`   • Orders Fixed: ${fixedCount}`);\n        console.log(`   • Errors: ${errors}`);\n        console.log(`   • Total Value Change: +$${totalValueChange.toFixed(2)}`);\n        console.log();\n        \n        if (fixedCount > 0) {\n            console.log(`💰 FINANCIAL IMPACT:`);\n            console.log(`   • Previous total credits: -$${(totalValueChange / 2).toFixed(2)}`);\n            console.log(`   • Now regular orders: +$${(totalValueChange / 2).toFixed(2)}`);\n            console.log(`   • Net improvement to total order value: +$${totalValueChange.toFixed(2)}`);\n            console.log();\n            \n            console.log(`🔄 NEXT STEPS:`);\n            console.log(`   1. Restart server to reload corrected data`);\n            console.log(`   2. All ${fixedCount} orders now correctly classified as regular orders`);\n            console.log(`   3. Total order value should increase by $${totalValueChange.toFixed(2)}`);\n        }\n        \n        return {\n            fixedCount,\n            totalValueChange,\n            errors\n        };\n\n    } catch (error) {\n        console.error('❌ Error in mass correction:', error);\n        return null;\n    }\n}\n\n// Run the mass correction\nconst result = fixAllMisclassifiedOrders();\n\nif (result && result.fixedCount > 0) {\n    console.log(`\\n🏆 SUCCESS: Fixed ${result.fixedCount} misclassified orders!`);\n    console.log(`💵 Total order value improved by $${result.totalValueChange.toFixed(2)}`);\n}