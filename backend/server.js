const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdf = require('pdf-parse');
require('dotenv').config();

// AI Intelligence Layer
const AdaptiveInventoryAgent = require('./lib/AdaptiveInventoryAgent');

// Integration Hub
const IntegrationHub = require('./lib/IntegrationHub');

const app = express();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const uploadDir = './data/gfs_orders';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    // Extract invoice number from filename or use timestamp
    const invoiceMatch = file.originalname.match(/(\d{10})/);
    const filename = invoiceMatch ? `${invoiceMatch[1]}.pdf` : `${Date.now()}.pdf`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (_req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Case Inventory API Routes
const caseInventoryRouter = require('./routes/case-inventory-api');

// Physical Count API Routes
const physicalCountRouter = require('./routes/physical-count-api');

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());

// Mount case inventory routes
app.use('/api/case-inventory', caseInventoryRouter);

// Mount physical count routes
app.use('/api/physical-count', physicalCountRouter);

// Serve static files from public directory
app.use(express.static('public'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'inventory-enterprise-secure' });
});

app.get('/api/system/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'inventory-enterprise-secure',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // Simple authentication check against environment variables
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (email === adminEmail && password === adminPassword) {
    res.json({
      success: true,
      message: 'Authentication successful',
      token: 'demo-token-' + Date.now(),
      user: {
        email: email,
        role: 'Admin',
        permissions: ['Full Access', 'System Management', 'Data Analysis', 'User Control', 'Security Settings'],
        sessionTimeout: 1800000
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

// User info endpoint
app.get('/api/auth/me', (_req, res) => {
  res.json({
    success: true,
    user: {
      email: process.env.ADMIN_EMAIL,
      role: 'Super Admin',
      permissions: ['Full Access', 'System Management', 'Data Analysis', 'User Control', 'Security Settings'],
      sessionTimeout: 1800000
    }
  });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', (_req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  // Get counts from database
  db.get(`
    SELECT
      (SELECT COUNT(*) FROM processed_invoices) as totalPdfs,
      (SELECT SUM(total_amount) FROM processed_invoices) as totalRevenue,
      (SELECT COUNT(*) FROM inventory_count_items) as totalInventoryItems,
      (SELECT SUM(counted_quantity) FROM inventory_count_items) as totalQuantity,
      (SELECT SUM(variance_value) FROM inventory_count_items) as totalInventoryValue,
      (SELECT MAX(processed_at) FROM processed_invoices) as lastPdfUpdate,
      (SELECT MAX(count_date) FROM inventory_count_items) as lastInventoryUpdate
  `, [], (err, row) => {
    if (err) {
      console.error('Error fetching dashboard stats:', err);
      res.status(500).json({ success: false, error: err.message });
      db.close();
      return;
    }

    res.json({
      success: true,
      stats: {
        totalPdfs: row.totalPdfs || 0,
        totalRevenue: row.totalRevenue || 0,
        totalInventoryItems: row.totalInventoryItems || 0,
        totalQuantity: row.totalQuantity || 0,
        totalInventoryValue: row.totalInventoryValue || 0,
        lastPdfUpdate: row.lastPdfUpdate,
        lastInventoryUpdate: row.lastInventoryUpdate,
        systemUptime: '99.9%',
        lastUpdate: new Date().toISOString()
      }
    });

    db.close();
  });
});

// Available PDFs endpoint
app.get('/api/orders/available-pdfs', (_req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.all(`
    SELECT
      id,
      invoice_number as name,
      invoice_date as date,
      total_amount,
      item_count,
      pdf_file_path,
      processed_at
    FROM processed_invoices
    ORDER BY invoice_date DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching PDFs:', err);
      res.status(500).json({ success: false, error: err.message });
      return;
    }

    const pdfs = rows.map(row => ({
      id: row.id,
      name: `${row.name}.pdf`,
      invoice_number: row.name,
      date: row.date,
      total_amount: row.total_amount,
      item_count: row.item_count,
      pdf_path: row.pdf_file_path,
      processed_at: row.processed_at,
      status: 'processed'
    }));

    res.json({
      success: true,
      availablePdfs: pdfs,
      total: pdfs.length
    });

    db.close();
  });
});

// Inventory endpoint - First inventory count
app.get('/api/inventory', (_req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.all(`
    SELECT
      ici.id,
      ici.item_code,
      ici.expected_quantity,
      ici.counted_quantity,
      ici.counted_units,
      ici.variance,
      ici.variance_value,
      ici.location,
      ici.count_date,
      im.description as name,
      ic.category_name as category
    FROM inventory_count_items ici
    LEFT JOIN item_master im ON ici.item_code = im.item_code
    LEFT JOIN item_categories ic ON im.category_id = ic.category_id
    ORDER BY ici.count_date DESC, ici.item_code
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching inventory:', err);
      res.status(500).json({ success: false, error: err.message });
      return;
    }

    const inventory = rows.map(row => ({
      id: row.id,
      itemCode: row.item_code,
      name: row.name || `Item ${row.item_code}`,
      category: row.category || 'Uncategorized',
      quantity: row.counted_quantity,
      unitPrice: row.variance_value / (row.counted_quantity || 1),
      totalValue: row.variance_value,
      location: row.location,
      lastUpdated: row.count_date,
      barcode: row.item_code,
      // Keep original fields for compatibility
      item_code: row.item_code,
      expected_quantity: row.expected_quantity,
      counted_quantity: row.counted_quantity,
      counted_units: row.counted_units,
      variance: row.variance,
      variance_value: row.variance_value,
      count_date: row.count_date
    }));

    const totalValue = inventory.reduce((sum, item) => sum + (item.variance_value || 0), 0);

    res.json({
      success: true,
      items: inventory,
      totalItems: inventory.length,
      totalValue: totalValue,
      // Keep legacy format for compatibility
      inventory: inventory,
      summary: {
        totalItems: inventory.length,
        totalQuantity: inventory.reduce((sum, item) => sum + (item.counted_quantity || 0), 0),
        totalExpected: inventory.reduce((sum, item) => sum + (item.expected_quantity || 0), 0),
        totalVariance: inventory.reduce((sum, item) => sum + (item.variance || 0), 0),
        totalVarianceValue: totalValue,
        categories: [...new Set(inventory.map(item => item.category))]
      }
    });

    db.close();
  });
});

// Locations endpoint - from user-created storage locations JSON
app.get('/api/locations', (_req, res) => {
  try {
    const locationsPath = './data/storage_locations.json';

    if (!fs.existsSync(locationsPath)) {
      return res.status(404).json({
        success: false,
        error: 'Storage locations not found'
      });
    }

    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

    const locations = locationsData.locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      temp: loc.temp,
      capacity: loc.capacity,
      currentStock: loc.currentStock || 0,
      utilized: loc.capacity > 0 ? Math.round((loc.currentStock / loc.capacity) * 100) : 0,
      items: loc.items || [],
      lastUpdated: loc.lastUpdated
    }));

    res.json({
      success: true,
      locations: locations,
      summary: locationsData.summary
    });

  } catch (error) {
    console.error('Error reading locations:', error);
    res.status(500).json({
      success: false,
      error: 'Error loading locations'
    });
  }
});

