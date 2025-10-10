const fs = require('fs');
const path = require('path');

// Function to fix credit memo dates to show actual credit dates instead of fake order dates
function fixCreditMemoDates() {
    console.log('📝 FIXING CREDIT MEMO DATES - REMOVING FAKE ORDER DATES\n');

    const gfsOrdersDir = './data/gfs_orders';
    
    try {
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_GFS_20250909'))
            .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

        console.log(`Found ${files.length} credit memo files to fix\n`);

        let fixedCount = 0;

        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Only fix credit memos
                if (orderData.status === 'credit' || orderData.type === 'credit') {
                    // Reset to proper credit memo format
                    orderData.orderDate = ''; // Remove fake order date
                    
                    // Add proper credit memo date (use upload date as credit date)
                    if (orderData.uploadDate) {
                        orderData.creditDate = orderData.uploadDate.split('T')[0]; // Extract just the date part
                    }
                    
                    // Reset the order ID to use upload date (the actual processing date)
                    orderData.orderId = `GFS_CREDIT_${orderData.invoiceNumber}`;
                    
                    // Add credit memo specific fields
                    orderData.documentType = 'credit_memo';
                    orderData.description = 'Credit memo processed from PDF import';
                    
                    // Save the corrected file
                    fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
                    
                    console.log(`✅ Fixed: ${file}`);
                    console.log(`   Order ID: ${orderData.orderId}`);
                    console.log(`   Credit Date: ${orderData.creditDate || 'N/A'}`);
                    console.log(`   Invoice: ${orderData.invoiceNumber}`);
                    console.log();
                    
                    fixedCount++;
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${file}:`, error.message);
            }
        }

        console.log(`📊 SUMMARY:`);
        console.log(`   Files processed: ${files.length}`);
        console.log(`   Credit memos fixed: ${fixedCount}`);
        console.log(`   ✅ Credit memos now show proper credit dates instead of fake order dates`);

    } catch (error) {
        console.error('❌ Error fixing credit memo dates:', error);
    }
}

// Run the fix
fixCreditMemoDates();