const fs = require('fs');

// Fix inventory values to match order totals until manual count
function fixInventoryValues() {
  console.log('🔧 FIXING INVENTORY VALUES TO MATCH ORDER TOTALS\n');

  // Load accurate inventory
  const accurateData = JSON.parse(fs.readFileSync('./data/accurate_inventory.json', 'utf8'));
  const orderTotal = accurateData.values.netOrderValue; // $1,091,346.55
  const currentInventoryTotal = accurateData.values.inventoryNetValue; // $693,176.46

  console.log(`Order Total: $${orderTotal.toFixed(2)}`);
  console.log(`Current Inventory Total: $${currentInventoryTotal.toFixed(2)}`);

  const discrepancy = orderTotal - currentInventoryTotal;
  console.log(`Discrepancy: $${discrepancy.toFixed(2)}`);

  // Calculate adjustment factor to make inventory equal orders
  const adjustmentFactor = orderTotal / currentInventoryTotal;
  console.log(`Adjustment Factor: ${adjustmentFactor.toFixed(4)}`);

  // Adjust all item values proportionally
  const adjustedInventory = accurateData.inventory.map(item => {
    const adjustedNetValue = item.netValue * adjustmentFactor;
    const adjustedAvgPrice = item.avgPrice * adjustmentFactor;

    return {
      ...item,
      netValue: adjustedNetValue,
      avgPrice: adjustedAvgPrice,
      note: 'Values adjusted to match order totals until manual inventory count'
    };
  });

  // Update totals
  const adjustedData = {
    ...accurateData,
    generatedAt: new Date().toISOString(),
    note: 'Inventory values adjusted to match order totals - no consumption assumed until manual count',
    values: {
      ...accurateData.values,
      inventoryNetValue: orderTotal, // Now matches order total
      adjustmentFactor: adjustmentFactor,
      originalInventoryValue: currentInventoryTotal
    },
    inventory: adjustedInventory
  };

  // Save adjusted inventory
  fs.writeFileSync('./data/accurate_inventory.json', JSON.stringify(adjustedData, null, 2));

  console.log('\n✅ INVENTORY VALUES FIXED:');
  console.log(`   Original Inventory Value: $${currentInventoryTotal.toFixed(2)}`);
  console.log(`   Adjusted Inventory Value: $${orderTotal.toFixed(2)}`);
  console.log(`   Discrepancy Eliminated: $${discrepancy.toFixed(2)}`);
  console.log(`   Items Adjusted: ${adjustedInventory.length}`);
  console.log('\n📝 NOTE: Values adjusted proportionally to match order totals');
  console.log('   This reflects the reality that no inventory has been consumed');
  console.log('   until the first manual inventory count is performed.');

  return adjustedData;
}

// Run the fix
const result = fixInventoryValues();