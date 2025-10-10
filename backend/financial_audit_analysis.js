const fs = require('fs');
const path = require('path');

console.log('💰 FINANCIAL AUDIT ANALYSIS');
console.log('='.repeat(80));

class FinancialAuditor {
  constructor() {
    this.dataDir = './data';
    this.discrepancies = [];
    this.auditResults = {
      ordersTotal: 0,
      inventoryTotal: 0,
      orderCount: 0,
      inventoryItemCount: 0,
      missingSalesFromInventory: [],
      extraInventoryNotInOrders: [],
      priceDiscrepancies: [],
      creditMemoAdjustments: 0,
      detailedBreakdown: {
        ordersByType: {},
        inventoryByCategory: {}
      }
    };
  }

  async performAudit() {
    console.log('\n🔍 LOADING DATA FOR FINANCIAL AUDIT...');

    // Load order data
    const orderData = this.loadOrderData();
    console.log(`✓ Loaded ${orderData.length} order files`);

    // Load inventory data
    const inventoryData = this.loadInventoryData();
    console.log(`✓ Loaded ${Object.keys(inventoryData).length} inventory items`);

    // Calculate order totals
    this.analyzeOrders(orderData);
    console.log(`✓ Analyzed orders: $${this.auditResults.ordersTotal.toFixed(2)}`);

    // Calculate inventory totals
    this.analyzeInventory(inventoryData);
    console.log(`✓ Analyzed inventory: $${this.auditResults.inventoryTotal.toFixed(2)}`);

    // Find discrepancies
    this.findDiscrepancies(orderData, inventoryData);

    // Generate audit report
    this.generateAuditReport();

    return this.auditResults;
  }

  loadOrderData() {
    const orderData = [];

    // Try to load reconciled orders first (improved data with fixed prices)
    const reconciledOrdersDir = path.join(this.dataDir, 'reconciled/orders');
    if (fs.existsSync(reconciledOrdersDir)) {
      const reconciledFiles = fs.readdirSync(reconciledOrdersDir)
        .filter(file => file.endsWith('.json'));

      if (reconciledFiles.length > 0) {
        console.log('✓ Using reconciled order data for audit (improved accuracy)');
        for (const file of reconciledFiles) {
          try {
            const filePath = path.join(reconciledOrdersDir, file);
            const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (order.success && order.invoiceTotal && order.items) {
              orderData.push(order);
            }
          } catch (error) {
            console.warn(`⚠️ Skipped corrupted reconciled file: ${file}`);
          }
        }
        return orderData;
      }
    }

    // Fallback to original orders
    const ordersDir = path.join(this.dataDir, 'gfs_orders');
    if (fs.existsSync(ordersDir)) {
      const orderFiles = fs.readdirSync(ordersDir)
        .filter(file => file.endsWith('.json') && !file.includes('corrupted'));

      for (const file of orderFiles) {
        try {
          const filePath = path.join(ordersDir, file);
          const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (order.success && order.invoiceTotal && order.items) {
            orderData.push(order);
          }
        } catch (error) {
          console.warn(`⚠️ Skipped corrupted file: ${file}`);
        }
      }
    }

    return orderData;
  }

  loadInventoryData() {
    try {
      // Try to load reconciled inventory first (improved data with fixed prices)
      const reconciledPath = path.join(this.dataDir, 'reconciled/reconciled_inventory.json');
      if (fs.existsSync(reconciledPath)) {
        const reconciledData = JSON.parse(fs.readFileSync(reconciledPath, 'utf8'));
        if (reconciledData.inventory && Array.isArray(reconciledData.inventory)) {
          console.log('✓ Using reconciled inventory data for audit (improved accuracy)');
          return new Map(reconciledData.inventory || []);
        }
      }

      // Fallback to original FIFO data
      const inventoryFile = path.join(this.dataDir, 'fifo_inventory.json');
      const inventoryData = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
      return new Map(inventoryData.inventory || []);
    } catch (error) {
      console.error('❌ Error loading inventory:', error.message);
      return new Map();
    }
  }

