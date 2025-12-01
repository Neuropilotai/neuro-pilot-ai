/**
 * AI Audit Logger - V22.2
 * Centralized audit logging for AI Engine operations
 *
 * Features:
 * - Structured logging to ai_ops_breadcrumbs
 * - Request/response tracking
 * - Tenant/user attribution
 * - Mode tracking (production vs simulation)
 * - Data access metrics (rows_read, rows_written)
 *
 * SECURITY: All audit entries are immutable (INSERT only, no UPDATE/DELETE)
 */

const { logger } = require('../config/logger');

/**
 * AI Engine Mode
 * Controls what operations are allowed and where data is written
 */
const AI_ENGINE_MODE = process.env.AI_ENGINE_MODE || 'production';

/**
 * Allowed audit event types - strict schema enforcement
 */
const ALLOWED_EVENT_TYPES = [
  'api_request',      // Incoming API request
  'forecast_run',     // Forecast generation
  'reorder_run',      // Reorder suggestion generation
  'anomaly_run',      // Anomaly detection run
  'population_query', // Population data query
  'health_check',     // Health check
  'validation_error', // Input validation failure
  'access_denied',    // Permission/tenant denial
  'simulation_run',   // Simulation mode operation
  'data_write',       // Data written to DB
  'error'             // Error occurred
];

/**
 * Validate audit event schema
 * @param {object} event - Event object to validate
 * @returns {object} - Validation result { valid: boolean, errors: string[] }
 */
