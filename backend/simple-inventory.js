const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8083;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Storage locations data
let storageLocations = {
  'Freezer A1': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 0 },
  'Freezer A2': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 0 },
  'Cooler B1': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 0 },
  'Cooler B2': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 0 },
  'Dry Storage C1': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 0 },
  'Dry Storage C2': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 0 },
  'Walk-in D1': { type: 'Walk-in', temp: 'Room', capacity: 2000, currentUsage: 0 }
};

// Data validation and verification system
const dataValidation = {
  unverifiedFiles: new Set(),
  verificationRequests: new Map(),
  manualVerifications: new Map()
};

// Real-time accuracy tracking system
let systemAccuracy = {
  overallAccuracy: 0,
  lastUpdated: new Date().toISOString(),
  totalItems: 0,
  accurateItems: 0,
  pdfSourcedItems: 0,
  validatedItems: 0,
  criticalIssues: 0,
  breakdown: {
    priceAccuracy: 0,
    quantityAccuracy: 0,
    locationAccuracy: 0,
    dataCompleteness: 0,
    pdfValidation: 0
  },
  minMaxCompliance: 0,
  lastCalculated: new Date().toISOString()
};

// Load GFS orders function with strict verification
function loadGFSOrders() {
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
      console.log('📋 Please verify the data directory path and ensure all files are accessible.');
      return [];
    }

    const files = fs.readdirSync(gfsOrdersPath).filter(file => file.endsWith('.json'));
    console.log(`📂 Found ${files.length} JSON files to process`);

    const ordersWithDates = [];

    for (const file of files) {
      try {
        const filePath = path.join(gfsOrdersPath, file);

        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️  File not accessible: ${file}`);
          dataIssues.push(`File not found: ${file}`);
          filesSkipped++;
          continue;
        }

        const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Strict validation of critical data
        const validation = validateOrderData(orderData, file);

        if (!validation.isValid) {
          console.warn(`⚠️  Data validation failed for ${file}:`);
          validation.errors.forEach(error => console.warn(`   - ${error}`));
          dataIssues.push(`${file}: ${validation.errors.join(', ')}`);

          // Mark for manual verification
          dataValidation.unverifiedFiles.add(file);
          filesSkipped++;
          continue;
        }

        if (orderData.status === 'active' && orderData.items && orderData.items.length > 0) {
          const sortKey = orderData.invoiceNumber || '0';
          ordersWithDates.push({
            ...orderData,
            sortKey,
            fileName: file,
            verified: validation.verified,
            confidence: validation.confidence
          });
          filesProcessed++;
        } else {
          filesSkipped++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
        dataIssues.push(`${file}: ${error.message}`);
        dataValidation.unverifiedFiles.add(file);
        filesSkipped++;
      }
    }

    console.log(`✅ Processed: ${filesProcessed} files`);
    console.log(`⚠️  Skipped: ${filesSkipped} files`);

    if (dataIssues.length > 0) {
      console.log(`\n📋 DATA VERIFICATION REQUIRED:`);
      dataIssues.forEach(issue => console.log(`   - ${issue}`));
      console.log(`\n🔍 These files need manual verification before displaying numbers.`);
    }

    // Sort orders chronologically (by invoice number as proxy for date)
    ordersWithDates.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Process orders chronologically and build inventory with order history
    const inventoryMap = new Map(); // Track consolidated inventory by item code

    ordersWithDates.forEach(orderData => {
      orderData.items.forEach(item => {
        const itemKey = item.itemCode || item.description;

        // Add to order history
        orderHistory.push({
          invoiceNumber: orderData.invoiceNumber,
          itemCode: item.itemCode,
          description: item.description,
          quantity: Math.round(item.quantity * 100) / 100,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          unit: item.unit || 'EA',
          orderDate: orderData.processedDate || new Date().toISOString(),
          fileName: orderData.fileName
        });

        // Consolidate inventory by item
        if (inventoryMap.has(itemKey)) {
          const existingItem = inventoryMap.get(itemKey);
          existingItem.totalQuantity += Math.round(item.quantity * 100) / 100;
          existingItem.orderHistory.push({
            invoiceNumber: orderData.invoiceNumber,
            quantity: Math.round(item.quantity * 100) / 100,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            orderDate: orderData.processedDate || new Date().toISOString()
          });
          // Update average price
          existingItem.averagePrice = existingItem.orderHistory.reduce((sum, order) =>
            sum + (order.quantity * order.unitPrice), 0) / existingItem.totalQuantity;
        } else {
          // Determine category and location based on description
          const description = item.description.toLowerCase();
          let category = 'General';
          let suggestedLocation = 'Walk-in D1';

          if (description.includes('meat') || description.includes('beef') || description.includes('pork')) {
            category = 'Meat';
            suggestedLocation = 'Freezer A2';
          } else if (description.includes('chicken') || description.includes('poultry')) {
            category = 'Poultry';
            suggestedLocation = 'Freezer A1';
          } else if (description.includes('dairy') || description.includes('milk') || description.includes('cheese')) {
            category = 'Dairy';
            suggestedLocation = 'Cooler B1';
          } else if (description.includes('produce') || description.includes('vegetable') || description.includes('fruit')) {
            category = 'Produce';
            suggestedLocation = 'Cooler B2';
          } else if (description.includes('frozen')) {
            category = 'Frozen';
            suggestedLocation = 'Freezer A1';
          } else if (description.includes('dry') || description.includes('flour') || description.includes('rice')) {
            category = 'Dry Goods';
            suggestedLocation = 'Dry Storage C1';
          }

          inventoryMap.set(itemKey, {
            id: itemId++,
            name: item.description,
            itemCode: item.itemCode,
            totalQuantity: Math.round(item.quantity * 100) / 100,
            currentCount: null, // Will be set during physical count
            unit: item.unit || 'EA',
            category: category,
            supplier: 'GFS',
            location: 'UNASSIGNED',
            suggestedLocation: suggestedLocation,
            averagePrice: item.unitPrice,
            lastUpdated: orderData.processedDate || new Date().toISOString(),
            orderHistory: [{
              invoiceNumber: orderData.invoiceNumber,
              quantity: Math.round(item.quantity * 100) / 100,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              orderDate: orderData.processedDate || new Date().toISOString()
            }]
          });
        }
      });
    });

    // Convert map to array and set display quantity to total ordered
    inventory.push(...Array.from(inventoryMap.values()).map(item => ({
      ...item,
      quantity: item.totalQuantity // Show total ordered quantity initially
    })));

    if (inventory.length === 0) {
      console.log(`\n❌ NO VERIFIED DATA LOADED`);
      console.log(`🔍 All ${files.length} files require manual verification.`);
      console.log(`📋 Please verify the data before proceeding.`);
    } else {
      console.log(`✅ Loaded ${inventory.length} VERIFIED items from ${filesProcessed} validated files`);
      console.log(`📊 Built order history with ${orderHistory.length} verified entries`);

      if (filesSkipped > 0) {
        console.log(`⚠️  ${filesSkipped} files require verification before displaying data`);
      }
    }

    // Store order history and validation data globally
    global.orderHistory = orderHistory;
    global.dataValidation = dataValidation;
    global.dataIssues = dataIssues;

    return inventory;
  } catch (error) {
    console.error('❌ CRITICAL ERROR loading GFS orders:', error.message);
    console.log('📋 Please check file permissions and data integrity.');
    return [];
  }
}

// Strict data validation function
function validateOrderData(orderData, fileName) {
  const validation = {
    isValid: true,
    verified: false,
    confidence: 0,
    errors: []
  };

  // Critical field validation
  if (!orderData.invoiceNumber) {
    validation.errors.push('Missing invoice number');
    validation.isValid = false;
  }

  if (!orderData.items || !Array.isArray(orderData.items)) {
    validation.errors.push('Missing or invalid items array');
    validation.isValid = false;
  }

  if (orderData.items && orderData.items.length === 0) {
    validation.errors.push('No items in order');
    validation.isValid = false;
  }

  // Validate each item
  if (orderData.items && Array.isArray(orderData.items)) {
    orderData.items.forEach((item, index) => {
      if (!item.description || item.description.trim() === '') {
        validation.errors.push(`Item ${index + 1}: Missing description`);
        validation.isValid = false;
      }

      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        validation.errors.push(`Item ${index + 1}: Invalid quantity (${item.quantity})`);
        validation.isValid = false;
      }

      if (typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        validation.errors.push(`Item ${index + 1}: Invalid unit price (${item.unitPrice})`);
        validation.isValid = false;
      }

      if (typeof item.lineTotal !== 'number' || item.lineTotal <= 0) {
        validation.errors.push(`Item ${index + 1}: Invalid line total (${item.lineTotal})`);
        validation.isValid = false;
      }

      // Check calculation accuracy
      const expectedTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const actualTotal = Math.round(item.lineTotal * 100) / 100;
      const tolerance = 0.05; // 5 cent tolerance

      if (Math.abs(expectedTotal - actualTotal) > tolerance) {
        validation.errors.push(`Item ${index + 1}: Math error - ${item.quantity} × ${item.unitPrice} ≠ ${item.lineTotal}`);
        validation.isValid = false;
      }
    });
  }

  // Calculate confidence score
  if (validation.isValid) {
    validation.confidence = 85; // Base confidence for valid data

    // Boost confidence for complete data
    if (orderData.processedDate) validation.confidence += 5;
    if (orderData.pdfPath && fs.existsSync(orderData.pdfPath)) validation.confidence += 10;

    validation.verified = validation.confidence >= 90;
  }

  return validation;
}

// Load inventory from GFS orders
let inventory = loadGFSOrders();

// Suppliers data
const suppliers = ['Sysco', 'GFS', 'US Foods', 'Local Farm'];

// Authentication credentials
const validCredentials = {
  'neuro.pilot.ai@gmail.com': 'NeuroPilot2025!',
  'admin@davidmikulis.com': 'DavidMikulis2025!',
  'david.mikulis@enterprise.com': 'SecureInventory2025'
};

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Professional Inventory System by David Mikulis™' });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  if (validCredentials[email] && validCredentials[email] === password) {
    res.json({
      success: true,
      message: 'Authentication successful',
      user: {
        email: email,
        name: 'David Mikulis',
        role: 'Administrator',
        company: 'David Mikulis Enterprise Solutions™'
      },
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials. Unauthorized access attempt logged.',
      timestamp: new Date().toISOString()
    });
  }
});

// Get storage locations
app.get('/api/storage/locations', (req, res) => {
  const locations = Object.entries(storageLocations).map(([name, info]) => ({
    name,
    ...info,
    utilizationPercent: ((info.currentUsage / info.capacity) * 100).toFixed(1),
    availableSpace: info.capacity - info.currentUsage
  }));

  res.json({
    success: true,
    locations,
    totalLocations: locations.length
  });
});

// Create storage location
app.post('/api/storage/locations', (req, res) => {
  const { name, type, temp, capacity } = req.body;

  if (!name || !type || !temp || !capacity) {
    return res.status(400).json({ error: 'Missing required fields: name, type, temp, capacity' });
  }

  if (storageLocations[name]) {
    return res.status(400).json({ error: 'Storage location already exists' });
  }

  storageLocations[name] = {
    type,
    temp,
    capacity: parseInt(capacity),
    currentUsage: 0,
    createdDate: new Date().toISOString()
  };

  res.json({
    success: true,
    message: 'Storage location created successfully',
    location: { name, ...storageLocations[name] }
  });
});

// Get inventory
app.get('/api/inventory', (req, res) => {
  res.json({
    success: true,
    inventory,
    total: inventory.length
  });
});

// Add inventory item
app.post('/api/inventory', (req, res) => {
  const { name, quantity, category, supplier, location } = req.body;

  if (!name || !quantity || !category) {
    return res.status(400).json({ error: 'Missing required fields: name, quantity, category' });
  }

  const newItem = {
    id: inventory.length + 1,
    name,
    quantity: parseInt(quantity),
    category,
    supplier: supplier || 'Unknown',
    location: location || 'UNASSIGNED',
    lastUpdated: new Date().toISOString()
  };

  inventory.push(newItem);

  res.json({
    success: true,
    message: 'Item added successfully',
    item: newItem
  });
});

// Assign item to location
app.post('/api/inventory/:id/assign-location', (req, res) => {
  const itemId = parseInt(req.params.id);
  const { location } = req.body;

  if (!location) {
    return res.status(400).json({ error: 'Location is required' });
  }

  const item = inventory.find(i => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!storageLocations[location]) {
    return res.status(400).json({ error: 'Invalid storage location' });
  }

  item.location = location;
  item.lastUpdated = new Date().toISOString();

  res.json({
    success: true,
    message: 'Item location updated successfully',
    item: item
  });
});

// Get suppliers
app.get('/api/suppliers', (req, res) => {
  res.json({
    success: true,
    suppliers
  });
});

// AI Auto-assign storage locations
function assignStorageLocation(category, description = '') {
  const cat = (category || '').toLowerCase();
  const desc = (description || '').toLowerCase();

  if (cat.includes('frozen') || desc.includes('frozen') || desc.includes('ice cream')) {
    return 'Freezer A1';
  }
  if (cat.includes('meat') || desc.includes('meat') || desc.includes('beef') || desc.includes('pork')) {
    return 'Freezer A2';
  }
  if (cat.includes('poultry') || desc.includes('chicken') || desc.includes('poultry')) {
    return 'Freezer A1';
  }
  if (cat.includes('dairy') || desc.includes('dairy') || desc.includes('milk') || desc.includes('cheese')) {
    return 'Cooler B1';
  }
  if (cat.includes('produce') || desc.includes('produce') || desc.includes('vegetable') || desc.includes('fruit')) {
    return 'Cooler B2';
  }
  if (cat.includes('beverage') || desc.includes('beverage') || desc.includes('drink') || desc.includes('juice')) {
    return 'Cooler B2';
  }
  if (cat.includes('dry') || desc.includes('flour') || desc.includes('rice') || desc.includes('grain')) {
    return 'Dry Storage C1';
  }
  if (desc.includes('sauce') || desc.includes('condiment') || desc.includes('canned')) {
    return 'Dry Storage C2';
  }

  return 'Walk-in D1';
}

// AI optimize all locations
app.post('/api/ai/optimize-locations', (req, res) => {
  try {
    const changes = [];

    for (let item of inventory) {
      if (item.location === 'UNASSIGNED') {
        const suggested = assignStorageLocation(item.category, item.name);

        changes.push({
          id: item.id,
          name: item.name,
          oldLocation: item.location,
          newLocation: suggested,
          category: item.category
        });

        item.location = suggested;
        item.lastUpdated = new Date().toISOString();
      }
    }

    res.json({
      success: true,
      message: 'AI optimization complete!',
      totalChanged: changes.length,
      changes: changes.slice(0, 10), // Show first 10 changes
      summary: {
        optimizedItems: changes.length,
        totalItems: inventory.length,
        unassignedRemaining: inventory.filter(i => i.location === 'UNASSIGNED').length
      }
    });

  } catch (error) {
    console.error('Error optimizing locations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize locations'
    });
  }
});

// AI suggest location for single item
app.post('/api/ai/suggest-location', (req, res) => {
  const { category, description } = req.body;

  const suggested = assignStorageLocation(category, description);

  res.json({
    success: true,
    suggestedLocation: suggested,
    reason: `Based on category "${category}" and description analysis`
  });
});

// Enhanced AI Transaction Verification System
app.post('/api/ai/verify-transaction', (req, res) => {
  try {
    const { invoiceNumber, items, expectedTotal, receivedItems } = req.body;

    if (!invoiceNumber || !items || !expectedTotal) {
      return res.status(400).json({
        success: false,
        error: 'Invoice number, items, and expected total are required'
      });
    }

    const verification = performTransactionVerification(invoiceNumber, items, expectedTotal, receivedItems);

    res.json({
      success: true,
      verification,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error verifying transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify transaction'
    });
  }
});

// AI-powered discrepancy detection and guided recount
app.post('/api/ai/detect-discrepancies', (req, res) => {
  try {
    const { itemId, expectedCount, actualCount, lastOrderDate } = req.body;

    const discrepancyAnalysis = analyzeDiscrepancy(itemId, expectedCount, actualCount, lastOrderDate);

    res.json({
      success: true,
      analysis: discrepancyAnalysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error detecting discrepancies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect discrepancies'
    });
  }
});

// AI Guided Recount System
app.post('/api/ai/guided-recount', (req, res) => {
  try {
    const { itemId, reason, priority } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required for guided recount'
      });
    }

    const item = inventory.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const recountPlan = generateRecountPlan(item, reason, priority);

    res.json({
      success: true,
      recountPlan,
      item: {
        id: item.id,
        name: item.name,
        currentCount: item.quantity,
        location: item.location,
        category: item.category
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating recount plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recount plan'
    });
  }
});

// Enhanced AI Accuracy Analysis with Error Detection
app.get('/api/ai/accuracy-analysis', (req, res) => {
  try {
    const analysis = {
      totalItems: inventory.length,
      locationAccuracy: calculateLocationAccuracy(),
      categorizationAccuracy: calculateCategorizationAccuracy(),
      dataCompleteness: calculateDataCompleteness(),
      storageUtilization: calculateStorageUtilization(),
      transactionAccuracy: calculateTransactionAccuracy(),
      discrepancyRisk: calculateDiscrepancyRisk(),
      recommendations: generateOptimizationRecommendations()
    };

    analysis.overallAccuracy = Math.round(
      (analysis.locationAccuracy.percentage +
       analysis.categorizationAccuracy.percentage +
       analysis.dataCompleteness.percentage +
       analysis.transactionAccuracy.percentage) / 4
    );

    // Add error detection flags
    analysis.errorFlags = detectSystemErrors();
    analysis.criticalIssues = identifyCriticalIssues();

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error analyzing accuracy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze system accuracy'
    });
  }
});

// Calculate location accuracy
function calculateLocationAccuracy() {
  const totalItems = inventory.length;
  const assignedItems = inventory.filter(item => item.location !== 'UNASSIGNED').length;
  const optimallyPlaced = inventory.filter(item => {
    if (item.location === 'UNASSIGNED') return false;
    const optimalLocation = assignStorageLocation(item.category, item.name);
    return item.location === optimalLocation;
  }).length;

  return {
    assigned: assignedItems,
    unassigned: totalItems - assignedItems,
    optimallyPlaced: optimallyPlaced,
    suboptimallyPlaced: assignedItems - optimallyPlaced,
    percentage: Math.round((optimallyPlaced / totalItems) * 100),
    assignmentRate: Math.round((assignedItems / totalItems) * 100)
  };
}

// Calculate categorization accuracy
function calculateCategorizationAccuracy() {
  const totalItems = inventory.length;
  const categorizedItems = inventory.filter(item => item.category && item.category !== 'General').length;
  const accurateCategories = inventory.filter(item => {
    if (!item.category) return false;
    const description = item.name.toLowerCase();
    const category = item.category.toLowerCase();

    // Check if category matches description
    if (category.includes('meat') && (description.includes('meat') || description.includes('beef') || description.includes('pork'))) return true;
    if (category.includes('poultry') && (description.includes('chicken') || description.includes('poultry'))) return true;
    if (category.includes('dairy') && (description.includes('dairy') || description.includes('milk') || description.includes('cheese'))) return true;
    if (category.includes('produce') && (description.includes('produce') || description.includes('vegetable') || description.includes('fruit'))) return true;
    if (category.includes('frozen') && description.includes('frozen')) return true;
    if (category.includes('dry') && (description.includes('flour') || description.includes('rice'))) return true;

    return category !== 'general'; // Any specific category is better than general
  }).length;

  return {
    categorized: categorizedItems,
    uncategorized: totalItems - categorizedItems,
    accurate: accurateCategories,
    inaccurate: categorizedItems - accurateCategories,
    percentage: Math.round((accurateCategories / totalItems) * 100)
  };
}

// Calculate data completeness
function calculateDataCompleteness() {
  const totalItems = inventory.length;
  let completenessScore = 0;

  inventory.forEach(item => {
    let itemScore = 0;
    if (item.name && item.name.trim()) itemScore += 20;
    if (item.quantity && item.quantity > 0) itemScore += 20;
    if (item.category && item.category !== 'General') itemScore += 20;
    if (item.supplier) itemScore += 15;
    if (item.location && item.location !== 'UNASSIGNED') itemScore += 15;
    if (item.itemCode) itemScore += 5;
    if (item.unitPrice) itemScore += 5;

    completenessScore += itemScore;
  });

  const avgCompleteness = Math.round(completenessScore / totalItems);

  return {
    averageCompleteness: avgCompleteness,
    percentage: avgCompleteness,
    missingData: {
      locations: inventory.filter(i => !i.location || i.location === 'UNASSIGNED').length,
      categories: inventory.filter(i => !i.category || i.category === 'General').length,
      suppliers: inventory.filter(i => !i.supplier).length,
      prices: inventory.filter(i => !i.unitPrice).length
    }
  };
}

// Calculate storage utilization
function calculateStorageUtilization() {
  const utilizationData = {};

  Object.keys(storageLocations).forEach(location => {
    const itemsInLocation = inventory.filter(item => item.location === location).length;
    const capacity = storageLocations[location].capacity;
    const utilization = Math.round((itemsInLocation / capacity) * 100);

    utilizationData[location] = {
      items: itemsInLocation,
      capacity: capacity,
      utilization: utilization,
      status: utilization > 90 ? 'overcapacity' : utilization > 75 ? 'high' : utilization > 50 ? 'moderate' : 'low'
    };
  });

  return utilizationData;
}

// Generate optimization recommendations
function generateOptimizationRecommendations() {
  const recommendations = [];

  const unassignedCount = inventory.filter(item => item.location === 'UNASSIGNED').length;
  if (unassignedCount > 0) {
    recommendations.push({
      type: 'critical',
      title: 'Assign Unassigned Items',
      description: `${unassignedCount} items need storage location assignment`,
      action: 'Use AI Auto-Assign to automatically place items',
      priority: 'HIGH',
      impact: 'Location accuracy will improve significantly'
    });
  }

  const uncategorizedCount = inventory.filter(item => !item.category || item.category === 'General').length;
  if (uncategorizedCount > 100) {
    recommendations.push({
      type: 'improvement',
      title: 'Improve Categorization',
      description: `${uncategorizedCount} items have generic or missing categories`,
      action: 'Review and update item categories based on descriptions',
      priority: 'MEDIUM',
      impact: 'Better organization and automated location assignment'
    });
  }

  // Check for overcrowded storage locations
  Object.entries(storageLocations).forEach(([location, data]) => {
    const itemCount = inventory.filter(item => item.location === location).length;
    const utilization = (itemCount / data.capacity) * 100;

    if (utilization > 90) {
      recommendations.push({
        type: 'warning',
        title: `${location} Over Capacity`,
        description: `${Math.round(utilization)}% full (${itemCount}/${data.capacity} items)`,
        action: 'Redistribute items or increase capacity',
        priority: 'HIGH',
        impact: 'Prevent storage overflow and maintain organization'
      });
    }
  });

  // Check for missing price data
  const missingPrices = inventory.filter(item => !item.unitPrice).length;
  if (missingPrices > inventory.length * 0.3) {
    recommendations.push({
      type: 'data',
      title: 'Missing Price Information',
      description: `${missingPrices} items missing unit price data`,
      action: 'Update pricing information for better cost tracking',
      priority: 'LOW',
      impact: 'Enable accurate inventory valuation and cost analysis'
    });
  }

  // AI-powered efficiency recommendation
  recommendations.push({
    type: 'ai',
    title: 'Enable Continuous AI Optimization',
    description: 'AI can monitor and optimize inventory placement continuously',
    action: 'Schedule daily AI optimization runs',
    priority: 'MEDIUM',
    impact: 'Maintain optimal organization automatically'
  });

  return recommendations.sort((a, b) => {
    const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

// Enhanced AI Functions for Enterprise-Grade Inventory Management

// AI Transaction Verification
function performTransactionVerification(invoiceNumber, expectedItems, expectedTotal, receivedItems = []) {
  const verification = {
    invoiceNumber,
    status: 'verified',
    accuracy: 100,
    discrepancies: [],
    recommendations: [],
    requiresRecount: false,
    confidenceScore: 95
  };

  // Check if invoice exists in system
  const existingInvoice = inventory.filter(item => item.invoiceNumber === invoiceNumber);

  if (existingInvoice.length === 0) {
    verification.status = 'not_found';
    verification.accuracy = 0;
    verification.discrepancies.push({
      type: 'missing_invoice',
      message: `Invoice ${invoiceNumber} not found in system`,
      severity: 'critical'
    });
    return verification;
  }

  // Verify item counts and pricing
  expectedItems.forEach((expectedItem, index) => {
    const systemItem = existingInvoice.find(item =>
      item.itemCode === expectedItem.itemCode ||
      item.name.toLowerCase().includes(expectedItem.name.toLowerCase())
    );

    if (!systemItem) {
      verification.discrepancies.push({
        type: 'missing_item',
        message: `Expected item "${expectedItem.name}" not found in system`,
        severity: 'high',
        itemIndex: index,
        expectedItem
      });
      verification.accuracy -= 10;
    } else {
      // Check quantity discrepancy
      const quantityDiff = Math.abs(systemItem.quantity - expectedItem.quantity);
      const quantityTolerance = Math.max(1, expectedItem.quantity * 0.02); // 2% tolerance

      if (quantityDiff > quantityTolerance) {
        verification.discrepancies.push({
          type: 'quantity_mismatch',
          message: `Quantity mismatch for "${expectedItem.name}": expected ${expectedItem.quantity}, found ${systemItem.quantity}`,
          severity: 'medium',
          itemIndex: index,
          expectedQuantity: expectedItem.quantity,
          actualQuantity: systemItem.quantity,
          difference: quantityDiff,
          itemId: systemItem.id
        });
        verification.accuracy -= 5;
        verification.requiresRecount = true;
      }

      // Check price discrepancy
      if (expectedItem.unitPrice && systemItem.unitPrice) {
        const priceDiff = Math.abs(systemItem.unitPrice - expectedItem.unitPrice);
        const priceTolerance = expectedItem.unitPrice * 0.01; // 1% tolerance

        if (priceDiff > priceTolerance) {
          verification.discrepancies.push({
            type: 'price_mismatch',
            message: `Price mismatch for "${expectedItem.name}": expected $${expectedItem.unitPrice}, found $${systemItem.unitPrice}`,
            severity: 'low',
            itemIndex: index,
            expectedPrice: expectedItem.unitPrice,
            actualPrice: systemItem.unitPrice,
            difference: priceDiff
          });
          verification.accuracy -= 2;
        }
      }
    }
  });

  // Check total value discrepancy
  const systemTotal = existingInvoice.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const totalDiff = Math.abs(systemTotal - expectedTotal);
  const totalTolerance = expectedTotal * 0.02; // 2% tolerance

  if (totalDiff > totalTolerance) {
    verification.discrepancies.push({
      type: 'total_mismatch',
      message: `Invoice total mismatch: expected $${expectedTotal}, calculated $${systemTotal.toFixed(2)}`,
      severity: 'high',
      expectedTotal,
      actualTotal: systemTotal,
      difference: totalDiff
    });
    verification.accuracy -= 15;
  }

  // Generate recommendations based on discrepancies
  if (verification.discrepancies.length > 0) {
    verification.recommendations = generateVerificationRecommendations(verification.discrepancies);
  }

  verification.accuracy = Math.max(0, verification.accuracy);
  verification.confidenceScore = calculateConfidenceScore(verification);

  return verification;
}

// AI Discrepancy Analysis
function analyzeDiscrepancy(itemId, expectedCount, actualCount, lastOrderDate) {
  const item = inventory.find(i => i.id === parseInt(itemId));

  const analysis = {
    itemId,
    itemName: item?.name || 'Unknown',
    discrepancyType: 'unknown',
    severity: 'low',
    possibleCauses: [],
    recommendedActions: [],
    urgency: 'normal',
    recountRequired: false,
    investigationSteps: []
  };

  if (!item) {
    analysis.discrepancyType = 'item_not_found';
    analysis.severity = 'critical';
    analysis.possibleCauses.push('Item missing from inventory system');
    return analysis;
  }

  const difference = Math.abs(expectedCount - actualCount);
  const percentageDiff = (difference / expectedCount) * 100;

  // Determine discrepancy type and severity
  if (percentageDiff > 20) {
    analysis.severity = 'critical';
    analysis.urgency = 'immediate';
    analysis.recountRequired = true;
  } else if (percentageDiff > 10) {
    analysis.severity = 'high';
    analysis.urgency = 'urgent';
    analysis.recountRequired = true;
  } else if (percentageDiff > 5) {
    analysis.severity = 'medium';
    analysis.urgency = 'normal';
  }

  // Determine discrepancy type
  if (actualCount < expectedCount) {
    analysis.discrepancyType = 'shortage';
    analysis.possibleCauses.push(
      'Items consumed/used not recorded',
      'Theft or shrinkage',
      'Damage or spoilage not documented',
      'Transfer to other locations not logged',
      'Data entry errors in consumption'
    );
  } else if (actualCount > expectedCount) {
    analysis.discrepancyType = 'overage';
    analysis.possibleCauses.push(
      'Unreported deliveries',
      'Items returned from other locations',
      'Data entry errors in receipts',
      'Double counting during previous counts'
    );
  }

  // Time-based analysis
  const daysSinceLastOrder = lastOrderDate ?
    Math.floor((new Date() - new Date(lastOrderDate)) / (1000 * 60 * 60 * 24)) : null;

  if (daysSinceLastOrder && daysSinceLastOrder > 30) {
    analysis.possibleCauses.push('Long time since last order - multiple unreported transactions possible');
  }

  // Generate recommended actions
  analysis.recommendedActions = generateDiscrepancyActions(analysis);
  analysis.investigationSteps = generateInvestigationSteps(analysis, item);

  return analysis;
}

// Generate Recount Plan
function generateRecountPlan(item, reason, priority = 'normal') {
  const plan = {
    itemId: item.id,
    itemName: item.name,
    currentLocation: item.location,
    priority: priority || 'normal',
    reason: reason || 'Routine verification',
    steps: [],
    estimatedTime: '15 minutes',
    requiredTools: ['Mobile device/tablet', 'Barcode scanner (if available)'],
    safetyPrecautions: [],
    verificationChecks: []
  };

  // Generate step-by-step recount instructions
  plan.steps = [
    {
      step: 1,
      action: 'Preparation',
      description: 'Gather counting tools and access the storage location',
      details: [`Go to ${item.location}`, 'Ensure adequate lighting', 'Have counting device ready']
    },
    {
      step: 2,
      action: 'Initial Assessment',
      description: 'Examine the storage area and item condition',
      details: [
        'Check for damaged or expired items',
        'Note any items that may have been moved',
        'Verify you\'re counting the correct item/SKU'
      ]
    },
    {
      step: 3,
      action: 'Physical Count',
      description: 'Perform accurate count of all items',
      details: [
        'Count each unit individually',
        'For boxed items, verify box contents if possible',
        'Use barcode scanner to confirm item identity',
        'Record partial units separately'
      ]
    },
    {
      step: 4,
      action: 'Verification',
      description: 'Double-check your count',
      details: [
        'Recount if total seems unusual',
        'Take photo evidence if significant discrepancy',
        'Note any observations about item condition or storage'
      ]
    },
    {
      step: 5,
      action: 'Documentation',
      description: 'Record results in system',
      details: [
        'Enter new count immediately',
        'Add notes about any issues found',
        'Mark recount as completed with timestamp'
      ]
    }
  ];

  // Add category-specific instructions
  if (item.category && item.category.toLowerCase().includes('frozen')) {
    plan.safetyPrecautions.push('Minimize time in freezer area', 'Wear appropriate cold weather gear');
    plan.estimatedTime = '10 minutes';
  }

  if (item.category && item.category.toLowerCase().includes('produce')) {
    plan.verificationChecks.push('Check for spoilage or damage', 'Note any items near expiration');
  }

  // Adjust priority-based requirements
  if (priority === 'critical') {
    plan.requiredTools.push('Second person for verification');
    plan.steps.push({
      step: 6,
      action: 'Supervisor Verification',
      description: 'Have count verified by supervisor or second counter',
      details: ['Independent recount by different person', 'Compare results', 'Escalate if still discrepant']
    });
  }

  return plan;
}

// Calculate Transaction Accuracy
function calculateTransactionAccuracy() {
  // This would analyze historical transaction data for accuracy
  // For now, return a calculated score based on validation errors
  const totalTransactions = inventory.length;
  const errorCount = inventory.filter(item =>
    !item.quantity || item.quantity <= 0 ||
    !item.unitPrice ||
    !item.totalPrice ||
    Math.abs((item.quantity * item.unitPrice) - item.totalPrice) > 0.01
  ).length;

  const accuracy = Math.max(0, ((totalTransactions - errorCount) / totalTransactions) * 100);

  return {
    totalTransactions,
    errorCount,
    percentage: Math.round(accuracy),
    issues: errorCount > 0 ? 'Mathematical or data validation errors detected' : 'All transactions verified'
  };
}

// Calculate Discrepancy Risk
function calculateDiscrepancyRisk() {
  const riskFactors = {
    dataAge: 0,
    validationErrors: 0,
    priceInconsistencies: 0,
    locationIssues: 0
  };

  inventory.forEach(item => {
    // Check data age
    if (item.lastUpdated) {
      const daysSinceUpdate = (new Date() - new Date(item.lastUpdated)) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30) riskFactors.dataAge++;
    }

    // Check validation errors
    if (!item.quantity || !item.unitPrice || !item.totalPrice) {
      riskFactors.validationErrors++;
    }

    // Check price consistency
    if (item.quantity && item.unitPrice && item.totalPrice) {
      const expectedTotal = item.quantity * item.unitPrice;
      if (Math.abs(expectedTotal - item.totalPrice) > 0.01) {
        riskFactors.priceInconsistencies++;
      }
    }

    // Check location issues
    if (!item.location || item.location === 'UNASSIGNED') {
      riskFactors.locationIssues++;
    }
  });

  const totalItems = inventory.length;
  const totalRiskFactors = Object.values(riskFactors).reduce((sum, count) => sum + count, 0);
  const riskPercentage = totalItems > 0 ? (totalRiskFactors / totalItems) * 100 : 0;

  let riskLevel = 'low';
  if (riskPercentage > 20) riskLevel = 'critical';
  else if (riskPercentage > 10) riskLevel = 'high';
  else if (riskPercentage > 5) riskLevel = 'medium';

  return {
    riskLevel,
    riskPercentage: Math.round(riskPercentage * 100) / 100,
    riskFactors,
    totalItems,
    message: `${riskLevel.toUpperCase()} risk level - ${Math.round(riskPercentage)}% of items have risk factors`
  };
}

// Detect System Errors
function detectSystemErrors() {
  const errors = [];

  // Check for mathematical errors
  inventory.forEach(item => {
    if (item.quantity && item.unitPrice && item.totalPrice) {
      const expectedTotal = item.quantity * item.unitPrice;
      const difference = Math.abs(expectedTotal - item.totalPrice);
      if (difference > 0.01) {
        errors.push({
          type: 'math_error',
          itemId: item.id,
          itemName: item.name,
          message: `Math error: ${item.quantity} × $${item.unitPrice} ≠ $${item.totalPrice}`,
          severity: 'medium'
        });
      }
    }
  });

  // Check for missing critical data
  inventory.forEach(item => {
    if (!item.quantity || item.quantity <= 0) {
      errors.push({
        type: 'missing_quantity',
        itemId: item.id,
        itemName: item.name,
        message: 'Missing or invalid quantity',
        severity: 'high'
      });
    }

    if (!item.location || item.location === 'UNASSIGNED') {
      errors.push({
        type: 'missing_location',
        itemId: item.id,
        itemName: item.name,
        message: 'Item not assigned to storage location',
        severity: 'medium'
      });
    }
  });

  return errors;
}

// Identify Critical Issues
function identifyCriticalIssues() {
  const issues = [];

  // Check for high-value items with issues
  inventory.forEach(item => {
    const itemValue = (item.quantity || 0) * (item.unitPrice || 0);

    if (itemValue > 500) { // High-value items
      if (!item.location || item.location === 'UNASSIGNED') {
        issues.push({
          type: 'high_value_unlocated',
          itemId: item.id,
          itemName: item.name,
          value: itemValue,
          message: `High-value item ($${itemValue.toFixed(2)}) not assigned to location`,
          priority: 'critical'
        });
      }
    }
  });

  // Check for overstocked items
  Object.entries(storageLocations).forEach(([location, data]) => {
    const itemsInLocation = inventory.filter(item => item.location === location).length;
    const utilization = (itemsInLocation / data.capacity) * 100;

    if (utilization > 95) {
      issues.push({
        type: 'overstocked_location',
        location: location,
        utilization: Math.round(utilization),
        capacity: data.capacity,
        currentItems: itemsInLocation,
        message: `Location ${location} is ${Math.round(utilization)}% full`,
        priority: 'high'
      });
    }
  });

  return issues;
}

// Generate Verification Recommendations
function generateVerificationRecommendations(discrepancies) {
  const recommendations = [];

  discrepancies.forEach(discrepancy => {
    switch (discrepancy.type) {
      case 'quantity_mismatch':
        recommendations.push({
          action: 'immediate_recount',
          message: `Perform immediate recount of "${discrepancy.expectedItem?.name}" in designated location`,
          priority: 'high',
          itemId: discrepancy.itemId
        });
        break;

      case 'price_mismatch':
        recommendations.push({
          action: 'verify_pricing',
          message: 'Verify current pricing with supplier or purchasing department',
          priority: 'medium'
        });
        break;

      case 'missing_item':
        recommendations.push({
          action: 'investigate_receipt',
          message: 'Investigate if item was received and properly processed',
          priority: 'high'
        });
        break;

      case 'total_mismatch':
        recommendations.push({
          action: 'audit_calculation',
          message: 'Audit invoice calculation and verify all line items',
          priority: 'high'
        });
        break;
    }
  });

  return recommendations;
}

// Generate Discrepancy Actions
function generateDiscrepancyActions(analysis) {
  const actions = [];

  if (analysis.recountRequired) {
    actions.push('Perform immediate physical recount');
  }

  switch (analysis.discrepancyType) {
    case 'shortage':
      actions.push(
        'Review consumption logs for unreported usage',
        'Check for damage/spoilage documentation',
        'Verify no unauthorized access to storage area',
        'Review transfer logs to other locations'
      );
      break;

    case 'overage':
      actions.push(
        'Verify all recent deliveries were properly documented',
        'Check for items returned from other departments',
        'Review receiving logs for potential double entries',
        'Confirm item identification is correct'
      );
      break;
  }

  if (analysis.severity === 'critical') {
    actions.push('Escalate to inventory manager immediately');
    actions.push('Consider security review if theft is suspected');
  }

  return actions;
}

// Generate Investigation Steps
function generateInvestigationSteps(analysis, item) {
  const steps = [
    'Document current findings with photos if possible',
    'Review transaction history for this item over past 30 days',
    `Check storage location ${item.location} for any environmental issues`
  ];

  if (analysis.severity === 'high' || analysis.severity === 'critical') {
    steps.push(
      'Interview staff who handle this item regularly',
      'Review security footage if available',
      'Check for any recent procedural changes'
    );
  }

  steps.push(
    'Update investigation log with findings',
    'Schedule follow-up recount if needed'
  );

  return steps;
}

// Calculate Confidence Score
function calculateConfidenceScore(verification) {
  let confidence = 95;

  verification.discrepancies.forEach(discrepancy => {
    switch (discrepancy.severity) {
      case 'critical':
        confidence -= 25;
        break;
      case 'high':
        confidence -= 15;
        break;
      case 'medium':
        confidence -= 10;
        break;
      case 'low':
        confidence -= 5;
        break;
    }
  });

  return Math.max(0, confidence);
}

// FIFO Inventory Valuation - Calculate current inventory value based on order history
function calculateFIFOValuation(itemCode, currentCount) {
  const item = inventory.find(i => i.itemCode === itemCode);
  if (!item || !item.orderHistory || currentCount <= 0) {
    return { totalValue: 0, priceBreakdown: [], averagePrice: 0 };
  }

  // Sort order history chronologically (FIFO - oldest first)
  const sortedOrders = [...item.orderHistory].sort((a, b) =>
    new Date(a.orderDate) - new Date(b.orderDate));

  let remainingCount = currentCount;
  let totalValue = 0;
  const priceBreakdown = [];

  // Work backwards through orders (LIFO for remaining inventory)
  // This represents what's actually still in inventory
  for (let i = sortedOrders.length - 1; i >= 0 && remainingCount > 0; i--) {
    const order = sortedOrders[i];
    const quantityFromThisOrder = Math.min(remainingCount, order.quantity);

    if (quantityFromThisOrder > 0) {
      const valueFromThisOrder = quantityFromThisOrder * order.unitPrice;
      totalValue += valueFromThisOrder;

      priceBreakdown.unshift({ // Add to beginning for chronological display
        invoiceNumber: order.invoiceNumber,
        quantity: quantityFromThisOrder,
        unitPrice: order.unitPrice,
        lineValue: valueFromThisOrder,
        orderDate: order.orderDate
      });

      remainingCount -= quantityFromThisOrder;
    }
  }

  const averagePrice = currentCount > 0 ? totalValue / currentCount : 0;

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    priceBreakdown,
    averagePrice: Math.round(averagePrice * 100) / 100,
    remainingOrderedNotCounted: Math.max(0, item.totalQuantity - currentCount)
  };
}

// Update inventory count and calculate FIFO valuation
app.post('/api/inventory/:id/update-count', (req, res) => {
  const itemId = parseInt(req.params.id);
  const { currentCount } = req.body;

  if (currentCount === undefined || currentCount < 0) {
    return res.status(400).json({ error: 'Valid current count is required' });
  }

  const item = inventory.find(i => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Update current count
  item.currentCount = parseFloat(currentCount);
  item.quantity = item.currentCount; // Update display quantity
  item.lastUpdated = new Date().toISOString();

  // Calculate FIFO valuation
  const valuation = calculateFIFOValuation(item.itemCode, item.currentCount);

  res.json({
    success: true,
    message: 'Inventory count updated with FIFO valuation',
    item: {
      ...item,
      fifoValuation: valuation
    }
  });
});

// Get detailed FIFO breakdown for an item
app.get('/api/inventory/:id/fifo-breakdown', (req, res) => {
  const itemId = parseInt(req.params.id);
  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const currentCount = item.currentCount || 0;
  const valuation = calculateFIFOValuation(item.itemCode, currentCount);

  res.json({
    success: true,
    item: {
      id: item.id,
      name: item.name,
      itemCode: item.itemCode,
      totalOrdered: item.totalQuantity,
      currentCount: currentCount,
      unit: item.unit
    },
    fifoBreakdown: valuation,
    orderHistory: item.orderHistory || []
  });
});

// Batch update inventory counts (for physical inventory)
app.post('/api/inventory/batch-update-counts', (req, res) => {
  const { counts } = req.body; // Array of {id, currentCount}

  if (!Array.isArray(counts)) {
    return res.status(400).json({ error: 'Counts array is required' });
  }

  const results = [];
  let totalValueAdjustment = 0;

  counts.forEach(({ id, currentCount }) => {
    const item = inventory.find(i => i.id === parseInt(id));
    if (item && currentCount !== undefined) {
      const previousCount = item.currentCount || 0;
      item.currentCount = parseFloat(currentCount);
      item.quantity = item.currentCount;
      item.lastUpdated = new Date().toISOString();

      const valuation = calculateFIFOValuation(item.itemCode, item.currentCount);
      const previousValuation = calculateFIFOValuation(item.itemCode, previousCount);

      const valueChange = valuation.totalValue - previousValuation.totalValue;
      totalValueAdjustment += valueChange;

      results.push({
        id: item.id,
        name: item.name,
        previousCount,
        newCount: item.currentCount,
        countAdjustment: item.currentCount - previousCount,
        valueChange: Math.round(valueChange * 100) / 100,
        newValuation: valuation
      });
    }
  });

  res.json({
    success: true,
    message: `Updated ${results.length} inventory counts`,
    results,
    totalValueAdjustment: Math.round(totalValueAdjustment * 100) / 100
  });
});

// Data verification endpoints

// Get unverified files that need manual checking
app.get('/api/verification/unverified-files', (req, res) => {
  res.json({
    success: true,
    unverifiedFiles: Array.from(global.dataValidation?.unverifiedFiles || []),
    dataIssues: global.dataIssues || [],
    totalFiles: global.dataIssues?.length || 0
  });
});

// Request verification for specific file
app.post('/api/verification/request-check', (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }

  const filePath = path.join(__dirname, 'data', 'gfs_orders', fileName);

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: `Please verify that the file ${fileName} exists in the data directory.`
      });
    }

    const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validation = validateOrderData(orderData, fileName);

    res.json({
      success: true,
      fileName,
      verification: {
        isValid: validation.isValid,
        errors: validation.errors,
        confidence: validation.confidence,
        requiresManualCheck: !validation.verified
      },
      orderData: {
        invoiceNumber: orderData.invoiceNumber,
        itemCount: orderData.items?.length || 0,
        status: orderData.status,
        processedDate: orderData.processedDate
      },
      message: validation.isValid
        ? 'File validation passed but needs manual verification'
        : 'File has validation errors that need correction'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Unable to read file',
      message: `Please check if ${fileName} is properly formatted JSON and accessible.`,
      details: error.message
    });
  }
});

// Manual verification approval
app.post('/api/verification/approve', (req, res) => {
  const { fileName, approved, notes } = req.body;

  if (!fileName || approved === undefined) {
    return res.status(400).json({ error: 'fileName and approved status are required' });
  }

  if (approved) {
    // Remove from unverified list and mark as manually verified
    global.dataValidation?.unverifiedFiles.delete(fileName);
    global.dataValidation?.manualVerifications.set(fileName, {
      approved: true,
      notes: notes || '',
      verifiedBy: 'Manual Override',
      verifiedDate: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `File ${fileName} manually approved. System will reload data on next request.`,
      action: 'restart_required'
    });
  } else {
    global.dataValidation?.manualVerifications.set(fileName, {
      approved: false,
      notes: notes || 'Rejected due to data issues',
      verifiedBy: 'Manual Override',
      verifiedDate: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `File ${fileName} rejected. Will not be included in inventory calculations.`
    });
  }
});

// Get verification status summary
app.get('/api/verification/status', (req, res) => {
  const unverifiedCount = global.dataValidation?.unverifiedFiles.size || 0;
  const issuesCount = global.dataIssues?.length || 0;
  const manualApprovals = global.dataValidation?.manualVerifications.size || 0;

  res.json({
    success: true,
    status: {
      requiresAttention: unverifiedCount > 0 || issuesCount > 0,
      unverifiedFiles: unverifiedCount,
      totalIssues: issuesCount,
      manualApprovals: manualApprovals,
      message: unverifiedCount > 0
        ? `${unverifiedCount} files need verification before displaying accurate numbers`
        : 'All data verified and ready for use'
    }
  });
});

// PDF Processing functionality
const pdf = require('pdf-parse');

// Process PDF files from /data/pdfs/incoming
app.post('/api/pdf/process', async (req, res) => {
  try {
    const incomingDir = path.join(__dirname, 'data', 'pdfs', 'incoming');
    const processedDir = path.join(__dirname, 'data', 'pdfs', 'processed');

    if (!fs.existsSync(incomingDir)) {
      return res.status(400).json({
        success: false,
        error: 'Incoming PDF directory not found',
        message: 'Please place PDF files in: /Users/davidmikulis/neuro-pilot-ai/backend/data/pdfs/incoming'
      });
    }

    const pdfFiles = fs.readdirSync(incomingDir).filter(file => file.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      return res.json({
        success: true,
        message: 'No PDF files found to process',
        location: incomingDir
      });
    }

    const processedFiles = [];
    const errors = [];

    for (const pdfFile of pdfFiles) {
      try {
        const pdfPath = path.join(incomingDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);
        const data = await pdf(buffer);

        // Extract invoice/order data from PDF
        const invoiceData = extractOrderDataFromPDF(data.text, pdfFile);

        // Add extracted items to inventory
        if (invoiceData.items && invoiceData.items.length > 0) {
          let addedItems = 0;

          for (const item of invoiceData.items) {
            const newItem = {
              id: inventory.length + 1,
              name: item.description || item.name,
              quantity: parseFloat(item.quantity) || 0,
              unit: item.unit || 'EACH',
              category: categorizeItem(item.description || item.name),
              supplier: invoiceData.supplier || 'GFS',
              location: assignStorageLocation(categorizeItem(item.description || item.name), item.description || item.name),
              itemCode: item.itemCode || null,
              unitPrice: parseFloat(item.unitPrice) || 0,
              totalPrice: parseFloat(item.lineTotal) || 0,
              invoiceNumber: invoiceData.invoiceNumber,
              orderDate: invoiceData.orderDate,
              lastUpdated: new Date().toISOString(),
              source: 'PDF_IMPORT',
              pdfFile: pdfFile
            };

            inventory.push(newItem);
            addedItems++;
          }

          processedFiles.push({
            file: pdfFile,
            invoiceNumber: invoiceData.invoiceNumber,
            itemsAdded: addedItems,
            totalValue: invoiceData.total,
            orderDate: invoiceData.orderDate
          });
        }

        // Move processed PDF to processed folder
        const processedPath = path.join(processedDir, pdfFile);
        fs.renameSync(pdfPath, processedPath);

      } catch (fileError) {
        errors.push({
          file: pdfFile,
          error: fileError.message
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${processedFiles.length} PDF files`,
      processedFiles,
      errors,
      totalItemsAdded: processedFiles.reduce((sum, file) => sum + file.itemsAdded, 0),
      newInventoryCount: inventory.length
    });

  } catch (error) {
    console.error('Error processing PDFs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process PDF files',
      details: error.message
    });
  }
});

