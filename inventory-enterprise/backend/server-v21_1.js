/**
 * NeuroInnovate Inventory Enterprise - V21.1 Server
 * Production-only mode with complete V21.1 schema support
 * PostgreSQL + Multi-tenant + RBAC + Metrics + Rate Limiting
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');

// V21.1 Security Middleware
const { authGuard: rbacAuthGuard, requirePermissions } = require('./middleware/authorize');
const { auditLog } = require('./middleware/audit');
const { privacyGuard, executeScheduledDeletions } = require('./middleware/privacy');
const { validatePayment } = require('./middleware/payments.validate');

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// DATABASE CONNECTION
// ============================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Make pool globally accessible for routes
global.db = pool;

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('ERROR: Failed to connect to PostgreSQL database:', err);
    process.exit(1);
  }
  console.log('✓ Connected to PostgreSQL database');
  release();
});

// ============================================
// MIDDLEWARE
// ============================================

// Privacy Guard (CORS, input sanitization) - MUST BE FIRST
app.use(privacyGuard());

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============================================
// PROMETHEUS METRICS
// ============================================

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
});

const tenantRequests = new promClient.Counter({
  name: 'tenant_requests_total',
  help: 'Total requests by tenant',
  labelNames: ['org', 'site', 'route', 'method', 'code']
});

const quotaExceeded = new promClient.Counter({
  name: 'quota_exceeded_total',
  help: 'Total quota exceeded events',
  labelNames: ['org', 'quota_type']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(tenantRequests);
register.registerMetric(quotaExceeded);

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      code: res.statusCode
    }, duration);

    if (req.user) {
      tenantRequests.inc({
        org: req.user.org_id || 'unknown',
        site: req.user.site_id || 'none',
        route: req.route?.path || req.path,
        method: req.method,
        code: res.statusCode
      });
    }
  });

  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ============================================
// LEGACY AUTH MIDDLEWARE (for compatibility)
// ============================================
// Note: New routes should use rbacAuthGuard from middleware/authorize.js

function authGuard(allowedRoles = ['staff', 'manager', 'admin', 'owner']) {
  // Delegate to RBAC authGuard for consistency
  return rbacAuthGuard(allowedRoles);
}

// Rate limiting middleware (uses token bucket from migration 010)
async function rateLimitMiddleware(req, res, next) {
  if (!req.user) return next(); // Skip rate limiting for unauthenticated requests

  const bucketKey = `user:${req.user.org_id}:${req.user.user_id}`;

  try {
    const result = await pool.query('SELECT consume_tokens($1, 1)', [bucketKey]);

    if (result.rows[0].consume_tokens === false) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }

    next();
  } catch (error) {
    // If rate limit check fails, allow the request (fail open)
    console.error('Rate limit error:', error);
    next();
  }
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      version: 'v21.1',
      database: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      version: 'v21.1',
      database: 'disconnected',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'NeuroInnovate Inventory Enterprise API',
    version: 'v21.1',
    mode: 'production',
    security: {
      rbac: true,
      audit: true,
      pci: true,
      gdpr: true,
      ccpa: true
    },
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      security: '/api/security/status',
      privacy: '/api/privacy',
      api: {
        auth: '/api/auth',
        me: '/api/me',
        vendors: '/api/vendors',
        recipes: '/api/recipes',
        menu: '/api/menu',
        population: '/api/population',
        waste: '/api/waste',
        pdfs: '/api/pdfs',
        pos: {
          catalog: '/api/pos/catalog',
          registers: '/api/pos/registers',
          orders: '/api/pos/orders',
          payments: '/api/pos/payments',
          reports: '/api/pos/reports',
          pdfs: '/api/pdfs/pos'
        }
      }
    }
  });
});

// ============================================
// V21.1 SECURITY & PRIVACY ENDPOINTS
// ============================================

// Security Status
app.get('/api/security/status', authGuard(['admin', 'owner', 'auditor']), auditLog('SECURITY_STATUS_CHECK'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM user_roles) AS total_role_assignments,
        (SELECT COUNT(*) FROM security_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS security_events_24h,
        (SELECT COUNT(*) FROM audit_log WHERE created_at >= NOW() - INTERVAL '24 hours') AS audit_events_24h,
        (SELECT COUNT(*) FROM rate_limit_buckets) AS rate_limit_buckets
    `);

    res.json({
      success: true,
      rbac_enabled: true,
      audit_enabled: true,
      pci_enforce: process.env.PCI_ENFORCE === 'true',
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Security status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch security status' });
  }
});

// Privacy: Data Export (GDPR)
app.get('/api/privacy/export', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_EXPORT'), async (req, res) => {
  try {
    const { exportUserData } = require('./middleware/privacy');
    const data = await exportUserData(req.user.id);

    res.json(data);
  } catch (error) {
    console.error('Privacy export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

// Privacy: Data Deletion (GDPR)
app.post('/api/privacy/delete', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_DELETION'), async (req, res) => {
  try {
    const { requestDataDeletion } = require('./middleware/privacy');
    const result = await requestDataDeletion(req.user.id, 'User request');

    res.json(result);
  } catch (error) {
    console.error('Privacy deletion error:', error);
    res.status(500).json({ success: false, error: 'Failed to request deletion' });
  }
});

// Privacy: Do Not Sell (CCPA)
app.post('/api/privacy/do-not-sell', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_DO_NOT_SELL'), async (req, res) => {
  try {
    const { setDoNotSell } = require('./middleware/privacy');
    const { doNotSell } = req.body;

    const result = await setDoNotSell(req.user.id, doNotSell !== false);

    res.json(result);
  } catch (error) {
    console.error('Do-not-sell error:', error);
    res.status(500).json({ success: false, error: 'Failed to set preference' });
  }
});

// ============================================
// V21.1 ROUTES
// ============================================

// Auth routes (no auth guard for login/register, but audit login attempts)
app.use('/api/auth', auditLog('AUTH'), require('./routes/auth'));

// User profile routes (requires authentication)
app.use('/api/me', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('USER_PROFILE'), require('./routes/me'));

// All routes require authentication (staff role minimum) + audit logging
app.use('/api/vendors', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('VENDOR'), require('./routes/vendors'));
app.use('/api/recipes', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('RECIPE'), require('./routes/recipes'));
app.use('/api/menu', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('MENU'), require('./routes/menu'));
app.use('/api/population', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POPULATION'), require('./routes/population'));
app.use('/api/waste', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('WASTE'), require('./routes/waste'));
app.use('/api/pdfs', authGuard(['manager', 'admin', 'owner']), auditLog('PDF_GENERATION'), require('./routes/pdfs'));

// POS routes (commissary point of sale) + audit logging
app.use('/api/pos/catalog', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_CATALOG'), require('./routes/pos.catalog'));
app.use('/api/pos/registers', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_REGISTER'), require('./routes/pos.registers'));
app.use('/api/pos/orders', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_ORDER'), require('./routes/pos.orders'));
app.use('/api/pos/payments', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, validatePayment(), auditLog('POS_PAYMENT'), require('./routes/pos.payments'));
app.use('/api/pos/reports', authGuard(['manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_REPORT'), require('./routes/pos.reports'));
app.use('/api/pdfs/pos', authGuard(['manager', 'admin', 'owner']), auditLog('POS_PDF'), require('./routes/pdfs.pos'));

// ============================================
// ERROR HANDLERS
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================
// CRON JOBS (Daily Maintenance)
// ============================================

if (process.env.SCHEDULER_ENABLED === 'true') {
  // Daily at 2:00 AM: Reset quotas, cleanup forecasts, cleanup sessions, privacy deletions
  cron.schedule(process.env.CRON_DAILY || '0 2 * * *', async () => {
    console.log('[CRON] Running daily maintenance tasks...');

    try {
      // Reset quotas that have passed their reset_at time
      const quotasReset = await pool.query('SELECT reset_quotas()');
      console.log(`[CRON] Reset ${quotasReset.rows[0].reset_quotas} quotas`);

      // Cleanup expired forecasts
      const forecastsDeleted = await pool.query('SELECT cleanup_expired_forecasts()');
      console.log(`[CRON] Deleted ${forecastsDeleted.rows[0].cleanup_expired_forecasts} expired forecasts`);

      // Cleanup expired sessions
      const sessionsDeleted = await pool.query('SELECT cleanup_expired_sessions()');
      console.log(`[CRON] Cleaned up ${sessionsDeleted.rows[0].cleanup_expired_sessions} expired sessions`);

      // V21.1: Execute scheduled privacy deletions (30-day grace period)
      const privacyDeletions = await executeScheduledDeletions();
      console.log(`[CRON] Executed ${privacyDeletions.deletedCount || 0} privacy deletions`);

      // V21.1: Reset rate limit buckets daily
      await pool.query('UPDATE rate_limit_buckets SET tokens = capacity');
      console.log('[CRON] Rate limit buckets reset');

      console.log('[CRON] Daily maintenance completed successfully');
    } catch (error) {
      console.error('[CRON] Daily maintenance failed:', error);
    }
  });

  console.log('✓ Cron scheduler enabled - daily tasks will run at', process.env.CRON_DAILY || '2:00 AM');
}

// ============================================
// SERVER START
// ============================================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('================================================');
  console.log('  NeuroInnovate Inventory Enterprise V21.1');
  console.log('================================================');
  console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Database: PostgreSQL (${process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'})`);
  console.log(`  CORS: ${corsOptions.origin === '*' ? 'All origins' : corsOptions.origin}`);
  console.log(`  Metrics: http://localhost:${PORT}/metrics`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log('================================================');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  server.close(async () => {
    console.log('HTTP server closed');

    await pool.end();
    console.log('Database pool closed');

    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after 30 second timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');

  server.close(async () => {
    console.log('HTTP server closed');

    await pool.end();
    console.log('Database pool closed');

    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
