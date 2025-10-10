const fs = require('fs');
const path = require('path');

// Function to identify all misclassified orders based on invoice number patterns
function identifyMisclassifiedOrders() {
    console.log('🔍 IDENTIFYING ALL MISCLASSIFIED ORDERS BASED ON INVOICE PATTERNS\n');
    console.log('✅ RULE: Real credits start with "200" (e.g., 2002362584)');
    console.log('❌ RULE: Regular orders have other patterns (e.g., 901835xxxx)\n');

    const gfsOrdersDir = './data/gfs_orders';
    
    try {
        const files = fs.readdirSync(gfsOrdersDir)
            .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
            .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

        let correctCredits = [];
        let misclassifiedOrders = [];
        let alreadyFixed = [];
        let regularOrders = [];
        
        console.log(`📊 ANALYZING ${files.length} ORDER FILES:\n`);
        
        for (const file of files) {
            const filePath = path.join(gfsOrdersDir, file);
            try {
                const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Check if invoice number starts with "200" (real credit pattern)
                const isRealCreditPattern = orderData.invoiceNumber && orderData.invoiceNumber.toString().startsWith('200');
                const isCurrentlyMarkedAsCredit = orderData.type === 'credit' || orderData.status === 'credit';
                const isAlreadyFixed = orderData.correctedFromCredit === true;
                
                if (isAlreadyFixed) {
                    alreadyFixed.push({
                        file: file,
                        invoiceNumber: orderData.invoiceNumber,
                        totalValue: orderData.totalValue,
                        orderDate: orderData.orderDate
                    });
                } else if (isRealCreditPattern && isCurrentlyMarkedAsCredit) {
                    // Correctly classified credit
                    correctCredits.push({
                        file: file,
                        invoiceNumber: orderData.invoiceNumber,
                        totalValue: orderData.totalValue,
                        originalFileName: orderData.originalFileName
                    });
                } else if (!isRealCreditPattern && isCurrentlyMarkedAsCredit) {
                    // Misclassified - should be regular order
                    misclassifiedOrders.push({
                        file: file,
                        invoiceNumber: orderData.invoiceNumber,
                        totalValue: orderData.totalValue,
                        originalFileName: orderData.originalFileName,
                        orderDate: orderData.orderDate
                    });
                } else if (!isRealCreditPattern && !isCurrentlyMarkedAsCredit) {
                    // Correctly classified regular order
                    regularOrders.push({
                        file: file,
                        invoiceNumber: orderData.invoiceNumber,
                        totalValue: orderData.totalValue,
                        orderDate: orderData.orderDate
                    });
                }
                
            } catch (error) {
                console.error(`❌ Error reading ${file}:`, error.message);
            }
        }
        
        // Show results
        console.log('📈 CLASSIFICATION ANALYSIS RESULTS:\n');
        
        if (alreadyFixed.length > 0) {
            console.log(`✅ ALREADY FIXED (${alreadyFixed.length} orders):`);
            alreadyFixed.forEach(item => {
                console.log(`   • Invoice ${item.invoiceNumber}: $${item.totalValue.toFixed(2)} (${item.orderDate})`);
            });
            console.log();
        }
        
        if (correctCredits.length > 0) {
            console.log(`✅ CORRECTLY CLASSIFIED CREDITS (${correctCredits.length} orders):`);
            console.log(`   (Invoice numbers starting with "200")`);
            correctCredits
                .sort((a, b) => Math.abs(b.totalValue) - Math.abs(a.totalValue))
                .forEach(item => {
                    console.log(`   • Invoice ${item.invoiceNumber}: $${item.totalValue.toFixed(2)}`);
                });
            console.log();
        }
        
        if (misclassifiedOrders.length > 0) {
            console.log(`❌ MISCLASSIFIED AS CREDITS (${misclassifiedOrders.length} orders need fixing):`);
            console.log(`   (Should be regular orders - invoice numbers don't start with "200")`);
            misclassifiedOrders
                .sort((a, b) => Math.abs(b.totalValue) - Math.abs(a.totalValue))
                .forEach((item, index) => {
                    console.log(`   ${index + 1}. Invoice ${item.invoiceNumber}: $${Math.abs(item.totalValue).toFixed(2)}`);
                    console.log(`      File: ${item.originalFileName || 'N/A'} | Current: Credit (WRONG)`);
                });
            console.log();
        }
        
        console.log(`📊 SUMMARY:`);
        console.log(`   • Already Fixed: ${alreadyFixed.length} orders`);
        console.log(`   • Correct Credits: ${correctCredits.length} orders`);
        console.log(`   • Regular Orders: ${regularOrders.length} orders`);
        console.log(`   • Misclassified (need fixing): ${misclassifiedOrders.length} orders`);
        console.log();
        
        if (misclassifiedOrders.length > 0) {
            const totalMisclassifiedValue = misclassifiedOrders.reduce((sum, item) => sum + Math.abs(item.totalValue), 0);
            console.log(`💰 FINANCIAL IMPACT OF FIXING ALL MISCLASSIFIED ORDERS:`);
            console.log(`   Current impact: -$${totalMisclassifiedValue.toFixed(2)} (incorrectly counted as credits)`);
            console.log(`   After fixing: +$${totalMisclassifiedValue.toFixed(2)} (correctly counted as regular orders)`);
            console.log(`   Net change: +$${(totalMisclassifiedValue * 2).toFixed(2)} to total order value`);
            console.log();
            
            console.log(`🔧 RECOMMENDATION:`);
            console.log(`   Create a script to fix all ${misclassifiedOrders.length} misclassified orders at once.`);
        } else {
            console.log(`🎉 All orders are correctly classified!`);
        }
        
        return {
            correctCredits,
            misclassifiedOrders,
            alreadyFixed,
            regularOrders
        };

    } catch (error) {
        console.error('❌ Error analyzing orders:', error);
        return null;
    }
}

// Run the analysis
const result = identifyMisclassifiedOrders();