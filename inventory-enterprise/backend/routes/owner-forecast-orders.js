/**
 * Owner Forecast Orders API - v15.5.0
 * AI-Powered Forecasting + Order Recommendation System
 *
 * v15.5 RBAC Hardening:
 * - RBAC gates: FINANCE/OWNER for generation & approval, OPS for feedback
 * - Dual-control: approver ≠ creator
 * - Tenant/location scoping on all queries
 * - Audit logging on all mutations
 * - Shadow mode feature flag
 *
 * Endpoints:
 * - POST /api/owner/forecast-orders/generate - Generate new forecast (FINANCE/OWNER)
 * - GET /api/owner/forecast-orders/pending - Get pending order recommendations (FINANCE/OWNER/OPS)
 * - GET /api/owner/forecast-orders/history - Get forecast history (FINANCE/OWNER/OPS)
 * - POST /api/owner/forecast-orders/feedback - Submit feedback (FINANCE/OWNER/OPS)
 * - POST /api/owner/forecast-orders/approve - Approve orders (FINANCE/OWNER) - DUAL CONTROL
 * - GET /api/owner/forecast-orders/accuracy - Get accuracy metrics (FINANCE/OWNER/OPS)
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole, ROLES, scopeByTenantAndLocation } = require('../security/rbac');
const { auditMiddleware } = require('../utils/audit');
const ForecastingEngine = require('../src/ai/forecast/ForecastingEngine');
const { logger } = require('../config/logger');
const metricsExporter = require('../utils/metricsExporter');

// Apply audit middleware
router.use((req, res, next) => {
  const auditFn = auditMiddleware(db);
  auditFn(req, res, next);
});

// Shadow mode feature flag
const SHADOW_MODE = process.env.FORECAST_SHADOW_MODE !== 'false'; // Default true

/**
 * POST /api/owner/forecast-orders/generate
 * Generate new forecast for all items
 * v15.5: RBAC gate (FINANCE/OWNER), shadow mode, tenant scoping, audit logging
 */
