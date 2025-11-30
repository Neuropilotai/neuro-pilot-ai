/**
 * @deprecated DEPRECATED IN V21.1 - NOT MOUNTED IN PRODUCTION
 *
 * This module uses SQLite (better-sqlite3) which is not available in the
 * Railway PostgreSQL production environment. The Predictive Stability Layer
 * will be re-implemented with PostgreSQL in a future version.
 *
 * Original description:
 * Stability Controller API Routes
 * Provides RBAC-protected endpoints for Predictive Stability Layer
 *
 * Endpoints:
 * - GET    /api/stability/status       - Current policy and metrics
 * - GET    /api/stability/metrics      - Detailed telemetry
 * - GET    /api/stability/recommendations - Pending and historical recommendations
 * - POST   /api/stability/tune         - Run tuning cycle (owner only)
 * - POST   /api/stability/apply/:id    - Apply recommendation (owner only)
 * - PUT    /api/stability/policy       - Update policy (owner only)
 * - GET    /api/stability/health       - Stability health score (governance integration)
 *
 * @version 16.3.0 (DEPRECATED)
 * @author NeuroInnovate AI Team
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../security/rbac');
const { requireOwner } = require('../middleware/requireOwner');
const { logger } = require('../config/logger');

const AdaptiveRetryTuner = require('../src/stability/AdaptiveRetryTuner');
const CronAutoThrottle = require('../src/stability/CronAutoThrottle');

// Initialize services
const tuner = new AdaptiveRetryTuner();
const throttle = new CronAutoThrottle();

/**
 * GET /api/stability/status
 * Get current stability policy and high-level metrics
 * Access: Any authenticated user
 */
router.get('/status', authenticateToken, (req, res) => {
  try {
    const stats = tuner.getStatistics();
    const throttleStats = throttle.getStatistics();

    res.json({
      success: true,
      data: {
        policy: {
          max_retries: stats.policy.max_retries,
          base_delay_ms: stats.policy.base_delay_ms,
          jitter_pct: stats.policy.jitter_pct,
          cron_min_interval_min: stats.policy.cron_min_interval_min,
          enabled: stats.policy.enabled === 1,
          auto_tune_enabled: stats.policy.auto_tune_enabled === 1,
          last_updated: stats.policy.updated_at,
          updated_by: stats.policy.updated_by
        },
        metrics: {
          observation_count: stats.metrics.observation_count || 0,
          success_rate: stats.metrics.success_rate || 0,
          avg_attempts: stats.metrics.avg_attempts || 0,
          lock_rate: stats.metrics.lock_rate || 0,
          avg_duration_ms: stats.metrics.avg_duration_ms || 0
        },
        recommendations: stats.recommendations,
        throttle: {
          current_interval_min: throttleStats.current_interval_min,
          cron_expression: throttleStats.cron_expression,
          should_throttle: throttleStats.status.shouldThrottle,
          throttle_reason: throttleStats.status.reason
        },
        tuner: stats.tuner
      }
    });
  } catch (error) {
    logger.error('Stability API: Error getting status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stability status',
      message: error.message
    });
  }
});

/**
 * GET /api/stability/metrics
 * Get detailed telemetry data
 * Access: Admin or Owner
 */
