const fs = require('fs');
const path = require('path');

console.log('🎯 UNIFIED ORDER-INVENTORY MATCHING SYSTEM');
console.log('='.repeat(80));

class UnifiedOrderInventorySystem {
  constructor() {
    this.ordersDir = './data/gfs_orders';
    this.inventoryFile = './data/fifo_inventory.json';
    this.fulfillmentFile = './data/order_fulfillment_tracking.json';
    this.orders = new Map();
    this.inventory = new Map();
    this.fulfillmentTracking = new Map();
  }

  async initialize() {
    console.log('🔄 Initializing unified system...');
    await this.loadOrders();
    await this.loadInventory();
    await this.loadFulfillmentTracking();
    await this.syncOrdersToInventory();
    await this.saveFulfillmentTracking();
  }

  async loadOrders() {
    console.log('📋 Loading all orders...');
    const orderFiles = fs.readdirSync(this.ordersDir).filter(f => f.endsWith('.json'));
    let totalOrderValue = 0;

    for (const file of orderFiles) {
      try {
        const order = JSON.parse(fs.readFileSync(path.join(this.ordersDir, file), 'utf8'));

        if (order.invoiceTotal !== null && order.invoiceTotal !== undefined) {
          this.orders.set(order.invoiceNumber, {
            ...order,
            fulfillmentStatus: 'pending',
            itemsFulfilled: new Map(),
            totalFulfilled: 0,
            remainingValue: parseFloat(order.invoiceTotal)
          });
          totalOrderValue += parseFloat(order.invoiceTotal);
        }
      } catch (error) {
        console.log(`❌ Error loading ${file}: ${error.message}`);
      }
    }

    console.log(`✅ Loaded ${this.orders.size} orders`);
    console.log(`💰 Total Order Value: $${totalOrderValue.toFixed(2)}`);
    return totalOrderValue;
  }

  async loadInventory() {
    console.log('📦 Loading inventory...');
    try {
      const inventoryData = JSON.parse(fs.readFileSync(this.inventoryFile, 'utf8'));

      let totalInventoryValue = 0;
      for (const [itemCode, data] of inventoryData.inventory || []) {
        let itemTotal = 0;
        if (data.batches) {
          for (const batch of data.batches) {
            itemTotal += (batch.quantity || 0) * (batch.price || 0);
          }
        }

        this.inventory.set(itemCode, {
          ...data,
          totalValue: itemTotal,
          allocatedToOrders: new Map() // Track which orders this item is allocated to
        });

        totalInventoryValue += itemTotal;
      }

      console.log(`✅ Loaded ${this.inventory.size} inventory items`);
      console.log(`💰 Total Inventory Value: $${totalInventoryValue.toFixed(2)}`);
      return totalInventoryValue;
    } catch (error) {
      console.log(`❌ Error loading inventory: ${error.message}`);
      return 0;
    }
  }

  async loadFulfillmentTracking() {
    console.log('📊 Loading fulfillment tracking...');
    try {
      if (fs.existsSync(this.fulfillmentFile)) {
        const trackingData = JSON.parse(fs.readFileSync(this.fulfillmentFile, 'utf8'));
        this.fulfillmentTracking = new Map(trackingData.tracking || []);
        console.log(`✅ Loaded ${this.fulfillmentTracking.size} fulfillment records`);
      } else {
        console.log('📝 Creating new fulfillment tracking system...');
      }
    } catch (error) {
      console.log(`❌ Error loading fulfillment tracking: ${error.message}`);
    }
  }

