const fs = require('fs');
const path = require('path');

console.log('🧪 TESTING PREDICTIVE ORDERING SYSTEM\n');

// Test the PredictiveOrderingSystem class
class PredictiveOrderingSystem {
  constructor() {
    this.consumptionHistory = new Map();
    this.inventoryLevels = new Map();
    this.leadTimes = new Map();
  }

  updateConsumptionHistory(orders) {
    console.log(`📊 Processing ${orders.length} orders for consumption analysis...`);
    
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.itemNumber) {
            if (!this.consumptionHistory.has(item.itemNumber)) {
              this.consumptionHistory.set(item.itemNumber, {
                totalConsumed: 0,
                orderCount: 0,
                firstOrderDate: new Date(order.orderDate).getTime(),
                lastOrderDate: new Date(order.orderDate).getTime(),
                description: item.description || 'Unknown Item'
              });
            }
            
            const history = this.consumptionHistory.get(item.itemNumber);
            history.totalConsumed += Math.abs(parseFloat(item.quantity) || 0);
            history.orderCount++;
            history.lastOrderDate = Math.max(history.lastOrderDate, new Date(order.orderDate).getTime());
          }
        });
      }
    });
    
    console.log(`✅ Updated consumption history for ${this.consumptionHistory.size} items`);
  }

  calculateConsumptionRate(itemCode) {
    if (!this.consumptionHistory.has(itemCode)) return 0;
    
    const history = this.consumptionHistory.get(itemCode);
    const days = Math.max(1, (Date.now() - history.firstOrderDate) / (1000 * 60 * 60 * 24));
    return history.totalConsumed / days;
  }

  initializeDefaultLevels() {
    console.log('🎯 Setting default min/max levels...');
    
    let levelCount = 0;
    for (const [itemCode, history] of this.consumptionHistory) {
      const dailyConsumption = this.calculateConsumptionRate(itemCode);
      
      // Set default levels based on consumption pattern
      const minLevel = Math.max(5, Math.ceil(dailyConsumption * 7)); // 1 week supply
      const maxLevel = Math.ceil(dailyConsumption * 21); // 3 weeks supply
      const leadTime = 7; // Default 1 week lead time
      
      this.inventoryLevels.set(itemCode, { min: minLevel, max: maxLevel });
      this.leadTimes.set(itemCode, leadTime);
      levelCount++;
    }
    
    console.log(`✅ Set default levels for ${levelCount} items`);
  }

  generateOrderSuggestions(inventoryItems) {
    console.log('🔮 Generating predictive order suggestions...');
    
    const suggestions = [];
    const currentDate = new Date();
    
    for (const [itemCode, item] of Object.entries(inventoryItems)) {
      const levels = this.inventoryLevels.get(itemCode);
      const consumptionRate = this.calculateConsumptionRate(itemCode);
      const leadTime = this.leadTimes.get(itemCode) || 7;
      
      if (levels && item.quantity !== undefined) {
        const currentQty = parseFloat(item.quantity) || 0;
        const daysUntilEmpty = consumptionRate > 0 ? currentQty / consumptionRate : 999;
        const isUrgent = daysUntilEmpty < leadTime || currentQty <= levels.min;
        
        if (isUrgent) {
          const suggestedQty = levels.max - currentQty;
          
          if (suggestedQty > 0) {
            suggestions.push({
              itemCode,
              description: item.description || 'Unknown Item',
              currentQuantity: currentQty,
              suggestedQuantity: Math.ceil(suggestedQty),
              minLevel: levels.min,
              maxLevel: levels.max,
              consumptionRate: Math.round(consumptionRate * 100) / 100,
              daysUntilEmpty: Math.round(daysUntilEmpty),
              isUrgent,
              priority: isUrgent ? 'HIGH' : 'MEDIUM'
            });
          }
        }
      }
    }
    
    // Sort by urgency and consumption rate
    suggestions.sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return b.isUrgent - a.isUrgent;
      return b.consumptionRate - a.consumptionRate;
    });
    
    console.log(`📋 Generated ${suggestions.length} order suggestions`);
    return suggestions.slice(0, 20); // Return top 20 suggestions
  }
}

async function testPredictiveSystem() {
  try {
    // Load some sample order data
    const gfsOrdersDir = './data/gfs_orders';
    const files = fs.readdirSync(gfsOrdersDir)
      .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
      .slice(0, 5); // Test with first 5 orders
    
    const orders = [];
    for (const file of files) {
      try {
        const filePath = path.join(gfsOrdersDir, file);
        const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        orders.push(order);
      } catch (error) {
        console.log(`⚠️ Skipped corrupted file: ${file}`);
      }
    }
    
    console.log(`📦 Loaded ${orders.length} test orders\n`);
    
    // Initialize predictive system
    const predictiveSystem = new PredictiveOrderingSystem();
    
    // Update consumption history
    predictiveSystem.updateConsumptionHistory(orders);
    
    // Initialize default levels
    predictiveSystem.initializeDefaultLevels();
    
    // Create some sample inventory
    const sampleInventory = {
      '1085769': { quantity: 10, description: 'APPLE GOLDEN DELICIOUS' },
      '1085772': { quantity: 5, description: 'APPLE RED DELICIOUS' },
      '1206417': { quantity: 2, description: 'BACON RAW 18-' }
    };
    
    // Generate suggestions
    const suggestions = predictiveSystem.generateOrderSuggestions(sampleInventory);
    
    console.log('\n📊 ORDER SUGGESTIONS:');
    console.log('='.repeat(80));
    
    if (suggestions.length === 0) {
      console.log('✅ No urgent reorders needed at this time');
    } else {
      suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion.description} (${suggestion.itemCode})`);
        console.log(`   Current: ${suggestion.currentQuantity} | Suggested: ${suggestion.suggestedQuantity}`);
        console.log(`   Min/Max: ${suggestion.minLevel}/${suggestion.maxLevel} | Rate: ${suggestion.consumptionRate}/day`);
        console.log(`   Priority: ${suggestion.priority} | Days left: ${suggestion.daysUntilEmpty}`);
        console.log('');
      });
    }
    
    console.log(`🎉 Predictive system test completed successfully!`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPredictiveSystem();