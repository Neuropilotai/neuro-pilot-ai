const fs = require('fs');
const path = require('path');
const CaseTrackingExtractor = require('./extract_case_tracking');

console.log('🔄 FIFO INVENTORY MANAGEMENT SYSTEM');
console.log('='.repeat(80));

class FIFOInventoryManager {
  constructor() {
    this.inventory = new Map(); // itemCode -> FIFO queue of batches
    this.priceHistory = new Map(); // itemCode -> array of price history
    this.dataDir = './data';
    this.fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
    this.historyFile = path.join(this.dataDir, 'price_history.json');

    // Initialize case tracking for meat products
    this.caseTracker = new CaseTrackingExtractor();
    this.caseTracker.loadData();

    this.loadExistingData();
  }

  // Load existing FIFO data if available
  loadExistingData() {
    try {
      if (fs.existsSync(this.fifoFile)) {
        const data = JSON.parse(fs.readFileSync(this.fifoFile, 'utf8'));
        this.inventory = new Map(data.inventory || []);
        console.log(`✓ Loaded existing FIFO data for ${this.inventory.size} items`);
      }

      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.priceHistory = new Map(data.priceHistory || []);
        console.log(`✓ Loaded price history for ${this.priceHistory.size} items`);
      }
    } catch (error) {
      console.log('⚠️ Starting with fresh FIFO data');
    }
  }

  // Add items from an order (FIFO - First In)
  addOrderItems(orderDate, invoiceNumber, items) {
    let addedItems = 0;

    for (const item of items) {
      const { itemCode, description, qtyShipped, unitPrice, unit } = item;

      if (qtyShipped <= 0) continue; // Skip zero or negative quantities

      // Initialize item if doesn't exist
      if (!this.inventory.has(itemCode)) {
        this.inventory.set(itemCode, {
          itemCode,
          description,
          unit,
          batches: [], // FIFO queue of batches
          totalQuantity: 0,
          lastOrderDate: orderDate,
          lastPrice: unitPrice
        });
        this.priceHistory.set(itemCode, []);
      }

      const itemData = this.inventory.get(itemCode);
      const history = this.priceHistory.get(itemCode);

      // Add new batch to FIFO queue
      const batch = {
        date: orderDate,
        invoice: invoiceNumber,
        quantity: Math.abs(qtyShipped), // Ensure positive for regular orders
        originalQuantity: Math.abs(qtyShipped),
        price: unitPrice,
        remaining: Math.abs(qtyShipped)
      };

      // For credit memos (negative quantities), remove from inventory
      if (qtyShipped < 0) {
        this.removeItems(itemCode, Math.abs(qtyShipped), orderDate, invoiceNumber);
      } else {
        // Add to FIFO queue (newest batches go to end)
        itemData.batches.push(batch);
        itemData.totalQuantity += batch.quantity;
        itemData.lastOrderDate = orderDate;
        itemData.lastPrice = unitPrice;

        // Update price history
        history.push({
          date: orderDate,
          invoice: invoiceNumber,
          price: unitPrice,
          quantity: qtyShipped,
          type: 'order'
        });
      }

      addedItems++;
    }

    console.log(`✓ Added ${addedItems} items to FIFO inventory from invoice ${invoiceNumber}`);
    return addedItems;
  }

  // Remove items using FIFO method (First In, First Out)
  removeItems(itemCode, quantityToRemove, date, reason = 'usage') {
    if (!this.inventory.has(itemCode)) {
      console.log(`⚠️ Item ${itemCode} not found in inventory`);
      return [];
    }

    const itemData = this.inventory.get(itemCode);
    const removedBatches = [];
    let remainingToRemove = quantityToRemove;

    // Remove from oldest batches first (FIFO)
    while (remainingToRemove > 0 && itemData.batches.length > 0) {
      const oldestBatch = itemData.batches[0];

      if (oldestBatch.remaining <= remainingToRemove) {
        // Remove entire batch
        remainingToRemove -= oldestBatch.remaining;
        itemData.totalQuantity -= oldestBatch.remaining;

        removedBatches.push({
          ...oldestBatch,
          quantityUsed: oldestBatch.remaining
        });

        itemData.batches.shift(); // Remove from front of queue
      } else {
        // Partially remove from batch
        oldestBatch.remaining -= remainingToRemove;
        itemData.totalQuantity -= remainingToRemove;

        removedBatches.push({
          ...oldestBatch,
          quantityUsed: remainingToRemove
        });

        remainingToRemove = 0;
      }
    }

    // Add to price history
    const history = this.priceHistory.get(itemCode);
    history.push({
      date: date,
      reason: reason,
      quantityRemoved: quantityToRemove,
      batchesUsed: removedBatches,
      type: 'removal'
    });

    console.log(`✓ Removed ${quantityToRemove} units of ${itemCode} using FIFO method`);
    return removedBatches;
  }

  // Get current inventory with FIFO batch details
  getInventoryStatus(itemCode = null) {
    if (itemCode) {
      if (!this.inventory.has(itemCode)) {
        return null;
      }
      return this.formatItemStatus(itemCode, this.inventory.get(itemCode));
    }

    // Return all items
    const status = [];
    for (const [code, data] of this.inventory.entries()) {
      status.push(this.formatItemStatus(code, data));
    }

    return status.sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  }

  formatItemStatus(itemCode, itemData) {
    // Calculate weighted average price
    let totalValue = 0;
    let totalQty = 0;

    for (const batch of itemData.batches) {
      totalValue += batch.remaining * batch.price;
      totalQty += batch.remaining;
    }

    const avgPrice = totalQty > 0 ? totalValue / totalQty : itemData.lastPrice;

    return {
      itemCode,
      description: itemData.description,
      unit: itemData.unit,
      totalQuantity: itemData.totalQuantity,
      batches: itemData.batches.map(batch => ({
        date: batch.date,
        invoice: batch.invoice,
        remaining: batch.remaining,
        originalQuantity: batch.originalQuantity,
        price: batch.price,
        batchValue: batch.remaining * batch.price
      })),
      weightedAveragePrice: avgPrice,
      totalValue: totalValue,
      lastOrderDate: itemData.lastOrderDate,
      lastPrice: itemData.lastPrice,
      batchCount: itemData.batches.length
    };
  }

  // Perform inventory count with date validation
  performInventoryCount(itemCode, countedQuantity, countDate, lastOrderDate) {
    if (!this.inventory.has(itemCode)) {
      console.log(`⚠️ Item ${itemCode} not found in inventory for count`);
      return null;
    }

    const itemData = this.inventory.get(itemCode);
    const currentQuantity = itemData.totalQuantity;
    const difference = countedQuantity - currentQuantity;

    console.log(`\n📊 INVENTORY COUNT for ${itemCode}:`);
    console.log(`  System Quantity: ${currentQuantity} ${itemData.unit}`);
    console.log(`  Counted Quantity: ${countedQuantity} ${itemData.unit}`);
    console.log(`  Difference: ${difference > 0 ? '+' : ''}${difference} ${itemData.unit}`);

    // AI validation - check if count makes sense
    const validation = this.validateInventoryCount(itemData, countedQuantity, countDate, lastOrderDate);

    if (validation.hasWarnings) {
      console.log(`\n🤖 AI GUIDANCE:`);
      validation.warnings.forEach(warning => {
        console.log(`  ⚠️ ${warning}`);
      });
    }

    // Adjust inventory based on count
    if (difference !== 0) {
      if (difference > 0) {
        // More inventory than expected - add phantom batch at last known price
        const phantomBatch = {
          date: countDate,
          invoice: 'INVENTORY_ADJUSTMENT',
          quantity: difference,
          originalQuantity: difference,
          price: itemData.lastPrice,
          remaining: difference
        };

        itemData.batches.push(phantomBatch);
        itemData.totalQuantity += difference;

        console.log(`  ✓ Added ${difference} units at last price $${itemData.lastPrice}`);
      } else {
        // Less inventory than expected - remove using FIFO
        this.removeItems(itemCode, Math.abs(difference), countDate, 'inventory_adjustment');
        console.log(`  ✓ Removed ${Math.abs(difference)} units using FIFO`);
      }
    }

    // Add count to history
    const history = this.priceHistory.get(itemCode);
    history.push({
      date: countDate,
      type: 'inventory_count',
      countedQuantity: countedQuantity,
      systemQuantity: currentQuantity,
      difference: difference,
      validation: validation
    });

    return {
      itemCode,
      countResult: {
        systemQuantity: currentQuantity,
        countedQuantity: countedQuantity,
        difference: difference,
        adjusted: difference !== 0
      },
      validation: validation,
      updatedStatus: this.getInventoryStatus(itemCode)
    };
  }

  // AI validation for inventory counts
  validateInventoryCount(itemData, countedQuantity, countDate, lastOrderDate) {
    const warnings = [];
    const currentQuantity = itemData.totalQuantity;
    const difference = countedQuantity - currentQuantity;

    // Check if difference is reasonable based on historical data
    if (Math.abs(difference) > currentQuantity * 0.5) {
      warnings.push(`Large variance: ${Math.abs(difference)} units (${(Math.abs(difference)/currentQuantity*100).toFixed(1)}% of system quantity)`);
    }

    // Check date consistency
    if (lastOrderDate && itemData.lastOrderDate && lastOrderDate > itemData.lastOrderDate) {
      warnings.push(`Count includes orders after last system update (${lastOrderDate} vs ${itemData.lastOrderDate})`);
    }

    // Check for unusual patterns
    if (difference > 0 && difference > currentQuantity) {
      warnings.push(`Counted quantity (${countedQuantity}) is more than double system quantity (${currentQuantity})`);
    }

    // Age analysis
    const oldestBatch = itemData.batches[0];
    if (oldestBatch) {
      const daysSinceOldest = Math.floor((Date.now() - new Date(oldestBatch.date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceOldest > 30) {
        warnings.push(`Oldest inventory batch is ${daysSinceOldest} days old - check for spoilage`);
      }
    }

    return {
      hasWarnings: warnings.length > 0,
      warnings: warnings,
      recommendation: this.generateRecommendation(itemData, difference)
    };
  }

  generateRecommendation(itemData, difference) {
    if (difference === 0) {
      return 'Inventory count matches system - no action needed';
    } else if (difference > 0) {
      return `Consider investigating source of extra ${difference} units - possible missing orders or counting error`;
    } else {
      return `Investigate ${Math.abs(difference)} unit shortage - check for unreported usage, spoilage, or theft`;
    }
  }

  // Save FIFO data to files
  saveData() {
    const fifoData = {
      inventory: Array.from(this.inventory.entries()),
      lastUpdated: new Date().toISOString()
    };

    const historyData = {
      priceHistory: Array.from(this.priceHistory.entries()),
      lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync(this.fifoFile, JSON.stringify(fifoData, null, 2));
    fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2));

    console.log('✓ FIFO data saved to files');
  }

  // AI-powered price validation system
  validatePricesWithOrders(orderData = null) {
    console.log('\n🤖 AI PRICE VALIDATION SYSTEM');
    console.log('='.repeat(60));

    const priceDiscrepancies = [];
    const validationResults = {
      totalItemsChecked: 0,
      priceMatches: 0,
      priceDiscrepancies: 0,
      averageVariance: 0,
      alerts: []
    };

    // Load order data if not provided
    if (!orderData) {
      orderData = this.loadAllOrderData();
    }

    for (const [itemCode, itemData] of this.inventory.entries()) {
      if (itemData.batches.length === 0) continue;

      validationResults.totalItemsChecked++;

      // Find corresponding order data for this item
      const orderPrices = this.getOrderPricesForItem(itemCode, orderData);

      if (orderPrices.length === 0) {
        validationResults.alerts.push({
          itemCode,
          alert: 'No order data found for price validation',
          severity: 'medium'
        });
        continue;
      }

      // Validate each batch against order data
      for (const batch of itemData.batches) {
        const orderPrice = this.findMatchingOrderPrice(batch, orderPrices);

        if (orderPrice) {
          const priceDifference = Math.abs(batch.price - orderPrice.unitPrice);
          const percentageVariance = (priceDifference / orderPrice.unitPrice) * 100;

          if (percentageVariance > 0.01) { // More than 1 cent difference
            priceDiscrepancies.push({
              itemCode,
              description: itemData.description,
              batchPrice: batch.price,
              orderPrice: orderPrice.unitPrice,
              difference: priceDifference,
              percentageVariance: percentageVariance.toFixed(2),
              batchDate: batch.date,
              orderInvoice: orderPrice.invoice,
              severity: this.getPriceDiscrepancySeverity(percentageVariance)
            });
            validationResults.priceDiscrepancies++;
          } else {
            validationResults.priceMatches++;
          }
        }
      }
    }

    // Calculate average variance
    if (priceDiscrepancies.length > 0) {
      const totalVariance = priceDiscrepancies.reduce((sum, disc) => sum + parseFloat(disc.percentageVariance), 0);
      validationResults.averageVariance = (totalVariance / priceDiscrepancies.length).toFixed(2);
    }

    // Display results
    console.log(`📊 Validation Results:`);
    console.log(`  Items Checked: ${validationResults.totalItemsChecked}`);
    console.log(`  Price Matches: ${validationResults.priceMatches}`);
    console.log(`  Price Discrepancies: ${validationResults.priceDiscrepancies}`);
    console.log(`  Average Variance: ${validationResults.averageVariance}%`);

    if (priceDiscrepancies.length > 0) {
      console.log('\n❌ PRICE DISCREPANCIES FOUND:');
      priceDiscrepancies
        .sort((a, b) => parseFloat(b.percentageVariance) - parseFloat(a.percentageVariance))
        .slice(0, 10) // Show top 10 discrepancies
        .forEach((disc, index) => {
          console.log(`\n  ${index + 1}. Item ${disc.itemCode} (${disc.severity.toUpperCase()})`);
          console.log(`     Description: ${disc.description.substring(0, 50)}...`);
          console.log(`     Inventory Price: $${disc.batchPrice}`);
          console.log(`     Order Price: $${disc.orderPrice}`);
          console.log(`     Difference: $${disc.difference.toFixed(2)} (${disc.percentageVariance}%)`);
          console.log(`     Batch Date: ${disc.batchDate}`);
          console.log(`     Order Invoice: ${disc.orderInvoice}`);
        });

      if (priceDiscrepancies.length > 10) {
        console.log(`\n  ... and ${priceDiscrepancies.length - 10} more discrepancies`);
      }
    } else {
      console.log('\n✅ All inventory prices match order data!');
    }

    // AI recommendations
    console.log('\n🎯 AI RECOMMENDATIONS:');
    this.generatePriceValidationRecommendations(priceDiscrepancies, validationResults);

    return {
      priceDiscrepancies,
      validationResults,
      recommendations: this.generatePriceValidationRecommendations(priceDiscrepancies, validationResults)
    };
  }

  // Load all order data for price validation
  loadAllOrderData() {
    const orderData = [];
    const ordersDir = path.join(this.dataDir, 'gfs_orders');

    try {
      if (fs.existsSync(ordersDir)) {
        const orderFiles = fs.readdirSync(ordersDir).filter(file => file.endsWith('.json'));

        for (const file of orderFiles) {
          try {
            const filePath = path.join(ordersDir, file);
            const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            orderData.push(order);
          } catch (error) {
            console.log(`⚠️ Error reading order file ${file}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Error loading order data:', error.message);
    }

    return orderData;
  }

  // Get order prices for a specific item
  getOrderPricesForItem(itemCode, orderData) {
    const prices = [];

    for (const order of orderData) {
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.itemCode === itemCode && item.unitPrice) {
            prices.push({
              unitPrice: item.unitPrice,
              invoice: order.invoiceNumber,
              date: order.orderDate,
              quantity: item.qtyShipped || item.quantity
            });
          }
        }
      }
    }

    return prices;
  }

  // Find matching order price for a batch
  findMatchingOrderPrice(batch, orderPrices) {
    // First try to find exact invoice match
    const exactMatch = orderPrices.find(price => price.invoice === batch.invoice);
    if (exactMatch) return exactMatch;

    // If no exact match, find closest date match
    const batchDate = new Date(batch.date);
    let closestPrice = null;
    let smallestDateDiff = Infinity;

    for (const price of orderPrices) {
      if (price.date) {
        const orderDate = new Date(price.date);
        const dateDiff = Math.abs(batchDate - orderDate);

        if (dateDiff < smallestDateDiff) {
          smallestDateDiff = dateDiff;
          closestPrice = price;
        }
      }
    }

    return closestPrice;
  }

  // Determine severity of price discrepancy
  getPriceDiscrepancySeverity(percentageVariance) {
    if (percentageVariance >= 10) return 'critical';
    if (percentageVariance >= 5) return 'high';
    if (percentageVariance >= 1) return 'medium';
    return 'low';
  }

  // Generate AI recommendations for price validation
  generatePriceValidationRecommendations(discrepancies, results) {
    const recommendations = [];

    if (discrepancies.length === 0) {
      recommendations.push('✅ All prices validated successfully - no action needed');
      return recommendations;
    }

    // Critical price discrepancies
    const criticalDiscrepancies = discrepancies.filter(d => d.severity === 'critical');
    if (criticalDiscrepancies.length > 0) {
      recommendations.push(`🚨 ${criticalDiscrepancies.length} critical price discrepancies found - immediate review required`);
      recommendations.push('   → Verify invoice data extraction accuracy');
      recommendations.push('   → Check for bulk pricing or special discount applications');
    }

    // High variance patterns
    if (parseFloat(results.averageVariance) > 2) {
      recommendations.push('📈 High average price variance detected');
      recommendations.push('   → Review PDF extraction algorithms for pricing accuracy');
      recommendations.push('   → Validate unit price calculations for variable weight items');
    }

    // Systematic issues
    const itemsWithMultipleDiscrepancies = this.findItemsWithMultipleDiscrepancies(discrepancies);
    if (itemsWithMultipleDiscrepancies.length > 0) {
      recommendations.push(`🔍 ${itemsWithMultipleDiscrepancies.length} items show consistent pricing issues`);
      recommendations.push('   → These items may need manual price verification');
      recommendations.push('   → Consider updating price extraction rules for these products');
    }

    // Preventive measures
    recommendations.push('🛡️ Preventive Measures:');
    recommendations.push('   → Run price validation after each order import');
    recommendations.push('   → Set up automated alerts for price variances > 5%');
    recommendations.push('   → Implement barcode verification for high-value items');

    return recommendations;
  }

  // Find items with multiple price discrepancies
  findItemsWithMultipleDiscrepancies(discrepancies) {
    const itemCounts = {};

    for (const disc of discrepancies) {
      itemCounts[disc.itemCode] = (itemCounts[disc.itemCode] || 0) + 1;
    }

    return Object.entries(itemCounts)
      .filter(([_, count]) => count > 1)
      .map(([itemCode, count]) => ({ itemCode, count }));
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n📊 FIFO INVENTORY REPORT');
    console.log('='.repeat(80));

    const totalItems = this.inventory.size;
    let totalValue = 0;
    let totalQuantity = 0;
    let itemsWithMultipleBatches = 0;

    console.log(`Total Items in Inventory: ${totalItems}`);

    for (const [itemCode, itemData] of this.inventory.entries()) {
      const status = this.formatItemStatus(itemCode, itemData);
      totalValue += status.totalValue;
      totalQuantity += status.totalQuantity;

      if (status.batchCount > 1) {
        itemsWithMultipleBatches++;
      }
    }

    console.log(`Total Inventory Value: $${totalValue.toFixed(2)}`);
    console.log(`Items with Multiple Batches: ${itemsWithMultipleBatches}/${totalItems}`);
    console.log(`Average Value per Item: $${(totalValue/totalItems).toFixed(2)}`);

    // Show items with most batches (complex FIFO tracking)
    console.log('\n🔄 Items with Most Complex FIFO Tracking:');
    const complexItems = Array.from(this.inventory.entries())
      .map(([code, data]) => ({ code, batchCount: data.batches.length, totalQty: data.totalQuantity }))
      .sort((a, b) => b.batchCount - a.batchCount)
      .slice(0, 5);

    complexItems.forEach(item => {
      console.log(`  ${item.code}: ${item.batchCount} batches, ${item.totalQty} units`);
    });

    return {
      totalItems,
      totalValue,
      totalQuantity,
      itemsWithMultipleBatches
    };
  }
}

module.exports = FIFOInventoryManager;

// If run directly, demonstrate the system
if (require.main === module) {
  async function demonstrateFIFO() {
    const fifo = new FIFOInventoryManager();

    // Example: Load data from our existing orders
    console.log('\n🔄 Processing example order data...');

    // Example order items (like the bacon from invoice 9018357843)
    const exampleItems = [
      {
        itemCode: '1206417',
        description: 'BACON RAW 18-22CT SLCD L/O FRSH',
        qtyShipped: 30,
        unitPrice: 57.38,
        unit: 'CS'
      },
      {
        itemCode: '1085773',
        description: 'APPLE ROYAL GALA',
        qtyShipped: 2,
        unitPrice: 44.84,
        unit: 'CS'
      }
    ];

    // Add items from order
    fifo.addOrderItems('2025-01-18', '9018357843', exampleItems);

    // Show current status
    console.log('\n📦 Current Inventory Status:');
    const baconStatus = fifo.getInventoryStatus('1206417');
    if (baconStatus) {
      console.log(`\nBacon (${baconStatus.itemCode}):`);
      console.log(`  Total Quantity: ${baconStatus.totalQuantity} ${baconStatus.unit}`);
      console.log(`  Weighted Avg Price: $${baconStatus.weightedAveragePrice.toFixed(2)}`);
      console.log(`  Total Value: $${baconStatus.totalValue.toFixed(2)}`);
      console.log(`  Batches: ${baconStatus.batchCount}`);

      baconStatus.batches.forEach((batch, i) => {
        console.log(`    Batch ${i+1}: ${batch.remaining} units @ $${batch.price} (${batch.date})`);
      });
    }

    // Simulate inventory count with extra bacon
    console.log('\n📊 Simulating inventory count scenario...');
    console.log('Scenario: Counted 50 bacon but system shows 30 (extra 20 from previous order)');

    const countResult = fifo.performInventoryCount('1206417', 50, '2025-09-16', '2025-01-18');

    if (countResult) {
      console.log('\n✅ Updated bacon inventory after count:');
      const updatedStatus = countResult.updatedStatus;
      updatedStatus.batches.forEach((batch, i) => {
        console.log(`  Batch ${i+1}: ${batch.remaining} units @ $${batch.price} (${batch.date})`);
      });
    }

    // Save data
    fifo.saveData();

    // Demonstrate AI price validation
    console.log('\n🤖 Running AI Price Validation...');
    fifo.validatePricesWithOrders();

    // Generate report
    fifo.generateReport();
  }

  demonstrateFIFO().catch(console.error);
}