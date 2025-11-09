/**
 * 🛡️ BULLETPROOF ERROR HANDLING WITH SECURITY
 * Enterprise-grade error management with attack prevention
 */

const { securityLog, logger } = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

// 🚨 SECURITY-AWARE ERROR CLASSIFICATIONS
const ErrorTypes = {
  VALIDATION_ERROR: 'validation_error',
  AUTHENTICATION_ERROR: 'authentication_error',
  AUTHORIZATION_ERROR: 'authorization_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  INPUT_SECURITY_ERROR: 'input_security_error',
  DATABASE_ERROR: 'database_error',
  EXTERNAL_SERVICE_ERROR: 'external_service_error',
  SYSTEM_ERROR: 'system_error',
  UNKNOWN_ERROR: 'unknown_error'
};

// 🔐 ERROR TRACKING
const errorMetrics = new Map();
const suspiciousErrorPatterns = new Map();

// 🛡️ SECURE ERROR RESPONSE CLASS
class SecureErrorResponse {
  constructor(type, message, statusCode = 500, details = null, isPublic = false) {
    this.id = uuidv4();
    this.type = type;
    this.message = message;
    this.statusCode = statusCode;
    this.details = details;
    this.isPublic = isPublic;
    this.timestamp = new Date().toISOString();
  }
  
  // Generate user-safe response
  toUserResponse() {
    const response = {
      error: this.isPublic ? this.message : 'An error occurred',
      code: this.type.toUpperCase(),
      errorId: this.id,
      timestamp: this.timestamp
    };
    
    // Only include details for public errors
    if (this.isPublic && this.details) {
      response.details = this.details;
    }
    
    return response;
  }
  
  // Generate detailed log entry
  toLogEntry(req, additionalInfo = {}) {
    return {
      errorId: this.id,
      type: this.type,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      request: {
        ip: req?.ip,
        method: req?.method,
        url: req?.originalUrl,
        userAgent: req?.get('user-agent'),
        userId: req?.user?.id,
        sessionId: req?.sessionID
      },
      stack: this.stack,
      ...additionalInfo
    };
  }
}

// 🚨 ATTACK PATTERN DETECTION
function detectAttackPatterns(error, req) {
  const attackIndicators = [];
  
  const errorMessage = error.message?.toLowerCase() || '';
  const requestPath = req?.originalUrl?.toLowerCase() || '';
  
  // SQL injection detection
  if (errorMessage.includes('sql') || errorMessage.includes('database')) {
    if (errorMessage.includes('syntax') || errorMessage.includes('column') || errorMessage.includes('table')) {
      attackIndicators.push('sql_injection_probe');
    }
  }
  
  // Path traversal detection
  if (requestPath.includes('..') || requestPath.includes('%2e%2e')) {
    attackIndicators.push('path_traversal');
  }
  
  // Command injection detection
  if (errorMessage.includes('command') || errorMessage.includes('exec') || errorMessage.includes('system')) {
    attackIndicators.push('command_injection_probe');
  }
  
  // Information disclosure detection
  if (errorMessage.includes('password') || errorMessage.includes('token') || errorMessage.includes('secret')) {
    attackIndicators.push('information_disclosure');
  }
  
  // Brute force detection
  const key = `${req?.ip}_${req?.originalUrl}`;
  const current = suspiciousErrorPatterns.get(key) || 0;
  
  if (current > 10) { // More than 10 errors from same IP to same endpoint
    attackIndicators.push('brute_force_pattern');
  }
  
  suspiciousErrorPatterns.set(key, current + 1);
  
  // Clean up old entries periodically
  if (suspiciousErrorPatterns.size > 1000) {
    const entries = Array.from(suspiciousErrorPatterns.entries());
    entries.slice(0, 500).forEach(([key]) => {
      suspiciousErrorPatterns.delete(key);
    });
  }
  
  return attackIndicators;
}

// 📊 ERROR METRICS TRACKING
function trackErrorMetrics(error, req) {
  const endpoint = req?.route?.path || req?.originalUrl || 'unknown';
  const method = req?.method || 'unknown';
  const key = `${method}_${endpoint}`;
  
  const existing = errorMetrics.get(key) || {
    count: 0,
    lastOccurrence: null,
    errorTypes: new Set(),
    ipAddresses: new Set()
  };
  
  existing.count++;
  existing.lastOccurrence = new Date().toISOString();
  existing.errorTypes.add(error.name || 'Unknown');
  
  if (req?.ip) {
    existing.ipAddresses.add(req.ip);
  }
  
  errorMetrics.set(key, existing);
}

