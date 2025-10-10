const fs = require('fs');
const path = require('path');

// Build real inventory from GFS orders
function buildRealInventory() {
  console.log('📦 BUILDING REAL INVENTORY FROM GFS ORDERS\n');

  const gfsOrdersDir = './data/gfs_orders';
  const consolidatedInventory = new Map();
  const itemPriceHistory = new Map();

  // Load all GFS orders
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

  console.log(`📋 Processing ${files.length} order files...\n`);

  let totalOrders = 0;
  let totalItems = 0;
  let totalValue = 0;

  for (const file of files) {
    try {
      const orderData = JSON.parse(fs.readFileSync(path.join(gfsOrdersDir, file), 'utf8'));

      if (!orderData.items || !Array.isArray(orderData.items)) continue;

      totalOrders++;

      // Process each item in the order
      for (const item of orderData.items) {
        if (!item.itemCode) continue;

        totalItems++;

        // Get or create inventory entry
        if (!consolidatedInventory.has(item.itemCode)) {
          consolidatedInventory.set(item.itemCode, {
            itemCode: item.itemCode,
            description: item.description || '',
            unit: item.unit || 'CS',
            totalQuantity: 0,
            totalValue: 0,
            avgPrice: 0,
            lastPrice: 0,
            barcode: item.barcode || '',
            orderCount: 0,
            firstSeen: orderData.orderDate,
            lastSeen: orderData.orderDate,
            priceHistory: []
          });
        }

        const invItem = consolidatedInventory.get(item.itemCode);

        // Handle credit memos (negative quantities)
        const qty = orderData.isCreditMemo ? -(item.qtyShipped || 0) : (item.qtyShipped || item.qtyOrdered || 0);
        const price = item.unitPrice || 0;
        const lineValue = qty * price;

        // Update inventory
        invItem.totalQuantity += qty;
        invItem.totalValue += lineValue;
        invItem.lastPrice = price;
        invItem.orderCount++;
        invItem.lastSeen = orderData.orderDate || invItem.lastSeen;

        // Track price history
        if (price > 0) {
          invItem.priceHistory.push({
            date: orderData.orderDate,
            invoice: orderData.invoiceNumber,
            price: price,
            quantity: qty
          });
        }

        totalValue += lineValue;
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Calculate average prices
  consolidatedInventory.forEach(item => {
    if (item.totalQuantity > 0) {
      item.avgPrice = item.totalValue / item.totalQuantity;
    } else if (item.priceHistory.length > 0) {
      // Use last known price if quantity is 0
      item.avgPrice = item.lastPrice;
    }

    // Sort price history by date
    item.priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Keep only last 10 price points
    if (item.priceHistory.length > 10) {
      item.priceHistory = item.priceHistory.slice(0, 10);
    }
  });

  // Convert to array and sort by item code
  const inventoryArray = Array.from(consolidatedInventory.values())
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode));

  // Save consolidated inventory
  const outputPath = './data/real_consolidated_inventory.json';
  const outputData = {
    generatedAt: new Date().toISOString(),
    totalOrders: totalOrders,
    totalUniqueItems: inventoryArray.length,
    totalItemsProcessed: totalItems,
    totalInventoryValue: totalValue,
    inventory: inventoryArray
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

  console.log('=' .repeat(60));
  console.log('📊 INVENTORY CONSOLIDATION COMPLETE');
  console.log('=' .repeat(60));
  console.log();
  console.log(`📦 Total Orders Processed: ${totalOrders}`);
  console.log(`🏷️  Unique Items: ${inventoryArray.length}`);
  console.log(`📋 Total Line Items: ${totalItems}`);
  console.log(`💰 Total Inventory Value: $${totalValue.toFixed(2)}`);
  console.log();

  // Show top 10 items by value
  const topItems = inventoryArray
    .filter(item => item.totalQuantity > 0)
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  console.log('🏆 TOP 10 ITEMS BY VALUE:');
  topItems.forEach((item, index) => {
    console.log(`${index + 1}. ${item.itemCode} - ${item.description}`);
    console.log(`   Qty: ${item.totalQuantity} | Value: $${item.totalValue.toFixed(2)} | Avg Price: $${item.avgPrice.toFixed(2)}`);
  });

  console.log(`\n✅ Saved to: ${outputPath}`);

  return outputData;
}

// Run the consolidation
const result = buildRealInventory();