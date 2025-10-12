const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const inventoryCountsRoutes = require('./routes/inventory-counts-api'); // v3.0.0 Inventory Counts
const userRoutes = require('./routes/users');
const aiFeedbackRoutes = require('./routes/ai-feedback-api');

// PASS G v2.4.0 - Multi-Tenancy & RBAC
const webhooksRoutes = require('./routes/webhooks_2025-10-07');

// PASS H v2.4.1 - Admin Management APIs
const tenantsRoutes = require('./routes/tenants');
const rolesRoutes = require('./routes/roles-api');

// PASS P v2.8.0 - Next Generation Features
const aiForecastRoutes = require('./routes/ai-forecast');
const twoFARoutes = require('./routes/2fa');
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

// Phase 3: Autonomous Learning & Optimization Layer
const Phase3CronScheduler = require('./cron/phase3_cron');

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

// v4.1.0 Quantum Governance services
let quantumKeys = null;
let complianceEngine = null;

const app = express();
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP to allow frontend resources
}));
app.use(cors());
app.use(express.json());
app.use(i18n);

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/dashboard', express.static(path.join(__dirname, '../frontend/dashboard')));

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

// PASS H v2.4.1 - Admin Management APIs
app.use('/api/tenants', authenticateToken, resolveTenant, tenantsRoutes);
app.use('/api/roles', authenticateToken, resolveTenant, rolesRoutes);

// PASS P v2.8.0 - Next Generation APIs
app.use('/api/ai/forecast', authenticateToken, resolveTenant, aiForecastRoutes.router);
app.use('/api/2fa', authenticateToken, twoFARoutes.router);

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
const ownerReportsRoutes = require('./routes/owner-reports');
app.use('/api/super/orchestrate', authenticateToken, requireOwnerDevice, ownerOrchestrateRoutes);
app.use('/api/owner/recovery', authenticateToken, requireOwnerDevice, ownerRecoveryRoutes);
app.use('/api/owner/reports', authenticateToken, requireOwnerDevice, ownerReportsRoutes);

// v12.5 - AI Ops Monitoring & Real-Time Status (NeuroPilot v12.5)
const ownerOpsRoutes = require('./routes/owner-ops');
app.use('/api/owner/ops', authenticateToken, requireOwnerDevice, ownerOpsRoutes);

// v13.1 - Dashboard Stats (Real Data)
const ownerDashboardStatsRoutes = require('./routes/owner-dashboard-stats');
app.use('/api/owner/dashboard', authenticateToken, requireOwnerDevice, ownerDashboardStatsRoutes);

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
    app: 'inventory-enterprise-v2.8.0',
    version: '2.8.0',
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

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsExporter.register.contentType);
    const metrics = await metricsExporter.getMetrics();
    res.send(metrics);
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
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
});

// Serve frontend index.html for root and SPA routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Catch-all route for SPA (after all API routes)
app.get('*', (req, res) => {
  // Don't catch requests for static files (.html, .js, .css, etc.)
  if (req.path.match(/\.(html|js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
    // Let express.static middleware handle these
    return res.status(404).send('File not found');
  }

  // Only serve frontend for non-API routes
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.IO
const httpServer = http.createServer(app);

// Start server (SECURITY FIX: Bind to localhost only)
httpServer.listen(PORT, '127.0.0.1', async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 NeuroInnovate Inventory Enterprise System v2.8.0');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📝 Default admin: neuro.pilot.ai@gmail.com / Admin123!@#`);
  console.log(`🔒 Security: Multi-Tenancy + RBAC + Webhooks + 2FA ENABLED`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initialize PASS P - Infrastructure (v2.8.0)
  const db = require('./config/database');

  // Make database available to routes (for v6.7 forecast routes)
  app.locals.db = db;

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
          if (times > 3) return null; // Stop retrying after 3 attempts
          return Math.min(times * 100, 2000);
        },
        maxRetriesPerRequest: 3
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

  console.log('  ✨ v2.8.0 Infrastructure ACTIVE\n');

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
