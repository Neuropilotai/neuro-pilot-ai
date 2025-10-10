/**
 * Owner AI Learning & Governance Routes - Phase 3
 * Autonomous learning, health prediction, security scanning, governance reports
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../config/logger');

// AI Services
const AITunerService = require('../src/ai/learning/AITunerService');
const HealthPredictionService = require('../src/ai/learning/HealthPredictionService');
const SecurityScannerService = require('../src/ai/security/SecurityScannerService');
const GovernanceReportService = require('../src/ai/governance/GovernanceReportService');

// Owner email whitelist (both normalized and unnormalized)
const OWNER_EMAILS = ['neuro.pilot.ai@gmail.com', 'neuropilotai@gmail.com'];
const OWNER_ROLES = ['admin', 'OWNER'];

/**
 * Middleware: Require owner access
 */
function requireOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Owner AI learning endpoints require valid JWT token'
    });
  }

  const isOwnerEmail = OWNER_EMAILS.includes(req.user.email);
  const isOwnerRole = OWNER_ROLES.includes(req.user.role);

  if (!isOwnerEmail && !isOwnerRole) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'AI learning endpoints are restricted to system owner'
    });
  }

  next();
}

/**
 * Audit logging helper
 */
async function auditLog(db, req, action, details) {
  try {
    await db.run(
      `INSERT INTO audit_logs (event_type, severity, action, user_email, ip_address, details)
       VALUES ('OWNER_AI_LEARNING', 'INFO', ?, ?, ?, ?)`,
      [action, req.user?.email, req.ip, JSON.stringify(details)]
    );
  } catch (error) {
    logger.error('Audit logging failed', { error: error.message });
  }
}

// Apply middlewares to all routes
router.use(authenticateToken);
router.use(requireOwner);

// ========== ENDPOINT 1: GET /api/owner/ai/learning/recommendations ==========
/**
 * Get AI tuning proposals/recommendations
 * Query params: status (optional), limit (default: 10)
 */
router.get('/learning/recommendations', async (req, res) => {
  const startTime = Date.now();

  try {
    const { status, limit = 10 } = req.query;
    const db = req.app.locals.db;

    let sql = 'SELECT * FROM ai_tuning_proposals WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const proposals = await db.all(sql, params);

    const recommendations = proposals.map(p => ({
      id: p.id,
      proposalId: `${p.module}_${p.key}_${p.id}`,
      category: p.module,
      title: `${p.module}.${p.key}`,
      description: p.rationale,
      currentValue: p.old_value,
      proposedValue: p.new_value,
      expectedImpact: p.expected_impact_pct,
      confidence: p.confidence,
      status: p.status,
      createdAt: p.created_at,
      approvedBy: p.approved_by,
      appliedAt: p.applied_at
    }));

    const duration = (Date.now() - startTime) / 1000;

    // Record metrics
    if (req.app.locals.metricsExporter?.recordOwnerAIRouteLatency) {
      req.app.locals.metricsExporter.recordOwnerAIRouteLatency('/learning/recommendations', duration);
    }

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to get recommendations', { error: error.message });

    if (req.app.locals.metricsExporter?.recordOwnerAIRouteError) {
      req.app.locals.metricsExporter.recordOwnerAIRouteError('/learning/recommendations', 500);
    }

    res.status(500).json({ error: 'Failed to retrieve recommendations' });
  }
});

// ========== ENDPOINT 2: POST /api/owner/ai/learning/approve ==========
/**
 * Approve a tuning proposal
 * Body: { proposalId }
 */
