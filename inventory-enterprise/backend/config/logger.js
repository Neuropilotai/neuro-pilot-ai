const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    });
  })
);

// Create logs directory if it doesn't exist (skip in Railway/containerized environments)
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');

// Try to create logs directory, but don't fail if we can't (e.g., in Railway containers)
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.warn('[Logger] Could not create logs directory (this is normal in containerized environments):', err.message);
}

// Determine if we're in a containerized/Railway environment
// In these environments, file logging may not work or logs are ephemeral
const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
const useFileLogging = !isRailway && fs.existsSync(logsDir);

// Create Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'inventory-enterprise'
  },
  exitOnError: false, // Don't exit on unhandled errors - let the app handle them
  transports: useFileLogging ? [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),

    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    }),

    // Security/audit logs
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ] : [], // No file logging in Railway - use console only

  // Handle exceptions
  exceptionHandlers: useFileLogging ? [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ] : [],

  // Handle rejections
  rejectionHandlers: useFileLogging ? [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ] : []
});

// Add console logging (always enabled for Railway/containerized deployments)
// In Railway, we need console output since file logs are ephemeral
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ?
        ` ${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${level}]: ${message}${metaString}`;
    })
  )
}));

// Audit logging for security events
const auditLog = (event, details, req = null) => {
  const auditEntry = {
    event,
    timestamp: new Date().toISOString(),
    details,
    ip: req ? req.ip : null,
    userAgent: req ? req.get('user-agent') : null,
    userId: req && req.user ? req.user.id : null,
    sessionId: req && req.session ? req.session.id : null
  };

  logger.warn(`AUDIT: ${event}`, auditEntry);
};

// Security logging helper
const securityLog = (event, severity, details, req = null) => {
  const securityEntry = {
    type: 'security',
    event,
    severity, // low, medium, high, critical
    timestamp: new Date().toISOString(),
    details,
    ip: req ? req.ip : null,
    userAgent: req ? req.get('user-agent') : null,
    userId: req && req.user ? req.user.id : null
  };

  const logLevel = severity === 'critical' ? 'error' : 'warn';
  logger[logLevel](`SECURITY[${severity.toUpperCase()}]: ${event}`, securityEntry);
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user ? req.user.id : null,
      contentLength: res.get('content-length') || 0
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

// Performance monitoring
const performanceLog = (operation, duration, metadata = {}) => {
  logger.info('Performance metric', {
    type: 'performance',
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Database operation logging
const dbLog = (operation, table, details = {}) => {
  logger.info('Database operation', {
    type: 'database',
    operation,
    table,
    ...details
  });
};

module.exports = {
  logger,
  auditLog,
  securityLog,
  requestLogger,
  performanceLog,
  dbLog
};