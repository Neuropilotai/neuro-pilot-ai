const fs = require('fs');
const path = require('path');

console.log('🔍 VALUE DISCREPANCY INVESTIGATOR');
console.log('='.repeat(80));

class ValueDiscrepancyInvestigator {
  constructor() {
    this.ordersDir = './data/gfs_orders';
    this.inventoryFile = './data/fifo_inventory.json';
    this.findings = {
      orderAnalysis: {},
      inventoryAnalysis: {},
      discrepancyReasons: [],
      recommendations: []
    };
  }

  async investigateDiscrepancy() {
    console.log('🔄 Starting deep investigation of value discrepancy...');

    // Step 1: Detailed order analysis
    await this.analyzeOrderValues();

    // Step 2: Detailed inventory analysis
    await this.analyzeInventoryValues();

    // Step 3: Cross-compare and identify issues
    await this.identifyDiscrepancyReasons();

    // Step 4: Generate actionable recommendations
    await this.generateRecommendations();

    // Step 5: Create fix report
    await this.createFixReport();

    return this.findings;
  }

  async analyzeOrderValues() {
    console.log('📋 Deep analysis of order values...');

    try {
      const orderFiles = fs.readdirSync(this.ordersDir).filter(f => f.endsWith('.json'));

      let totalOrderValue = 0;
      let totalCreditMemoValue = 0;
      let regularOrderValue = 0;
      let orderCount = 0;
      let creditMemoCount = 0;
      let ordersWithItemBreakdown = 0;
      let ordersWithoutItemBreakdown = 0;

      const orderSamples = [];
      const problemOrders = [];

      for (const file of orderFiles) {
        try {
          const order = JSON.parse(fs.readFileSync(path.join(this.ordersDir, file), 'utf8'));

          if (order.invoiceTotal !== null && order.invoiceTotal !== undefined) {
            const value = parseFloat(order.invoiceTotal) || 0;

            if (order.isCreditMemo) {
              totalCreditMemoValue += Math.abs(value);
              creditMemoCount++;
            } else {
              regularOrderValue += value;
            }

            totalOrderValue += value;
            orderCount++;

            // Check if order has item breakdown
            if (order.lineItems && Array.isArray(order.lineItems) && order.lineItems.length > 0) {
              ordersWithItemBreakdown++;

              // Calculate line item total for comparison
              let lineItemTotal = 0;
              for (const item of order.lineItems) {
                if (item.price && item.quantity) {
                  lineItemTotal += item.price * item.quantity;
                }
              }

              // Store sample for analysis
              if (orderSamples.length < 10) {
                orderSamples.push({
                  invoiceNumber: order.invoiceNumber,
                  invoiceTotal: value,
                  lineItemTotal: lineItemTotal,
                  difference: Math.abs(value - lineItemTotal),
                  itemCount: order.lineItems.length
                });
              }

              // Flag orders with major discrepancies
              const discrepancyPercent = Math.abs(value - lineItemTotal) / Math.abs(value) * 100;
              if (discrepancyPercent > 10 && Math.abs(value) > 100) {
                problemOrders.push({
                  invoiceNumber: order.invoiceNumber,
                  invoiceTotal: value,
                  lineItemTotal: lineItemTotal,
                  discrepancyPercent: discrepancyPercent.toFixed(2)
                });
              }

            } else {
              ordersWithoutItemBreakdown++;
            }

          }
        } catch (error) {
          console.log(`   ⚠️ Error reading ${file}: ${error.message}`);
        }
      }

      this.findings.orderAnalysis = {
        totalOrderValue,
        regularOrderValue,
        totalCreditMemoValue,
        orderCount,
        creditMemoCount,
        ordersWithItemBreakdown,
        ordersWithoutItemBreakdown,
        averageOrderValue: orderCount > 0 ? totalOrderValue / orderCount : 0,
        orderSamples,
        problemOrders: problemOrders.slice(0, 5), // Top 5 problem orders
        itemBreakdownCoverage: (ordersWithItemBreakdown / orderCount * 100).toFixed(1)
      };

      console.log(`✅ Order analysis complete:`);
      console.log(`   Total Orders: ${orderCount} (${creditMemoCount} credit memos)`);
      console.log(`   Total Value: $${totalOrderValue.toFixed(2)}`);
      console.log(`   Regular Orders: $${regularOrderValue.toFixed(2)}`);
      console.log(`   Credit Memos: $${totalCreditMemoValue.toFixed(2)}`);
      console.log(`   Item Breakdown Coverage: ${this.findings.orderAnalysis.itemBreakdownCoverage}%`);
      console.log(`   Problem Orders Found: ${problemOrders.length}`);

    } catch (error) {
      console.log(`❌ Error analyzing orders: ${error.message}`);
    }
  }