  async syncOrdersToInventory() {
    console.log('🔗 Syncing orders to inventory for perfect matching...');

    // For each order, allocate inventory items
    for (const [orderNumber, order] of this.orders) {
      if (order.items && Array.isArray(order.items)) {
        for (const orderItem of order.items) {
          if (orderItem.itemCode && this.inventory.has(orderItem.itemCode)) {
            const inventoryItem = this.inventory.get(orderItem.itemCode);

            // Track allocation
            if (!inventoryItem.allocatedToOrders.has(orderNumber)) {
              inventoryItem.allocatedToOrders.set(orderNumber, {
                quantity: Math.abs(orderItem.qtyShipped || 0),
                unitPrice: orderItem.unitPrice || 0,
                lineTotal: Math.abs(orderItem.lineTotal || 0),
                fulfilled: false
              });
            }
          }
        }
      }

      // Initialize fulfillment tracking for new orders
      if (!this.fulfillmentTracking.has(orderNumber)) {
        this.fulfillmentTracking.set(orderNumber, {
          orderNumber,
          totalValue: order.invoiceTotal,
          fulfillmentStatus: 'pending',
          itemsFulfilled: [],
          fulfilledValue: 0,
          remainingValue: order.invoiceTotal,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    console.log('✅ Orders synchronized to inventory');
  }

  fulfillInventoryItem(itemCode, quantity, orderNumber = null) {
    console.log(`\n🎯 FULFILLING INVENTORY ITEM: ${itemCode}`);
    console.log(`   Quantity: ${quantity}`);
    console.log(`   Order: ${orderNumber || 'Not specified'}`);

    if (!this.inventory.has(itemCode)) {
      console.log(`❌ Item ${itemCode} not found in inventory`);
      return { success: false, message: 'Item not found in inventory' };
    }

    const inventoryItem = this.inventory.get(itemCode);
    const ordersCleared = [];
    let remainingQuantity = quantity;

    // Process allocations for this item
    for (const [allocOrderNumber, allocation] of inventoryItem.allocatedToOrders) {
      if (remainingQuantity <= 0) break;

      if (!orderNumber || orderNumber === allocOrderNumber) {
        if (!allocation.fulfilled && allocation.quantity <= remainingQuantity) {
          // Mark this allocation as fulfilled
          allocation.fulfilled = true;
          remainingQuantity -= allocation.quantity;

          // Update fulfillment tracking
          const fulfillment = this.fulfillmentTracking.get(allocOrderNumber);
          if (fulfillment) {
            fulfillment.itemsFulfilled.push({
              itemCode,
              quantity: allocation.quantity,
              unitPrice: allocation.unitPrice,
              lineTotal: allocation.lineTotal,
              fulfilledAt: new Date().toISOString()
            });

            fulfillment.fulfilledValue += allocation.lineTotal;
            fulfillment.remainingValue = Math.max(0, fulfillment.totalValue - fulfillment.fulfilledValue);
            fulfillment.lastUpdated = new Date().toISOString();

            // Check if order is completely fulfilled
            if (Math.abs(fulfillment.remainingValue) < 0.01) { // Account for floating point precision
              fulfillment.fulfillmentStatus = 'completed';
              ordersCleared.push({
                orderNumber: allocOrderNumber,
                totalValue: fulfillment.totalValue,
                items: fulfillment.itemsFulfilled.length
              });

              console.log(`🎉 ORDER COMPLETED: ${allocOrderNumber}`);
              console.log(`   Total Value: $${fulfillment.totalValue.toFixed(2)}`);
              console.log(`   Items Fulfilled: ${fulfillment.itemsFulfilled.length}`);
            } else {
              fulfillment.fulfillmentStatus = 'partial';
            }
          }
        }
      }
    }

    // Update inventory quantities
    if (inventoryItem.batches) {
      let qtyToRemove = quantity;
      for (const batch of inventoryItem.batches) {
        if (qtyToRemove <= 0) break;

        const removeFromBatch = Math.min(batch.quantity, qtyToRemove);
        batch.quantity -= removeFromBatch;
        qtyToRemove -= removeFromBatch;
      }
    }

    console.log(`✅ Inventory item ${itemCode} fulfilled`);
    if (ordersCleared.length > 0) {
      console.log(`🎉 ${ordersCleared.length} order(s) completed:`);
      ordersCleared.forEach(order => {
        console.log(`   - ${order.orderNumber}: $${order.totalValue.toFixed(2)} (${order.items} items)`);
      });
    }

    return {
      success: true,
      ordersCleared,
      remainingQuantity
    };
  }

  generateMatchingReport() {
    console.log('\n📊 GENERATING MATCHING REPORT...');

    let totalOrderValue = 0;
    let totalInventoryValue = 0;
    let totalFulfilledValue = 0;
    let completedOrders = 0;
    let partialOrders = 0;
    let pendingOrders = 0;

    // Calculate order totals
    for (const [orderNumber, order] of this.orders) {
      totalOrderValue += parseFloat(order.invoiceTotal);
    }

    // Calculate inventory totals
    for (const [itemCode, item] of this.inventory) {
      totalInventoryValue += item.totalValue || 0;
    }

    // Calculate fulfillment totals
    for (const [orderNumber, fulfillment] of this.fulfillmentTracking) {
      totalFulfilledValue += fulfillment.fulfilledValue;

      switch (fulfillment.fulfillmentStatus) {
        case 'completed': completedOrders++; break;
        case 'partial': partialOrders++; break;
        default: pendingOrders++; break;
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      totals: {
        orders: totalOrderValue,
        inventory: totalInventoryValue,
        fulfilled: totalFulfilledValue,
        remaining: totalOrderValue - totalFulfilledValue
      },
      orderStatus: {
        completed: completedOrders,
        partial: partialOrders,
        pending: pendingOrders,
        total: this.orders.size
      },
      accuracy: {
        percentage: ((totalInventoryValue / totalOrderValue) * 100).toFixed(2),
        discrepancy: Math.abs(totalOrderValue - totalInventoryValue)
      }
    };

    console.log('\n📈 UNIFIED SYSTEM REPORT:');
    console.log(`=`.repeat(50));
    console.log(`💰 Total Orders: $${report.totals.orders.toFixed(2)}`);
    console.log(`📦 Total Inventory: $${report.totals.inventory.toFixed(2)}`);
    console.log(`✅ Total Fulfilled: $${report.totals.fulfilled.toFixed(2)}`);
    console.log(`⏳ Remaining: $${report.totals.remaining.toFixed(2)}`);
    console.log(`=`.repeat(50));
    console.log(`📊 Order Status:`);
    console.log(`   Completed: ${report.orderStatus.completed}`);
    console.log(`   Partial: ${report.orderStatus.partial}`);
    console.log(`   Pending: ${report.orderStatus.pending}`);
    console.log(`   Total: ${report.orderStatus.total}`);
    console.log(`=`.repeat(50));
    console.log(`🎯 System Accuracy: ${report.accuracy.percentage}%`);
    console.log(`💥 Discrepancy: $${report.accuracy.discrepancy.toFixed(2)}`);

    return report;
  }

  async saveFulfillmentTracking() {
    try {
      const trackingData = {
        lastUpdated: new Date().toISOString(),
        tracking: Array.from(this.fulfillmentTracking.entries())
      };

      fs.writeFileSync(this.fulfillmentFile, JSON.stringify(trackingData, null, 2));
      console.log('💾 Fulfillment tracking saved');
    } catch (error) {
      console.log(`❌ Error saving fulfillment tracking: ${error.message}`);
    }
  }

  async saveUpdatedInventory() {
    try {
      const inventoryData = {
        lastUpdated: new Date().toISOString(),
        inventory: Array.from(this.inventory.entries())
      };

      fs.writeFileSync(this.inventoryFile, JSON.stringify(inventoryData, null, 2));
      console.log('💾 Updated inventory saved');
    } catch (error) {
      console.log(`❌ Error saving inventory: ${error.message}`);
    }
  }
}

// Export for use in other modules
module.exports = UnifiedOrderInventorySystem;

// Run if called directly
if (require.main === module) {
  async function main() {
    const system = new UnifiedOrderInventorySystem();
    await system.initialize();
    const report = system.generateMatchingReport();

    console.log('\n🎯 SYSTEM READY!');
    console.log('You can now:');
    console.log('1. Call fulfillInventoryItem(itemCode, quantity, orderNumber)');
    console.log('2. View real-time order completion notifications');
    console.log('3. Track exact order-inventory matching');
    console.log('\nExample usage:');
    console.log('system.fulfillInventoryItem("1278150", 69, "2002373141")');
  }

  main().catch(console.error);
}