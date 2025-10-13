/**
 * Owner AI Ops Monitoring API (NeuroPilot v13.5)
 * Adaptive Inventory Intelligence System
 * Real-time system health, cognitive analytics, self-healing, and continuous learning
 *
 * === v13.5 ENHANCEMENT: DQI + RLHF + PREDICTIVE HEALTH + FISCAL MAP ===
 *
 * @version 13.5.0
 * @author NeuroInnovate AI Team
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const realtimeBus = require('../utils/realtimeBus');
const { logger } = require('../config/logger');

// === v13.5: Composite AI Ops Health Computation ===
/**
 * Compute weighted AI Ops System Health Score (0-100)
 * 6 components with custom weights:
 *  1. Forecast recency (25%)
 *  2. Learning recency (20%)
 *  3. AI Confidence 7d (15%)
 *  4. Forecast Accuracy 7d (15%)
 *  5. Data Pipeline Health (15%)
 *  6. Latency & Realtime (10%)
 *
 * @param {object} database - SQLite database connection
 * @param {object} phase3Cron - Cron scheduler instance
 * @param {object} metrics - Pre-computed metrics (timestamps, confidence, accuracy, latency)
 * @returns {object} { score, weights, components, explanations }
 */
async function computeAIOpsHealth(database, phase3Cron, metrics) {
  const {
    lastForecastTs,
    lastLearningTs,
    aiConfidenceAvg,
    forecastAccuracy,
    forecastLatency,
    learningLatency,
    realtimeStatus
  } = metrics;

  const weights = {
    forecastRecency: 25,
    learningRecency: 20,
    confidence7d: 15,
    accuracy7d: 15,
    pipelineHealth: 15,
    latencyRealtime: 10
  };

  const components = {};
  const explanations = [];
  let totalScore = 0;

  // === 1. Forecast Recency (25%) ===
  let forecastScore = 20;
  let forecastValue = 'Never';
  if (lastForecastTs) {
    const ageMs = Date.now() - new Date(lastForecastTs).getTime();
    const ageHours = ageMs / 1000 / 60 / 60;
    forecastValue = `${ageHours.toFixed(1)}h ago`;
    if (ageHours < 24) {
      forecastScore = 100;
      explanations.push('Forecast ran within 24h (100 pts)');
    } else if (ageHours < 48) {
      forecastScore = 70;
      explanations.push('Forecast ran 24-48h ago (70 pts)');
    } else {
      forecastScore = 20;
      explanations.push(`Forecast stale (${ageHours.toFixed(0)}h old, 20 pts)`);
    }
  } else {
    explanations.push('Forecast never ran (20 pts)');
  }
  components.forecastRecency = { value: forecastValue, score: forecastScore };
  totalScore += (forecastScore * weights.forecastRecency) / 100;

  // === 2. Learning Recency (20%) ===
  let learningScore = 20;
  let learningValue = 'Never';
  if (lastLearningTs) {
    const ageMs = Date.now() - new Date(lastLearningTs).getTime();
    const ageHours = ageMs / 1000 / 60 / 60;
    learningValue = `${ageHours.toFixed(1)}h ago`;
    if (ageHours < 24) {
      learningScore = 100;
      explanations.push('Learning ran within 24h (100 pts)');
    } else if (ageHours < 48) {
      learningScore = 70;
      explanations.push('Learning ran 24-48h ago (70 pts)');
    } else {
      learningScore = 20;
      explanations.push(`Learning stale (${ageHours.toFixed(0)}h old, 20 pts)`);
    }
  } else {
    explanations.push('Learning never ran (20 pts)');
  }
  components.learningRecency = { value: learningValue, score: learningScore };
  totalScore += (learningScore * weights.learningRecency) / 100;

  // === 3. AI Confidence 7d (15%) ===
  let confidenceScore = 20;
  let confidenceValue = null;
  if (aiConfidenceAvg !== null && aiConfidenceAvg !== undefined && aiConfidenceAvg > 0) {
    confidenceValue = aiConfidenceAvg;
    confidenceScore = aiConfidenceAvg;
    explanations.push(`AI Confidence: ${aiConfidenceAvg}%`);
  } else {
    // Check if cache exists but no data
    try {
      const cacheExists = await database.get(`SELECT COUNT(*) as cnt FROM ai_daily_forecast_cache`);
      if (cacheExists && cacheExists.cnt > 0) {
        confidenceScore = 60;
        confidenceValue = 60;
        explanations.push('No confidence data, but cache exists (60 pts)');
      } else {
        confidenceScore = 20;
        explanations.push('No confidence data or cache (20 pts)');
      }
    } catch (err) {
      confidenceScore = 20;
      explanations.push('Confidence data unavailable (20 pts)');
    }
  }
  components.confidence7d = { value: confidenceValue, score: confidenceScore };
  totalScore += (confidenceScore * weights.confidence7d) / 100;

  // === 4. Forecast Accuracy 7d (15%) ===
  let accuracyScore = 20;
  let accuracyValue = null;
  if (forecastAccuracy !== null && forecastAccuracy !== undefined && forecastAccuracy > 0) {
    accuracyValue = forecastAccuracy;
    accuracyScore = Math.min(100, forecastAccuracy);
    explanations.push(`Forecast Accuracy: ${forecastAccuracy}%`);
  } else {
    // Check if forecasts exist but no results
    try {
      const forecastsExist = await database.get(`SELECT COUNT(*) as cnt FROM ai_daily_forecast_cache`);
      if (forecastsExist && forecastsExist.cnt > 0) {
        accuracyScore = 60;
        accuracyValue = 60;
        explanations.push('No accuracy data, but forecasts exist (60 pts)');
      } else {
        accuracyScore = 20;
        explanations.push('No accuracy data or forecasts (20 pts)');
      }
    } catch (err) {
      accuracyScore = 20;
      explanations.push('Accuracy data unavailable (20 pts)');
    }
  }
  components.accuracy7d = { value: accuracyValue, score: accuracyScore };
  totalScore += (accuracyScore * weights.accuracy7d) / 100;

  // === 5. Data Pipeline Health (15%) ===
  let pipelineChecks = 0;
  const pipelineResults = [];

  // Check 1: ai_daily_forecast_cache has rows for today or tomorrow
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const forecastRows = await database.get(`
      SELECT COUNT(*) as cnt FROM ai_daily_forecast_cache
      WHERE date IN (?, ?)
    `, [today, tomorrow]);
    if (forecastRows && forecastRows.cnt > 0) {
      pipelineChecks++;
      pipelineResults.push('Forecast cache current');
    }
  } catch (err) {
    pipelineResults.push('Forecast cache unavailable');
  }

  // Check 2: ai_learning_insights has ≥1 row in last 7 days
  try {
    const learningRows = await database.get(`
      SELECT COUNT(*) as cnt FROM ai_learning_insights
      WHERE created_at >= datetime('now', '-7 days')
    `);
    if (learningRows && learningRows.cnt > 0) {
      pipelineChecks++;
      pipelineResults.push('Learning insights active');
    }
  } catch (err) {
    pipelineResults.push('Learning insights unavailable');
  }

  // Check 3: ai_ops_breadcrumbs has ≥1 row in last 72h
  try {
    const breadcrumbs = await database.get(`
      SELECT COUNT(*) as cnt FROM ai_ops_breadcrumbs
      WHERE created_at >= datetime('now', '-72 hours')
    `);
    if (breadcrumbs && breadcrumbs.cnt > 0) {
      pipelineChecks++;
      pipelineResults.push('Ops breadcrumbs logged');
    }
  } catch (err) {
    pipelineResults.push('Breadcrumbs unavailable');
  }

  // Check 4: PDF index has ≥1 valid dated invoice in last 14d
  try {
    const pdfs = await database.get(`
      SELECT COUNT(*) as cnt FROM documents
      WHERE invoice_date IS NOT NULL
        AND created_at >= datetime('now', '-14 days')
    `);
    if (pdfs && pdfs.cnt > 0) {
      pipelineChecks++;
      pipelineResults.push('Recent invoices indexed');
    }
  } catch (err) {
    pipelineResults.push('Invoice index unavailable');
  }

  let pipelineScore = 30;
  if (pipelineChecks >= 3) {
    pipelineScore = 100;
    explanations.push(`Pipeline health: ${pipelineChecks}/4 checks passed (100 pts)`);
  } else if (pipelineChecks >= 2) {
    pipelineScore = 70;
    explanations.push(`Pipeline health: ${pipelineChecks}/4 checks passed (70 pts)`);
  } else {
    explanations.push(`Pipeline health: ${pipelineChecks}/4 checks passed (30 pts)`);
  }
  components.pipelineHealth = {
    checksPassed: pipelineChecks,
    checks: pipelineResults,
    score: pipelineScore
  };
  totalScore += (pipelineScore * weights.pipelineHealth) / 100;

  // === 6. Latency & Realtime (10%) ===
  let latencyScore = 40;
  let avgLatencyMs = null;
  let recentEmits = 0;

  // Calculate average of forecast and learning latencies
  if (forecastLatency !== null && learningLatency !== null) {
    avgLatencyMs = Math.round((forecastLatency + learningLatency) / 2);
  } else if (forecastLatency !== null) {
    avgLatencyMs = forecastLatency;
  } else if (learningLatency !== null) {
    avgLatencyMs = learningLatency;
  }

  if (avgLatencyMs !== null) {
    const avgLatencySec = avgLatencyMs / 1000;
    if (avgLatencySec < 5) {
      latencyScore = 100;
      explanations.push(`Avg latency ${avgLatencySec.toFixed(1)}s (<5s, 100 pts)`);
    } else if (avgLatencySec < 10) {
      latencyScore = 70;
      explanations.push(`Avg latency ${avgLatencySec.toFixed(1)}s (5-10s, 70 pts)`);
    } else {
      latencyScore = 40;
      explanations.push(`Avg latency ${avgLatencySec.toFixed(1)}s (>10s, 40 pts)`);
    }
  } else {
    explanations.push('No latency data (40 pts default)');
  }

  // Bonus: Recent emit in last 24h (+10 pts)
  try {
    const opsChannel = realtimeBus.getOpsChannelHealth();
    recentEmits = opsChannel.emits24h || 0;
    if (opsChannel.recentEmit) {
      latencyScore = Math.min(100, latencyScore + 10);
      explanations.push(`+10 pts: Recent realtime emit (${recentEmits} in 24h)`);
    }
  } catch (err) {
    logger.debug('Realtime emit check failed:', err.message);
  }

  components.latencyRealtime = {
    avgMs: avgLatencyMs,
    recentEmits,
    score: latencyScore
  };
  totalScore += (latencyScore * weights.latencyRealtime) / 100;

  // Final score (already weighted)
  const finalScore = Math.round(totalScore);

  return {
    score: finalScore,
    weights,
    components,
    explanations
  };
}

