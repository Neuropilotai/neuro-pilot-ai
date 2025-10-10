#!/usr/bin/env node

/**
 * Quick fix to run inventory system with simplified authentication
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = 8083;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple middleware to bypass auth for testing
app.use((req, res, next) => {
  // Set a mock user for all requests
  req.user = {
    id: 1,
    email: 'neuro.pilot.ai@gmail.com',
    role: 'admin',
    name: 'David Mikulis'
  };
  next();
});

// Load the main inventory routes
const inventoryGlobals = require('./routes/inventoryGlobals');

// Initialize inventory globals with data
async function loadInitialData() {
  try {
    // Load Sysco catalog
    const syscoPath = path.join(__dirname, 'data', 'catalog', 'sysco_catalog_1753182965099.json');
    if (fsSync.existsSync(syscoPath)) {
      const syscoData = JSON.parse(await fs.readFile(syscoPath, 'utf8'));
      inventoryGlobals.setSyscoCatalog(syscoData);
      console.log(`✅ Loaded Sysco catalog: ${syscoData.length} items`);
    }

    // Load GFS orders
    const gfsOrdersDir = path.join(__dirname, 'data', 'gfs_orders');
    if (fsSync.existsSync(gfsOrdersDir)) {
      const files = await fs.readdir(gfsOrdersDir);
      const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('deleted'));
      const orders = [];
      
      for (const file of jsonFiles) {
        try {
          const orderData = JSON.parse(await fs.readFile(path.join(gfsOrdersDir, file), 'utf8'));
          orders.push(orderData);
        } catch (err) {
          console.log(`Skipping file ${file}:`, err.message);
        }
      }
      
      inventoryGlobals.setGfsOrders(orders);
      console.log(`✅ Loaded GFS orders: ${orders.length} orders`);
    }

    // Load storage locations
    const locationsPath = path.join(__dirname, 'data', 'storage_locations', 'locations.json');
    if (fsSync.existsSync(locationsPath)) {
      const locations = JSON.parse(await fs.readFile(locationsPath, 'utf8'));
      inventoryGlobals.setStorageLocations(locations);
      console.log(`✅ Loaded storage locations: ${locations.length} locations`);
    }

    // Generate full inventory
    inventoryGlobals.generateFullInventory();
    const inventory = inventoryGlobals.getFullInventory();
    console.log(`✅ Generated full inventory: ${inventory.length} items`);

  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// API Routes (no auth required for testing)
app.get('/api/storage/locations', (req, res) => {
  const locations = inventoryGlobals.getStorageLocations();
  res.json({ success: true, locations });
});

app.get('/api/inventory/location/:locationName', (req, res) => {
  const { locationName } = req.params;
  const inventory = inventoryGlobals.getFullInventory();
  const itemsAtLocation = inventory.filter(item => 
    item.location === decodeURIComponent(locationName)
  );
  res.json({ success: true, items: itemsAtLocation });
});

app.get('/api/inventory/full', (req, res) => {
  const inventory = inventoryGlobals.getFullInventory();
  res.json({ success: true, inventory });
});

app.get('/api/sysco/catalog', (req, res) => {
  const catalog = inventoryGlobals.getSyscoCatalog();
  res.json({ success: true, catalog });
});

app.get('/api/gfs/orders', (req, res) => {
  const orders = inventoryGlobals.getGfsOrders();
  res.json({ success: true, orders });
});

// Mock login endpoint that always succeeds
app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    token: 'mock-token-for-testing',
    user: {
      id: 1,
      email: 'neuro.pilot.ai@gmail.com',
      name: 'David Mikulis',
      role: 'admin'
    }
  });
});

// Serve the HTML interface
app.get('/', async (req, res) => {
  try {
    const htmlPath = path.join(__dirname, 'public', 'index-secure.html.bak');
    if (fsSync.existsSync(htmlPath)) {
      const html = await fs.readFile(htmlPath, 'utf8');
      res.send(html);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Inventory System</title>
        </head>
        <body>
          <h1>🏕️ Inventory System Running</h1>
          <p>Server is running on port ${PORT}</p>
          <p>API Endpoints available:</p>
          <ul>
            <li>/api/storage/locations</li>
            <li>/api/inventory/full</li>
            <li>/api/sysco/catalog</li>
            <li>/api/gfs/orders</li>
          </ul>
        </body>
        </html>
      `);
    }
  } catch (error) {
    res.status(500).send('Error loading interface');
  }
});

// Start server
async function start() {
  await loadInitialData();
  
  app.listen(PORT, () => {
    console.log(`
🏕️  INVENTORY SYSTEM (AUTH-FREE MODE)
📦 Server: http://localhost:${PORT}
✅ All API endpoints accessible without authentication
⚠️  This is for testing only - do not use in production
    `);
  });
}

start();