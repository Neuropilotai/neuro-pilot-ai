#!/usr/bin/env node
// Minimal API Server - no problematic dependencies
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// CORS headers
function setCORSHeaders(res, origin) {
  const allowedOrigins = ['http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500'];
  
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// Helper functions
function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, statusCode = 500) {
  sendJSON(res, { error: message }, statusCode);
}

// Load real GFS orders and Sysco catalog data
const fsPromises = require('fs').promises;

let gfsOrders = [];
let syscoCatalog = [];
let combinedInventory = { items: [], locations: [], orders: [], catalog: [] };

// Function to load GFS orders
async function loadGFSOrders() {
  try {
    const gfsDir = path.join(__dirname, 'backend/data/gfs_orders');
    const files = await fsPromises.readdir(gfsDir);
    const orderFiles = files.filter(f => f.startsWith('gfs_order_') && f.endsWith('.json'));
    
    gfsOrders = [];
    for (const file of orderFiles.slice(0, 10)) { // Load first 10 orders
      try {
        const filePath = path.join(gfsDir, file);
        const content = await fsPromises.readFile(filePath, 'utf8');
        const order = JSON.parse(content);
        gfsOrders.push(order);
      } catch (err) {
        console.warn(`Failed to load ${file}:`, err.message);
      }
    }
    console.log(`✅ Loaded ${gfsOrders.length} GFS orders`);
  } catch (err) {
    console.warn('GFS orders directory not found, using fallback data');
  }
}

// Function to load Sysco catalog
async function loadSyscoCatalog() {
  try {
    const catalogPath = path.join(__dirname, 'backend/data/catalog/sysco_catalog_1753182965099.json');
    const content = await fsPromises.readFile(catalogPath, 'utf8');
    const catalog = JSON.parse(content);
    syscoCatalog = catalog.items ? catalog.items.slice(0, 50) : []; // Load first 50 items
    console.log(`✅ Loaded ${syscoCatalog.length} Sysco catalog items`);
  } catch (err) {
    console.warn('Sysco catalog not found, using fallback data');
  }
}

// Function to build combined inventory
function buildCombinedInventory() {
  const items = [];
  
  // Add GFS order items as inventory
  gfsOrders.forEach((order, orderIndex) => {
    if (order.items) {
      order.items.slice(0, 5).forEach((item, itemIndex) => { // 5 items per order
        items.push({
          id: `gfs_${orderIndex}_${itemIndex}`,
          name: item.productName || item.name || 'Unknown Product',
          category: 'GFS Order Items',
          quantity: item.quantity || 1,
          price: item.unitPrice || item.totalPrice || 0,
          unit: item.unit || 'EA',
          supplier: 'GFS',
          productCode: item.productCode || '',
          orderId: order.orderId,
          orderDate: order.orderDate,
          lastUpdated: order.uploadDate || new Date().toISOString()
        });
      });
    }
  });

  // Add Sysco catalog items as inventory
  syscoCatalog.slice(0, 20).forEach((item, index) => {
    items.push({
      id: `sysco_${index}`,
      name: item.productName || 'Unknown Product',
      category: item.category || 'Sysco Catalog',
      quantity: Math.floor(Math.random() * 100) + 1, // Random stock level
      price: item.unitPrice || 0,
      unit: item.unit || 'EA',
      supplier: 'Sysco',
      productCode: item.productCode || '',
      brand: item.brand || '',
      available: item.available !== false,
      lastUpdated: item.importDate || new Date().toISOString()
    });
  });

  // Add some mock locations
  const locations = [
    {
      id: "1",
      name: "Main Warehouse",
      address: "123 Storage St",
      capacity: 1000,
      currentStock: items.length
    },
    {
      id: "2", 
      name: "Cold Storage",
      address: "456 Freeze Ave",
      capacity: 500,
      currentStock: Math.floor(items.length * 0.3)
    }
  ];

  combinedInventory = {
    items,
    locations,
    orders: gfsOrders,
    catalog: syscoCatalog,
    summary: {
      totalItems: items.length,
      gfsOrders: gfsOrders.length,
      syscoProducts: syscoCatalog.length,
      lastUpdated: new Date().toISOString()
    }
  };

  console.log(`📦 Built inventory with ${items.length} total items (${gfsOrders.length} GFS orders, ${syscoCatalog.length} Sysco products)`);
}

