/**
 * 🛡️ BULLETPROOF INPUT VALIDATION & SANITIZATION
 * Enterprise-grade validation with security hardening
 */

const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');
const { securityLog } = require('../config/logger');

// 🔐 SECURITY PATTERNS
const SECURITY_PATTERNS = {
  SQL_INJECTION: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b|--|;|\/\*|\*\/)/gi,
  XSS: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  HTML_INJECTION: /<[^>]*>/g,
  JAVASCRIPT: /javascript\s*:/gi,
  ONCLICK: /on\w+\s*=/gi,
  EVAL: /eval\s*\(/gi,
  DOCUMENT: /document\./gi,
  WINDOW: /window\./gi
};

// 🚨 DANGEROUS STRINGS
const DANGEROUS_STRINGS = [
  'javascript:',
  'vbscript:',
  'data:text/html',
  '<script',
  '</script>',
  '<iframe',
  '</iframe>',
  'onerror=',
  'onload=',
  'onclick=',
  'eval(',
  'setTimeout(',
  'setInterval(',
  'Function(',
  'constructor',
  'prototype'
];

// 🛡️ ADVANCED SANITIZATION
class BulletproofSanitizer {
  static sanitizeString(value) {
    if (typeof value !== 'string') return value;
    
    let sanitized = value;
    
    // HTML sanitization with DOMPurify
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    // Remove dangerous patterns
    DANGEROUS_STRINGS.forEach(dangerous => {
      const regex = new RegExp(dangerous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      sanitized = sanitized.replace(regex, '');
    });
    
    // Additional security cleaning
    sanitized = sanitized
      .replace(SECURITY_PATTERNS.SQL_INJECTION, '')
      .replace(SECURITY_PATTERNS.XSS, '')
      .replace(SECURITY_PATTERNS.JAVASCRIPT, '')
      .replace(SECURITY_PATTERNS.ONCLICK, '')
      .replace(SECURITY_PATTERNS.EVAL, '')
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Control characters
      .trim();
    
    return sanitized;
  }
  
  static sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = this.sanitizeString(key);
      
      if (Array.isArray(value)) {
        sanitized[cleanKey] = value.map(item => 
          typeof item === 'object' ? this.sanitizeObject(item) : this.sanitizeString(item)
        );
      } else if (value && typeof value === 'object') {
        sanitized[cleanKey] = this.sanitizeObject(value);
      } else {
        sanitized[cleanKey] = this.sanitizeString(value);
      }
    }
    
    return sanitized;
  }
  
  static detectThreats(value) {
    const threats = [];
    
    if (typeof value !== 'string') return threats;
    
    // Check for SQL injection
    if (SECURITY_PATTERNS.SQL_INJECTION.test(value)) {
      threats.push('sql_injection');
    }
    
    // Check for XSS
    if (SECURITY_PATTERNS.XSS.test(value) || SECURITY_PATTERNS.HTML_INJECTION.test(value)) {
      threats.push('xss_attempt');
    }
    
    // Check for dangerous JavaScript
    if (SECURITY_PATTERNS.JAVASCRIPT.test(value) || SECURITY_PATTERNS.EVAL.test(value)) {
      threats.push('javascript_injection');
    }
    
    // Check for dangerous strings
    DANGEROUS_STRINGS.forEach(dangerous => {
      if (value.toLowerCase().includes(dangerous.toLowerCase())) {
        threats.push(`dangerous_string_${dangerous.replace(/[^a-z0-9]/gi, '_')}`);
      }
    });
    
    return threats;
  }
}