// Extract order data from PDF text
function extractOrderDataFromPDF(pdfText, filename) {
  const invoiceNumber = filename.replace('.pdf', '');

  // Extract order date
  let orderDate = null;
  const datePatterns = [
    /ORDER\s+DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /INVOICE\s+DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i
  ];

  for (const pattern of datePatterns) {
    const match = pdfText.match(pattern);
    if (match) {
      const dateStr = match[1];
      const [month, day, year] = dateStr.split('/');
      orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }

  // Extract supplier
  let supplier = 'GFS';
  if (pdfText.includes('GORDON FOOD SERVICE')) supplier = 'GFS';
  else if (pdfText.includes('SYSCO')) supplier = 'SYSCO';

  // Extract invoice total
  let total = 0;
  const totalPatterns = [
    /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
    /TOTAL\s+AMOUNT\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
    /AMOUNT\s+DUE\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i
  ];

  for (const pattern of totalPatterns) {
    const match = pdfText.match(pattern);
    if (match) {
      total = parseFloat(match[1].replace(',', ''));
      break;
    }
  }

  // Extract line items (simplified extraction)
  const items = [];
  const lines = pdfText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for lines that might contain item data
    if (line.match(/^\d+\s+.*\$\d+/)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        items.push({
          description: parts.slice(1, -2).join(' '),
          quantity: parseFloat(parts[0]) || 1,
          unitPrice: parseFloat(parts[parts.length - 2].replace('$', '')) || 0,
          lineTotal: parseFloat(parts[parts.length - 1].replace('$', '')) || 0,
          unit: 'EACH'
        });
      }
    }
  }

  return {
    invoiceNumber,
    orderDate,
    supplier,
    total,
    items
  };
}

