const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { requirePermission, requireRole, ROLES } = require('../middleware/auth');
const { auditLog, performanceLog } = require('../config/logger');
const { getFileIO } = require('../utils/fileIO');
const { getEncryption } = require('../config/encryption');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// In-memory data stores (replace with database in production)
let inventory = [];
let storageLocations = new Map();
let inventoryHistory = [];

// Data loading functions
function getDataPath(...paths) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME;
  if (isProduction) {
    return path.join('/data', ...paths);
  }
  return path.join(__dirname, '../../../backend/data', ...paths);
}

function loadSyscoData() {
  try {
    // Try multiple possible paths
    const possiblePaths = [
      getDataPath('catalog', 'sysco_catalog_1753182965099.json'),
      getDataPath('inventory', 'master_inventory.json'),
      getDataPath('inventory', 'products.json')
    ];
    
    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        const rawData = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(rawData);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        } else if (data.products && Array.isArray(data.products)) {
          return data.products;
        }
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading Sysco data:', error);
    return [];
  }
}

function loadGFSOrders() {
  try {
    const dataPath = getDataPath('gfs_orders');
    if (fs.existsSync(dataPath)) {
      const files = fs.readdirSync(dataPath).filter(f => f.endsWith('.json'));
      let allOrders = [];
      files.forEach(file => {
        try {
          const orderData = JSON.parse(fs.readFileSync(path.join(dataPath, file), 'utf8'));
          if (Array.isArray(orderData)) {
            allOrders = allOrders.concat(orderData);
          } else if (orderData.items && Array.isArray(orderData.items)) {
            allOrders = allOrders.concat(orderData.items);
          } else if (orderData.order && orderData.order.items) {
            allOrders = allOrders.concat(orderData.order.items);
          }
        } catch (err) {
          console.warn(`Skipping invalid order file: ${file}`);
        }
      });
      return allOrders;
    }
    return [];
  } catch (error) {
    console.error('Error loading GFS orders:', error);
    return [];
  }
}

function loadStorageLocations() {
  try {
    const possiblePaths = [
      getDataPath('storage_locations', 'locations.json'),
      getDataPath('inventory', 'locations.json')
    ];
    
    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        const rawData = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(rawData);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        } else if (data.locations && Array.isArray(data.locations)) {
          return data.locations;
        }
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading storage locations:', error);
    return [];
  }
}