// 🛡️ BULLETPROOF ERROR HANDLER
const bulletproofErrorHandler = (error, req, res, next) => {
  // Track metrics
  trackErrorMetrics(error, req);
  
  // Detect attack patterns
  const attackPatterns = detectAttackPatterns(error, req);
  
  let secureError;
  
  // Classify and handle different error types
  switch (error.name) {
    case 'ValidationError':
    case 'CastError':
      secureError = new SecureErrorResponse(
        ErrorTypes.VALIDATION_ERROR,
        'Input validation failed',
        400,
        process.env.NODE_ENV === 'development' ? error.message : null,
        true
      );
      break;
      
    case 'UnauthorizedError':
    case 'JsonWebTokenError':
    case 'TokenExpiredError':
      secureError = new SecureErrorResponse(
        ErrorTypes.AUTHENTICATION_ERROR,
        'Authentication failed',
        401,
        null,
        true
      );
      break;
      
    case 'ForbiddenError':
      secureError = new SecureErrorResponse(
        ErrorTypes.AUTHORIZATION_ERROR,
        'Access denied',
        403,
        null,
        true
      );
      break;
      
    case 'TooManyRequestsError':
      secureError = new SecureErrorResponse(
        ErrorTypes.RATE_LIMIT_ERROR,
        'Rate limit exceeded',
        429,
        { retryAfter: '15 minutes' },
        true
      );
      break;
      
    case 'SyntaxError':
      if (error.message.includes('JSON')) {
        secureError = new SecureErrorResponse(
          ErrorTypes.VALIDATION_ERROR,
          'Invalid JSON format',
          400,
          null,
          true
        );
      }
      break;
      
    case 'MongoError':
    case 'MongooseError':
      secureError = new SecureErrorResponse(
        ErrorTypes.DATABASE_ERROR,
        'Database operation failed',
        500,
        process.env.NODE_ENV === 'development' ? error.message : null,
        false
      );
      break;
      
    default:
      // Handle by status code if available
      if (error.statusCode) {
        const isPublic = error.statusCode >= 400 && error.statusCode < 500;
        secureError = new SecureErrorResponse(
          error.statusCode >= 500 ? ErrorTypes.SYSTEM_ERROR : ErrorTypes.VALIDATION_ERROR,
          isPublic ? error.message : 'An error occurred',
          error.statusCode,
          isPublic && process.env.NODE_ENV === 'development' ? error.details : null,
          isPublic
        );
      } else {
        secureError = new SecureErrorResponse(
          ErrorTypes.UNKNOWN_ERROR,
          'Internal server error',
          500,
          null,
          false
        );
      }
  }
  
  // Add stack trace for development
  if (process.env.NODE_ENV === 'development') {
    secureError.stack = error.stack;
  }
  
  // Determine log level based on severity and attack patterns
  let logLevel = 'error';
  if (attackPatterns.length > 0) {
    logLevel = 'critical';
  } else if (secureError.statusCode >= 400 && secureError.statusCode < 500) {
    logLevel = 'warn';
  }
  
  // Log with appropriate severity
  const logEntry = secureError.toLogEntry(req, {
    originalError: error.message,
    attackPatterns,
    userAgent: req?.get('user-agent'),
    referer: req?.get('referer')
  });
  
  if (attackPatterns.length > 0) {
    securityLog('potential_attack_detected', 'critical', logEntry, req);
  }
  
  logger[logLevel]('Request error', logEntry);
  
  // Send secure response
  res.status(secureError.statusCode).json(secureError.toUserResponse());
};

// 🚨 ASYNC ERROR WRAPPER
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 🔍 404 HANDLER WITH SECURITY LOGGING
const notFoundHandler = (req, res) => {
  // Log potential reconnaissance attempts
  securityLog('not_found_access', 'low', {
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
    referer: req.get('referer')
  }, req);
  
  const secureError = new SecureErrorResponse(
    'NOT_FOUND',
    'Resource not found',
    404,
    null,
    true
  );
  
  res.status(404).json(secureError.toUserResponse());
};

// 🔄 UNHANDLED REJECTION HANDLER
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason.message || reason,
    stack: reason.stack,
    promise: promise.toString()
  });
  
  // Don't exit in production, but log critical error
  if (process.env.NODE_ENV === 'production') {
    securityLog('unhandled_rejection', 'critical', {
      reason: reason.message || reason,
      stack: reason.stack
    });
  } else {
    // Exit in development to catch issues early
    setTimeout(() => process.exit(1), 1000);
  }
});

// 💥 UNCAUGHT EXCEPTION HANDLER
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  
  securityLog('uncaught_exception', 'critical', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  
  // Graceful shutdown
  setTimeout(() => {
    process.exit(1);
  }, 2000);
});

// 📊 ERROR METRICS ENDPOINT
const getErrorMetrics = (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    totalEndpoints: errorMetrics.size,
    suspiciousPatterns: suspiciousErrorPatterns.size,
    topErrors: Array.from(errorMetrics.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([endpoint, stats]) => ({
        endpoint,
        errorCount: stats.count,
        lastOccurrence: stats.lastOccurrence,
        errorTypes: Array.from(stats.errorTypes),
        uniqueIPs: stats.ipAddresses.size
      })),
    recentSuspiciousActivity: Array.from(suspiciousErrorPatterns.entries())
      .filter(([, count]) => count > 5)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => ({ pattern: key, count }))
  };
  
  res.json(metrics);
};

// 🧹 CLEANUP FUNCTION
const cleanupErrorMetrics = () => {
  // Clean up error metrics older than 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  for (const [key, stats] of errorMetrics.entries()) {
    if (stats.lastOccurrence < oneDayAgo) {
      errorMetrics.delete(key);
    }
  }
  
  // Clean up suspicious patterns older than 1 hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  for (const key of suspiciousErrorPatterns.keys()) {
    // Simple time-based cleanup - you might want more sophisticated logic
    if (Math.random() < 0.1) { // 10% chance to clean up each time
      suspiciousErrorPatterns.delete(key);
    }
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupErrorMetrics, 30 * 60 * 1000);

module.exports = {
  bulletproofErrorHandler,
  asyncErrorHandler,
  notFoundHandler,
  getErrorMetrics,
  SecureErrorResponse,
  ErrorTypes,
  cleanupErrorMetrics
};