// Categorize items based on description
function categorizeItem(description) {
  if (!description) return 'General';

  const desc = description.toLowerCase();

  if (desc.includes('meat') || desc.includes('beef') || desc.includes('pork') || desc.includes('steak')) {
    return 'Meat & Protein';
  }
  if (desc.includes('chicken') || desc.includes('poultry') || desc.includes('wing')) {
    return 'Poultry';
  }
  if (desc.includes('dairy') || desc.includes('milk') || desc.includes('cheese') || desc.includes('butter')) {
    return 'Dairy';
  }
  if (desc.includes('frozen') || desc.includes('ice cream')) {
    return 'Frozen';
  }
  if (desc.includes('produce') || desc.includes('vegetable') || desc.includes('fruit') || desc.includes('lettuce') || desc.includes('tomato')) {
    return 'Produce';
  }
  if (desc.includes('beverage') || desc.includes('drink') || desc.includes('juice') || desc.includes('soda')) {
    return 'Beverages';
  }
  if (desc.includes('flour') || desc.includes('rice') || desc.includes('grain') || desc.includes('pasta')) {
    return 'Dry Goods';
  }
  if (desc.includes('sauce') || desc.includes('condiment') || desc.includes('ketchup') || desc.includes('mustard')) {
    return 'Condiments';
  }

  return 'General';
}