router.get('/metrics', authenticateToken, requireRole(['admin', 'owner']), (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../database.db'));

    // Get recent observations grouped by service
    const stmt = db.prepare(`
      SELECT
        service,
        operation,
        COUNT(*) as operation_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_ops,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_ops,
        ROUND(AVG(attempts), 2) as avg_attempts,
        ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
        ROUND(AVG(duration_ms), 0) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) as lock_events,
        MIN(ts) as first_seen,
        MAX(ts) as last_seen
      FROM stability_observations
      WHERE ts >= datetime('now', '-7 days')
      GROUP BY service, operation
      ORDER BY operation_count DESC
    `);

    const metrics = stmt.all();
    db.close();

    res.json({
      success: true,
      data: {
        window_days: 7,
        total_services: new Set(metrics.map(m => m.service)).size,
        metrics: metrics
      }
    });
  } catch (error) {
    logger.error('Stability API: Error getting metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stability metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/stability/recommendations
 * Get tuning recommendations (pending and historical)
 * Access: Admin or Owner
 */
router.get('/recommendations', authenticateToken, requireRole(['admin', 'owner']), (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../database.db'));

    const limit = parseInt(req.query.limit) || 20;
    const applied = req.query.applied; // 'true', 'false', or undefined (all)

    let whereClause = '';
    if (applied === 'true') {
      whereClause = 'WHERE applied = 1';
    } else if (applied === 'false') {
      whereClause = 'WHERE applied = 0';
    }

    const stmt = db.prepare(`
      SELECT * FROM stability_recommendations
      ${whereClause}
      ORDER BY ts DESC
      LIMIT ?
    `);

    const recommendations = stmt.all(limit);
    db.close();

    res.json({
      success: true,
      data: {
        total: recommendations.length,
        recommendations: recommendations.map(rec => ({
          id: rec.id,
          timestamp: rec.ts,
          from: {
            max_retries: rec.from_max_retries,
            base_delay_ms: rec.from_base_delay_ms,
            jitter_pct: rec.from_jitter_pct,
            cron_min_interval_min: rec.from_cron_min_interval_min
          },
          to: {
            max_retries: rec.to_max_retries,
            base_delay_ms: rec.to_base_delay_ms,
            jitter_pct: rec.to_jitter_pct,
            cron_min_interval_min: rec.to_cron_min_interval_min
          },
          reason: rec.reason,
          author: rec.author,
          applied: rec.applied === 1,
          applied_at: rec.applied_at,
          applied_by: rec.applied_by,
          telemetry: {
            observation_count: rec.observation_count,
            success_rate: rec.success_rate,
            avg_attempts: rec.avg_attempts,
            p95_duration_ms: rec.p95_duration_ms,
            lock_rate: rec.lock_rate
          }
        }))
      }
    });
  } catch (error) {
    logger.error('Stability API: Error getting recommendations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recommendations',
      message: error.message
    });
  }
});

/**
 * POST /api/stability/tune
 * Run manual tuning cycle
 * Access: Owner only
 */
router.post('/tune', authenticateToken, requireOwner, async (req, res) => {
  try {
    logger.info('Stability API: Manual tuning cycle requested', {
      user: req.user.email
    });

    const recId = await tuner.runTuningCycle();

    if (!recId) {
      return res.json({
        success: true,
        message: 'No tuning changes recommended (system stable)',
        recommendation_id: null
      });
    }

    // Fetch the created recommendation
    const db = new Database(path.join(__dirname, '../database.db'));
    const stmt = db.prepare('SELECT * FROM stability_recommendations WHERE id = ?');
    const rec = stmt.get(recId);
    db.close();

    res.json({
      success: true,
      message: 'Tuning cycle completed',
      recommendation_id: recId,
      recommendation: {
        from: {
          max_retries: rec.from_max_retries,
          base_delay_ms: rec.from_base_delay_ms,
          jitter_pct: rec.from_jitter_pct,
          cron_min_interval_min: rec.from_cron_min_interval_min
        },
        to: {
          max_retries: rec.to_max_retries,
          base_delay_ms: rec.to_base_delay_ms,
          jitter_pct: rec.to_jitter_pct,
          cron_min_interval_min: rec.to_cron_min_interval_min
        },
        reason: rec.reason
      }
    });
  } catch (error) {
    logger.error('Stability API: Error running tuning cycle', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to run tuning cycle',
      message: error.message
    });
  }
});

/**
 * POST /api/stability/apply/:id
 * Apply a tuning recommendation
 * Access: Owner only
 */
router.post('/apply/:id', authenticateToken, requireOwner, (req, res) => {
  try {
    const recId = parseInt(req.params.id);

    if (isNaN(recId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recommendation ID'
      });
    }

    tuner.applyRecommendation(recId, req.user.email);

    logger.info(`Stability API: Applied recommendation ${recId}`, {
      user: req.user.email
    });

    res.json({
      success: true,
      message: `Recommendation ${recId} applied successfully`,
      recommendation_id: recId
    });
  } catch (error) {
    logger.error('Stability API: Error applying recommendation', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to apply recommendation',
      message: error.message
    });
  }
});

/**
 * PUT /api/stability/policy
 * Update stability policy directly
 * Access: Owner only
 */