// Load real data
function initializeRealData() {
  console.log('🔄 Loading enterprise data...');
  
  // Load Sysco catalog
  const syscoData = loadSyscoData();
  console.log(`✅ Loaded Sysco catalog: ${syscoData.length} items`);
  
  // Load GFS orders
  const gfsOrders = loadGFSOrders();
  console.log(`✅ Loaded GFS orders: ${gfsOrders.length} orders`);
  
  // Load storage locations
  const locations = loadStorageLocations();
  console.log(`✅ Loaded storage locations: ${locations.length} locations`);
  
  // Initialize storage locations
  locations.forEach(location => {
    storageLocations.set(location.id || location.name.toLowerCase().replace(/\s+/g, '-'), {
      id: location.id || location.name.toLowerCase().replace(/\s+/g, '-'),
      name: location.name,
      type: location.type || 'general',
      temperature: location.temperature || 'ambient',
      capacity: location.capacity || 1000,
      currentUsage: 0,
      description: location.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  
  // Convert Sysco data to inventory format
  let itemCounter = 1;
  inventory = syscoData.slice(0, 100).map(item => ({ // Load first 100 items for demo
    id: `sysco_${itemCounter++}`,
    name: item.name_en || item.name || 'Unknown Item',
    category: item.category || 'General',
    quantity: Math.floor(Math.random() * 50) + 1,
    unit: item.unit || 'EA',
    location: Array.from(storageLocations.keys())[Math.floor(Math.random() * storageLocations.size)],
    supplier: 'Sysco',
    supplierCode: item.code || item.id || '',
    unitPrice: parseFloat(item.price || Math.random() * 50 + 5),
    totalValue: 0,
    minQuantity: Math.floor(Math.random() * 10) + 1,
    maxQuantity: Math.floor(Math.random() * 100) + 50,
    expiryDate: item.perishable ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  
  // Calculate total values
  inventory.forEach(item => {
    item.totalValue = item.quantity * item.unitPrice;
  });
  
  console.log(`✅ Generated enterprise inventory: ${inventory.length} items`);
  console.log(`✅ Storage locations: ${storageLocations.size} locations`);
}

// Initialize default storage locations
const defaultLocations = [
  {
    id: 'cooler-b1',
    name: 'Cooler B1',
    type: 'refrigerated',
    temperature: '2°C',
    capacity: 500,
    currentUsage: 0,
    description: 'Main dairy and fresh produce cooler'
  },
  {
    id: 'cooler-b2', 
    name: 'Cooler B2',
    type: 'refrigerated',
    temperature: '2°C',
    capacity: 500,
    currentUsage: 0,
    description: 'Secondary refrigerated storage'
  },
  {
    id: 'freezer-a2',
    name: 'Freezer A2',
    type: 'frozen',
    temperature: '-18°C',
    capacity: 300,
    currentUsage: 0,
    description: 'Main freezer unit'
  },
  {
    id: 'walk-in-d1',
    name: 'Walk-in D1',
    type: 'refrigerated',
    temperature: '4°C',
    capacity: 800,
    currentUsage: 0,
    description: 'Walk-in cooler for vegetables'
  },
  {
    id: 'main-pantry',
    name: 'Main Pantry - Dry Storage',
    type: 'dry',
    temperature: 'ambient',
    capacity: 1000,
    currentUsage: 0,
    description: 'Dry goods and non-perishable storage'
  }
];

// Initialize locations
defaultLocations.forEach(location => {
  storageLocations.set(location.id, {
    ...location,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
});

// Sample inventory items
const sampleItems = [
  {
    id: 'item_001',
    name: 'Fresh Milk 2%',
    category: 'Dairy',
    quantity: 24,
    unit: 'L',
    location: 'cooler-b1',
    supplier: 'Local Dairy Co',
    supplierCode: 'MILK_2P_001',
    unitPrice: 4.99,
    totalValue: 119.76,
    minQuantity: 5,
    maxQuantity: 50,
    expiryDate: '2025-09-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'item_002',
    name: 'Ground Beef',
    category: 'Meat',
    quantity: 15,
    unit: 'kg',
    location: 'freezer-a2',
    supplier: 'Premium Meats',
    supplierCode: 'BEEF_GR_001',
    unitPrice: 12.99,
    totalValue: 194.85,
    minQuantity: 3,
    maxQuantity: 30,
    expiryDate: '2025-12-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Initialize with real data
initializeRealData();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

// Item validation rules
const itemValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required and must be less than 100 characters'),
  body('category').trim().isLength({ min: 1, max: 50 }).withMessage('Category is required'),
  body('quantity').isNumeric({ min: 0 }).withMessage('Quantity must be a positive number'),
  body('unit').trim().isLength({ min: 1, max: 20 }).withMessage('Unit is required'),
  body('location').trim().isLength({ min: 1 }).withMessage('Location is required'),
  body('unitPrice').optional().isNumeric({ min: 0 }).withMessage('Unit price must be a positive number'),
  body('minQuantity').optional().isNumeric({ min: 0 }).withMessage('Min quantity must be a positive number'),
  body('maxQuantity').optional().isNumeric({ min: 0 }).withMessage('Max quantity must be a positive number'),
  body('supplier').optional().trim().isLength({ max: 100 }).withMessage('Supplier name too long'),
  body('supplierCode').optional().trim().isLength({ max: 50 }).withMessage('Supplier code too long')
];

const transferValidation = [
  body('itemId').trim().isLength({ min: 1 }).withMessage('Item ID is required'),
  body('fromLocation').trim().isLength({ min: 1 }).withMessage('From location is required'),
  body('toLocation').trim().isLength({ min: 1 }).withMessage('To location is required'),
  body('quantity').isNumeric({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  body('reason').optional().trim().isLength({ max: 200 }).withMessage('Reason too long')
];

// GET /api/inventory/items - Get all inventory items
router.get('/items', requirePermission('inventory:read'), [
  query('category').optional().trim(),
  query('location').optional().trim(),
  query('lowStock').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], handleValidationErrors, (req, res) => {
  const startTime = Date.now();
  
  try {
    const { category, location, lowStock, page = 1, limit = 50 } = req.query;
    
    let filteredItems = [...inventory];
    
    // Apply filters
    if (category) {
      filteredItems = filteredItems.filter(item => 
        item.category.toLowerCase().includes(category.toLowerCase())
      );
    }
    
    if (location) {
      filteredItems = filteredItems.filter(item => item.location === location);
    }
    
    if (lowStock === 'true') {
      filteredItems = filteredItems.filter(item => 
        item.quantity <= (item.minQuantity || 0)
      );
    }
    
    // Pagination
    const offset = (page - 1) * limit;
    const paginatedItems = filteredItems.slice(offset, offset + parseInt(limit));
    
    // Add location details
    const enrichedItems = paginatedItems.map(item => ({
      ...item,
      locationDetails: storageLocations.get(item.location),
      stockStatus: getStockStatus(item),
      daysUntilExpiry: item.expiryDate ? getDaysUntilExpiry(item.expiryDate) : null
    }));
    
    const response = {
      items: enrichedItems,
      pagination: {
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit),
        totalItems: filteredItems.length,
        totalPages: Math.ceil(filteredItems.length / limit)
      },
      filters: {
        category,
        location,
        lowStock
      },
      summary: {
        totalValue: inventory.reduce((sum, item) => sum + (item.totalValue || 0), 0),
        totalItems: inventory.length,
        lowStockItems: inventory.filter(item => item.quantity <= (item.minQuantity || 0)).length,
        locations: Array.from(storageLocations.keys()).length
      }
    };
    
    performanceLog('inventory_list', Date.now() - startTime, {
      itemsReturned: enrichedItems.length,
      totalItems: inventory.length,
      filters: { category, location, lowStock }
    });
    
    res.json(response);
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve inventory items',
      code: 'INVENTORY_FETCH_ERROR'
    });
  }
});

// POST /api/inventory/items - Create new inventory item
router.post('/items', requirePermission('inventory:write'), itemValidation, handleValidationErrors, (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      name,
      category,
      quantity,
      unit,
      location,
      supplier,
      supplierCode,
      unitPrice = 0,
      minQuantity = 0,
      maxQuantity = 0,
      expiryDate,
      notes
    } = req.body;
    
    // Verify location exists
    if (!storageLocations.has(location)) {
      return res.status(400).json({
        error: 'Invalid storage location',
        code: 'INVALID_LOCATION'
      });
    }
    
    // Create new item
    const newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      category: category.trim(),
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      location,
      supplier: supplier ? supplier.trim() : null,
      supplierCode: supplierCode ? supplierCode.trim() : null,
      unitPrice: parseFloat(unitPrice),
      totalValue: parseFloat(quantity) * parseFloat(unitPrice),
      minQuantity: parseFloat(minQuantity),
      maxQuantity: parseFloat(maxQuantity),
      expiryDate: expiryDate || null,
      notes: notes ? notes.trim() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id,
      updatedBy: req.user.id
    };
    
    // Add to inventory
    inventory.push(newItem);
    
    // Update location usage
    const locationData = storageLocations.get(location);
    if (locationData) {
      locationData.currentUsage += parseFloat(quantity);
      locationData.updatedAt = new Date().toISOString();
    }
    
    // Audit log
    auditLog('inventory_item_created', {
      itemId: newItem.id,
      itemName: newItem.name,
      category: newItem.category,
      quantity: newItem.quantity,
      location: newItem.location,
      value: newItem.totalValue
    }, req);
    
    // Add location details to response
    const enrichedItem = {
      ...newItem,
      locationDetails: storageLocations.get(location),
      stockStatus: getStockStatus(newItem)
    };
    
    performanceLog('inventory_create', Date.now() - startTime, {
      itemId: newItem.id
    });
    
    res.status(201).json({
      message: 'Inventory item created successfully',
      item: enrichedItem,
      code: 'ITEM_CREATED'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create inventory item',
      code: 'ITEM_CREATE_ERROR'
    });
  }
});

// PUT /api/inventory/items/:id - Update inventory item
router.put('/items/:id', requirePermission('inventory:write'), [
  param('id').trim().isLength({ min: 1 }).withMessage('Item ID is required'),
  ...itemValidation
], handleValidationErrors, (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const itemIndex = inventory.findIndex(item => item.id === id);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        error: 'Inventory item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }
    
    const existingItem = inventory[itemIndex];
    const {
      name,
      category,
      quantity,
      unit,
      location,
      supplier,
      supplierCode,
      unitPrice,
      minQuantity,
      maxQuantity,
      expiryDate,
      notes
    } = req.body;
    
    // Verify location exists
    if (!storageLocations.has(location)) {
      return res.status(400).json({
        error: 'Invalid storage location',
        code: 'INVALID_LOCATION'
      });
    }
    
    // Update location usage if location changed
    if (existingItem.location !== location) {
      const oldLocationData = storageLocations.get(existingItem.location);
      const newLocationData = storageLocations.get(location);
      
      if (oldLocationData) {
        oldLocationData.currentUsage -= existingItem.quantity;
        oldLocationData.updatedAt = new Date().toISOString();
      }
      
      if (newLocationData) {
        newLocationData.currentUsage += parseFloat(quantity);
        newLocationData.updatedAt = new Date().toISOString();
      }
    }
    
    // Update item
    const updatedItem = {
      ...existingItem,
      name: name.trim(),
      category: category.trim(),
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      location,
      supplier: supplier ? supplier.trim() : null,
      supplierCode: supplierCode ? supplierCode.trim() : null,
      unitPrice: parseFloat(unitPrice || 0),
      totalValue: parseFloat(quantity) * parseFloat(unitPrice || 0),
      minQuantity: parseFloat(minQuantity || 0),
      maxQuantity: parseFloat(maxQuantity || 0),
      expiryDate: expiryDate || null,
      notes: notes ? notes.trim() : null,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    inventory[itemIndex] = updatedItem;
    
    // Record history
    inventoryHistory.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId: id,
      action: 'update',
      previousData: existingItem,
      newData: updatedItem,
      changedBy: req.user.id,
      changedAt: new Date().toISOString(),
      changes: getChanges(existingItem, updatedItem)
    });
    
    // Audit log
    auditLog('inventory_item_updated', {
      itemId: id,
      itemName: updatedItem.name,
      changes: getChanges(existingItem, updatedItem)
    }, req);
    
    // Add location details to response
    const enrichedItem = {
      ...updatedItem,
      locationDetails: storageLocations.get(location),
      stockStatus: getStockStatus(updatedItem)
    };
    
    performanceLog('inventory_update', Date.now() - startTime, {
      itemId: id
    });
    
    res.json({
      message: 'Inventory item updated successfully',
      item: enrichedItem,
      code: 'ITEM_UPDATED'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update inventory item',
      code: 'ITEM_UPDATE_ERROR'
    });
  }
});

// DELETE /api/inventory/items/:id - Delete inventory item
router.delete('/items/:id', requirePermission('inventory:delete'), [
  param('id').trim().isLength({ min: 1 }).withMessage('Item ID is required')
], handleValidationErrors, (req, res) => {
  try {
    const { id } = req.params;
    const itemIndex = inventory.findIndex(item => item.id === id);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        error: 'Inventory item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }
    
    const deletedItem = inventory[itemIndex];
    
    // Update location usage
    const locationData = storageLocations.get(deletedItem.location);
    if (locationData) {
      locationData.currentUsage -= deletedItem.quantity;
      locationData.updatedAt = new Date().toISOString();
    }
    
    // Remove from inventory
    inventory.splice(itemIndex, 1);
    
    // Record history
    inventoryHistory.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId: id,
      action: 'delete',
      deletedData: deletedItem,
      changedBy: req.user.id,
      changedAt: new Date().toISOString()
    });
    
    // Audit log
    auditLog('inventory_item_deleted', {
      itemId: id,
      itemName: deletedItem.name,
      category: deletedItem.category,
      quantity: deletedItem.quantity
    }, req);
    
    res.json({
      message: 'Inventory item deleted successfully',
      item: deletedItem,
      code: 'ITEM_DELETED'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete inventory item',
      code: 'ITEM_DELETE_ERROR'
    });
  }
});

// POST /api/inventory/transfer - Transfer items between locations
router.post('/transfer', requirePermission('inventory:write'), transferValidation, handleValidationErrors, (req, res) => {
  const startTime = Date.now();
  
  try {
    const { itemId, fromLocation, toLocation, quantity, reason } = req.body;
    
    // Find item
    const item = inventory.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({
        error: 'Inventory item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }
    
    // Verify locations exist
    if (!storageLocations.has(fromLocation) || !storageLocations.has(toLocation)) {
      return res.status(400).json({
        error: 'Invalid storage location',
        code: 'INVALID_LOCATION'
      });
    }
    
    // Check if item is in the from location
    if (item.location !== fromLocation) {
      return res.status(400).json({
        error: 'Item is not in the specified from location',
        code: 'ITEM_LOCATION_MISMATCH'
      });
    }
    
    // Check if sufficient quantity available
    if (item.quantity < parseFloat(quantity)) {
      return res.status(400).json({
        error: 'Insufficient quantity available',
        code: 'INSUFFICIENT_QUANTITY',
        available: item.quantity,
        requested: parseFloat(quantity)
      });
    }
    
    const transferQty = parseFloat(quantity);
    
    // Update item location if transferring all quantity
    if (item.quantity === transferQty) {
      item.location = toLocation;
    } else {
      // For partial transfers, we need to handle multiple locations
      // For now, keep item in original location and log the transfer
      // In a full implementation, you might split the item or track by location
    }
    
    // Update location usage
    const fromLocationData = storageLocations.get(fromLocation);
    const toLocationData = storageLocations.get(toLocation);
    
    if (fromLocationData) {
      fromLocationData.currentUsage -= transferQty;
      fromLocationData.updatedAt = new Date().toISOString();
    }
    
    if (toLocationData) {
      toLocationData.currentUsage += transferQty;
      toLocationData.updatedAt = new Date().toISOString();
    }
    
    // Update item
    item.updatedAt = new Date().toISOString();
    item.updatedBy = req.user.id;
    
    // Record transfer history
    const transferRecord = {
      id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId,
      itemName: item.name,
      fromLocation,
      toLocation,
      quantity: transferQty,
      reason: reason || 'Manual transfer',
      transferredBy: req.user.id,
      transferredAt: new Date().toISOString()
    };
    
    inventoryHistory.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId,
      action: 'transfer',
      transferData: transferRecord,
      changedBy: req.user.id,
      changedAt: new Date().toISOString()
    });
    
    // Audit log
    auditLog('inventory_transfer', transferRecord, req);
    
    performanceLog('inventory_transfer', Date.now() - startTime, {
      itemId,
      quantity: transferQty
    });
    
    res.json({
      message: 'Inventory transfer completed successfully',
      transfer: transferRecord,
      updatedItem: {
        ...item,
        locationDetails: storageLocations.get(item.location),
        stockStatus: getStockStatus(item)
      },
      code: 'TRANSFER_SUCCESS'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to transfer inventory',
      code: 'TRANSFER_ERROR'
    });
  }
});

// GET /api/inventory/locations - Get storage locations
router.get('/locations', requirePermission('inventory:read'), (req, res) => {
  try {
    const locations = Array.from(storageLocations.values()).map(location => ({
      ...location,
      utilizationPercent: location.capacity > 0 ? 
        Math.round((location.currentUsage / location.capacity) * 100) : 0,
      isNearCapacity: location.capacity > 0 ? 
        (location.currentUsage / location.capacity) > 0.8 : false
    }));
    
    res.json({
      locations,
      summary: {
        totalLocations: locations.length,
        totalCapacity: locations.reduce((sum, loc) => sum + loc.capacity, 0),
        totalUsage: locations.reduce((sum, loc) => sum + loc.currentUsage, 0),
        nearCapacityCount: locations.filter(loc => loc.isNearCapacity).length
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve storage locations',
      code: 'LOCATIONS_FETCH_ERROR'
    });
  }
});

// GET /api/inventory/reports - Get inventory reports
router.get('/reports', requirePermission('reports:read'), [
  query('type').optional().isIn(['summary', 'low-stock', 'expiring', 'value']),
  query('days').optional().isInt({ min: 1, max: 365 })
], handleValidationErrors, (req, res) => {
  try {
    const { type = 'summary', days = 30 } = req.query;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let report = {};
    
    switch (type) {
      case 'summary':
        report = generateSummaryReport();
        break;
      case 'low-stock':
        report = generateLowStockReport();
        break;
      case 'expiring':
        report = generateExpiringItemsReport(days);
        break;
      case 'value':
        report = generateValueReport();
        break;
      default:
        report = generateSummaryReport();
    }
    
    res.json({
      reportType: type,
      generatedAt: new Date().toISOString(),
      period: `Last ${days} days`,
      ...report
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate report',
      code: 'REPORT_ERROR'
    });
  }
});

// Helper functions
function getStockStatus(item) {
  if (item.quantity === 0) return 'out_of_stock';
  if (item.quantity <= item.minQuantity) return 'low_stock';
  if (item.quantity >= item.maxQuantity) return 'overstock';
  return 'normal';
}

function getDaysUntilExpiry(expiryDate) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getChanges(oldItem, newItem) {
  const changes = [];
  const keys = Object.keys(newItem);
  
  keys.forEach(key => {
    if (oldItem[key] !== newItem[key]) {
      changes.push({
        field: key,
        oldValue: oldItem[key],
        newValue: newItem[key]
      });
    }
  });
  
  return changes;
}

function generateSummaryReport() {
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((sum, item) => sum + (item.totalValue || 0), 0);
  const lowStockItems = inventory.filter(item => item.quantity <= (item.minQuantity || 0)).length;
  const outOfStockItems = inventory.filter(item => item.quantity === 0).length;
  
  const categoryBreakdown = inventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = { count: 0, value: 0 };
    }
    acc[item.category].count++;
    acc[item.category].value += item.totalValue || 0;
    return acc;
  }, {});
  
  return {
    totalItems,
    totalValue,
    lowStockItems,
    outOfStockItems,
    categoryBreakdown
  };
}