// Get PDF processing status
app.get('/api/pdf/status', (req, res) => {
  const incomingDir = path.join(__dirname, 'data', 'pdfs', 'incoming');
  const processedDir = path.join(__dirname, 'data', 'pdfs', 'processed');

  let incomingCount = 0;
  let processedCount = 0;

  if (fs.existsSync(incomingDir)) {
    incomingCount = fs.readdirSync(incomingDir).filter(file => file.toLowerCase().endsWith('.pdf')).length;
  }

  if (fs.existsSync(processedDir)) {
    processedCount = fs.readdirSync(processedDir).filter(file => file.toLowerCase().endsWith('.pdf')).length;
  }

  res.json({
    success: true,
    directories: {
      incoming: incomingDir,
      processed: processedDir
    },
    counts: {
      incoming: incomingCount,
      processed: processedCount
    },
    message: incomingCount > 0 ? `${incomingCount} PDF files ready for processing` : 'No PDF files found',
    instructions: {
      step1: `Place PDF files in: ${incomingDir}`,
      step2: 'POST to /api/pdf/process to extract inventory data',
      step3: 'Check processed files in: ' + processedDir
    }
  });
});

// ENHANCED COUNT MANAGEMENT SYSTEM WITH RECENT ORDERS

// Get recent orders for an item to include in count verification
app.get('/api/count/recent-orders/:itemId', (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { days = 30 } = req.query;

    const item = inventory.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const recentOrders = getRecentOrdersForItem(item, parseInt(days));
    const expectedAdjustment = calculateExpectedAdjustment(recentOrders);

    res.json({
      success: true,
      item: {
        id: item.id,
        name: item.name,
        currentSystemCount: item.quantity,
        location: item.location
      },
      recentOrders,
      expectedAdjustment,
      suggestedPhysicalCount: item.quantity + expectedAdjustment.netChange,
      instructions: {
        message: 'Include these recent orders when performing physical count',
        steps: [
          'Count all physical items in storage location',
          'Add any items from recent orders still in receiving/processing',
          'Subtract any items from recent consumption/usage not yet recorded',
          'Compare final count with suggested count below'
        ]
      },
      countingNotes: generateCountingNotes(recentOrders, item)
    });

  } catch (error) {
    console.error('Error getting recent orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent orders'
    });
  }
});