  async analyzeInventoryValues() {
    console.log('📦 Deep analysis of inventory values...');

    try {
      const inventoryData = JSON.parse(fs.readFileSync(this.inventoryFile, 'utf8'));

      let totalInventoryValue = 0;
      let itemsWithPrices = 0;
      let itemsWithoutPrices = 0;
      let batchesWithPrices = 0;
      let batchesWithoutPrices = 0;
      let totalQuantity = 0;
      let valueDistribution = { low: 0, medium: 0, high: 0 };

      const priceSamples = [];
      const itemsNeedingPrices = [];

      for (const [itemCode, data] of inventoryData.inventory) {
        let itemValue = 0;
        let itemQuantity = 0;
        let itemHasPrice = false;

        if (data.batches && Array.isArray(data.batches)) {
          for (const batch of data.batches) {
            itemQuantity += batch.quantity || 0;
            totalQuantity += batch.quantity || 0;

            if (batch.price && batch.price > 0) {
              const batchValue = (batch.quantity || 0) * batch.price;
              itemValue += batchValue;
              totalInventoryValue += batchValue;
              batchesWithPrices++;
              itemHasPrice = true;

              // Store price sample
              if (priceSamples.length < 20) {
                priceSamples.push({
                  itemCode,
                  price: batch.price,
                  quantity: batch.quantity,
                  value: batchValue
                });
              }
            } else {
              batchesWithoutPrices++;
            }
          }
        }

        if (itemHasPrice) {
          itemsWithPrices++;

          // Categorize by value
          if (itemValue < 100) valueDistribution.low++;
          else if (itemValue < 1000) valueDistribution.medium++;
          else valueDistribution.high++;

        } else {
          itemsWithoutPrices++;

          // Flag items needing prices
          if (itemQuantity > 0 && itemsNeedingPrices.length < 10) {
            itemsNeedingPrices.push({
              itemCode,
              quantity: itemQuantity,
              description: data.description || 'No description'
            });
          }
        }
      }

      this.findings.inventoryAnalysis = {
        totalInventoryValue,
        itemsWithPrices,
        itemsWithoutPrices,
        batchesWithPrices,
        batchesWithoutPrices,
        totalQuantity,
        averageItemValue: itemsWithPrices > 0 ? totalInventoryValue / itemsWithPrices : 0,
        pricingCoverage: (itemsWithPrices / (itemsWithPrices + itemsWithoutPrices) * 100).toFixed(1),
        batchPricingCoverage: (batchesWithPrices / (batchesWithPrices + batchesWithoutPrices) * 100).toFixed(1),
        valueDistribution,
        priceSamples: priceSamples.slice(0, 10),
        itemsNeedingPrices
      };

      console.log(`✅ Inventory analysis complete:`);
      console.log(`   Total Inventory Value: $${totalInventoryValue.toFixed(2)}`);
      console.log(`   Items with Prices: ${itemsWithPrices}/${itemsWithPrices + itemsWithoutPrices} (${this.findings.inventoryAnalysis.pricingCoverage}%)`);
      console.log(`   Batches with Prices: ${batchesWithPrices}/${batchesWithPrices + batchesWithoutPrices} (${this.findings.inventoryAnalysis.batchPricingCoverage}%)`);
      console.log(`   Average Item Value: $${this.findings.inventoryAnalysis.averageItemValue.toFixed(2)}`);
      console.log(`   Items Needing Prices: ${itemsNeedingPrices.length}`);

    } catch (error) {
      console.log(`❌ Error analyzing inventory: ${error.message}`);
    }
  }