router.put('/policy', authenticateToken, requireOwner, (req, res) => {
  try {
    const { max_retries, base_delay_ms, jitter_pct, cron_min_interval_min, enabled, auto_tune_enabled } = req.body;

    // Validation
    if (max_retries !== undefined && (max_retries < 1 || max_retries > 10)) {
      return res.status(400).json({
        success: false,
        error: 'max_retries must be between 1 and 10'
      });
    }

    if (base_delay_ms !== undefined && (base_delay_ms < 50 || base_delay_ms > 5000)) {
      return res.status(400).json({
        success: false,
        error: 'base_delay_ms must be between 50 and 5000'
      });
    }

    if (jitter_pct !== undefined && (jitter_pct < 0 || jitter_pct > 100)) {
      return res.status(400).json({
        success: false,
        error: 'jitter_pct must be between 0 and 100'
      });
    }

    if (cron_min_interval_min !== undefined && (cron_min_interval_min < 5 || cron_min_interval_min > 120)) {
      return res.status(400).json({
        success: false,
        error: 'cron_min_interval_min must be between 5 and 120'
      });
    }

    const db = new Database(path.join(__dirname, '../database.db'));

    // Build UPDATE query dynamically
    const updates = [];
    const params = [];

    if (max_retries !== undefined) {
      updates.push('max_retries = ?');
      params.push(max_retries);
    }
    if (base_delay_ms !== undefined) {
      updates.push('base_delay_ms = ?');
      params.push(base_delay_ms);
    }
    if (jitter_pct !== undefined) {
      updates.push('jitter_pct = ?');
      params.push(jitter_pct);
    }
    if (cron_min_interval_min !== undefined) {
      updates.push('cron_min_interval_min = ?');
      params.push(cron_min_interval_min);
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }
    if (auto_tune_enabled !== undefined) {
      updates.push('auto_tune_enabled = ?');
      params.push(auto_tune_enabled ? 1 : 0);
    }

    updates.push('updated_by = ?');
    params.push(req.user.email);

    if (updates.length === 1) { // Only updated_by
      return res.status(400).json({
        success: false,
        error: 'No policy fields to update'
      });
    }

    const sql = `UPDATE stability_policy SET ${updates.join(', ')} WHERE id = 1`;
    const stmt = db.prepare(sql);
    stmt.run(...params);

    // Get updated policy
    const policy = db.prepare('SELECT * FROM stability_policy WHERE id = 1').get();
    db.close();

    // Refresh services
    tuner.refreshPolicy = () => policy;
    throttle.refreshPolicy();

    logger.info('Stability API: Policy updated', {
      user: req.user.email,
      changes: req.body
    });

    res.json({
      success: true,
      message: 'Stability policy updated successfully',
      policy: {
        max_retries: policy.max_retries,
        base_delay_ms: policy.base_delay_ms,
        jitter_pct: policy.jitter_pct,
        cron_min_interval_min: policy.cron_min_interval_min,
        enabled: policy.enabled === 1,
        auto_tune_enabled: policy.auto_tune_enabled === 1,
        updated_at: policy.updated_at,
        updated_by: policy.updated_by
      }
    });
  } catch (error) {
    logger.error('Stability API: Error updating policy', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update policy',
      message: error.message
    });
  }
});

/**
 * GET /api/stability/health
 * Get stability health score for governance integration
 * Access: Any authenticated user
 */
router.get('/health', authenticateToken, (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../database.db'));
    const stmt = db.prepare('SELECT * FROM v_stability_health');
    const health = stmt.get();
    db.close();

    if (!health) {
      return res.json({
        success: true,
        data: {
          score: 0,
          observation_count: 0,
          success_rate: 0,
          avg_attempts: 0,
          lock_rate: 0,
          status: 'No data available'
        }
      });
    }

    res.json({
      success: true,
      data: {
        score: health.stability_score,
        observation_count: health.observation_count,
        success_rate: health.success_rate,
        avg_attempts: health.avg_attempts,
        lock_rate: health.lock_rate,
        computed_at: health.computed_at,
        status: health.stability_score >= 90 ? 'Excellent' :
                health.stability_score >= 80 ? 'Good' :
                health.stability_score >= 70 ? 'Fair' :
                health.stability_score >= 60 ? 'Poor' : 'Critical'
      }
    });
  } catch (error) {
    logger.error('Stability API: Error getting health score', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stability health score',
      message: error.message
    });
  }
});

