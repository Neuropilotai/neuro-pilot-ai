/**
 * AI Engine Data Schemas - V22.2
 * Formal data contracts for AI Engine inputs and outputs
 *
 * Provides:
 * - Runtime validation for all AI data structures
 * - TypeScript-style JSDoc type definitions
 * - Safe defaults and boundary enforcement
 * - Immutable schema definitions
 *
 * SECURITY: All validated outputs are sanitized and bounded
 */

const { logger } = require('../config/logger');

// ============================================================================
// CONSTANTS & BOUNDARIES
// ============================================================================

/**
 * Safe boundaries for numeric values
 * Prevents absurd/infinite values from propagating
 */
const BOUNDARIES = {
  // Quantities
  MIN_QUANTITY: 0,
  MAX_QUANTITY: 1_000_000, // 1 million units max

  // Confidence scores
  MIN_CONFIDENCE: 0,
  MAX_CONFIDENCE: 1,

  // Time horizons
  MIN_HORIZON_DAYS: 1,
  MAX_HORIZON_DAYS: 365,

  // Z-scores
  MIN_Z_SCORE: -100,
  MAX_Z_SCORE: 100,

  // Percentages
  MIN_PERCENT: -1000, // Allow large negative for deviations
  MAX_PERCENT: 10000, // 10000% max

  // Lead times
  MIN_LEAD_TIME_DAYS: 0,
  MAX_LEAD_TIME_DAYS: 365,

  // Population counts
  MIN_POPULATION: 0,
  MAX_POPULATION: 100_000
};

/**
 * Allowed urgency levels
 */
const URGENCY_LEVELS = ['critical', 'high', 'medium', 'low'];

/**
 * Allowed severity levels
 */
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];

/**
 * Allowed anomaly types
 */
const ANOMALY_TYPES = ['spike', 'drop'];

/**
 * Allowed forecast methods
 */
const FORECAST_METHODS = ['moving_average', 'moving_average_fallback', 'arima', 'prophet', 'lstm'];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Clamp a number to safe boundaries
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Clamped value
 */
