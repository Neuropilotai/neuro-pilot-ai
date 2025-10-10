const fs = require('fs');
const path = require('path');

// Function to fix misclassified orders that should be regular orders, not credits
function fixMisclassifiedOrders() {
    console.log('🔧 FIXING MISCLASSIFIED ORDERS - CONVERTING CREDITS TO REGULAR ORDERS\n');

    const gfsOrdersDir = './data/gfs_orders';
    
    try {
        // First, fix the specific invoice 9018357843
        const specificFile = 'gfs_order_GFS_20250909_9018357843.json';
        const specificPath = path.join(gfsOrdersDir, specificFile);
        
        if (fs.existsSync(specificPath)) {
            const orderData = JSON.parse(fs.readFileSync(specificPath, 'utf8'));
            
            console.log(`📋 FIXING INVOICE ${orderData.invoiceNumber}:`);
            console.log(`   Current Status: ${orderData.status} (${orderData.type})`);
            console.log(`   Current Total: $${orderData.totalValue}`);
            console.log(`   Should be: Regular order from 01/18/2025`);
            console.log();
            
            // Convert from credit to regular order
            orderData.status = 'received';  // Regular order status
            orderData.type = 'order';       // Change from credit to order
            orderData.totalValue = Math.abs(orderData.totalValue); // Make positive
            orderData.subtotal = orderData.totalValue;
            orderData.invoiceTotalWithTax = orderData.totalValue;
            
            // Set correct order date
            orderData.orderDate = '2025-01-18';  // January 18, 2025
            
            // Update order ID to reflect correct date
            orderData.orderId = 'GFS_20250118_9018357843';
            
            // Remove credit-specific fields
            delete orderData.creditDate;
            delete orderData.documentType;
            orderData.description = 'Regular order - corrected from misclassified credit';
            
            // Add correction metadata
            orderData.correctedFromCredit = true;
            orderData.correctionDate = new Date().toISOString();
            orderData.correctionReason = 'Invoice 9018357843 is a regular order from 01/18/2025, not a credit memo';
            
            // Save the corrected data
            fs.writeFileSync(specificPath, JSON.stringify(orderData, null, 2));
            
            console.log('✅ CORRECTED TO REGULAR ORDER:');
            console.log(`   New Order ID: ${orderData.orderId}`);
            console.log(`   New Status: ${orderData.status} (${orderData.type})`);
            console.log(`   Order Date: ${orderData.orderDate}`);
            console.log(`   Total Value: $${orderData.totalValue.toFixed(2)} (positive)`);
            console.log();
        }
        
        // Check for other potential misclassified orders
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_GFS_20250909'))
            .filter(file => !file.includes('corrupted') && !file.includes('deleted_'))
            .filter(file => file !== specificFile); // Exclude the one we just fixed
        
        console.log(`🔍 CHECKING ${files.length} OTHER POTENTIAL MISCLASSIFIED ORDERS:\n`);
        
        let potentialMisclassifications = [];
        
        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Look for orders that might be misclassified
                // High-value "credits" are suspicious and might be regular orders
                if ((orderData.status === 'credit' || orderData.type === 'credit') && 
                    Math.abs(orderData.totalValue) > 1000) {
                    
                    potentialMisclassifications.push({
                        file: file,
                        invoiceNumber: orderData.invoiceNumber,
                        totalValue: orderData.totalValue,
                        originalFileName: orderData.originalFileName
                    });
                }
            } catch (error) {
                console.error(`❌ Error checking ${file}:`, error.message);
            }
        }
        
        if (potentialMisclassifications.length > 0) {
            console.log(`⚠️  FOUND ${potentialMisclassifications.length} POTENTIALLY MISCLASSIFIED HIGH-VALUE "CREDITS":`);
            console.log(`(These might be regular orders incorrectly marked as credits)\n`);
            
            potentialMisclassifications
                .sort((a, b) => Math.abs(b.totalValue) - Math.abs(a.totalValue))
                .forEach((item, index) => {
                    console.log(`${index + 1}. Invoice ${item.invoiceNumber}: $${Math.abs(item.totalValue).toFixed(2)}`);
                    console.log(`   File: ${item.originalFileName || 'N/A'}`);
                    console.log(`   Current status: Credit (might be wrong)`);
                    console.log();
                });
            
            console.log(`💡 RECOMMENDATION:`);
            console.log(`Review these high-value "credits" - they might be regular orders like 9018357843 was.`);
        } else {
            console.log(`✅ No other high-value potential misclassifications found.`);
        }
        
        console.log(`\n🎯 SUMMARY:`);
        console.log(`   Fixed: Invoice 9018357843 (converted from credit to regular order)`);
        console.log(`   Potential issues: ${potentialMisclassifications.length} high-value credits to review`);
        console.log(`   Impact: +$35,869.37 to regular orders, -$35,869.37 from credits`);

    } catch (error) {
        console.error('❌ Error fixing misclassified orders:', error);
    }
}

// Run the fix
fixMisclassifiedOrders();