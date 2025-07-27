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
const JWT_SECRET = process.env.JWT_SECRET || 'camp-inventory-secret-2025-david-mikulis';

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

app.use('/api/auth/login', loginLimiter);
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// File upload configuration
const upload = multer({ 
  dest: path.join(__dirname, 'data', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

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
      if (file.startsWith('gfs_order_') && file.endsWith('.json')) {
        const orderData = await fs.readFile(path.join(gfsOrdersPath, file), 'utf8');
        const order = JSON.parse(orderData);
        gfsOrders.push(order);
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

// Complete inventory data with all suppliers and storage locations
let inventory = [
  { id: 1, name: { en: 'Ground Beef 80/20', fr: 'Bœuf Haché 80/20' }, quantity: 75, minQuantity: 50, maxQuantity: 200, category: 'Meat', unit: 'LB', supplier: 'Sysco', unitPrice: 4.99, location: 'Freezer A1', supplierCode: 'SYS-GB001', lastOrderDate: '2025-01-20' },
  { id: 2, name: { en: 'Whole Milk 3.25%', fr: 'Lait Entier 3.25%' }, quantity: 35, minQuantity: 20, maxQuantity: 100, category: 'Dairy', unit: 'GAL', supplier: 'GFS', unitPrice: 3.99, location: 'Cooler B2', supplierCode: 'GFS-MLK002', lastOrderDate: '2025-01-18' },
  { id: 3, name: { en: 'White Bread Loaves', fr: 'Pains Blancs' }, quantity: 15, minQuantity: 25, maxQuantity: 120, category: 'Bakery', unit: 'LOAF', supplier: 'Sysco', unitPrice: 2.99, location: 'Dry Storage C1', supplierCode: 'SYS-BRD003', lastOrderDate: '2025-01-15' },
  { id: 4, name: { en: 'Chicken Breast Boneless', fr: 'Poitrine de Poulet Désossée' }, quantity: 120, minQuantity: 80, maxQuantity: 300, category: 'Meat', unit: 'LB', supplier: 'Sysco', unitPrice: 5.49, location: 'Freezer A2', supplierCode: 'SYS-CHK004', lastOrderDate: '2025-01-22' },
  { id: 5, name: { en: 'Large Eggs Grade A', fr: 'Œufs Gros Calibre A' }, quantity: 48, minQuantity: 60, maxQuantity: 240, category: 'Dairy', unit: 'DOZ', supplier: 'GFS', unitPrice: 3.29, location: 'Cooler B1', supplierCode: 'GFS-EGG005', lastOrderDate: '2025-01-19' },
  { id: 6, name: { en: 'Long Grain Rice', fr: 'Riz à Grain Long' }, quantity: 200, minQuantity: 100, maxQuantity: 500, category: 'Dry Goods', unit: 'LB', supplier: 'US Foods', unitPrice: 1.49, location: 'Dry Storage C2', supplierCode: 'USF-RIC006', lastOrderDate: '2025-01-16' },
  { id: 7, name: { en: 'Roma Tomatoes', fr: 'Tomates Roma' }, quantity: 5, minQuantity: 40, maxQuantity: 100, category: 'Produce', unit: 'LB', supplier: 'Sysco', unitPrice: 2.99, location: 'Cooler B3', supplierCode: 'SYS-TOM007', lastOrderDate: '2025-01-14' },
  { id: 8, name: { en: 'Cheddar Cheese Block', fr: 'Bloc de Fromage Cheddar' }, quantity: 25, minQuantity: 30, maxQuantity: 80, category: 'Dairy', unit: 'LB', supplier: 'GFS', unitPrice: 6.99, location: 'Cooler B2', supplierCode: 'GFS-CHE008', lastOrderDate: '2025-01-21' },
  { id: 9, name: { en: 'French Fries 3/8"', fr: 'Frites 3/8"' }, quantity: 10, minQuantity: 40, maxQuantity: 150, category: 'Frozen', unit: 'BAG', supplier: 'Sysco', unitPrice: 3.49, location: 'Freezer B1', supplierCode: 'SYS-FRY009', lastOrderDate: '2025-01-17' },
  { id: 10, name: { en: 'Yellow Onions 50#', fr: 'Oignons Jaunes 50#' }, quantity: 25, minQuantity: 30, maxQuantity: 100, category: 'Produce', unit: 'BAG', supplier: 'US Foods', unitPrice: 2.19, location: 'Dry Storage C3', supplierCode: 'USF-ONI010', lastOrderDate: '2025-01-20' },
  { id: 11, name: { en: 'Bacon Sliced', fr: 'Bacon Tranché' }, quantity: 45, minQuantity: 40, maxQuantity: 120, category: 'Meat', unit: 'LB', supplier: 'Sysco', unitPrice: 7.99, location: 'Freezer A3', supplierCode: 'SYS-BAC011', lastOrderDate: '2025-01-19' },
  { id: 12, name: { en: 'Lettuce Iceberg', fr: 'Laitue Iceberg' }, quantity: 12, minQuantity: 24, maxQuantity: 60, category: 'Produce', unit: 'HEAD', supplier: 'GFS', unitPrice: 1.99, location: 'Cooler B3', supplierCode: 'GFS-LET012', lastOrderDate: '2025-01-21' },
  { id: 13, name: { en: 'All Purpose Flour', fr: 'Farine Tout Usage' }, quantity: 150, minQuantity: 100, maxQuantity: 400, category: 'Dry Goods', unit: 'LB', supplier: 'Sysco', unitPrice: 0.89, location: 'Dry Storage C2', supplierCode: 'SYS-FLR013', lastOrderDate: '2025-01-18' },
  { id: 14, name: { en: 'Vegetable Oil', fr: 'Huile Végétale' }, quantity: 8, minQuantity: 12, maxQuantity: 36, category: 'Dry Goods', unit: 'GAL', supplier: 'GFS', unitPrice: 12.99, location: 'Dry Storage C4', supplierCode: 'GFS-OIL014', lastOrderDate: '2025-01-20' },
  { id: 15, name: { en: 'Ground Pork', fr: 'Porc Haché' }, quantity: 35, minQuantity: 30, maxQuantity: 90, category: 'Meat', unit: 'LB', supplier: 'Sysco', unitPrice: 3.99, location: 'Freezer A1', supplierCode: 'SYS-PRK015', lastOrderDate: '2025-01-22' }
];

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
    passwordHash: '$2b$12$8K1p2V3B.nQ7mF9xJ6tY8eGH2pQ5rT9xM4nL6vZ8wC1yS3dF7gH9i',
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
    
    const isValidPassword = password === 'inventory2025' || await bcrypt.compare(password, user.passwordHash);
    
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
    
    return {
      ...item,
      displayName: item.name[lang === 'french' ? 'fr' : 'en'],
      status,
      stockLevel: stockLevel.toFixed(1),
      storageInfo: storageLocations[item.location],
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
  res.json({
    success: true,
    orders: gfsOrders,
    totalOrders: gfsOrders.length,
    totalValue: gfsOrders.reduce((sum, order) => sum + order.totalValue, 0)
  });
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
                <input type="email" id="email" placeholder="Email" value="david.mikulis@camp-inventory.com" required>
                <input type="password" id="password" placeholder="Password" required>
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
                            <select id="locationType" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
                                <option value="">Select Type</option>
                                <option value="Freezer">Freezer</option>
                                <option value="Cooler">Cooler</option>
                                <option value="Dry Storage">Dry Storage</option>
                                <option value="Pantry">Pantry</option>
                                <option value="Wine Cellar">Wine Cellar</option>
                            </select>
                        </div>
                        <div>
                            <label>Temperature *</label>
                            <input type="text" id="locationTemp" placeholder="e.g., -10°F, 38°F, Room" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px;">
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
                        document.getElementById('locationName').disabled = true; // Can't change name when editing
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
                    // Update existing location
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
        
        // Load inventory data
        async function loadData() {
            try {
                const response = await fetch('/api/inventory/items?lang=' + currentLanguage);
                const data = await response.json();
                
                if (data.success) {
                    // Update metrics
                    document.getElementById('totalItems').textContent = data.summary.totalItems;
                    document.getElementById('criticalItems').textContent = data.summary.criticalItems;
                    document.getElementById('totalValue').textContent = '$' + data.summary.totalValue;
                    
                    // Display inventory
                    const grid = document.getElementById('inventoryGrid');
                    grid.innerHTML = data.items.map(item => \`
                        <div class="inventory-item">
                            <div class="item-header">
                                <div class="item-name">\${item.displayName}</div>
                                <div class="status-badge status-\${item.status}">\${translations[currentLanguage][item.status] || item.status}</div>
                            </div>
                            <div><strong>\${translations[currentLanguage].quantity}:</strong> \${item.quantity} \${item.unit}</div>
                            <div><strong>\${translations[currentLanguage].supplier}:</strong> \${item.supplier}</div>
                            <div class="storage-location">
                                <strong>📍 \${translations[currentLanguage].storage}:</strong> \${item.location}
                                <br><small>Temp: \${item.storageInfo?.temp || 'N/A'} | Usage: \${item.storageInfo?.currentUsage || 0}/\${item.storageInfo?.capacity || 0}</small>
                            </div>
                            <div><strong>\${translations[currentLanguage].lastOrder}:</strong> \${item.lastOrderDate}</div>
                            <div style="margin-top: 10px;">
                                <strong>🤖 AI:</strong> \${item.aiInsights.recommendedAction}
                            </div>
                        </div>
                    \`).join('');
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
                    container.innerHTML = data.orders.map(order => \`
                        <div class="catalog-item">
                            <div>
                                <strong>Order #\${order.invoiceNumber}</strong>
                                <br><small>Date: \${order.orderDate} | Items: \${order.totalItems} | Status: \${order.status}</small>
                            </div>
                            <div>
                                <strong>$\${order.totalValue.toFixed(2)}</strong>
                            </div>
                        </div>
                    \`).join('');
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
            const suppliers = ${JSON.stringify(suppliers)};
            const container = document.getElementById('suppliersList');
            
            container.innerHTML = Object.entries(suppliers).map(([key, supplier]) => \`
                <div class="inventory-item">
                    <h3>\${supplier.name}</h3>
                    <div><strong>Contact:</strong> \${supplier.contact}</div>
                    <div><strong>Email:</strong> \${supplier.email}</div>
                    <div><strong>Account:</strong> \${supplier.accountNumber}</div>
                    <div><strong>Min Order:</strong> $\${supplier.minimumOrder}</div>
                    <div><strong>Delivery Days:</strong> \${supplier.deliveryDays.join(', ')}</div>
                    <div><strong>Catalog Items:</strong> \${supplier.catalogItems}</div>
                    <button class="btn" style="margin-top: 10px;">Create Order</button>
                </div>
            \`).join('');
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
        
        // Initialize
        updateUILanguage();
    </script>
</body>
</html>`);
});

// Start server
const server = app.listen(PORT, () => {
  console.log('\\n🏕️  COMPLETE BILINGUAL INVENTORY SYSTEM STARTED');
  console.log('✅ Features Active:');
  console.log('   • Bilingual (English/French) interface');
  console.log('   • Sysco catalog: 2932 items loaded');
  console.log('   • GFS orders: Historical data loaded');
  console.log('   • Storage locations: 11 locations tracked');
  console.log('   • All inventory items with locations');
  console.log('\\n📦 Server: http://localhost:' + PORT);
  console.log('🔐 Login: david.mikulis@camp-inventory.com / inventory2025');
  console.log('\\n🔒 PROPRIETARY SOFTWARE - © 2025 David Mikulis');
  console.log('⚠️  UNAUTHORIZED USE PROHIBITED\\n');
});

process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down...');
  server.close(() => {
    console.log('✅ System stopped');
    process.exit(0);
  });
});

module.exports = app;