const fs = require('fs');
const path = require('path');

console.log('🔧 ACCURACY IMPROVEMENT ANALYZER');
console.log('='.repeat(80));

class AccuracyImprovementAnalyzer {
  constructor() {
    this.dataDir = './data';
    this.issues = [];
    this.fixes = [];
    this.improvements = {
      priceNormalization: 0,
      missingDataRecovery: 0,
      duplicateRemoval: 0,
      dataTypeCorrection: 0,
      totalValueRestored: 0
    };
  }

  async analyzeAndImprove() {
    console.log('🔍 Starting comprehensive accuracy analysis...');

    // Load current data
    const orderData = this.loadOrderData();
    const inventoryData = this.loadInventoryData();

    console.log(`📊 Orders: ${orderData.length} files`);
    console.log(`📦 Inventory: ${inventoryData.size} items`);

    // Analyze specific issues
    await this.analyzeOrderPriceIssues(orderData);
    await this.analyzeInventoryValuationIssues(inventoryData);
    await this.analyzeMissingConnections(orderData, inventoryData);
    await this.analyzeDataQualityIssues(orderData, inventoryData);

    // Generate improvement report
    this.generateImprovementReport();

    // Apply fixes
    await this.applyAutomaticFixes(orderData, inventoryData);

    return this.improvements;
  }

  loadOrderData() {
    const orderData = [];
    const ordersDir = path.join(this.dataDir, 'gfs_orders');

    if (fs.existsSync(ordersDir)) {
      const orderFiles = fs.readdirSync(ordersDir)
        .filter(file => file.endsWith('.json') && !file.includes('corrupted'));

      for (const file of orderFiles) {
        try {
          const filePath = path.join(ordersDir, file);
          const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          orderData.push({ ...order, filename: file });
        } catch (error) {
          console.warn(`⚠️ Skipped corrupted file: ${file}`);
        }
      }
    }

    return orderData;
  }

  loadInventoryData() {
    try {
      const inventoryFile = path.join(this.dataDir, 'fifo_inventory.json');
      const inventoryData = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
      return new Map(inventoryData.inventory || []);
    } catch (error) {
      console.error('❌ Error loading inventory:', error.message);
      return new Map();
    }
  }

  async analyzeOrderPriceIssues(orderData) {
    console.log('\n🔍 ANALYZING ORDER PRICE ISSUES...');

    let zeropriceItems = 0;
    let missingTotals = 0;
    let negativePrices = 0;

    for (const order of orderData) {
      if (!order.invoiceTotal || order.invoiceTotal <= 0) {
        missingTotals++;
        this.issues.push({
          type: 'missing_order_total',
          order: order.invoiceNumber,
          file: order.filename,
          severity: 'high'
        });
      }

      if (order.items) {
        for (const item of order.items) {
          if (!item.unitPrice || item.unitPrice <= 0) {
            zeropriceItems++;
            this.issues.push({
              type: 'zero_price_item',
              order: order.invoiceNumber,
              item: item.itemCode,
              description: item.description,
              severity: 'medium'
            });
          }

          if (item.unitPrice < 0) {
            negativePrices++;
            this.issues.push({
              type: 'negative_price',
              order: order.invoiceNumber,
              item: item.itemCode,
              price: item.unitPrice,
              severity: 'high'
            });
          }
        }
      }
    }

    console.log(`❌ Orders with missing totals: ${missingTotals}`);
    console.log(`❌ Items with zero/missing prices: ${zeropriceItems}`);
    console.log(`❌ Items with negative prices: ${negativePrices}`);
  }

  async analyzeInventoryValuationIssues(inventoryData) {
    console.log('\n🔍 ANALYZING INVENTORY VALUATION ISSUES...');

    let zeroValueItems = 0;
    let missingPrices = 0;
    let inconsistentPrices = 0;

    for (const [itemCode, itemData] of inventoryData) {
      if (!itemData.batches || itemData.batches.length === 0) {
        this.issues.push({
          type: 'missing_batches',
          item: itemCode,
          severity: 'high'
        });
        continue;
      }

      let hasZeroPrice = false;
      let prices = [];

      for (const batch of itemData.batches) {
        if (!batch.price || batch.price <= 0) {
          hasZeroPrice = true;
          missingPrices++;
        } else {
          prices.push(batch.price);
        }
      }

      if (hasZeroPrice) {
        zeroValueItems++;
        this.issues.push({
          type: 'zero_value_inventory',
          item: itemCode,
          description: itemData.description,
          severity: 'medium'
        });
      }

      // Check for price inconsistencies within batches
      if (prices.length > 1) {
        const priceVariation = Math.max(...prices) - Math.min(...prices);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variationPercent = (priceVariation / avgPrice) * 100;

        if (variationPercent > 50) { // More than 50% variation
          inconsistentPrices++;
          this.issues.push({
            type: 'inconsistent_prices',
            item: itemCode,
            priceRange: `${Math.min(...prices).toFixed(2)} - ${Math.max(...prices).toFixed(2)}`,
            variation: variationPercent.toFixed(1),
            severity: 'medium'
          });
        }
      }
    }

    console.log(`❌ Items with zero/missing prices: ${zeroValueItems}`);
    console.log(`❌ Items with inconsistent pricing: ${inconsistentPrices}`);
  }