function clamp(value, min, max) {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return min; // Default to minimum for invalid numbers
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate and sanitize a string
 * @param {any} value - Value to validate
 * @param {string} defaultValue - Default if invalid
 * @param {number} maxLength - Maximum string length
 * @returns {string}
 */
function sanitizeString(value, defaultValue = '', maxLength = 1000) {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  return value.substring(0, maxLength).trim();
}

/**
 * Validate a date string (YYYY-MM-DD format)
 * @param {string} dateStr - Date string
 * @returns {boolean}
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate an enum value
 * @param {any} value - Value to check
 * @param {string[]} allowed - Allowed values
 * @param {string} defaultValue - Default if invalid
 * @returns {string}
 */
function validateEnum(value, allowed, defaultValue) {
  if (allowed.includes(value)) {
    return value;
  }
  return defaultValue;
}

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * @typedef {Object} ForecastInput
 * @property {string} orgId - Organization ID (required)
 * @property {string} [itemCode] - Specific item code (optional)
 * @property {string} [siteId] - Specific site ID (optional)
 * @property {number} [horizonDays] - Forecast horizon in days (1-365)
 */

/**
 * Validate and sanitize forecast input
 * @param {object} input - Raw input
 * @returns {{ valid: boolean, data: ForecastInput, errors: string[] }}
 */
function validateForecastInput(input) {
  const errors = [];
  const data = {};

  // orgId is required
  if (!input.orgId || typeof input.orgId !== 'string') {
    errors.push('orgId is required and must be a string');
  } else {
    data.orgId = sanitizeString(input.orgId, '', 255);
  }

  // itemCode is optional
  if (input.itemCode !== undefined) {
    data.itemCode = sanitizeString(input.itemCode, null, 255) || undefined;
  }

  // siteId is optional
  if (input.siteId !== undefined) {
    data.siteId = sanitizeString(input.siteId, null, 255) || undefined;
  }

  // horizonDays is optional, default 14
  if (input.horizonDays !== undefined) {
    const horizon = parseInt(input.horizonDays);
    if (isNaN(horizon)) {
      errors.push('horizonDays must be a number');
    } else {
      data.horizonDays = clamp(horizon, BOUNDARIES.MIN_HORIZON_DAYS, BOUNDARIES.MAX_HORIZON_DAYS);
    }
  }

  return {
    valid: errors.length === 0,
    data,
    errors
  };
}

/**
 * @typedef {Object} ReorderInput
 * @property {string} orgId - Organization ID (required)
 * @property {number} [limit] - Max items to return (1-100)
 * @property {string} [siteId] - Specific site ID (optional)
 */

/**
 * Validate and sanitize reorder input
 * @param {object} input - Raw input
 * @returns {{ valid: boolean, data: ReorderInput, errors: string[] }}
 */
function validateReorderInput(input) {
  const errors = [];
  const data = {};

  // orgId is required
  if (!input.orgId || typeof input.orgId !== 'string') {
    errors.push('orgId is required and must be a string');
  } else {
    data.orgId = sanitizeString(input.orgId, '', 255);
  }

  // limit is optional, default 20, max 100
  if (input.limit !== undefined) {
    const limit = parseInt(input.limit);
    if (isNaN(limit)) {
      errors.push('limit must be a number');
    } else {
      data.limit = clamp(limit, 1, 100);
    }
  }

  // siteId is optional
  if (input.siteId !== undefined) {
    data.siteId = sanitizeString(input.siteId, null, 255) || undefined;
  }

  return {
    valid: errors.length === 0,
    data,
    errors
  };
}

/**
 * @typedef {Object} AnomalyInput
 * @property {string} orgId - Organization ID (required)
 * @property {number} [windowDays] - Analysis window in days (1-90)
 * @property {string} [itemCode] - Specific item code (optional)
 */

/**
 * Validate and sanitize anomaly detection input
 * @param {object} input - Raw input
 * @returns {{ valid: boolean, data: AnomalyInput, errors: string[] }}
 */
function validateAnomalyInput(input) {
  const errors = [];
  const data = {};

  // orgId is required
  if (!input.orgId || typeof input.orgId !== 'string') {
    errors.push('orgId is required and must be a string');
  } else {
    data.orgId = sanitizeString(input.orgId, '', 255);
  }

  // windowDays is optional, default 7, max 90
  if (input.windowDays !== undefined) {
    const window = parseInt(input.windowDays);
    if (isNaN(window)) {
      errors.push('windowDays must be a number');
    } else {
      data.windowDays = clamp(window, 1, 90);
    }
  }

  // itemCode is optional
  if (input.itemCode !== undefined) {
    data.itemCode = sanitizeString(input.itemCode, null, 255) || undefined;
  }

  return {
    valid: errors.length === 0,
    data,
    errors
  };
}

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * @typedef {Object} Prediction
 * @property {string} date - Date string (YYYY-MM-DD)
 * @property {number} predictedValue - Predicted quantity
 * @property {number} confidenceLower - Lower confidence bound
 * @property {number} confidenceUpper - Upper confidence bound
 */

/**
 * Validate and sanitize a prediction object
 * @param {object} prediction - Raw prediction
 * @returns {Prediction}
 */
function sanitizePrediction(prediction) {
  return {
    date: isValidDateString(prediction.date) ? prediction.date : new Date().toISOString().split('T')[0],
    predictedValue: clamp(prediction.predictedValue || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    confidenceLower: clamp(prediction.confidenceLower || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    confidenceUpper: clamp(prediction.confidenceUpper || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY)
  };
}

/**
 * @typedef {Object} ForecastResult
 * @property {string} itemCode - Item code
 * @property {string} method - Forecast method used
 * @property {number} horizon - Forecast horizon in days
 * @property {Prediction[]} predictions - Array of predictions
 * @property {number} confidence - Overall confidence score (0-1)
 * @property {number} dataPoints - Number of historical data points used
 * @property {number} [avgDailyConsumption] - Average daily consumption
 */

/**
 * Validate and sanitize a forecast result
 * @param {object} result - Raw forecast result
 * @returns {ForecastResult}
 */
function sanitizeForecastResult(result) {
  return {
    itemCode: sanitizeString(result.itemCode, 'UNKNOWN', 255),
    method: validateEnum(result.method, FORECAST_METHODS, 'moving_average'),
    horizon: clamp(result.horizon || 14, BOUNDARIES.MIN_HORIZON_DAYS, BOUNDARIES.MAX_HORIZON_DAYS),
    predictions: Array.isArray(result.predictions)
      ? result.predictions.map(sanitizePrediction)
      : [],
    confidence: clamp(result.confidence || 0.5, BOUNDARIES.MIN_CONFIDENCE, BOUNDARIES.MAX_CONFIDENCE),
    dataPoints: clamp(result.dataPoints || 0, 0, 10000),
    avgDailyConsumption: result.avgDailyConsumption !== undefined
      ? clamp(result.avgDailyConsumption, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY)
      : undefined
  };
}

/**
 * @typedef {Object} ReorderSuggestion
 * @property {string} itemCode - Item code
 * @property {string} itemName - Item name
 * @property {number} currentStock - Current stock quantity
 * @property {number} safetyStock - Safety stock level
 * @property {number} reorderPoint - Calculated reorder point
 * @property {number} suggestedOrderQty - Suggested order quantity
 * @property {number} daysOfStockRemaining - Days until stockout
 * @property {number} leadTimeDays - Vendor lead time
 * @property {string} [preferredVendor] - Preferred vendor name
 * @property {string} urgency - Urgency level
 * @property {number} avgDailyDemand - Average daily demand
 * @property {number} confidence - Confidence score
 * @property {string[]} drivers - Reorder drivers/reasons
 */

/**
 * Validate and sanitize a reorder suggestion
 * @param {object} suggestion - Raw suggestion
 * @returns {ReorderSuggestion}
 */
function sanitizeReorderSuggestion(suggestion) {
  return {
    itemCode: sanitizeString(suggestion.itemCode, 'UNKNOWN', 255),
    itemName: sanitizeString(suggestion.itemName, 'Unknown Item', 500),
    currentStock: clamp(suggestion.currentStock || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    safetyStock: clamp(suggestion.safetyStock || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    reorderPoint: clamp(suggestion.reorderPoint || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    suggestedOrderQty: clamp(suggestion.suggestedOrderQty || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    daysOfStockRemaining: clamp(suggestion.daysOfStockRemaining || 0, 0, 9999),
    leadTimeDays: clamp(suggestion.leadTimeDays || 7, BOUNDARIES.MIN_LEAD_TIME_DAYS, BOUNDARIES.MAX_LEAD_TIME_DAYS),
    preferredVendor: suggestion.preferredVendor ? sanitizeString(suggestion.preferredVendor, null, 255) : null,
    urgency: validateEnum(suggestion.urgency, URGENCY_LEVELS, 'low'),
    avgDailyDemand: clamp(suggestion.avgDailyDemand || 0, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY),
    confidence: clamp(suggestion.confidence || 0.5, BOUNDARIES.MIN_CONFIDENCE, BOUNDARIES.MAX_CONFIDENCE),
    drivers: Array.isArray(suggestion.drivers)
      ? suggestion.drivers.map(d => sanitizeString(d, '', 100)).filter(d => d)
      : []
  };
}

/**
 * @typedef {Object} AnomalyRecord
 * @property {string} itemCode - Item code
 * @property {string} date - Date of anomaly
 * @property {number} [consumptionQty] - Consumption quantity (precomputed)
 * @property {number} [actualQty] - Actual quantity (z-score method)
 * @property {number} [expectedQty] - Expected quantity (z-score method)
 * @property {number} [anomalyScore] - Anomaly score (precomputed)
 * @property {number} [zScore] - Z-score (z-score method)
 * @property {number} [deviationPercent] - Deviation percentage
 * @property {string} [locationId] - Location ID
 * @property {string} type - Anomaly type (spike/drop)
 * @property {string} severity - Severity level
 * @property {string[]} suggestedActions - Suggested actions
 */

/**
 * Validate and sanitize an anomaly record
 * @param {object} anomaly - Raw anomaly
 * @returns {AnomalyRecord}
 */
function sanitizeAnomalyRecord(anomaly) {
  const record = {
    itemCode: sanitizeString(anomaly.itemCode, 'UNKNOWN', 255),
    date: isValidDateString(anomaly.date) ? anomaly.date : new Date().toISOString().split('T')[0],
    type: validateEnum(anomaly.type, ANOMALY_TYPES, 'spike'),
    severity: validateEnum(anomaly.severity, SEVERITY_LEVELS, 'low'),
    suggestedActions: Array.isArray(anomaly.suggestedActions)
      ? anomaly.suggestedActions.map(a => sanitizeString(a, '', 100)).filter(a => a)
      : []
  };

  // Optional fields (depend on detection method)
  if (anomaly.consumptionQty !== undefined) {
    record.consumptionQty = clamp(anomaly.consumptionQty, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY);
  }
  if (anomaly.actualQty !== undefined) {
    record.actualQty = clamp(anomaly.actualQty, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY);
  }
  if (anomaly.expectedQty !== undefined) {
    record.expectedQty = clamp(anomaly.expectedQty, BOUNDARIES.MIN_QUANTITY, BOUNDARIES.MAX_QUANTITY);
  }
  if (anomaly.anomalyScore !== undefined) {
    record.anomalyScore = clamp(anomaly.anomalyScore, BOUNDARIES.MIN_Z_SCORE, BOUNDARIES.MAX_Z_SCORE);
  }
  if (anomaly.zScore !== undefined) {
    record.zScore = clamp(anomaly.zScore, BOUNDARIES.MIN_Z_SCORE, BOUNDARIES.MAX_Z_SCORE);
  }
  if (anomaly.deviationPercent !== undefined) {
    record.deviationPercent = clamp(anomaly.deviationPercent, BOUNDARIES.MIN_PERCENT, BOUNDARIES.MAX_PERCENT);
  }
  if (anomaly.locationId !== undefined) {
    record.locationId = sanitizeString(anomaly.locationId, null, 255);
  }

  return record;
}

/**
 * @typedef {Object} PopulationFactors
 * @property {number} avgBreakfast - Average breakfast count
 * @property {number} avgLunch - Average lunch count
 * @property {number} avgDinner - Average dinner count
 * @property {number} avgTotal - Average total count
 * @property {number} maxTotal - Maximum total count
 * @property {number} minTotal - Minimum total count
 * @property {number} daysLogged - Days with logged data
 */

/**
 * Validate and sanitize population factors
 * @param {object} factors - Raw factors
 * @returns {PopulationFactors}
 */
function sanitizePopulationFactors(factors) {
  return {
    avgBreakfast: clamp(factors.avgBreakfast || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    avgLunch: clamp(factors.avgLunch || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    avgDinner: clamp(factors.avgDinner || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    avgTotal: clamp(factors.avgTotal || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    maxTotal: clamp(factors.maxTotal || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    minTotal: clamp(factors.minTotal || 0, BOUNDARIES.MIN_POPULATION, BOUNDARIES.MAX_POPULATION),
    daysLogged: clamp(factors.daysLogged || 0, 0, 365)
  };
}

// ============================================================================
// RESPONSE WRAPPERS
// ============================================================================

/**
 * Wrap and validate a forecast response
 * @param {object} response - Raw response from AI engine
 * @returns {object} - Validated response
 */
function wrapForecastResponse(response) {
  return {
    success: response.success === true,
    forecasts: Array.isArray(response.forecasts)
      ? response.forecasts.map(sanitizeForecastResult)
      : [],
    message: response.message ? sanitizeString(response.message, '', 500) : undefined,
    metadata: {
      orgId: sanitizeString(response.metadata?.orgId, null, 255),
      itemCode: response.metadata?.itemCode ? sanitizeString(response.metadata.itemCode, null, 255) : undefined,
      siteId: response.metadata?.siteId ? sanitizeString(response.metadata.siteId, null, 255) : undefined,
      method: response.metadata?.method ? sanitizeString(response.metadata.method, '', 50) : undefined,
      generatedAt: response.metadata?.generatedAt || new Date().toISOString()
    }
  };
}

/**
 * Wrap and validate a reorder response
 * @param {object} response - Raw response from AI engine
 * @returns {object} - Validated response
 */
function wrapReorderResponse(response) {
  return {
    success: response.success === true,
    suggestions: Array.isArray(response.suggestions)
      ? response.suggestions.map(sanitizeReorderSuggestion)
      : [],
    message: response.message ? sanitizeString(response.message, '', 500) : undefined,
    metadata: {
      orgId: sanitizeString(response.metadata?.orgId, null, 255),
      analyzedItems: clamp(response.metadata?.analyzedItems || 0, 0, 100000),
      needsReorder: clamp(response.metadata?.needsReorder || 0, 0, 100000),
      generatedAt: response.metadata?.generatedAt || new Date().toISOString()
    }
  };
}

/**
 * Wrap and validate an anomaly response
 * @param {object} response - Raw response from AI engine
 * @returns {object} - Validated response
 */
function wrapAnomalyResponse(response) {
  return {
    success: response.success === true,
    anomalies: Array.isArray(response.anomalies)
      ? response.anomalies.map(sanitizeAnomalyRecord)
      : [],
    metadata: {
      orgId: sanitizeString(response.metadata?.orgId, null, 255),
      windowDays: clamp(response.metadata?.windowDays || 7, 1, 90),
      method: response.metadata?.method ? sanitizeString(response.metadata.method, '', 50) : undefined,
      threshold: response.metadata?.threshold !== undefined
        ? clamp(response.metadata.threshold, 0, 10)
        : undefined,
      generatedAt: response.metadata?.generatedAt || new Date().toISOString()
    }
  };
}

/**
 * Wrap and validate a population response
 * @param {object} response - Raw response from AI engine
 * @returns {object} - Validated response
 */
function wrapPopulationResponse(response) {
  return {
    success: response.success === true,
    populationFactors: sanitizePopulationFactors(response.populationFactors || {}),
    metadata: {
      orgId: sanitizeString(response.metadata?.orgId, null, 255),
      siteId: response.metadata?.siteId ? sanitizeString(response.metadata.siteId, null, 255) : undefined,
      periodDays: clamp(response.metadata?.periodDays || 30, 1, 365)
    }
  };
}

module.exports = {
  // Boundaries
  BOUNDARIES,
  URGENCY_LEVELS,
  SEVERITY_LEVELS,
  ANOMALY_TYPES,
  FORECAST_METHODS,

  // Helpers
  clamp,
  sanitizeString,
  isValidDateString,
  validateEnum,

  // Input validators
  validateForecastInput,
  validateReorderInput,
  validateAnomalyInput,

  // Output sanitizers
  sanitizePrediction,
  sanitizeForecastResult,
  sanitizeReorderSuggestion,
  sanitizeAnomalyRecord,
  sanitizePopulationFactors,

  // Response wrappers
  wrapForecastResponse,
  wrapReorderResponse,
  wrapAnomalyResponse,
  wrapPopulationResponse
};
