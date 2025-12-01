/**
 * NeuroPilot AI Engine Service - V22.2 (Hardened)
 * PostgreSQL-native AI inventory intelligence
 *
 * HARDENED FEATURES:
 * - Strict mode flag (AI_ENGINE_MODE: production | simulation)
 * - Formal data contracts with runtime validation
 * - Enhanced audit logging with tenant/user attribution
 * - SQL injection protection (all queries parameterized)
 * - Bounded outputs (no absurd/infinite values)
 * - NO FAKE DATA - uses only real historical PostgreSQL data
 *
 * Mode Behavior:
 * - production (default): Writes ONLY to ai_forecasts, ai_ops_breadcrumbs
 * - simulation: Can also write to ai_simulation_* tables
 *
 * NEVER writes to: inventory_items, vendors, population, users, tenants
 */

const { logger } = require('../config/logger');
const aiAudit = require('../lib/aiAudit');
const aiSchemas = require('../lib/aiSchemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * AI Engine Mode - controls data access and write permissions
 */
const AI_ENGINE_MODE = process.env.AI_ENGINE_MODE || 'production';

/**
 * AI Engine Configuration
 */
const CONFIG = {
  // Forecasting defaults
  FORECAST_HORIZON_DAYS: 14,
  FORECAST_MIN_HISTORY_DAYS: 7,
  FORECAST_MOVING_AVG_WINDOW: 7,

  // Anomaly detection thresholds
  ANOMALY_Z_SCORE_THRESHOLD: 2.5,
  ANOMALY_MIN_SAMPLES: 10,

  // Reorder calculation
  DEFAULT_SAFETY_STOCK_DAYS: 3,
  DEFAULT_LEAD_TIME_DAYS: 7,

  // Rate limiting
  MAX_ITEMS_PER_BATCH: 100,

  // Safety boundaries (from schemas)
  BOUNDARIES: aiSchemas.BOUNDARIES
};

// Log mode on startup
logger.info(`[AI-ENGINE] Mode: ${AI_ENGINE_MODE}`);
if (AI_ENGINE_MODE !== 'production' && AI_ENGINE_MODE !== 'simulation') {
  logger.warn(`[AI-ENGINE] Unknown mode "${AI_ENGINE_MODE}", defaulting to production behavior`);
}

// ============================================================================
// AUDIT HELPERS
// ============================================================================

/**
 * Log AI operation to ai_ops_breadcrumbs with full context
 * @param {string} eventType - Event type
 * @param {string} action - Action performed
 * @param {number} durationMs - Operation duration in milliseconds
 * @param {object} context - Additional context (orgId, userId, etc.)
 * @param {boolean} success - Whether operation succeeded
 */
async function logOperation(eventType, action, durationMs, context = {}, success = true) {
  try {
    await aiAudit.logAiEvent(global.db, {
      eventType,
      action,
      durationMs,
      success,
      orgId: context.orgId,
      userId: context.userId,
      rowsRead: context.rowsRead || 0,
      rowsWritten: context.rowsWritten || 0,
      errorMessage: context.error,
      metadata: {
        ...context.metadata,
        mode: AI_ENGINE_MODE
      }
    });
  } catch (error) {
    logger.warn('[AI-ENGINE] Failed to log operation:', error.message);
  }
}

/**
 * Get org_id from request context
 * Returns null if not found (caller should handle)
 */
function getOrgId(req) {
  const orgId = req.tenant?.tenantId || req.user?.org_id || req.user?.tenant_id;
  if (!orgId || orgId === 'undefined') {
    return null;
  }
  return aiSchemas.sanitizeString(orgId, null, 255);
}

/**
 * Get user_id from request context
 */
function getUserId(req) {
  const userId = req.user?.userId || req.user?.id || req.user?.user_id;
  return userId ? aiSchemas.sanitizeString(String(userId), null, 255) : null;
}

// ============================================================================
// DEMAND FORECASTING
// ============================================================================

/**
 * Generate demand forecast for items
 * Uses simple moving average (V1) - can be enhanced to ARIMA/Prophet later
 *
 * SECURITY: Uses only real historical data from PostgreSQL
 * VALIDATION: Input validated via aiSchemas, output bounded
 *
 * @param {string} orgId - Organization ID
 * @param {object} options - Forecast options
 * @param {string} options.itemCode - Specific item to forecast (optional)
 * @param {string} options.siteId - Specific site (optional)
 * @param {number} options.horizonDays - Days to forecast ahead (default: 14)
 * @param {string} [options.userId] - User ID for audit logging
 * @returns {Promise<object>} Validated forecast results
 */
async function generateDemandForecast(orgId, options = {}) {
  const startTime = Date.now();

  // Validate input
  const validation = aiSchemas.validateForecastInput({ orgId, ...options });
  if (!validation.valid) {
    await logOperation('validation_error', 'forecast_input_invalid', Date.now() - startTime, {
      orgId,
      userId: options.userId,
      error: validation.errors.join('; ')
    }, false);
    throw new Error(`Invalid forecast input: ${validation.errors.join(', ')}`);
  }

  const { itemCode, siteId, horizonDays = CONFIG.FORECAST_HORIZON_DAYS } = validation.data;
  let rowsRead = 0;

  try {
    // Step 1: Get historical consumption data
    // SECURITY: All parameters are bound, no string interpolation
    let query = `
      SELECT
        item_code,
        date,
        consumption_qty,
        is_anomaly
      FROM ai_consumption_derived
      WHERE org_id = $1
        AND date >= CURRENT_DATE - INTERVAL '90 days'
    `;
    const params = [orgId];
    let paramCount = 1;

    if (itemCode) {
      paramCount++;
      query += ` AND item_code = $${paramCount}`;
      params.push(itemCode);
    }

    if (siteId) {
      paramCount++;
      query += ` AND location_id = $${paramCount}`;
      params.push(siteId);
    }

    query += ' ORDER BY item_code, date ASC';

    const historyResult = await global.db.query(query, params);
    rowsRead += historyResult.rows.length;

    if (historyResult.rows.length === 0) {
      // Try to get data from inventory movements as fallback
      const movementsQuery = `
        SELECT
          sku as item_code,
          COUNT(DISTINCT DATE(created_at)) as days_with_data,
          AVG(ABS(quantity_change)) as avg_daily_movement
        FROM inventory_movements
        WHERE org_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '90 days'
          AND movement_type IN ('consumption', 'sale', 'adjustment')
        GROUP BY sku
        HAVING COUNT(*) >= $2
      `;

      const movementsResult = await global.db.query(movementsQuery, [
        orgId,
        CONFIG.FORECAST_MIN_HISTORY_DAYS
      ]);
      rowsRead += movementsResult.rows.length;

      if (movementsResult.rows.length === 0) {
        const durationMs = Date.now() - startTime;
        await logOperation('forecast_run', 'generate_demand_no_data', durationMs, {
          orgId,
          userId: options.userId,
          rowsRead,
          metadata: { itemCode, siteId, method: 'no_data' }
        });

        return aiSchemas.wrapForecastResponse({
          success: true,
          forecasts: [],
          message: 'No historical data available for forecasting',
          metadata: { orgId, itemCode, siteId, historyDays: 0 }
        });
      }

      // Generate simple forecasts from movement data
      const forecasts = movementsResult.rows.map(row => ({
        itemCode: row.item_code,
        method: 'moving_average_fallback',
        horizon: horizonDays,
        predictions: generateSimplePredictions(
          parseFloat(row.avg_daily_movement),
          horizonDays
        ),
        confidence: 0.6, // Lower confidence for fallback method
        dataPoints: parseInt(row.days_with_data)
      }));

      const durationMs = Date.now() - startTime;
      await logOperation('forecast_run', 'generate_demand', durationMs, {
        orgId,
        userId: options.userId,
        rowsRead,
        metadata: { itemCount: forecasts.length, method: 'fallback' }
      });

      return aiSchemas.wrapForecastResponse({
        success: true,
        forecasts,
        metadata: { orgId, itemCode, siteId, method: 'moving_average_fallback' }
      });
    }

    // Step 2: Group by item and calculate forecasts
    const itemGroups = groupByItem(historyResult.rows);
    const forecasts = [];

    for (const [code, dataPoints] of Object.entries(itemGroups)) {
      // Filter out anomalies for forecast calculation
      const cleanData = dataPoints.filter(d => !d.is_anomaly);

      if (cleanData.length < CONFIG.FORECAST_MIN_HISTORY_DAYS) {
        continue; // Skip items with insufficient data
      }

      // Calculate moving average
      const recentData = cleanData.slice(-CONFIG.FORECAST_MOVING_AVG_WINDOW);
      const avgConsumption = recentData.reduce((sum, d) =>
        sum + parseFloat(d.consumption_qty), 0) / recentData.length;

      // Calculate standard deviation for confidence interval
      const variance = recentData.reduce((sum, d) =>
        sum + Math.pow(parseFloat(d.consumption_qty) - avgConsumption, 2), 0
      ) / recentData.length;
      const stdDev = Math.sqrt(variance);

      forecasts.push({
        itemCode: code,
        method: 'moving_average',
        horizon: horizonDays,
        predictions: generatePredictions(avgConsumption, stdDev, horizonDays),
        confidence: calculateConfidence(cleanData.length, stdDev, avgConsumption),
        dataPoints: cleanData.length,
        avgDailyConsumption: aiSchemas.clamp(avgConsumption, 0, CONFIG.BOUNDARIES.MAX_QUANTITY)
      });
    }

    const durationMs = Date.now() - startTime;
    await logOperation('forecast_run', 'generate_demand', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      metadata: { itemCount: forecasts.length, method: 'moving_average' }
    });

    return aiSchemas.wrapForecastResponse({
      success: true,
      forecasts,
      metadata: {
        orgId,
        itemCode,
        siteId,
        method: 'moving_average',
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logOperation('error', 'generate_demand_error', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      error: error.message
    }, false);

    logger.error('[AI-ENGINE] Demand forecast error:', error);
    throw error;
  }
}

/**
 * Group consumption data by item
 */
function groupByItem(rows) {
  const groups = {};
  for (const row of rows) {
    if (!groups[row.item_code]) {
      groups[row.item_code] = [];
    }
    groups[row.item_code].push(row);
  }
  return groups;
}

/**
 * Generate prediction array with confidence intervals
 * BOUNDED: All values clamped to safe ranges
 */
function generatePredictions(avgValue, stdDev, horizonDays) {
  const predictions = [];
  const today = new Date();

  // Clamp inputs to safe ranges
  const safeAvg = aiSchemas.clamp(avgValue, 0, CONFIG.BOUNDARIES.MAX_QUANTITY);
  const safeStdDev = aiSchemas.clamp(stdDev, 0, CONFIG.BOUNDARIES.MAX_QUANTITY);
  const safeHorizon = aiSchemas.clamp(horizonDays, 1, CONFIG.BOUNDARIES.MAX_HORIZON_DAYS);

  for (let i = 1; i <= safeHorizon; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    // Slight decay in confidence further out
    const decayFactor = 1 + (i * 0.02);
    const adjustedStdDev = safeStdDev * decayFactor;

    predictions.push({
      date: date.toISOString().split('T')[0],
      predictedValue: Math.round(safeAvg * 100) / 100,
      confidenceLower: Math.max(0, Math.round((safeAvg - 1.96 * adjustedStdDev) * 100) / 100),
      confidenceUpper: Math.round((safeAvg + 1.96 * adjustedStdDev) * 100) / 100
    });
  }

  return predictions;
}

/**
 * Generate simple predictions without confidence intervals
 */
function generateSimplePredictions(avgValue, horizonDays) {
  const predictions = [];
  const today = new Date();

  const safeAvg = aiSchemas.clamp(avgValue, 0, CONFIG.BOUNDARIES.MAX_QUANTITY);
  const safeHorizon = aiSchemas.clamp(horizonDays, 1, CONFIG.BOUNDARIES.MAX_HORIZON_DAYS);

  for (let i = 1; i <= safeHorizon; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    predictions.push({
      date: date.toISOString().split('T')[0],
      predictedValue: Math.round(safeAvg * 100) / 100,
      confidenceLower: Math.round(safeAvg * 0.7 * 100) / 100,
      confidenceUpper: Math.round(safeAvg * 1.3 * 100) / 100
    });
  }

  return predictions;
}

/**
 * Calculate confidence score based on data quality
 * BOUNDED: Returns value between 0 and 1
 */
function calculateConfidence(dataPoints, stdDev, mean) {
  // More data = higher confidence
  const dataScore = Math.min(1, dataPoints / 30);

  // Lower coefficient of variation = higher confidence
  const cv = mean > 0 ? stdDev / mean : 1;
  const cvScore = Math.max(0, 1 - cv);

  // Weighted average
  const confidence = (dataScore * 0.6) + (cvScore * 0.4);
  return aiSchemas.clamp(confidence, 0, 1);
}

// ============================================================================
// REORDER SUGGESTIONS
// ============================================================================

/**
 * Generate reorder suggestions based on forecasts, stock levels, and lead times
 *
 * SECURITY: Reads only from inventory tables, writes nothing
 * VALIDATION: Output bounded and validated
 *
 * @param {string} orgId - Organization ID
 * @param {object} options - Options
 * @param {number} options.limit - Max items to return (default: 20)
 * @param {string} options.siteId - Filter by site (optional)
 * @param {string} [options.userId] - User ID for audit logging
 * @returns {Promise<object>} Validated reorder suggestions
 */
async function generateReorderSuggestions(orgId, options = {}) {
  const startTime = Date.now();

  // Validate input
  const validation = aiSchemas.validateReorderInput({ orgId, ...options });
  if (!validation.valid) {
    await logOperation('validation_error', 'reorder_input_invalid', Date.now() - startTime, {
      orgId,
      userId: options.userId,
      error: validation.errors.join('; ')
    }, false);
    throw new Error(`Invalid reorder input: ${validation.errors.join(', ')}`);
  }

  const { limit = 20, siteId } = validation.data;
  let rowsRead = 0;

  try {
    // Get current inventory levels with vendor lead times
    // SECURITY: All parameters are bound
    let query = `
      SELECT
        il.sku as item_code,
        im.name as item_name,
        il.quantity as current_stock,
        COALESCE(il.min_quantity, 0) as safety_stock,
        COALESCE(il.max_quantity, il.min_quantity * 3) as max_stock,
        COALESCE(v.lead_time_days, $2) as lead_time_days,
        v.name as preferred_vendor
      FROM item_locations il
      LEFT JOIN inventory_items im ON im.sku = il.sku AND im.org_id = il.org_id
      LEFT JOIN vendors v ON v.org_id = il.org_id AND v.preferred = true
      WHERE il.org_id = $1
        AND il.quantity IS NOT NULL
    `;
    const params = [orgId, CONFIG.DEFAULT_LEAD_TIME_DAYS];
    let paramCount = 2;

    if (siteId) {
      paramCount++;
      query += ` AND il.location_id = $${paramCount}`;
      params.push(siteId);
    }

    query += ' ORDER BY il.quantity ASC LIMIT 500';

    const inventoryResult = await global.db.query(query, params);
    rowsRead += inventoryResult.rows.length;

    if (inventoryResult.rows.length === 0) {
      const durationMs = Date.now() - startTime;
      await logOperation('reorder_run', 'generate_suggestions_no_data', durationMs, {
        orgId,
        userId: options.userId,
        rowsRead
      });

      return aiSchemas.wrapReorderResponse({
        success: true,
        suggestions: [],
        message: 'No inventory data available',
        metadata: { orgId, analyzedItems: 0, needsReorder: 0 }
      });
    }

    // Get demand forecasts for these items
    const forecastResult = await generateDemandForecast(orgId, { userId: options.userId });
    const forecastMap = new Map(
      forecastResult.forecasts.map(f => [f.itemCode, f])
    );

    // Calculate reorder needs
    const suggestions = [];

    for (const item of inventoryResult.rows) {
      const forecast = forecastMap.get(item.item_code);
      const avgDailyDemand = forecast?.avgDailyConsumption || 0;

      // Calculate days of stock remaining
      const daysOfStock = avgDailyDemand > 0
        ? item.current_stock / avgDailyDemand
        : 999;

      // Reorder point = (lead time + safety buffer) * daily demand
      const safetyBufferDays = CONFIG.DEFAULT_SAFETY_STOCK_DAYS;
      const reorderPoint = (item.lead_time_days + safetyBufferDays) * avgDailyDemand;

      // Check if reorder needed
      const needsReorder = item.current_stock <= reorderPoint ||
                          item.current_stock <= item.safety_stock;

      if (needsReorder) {
        // Calculate suggested order quantity (order up to max)
        const suggestedQty = Math.max(
          0,
          Math.ceil(item.max_stock - item.current_stock)
        );

        // Urgency scoring
        let urgency = 'low';
        if (daysOfStock <= item.lead_time_days) {
          urgency = 'critical';
        } else if (daysOfStock <= item.lead_time_days + safetyBufferDays) {
          urgency = 'high';
        } else if (item.current_stock <= item.safety_stock) {
          urgency = 'medium';
        }

        suggestions.push({
          itemCode: item.item_code,
          itemName: item.item_name || item.item_code,
          currentStock: parseFloat(item.current_stock),
          safetyStock: parseFloat(item.safety_stock),
          reorderPoint: Math.round(reorderPoint * 100) / 100,
          suggestedOrderQty: suggestedQty,
          daysOfStockRemaining: Math.round(daysOfStock * 10) / 10,
          leadTimeDays: item.lead_time_days,
          preferredVendor: item.preferred_vendor,
          urgency,
          avgDailyDemand: avgDailyDemand,
          confidence: forecast?.confidence || 0.5,
          drivers: generateReorderDrivers(item, daysOfStock, avgDailyDemand)
        });
      }
    }

    // Sort by urgency and return top N
    const sortedSuggestions = suggestions
      .sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      })
      .slice(0, limit);

    const durationMs = Date.now() - startTime;
    await logOperation('reorder_run', 'generate_suggestions', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      metadata: { totalItems: inventoryResult.rows.length, suggestions: sortedSuggestions.length }
    });

    return aiSchemas.wrapReorderResponse({
      success: true,
      suggestions: sortedSuggestions,
      metadata: {
        orgId,
        analyzedItems: inventoryResult.rows.length,
        needsReorder: suggestions.length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logOperation('error', 'reorder_suggestions_error', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      error: error.message
    }, false);

    logger.error('[AI-ENGINE] Reorder suggestions error:', error);
    throw error;
  }
}

/**
 * Generate driver explanations for reorder suggestions
 */
function generateReorderDrivers(item, daysOfStock, avgDailyDemand) {
  const drivers = [];

  if (daysOfStock <= item.lead_time_days) {
    drivers.push('stockout_risk_before_delivery');
  }

  if (item.current_stock <= item.safety_stock) {
    drivers.push('below_safety_stock');
  }

  if (avgDailyDemand > 0 && daysOfStock < 14) {
    drivers.push('low_coverage_period');
  }

  if (item.lead_time_days > 7) {
    drivers.push('long_lead_time');
  }

  return drivers.length > 0 ? drivers : ['routine_replenishment'];
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect anomalies in recent consumption patterns
 * Uses z-score method (V1) - can be enhanced to Isolation Forest later
 *
 * SECURITY: Parameterized queries only, no string interpolation
 * VALIDATION: Output bounded and validated
 *
 * @param {string} orgId - Organization ID
 * @param {object} options - Options
 * @param {number} options.windowDays - Days to analyze (default: 7)
 * @param {string} options.itemCode - Specific item (optional)
 * @param {string} [options.userId] - User ID for audit logging
 * @returns {Promise<object>} Validated detected anomalies
 */
async function detectAnomalies(orgId, options = {}) {
  const startTime = Date.now();

  // Validate input
  const validation = aiSchemas.validateAnomalyInput({ orgId, ...options });
  if (!validation.valid) {
    await logOperation('validation_error', 'anomaly_input_invalid', Date.now() - startTime, {
      orgId,
      userId: options.userId,
      error: validation.errors.join('; ')
    }, false);
    throw new Error(`Invalid anomaly input: ${validation.errors.join(', ')}`);
  }

  const { windowDays = 7, itemCode } = validation.data;
  let rowsRead = 0;

  try {
    // First check if we have pre-computed anomalies in ai_consumption_derived
    // SECURITY: windowDays is now parameterized, not interpolated
    let precomputedQuery = `
      SELECT
        item_code,
        date,
        consumption_qty,
        anomaly_score,
        location_id
      FROM ai_consumption_derived
      WHERE org_id = $1
        AND is_anomaly = true
        AND date >= CURRENT_DATE - $2 * INTERVAL '1 day'
    `;
    const precomputedParams = [orgId, windowDays];
    let paramCount = 2;

    if (itemCode) {
      paramCount++;
      precomputedQuery += ` AND item_code = $${paramCount}`;
      precomputedParams.push(itemCode);
    }

    precomputedQuery += ' ORDER BY date DESC, anomaly_score DESC LIMIT 50';

    const precomputedResult = await global.db.query(precomputedQuery, precomputedParams);
    rowsRead += precomputedResult.rows.length;

    if (precomputedResult.rows.length > 0) {
      // Return pre-computed anomalies
      const anomalies = precomputedResult.rows.map(row => ({
        itemCode: row.item_code,
        date: row.date,
        consumptionQty: parseFloat(row.consumption_qty),
        anomalyScore: parseFloat(row.anomaly_score),
        locationId: row.location_id,
        type: row.anomaly_score > 0 ? 'spike' : 'drop',
        severity: categorizeAnomaly(Math.abs(row.anomaly_score)),
        suggestedActions: getSuggestedActions(Math.abs(row.anomaly_score))
      }));

      const durationMs = Date.now() - startTime;
      await logOperation('anomaly_run', 'detect_precomputed', durationMs, {
        orgId,
        userId: options.userId,
        rowsRead,
        metadata: { method: 'precomputed', count: anomalies.length }
      });

      return aiSchemas.wrapAnomalyResponse({
        success: true,
        anomalies,
        metadata: {
          orgId,
          windowDays,
          method: 'precomputed',
          generatedAt: new Date().toISOString()
        }
      });
    }

    // Fallback: Calculate anomalies from inventory_movements
    // SECURITY: All dynamic values are parameterized
    const movementsQuery = `
      WITH daily_consumption AS (
        SELECT
          sku as item_code,
          DATE(created_at) as date,
          SUM(ABS(quantity_change)) as daily_qty
        FROM inventory_movements
        WHERE org_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '90 days'
          AND movement_type IN ('consumption', 'sale', 'adjustment')
        GROUP BY sku, DATE(created_at)
      ),
      item_stats AS (
        SELECT
          item_code,
          AVG(daily_qty) as avg_qty,
          STDDEV(daily_qty) as stddev_qty,
          COUNT(*) as sample_count
        FROM daily_consumption
        WHERE date < CURRENT_DATE - $2 * INTERVAL '1 day'
        GROUP BY item_code
        HAVING COUNT(*) >= $3
      )
      SELECT
        dc.item_code,
        dc.date,
        dc.daily_qty,
        ist.avg_qty,
        ist.stddev_qty,
        CASE
          WHEN ist.stddev_qty > 0 THEN (dc.daily_qty - ist.avg_qty) / ist.stddev_qty
          ELSE 0
        END as z_score
      FROM daily_consumption dc
      JOIN item_stats ist ON dc.item_code = ist.item_code
      WHERE dc.date >= CURRENT_DATE - $2 * INTERVAL '1 day'
        AND ABS(CASE
          WHEN ist.stddev_qty > 0 THEN (dc.daily_qty - ist.avg_qty) / ist.stddev_qty
          ELSE 0
        END) >= $4
      ORDER BY ABS(CASE
        WHEN ist.stddev_qty > 0 THEN (dc.daily_qty - ist.avg_qty) / ist.stddev_qty
        ELSE 0
      END) DESC
      LIMIT 50
    `;

    const movementsResult = await global.db.query(movementsQuery, [
      orgId,
      windowDays,
      CONFIG.ANOMALY_MIN_SAMPLES,
      CONFIG.ANOMALY_Z_SCORE_THRESHOLD
    ]);
    rowsRead += movementsResult.rows.length;

    const anomalies = movementsResult.rows.map(row => ({
      itemCode: row.item_code,
      date: row.date,
      actualQty: parseFloat(row.daily_qty),
      expectedQty: Math.round(parseFloat(row.avg_qty) * 100) / 100,
      zScore: Math.round(parseFloat(row.z_score) * 100) / 100,
      deviationPercent: row.avg_qty > 0
        ? Math.round(((row.daily_qty - row.avg_qty) / row.avg_qty) * 100)
        : 0,
      type: row.z_score > 0 ? 'spike' : 'drop',
      severity: categorizeAnomaly(Math.abs(row.z_score)),
      suggestedActions: getSuggestedActions(Math.abs(row.z_score))
    }));

    const durationMs = Date.now() - startTime;
    await logOperation('anomaly_run', 'detect_zscore', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      metadata: { method: 'z_score', count: anomalies.length }
    });

    return aiSchemas.wrapAnomalyResponse({
      success: true,
      anomalies,
      metadata: {
        orgId,
        windowDays,
        method: 'z_score',
        threshold: CONFIG.ANOMALY_Z_SCORE_THRESHOLD,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logOperation('error', 'anomaly_detection_error', durationMs, {
      orgId,
      userId: options.userId,
      rowsRead,
      error: error.message
    }, false);

    logger.error('[AI-ENGINE] Anomaly detection error:', error);
    throw error;
  }
}

/**
 * Categorize anomaly severity based on z-score
 */
function categorizeAnomaly(zScore) {
  if (zScore >= 4) return 'critical';
  if (zScore >= 3) return 'high';
  if (zScore >= 2.5) return 'medium';
  return 'low';
}

/**
 * Get suggested actions based on anomaly severity
 */
function getSuggestedActions(zScore) {
  const actions = [];

  if (zScore >= 3) {
    actions.push('investigate_immediately');
    actions.push('verify_physical_count');
  }

  if (zScore >= 2.5) {
    actions.push('review_recent_transactions');
  }

  actions.push('monitor_trend');

  return actions;
}

// ============================================================================
// POPULATION-SCALED FORECASTING
// ============================================================================

/**
 * Get population factors for demand scaling
 *
 * @param {string} orgId - Organization ID
 * @param {object} options - Options
 * @param {string} options.siteId - Site ID (optional)
 * @param {number} options.days - Days of history (default: 30)
 * @param {string} [options.userId] - User ID for audit logging
 * @returns {Promise<object>} Validated population statistics
 */
async function getPopulationFactors(orgId, options = {}) {
  const startTime = Date.now();

  // Validate orgId
  if (!orgId || typeof orgId !== 'string') {
    throw new Error('orgId is required and must be a string');
  }

  const { siteId, days = 30, userId } = options;
  const safeDays = aiSchemas.clamp(parseInt(days) || 30, 1, 365);
  let rowsRead = 0;

  try {
    // SECURITY: days is parameterized
    let query = `
      SELECT
        AVG(breakfast) as avg_breakfast,
        AVG(lunch) as avg_lunch,
        AVG(dinner) as avg_dinner,
        AVG(total) as avg_total,
        MAX(total) as max_total,
        MIN(total) as min_total,
        COUNT(*) as days_logged
      FROM population
      WHERE org_id = $1
        AND date >= CURRENT_DATE - $2 * INTERVAL '1 day'
    `;
    const params = [orgId, safeDays];

    if (siteId) {
      query += ' AND site_id = $3';
      params.push(aiSchemas.sanitizeString(siteId, null, 255));
    }

    const result = await global.db.query(query, params);
    rowsRead += 1;
    const row = result.rows[0];

    const durationMs = Date.now() - startTime;
    await logOperation('population_query', 'get_factors', durationMs, {
      orgId,
      userId,
      rowsRead,
      metadata: { siteId, days: safeDays }
    });

    return aiSchemas.wrapPopulationResponse({
      success: true,
      populationFactors: {
        avgBreakfast: Math.round(parseFloat(row.avg_breakfast || 0)),
        avgLunch: Math.round(parseFloat(row.avg_lunch || 0)),
        avgDinner: Math.round(parseFloat(row.avg_dinner || 0)),
        avgTotal: Math.round(parseFloat(row.avg_total || 0)),
        maxTotal: parseInt(row.max_total || 0),
        minTotal: parseInt(row.min_total || 0),
        daysLogged: parseInt(row.days_logged || 0)
      },
      metadata: {
        orgId,
        siteId,
        periodDays: safeDays
      }
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logOperation('error', 'population_factors_error', durationMs, {
      orgId,
      userId,
      rowsRead,
      error: error.message
    }, false);

    logger.error('[AI-ENGINE] Population factors error:', error);
    throw error;
  }
}

// ============================================================================
// AI ENGINE HEALTH & STATS
// ============================================================================

/**
 * Get AI Engine health status
 */
async function getHealth(orgId) {
  const startTime = Date.now();

  try {
    // Check database connectivity
    const dbCheck = await global.db.query('SELECT 1 as ok');
    const dbOk = dbCheck.rows[0]?.ok === 1;

    // Check ai_ops_breadcrumbs table exists
    let breadcrumbsOk = false;
    try {
      await global.db.query('SELECT 1 FROM ai_ops_breadcrumbs LIMIT 1');
      breadcrumbsOk = true;
    } catch (e) {
      // Table might not exist
    }

    // Get recent operation counts
    let recentOps = { total: 0, successful: 0, failed: 0 };
    if (breadcrumbsOk) {
      const opsResult = await global.db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE success = true) as successful,
          COUNT(*) FILTER (WHERE success = false) as failed
        FROM ai_ops_breadcrumbs
        WHERE ran_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `);
      recentOps = opsResult.rows[0];
    }

    const durationMs = Date.now() - startTime;

    await logOperation('health_check', 'system_health', durationMs, { orgId });

    return {
      status: dbOk ? 'healthy' : 'degraded',
      version: 'V22.2',
      mode: AI_ENGINE_MODE,
      features: {
        demandForecasting: true,
        reorderSuggestions: true,
        anomalyDetection: true,
        populationScaling: true,
        dataValidation: true,
        auditLogging: true
      },
      database: {
        connected: dbOk,
        breadcrumbsTable: breadcrumbsOk
      },
      recentOperations: {
        last24Hours: parseInt(recentOps.total || 0),
        successful: parseInt(recentOps.successful || 0),
        failed: parseInt(recentOps.failed || 0)
      },
      config: {
        forecastHorizon: CONFIG.FORECAST_HORIZON_DAYS,
        anomalyThreshold: CONFIG.ANOMALY_Z_SCORE_THRESHOLD,
        defaultLeadTime: CONFIG.DEFAULT_LEAD_TIME_DAYS
      },
      latencyMs: durationMs
    };

  } catch (error) {
    logger.error('[AI-ENGINE] Health check error:', error);
    return {
      status: 'unhealthy',
      mode: AI_ENGINE_MODE,
      error: error.message
    };
  }
}

// ============================================================================
// MODE HELPERS
// ============================================================================

/**
 * Check if AI Engine is in production mode
 */
function isProductionMode() {
  return aiAudit.isProductionMode();
}

/**
 * Check if AI Engine is in simulation mode
 */
function isSimulationMode() {
  return aiAudit.isSimulationMode();
}

/**
 * Get current mode
 */
function getMode() {
  return AI_ENGINE_MODE;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  generateDemandForecast,
  generateReorderSuggestions,
  detectAnomalies,
  getPopulationFactors,
  getHealth,

  // Utilities
  getOrgId,
  getUserId,

  // Mode management
  isProductionMode,
  isSimulationMode,
  getMode,
  AI_ENGINE_MODE,

  // Config (for testing/override)
  CONFIG
};
