const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE ACCURACY AUDIT SYSTEM');
console.log('='.repeat(80));

class AccuracyAuditSystem {
  constructor() {
    this.ordersDir = './data/gfs_orders';
    this.inventoryFile = './data/fifo_inventory.json';
    this.issues = [];
    this.realData = {
      actualInventoryItems: 0,
      itemsWithStock: 0,
      lowStockItems: 0,
      zeroStockItems: 0,
      recentOrders: [],
      recentActivity: []
    };
  }

  async runComprehensiveAudit() {
    console.log('🔄 Starting comprehensive accuracy audit...');

    await this.auditInventoryCount();
    await this.auditStockLevels();
    await this.auditRecentOrders();
    await this.auditRecentActivity();
    await this.auditValueMatching();

    this.generateAccuracyReport();
    await this.createFixRecommendations();

    return this.issues;
  }

  async auditInventoryCount() {
    console.log('📦 Auditing inventory count accuracy...');

    try {
      const inventoryData = JSON.parse(fs.readFileSync(this.inventoryFile, 'utf8'));
      let actualCount = 0;
      let itemsWithStock = 0;
      let lowStock = 0;
      let zeroStock = 0;

      for (const [itemCode, data] of inventoryData.inventory || []) {
        actualCount++;

        let totalQuantity = 0;
        if (data.batches && Array.isArray(data.batches)) {
          for (const batch of data.batches) {
            totalQuantity += batch.quantity || 0;
          }
        }

        if (totalQuantity > 0) {
          itemsWithStock++;

          // Consider low stock if less than 10 units (adjustable threshold)
          if (totalQuantity < 10) {
            lowStock++;
          }
        } else {
          zeroStock++;
        }
      }

      this.realData.actualInventoryItems = actualCount;
      this.realData.itemsWithStock = itemsWithStock;
      this.realData.lowStockItems = lowStock;
      this.realData.zeroStockItems = zeroStock;

      console.log(`✅ Inventory audit complete:`);
      console.log(`   Total Items: ${actualCount}`);
      console.log(`   Items with Stock: ${itemsWithStock}`);
      console.log(`   Low Stock Items: ${lowStock}`);
      console.log(`   Zero Stock Items: ${zeroStock}`);

      // Check if dashboard shows wrong numbers
      if (actualCount !== 899) {
        this.issues.push({
          type: 'INVENTORY_COUNT_MISMATCH',
          severity: 'HIGH',
          expected: 899,
          actual: actualCount,
          description: `Dashboard shows 899 items but actual count is ${actualCount}`
        });
      }

    } catch (error) {
      this.issues.push({
        type: 'INVENTORY_READ_ERROR',
        severity: 'CRITICAL',
        description: `Cannot read inventory file: ${error.message}`
      });
    }
  }

  async auditStockLevels() {
    console.log('📊 Auditing stock level calculations...');

    // The dashboard shows "511 low stock items" - let's verify this
    const dashboardLowStock = 511;
    const actualLowStock = this.realData.lowStockItems;

    if (dashboardLowStock !== actualLowStock) {
      this.issues.push({
        type: 'LOW_STOCK_COUNT_MISMATCH',
        severity: 'HIGH',
        expected: dashboardLowStock,
        actual: actualLowStock,
        description: `Dashboard shows ${dashboardLowStock} low stock items but actual count is ${actualLowStock}`
      });
    }
  }