// 🔍 VALIDATION ERROR HANDLER
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array();
    
    // Log validation failures for security monitoring
    securityLog('validation_failed', 'medium', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      errors: errorDetails,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || null
    }, req);
    
    return res.status(400).json({
      error: 'Input validation failed',
      code: 'VALIDATION_ERROR',
      details: errorDetails.map(err => ({
        field: err.path,
        message: err.msg,
        value: typeof err.value === 'string' && err.value.length > 50 
          ? '[TRUNCATED]' : err.value
      })),
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// 🛡️ COMPREHENSIVE INPUT SANITIZATION
const comprehensiveSanitization = (req, res, next) => {
  const startTime = Date.now();
  const threats = [];
  
  // Sanitize request body
  if (req.body) {
    // Detect threats before sanitization
    const bodyThreats = BulletproofSanitizer.detectThreats(JSON.stringify(req.body));
    threats.push(...bodyThreats);
    
    req.body = BulletproofSanitizer.sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    const queryThreats = BulletproofSanitizer.detectThreats(JSON.stringify(req.query));
    threats.push(...queryThreats);
    
    req.query = BulletproofSanitizer.sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters
  if (req.params) {
    const paramThreats = BulletproofSanitizer.detectThreats(JSON.stringify(req.params));
    threats.push(...paramThreats);
    
    req.params = BulletproofSanitizer.sanitizeObject(req.params);
  }
  
  // Log and block if threats detected
  if (threats.length > 0) {
    securityLog('input_threats_detected', 'high', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      threats: [...new Set(threats)], // Remove duplicates
      userAgent: req.get('user-agent'),
      processingTime: Date.now() - startTime,
      userId: req.user?.id || null
    }, req);
    
    // Block request if too many threats
    if (threats.length >= 3) {
      return res.status(400).json({
        error: 'Request blocked due to security threats',
        code: 'SECURITY_THREAT_DETECTED',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// 🔐 CUSTOM VALIDATORS
const customValidators = {
  // Safe string validator
  isSafeString: (value) => {
    if (!value || typeof value !== 'string') return false;
    
    const threats = BulletproofSanitizer.detectThreats(value);
    return threats.length === 0;
  },
  
  // Safe identifier (alphanumeric + underscore/dash)
  isSafeIdentifier: (value) => {
    return /^[a-zA-Z0-9_-]+$/.test(value);
  },
  
  // Safe filename
  isSafeFilename: (value) => {
    return /^[a-zA-Z0-9._-]+$/.test(value) && !value.includes('..');
  },
  
  // Inventory-specific validators
  isValidCategory: (value) => {
    const validCategories = ['Dairy', 'Meat', 'Produce', 'Pantry', 'Frozen', 'Beverages', 'Cleaning', 'Other'];
    return validCategories.includes(value);
  },
  
  isValidUnit: (value) => {
    const validUnits = ['kg', 'lb', 'g', 'oz', 'L', 'mL', 'EA', 'pkg', 'box', 'case'];
    return validUnits.includes(value);
  }
};

// 📝 VALIDATION RULES LIBRARY
const ValidationRules = {
  // User validation
  userEmail: body('email')
    .isEmail()
    .normalizeEmail()
    .custom(customValidators.isSafeString)
    .withMessage('Valid, safe email is required'),
  
  userPassword: body('password')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .custom(customValidators.isSafeString)
    .withMessage('Password must be 8-128 chars with uppercase, lowercase, number, and special character'),
  
  userName: body(['firstName', 'lastName'])
    .trim()
    .isLength({ min: 1, max: 50 })
    .isAlpha('en-US', { ignore: ' -' })
    .custom(customValidators.isSafeString)
    .withMessage('Name must be 1-50 characters, letters only'),
  
  // Inventory validation
  itemName: body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .custom(customValidators.isSafeString)
    .withMessage('Item name must be 1-100 safe characters'),
  
  itemCategory: body('category')
    .trim()
    .custom(customValidators.isValidCategory)
    .withMessage('Invalid category selected'),
  
  itemQuantity: body('quantity')
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Quantity must be between 0 and 999,999'),
  
  itemUnit: body('unit')
    .custom(customValidators.isValidUnit)
    .withMessage('Invalid unit specified'),
  
  itemPrice: body('unitPrice')
    .optional()
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Price must be between 0 and 999,999'),
  
  locationId: body('location')
    .custom(customValidators.isSafeIdentifier)
    .withMessage('Invalid location identifier'),
  
  // Parameter validation
  safeId: param('id')
    .custom(customValidators.isSafeIdentifier)
    .withMessage('Invalid ID format'),
  
  // Query validation
  safeQuery: query(['category', 'location', 'search'])
    .optional()
    .custom(customValidators.isSafeString)
    .withMessage('Invalid query parameter'),
  
  paginationQuery: query(['page', 'limit'])
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Invalid pagination parameter'),
  
  // Transfer validation
  transferValidation: [
    body('itemId').custom(customValidators.isSafeIdentifier),
    body('fromLocation').custom(customValidators.isSafeIdentifier),
    body('toLocation').custom(customValidators.isSafeIdentifier),
    body('quantity').isFloat({ min: 0.01, max: 999999 }),
    body('reason').optional().isLength({ max: 500 }).custom(customValidators.isSafeString)
  ]
};

// 🔒 FILE UPLOAD VALIDATION
const fileUploadValidation = (req, res, next) => {
  if (!req.file) return next();
  
  const { originalname, mimetype, size } = req.file;
  
  // Validate filename
  if (!customValidators.isSafeFilename(originalname)) {
    return res.status(400).json({
      error: 'Invalid filename',
      code: 'INVALID_FILENAME'
    });
  }
  
  // Validate MIME type
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/csv'];
  if (!allowedTypes.includes(mimetype)) {
    return res.status(400).json({
      error: 'File type not allowed',
      code: 'INVALID_FILE_TYPE',
      allowed: allowedTypes
    });
  }
  
  // Validate size (10MB max)
  if (size > 10 * 1024 * 1024) {
    return res.status(400).json({
      error: 'File too large (max 10MB)',
      code: 'FILE_TOO_LARGE'
    });
  }
  
  next();
};

module.exports = {
  BulletproofSanitizer,
  handleValidationErrors,
  comprehensiveSanitization,
  customValidators,
  ValidationRules,
  fileUploadValidation,
  SECURITY_PATTERNS,
  DANGEROUS_STRINGS
};