// Get inventory items for a specific location
app.get('/api/locations/:locationName/inventory', (_req, res) => {
  const locationName = decodeURIComponent(_req.params.locationName);
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.all(`
    SELECT
      ici.item_code,
      im.description,
      ici.counted_quantity,
      ici.count_date,
      ici.location,
      ic.category_name,
      COALESCE(im.current_unit_price, 0) as unit_price,
      im.unit,
      ROW_NUMBER() OVER (ORDER BY ic.category_name, im.description) as sequence_number
    FROM inventory_count_items ici
    JOIN item_master im ON ici.item_code = im.item_code
    LEFT JOIN item_categories ic ON im.category_id = ic.category_id
    WHERE ici.location = ?
      AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items WHERE location = ?)
    ORDER BY sequence_number
  `, [locationName, locationName], (err, rows) => {
    if (err) {
      console.error('Error fetching location inventory:', err);
      db.close();
      return res.status(500).json({ success: false, error: err.message });
    }

    const totalValue = rows.reduce((sum, item) => sum + (item.counted_quantity * item.unit_price), 0);

    db.close();
    res.json({
      success: true,
      location: locationName,
      items: rows,
      totalItems: rows.length,
      totalValue: totalValue,
      lastCountDate: rows[0]?.count_date || null
    });
  });
});

// ==================== AI INTELLIGENCE LAYER API ====================