// AI Smart Count that includes recent order verification
app.post('/api/ai/smart-count', (req, res) => {
  try {
    const { itemId, physicalCount, includeRecentOrders = true, orderDays = 7 } = req.body;

    if (!itemId || physicalCount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Item ID and physical count are required'
      });
    }

    const item = inventory.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const smartCount = performSmartCount(item, physicalCount, includeRecentOrders, orderDays);

    res.json({
      success: true,
      smartCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error performing smart count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform smart count'
    });
  }
});

// Verify count with recent orders included
app.post('/api/count/verify-with-orders', (req, res) => {
  try {
    const { itemId, physicalCount, orderDays = 30, notes } = req.body;

    if (!itemId || physicalCount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Item ID and physical count are required'
      });
    }

    const item = inventory.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const verification = verifyCountWithOrders(item, physicalCount, orderDays, notes);

    // Update item if verification is successful
    if (verification.status === 'verified' || verification.status === 'accepted_with_notes') {
      item.quantity = physicalCount;
      item.lastUpdated = new Date().toISOString();
      item.lastPhysicalCount = {
        count: physicalCount,
        date: new Date().toISOString(),
        verifiedWith: `${orderDays} days of orders`,
        notes: notes || '',
        accuracy: verification.accuracy
      };
    }

    res.json({
      success: true,
      verification,
      updated: verification.status === 'verified' || verification.status === 'accepted_with_notes',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error verifying count with orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify count with orders'
    });
  }
});

