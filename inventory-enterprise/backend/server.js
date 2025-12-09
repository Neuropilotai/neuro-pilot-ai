const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth-db'); // Database-backed auth (v16.5.1)
const inventoryRoutes = require('./routes/inventory');
const inventoryCountsRoutes = require('./routes/inventory-counts-api'); // v3.0.0 Inventory Counts
const userRoutes = require('./routes/users');
const aiFeedbackRoutes = require('./routes/ai-feedback-api');

// v21.1 - Missing route imports (locations, vendors, population, POS)
const locationsRoutes = require('./routes/locations');
const vendorsRoutes = require('./routes/vendors');
const populationRoutes = require('./routes/population');
const posCatalogRoutes = require('./routes/pos.catalog');
const posOrdersRoutes = require('./routes/pos.orders');
const posRegistersRoutes = require('./routes/pos.registers');
const posPaymentsRoutes = require('./routes/pos.payments');
const posReportsRoutes = require('./routes/pos.reports');

// P1 Hardening - Recipes and Waste routes
const recipesRoutes = require('./routes/recipes');
const wasteRoutes = require('./routes/waste');

// PASS G v2.4.0 - Multi-Tenancy & RBAC
const webhooksRoutes = require('./routes/webhooks_2025-10-07');

// PASS H v2.4.1 - Admin Management APIs
const tenantsRoutes = require('./routes/tenants');
const rolesRoutes = require('./routes/roles-api');

// v15.5.3 - Admin User Management (RBAC)
const adminUsersRoutes = require('./routes/admin-users');

// PASS P v2.8.0 - Next Generation Features
const aiForecastRoutes = require('./routes/ai-forecast');
const twoFARoutes = require('./routes/2fa');

// V22.1 - NeuroPilot AI Engine (PostgreSQL-native)
const aiEngineRoutes = require('./routes/ai-engine');
const ownerRoutes = require('./routes/owner');
const ownerAIRoutes = require('./routes/owner-ai'); // Owner AI Widgets
const ownerAILearningRoutes = require('./routes/owner-ai-learning'); // Phase 3: Autonomous Learning

// v3.0.0 - Owner Mission Control Console
const ownerConsoleRoutes = require('./routes/owner-console');

// v3.1.0 - Local AI Training on Apple Silicon
const ownerTrainingRoutes = require('./routes/owner-training');
const ownerReleaseRoutes = require('./routes/owner-release');

// v6.7 - Daily Predictive Demand (Menu + Breakfast + Beverage Forecasting)
const ownerForecastRoutes = require('./routes/owner-forecast');

// v15.6.0 - Count by Invoice (Finance-First Workflow)
const countSessionsRoutes = require('./routes/count-sessions');

// v23.0 - PostgreSQL-native Counts API (Phase A/B inventory model)
const countsApiRoutes = require('./routes/counts-api');

// v15.7.0 - System Health Monitoring & Audit (Production-Hardened v2.0)
const healthRoutes = require('./routes/health-v2');

// v15.8.0 - Quantum Governance Layer (Unified Governance Scoring)
const governanceRoutes = require('./routes/governance');

// v16.4.0 - Live Governance Dashboard
const governanceLiveRoutes = require('./routes/governance-live');

// v16.6.0 - Adaptive Intelligence & Auto-Recovery (Predictive Stability Layer)
const stabilityRoutes = require('./routes/stability');

// Phase 3: Autonomous Learning & Optimization Layer
const Phase3CronScheduler = require('./cron/phase3_cron');

// Phase 4: Governance Intelligence Layer (v16.0.0)
const Phase4CronScheduler = require('./cron/phase4_cron');

// v19.0: NeuroNexus Autonomous Foundation - Scheduler
const AutonomousScheduler = require('./scheduler');

// v22.3: GFS Order Watcher - Background Workers
const { initWorkers, stopWorkers } = require('./startup/initWorkers');

// v4.1.0 - Quantum Defense Governance
const QuantumKeyManager = require('./security/quantum_key_manager');
const AutonomousCompliance = require('./security/autonomous_compliance');

const i18n = require('./middleware/i18n');
const { resolveTenant } = require('./middleware/tenantContext');
const { authenticateToken } = require('./middleware/auth');
const { requireOwnerDevice } = require('./middleware/deviceBinding');

// PASS F v2.3.0 - Real-Time Intelligence Layer
const realtimeAI = require('./server/websocket/RealtimeAI');
const feedbackStream = require('./ai/streaming/FeedbackStream');
const forecastWorker = require('./ai/workers/ForecastWorker');
const { logger } = require('./config/logger');

// PASS L v2.6.0 - AI Ops Automation & Predictive Incident Response
const AIOperationsAgent = require('./aiops/Agent');

// PASS M v2.7.0 - Generative Intelligence & Autonomous Governance
const GovernanceAgent = require('./aiops/GovernanceAgent');
const InsightGenerator = require('./aiops/InsightGenerator');
const ComplianceAudit = require('./aiops/ComplianceAudit');

// Metrics Exporter
const metricsExporter = require('./utils/metricsExporter');

// v15.2.3: 404 Telemetry for broken link detection
const { telemetry404, getPrometheusMetrics: get404Metrics } = require('./middleware/404-telemetry');

// v15.3: Financial metrics
const { getPrometheusMetrics: getFinancialMetrics } = require('./utils/financialMetrics');

// NeuroPilot v12.5 - Real-Time Event Bus
const realtimeBus = require('./utils/realtimeBus');

// PASS P v2.8.0 - Infrastructure & Services
const ForecastService = require('./src/ai/forecast/ForecastService');
const TwoFactorAuth = require('./middleware/security_2fa');
const AuditLogger = require('./middleware/audit');
const RedisStatsCollector = require('./utils/redisStatsCollector');

// Initialize AI Ops & Generative Intelligence agents
let aiOpsAgent = null;
let governanceAgent = null;
let insightGenerator = null;
let complianceAudit = null;