// Get AI learning status and insights
app.get('/api/ai/insights', async (_req, res) => {
  const agent = new AdaptiveInventoryAgent();
  try {
    const data = await agent.monitorAndLearn();
    agent.close();
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    agent.close();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Natural language query endpoint
app.post('/api/ai/query', async (req, res) => {
  const agent = new AdaptiveInventoryAgent();
  try {
    const { query } = req.body;

    if (!query) {
      agent.close();
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const response = await agent.naturalLanguageQuery(query);
    agent.close();

    res.json({
      success: true,
      query: query,
      ...response
    });
  } catch (error) {
    agent.close();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get consumption patterns
app.get('/api/ai/consumption-patterns', async (_req, res) => {
  const agent = new AdaptiveInventoryAgent();
  try {
    const patterns = await agent.analyzeConsumptionPatterns();
    agent.close();
    res.json({
      success: true,
      patterns: patterns
    });
  } catch (error) {
    agent.close();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get variance analysis
app.get('/api/ai/variances', async (_req, res) => {
  const agent = new AdaptiveInventoryAgent();
  try {
    const variances = await agent.detectAndLearnFromVariances();
    agent.close();
    res.json({
      success: true,
      variances: variances
    });
  } catch (error) {
    agent.close();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get reorder recommendations
app.get('/api/ai/reorder-recommendations', async (_req, res) => {
  const agent = new AdaptiveInventoryAgent();
  try {
    const recommendations = await agent.adaptReorderPolicies();
    agent.close();
    res.json({
      success: true,
      recommendations: recommendations
    });
  } catch (error) {
    agent.close();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== END AI API ====================

// ==================== INTEGRATION HUB API ====================

// ERP Integration - Sync inventory transactions
app.post('/api/integrations/erp/sync', async (req, res) => {
  const hub = new IntegrationHub();
  try {
    const { erpSystem } = req.body; // 'SAP', 'Oracle', or 'Sage'
    const result = await hub.syncWithERP(erpSystem || 'SAP');
    res.json({
      success: result.success,
      system: result.system,
      transactionCount: result.data?.transactions?.length || 0,
      totalValue: result.data?.totalValue || 0,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// IoT/BMS Integration - Process sensor data
app.post('/api/integrations/iot/sensor-data', async (req, res) => {
  const hub = new IntegrationHub();
  try {
    const sensorData = req.body;

    if (!sensorData.location || !sensorData.sensorType) {
      return res.status(400).json({
        success: false,
        error: 'Location and sensorType are required'
      });
    }

    const result = await hub.processIoTData(sensorData);
    res.json({
      success: true,
      location: sensorData.location,
      alerts: result.alerts,
      message: result.alerts.length > 0
        ? `${result.alerts.length} alert(s) generated`
        : 'No alerts - all readings normal'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Supplier EDI - Create Purchase Order
app.post('/api/integrations/supplier/create-po', async (req, res) => {
  const hub = new IntegrationHub();
  try {
    const { items, supplierId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required'
      });
    }

    const result = await hub.createPurchaseOrder(items, supplierId || 'GFS');
    res.json({
      success: true,
      poNumber: result.poNumber,
      totalAmount: result.totalAmount,
      itemCount: items.length,
      ediMessage: result.ediMessage,
      message: `Purchase Order ${result.poNumber} created successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Supplier EDI - Track Shipment
app.get('/api/integrations/supplier/track/:trackingNumber', async (req, res) => {
  const hub = new IntegrationHub();
  try {
    const { trackingNumber } = req.params;
    const carrier = req.query.carrier || 'UPS';

    const shipmentInfo = await hub.trackShipment(trackingNumber, carrier);
    res.json({
      success: true,
      ...shipmentInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// HR/Scheduling Integration - Sync schedule and forecast consumption
app.post('/api/integrations/hr/schedule', async (req, res) => {
  const hub = new IntegrationHub();
  try {
    const scheduleData = req.body;

    if (!scheduleData.headcount) {
      return res.status(400).json({
        success: false,
        error: 'Headcount is required'
      });
    }

    const result = await hub.syncWithHRSchedule(scheduleData);
    res.json({
      success: true,
      headcount: scheduleData.headcount,
      forecastedConsumption: result.forecast,
      reorderAdjustments: result.adjustments,
      message: `Forecast created for ${scheduleData.headcount} people`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Integration Status - Get recent integration activity
app.get('/api/integrations/status', async (_req, res) => {
  const hub = new IntegrationHub();
  try {
    const status = await hub.getIntegrationStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== END INTEGRATION HUB API ====================

// Get single location by ID
app.get('/api/locations/:id', (req, res) => {
  try {
    const locationId = req.params.id;
    const locationsPath = './data/storage_locations.json';

    if (!fs.existsSync(locationsPath)) {
      return res.status(404).json({
        success: false,
        error: 'Storage locations not found'
      });
    }

    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    const location = locationsData.locations.find(loc => loc.id === locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      ...location,
      utilized: location.capacity > 0 ? Math.round((location.currentStock / location.capacity) * 100) : 0
    });

  } catch (error) {
    console.error('Error reading location:', error);
    res.status(500).json({
      success: false,
      error: 'Error loading location'
    });
  }
});

// Update location
app.put('/api/locations/:id', (req, res) => {
  try {
    const locationId = req.params.id;
    const updates = req.body;
    const locationsPath = './data/storage_locations.json';

    if (!fs.existsSync(locationsPath)) {
      return res.status(404).json({
        success: false,
        error: 'Storage locations not found'
      });
    }

    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    const locationIndex = locationsData.locations.findIndex(loc => loc.id === locationId);

    if (locationIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Update location
    locationsData.locations[locationIndex] = {
      ...locationsData.locations[locationIndex],
      name: updates.name || locationsData.locations[locationIndex].name,
      capacity: updates.capacity !== undefined ? updates.capacity : locationsData.locations[locationIndex].capacity,
      temp: updates.temp !== undefined ? updates.temp : locationsData.locations[locationIndex].temp,
      type: updates.type || locationsData.locations[locationIndex].type,
      lastUpdated: new Date().toISOString()
    };

    // Save back to file
    fs.writeFileSync(locationsPath, JSON.stringify(locationsData, null, 2));

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: locationsData.locations[locationIndex]
    });

  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating location'
    });
  }
});

// Create new location
app.post('/api/locations/create', (req, res) => {
  try {
    const { id, name, type, capacity, temp } = req.body;
    const locationsPath = './data/storage_locations.json';

    if (!fs.existsSync(locationsPath)) {
      return res.status(404).json({
        success: false,
        error: 'Storage locations file not found'
      });
    }

    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

    // Check if location already exists
    if (locationsData.locations.find(loc => loc.id === id)) {
      return res.status(400).json({
        success: false,
        error: 'Location with this ID already exists'
      });
    }

    // Add new location
    const newLocation = {
      id,
      name,
      type,
      temp: temp || 20,
      capacity: capacity || 1000,
      currentStock: 0,
      items: [],
      lastUpdated: new Date().toISOString()
    };

    locationsData.locations.push(newLocation);

    // Update summary
    locationsData.summary.totalLocations = locationsData.locations.length;
    locationsData.summary.byType[type] = (locationsData.summary.byType[type] || 0) + 1;

    // Save
    fs.writeFileSync(locationsPath, JSON.stringify(locationsData, null, 2));

    res.json({
      success: true,
      message: 'Location created successfully',
      location: newLocation
    });

  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating location'
    });
  }
});

// Lookup item details
app.get('/api/inventory/lookup/:itemCode', (req, res) => {
  const itemCode = req.params.itemCode;
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.get(`
    SELECT im.item_code, im.description, ic.category_name
    FROM item_master im
    LEFT JOIN item_categories ic ON im.category_id = ic.category_id
    WHERE im.item_code = ?
  `, [itemCode], (err, item) => {
    db.close();

    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    res.json({
      success: true,
      item: {
        itemCode: item.item_code,
        description: item.description,
        category: item.category_name
      }
    });
  });
});

// Check if item exists in multiple locations
app.get('/api/inventory/check-locations/:itemCode', (req, res) => {
  const itemCode = req.params.itemCode;
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.all(`
    SELECT location, SUM(counted_quantity) as quantity
    FROM inventory_count_items
    WHERE item_code = ?
    GROUP BY location
    HAVING SUM(counted_quantity) > 0
  `, [itemCode], (err, locations) => {
    db.close();

    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    // AI suggestion: suggest most common location
    let suggestedLocation = null;
    if (locations && locations.length > 0) {
      const sorted = locations.sort((a, b) => b.quantity - a.quantity);
      suggestedLocation = sorted[0].location;
    }

    res.json({
      success: true,
      locations: locations || [],
      suggestedLocation
    });
  });
});

// Add inventory count item by item number
app.post('/api/inventory/add-item', (req, res) => {
  const { itemCode, quantity, location, countDate, itemName, category, price, unit, gtin } = req.body;

  if (!itemCode || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'Item code and quantity are required'
    });
  }

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  // First, get item details from item_master
  db.get(`
    SELECT im.item_code, im.description, ic.category_name
    FROM item_master im
    LEFT JOIN item_categories ic ON im.category_id = ic.category_id
    WHERE im.item_code = ?
  `, [itemCode], (err, item) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
      db.close();
      return;
    }

    // If item not found but we have itemName, create it
    if (!item && itemName) {
      const unitToUse = unit || 'EA';
      const priceToUse = price || 0;
      const barcodeToUse = gtin || '';

      db.run(`
        INSERT INTO item_master (item_code, barcode, description, unit, current_unit_price, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `, [itemCode, barcodeToUse, itemName, unitToUse, priceToUse], function(createErr) {
        if (createErr) {
          console.error('Failed to create item:', createErr);
          res.status(500).json({
            success: false,
            error: 'Failed to create new item',
            details: createErr.message
          });
          db.close();
          return;
        }

        console.log(`Created new item: ${itemCode} - ${itemName}`);
        // Continue with the inventory addition using the newly created item
        continueWithInventoryAdd(db, res, itemCode, itemName, category, quantity, location, countDate);
      });
      return;
    }

    if (!item) {
      res.status(404).json({
        success: false,
        error: `Item ${itemCode} not found in item master. Please provide itemName to create it.`
      });
      db.close();
      return;
    }

    // Item exists, continue normally
    continueWithInventoryAdd(db, res, itemCode, item.description, item.category_name, quantity, location, countDate);
  });
});

// Helper function to continue with inventory addition
function continueWithInventoryAdd(db, res, itemCode, description, categoryName, quantity, location, countDate) {

    // Check if item already exists for this date and location
    const dateToUse = countDate || new Date().toISOString().split('T')[0];
    const locationToUse = location || 'Storage';

    db.get(`
      SELECT id, counted_quantity
      FROM inventory_count_items
      WHERE item_code = ? AND count_date = ? AND location = ?
    `, [itemCode, dateToUse, locationToUse], (err, existing) => {
      if (err) {
        console.error('Check error:', err);
        res.status(500).json({
          success: false,
          error: 'Database error',
          details: err.message
        });
        db.close();
        return;
      }

      if (existing) {
        // Update existing record
        const newQuantity = existing.counted_quantity + parseFloat(quantity);
        db.run(`
          UPDATE inventory_count_items
          SET counted_quantity = ?,
              variance = ?,
              notes = 'Updated: ' || datetime('now')
          WHERE id = ?
        `, [newQuantity, newQuantity, existing.id], function(err) {
          if (err) {
            console.error('Update error:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to update item',
              details: err.message
            });
          } else {
            res.json({
              success: true,
              message: `Updated ${description} (${itemCode}) - New total: ${newQuantity}`,
              item: {
                itemCode: itemCode,
                name: description,
                category: categoryName,
                quantity: newQuantity,
                location: locationToUse
              }
            });
          }
          db.close();
        });
      } else {
        // Insert new record
        db.run(`
          INSERT INTO inventory_count_items
          (count_date, item_code, expected_quantity, counted_quantity, counted_units, variance, variance_value, location, notes)
          VALUES (?, ?, 0, ?, 0, ?, 0, ?, ?)
        `, [
          dateToUse,
          itemCode,
          quantity,
          quantity,
          locationToUse,
          'Added via manual entry'
        ], function(err) {
          if (err) {
            console.error('Insert error:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to add item to inventory count',
              details: err.message
            });
          } else {
            res.json({
              success: true,
              message: `Added ${quantity} units of ${description} (${itemCode})`,
              item: {
                itemCode: itemCode,
                name: description,
                category: categoryName,
                quantity: quantity,
                location: locationToUse
              }
            });
          }
          db.close();
        });
      }
    });
}

// Orders endpoint - Real invoice data
app.get('/api/orders', (_req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.all(`
    SELECT
      pi.id,
      pi.invoice_number,
      pi.invoice_date,
      pi.total_amount,
      pi.item_count,
      pi.pdf_file_path,
      pi.processed_at
    FROM processed_invoices pi
    ORDER BY pi.invoice_date DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching orders:', err);
      res.status(500).json({ success: false, error: err.message });
      db.close();
      return;
    }

    const orders = rows.map(row => ({
      id: row.invoice_number,
      invoiceNumber: row.invoice_number,
      date: row.invoice_date,
      supplier: 'GFS',
      items: row.item_count || 0,
      total: row.total_amount,
      status: 'completed',
      source: row.pdf_file_path ? 'PDF' : 'Manual',
      hasPdf: !!row.pdf_file_path,
      pdfPath: row.pdf_file_path,
      processedAt: row.processed_at
    }));

    const totalValue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const avgItems = orders.length > 0
      ? Math.round(orders.reduce((sum, order) => sum + (order.items || 0), 0) / orders.length)
      : 0;

    res.json({
      success: true,
      orders: orders,
      summary: {
        totalOrders: orders.length,
        totalRevenue: totalValue,
        avgOrderSize: avgItems,
        completedOrders: orders.filter(o => o.status === 'completed').length,
        pendingOrders: orders.filter(o => o.status === 'pending').length
      }
    });

    db.close();
  });
});

// Serve PDF files
app.get('/api/pdf/:invoiceNumber', (req, res) => {
  const { invoiceNumber } = req.params;

  // Try both locations
  let pdfPath = `./data/gfs_orders/${invoiceNumber}.pdf`;
  if (!fs.existsSync(pdfPath)) {
    pdfPath = `./data/invoices/${invoiceNumber}.pdf`;
  }

  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({
      success: false,
      error: 'PDF file not found',
      message: `Original PDF for invoice ${invoiceNumber} is not available. The invoice data was extracted but the PDF file is missing.`
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoiceNumber}.pdf"`);
  res.sendFile(path.resolve(pdfPath));
});

// Check if PDF exists endpoint
app.get('/api/pdf-exists/:invoiceNumber', (req, res) => {
  const { invoiceNumber } = req.params;

  let pdfPath = `./data/gfs_orders/${invoiceNumber}.pdf`;
  if (!fs.existsSync(pdfPath)) {
    pdfPath = `./data/invoices/${invoiceNumber}.pdf`;
  }

  res.json({
    exists: fs.existsSync(pdfPath),
    invoiceNumber: invoiceNumber
  });
});

// Validated data API endpoint - Single source of truth
app.get('/api/metrics', (_req, res) => {
  try {
    const validatedDataPath = './data/validated_system_data.json';

    if (!fs.existsSync(validatedDataPath)) {
      return res.status(404).json({
        error: 'Validated data not found. Run data validation first.'
      });
    }

    const validatedData = JSON.parse(fs.readFileSync(validatedDataPath, 'utf8'));

    if (!validatedData.authoritative) {
      return res.status(400).json({
        error: 'Data has not been validated. Run data validation first.'
      });
    }

    // Return standardized API response
    res.json({
      success: true,
      validated: true,
      lastValidation: validatedData.lastValidation,
      data: {
        totalOrders: validatedData.api.totalOrders,
        totalOrderValue: Math.round(validatedData.api.totalOrderValue),
        totalInventoryItems: validatedData.api.totalInventoryItems,
        totalInventoryValue: Math.round(validatedData.api.totalInventoryValue),
        systemAccuracy: Math.round(validatedData.api.systemAccuracy * 10) / 10,
        // Dashboard-friendly formatted values
        formattedOrderValue: validatedData.api.totalOrderValue.toLocaleString(),
        formattedInventoryValue: validatedData.api.totalInventoryValue.toLocaleString()
      }
    });

  } catch (error) {
    console.error('Error reading validated data:', error);
    res.status(500).json({
      error: 'Internal server error reading validated data',
      details: error.message
    });
  }
});

// Data validation trigger endpoint
app.post('/api/validate', async (_req, res) => {
  try {
    const UnifiedDataIntegritySystem = require('./unified_data_integrity_system');
    const system = new UnifiedDataIntegritySystem();

    console.log('🔄 API: Starting data validation...');
    const report = await system.validateAllSystems();

    res.json({
      success: true,
      message: 'Data validation completed',
      report: {
        totalOrders: report.data.totalOrders,
        totalOrderValue: Math.round(report.data.totalOrderValue),
        totalInventoryItems: report.data.totalInventoryItems,
        totalInventoryValue: Math.round(report.data.totalInventoryValue),
        systemAccuracy: Math.round(report.data.systemAccuracy * 10) / 10,
        discrepancies: report.discrepancies.length,
        recommendations: report.recommendations
      }
    });

  } catch (error) {
    console.error('Error during validation:', error);
    res.status(500).json({
      error: 'Validation failed',
      details: error.message
    });
  }
});

// PDF Upload endpoint
app.post('/api/orders/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    const pdfPath = req.file.path;
    const invoiceNumber = path.basename(req.file.filename, '.pdf');

    console.log(`📄 Processing uploaded PDF: ${invoiceNumber}`);

    // Extract PDF data
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    // Extract basic invoice data
    const invoiceDateMatch = text.match(/Invoice Date[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const totalMatch = text.match(/Total[:\s]+\$?([\d,]+\.\d{2})/i);

    let invoiceDate = null;
    if (invoiceDateMatch) {
      const [month, day, year] = invoiceDateMatch[1].split('/');
      invoiceDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const totalAmount = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;

    // Count line items (simplified - looking for item codes)
    const itemMatches = text.match(/#\d{7}/g);
    const itemCount = itemMatches ? new Set(itemMatches).size : 0;

    // Insert into database
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('./data/enterprise_inventory.db');

    db.run(`
      INSERT OR REPLACE INTO processed_invoices
      (invoice_number, invoice_date, total_amount, item_count, pdf_file_path, processed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [invoiceNumber, invoiceDate, totalAmount, itemCount, pdfPath], function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to save invoice to database',
          details: err.message
        });
      } else {
        console.log(`✅ Successfully processed invoice ${invoiceNumber}`);
        res.json({
          success: true,
          message: 'PDF uploaded and processed successfully',
          invoice: {
            invoiceNumber,
            invoiceDate,
            totalAmount,
            itemCount,
            pdfPath
          }
        });
      }
      db.close();
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process PDF',
      details: error.message
    });
  }
});

// ============================================================================
// AI INTELLIGENCE LAYER ENDPOINTS
// ============================================================================

// const AdaptiveInventoryAgent = require('./ai_adaptive_agent');
const ReorderOptimizer = require('./ai_reorder_optimizer');
const NaturalLanguageInterface = require('./ai_natural_language');

// Natural Language Query endpoint
app.post('/api/ai/query', async (req, res) => {
  const { query, language } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Query text is required'
    });
  }

  try {
    const nli = new NaturalLanguageInterface();
    const result = await nli.processQuery(query, language);
    nli.close();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('AI Query error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process query',
      details: error.message
    });
  }
});

// Get variance insights
app.get('/api/ai/variance-insights', (req, res) => {
  const { itemCode, limit } = req.query;

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  let query = `
    SELECT avi.*, im.description
    FROM ai_variance_insights avi
    JOIN item_master im ON avi.item_code = im.item_code
  `;

  const params = [];

  if (itemCode) {
    query += ' WHERE avi.item_code = ?';
    params.push(itemCode);
  }

  query += ' ORDER BY avi.created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  } else {
    query += ' LIMIT 20';
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        insights: rows.map(row => ({
          ...row,
          evidence: JSON.parse(row.evidence || '[]')
        }))
      });
    }
    db.close();
  });
});

// Get reorder recommendations
app.get('/api/ai/reorder-recommendations', async (_req, res) => {
  try {
    const optimizer = new ReorderOptimizer();
    const recommendations = await optimizer.getReorderRecommendations();
    optimizer.close();

    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Reorder recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      details: error.message
    });
  }
});

// Optimize reorder policy for an item
app.post('/api/ai/optimize-reorder/:itemCode', async (req, res) => {
  const { itemCode } = req.params;

  try {
    const optimizer = new ReorderOptimizer();
    const policy = await optimizer.optimizeReorderPolicy(itemCode);
    optimizer.close();

    res.json({
      success: true,
      policy
    });
  } catch (error) {
    console.error('Policy optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize policy',
      details: error.message
    });
  }
});

// Get AI anomalies
app.get('/api/ai/anomalies', (req, res) => {
  const { severity, limit } = req.query;

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  let query = `
    SELECT *
    FROM ai_anomalies
    WHERE auto_resolved = 0
  `;

  const params = [];

  if (severity) {
    query += ' AND severity = ?';
    params.push(severity);
  }

  query += ' ORDER BY detected_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  } else {
    query += ' LIMIT 20';
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        anomalies: rows
      });
    }
    db.close();
  });
});

// Get AI agent actions log
app.get('/api/ai/agent-actions', (req, res) => {
  const { actionType, limit } = req.query;

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  let query = 'SELECT * FROM ai_agent_actions';
  const params = [];

  if (actionType) {
    query += ' WHERE action_type = ?';
    params.push(actionType);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
  } else {
    query += ' LIMIT 50';
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        actions: rows.map(row => ({
          ...row,
          action_data: JSON.parse(row.action_data || '{}')
        }))
      });
    }
    db.close();
  });
});

// Get AI learning data / patterns
app.get('/api/ai/patterns', (req, res) => {
  const { itemCode, patternType } = req.query;

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  let query = `
    SELECT ald.*, im.description
    FROM ai_learning_data ald
    JOIN item_master im ON ald.item_code = im.item_code
  `;

  const params = [];
  const conditions = [];

  if (itemCode) {
    conditions.push('ald.item_code = ?');
    params.push(itemCode);
  }

  if (patternType) {
    conditions.push('ald.pattern_type = ?');
    params.push(patternType);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY ald.last_updated DESC LIMIT 100';

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        patterns: rows.map(row => ({
          ...row,
          pattern_data: JSON.parse(row.pattern_data || '{}')
        }))
      });
    }
    db.close();
  });
});

// AI Dashboard Stats
app.get('/api/ai/dashboard-stats', (_req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  db.serialize(() => {
    const stats = {};

    // Count variance insights
    db.get('SELECT COUNT(*) as count FROM ai_variance_insights WHERE status = "detected"', (_err, row) => {
      stats.activeInsights = row ? row.count : 0;
    });

    // Count anomalies
    db.get('SELECT COUNT(*) as count FROM ai_anomalies WHERE auto_resolved = 0', (_err, row) => {
      stats.activeAnomalies = row ? row.count : 0;
    });

    // Count reorder recommendations
    db.get(`
      SELECT COUNT(*) as count
      FROM ai_reorder_policy arp
      LEFT JOIN inventory_count_items ici ON arp.item_code = ici.item_code
        AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items)
      WHERE COALESCE(ici.counted_quantity, 0) <= arp.reorder_point
    `, (_err, row) => {
      stats.reorderRecommendations = row ? row.count : 0;
    });

    // Count learned patterns
    db.get('SELECT COUNT(*) as count FROM ai_learning_data WHERE confidence_score > 0.7', (_err, row) => {
      stats.learnedPatterns = row ? row.count : 0;

      // Send response after all queries
      res.json({
        success: true,
        stats
      });

      db.close();
    });
  });
});

// ============================================================================
// COUNTING SHEET & SPOT CHECK ENDPOINTS
// ============================================================================

const SpotCheckRecommender = require('./ai_spot_check_system');

// Generate counting sheet for a location
app.post('/api/counting-sheet/generate', async (req, res) => {
  const { location, countDate } = req.body;

  if (!location) {
    return res.status(400).json({
      success: false,
      error: 'Location is required'
    });
  }

  try {
    const recommender = new SpotCheckRecommender();
    const sheet = await recommender.generateCountingSheet(
      location,
      countDate || new Date().toISOString().split('T')[0]
    );

    // Save the sheet
    const saved = await recommender.saveCountingSheet(sheet);
    recommender.close();

    res.json({
      success: true,
      sheet: saved
    });
  } catch (error) {
    console.error('Generate counting sheet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate counting sheet',
      details: error.message
    });
  }
});

// Get counting sequence for location
app.get('/api/counting-sheet/sequence/:location', async (req, res) => {
  const { location } = req.params;

  try {
    const recommender = new SpotCheckRecommender();
    const sequence = await recommender.getCountingSequence(location);
    recommender.close();

    res.json({
      success: true,
      location,
      sequence
    });
  } catch (error) {
    console.error('Get sequence error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get counting sequence',
      details: error.message
    });
  }
});

// Get spot check recommendations
app.get('/api/spot-check/recommendations/:location', async (req, res) => {
  const { location } = req.params;
  const { limit } = req.query;

  try {
    const recommender = new SpotCheckRecommender();
    const recommendations = await recommender.getSpotCheckRecommendations(
      location,
      new Date().toISOString().split('T')[0],
      parseInt(limit) || 10
    );
    recommender.close();

    res.json({
      success: true,
      location,
      recommendations
    });
  } catch (error) {
    console.error('Spot check recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      details: error.message
    });
  }
});

// Get all counting sheets
app.get('/api/counting-sheets', (req, res) => {
  const { location, status } = req.query;

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  let query = 'SELECT * FROM counting_sheets';
  const params = [];
  const conditions = [];

  if (location) {
    conditions.push('location = ?');
    params.push(location);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
    } else {
      res.json({
        success: true,
        sheets: rows.map(row => ({
          ...row,
          sheet_data: JSON.parse(row.sheet_data || '{}')
        }))
      });
    }
    db.close();
  });
});

// Update counting sheet item
app.post('/api/counting-sheet/update-item', (req, res) => {
  const { itemCode, location, countDate, quantity, sequenceNumber } = req.body;

  if (!itemCode || !location || !countDate) {
    return res.status(400).json({
      success: false,
      error: 'Item code, location, and count date are required'
    });
  }

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  // Check if item exists for this location/date
  db.get(`
    SELECT id, counted_quantity
    FROM inventory_count_items
    WHERE item_code = ? AND location = ? AND count_date = ?
  `, [itemCode, location, countDate], (err, existing) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Database error',
        details: err.message
      });
      db.close();
      return;
    }

    if (existing) {
      // Update existing
      db.run(`
        UPDATE inventory_count_items
        SET counted_quantity = ?,
            variance = ?,
            sequence_number = ?,
            notes = 'Updated: ' || datetime('now')
        WHERE id = ?
      `, [quantity, quantity, sequenceNumber || 0, existing.id], function(err) {
        if (err) {
          res.status(500).json({
            success: false,
            error: 'Update failed',
            details: err.message
          });
        } else {
          res.json({
            success: true,
            message: 'Item updated',
            itemCode,
            quantity
          });
        }
        db.close();
      });
    } else {
      // Insert new
      db.run(`
        INSERT INTO inventory_count_items
        (count_date, item_code, counted_quantity, variance, location, sequence_number, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'Added via counting sheet')
      `, [countDate, itemCode, quantity, quantity, location, sequenceNumber || 0], function(err) {
        if (err) {
          res.status(500).json({
            success: false,
            error: 'Insert failed',
            details: err.message
          });
        } else {
          res.json({
            success: true,
            message: 'Item added',
            itemCode,
            quantity
          });
        }
        db.close();
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Secure Inventory backend running on port ${PORT}`);
  console.log(`🧠 AI Intelligence Layer enabled`);
  console.log(`📋 Counting Sheet System ready`);
});
