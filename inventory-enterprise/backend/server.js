require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

// Security and middleware imports
const securityConfig = require('./config/security');
const { logger, requestLogger, auditLog, securityLog } = require('./config/logger');
const { authenticateToken } = require('./middleware/auth');

// Route imports
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(securityConfig.helmet);
app.use(cors(securityConfig.cors));
app.use(securityConfig.speedLimiter);
app.use(securityConfig.rateLimiter);

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (NODE_ENV === 'production') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  }));
} else {
  app.use(morgan('dev'));
}

app.use(requestLogger);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    memory: process.memoryUsage(),
    pid: process.pid
  };
  
  res.status(200).json(healthCheck);
});

// API routes
app.use('/api/auth', securityConfig.authRateLimiter, authRoutes);
app.use('/api/inventory', authenticateToken, inventoryRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Inventory Enterprise API',
    version: '1.0.0',
    description: 'Enterprise-grade inventory management system',
    endpoints: {
      auth: {
        'POST /api/auth/login': 'User authentication',
        'POST /api/auth/register': 'User registration', 
        'POST /api/auth/refresh': 'Refresh access token',
        'POST /api/auth/logout': 'User logout',
        'GET /api/auth/me': 'Get current user info'
      },
      inventory: {
        'GET /api/inventory/items': 'Get all inventory items',
        'POST /api/inventory/items': 'Create new inventory item',
        'PUT /api/inventory/items/:id': 'Update inventory item',
        'DELETE /api/inventory/items/:id': 'Delete inventory item',
        'POST /api/inventory/transfer': 'Transfer items between locations',
        'GET /api/inventory/locations': 'Get storage locations',
        'GET /api/inventory/reports': 'Get inventory reports'
      },
      users: {
        'GET /api/users': 'Get all users (admin only)',
        'POST /api/users': 'Create new user (admin only)',
        'PUT /api/users/:id': 'Update user (admin only)',
        'DELETE /api/users/:id': 'Delete user (admin only)'
      }
    },
    security: {
      authentication: 'JWT Bearer tokens',
      authorization: 'Role-based access control (RBAC)',
      roles: ['admin', 'manager', 'staff', 'viewer'],
      rateLimit: '100 requests per 15 minutes',
      authLimit: '5 requests per 15 minutes'
    }
  });
});

// Serve static files in production
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// 404 handler
app.use('*', (req, res) => {
  securityLog('404_not_found', 'low', { 
    path: req.originalUrl,
    method: req.method 
  }, req);

  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid API endpoint`,
    code: 'ENDPOINT_NOT_FOUND',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  // Security logging for errors
  securityLog('application_error', 'high', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method
  }, req);

  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user ? req.user.id : null,
    ip: req.ip
  });

  // Don't expose internal errors in production
  const isDevelopment = NODE_ENV !== 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    stack: isDevelopment ? error.stack : undefined
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Enterprise Inventory API started`, {
    port: PORT,
    environment: NODE_ENV,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });

  // Log security configuration
  auditLog('server_startup', {
    port: PORT,
    environment: NODE_ENV,
    securityFeatures: [
      'JWT Authentication',
      'Role-based Access Control',
      'Rate Limiting',
      'CORS Protection',
      'Security Headers',
      'Audit Logging',
      'Request Compression'
    ]
  });

  console.log(`
🏢 Enterprise Inventory Management System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server: http://localhost:${PORT}
📚 API Docs: http://localhost:${PORT}/api
🏥 Health: http://localhost:${PORT}/health
🔐 Environment: ${NODE_ENV}
📊 Logging: ${process.env.LOG_LEVEL || 'info'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 Default Admin Credentials:
   Email: admin@neuro-pilot.ai
   Password: Admin123!@#
   
⚠️  Change default credentials in production!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

module.exports = app;