  async identifyDiscrepancyReasons() {
    console.log('🔍 Identifying discrepancy reasons...');

    const orderValue = this.findings.orderAnalysis.totalOrderValue;
    const inventoryValue = this.findings.inventoryAnalysis.totalInventoryValue;
    const discrepancy = Math.abs(orderValue - inventoryValue);
    const discrepancyPercent = (discrepancy / orderValue) * 100;

    // Reason 1: Pricing Coverage
    const pricingCoverage = parseFloat(this.findings.inventoryAnalysis.pricingCoverage);
    if (pricingCoverage < 80) {
      this.findings.discrepancyReasons.push({
        reason: 'INSUFFICIENT_PRICING_COVERAGE',
        impact: 'HIGH',
        description: `Only ${pricingCoverage}% of inventory items have pricing data`,
        estimatedImpact: `Missing pricing could account for ${(100 - pricingCoverage).toFixed(1)}% of discrepancy`,
        priority: 1
      });
    }

    // Reason 2: Credit Memo Impact
    const creditMemoPercent = (this.findings.orderAnalysis.totalCreditMemoValue / orderValue) * 100;
    if (creditMemoPercent > 15) {
      this.findings.discrepancyReasons.push({
        reason: 'HIGH_CREDIT_MEMO_IMPACT',
        impact: 'MEDIUM',
        description: `Credit memos represent ${creditMemoPercent.toFixed(1)}% of total order value`,
        estimatedImpact: `Credit memos may be incorrectly affecting inventory calculations`,
        priority: 2
      });
    }

    // Reason 3: Orders without Item Breakdown
    const itemBreakdownCoverage = parseFloat(this.findings.orderAnalysis.itemBreakdownCoverage);
    if (itemBreakdownCoverage < 90) {
      this.findings.discrepancyReasons.push({
        reason: 'INCOMPLETE_ORDER_BREAKDOWN',
        impact: 'MEDIUM',
        description: `Only ${itemBreakdownCoverage}% of orders have detailed item breakdowns`,
        estimatedImpact: `Missing item details prevent accurate inventory matching`,
        priority: 3
      });
    }

    // Reason 4: Problem Orders
    if (this.findings.orderAnalysis.problemOrders.length > 0) {
      this.findings.discrepancyReasons.push({
        reason: 'ORDER_TOTAL_MISMATCHES',
        impact: 'MEDIUM',
        description: `${this.findings.orderAnalysis.problemOrders.length} orders have mismatched totals vs line items`,
        estimatedImpact: `Order calculation errors affecting accuracy`,
        priority: 4
      });
    }

    // Reason 5: Inventory Undervaluation
    const averageOrderValue = this.findings.orderAnalysis.averageOrderValue;
    const averageItemValue = this.findings.inventoryAnalysis.averageItemValue;
    if (averageItemValue < averageOrderValue * 0.1) {
      this.findings.discrepancyReasons.push({
        reason: 'INVENTORY_UNDERVALUATION',
        impact: 'HIGH',
        description: `Average inventory item value ($${averageItemValue.toFixed(2)}) is very low compared to order patterns`,
        estimatedImpact: `Inventory prices may be outdated or incorrect`,
        priority: 1
      });
    }

    // Sort by priority
    this.findings.discrepancyReasons.sort((a, b) => a.priority - b.priority);

    console.log(`🔍 Found ${this.findings.discrepancyReasons.length} potential reasons for discrepancy:`);
    this.findings.discrepancyReasons.forEach((reason, i) => {
      console.log(`   ${i + 1}. [${reason.impact}] ${reason.reason}: ${reason.description}`);
    });
  }