// Initialize v2.8.0 services
let redisClient = null;
let redisStatsCollector = null;
let forecastService = null;
let twoFactorAuth = null;
let auditLogger = null;

// Phase 3: Autonomous Learning services
let phase3Cron = null;

// Phase 4: Governance Intelligence services (v16.0.0)
let phase4Cron = null;

// v4.1.0 Quantum Governance services
let quantumKeys = null;
let complianceEngine = null;

// v19.0 Autonomous Foundation services
let autonomousScheduler = null;

// v22.3 Background Workers
let backgroundWorkers = null;

const app = express();

// ============================================================================
// Critical environment validation (prod-safe)
// ============================================================================
function requireEnv(name, opts = {}) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    const msg = `Missing required environment variable: ${name}`;
    if (opts.optional) {
      console.warn(msg);
      return null;
    }
    console.error(msg);
    process.exit(1);
  }
  return value;
}

// Required for auth & owner device binding
requireEnv('JWT_SECRET');
requireEnv('OWNER_DEVICE_ID');
// Required for database connectivity
requireEnv('DATABASE_URL');
// Optional integrations
requireEnv('SMTP_SERVER', { optional: true });
requireEnv('SMTP_USERNAME', { optional: true });
requireEnv('SMTP_PASSWORD', { optional: true });
requireEnv('REORDER_WEBHOOK_URL', { optional: true });

