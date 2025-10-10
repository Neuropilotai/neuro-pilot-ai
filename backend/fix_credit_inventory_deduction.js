const fs = require('fs');

// Function to fix credit inventory deduction in the consolidation logic
function fixCreditInventoryDeduction() {
    console.log('🔧 FIXING CREDIT INVENTORY DEDUCTION\n');
    console.log('📋 Issue: Credits currently ADD to inventory instead of SUBTRACTING');
    console.log('✅ Fix: Credits should REDUCE inventory quantities (expired, damaged, returned items)\n');

    const serverFile = './inventory-complete-bilingual.js';
    
    try {
        let content = fs.readFileSync(serverFile, 'utf8');
        
        // Find the consolidation loop that processes all orders
        const originalPattern = `  // First, collect all items from all orders
  gfsOrders.forEach(order => {
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        tempInventory.push({`;
        
        if (content.includes(originalPattern)) {
            console.log('✅ Found order consolidation logic');
            
            // Replace with credit-aware version
            const fixedPattern = `  // First, collect all items from all orders (with credit handling)
  gfsOrders.forEach(order => {
    if (order.items && order.items.length > 0) {
      // Check if this is a credit order (should reduce inventory)
      const isCredit = order.type === 'credit' || order.status === 'credit' || order.totalValue < 0;
      
      order.items.forEach(item => {
        tempInventory.push({`;
        
        content = content.replace(originalPattern, fixedPattern);
        
        // Also need to fix the quantity calculation part
        const originalQuantityLogic = `      consolidatedItems[key].quantity += item.quantity;`;
        
        if (content.includes(originalQuantityLogic)) {
            console.log('✅ Found quantity addition logic');
            
            const fixedQuantityLogic = `      // For credits, subtract quantities (expired/damaged items removed from inventory)
      const quantityChange = isCredit ? -(item.quantity || 0) : (item.quantity || 0);
      consolidatedItems[key].quantity += quantityChange;`;
            
            content = content.replace(originalQuantityLogic, fixedQuantityLogic);
            
            // Also fix the totalValue calculation for credits
            const originalValueLogic = `      consolidatedItems[key].totalValue += item.totalPrice;`;
            const fixedValueLogic = `      // For credits, subtract value (items removed from inventory)
      const valueChange = isCredit ? -(item.totalPrice || 0) : (item.totalPrice || 0);
      consolidatedItems[key].totalValue += valueChange;`;
            
            content = content.replace(originalValueLogic, fixedValueLogic);
        }
        
        // Fix the new item creation section too
        const originalNewItem = `      // New item
      consolidatedItems[key] = {
        productName: item.productName,
        productCode: item.productCode,
        category: item.category,
        unit: item.unit,
        unitPrice: item.unitPrice,
        packSize: item.packSize,
        brand: item.brand,
        quantity: item.quantity,`;
        
        if (content.includes(originalNewItem)) {
            console.log('✅ Found new item creation logic');
            
            const fixedNewItem = `      // New item (handle credits properly)
      const initialQuantity = isCredit ? -(item.quantity || 0) : (item.quantity || 0);
      const initialValue = isCredit ? -(item.totalPrice || 0) : (item.totalPrice || 0);
      
      consolidatedItems[key] = {
        productName: item.productName,
        productCode: item.productCode,
        category: item.category,
        unit: item.unit,
        unitPrice: item.unitPrice,
        packSize: item.packSize,
        brand: item.brand,
        quantity: initialQuantity,`;
        
        content = content.replace(originalNewItem, fixedNewItem);
        
        // Fix the totalValue assignment for new items
        const originalNewValue = `        totalValue: item.totalPrice,`;
        const fixedNewValue = `        totalValue: initialValue,`;
        
        content = content.replace(originalNewValue, fixedNewValue);
    }
        
        // Save the updated content
        fs.writeFileSync(serverFile, content);
        
        console.log('✅ CREDIT INVENTORY DEDUCTION IMPLEMENTED');
        console.log('📊 Changes made:');
        console.log('   • Credits now SUBTRACT from inventory quantities');
        console.log('   • Credits REDUCE inventory values');
        console.log('   • Proper handling of expired/damaged/returned items');
        console.log('   • Maintains accurate inventory levels');
        console.log();
        console.log('🔄 Server restart required to apply changes');
        
        return true;
        
        } else {
            console.log('❌ Could not find the consolidation pattern to replace');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error fixing credit inventory deduction:', error);
        return false;
    }
}

// Also verify current credit handling
function verifyCurrentCredits() {
    console.log('📊 ANALYZING CURRENT CREDIT ORDERS:\n');
    
    const fs = require('fs');
    const path = require('path');
    
    const gfsOrdersDir = './data/gfs_orders';
    const files = fs.readdirSync(gfsOrdersDir)
        .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
        .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

    let credits = [];
    
    for (const file of files) {
        const orderData = JSON.parse(fs.readFileSync(path.join(gfsOrdersDir, file), 'utf8'));
        
        // Check if it's a credit
        if (orderData.type === 'credit' || orderData.status === 'credit' || orderData.totalValue < 0) {
            credits.push({
                invoice: orderData.invoiceNumber,
                totalValue: orderData.totalValue,
                itemCount: orderData.items ? orderData.items.length : 0,
                items: orderData.items || []
            });
        }
    }
    
    if (credits.length > 0) {
        console.log(`🔍 Found ${credits.length} credit orders:`);
        credits.forEach(credit => {
            console.log(`   • Invoice ${credit.invoice}: $${credit.totalValue.toFixed(2)} (${credit.itemCount} items)`);
            if (credit.itemCount > 0) {
                console.log(`     Items being credited (should REDUCE inventory):`);
                credit.items.forEach(item => {
                    console.log(`       - ${item.productName}: ${item.quantity} ${item.unit || 'units'}`);
                });
            }
        });
        console.log();
        console.log('💡 These credit items should be SUBTRACTED from inventory totals');
        console.log('   (representing expired, damaged, or returned items)');
    } else {
        console.log('✅ No credit orders found - all are regular orders');
    }
}

// Run the fix
console.log('🚀 STARTING CREDIT INVENTORY DEDUCTION FIX\n');

verifyCurrentCredits();
const success = fixCreditInventoryDeduction();

if (success) {
    console.log('\n🎉 FIX COMPLETED!');
    console.log('📋 Next steps:');
    console.log('   1. Restart server: pkill -f inventory && node inventory-complete-bilingual.js');
    console.log('   2. Credits will now properly reduce inventory quantities');
    console.log('   3. More accurate inventory levels reflecting actual stock');
} else {
    console.log('\n❌ Fix failed - manual review needed');
}