// Initialize data loading
async function initializeData() {
  await loadGFSOrders();
  await loadSyscoCatalog();
  buildCombinedInventory();
}

// Load data on startup
initializeData().catch(console.error);

// Create server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const origin = req.headers.origin;
  
  // Set CORS headers
  setCORSHeaders(res, origin);
  
  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  console.log(`${method} ${pathname}`);
  
  // Routes
  try {
    // Health check
    if (pathname === '/health') {
      sendJSON(res, { 
        status: 'healthy', 
        mode: 'minimal-api-server',
        timestamp: new Date().toISOString(),
        routes: {
          auth: ['/auth/login', '/auth/refresh', '/auth/logout'],
          inventory: ['/inventory', '/inventory/items']
        }
      });
      return;
    }
    
    // Serve static files for root request
    if (pathname === '/') {
      const filePath = path.join(__dirname, 'public/professional-inventory.html');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } else {
        sendError(res, 'Frontend not found', 404);
      }
      return;
    }
    
    // Auth endpoints (support both /auth/* and /api/auth/* patterns)
    const authPath = pathname.replace(/^\/api/, ''); // Remove /api prefix if present
    
    if (authPath === '/auth/login' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { email, password } = JSON.parse(body);
          
          // Accept multiple demo credentials
          const validCredentials = [
            { email: 'admin@neuro-pilot.ai', password: 'admin123' },
            { email: 'admin@secure-inventory.com', password: 'admin123' },
            { email: 'test@test.com', password: 'test' }
          ];
          
          const isValid = validCredentials.some(cred => 
            cred.email === email && cred.password === password
          );
          
          if (isValid) {
            sendJSON(res, {
              success: true,
              accessToken: 'mock-jwt-token-' + Date.now(),
              user: { id: '1', email, role: 'admin' }
            });
          } else {
            sendError(res, 'Invalid credentials', 401);
          }
        } catch (err) {
          sendError(res, 'Invalid JSON', 400);
        }
      });
      return;
    }
    
    if (authPath === '/auth/refresh' && method === 'POST') {
      sendJSON(res, { 
        success: true,
        accessToken: 'mock-refresh-token-' + Date.now() 
      });
      return;
    }
    
    if (authPath === '/auth/logout' && method === 'POST') {
      sendJSON(res, { success: true });
      return;
    }
    
    // Inventory endpoints (support both /inventory and /api/inventory patterns)
    if ((pathname === '/inventory' || pathname === '/api/inventory') && method === 'GET') {
      sendJSON(res, combinedInventory);
      return;
    }
    
    if ((pathname === '/inventory/items' || pathname === '/api/inventory/items') && method === 'GET') {
      sendJSON(res, combinedInventory.items);
      return;
    }
    
    // GFS Orders endpoint
    if ((pathname === '/orders' || pathname === '/api/orders') && method === 'GET') {
      sendJSON(res, { orders: gfsOrders, total: gfsOrders.length });
      return;
    }
    
    // Sysco Catalog endpoint
    if ((pathname === '/catalog' || pathname === '/api/catalog') && method === 'GET') {
      sendJSON(res, { catalog: syscoCatalog, total: syscoCatalog.length });
      return;
    }
    
    // 404 for unknown routes
    sendError(res, `Route not found: ${method} ${pathname}`, 404);
    
  } catch (error) {
    console.error('Server error:', error);
    sendError(res, 'Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║      🚀 MINIMAL INVENTORY API SERVER       ║
╠════════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   URL:  http://localhost:${PORT}           ║
║   Mode: Development (Mock Auth)            ║
╠════════════════════════════════════════════╣
║   Demo Credentials:                        ║
║   Email: admin@neuro-pilot.ai              ║
║   Pass:  admin123                          ║
╠════════════════════════════════════════════╣
║   API Routes:                              ║
║   • GET    /health                         ║
║   • POST   /auth/login                     ║
║   • POST   /auth/refresh                   ║
║   • POST   /auth/logout                    ║
║   • GET    /inventory                      ║
║   • GET    /inventory/items                ║
╚════════════════════════════════════════════╝
  `);
  
  console.log('✅ Frontend: http://localhost:5500');
  console.log('✅ Backend API: http://localhost:3000');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => process.exit(0));
});