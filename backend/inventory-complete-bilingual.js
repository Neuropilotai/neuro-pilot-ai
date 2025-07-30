#!/usr/bin/env node

/**
 * ████████████████████████████████████████████████████████████████████████████████
 * ██                                                                            ██
 * ██    🏕️ COMPLETE BILINGUAL INVENTORY SYSTEM WITH ALL DATA                   ██
 * ██    The FULL system from yesterday - Sysco catalog, GFS orders, locations  ██
 * ██                                                                            ██
 * ██    COPYRIGHT © 2025 DAVID MIKULIS - ALL RIGHTS RESERVED                   ██
 * ██    PROPRIETARY SOFTWARE - UNAUTHORIZED USE PROHIBITED                     ██
 * ██                                                                            ██
 * ████████████████████████████████████████████████████████████████████████████████
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 8083;

// Security Configuration
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️ WARNING: Using default JWT secret. Set JWT_SECRET environment variable for production!');
  return 'camp-inventory-secret-2025-david-mikulis-' + Date.now();
})();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  }
}));

// Rate Limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

// Input validation and sanitization
const validator = require('validator');

// Enhanced rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', generalLimiter);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8083'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }
}));

// File upload configuration
const upload = multer({ 
  dest: path.join(__dirname, 'data', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Input validation functions
function sanitizeString(str, maxLength = 255) {
  if (!str || typeof str !== 'string') return '';
  return validator.escape(str.trim()).substring(0, maxLength);
}

function validateOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return false;
  return /^GFS_\d{8}_\d{6}_[A-Z0-9]{6}$/.test(orderId);
}

function validateProductCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[A-Z0-9]{1,20}$/.test(code.toUpperCase());
}

function validateLocation(location) {
  const validLocations = ['Freezer A1', 'Freezer A2', 'Freezer A3', 'Cooler B1', 'Cooler B2', 'Cooler B3', 'Dry Storage C1', 'Dry Storage C2', 'Dry Storage C3', 'Dry Storage C4', 'Walk-in D1'];
  return validLocations.includes(location);
}

// Load stored data
let syscoCatalog = [];
let gfsOrders = [];
let historicalInventory = [];

async function loadStoredData() {
  try {
    // Load Sysco catalog
    const catalogPath = path.join(__dirname, 'data', 'catalog', 'sysco_catalog_1753182965099.json');
    const catalogData = await fs.readFile(catalogPath, 'utf8');
    const catalogJson = JSON.parse(catalogData);
    syscoCatalog = catalogJson.items || [];
    console.log(`✅ Loaded Sysco catalog: ${syscoCatalog.length} items`);

    // Load GFS orders
    const gfsOrdersPath = path.join(__dirname, 'data', 'gfs_orders');
    const gfsFiles = await fs.readdir(gfsOrdersPath);
    for (const file of gfsFiles) {
      if (file.startsWith('gfs_order_') && !file.includes('deleted') && file.endsWith('.json')) {
        try {
          const orderData = await fs.readFile(path.join(gfsOrdersPath, file), 'utf8');
          const order = JSON.parse(orderData);
          gfsOrders.push(order);
        } catch (error) {
          console.log(`⚠️ Skipped corrupted file: ${file}`);
        }
      }
    }
    console.log(`✅ Loaded GFS orders: ${gfsOrders.length} orders`);

    // Load historical inventory
    const inventoryPath = path.join(__dirname, 'storage', 'inventory', 'full_inventory', '2025', 'full_inventory_2025-07-22.csv');
    const inventoryData = await fs.readFile(inventoryPath, 'utf8');
    // Parse CSV data here if needed
    console.log(`✅ Loaded historical inventory data`);

  } catch (error) {
    console.log('⚠️  Some data files not found, using defaults');
  }
}

// Initialize with stored data
loadStoredData();

// Bilingual translations
const translations = {
  english: {
    title: 'AI Inventory Management System',
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    orders: 'Orders',
    suppliers: 'Suppliers',
    catalog: 'Product Catalog',
    totalItems: 'Total Items',
    criticalItems: 'Critical Items',
    totalValue: 'Total Value',
    newOrder: 'New Order',
    viewCatalog: 'View Catalog',
    storage: 'Storage Location',
    quantity: 'Quantity',
    supplier: 'Supplier',
    lastOrder: 'Last Order',
    reorderNow: 'Reorder Now',
    monitor: 'Monitor',
    search: 'Search products...',
    syscoCatalog: 'Sysco Catalog',
    gfsOrders: 'GFS Orders',
    historicalData: 'Historical Data',
    lowStock: 'Low Stock',
    outOfStock: 'Out of Stock',
    normal: 'Normal',
    high: 'High Stock'
  },
  french: {
    title: 'Système de Gestion d\'Inventaire IA',
    dashboard: 'Tableau de Bord',
    inventory: 'Inventaire',
    orders: 'Commandes',
    suppliers: 'Fournisseurs',
    catalog: 'Catalogue de Produits',
    totalItems: 'Articles Totaux',
    criticalItems: 'Articles Critiques',
    totalValue: 'Valeur Totale',
    newOrder: 'Nouvelle Commande',
    viewCatalog: 'Voir le Catalogue',
    storage: 'Emplacement de Stockage',
    quantity: 'Quantité',
    supplier: 'Fournisseur',
    lastOrder: 'Dernière Commande',
    reorderNow: 'Commander Maintenant',
    monitor: 'Surveiller',
    search: 'Rechercher des produits...',
    syscoCatalog: 'Catalogue Sysco',
    gfsOrders: 'Commandes GFS',
    historicalData: 'Données Historiques',
    lowStock: 'Stock Faible',
    outOfStock: 'Rupture de Stock',
    normal: 'Normal',
    high: 'Stock Élevé'
  }
};

// Auto-assign storage location based on category
function assignStorageLocation(category) {
  const cat = category?.toLowerCase() || '';
  
  if (cat.includes('frozen') || cat.includes('ice cream') || cat.includes('frozen food')) {
    return 'Freezer A1';
  }
  if (cat.includes('meat') || cat.includes('poultry') || cat.includes('beef') || cat.includes('chicken') || cat.includes('pork')) {
    return 'Freezer A2';
  }
  if (cat.includes('dairy') || cat.includes('milk') || cat.includes('cheese') || cat.includes('eggs')) {
    return 'Cooler B1';
  }
  if (cat.includes('produce') || cat.includes('vegetable') || cat.includes('fruit') || cat.includes('fresh')) {
    return 'Cooler B2';
  }
  if (cat.includes('beverage') || cat.includes('drink') || cat.includes('juice')) {
    return 'Cooler B3';
  }
  if (cat.includes('bakery') || cat.includes('bread') || cat.includes('pastry')) {
    return 'Dry Storage C1';
  }
  if (cat.includes('dry goods') || cat.includes('rice') || cat.includes('flour') || cat.includes('grain')) {
    return 'Dry Storage C2';
  }
  if (cat.includes('canned') || cat.includes('sauce') || cat.includes('condiment')) {
    return 'Dry Storage C3';
  }
  if (cat.includes('cleaning') || cat.includes('paper') || cat.includes('supplies')) {
    return 'Dry Storage C4';
  }
  
  // Default location for unclassified items
  return 'Walk-in D1';
}

// Generate comprehensive inventory from GFS orders and base inventory
function generateFullInventory() {
  // Start with empty inventory - no demo data, only real orders
  let tempInventory = [];
  
  // First, collect all items from all orders
  gfsOrders.forEach(order => {
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        tempInventory.push({
          productName: item.productName || `Product ${item.productCode}`,
          productCode: item.productCode || '',
          quantity: item.quantity || 1,
          category: item.category || 'General',
          unit: item.unit || 'Each',
          supplier: item.supplier || 'GFS',
          unitPrice: item.unitPrice || 0,
          packSize: item.packSize || '',
          brand: item.brand || '',
          totalPrice: item.totalPrice || 0,
          orderDate: order.orderDate,
          orderId: order.orderId
        });
      });
    }
  });

  // Now consolidate duplicate items by product name and code
  const consolidatedItems = {};
  
  tempInventory.forEach(item => {
    // Create a unique key based on product name and code
    const key = `${item.productName}_${item.productCode}`.toLowerCase();
    
    if (consolidatedItems[key]) {
      // Item already exists, add quantities and values
      consolidatedItems[key].quantity += item.quantity;
      consolidatedItems[key].totalValue += item.totalPrice;
      consolidatedItems[key].orderIds.push(item.orderId);
      // Keep the most recent order date
      if (item.orderDate > consolidatedItems[key].lastOrderDate) {
        consolidatedItems[key].lastOrderDate = item.orderDate;
      }
    } else {
      // New item
      consolidatedItems[key] = {
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        category: item.category,
        unit: item.unit,
        supplier: item.supplier,
        unitPrice: item.unitPrice,
        packSize: item.packSize,
        brand: item.brand,
        totalValue: item.totalPrice,
        lastOrderDate: item.orderDate,
        orderIds: [item.orderId]
      };
    }
  });

  // Convert consolidated items to final inventory format
  let fullInventory = [];
  let nextId = 1;
  
  Object.values(consolidatedItems).forEach(item => {
    const inventoryItem = {
      id: nextId++,
      name: { 
        en: item.productName,
        fr: item.productName
      },
      quantity: item.quantity,
      minQuantity: Math.max(1, Math.floor(item.quantity * 0.3)),
      maxQuantity: item.quantity * 3,
      category: item.category,
      unit: item.unit,
      supplier: item.supplier,
      unitPrice: item.unitPrice,
      location: assignStorageLocation(item.category),
      supplierCode: item.productCode,
      lastOrderDate: item.lastOrderDate,
      packSize: item.packSize,
      brand: item.brand,
      totalValue: item.totalValue,
      gfsOrderIds: item.orderIds, // Array of all order IDs containing this item
      orderCount: item.orderIds.length, // How many orders this item appears in
      isFromGFS: true,
      isConsolidated: true
    };
    fullInventory.push(inventoryItem);
  });

  console.log(`✅ Consolidated ${tempInventory.length} individual items into ${fullInventory.length} unique products`);
  return fullInventory;
}

// Complete inventory data with all suppliers and storage locations  
let inventory = [];

// Suppliers with complete information
const suppliers = {
  'Sysco': {
    name: 'Sysco Corporation',
    contact: '1-800-SYSCO01',
    email: 'orders@sysco.com',
    website: 'www.sysco.com',
    minimumOrder: 150,
    deliveryDays: ['Monday', 'Wednesday', 'Friday'],
    paymentTerms: 'Net 30',
    catalogItems: 2932,
    accountNumber: 'CAMP-2025-SYS'
  },
  'GFS': {
    name: 'Gordon Food Service',
    contact: '1-800-968-4164',
    email: 'customerservice@gfs.com',
    website: 'www.gfs.com',
    minimumOrder: 100,
    deliveryDays: ['Tuesday', 'Thursday', 'Saturday'],
    paymentTerms: 'Net 30',
    catalogItems: 1847,
    accountNumber: 'CAMP-2025-GFS'
  },
  'US Foods': {
    name: 'US Foods',
    contact: '1-800-388-8638',
    email: 'orders@usfoods.com',
    website: 'www.usfoods.com',
    minimumOrder: 125,
    deliveryDays: ['Monday', 'Tuesday', 'Thursday'],
    paymentTerms: 'Net 30',
    catalogItems: 1205,
    accountNumber: 'CAMP-2025-USF'
  }
};

// Storage locations
const storageLocations = {
  'Freezer A1': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 450 },
  'Freezer A2': { type: 'Freezer', temp: '-10°F', capacity: 1000, currentUsage: 380 },
  'Freezer A3': { type: 'Freezer', temp: '-10°F', capacity: 800, currentUsage: 290 },
  'Freezer B1': { type: 'Freezer', temp: '0°F', capacity: 600, currentUsage: 185 },
  'Cooler B1': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 420 },
  'Cooler B2': { type: 'Cooler', temp: '38°F', capacity: 800, currentUsage: 510 },
  'Cooler B3': { type: 'Cooler', temp: '40°F', capacity: 600, currentUsage: 280 },
  'Dry Storage C1': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 650 },
  'Dry Storage C2': { type: 'Dry Storage', temp: 'Room', capacity: 1200, currentUsage: 780 },
  'Dry Storage C3': { type: 'Dry Storage', temp: 'Room', capacity: 1000, currentUsage: 420 },
  'Dry Storage C4': { type: 'Dry Storage', temp: 'Room', capacity: 800, currentUsage: 340 }
};

// Orders history
let orders = [];
let orderCounter = 1;

// Authentication
const users = [
  {
    id: 1,
    email: 'david.mikulis@camp-inventory.com',
    passwordHash: '$2b$12$HusVjvsITJMi6GrsElNcKem5qk7BqJQ/1oa1aQ.jbWkq1DtrdKD12',
    role: 'admin',
    name: 'David Mikulis'
  }
];

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// API Routes

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Remove plaintext password check - only use hashed passwords
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        name: user.name 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get inventory items
app.get('/api/inventory/items', (req, res) => {
  const lang = req.query.lang || 'english';
  
  const itemsWithInsights = inventory.map(item => {
    const stockLevel = (item.quantity / item.maxQuantity) * 100;
    const daysUntilEmpty = Math.floor(item.quantity / 5);
    
    let status = 'normal';
    if (item.quantity === 0) status = 'outOfStock';
    else if (item.quantity <= item.minQuantity) status = 'lowStock';
    else if (item.quantity >= item.maxQuantity * 0.9) status = 'high';
    
    // Ensure locations array exists for backward compatibility
    if (!item.locations && item.location) {
      item.locations = [item.location];
    } else if (!item.locations) {
      item.locations = [];
    }
    
    return {
      ...item,
      displayName: item.name[lang === 'french' ? 'fr' : 'en'],
      status,
      stockLevel: stockLevel.toFixed(1),
      storageInfo: storageLocations[item.location],
      locations: item.locations, // Multiple locations support
      aiInsights: {
        trend: stockLevel > 60 ? 'Stable' : stockLevel > 30 ? 'Declining' : 'Critical',
        daysUntilEmpty,
        recommendedAction: item.quantity <= item.minQuantity ? 
          (lang === 'french' ? 'Commander Maintenant' : 'Reorder Now') : 
          (lang === 'french' ? 'Surveiller' : 'Monitor'),
        confidence: 0.92
      }
    };
  });
  
  const totalValue = inventory.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const criticalItems = inventory.filter(item => item.quantity <= item.minQuantity).length;
  const outOfStock = inventory.filter(item => item.quantity === 0).length;
  
  res.json({
    success: true,
    items: itemsWithInsights,
    summary: {
      totalItems: inventory.length,
      totalValue: totalValue.toFixed(2),
      criticalItems,
      outOfStock,
      language: lang,
      lastUpdate: new Date().toISOString()
    }
  });
});

// Get Sysco catalog
app.get('/api/catalog/sysco', (req, res) => {
  const search = req.query.search?.toLowerCase() || '';
  const category = req.query.category || '';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  
  let filteredItems = syscoCatalog;
  
  if (search) {
    filteredItems = filteredItems.filter(item => 
      item.productName.toLowerCase().includes(search) ||
      item.productCode.toLowerCase().includes(search)
    );
  }
  
  if (category) {
    filteredItems = filteredItems.filter(item => item.category === category);
  }
  
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    items: paginatedItems,
    totalItems: filteredItems.length,
    totalPages: Math.ceil(filteredItems.length / limit),
    currentPage: page,
    itemsPerPage: limit
  });
});

// Get GFS orders history
app.get('/api/orders/gfs', (req, res) => {
  // Filter out deleted orders and remove duplicates by orderId
  const uniqueOrders = [];
  const seenIds = new Set();
  
  for (const order of gfsOrders) {
    // Skip deleted orders
    if (order.deletedBy || order.deletedDate) {
      continue;
    }
    
    if (!seenIds.has(order.orderId)) {
      uniqueOrders.push(order);
      seenIds.add(order.orderId);
    }
  }
  
  res.json({
    success: true,
    orders: uniqueOrders,
    totalOrders: uniqueOrders.length,
    totalValue: uniqueOrders.reduce((sum, order) => sum + (order.totalValue || 0), 0)
  });
});

// Search items by stock number (Sysco or GFS)
app.get('/api/catalog/search/:stockNumber', (req, res) => {
  try {
    const { stockNumber } = req.params;
    const searchTerm = stockNumber.toLowerCase().trim();
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Stock number is required'
      });
    }
    
    let foundItems = [];
    
    // Search in Sysco catalog
    const syscoMatches = syscoCatalog.filter(item => {
      const productCode = (item.productCode || '').toLowerCase();
      const supplierCode = (item.supplierCode || '').toLowerCase();
      const upc = (item.upc || '').toLowerCase();
      
      return productCode.includes(searchTerm) || 
             supplierCode.includes(searchTerm) || 
             upc.includes(searchTerm) ||
             productCode === searchTerm ||
             supplierCode === searchTerm ||
             upc === searchTerm;
    });
    
    // Add Sysco items to results
    foundItems = foundItems.concat(syscoMatches.map(item => ({
      ...item,
      source: 'sysco',
      displayName: item.productDescription || item.productName || 'Unknown Item',
      stockNumber: item.productCode || item.supplierCode,
      category: item.category || 'Uncategorized'
    })));
    
    // Search in GFS orders for items with matching codes
    const gfsMatches = [];
    gfsOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const itemCode = (item.itemCode || '').toLowerCase();
          const productCode = (item.productCode || '').toLowerCase();
          const upc = (item.upc || '').toLowerCase();
          
          if ((itemCode.includes(searchTerm) || productCode.includes(searchTerm) || upc.includes(searchTerm) ||
               itemCode === searchTerm || productCode === searchTerm || upc === searchTerm) &&
              !gfsMatches.find(existing => existing.itemCode === item.itemCode)) {
            gfsMatches.push({
              ...item,
              source: 'gfs',
              displayName: item.itemDescription || item.productName || 'Unknown Item',
              stockNumber: item.itemCode || item.productCode,
              category: item.category || 'Uncategorized',
              orderId: order.orderId
            });
          }
        });
      }
    });
    
    foundItems = foundItems.concat(gfsMatches);
    
    // Remove duplicates based on stock number and name
    const uniqueItems = [];
    const seen = new Set();
    
    foundItems.forEach(item => {
      const key = `${item.source}-${item.stockNumber}-${item.displayName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    });
    
    res.json({
      success: true,
      items: uniqueItems,
      totalFound: uniqueItems.length,
      searchTerm: stockNumber
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to search catalog',
      details: error.message
    });
  }
});

// Add item to inventory by stock number
app.post('/api/inventory/add-by-stock', authenticateToken, (req, res) => {
  try {
    const { stockNumber, quantity = 1, location = 'Main Storage' } = req.body;
    
    if (!stockNumber) {
      return res.status(400).json({
        success: false,
        error: 'Stock number is required'
      });
    }
    
    // Search for the item first
    const searchTerm = stockNumber.toLowerCase().trim();
    let foundItem = null;
    
    // Search Sysco catalog
    foundItem = syscoCatalog.find(item => {
      const productCode = (item.productCode || '').toLowerCase();
      const supplierCode = (item.supplierCode || '').toLowerCase();
      const upc = (item.upc || '').toLowerCase();
      
      return productCode === searchTerm || supplierCode === searchTerm || upc === searchTerm;
    });
    
    if (foundItem) {
      foundItem.source = 'sysco';
    } else {
      // Search GFS orders
      gfsOrders.forEach(order => {
        if (order.items && Array.isArray(order.items) && !foundItem) {
          foundItem = order.items.find(item => {
            const itemCode = (item.itemCode || '').toLowerCase();
            const productCode = (item.productCode || '').toLowerCase();
            const upc = (item.upc || '').toLowerCase();
            
            return itemCode === searchTerm || productCode === searchTerm || upc === searchTerm;
          });
          
          if (foundItem) {
            foundItem.source = 'gfs';
            foundItem.orderId = order.orderId;
          }
        }
      });
    }
    
    if (!foundItem) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in catalog'
      });
    }
    
    // Create new inventory item
    const newItem = {
      id: Date.now() + Math.random(),
      name: {
        en: foundItem.productDescription || foundItem.itemDescription || foundItem.productName || 'Unknown Item',
        fr: foundItem.productDescription || foundItem.itemDescription || foundItem.productName || 'Article Inconnu'
      },
      category: foundItem.category || 'Uncategorized',
      quantity: parseInt(quantity),
      unit: foundItem.unit || foundItem.uom || 'each',
      location: location,
      locations: [location],
      supplier: foundItem.source === 'sysco' ? 'Sysco' : 'GFS',
      supplierCode: foundItem.productCode || foundItem.itemCode || stockNumber,
      unitPrice: parseFloat(foundItem.unitPrice || foundItem.price || 0),
      totalValue: parseInt(quantity) * parseFloat(foundItem.unitPrice || foundItem.price || 0),
      minQuantity: Math.max(1, Math.floor(parseInt(quantity) * 0.2)),
      maxQuantity: parseInt(quantity) * 3,
      lastOrderDate: new Date().toISOString().split('T')[0],
      addedBy: 'stock-search',
      addedDate: new Date().toISOString(),
      isFromGFS: foundItem.source === 'gfs',
      gfsOrderId: foundItem.orderId
    };
    
    // Add to inventory
    inventory.push(newItem);
    
    res.json({
      success: true,
      message: 'Item added to inventory successfully',
      item: newItem
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to add item to inventory',
      details: error.message
    });
  }
});

// Delete GFS order
app.delete('/api/orders/gfs/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Validate order ID format to prevent path traversal
    if (!validateOrderId(orderId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid order ID format' 
      });
    }
    
    // Find the order in memory
    const orderIndex = gfsOrders.findIndex(order => order.orderId === orderId);
    if (orderIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }
    
    const order = gfsOrders[orderIndex];
    
    // Find the file path with safe filename construction
    const gfsOrdersPath = path.join(__dirname, 'data', 'gfs_orders');
    let filePath = null;
    
    // Check both active and deleted file patterns - sanitized filenames
    const possibleFiles = [
      `gfs_order_${orderId}.json`,
      `deleted_gfs_order_${orderId}.json`
    ];
    
    for (const fileName of possibleFiles) {
      // Double-check filename safety
      if (!fileName.includes('..') && fileName.match(/^[a-zA-Z0-9_.-]+$/)) {
        const testPath = path.join(gfsOrdersPath, fileName);
        try {
          await fs.access(testPath);
          filePath = testPath;
          break;
        } catch (e) {
          // File doesn't exist, continue
        }
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order file not found' 
      });
    }
    
    // Delete the file
    await fs.unlink(filePath);
    
    // Remove from memory
    gfsOrders.splice(orderIndex, 1);
    
    // Regenerate inventory without this order
    inventory = generateFullInventory();
    
    console.log(`🗑️ Deleted order: ${orderId} (${order.totalItems} items, $${order.totalValue})`);
    
    res.json({
      success: true,
      message: `Order ${orderId} deleted successfully`,
      deletedOrder: {
        orderId: order.orderId,
        totalItems: order.totalItems,
        totalValue: order.totalValue,
        orderDate: order.orderDate
      },
      newTotals: {
        totalOrders: gfsOrders.length,
        totalInventoryItems: inventory.length
      }
    });
    
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete order' 
    });
  }
});

// Auto-clean invalid orders
app.post('/api/orders/clean-invalid', authenticateToken, async (req, res) => {
  try {
    let deletedCount = 0;
    let itemsRemoved = 0;
    const gfsOrdersPath = path.join(__dirname, 'data', 'gfs_orders');
    
    // Create backup directory
    const backupPath = path.join(__dirname, 'data', 'gfs_orders_auto_cleaned_backup');
    await fs.mkdir(backupPath, { recursive: true });
    
    const ordersToDelete = [];
    
    // Identify invalid orders
    for (const order of gfsOrders) {
      let isInvalid = false;
      
      // Check for unrealistic total values
      if (order.totalValue > 100000 || order.totalValue < 0) {
        isInvalid = true;
      }
      
      // Check for orders with no items or corrupted items
      if (!order.items || order.items.length === 0 || order.totalItems === 0) {
        isInvalid = true;
      }
      
      // Check for orders with mostly invalid product codes
      if (order.items && order.items.length > 0) {
        const validItems = order.items.filter(item => 
          item.productCode && item.productCode.length >= 6 && 
          item.productName && item.productName.length > 3 &&
          !item.productName.toLowerCase().includes('tvq') &&
          !item.productName.toLowerCase().includes('tps') &&
          !item.productName.toLowerCase().includes('fax')
        );
        
        if (validItems.length < order.items.length * 0.5) {
          isInvalid = true;
        }
      }
      
      if (isInvalid) {
        ordersToDelete.push(order);
        itemsRemoved += order.totalItems || 0;
      }
    }
    
    // Delete invalid orders
    for (const order of ordersToDelete) {
      const possibleFiles = [
        `gfs_order_${order.orderId}.json`,
        `deleted_gfs_order_${order.orderId}.json`
      ];
      
      for (const fileName of possibleFiles) {
        if (fileName.match(/^[a-zA-Z0-9_.-]+$/)) {
          const filePath = path.join(gfsOrdersPath, fileName);
          const backupFilePath = path.join(backupPath, fileName);
          
          try {
            await fs.access(filePath);
            // Move to backup instead of deleting
            await fs.copyFile(filePath, backupFilePath);
            await fs.unlink(filePath);
            deletedCount++;
            break;
          } catch (e) {
            // File doesn't exist, continue
          }
        }
      }
      
      // Remove from memory
      const index = gfsOrders.findIndex(o => o.orderId === order.orderId);
      if (index !== -1) {
        gfsOrders.splice(index, 1);
      }
    }
    
    // Regenerate inventory without invalid orders
    inventory = generateFullInventory();
    
    console.log(`🧹 Auto-cleaned ${deletedCount} invalid orders, removed ${itemsRemoved} items`);
    
    res.json({
      success: true,
      deletedCount: deletedCount,
      remainingCount: gfsOrders.length,
      itemsRemoved: itemsRemoved,
      newInventoryCount: inventory.length
    });
    
  } catch (error) {
    console.error('Error cleaning invalid orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean invalid orders'
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

// Create new storage location
app.post('/api/storage/locations', authenticateToken, (req, res) => {
  const { name, type, temp, capacity } = req.body;
  
  if (!name || !type || !temp || !capacity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (storageLocations[name]) {
    return res.status(400).json({ error: 'Storage location already exists' });
  }
  
  storageLocations[name] = {
    type,
    temp,
    capacity: parseInt(capacity),
    currentUsage: 0
  };
  
  res.json({
    success: true,
    message: 'Storage location created successfully',
    location: { name, ...storageLocations[name] }
  });
});

// Update storage location
app.put('/api/storage/locations/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  const { type, temp, capacity } = req.body;
  
  if (!storageLocations[name]) {
    return res.status(404).json({ error: 'Storage location not found' });
  }
  
  if (type) storageLocations[name].type = type;
  if (temp) storageLocations[name].temp = temp;
  if (capacity) storageLocations[name].capacity = parseInt(capacity);
  
  res.json({
    success: true,
    message: 'Storage location updated successfully',
    location: { name, ...storageLocations[name] }
  });
});

// Rename storage location
app.put('/api/storage/locations/:name/rename', authenticateToken, (req, res) => {
  const { name: oldName } = req.params;
  const { newName } = req.body;
  
  if (!storageLocations[oldName]) {
    return res.status(404).json({ error: 'Storage location not found' });
  }
  
  if (!newName || newName.trim() === '') {
    return res.status(400).json({ error: 'New name is required' });
  }
  
  if (storageLocations[newName]) {
    return res.status(400).json({ error: 'A location with that name already exists' });
  }
  
  // Move the location data to the new name
  storageLocations[newName] = { ...storageLocations[oldName] };
  delete storageLocations[oldName];
  
  // Update all inventory items that use this location
  let updatedCount = 0;
  inventory.forEach(item => {
    if (item.location === oldName) {
      item.location = newName;
      updatedCount++;
    }
  });
  
  res.json({
    success: true,
    message: 'Storage location renamed successfully',
    oldName,
    newName,
    updatedItems: updatedCount
  });
});

// Delete storage location
app.delete('/api/storage/locations/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  
  if (!storageLocations[name]) {
    return res.status(404).json({ error: 'Storage location not found' });
  }
  
  // Check if any inventory items are using this location
  const itemsUsingLocation = inventory.filter(item => item.location === name);
  if (itemsUsingLocation.length > 0) {
    return res.status(400).json({ 
      error: 'Cannot delete location - items are currently stored here',
      itemsCount: itemsUsingLocation.length
    });
  }
  
  delete storageLocations[name];
  
  res.json({
    success: true,
    message: 'Storage location deleted successfully'
  });
});

// Create order
app.post('/api/inventory/orders', authenticateToken, (req, res) => {
  const { supplierId, items: orderItems, notes } = req.body;
  
  if (!suppliers[supplierId]) {
    return res.status(400).json({ error: 'Invalid supplier' });
  }
  
  let totalAmount = 0;
  const validatedItems = orderItems.map(orderItem => {
    const inventoryItem = inventory.find(i => i.id === orderItem.itemId);
    if (!inventoryItem) {
      throw new Error(`Item ${orderItem.itemId} not found`);
    }
    
    const itemTotal = orderItem.quantity * inventoryItem.unitPrice;
    totalAmount += itemTotal;
    
    return {
      itemId: orderItem.itemId,
      name: inventoryItem.name,
      quantity: orderItem.quantity,
      unitPrice: inventoryItem.unitPrice,
      total: itemTotal,
      unit: inventoryItem.unit
    };
  });
  
  const newOrder = {
    id: orderCounter++,
    orderNumber: `ORD-${Date.now()}`,
    supplier: supplierId,
    supplierInfo: suppliers[supplierId],
    items: validatedItems,
    totalAmount: totalAmount.toFixed(2),
    status: 'pending',
    orderDate: new Date().toISOString(),
    notes: notes || '',
    createdBy: 'David Mikulis'
  };
  
  orders.push(newOrder);
  
  res.json({
    success: true,
    order: newOrder,
    message: 'Order created successfully'
  });
});

// Update item quantity
app.put('/api/inventory/items/:id', authenticateToken, (req, res) => {
  const itemId = parseInt(req.params.id);
  const { quantity } = req.body;
  
  const item = inventory.find(i => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  item.quantity = parseInt(quantity);
  item.lastUpdate = new Date().toISOString();
  
  res.json({
    success: true,
    message: 'Quantity updated successfully',
    item
  });
});

// Upload files
app.post('/api/inventory/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Update inventory item location
app.put('/api/inventory/items/:id/location', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { location, action = 'set' } = req.body; // action can be 'set', 'add', 'remove'
    
    const itemIndex = inventory.findIndex(item => item.id == id);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    
    // Validate location exists
    if (!storageLocations[location]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid storage location'
      });
    }
    
    // Ensure locations is an array
    if (!Array.isArray(inventory[itemIndex].locations)) {
      inventory[itemIndex].locations = inventory[itemIndex].location ? [inventory[itemIndex].location] : [];
    }
    
    // Handle different actions
    switch (action) {
      case 'add':
        if (!inventory[itemIndex].locations.includes(location)) {
          inventory[itemIndex].locations.push(location);
        }
        break;
      case 'remove':
        inventory[itemIndex].locations = inventory[itemIndex].locations.filter(loc => loc !== location);
        break;
      case 'set':
      default:
        inventory[itemIndex].locations = [location];
        break;
    }
    
    // Update legacy location field for backward compatibility
    inventory[itemIndex].location = inventory[itemIndex].locations[0] || '';
    
    res.json({
      success: true,
      message: 'Item location updated successfully',
      item: inventory[itemIndex]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update item location',
      details: error.message
    });
  }
});

// Batch location operations
app.post('/api/inventory/items/batch/location', authenticateToken, (req, res) => {
  try {
    const { items, location, action = 'add' } = req.body; // items is array of item IDs
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required'
      });
    }
    
    // Validate location exists
    if (!storageLocations[location]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid storage location'
      });
    }
    
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    items.forEach(itemId => {
      const itemIndex = inventory.findIndex(item => item.id == itemId);
      if (itemIndex === -1) {
        results.push({ itemId, success: false, error: 'Item not found' });
        failCount++;
        return;
      }
      
      // Ensure locations is an array
      if (!Array.isArray(inventory[itemIndex].locations)) {
        inventory[itemIndex].locations = inventory[itemIndex].location ? [inventory[itemIndex].location] : [];
      }
      
      // Handle different actions
      switch (action) {
        case 'add':
          if (!inventory[itemIndex].locations.includes(location)) {
            inventory[itemIndex].locations.push(location);
          }
          break;
        case 'remove':
          inventory[itemIndex].locations = inventory[itemIndex].locations.filter(loc => loc !== location);
          break;
        case 'move': // Remove from all other locations and add to this one
          inventory[itemIndex].locations = [location];
          break;
      }
      
      // Update legacy location field
      inventory[itemIndex].location = inventory[itemIndex].locations[0] || '';
      
      results.push({ itemId, success: true });
      successCount++;
    });
    
    res.json({
      success: true,
      message: `Batch location update completed: ${successCount} success, ${failCount} failed`,
      results,
      successCount,
      failCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to batch update locations',
      details: error.message
    });
  }
});

// Download complete inventory file
app.get('/api/inventory/download/:format', authenticateToken, (req, res) => {
  try {
    const { format } = req.params;
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      const csvHeaders = [
        'ID', 'Name', 'Category', 'Quantity', 'Unit', 
        'Location', 'Supplier', 'Unit Price', 'Total Value',
        'Min Quantity', 'Max Quantity', 'Supplier Code', 
        'Last Order Date', 'Pack Size', 'Brand', 'GFS Order ID'
      ].join(',');
      
      const csvRows = inventory.map(item => [
        item.id,
        `"${item.name?.en || item.name || ''}"`,
        `"${item.category || ''}"`,
        item.quantity || 0,
        `"${item.unit || ''}"`,
        `"${item.location || ''}"`,
        `"${item.supplier || ''}"`,
        item.unitPrice || 0,
        item.totalValue || 0,
        item.minQuantity || 0,
        item.maxQuantity || 0,
        `"${item.supplierCode || ''}"`,
        `"${item.lastOrderDate || ''}"`,
        `"${item.packSize || ''}"`,
        `"${item.brand || ''}"`,
        `"${item.gfsOrderId || ''}"`
      ].join(','));
      
      const csvContent = [csvHeaders, ...csvRows].join('\\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="complete_inventory_${timestamp}.csv"`);
      res.send(csvContent);
      
    } else if (format === 'json') {
      const jsonData = {
        exportDate: new Date().toISOString(),
        totalItems: inventory.length,
        locations: Object.keys(storageLocations),
        inventory: inventory.map(item => ({
          ...item,
          displayName: item.name?.en || item.name || 'Unknown Item'
        })),
        summary: {
          totalValue: inventory.reduce((sum, item) => sum + (item.totalValue || 0), 0),
          itemsByLocation: Object.keys(storageLocations).reduce((acc, location) => {
            acc[location] = inventory.filter(item => item.location === location).length;
            return acc;
          }, {}),
          itemsByCategory: inventory.reduce((acc, item) => {
            const cat = item.category || 'Unknown';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {}),
          itemsBySupplier: inventory.reduce((acc, item) => {
            const sup = item.supplier || 'Unknown';
            acc[sup] = (acc[sup] || 0) + 1;
            return acc;
          }, {})
        }
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="complete_inventory_${timestamp}.json"`);
      res.json(jsonData);
      
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Use csv or json'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate download',
      details: error.message
    });
  }
});

// Quick Add Item by Stock Number
app.post('/api/inventory/quick-add', authenticateToken, (req, res) => {
  try {
    const { productCode, location, quantity } = req.body;
    
    // Validate input parameters
    if (!productCode || !location || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Product code, location, and quantity are required'
      });
    }
    
    // Sanitize and validate inputs
    const sanitizedCode = sanitizeString(productCode, 50);
    const sanitizedLocation = sanitizeString(location, 100);
    const numQuantity = parseInt(quantity);
    
    if (!validateLocation(sanitizedLocation)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid storage location'
      });
    }
    
    if (isNaN(numQuantity) || numQuantity < 0 || numQuantity > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quantity (must be 0-10000)'
      });
    }
    
    // Check if item already exists in inventory
    const existingItem = inventory.find(item => 
      item.supplierCode === sanitizedCode || 
      item.name.en.toLowerCase().includes(sanitizedCode.toLowerCase())
    );
    
    if (existingItem) {
      // Update existing item
      existingItem.quantity += numQuantity;
      existingItem.location = sanitizedLocation;
      
      res.json({
        success: true,
        message: `Updated existing item: ${existingItem.name.en}`,
        item: existingItem
      });
    } else {
      // Create new item
      const newItem = {
        id: Math.max(...inventory.map(i => i.id)) + 1,
        name: { 
          en: `Product ${sanitizedCode}`, 
          fr: `Produit ${sanitizedCode}` 
        },
        quantity: numQuantity,
        minQuantity: 1,
        maxQuantity: numQuantity * 3,
        category: 'Manual Entry',
        unit: 'Each',
        supplier: 'Manual',
        unitPrice: 0,
        location: sanitizedLocation,
        supplierCode: sanitizedCode,
        lastOrderDate: new Date().toISOString().split('T')[0],
        packSize: '',
        brand: '',
        totalValue: 0,
        isManualEntry: true
      };
      
      inventory.push(newItem);
      
      res.json({
        success: true,
        message: `Added new item: ${newItem.name.en}`,
        item: newItem
      });
    }
  } catch (error) {
    console.error('Error in quick add:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Counting Mode Interface
app.get('/api/inventory/counting-mode/:location', authenticateToken, (req, res) => {
  try {
    const { location } = req.params;
    const itemsInLocation = inventory.filter(item => item.location === location);
    
    // Sort items for easier counting (by category, then name)
    itemsInLocation.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.en.localeCompare(b.name.en);
    });
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Counting Mode: ${location}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .counting-header { background: #2196F3; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .counting-item { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .item-name { font-weight: bold; font-size: 18px; }
        .item-details { color: #666; margin: 5px 0; }
        .count-input { width: 100px; padding: 8px; font-size: 16px; text-align: center; }
        .save-btn { background: #4CAF50; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
        .save-btn:hover { background: #45a049; }
        .navigation { position: fixed; bottom: 20px; right: 20px; }
        .nav-btn { background: #FF9800; color: white; padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="counting-header">
        <h1>📝 Counting Mode: ${location}</h1>
        <p>Count items in sequential order. Enter actual quantities found.</p>
        <p><strong>${itemsInLocation.length} items</strong> to count in this location</p>
    </div>
    
    ${itemsInLocation.map((item, index) => `
        <div class="counting-item">
            <div class="item-name">${item.name.en}</div>
            <div class="item-details">
                Current: ${item.quantity} ${item.unit} | Code: ${item.supplierCode} | Category: ${item.category}
            </div>
            <div style="margin-top: 10px;">
                <label>Actual Count: </label>
                <input type="number" class="count-input" id="count_${item.id}" value="${item.quantity}" />
                <button class="save-btn" onclick="saveCount(${item.id})">✓ Update</button>
            </div>
        </div>
    `).join('')}
    
    <div class="navigation">
        <button class="nav-btn" onclick="saveAllCounts()">💾 Save All Counts</button>
        <button class="nav-btn" onclick="window.close()">✖ Close</button>
    </div>
    
    <script>
        async function saveCount(itemId) {
            const newCount = document.getElementById('count_' + itemId).value;
            const response = await fetch('/api/inventory/update-count', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + authToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemId: itemId,
                    newCount: parseInt(newCount)
                })
            });
            
            if (response.ok) {
                alert('Count updated!');
            } else {
                alert('Error updating count');
            }
        }
        
        async function saveAllCounts() {
            const updates = [];
            ${itemsInLocation.map(item => `
                updates.push({
                    itemId: ${item.id},
                    newCount: parseInt(document.getElementById('count_${item.id}').value)
                });
            `).join('')}
            
            // Implementation for batch update
            alert('All counts saved! (Feature in development)');
        }
    </script>
</body>
</html>
    `);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate counting interface'
    });
  }
});

// AI Assistant Chat Endpoint
app.post('/api/ai/chat', authenticateToken, (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    const lowerMessage = message.toLowerCase();
    let response = '';
    
    if (lowerMessage.includes('move') || lowerMessage.includes('reorganize') || lowerMessage.includes('organize')) {
      const misplacedCount = inventory.filter(item => {
        const category = item.category?.toLowerCase() || '';
        const shouldBeInFreezer = category.includes('meat') || category.includes('frozen');
        const shouldBeInCooler = category.includes('dairy') || category.includes('produce');
        const isInWrongPlace = (shouldBeInFreezer && !item.location.includes('Freezer')) ||
                              (shouldBeInCooler && !item.location.includes('Cooler'));
        return isInWrongPlace;
      }).length;
      
      if (misplacedCount > 0) {
        response = `🤖 I found ${misplacedCount} items that should be moved:\n\n`;
        inventory.filter(item => {
          const category = item.category?.toLowerCase() || '';
          const shouldBeInFreezer = category.includes('meat') || category.includes('frozen');
          const shouldBeInCooler = category.includes('dairy') || category.includes('produce');
          const isInWrongPlace = (shouldBeInFreezer && !item.location.includes('Freezer')) ||
                                (shouldBeInCooler && !item.location.includes('Cooler'));
          return isInWrongPlace;
        }).slice(0, 3).forEach(item => {
          const name = item.name?.en || item.name || 'Unknown Item';
          const suggested = item.category?.toLowerCase().includes('meat') ? 'Freezer A1' : 
                           item.category?.toLowerCase().includes('dairy') ? 'Cooler B2' : 'Cooler B3';
          response += `• Move "${name}" from ${item.location} to ${suggested}\n`;
        });
        response += '\nThis will improve food safety and organization!';
      } else {
        response = `🤖 Great news! All items are already in their optimal storage locations.`;
      }
    } else if (lowerMessage.includes('count') || lowerMessage.includes('sheet') || lowerMessage.includes('audit')) {
      const locationCount = Object.keys(storageLocations).length;
      response = `🤖 I can generate count sheets for all ${locationCount} storage locations.\n\nEach sheet will include:\n• Items organized by category\n• Current quantities\n• Space for counted quantities\n• Discrepancy calculations\n\nUse the count sheets feature to generate printable sheets for each location.`;
    } else if (lowerMessage.includes('location') || lowerMessage.includes('where')) {
      response = `🤖 Here are your storage locations:\n\n`;
      Object.entries(storageLocations).forEach(([name, info]) => {
        const itemCount = inventory.filter(item => item.location === name).length;
        response += `• ${name} (${info.type}, ${info.temp}) - ${itemCount} items\n`;
      });
    } else if (lowerMessage.includes('capacity') || lowerMessage.includes('space') || lowerMessage.includes('full')) {
      response = `🤖 Storage capacity overview:\n\n`;
      Object.entries(storageLocations).forEach(([name, info]) => {
        const utilization = ((info.currentUsage / info.capacity) * 100).toFixed(1);
        const status = utilization > 90 ? '🔴' : utilization > 70 ? '🟡' : '🟢';
        response += `${status} ${name}: ${utilization}% full (${info.currentUsage}/${info.capacity})\n`;
      });
    } else {
      response = `🤖 I'm your inventory AI assistant! I can help you with:\n\n• 📦 Moving products to optimal locations\n• 📋 Generating count sheets for inventory audits\n• 📍 Finding where items are stored\n• 📊 Checking storage capacity and utilization\n\nTry asking: "Move products to proper locations" or "Generate count sheets"`;
    }
    
    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to process AI chat request',
      details: error.message
    });
  }
});

// Generate count sheets for specific location
app.get('/api/ai/count-sheets/:location', authenticateToken, (req, res) => {
  try {
    const { location } = req.params;
    const locationItems = inventory.filter(item => item.location === location);
    
    if (locationItems.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No items found in this location'
      });
    }
    
    const locationInfo = storageLocations[location] || { type: 'Unknown', temp: 'N/A' };
    
    // Generate simple HTML for printing
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Count Sheet - ${location}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background-color: #f0f0f0; }
        .count-box { width: 80px; height: 25px; border: 1px solid #000; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏕️ INVENTORY COUNT SHEET</h1>
        <h2>${location}</h2>
        <p>Type: ${locationInfo.type} | Temperature: ${locationInfo.temp} | Date: ${new Date().toLocaleDateString()}</p>
    </div>
    <table>
        <thead>
            <tr><th>Item Name</th><th>Category</th><th>Current Qty</th><th>Counted Qty</th><th>Difference</th></tr>
        </thead>
        <tbody>
            ${locationItems.map(item => `
                <tr>
                    <td>${item.name?.en || item.name || 'Unknown Item'}</td>
                    <td>${item.category || 'N/A'}</td>
                    <td>${item.quantity} ${item.unit || 'units'}</td>
                    <td><div class="count-box"></div></td>
                    <td><div class="count-box"></div></td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    <div style="margin-top: 30px;">
        <p><strong>Counter:</strong> _________________________ <strong>Date:</strong> _________________________</p>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate count sheet',
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Complete Bilingual Inventory System',
    version: '3.0',
    features: {
      bilingual: true,
      syscoCatalog: syscoCatalog.length,
      gfsOrders: gfsOrders.length,
      storageLocations: Object.keys(storageLocations).length,
      inventoryItems: inventory.length
    }
  });
});

// Main bilingual interface
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🏕️ Complete Bilingual Inventory System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: white;
            min-height: 100vh;
        }
        
        .login-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        .login-box {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 100%;
            text-align: center;
        }
        
        .lang-switch {
            position: absolute;
            top: 20px;
            right: 20px;
        }
        
        .lang-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            background: rgba(255,255,255,0.2);
            color: white;
            cursor: pointer;
            margin-left: 5px;
            transition: all 0.3s ease;
        }
        
        .lang-btn.active {
            background: #4CAF50;
        }
        
        .dashboard {
            display: none;
            min-height: 100vh;
        }
        
        .header {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .nav-tabs {
            display: flex;
            gap: 10px;
            margin: 20px;
        }
        
        .nav-tab {
            padding: 12px 24px;
            background: rgba(255,255,255,0.1);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .nav-tab.active {
            background: #4CAF50;
        }
        
        .content {
            padding: 20px;
        }
        
        .inventory-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        
        .inventory-item {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .item-name {
            font-size: 18px;
            font-weight: bold;
        }
        
        .status-badge {
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .status-outOfStock { background: #F44336; }
        .status-lowStock { background: #FF9800; }
        .status-normal { background: #4CAF50; }
        .status-high { background: #2196F3; }
        
        .storage-location {
            background: rgba(0,0,0,0.2);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
            font-size: 14px;
        }
        
        .catalog-search {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            width: 100%;
            max-width: 500px;
            margin-bottom: 20px;
        }
        
        .catalog-item {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .btn {
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        
        .btn:hover {
            background: #45a049;
            transform: translateY(-2px);
        }
        
        .btn-small {
            padding: 5px 10px;
            font-size: 12px;
        }
        
        .btn-danger {
            background: linear-gradient(45deg, #FF6B6B, #F44336);
        }
        
        .btn-secondary {
            background: linear-gradient(45deg, #2196F3, #1976D2);
        }
        
        input, select {
            padding: 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(255,255,255,0.1);
            color: white;
            width: 100%;
            margin-bottom: 15px;
        }
        
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .metric-card {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #4CAF50;
        }
        
        .metric-label {
            color: #ccc;
            font-size: 14px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="lang-switch">
        <button class="lang-btn active" onclick="setLanguage('english')">English</button>
        <button class="lang-btn" onclick="setLanguage('french')">Français</button>
    </div>
    
    <!-- LOGIN -->
    <div id="loginScreen" class="login-container">
        <div class="login-box">
            <h1 id="loginTitle">🏕️ AI Inventory Management</h1>
            <p id="loginSubtitle">Complete Bilingual System</p>
            <form id="loginForm">
                <label for="email" class="sr-only">Email Address</label>
                <input type="email" id="email" placeholder="Email" value="david.mikulis@camp-inventory.com" autocomplete="email" required>
                <label for="password" class="sr-only">Password</label>
                <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
                <button type="submit" class="btn" style="width: 100%; margin-top: 20px;">Login</button>
            </form>
        </div>
    </div>
    
    <!-- DASHBOARD -->
    <div id="dashboard" class="dashboard">
        <div class="header">
            <h1 id="title">🏕️ AI Inventory Management System</h1>
            <div>
                <span id="userName">David Mikulis</span>
                <button class="btn" onclick="logout()">Logout</button>
            </div>
        </div>
        
        <div class="nav-tabs">
            <button class="nav-tab active" onclick="showTab('inventory')" id="navInventory">Inventory</button>
            <button class="nav-tab" onclick="showTab('catalog')" id="navCatalog">Sysco Catalog (2932)</button>
            <button class="nav-tab" onclick="showTab('orders')" id="navOrders">GFS Orders</button>
            <button class="nav-tab" onclick="showTab('storage')" id="navStorage">Storage Locations</button>
            <button class="nav-tab" onclick="showTab('suppliers')" id="navSuppliers">Suppliers</button>
            <button class="nav-tab" onclick="showTab('ai-assistant')" id="navAI">🤖 AI Assistant</button>
        </div>
        
        <div class="content">
            <!-- Metrics -->
            <div class="metrics">
                <div class="metric-card">
                    <div class="metric-value" id="totalItems">--</div>
                    <div class="metric-label" id="labelTotalItems">Total Items</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value" id="criticalItems">--</div>
                    <div class="metric-label" id="labelCriticalItems">Critical Items</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value" id="totalValue">--</div>
                    <div class="metric-label" id="labelTotalValue">Total Value</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value" id="storageUtilization">--</div>
                    <div class="metric-label" id="labelStorageUtil">Storage Utilization</div>
                </div>
            </div>
            
            <!-- Inventory Tab -->
            <div id="inventoryTab" class="tab-content">
                <div style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center;">
                    <h2>Complete Inventory System</h2>
                    <div style="margin-left: auto;">
                        <button onclick="downloadInventory('csv')" class="btn" style="background: #4CAF50; margin-right: 10px;">📥 Download CSV</button>
                        <button onclick="downloadInventory('json')" class="btn" style="background: #2196F3;">📥 Download JSON</button>
                    </div>
                </div>
                
                <!-- Quick Add & Location Management -->
                <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                    <h3>🚀 Quick Add Item</h3>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <input type="text" id="quickAddCode" placeholder="Enter product/stock number..." style="flex: 1; padding: 8px; border-radius: 5px; border: none;">
                        <select id="quickAddLocation" style="padding: 8px; border-radius: 5px; border: none;">
                            <option value="">Select Location</option>
                        </select>
                        <input type="number" id="quickAddQuantity" placeholder="Qty" value="1" style="width: 80px; padding: 8px; border-radius: 5px; border: none;">
                        <button onclick="quickAddItem()" class="btn" style="background: #FF9800;">➕ Add</button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span>🗂️ View by Location:</span>
                        <select id="locationFilter" onchange="filterByLocation()" style="padding: 5px; border-radius: 5px; border: none;">
                            <option value="">All Locations</option>
                        </select>
                        <button onclick="showCountingMode()" class="btn" style="background: #9C27B0;">📝 Counting Mode</button>
                        <button onclick="startInventoryProcess()" class="btn" style="background: #795548;">📊 Process Inventory</button>
                    </div>
                </div>
                
                <div id="inventoryGrid" class="inventory-grid"></div>
            </div>
            
            <!-- Catalog Tab -->
            <div id="catalogTab" class="tab-content" style="display: none;">
                <input type="text" class="catalog-search" placeholder="Search Sysco catalog..." id="catalogSearch">
                <div id="catalogItems"></div>
            </div>
            
            <!-- Orders Tab -->
            <div id="ordersTab" class="tab-content" style="display: none;">
                <h2>GFS Order History</h2>
                <div id="gfsOrders"></div>
            </div>
            
            <!-- Storage Tab -->
            <div id="storageTab" class="tab-content" style="display: none;">
                <h2>Storage Locations</h2>
                
                <!-- Add New Location Button -->
                <div style="margin-bottom: 20px;">
                    <button class="btn" onclick="showAddLocationForm()">➕ Add New Location</button>
                </div>
                
                <!-- Add/Edit Location Form -->
                <div id="locationForm" style="display: none; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h3 id="formTitle">Add New Storage Location</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div>
                            <label>Location Name *</label>
                            <input type="text" id="locationName" placeholder="e.g., Freezer A4" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                        <div>
                            <label>Type *</label>
                            <select id="locationType" onchange="suggestTemperature()" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
                                <option value="">Select Type</option>
                                <option value="Freezer">Freezer</option>
                                <option value="Cooler">Cooler</option>
                                <option value="Dry Storage">Dry Storage</option>
                                <option value="Pantry">Pantry</option>
                                <option value="Wine Cellar">Wine Cellar</option>
                            </select>
                        </div>
                        <div>
                            <label>Temperature * <small style="color: #666;">(auto-suggests, but you can change)</small></label>
                            <input type="text" id="locationTemp" placeholder="Select type first for auto-suggestion" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                        <div>
                            <label>Capacity *</label>
                            <input type="number" id="locationCapacity" placeholder="e.g., 1000" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <button class="btn" onclick="saveLocation()">💾 Save Location</button>
                        <button class="btn btn-secondary" onclick="cancelLocationForm()" style="margin-left: 10px;">❌ Cancel</button>
                    </div>
                </div>
                
                <div id="storageLocations"></div>
            </div>
            
            <!-- Suppliers Tab -->
            <div id="suppliersTab" class="tab-content" style="display: none;">
                <h2>Supplier Information</h2>
                <div id="suppliersList"></div>
            </div>
            
            <!-- AI Assistant Tab -->
            <div id="ai-assistantTab" class="tab-content" style="display: none;">
                <h2>🤖 AI Inventory Assistant</h2>
                <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3>💬 Ask Your AI Assistant</h3>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <label for="aiChatInput" class="sr-only">Ask AI Assistant</label>
                        <input type="text" id="aiChatInput" placeholder="Ask me to move products to proper locations or generate count sheets..." 
                               style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px;" autocomplete="off">
                        <button onclick="sendAIMessage()" class="btn" style="background: #4CAF50;">Send</button>
                    </div>
                    <div id="aiChatResponse" style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 5px; min-height: 100px; white-space: pre-line; font-family: monospace;">
                        🤖 Hello! I'm your inventory AI assistant. Ask me to:
                        • Move products to optimal locations
                        • Generate count sheets for audits
                        • Check storage capacity
                        • Find item locations
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 20px;">
                        <h3>📦 Quick Actions</h3>
                        <button onclick="askAI('move products to proper locations')" class="btn" style="background: #2196F3; margin: 5px;">Organize Inventory</button>
                        <button onclick="askAI('show me storage capacity')" class="btn" style="background: #FF9800; margin: 5px;">Check Capacity</button>
                        <button onclick="askAI('where are my items located?')" class="btn" style="background: #9C27B0; margin: 5px;">Find Locations</button>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 20px;">
                        <h3>📋 Count Sheets</h3>
                        <p>Generate printable count sheets for physical inventory:</p>
                        <div id="countSheetsList">
                            <!-- Will be populated with location buttons -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let currentLanguage = 'english';
        let authToken = null;
        const translations = ${JSON.stringify(translations)};
        
        function setLanguage(lang) {
            currentLanguage = lang;
            document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            updateUILanguage();
            if (authToken) loadData();
        }
        
        function updateUILanguage() {
            const t = translations[currentLanguage];
            document.getElementById('title').textContent = '🏕️ ' + t.title;
            document.getElementById('navInventory').textContent = t.inventory;
            document.getElementById('navCatalog').textContent = t.syscoCatalog + ' (2932)';
            document.getElementById('navOrders').textContent = t.gfsOrders;
            document.getElementById('navStorage').textContent = t.storage;
            document.getElementById('navSuppliers').textContent = t.suppliers;
            document.getElementById('labelTotalItems').textContent = t.totalItems;
            document.getElementById('labelCriticalItems').textContent = t.criticalItems;
            document.getElementById('labelTotalValue').textContent = t.totalValue;
            document.getElementById('catalogSearch').placeholder = t.search;
        }
        
        // Login
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    authToken = result.token;
                    localStorage.setItem('inventory_token', authToken);
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'block';
                    loadData();
                } else {
                    alert('Invalid credentials');
                }
            } catch (error) {
                alert('Login failed');
            }
        });
        
        // Storage Location Management Functions
        let editingLocationName = null;
        
        function showAddLocationForm() {
            editingLocationName = null;
            document.getElementById('formTitle').textContent = 'Add New Storage Location';
            document.getElementById('locationName').value = '';
            document.getElementById('locationType').value = '';
            document.getElementById('locationTemp').value = '';
            document.getElementById('locationCapacity').value = '';
            document.getElementById('locationName').disabled = false;
            document.getElementById('locationForm').style.display = 'block';
        }
        
        function editLocation(locationName) {
            editingLocationName = locationName;
            document.getElementById('formTitle').textContent = 'Edit Storage Location';
            
            // Find the location data
            fetch('/api/storage/locations')
                .then(response => response.json())
                .then(data => {
                    const location = data.locations.find(loc => loc.name === locationName);
                    if (location) {
                        document.getElementById('locationName').value = location.name;
                        document.getElementById('locationType').value = location.type;
                        document.getElementById('locationTemp').value = location.temp;
                        document.getElementById('locationCapacity').value = location.capacity;
                        document.getElementById('locationName').disabled = false; // Allow name editing
                        document.getElementById('locationForm').style.display = 'block';
                    }
                });
        }
        
        async function saveLocation() {
            const name = document.getElementById('locationName').value.trim();
            const type = document.getElementById('locationType').value;
            const temp = document.getElementById('locationTemp').value.trim();
            const capacity = document.getElementById('locationCapacity').value;
            
            if (!name || !type || !temp || !capacity) {
                alert('Please fill in all required fields');
                return;
            }
            
            const locationData = { type, temp, capacity: parseInt(capacity) };
            
            try {
                let response;
                if (editingLocationName) {
                    // Check if name has changed
                    if (name !== editingLocationName) {
                        // First rename the location
                        response = await fetch(\`/api/storage/locations/\${encodeURIComponent(editingLocationName)}/rename\`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${authToken}\`
                            },
                            body: JSON.stringify({ newName: name })
                        });
                        
                        if (response.status === 403) {
                            alert('Your session has expired. Please log in again.');
                            showSection('login');
                            return;
                        }
                        
                        const renameResult = await response.json();
                        if (!renameResult.success) {
                            alert('Error renaming location: ' + renameResult.error);
                            return;
                        }
                        
                        // If rename successful, update other properties with new name
                        editingLocationName = name;
                    }
                    
                    // Update existing location properties
                    response = await fetch(\`/api/storage/locations/\${encodeURIComponent(editingLocationName)}\`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': \`Bearer \${authToken}\`
                        },
                        body: JSON.stringify(locationData)
                    });
                } else {
                    // Create new location
                    response = await fetch('/api/storage/locations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': \`Bearer \${authToken}\`
                        },
                        body: JSON.stringify({ name, ...locationData })
                    });
                }
                
                if (response.status === 403) {
                    alert('Your session has expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                
                if (result.success) {
                    alert(result.message);
                    cancelLocationForm();
                    loadStorageLocations(); // Refresh the list
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        async function deleteLocation(locationName) {
            if (!confirm(\`Are you sure you want to delete the storage location "\${locationName}"?\`)) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/storage/locations/\${encodeURIComponent(locationName)}\`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': \`Bearer \${authToken}\`
                    }
                });
                
                if (response.status === 403) {
                    alert('Your session has expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                
                if (result.success) {
                    alert(result.message);
                    loadStorageLocations(); // Refresh the list
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        function cancelLocationForm() {
            document.getElementById('locationForm').style.display = 'none';
            editingLocationName = null;
        }
        
        // Auto-suggest temperature based on storage type
        function suggestTemperature() {
            const typeSelect = document.getElementById('locationType');
            const tempInput = document.getElementById('locationTemp');
            const selectedType = typeSelect.value;
            
            // Only suggest if temperature field is empty or contains a previous suggestion
            const currentTemp = tempInput.value.trim();
            const shouldSuggest = !currentTemp || 
                                currentTemp === '-10°F' || 
                                currentTemp === '38°F' || 
                                currentTemp === 'Room Temperature' || 
                                currentTemp === '55-60°F' || 
                                currentTemp === '50-55°F';
            
            if (shouldSuggest) {
                const tempSuggestions = {
                    'Freezer': '-10°F',
                    'Cooler': '38°F', 
                    'Dry Storage': 'Room Temperature',
                    'Pantry': 'Room Temperature',
                    'Wine Cellar': '55-60°F'
                };
                
                if (tempSuggestions[selectedType]) {
                    tempInput.value = tempSuggestions[selectedType];
                    // Add visual feedback
                    tempInput.style.backgroundColor = '#e8f5e8';
                    setTimeout(() => {
                        tempInput.style.backgroundColor = '';
                    }, 1000);
                }
            }
        }
        
        // Load storage locations
        async function loadStorageLocations() {
            try {
                const response = await fetch('/api/storage/locations');
                const data = await response.json();
                
                if (data.success) {
                    const container = document.getElementById('storageLocations');
                    container.innerHTML = \`
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
                            \${data.locations.map(loc => \`
                                <div class="catalog-item">
                                    <div>
                                        <strong>\${loc.name}</strong>
                                        <br><small>Type: \${loc.type} | Temp: \${loc.temp}</small>
                                        <br><small>Capacity: \${loc.capacity} units</small>
                                    </div>
                                    <div>
                                        <strong>\${loc.utilizationPercent}%</strong> Used
                                        <br><small>\${loc.currentUsage}/\${loc.capacity} units</small>
                                        <div style="margin-top: 10px;">
                                            <button class="btn btn-small" onclick="manageLocationItems('\${loc.name}')">📦 Manage Items</button>
                                            <button class="btn btn-small" onclick="editLocation('\${loc.name}')" style="margin-left: 5px;">✏️ Edit</button>
                                            <button class="btn btn-danger btn-small" onclick="deleteLocation('\${loc.name}')" style="margin-left: 5px;">🗑️ Delete</button>
                                        </div>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    \`;
                    
                    // Update storage utilization metric
                    if (data.locations.length > 0) {
                        const avgUtilization = data.locations.reduce((sum, loc) => sum + parseFloat(loc.utilizationPercent), 0) / data.locations.length;
                        const utilizationElement = document.getElementById('storageUtilization');
                        if (utilizationElement) {
                            utilizationElement.textContent = avgUtilization.toFixed(1) + '%';
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading storage locations:', error);
                alert('Error loading storage locations: ' + error.message);
            }
        }
        
        // Load storage tab (main function called by tab switching)
        function loadStorage() {
            loadStorageLocations();
        }
        
        // Manage items in a specific location
        async function manageLocationItems(locationName) {
            try {
                // Get all inventory items
                const inventoryResponse = await fetch('/api/inventory/items');
                const inventoryData = await inventoryResponse.json();
                
                if (!inventoryData.success) {
                    alert('Error loading inventory data');
                    return;
                }
                
                // Get storage locations for dropdown
                const locationsResponse = await fetch('/api/storage/locations');
                const locationsData = await locationsResponse.json();
                
                if (!locationsData.success) {
                    alert('Error loading storage locations');
                    return;
                }
                
                // Filter items in this location and items in other locations
                const itemsInLocation = inventoryData.items.filter(item => item.location === locationName);
                const itemsInOtherLocations = inventoryData.items.filter(item => item.location !== locationName);
                
                // Create modal HTML
                const modalHtml = \`
                    <div id="itemManagementModal" style="
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                        background: rgba(0,0,0,0.8); z-index: 1000; display: flex; 
                        align-items: center; justify-content: center;
                    ">
                        <div style="
                            background: #2c3e50; color: white; padding: 30px; border-radius: 15px; 
                            max-width: 90%; max-height: 90%; overflow-y: auto; min-width: 800px;
                        ">
                            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 20px;">
                                <h2>📦 Manage Items in: \${locationName}</h2>
                                <button onclick="closeItemManagementModal()" style="
                                    background: #e74c3c; color: white; border: none; padding: 8px 12px; 
                                    border-radius: 5px; cursor: pointer; font-size: 16px; margin-left: auto;
                                ">✖ Close</button>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                                <!-- Current Items in Location -->
                                <div>
                                    <h3 style="color: #4CAF50;">📍 Current Items in \${locationName} (\${itemsInLocation.length})</h3>
                                    <div style="max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                                        \${itemsInLocation.length === 0 ? 
                                            '<p style="color: #bbb; text-align: center;">No items in this location</p>' :
                                            itemsInLocation.map(item => \`
                                                <div style="background: rgba(255,255,255,0.1); padding: 10px; margin-bottom: 10px; border-radius: 5px;">
                                                    <strong>\${item.displayName || item.name?.en || item.name}</strong>
                                                    <br><small>Quantity: \${item.quantity} \${item.unit}</small>
                                                    <br><small>Category: \${item.category}</small>
                                                    <div style="margin-top: 8px;">
                                                        <select onchange="moveItem(\${item.id}, this.value, '\${locationName}')" style="padding: 4px; font-size: 12px;">
                                                            <option value="">Move to...</option>
                                                            \${locationsData.locations.filter(loc => loc.name !== locationName).map(loc => 
                                                                \`<option value="\${loc.name}">\${loc.name} (\${loc.type})</option>\`
                                                            ).join('')}
                                                        </select>
                                                    </div>
                                                </div>
                                            \`).join('')
                                        }
                                    </div>
                                </div>
                                
                                <!-- Items in Other Locations -->
                                <div>
                                    <h3 style="color: #FF9800;">🔄 Items in Other Locations (\${itemsInOtherLocations.length})</h3>
                                    <input type="text" id="itemSearchFilter" placeholder="Search items..." onkeyup="filterItems()" style="
                                        width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; 
                                        border-radius: 4px; background: rgba(255,255,255,0.9);
                                    ">
                                    <div id="otherLocationItems" style="max-height: 350px; overflow-y: auto; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                                        \${itemsInOtherLocations.map(item => \`
                                            <div class="other-item" data-name="\${(item.displayName || item.name?.en || item.name).toLowerCase()}" style="background: rgba(255,255,255,0.1); padding: 10px; margin-bottom: 10px; border-radius: 5px;">
                                                <strong>\${item.displayName || item.name?.en || item.name}</strong>
                                                <br><small>Current: \${item.location} | Qty: \${item.quantity} \${item.unit}</small>
                                                <br><small>Category: \${item.category}</small>
                                                <div style="margin-top: 8px;">
                                                    <button onclick="moveItem(\${item.id}, '\${locationName}', '\${item.location}')" class="btn btn-small" style="background: #4CAF50; font-size: 12px;">
                                                        ➡️ Move to \${locationName}
                                                    </button>
                                                </div>
                                            </div>
                                        \`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                \`;
                
                // Add modal to page
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                
            } catch (error) {
                console.error('Error loading location items:', error);
                alert('Error loading location items: ' + error.message);
            }
        }
        
        // Close item management modal
        function closeItemManagementModal() {
            const modal = document.getElementById('itemManagementModal');
            if (modal) {
                modal.remove();
            }
        }
        
        // Filter items in the search
        function filterItems() {
            const searchTerm = document.getElementById('itemSearchFilter').value.toLowerCase();
            const items = document.querySelectorAll('.other-item');
            
            items.forEach(item => {
                const itemName = item.getAttribute('data-name');
                if (itemName.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }
        
        // Move an item between locations
        async function moveItem(itemId, newLocation, currentLocation) {
            if (!newLocation) {
                alert('Please select a location to move to');
                return;
            }
            
            if (!confirm(\`Move this item from \${currentLocation} to \${newLocation}?\`)) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/inventory/items/\${itemId}/location\`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ location: newLocation })
                });
                
                if (response.status === 403) {
                    alert('Your session has expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                
                if (result.success) {
                    alert(\`Item moved successfully to \${newLocation}!\`);
                    // Close modal and refresh
                    closeItemManagementModal();
                    loadStorageLocations(); // Refresh storage locations
                    loadData(); // Refresh inventory data
                } else {
                    alert('Error moving item: ' + result.error);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        // Tab switching
        function showTab(tabName) {
            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
            
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').style.display = 'block';
            
            if (tabName === 'catalog') loadCatalog();
            if (tabName === 'orders') loadOrders();
            if (tabName === 'storage') loadStorage();
            if (tabName === 'suppliers') loadSuppliers();
        }
        
        // Storage locations cache for frontend
        let frontendStorageLocations = {};
        
        // Load inventory data
        async function loadData() {
            try {
                // Load both inventory and storage locations
                const [inventoryResponse, locationsResponse] = await Promise.all([
                    fetch('/api/inventory/items?lang=' + currentLanguage),
                    fetch('/api/storage/locations')
                ]);
                
                const data = await inventoryResponse.json();
                const locationsData = await locationsResponse.json();
                
                // Cache storage locations for dropdown generation
                if (locationsData.success) {
                    frontendStorageLocations = {};
                    locationsData.locations.forEach(loc => {
                        frontendStorageLocations[loc.name] = loc;
                    });
                }
                
                if (data.success) {
                    // Update metrics
                    document.getElementById('totalItems').textContent = data.summary.totalItems;
                    document.getElementById('criticalItems').textContent = data.summary.criticalItems;
                    document.getElementById('totalValue').textContent = '$' + data.summary.totalValue;
                    
                    // Display inventory
                    const grid = document.getElementById('inventoryGrid');
                    grid.innerHTML = data.items.map(item => 
                        '<div class="inventory-item">' +
                            '<div class="item-header">' +
                                '<div class="item-name">' + item.displayName + '</div>' +
                                '<div class="status-badge status-' + item.status + '">' + (translations[currentLanguage][item.status] || item.status) + '</div>' +
                            '</div>' +
                            '<div><strong>' + translations[currentLanguage].quantity + ':</strong> ' + item.quantity + ' ' + item.unit + '</div>' +
                            '<div><strong>' + translations[currentLanguage].supplier + ':</strong> ' + item.supplier + '</div>' +
                            '<div class="storage-location">' +
                                '<strong>📍 Locations:</strong> ' +
                                '<div style="margin: 5px 0;">' +
                                    (item.locations && item.locations.length > 0 ? 
                                        item.locations.map(loc => 
                                            '<span class="location-tag" style="background: #4CAF50; color: white; padding: 2px 6px; margin: 2px; border-radius: 3px; font-size: 12px; display: inline-block;">' + 
                                            loc + 
                                            ' <button onclick="removeItemFromLocation(' + item.id + ', \'' + loc + '\')" style="background: none; border: none; color: white; margin-left: 3px; cursor: pointer; font-size: 10px;">✕</button>' +
                                            '</span>'
                                        ).join('') : 
                                        '<span style="color: #888;">No location assigned</span>'
                                    ) +
                                '</div>' +
                                '<div style="margin-top: 5px;">' +
                                    '<select onchange="addItemToLocation(' + item.id + ', this.value)" style="padding: 2px; font-size: 12px;">' +
                                        '<option value="">+ Add to location</option>' +
                                        Object.keys(frontendStorageLocations).map(loc => 
                                            '<option value="' + loc + '">' + loc + '</option>'
                                        ).join('') +
                                    '</select>' +
                                    '<button onclick="showLocationManager(' + item.id + ')" style="margin-left: 5px; padding: 2px 6px; font-size: 12px; background: #2196F3; color: white; border: none; border-radius: 3px; cursor: pointer;">📍 Manage</button>' +
                                '</div>' +
                            '</div>' +
                            '<div><strong>' + translations[currentLanguage].lastOrder + ':</strong> ' + item.lastOrderDate + '</div>' +
                            '<div style="margin-top: 10px;">' +
                                '<strong>🤖 AI:</strong> ' + item.aiInsights.recommendedAction +
                            '</div>' +
                            (item.isFromGFS && item.isConsolidated ? 
                                '<div style="margin-top: 5px;"><small style="color: #4CAF50;">📦 Consolidated from ' + item.orderCount + ' orders<br>Order IDs: ' + (item.gfsOrderIds ? item.gfsOrderIds.slice(0,3).join(', ') + (item.orderCount > 3 ? '...' : '') : 'N/A') + '</small></div>' : 
                                item.isFromGFS ? '<div style="margin-top: 5px;"><small style="color: #4CAF50;">📦 From GFS Order: ' + (item.gfsOrderId || 'N/A') + '</small></div>' : '') +
                        '</div>'
                    ).join('');
                }
            } catch (error) {
                console.error('Error loading data:', error);
            }
        }
        
        // Load Sysco catalog
        async function loadCatalog() {
            const search = document.getElementById('catalogSearch').value;
            try {
                const response = await fetch(\`/api/catalog/sysco?search=\${search}&limit=20\`);
                const data = await response.json();
                
                if (data.success) {
                    const container = document.getElementById('catalogItems');
                    container.innerHTML = data.items.map(item => \`
                        <div class="catalog-item">
                            <div>
                                <strong>\${item.productName}</strong>
                                <br><small>Code: \${item.productCode || 'N/A'} | Unit: \${item.unit}</small>
                            </div>
                            <div>
                                <strong>$\${item.unitPrice}</strong>
                                <button class="btn" style="margin-left: 10px;">Add to Order</button>
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (error) {
                console.error('Error loading catalog:', error);
            }
        }
        
        // Load GFS orders
        async function loadOrders() {
            try {
                const response = await fetch('/api/orders/gfs');
                const data = await response.json();
                
                if (data.success) {
                    const container = document.getElementById('gfsOrders');
                    const ordersHtml = data.orders.map(order => \`
                        <div class="catalog-item">
                            <div>
                                <strong>Order #\${order.invoiceNumber || order.orderId}</strong>
                                <br><small>Date: \${order.orderDate} | Items: \${order.totalItems} | Status: \${order.status}</small>
                                <br><small>Order ID: \${order.orderId}</small>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                                <strong>$\${order.totalValue.toFixed(2)}</strong>
                                <button onclick="deleteOrder('\${order.orderId}')" 
                                        class="btn" 
                                        style="background: #f44336; color: white; padding: 4px 8px; font-size: 12px;">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    \`).join('');
                    
                    // Create and add the clean button
                    const cleanButton = document.createElement('button');
                    cleanButton.textContent = '🧹 Auto-Clean Invalid Orders';
                    cleanButton.className = 'btn';
                    cleanButton.style.cssText = 'background: #ff4444; color: white; margin-bottom: 15px; padding: 10px 20px;';
                    cleanButton.onclick = cleanInvalidOrders;
                    
                    // Set container content
                    container.innerHTML = '';
                    container.appendChild(cleanButton);
                    container.innerHTML += ordersHtml;
                }
            } catch (error) {
                console.error('Error loading orders:', error);
            }
        }
        
        // Load storage locations
        async function loadStorage() {
            try {
                const response = await fetch('/api/storage/locations');
                const data = await response.json();
                
                if (data.success) {
                    const container = document.getElementById('storageLocations');
                    container.innerHTML = data.locations.map(loc => \`
                        <div class="catalog-item">
                            <div>
                                <strong>\${loc.name}</strong>
                                <br><small>Type: \${loc.type} | Temp: \${loc.temp}</small>
                                <br><small>Capacity: \${loc.capacity} units</small>
                            </div>
                            <div>
                                <strong>\${loc.utilizationPercent}%</strong> Used
                                <br><small>\${loc.currentUsage}/\${loc.capacity} units</small>
                                <div style="margin-top: 10px;">
                                    <button class="btn btn-small" onclick="editLocation('\${loc.name}')">✏️ Edit</button>
                                    <button class="btn btn-danger btn-small" onclick="deleteLocation('\${loc.name}')" style="margin-left: 5px;">🗑️ Delete</button>
                                </div>
                            </div>
                        </div>
                    \`).join('');
                    
                    // Update storage utilization metric
                    const avgUtilization = data.locations.reduce((sum, loc) => sum + parseFloat(loc.utilizationPercent), 0) / data.locations.length;
                    document.getElementById('storageUtilization').textContent = avgUtilization.toFixed(1) + '%';
                }
            } catch (error) {
                console.error('Error loading storage:', error);
            }
        }
        
        // Load suppliers
        function loadSuppliers() {
            const suppliersData = ${JSON.stringify(suppliers)};
            const container = document.getElementById('suppliersList');
            
            let html = '';
            Object.entries(suppliersData).forEach(([key, supplier]) => {
                html += '<div class="inventory-item">';
                html += '<h3>' + supplier.name + '</h3>';
                html += '<div><strong>Contact:</strong> ' + supplier.contact + '</div>';
                html += '<div><strong>Email:</strong> ' + supplier.email + '</div>';
                html += '<div><strong>Account:</strong> ' + supplier.accountNumber + '</div>';
                html += '<div><strong>Min Order:</strong> $' + supplier.minimumOrder + '</div>';
                html += '<div><strong>Delivery Days:</strong> ' + supplier.deliveryDays.join(', ') + '</div>';
                html += '<div><strong>Catalog Items:</strong> ' + supplier.catalogItems + '</div>';
                html += '<button class="btn" style="margin-top: 10px;">Create Order</button>';
                html += '</div>';
            });
            container.innerHTML = html;
        }
        
        // Catalog search
        document.getElementById('catalogSearch').addEventListener('input', loadCatalog);
        
        // Logout
        function logout() {
            authToken = null;
            localStorage.removeItem('inventory_token');
            location.reload();
        }
        
        // Check existing token
        const savedToken = localStorage.getItem('inventory_token');
        if (savedToken) {
            authToken = savedToken;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            loadData();
        }
        
        // AI Assistant Functions
        async function sendAIMessage() {
            const input = document.getElementById('aiChatInput');
            const responseDiv = document.getElementById('aiChatResponse');
            
            if (!input.value.trim()) {
                alert('Please enter a message');
                return;
            }
            
            responseDiv.textContent = '🤖 Thinking...';
            
            try {
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ message: input.value.trim() })
                });
                
                const result = await response.json();
                if (result.success) {
                    responseDiv.textContent = result.response;
                } else {
                    responseDiv.textContent = '❌ Error: ' + result.error;
                }
            } catch (error) {
                responseDiv.textContent = '❌ Network error: ' + error.message;
            }
            
            input.value = '';
        }
        
        function askAI(message) {
            document.getElementById('aiChatInput').value = message;
            sendAIMessage();
        }
        
        function generateCountSheet(location) {
            const printUrl = '/api/ai/count-sheets/' + encodeURIComponent(location);
            window.open(printUrl, '_blank');
        }
        
        // Populate count sheets list when AI tab is shown
        function loadCountSheets() {
            const listDiv = document.getElementById('countSheetsList');
            if (!listDiv) return;
            
            let html = '';
            Object.keys(storageLocations).forEach(location => {
                const safeLocation = location.replace(/'/g, "\\'");
                html += '<button onclick="generateCountSheet(\\'' + safeLocation + '\\')" class="btn btn-small" style="background: #607D8B; margin: 3px;">📋 ' + location + '</button>';
            });
            listDiv.innerHTML = html;
        }
        
        // Add Enter key support for AI chat
        document.addEventListener('DOMContentLoaded', function() {
            const aiChatInput = document.getElementById('aiChatInput');
            if (aiChatInput) {
                aiChatInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendAIMessage();
                    }
                });
            }
        });
        
        // Override showTab to load count sheets when AI tab is shown
        const originalShowTab = window.showTab;
        window.showTab = function(tabName) {
            if (originalShowTab) {
                originalShowTab(tabName);
            }
            if (tabName === 'ai-assistant') {
                setTimeout(loadCountSheets, 100);
            }
        };
        
        // Update item location
        async function updateItemLocation(itemId, newLocation) {
            try {
                // First, get current inventory data to find similar items
                const inventoryResponse = await fetch('/api/inventory/items');
                const inventoryData = await inventoryResponse.json();
                
                if (!inventoryData.success) {
                    alert('Error loading inventory data');
                    return;
                }
                
                // Find the moved item
                const movedItem = inventoryData.items.find(item => item.id == itemId);
                if (!movedItem) {
                    alert('Item not found');
                    return;
                }
                
                // Find similar items in the same category
                const similarItems = inventoryData.items.filter(item => 
                    item.id != itemId && 
                    item.category === movedItem.category &&
                    item.location !== newLocation
                );
                
                // Move the selected item first
                const response = await fetch('/api/inventory/items/' + itemId + '/location', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ location: newLocation })
                });
                
                if (response.status === 403) {
                    alert('Your session has expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                if (!result.success) {
                    alert('Error updating location: ' + result.error);
                    return;
                }
                
                // If there are similar items, ask about batch movement
                if (similarItems.length > 0) {
                    const itemNames = similarItems.slice(0, 5).map(item => item.displayName).join('\\n• ');
                    const moreText = similarItems.length > 5 ? \`\\\\n...and \${similarItems.length - 5} more items\` : '';
                    
                    const moveAll = confirm(
                        \`Moved "\${movedItem.displayName}" to \${newLocation}\\\\n\\\\n\` +
                        \`Found \${similarItems.length} other \${movedItem.category} items:\\\\n• \${itemNames}\${moreText}\\\\n\\\\n\` +
                        \`Would you like to move ALL \${movedItem.category} items to \${newLocation}?\`
                    );
                    
                    if (moveAll) {
                        await batchMoveItems(similarItems, newLocation, movedItem.category);
                    }
                }
                
                // Refresh inventory to show updated data
                loadData();
                
                // Show location management option
                setTimeout(() => {
                    if (confirm(\`Would you like to view and organize items in \${newLocation}?\`)) {
                        showLocationManagement(newLocation);
                    }
                }, 500);
                
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        // Batch move multiple items
        async function batchMoveItems(items, newLocation, category) {
            let successCount = 0;
            let failCount = 0;
            
            for (const item of items) {
                try {
                    const response = await fetch('/api/inventory/items/' + item.id + '/location', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken
                        },
                        body: JSON.stringify({ location: newLocation })
                    });
                    
                    if (response.status === 403) {
                        alert('Session expired during batch move. Please log in again.');
                        showSection('login');
                        return;
                    }
                    
                    const result = await response.json();
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    failCount++;
                }
            }
            
            alert(\`Batch Move Complete!\\n\\nSuccessfully moved: \${successCount} items\\nFailed: \${failCount} items\\n\\nAll \${category} items are now in \${newLocation}\`);
        }
        
        // Add item to a new location (multiple locations support)
        async function addItemToLocation(itemId, location) {
            if (!location) return;
            
            try {
                const response = await fetch(\`/api/inventory/items/\${itemId}/location\`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': \`Bearer \${localStorage.getItem('token')}\`
                    },
                    body: JSON.stringify({ location, action: 'add' })
                });
                
                if (response.status === 403) {
                    alert('Session expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                if (result.success) {
                    loadData(); // Refresh the display
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        // Remove item from a location
        async function removeItemFromLocation(itemId, location) {
            try {
                const response = await fetch(\`/api/inventory/items/\${itemId}/location\`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': \`Bearer \${localStorage.getItem('token')}\`
                    },
                    body: JSON.stringify({ location, action: 'remove' })
                });
                
                if (response.status === 403) {
                    alert('Session expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                if (result.success) {
                    loadData(); // Refresh the display
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Network error: ' + error.message);
            }
        }
        
        // Show location manager for an item
        async function showLocationManager(itemId) {
            try {
                const inventoryResponse = await fetch('/api/inventory/items');
                const inventoryData = await inventoryResponse.json();
                
                if (!inventoryData.success) {
                    alert('Error loading inventory data');
                    return;
                }
                
                const item = inventoryData.items.find(item => item.id == itemId);
                if (!item) {
                    alert('Item not found');
                    return;
                }
                
                const modalHtml = \`
                    <div id="itemLocationModal" style="
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                        background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;
                    ">
                        <div style="
                            background: #2c3e50; color: white; padding: 30px; border-radius: 15px; 
                            max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h2>📍 Manage Locations: \${item.displayName}</h2>
                                <button onclick="closeLocationManager()" style="
                                    background: #e74c3c; color: white; border: none; padding: 8px 12px; 
                                    border-radius: 5px; cursor: pointer; font-size: 16px;
                                ">✖ Close</button>
                            </div>
                            
                            <div style="margin-bottom: 20px;">
                                <h3 style="color: #4CAF50; margin-bottom: 10px;">Current Locations:</h3>
                                <div id="currentLocations" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; min-height: 60px;">
                                    \${item.locations && item.locations.length > 0 ? 
                                        item.locations.map(loc => 
                                            \`<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 5px 0; background: rgba(76,175,80,0.3); border-radius: 5px;">
                                                <span><strong>\${loc}</strong></span>
                                                <button onclick="removeItemFromLocation(\${itemId}, '\${loc}')" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">Remove</button>
                                            </div>\`
                                        ).join('') : 
                                        '<p style="color: #888; text-align: center;">No locations assigned</p>'
                                    }
                                </div>
                            </div>
                            
                            <div>
                                <h3 style="color: #2196F3; margin-bottom: 10px;">Add to Location:</h3>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                                    \${Object.entries(frontendStorageLocations).map(([name, info]) => \`
                                        <button onclick="addItemToLocation(\${itemId}, '\${name}')" style="
                                            background: \${item.locations && item.locations.includes(name) ? '#95a5a6' : '#3498db'}; 
                                            color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; text-align: left;
                                            \${item.locations && item.locations.includes(name) ? 'opacity: 0.6;' : ''}
                                        " \${item.locations && item.locations.includes(name) ? 'disabled' : ''}>
                                            <strong>\${name}</strong><br>
                                            <small>\${info.type} • \${info.temp}</small>
                                        </button>
                                    \`).join('')}
                                </div>
                            </div>
                            
                            <div style="margin-top: 20px; text-align: center;">
                                <button onclick="batchLocationActions(\${itemId})" style="background: #9b59b6; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                                    🎯 Quick Actions
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
                
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            } catch (error) {
                alert('Error loading location manager: ' + error.message);
            }
        }
        
        // Close location manager modal
        function closeLocationManager() {
            const modal = document.getElementById('itemLocationModal');
            if (modal) {
                modal.remove();
            }
        }
        
        // Show location management interface
        async function showLocationManagement(locationName) {
            try {
                const inventoryResponse = await fetch('/api/inventory/items');
                const inventoryData = await inventoryResponse.json();
                
                if (!inventoryData.success) {
                    alert('Error loading inventory data');
                    return;
                }
                
                const itemsInLocation = inventoryData.items.filter(item => item.location === locationName);
                
                const modalHtml = \`
                    <div id="locationManagementModal" style="
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                        background: rgba(0,0,0,0.9); z-index: 1000; display: flex; 
                        align-items: center; justify-content: center;
                    ">
                        <div style="
                            background: #2c3e50; color: white; padding: 30px; border-radius: 15px; 
                            max-width: 95%; max-height: 95%; overflow-y: auto; min-width: 900px;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h2>📍 Managing Location: \${locationName}</h2>
                                <button onclick="closeLocationManagement()" style="
                                    background: #e74c3c; color: white; border: none; padding: 8px 12px; 
                                    border-radius: 5px; cursor: pointer; font-size: 16px;
                                ">✖ Close</button>
                            </div>
                            
                            <div style="margin-bottom: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                                <h3>📊 Location Summary</h3>
                                <p>Total Items: <strong>\${itemsInLocation.length}</strong> | 
                                   Total Value: <strong>$\${itemsInLocation.reduce((sum, item) => sum + (item.totalValue || 0), 0).toFixed(2)}</strong></p>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                                <!-- Items List with Manual Count -->
                                <div>
                                    <h3 style="color: #4CAF50;">📦 Items in \${locationName} (\${itemsInLocation.length})</h3>
                                    <div style="max-height: 500px; overflow-y: auto; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                                        \${itemsInLocation.length === 0 ? 
                                            '<p style="color: #bbb; text-align: center;">No items in this location</p>' :
                                            itemsInLocation.map((item, index) => \`
                                                <div style="background: rgba(255,255,255,0.1); padding: 12px; margin-bottom: 10px; border-radius: 5px; border-left: 4px solid #4CAF50;">
                                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                                        <div>
                                                            <strong>\${item.displayName}</strong>
                                                            <br><small>Expected: \${item.quantity} \${item.unit} | Code: \${item.supplierCode}</small>
                                                            <br><small>Category: \${item.category} | Value: $\${item.totalValue.toFixed(2)}</small>
                                                        </div>
                                                        <div style="text-align: right;">
                                                            <label style="font-size: 12px;">Manual Count:</label>
                                                            <input type="number" 
                                                                   id="count_\${item.id}" 
                                                                   placeholder="\${item.quantity}"
                                                                   style="width: 80px; padding: 4px; margin-left: 5px; text-align: center;"
                                                                   onchange="updateManualCount(\${item.id}, this.value)">
                                                        </div>
                                                    </div>
                                                </div>
                                            \`).join('')
                                        }
                                    </div>
                                    <div style="margin-top: 15px; text-align: center;">
                                        <button onclick="saveAllCounts('\${locationName}')" class="btn" style="background: #4CAF50;">
                                            💾 Save All Manual Counts
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Sequence Management -->
                                <div>
                                    <h3 style="color: #FF9800;">🔢 Counting Sequence</h3>
                                    <p style="margin-bottom: 15px;">Arrange items in the order you want to count them:</p>
                                    <div id="sequenceList" style="max-height: 500px; overflow-y: auto; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                                        \${itemsInLocation.map((item, index) => \`
                                            <div class="sequence-item" draggable="true" data-item-id="\${item.id}" style="
                                                background: rgba(255,255,255,0.2); padding: 10px; margin-bottom: 8px; 
                                                border-radius: 5px; cursor: move; border-left: 3px solid #FF9800;
                                                display: flex; justify-content: space-between; align-items: center;
                                            ">
                                                <div>
                                                    <strong>\${index + 1}.</strong> \${item.displayName}
                                                    <br><small>\${item.quantity} \${item.unit}</small>
                                                </div>
                                                <div style="font-size: 18px; color: #ccc;">⋮⋮</div>
                                            </div>
                                        \`).join('')}
                                    </div>
                                    <div style="margin-top: 15px; text-align: center;">
                                        <button onclick="generateCountSheet('\${locationName}')" class="btn" style="background: #2196F3;">
                                            📋 Generate Count Sheet
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                \`;
                
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                
            } catch (error) {
                console.error('Error loading location management:', error);
                alert('Error loading location management: ' + error.message);
            }
        }
        
        // Close location management modal
        function closeLocationManagement() {
            const modal = document.getElementById('locationManagementModal');
            if (modal) {
                modal.remove();
            }
        }
        
        // Update manual count for an item
        function updateManualCount(itemId, newCount) {
            // Store manual count for later saving
            if (!window.manualCounts) {
                window.manualCounts = {};
            }
            window.manualCounts[itemId] = parseInt(newCount) || 0;
        }
        
        // Save all manual counts
        async function saveAllCounts(locationName) {
            if (!window.manualCounts || Object.keys(window.manualCounts).length === 0) {
                alert('No manual counts entered');
                return;
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (const [itemId, count] of Object.entries(window.manualCounts)) {
                try {
                    const response = await fetch(\`/api/inventory/items/\${itemId}\`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken
                        },
                        body: JSON.stringify({ quantity: count })
                    });
                    
                    if (response.status === 403) {
                        alert('Session expired. Please log in again.');
                        showSection('login');
                        return;
                    }
                    
                    const result = await response.json();
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    failCount++;
                }
            }
            
            alert(\`📊 Manual Count Update Complete!\\n\\n✅ Updated: \${successCount} items\\n❌ Failed: \${failCount} items\\n\\nLocation: \${locationName}\`);
            
            // Clear manual counts and refresh
            window.manualCounts = {};
            closeLocationManagement();
            loadData();
        }
        
        // Generate printable count sheet
        function generateCountSheet(locationName) {
            const sequenceItems = Array.from(document.querySelectorAll('.sequence-item')).map((item, index) => {
                const itemId = item.getAttribute('data-item-id');
                const itemName = item.querySelector('strong').nextSibling.textContent.trim();
                const itemDetails = item.querySelector('small').textContent;
                return \`\${index + 1}. \${itemName} (\${itemDetails})\`;
            });
            
            const countSheet = \`
                📍 INVENTORY COUNT SHEET - \${locationName}
                Date: \${new Date().toLocaleDateString()}
                Time: \${new Date().toLocaleTimeString()}
                
                Instructions: Count items in this order and enter actual quantities
                
                \${sequenceItems.join('\\n')}
                
                ________________
                Counter Signature: _________________ Date: _______
                Verified By: _________________ Date: _______
            \`;
            
            // Open in new window for printing
            const printWindow = window.open('', '_blank');
            printWindow.document.write(\`
                <html>
                <head><title>Count Sheet - \${locationName}</title></head>
                <body style="font-family: monospace; padding: 20px; white-space: pre-line;">
                \${countSheet}
                </body>
                </html>
            \`);
            printWindow.document.close();
            printWindow.print();
        }
        
        // Download inventory
        function downloadInventory(format) {
            const downloadUrl = '/api/inventory/download/' + format + '?token=' + authToken;
            window.open(downloadUrl, '_blank');
        }
        
        async function deleteOrder(orderId) {
            if (!confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch('/api/orders/gfs/' + orderId, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + authToken,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.status === 403) {
                    alert('Your session has expired. Please log in again.');
                    showSection('login');
                    return;
                }
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Order deleted successfully!\\n\\n' +
                          'Order ID: ' + result.deletedOrder.orderId + '\\n' +
                          'Items: ' + result.deletedOrder.totalItems + '\\n' +
                          'Value: $' + result.deletedOrder.totalValue.toFixed(2) + '\\n\\n' +
                          'New totals:\\n' +
                          'Orders: ' + result.newTotals.totalOrders + '\\n' +
                          'Inventory Items: ' + result.newTotals.totalInventoryItems);
                    
                    // Refresh the orders list and inventory data
                    showSection('orders');
                    loadData();
                } else {
                    alert('Error deleting order: ' + result.error);
                }
            } catch (error) {
                console.error('Error deleting order:', error);
                alert('Failed to delete order. Please try again.');
            }
        }
        
        // Quick Add Item by Stock Number
        async function quickAddItem() {
            const code = document.getElementById('quickAddCode').value.trim();
            const location = document.getElementById('quickAddLocation').value;
            const quantity = parseInt(document.getElementById('quickAddQuantity').value) || 1;
            
            if (!code) {
                alert('Please enter a product/stock number');
                return;
            }
            
            if (!location) {
                alert('Please select a location');
                return;
            }
            
            try {
                // First search for the item
                const searchResponse = await fetch(\`/api/catalog/search/\${encodeURIComponent(code)}\`);
                const searchResult = await searchResponse.json();
                
                if (!searchResult.success || searchResult.items.length === 0) {
                    alert('No items found with stock number: ' + code);
                    return;
                }
                
                // If multiple items found, show selection dialog
                if (searchResult.items.length > 1) {
                    showItemSelectionDialog(searchResult.items, location, quantity);
                    return;
                }
                
                // Single item found, confirm and add
                const item = searchResult.items[0];
                const confirmMessage = \`Add this item to inventory?\\n\\n\` +
                    \`Name: \${item.displayName}\\n\` +
                    \`Source: \${item.source.toUpperCase()}\\n\` +
                    \`Stock#: \${item.stockNumber}\\n\` +
                    \`Category: \${item.category}\\n\` +
                    \`Quantity: \${quantity}\\n\` +
                    \`Location: \${location}\`;
                
                if (confirm(confirmMessage)) {
                    await addItemToInventory(item.stockNumber, quantity, location);
                }
                
            } catch (error) {
                console.error('Error adding item:', error);
                alert('Failed to add item. Please try again.');
            }
        }
        
        // Show dialog for selecting from multiple found items
        function showItemSelectionDialog(items, location, quantity) {
            const modalHtml = \`
                <div id="itemSelectionModal" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;
                ">
                    <div style="
                        background: #2c3e50; color: white; padding: 30px; border-radius: 15px; 
                        max-width: 800px; width: 90%; max-height: 80%; overflow-y: auto;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2>🔍 Multiple Items Found</h2>
                            <button onclick="closeItemSelectionDialog()" style="
                                background: #e74c3c; color: white; border: none; padding: 8px 12px; 
                                border-radius: 5px; cursor: pointer; font-size: 16px;
                            ">✖ Close</button>
                        </div>
                        
                        <p style="margin-bottom: 20px;">Select the item you want to add:</p>
                        
                        <div style="display: grid; gap: 10px;">
                            \${items.map((item, index) => \`
                                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; cursor: pointer; border: 2px solid transparent;" 
                                     onclick="selectItem('\${item.stockNumber}', '\${location}', \${quantity})">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <strong>\${item.displayName}</strong>
                                            <br><small>Stock#: \${item.stockNumber} | Source: \${item.source.toUpperCase()}</small>
                                            <br><small>Category: \${item.category}</small>
                                        </div>
                                        <button style="background: #4CAF50; color: white; border: none; padding: 8px 12px; border-radius: 5px;">
                                            Select
                                        </button>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                </div>
            \`;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        function closeItemSelectionDialog() {
            const modal = document.getElementById('itemSelectionModal');
            if (modal) {
                modal.remove();
            }
        }
        
        async function selectItem(stockNumber, location, quantity) {
            closeItemSelectionDialog();
            await addItemToInventory(stockNumber, location, quantity);
        }
        
        // Add item to inventory using the new API
        async function addItemToInventory(stockNumber, quantity, location) {
            try {
                const response = await fetch('/api/inventory/add-by-stock', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + authToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        stockNumber: stockNumber,
                        quantity: quantity,
                        location: location
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Item added successfully!');
                    document.getElementById('quickAddCode').value = '';
                    document.getElementById('quickAddQuantity').value = '1';
                    loadData(); // Refresh inventory
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                console.error('Error adding item:', error);
                alert('Failed to add item. Please try again.');
            }
        }
        
        // Filter inventory by location
        function filterByLocation() {
            const selectedLocation = document.getElementById('locationFilter').value;
            const items = document.querySelectorAll('.inventory-item');
            
            items.forEach(item => {
                if (!selectedLocation || item.textContent.includes(selectedLocation)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }
        
        // Counting Mode - Sequential counting interface
        function showCountingMode() {
            const location = document.getElementById('locationFilter').value;
            if (!location) {
                alert('Please select a location first to enter counting mode');
                return;
            }
            
            const countingUrl = '/api/inventory/counting-mode/' + encodeURIComponent(location) + '?token=' + authToken;
            window.open(countingUrl, '_blank', 'width=800,height=600');
        }
        
        // Start Inventory Process
        function startInventoryProcess() {
            if (confirm('Start a new inventory process? This will create a snapshot of current inventory.')) {
                // Implementation for inventory processing cycle
                alert('Inventory process started! (Feature in development)');
            }
        }
        
        // Populate location dropdowns
        function populateLocationDropdowns() {
            const quickAddSelect = document.getElementById('quickAddLocation');
            const filterSelect = document.getElementById('locationFilter');
            
            // Clear existing options
            quickAddSelect.innerHTML = '<option value="">Select Location</option>';
            filterSelect.innerHTML = '<option value="">All Locations</option>';
            
            // Add storage locations
            Object.keys(storageLocations).forEach(location => {
                quickAddSelect.innerHTML += '<option value="' + location + '">' + location + '</option>';
                filterSelect.innerHTML += '<option value="' + location + '">' + location + '</option>';
            });
        }
        
        async function cleanInvalidOrders() {
            const validIds = new Set([
                '2002362584', '2002373141',
                '9021570039', '9021570042', '9021570043',
                '9021750789', '9021819128', '9021819129',
                '9021819130', '9021819131'
            ]);

            const response = await fetch('/api/orders/gfs');
            const data = await response.json();
            if (!data.success) {
                alert('❌ Failed to fetch orders');
                return;
            }

            // Remove duplicates first
            const uniqueOrders = [];
            const seenIds = new Set();
            for (const order of data.orders) {
                if (!seenIds.has(order.orderId)) {
                    uniqueOrders.push(order);
                    seenIds.add(order.orderId);
                }
            }

            const ordersToDelete = uniqueOrders.filter(order => !validIds.has(order.orderId));
            let deletedCount = 0;
            
            for (const order of ordersToDelete) {
                try {
                    const del = await fetch('/api/orders/gfs/' + order.orderId, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + authToken
                        }
                    });
                    
                    if (del.ok) {
                        const result = await del.json();
                        console.log('🗑️ Deleted order ' + order.orderId, result);
                        deletedCount++;
                    } else {
                        console.log('⚠️ Failed to delete order ' + order.orderId + ' (already deleted?)');
                    }
                } catch (error) {
                    console.log('⚠️ Error deleting order ' + order.orderId + ':', error);
                }
            }

            alert('🧹 Deleted ' + deletedCount + ' invalid GFS orders.');
            showSection('orders'); // Refresh list
        }
        
        // Initialize
        updateUILanguage();
        populateLocationDropdowns();
    </script>
</body>
</html>`);
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Initialize server with all data loading
async function initializeServer() {
  try {
    console.log('🔄 Loading data...');
    
    // Load Sysco catalog
    const catalogPath = path.join(__dirname, 'data', 'catalog', 'sysco_catalog_1753182965099.json');
    const catalogData = await fs.readFile(catalogPath, 'utf8');
    const catalogJson = JSON.parse(catalogData);
    syscoCatalog = catalogJson.items || [];
    console.log(`✅ Loaded Sysco catalog: ${syscoCatalog.length} items`);

    // Load GFS orders
    const gfsOrdersPath = path.join(__dirname, 'data', 'gfs_orders');
    const gfsFiles = await fs.readdir(gfsOrdersPath);
    for (const file of gfsFiles) {
      if (file.startsWith('gfs_order_') && !file.includes('deleted') && file.endsWith('.json')) {
        try {
          const orderData = await fs.readFile(path.join(gfsOrdersPath, file), 'utf8');
          const order = JSON.parse(orderData);
          gfsOrders.push(order);
        } catch (error) {
          console.log(`⚠️ Skipped corrupted file: ${file}`);
        }
      }
    }
    console.log(`✅ Loaded GFS orders: ${gfsOrders.length} orders`);

    // Generate full inventory AFTER data is loaded
    inventory = generateFullInventory();
    console.log(`✅ Generated full inventory: ${inventory.length} items`);

  } catch (error) {
    console.log('⚠️ Some data files not found, using defaults');
  }
}

// Start server
async function startServer() {
  await initializeServer();
  
  const server = app.listen(PORT, () => {
    console.log('\\n🏕️  COMPLETE BILINGUAL INVENTORY SYSTEM STARTED');
    console.log('✅ Features Active:');
    console.log(`   • Bilingual (English/French) interface`);
    console.log(`   • Sysco catalog: ${syscoCatalog.length} items loaded`);
    console.log(`   • GFS orders: ${gfsOrders.length} orders loaded`);
    console.log(`   • Full inventory: ${inventory.length} items total`);
    console.log('   • Storage locations: 11 locations tracked');
    console.log('   • All inventory items with locations');
    console.log('\\n📦 Server: http://localhost:' + PORT);
    console.log('🔐 Login: david.mikulis@camp-inventory.com / inventory2025');
    console.log('\\n🔒 PROPRIETARY SOFTWARE - © 2025 David Mikulis');
    console.log('⚠️  UNAUTHORIZED USE PROHIBITED\\n');
  });
  
  return server;
}

// Initialize and start the server
let server;
startServer().then(s => {
  server = s;
}).catch(console.error);

process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down...');
  if (server) {
    server.close(() => {
      console.log('✅ System stopped');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

module.exports = app;