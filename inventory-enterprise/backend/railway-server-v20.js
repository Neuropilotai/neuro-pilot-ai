/**
 * Railway Server v20.0 - Enhanced Minimal (Fast-Track)
 * Database integration + Import endpoints + Basic CRUD
 * Deploy timeline: <4 hours
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 8080;

// ==========================================
// DATABASE SETUP
// ==========================================
const DB_PATH = process.env.DATABASE_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'inventory_v20.db')
    : '/tmp/inventory_v20.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log(`✅ Database connected: ${DB_PATH}`);
});

// Initialize schema on startup
db.serialize(() => {
  // Items table
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    uom TEXT,
    reorder_min INTEGER,
    reorder_max INTEGER,
    par_level INTEGER,
    active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Inventory table
  db.run(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    location TEXT,
    quantity INTEGER NOT NULL,
    lot TEXT,
    expires_at TIMESTAMP,
    last_counted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sku) REFERENCES items(sku) ON DELETE CASCADE
  )`);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location)`);

  console.log('✅ Database schema initialized');
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ==========================================
// HEALTH ENDPOINTS
// ==========================================
app.get('/api/health/status', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM items', (err, result) => {
    const itemCount = err ? 'N/A' : result.count;

    res.json({
      success: true,
      data: {
        service: "inventory-backend-staging",
        status: "operational",
        version: "20.0.0-fast-track",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        database: {
          connected: !err,
          path: DB_PATH,
          items_count: itemCount
        }
      }
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "inventory-backend-staging",
    version: "20.0.0-fast-track"
  });
});

// ==========================================
// ITEMS API
// ==========================================

// GET all items
app.get('/api/items', (req, res) => {
  const activeOnly = req.query.active === 'true';
  const sql = activeOnly
    ? 'SELECT * FROM items WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM items ORDER BY name';

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        message: err.message
      });
    }

    res.json({
      success: true,
      data: rows,
      count: rows.length
    });
  });
});

// GET single item
app.get('/api/items/:sku', (req, res) => {
  db.get('SELECT * FROM items WHERE sku = ?', [req.params.sku], (err, row) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        message: err.message
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    res.json({
      success: true,
      data: row
    });
  });
});

// POST create item
app.post('/api/items', (req, res) => {
  const { sku, name, category, uom, reorder_min, reorder_max, par_level } = req.body;

  if (!sku || !name) {
    return res.status(400).json({
      success: false,
      error: 'SKU and name are required'
    });
  }

  const sql = `INSERT INTO items (sku, name, category, uom, reorder_min, reorder_max, par_level)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [sku, name, category, uom, reorder_min, reorder_max, par_level], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint')) {
        return res.status(409).json({
          success: false,
          error: 'Item with this SKU already exists'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Database insert failed',
        message: err.message
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: this.lastID,
        sku,
        name
      },
      message: 'Item created successfully'
    });
  });
});

// POST CSV import
app.post('/api/items/import', (req, res) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid CSV data - expecting text/csv content'
    });
  }

  const items = [];
  const errors = [];
  let lineNumber = 0;

  const stream = Readable.from([req.body]);

  stream
    .pipe(csvParser())
    .on('data', (row) => {
      lineNumber++;

      // Validate required fields
      if (!row.sku || !row.name) {
        errors.push({
          line: lineNumber,
          error: 'Missing required fields (sku, name)',
          row
        });
        return;
      }

      items.push({
        sku: row.sku.trim(),
        name: row.name.trim(),
        category: row.category?.trim() || null,
        uom: row.uom?.trim() || null,
        reorder_min: parseInt(row.reorder_min) || 0,
        reorder_max: parseInt(row.reorder_max) || 0,
        par_level: parseInt(row.par_level) || 0,
        active: row.active === 'false' ? 0 : 1
      });
    })
    .on('end', () => {
      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid items found in CSV',
          errors
        });
      }

      // Insert items
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO items (sku, name, category, uom, reorder_min, reorder_max, par_level, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      items.forEach((item) => {
        stmt.run([
          item.sku,
          item.name,
          item.category,
          item.uom,
          item.reorder_min,
          item.reorder_max,
          item.par_level,
          item.active
        ], (err) => {
          if (!err) inserted++;
        });
      });

      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Database insert failed',
            message: err.message
          });
        }

        res.json({
          success: true,
          data: {
            total_rows: items.length,
            inserted: inserted,
            errors: errors.length
          },
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${inserted} items`
        });
      });
    })
    .on('error', (err) => {
      res.status(500).json({
        success: false,
        error: 'CSV parsing failed',
        message: err.message
      });
    });
});

// ==========================================
// INVENTORY API
// ==========================================

// GET inventory summary
app.get('/api/inventory/summary', (req, res) => {
  const queries = {
    totalItems: 'SELECT COUNT(DISTINCT sku) as count FROM inventory',
    totalQuantity: 'SELECT SUM(quantity) as total FROM inventory',
    locations: 'SELECT COUNT(DISTINCT location) as count FROM inventory',
    lowStock: `
      SELECT COUNT(*) as count FROM items i
      LEFT JOIN (
        SELECT sku, SUM(quantity) as total_qty
        FROM inventory
        GROUP BY sku
      ) inv ON i.sku = inv.sku
      WHERE i.active = 1 AND (inv.total_qty IS NULL OR inv.total_qty < i.par_level)
    `
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, sql]) => {
    db.get(sql, (err, row) => {
      if (!err) {
        results[key] = row.count !== undefined ? row.count : row.total || 0;
      } else {
        results[key] = 0;
      }

      completed++;
      if (completed === total) {
        res.json({
          success: true,
          data: {
            total_items: results.totalItems,
            total_quantity: results.totalQuantity,
            total_locations: results.locations,
            low_stock_count: results.lowStock,
            timestamp: new Date().toISOString()
          }
        });
      }
    });
  });
});

// GET all inventory
app.get('/api/inventory', (req, res) => {
  const sql = `
    SELECT
      inv.*,
      i.name as item_name,
      i.category,
      i.par_level
    FROM inventory inv
    LEFT JOIN items i ON inv.sku = i.sku
    ORDER BY inv.last_counted_at DESC
  `;

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        message: err.message
      });
    }

    res.json({
      success: true,
      data: rows,
      count: rows.length
    });
  });
});

// POST CSV import for inventory
app.post('/api/inventory/import', (req, res) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid CSV data - expecting text/csv content'
    });
  }

  const records = [];
  const errors = [];
  let lineNumber = 0;

  const stream = Readable.from([req.body]);

  stream
    .pipe(csvParser())
    .on('data', (row) => {
      lineNumber++;

      if (!row.sku || !row.quantity) {
        errors.push({
          line: lineNumber,
          error: 'Missing required fields (sku, quantity)',
          row
        });
        return;
      }

      records.push({
        sku: row.sku.trim(),
        location: row.location?.trim() || 'Unknown',
        quantity: parseInt(row.quantity) || 0,
        lot: row.lot?.trim() || null,
        expires_at: row.expires_at || null,
        last_counted_at: row.last_counted_at || new Date().toISOString()
      });
    })
    .on('end', () => {
      if (records.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid inventory records found in CSV',
          errors
        });
      }

      const stmt = db.prepare(`
        INSERT INTO inventory (sku, location, quantity, lot, expires_at, last_counted_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      records.forEach((record) => {
        stmt.run([
          record.sku,
          record.location,
          record.quantity,
          record.lot,
          record.expires_at,
          record.last_counted_at
        ], (err) => {
          if (!err) inserted++;
        });
      });

      stmt.finalize((err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Database insert failed',
            message: err.message
          });
        }

        res.json({
          success: true,
          data: {
            total_rows: records.length,
            inserted: inserted,
            errors: errors.length
          },
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${inserted} inventory records`
        });
      });
    })
    .on('error', (err) => {
      res.status(500).json({
        success: false,
        error: 'CSV parsing failed',
        message: err.message
      });
    });
});

// ==========================================
// ROOT & 404
// ==========================================
app.get('/', (req, res) => {
  res.json({
    name: "NeuroInnovate Inventory Backend - v20.0 Fast-Track",
    version: "20.0.0-fast-track",
    status: "operational",
    database: "connected",
    endpoints: [
      "GET /api/health/status",
      "GET /api/health",
      "GET /api/items",
      "GET /api/items/:sku",
      "POST /api/items",
      "POST /api/items/import (CSV)",
      "GET /api/inventory",
      "GET /api/inventory/summary",
      "POST /api/inventory/import (CSV)"
    ]
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  db.close((err) => {
    if (err) console.error('Error closing database:', err);
    process.exit(0);
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log('==========================================');
  console.log('🚀 NeuroInnovate Inventory v20.0 Fast-Track');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🗄️ Database: ${DB_PATH}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log('✅ Import endpoints enabled');
  console.log('✅ CRUD operations enabled');
  console.log('==========================================');
});
