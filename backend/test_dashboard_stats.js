#!/usr/bin/env node

/**
 * TEST DASHBOARD STATISTICS
 *
 * Quick test to show dashboard metrics:
 * - Order processing status
 * - Inventory total value
 * - Value by status
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

async function testDashboard() {
  console.log('');
  console.log('📊 DASHBOARD STATISTICS TEST');
  console.log('='.repeat(70));
  console.log('');

  const manager = new EnterpriseInventoryManager();

  try {
    await manager.initialize();

    // Get order processing stats
    console.log('📦 ORDER PROCESSING STATUS');
    console.log('-'.repeat(70));
    const orderStats = await manager.getOrderProcessingStats();
    console.log(`Total Orders: ${orderStats.total_orders}`);
    console.log(`  ✅ Processed: ${orderStats.processed_orders} orders (${orderStats.processed_items} items)`);
    console.log(`  ⏳ Pending: ${orderStats.pending_orders} orders (${orderStats.pending_items} items)`);
    console.log(`Date Range: ${orderStats.earliest_order_date} → ${orderStats.latest_order_date}`);
    console.log('');

    // Get inventory value
    console.log('💰 INVENTORY TOTAL VALUE');
    console.log('-'.repeat(70));
    const inventoryValue = await manager.getInventoryTotalValue();
    console.log(`Total Value (PLACED + COUNTED): $${inventoryValue.total_value.toLocaleString()}`);
    console.log(`  Unique Items: ${inventoryValue.unique_items}`);
    console.log(`  Total Line Items: ${inventoryValue.total_line_items}`);
    console.log(`  Total Quantity: ${inventoryValue.total_quantity}`);
    console.log('');

    // Get value by status
    console.log('📋 VALUE BREAKDOWN BY STATUS');
    console.log('-'.repeat(70));
    const valueByStatus = await manager.getInventoryValueByStatus();

    let grandTotal = 0;
    valueByStatus.forEach(status => {
      console.log(`${status.status}:`);
      console.log(`  Orders: ${status.order_count}`);
      console.log(`  Items: ${status.item_count}`);
      console.log(`  Value: $${status.total_value.toLocaleString()}`);
      console.log(`  Quantity: ${status.total_quantity}`);
      console.log('');
      grandTotal += status.total_value;
    });

    console.log('-'.repeat(70));
    console.log(`GRAND TOTAL (all statuses): $${grandTotal.toLocaleString()}`);
    console.log('');

    manager.close();

    console.log('✅ Dashboard statistics working correctly');
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error.message);
    manager.close();
    process.exit(1);
  }
}

testDashboard();