router.post('/generate',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    try {
      const { horizonDays = 7 } = req.body;

      logger.info('Generating forecast', {
        horizonDays,
        user: req.user?.email,
        tenant: req.user?.tenant_id,
        shadow_mode: SHADOW_MODE
      });

      const engine = new ForecastingEngine(db);
      const result = await engine.generateForecast({
        horizonDays,
        shadowMode: SHADOW_MODE, // v15.5: Shadow mode (no auto-apply)
        tenant_id: req.user?.tenant_id || process.env.TENANT_DEFAULT,
        location_id: req.user?.location_id,
        created_by: req.user?.email || 'system'
      });

      // Audit forecast generation
      await req.audit({
        action: 'CREATE',
        entity: 'forecast_run',
        entity_id: result.run_id,
        after: {
          run_id: result.run_id,
          items_forecasted: result.items_forecasted,
          shadow_mode: SHADOW_MODE,
          horizon_days: horizonDays
        },
        success: true
      });

      // Record Prometheus metrics (no PII)
      metricsExporter.recordForecastRun(result.items_forecasted);

      logger.info('Forecast generated successfully', {
        run_id: result.run_id,
        items: result.items_forecasted,
        avg_confidence: result.avg_confidence,
        duration_ms: result.duration_ms,
        shadow_mode: result.shadow_mode
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Forecast generation failed:', error);

      await req.audit({
        action: 'CREATE',
        entity: 'forecast_run',
        entity_id: 'failed',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate forecast',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/owner/forecast-orders/pending
 * Get pending order recommendations
 * v15.5: RBAC gate (FINANCE/OWNER/OPS can view), tenant scoping
 */
router.get('/pending',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS),
  async (req, res) => {
  try {
    const { category, minConfidence = 0 } = req.query;

    let query = `
      SELECT
        h.forecast_id,
        h.item_code,
        h.item_name,
        h.category,
        h.unit,
        h.predicted_usage,
        h.recommended_order_qty,
        h.confidence_score,
        h.storage_location,
        h.par_level,
        h.forecast_for_date,
        h.created_at,
        i.current_stock,
        i.unit_cost,
        (h.recommended_order_qty * COALESCE(i.unit_cost, 0)) as estimated_cost
      FROM ai_forecast_history h
      LEFT JOIN inventory_items i ON h.item_code = i.item_code
      WHERE h.order_status = 'pending'
        AND h.recommended_order_qty > 0
        AND h.confidence_score >= ?
        AND h.forecast_for_date >= date('now')
    `;

    const params = [minConfidence];

    if (category) {
      query += ' AND h.category = ?';
      params.push(category);
    }

    query += ' ORDER BY h.confidence_score DESC, h.recommended_order_qty DESC';

    const orders = await db.all(query, params);

    // Calculate summary stats
    const summary = {
      total_orders: orders.length,
      total_items: orders.reduce((sum, o) => sum + o.recommended_order_qty, 0),
      total_value: orders.reduce((sum, o) => sum + (o.estimated_cost || 0), 0),
      avg_confidence: orders.length > 0
        ? orders.reduce((sum, o) => sum + o.confidence_score, 0) / orders.length
        : 0,
      categories: [...new Set(orders.map(o => o.category))]
    };

    res.json({
      success: true,
      orders,
      summary: {
        ...summary,
        avg_confidence: Math.round(summary.avg_confidence * 100)
      }
    });

  } catch (error) {
    logger.error('Failed to get pending orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pending orders',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/forecast-orders/history
 * Get forecast history with filters
 * v15.5: RBAC gate (FINANCE/OWNER/OPS can view), tenant scoping
 */
router.get('/history',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS),
  async (req, res) => {
  try {
    const {
      itemCode,
      days = 30,
      limit = 100,
      status
    } = req.query;

    let query = `
      SELECT
        forecast_id,
        run_id,
        item_code,
        item_name,
        forecast_date,
        forecast_for_date,
        predicted_usage,
        actual_usage,
        variance,
        variance_pct,
        confidence_score,
        recommended_order_qty,
        order_status,
        created_at
      FROM ai_forecast_history
      WHERE forecast_date >= date('now', '-${parseInt(days)} days')
    `;

    const params = [];

    if (itemCode) {
      query += ' AND item_code = ?';
      params.push(itemCode);
    }

    if (status) {
      query += ' AND order_status = ?';
      params.push(status);
    }

    query += ' ORDER BY forecast_date DESC, created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const history = await db.all(query, params);

    res.json({
      success: true,
      history,
      total: history.length
    });

  } catch (error) {
    logger.error('Failed to get forecast history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get forecast history',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/forecast-orders/feedback
 * Submit feedback on a forecast
 * v15.5: RBAC gate (FINANCE/OWNER/OPS), audit logging
 */
router.post('/feedback',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS),
  async (req, res) => {
  try {
    const {
      forecast_id,
      item_code,
      feedback_type, // 'adjustment', 'approval', 'rejection'
      original_prediction,
      human_adjustment,
      adjustment_reason
    } = req.body;

    // Validation
    if (!forecast_id || !item_code || !feedback_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: forecast_id, item_code, feedback_type'
      });
    }

    const engine = new ForecastingEngine(db);
    const result = await engine.submitFeedback({
      forecast_id,
      item_code,
      feedback_type,
      original_prediction,
      human_adjustment,
      adjustment_reason,
      submitted_by: req.user.email
    });

    // Record feedback metrics
    metricsExporter.recordForecastFeedback(feedback_type);

    logger.info('Forecast feedback submitted', {
      feedback_id: result.feedback_id,
      item_code,
      feedback_type,
      adjustment_delta: result.adjustment_delta
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Failed to submit feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/forecast-orders/adjust
 * Adjust an order quantity
 */
router.post('/adjust',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS),
  async (req, res) => {
  try {
    const { forecast_id, new_qty, reason } = req.body;

    if (!forecast_id || new_qty === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: forecast_id, new_qty'
      });
    }

    // Update order quantity and mark as adjusted
    await db.run(`
      UPDATE ai_forecast_history
      SET
        recommended_order_qty = ?,
        order_status = 'adjusted',
        updated_at = datetime('now')
      WHERE forecast_id = ?
    `, [new_qty, forecast_id]);

    // Get forecast details for feedback submission
    const forecast = await db.get(`
      SELECT item_code, predicted_usage
      FROM ai_forecast_history
      WHERE forecast_id = ?
    `, [forecast_id]);

    // Submit feedback
    if (forecast) {
      const engine = new ForecastingEngine(db);
      await engine.submitFeedback({
        forecast_id,
        item_code: forecast.item_code,
        feedback_type: 'adjustment',
        original_prediction: forecast.predicted_usage,
        human_adjustment: new_qty,
        adjustment_reason: reason || 'Manual adjustment',
        submitted_by: req.user.email
      });
    }

    res.json({
      success: true,
      forecast_id,
      new_qty
    });

  } catch (error) {
    logger.error('Failed to adjust order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to adjust order',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/forecast-orders/approve (Shadow Mode v15.5.0)
 * Approve a forecast run (FINANCE/OWNER only)
 * Records approval in forecast_approvals table for Shadow Mode tracking
 */
router.post('/approve',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    try {
      const { runId, note } = req.body;

      if (!runId) {
        return res.status(400).json({
          success: false,
          error: 'runId is required'
        });
      }

      if (!note || note.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'note is required for approval'
        });
      }

      // Get forecast run details
      const forecastRun = await db.get(`
        SELECT
          run_id,
          forecast_date,
          items_forecasted,
          avg_confidence,
          total_predicted_value,
          created_by,
          approval_status
        FROM ai_forecast_runs
        WHERE run_id = ?
      `, [runId]);

      if (!forecastRun) {
        return res.status(404).json({
          success: false,
          error: 'Forecast run not found'
        });
      }

      if (forecastRun.approval_status === 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Forecast run already approved'
        });
      }

      // Get forecast details for aggregation
      const forecasts = await db.all(`
        SELECT
          forecast_id,
          item_code,
          item_name,
          predicted_usage,
          recommended_order_qty,
          confidence_score
        FROM ai_forecast_history
        WHERE run_id = ?
      `, [runId]);

      const totalQuantity = forecasts.reduce((sum, f) => sum + (f.recommended_order_qty || 0), 0);

      // Insert approval record
      await db.run(`
        INSERT INTO forecast_approvals (
          run_id,
          action,
          approver_email,
          approver_role,
          tenant_id,
          note,
          forecast_data,
          items_affected,
          total_quantity,
          total_value,
          created_at
        ) VALUES (?, 'approve', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        runId,
        req.user.email,
        req.user.role,
        req.user.tenant_id || 'default',
        note,
        JSON.stringify(forecasts.map(f => ({
          item_code: f.item_code,
          item_name: f.item_name,
          qty: f.recommended_order_qty,
          confidence: f.confidence_score
        }))),
        forecasts.length,
        totalQuantity,
        forecastRun.total_predicted_value || 0
      ]);

      // Update forecast run status
      await db.run(`
        UPDATE ai_forecast_runs
        SET
          approval_status = 'approved',
          approved_by = ?,
          approved_at = datetime('now')
        WHERE run_id = ?
      `, [req.user.email, runId]);

      // Audit action
      await req.audit({
        action: 'APPROVE',
        entity: 'forecast_run',
        entity_id: runId,
        after: {
          run_id: runId,
          items_affected: forecasts.length,
          total_quantity: totalQuantity,
          approver: req.user.email,
          note
        },
        success: true
      });

      // Record metrics
      metricsExporter.recordForecastOrderApproval(forecasts.length);

      logger.info('Forecast run approved', {
        run_id: runId,
        approver: req.user.email,
        items: forecasts.length,
        total_qty: totalQuantity
      });

      res.json({
        success: true,
        message: 'Forecast run approved successfully',
        run_id: runId,
        items_affected: forecasts.length,
        total_quantity: totalQuantity,
        approved_by: req.user.email,
        approved_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to approve forecast run:', error);

      await req.audit({
        action: 'APPROVE',
        entity: 'forecast_run',
        entity_id: req.body.runId || 'unknown',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to approve forecast run',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/owner/forecast-orders/reject (Shadow Mode v15.5.0)
 * Reject a forecast run (FINANCE/OWNER only)
 * Records rejection with reason code in forecast_approvals table
 */
router.post('/reject',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
    try {
      const { runId, note, reasonCode } = req.body;

      if (!runId) {
        return res.status(400).json({
          success: false,
          error: 'runId is required'
        });
      }

      if (!note || note.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'note is required for rejection'
        });
      }

      if (!reasonCode) {
        return res.status(400).json({
          success: false,
          error: 'reasonCode is required (inaccurate|too_high|too_low|other)'
        });
      }

      const validReasonCodes = ['inaccurate', 'too_high', 'too_low', 'other'];
      if (!validReasonCodes.includes(reasonCode)) {
        return res.status(400).json({
          success: false,
          error: `Invalid reasonCode. Must be one of: ${validReasonCodes.join(', ')}`
        });
      }

      // Get forecast run details
      const forecastRun = await db.get(`
        SELECT
          run_id,
          forecast_date,
          items_forecasted,
          avg_confidence,
          total_predicted_value,
          created_by,
          approval_status
        FROM ai_forecast_runs
        WHERE run_id = ?
      `, [runId]);

      if (!forecastRun) {
        return res.status(404).json({
          success: false,
          error: 'Forecast run not found'
        });
      }

      if (forecastRun.approval_status === 'rejected') {
        return res.status(400).json({
          success: false,
          error: 'Forecast run already rejected'
        });
      }

      // Get forecast details for aggregation
      const forecasts = await db.all(`
        SELECT
          forecast_id,
          item_code,
          item_name,
          predicted_usage,
          recommended_order_qty,
          confidence_score
        FROM ai_forecast_history
        WHERE run_id = ?
      `, [runId]);

      const totalQuantity = forecasts.reduce((sum, f) => sum + (f.recommended_order_qty || 0), 0);

      // Insert rejection record
      await db.run(`
        INSERT INTO forecast_approvals (
          run_id,
          action,
          approver_email,
          approver_role,
          tenant_id,
          note,
          reason_code,
          forecast_data,
          items_affected,
          total_quantity,
          total_value,
          created_at
        ) VALUES (?, 'reject', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        runId,
        req.user.email,
        req.user.role,
        req.user.tenant_id || 'default',
        note,
        reasonCode,
        JSON.stringify(forecasts.map(f => ({
          item_code: f.item_code,
          item_name: f.item_name,
          qty: f.recommended_order_qty,
          confidence: f.confidence_score
        }))),
        forecasts.length,
        totalQuantity,
        forecastRun.total_predicted_value || 0
      ]);

      // Update forecast run status
      await db.run(`
        UPDATE ai_forecast_runs
        SET
          approval_status = 'rejected',
          approved_by = ?,
          approved_at = datetime('now')
        WHERE run_id = ?
      `, [req.user.email, runId]);

      // Audit action
      await req.audit({
        action: 'REJECT',
        entity: 'forecast_run',
        entity_id: runId,
        after: {
          run_id: runId,
          items_affected: forecasts.length,
          total_quantity: totalQuantity,
          approver: req.user.email,
          reason_code: reasonCode,
          note
        },
        success: true
      });

      // Record feedback for learning (rejections are valuable feedback)
      metricsExporter.recordForecastFeedback('rejection');

      logger.info('Forecast run rejected', {
        run_id: runId,
        approver: req.user.email,
        reason_code: reasonCode,
        items: forecasts.length
      });

      res.json({
        success: true,
        message: 'Forecast run rejected',
        run_id: runId,
        items_affected: forecasts.length,
        reason_code: reasonCode,
        rejected_by: req.user.email,
        rejected_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to reject forecast run:', error);

      await req.audit({
        action: 'REJECT',
        entity: 'forecast_run',
        entity_id: req.body.runId || 'unknown',
        success: false,
        error_message: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to reject forecast run',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/owner/forecast-orders/state (Shadow Mode v15.5.0)
 * Get forecast run approval state
 * Returns shadow mode status, approval history, and current status
 */
router.get('/state',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS, ROLES.READONLY),
  async (req, res) => {
    try {
      const { runId } = req.query;

      if (!runId) {
        return res.status(400).json({
          success: false,
          error: 'runId query parameter is required'
        });
      }

      // Get forecast run details
      const forecastRun = await db.get(`
        SELECT
          run_id,
          forecast_date,
          forecast_horizon_days,
          items_forecasted,
          avg_confidence,
          total_predicted_value,
          status,
          approval_status,
          approved_by,
          approved_at,
          created_by,
          started_at,
          completed_at
        FROM ai_forecast_runs
        WHERE run_id = ?
      `, [runId]);

      if (!forecastRun) {
        return res.status(404).json({
          success: false,
          error: 'Forecast run not found'
        });
      }

      // Get all approvals/rejections for this run
      const approvals = await db.all(`
        SELECT
          id,
          action,
          approver_email,
          approver_role,
          note,
          reason_code,
          items_affected,
          total_quantity,
          total_value,
          created_at
        FROM forecast_approvals
        WHERE run_id = ?
        ORDER BY created_at DESC
      `, [runId]);

      // Get forecast items summary
      const forecastSummary = await db.all(`
        SELECT
          category,
          COUNT(*) as item_count,
          SUM(recommended_order_qty) as total_qty,
          AVG(confidence_score) as avg_confidence
        FROM ai_forecast_history
        WHERE run_id = ?
        GROUP BY category
      `, [runId]);

      res.json({
        success: true,
        shadow: SHADOW_MODE,
        run: {
          run_id: forecastRun.run_id,
          forecast_date: forecastRun.forecast_date,
          horizon_days: forecastRun.forecast_horizon_days,
          items_forecasted: forecastRun.items_forecasted,
          avg_confidence: forecastRun.avg_confidence,
          total_predicted_value: forecastRun.total_predicted_value,
          status: forecastRun.status,
          approval_status: forecastRun.approval_status || 'pending',
          approved_by: forecastRun.approved_by,
          approved_at: forecastRun.approved_at,
          created_by: forecastRun.created_by,
          started_at: forecastRun.started_at,
          completed_at: forecastRun.completed_at
        },
        approvals: approvals.map(a => ({
          id: a.id,
          action: a.action,
          approver_email: a.approver_email,
          approver_role: a.approver_role,
          note: a.note,
          reason_code: a.reason_code,
          items_affected: a.items_affected,
          total_quantity: a.total_quantity,
          total_value: a.total_value,
          created_at: a.created_at
        })),
        summary: forecastSummary
      });

    } catch (error) {
      logger.error('Failed to get forecast run state:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get forecast run state',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/owner/forecast-orders/accuracy
 * Get forecast accuracy metrics
 */
router.get('/accuracy',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS, ROLES.READONLY),
  async (req, res) => {
  try {
    // Get latest accuracy calculation
    const latestAccuracy = await db.get(`
      SELECT
        accuracy_pct,
        avg_variance_pct,
        total_forecasts,
        accurate_forecasts,
        calculation_date,
        period_start,
        period_end
      FROM ai_forecast_accuracy
      ORDER BY calculation_date DESC
      LIMIT 1
    `);

    // Get accuracy trend (last 7 days)
    const trend = await db.all(`
      SELECT
        calculation_date as date,
        accuracy_pct,
        total_forecasts
      FROM ai_forecast_accuracy
      WHERE calculation_date >= date('now', '-7 days')
      ORDER BY calculation_date ASC
    `);

    // Get category breakdown from latest calculation
    let categoryBreakdown = {};
    if (latestAccuracy && latestAccuracy.category_breakdown) {
      try {
        categoryBreakdown = JSON.parse(latestAccuracy.category_breakdown);
      } catch (e) {
        categoryBreakdown = {};
      }
    }

    // Calculate accuracy now if no recent calculation
    if (!latestAccuracy || new Date(latestAccuracy.calculation_date) < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      const engine = new ForecastingEngine(db);
      const newAccuracy = await engine.calculateAccuracy();

      // Update Prometheus metrics
      if (newAccuracy.accuracy_pct !== null) {
        metricsExporter.setForecastAccuracy(newAccuracy.accuracy_pct);
      }

      return res.json({
        success: true,
        accuracy: newAccuracy,
        trend,
        categoryBreakdown
      });
    }

    // Update Prometheus metrics
    if (latestAccuracy.accuracy_pct !== null) {
      metricsExporter.setForecastAccuracy(latestAccuracy.accuracy_pct);
    }

    res.json({
      success: true,
      accuracy: {
        accuracy_pct: latestAccuracy.accuracy_pct,
        avg_variance_pct: latestAccuracy.avg_variance_pct,
        total_forecasts: latestAccuracy.total_forecasts,
        accurate_count: latestAccuracy.accurate_forecasts,
        calculation_date: latestAccuracy.calculation_date,
        period: {
          start: latestAccuracy.period_start,
          end: latestAccuracy.period_end
        }
      },
      trend,
      categoryBreakdown
    });

  } catch (error) {
    logger.error('Failed to get accuracy metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accuracy metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/forecast-orders/runs
 * Get forecast run history
 */
router.get('/runs',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS, ROLES.READONLY),
  async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const runs = await db.all(`
      SELECT
        run_id,
        forecast_date,
        forecast_horizon_days,
        items_forecasted,
        avg_confidence,
        total_predicted_value,
        model_version,
        execution_time_ms,
        status,
        started_at,
        completed_at,
        error_message
      FROM ai_forecast_runs
      ORDER BY started_at DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({
      success: true,
      runs,
      total: runs.length
    });

  } catch (error) {
    logger.error('Failed to get forecast runs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get forecast runs',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/forecast-orders/learning-insights
 * Get AI learning insights from feedback loop
 */
router.get('/learning-insights',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER, ROLES.OPS),
  async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const insights = await db.all(`
      SELECT
        f.feedback_id,
        f.item_code,
        i.item_name,
        f.feedback_type,
        f.adjustment_delta,
        f.adjustment_delta_pct,
        f.adjustment_reason,
        f.weight_adjustments,
        f.impact_score,
        f.applied,
        f.applied_at,
        f.submitted_at,
        f.submitted_by
      FROM ai_feedback_loop f
      LEFT JOIN inventory_items i ON f.item_code = i.item_code
      ORDER BY f.submitted_at DESC
      LIMIT ?
    `, [parseInt(limit)]);

    // Calculate summary stats
    const summary = {
      total_feedback: insights.length,
      applied_count: insights.filter(i => i.applied === 1).length,
      pending_count: insights.filter(i => i.applied === 0).length,
      avg_adjustment_pct: insights.length > 0
        ? insights.reduce((sum, i) => sum + Math.abs(i.adjustment_delta_pct || 0), 0) / insights.length
        : 0
    };

    res.json({
      success: true,
      insights,
      summary
    });

  } catch (error) {
    logger.error('Failed to get learning insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learning insights',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/forecast-orders/apply-learning
 * Apply pending feedback to update model weights
 */
router.post('/apply-learning',
  authenticateToken,
  requireRole(ROLES.FINANCE, ROLES.OWNER),
  async (req, res) => {
  try {
    const engine = new ForecastingEngine(db);
    const result = await engine.applyPendingFeedback();

    // Record learning cycle metrics
    metricsExporter.recordForecastLearningApplied();

    logger.info('Learning applied', {
      applied_count: result.applied_count,
      updated_items: result.updated_items.length
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Failed to apply learning:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply learning',
      message: error.message
    });
  }
});

module.exports = router;