  analyzeOrders(orderData) {
    let validOrderTotal = 0;
    let validOrderCount = 0;

    for (const order of orderData) {
      if (order.invoiceTotal && order.invoiceTotal > 0) {
        validOrderTotal += order.invoiceTotal;
        validOrderCount++;

        // Track by type
        const type = order.isCreditMemo ? 'credit_memo' : 'invoice';
        if (!this.auditResults.detailedBreakdown.ordersByType[type]) {
          this.auditResults.detailedBreakdown.ordersByType[type] = {
            count: 0,
            total: 0
          };
        }
        this.auditResults.detailedBreakdown.ordersByType[type].count++;
        this.auditResults.detailedBreakdown.ordersByType[type].total += order.invoiceTotal;

        // Subtract credit memos from total
        if (order.isCreditMemo) {
          this.auditResults.creditMemoAdjustments += order.invoiceTotal;
        }
      }
    }

    this.auditResults.ordersTotal = validOrderTotal;
    this.auditResults.orderCount = validOrderCount;
  }

  analyzeInventory(inventoryData) {
    let inventoryTotal = 0;
    let itemCount = 0;

    for (const [itemCode, itemData] of inventoryData) {
      if (itemData.batches && itemData.batches.length > 0) {
        let itemValue = 0;

        for (const batch of itemData.batches) {
          if (batch.quantity > 0 && batch.price > 0) {
            itemValue += batch.quantity * batch.price;
          }
        }

        if (itemValue > 0) {
          inventoryTotal += itemValue;
          itemCount++;

          // Categorize inventory
          const category = this.categorizeInventoryItem(itemData.description);
          if (!this.auditResults.detailedBreakdown.inventoryByCategory[category]) {
            this.auditResults.detailedBreakdown.inventoryByCategory[category] = {
              count: 0,
              value: 0
            };
          }
          this.auditResults.detailedBreakdown.inventoryByCategory[category].count++;
          this.auditResults.detailedBreakdown.inventoryByCategory[category].value += itemValue;
        }
      }
    }

    this.auditResults.inventoryTotal = inventoryTotal;
    this.auditResults.inventoryItemCount = itemCount;
  }

  categorizeInventoryItem(description) {
    if (!description) return 'UNCATEGORIZED';

    const upperDesc = description.toUpperCase();

    if (upperDesc.includes('BEEF') || upperDesc.includes('PORK') || upperDesc.includes('CHICKEN')) return 'MEAT';
    if (upperDesc.includes('BREAD') || upperDesc.includes('PASTRY')) return 'BAKERY';
    if (upperDesc.includes('MILK') || upperDesc.includes('CHEESE')) return 'DAIRY';
    if (upperDesc.includes('VEGETABLE') || upperDesc.includes('FRUIT')) return 'PRODUCE';

    return 'OTHER';
  }