// === v13.5: Data Quality Index (DQI) Computation ===
/**
 * Compute Data Quality Index (0-100 score)
 * Analyzes inventory data quality based on:
 * - Missing critical fields (item_code, unit, vendor)
 * - Order vs received variance (>10%)
 * - Duplicate invoice numbers
 *
 * @param {object} database - SQLite database connection
 * @returns {object} { dqi_score, previous_dqi, change_pct, issues }
 */
async function computeDataQualityIndex(database) {
  try {
    let score = 100;
    const issues = [];

    // 1. Missing critical fields in inventory_items (-2 pts each)
    try {
      const missingFields = await database.get(`
        SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN item_code IS NULL OR item_code = '' THEN 1 ELSE 0 END) as missing_code,
          SUM(CASE WHEN unit IS NULL OR unit = '' THEN 1 ELSE 0 END) as missing_unit,
          SUM(CASE WHEN vendor IS NULL OR vendor = '' THEN 1 ELSE 0 END) as missing_vendor
        FROM inventory_items
        WHERE is_active = 1
      `);

      if (missingFields) {
        const penalties = {
          code: (missingFields.missing_code || 0) * 2,
          unit: (missingFields.missing_unit || 0) * 2,
          vendor: (missingFields.missing_vendor || 0) * 2
        };

        score -= Math.min(penalties.code + penalties.unit + penalties.vendor, 30);

        if (missingFields.missing_code > 0) issues.push({ type: 'missing_code', count: missingFields.missing_code, penalty: penalties.code });
        if (missingFields.missing_unit > 0) issues.push({ type: 'missing_unit', count: missingFields.missing_unit, penalty: penalties.unit });
        if (missingFields.missing_vendor > 0) issues.push({ type: 'missing_vendor', count: missingFields.missing_vendor, penalty: penalties.vendor });
      }
    } catch (err) {
      logger.debug('DQI: Missing fields check skipped:', err.message);
    }

    // 2. Order variance >10% in invoice_line_items (-1 pt each, max -20)
    try {
      const variances = await database.get(`
        SELECT COUNT(*) as variance_count
        FROM invoice_line_items
        WHERE ABS((quantity_received - quantity_ordered) / NULLIF(quantity_ordered, 0)) > 0.10
          AND created_at >= datetime('now', '-30 days')
      `);

      if (variances && variances.variance_count > 0) {
        const penalty = Math.min(variances.variance_count, 20);
        score -= penalty;
        issues.push({ type: 'order_variance', count: variances.variance_count, penalty });
      }
    } catch (err) {
      logger.debug('DQI: Variance check skipped:', err.message);
    }

    // 3. Duplicate invoice numbers (-3 pts each, max -30)
    try {
      const duplicates = await database.get(`
        SELECT COUNT(*) - COUNT(DISTINCT invoice_number) as duplicate_count
        FROM invoices
        WHERE invoice_number IS NOT NULL
          AND created_at >= datetime('now', '-90 days')
      `);

      if (duplicates && duplicates.duplicate_count > 0) {
        const penalty = Math.min(duplicates.duplicate_count * 3, 30);
        score -= penalty;
        issues.push({ type: 'duplicate_invoices', count: duplicates.duplicate_count, penalty });
      }
    } catch (err) {
      logger.debug('DQI: Duplicate check skipped:', err.message);
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Get previous DQI from last calculation (stored in realtimeBus or in-memory cache)
    const previousDqi = global.lastDqiScore || null;
    const changePct = previousDqi ? ((score - previousDqi) / previousDqi * 100).toFixed(1) : null;

    // Store current DQI for next comparison
    global.lastDqiScore = score;

    return {
      dqi_score: Math.round(score),
      previous_dqi: previousDqi,
      change_pct: changePct ? parseFloat(changePct) : 0,
      issues: issues,
      color: score >= 90 ? 'green' : score >= 75 ? 'yellow' : 'red'
    };

  } catch (error) {
    logger.error('DQI computation failed:', error);
    return {
      dqi_score: null,
      previous_dqi: null,
      change_pct: 0,
      issues: [],
      color: 'gray',
      error: error.message
    };
  }
}

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

    // v13.x: AI Confidence Average (7-day rolling, fallback to 30-day, then all-time)
    let aiConfidenceAvg = null;
    let confidenceNote = null;
    try {
      // Try 7-day window first
      let confResult = await db.get(`
        SELECT ROUND(AVG(confidence),2) as avg_confidence, COUNT(*) as cnt
        FROM ai_learning_insights
        WHERE created_at >= datetime('now', '-7 days')
          AND confidence IS NOT NULL
          AND confidence > 0
      `);

      if (confResult && confResult.cnt >= 5 && confResult.avg_confidence !== null) {
        aiConfidenceAvg = Math.round(confResult.avg_confidence * 100);
        confidenceNote = '7d_avg';
      } else {
        // Fallback to 30-day if < 5 days of data
        confResult = await db.get(`
          SELECT ROUND(AVG(confidence),2) as avg_confidence, COUNT(*) as cnt
          FROM ai_learning_insights
          WHERE created_at >= datetime('now', '-30 days')
            AND confidence IS NOT NULL
            AND confidence > 0
        `);
        if (confResult && confResult.cnt > 0 && confResult.avg_confidence !== null) {
          aiConfidenceAvg = Math.round(confResult.avg_confidence * 100);
          confidenceNote = '30d_avg';
        } else {
          // Final fallback: all-time average
          confResult = await db.get(`
            SELECT ROUND(AVG(confidence),2) as avg_confidence, COUNT(*) as cnt
            FROM ai_learning_insights
            WHERE confidence IS NOT NULL
              AND confidence > 0
          `);
          if (confResult && confResult.cnt > 0 && confResult.avg_confidence !== null) {
            aiConfidenceAvg = Math.round(confResult.avg_confidence * 100);
            confidenceNote = 'alltime_avg';
          } else {
            confidenceNote = 'insufficient_data';
          }
        }
      }
    } catch (err) {
      logger.debug('Confidence avg not available:', err.message);
      confidenceNote = 'table_missing';
    }

    // v13.x: Forecast Accuracy (MAPE % from forecast_results with fallbacks)
    let forecastAccuracy = null;
    let accuracyNote = null;
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
          accuracyNote = '7d_accuracy';
        } else if (accResult.avg_mape !== null && accResult.avg_mape !== undefined) {
          forecastAccuracy = Math.max(0, Math.round(100 - accResult.avg_mape));
          accuracyNote = '7d_mape_derived';
        }
      } else {
        // Fallback to 30-day window
        const fallbackResult = await db.get(`
          SELECT
            AVG(accuracy_pct) as avg_accuracy,
            AVG(mape) as avg_mape,
            COUNT(*) as cnt
          FROM forecast_results
          WHERE created_at >= datetime('now', '-30 days')
        `);

        if (fallbackResult && fallbackResult.cnt > 0) {
          if (fallbackResult.avg_accuracy !== null) {
            forecastAccuracy = Math.round(fallbackResult.avg_accuracy);
            accuracyNote = '30d_accuracy';
          } else if (fallbackResult.avg_mape !== null) {
            forecastAccuracy = Math.max(0, Math.round(100 - fallbackResult.avg_mape));
            accuracyNote = '30d_mape_derived';
          }
        } else {
          accuracyNote = 'insufficient_data';
        }
      }
    } catch (err) {
      logger.debug('Forecast accuracy not available:', err.message);
      accuracyNote = 'table_missing';
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

    // === v13.5: Data Quality Index ===
    const dqiResult = await computeDataQualityIndex(db);

    // === v13.5: Predictive Health & Anomaly Diagnostics ===
    let predictiveHealth = {
      forecast_latency_avg: null,
      learning_latency_avg: null,
      forecast_divergence: null
    };

    try {
      // v13.x: Track forecast latency (avg ms over last 10 runs)
      // Query breadcrumbs with proper column names (action, duration_ms, created_at)
      const forecastLatency = await db.get(`
        SELECT AVG(duration_ms) as avg_latency, COUNT(*) as run_count
        FROM ai_ops_breadcrumbs
        WHERE action = 'forecast_completed'
          AND created_at IS NOT NULL
          AND created_at >= datetime('now', '-7 days')
      `);
      predictiveHealth.forecast_latency_avg = (forecastLatency?.avg_latency && forecastLatency.run_count > 0)
        ? Math.round(forecastLatency.avg_latency)
        : null;

      // Track learning latency
      const learningLatency = await db.get(`
        SELECT AVG(duration_ms) as avg_latency, COUNT(*) as run_count
        FROM ai_ops_breadcrumbs
        WHERE action = 'learning_completed'
          AND created_at IS NOT NULL
          AND created_at >= datetime('now', '-7 days')
      `);
      predictiveHealth.learning_latency_avg = (learningLatency?.avg_latency && learningLatency.run_count > 0)
        ? Math.round(learningLatency.avg_latency)
        : null;

      // Track forecast divergence (Δ MAPE 7-day vs prev 7-day)
      const mapeCurrent = await db.get(`
        SELECT AVG(mape) as avg_mape
        FROM forecast_results
        WHERE created_at >= datetime('now', '-7 days')
      `);

      const mapePrevious = await db.get(`
        SELECT AVG(mape) as avg_mape
        FROM forecast_results
        WHERE created_at >= datetime('now', '-14 days')
          AND created_at < datetime('now', '-7 days')
      `);

      if (mapeCurrent?.avg_mape != null && mapePrevious?.avg_mape != null) {
        predictiveHealth.forecast_divergence = parseFloat(
          ((mapeCurrent.avg_mape - mapePrevious.avg_mape) / mapePrevious.avg_mape * 100).toFixed(2)
        );

        // Auto-emit health warning if divergence > 5%
        if (Math.abs(predictiveHealth.forecast_divergence) > 5) {
          realtimeBus.emit('ai_health_warning', {
            type: 'forecast_divergence',
            value: predictiveHealth.forecast_divergence,
            threshold: 5,
            message: `Forecast MAPE diverged by ${predictiveHealth.forecast_divergence.toFixed(1)}%`
          });
        }
      }
    } catch (err) {
      logger.debug('Predictive health metrics not available:', err.message);
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

      // === v13.5: Data Quality Index ===
      dqi_score: dqiResult.dqi_score,
      dqi_change_pct: dqiResult.change_pct,
      dqi_color: dqiResult.color,
      dqi_issues: dqiResult.issues,

      // === v13.5: Predictive Health Metrics ===
      forecast_latency_avg: predictiveHealth.forecast_latency_avg,
      learning_latency_avg: predictiveHealth.learning_latency_avg,
      forecast_divergence: predictiveHealth.forecast_divergence,

      // === v13.5: Composite AI Ops System Health ===
      ai_ops_health: await computeAIOpsHealth(db, req.app.locals.phase3Cron, {
        lastForecastTs,
        lastLearningTs,
        aiConfidenceAvg,
        forecastAccuracy,
        forecastLatency: predictiveHealth.forecast_latency_avg,
        learningLatency: predictiveHealth.learning_latency_avg,
        realtimeStatus
      }),

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
 * v14.4: Simple rate limiter for job triggers
 * Prevents abuse of manual job triggers
 * Limit: 10 triggers per minute per IP
 */
const triggerRateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 triggers per window

function checkRateLimit(ip) {
  const now = Date.now();

  if (!triggerRateLimit[ip]) {
    triggerRateLimit[ip] = { count: 1, window: now };
    return { allowed: true };
  }

  const entry = triggerRateLimit[ip];

  // Reset window if expired
  if (now - entry.window > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.window = now;
    return { allowed: true };
  }

  // Check limit
  if (entry.count >= RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - entry.window)) / 1000);
    return { allowed: false, resetIn };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * POST /api/owner/ops/trigger/:job
 * Manually trigger a cron job (for testing/debugging)
 * Rate limited: 10 triggers/minute per IP
 */
router.post('/trigger/:job', authenticateToken, requireOwner, async (req, res) => {
  const { job } = req.params;

  // v14.4: Rate limiting
  const rateLimitCheck = checkRateLimit(req.ip);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: `Too many job triggers. Try again in ${rateLimitCheck.resetIn} seconds.`,
      resetIn: rateLimitCheck.resetIn
    });
  }

  try {
    // === v13.5: Handle self_heal trigger ===
    if (job === 'self_heal') {
      const healResults = await performSelfHeal(db);

      // Emit event for real-time updates
      realtimeBus.emit('system:self_heal', {
        success: true,
        actions: healResults.actions,
        timestamp: new Date().toISOString()
      });

      return res.json({
        success: true,
        job: 'self_heal',
        results: healResults,
        timestamp: new Date().toISOString()
      });
    }

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

// === v13.5: Self-Healing Agent Layer ===
/**
 * Perform self-healing diagnostics and repairs
 * Verifies essential endpoints, checks for missing files, re-indexes if needed
 *
 * @param {object} database - SQLite database connection
 * @returns {object} { actions, repaired, warnings }
 */
async function performSelfHeal(database) {
  const actions = [];
  const warnings = [];
  let repaired = 0;

  try {
    // 1. Verify essential tables exist
    const tables = ['inventory_items', 'invoices', 'ai_daily_forecast_cache', 'ai_learning_insights'];
    for (const table of tables) {
      try {
        await database.get(`SELECT 1 FROM ${table} LIMIT 1`);
        actions.push({ type: 'verify_table', table, status: 'ok' });
      } catch (err) {
        warnings.push({ type: 'missing_table', table, message: err.message });
        actions.push({ type: 'verify_table', table, status: 'missing' });
      }
    }

    // 2. Check for orphaned records (invoice_line_items without parent invoice)
    try {
      const orphaned = await database.get(`
        SELECT COUNT(*) as count
        FROM invoice_line_items ili
        LEFT JOIN invoices i ON ili.invoice_id = i.invoice_id
        WHERE i.invoice_id IS NULL
      `);

      if (orphaned && orphaned.count > 0) {
        warnings.push({ type: 'orphaned_records', count: orphaned.count });
        actions.push({ type: 'detect_orphans', count: orphaned.count, status: 'found' });
      } else {
        actions.push({ type: 'detect_orphans', status: 'clean' });
      }
    } catch (err) {
      logger.debug('Self-heal: Orphan check skipped:', err.message);
    }

    // 3. Verify ai_ops_breadcrumbs logging is working
    try {
      await database.run(`
        INSERT INTO ai_ops_breadcrumbs (action, metadata, created_at)
        VALUES ('self_heal_verify', '{"test": true}', datetime('now'))
      `);
      actions.push({ type: 'verify_logging', status: 'ok' });
      repaired++;
    } catch (err) {
      warnings.push({ type: 'logging_failed', message: err.message });
      actions.push({ type: 'verify_logging', status: 'failed' });
    }

    // 4. Check for stale forecasts (>48h old)
    try {
      const staleForecast = await database.get(`
        SELECT MAX(created_at) as last_forecast
        FROM ai_daily_forecast_cache
      `);

      if (staleForecast && staleForecast.last_forecast) {
        const ageHours = (Date.now() - new Date(staleForecast.last_forecast).getTime()) / 1000 / 60 / 60;
        if (ageHours > 48) {
          warnings.push({ type: 'stale_forecast', ageHours: Math.round(ageHours) });
          actions.push({ type: 'check_forecast_age', ageHours: Math.round(ageHours), status: 'stale' });
        } else {
          actions.push({ type: 'check_forecast_age', ageHours: Math.round(ageHours), status: 'fresh' });
        }
      }
    } catch (err) {
      logger.debug('Self-heal: Forecast age check skipped:', err.message);
    }

    // 5. Log self-heal action to breadcrumbs
    try {
      await database.run(`
        INSERT INTO ai_ops_breadcrumbs (action, metadata, created_at)
        VALUES ('self_heal_completed', ?, datetime('now'))
      `, [JSON.stringify({ actions: actions.length, repaired, warnings: warnings.length })]);
    } catch (err) {
      logger.debug('Self-heal: Could not log to breadcrumbs:', err.message);
    }

    return {
      success: true,
      actions,
      repaired,
      warnings,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Self-heal failed:', error);
    return {
      success: false,
      actions,
      repaired,
      warnings,
      error: error.message
    };
  }
}

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

// ============================================================================
// v14.4: AI INTELLIGENCE INDEX (Composite Learning Signals Score)
// ============================================================================

/**
 * Compute AI Intelligence Index (0-100 score)
 * Weighted composite of learning signals across 7 categories:
 * - Menu patterns (35%)
 * - Population/demand (25%)
 * - Waste reduction (10%)
 * - Seasonality (10%)
 * - Contractor patterns (10%)
 * - FIFO compliance (5%)
 * - Lead-time optimization (5%)
 *
 * @param {object} database - SQLite database connection
 * @returns {object} { intelligence_index, category_scores, last_updated }
 */
async function computeAIIntelligenceIndex(database) {
  try {
    const weights = {
      menu: 0.35,
      population: 0.25,
      waste: 0.10,
      seasonality: 0.10,
      contractor: 0.10,
      fifo: 0.05,
      leadTime: 0.05
    };

    const categoryScores = {};
    let totalScore = 0;
    let lastUpdated = null;

    // Get recent learning insights (last 7 days)
    const insights = await database.all(`
      SELECT
        insight_type,
        confidence,
        impact_score,
        created_at,
        applied_at
      FROM ai_learning_insights
      WHERE created_at >= datetime('now', '-7 days')
        AND confidence IS NOT NULL
        AND confidence > 0
      ORDER BY created_at DESC
    `);

    if (insights && insights.length > 0) {
      lastUpdated = insights[0].created_at;

      // Group insights by category (map insight_type to categories)
      const categories = {
        menu: [],
        population: [],
        waste: [],
        seasonality: [],
        contractor: [],
        fifo: [],
        leadTime: []
      };

      insights.forEach(insight => {
        const type = (insight.insight_type || '').toLowerCase();

        // Map insight types to categories
        if (type.includes('menu') || type.includes('meal') || type.includes('recipe')) {
          categories.menu.push(insight);
        } else if (type.includes('population') || type.includes('demand') || type.includes('headcount')) {
          categories.population.push(insight);
        } else if (type.includes('waste') || type.includes('spoilage') || type.includes('loss')) {
          categories.waste.push(insight);
        } else if (type.includes('season') || type.includes('calendar') || type.includes('holiday')) {
          categories.seasonality.push(insight);
        } else if (type.includes('contractor') || type.includes('vendor') || type.includes('supplier')) {
          categories.contractor.push(insight);
        } else if (type.includes('fifo') || type.includes('rotation') || type.includes('expiry')) {
          categories.fifo.push(insight);
        } else if (type.includes('lead') || type.includes('delivery') || type.includes('procurement')) {
          categories.leadTime.push(insight);
        }
      });

      // Compute category scores (average confidence of insights in category)
      for (const [category, categoryInsights] of Object.entries(categories)) {
        if (categoryInsights.length > 0) {
          const avgConfidence = categoryInsights.reduce((sum, ins) => sum + (ins.confidence || 0), 0) / categoryInsights.length;
          const avgImpact = categoryInsights.reduce((sum, ins) => sum + (ins.impact_score || 50), 0) / categoryInsights.length;
          const appliedCount = categoryInsights.filter(ins => ins.applied_at).length;
          const appliedRatio = appliedCount / categoryInsights.length;

          // Category score = (confidence * 100 * 0.7) + (impact * 0.2) + (applied_ratio * 100 * 0.1)
          const score = Math.round(
            (avgConfidence * 100 * 0.7) +
            (avgImpact * 0.2) +
            (appliedRatio * 100 * 0.1)
          );

          categoryScores[category] = {
            score: Math.min(100, Math.max(0, score)),
            insights_count: categoryInsights.length,
            applied_count: appliedCount,
            avg_confidence: Math.round(avgConfidence * 100)
          };
        } else {
          // No insights in this category - use baseline score
          categoryScores[category] = {
            score: 50, // Neutral baseline
            insights_count: 0,
            applied_count: 0,
            avg_confidence: 0
          };
        }

        // Apply weight to total score
        totalScore += categoryScores[category].score * weights[category];
      }
    } else {
      // No insights available - return baseline scores
      for (const category of Object.keys(weights)) {
        categoryScores[category] = {
          score: 50,
          insights_count: 0,
          applied_count: 0,
          avg_confidence: 0
        };
        totalScore += 50 * weights[category];
      }
    }

    const intelligenceIndex = Math.round(totalScore);

    // Get trend (compare to previous period)
    let trendPct = null;
    try {
      const previousInsights = await database.all(`
        SELECT confidence, impact_score
        FROM ai_learning_insights
        WHERE created_at >= datetime('now', '-14 days')
          AND created_at < datetime('now', '-7 days')
          AND confidence IS NOT NULL
      `);

      if (previousInsights && previousInsights.length > 0) {
        const prevAvgConfidence = previousInsights.reduce((sum, ins) => sum + (ins.confidence || 0), 0) / previousInsights.length;
        const prevScore = Math.round(prevAvgConfidence * 100);
        trendPct = ((intelligenceIndex - prevScore) / prevScore * 100).toFixed(1);
      }
    } catch (err) {
      logger.debug('AI Intelligence Index trend calculation failed:', err.message);
    }

    return {
      intelligence_index: intelligenceIndex,
      category_scores: categoryScores,
      last_updated: lastUpdated,
      trend_pct: trendPct ? parseFloat(trendPct) : null,
      color: intelligenceIndex >= 85 ? 'green' : intelligenceIndex >= 70 ? 'yellow' : 'red'
    };

  } catch (error) {
    logger.error('AI Intelligence Index computation failed:', error);
    return {
      intelligence_index: null,
      category_scores: {},
      last_updated: null,
      trend_pct: null,
      color: 'gray',
      error: error.message
    };
  }
}

// Export router and helper functions for reuse
module.exports = router;
module.exports.computeAIOpsHealth = computeAIOpsHealth;
module.exports.computeAIIntelligenceIndex = computeAIIntelligenceIndex;
