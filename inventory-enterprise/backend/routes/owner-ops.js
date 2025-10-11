/**
 * Owner AI Ops Monitoring API (NeuroPilot v13.0.1)
 * The Living Inventory Intelligence Console
 * Real-time system health, cognitive analytics, and autonomous operations
 *
 * @version 13.0.1
 * @author NeuroInnovate AI Team
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const realtimeBus = require('../utils/realtimeBus');
const { logger } = require('../config/logger');

/**
 * GET /api/owner/ops/status
 * Get comprehensive AI Ops system health status
 */
router.get('/status', authenticateToken, requireOwner, async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check forecast status (should run at 06:00 daily)
    let forecastCheck = null;
    try {
      forecastCheck = await db.get(`
        SELECT
          date,
          created_at,
          COUNT(*) as item_count
        FROM ai_daily_forecast_cache
        WHERE date = ?
        GROUP BY date
        LIMIT 1
      `, [today]);
    } catch (err) {
      // Table doesn't exist yet - treat as no forecast available
      logger.debug('Forecast cache table not available:', err.message);
    }

    // Check learning status (should run at 21:00 daily)
    let learningCheck = null;
    try {
      learningCheck = await db.get(`
        SELECT
          created_at,
          insight_type,
          confidence
        FROM ai_learning_insights
        WHERE source_tag = 'autonomy_2025'
        ORDER BY created_at DESC
        LIMIT 1
      `);
    } catch (err) {
      // Table doesn't exist yet - treat as no learning available
      logger.debug('Learning insights table not available:', err.message);
    }

    // Check pending feedback
    let feedbackCheck = null;
    try {
      feedbackCheck = await db.get(`
        SELECT COUNT(*) as pending_count
        FROM ai_feedback_comments
        WHERE status = 'pending'
      `);
    } catch (err) {
      // Table doesn't exist yet - treat as no pending feedback
      logger.debug('Feedback comments table not available:', err.message);
    }

    // Get real-time bus status
    const realtimeStatus = realtimeBus.getStatus();

    // Calculate health score
    const checks = [];

    // Forecast health
    if (forecastCheck && forecastCheck.item_count > 0) {
      checks.push({ name: 'ai_forecast', status: 'ok', message: `Forecast generated for ${today}` });
    } else {
      checks.push({ name: 'ai_forecast', status: 'warning', message: 'No forecast for today yet' });
    }

    // Learning health
    if (learningCheck) {
      const learningAge = (Date.now() - new Date(learningCheck.created_at).getTime()) / 1000 / 60 / 60; // hours
      if (learningAge < 24) {
        checks.push({ name: 'ai_learning', status: 'ok', message: 'Learning active within 24h' });
      } else {
        checks.push({ name: 'ai_learning', status: 'warning', message: `Last learning ${Math.floor(learningAge)}h ago` });
      }
    } else {
      checks.push({ name: 'ai_learning', status: 'warning', message: 'No learning insights found' });
    }

    // Real-time health
    if (realtimeStatus.healthy) {
      checks.push({ name: 'realtime', status: 'ok', message: `${realtimeStatus.connectedClients} clients connected` });
    } else {
      checks.push({ name: 'realtime', status: 'warning', message: 'No recent real-time activity' });
    }

    // Feedback queue
    const pendingCount = feedbackCheck?.pending_count || 0;
    if (pendingCount > 100) {
      checks.push({ name: 'feedback_queue', status: 'warning', message: `${pendingCount} pending feedbacks` });
    } else {
      checks.push({ name: 'feedback_queue', status: 'ok', message: `${pendingCount} pending feedbacks` });
    }

    // Overall health
    const okCount = checks.filter(c => c.status === 'ok').length;
    const healthPct = Math.round((okCount / checks.length) * 100);
    const healthy = healthPct >= 75;

    // v13.0: Cognitive Intelligence Metrics with Fallback Logic
    // Strategy: Cron in-memory → Breadcrumbs table → Database tables

    // Get last run timestamps from cron scheduler first (v13.0 live data)
    let lastLearningTs = null;
    let lastForecastTs = null;

    if (req.app.locals.phase3Cron) {
      try {
        const cronRuns = await req.app.locals.phase3Cron.getLastRuns();
        lastForecastTs = cronRuns.lastForecastRun;
        lastLearningTs = cronRuns.lastLearningRun;
        logger.debug('Using cron timestamps:', { lastForecastTs, lastLearningTs });
      } catch (err) {
        logger.debug('Cron timestamps not available:', err.message);
      }
    }

    // Fallback to database tables if still null
    if (!lastLearningTs) {
      try {
        const lr = await db.get(`SELECT MAX(applied_at) AS ts FROM ai_learning_insights WHERE applied_at IS NOT NULL`);
        if (lr && lr.ts) {
          lastLearningTs = lr.ts;
        } else {
          // Fallback to feedback comments
          const fb = await db.get(`SELECT MAX(created_at) AS ts FROM ai_feedback_comments`);
          if (fb && fb.ts) lastLearningTs = fb.ts;
        }
      } catch (err) {
        logger.debug('Last learning timestamp not available:', err.message);
      }
    }

    if (!lastForecastTs) {
      try {
        const fr = await db.get(`SELECT MAX(created_at) AS ts FROM ai_daily_forecast_cache`);
        if (fr && fr.ts) lastForecastTs = fr.ts;
      } catch (err) {
        logger.debug('Last forecast timestamp not available:', err.message);
      }
    }

    // 1. AI Confidence Average (7-day rolling, fallback to 30-day)
    let aiConfidenceAvg = null;
    try {
      let confResult = await db.get(`
        SELECT ROUND(AVG(confidence),2) as avg_confidence, COUNT(*) as cnt
        FROM ai_learning_insights
        WHERE created_at >= datetime('now', '-7 days')
          AND confidence IS NOT NULL
      `);
      if (confResult && confResult.cnt > 0 && confResult.avg_confidence !== null) {
        aiConfidenceAvg = Math.round(confResult.avg_confidence * 100);
      } else {
        // Fallback to 30-day
        confResult = await db.get(`
          SELECT ROUND(AVG(confidence),2) as avg_confidence, COUNT(*) as cnt
          FROM ai_learning_insights
          WHERE created_at >= datetime('now', '-30 days')
            AND confidence IS NOT NULL
        `);
        if (confResult && confResult.cnt > 0 && confResult.avg_confidence !== null) {
          aiConfidenceAvg = Math.round(confResult.avg_confidence * 100);
        }
      }
    } catch (err) {
      logger.debug('Confidence avg not available:', err.message);
    }

    // 2. Forecast Accuracy (MAPE % from forecast_results)
    let forecastAccuracy = null;
    try {
      const accResult = await db.get(`
        SELECT
          AVG(accuracy_pct) as avg_accuracy,
          AVG(mape) as avg_mape,
          COUNT(*) as cnt
        FROM forecast_results
        WHERE created_at >= datetime('now', '-7 days')
      `);
      if (accResult && accResult.cnt > 0) {
        // Use accuracy_pct if available, otherwise calculate from MAPE (100 - MAPE)
        if (accResult.avg_accuracy !== null && accResult.avg_accuracy !== undefined) {
          forecastAccuracy = Math.round(accResult.avg_accuracy);
        } else if (accResult.avg_mape !== null && accResult.avg_mape !== undefined) {
          forecastAccuracy = Math.max(0, Math.round(100 - accResult.avg_mape));
        }
      }
    } catch (err) {
      logger.debug('Forecast accuracy not available:', err.message);
    }

    // 3. Financial Anomaly Count
    let financialAnomalyCount = 0;
    try {
      const anomalyResult = await db.get(`
        SELECT COUNT(*) as anomaly_count
        FROM ai_anomaly_log
        WHERE created_at >= datetime('now', '-7 days')
          AND anomaly_type = 'financial_deviation'
          AND resolved_at IS NULL
      `);
      financialAnomalyCount = anomalyResult?.anomaly_count || 0;
    } catch (err) {
      logger.debug('Financial anomaly count not available:', err.message);
    }

    // 4. Active AI Modules Status
    const activeModules = {
      forecast_engine: forecastCheck && forecastCheck.item_count > 0,
      feedback_trainer: learningCheck !== null,
      learning_engine: (learningCheck && (Date.now() - new Date(learningCheck.created_at).getTime()) < 86400000), // < 24h
      ops_agent: realtimeStatus.healthy
    };

    // Count active modules
    const activeModulesCount = Object.values(activeModules).filter(Boolean).length;

    // Get real-time bus health for ai_event channel
    const realtimeHealth = realtimeBus.getHealth();
    const aiEventChannel = realtimeHealth.channels?.ai_ops || realtimeHealth.channels?.ai_event || {};

    // v13.0.1: Get watchdog status from phase3Cron
    let watchdogStatus = null;
    if (req.app.locals.phase3Cron && typeof req.app.locals.phase3Cron.getWatchdogStatus === 'function') {
      try {
        watchdogStatus = req.app.locals.phase3Cron.getWatchdogStatus();
      } catch (err) {
        logger.debug('Watchdog status not available:', err.message);
      }
    }

    res.json({
      success: true,
      healthy,
      healthPct,
      timestamp: now.toISOString(),
      checks,

      // v13.0: Cognitive Intelligence Layer (exact spec format)
      ai_confidence_avg: aiConfidenceAvg,
      forecast_accuracy: forecastAccuracy,
      last_forecast_ts: lastForecastTs,
      last_learning_ts: lastLearningTs,
      active_modules: activeModules,
      pending_feedback_count: pendingCount,
      financial_anomaly_count: financialAnomalyCount,

      // v13.0.1: Self-healing watchdog status
      watchdog_status: watchdogStatus,

      // Real-time status (top-level, spec format)
      realtime: {
        clients: realtimeStatus.connectedClients || 0,
        ai_event: {
          lastEmit: aiEventChannel.lastEmit || null,
          emitCount: aiEventChannel.totalEvents || 0
        }
      },

      // Additional details for backward compatibility
      details: {
        active_modules_count: activeModulesCount,
        forecast: forecastCheck ? {
          date: forecastCheck.date,
          itemCount: forecastCheck.item_count,
          generatedAt: forecastCheck.created_at
        } : null,
        learning: learningCheck ? {
          lastInsight: learningCheck.created_at,
          type: learningCheck.insight_type,
          confidence: learningCheck.confidence
        } : null
      }
    });

  } catch (error) {
    logger.error('AI Ops status check failed:', error);
    res.status(500).json({
      success: false,
      healthy: false,
      error: 'Failed to get AI Ops status',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/ops/metrics
 * Get AI Ops metrics for Prometheus/monitoring
 */
router.get('/metrics', authenticateToken, requireOwner, async (req, res) => {
  try {
    const realtimeStatus = realtimeBus.getStatus();

    // Get forecast metrics
    const forecastMetrics = await db.get(`
      SELECT
        COUNT(*) as total_forecasts,
        MAX(created_at) as last_forecast
      FROM ai_daily_forecast_cache
      WHERE created_at >= datetime('now', '-7 days')
    `);

    // Get learning metrics
    const learningMetrics = await db.get(`
      SELECT
        COUNT(*) as total_insights,
        MAX(created_at) as last_learning
      FROM ai_learning_insights
      WHERE created_at >= datetime('now', '-7 days')
      AND source_tag = 'autonomy_2025'
    `);

    // Build Prometheus-compatible metrics
    const metrics = [];

    // Real-time metrics
    metrics.push(`# HELP ai_ops_realtime_clients Number of connected real-time clients`);
    metrics.push(`# TYPE ai_ops_realtime_clients gauge`);
    metrics.push(`ai_ops_realtime_clients ${realtimeStatus.connectedClients}`);

    metrics.push(`# HELP ai_ops_realtime_events_total Total real-time events emitted`);
    metrics.push(`# TYPE ai_ops_realtime_events_total counter`);
    Object.entries(realtimeStatus.allEventCounts || {}).forEach(([event, count]) => {
      metrics.push(`ai_ops_realtime_events_total{event="${event}"} ${count}`);
    });

    // Forecast metrics
    metrics.push(`# HELP ai_forecast_total Total forecasts generated (7d window)`);
    metrics.push(`# TYPE ai_forecast_total counter`);
    metrics.push(`ai_forecast_total ${forecastMetrics?.total_forecasts || 0}`);

    if (forecastMetrics?.last_forecast) {
      const lastForecastTs = Math.floor(new Date(forecastMetrics.last_forecast).getTime() / 1000);
      metrics.push(`# HELP ai_forecast_last_timestamp_seconds Timestamp of last forecast`);
      metrics.push(`# TYPE ai_forecast_last_timestamp_seconds gauge`);
      metrics.push(`ai_forecast_last_timestamp_seconds ${lastForecastTs}`);
    }

    // Learning metrics
    metrics.push(`# HELP ai_learning_insights_total Total learning insights (7d window)`);
    metrics.push(`# TYPE ai_learning_insights_total counter`);
    metrics.push(`ai_learning_insights_total ${learningMetrics?.total_insights || 0}`);

    if (learningMetrics?.last_learning) {
      const lastLearningTs = Math.floor(new Date(learningMetrics.last_learning).getTime() / 1000);
      metrics.push(`# HELP ai_learning_last_timestamp_seconds Timestamp of last learning`);
      metrics.push(`# TYPE ai_learning_last_timestamp_seconds gauge`);
      metrics.push(`ai_learning_last_timestamp_seconds ${lastLearningTs}`);
    }

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.join('\n') + '\n');

  } catch (error) {
    logger.error('AI Ops metrics failed:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * POST /api/owner/ops/trigger/:job
 * Manually trigger a cron job (for testing/debugging)
 */
router.post('/trigger/:job', authenticateToken, requireOwner, async (req, res) => {
  const { job } = req.params;

  try {
    // Get phase3 cron scheduler from app locals
    if (!req.app.locals.phase3Cron) {
      return res.status(503).json({
        success: false,
        error: 'Cron scheduler not available'
      });
    }

    const result = await req.app.locals.phase3Cron.triggerJob(job);

    res.json({
      success: result.success,
      job,
      duration: result.duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Job trigger failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger job',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/ops/cognitive-intelligence
 * v13.0: Returns AI confidence trends and forecast accuracy (7-day history)
 */
router.get('/cognitive-intelligence', authenticateToken, requireOwner, async (req, res) => {
  try {
    // Get 7-day confidence trend
    let confidenceTrend = [];
    try {
      confidenceTrend = await db.all(`
        SELECT
          DATE(created_at) as date,
          AVG(confidence) as avg_confidence,
          COUNT(*) as insight_count
        FROM ai_learning_insights
        WHERE created_at >= datetime('now', '-7 days')
          AND confidence IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);
    } catch (err) {
      logger.debug('Confidence trend not available:', err.message);
    }

    // Get forecast accuracy trend
    let accuracyTrend = [];
    try {
      accuracyTrend = await db.all(`
        SELECT
          DATE(created_at) as date,
          AVG(accuracy_pct) as avg_accuracy,
          AVG(mape) as avg_mape,
          COUNT(*) as forecast_count
        FROM forecast_results
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);
    } catch (err) {
      logger.debug('Accuracy trend not available:', err.message);
    }

    // Get last 5 applied feedbacks with confidence gain
    let recentFeedbacks = [];
    try {
      recentFeedbacks = await db.all(`
        SELECT
          comment_id,
          comment,
          applied_at,
          confidence_before,
          confidence_after,
          (confidence_after - confidence_before) as confidence_gain
        FROM ai_feedback_comments
        WHERE status = 'applied'
          AND applied_at IS NOT NULL
        ORDER BY applied_at DESC
        LIMIT 5
      `);
    } catch (err) {
      logger.debug('Recent feedbacks not available:', err.message);
    }

    res.json({
      success: true,
      confidenceTrend: confidenceTrend.map(row => ({
        date: row.date,
        avgConfidence: Math.round((row.avg_confidence || 0) * 100),
        insightCount: row.insight_count
      })),
      accuracyTrend: accuracyTrend.map(row => ({
        date: row.date,
        avgAccuracy: row.avg_accuracy ? Math.round(row.avg_accuracy) : (row.avg_mape ? Math.max(0, Math.round(100 - row.avg_mape)) : null),
        forecastCount: row.forecast_count
      })),
      recentFeedbacks: recentFeedbacks.map(fb => ({
        id: fb.comment_id,
        comment: fb.comment,
        appliedAt: fb.applied_at,
        confidenceGain: fb.confidence_gain ? Math.round(fb.confidence_gain * 100) : 0
      }))
    });

  } catch (error) {
    logger.error('Cognitive intelligence fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cognitive intelligence',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/ops/learning-insights
 * v13.0: Returns last 20 learning insights with detailed metadata
 */
router.get('/learning-insights', authenticateToken, requireOwner, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    let insights = [];
    try {
      insights = await db.all(`
        SELECT
          insight_id,
          insight_type,
          title,
          description,
          confidence,
          source_tag,
          detected_at,
          applied_at,
          impact_score
        FROM ai_learning_insights
        ORDER BY detected_at DESC
        LIMIT ?
      `, [limit]);
    } catch (err) {
      logger.debug('Learning insights not available:', err.message);
    }

    res.json({
      success: true,
      insights: insights.map(ins => ({
        id: ins.insight_id,
        type: ins.insight_type,
        title: ins.title,
        description: ins.description,
        confidence: Math.round((ins.confidence || 0) * 100),
        source: ins.source_tag,
        detectedAt: ins.detected_at,
        appliedAt: ins.applied_at,
        impactScore: ins.impact_score,
        status: ins.applied_at ? 'applied' : 'pending'
      })),
      total: insights.length
    });

  } catch (error) {
    logger.error('Learning insights fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch learning insights',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/ops/activity-feed
 * v13.0: Returns real-time AI activity feed (last 50 events)
 */
router.get('/activity-feed', authenticateToken, requireOwner, async (req, res) => {
  try {
    const realtimeHealth = realtimeBus.getHealth();
    const limit = parseInt(req.query.limit) || 50;

    // Combine recent events from different sources
    const activities = [];

    // Add real-time bus events
    Object.entries(realtimeHealth.channels).forEach(([channel, health]) => {
      if (health.active && health.lastEmit) {
        activities.push({
          type: 'realtime_event',
          channel,
          event: health.lastEvent,
          timestamp: health.lastEmit,
          metadata: {
            ageSeconds: health.ageSeconds,
            totalEvents: health.totalEvents
          }
        });
      }
    });

    // Add recent AI learning events
    try {
      const learningEvents = await db.all(`
        SELECT
          'learning' as type,
          insight_type as event,
          detected_at as timestamp,
          title as description,
          confidence
        FROM ai_learning_insights
        WHERE detected_at >= datetime('now', '-24 hours')
        ORDER BY detected_at DESC
        LIMIT 10
      `);
      activities.push(...learningEvents.map(e => ({
        type: 'learning_event',
        event: e.event,
        timestamp: e.timestamp,
        description: e.description,
        metadata: { confidence: Math.round((e.confidence || 0) * 100) }
      })));
    } catch (err) {
      logger.debug('Learning events not available:', err.message);
    }

    // Add recent forecast completions
    try {
      const forecastEvents = await db.all(`
        SELECT
          'forecast' as type,
          'forecast_completed' as event,
          created_at as timestamp,
          date as description
        FROM ai_daily_forecast_cache
        WHERE created_at >= datetime('now', '-24 hours')
        ORDER BY created_at DESC
        LIMIT 10
      `);
      activities.push(...forecastEvents.map(e => ({
        type: 'forecast_event',
        event: e.event,
        timestamp: e.timestamp,
        description: `Forecast for ${e.description}`,
        metadata: {}
      })));
    } catch (err) {
      logger.debug('Forecast events not available:', err.message);
    }

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedActivities = activities.slice(0, limit);

    res.json({
      success: true,
      activities: limitedActivities,
      total: limitedActivities.length,
      realtimeHealth: realtimeHealth.overallHealthy
    });

  } catch (error) {
    logger.error('Activity feed fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity feed',
      message: error.message
    });
  }
});

module.exports = router;