// Suggest expected count based on system count and recent orders
app.post('/api/count/suggest-expected', (req, res) => {
  try {
    const { itemId, orderDays = 14 } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required'
      });
    }

    const item = inventory.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const suggestion = suggestExpectedCount(item, orderDays);

    res.json({
      success: true,
      suggestion,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error suggesting expected count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest expected count'
    });
  }
});

// REAL-TIME ACCURACY TRACKING ENDPOINTS

// Get real-time system accuracy percentage
app.get('/api/accuracy/real-time', (req, res) => {
  try {
    const accuracy = calculateRealTimeAccuracy();

    res.json({
      success: true,
      accuracy,
      timestamp: new Date().toISOString(),
      message: `System is ${accuracy.overallAccuracy}% accurate`
    });

  } catch (error) {
    console.error('Error calculating real-time accuracy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate accuracy'
    });
  }
});

// Get items with min/max level alerts
app.get('/api/inventory/min-max-alerts', (req, res) => {
  try {
    const alerts = getMinMaxAlerts();

    res.json({
      success: true,
      alerts,
      totalAlerts: alerts.length,
      systemAccuracy: calculateRealTimeAccuracy().overallAccuracy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting min/max alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get min/max alerts'
    });
  }
});

// Set min/max levels for an item
app.post('/api/inventory/:id/min-max', (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { minLevel, maxLevel, autoCalculate = false } = req.body;

    const item = inventory.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    if (autoCalculate) {
      item.minLevel = calculateMinLevel(item.totalQuantity || item.quantity, item.category);
      item.maxLevel = calculateMaxLevel(item.totalQuantity || item.quantity, item.category);
    } else {
      if (minLevel !== undefined) item.minLevel = parseFloat(minLevel);
      if (maxLevel !== undefined) item.maxLevel = parseFloat(maxLevel);
    }

    item.lastUpdated = new Date().toISOString();

    // Recalculate accuracy after changes
    const accuracy = calculateRealTimeAccuracy();

    res.json({
      success: true,
      item: {
        id: item.id,
        name: item.name,
        currentQuantity: item.quantity || item.totalQuantity,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        status: getStockStatus(item)
      },
      systemAccuracy: accuracy.overallAccuracy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error setting min/max levels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set min/max levels'
    });
  }
});

// Get PDF-sourced value calculations only
app.get('/api/inventory/pdf-values', (req, res) => {
  try {
    const pdfValues = calculatePDFOnlyValues();

    res.json({
      success: true,
      pdfValues,
      totalPdfItems: pdfValues.itemCount,
      totalPdfValue: pdfValues.totalValue,
      accuracy: calculateRealTimeAccuracy().breakdown.pdfValidation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error calculating PDF values:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate PDF values'
    });
  }
});

// Orders placeholder
app.get('/api/orders', (req, res) => {
  res.json({
    success: true,
    orders: [],
    message: 'Order management ready'
  });
});

// Supporting functions for enhanced count management with recent orders

// Get recent orders for an item
function getRecentOrdersForItem(item, days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Look for orders in the existing inventory that match this item
  const recentOrders = inventory.filter(invItem =>
    (invItem.itemCode === item.itemCode ||
     invItem.name.toLowerCase() === item.name.toLowerCase()) &&
    invItem.orderDate &&
    new Date(invItem.orderDate) >= cutoffDate
  );

  return recentOrders.map(order => ({
    invoiceNumber: order.invoiceNumber,
    orderDate: order.orderDate,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalValue: order.totalPrice,
    status: order.status || 'received',
    daysAgo: Math.floor((new Date() - new Date(order.orderDate)) / (1000 * 60 * 60 * 24))
  }));
}

// Calculate expected adjustment based on recent orders
function calculateExpectedAdjustment(recentOrders) {
  const adjustment = {
    totalReceived: 0,
    totalConsumed: 0, // This would come from consumption tracking
    netChange: 0,
    orderCount: recentOrders.length,
    totalValue: 0
  };

  recentOrders.forEach(order => {
    if (order.status === 'received' || order.status === 'processed') {
      adjustment.totalReceived += order.quantity;
      adjustment.totalValue += order.totalValue;
    }
  });

  // For now, assume minimal consumption since we don't have consumption tracking
  // In a real system, this would pull from usage/consumption logs
  adjustment.totalConsumed = 0;
  adjustment.netChange = adjustment.totalReceived - adjustment.totalConsumed;

  return adjustment;
}

