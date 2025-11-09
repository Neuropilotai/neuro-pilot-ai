/**
 * 🛡️ BULLETPROOF ENTERPRISE SECURITY MIDDLEWARE
 * Multi-layered security protection for inventory system
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const { body, param, query, validationResult } = require('express-validator');
const { securityLog, auditLog } = require('../config/logger');

// 🔒 SECURITY MONITORING
const securityEvents = new Map();
const suspiciousIPs = new Set();
const failedAttempts = new Map();

// 🛡️ BULLETPROOF RATE LIMITING
const createAdvancedRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: options.window || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (req) => {
      // Include user ID if authenticated to prevent abuse
      const baseKey = req.ip;
      const userKey = req.user ? `_user_${req.user.id}` : '';
      return `${baseKey}${userKey}`;
    },
    handler: (req, res) => {
      const clientInfo = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        userId: req.user?.id || null
      };

      securityLog('rate_limit_exceeded', 'high', clientInfo, req);
      
      // Track suspicious activity
      trackSuspiciousActivity(req.ip, 'rate_limit_exceeded');
      
      res.status(429).json({
        error: 'Too many requests - rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(options.window / 1000 / 60),
        timestamp: new Date().toISOString()
      });
    },
    onLimitReached: (req, res, options) => {
      securityLog('rate_limit_reached', 'medium', {
        ip: req.ip,
        endpoint: req.path,
        limit: options.max
      }, req);
    }
  });
};

// 🚨 AGGRESSIVE AUTH PROTECTION
const authRateLimit = createAdvancedRateLimit({
  window: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict for auth endpoints
});

// 🛡️ API PROTECTION
const apiRateLimit = createAdvancedRateLimit({
  window: 15 * 60 * 1000,
  max: 200, // Higher limit for authenticated API usage
});

// 🐌 PROGRESSIVE SLOWDOWN
const progressiveSlowDown = slowDown({
  windowMs: 10 * 60 * 1000, // 10 minutes
  delayAfter: 50,
  delayMs: 200,
  maxDelayMs: 5000,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => `${req.ip}_slowdown`,
  onLimitReached: (req, res, options) => {
    securityLog('progressive_slowdown_activated', 'medium', {
      ip: req.ip,
      endpoint: req.path,
      delayMs: options.delayMs
    }, req);
  }
});

// 🔍 SUSPICIOUS ACTIVITY TRACKER
function trackSuspiciousActivity(ip, activity) {
  const key = `${ip}_${activity}`;
  const current = failedAttempts.get(key) || 0;
  failedAttempts.set(key, current + 1);
  
  // Auto-block after threshold
  if (current + 1 >= 10) {
    suspiciousIPs.add(ip);
    securityLog('ip_auto_blocked', 'critical', {
      ip,
      activity,
      attemptCount: current + 1
    });
    
    // Clear after 1 hour
    setTimeout(() => {
      suspiciousIPs.delete(ip);
      failedAttempts.delete(key);
    }, 60 * 60 * 1000);
  }
}

// 🚫 SUSPICIOUS IP BLOCKER
const suspiciousIPBlocker = (req, res, next) => {
  if (suspiciousIPs.has(req.ip)) {
    securityLog('blocked_ip_attempt', 'critical', {
      ip: req.ip,
      endpoint: req.path,
      userAgent: req.get('user-agent')
    }, req);
    
    return res.status(403).json({
      error: 'Access denied - suspicious activity detected',
      code: 'IP_BLOCKED',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// 🔐 ADVANCED HELMET CONFIGURATION
const advancedHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// 🛡️ INPUT SANITIZATION
const sanitizeInput = (req, res, next) => {
  // Remove potential XSS patterns
  const cleanValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    return value;
  };

  // Clean all string inputs
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      req.body[key] = cleanValue(req.body[key]);
    }
  }

  if (req.query && typeof req.query === 'object') {
    for (const key in req.query) {
      req.query[key] = cleanValue(req.query[key]);
    }
  }

  next();
};

// 🔍 REQUEST ANALYSIS
const analyzeRequest = (req, res, next) => {
  const suspicious = [];
  
  // Check for common attack patterns
  const userAgent = req.get('user-agent') || '';
  const referer = req.get('referer') || '';
  
  // Bot detection
  if (userAgent.match(/(bot|crawler|spider|scraper)/i)) {
    suspicious.push('bot_user_agent');
  }
  
  // SQL injection patterns
  const sqlPatterns = ['union', 'select', 'drop', 'insert', 'update', 'delete', '--', ';'];
  const requestData = JSON.stringify({ ...req.body, ...req.query }).toLowerCase();
  
  sqlPatterns.forEach(pattern => {
    if (requestData.includes(pattern)) {
      suspicious.push(`sql_injection_${pattern}`);
    }
  });
  
  // XSS patterns
  if (requestData.includes('<script') || requestData.includes('javascript:')) {
    suspicious.push('xss_attempt');
  }
  
  if (suspicious.length > 0) {
    securityLog('suspicious_request', 'high', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      userAgent,
      suspiciousPatterns: suspicious,
      requestData: process.env.NODE_ENV === 'development' ? { body: req.body, query: req.query } : '[REDACTED]'
    }, req);
    
    suspicious.forEach(pattern => {
      trackSuspiciousActivity(req.ip, pattern);
    });
  }
  
  next();
};

// 🚨 CRITICAL ENDPOINT PROTECTION
const criticalEndpointProtection = (req, res, next) => {
  const criticalEndpoints = ['/api/auth/', '/api/admin/', '/backup/', '/config/'];
  
  const isCritical = criticalEndpoints.some(endpoint => 
    req.path.startsWith(endpoint)
  );
  
  if (isCritical) {
    securityLog('critical_endpoint_access', 'high', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || null
    }, req);
  }
  
  next();
};

// 📊 SECURITY METRICS COLLECTOR
const securityMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const key = `${req.method}_${req.path.split('/')[1] || 'root'}`;
    
    const existing = securityEvents.get(key) || { count: 0, totalDuration: 0, errors: 0 };
    existing.count++;
    existing.totalDuration += duration;
    
    if (res.statusCode >= 400) {
      existing.errors++;
    }
    
    securityEvents.set(key, existing);
  });
  
  next();
};

// 🔧 SECURITY HEADERS ENHANCER
const enhancedSecurityHeaders = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Custom security identifier
  res.setHeader('X-Security-Level', 'enterprise-bulletproof');
  
  next();
};

// 📈 SECURITY METRICS ENDPOINT
const getSecurityMetrics = (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    suspiciousIPs: suspiciousIPs.size,
    failedAttempts: failedAttempts.size,
    endpointMetrics: Object.fromEntries(securityEvents),
    recentEvents: Array.from(securityEvents.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([endpoint, stats]) => ({
        endpoint,
        requests: stats.count,
        avgDuration: Math.round(stats.totalDuration / stats.count),
        errorRate: ((stats.errors / stats.count) * 100).toFixed(2) + '%'
      }))
  };
  
  res.json(metrics);
};

module.exports = {
  // Rate limiting
  authRateLimit,
  apiRateLimit,
  progressiveSlowDown,
  
  // Security middleware
  advancedHelmet,
  suspiciousIPBlocker,
  sanitizeInput,
  analyzeRequest,
  criticalEndpointProtection,
  securityMetrics,
  enhancedSecurityHeaders,
  
  // Utilities
  trackSuspiciousActivity,
  getSecurityMetrics,
  createAdvancedRateLimit
};