  async analyzeMissingConnections(orderData, inventoryData) {
    console.log('\n🔍 ANALYZING MISSING CONNECTIONS...');

    const orderItems = new Set();
    const inventoryItems = new Set();

    // Collect all item codes
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          orderItems.add(item.itemCode);
        }
      }
    }

    for (const [itemCode] of inventoryData) {
      inventoryItems.add(itemCode);
    }

    // Find missing connections
    const inOrdersNotInventory = [...orderItems].filter(code => !inventoryItems.has(code));
    const inInventoryNotOrders = [...inventoryItems].filter(code => !orderItems.has(code));

    console.log(`❌ Items in orders but not inventory: ${inOrdersNotInventory.length}`);
    console.log(`❌ Items in inventory but not orders: ${inInventoryNotOrders.length}`);

    // Log some examples
    if (inOrdersNotInventory.length > 0) {
      console.log(`   Examples: ${inOrdersNotInventory.slice(0, 5).join(', ')}`);
    }
  }

  async analyzeDataQualityIssues(orderData, inventoryData) {
    console.log('\n🔍 ANALYZING DATA QUALITY ISSUES...');

    let duplicateOrders = 0;
    let malformedData = 0;
    const orderNumbers = new Set();

    for (const order of orderData) {
      // Check for duplicates
      if (orderNumbers.has(order.invoiceNumber)) {
        duplicateOrders++;
        this.issues.push({
          type: 'duplicate_order',
          order: order.invoiceNumber,
          file: order.filename,
          severity: 'medium'
        });
      } else {
        orderNumbers.add(order.invoiceNumber);
      }

      // Check for malformed data
      if (!order.orderDate || !order.invoiceNumber || !order.items) {
        malformedData++;
        this.issues.push({
          type: 'malformed_order',
          order: order.invoiceNumber || 'unknown',
          file: order.filename,
          severity: 'high'
        });
      }
    }

    console.log(`❌ Duplicate orders: ${duplicateOrders}`);
    console.log(`❌ Malformed order data: ${malformedData}`);
  }

  generateImprovementReport() {
    console.log('\n📊 IMPROVEMENT OPPORTUNITY ANALYSIS');
    console.log('='.repeat(60));

    // Group issues by type
    const issuesByType = {};
    this.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });

    console.log('\n🚨 CRITICAL ISSUES (High Impact):');
    Object.entries(issuesByType).forEach(([type, issues]) => {
      const highSeverityCount = issues.filter(i => i.severity === 'high').length;
      if (highSeverityCount > 0) {
        console.log(`  • ${type}: ${highSeverityCount} issues`);
      }
    });

    console.log('\n⚠️ MEDIUM ISSUES (Moderate Impact):');
    Object.entries(issuesByType).forEach(([type, issues]) => {
      const mediumSeverityCount = issues.filter(i => i.severity === 'medium').length;
      if (mediumSeverityCount > 0) {
        console.log(`  • ${type}: ${mediumSeverityCount} issues`);
      }
    });

    // Estimate potential accuracy improvement
    const totalIssues = this.issues.length;
    const highImpactIssues = this.issues.filter(i => i.severity === 'high').length;
    const mediumImpactIssues = this.issues.filter(i => i.severity === 'medium').length;

    const estimatedImprovement = (highImpactIssues * 0.5) + (mediumImpactIssues * 0.2);
    const currentAccuracy = 60.1;
    const potentialAccuracy = Math.min(95, currentAccuracy + estimatedImprovement);

    console.log('\n🎯 ACCURACY IMPROVEMENT POTENTIAL:');
    console.log(`  Current Accuracy: ${currentAccuracy}%`);
    console.log(`  Potential Accuracy: ${potentialAccuracy.toFixed(1)}%`);
    console.log(`  Estimated Improvement: +${(potentialAccuracy - currentAccuracy).toFixed(1)}%`);
  }

  async applyAutomaticFixes(orderData, inventoryData) {
    console.log('\n🔧 APPLYING AUTOMATIC FIXES...');

    // Fix 1: Price normalization for common issues
    await this.fixPriceNormalization(orderData, inventoryData);

    // Fix 2: Recover missing data using pattern matching
    await this.recoverMissingData(orderData, inventoryData);

    // Fix 3: Remove duplicates
    await this.removeDuplicates(orderData);

    // Fix 4: Correct data types
    await this.correctDataTypes(orderData, inventoryData);

    console.log('\n✅ AUTOMATIC FIXES COMPLETED:');
    console.log(`  • Price normalizations: ${this.improvements.priceNormalization}`);
    console.log(`  • Missing data recovered: ${this.improvements.missingDataRecovery}`);
    console.log(`  • Duplicates removed: ${this.improvements.duplicateRemoval}`);
    console.log(`  • Data types corrected: ${this.improvements.dataTypeCorrection}`);
    console.log(`  • Total value restored: $${this.improvements.totalValueRestored.toFixed(2)}`);

    // Save improved data
    await this.saveImprovedData(orderData, inventoryData);
  }

  async fixPriceNormalization(orderData, inventoryData) {
    // Fix zero prices by finding the most common price for each item
    const itemPrices = new Map();

    // Collect all prices for each item
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if (item.unitPrice > 0) {
            if (!itemPrices.has(item.itemCode)) {
              itemPrices.set(item.itemCode, []);
            }
            itemPrices.get(item.itemCode).push(item.unitPrice);
          }
        }
      }
    }

    // Calculate median prices for each item
    const medianPrices = new Map();
    for (const [itemCode, prices] of itemPrices) {
      const sorted = prices.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      medianPrices.set(itemCode, median);
    }

    // Apply fixes to zero-price items
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if ((!item.unitPrice || item.unitPrice <= 0) && medianPrices.has(item.itemCode)) {
            const medianPrice = medianPrices.get(item.itemCode);
            item.unitPrice = medianPrice;
            item.lineTotal = medianPrice * (item.qtyShipped || 1);
            this.improvements.priceNormalization++;
            this.improvements.totalValueRestored += item.lineTotal;

            this.fixes.push({
              type: 'price_normalization',
              order: order.invoiceNumber,
              item: item.itemCode,
              oldPrice: 0,
              newPrice: medianPrice,
              valueRestored: item.lineTotal
            });
          }
        }
      }
    }
  }

  async recoverMissingData(orderData, inventoryData) {
    // Recover missing order totals by summing line items
    for (const order of orderData) {
      if ((!order.invoiceTotal || order.invoiceTotal <= 0) && order.items) {
        let calculatedTotal = 0;
        for (const item of order.items) {
          if (item.unitPrice > 0 && item.qtyShipped > 0) {
            calculatedTotal += item.unitPrice * item.qtyShipped;
          }
        }

        if (calculatedTotal > 0) {
          order.invoiceTotal = calculatedTotal;
          this.improvements.missingDataRecovery++;
          this.improvements.totalValueRestored += calculatedTotal;

          this.fixes.push({
            type: 'total_recovery',
            order: order.invoiceNumber,
            recoveredTotal: calculatedTotal
          });
        }
      }
    }
  }

  async removeDuplicates(orderData) {
    // Remove duplicate orders based on invoice number
    const seen = new Set();
    const toRemove = [];

    for (let i = 0; i < orderData.length; i++) {
      const order = orderData[i];
      if (seen.has(order.invoiceNumber)) {
        toRemove.push(i);
        this.improvements.duplicateRemoval++;
      } else {
        seen.add(order.invoiceNumber);
      }
    }

    // Remove duplicates in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      orderData.splice(toRemove[i], 1);
    }
  }

  async correctDataTypes(orderData, inventoryData) {
    // Ensure numeric fields are properly typed
    for (const order of orderData) {
      if (typeof order.invoiceTotal === 'string') {
        order.invoiceTotal = parseFloat(order.invoiceTotal) || 0;
        this.improvements.dataTypeCorrection++;
      }

      if (order.items) {
        for (const item of order.items) {
          if (typeof item.unitPrice === 'string') {
            item.unitPrice = parseFloat(item.unitPrice) || 0;
            this.improvements.dataTypeCorrection++;
          }
          if (typeof item.qtyShipped === 'string') {
            item.qtyShipped = parseInt(item.qtyShipped) || 0;
            this.improvements.dataTypeCorrection++;
          }
        }
      }
    }
  }

  async saveImprovedData(orderData, inventoryData) {
    console.log('\n💾 SAVING IMPROVED DATA...');

    // Save improved orders
    const improvedOrdersDir = path.join(this.dataDir, 'improved_orders');
    if (!fs.existsSync(improvedOrdersDir)) {
      fs.mkdirSync(improvedOrdersDir, { recursive: true });
    }

    for (const order of orderData) {
      const filename = `improved_${order.filename || order.invoiceNumber}.json`;
      const filepath = path.join(improvedOrdersDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(order, null, 2));
    }

    // Save improvement report
    const improvementReport = {
      timestamp: new Date().toISOString(),
      totalIssuesFound: this.issues.length,
      fixesApplied: this.fixes.length,
      improvements: this.improvements,
      estimatedAccuracyImprovement: this.improvements.totalValueRestored / 10000, // Rough estimate
      fixes: this.fixes,
      issues: this.issues
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'accuracy_improvement_report.json'),
      JSON.stringify(improvementReport, null, 2)
    );

    console.log(`✅ Saved ${orderData.length} improved orders`);
    console.log(`📊 Improvement report saved`);
  }
}

// Run analysis
async function runAccuracyImprovement() {
  const analyzer = new AccuracyImprovementAnalyzer();
  const results = await analyzer.analyzeAndImprove();
  return results;
}

if (require.main === module) {
  runAccuracyImprovement().catch(console.error);
}

module.exports = AccuracyImprovementAnalyzer;