function validateAuditEvent(event) {
  const errors = [];

  if (!event.eventType || !ALLOWED_EVENT_TYPES.includes(event.eventType)) {
    errors.push(`Invalid eventType: ${event.eventType}. Must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}`);
  }

  if (!event.action || typeof event.action !== 'string') {
    errors.push('action is required and must be a string');
  }

  if (event.orgId !== undefined && typeof event.orgId !== 'string') {
    errors.push('orgId must be a string');
  }

  if (event.userId !== undefined && typeof event.userId !== 'string') {
    errors.push('userId must be a string');
  }

  if (event.rowsRead !== undefined && (typeof event.rowsRead !== 'number' || event.rowsRead < 0)) {
    errors.push('rowsRead must be a non-negative number');
  }

  if (event.rowsWritten !== undefined && (typeof event.rowsWritten !== 'number' || event.rowsWritten < 0)) {
    errors.push('rowsWritten must be a non-negative number');
  }

  if (event.durationMs !== undefined && (typeof event.durationMs !== 'number' || event.durationMs < 0)) {
    errors.push('durationMs must be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Log an AI event to ai_ops_breadcrumbs
 *
 * @param {object} db - Database client (must have .query method)
 * @param {object} event - Event object
 * @param {string} event.eventType - Type of event (from ALLOWED_EVENT_TYPES)
 * @param {string} event.action - Action performed (e.g., 'GET /api/ai/forecast')
 * @param {string} [event.orgId] - Organization/tenant ID
 * @param {string} [event.userId] - User ID from JWT
 * @param {string} [event.endpoint] - API endpoint called
 * @param {number} [event.rowsRead] - Number of rows read from DB
 * @param {number} [event.rowsWritten] - Number of rows written to DB
 * @param {number} [event.durationMs] - Operation duration in milliseconds
 * @param {boolean} [event.success=true] - Whether operation succeeded
 * @param {string} [event.errorMessage] - Error message if failed
 * @param {object} [event.metadata] - Additional metadata
 * @returns {Promise<void>}
 */
async function logAiEvent(db, event) {
  // Validate event schema
  const validation = validateAuditEvent(event);
  if (!validation.valid) {
    logger.warn('[AI-AUDIT] Invalid event schema:', validation.errors);
    // Still log it with a warning flag
    event.metadata = {
      ...event.metadata,
      _schemaWarnings: validation.errors
    };
  }

  const {
    eventType,
    action,
    orgId = null,
    userId = null,
    endpoint = null,
    rowsRead = 0,
    rowsWritten = 0,
    durationMs = 0,
    success = true,
    errorMessage = null,
    metadata = {}
  } = event;

  // Construct comprehensive metadata
  const fullMetadata = {
    ...metadata,
    eventType,
    endpoint,
    orgId,
    userId,
    rowsRead,
    rowsWritten,
    mode: AI_ENGINE_MODE,
    errorMessage: success ? null : errorMessage,
    timestamp: new Date().toISOString()
  };

  try {
    await db.query(`
      INSERT INTO ai_ops_breadcrumbs (job, action, ran_at, duration_ms, metadata, success)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)
    `, [
      eventType,
      action,
      durationMs,
      JSON.stringify(fullMetadata),
      success
    ]);

    // Debug logging for development
    if (process.env.AI_AUDIT_DEBUG === 'true') {
      logger.debug('[AI-AUDIT]', {
        eventType,
        action,
        orgId,
        userId,
        success,
        durationMs,
        mode: AI_ENGINE_MODE
      });
    }
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error('[AI-AUDIT] Failed to log event:', error.message);
    logger.error('[AI-AUDIT] Event data:', JSON.stringify(event).substring(0, 500));
  }
}

/**
 * Create an audit context from Express request
 * Extracts tenant, user, and request information
 *
 * @param {object} req - Express request object
 * @returns {object} - Audit context
 */
function createAuditContext(req) {
  return {
    orgId: req.tenant?.tenantId || req.user?.org_id || req.user?.tenant_id || null,
    userId: req.user?.userId || req.user?.id || req.user?.user_id || null,
    endpoint: `${req.method} ${req.originalUrl || req.url}`,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent')
  };
}

/**
 * Express middleware factory for AI endpoint auditing
 * Automatically logs request start and completion
 *
 * @param {string} eventType - Event type for this endpoint
 * @param {string} action - Action description
 * @returns {Function} Express middleware
 */
function auditMiddleware(eventType, action) {
  return async (req, res, next) => {
    const startTime = Date.now();
    const context = createAuditContext(req);

    // Store context for later use
    req.aiAuditContext = {
      ...context,
      eventType,
      action,
      startTime
    };

    // Hook into response finish to log completion
    res.on('finish', async () => {
      const durationMs = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;

      try {
        await logAiEvent(global.db, {
          eventType,
          action,
          ...context,
          durationMs,
          success,
          errorMessage: success ? null : `HTTP ${res.statusCode}`,
          metadata: {
            statusCode: res.statusCode,
            method: req.method,
            path: req.path,
            query: Object.keys(req.query).length > 0 ? req.query : undefined
          }
        });
      } catch (err) {
        logger.error('[AI-AUDIT] Middleware error:', err.message);
      }
    });

    next();
  };
}

/**
 * Log data access metrics
 * Call this after database operations to track data access
 *
 * @param {object} req - Express request with aiAuditContext
 * @param {number} rowsRead - Rows read from database
 * @param {number} rowsWritten - Rows written to database
 */
function trackDataAccess(req, rowsRead = 0, rowsWritten = 0) {
  if (req.aiAuditContext) {
    req.aiAuditContext.rowsRead = (req.aiAuditContext.rowsRead || 0) + rowsRead;
    req.aiAuditContext.rowsWritten = (req.aiAuditContext.rowsWritten || 0) + rowsWritten;
  }
}

/**
 * Check if AI Engine is in production mode
 * @returns {boolean}
 */
function isProductionMode() {
  return AI_ENGINE_MODE === 'production';
}

/**
 * Check if AI Engine is in simulation mode
 * @returns {boolean}
 */
function isSimulationMode() {
  return AI_ENGINE_MODE === 'simulation';
}

/**
 * Get current AI Engine mode
 * @returns {string}
 */
function getMode() {
  return AI_ENGINE_MODE;
}

/**
 * Validate that an operation is allowed in current mode
 *
 * @param {string} operation - Operation type ('write_forecast', 'write_simulation', etc.)
 * @param {string} targetTable - Table being written to
 * @returns {object} - { allowed: boolean, reason: string }
 */
function validateModeOperation(operation, targetTable) {
  // In production mode, only allow writes to specific AI tables
  const PRODUCTION_WRITE_ALLOWED = [
    'ai_ops_breadcrumbs',
    'ai_forecasts',
    'ai_consumption_derived'
  ];

  // In simulation mode, allow writes to simulation tables
  const SIMULATION_WRITE_ALLOWED = [
    ...PRODUCTION_WRITE_ALLOWED,
    'ai_simulation_forecasts',
    'ai_simulation_scenarios'
  ];

  // Never allow writes to core business tables from AI Engine
  const NEVER_WRITE = [
    'inventory_items',
    'item_locations',
    'vendors',
    'population',
    'users',
    'tenants'
  ];

  // Check if table is in the never-write list
  if (NEVER_WRITE.includes(targetTable)) {
    return {
      allowed: false,
      reason: `AI Engine is NEVER allowed to write to ${targetTable} - this is a core business table`
    };
  }

  // Check mode-specific permissions
  if (isProductionMode()) {
    if (!PRODUCTION_WRITE_ALLOWED.includes(targetTable)) {
      return {
        allowed: false,
        reason: `In production mode, AI Engine can only write to: ${PRODUCTION_WRITE_ALLOWED.join(', ')}`
      };
    }
  } else if (isSimulationMode()) {
    if (!SIMULATION_WRITE_ALLOWED.includes(targetTable)) {
      return {
        allowed: false,
        reason: `In simulation mode, AI Engine can only write to: ${SIMULATION_WRITE_ALLOWED.join(', ')}`
      };
    }
  }

  return { allowed: true, reason: 'Operation permitted' };
}

module.exports = {
  // Core logging
  logAiEvent,
  createAuditContext,
  auditMiddleware,
  trackDataAccess,

  // Mode management
  isProductionMode,
  isSimulationMode,
  getMode,
  validateModeOperation,

  // Constants
  AI_ENGINE_MODE,
  ALLOWED_EVENT_TYPES
};
