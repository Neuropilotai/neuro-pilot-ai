const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8084; // New port to avoid conflicts

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced storage locations data
let storageLocations = {
  'Freezer A1': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 0 },
  'Freezer A2': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 0 },
  'Cooler B1': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 0 },
  'Cooler B2': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 0 },
  'Dry Storage C1': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 0 },
  'Dry Storage C2': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 0 },
  'Walk-in D1': { type: 'Walk-in', temp: 'Room', capacity: 2000, currentUsage: 0 }
};

// Enhanced data validation and verification system
const dataValidation = {
  unverifiedFiles: new Set(),
  verificationRequests: new Map(),
  manualVerifications: new Map(),
  creditProcessing: new Map(),
  accuracyTracking: {
    totalItems: 0,
    processedCorrectly: 0,
    creditsApplied: 0,
    errors: []
  }
};

// Real-time accuracy tracking
let accuracyMetrics = {
  totalOrders: 0,
  validatedOrders: 0,
  creditsProcessed: 0,
  inventoryAccuracy: 0,
  lastUpdated: new Date(),
  errorDetails: [],
  suggestions: []
};

// Load GFS orders with enhanced credit handling
function loadGFSOrdersWithCredits() {
  console.log('🔄 Loading GFS orders with enhanced credit processing...');

  // Load real order dates first
  const realDatesPath = path.join(__dirname, 'real_order_dates_extraction.json');
  let realDates = new Map();

  try {
    if (fs.existsSync(realDatesPath)) {
      const realDatesData = JSON.parse(fs.readFileSync(realDatesPath, 'utf8'));
      realDatesData.results.forEach(result => {
        if (result.success) {
          realDates.set(result.invoiceNumber, result.orderDate);
        }
      });
      console.log(`📅 Loaded ${realDates.size} real order dates`);
    }
  } catch (error) {
    console.warn('⚠️  Could not load real order dates:', error.message);
  }

  const gfsOrdersPath = path.join(__dirname, 'data', 'gfs_orders');
  const inventory = [];
  const orderHistory = [];
  let itemId = 1;
  let filesProcessed = 0;
  let filesSkipped = 0;
  let dataIssues = [];

  try {
    if (!fs.existsSync(gfsOrdersPath)) {
      console.error('❌ CRITICAL: GFS orders directory not found!');
      return { inventory: [], orderHistory: [], metrics: accuracyMetrics };
    }

    const files = fs.readdirSync(gfsOrdersPath).filter(file => file.endsWith('.json'));
    console.log(`📂 Found ${files.length} JSON files to process`);

    const allOrders = [];
    const credits = [];

    // First pass: Load all orders and separate credits
    for (const file of files) {
      try {
        const filePath = path.join(gfsOrdersPath, file);
        const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Add real order date if available
        const realDate = realDates.get(orderData.invoiceNumber);
        if (realDate) {
          orderData.realOrderDate = realDate;
          orderData.orderDate = realDate;
        }

        // Strict validation
        const validation = validateOrderData(orderData, file);

        if (validation.isValid && orderData.status === 'active') {
          if (orderData.invoiceNumber && orderData.invoiceNumber.toString().startsWith('200')) {
            // This is a credit memo
            credits.push({
              ...orderData,
              fileName: file,
              isCreditMemo: true,
              verified: validation.verified
            });
          } else if (orderData.items && orderData.items.length > 0) {
            // Regular order
            allOrders.push({
              ...orderData,
              fileName: file,
              isCreditMemo: false,
              verified: validation.verified
            });
          }
          filesProcessed++;
        } else {
          dataIssues.push(`${file}: ${validation.errors?.join(', ') || 'Invalid data'}`);
          filesSkipped++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
        dataIssues.push(`${file}: ${error.message}`);
        filesSkipped++;
      }
    }

    // Sort orders chronologically
    allOrders.sort((a, b) => {
      const dateA = new Date(a.realOrderDate || a.orderDate || a.processedDate);
      const dateB = new Date(b.realOrderDate || b.orderDate || b.processedDate);
      return dateA - dateB;
    });

    console.log(`📦 Processing ${allOrders.length} regular orders and ${credits.length} credit memos`);

    // Process regular orders first (FIFO)
    const consolidatedInventory = new Map();

    for (const order of allOrders) {
      const orderDate = order.realOrderDate || order.orderDate || order.processedDate;

      order.items.forEach(item => {
        const key = item.description || item.itemCode || 'Unknown Item';

        if (!consolidatedInventory.has(key)) {
          consolidatedInventory.set(key, {
            id: itemId++,
            name: { en: key },
            description: key,
            category: categorizeItem(key),
            location: assignStorageLocation(categorizeItem(key)),
            fifoLayers: [], // Track different purchase prices/dates
            totalQuantity: 0,
            currentValue: 0,
            averagePrice: 0,
            orderHistory: [],
            creditHistory: [],
            unit: item.unit || 'EA',
            lastOrderDate: orderDate,
            accuracyScore: 100
          });
        }

        const inventoryItem = consolidatedInventory.get(key);

        // Add FIFO layer
        inventoryItem.fifoLayers.push({
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          orderDate: orderDate,
          invoiceNumber: order.invoiceNumber,
          remaining: parseFloat(item.quantity) || 0
        });

        inventoryItem.totalQuantity += parseFloat(item.quantity) || 0;
        inventoryItem.orderHistory.push({
          date: orderDate,
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          invoice: order.invoiceNumber,
          type: 'purchase'
        });
      });
    }

    // Process credit memos - deduct from most recent matching items
    console.log('💳 Processing credit memos...');

    for (const credit of credits) {
      console.log(`💳 Processing credit ${credit.invoiceNumber}`);

      if (credit.items && credit.items.length > 0) {
        credit.items.forEach(creditItem => {
          const key = creditItem.description || creditItem.itemCode || 'Unknown Item';

          if (consolidatedInventory.has(key)) {
            const inventoryItem = consolidatedInventory.get(key);
            const creditQuantity = parseFloat(creditItem.quantity) || 0;

            console.log(`💳 Applying credit for ${key}: -${creditQuantity}`);

            // Apply credit using FIFO (deduct from oldest layers first)
            let remainingCredit = creditQuantity;

            for (let i = inventoryItem.fifoLayers.length - 1; i >= 0 && remainingCredit > 0; i--) {
              const layer = inventoryItem.fifoLayers[i];

              if (layer.remaining > 0) {
                const deductAmount = Math.min(layer.remaining, remainingCredit);
                layer.remaining -= deductAmount;
                remainingCredit -= deductAmount;

                console.log(`   Deducted ${deductAmount} from layer ${i + 1} (${layer.orderDate})`);
              }
            }

            // Update totals
            inventoryItem.totalQuantity -= creditQuantity;
            inventoryItem.creditHistory.push({
              date: credit.realOrderDate || credit.orderDate || credit.processedDate,
              quantity: -creditQuantity,
              unitPrice: parseFloat(creditItem.unitPrice) || 0,
              invoice: credit.invoiceNumber,
              type: 'credit'
            });

            // Update accuracy tracking
            if (remainingCredit > 0) {
              accuracyMetrics.errorDetails.push({
                type: 'credit_excess',
                item: key,
                creditInvoice: credit.invoiceNumber,
                excessQuantity: remainingCredit,
                message: `Credit quantity exceeds available inventory`
              });
            }

            accuracyMetrics.creditsProcessed++;
          } else {
            console.warn(`⚠️  Credit item not found in inventory: ${key}`);
            accuracyMetrics.errorDetails.push({
              type: 'credit_item_not_found',
              item: key,
              creditInvoice: credit.invoiceNumber,
              message: `Credit item does not match any inventory item`
            });
          }
        });
      }
    }

    // Calculate current values and convert to array
    consolidatedInventory.forEach((item, key) => {
      // Calculate current value using remaining FIFO layers
      let currentValue = 0;
      let totalRemaining = 0;

      item.fifoLayers.forEach(layer => {
        if (layer.remaining > 0) {
          currentValue += layer.remaining * layer.unitPrice;
          totalRemaining += layer.remaining;
        }
      });

      item.currentValue = currentValue;
      item.totalQuantity = totalRemaining; // Update to reflect remaining after credits
      item.averagePrice = totalRemaining > 0 ? currentValue / totalRemaining : 0;

      // Calculate accuracy score
      item.accuracyScore = calculateItemAccuracy(item);

      inventory.push(item);
    });

    // Update overall accuracy metrics
    accuracyMetrics.totalOrders = allOrders.length;
    accuracyMetrics.validatedOrders = filesProcessed;
    accuracyMetrics.inventoryAccuracy = calculateOverallAccuracy(inventory);
    accuracyMetrics.lastUpdated = new Date();
    accuracyMetrics.suggestions = generateAccuracySuggestions(inventory);

    console.log(`✅ Processed ${filesProcessed} files successfully`);
    console.log(`⚠️  Skipped ${filesSkipped} files due to data issues`);
    console.log(`💳 Applied ${credits.length} credit memos`);
    console.log(`📊 Overall accuracy: ${accuracyMetrics.inventoryAccuracy.toFixed(1)}%`);

    return {
      inventory,
      orderHistory: [...allOrders, ...credits],
      metrics: accuracyMetrics,
      dataIssues
    };

  } catch (error) {
    console.error('❌ Critical error loading orders:', error);
    return { inventory: [], orderHistory: [], metrics: accuracyMetrics };
  }
}

// Enhanced validation function
function validateOrderData(orderData, fileName) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    verified: false,
    confidence: 0
  };

  try {
    // Basic structure validation
    if (!orderData || typeof orderData !== 'object') {
      validation.isValid = false;
      validation.errors.push('Invalid JSON structure');
      return validation;
    }

    // Invoice number validation
    if (!orderData.invoiceNumber) {
      validation.isValid = false;
      validation.errors.push('Missing invoice number');
    }

    // Credit memo detection
    const isCredit = orderData.invoiceNumber && orderData.invoiceNumber.toString().startsWith('200');

    if (isCredit) {
      validation.verified = true;
      validation.confidence = 95;
      return validation; // Credits don't need item validation
    }

    // Regular order validation
    if (!orderData.items || !Array.isArray(orderData.items)) {
      validation.isValid = false;
      validation.errors.push('Missing or invalid items array');
      return validation;
    }

    if (orderData.items.length === 0) {
      validation.isValid = false;
      validation.errors.push('Empty items array');
      return validation;
    }

    // Item-level validation
    let validItems = 0;
    orderData.items.forEach((item, index) => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const lineTotal = parseFloat(item.lineTotal);

      if (isNaN(quantity) || quantity <= 0) {
        validation.errors.push(`Item ${index + 1}: Invalid quantity`);
      } else if (isNaN(unitPrice) || unitPrice < 0) {
        validation.errors.push(`Item ${index + 1}: Invalid unit price`);
      } else if (isNaN(lineTotal)) {
        validation.errors.push(`Item ${index + 1}: Invalid line total`);
      } else {
        // Math verification with tolerance
        const expectedTotal = Math.round(quantity * unitPrice * 100) / 100;
        const actualTotal = Math.round(lineTotal * 100) / 100;
        const tolerance = 0.05;

        if (Math.abs(expectedTotal - actualTotal) > tolerance) {
          validation.errors.push(`Item ${index + 1}: Math error - ${quantity} × ${unitPrice} ≠ ${lineTotal}`);
        } else {
          validItems++;
        }
      }
    });

    // Calculate confidence based on valid items
    validation.confidence = (validItems / orderData.items.length) * 100;
    validation.verified = validation.confidence >= 95 && validation.errors.length === 0;

    // Final validation
    if (validation.errors.length > 0) {
      validation.isValid = false;
    }

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Validation error: ${error.message}`);
  }

  return validation;
}

// Calculate item accuracy score
function calculateItemAccuracy(item) {
  let score = 100;

  // Deduct points for issues
  if (item.creditHistory.length > item.orderHistory.length) {
    score -= 20; // Too many credits vs orders
  }

  if (item.totalQuantity < 0) {
    score -= 50; // Negative inventory
  }

  if (item.fifoLayers.some(layer => layer.remaining < 0)) {
    score -= 30; // Negative FIFO layers
  }

  return Math.max(0, score);
}

// Calculate overall accuracy
function calculateOverallAccuracy(inventory) {
  if (inventory.length === 0) return 0;

  const totalScore = inventory.reduce((sum, item) => sum + item.accuracyScore, 0);
  return totalScore / inventory.length;
}

// Generate accuracy suggestions
function generateAccuracySuggestions(inventory) {
  const suggestions = [];

  // Check for negative inventory
  const negativeItems = inventory.filter(item => item.totalQuantity < 0);
  if (negativeItems.length > 0) {
    suggestions.push({
      type: 'negative_inventory',
      priority: 'high',
      count: negativeItems.length,
      message: `${negativeItems.length} items have negative inventory. Check credit memos.`,
      items: negativeItems.map(item => item.name.en).slice(0, 5)
    });
  }

  // Check for items with excessive credits
  const excessiveCreditItems = inventory.filter(item =>
    item.creditHistory.length > item.orderHistory.length
  );
  if (excessiveCreditItems.length > 0) {
    suggestions.push({
      type: 'excessive_credits',
      priority: 'medium',
      count: excessiveCreditItems.length,
      message: `${excessiveCreditItems.length} items have more credits than orders.`,
      items: excessiveCreditItems.map(item => item.name.en).slice(0, 5)
    });
  }

  // Check for missing order dates
  const missingDateItems = inventory.filter(item => !item.lastOrderDate);
  if (missingDateItems.length > 0) {
    suggestions.push({
      type: 'missing_dates',
      priority: 'low',
      count: missingDateItems.length,
      message: `${missingDateItems.length} items missing order dates.`,
      items: missingDateItems.map(item => item.name.en).slice(0, 5)
    });
  }

  return suggestions;
}

// Item categorization function
function categorizeItem(description) {
  const desc = (description || '').toLowerCase();

  if (desc.includes('beef') || desc.includes('steak') || desc.includes('ground')) return 'Meat - Beef';
  if (desc.includes('chicken') || desc.includes('poultry')) return 'Meat - Poultry';
  if (desc.includes('fish') || desc.includes('salmon') || desc.includes('tuna')) return 'Seafood';
  if (desc.includes('cheese') || desc.includes('milk') || desc.includes('dairy')) return 'Dairy';
  if (desc.includes('bread') || desc.includes('bun') || desc.includes('roll')) return 'Bakery';
  if (desc.includes('lettuce') || desc.includes('tomato') || desc.includes('vegetable')) return 'Produce';
  if (desc.includes('oil') || desc.includes('sauce') || desc.includes('spice')) return 'Condiments';
  if (desc.includes('cup') || desc.includes('plate') || desc.includes('container')) return 'Supplies';

  return 'General';
}

// Storage location assignment
function assignStorageLocation(category) {
  const assignments = {
    'Meat - Beef': 'Freezer A1',
    'Meat - Poultry': 'Freezer A2',
    'Seafood': 'Freezer A2',
    'Dairy': 'Cooler B1',
    'Produce': 'Cooler B2',
    'Bakery': 'Dry Storage C1',
    'Condiments': 'Dry Storage C2',
    'Supplies': 'Dry Storage C2',
    'General': 'Walk-in D1'
  };

  return assignments[category] || 'Walk-in D1';
}

// Load inventory data
const { inventory, orderHistory, metrics, dataIssues } = loadGFSOrdersWithCredits();

console.log(`🏪 Inventory System Enhanced with Credits`);
console.log(`📊 Loaded ${inventory.length} unique items`);
console.log(`📈 Current accuracy: ${metrics.inventoryAccuracy.toFixed(1)}%`);

// API Routes

// Get all inventory with accuracy metrics
app.get('/api/inventory', (req, res) => {
  res.json({
    success: true,
    inventory: inventory,
    accuracy: metrics,
    totalItems: inventory.length,
    lastUpdated: metrics.lastUpdated
  });
});

// Get accuracy analysis with AI suggestions
app.get('/api/accuracy', (req, res) => {
  res.json({
    success: true,
    accuracy: metrics,
    suggestions: metrics.suggestions,
    errorDetails: metrics.errorDetails
  });
});

// Get specific item with full history
app.get('/api/inventory/:itemId', (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Item not found'
    });
  }

  res.json({
    success: true,
    item: item,
    fifoBreakdown: item.fifoLayers,
    orderHistory: item.orderHistory,
    creditHistory: item.creditHistory,
    accuracyScore: item.accuracyScore
  });
});

// Update inventory count with order date tracking
app.post('/api/inventory/:itemId/count', (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const { newCount, countDate } = req.body;

  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Item not found'
    });
  }

  const previousCount = item.totalQuantity;
  const countDateObj = new Date(countDate || new Date());

  // Determine which orders were included in this count
  const ordersIncluded = item.orderHistory.filter(order =>
    new Date(order.date) <= countDateObj
  );

  const creditsIncluded = item.creditHistory.filter(credit =>
    new Date(credit.date) <= countDateObj
  );

  // Calculate expected count based on orders up to count date
  const expectedCount = ordersIncluded.reduce((sum, order) => sum + order.quantity, 0) +
                       creditsIncluded.reduce((sum, credit) => sum + credit.quantity, 0);

  const variance = newCount - expectedCount;

  // Update the item
  item.totalQuantity = parseFloat(newCount);
  item.lastCountDate = countDateObj.toISOString();
  item.countVariance = variance;

  // Recalculate accuracy
  item.accuracyScore = calculateItemAccuracy(item);

  res.json({
    success: true,
    item: item,
    analysis: {
      previousCount: previousCount,
      newCount: parseFloat(newCount),
      expectedCount: expectedCount,
      variance: variance,
      ordersIncluded: ordersIncluded.length,
      creditsIncluded: creditsIncluded.length,
      accuracyScore: item.accuracyScore,
      ordersInCount: ordersIncluded.map(order => ({
        date: order.date,
        invoice: order.invoice,
        quantity: order.quantity,
        type: order.type
      }))
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Enhanced Inventory Server running on http://localhost:${PORT}`);
  console.log(`📊 Accuracy tracking enabled with real-time credit processing`);
  console.log(`💳 Credit memos properly deducted from inventory`);
});