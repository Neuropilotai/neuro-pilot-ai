const fs = require('fs');
const path = require('path');

// Build accurate inventory from GFS orders without assuming consumption
function buildAccurateInventory() {
  console.log('📦 BUILDING ACCURATE INVENTORY (NO ASSUMED CONSUMPTION)\n');

  const gfsOrdersDir = './data/gfs_orders';
  const consolidatedInventory = new Map();

  // Load all GFS orders
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

  console.log(`📋 Processing ${files.length} order files...\n`);

  let totalOrders = 0;
  let totalItems = 0;
  let grossOrderValue = 0;  // Total invoiced
  let creditValue = 0;       // Total credits
  let totalInvoices = 0;
  let totalCredits = 0;

  for (const file of files) {
    try {
      const orderData = JSON.parse(fs.readFileSync(path.join(gfsOrdersDir, file), 'utf8'));

      if (!orderData.items || !Array.isArray(orderData.items)) continue;

      totalOrders++;

      // Calculate order total for summary
      let orderTotal = 0;
      if (orderData.invoiceTotal && orderData.invoiceTotal !== 0) {
        orderTotal = orderData.invoiceTotal;
      } else if (orderData.totalValue && orderData.totalValue !== 0) {
        orderTotal = orderData.totalValue;
      } else if (orderData.subtotal && orderData.subtotal !== 0) {
        orderTotal = orderData.subtotal;
      }

      if (orderData.isCreditMemo || orderTotal < 0) {
        creditValue += Math.abs(orderTotal);
        totalCredits++;
      } else {
        grossOrderValue += orderTotal;
        totalInvoices++;
      }

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
            orderedQuantity: 0,      // Total ordered from invoices
            creditedQuantity: 0,      // Total returned via credits
            netQuantity: 0,           // Net quantity (ordered - credited)
            currentQuantity: 0,       // Assumed current (same as net without manual count)
            invoiceValue: 0,          // Total value from invoices
            creditValue: 0,           // Total value of credits
            netValue: 0,              // Net value after credits
            avgPrice: 0,
            lastPrice: 0,
            barcode: item.barcode || '',
            orderCount: 0,
            creditCount: 0,
            firstSeen: orderData.orderDate,
            lastSeen: orderData.orderDate,
            priceHistory: []
          });
        }

        const invItem = consolidatedInventory.get(item.itemCode);
        const qty = item.qtyShipped || item.qtyOrdered || 0;
        const price = item.unitPrice || 0;
        const lineValue = qty * price;

        if (orderData.isCreditMemo) {
          // Track credits separately
          invItem.creditedQuantity += qty;
          invItem.creditValue += lineValue;
          invItem.creditCount++;
        } else {
          // Track regular orders
          invItem.orderedQuantity += qty;
          invItem.invoiceValue += lineValue;
          invItem.orderCount++;
        }

        // Calculate net values
        invItem.netQuantity = invItem.orderedQuantity - invItem.creditedQuantity;
        invItem.currentQuantity = invItem.netQuantity; // Without manual count, assume all net is still in stock
        invItem.netValue = invItem.invoiceValue - invItem.creditValue;

        invItem.lastPrice = price;
        invItem.lastSeen = orderData.orderDate || invItem.lastSeen;

        // Track price history
        if (price > 0) {
          invItem.priceHistory.push({
            date: orderData.orderDate,
            invoice: orderData.invoiceNumber,
            price: price,
            quantity: qty,
            type: orderData.isCreditMemo ? 'credit' : 'invoice'
          });
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Calculate average prices
  consolidatedInventory.forEach(item => {
    if (item.netQuantity > 0) {
      item.avgPrice = item.netValue / item.netQuantity;
    } else if (item.lastPrice > 0) {
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

  // Calculate totals
  const totalNetValue = inventoryArray.reduce((sum, item) => sum + item.netValue, 0);
  const totalInvoiceValue = inventoryArray.reduce((sum, item) => sum + item.invoiceValue, 0);
  const totalCreditValue = inventoryArray.reduce((sum, item) => sum + item.creditValue, 0);

  // Save accurate inventory
  const outputPath = './data/accurate_inventory.json';
  const outputData = {
    generatedAt: new Date().toISOString(),
    note: 'Without manual inventory count, current quantity equals net ordered quantity',
    orders: {
      totalOrders: totalOrders,
      totalInvoices: totalInvoices,
      totalCredits: totalCredits,
      totalItems: totalItems
    },
    values: {
      grossOrderValue: grossOrderValue,       // What was billed (invoices)
      creditValue: creditValue,               // What was credited back
      netOrderValue: grossOrderValue - creditValue,  // Net billed
      inventoryInvoiceValue: totalInvoiceValue,      // Sum of all invoice line items
      inventoryCreditValue: totalCreditValue,        // Sum of all credit line items
      inventoryNetValue: totalNetValue               // Current inventory value (should equal netOrderValue)
    },
    inventory: inventoryArray
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

  // Display summary
  console.log('=' .repeat(60));
  console.log('📊 ACCURATE INVENTORY CALCULATION');
  console.log('=' .repeat(60));
  console.log();

  console.log('💰 ORDER TOTALS:');
  console.log(`   Invoices: ${totalInvoices} orders = $${grossOrderValue.toFixed(2)}`);
  console.log(`   Credits:  ${totalCredits} orders = -$${creditValue.toFixed(2)}`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   NET ORDERS: $${(grossOrderValue - creditValue).toFixed(2)}`);
  console.log();

  console.log('📦 INVENTORY VALUES:');
  console.log(`   Invoice Items Total: $${totalInvoiceValue.toFixed(2)}`);
  console.log(`   Credit Items Total:  -$${totalCreditValue.toFixed(2)}`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   NET INVENTORY: $${totalNetValue.toFixed(2)}`);
  console.log();

  const difference = (grossOrderValue - creditValue) - totalNetValue;
  if (Math.abs(difference) > 1) {
    console.log('⚠️  DISCREPANCY DETECTED:');
    console.log(`   Order Total: $${(grossOrderValue - creditValue).toFixed(2)}`);
    console.log(`   Inventory Total: $${totalNetValue.toFixed(2)}`);
    console.log(`   Difference: $${difference.toFixed(2)}`);
    console.log('   This may be due to rounding or items without prices');
  } else {
    console.log('✅ VALUES MATCH!');
    console.log('   Order totals equal inventory totals');
    console.log('   (As expected without manual count)');
  }

  console.log();
  console.log(`📋 Unique Items: ${inventoryArray.length}`);
  console.log(`📦 Total Line Items: ${totalItems}`);
  console.log();

  // Show top 10 items by net value
  const topItems = inventoryArray
    .filter(item => item.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue)
    .slice(0, 10);

  console.log('🏆 TOP 10 ITEMS BY NET VALUE:');
  topItems.forEach((item, index) => {
    console.log(`${index + 1}. ${item.itemCode} - ${item.description}`);
    console.log(`   Ordered: ${item.orderedQuantity} | Credited: ${item.creditedQuantity} | Net: ${item.netQuantity}`);
    console.log(`   Net Value: $${item.netValue.toFixed(2)} | Avg Price: $${item.avgPrice.toFixed(2)}`);
  });

  console.log(`\n✅ Saved to: ${outputPath}`);

  return outputData;
}

// Run the calculation
const result = buildAccurateInventory();