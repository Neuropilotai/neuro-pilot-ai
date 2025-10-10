const fs = require('fs');

// Investigate the $398,170 discrepancy between orders and inventory
function investigateDiscrepancy() {
  console.log('🔍 INVESTIGATING ORDER VS INVENTORY DISCREPANCY\n');

  const gfsOrdersDir = './data/gfs_orders';
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

  let totalOrderValue = 0;
  let totalLineItemValue = 0;
  let ordersWithNoItems = 0;
  let ordersWithMissingPrices = 0;
  let taxTotal = 0;
  let subtotalSum = 0;
  let invoiceTotalSum = 0;

  const problemOrders = [];

  for (const file of files) {
    try {
      const order = JSON.parse(fs.readFileSync(`${gfsOrdersDir}/${file}`, 'utf8'));

      // Get order total
      let orderTotal = 0;
      if (order.invoiceTotal && order.invoiceTotal !== 0) {
        orderTotal = order.invoiceTotal;
      } else if (order.totalValue && order.totalValue !== 0) {
        orderTotal = order.totalValue;
      } else if (order.subtotal && order.subtotal !== 0) {
        orderTotal = order.subtotal;
      }

      totalOrderValue += orderTotal;

      // Calculate line items total
      let lineItemsTotal = 0;
      let hasItems = false;
      let hasMissingPrices = false;

      if (order.items && Array.isArray(order.items)) {
        hasItems = order.items.length > 0;

        for (const item of order.items) {
          const qty = item.qtyShipped || item.qtyOrdered || 0;
          const price = item.unitPrice || 0;

          if (price === 0 && qty > 0) {
            hasMissingPrices = true;
          }

          lineItemsTotal += qty * price;
        }
      }

      if (!hasItems) ordersWithNoItems++;
      if (hasMissingPrices) ordersWithMissingPrices++;

      if (order.isCreditMemo) {
        lineItemsTotal = -lineItemsTotal; // Credits are negative
      }

      totalLineItemValue += lineItemsTotal;

      // Track taxes and subtotals
      if (order.totalTaxPaid) taxTotal += order.totalTaxPaid;
      if (order.subtotal) subtotalSum += order.subtotal;
      invoiceTotalSum += orderTotal;

      // Check for significant discrepancies
      const orderDiscrepancy = Math.abs(orderTotal - lineItemsTotal);
      if (orderDiscrepancy > 10) {
        problemOrders.push({
          invoice: order.invoiceNumber,
          orderDate: order.orderDate,
          orderTotal: orderTotal,
          lineItemsTotal: lineItemsTotal,
          discrepancy: orderDiscrepancy,
          itemCount: order.items ? order.items.length : 0,
          hasNoItems: !hasItems,
          hasMissingPrices: hasMissingPrices,
          taxPaid: order.totalTaxPaid || 0,
          subtotal: order.subtotal || 0,
          isCredit: order.isCreditMemo
        });
      }

    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Results
  const totalDiscrepancy = totalOrderValue - totalLineItemValue;

  console.log('=' .repeat(60));
  console.log('🔍 DISCREPANCY INVESTIGATION RESULTS');
  console.log('=' .repeat(60));
  console.log();

  console.log('📊 SUMMARY:');
  console.log(`   Total Order Value (invoices): $${totalOrderValue.toFixed(2)}`);
  console.log(`   Total Line Items Value: $${totalLineItemValue.toFixed(2)}`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   DISCREPANCY: $${totalDiscrepancy.toFixed(2)}`);
  console.log();

  console.log('📋 POTENTIAL CAUSES:');
  console.log(`   Orders with no items: ${ordersWithNoItems}`);
  console.log(`   Orders with missing prices: ${ordersWithMissingPrices}`);
  console.log(`   Total taxes found: $${taxTotal.toFixed(2)}`);
  console.log(`   Subtotal sum: $${subtotalSum.toFixed(2)}`);
  console.log(`   Invoice total sum: $${invoiceTotalSum.toFixed(2)}`);
  console.log();

  // Sort problem orders by discrepancy
  problemOrders.sort((a, b) => b.discrepancy - a.discrepancy);

  if (problemOrders.length > 0) {
    console.log(`⚠️  PROBLEM ORDERS (${problemOrders.length} orders with >$10 discrepancy):`);

    const top20 = problemOrders.slice(0, 20);
    top20.forEach((order, index) => {
      console.log(`${index + 1}. ${order.invoice} (${order.orderDate})`);
      console.log(`   Order: $${order.orderTotal.toFixed(2)} | Items: $${order.lineItemsTotal.toFixed(2)} | Diff: $${order.discrepancy.toFixed(2)}`);
      console.log(`   ${order.itemCount} items | Tax: $${order.taxPaid.toFixed(2)} | ${order.isCredit ? 'CREDIT' : 'INVOICE'}`);
      console.log(`   Issues: ${order.hasNoItems ? 'No Items ' : ''}${order.hasMissingPrices ? 'Missing Prices' : ''}`);
      console.log();
    });

    if (problemOrders.length > 20) {
      console.log(`   ... and ${problemOrders.length - 20} more orders with discrepancies`);
    }
  }

  // Save detailed analysis
  const outputPath = './data/discrepancy_investigation.json';
  const analysisData = {
    investigatedAt: new Date().toISOString(),
    summary: {
      totalOrderValue,
      totalLineItemValue,
      discrepancy: totalDiscrepancy,
      ordersWithNoItems,
      ordersWithMissingPrices,
      taxTotal,
      subtotalSum,
      invoiceTotalSum
    },
    problemOrders: problemOrders
  };

  fs.writeFileSync(outputPath, JSON.stringify(analysisData, null, 2));

  console.log(`✅ Detailed analysis saved to: ${outputPath}`);

  return analysisData;
}

// Run investigation
const results = investigateDiscrepancy();