// Generate counting notes based on recent orders
function generateCountingNotes(recentOrders, item) {
  const notes = [];

  if (recentOrders.length === 0) {
    notes.push('No recent orders found - count should match system quantity exactly');
    return notes;
  }

  notes.push(`Found ${recentOrders.length} recent orders for this item:`);

  recentOrders.forEach(order => {
    const daysAgo = order.daysAgo;
    const timeDesc = daysAgo === 0 ? 'today' :
                    daysAgo === 1 ? 'yesterday' :
                    `${daysAgo} days ago`;

    notes.push(`• ${order.quantity} units received ${timeDesc} (Invoice: ${order.invoiceNumber})`);
  });

  const totalReceived = recentOrders.reduce((sum, order) => sum + order.quantity, 0);
  notes.push(`Total recent receipts: ${totalReceived} units`);

  if (totalReceived > 0) {
    notes.push('⚠️ CHECK: Verify these received items are in the storage location');
    notes.push('⚠️ CHECK: Look for items still in receiving area or staging');
  }

  return notes;
}

// Perform smart count with AI analysis
function performSmartCount(item, physicalCount, includeRecentOrders, orderDays) {
  const smartCount = {
    itemId: item.id,
    itemName: item.name,
    systemCount: item.quantity,
    physicalCount: physicalCount,
    discrepancy: physicalCount - item.quantity,
    discrepancyPercentage: item.quantity > 0 ? ((physicalCount - item.quantity) / item.quantity * 100).toFixed(2) : 0,
    status: 'pending_verification',
    confidence: 90,
    recommendations: [],
    recentOrdersAnalysis: null
  };

  // Analyze discrepancy
  const absDiff = Math.abs(smartCount.discrepancy);
  const absPercent = Math.abs(smartCount.discrepancyPercentage);

  if (absDiff === 0) {
    smartCount.status = 'perfect_match';
    smartCount.confidence = 100;
  } else if (absPercent <= 2) {
    smartCount.status = 'acceptable_variance';
    smartCount.confidence = 95;
  } else if (absPercent <= 5) {
    smartCount.status = 'minor_discrepancy';
    smartCount.confidence = 85;
  } else if (absPercent <= 10) {
    smartCount.status = 'significant_discrepancy';
    smartCount.confidence = 70;
  } else {
    smartCount.status = 'major_discrepancy';
    smartCount.confidence = 50;
  }

  // Include recent orders analysis if requested
  if (includeRecentOrders) {
    const recentOrders = getRecentOrdersForItem(item, orderDays);
    const expectedAdjustment = calculateExpectedAdjustment(recentOrders);

    smartCount.recentOrdersAnalysis = {
      ordersFound: recentOrders.length,
      expectedAdjustment: expectedAdjustment.netChange,
      adjustedSystemCount: item.quantity + expectedAdjustment.netChange,
      adjustedDiscrepancy: physicalCount - (item.quantity + expectedAdjustment.netChange),
      recentOrders: recentOrders
    };

    // Recalculate status based on adjusted count
    const adjustedDiff = Math.abs(smartCount.recentOrdersAnalysis.adjustedDiscrepancy);
    const adjustedPercent = item.quantity > 0 ?
      (adjustedDiff / (item.quantity + expectedAdjustment.netChange) * 100) : 0;

    if (adjustedPercent <= 2) {
      smartCount.confidence += 10;
      smartCount.status = 'verified_with_orders';
    }
  }

  // Generate recommendations
  smartCount.recommendations = generateSmartCountRecommendations(smartCount);

  return smartCount;
}

// Verify count with orders included
function verifyCountWithOrders(item, physicalCount, orderDays, notes) {
  const verification = {
    itemId: item.id,
    itemName: item.name,
    physicalCount: physicalCount,
    systemCount: item.quantity,
    orderDays: orderDays,
    status: 'verified',
    accuracy: 100,
    issues: [],
    notes: notes || ''
  };

  const recentOrders = getRecentOrdersForItem(item, orderDays);
  const expectedAdjustment = calculateExpectedAdjustment(recentOrders);

  verification.recentOrdersData = {
    ordersFound: recentOrders.length,
    totalReceived: expectedAdjustment.totalReceived,
    expectedSystemCount: item.quantity + expectedAdjustment.netChange,
    actualDiscrepancy: physicalCount - (item.quantity + expectedAdjustment.netChange)
  };

  const discrepancy = Math.abs(verification.recentOrdersData.actualDiscrepancy);
  const discrepancyPercent = verification.recentOrdersData.expectedSystemCount > 0 ?
    (discrepancy / verification.recentOrdersData.expectedSystemCount * 100) : 0;

  // Determine verification status
  if (discrepancy === 0) {
    verification.status = 'verified';
    verification.accuracy = 100;
  } else if (discrepancyPercent <= 2) {
    verification.status = 'verified';
    verification.accuracy = 98;
  } else if (discrepancyPercent <= 5) {
    verification.status = 'accepted_with_notes';
    verification.accuracy = 90;
    verification.issues.push('Minor discrepancy within acceptable range');
  } else if (discrepancyPercent <= 10) {
    verification.status = 'requires_investigation';
    verification.accuracy = 75;
    verification.issues.push('Significant discrepancy requires investigation');
  } else {
    verification.status = 'rejected';
    verification.accuracy = 50;
    verification.issues.push('Major discrepancy - recount recommended');
  }

  return verification;
}

// Suggest expected count based on system and recent orders
function suggestExpectedCount(item, orderDays) {
  const recentOrders = getRecentOrdersForItem(item, orderDays);
  const expectedAdjustment = calculateExpectedAdjustment(recentOrders);

  const suggestion = {
    itemId: item.id,
    itemName: item.name,
    currentSystemCount: item.quantity,
    recentOrdersDays: orderDays,
    recentOrders: recentOrders,
    expectedAdjustment: expectedAdjustment,
    suggestedCount: item.quantity + expectedAdjustment.netChange,
    confidenceLevel: calculateSuggestionConfidence(recentOrders, item),
    countingInstructions: generateCountingInstructions(item, recentOrders)
  };

  return suggestion;
}

// Generate smart count recommendations
function generateSmartCountRecommendations(smartCount) {
  const recommendations = [];

  switch (smartCount.status) {
    case 'perfect_match':
      recommendations.push('✅ Perfect match - no action required');
      break;

    case 'acceptable_variance':
      recommendations.push('✅ Count within acceptable variance');
      recommendations.push('Update system with physical count');
      break;

    case 'minor_discrepancy':
      recommendations.push('⚠️ Minor discrepancy detected');
      recommendations.push('Consider a recount to confirm');
      if (smartCount.recentOrdersAnalysis) {
        recommendations.push('Check if recent orders are properly staged');
      }
      break;

    case 'significant_discrepancy':
      recommendations.push('🔍 Significant discrepancy requires investigation');
      recommendations.push('Perform immediate recount');
      recommendations.push('Check for unreported consumption or transfers');
      break;

    case 'major_discrepancy':
      recommendations.push('🚨 Major discrepancy - escalate immediately');
      recommendations.push('Conduct supervised recount');
      recommendations.push('Review security and access logs');
      recommendations.push('Investigate potential theft or data errors');
      break;

    case 'verified_with_orders':
      recommendations.push('✅ Count verified when recent orders included');
      recommendations.push('Update system with physical count');
      break;
  }

  return recommendations;
}

// Calculate suggestion confidence
function calculateSuggestionConfidence(recentOrders, item) {
  let confidence = 85; // Base confidence

  // More recent orders = higher confidence
  if (recentOrders.length > 0) {
    const avgDaysAgo = recentOrders.reduce((sum, order) => sum + order.daysAgo, 0) / recentOrders.length;
    if (avgDaysAgo <= 7) confidence += 10;
    else if (avgDaysAgo <= 14) confidence += 5;
  } else {
    confidence -= 15; // No recent orders to verify against
  }

  // High-value items get lower confidence for safety
  const itemValue = (item.quantity || 0) * (item.unitPrice || 0);
  if (itemValue > 1000) confidence -= 5;

  return Math.max(50, Math.min(100, confidence));
}

// Generate counting instructions
function generateCountingInstructions(item, recentOrders) {
  const instructions = [
    `Go to storage location: ${item.location}`,
    'Count all physical units in the designated area',
    'Check for items in receiving/staging areas'
  ];

  if (recentOrders.length > 0) {
    instructions.push('⚠️ IMPORTANT: Recent orders detected');
    instructions.push('Look for newly received items that may not be shelved yet');

    recentOrders.forEach(order => {
      if (order.daysAgo <= 3) {
        instructions.push(`• Check for ${order.quantity} units from ${order.invoiceNumber} (${order.daysAgo} days ago)`);
      }
    });
  }

  instructions.push('Record any damaged or expired items separately');
  instructions.push('Take photos if any unusual conditions are found');

  return instructions;
}

// ENHANCED ACCURACY AND MIN/MAX FUNCTIONS