// ============================================================================
// v16.6 Adaptive Intelligence - Canonical API Aliases
// ============================================================================

/**
 * POST /api/ai/adaptive/retrain
 * Canonical alias for /tune - Run manual tuning cycle
 * Access: Owner only
 */
router.post('/retrain', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { days, force } = req.body;

    // Use observation window from request or default from policy
    const policy = tuner.getCurrentPolicy();
    const windowDays = days || policy.observation_window_days || 7;

    logger.info('Adaptive Intelligence: Manual retrain cycle requested', {
      user: req.user.email,
      windowDays,
      force: force || false
    });

    const recId = await tuner.runTuningCycle();

    if (!recId) {
      return res.json({
        success: true,
        message: 'No tuning changes recommended (system stable)',
        recommendation_id: null,
        window_days: windowDays
      });
    }

    // Fetch the created recommendation
    const db = new Database(path.join(__dirname, '../database.db'));
    const stmt = db.prepare('SELECT * FROM stability_recommendations WHERE id = ?');
    const rec = stmt.get(recId);
    db.close();

    res.json({
      success: true,
      message: 'Retrain cycle completed',
      recommendation_id: recId,
      window_days: windowDays,
      recommendation: {
        from: {
          max_retries: rec.from_max_retries,
          base_delay_ms: rec.from_base_delay_ms,
          jitter_pct: rec.from_jitter_pct,
          cron_min_interval_min: rec.from_cron_min_interval_min
        },
        to: {
          max_retries: rec.to_max_retries,
          base_delay_ms: rec.to_base_delay_ms,
          jitter_pct: rec.to_jitter_pct,
          cron_min_interval_min: rec.to_cron_min_interval_min
        },
        reason: rec.reason
      }
    });
  } catch (error) {
    logger.error('Adaptive Intelligence: Error running retrain cycle', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to run retrain cycle',
      message: error.message
    });
  }
});

/**
 * GET /api/ai/adaptive/history
 * Canonical alias for /recommendations - Get tuning history
 * Access: Admin or Owner
 */
router.get('/history', authenticateToken, requireRole(['admin', 'owner']), (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../database.db'));

    const limit = parseInt(req.query.limit) || 10;
    const applied = req.query.applied; // 'true', 'false', or undefined (all)

    let whereClause = '';
    if (applied === 'true') {
      whereClause = 'WHERE applied = 1';
    } else if (applied === 'false') {
      whereClause = 'WHERE applied = 0';
    }

    const stmt = db.prepare(`
      SELECT * FROM stability_recommendations
      ${whereClause}
      ORDER BY ts DESC
      LIMIT ?
    `);

    const recommendations = stmt.all(limit);
    db.close();

    res.json({
      success: true,
      data: {
        total: recommendations.length,
        limit: limit,
        history: recommendations.map(rec => ({
          id: rec.id,
          timestamp: rec.ts,
          from: {
            max_retries: rec.from_max_retries,
            base_delay_ms: rec.from_base_delay_ms,
            jitter_pct: rec.from_jitter_pct,
            cron_min_interval_min: rec.from_cron_min_interval_min
          },
          to: {
            max_retries: rec.to_max_retries,
            base_delay_ms: rec.to_base_delay_ms,
            jitter_pct: rec.to_jitter_pct,
            cron_min_interval_min: rec.to_cron_min_interval_min
          },
          reason: rec.reason,
          author: rec.author,
          applied: rec.applied === 1,
          applied_at: rec.applied_at,
          applied_by: rec.applied_by,
          telemetry: {
            observation_count: rec.observation_count,
            success_rate: rec.success_rate,
            avg_attempts: rec.avg_attempts,
            p95_duration_ms: rec.p95_duration_ms,
            lock_rate: rec.lock_rate
          }
        }))
      }
    });
  } catch (error) {
    logger.error('Adaptive Intelligence: Error getting history', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tuning history',
      message: error.message
    });
  }
});

module.exports = router;