  async auditRecentOrders() {
    console.log('📋 Auditing recent orders data...');

    try {
      const orderFiles = fs.readdirSync(this.ordersDir).filter(f => f.endsWith('.json'));
      const recentOrders = [];

      // Get the 5 most recent orders by date
      const ordersWithDates = [];

      for (const file of orderFiles.slice(0, 20)) { // Check first 20 files for performance
        try {
          const order = JSON.parse(fs.readFileSync(path.join(this.ordersDir, file), 'utf8'));
          if (order.orderDate && order.invoiceNumber) {
            ordersWithDates.push({
              invoiceNumber: order.invoiceNumber,
              orderDate: order.orderDate,
              total: order.invoiceTotal || 0,
              type: order.type || 'order',
              isCreditMemo: order.isCreditMemo || false
            });
          }
        } catch (error) {
          // Skip invalid files
        }
      }

      // Sort by date (most recent first)
      ordersWithDates.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
      this.realData.recentOrders = ordersWithDates.slice(0, 5);

      console.log('✅ Recent orders found:');
      this.realData.recentOrders.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order.invoiceNumber} - ${order.orderDate} - $${order.total} (${order.type})`);
      });

      // Check for dummy data
      const hasDummyData = this.realData.recentOrders.some(order =>
        order.invoiceNumber.includes('dummy') ||
        order.invoiceNumber.includes('demo') ||
        order.orderDate.includes('demo')
      );

      if (hasDummyData) {
        this.issues.push({
          type: 'DUMMY_ORDER_DATA',
          severity: 'MEDIUM',
          description: 'Recent orders contain dummy/demo data'
        });
      }

    } catch (error) {
      this.issues.push({
        type: 'RECENT_ORDERS_ERROR',
        severity: 'HIGH',
        description: `Cannot read recent orders: ${error.message}`
      });
    }
  }

  async auditRecentActivity() {
    console.log('🎯 Auditing recent activity data...');

    // Check if activity data exists and is real
    const activityFile = './data/recent_activity.json';

    if (!fs.existsSync(activityFile)) {
      this.issues.push({
        type: 'MISSING_ACTIVITY_DATA',
        severity: 'MEDIUM',
        description: 'Recent activity data file does not exist'
      });

      // Generate real activity from actual data
      this.realData.recentActivity = this.generateRealActivity();
    } else {
      try {
        const activityData = JSON.parse(fs.readFileSync(activityFile, 'utf8'));

        // Check for demo/dummy data
        const hasDemoData = JSON.stringify(activityData).includes('demo') ||
                           JSON.stringify(activityData).includes('dummy');

        if (hasDemoData) {
          this.issues.push({
            type: 'DEMO_ACTIVITY_DATA',
            severity: 'MEDIUM',
            description: 'Recent activity contains demo/dummy data'
          });
        }

      } catch (error) {
        this.issues.push({
          type: 'ACTIVITY_READ_ERROR',
          severity: 'MEDIUM',
          description: `Cannot read activity file: ${error.message}`
        });
      }
    }
  }

  generateRealActivity() {
    const activities = [];

    // Add real inventory activities
    activities.push({
      type: 'inventory_update',
      message: `Inventory system loaded ${this.realData.actualInventoryItems} items`,
      timestamp: new Date().toISOString(),
      status: 'success'
    });

    // Add stock level activities
    if (this.realData.lowStockItems > 0) {
      activities.push({
        type: 'low_stock_alert',
        message: `${this.realData.lowStockItems} items below minimum stock level`,
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        status: 'warning'
      });
    }

    // Add recent order activities
    this.realData.recentOrders.slice(0, 3).forEach((order, i) => {
      activities.push({
        type: 'order_processed',
        message: `Order ${order.invoiceNumber} processed - $${order.total}`,
        timestamp: new Date(Date.now() - (i + 1) * 1800000).toISOString(), // 30min intervals
        status: order.isCreditMemo ? 'info' : 'success'
      });
    });

    return activities.slice(0, 5);
  }

  async auditValueMatching() {
    console.log('💰 Auditing inventory-order value matching...');

    try {
      // Get validated data
      const validatedDataFile = './data/validated_system_data.json';
      if (fs.existsSync(validatedDataFile)) {
        const validatedData = JSON.parse(fs.readFileSync(validatedDataFile, 'utf8'));

        const orderValue = validatedData.data.totalOrderValue;
        const inventoryValue = validatedData.data.totalInventoryValue;
        const discrepancy = Math.abs(orderValue - inventoryValue);
        const discrepancyPercent = (discrepancy / orderValue) * 100;

        if (discrepancyPercent > 10) {
          this.issues.push({
            type: 'MAJOR_VALUE_DISCREPANCY',
            severity: 'CRITICAL',
            orderValue: orderValue,
            inventoryValue: inventoryValue,
            discrepancy: discrepancy,
            percentage: discrepancyPercent.toFixed(2),
            description: `Major value mismatch: Orders $${orderValue.toFixed(2)} vs Inventory $${inventoryValue.toFixed(2)} (${discrepancyPercent.toFixed(2)}% difference)`
          });
        }
      }
    } catch (error) {
      this.issues.push({
        type: 'VALUE_AUDIT_ERROR',
        severity: 'HIGH',
        description: `Cannot audit value matching: ${error.message}`
      });
    }
  }

  generateAccuracyReport() {
    console.log('\n📈 ACCURACY AUDIT REPORT');
    console.log('='.repeat(60));

    console.log('\n🔢 REAL DATA SUMMARY:');
    console.log(`✅ Actual Inventory Items: ${this.realData.actualInventoryItems}`);
    console.log(`📦 Items with Stock: ${this.realData.itemsWithStock}`);
    console.log(`⚠️  Low Stock Items: ${this.realData.lowStockItems}`);
    console.log(`❌ Zero Stock Items: ${this.realData.zeroStockItems}`);

    console.log('\n🚨 ISSUES FOUND:');
    if (this.issues.length === 0) {
      console.log('✅ No accuracy issues detected');
    } else {
      this.issues.forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`   ${issue.description}`);
        if (issue.expected !== undefined) {
          console.log(`   Expected: ${issue.expected}, Actual: ${issue.actual}`);
        }
      });
    }
  }

  async createFixRecommendations() {
    console.log('\n💡 FIX RECOMMENDATIONS:');

    const fixes = [];

    // Fix inventory count
    if (this.issues.some(i => i.type === 'INVENTORY_COUNT_MISMATCH')) {
      fixes.push('Update dashboard to show correct inventory count from API');
    }

    // Fix low stock calculation
    if (this.issues.some(i => i.type === 'LOW_STOCK_COUNT_MISMATCH')) {
      fixes.push('Recalculate low stock items with proper thresholds');
    }

    // Fix dummy data
    if (this.issues.some(i => i.type.includes('DUMMY') || i.type.includes('DEMO'))) {
      fixes.push('Replace all dummy/demo data with real data');
    }

    // Fix value discrepancy
    if (this.issues.some(i => i.type === 'MAJOR_VALUE_DISCREPANCY')) {
      fixes.push('Investigate and reconcile order-inventory value mismatch');
    }

    fixes.forEach((fix, i) => {
      console.log(`${i + 1}. ${fix}`);
    });

    // Save accuracy audit results
    const auditResults = {
      timestamp: new Date().toISOString(),
      realData: this.realData,
      issues: this.issues,
      fixes: fixes
    };

    fs.writeFileSync('./data/accuracy_audit_results.json', JSON.stringify(auditResults, null, 2));
    console.log('\n💾 Audit results saved to accuracy_audit_results.json');
  }
}

// Export for use in other modules
module.exports = AccuracyAuditSystem;

// Run if called directly
if (require.main === module) {
  async function main() {
    const audit = new AccuracyAuditSystem();
    await audit.runComprehensiveAudit();

    console.log('\n🎯 ACCURACY AUDIT COMPLETE!');
    console.log('Ready to implement fixes for enterprise accuracy');
  }

  main().catch(console.error);
}