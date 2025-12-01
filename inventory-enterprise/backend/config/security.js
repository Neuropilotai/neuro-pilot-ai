const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Security configuration for enterprise deployment
const securityConfig = {
  // Helmet configuration for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),

  // Rate limiting configuration
  rateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  }),

  // Stricter rate limiting for auth endpoints
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit auth attempts
    message: {
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Speed limiter to slow down repeated requests
  speedLimiter: slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // Allow 50 requests at full speed
    delayMs: () => 500 // Add 500ms delay after delayAfter is reached
  }),

  // CORS configuration
  // V22.3: Canonical domains - neuropilot.dev
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = [
        // Canonical production domains
        'https://api.neuropilot.dev',
        'https://app.neuropilot.dev',
        'https://neuropilot.dev',
        'https://www.neuropilot.dev',
        // Legacy Railway/Vercel (migration period)
        'https://inventory-backend-production-3a2c.up.railway.app',
        'https://neuropilot-frontend.vercel.app',
        // Local development
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5500',
        'http://localhost:8080'
      ];

      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Org-Id', 'X-Site-Id', 'X-Tenant-Id']
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
    expiresIn: '24h', // Extended from 15m for better UX
    refreshExpiresIn: '7d',
    algorithm: 'HS256',
    issuer: 'neuro-pilot-inventory',
    audience: 'inventory-users'
  },

  // Password requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAttempts: 5,
    lockoutTime: 30 * 60 * 1000 // 30 minutes
  },

  // Session configuration
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    rolling: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  },

  // Audit logging configuration
  audit: {
    logLevel: process.env.LOG_LEVEL || 'info',
    logRetention: 90, // days
    sensitiveFields: ['password', 'token', 'secret'],
    trackActions: [
      'login',
      'logout',
      'inventory_add',
      'inventory_update',
      'inventory_delete',
      'inventory_transfer',
      'order_create',
      'order_update',
      'user_create',
      'user_update',
      'role_change'
    ]
  }
};

module.exports = securityConfig;