function generateLowStockReport() {
  const lowStockItems = inventory.filter(item => 
    item.quantity <= (item.minQuantity || 0)
  );
  
  return {
    lowStockItems: lowStockItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      currentQuantity: item.quantity,
      minQuantity: item.minQuantity,
      shortage: (item.minQuantity || 0) - item.quantity,
      location: item.location
    })),
    totalLowStockItems: lowStockItems.length
  };
}

function generateExpiringItemsReport(days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);
  
  const expiringItems = inventory.filter(item => {
    if (!item.expiryDate) return false;
    return new Date(item.expiryDate) <= cutoffDate;
  });
  
  return {
    expiringItems: expiringItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      expiryDate: item.expiryDate,
      daysUntilExpiry: getDaysUntilExpiry(item.expiryDate),
      value: item.totalValue,
      location: item.location
    })),
    totalExpiringItems: expiringItems.length,
    totalValueAtRisk: expiringItems.reduce((sum, item) => sum + (item.totalValue || 0), 0)
  };
}

function generateValueReport() {
  const totalValue = inventory.reduce((sum, item) => sum + (item.totalValue || 0), 0);
  
  const locationValues = {};
  inventory.forEach(item => {
    if (!locationValues[item.location]) {
      locationValues[item.location] = 0;
    }
    locationValues[item.location] += item.totalValue || 0;
  });
  
  return {
    totalInventoryValue: totalValue,
    valueByLocation: locationValues,
    highValueItems: inventory
      .filter(item => (item.totalValue || 0) > 100)
      .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))
      .slice(0, 10)
      .map(item => ({
        id: item.id,
        name: item.name,
        value: item.totalValue,
        location: item.location
      }))
  };
}