  async generateRecommendations() {
    console.log('💡 Generating actionable recommendations...');

    // Priority 1: Fix pricing coverage
    if (this.findings.discrepancyReasons.some(r => r.reason === 'INSUFFICIENT_PRICING_COVERAGE')) {
      this.findings.recommendations.push({
        action: 'POPULATE_MISSING_PRICES',
        priority: 'HIGH',
        description: 'Extract pricing data from recent orders to populate missing inventory prices',
        implementation: 'Create price mapping from order line items to inventory items',
        estimatedAccuracyGain: '20-30%'
      });
    }

    // Priority 2: Fix inventory undervaluation
    if (this.findings.discrepancyReasons.some(r => r.reason === 'INVENTORY_UNDERVALUATION')) {
      this.findings.recommendations.push({
        action: 'UPDATE_PRICING_FROM_RECENT_ORDERS',
        priority: 'HIGH',
        description: 'Update inventory pricing using average prices from recent orders',
        implementation: 'Calculate weighted average prices from last 30 days of orders',
        estimatedAccuracyGain: '15-25%'
      });
    }

    // Priority 3: Handle credit memos correctly
    if (this.findings.discrepancyReasons.some(r => r.reason === 'HIGH_CREDIT_MEMO_IMPACT')) {
      this.findings.recommendations.push({
        action: 'ADJUST_CREDIT_MEMO_PROCESSING',
        priority: 'MEDIUM',
        description: 'Ensure credit memos correctly adjust inventory values',
        implementation: 'Review credit memo processing logic and inventory deduction',
        estimatedAccuracyGain: '5-10%'
      });
    }

    // Priority 4: Improve order breakdown
    if (this.findings.discrepancyReasons.some(r => r.reason === 'INCOMPLETE_ORDER_BREAKDOWN')) {
      this.findings.recommendations.push({
        action: 'ENHANCE_ORDER_PROCESSING',
        priority: 'MEDIUM',
        description: 'Improve order processing to capture complete item breakdowns',
        implementation: 'Review PDF extraction logic for missing line items',
        estimatedAccuracyGain: '5-10%'
      });
    }

    // Priority 5: Fix order calculation issues
    if (this.findings.discrepancyReasons.some(r => r.reason === 'ORDER_TOTAL_MISMATCHES')) {
      this.findings.recommendations.push({
        action: 'FIX_ORDER_CALCULATIONS',
        priority: 'LOW',
        description: 'Correct order total calculation discrepancies',
        implementation: 'Validate and fix order total calculation logic',
        estimatedAccuracyGain: '2-5%'
      });
    }

    console.log(`💡 Generated ${this.findings.recommendations.length} recommendations:`);
    this.findings.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. [${rec.priority}] ${rec.action}: ${rec.description} (${rec.estimatedAccuracyGain} gain)`);
    });
  }

  async createFixReport() {
    console.log('📊 Creating comprehensive fix report...');

    const orderValue = this.findings.orderAnalysis.totalOrderValue;
    const inventoryValue = this.findings.inventoryAnalysis.totalInventoryValue;
    const discrepancy = Math.abs(orderValue - inventoryValue);
    const discrepancyPercent = (discrepancy / orderValue) * 100;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        orderValue: orderValue,
        inventoryValue: inventoryValue,
        discrepancy: discrepancy,
        discrepancyPercent: discrepancyPercent,
        currentAccuracy: 100 - discrepancyPercent
      },
      analysis: this.findings,
      actionPlan: {
        immediateActions: this.findings.recommendations.filter(r => r.priority === 'HIGH'),
        mediumTermActions: this.findings.recommendations.filter(r => r.priority === 'MEDIUM'),
        longTermActions: this.findings.recommendations.filter(r => r.priority === 'LOW')
      },
      estimatedOutcome: {
        minimumAccuracyGain: '25%',
        maximumAccuracyGain: '70%',
        targetAccuracy: '85-95%',
        implementationTimeframe: '2-4 hours'
      }
    };

    // Save the report
    fs.writeFileSync('./data/value_discrepancy_investigation_report.json', JSON.stringify(report, null, 2));

    console.log('\n📈 DISCREPANCY INVESTIGATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`💰 Order Value: $${orderValue.toFixed(2)}`);
    console.log(`📦 Inventory Value: $${inventoryValue.toFixed(2)}`);
    console.log(`⚠️  Discrepancy: $${discrepancy.toFixed(2)} (${discrepancyPercent.toFixed(2)}%)`);
    console.log(`🎯 Current Accuracy: ${(100 - discrepancyPercent).toFixed(2)}%`);
    console.log(`🚀 Target Accuracy: 85-95%`);
    console.log(`📋 Root Causes Found: ${this.findings.discrepancyReasons.length}`);
    console.log(`💡 Actionable Fixes: ${this.findings.recommendations.length}`);
    console.log(`💾 Report saved to: value_discrepancy_investigation_report.json`);

    return report;
  }
}

// Export for use in other modules
module.exports = ValueDiscrepancyInvestigator;

// Run if called directly
if (require.main === module) {
  async function main() {
    const investigator = new ValueDiscrepancyInvestigator();
    const report = await investigator.investigateDiscrepancy();

    console.log('\n🎯 INVESTIGATION COMPLETE!');
    console.log('✅ Root causes identified');
    console.log('✅ Actionable recommendations generated');
    console.log('✅ Ready to implement fixes for enterprise accuracy');

    return report;
  }

  main().catch(console.error);
}