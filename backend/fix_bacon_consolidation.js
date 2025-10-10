const fs = require('fs');
const path = require('path');

console.log('🥓 FIXING BACON AND OTHER PRODUCT CONSOLIDATION\n');

const gfsOrdersDir = './data/gfs_orders';
let totalBaconQuantity = 0;
let baconOrders = [];
let updatedFiles = 0;

// Get all GFS order files
const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

console.log(`📋 Processing ${files.length} order files...\n`);

// Track all bacon variations and other similar products
const productConsolidation = {
    'BACON RAW 18-22CT SLCD L/O FRSH': {
        patterns: ['BACON RAW 18-22CT SLCD L/O FRSH', '0BACON RAW 18-22CT SLCD L/O FRSH', '5BACON RAW 18-22CT SLCD L/O FRSH', '7BACON RAW 18-22CT SLCD L/O FRSH'],
        standardCode: 'BACON_RAW_18_22CT',
        standardName: 'BACON RAW 18-22CT SLCD L/O FRSH',
        totalQuantity: 0,
        orders: []
    },
    'APPLE GOLDEN DELICIOUS': {
        patterns: ['APPLE GOLDEN DELICIOUS', '0APPLE GOLDEN DELICIOUS', '5APPLE GOLDEN DELICIOUS', '7APPLE GOLDEN DELICIOUS'],
        standardCode: 'APPLE_GOLDEN_DELICIOUS',
        standardName: 'APPLE GOLDEN DELICIOUS',
        totalQuantity: 0,
        orders: []
    }
};

// Process each order file
for (const file of files) {
    const filePath = path.join(gfsOrdersDir, file);
    let orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let modified = false;
    
    if (orderData.items && Array.isArray(orderData.items)) {
        for (let item of orderData.items) {
            // Check each consolidation group
            for (const [baseProduct, consolidationInfo] of Object.entries(productConsolidation)) {
                for (const pattern of consolidationInfo.patterns) {
                    if (item.productName && item.productName.includes(pattern.replace(/^[0-9]/, ''))) {
                        // Found a match - standardize it
                        const oldName = item.productName;
                        const oldCode = item.productCode;
                        
                        item.productName = consolidationInfo.standardName;
                        item.productCode = consolidationInfo.standardCode;
                        
                        consolidationInfo.totalQuantity += item.quantity || 0;
                        consolidationInfo.orders.push({
                            orderId: orderData.orderId,
                            originalName: oldName,
                            originalCode: oldCode,
                            quantity: item.quantity || 0,
                            file: file
                        });
                        
                        console.log(`✅ Fixed: "${oldName}" → "${consolidationInfo.standardName}" (${item.quantity} units) in ${file}`);
                        modified = true;
                        break;
                    }
                }
            }
        }
    }
    
    // Save if modified
    if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
        updatedFiles++;
    }
}

console.log('\n' + '='.repeat(80));
console.log('📊 CONSOLIDATION SUMMARY:');
console.log('='.repeat(80));

for (const [baseProduct, info] of Object.entries(productConsolidation)) {
    if (info.totalQuantity > 0) {
        console.log(`\n🥓 ${baseProduct}:`);
        console.log(`   • Total Quantity: ${info.totalQuantity} units`);
        console.log(`   • Found in ${info.orders.length} orders:`);
        
        info.orders.forEach(order => {
            console.log(`     - ${order.file}: ${order.quantity} units (was: "${order.originalName}")`);
        });
    }
}

console.log(`\n📁 Modified ${updatedFiles} files`);
console.log('🔄 Restart the server to see consolidated inventory');
console.log('   pkill -f inventory-complete-bilingual && node inventory-complete-bilingual.js');