// Initialize real data when module is loaded
if (inventory.length === 0) {
  initializeRealData();
}

// 🔐 Enterprise Encrypted Backup Endpoint
router.post('/backup/encrypted', 
  requirePermission('admin:backup'), 
  async (req, res) => {
    try {
      const startTime = Date.now();
      const fileIO = getFileIO();
      const encryption = getEncryption();
      
      // Prepare comprehensive backup data
      const backupData = {
        timestamp: new Date().toISOString(),
        system: 'enterprise-inventory',
        version: '1.0',
        items: inventory,
        locations: Array.from(storageLocations.entries()),
        history: inventoryHistory.slice(-100), // Last 100 entries
        statistics: {
          totalItems: inventory.length,
          totalLocations: storageLocations.size,
          lastUpdate: new Date().toISOString()
        }
      };
      
      // Create encrypted backup
      const backupPath = await fileIO.createBackup('enterprise-inventory', backupData);
      
      // Generate encryption fingerprint for verification
      const keyFingerprint = process.env.DATA_ENCRYPTION_KEY ? 
        process.env.DATA_ENCRYPTION_KEY.slice(0, 8) + '...' + process.env.DATA_ENCRYPTION_KEY.slice(-8) :
        'default-key';
      
      const responseData = {
        success: true,
        message: '🔐 Enterprise encrypted backup created successfully',
        backup: {
          path: backupPath,
          timestamp: new Date().toISOString(),
          encryption: 'AES-256-GCM',
          keyFingerprint: keyFingerprint,
          dataSize: JSON.stringify(backupData).length,
          itemCount: inventory.length,
          locationCount: storageLocations.size
        },
        performance: {
          processingTime: Date.now() - startTime,
          compressionRatio: 'N/A' // Could add compression
        }
      };
      
      // Audit log
      auditLog.info('Enterprise encrypted backup created', {
        userId: req.user?.id,
        backupPath: backupPath,
        itemCount: inventory.length,
        encryption: 'AES-256-GCM'
      });
      
      res.json(responseData);
      
    } catch (error) {
      console.error('❌ Enterprise backup failed:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to create encrypted backup',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

module.exports = router;