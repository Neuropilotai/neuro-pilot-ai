const fs = require('fs');
const path = require('path');

console.log('📊 ANALYZING INVENTORY vs ORDERS GAP');
console.log('='.repeat(80));

// Load orders
const ordersDir = './data/gfs_orders';
const orderFiles = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));
let orderItems = new Map();
let totalOrderItems = 0;
let totalOrderQuantity = 0;

console.log(`\nLoading ${orderFiles.length} order files...`);

for (const file of orderFiles) {
  try {
    const order = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item.itemCode) {
          if (!orderItems.has(item.itemCode)) {
            orderItems.set(item.itemCode, {
              description: item.description || 'Unknown',
              totalQty: 0,
              orderCount: 0,
              totalValue: 0
            });
          }
          const data = orderItems.get(item.itemCode);
          const qty = item.qtyShipped || 0;
          data.totalQty += qty;
          data.orderCount++;
          data.totalValue += (item.unitPrice || 0) * qty;
          totalOrderItems++;
          totalOrderQuantity += qty;
        }
      }
    }
  } catch (e) {
    // Skip corrupted files
  }
}

// Load FIFO inventory
const invFile = './data/fifo_inventory.json';
const invData = JSON.parse(fs.readFileSync(invFile, 'utf8'));
const inventory = new Map(invData.inventory || []);

// Load reconciled inventory
const reconciledFile = './data/reconciled/reconciled_inventory.json';
let reconciledInventory = new Map();
if (fs.existsSync(reconciledFile)) {
  const reconciledData = JSON.parse(fs.readFileSync(reconciledFile, 'utf8'));
  reconciledInventory = new Map(reconciledData.inventory || []);
}

console.log('\n📦 ORDER ANALYSIS:');
console.log(`  Unique items in orders: ${orderItems.size}`);
console.log(`  Total order line items: ${totalOrderItems}`);
console.log(`  Total units ordered: ${totalOrderQuantity.toLocaleString()}`);

console.log('\n📋 INVENTORY ANALYSIS:');
console.log(`  Items in FIFO inventory: ${inventory.size}`);
console.log(`  Items in reconciled inventory: ${reconciledInventory.size}`);

// Calculate inventory quantities
let fifoQty = 0;
let reconciledQty = 0;
for (const [code, data] of inventory) {
  if (data.batches) {
    for (const batch of data.batches) {
      fifoQty += batch.quantity || 0;
    }
  }
}
for (const [code, data] of reconciledInventory) {
  if (data.batches) {
    for (const batch of data.batches) {
      reconciledQty += batch.quantity || 0;
    }
  }
}

console.log(`  Total FIFO quantity: ${fifoQty.toLocaleString()}`);
console.log(`  Total reconciled quantity: ${reconciledQty.toLocaleString()}`);

console.log('\n❌ DISCREPANCY ANALYSIS:');
console.log(`  Items in orders but NOT in FIFO inventory: ${Math.max(0, orderItems.size - inventory.size)}`);
console.log(`  Items in orders but NOT in reconciled inventory: ${Math.max(0, orderItems.size - reconciledInventory.size)}`);

// Find missing items
let missingFromFifo = [];
let missingFromReconciled = [];

for (const [code, data] of orderItems) {
  if (!inventory.has(code)) {
    missingFromFifo.push({code, ...data});
  }
  if (!reconciledInventory.has(code)) {
    missingFromReconciled.push({code, ...data});
  }
}

// Sort by value
missingFromFifo.sort((a, b) => b.totalValue - a.totalValue);
missingFromReconciled.sort((a, b) => b.totalValue - a.totalValue);

console.log('\n🔍 TOP MISSING ITEMS FROM FIFO INVENTORY (by value):');
missingFromFifo.slice(0, 10).forEach((item, i) => {
  console.log(`  ${i+1}. ${item.code}: ${item.description}`);
  console.log(`     Qty: ${item.totalQty} units | Value: $${item.totalValue.toFixed(2)} | Orders: ${item.orderCount}`);
});

console.log('\n🔍 TOP MISSING ITEMS FROM RECONCILED INVENTORY (by value):');
missingFromReconciled.slice(0, 10).forEach((item, i) => {
  console.log(`  ${i+1}. ${item.code}: ${item.description}`);
  console.log(`     Qty: ${item.totalQty} units | Value: $${item.totalValue.toFixed(2)} | Orders: ${item.orderCount}`);
});

// Check for items in inventory but not in orders
let inventoryOnlyItems = [];
for (const [code, data] of inventory) {
  if (!orderItems.has(code)) {
    inventoryOnlyItems.push({code, ...data});
  }
}

console.log('\n📌 ADDITIONAL INSIGHTS:');
console.log(`  Items in inventory but NOT in orders: ${inventoryOnlyItems.length}`);
console.log(`  Total missing items value: $${missingFromFifo.reduce((sum, item) => sum + item.totalValue, 0).toFixed(2)}`);

// Calculate coverage
const orderCoverage = (inventory.size / orderItems.size * 100).toFixed(1);
const reconciledCoverage = (reconciledInventory.size / orderItems.size * 100).toFixed(1);

console.log('\n📈 INVENTORY COVERAGE:');
console.log(`  FIFO Inventory covers: ${orderCoverage}% of ordered items`);
console.log(`  Reconciled Inventory covers: ${reconciledCoverage}% of ordered items`);

console.log('\n💡 RECOMMENDATION:');
if (orderCoverage < 100) {
  console.log('  ⚠️ Inventory is INCOMPLETE - missing items from orders');
  console.log('  📝 Need to add missing items to achieve 100% order coverage');
  console.log('  🔄 Consider running a full inventory synchronization');
}

console.log('\n' + '='.repeat(80));