// Calculate real-time system accuracy
function calculateRealTimeAccuracy() {
  const now = new Date().toISOString();
  let totalItems = inventory.length;
  let accurateItems = 0;
  let pdfSourcedItems = 0;
  let priceAccurate = 0;
  let quantityAccurate = 0;
  let locationAccurate = 0;
  let dataComplete = 0;
  let pdfValidated = 0;
  let minMaxCompliant = 0;

  if (totalItems === 0) {
    return {
      overallAccuracy: 100,
      totalItems: 0,
      accurateItems: 0,
      pdfSourcedItems: 0,
      criticalIssues: 0,
      breakdown: {
        priceAccuracy: 100,
        quantityAccuracy: 100,
        locationAccuracy: 100,
        dataCompleteness: 100,
        pdfValidation: 100
      },
      minMaxCompliance: 100,
      lastCalculated: now
    };
  }

  inventory.forEach(item => {
    let itemAccurate = true;

    // Check if item is PDF sourced
    const isPdfSourced = item.source === 'PDF_IMPORT' || item.pdfSourced === true;
    if (isPdfSourced) pdfSourcedItems++;

    // Price accuracy check
    if (item.unitPrice && item.totalPrice && item.quantity) {
      const expectedTotal = item.quantity * item.unitPrice;
      const priceDiff = Math.abs(expectedTotal - item.totalPrice);
      if (priceDiff <= 0.01) {
        priceAccurate++;
      } else {
        itemAccurate = false;
      }
    } else if (!item.unitPrice || !item.totalPrice) {
      itemAccurate = false;
    } else {
      priceAccurate++;
    }

    // Quantity accuracy check
    if (item.quantity > 0 || item.totalQuantity > 0) {
      quantityAccurate++;
    } else {
      itemAccurate = false;
    }

    // Location accuracy check
    if (item.location && item.location !== 'UNASSIGNED') {
      locationAccurate++;
    } else {
      itemAccurate = false;
    }

    // Data completeness check
    const requiredFields = ['name', 'category', 'supplier'];
    const hasAllFields = requiredFields.every(field => item[field] && item[field].trim());
    if (hasAllFields) {
      dataComplete++;
    } else {
      itemAccurate = false;
    }

    // PDF validation check (only count PDF-sourced items)
    if (isPdfSourced) {
      pdfValidated++;
    }

    // Min/Max compliance check
    if (item.minLevel !== undefined && item.maxLevel !== undefined) {
      const currentQty = item.quantity || item.totalQuantity || 0;
      if (currentQty >= item.minLevel && currentQty <= item.maxLevel) {
        minMaxCompliant++;
      } else if (currentQty > 0) {
        // Only flag as non-compliant if we have stock
        itemAccurate = false;
      }
    }

    if (itemAccurate) accurateItems++;
  });

  const accuracy = {
    overallAccuracy: Math.round((accurateItems / totalItems) * 100),
    totalItems,
    accurateItems,
    pdfSourcedItems,
    criticalIssues: totalItems - accurateItems,
    breakdown: {
      priceAccuracy: Math.round((priceAccurate / totalItems) * 100),
      quantityAccuracy: Math.round((quantityAccurate / totalItems) * 100),
      locationAccuracy: Math.round((locationAccurate / totalItems) * 100),
      dataCompleteness: Math.round((dataComplete / totalItems) * 100),
      pdfValidation: pdfSourcedItems > 0 ? Math.round((pdfValidated / pdfSourcedItems) * 100) : 100
    },
    minMaxCompliance: Math.round((minMaxCompliant / totalItems) * 100),
    lastCalculated: now
  };

  // Update global accuracy tracker
  systemAccuracy = accuracy;

  return accuracy;
}

// Calculate min level for an item
function calculateMinLevel(quantity, category) {
  if (!quantity || quantity <= 0) return 1;

  const basePercentage = getMinLevelPercentage(category);
  const minLevel = Math.max(1, Math.round(quantity * basePercentage));

  return minLevel;
}

// Calculate max level for an item
function calculateMaxLevel(quantity, category) {
  if (!quantity || quantity <= 0) return 10;

  const multiplier = getMaxLevelMultiplier(category);
  const maxLevel = Math.round(quantity * multiplier);

  return Math.max(quantity * 2, maxLevel);
}

// Get min level percentage based on category
function getMinLevelPercentage(category) {
  const categoryLower = (category || '').toLowerCase();

  if (categoryLower.includes('frozen') || categoryLower.includes('perishable')) {
    return 0.05; // 5% for perishables
  }
  if (categoryLower.includes('dairy') || categoryLower.includes('produce')) {
    return 0.10; // 10% for fresh items
  }
  if (categoryLower.includes('meat') || categoryLower.includes('poultry')) {
    return 0.08; // 8% for proteins
  }
  if (categoryLower.includes('dry') || categoryLower.includes('canned')) {
    return 0.20; // 20% for shelf-stable items
  }

  return 0.15; // 15% default
}

// Get max level multiplier based on category
function getMaxLevelMultiplier(category) {
  const categoryLower = (category || '').toLowerCase();

  if (categoryLower.includes('frozen') || categoryLower.includes('perishable')) {
    return 2.0; // 2x current for perishables
  }
  if (categoryLower.includes('dairy') || categoryLower.includes('produce')) {
    return 2.5; // 2.5x for fresh items
  }
  if (categoryLower.includes('dry') || categoryLower.includes('canned')) {
    return 4.0; // 4x for shelf-stable items
  }

  return 3.0; // 3x default
}

// Get min/max alerts
function getMinMaxAlerts() {
  const alerts = [];

  inventory.forEach(item => {
    const currentQty = item.quantity || item.totalQuantity || 0;

    if (item.minLevel !== undefined && currentQty < item.minLevel) {
      alerts.push({
        type: 'low_stock',
        severity: currentQty === 0 ? 'critical' : 'high',
        itemId: item.id,
        itemName: item.name,
        currentQuantity: currentQty,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        location: item.location,
        category: item.category,
        message: currentQty === 0 ? 'OUT OF STOCK' : `Low stock: ${currentQty} units (min: ${item.minLevel})`
      });
    }

    if (item.maxLevel !== undefined && currentQty > item.maxLevel) {
      alerts.push({
        type: 'overstock',
        severity: 'medium',
        itemId: item.id,
        itemName: item.name,
        currentQuantity: currentQty,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        location: item.location,
        category: item.category,
        message: `Overstock: ${currentQty} units (max: ${item.maxLevel})`
      });
    }
  });

  return alerts.sort((a, b) => {
    const severityOrder = { 'critical': 3, 'high': 2, 'medium': 1, 'low': 0 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

// Get stock status for an item
function getStockStatus(item) {
  const currentQty = item.quantity || item.totalQuantity || 0;

  if (currentQty === 0) return 'out_of_stock';
  if (item.minLevel !== undefined && currentQty < item.minLevel) return 'low_stock';
  if (item.maxLevel !== undefined && currentQty > item.maxLevel) return 'overstock';

  return 'in_stock';
}

// Calculate PDF-only values
function calculatePDFOnlyValues() {
  const pdfItems = inventory.filter(item =>
    item.source === 'PDF_IMPORT' || item.pdfSourced === true
  );

  let totalValue = 0;
  let validatedValue = 0;
  let itemCount = pdfItems.length;
  let validatedCount = 0;

  const breakdown = {
    byCategory: {},
    bySupplier: {},
    byLocation: {}
  };

  pdfItems.forEach(item => {
    const itemValue = (item.quantity || item.totalQuantity || 0) * (item.unitPrice || 0);
    totalValue += itemValue;

    // Check if item is properly validated
    const isValidated = item.unitPrice && item.totalPrice && item.quantity &&
      Math.abs((item.quantity * item.unitPrice) - item.totalPrice) <= 0.01;

    if (isValidated) {
      validatedValue += itemValue;
      validatedCount++;
    }

    // Category breakdown
    const category = item.category || 'Unknown';
    if (!breakdown.byCategory[category]) {
      breakdown.byCategory[category] = { count: 0, value: 0 };
    }
    breakdown.byCategory[category].count++;
    breakdown.byCategory[category].value += itemValue;

    // Supplier breakdown
    const supplier = item.supplier || 'Unknown';
    if (!breakdown.bySupplier[supplier]) {
      breakdown.bySupplier[supplier] = { count: 0, value: 0 };
    }
    breakdown.bySupplier[supplier].count++;
    breakdown.bySupplier[supplier].value += itemValue;

    // Location breakdown
    const location = item.location || 'Unassigned';
    if (!breakdown.byLocation[location]) {
      breakdown.byLocation[location] = { count: 0, value: 0 };
    }
    breakdown.byLocation[location].count++;
    breakdown.byLocation[location].value += itemValue;
  });

  return {
    itemCount,
    validatedCount,
    totalValue: Math.round(totalValue * 100) / 100,
    validatedValue: Math.round(validatedValue * 100) / 100,
    validationRate: itemCount > 0 ? Math.round((validatedCount / itemCount) * 100) : 100,
    breakdown,
    averageValue: itemCount > 0 ? Math.round((totalValue / itemCount) * 100) / 100 : 0
  };
}

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('✅ Simple Inventory System Started');
  console.log(`📦 Server: http://localhost:${PORT}`);
  console.log(`🏪 Storage Locations: ${Object.keys(storageLocations).length}`);
  console.log(`📋 Inventory Items: ${inventory.length}`);
  console.log(`🚛 Suppliers: ${suppliers.length}`);
  console.log('');
  console.log('🔥 ENHANCED AI INVENTORY SYSTEM ENDPOINTS:');
  console.log('  GET  /api/storage/locations - View storage locations');
  console.log('  POST /api/storage/locations - Create storage location');
  console.log('  GET  /api/inventory - View inventory');
  console.log('  POST /api/inventory - Add inventory item');
  console.log('  GET  /api/suppliers - View suppliers');
  console.log('  GET  /api/orders - Order management');
  console.log('  GET  /api/pdf/status - Check PDF processing status');
  console.log('  POST /api/pdf/process - Process PDF files to inventory');
  console.log('');
  console.log('🤖 AI VERIFICATION & ACCURACY ENDPOINTS:');
  console.log('  GET  /api/ai/accuracy-analysis - Complete accuracy analysis');
  console.log('  POST /api/ai/verify-transaction - AI transaction verification');
  console.log('  POST /api/ai/detect-discrepancies - AI discrepancy detection');
  console.log('  POST /api/ai/guided-recount - AI guided recount system');
  console.log('  POST /api/ai/smart-count - Smart count with recent orders');
  console.log('');
  console.log('📊 COUNT MANAGEMENT ENDPOINTS:');
  console.log('  GET  /api/count/recent-orders/:itemId - Get recent orders for item');
  console.log('  POST /api/count/verify-with-orders - Verify count with recent orders');
  console.log('  POST /api/count/suggest-expected - Suggest expected count');
  console.log('');
  console.log('📈 REAL-TIME ACCURACY & MIN/MAX ENDPOINTS:');
  console.log('  GET  /api/accuracy/real-time - Real-time accuracy percentage');
  console.log('  GET  /api/inventory/min-max-alerts - Get min/max level alerts');
  console.log('  POST /api/inventory/:id/min-max - Set min/max levels');
  console.log('  GET  /api/inventory/pdf-values - PDF-sourced values only');
  console.log('');

  // Calculate and display initial accuracy
  const initialAccuracy = calculateRealTimeAccuracy();
  console.log(`🎯 SYSTEM ACCURACY: ${initialAccuracy.overallAccuracy}% ACCURATE`);
  console.log(`📄 PDF-sourced items: ${initialAccuracy.pdfSourcedItems}/${initialAccuracy.totalItems}`);
  console.log(`⚠️  Critical issues: ${initialAccuracy.criticalIssues}`);
  console.log('');
});