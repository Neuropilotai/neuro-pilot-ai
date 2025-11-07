/**
 * Railway Server v20.1 - Production Grade
 *
 * Features:
 * - Redis caching layer with graceful degradation
 * - Prometheus metrics (/metrics endpoint)
 * - JWT authentication + RBAC (admin/staff/viewer)
 * - Daily cron job (02:05 UTC / 21:05 Toronto)
 * - Rate limiting
 * - Structured logging (pino)
 * - All v20.0 CRUD + CSV import functionality
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const cron = require('node-cron');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Load config
const config = require('./config/env');

// Load middleware
const { login, authGuard, optionalAuth } = require('./middleware/auth-v20_1');
const { initRedis, cacheMiddleware, getCache, setCache, delCache, closeRedis, isRedisConnected } = require('./middleware/cache-v20_1');

// Load metrics
const { metricsMiddleware, createMetricsRouter, recordCacheHit, recordCacheMiss } = require('./metrics-v20_1');

// Load jobs
const { runDailyMaintenance } = require('./jobs/daily-v20_1');

// Extend dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

// ===========================================
// LOGGER
// ==========================================
const logger = pino({
  level: config.logging.level,
  transport: config.logging.prettyPrint
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

const app = express();
const PORT = config.port;

// ==========================================
// DATABASE SETUP
// ==========================================
const DB_PATH = config.databasePath;

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error({ err }, 'Database connection failed');
    process.exit(1);
  }
  logger.info(`✅ Database connected: ${DB_PATH}`);
});

// Initialize schema
db.serialize(() => {
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location)`);

  logger.info('✅ Database schema initialized');
});

// ==========================================
// REDIS INITIALIZATION
// ==========================================
const redisClient = initRedis(logger);

// ==========================================
// MIDDLEWARE
// ==========================================
// Security headers
app.use(helmet());

// CORS
const corsOptions = {
  origin: config.cors.allowlist.includes('*') ? '*' : config.cors.allowlist,
  credentials: true,
};
app.use(cors(corsOptions));

// Body parsers
app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

// HTTP request logging
app.use(pinoHttp({ logger }));

// Prometheus metrics
app.use(metricsMiddleware);

// Cache middleware (attaches req.cache helpers)
app.use(cacheMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMin * 60 * 1000,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ==========================================
// METRICS ENDPOINT
// ==========================================
app.use(createMetricsRouter());

// ==========================================
// HEALTH ENDPOINTS
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'inventory-backend-staging',
    version: config.appVersion,
  });
});

app.get('/api/health/status', async (req, res) => {
  const itemCount = await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM items', (err, result) => {
      resolve(err ? 'N/A' : result.count);
    });
  });

  const cacheStats = isRedisConnected()
    ? { connected: true }
    : { connected: false };

  res.json({
    success: true,
    data: {
      service: 'inventory-backend-staging',
      status: 'operational',
      version: config.appVersion,
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      database: {
        connected: true,
        path: DB_PATH,
        items_count: itemCount,
      },
      redis: cacheStats,
      features: {
        auth: true,
        caching: isRedisConnected(),
        metrics: true,
        rate_limiting: true,
        cron_jobs: true,
      },
    },
  });
});

// ==========================================
// AUTH ENDPOINTS
// ==========================================
app.post('/api/auth/login', login);

// ==========================================
// ITEMS API (with caching)
// ==========================================

// GET all items (cached)
app.get('/api/items', optionalAuth, async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const cacheKey = `items:all:${activeOnly ? 'active' : 'all'}`;

  // Try cache first
  const cached = await getCache(cacheKey);
  if (cached) {
    recordCacheHit('items');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  recordCacheMiss('items');
  res.set('X-Cache', 'MISS');

  const sql = activeOnly
    ? 'SELECT * FROM items WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM items ORDER BY name';

  db.all(sql, async (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        message: err.message,
      });
    }

    const response = {
      success: true,
      data: rows,
      count: rows.length,
    };

    // Cache the response
    await setCache(cacheKey, response, config.cache.ttlItems);

    res.json(response);
  });
});

// GET single item
app.get('/api/items/:sku', (req, res) => {
  db.get('SELECT * FROM items WHERE sku = ?', [req.params.sku], (err, row) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        message: err.message,
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    res.json({
      success: true,
      data: row,
    });
  });
});

// POST create item (requires auth, invalidates cache)
app.post('/api/items', authGuard(['staff']), async (req, res) => {
  const { sku, name, category, uom, reorder_min, reorder_max, par_level } = req.body;

  if (!sku || !name) {
    return res.status(400).json({
      success: false,
      error: 'SKU and name are required',
    });
  }

  const sql = `INSERT INTO items (sku, name, category, uom, reorder_min, reorder_max, par_level)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [sku, name, category, uom, reorder_min, reorder_max, par_level], async function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint')) {
        return res.status(409).json({
          success: false,
          error: 'Item with this SKU already exists',
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Database insert failed',
        message: err.message,
      });
    }

    // Invalidate cache
    await delCache(['items:*', 'inventory:*']);

    res.status(201).json({
      success: true,
      data: {
        id: this.lastID,
        sku,
        name,
      },
      message: 'Item created successfully',
    });
  });
});

// POST CSV import (requires staff auth, invalidates cache)
app.post('/api/items/import', authGuard(['staff']), async (req, res) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid CSV data - expecting text/csv content',
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

      if (!row.sku || !row.name) {
        errors.push({
          line: lineNumber,
          error: 'Missing required fields (sku, name)',
          row,
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
        active: row.active === 'false' ? 0 : 1,
      });
    })
    .on('end', async () => {
      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid items found in CSV',
          errors,
        });
      }

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO items (sku, name, category, uom, reorder_min, reorder_max, par_level, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      items.forEach((item) => {
        stmt.run([
          item.sku, item.name, item.category, item.uom,
          item.reorder_min, item.reorder_max, item.par_level, item.active,
        ], (err) => {
          if (!err) inserted++;
        });
      });

      stmt.finalize(async (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Database insert failed',
            message: err.message,
          });
        }

        // Invalidate cache
        await delCache(['items:*', 'inventory:*']);

        res.json({
          success: true,
          data: {
            total_rows: items.length,
            inserted: inserted,
            errors: errors.length,
          },
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${inserted} items`,
        });
      });
    })
    .on('error', (err) => {
      res.status(500).json({
        success: false,
        error: 'CSV parsing failed',
        message: err.message,
      });
    });
});

// ==========================================
// INVENTORY API (with caching)
// ==========================================

// GET inventory summary (cached)
app.get('/api/inventory/summary', async (req, res) => {
  const cacheKey = 'inventory:summary:v1';

  // Try cache first
  const cached = await getCache(cacheKey);
  if (cached) {
    recordCacheHit('inventory');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  recordCacheMiss('inventory');
  res.set('X-Cache', 'MISS');

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
    `,
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
        const response = {
          success: true,
          data: {
            total_items: results.totalItems,
            total_quantity: results.totalQuantity,
            total_locations: results.locations,
            low_stock_count: results.lowStock,
            timestamp: new Date().toISOString(),
          },
        };

        // Cache the response
        setCache(cacheKey, response, config.cache.ttlSummary);

        res.json(response);
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
        message: err.message,
      });
    }

    res.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  });
});

// POST CSV import for inventory (requires staff auth, invalidates cache)
app.post('/api/inventory/import', authGuard(['staff']), async (req, res) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid CSV data - expecting text/csv content',
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
          row,
        });
        return;
      }

      records.push({
        sku: row.sku.trim(),
        location: row.location?.trim() || 'Unknown',
        quantity: parseInt(row.quantity) || 0,
        lot: row.lot?.trim() || null,
        expires_at: row.expires_at || null,
        last_counted_at: row.last_counted_at || new Date().toISOString(),
      });
    })
    .on('end', async () => {
      if (records.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid inventory records found in CSV',
          errors,
        });
      }

      const stmt = db.prepare(`
        INSERT INTO inventory (sku, location, quantity, lot, expires_at, last_counted_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      records.forEach((record) => {
        stmt.run([
          record.sku, record.location, record.quantity,
          record.lot, record.expires_at, record.last_counted_at,
        ], (err) => {
          if (!err) inserted++;
        });
      });

      stmt.finalize(async (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Database insert failed',
            message: err.message,
          });
        }

        // Invalidate cache
        await delCache(['inventory:*']);

        res.json({
          success: true,
          data: {
            total_rows: records.length,
            inserted: inserted,
            errors: errors.length,
          },
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully imported ${inserted} inventory records`,
        });
      });
    })
    .on('error', (err) => {
      res.status(500).json({
        success: false,
        error: 'CSV parsing failed',
        message: err.message,
      });
    });
});

// ==========================================
// JOBS ENDPOINT (Admin only)
// ==========================================
app.post('/jobs/maintenance', authGuard(['admin']), async (req, res) => {
  try {
    const result = await runDailyMaintenance({
      db,
      cache: { get: getCache, set: setCache, del: delCache, stats: async () => ({ connected: isRedisConnected() }) },
      logger,
    });

    res.json({
      success: true,
      data: result,
      message: 'Maintenance job completed successfully',
    });
  } catch (err) {
    logger.error({ err }, 'Maintenance job failed');
    res.status(500).json({
      success: false,
      error: 'Maintenance job failed',
      message: err.message,
    });
  }
});

// ==========================================
// COMPATIBILITY ROUTES (v16.0.0 console support)
// Added: RBAC, owner config, locations, dashboard stats, ops status
// ==========================================

// RBAC bootstrap - provides role configuration
app.get('/api/rbac/bootstrap', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      roles: ['admin', 'staff', 'viewer'],
      permissions: {
        admin: ['read', 'write', 'delete', 'manage'],
        staff: ['read', 'write'],
        viewer: ['read'],
      },
    },
  });
});

// Owner config - provides console configuration
app.get('/api/owner/config', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      version: config.appVersion,
      features: {
        auth: true,
        caching: isRedisConnected(),
        metrics: true,
        rate_limiting: true,
        cron_jobs: true,
      },
    },
  });
});

// Console locations - returns available locations
app.get('/api/owner/console/locations', optionalAuth, async (req, res) => {
  db.all('SELECT DISTINCT location FROM inventory WHERE location IS NOT NULL', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database query failed' });
    }
    res.json({
      success: true,
      data: rows.map(r => r.location),
    });
  });
});

// Dashboard stats - maps to inventory summary (v16.0.0 console format)
app.get('/api/owner/dashboard/stats', async (req, res) => {
  const cacheKey = 'inventory:summary:v1';
  const cached = await getCache(cacheKey);

  if (cached) {
    recordCacheHit('dashboard');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  recordCacheMiss('dashboard');
  res.set('X-Cache', 'MISS');

  db.all(
    `SELECT
      (SELECT COUNT(DISTINCT sku) FROM inventory) as totalItems,
      (SELECT SUM(quantity) FROM inventory) as totalQuantity,
      (SELECT COUNT(DISTINCT location) FROM inventory) as locations,
      (SELECT COUNT(*) FROM items) as totalSkus
    `,
    [],
    async (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database query failed' });
      }

      const data = rows[0] || { totalItems: 0, totalQuantity: 0, locations: 0, totalSkus: 0 };

      // v16.0.0 console expects 'stats' property with pdfs, inventory, fifo
      const response = {
        success: true,
        stats: {
          pdfs: {
            coverage: 0,
            withDates: 0,
            total: 0,
            message: 'PDF invoice extraction not available in v20.1',
          },
          inventory: {
            totalItems: data.totalItems || 0,
            totalQuantity: data.totalQuantity || 0,
            locations: data.locations || 0,
          },
          fifo: {
            totalCases: 0,
            productsTracked: 0,
            message: 'FIFO tracking not available in v20.1',
          },
        },
      };

      await setCache(cacheKey, response, config.cache.ttlSummary);
      res.json(response);
    }
  );
});

// Ops status - provides operational health
app.get('/api/owner/ops/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'operational',
      version: config.appVersion,
      uptime: process.uptime(),
      database: 'connected',
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
    },
  });
});

// Inventory locations - alternate route for locations
app.get('/api/inventory/locations', optionalAuth, async (req, res) => {
  db.all('SELECT DISTINCT location FROM inventory WHERE location IS NOT NULL', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database query failed' });
    }
    res.json({
      success: true,
      data: rows.map(r => r.location),
    });
  });
});

// Menu policy - stub route (menu feature not implemented in v20.1)
app.get('/api/menu/policy', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: false,
      currentWeek: null,
      weeks: [],
      message: 'Menu management not available in v20.1 inventory backend',
    },
  });
});

// Menu weeks - stub route (menu feature not implemented in v20.1)
app.get('/api/menu/weeks', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      currentWeek: null,
      weeks: [],
      message: 'Menu management not available in v20.1 inventory backend',
    },
  });
});

// Owner dashboard - general dashboard data stub
app.get('/api/owner/dashboard', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      timeline: [],
      pdfs: [],
      upgrades: [],
      message: 'AI features not available in v20.1 inventory backend',
    },
  });
});

// Dashboard reorder - AI reorder suggestions stub
app.get('/api/owner/dashboard/reorder', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'AI reorder recommendations not available in v20.1',
  });
});

// Dashboard anomalies - anomaly detection stub
app.get('/api/owner/dashboard/anomalies', optionalAuth, (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'Anomaly detection not available in v20.1',
  });
});

// ==========================================
// CRON SCHEDULER
// ==========================================
if (cron.validate(config.cron.daily)) {
  cron.schedule(config.cron.daily, async () => {
    const torontoTime = dayjs().tz('America/Toronto').format('YYYY-MM-DD HH:mm:ss z');
    logger.info(`🕐 Cron triggered: ${config.cron.daily} (Toronto: ${torontoTime})`);

    await runDailyMaintenance({
      db,
      cache: { get: getCache, set: setCache, del: delCache, stats: async () => ({ connected: isRedisConnected() }) },
      logger,
    });
  });

  logger.info(`✅ Cron job scheduled: ${config.cron.daily} UTC`);
} else {
  logger.warn(`⚠️ Invalid cron expression: ${config.cron.daily}`);
}

// ==========================================
// ROOT & 404
// ==========================================
app.get('/', (req, res) => {
  res.json({
    name: 'NeuroInnovate Inventory Backend - v20.1',
    version: config.appVersion,
    status: 'operational',
    database: 'connected',
    features: {
      authentication: 'JWT with RBAC',
      caching: isRedisConnected() ? 'Redis' : 'Disabled',
      metrics: 'Prometheus',
      rate_limiting: 'Active',
      cron_jobs: 'Active',
    },
    endpoints: [
      'GET /api/health',
      'GET /api/health/status',
      'GET /metrics',
      'POST /api/auth/login',
      'GET /api/items',
      'GET /api/items/:sku',
      'POST /api/items (auth: staff)',
      'POST /api/items/import (auth: staff)',
      'GET /api/inventory',
      'GET /api/inventory/summary',
      'POST /api/inventory/import (auth: staff)',
      'POST /jobs/maintenance (auth: admin)',
    ],
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  db.close((err) => {
    if (err) logger.error({ err }, 'Error closing database');
    else logger.info('Database closed');
  });

  await closeRedis();

  process.exit(0);
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info(`🚀 NeuroInnovate Inventory v${config.appVersion}`);
  logger.info(`📡 Server running on port ${PORT}`);
  logger.info(`🗄️  Database: ${DB_PATH}`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
  logger.info(`🔐 JWT Secret: ${config.jwt.secret.substring(0, 8)}...`);
  logger.info(`💾 Redis: ${isRedisConnected() ? '✅ Connected' : '❌ Disabled'}`);
  logger.info(`📊 Metrics: /metrics`);
  logger.info(`⏰ Cron: ${config.cron.daily} UTC`);
  logger.info(`🛡️  Rate Limit: ${config.rateLimit.max} req / ${config.rateLimit.windowMin} min`);
  logger.info(`🔑 Test users: admin@local, staff@local, viewer@local`);
  logger.info('='.repeat(60));
});