router.post('/learning/approve', async (req, res) => {
  const startTime = Date.now();

  try {
    const { proposalId } = req.body;
    const db = req.app.locals.db;

    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    // Update proposal status
    const result = await db.run(
      `UPDATE ai_tuning_proposals
       SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [req.user.email, proposalId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Proposal not found or already processed' });
    }

    // Audit log
    await auditLog(db, req, 'APPROVE_PROPOSAL', { proposalId });

    // Record metrics
    if (req.app.locals.metricsExporter?.recordPhase3TunerProposal) {
      req.app.locals.metricsExporter.recordPhase3TunerProposal('approved', 'manual');
    }

    const duration = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      proposalId,
      status: 'approved',
      message: 'Proposal approved and queued for application',
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to approve proposal', { error: error.message });
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

// ========== ENDPOINT 3: POST /api/owner/ai/feedback/submit ==========
/**
 * Submit AI feedback
 * Body: { module, metric, feedbackType, rating, comment }
 */
router.post('/feedback/submit', async (req, res) => {
  const startTime = Date.now();

  try {
    const { module, metric, feedbackType, rating, comment } = req.body;
    const db = req.app.locals.db;

    if (!module || !feedbackType) {
      return res.status(400).json({ error: 'module and feedbackType are required' });
    }

    if (!['positive', 'negative', 'neutral'].includes(feedbackType)) {
      return res.status(400).json({ error: 'feedbackType must be positive, negative, or neutral' });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const result = await db.run(
      `INSERT INTO ai_feedback (module, metric, feedback_type, rating, comment, user_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [module, metric, feedbackType, rating, comment, req.user.email]
    );

    const feedbackId = `fb_${result.lastID}`;

    // Audit log
    await auditLog(db, req, 'SUBMIT_FEEDBACK', { module, feedbackType, rating });

    const duration = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      feedbackId,
      message: 'Feedback recorded for AI learning cycle',
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to submit feedback', { error: error.message });
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// ========== ENDPOINT 4: GET /api/owner/ai/predict/health ==========
/**
 * Get system health prediction
 * Query params: tenantId (optional)
 */
router.get('/predict/health', async (req, res) => {
  const startTime = Date.now();

  try {
    const { tenantId } = req.query;
    const db = req.app.locals.db;
    const metricsExporter = req.app.locals.metricsExporter;

    const healthService = new HealthPredictionService(db, metricsExporter);
    const prediction = await healthService.predict({ tenantId });

    const duration = (Date.now() - startTime) / 1000;

    // Record metrics
    if (metricsExporter?.recordOwnerAIRouteLatency) {
      metricsExporter.recordOwnerAIRouteLatency('/predict/health', duration);
    }

    res.json({
      success: true,
      forecast: prediction,
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to predict health', { error: error.message });

    if (req.app.locals.metricsExporter?.recordOwnerAIRouteError) {
      req.app.locals.metricsExporter.recordOwnerAIRouteError('/predict/health', 500);
    }

    res.status(500).json({ error: 'Failed to predict system health' });
  }
});

// ========== ENDPOINT 5: GET /api/owner/ai/security/findings ==========
/**
 * Get security findings
 * Query params: severity (optional), limit (default: 20), status (default: open)
 */
router.get('/security/findings', async (req, res) => {
  const startTime = Date.now();

  try {
    const { severity, limit = 20, status = 'open' } = req.query;
    const db = req.app.locals.db;
    const metricsExporter = req.app.locals.metricsExporter;

    const securityService = new SecurityScannerService(db, metricsExporter);

    let sql = 'SELECT * FROM ai_security_findings WHERE 1=1';
    const params = [];

    if (severity) {
      sql += ' AND severity = ?';
      params.push(severity);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const rows = await db.all(sql, params);

    const findings = rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      severity: row.severity,
      type: row.type,
      evidence: JSON.parse(row.evidence || '{}'),
      recommendation: JSON.parse(row.recommendation || '[]'),
      status: row.status
    }));

    const duration = (Date.now() - startTime) / 1000;

    // Record metrics
    if (metricsExporter?.recordOwnerAIRouteLatency) {
      metricsExporter.recordOwnerAIRouteLatency('/security/findings', duration);
    }

    res.json({
      success: true,
      count: findings.length,
      findings,
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to get security findings', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve security findings' });
  }
});

// ========== ENDPOINT 6: GET /api/owner/ai/governance/report/latest ==========
/**
 * Get latest governance report
 */
router.get('/governance/report/latest', async (req, res) => {
  const startTime = Date.now();

  try {
    const db = req.app.locals.db;
    const metricsExporter = req.app.locals.metricsExporter;

    const governanceService = new GovernanceReportService(db, metricsExporter);
    const report = await governanceService.getLatestReport();

    if (!report) {
      return res.status(404).json({ error: 'No governance reports found' });
    }

    const duration = (Date.now() - startTime) / 1000;

    // Record metrics
    if (metricsExporter?.recordOwnerAIRouteLatency) {
      metricsExporter.recordOwnerAIRouteLatency('/governance/report/latest', duration);
    }

    res.json({
      success: true,
      report: {
        id: report.id,
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        path: report.path,
        kpis: report.kpis,
        content: report.content
      },
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to get governance report', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve governance report' });
  }
});

// ========== ENDPOINT 7: POST /api/owner/ai/governance/report/generate ==========
/**
 * Manually trigger governance report generation
 * Body: { weekStart (optional), weekEnd (optional) }
 */
router.post('/governance/report/generate', async (req, res) => {
  const startTime = Date.now();

  try {
    const db = req.app.locals.db;
    const metricsExporter = req.app.locals.metricsExporter;

    // Default to current week
    const weekEnd = req.body.weekEnd ? new Date(req.body.weekEnd) : new Date();
    const weekStart = req.body.weekStart ? new Date(req.body.weekStart) : new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const governanceService = new GovernanceReportService(db, metricsExporter);
    const report = await governanceService.generateWeeklyReport(weekStart, weekEnd);

    // Audit log
    await auditLog(db, req, 'GENERATE_GOVERNANCE_REPORT', {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString()
    });

    // Record metrics
    if (metricsExporter?.recordPhase3GovernanceReport) {
      metricsExporter.recordPhase3GovernanceReport();
    }

    const duration = (Date.now() - startTime) / 1000;

    res.json({
      success: true,
      report: {
        reportId: report.reportId,
        filename: report.filename,
        path: report.filePath,
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        kpis: report.kpis
      },
      message: 'Governance report generated successfully',
      latency: Math.round(duration * 1000)
    });

  } catch (error) {
    logger.error('Failed to generate governance report', { error: error.message });
    res.status(500).json({ error: 'Failed to generate governance report' });
  }
});

module.exports = router;