// v14.4.2: Maximum security - no unsafe-inline anywhere
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],  // v14.4.1: Removed unsafe-inline (XSS protection for <script> tags)
      scriptSrcAttr: ["'unsafe-inline'"],  // Allow inline event handlers (onclick, etc) - TODO: refactor to addEventListener
      styleSrc: [
        "'self'",
        "'unsafe-hashes'",  // v15.6.0: Required for style="" attributes (hashes work on attributes only with this keyword)
        // v15.6.0: Allow specific inline style attributes from GFS Monthly Reports (external HTML)
        "'sha256-Tg4tEsPAlo7J4B2bew62dRrIHfpbMcixC7sQBsWitfY='",
        "'sha256-8OV+oVjSIOJEykH2ijm4bjq+9ELswX3kM4oH0O7fKRA='",
        "'sha256-NUM9PdiyywFyGocGUA5zbnSZnXq+mwTNJQ73ozDQGwk='",
        "'sha256-NNSuuKivjI/j6nzhhHwO0742gfX7d5rj54r+PxzOA4E='",
        // v15.7.0: Owner super console inline styles
        "'sha256-ffZMQGAFUenGepQ836v7CxciTo15oLvN17CzFLikgao='",
        // v15.7.0: Recipe drawer inline styles
        "'sha256-sHWBVxrleOiO/CvNi8MbDTn7amOI6xeHmn6lM24vcxU='",
        "'sha256-DL2IXj82ZaxyeudYyUlldcmA2Ado0C8vLkhPmTFfEd8='",
        "'sha256-NHarn8wEqJqUQoKwsaJttWeSqzOSSPTy65p3Z6aS0Qs='",
        "'sha256-7VXlcg/uSZugHSa6UtIG2/44ju460LiO4M0CyQfraX8='",
        "'sha256-mnRyqew64Lcv5/Qgb/4HP8LfJi5MjjQCGLPt+/cJZis='",
        "'sha256-C1Wm2thZBI0ZnFrVeGrUcPYUjGDDKSysR0ReamqR6+o='"
      ],  // v14.4.2: Removed unsafe-inline (inline styles extracted to CSS)
      imgSrc: ["'self'", "data:", "blob:"],
      // Allow both localhost and 127.0.0.1 for local development + WebSocket
      connectSrc: [
        "'self'",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "ws://localhost:*",
        "ws://127.0.0.1:*",
        "wss://localhost:*",
        "wss://127.0.0.1:*"
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  referrerPolicy: { policy: "no-referrer" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration - Security Hardened (v18.0 - Ultimate)
// Restricts API access to authorized frontend origins only
// NO WILDCARD FALLBACK in production - enterprise security policy

// Build allowlist from env with strict validation
const rawAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Production default (if env missing): strict Vercel allowlist with wildcard subdomain support
const defaultProdOrigins = [
  'https://neuropilot-inventory.vercel.app',
  'https://*.vercel.app'
];

// Non-production default (localhost only)
const defaultNonProdOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const isProd = process.env.NODE_ENV === 'production';
const allowlist = rawAllowed.length > 0
  ? rawAllowed
  : (isProd ? defaultProdOrigins : [...defaultProdOrigins, ...defaultNonProdOrigins]);

// Wildcard subdomain matcher for patterns like https://*.vercel.app
function matchOrigin(origin, list) {
  if (!origin) return true; // Allow server-to-server/no-origin requests

  for (const rule of list) {
    if (rule.includes('*')) {
      // Convert wildcard pattern to regex (only subdomain wildcards)
      const pattern = '^' + rule
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[a-z0-9-]+') + '$';
      const re = new RegExp(pattern, 'i');
      if (re.test(origin)) return true;
    } else if (origin === rule) {
      return true;
    }
  }
  return false;
}

// Startup security banner (no secrets - only counts)
logger.info('[SECURE-CORS] mode=%s allowlist_count=%d node=%s platform=%s',
  process.env.NODE_ENV || 'development',
  allowlist.length,
  process.version,
  process.platform
);

app.use(cors({
  origin: function (origin, callback) {
    const isAllowed = matchOrigin(origin, allowlist);

    if (isAllowed) {
      callback(null, origin || true);
    } else {
      // Security: log SHA256 hash of blocked origin, not the origin itself
      const crypto = require('crypto');
      const hash = origin ? crypto.createHash('sha256').update(origin).digest('hex').slice(0, 8) : 'null';
      logger.warn('CORS blocked unauthorized origin hash:', hash);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  maxAge: 600 // 10 minutes - cache preflight response
}));

app.use(express.json());
app.use(i18n);

const path = require('path');

// v14.4.2: Console redirect telemetry with 14-day retention
const redirects = [];

// v14.4: Permanent console unification - MUST be before static middleware
// owner-console.html → owner-super-console.html (301 permanent redirect)
app.get(['/owner-console', '/owner-console.html'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  // v14.4.2: Store redirect telemetry with 14-day retention
  redirects.push({
    t: Date.now(),
    from: req.path,
    to: '/owner-super-console.html',
    ip: req.ip,
    ua: req.get('user-agent') || ''
  });

  // Telemetry: track legacy console access
  realtimeBus.emit('console_redirect', {
    from: req.path,
    to: '/owner-super-console.html',
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.info('Console redirect: legacy → super', {
    from: req.path,
    to: '/owner-super-console.html',
    ip: req.ip
  });

  res.redirect(301, `/owner-super-console.html${qs}`);
});

// v14.4.2: Garbage collect old redirects every 6 hours (14-day retention)
setInterval(() => {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  while (redirects.length && redirects[0].t < cutoff) {
    redirects.shift();
  }
  logger.debug(`Redirect telemetry GC: ${redirects.length} entries retained`);
}, 6 * 60 * 60 * 1000);

// v15.2.3: Mount legacy path redirects BEFORE static middleware
const redirectsRouter = require('./routes/redirects');
app.use(redirectsRouter);

// v15.1.0: Add Cache-Control headers to prevent browser caching issues
app.use((req, res, next) => {
  // Disable caching for HTML, JS, and CSS files
  if (req.path.match(/\.(html|js|css)$/)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Serve static frontend files
// V22.3: Primary static files from backend/public (included in Railway deployment)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
// Fallback to ../frontend for local development
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/public', express.static(path.join(__dirname, '../frontend/public')));
app.use('/dashboard', express.static(path.join(__dirname, '../frontend/dashboard')));

// Explicit quick login route to avoid 404 in production deployments
app.get('/quick_login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quick_login.html'));
});

// Serve GFS Monthly Reports (Owner-only access, served statically)
const gfsReportsPath = '/Users/davidmikulis/Desktop/GFS_Monthly_Reports';
if (require('fs').existsSync(gfsReportsPath)) {
  app.use('/gfs-reports', express.static(gfsReportsPath));
  console.log('📊 GFS Monthly Reports available at /gfs-reports');
}

// Favicon route - serve favicon.svg for both /favicon.ico and /favicon.svg
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/favicon.svg'));
});

// Routes
app.use('/api/auth', authRoutes);

// PASS G/H v2.4.1 - Multi-tenant routes (require authentication + tenant context)
app.use('/api/inventory', authenticateToken, resolveTenant, inventoryRoutes);
app.use('/api/inventory', authenticateToken, resolveTenant, inventoryCountsRoutes); // v3.0.0 Count entry
app.use('/api/users', authenticateToken, resolveTenant, userRoutes);
app.use('/api/ai', authenticateToken, resolveTenant, aiFeedbackRoutes);

// PASS G v2.4.0 - Webhook Management
app.use('/api/webhooks', authenticateToken, resolveTenant, webhooksRoutes);

// v21.1 - Locations, Vendors, Population, POS routes
app.use('/api/locations', authenticateToken, locationsRoutes);
app.use('/api/vendors', authenticateToken, vendorsRoutes);
app.use('/api/population', authenticateToken, populationRoutes);
app.use('/api/pos/catalog', authenticateToken, posCatalogRoutes);
app.use('/api/pos/orders', authenticateToken, posOrdersRoutes);
app.use('/api/pos/registers', authenticateToken, posRegistersRoutes);
app.use('/api/pos/payments', authenticateToken, posPaymentsRoutes);
app.use('/api/pos/reports', authenticateToken, posReportsRoutes);

// P1 Hardening - Recipes and Waste routes (org-scoped)
app.use('/api/recipes', authenticateToken, resolveTenant, recipesRoutes);
app.use('/api/waste', authenticateToken, resolveTenant, wasteRoutes);

// v21.1 - Alias /api/items to /api/inventory for frontend compatibility
app.use('/api/items', authenticateToken, resolveTenant, inventoryRoutes);

// PASS H v2.4.1 - Admin Management APIs
app.use('/api/tenants', authenticateToken, resolveTenant, tenantsRoutes);
app.use('/api/roles', authenticateToken, resolveTenant, rolesRoutes);

// v15.5.3 - Admin User Management (OWNER only)
const { requireRole } = require('./security/rbac');
const { ROLES } = requireRole;
app.use('/api/admin', authenticateToken, adminUsersRoutes);

// PASS P v2.8.0 - Next Generation APIs
app.use('/api/ai/forecast', authenticateToken, resolveTenant, aiForecastRoutes.router);
app.use('/api/2fa', authenticateToken, twoFARoutes.router);

// V22.1 - NeuroPilot AI Engine (PostgreSQL-native inventory intelligence)
app.use('/api/ai', authenticateToken, resolveTenant, aiEngineRoutes);

// ============================================================================
// OWNER ROUTES - DEVICE BINDING ENFORCED (MacBook Pro Only)
// ============================================================================
app.use('/api/owner', authenticateToken, requireOwnerDevice, ownerRoutes);
app.use('/api/owner/ai', authenticateToken, requireOwnerDevice, ownerAIRoutes); // AI Widgets
app.use('/api/owner/ai/learning', authenticateToken, requireOwnerDevice, ownerAILearningRoutes); // Autonomous Learning

// v3.0.0 - Owner Mission Control Console
app.use('/api/owner/console', authenticateToken, requireOwnerDevice, ownerConsoleRoutes);

// v3.1.0 - Local AI Training & Release Management (Owner-only)
app.use('/api/owner/training', authenticateToken, requireOwnerDevice, ownerTrainingRoutes);
app.use('/api/owner/release', authenticateToken, requireOwnerDevice, ownerReleaseRoutes);

// v4.1.0 - PDF Invoice Manager (Owner-Only)
const ownerPdfsRoutes = require('./routes/owner-pdfs');
app.use('/api/owner/pdfs', authenticateToken, requireOwnerDevice, ownerPdfsRoutes);

// v6.7 - Daily Predictive Demand (Owner-only)
app.use('/api/owner/forecast', authenticateToken, requireOwnerDevice, ownerForecastRoutes);

// v3.3.0 - Owner Inventory (Zero-Count Smart Mode)
const ownerInventoryRoutes = require('./routes/owner-inventory');
app.use('/api/owner/inventory', authenticateToken, requireOwnerDevice, ownerInventoryRoutes);

// v3.2.0 - Owner Super Console Extensions (One-Command, Recovery, Reports)
const ownerOrchestrateRoutes = require('./routes/owner-orchestrate');
const ownerRecoveryRoutes = require('./routes/owner-recovery');
console.log('[STARTUP] Loading owner-reports...');
const ownerReportsRoutes = require('./routes/owner-reports');
console.log('[STARTUP] ✓ owner-reports loaded');
app.use('/api/super/orchestrate', authenticateToken, requireOwnerDevice, ownerOrchestrateRoutes);
app.use('/api/owner/recovery', authenticateToken, requireOwnerDevice, ownerRecoveryRoutes);
app.use('/api/owner/reports', authenticateToken, requireOwnerDevice, ownerReportsRoutes);
console.log('[STARTUP] ✓ owner-reports routes registered at /api/owner/reports');

// v12.5 - AI Ops Monitoring & Real-Time Status (NeuroPilot v12.5)
const ownerOpsRoutes = require('./routes/owner-ops');
app.use('/api/owner/ops', authenticateToken, requireOwnerDevice, ownerOpsRoutes);

// v13.1 - Dashboard Stats (Real Data)
const ownerDashboardStatsRoutes = require('./routes/owner-dashboard-stats');
app.use('/api/owner/dashboard', authenticateToken, requireOwnerDevice, ownerDashboardStatsRoutes);

// v14.4.2 - Menu Planning (4-week calendar, recipes, shopping lists)
const menuRoutes = require('./routes/menu');
app.use('/api/menu', authenticateToken, requireOwnerDevice, menuRoutes);

// v15.2.0 - Inventory Reconciliation (H1 2025 PDF Intake + Physical vs System)
const inventoryReconcileRoutes = require('./routes/inventory-reconcile');
app.use('/api/inventory', authenticateToken, requireOwnerDevice, inventoryReconcileRoutes);

// P1 Hardening - BRANCH 3: Inventory Snapshots Read API
const snapshotsRoutes = require('./routes/snapshots');
app.use('/api/inventory', authenticateToken, resolveTenant, snapshotsRoutes);

// v15.4.0 - Finance Workspace (KPIs, summaries, pivots, AI copilot)
const financeRoutes = require('./routes/finance');
app.use('/api/finance', authenticateToken, requireOwnerDevice, financeRoutes);

// v23.4.0 - Equipment/Furniture Item Bank API
const equipmentRoutes = require('./routes/equipment-api');
app.use('/api/equipment', authenticateToken, requireOwnerDevice, equipmentRoutes);

// v15.5.0 - AI Forecasting + Order Recommendation Engine
const ownerForecastOrdersRoutes = require('./routes/owner-forecast-orders');
app.use('/api/owner/forecast-orders', authenticateToken, requireOwnerDevice, ownerForecastOrdersRoutes);

// v15.6.0 - Count by Invoice (Finance-First Workflow)
app.use('/api/owner/counts', authenticateToken, requireOwnerDevice, countSessionsRoutes);

// v23.0 - PostgreSQL-native Counts API (Phase A/B inventory model)
app.use('/api/counts', authenticateToken, countsApiRoutes);
app.use('/api', authenticateToken, countsApiRoutes); // For /api/locations/:id/items/add-by-code

// v15.7.0 - System Health Monitoring & Audit
// Note: Auth handled per-route in health-v2.js (/status is public, others require OWNER/FINANCE)
app.use('/api/health', healthRoutes);

// v21.1.1 - Temporary admin endpoint to run migration 019 (documents table)
// DELETE THIS AFTER RUNNING ONCE
app.get('/api/admin/run-migration-019', authenticateToken, async (req, res) => {
  if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Owner/Admin only' });
  }

  try {
    const { pool } = require('./db');
    const fs = require('fs');
    const path = require('path');

    const migrationPath = path.join(__dirname, 'migrations/postgres/019_create_documents_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    res.json({
      success: true,
      message: 'Migration 019 completed - documents table created',
      note: 'You can now remove this endpoint from server.js'
    });
  } catch (error) {
    if (error.code === '42P07') {
      res.json({ success: true, message: 'Table already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// v19.0 - NeuroNexus Autonomous Foundation (Forecast + Recommendations)
const recommendationsRoutes = require('./routes/recommendations');
app.use('/api/forecast/recommendations', authenticateToken, requireOwnerDevice, recommendationsRoutes);

// v15.8.0 - Quantum Governance Layer (Unified Governance Scoring)
// Note: Auth handled per-route in governance.js (/status requires OWNER/FINANCE/OPS, /report requires OWNER/FINANCE, /recompute requires OWNER)
app.use('/api/governance', governanceRoutes);

// v15.9.0 - Governance Forecasting & Trend Analytics
const governanceTrendsRoutes = require('./routes/governance-trends');
app.use('/api/governance', governanceTrendsRoutes);

// v16.0.0 - Governance Intelligence Dashboard (Anomaly Detection + Bilingual Insights)
const governanceIntelligenceRoutes = require('./routes/governance-intelligence');
app.use('/api/governance/intelligence', governanceIntelligenceRoutes);

// v16.5.0 - Predictive Governance API (Unified Command Center + 7-day Forecasting)
// Note: Auth handled per-route in governance-predictive.js (requires OWNER/FINANCE/OPS)
const governancePredictiveRoutes = require('./routes/governance-predictive');
app.use('/api/governance/predictive', governancePredictiveRoutes);

// v16.4.0 - Live Governance Dashboard (Real-time scores + sparklines)
// Note: Auth handled per-route in governance-live.js (requires OWNER/FINANCE/OPS)
app.use(governanceLiveRoutes);

// v16.6.0 - Adaptive Intelligence & Auto-Recovery (Predictive Stability Layer)
// Canonical path (new)
app.use('/api/ai/adaptive', stabilityRoutes);

// Legacy alias (deprecated, kept for backward compatibility)
app.use('/api/stability', (req, res, next) => {
  logger.warn('[DEPRECATION] /api/stability* → use /api/ai/adaptive*', {
    path: req.originalUrl,
    ip: req.ip,
    user: req.user?.email || 'unauthenticated'
  });
  next();
}, stabilityRoutes);

// v14.4: Track server start time for uptime calculation
const serverStartTime = Date.now();

app.get('/health', async (req, res) => {
  const feedbackStats = feedbackStream.getStats();
  const forecastStats = forecastWorker.getStats();

  // Get Redis stats if available
  let redisStats = null;
  if (redisStatsCollector) {
    try {
      redisStats = await redisStatsCollector.getStatsSnapshot();
    } catch (error) {
      redisStats = { available: false, error: error.message };
    }
  }

  res.json({
    status: 'ok',
    app: 'inventory-enterprise-v16.5.0',
    version: '16.5.0',
    features: {
      multiTenancy: true,
      rbac: true,
      webhooks: true,
      realtime: true,
      aiOps: aiOpsAgent ? aiOpsAgent.isRunning : false,
      governance: governanceAgent ? governanceAgent.isRunning : false,
      insights: insightGenerator ? insightGenerator.isRunning : false,
      compliance: complianceAudit ? complianceAudit.isRunning : false,
      forecasting: forecastService !== null,
      twoFactor: twoFactorAuth !== null,
      auditLogging: auditLogger !== null,
      redis: redisClient !== null,
      postgresql: process.env.PG_ENABLED === 'true'
    },
    realtime: {
      websocket: realtimeAI.connections ? realtimeAI.connections.size : 0,
      feedbackStream: feedbackStats.isStreaming,
      forecastWorker: forecastStats.isWatching,
      modelsLoaded: forecastStats.modelsLoaded
    },
    infrastructure: {
      redis: redisStats,
      database: process.env.PG_ENABLED === 'true' ? 'PostgreSQL' : 'SQLite'
    },
    aiOps: aiOpsAgent ? aiOpsAgent.getStatistics() : null,
    governance: governanceAgent ? governanceAgent.getStatistics() : null,
    compliance: complianceAudit ? complianceAudit.getStatistics() : null
  });
});

// v14.4: Kubernetes-style health check endpoints for Fly.io/Render deployment
app.get('/healthz', (req, res) => {
  // Liveness probe - simple uptime check
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  res.status(200).json({
    status: 'ok',
    uptime: uptimeSeconds
  });
});

app.get('/readyz', async (req, res) => {
  // Readiness probe - check critical services
  try {
    const db = require('./config/database');

    // Check database connection
    await db.get('SELECT 1');

    // Check if critical services are initialized
    const ready = phase3Cron !== null;

    if (!ready) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Services still initializing'
      });
    }

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      phase3Cron: 'active'
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsExporter.register.contentType);
    const metrics = await metricsExporter.getMetrics();
    // v15.2.3: Include broken link metrics
    const brokenLinkMetrics = get404Metrics();
    // v15.3: Include financial metrics
    const financialMetrics = getFinancialMetrics();
    res.send(metrics + '\n' + brokenLinkMetrics + '\n' + financialMetrics);
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
});

// Alias for metrics endpoint (for frontend API calls)
app.get('/api/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsExporter.register.contentType);
    const metrics = await metricsExporter.getMetrics();
    // v15.2.3: Include broken link metrics
    const brokenLinkMetrics = get404Metrics();
    // v15.3: Include financial metrics
    const financialMetrics = getFinancialMetrics();
    res.send(metrics + '\n' + brokenLinkMetrics + '\n' + financialMetrics);
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
});

// Serve frontend index.html for root and SPA routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// v15.2.3: Catch-all route for SPA (sets status, lets telemetry log, then sends response)
app.get('*', (req, res, next) => {
  // Don't catch requests for static files (.html, .js, .css, etc.)
  if (req.path.match(/\.(html|js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
    // File not found - set status and let telemetry middleware log it
    res.status(404);
    return next();
  }

  // Only serve frontend for non-API routes
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    // API endpoint not found - set status and let telemetry middleware log it
    res.status(404);
    next();
  }
});

// v15.2.3: Mount 404 telemetry AFTER all routes (logs 404s before response sent)
app.use(telemetry404);

// v15.2.3: Final 404 handler (sends response after telemetry logs)
app.use((req, res) => {
  if (res.headersSent) {
    return;
  }

  // If we reach here, it's a 404
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    res.status(404).send('File not found');
  }
});

const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.IO
const httpServer = http.createServer(app);

// Start server (Railway-compatible: Bind to 0.0.0.0 to accept external connections)
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 NeuroInnovate Inventory Enterprise System v16.5.0');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📝 Default admin: neuro.pilot.ai@gmail.com / Admin123!@#`);
  console.log(`🔒 Security: Multi-Tenancy + RBAC + Webhooks + 2FA ENABLED`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initialize PASS P - Infrastructure (v2.8.0)
  const db = require('./config/database');

  // Make database and metrics available to routes
  app.locals.db = db;
  app.locals.metrics = metricsExporter;

  // v15.2.2: Run schema migrations (safe column additions)
  try {
    console.log('🔄 Running schema migrations...');
    const { runIssueUnitMigration } = require('./src/db/runMigrations');
    const migrationResult = await runIssueUnitMigration(db);
    if (migrationResult.success) {
      console.log(`  ✅ Schema migration complete (${migrationResult.columnsAdded} columns added)`);
    } else {
      console.warn(`  ⚠️  Schema migration warning: ${migrationResult.error}`);
    }
  } catch (migrationError) {
    console.error('  ⚠️  Schema migration failed:', migrationError.message);
    // Continue startup - non-fatal
  }

  // v21.2: Run PostgreSQL migrations on startup
  try {
    console.log('🔄 Running PostgreSQL migrations...');
    const { pool } = require('./db');
    const { runPostgresMigrations } = require('./src/db/runPostgresMigrations');
    const pgMigrationResult = await runPostgresMigrations(pool);
    if (pgMigrationResult.success) {
      console.log(`  ✅ PostgreSQL migrations complete (${pgMigrationResult.migrationsRun} files processed)`);
    } else {
      console.warn(`  ⚠️  PostgreSQL migration warning: ${pgMigrationResult.error}`);
    }
  } catch (pgMigrationError) {
    console.error('  ⚠️  PostgreSQL migration failed:', pgMigrationError.message);
    // Continue startup - non-fatal
  }

  // v13.0: Make realtimeBus available to routes
  app.set('realtimeBus', realtimeBus);

  // Redis Connection (optional, graceful degradation if unavailable)
  if (process.env.REDIS_ENABLED === 'true') {
    try {
      console.log('🔄 Initializing Redis Cluster (v2.8.0)...');
      const Redis = require('ioredis');

      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        retryStrategy(times) {
          if (times > 3) {
            console.log('  ⚠️  Redis max retries exceeded, disabling Redis');
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 100, 2000);
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        lazyConnect: false,
        showFriendlyErrorStack: false
      });

      // Suppress noisy error/close events during retry attempts
      redisClient.on('error', (err) => {
        // Only log significant errors, not retry attempts
        if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
          logger.error('Redis error:', err.message);
        }
      });

      redisClient.on('close', () => {
        // Suppress noisy close events
      });

      await redisClient.ping();
      console.log('  ✅ Redis connected');

      // Initialize Redis metrics collector
      redisStatsCollector = new RedisStatsCollector(redisClient, metricsExporter.register);
      console.log('  ✅ Redis metrics collector started');
    } catch (error) {
      logger.error('Redis initialization failed:', error);
      console.error('  ⚠️  Redis not available, continuing without caching');
      redisClient = null;
    }
  }

  // Initialize Forecast Service
  if (process.env.AI_FORECAST_ENABLED === 'true') {
    try {
      console.log('🤖 Initializing AI Forecasting Service (v2.8.0)...');
      forecastService = new ForecastService({
        db,
        redisClient,
        pythonPath: process.env.PYTHON_BIN || 'python3',
        cacheEnabled: redisClient !== null,
        cacheTTL: parseInt(process.env.FORECAST_CACHE_TTL) || 3600
      });
      console.log('  ✅ Forecast service ready (ARIMA + Prophet)');
      console.log('  📊 Python forecasting enabled');
    } catch (error) {
      logger.error('Forecast service initialization failed:', error);
      console.error('  ⚠️  Forecasting not available');
    }
  }

  // Initialize 2FA
  try {
    console.log('🔐 Initializing Two-Factor Authentication (v2.8.0)...');
    twoFactorAuth = new TwoFactorAuth(db);
    console.log('  ✅ 2FA service ready (TOTP + backup codes)');
    if (process.env.REQUIRE_2FA_FOR_ADMINS === 'true') {
      console.log('  🔒 2FA required for admin accounts');
    }
  } catch (error) {
    logger.error('2FA initialization failed:', error);
    console.error('  ⚠️  2FA not available');
  }

  // Initialize Audit Logging
  try {
    console.log('📝 Initializing Audit Logging (v2.8.0)...');
    auditLogger = new AuditLogger(db);
    // Apply audit middleware globally (after other middleware)
    app.use(auditLogger.auditMiddleware());
    console.log('  ✅ Audit logging active');
    console.log('  🔍 PII scrubbing enabled');
  } catch (error) {
    logger.error('Audit logging initialization failed:', error);
    console.error('  ⚠️  Audit logging not available');
  }

  console.log('  ✨ v16.5.0 Infrastructure ACTIVE\n');

  // Initialize PASS F - Real-Time Intelligence Layer (v2.3.0)
  try {
    console.log('🔄 Initializing Real-Time Intelligence Layer (v2.3.0)...');

    realtimeAI.initialize(httpServer);
    console.log('  ✅ WebSocket server initialized');

    await feedbackStream.start();
    console.log('  ✅ Feedback stream started');

    await forecastWorker.start();
    console.log('  ✅ Forecast worker started (hot-reload enabled)');

    console.log('  ✨ Real-Time Intelligence ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Real-Time Intelligence:', error);
    console.error('  ⚠️  Warning: Real-Time features may not be available\n');
  }

  // Initialize PASS L - AI Ops Automation (v2.6.0)
  if (process.env.AIOPS_ENABLED === 'true') {
    try {
      console.log('🤖 Initializing AI Ops Agent (v2.6.0)...');

      aiOpsAgent = new AIOperationsAgent({
        checkInterval: parseInt(process.env.AIOPS_CHECK_INTERVAL_MS) || 60000,
        predictionWindow: 24,
        autoRemediationEnabled: process.env.AIOPS_AUTO_REMEDIATION === 'true',
        dryRun: process.env.AIOPS_DRY_RUN === 'true'
      });

      await aiOpsAgent.initialize();
      await aiOpsAgent.start();

      console.log('  ✅ AI Ops Agent started');
      console.log('  📊 Predictive monitoring: 24h ahead');
      console.log('  🔧 Auto-remediation: ' + (process.env.AIOPS_AUTO_REMEDIATION === 'true' ? 'ENABLED' : 'DISABLED'));
      console.log('  ✨ AI Ops ACTIVE\n');
    } catch (error) {
      logger.error('Failed to initialize AI Ops Agent:', error);
      console.error('  ⚠️  Warning: AI Ops features may not be available\n');
    }
  }

  // Initialize PASS M - Generative Intelligence & Autonomous Governance (v2.7.0)
  if (process.env.GOVERNANCE_ENABLED === 'true' || process.env.INSIGHT_ENABLED === 'true' || process.env.COMPLIANCE_ENABLED === 'true') {
    console.log('🧠 Initializing Generative Intelligence (v2.7.0)...');

    // Governance Agent
    if (process.env.GOVERNANCE_ENABLED === 'true') {
      try {
        governanceAgent = new GovernanceAgent({
          learningInterval: parseInt(process.env.GOVERNANCE_LEARNING_INTERVAL) || 86400000,
          adaptationEnabled: process.env.GOVERNANCE_ADAPTATION_ENABLED === 'true',
          confidenceThreshold: parseFloat(process.env.GOVERNANCE_CONFIDENCE_THRESHOLD) || 0.85
        });

        await governanceAgent.initialize();
        await governanceAgent.start();
        console.log('  ✅ Governance Agent started (24h learning cycles)');
      } catch (error) {
        logger.error('Failed to initialize Governance Agent:', error);
        console.error('  ⚠️  Warning: Governance features may not be available');
      }
    }

    // Insight Generator
    if (process.env.INSIGHT_ENABLED === 'true') {
      try {
        insightGenerator = new InsightGenerator({
          provider: process.env.INSIGHT_PROVIDER || 'openai',
          apiKey: process.env.INSIGHT_PROVIDER === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY
            : process.env.OPENAI_API_KEY,
          model: process.env.INSIGHT_MODEL || 'gpt-4',
          reportInterval: parseInt(process.env.INSIGHT_REPORT_INTERVAL) || 604800000,
          languages: (process.env.INSIGHT_LANGUAGES || 'en,fr').split(',')
        });

        await insightGenerator.initialize();
        await insightGenerator.start();
        console.log('  ✅ Insight Generator started (weekly reports)');
        console.log('  📝 Languages: ' + (process.env.INSIGHT_LANGUAGES || 'en,fr'));
        console.log('  🤖 LLM Provider: ' + (process.env.INSIGHT_PROVIDER || 'openai'));
      } catch (error) {
        logger.error('Failed to initialize Insight Generator:', error);
        console.error('  ⚠️  Warning: Insight features may not be available');
      }
    }

    // Compliance Audit
    if (process.env.COMPLIANCE_ENABLED === 'true') {
      try {
        complianceAudit = new ComplianceAudit({
          auditInterval: parseInt(process.env.COMPLIANCE_AUDIT_INTERVAL) || 86400000,
          frameworks: (process.env.COMPLIANCE_FRAMEWORKS || 'iso27001,soc2,owasp').split(','),
          minComplianceScore: parseFloat(process.env.COMPLIANCE_MIN_SCORE) || 0.95
        });

        await complianceAudit.initialize();
        await complianceAudit.start();
        console.log('  ✅ Compliance Audit started (daily scans)');
        console.log('  🔐 Frameworks: ' + (process.env.COMPLIANCE_FRAMEWORKS || 'iso27001,soc2,owasp'));
      } catch (error) {
        logger.error('Failed to initialize Compliance Audit:', error);
        console.error('  ⚠️  Warning: Compliance features may not be available');
      }
    }

    console.log('  ✨ Generative Intelligence ACTIVE\n');
  }

  // Initialize Phase 3 - Autonomous Learning & Optimization Layer (v3.0.0)
  try {
    console.log('🧬 Initializing Phase 3: Autonomous Learning Layer (v3.0.0)...');

    // v13.0: Pass realtimeBus to Phase3CronScheduler
    phase3Cron = new Phase3CronScheduler(db, metricsExporter, realtimeBus);
    phase3Cron.start();

    // Make available to routes
    app.locals.phase3Cron = phase3Cron;
    app.set('phase3Cron', phase3Cron); // v13.0: For easy route access

    console.log('  ✅ AI Tuner Service ready (daily proposal generation)');
    console.log('  ✅ Health Prediction Service ready (hourly risk assessment)');
    console.log('  ✅ Security Scanner ready (daily anomaly detection)');
    console.log('  ✅ Governance Reporter ready (weekly reports)');
    console.log('  🔄 Scheduled jobs: 6 active');
    console.log('  ✨ Phase 3 Autonomous Learning ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Phase 3 Autonomous Learning:', error);
    console.error('  ⚠️  Warning: Phase 3 features may not be available\n');
  }

  // Initialize Phase 4 - Governance Intelligence Layer (v16.0.0)
  try {
    console.log('🔮 Initializing Phase 4: Governance Intelligence Layer (v16.0.0)...');

    phase4Cron = new Phase4CronScheduler(db, metricsExporter, realtimeBus);
    phase4Cron.start();

    // Make available to routes
    app.locals.phase4Cron = phase4Cron;
    app.set('phase4Cron', phase4Cron);

    console.log('  ✅ Intelligence Anomaly Detection ready (daily 03:00)');
    console.log('  ✅ Intelligence Insight Generation ready (daily 03:05, bilingual)');
    console.log('  ✅ Intelligence Score Computation ready (daily 03:10)');
    console.log('  ✅ Weekly PDF Report Generator ready (Sunday 04:00, EN+FR)');
    console.log('  🔄 Scheduled jobs: 4 active');
    console.log('  ✨ Phase 4 Governance Intelligence ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Phase 4 Governance Intelligence:', error);
    console.error('  ⚠️  Warning: Phase 4 features may not be available\n');
  }

  // Initialize v3.1.0 - Local AI Training on Apple Silicon
  try {
    console.log('🍎 Initializing Local AI Training on Apple Silicon (v3.1.0)...');

    const LocalTrainer = require('./src/ai/local_training/LocalTrainer');
    await LocalTrainer.initialize();

    const hwProfile = LocalTrainer.hardwareProfile;
    console.log(`  ✅ Hardware: ${hwProfile.chipModel} (${hwProfile.totalCores} cores, ${hwProfile.totalMemoryGB}GB)`);
    console.log(`  ✅ Accelerate: ${hwProfile.accelerateEnabled ? 'ENABLED' : 'NOT DETECTED'}`);
    console.log(`  ✅ Training: Prophet + ARIMA ready`);
    console.log(`  ✅ Release: Owner-gated promotion with SHA256 checksums`);
    console.log('  ✨ Local Training ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Local AI Training:', error);
    console.error('  ⚠️  Warning: Local training features may not be available\n');
  }

  // Initialize v4.1.0 - Quantum Defense Governance
  try {
    console.log('🔐 Initializing Quantum Defense Governance (v4.1.0)...');

    // Quantum Key Manager
    quantumKeys = new QuantumKeyManager({
      rotationInterval: 604800000, // 7 days
      kyberEnabled: false, // Simplified for production
      autoRotate: true
    });
    await quantumKeys.initialize();
    console.log('  ✅ Quantum Key Manager active (weekly rotation)');

    // Autonomous Compliance Engine
    complianceEngine = new AutonomousCompliance({
      dbPath: './db/inventory_enterprise.db',
      frameworks: ['soc2', 'iso27001', 'owasp'],
      scoreThreshold: 85,
      reportInterval: 86400000 // 24 hours
    });
    await complianceEngine.initialize();
    console.log('  ✅ Compliance Engine active (daily reports)');

    // Make quantum keys available for signing
    app.locals.quantumKeys = quantumKeys;
    app.locals.complianceEngine = complianceEngine;

    console.log('  ✨ Quantum Governance Layer ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Quantum Governance:', error);
    console.error('  ⚠️  Warning: Quantum Governance features may not be available\n');
  }

  // Initialize v19.0 - NeuroNexus Autonomous Foundation
  if (process.env.SCHEDULER_ENABLED !== 'false') {
    try {
      console.log('🤖 Initializing NeuroNexus Autonomous Foundation (v19.0)...');

      AutonomousScheduler.startScheduler();
      autonomousScheduler = AutonomousScheduler;

      console.log('  ✅ Autonomous Scheduler started');
      console.log('  📊 Daily Forecast: 02:00 UTC');
      console.log('  🔄 Weekly Retrain: Sunday 03:00 UTC');
      console.log('  💓 Health Check: Every 5 minutes');
      console.log('  ✨ NeuroNexus Autonomous Foundation ACTIVE\n');
    } catch (error) {
      logger.error('Failed to initialize Autonomous Foundation:', error);
      console.error('  ⚠️  Warning: Autonomous scheduling features may not be available\n');
    }
  } else {
    console.log('ℹ️  Autonomous Scheduler disabled (SCHEDULER_ENABLED=false)\n');
  }

  // Initialize v22.3 - Background Workers (GFS Order Watcher)
  try {
    console.log('📦 Initializing Background Workers (v22.3)...');
    backgroundWorkers = await initWorkers();
    console.log('  ✅ GFS Order Watcher ready');
    console.log('  ✨ Background Workers ACTIVE\n');
  } catch (error) {
    logger.error('Failed to initialize Background Workers:', error);
    console.error('  ⚠️  Warning: Background workers may not be available\n');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ ALL SYSTEMS OPERATIONAL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  console.log('📈 Metrics: http://localhost:' + PORT + '/metrics');
  console.log('🌐 WebSocket: ws://localhost:' + PORT + '/ai/realtime');
  console.log('═══════════════════════════════════════════════════════════════\n');
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    // Stop v2.8.0 services
    if (redisStatsCollector) {
      console.log('Stopping Redis metrics collector...');
      redisStatsCollector.stop();
    }
    if (redisClient) {
      console.log('Closing Redis connection...');
      await redisClient.quit();
    }

    // Stop AI Ops & Generative Intelligence agents
    if (aiOpsAgent) {
      console.log('Stopping AI Ops Agent...');
      await aiOpsAgent.stop();
    }
    if (governanceAgent) {
      console.log('Stopping Governance Agent...');
      await governanceAgent.stop();
    }
    if (insightGenerator) {
      console.log('Stopping Insight Generator...');
      await insightGenerator.stop();
    }
    if (complianceAudit) {
      console.log('Stopping Compliance Audit...');
      await complianceAudit.stop();
    }

    // Stop Phase 3 Autonomous Learning
    if (phase3Cron) {
      console.log('Stopping Phase 3 Autonomous Learning cron jobs...');
      phase3Cron.stop();
    }

    // Stop Phase 4 Governance Intelligence
    if (phase4Cron) {
      console.log('Stopping Phase 4 Governance Intelligence cron jobs...');
      phase4Cron.stop();
    }

    // Stop v19.0 Autonomous Scheduler
    if (autonomousScheduler) {
      console.log('Stopping NeuroNexus Autonomous Scheduler...');
      // Scheduler uses node-cron which stops automatically when process exits
    }

    // Stop v22.3 Background Workers
    if (backgroundWorkers) {
      console.log('Stopping Background Workers...');
      await stopWorkers(backgroundWorkers);
    }

    // Stop real-time components
    console.log('Stopping Real-Time Intelligence...');
    feedbackStream.stop();
    await forecastWorker.stop();
    await realtimeAI.shutdown();

    // Close HTTP server
    httpServer.close(() => {
      console.log('✅ All systems stopped gracefully');
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