  findDiscrepancies(orderData, inventoryData) {
    // Create maps for easier lookup
    const orderItems = new Map();
    const inventoryItems = new Map();

    // Process orders
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          const key = item.itemCode;
          if (!orderItems.has(key)) {
            orderItems.set(key, {
              totalValue: 0,
              totalQuantity: 0,
              orders: []
            });
          }

          const orderItem = orderItems.get(key);
          const itemValue = (item.unitPrice || 0) * (item.qtyShipped || 0);
          orderItem.totalValue += itemValue;
          orderItem.totalQuantity += (item.qtyShipped || 0);
          orderItem.orders.push({
            invoice: order.invoiceNumber,
            date: order.orderDate,
            value: itemValue,
            quantity: item.qtyShipped
          });
        }
      }
    }

    // Process inventory
    for (const [itemCode, itemData] of inventoryData) {
      inventoryItems.set(itemCode, itemData);
    }

    // Find items in orders but not in inventory
    for (const [itemCode, orderData] of orderItems) {
      if (!inventoryItems.has(itemCode)) {
        this.auditResults.missingSalesFromInventory.push({
          itemCode,
          orderValue: orderData.totalValue,
          orderQuantity: orderData.totalQuantity,
          orders: orderData.orders
        });
      }
    }

    // Find items in inventory but not in orders
    for (const [itemCode, inventoryData] of inventoryItems) {
      if (!orderItems.has(itemCode)) {
        let inventoryValue = 0;
        if (inventoryData.batches) {
          for (const batch of inventoryData.batches) {
            inventoryValue += (batch.quantity || 0) * (batch.price || 0);
          }
        }

        if (inventoryValue > 0) {
          this.auditResults.extraInventoryNotInOrders.push({
            itemCode,
            description: inventoryData.description,
            inventoryValue,
            batches: inventoryData.batches
          });
        }
      }
    }
  }

  generateAuditReport() {
    const discrepancy = this.auditResults.ordersTotal - this.auditResults.inventoryTotal;
    const discrepancyPercent = ((discrepancy / this.auditResults.ordersTotal) * 100).toFixed(2);

    console.log('\n💰 FINANCIAL AUDIT REPORT');
    console.log('='.repeat(80));

    console.log('\n📊 SUMMARY:');
    console.log(`  Orders Total: $${this.auditResults.ordersTotal.toFixed(2)} (${this.auditResults.orderCount} orders)`);
    console.log(`  Inventory Valuation: $${this.auditResults.inventoryTotal.toFixed(2)} (${this.auditResults.inventoryItemCount} items)`);
    console.log(`  💥 DISCREPANCY: $${discrepancy.toFixed(2)} (${discrepancyPercent}%)`);
    console.log(`  Credit Memo Adjustments: $${this.auditResults.creditMemoAdjustments.toFixed(2)}`);

    console.log('\n🚨 CRITICAL ISSUES:');
    console.log(`  • Items in orders but missing from inventory: ${this.auditResults.missingSalesFromInventory.length}`);
    console.log(`  • Items in inventory but no sales history: ${this.auditResults.extraInventoryNotInOrders.length}`);

    console.log('\n📈 ORDER BREAKDOWN:');
    for (const [type, data] of Object.entries(this.auditResults.detailedBreakdown.ordersByType)) {
      console.log(`  ${type}: ${data.count} orders, $${data.total.toFixed(2)}`);
    }

    console.log('\n📦 INVENTORY BREAKDOWN:');
    for (const [category, data] of Object.entries(this.auditResults.detailedBreakdown.inventoryByCategory)) {
      console.log(`  ${category}: ${data.count} items, $${data.value.toFixed(2)}`);
    }

    // Calculate accuracy
    const realAccuracy = 100 - Math.abs(parseFloat(discrepancyPercent));
    console.log(`\n🎯 REAL ACCURACY: ${realAccuracy.toFixed(1)}%`);
    console.log(`🚨 CURRENT SYSTEM CLAIMS: 100.0% (INCORRECT!)`);

    // Save detailed audit results
    const auditReport = {
      timestamp: new Date().toISOString(),
      summary: {
        ordersTotal: this.auditResults.ordersTotal,
        inventoryTotal: this.auditResults.inventoryTotal,
        discrepancy: discrepancy,
        discrepancyPercent: parseFloat(discrepancyPercent),
        realAccuracy: realAccuracy,
        claimedAccuracy: 100.0
      },
      issues: {
        missingSalesFromInventory: this.auditResults.missingSalesFromInventory,
        extraInventoryNotInOrders: this.auditResults.extraInventoryNotInOrders,
        creditMemoAdjustments: this.auditResults.creditMemoAdjustments
      },
      breakdown: this.auditResults.detailedBreakdown
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'financial_audit_report.json'),
      JSON.stringify(auditReport, null, 2)
    );

    console.log('\n💾 Detailed audit report saved to financial_audit_report.json');
  }
}

// Run audit
async function runFinancialAudit() {
  const auditor = new FinancialAuditor();
  const results = await auditor.performAudit();
  return results;
}

if (require.main === module) {
  runFinancialAudit().catch(console.error);
}

module.exports = FinancialAuditor;