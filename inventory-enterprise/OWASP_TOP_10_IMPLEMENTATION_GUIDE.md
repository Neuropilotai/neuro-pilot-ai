# OWASP Top 10 2021 - Implementation Guide
## NeuroPilot Inventory Enterprise API Security Hardening

**Document Version:** 1.0
**Author:** AppSec Engineering Team
**Date:** 2025-10-28
**Status:** APPROVED FOR IMPLEMENTATION

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [A01:2021 - Broken Access Control](#a012021---broken-access-control)
3. [A02:2021 - Cryptographic Failures](#a022021---cryptographic-failures)
4. [A03:2021 - Injection](#a032021---injection)
5. [A04:2021 - Insecure Design](#a042021---insecure-design)
6. [A05:2021 - Security Misconfiguration](#a052021---security-misconfiguration)
7. [A06:2021 - Vulnerable Components](#a062021---vulnerable-components)
8. [A07:2021 - Identification & Authentication Failures](#a072021---identification--authentication-failures)
9. [A08:2021 - Software & Data Integrity Failures](#a082021---software--data-integrity-failures)
10. [A09:2021 - Security Logging & Monitoring](#a092021---security-logging--monitoring)
11. [A10:2021 - Server-Side Request Forgery (SSRF)](#a102021---server-side-request-forgery-ssrf)
12. [Security Testing Pipeline](#security-testing-pipeline)
13. [Incident Response Playbooks](#incident-response-playbooks)
14. [Key Rotation Procedures](#key-rotation-procedures)

---

## 1. Executive Summary

**Objective:** Implement comprehensive OWASP Top 10 (2021) coverage for NeuroPilot Inventory Enterprise API to achieve production-grade security posture.

**Current State Assessment:**
- ✅ Basic JWT authentication implemented
- ✅ CORS configured (strict origins)
- ⚠️ Input validation incomplete (not all endpoints)
- ⚠️ Rate limiting missing on several endpoints
- ❌ No refresh token mechanism
- ❌ Audit logging incomplete
- ❌ Security testing not automated

**Target State:**
- 100% OWASP Top 10 coverage with automated verification
- Defense-in-depth approach with multiple security layers
- Automated security testing in CI/CD pipeline
- Comprehensive audit trail with tamper detection
- Documented incident response procedures

**Implementation Timeline:** 4 weeks
- Week 1: Input validation, rate limiting, secure headers
- Week 2: JWT refresh tokens, RBAC improvements, audit logging
- Week 3: Security testing automation (ZAP/Burp), SCA integration
- Week 4: Incident response procedures, documentation, training

---

## 2. A01:2021 - Broken Access Control

### 2.1 Problem Statement

Access control enforces policy such that users cannot act outside of their intended permissions. Failures typically lead to unauthorized information disclosure, modification, or destruction.

**Common Vulnerabilities:**
- Missing authorization checks on routes
- Insecure direct object references (IDOR)
- Horizontal privilege escalation (accessing other users' data)
- Vertical privilege escalation (staff acting as admin)

### 2.2 Implementation: Role-Based Access Control (RBAC)

#### Define Permission Matrix

```javascript
// src/auth/permissions.js

const PERMISSIONS = {
  // Inventory operations
  'inventory:read': ['admin', 'manager', 'staff', 'readonly'],
  'inventory:create': ['admin', 'manager', 'staff'],
  'inventory:update': ['admin', 'manager', 'staff'],
  'inventory:delete': ['admin', 'manager'],

  // Order operations
  'orders:read': ['admin', 'manager', 'staff', 'readonly'],
  'orders:create': ['admin', 'manager', 'staff'],
  'orders:approve': ['admin', 'manager'],
  'orders:delete': ['admin'],

  // Forecast operations
  'forecast:read': ['admin', 'manager', 'staff', 'readonly'],
  'forecast:generate': ['admin', 'manager', 'staff'],
  'forecast:approve_recommendation': ['admin', 'manager'],
  'forecast:retrain': ['admin'],

  // User management
  'users:read': ['admin', 'manager'],
  'users:create': ['admin'],
  'users:update': ['admin'],
  'users:delete': ['admin'],

  // System operations
  'system:health': ['admin', 'manager', 'staff', 'readonly'],
  'system:logs': ['admin'],
  'system:config': ['admin'],
};

module.exports = { PERMISSIONS };
```

#### Authorization Middleware

```javascript
// src/middleware/authorization.js

const { PERMISSIONS } = require('../auth/permissions');

/**
 * Check if user has required permission
 * @param {string} permission - Permission name (e.g., 'inventory:update')
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // Ensure user is authenticated first
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = PERMISSIONS[permission];

    if (!allowedRoles) {
      console.error(`[AuthZ] Unknown permission: ${permission}`);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Invalid permission configuration'
      });
    }

    if (!allowedRoles.includes(userRole)) {
      console.warn(
        `[AuthZ] User ${req.user.id} (${userRole}) denied ${permission}`
      );

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    // Log authorization success
    req.auditLog = req.auditLog || {};
    req.auditLog.permission = permission;
    req.auditLog.authorized = true;

    next();
  };
}

/**
 * Check if user can access specific resource (IDOR prevention)
 * @param {Function} resourceOwnerChecker - Async function returning true if user owns resource
 */
function requireResourceOwnership(resourceOwnerChecker) {
  return async (req, res, next) => {
    try {
      const isOwner = await resourceOwnerChecker(req);

      if (!isOwner && !['admin', 'manager'].includes(req.user.role)) {
        console.warn(
          `[AuthZ] User ${req.user.id} attempted to access unauthorized resource`
        );

        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this resource'
        });
      }

      next();
    } catch (error) {
      console.error('[AuthZ] Resource ownership check failed:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authorization check failed'
      });
    }
  };
}

module.exports = {
  requirePermission,
  requireResourceOwnership
};
```

#### Apply Authorization to Routes

```javascript
// src/routes/inventory.js

const express = require('express');
const router = express.Router();
const { requirePermission, requireResourceOwnership } = require('../middleware/authorization');
const { validateRequest } = require('../middleware/validation');
const { UpdateInventorySchema } = require('../schemas/inventory');

// GET /api/inventory - List inventory items
router.get(
  '/',
  requirePermission('inventory:read'),
  async (req, res) => {
    // Implementation
  }
);

// POST /api/inventory - Create new item
router.post(
  '/',
  requirePermission('inventory:create'),
  validateRequest(CreateInventorySchema),
  async (req, res) => {
    // Implementation
  }
);

// PUT /api/inventory/:id - Update item
router.put(
  '/:id',
  requirePermission('inventory:update'),
  requireResourceOwnership(async (req) => {
    // Check if user owns this inventory item (e.g., assigned to their department)
    const item = await db.getInventoryItem(req.params.id);
    return item.owner_id === req.user.id || item.department_id === req.user.department_id;
  }),
  validateRequest(UpdateInventorySchema),
  async (req, res) => {
    // Implementation
  }
);

// DELETE /api/inventory/:id - Delete item
router.delete(
  '/:id',
  requirePermission('inventory:delete'),
  async (req, res) => {
    // Implementation
  }
);

module.exports = router;
```

### 2.3 Testing Authorization

```javascript
// tests/auth/authorization.test.js

const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/auth/jwt');

describe('Authorization Tests', () => {
  describe('RBAC enforcement', () => {
    it('should allow admin to delete inventory items', async () => {
      const adminToken = generateToken({ id: 1, role: 'admin', email: 'admin@example.com' });

      const response = await request(app)
        .delete('/api/inventory/123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).not.toBe(403);
    });

    it('should deny staff from deleting inventory items', async () => {
      const staffToken = generateToken({ id: 2, role: 'staff', email: 'staff@example.com' });

      const response = await request(app)
        .delete('/api/inventory/123')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('IDOR prevention', () => {
    it('should prevent user from accessing other users orders', async () => {
      const user1Token = generateToken({ id: 1, role: 'staff', email: 'user1@example.com' });

      // Try to access user 2's order
      const response = await request(app)
        .get('/api/orders/456') // Order belongs to user 2
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(403);
    });

    it('should allow admin to access any order', async () => {
      const adminToken = generateToken({ id: 99, role: 'admin', email: 'admin@example.com' });

      const response = await request(app)
        .get('/api/orders/456')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).not.toBe(403);
    });
  });
});
```

---

## 3. A02:2021 - Cryptographic Failures

### 3.1 Problem Statement

Failures related to cryptography (or lack thereof) often lead to exposure of sensitive data. This includes passwords, credit card numbers, health records, personal information, and business secrets.

**Key Concerns:**
- Passwords stored in plaintext or with weak hashing
- JWT secrets too weak or hardcoded
- Sensitive data transmitted without TLS
- API keys stored in code or version control

### 3.2 Implementation: Secure Password Hashing

```javascript
// src/auth/password.js

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12; // 2^12 iterations (adjust based on performance)

/**
 * Hash password using bcrypt
 * @param {string} plainPassword
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Verify password against hash
 * @param {string} plainPassword
 * @param {string} hashedPassword
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  hashPassword,
  verifyPassword
};
```

### 3.3 JWT Secret Management

**DO NOT:**
```javascript
// ❌ NEVER DO THIS
const JWT_SECRET = 'my-secret-key'; // Hardcoded secret
```

**DO:**
```javascript
// ✅ Load from environment variable
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters');
}

// Generate strong secret (for initial setup):
// node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3.4 Environment Variable Security

```bash
# .env.example (safe to commit)
JWT_SECRET=<generate-with-crypto-randomBytes>
JWT_REFRESH_SECRET=<different-secret-from-above>
DATABASE_URL=<connection-string>
ENCRYPTION_KEY=<32-byte-hex-string>
API_KEY_ENCRYPTION_SALT=<16-byte-hex-string>

# Validation
[[ ${#JWT_SECRET} -ge 64 ]] || echo "ERROR: JWT_SECRET too short"
```

```javascript
// src/config/environment.js

const crypto = require('crypto');

function validateEnvironment() {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  // Ensure refresh secret is different from JWT secret
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET must be different from JWT_SECRET');
  }

  console.log('[Config] Environment validation passed');
}

module.exports = { validateEnvironment };
```

### 3.5 Sensitive Data Encryption at Rest

```javascript
// src/utils/encryption.js

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

/**
 * Encrypt sensitive data
 * @param {string} plaintext
 * @returns {string} Base64-encoded encrypted data with IV and auth tag
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 * @param {string} ciphertext - Format: iv:authTag:encrypted
 * @returns {string} Plaintext
 */
function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encrypted, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

module.exports = { encrypt, decrypt };
```

**Usage Example:**

```javascript
// Store API key encrypted in database
const { encrypt, decrypt } = require('../utils/encryption');

async function storeAPIKey(userId, apiKey) {
  const encryptedKey = encrypt(apiKey);

  await db.query(
    'UPDATE users SET api_key_encrypted = ? WHERE id = ?',
    [encryptedKey, userId]
  );
}

async function getAPIKey(userId) {
  const result = await db.query(
    'SELECT api_key_encrypted FROM users WHERE id = ?',
    [userId]
  );

  if (!result.api_key_encrypted) {
    return null;
  }

  return decrypt(result.api_key_encrypted);
}
```

---

## 4. A03:2021 - Injection

### 4.1 Problem Statement

Injection flaws (SQL, NoSQL, OS command, LDAP) occur when untrusted data is sent to an interpreter as part of a command or query.

**Attack Vectors:**
- SQL injection via user input
- NoSQL injection in MongoDB queries
- Command injection via file names or system calls
- LDAP injection in authentication

### 4.2 Input Validation with Zod

```javascript
// src/schemas/inventory.js

const { z } = require('zod');

// SKU format: uppercase alphanumeric with hyphens, 3-50 chars
const SKUSchema = z.string().regex(/^[A-Z0-9\-]{3,50}$/, 'Invalid SKU format');

const CreateInventorySchema = z.object({
  sku: SKUSchema,
  name: z.string().min(1).max(255).trim(),
  category: z.string().min(1).max(100).trim(),
  unit_cost: z.number().positive().max(1000000),
  unit_of_measure: z.enum(['unit', 'kg', 'liter', 'case']),
  supplier_id: z.number().int().positive(),
  lead_time_days: z.number().int().min(1).max(365).default(7),
  min_order_quantity: z.number().positive().default(1),
  lot_size: z.number().positive().default(1)
});

const UpdateInventorySchema = CreateInventorySchema.partial().extend({
  id: z.number().int().positive()
});

const UsageRecordSchema = z.object({
  sku: SKUSchema,
  usage_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  quantity_used: z.number().nonnegative().max(1000000),
  quantity_wasted: z.number().nonnegative().max(1000000).default(0),
  is_special_event: z.boolean().default(false),
  notes: z.string().max(1000).optional()
});

module.exports = {
  CreateInventorySchema,
  UpdateInventorySchema,
  UsageRecordSchema
};
```

### 4.3 Validation Middleware

```javascript
// src/middleware/validation.js

const { ZodError } = require('zod');

/**
 * Validate request body against Zod schema
 * @param {ZodSchema} schema
 */
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      // Validate and transform request body
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        return res.status(400).json({
          error: 'Validation Error',
          details: errors
        });
      }

      // Unknown error
      console.error('[Validation] Unexpected error:', error);
      return res.status(500).json({
        error: 'Internal Server Error'
      });
    }
  };
}

/**
 * Validate query parameters
 * @param {ZodSchema} schema
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors
        });
      }

      console.error('[Validation] Query validation error:', error);
      return res.status(500).json({
        error: 'Internal Server Error'
      });
    }
  };
}

module.exports = {
  validateRequest,
  validateQuery
};
```

### 4.4 SQL Injection Prevention (Parameterized Queries)

```javascript
// ❌ VULNERABLE CODE - Never do this
async function getUserByEmail(email) {
  const query = `SELECT * FROM users WHERE email = '${email}'`;
  return await db.query(query);
}

// ✅ SAFE CODE - Always use parameterized queries
async function getUserByEmail(email) {
  const query = 'SELECT * FROM users WHERE email = ?';
  return await db.query(query, [email]);
}

// ✅ SAFE with multiple parameters
async function updateInventoryItem(id, name, quantity) {
  const query = `
    UPDATE inventory_items
    SET name = ?, quantity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  return await db.query(query, [name, quantity, id]);
}
```

### 4.5 Output Encoding

```javascript
// src/utils/sanitize.js

const validator = require('validator');

/**
 * Sanitize HTML to prevent XSS
 * @param {string} input
 * @returns {string} Escaped HTML
 */
function escapeHtml(input) {
  if (typeof input !== 'string') {
    return input;
  }

  return validator.escape(input);
}

/**
 * Sanitize for SQL LIKE queries (escape % and _)
 * @param {string} input
 * @returns {string}
 */
function escapeLike(input) {
  if (typeof input !== 'string') {
    return input;
  }

  return input.replace(/[%_]/g, '\\$&');
}

module.exports = {
  escapeHtml,
  escapeLike
};
```

### 4.6 Command Injection Prevention

```javascript
// ❌ VULNERABLE - Never use user input directly in shell commands
const { exec } = require('child_process');

function exportToCSV(filename) {
  exec(`cat data.csv > ${filename}`, (error, stdout, stderr) => {
    // Attacker could pass: "../../../etc/passwd; rm -rf /"
  });
}

// ✅ SAFE - Validate input and use allowlist
const path = require('path');
const fs = require('fs').promises;

async function exportToCSV(filename) {
  // Validate filename
  if (!/^[a-zA-Z0-9_\-]+\.csv$/.test(filename)) {
    throw new Error('Invalid filename format');
  }

  // Ensure within allowed directory
  const exportDir = '/var/app/exports';
  const fullPath = path.join(exportDir, filename);

  if (!fullPath.startsWith(exportDir)) {
    throw new Error('Path traversal detected');
  }

  // Use fs API instead of shell commands
  const data = await getCSVData();
  await fs.writeFile(fullPath, data, 'utf8');

  return fullPath;
}
```

---

## 5. A04:2021 - Insecure Design

### 5.1 Problem Statement

Insecure design refers to risks related to design and architectural flaws. Missing or ineffective control design allows attackers to bypass defenses.

**Examples:**
- No rate limiting → brute force attacks
- No account lockout → credential stuffing
- No CAPTCHA → automated abuse
- No business logic validation → workflow bypass

### 5.2 Rate Limiting

```javascript
// src/middleware/rateLimiting.js

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

/**
 * Standard rate limit for authenticated API requests
 */
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise IP
    return req.user?.id?.toString() || req.ip;
  }
});

/**
 * Strict rate limit for authentication endpoints
 */
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:'
  }),
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again in 15 minutes.'
  },
  keyGenerator: (req) => {
    // Rate limit by email or IP
    return req.body?.email || req.ip;
  }
});

/**
 * Lenient rate limit for public endpoints
 */
const publicLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:public:'
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded'
  }
});

/**
 * Expensive operation rate limit (e.g., forecast generation)
 */
const expensiveLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:expensive:'
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    error: 'Too Many Requests',
    message: 'Forecast generation limit exceeded. Please try again later.'
  },
  keyGenerator: (req) => req.user?.id?.toString() || req.ip
});

module.exports = {
  apiLimiter,
  authLimiter,
  publicLimiter,
  expensiveLimiter
};
```

**Apply to Routes:**

```javascript
// src/app.js

const express = require('express');
const { apiLimiter, authLimiter, publicLimiter } = require('./middleware/rateLimiting');

const app = express();

// Apply public limiter to all routes as baseline
app.use(publicLimiter);

// Authentication routes get stricter limits
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// All authenticated API routes get standard limits
app.use('/api', apiLimiter);

// Mount routers
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/forecast', require('./routes/forecast'));
```

### 5.3 Account Lockout Policy

```javascript
// src/auth/accountLockout.js

const redis = require('./redis');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

async function recordFailedLogin(email) {
  const key = `lockout:${email}`;
  const attempts = await redis.incr(key);

  if (attempts === 1) {
    // First failed attempt, set expiry
    await redis.pexpire(key, LOCKOUT_DURATION_MS);
  }

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await redis.set(`locked:${email}`, '1', 'PX', LOCKOUT_DURATION_MS);
    console.warn(`[Security] Account locked: ${email}`);
  }

  return attempts;
}

async function isAccountLocked(email) {
  const locked = await redis.get(`locked:${email}`);
  return locked === '1';
}

async function clearFailedAttempts(email) {
  await redis.del(`lockout:${email}`);
  await redis.del(`locked:${email}`);
}

async function getFailedAttempts(email) {
  const attempts = await redis.get(`lockout:${email}`);
  return parseInt(attempts || '0', 10);
}

module.exports = {
  recordFailedLogin,
  isAccountLocked,
  clearFailedAttempts,
  getFailedAttempts
};
```

**Integration in Login Route:**

```javascript
// src/routes/auth.js

const { isAccountLocked, recordFailedLogin, clearFailedAttempts } = require('../auth/accountLockout');

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Check if account is locked
  if (await isAccountLocked(email)) {
    return res.status(429).json({
      error: 'Account Locked',
      message: 'Too many failed login attempts. Please try again in 30 minutes.'
    });
  }

  // Attempt authentication
  const user = await db.getUserByEmail(email);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const attempts = await recordFailedLogin(email);

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid email or password',
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - attempts)
    });
  }

  // Successful login - clear failed attempts
  await clearFailedAttempts(email);

  const token = generateToken(user);
  res.json({ token });
});
```

---

## 6. A05:2021 - Security Misconfiguration

### 6.1 Problem Statement

Security misconfiguration is the most common vulnerability, often resulting from insecure default configurations, incomplete setups, open cloud storage, misconfigured HTTP headers, and verbose error messages.

### 6.2 Secure HTTP Headers (Helmet)

```javascript
// src/middleware/securityHeaders.js

const helmet = require('helmet');

function configureSecurityHeaders(app) {
  // Comprehensive helmet configuration
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Remove unsafe-inline in production
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", process.env.API_BASE_URL],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },

      // Strict Transport Security (HSTS)
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // X-Frame-Options
      frameguard: {
        action: 'deny', // Prevent clickjacking
      },

      // X-Content-Type-Options
      noSniff: true, // Prevent MIME sniffing

      // X-Permitted-Cross-Domain-Policies
      permittedCrossDomainPolicies: {
        permittedPolicies: 'none',
      },

      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },

      // X-DNS-Prefetch-Control
      dnsPrefetchControl: {
        allow: false,
      },

      // Expect-CT (deprecated but still useful)
      expectCt: {
        maxAge: 86400,
        enforce: true,
      },
    })
  );

  // Additional custom headers
  app.use((req, res, next) => {
    // Remove server identification
    res.removeHeader('X-Powered-By');

    // Permissions Policy (formerly Feature-Policy)
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );

    next();
  });
}

module.exports = { configureSecurityHeaders };
```

### 6.3 CORS Configuration

```javascript
// src/middleware/cors.js

const cors = require('cors');

const ALLOWED_ORIGINS = [
  'https://inventory.neuropilot.com',
  'https://neuropilot-inventory-4dpcvr5hn-david-mikulis-projects-73b27c6d.vercel.app',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:5173'] : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },

  credentials: true, // Allow cookies/auth headers

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID'
  ],

  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],

  maxAge: 86400, // Cache preflight for 24 hours
};

module.exports = cors(corsOptions);
```

### 6.4 Error Handling & Redaction

```javascript
// src/middleware/errorHandler.js

function errorHandler(err, req, res, next) {
  // Log full error server-side
  console.error('[Error]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Production: redact sensitive information
  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal Server Error' : err.message,
      requestId: req.id, // For support/debugging
    });
  }

  // Development: include stack trace
  res.status(statusCode).json({
    error: err.message,
    stack: err.stack,
    requestId: req.id,
  });
}

// 404 handler
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
```

### 6.5 Environment-Specific Configuration

```javascript
// src/config/index.js

const config = {
  development: {
    logLevel: 'debug',
    enableSwagger: true,
    enableCORS: true,
    corsOrigins: ['*'],
    jwtExpiry: '7d', // Longer expiry for dev convenience
  },

  test: {
    logLevel: 'error',
    enableSwagger: false,
    enableCORS: false,
    jwtExpiry: '1h',
  },

  production: {
    logLevel: 'info',
    enableSwagger: false, // Disable API docs in production
    enableCORS: true,
    corsOrigins: ALLOWED_ORIGINS,
    jwtExpiry: '1h',
    requireHttps: true,
  }
};

const env = process.env.NODE_ENV || 'development';

module.exports = config[env];
```

---

## 7. A07:2021 - Identification & Authentication Failures

### 7.1 JWT Refresh Token Implementation

```javascript
// src/auth/jwt.js

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

/**
 * Generate access token (short-lived)
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'neuropilot-api',
      audience: 'neuropilot-clients'
    }
  );
}

/**
 * Generate refresh token (long-lived)
 */
function generateRefreshToken(user) {
  const tokenId = crypto.randomBytes(16).toString('hex');

  return {
    token: jwt.sign(
      {
        id: user.id,
        tokenId,
        type: 'refresh'
      },
      JWT_REFRESH_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: 'neuropilot-api',
        audience: 'neuropilot-clients'
      }
    ),
    tokenId
  };
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'neuropilot-api',
      audience: 'neuropilot-clients'
    });

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'neuropilot-api',
      audience: 'neuropilot-clients'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
```

### 7.2 Refresh Token Storage & Rotation

```sql
-- Refresh tokens table
CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_id VARCHAR(32) UNIQUE NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_id ON refresh_tokens(token_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

```javascript
// src/auth/refreshTokenService.js

const crypto = require('crypto');

class RefreshTokenService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store refresh token (hashed)
   */
  async storeRefreshToken(userId, tokenId, token, expiresAt, req) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.db.query(
      `INSERT INTO refresh_tokens
       (user_id, token_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, tokenId, tokenHash, expiresAt, req.ip, req.get('user-agent')]
    );
  }

  /**
   * Validate refresh token (reuse detection)
   */
  async validateRefreshToken(tokenId, token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const stored = await this.db.query(
      `SELECT * FROM refresh_tokens
       WHERE token_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [tokenId]
    );

    if (!stored) {
      throw new Error('Token not found or expired');
    }

    // Check for reuse (token hash mismatch = someone tried to reuse old token)
    if (stored.token_hash !== tokenHash) {
      console.error(`[Security] Refresh token reuse detected for token_id ${tokenId}`);

      // Revoke all tokens for this user (possible compromise)
      await this.revokeAllUserTokens(stored.user_id);

      throw new Error('Token reuse detected. All sessions revoked for security.');
    }

    // Update last used
    await this.db.query(
      'UPDATE refresh_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_id = ?',
      [tokenId]
    );

    return stored;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenId) {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_id = ?',
      [tokenId]
    );
  }

  /**
   * Revoke all tokens for user
   */
  async revokeAllUserTokens(userId) {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );

    console.warn(`[Security] Revoked all tokens for user ${userId}`);
  }

  /**
   * Clean up expired tokens (run daily via cron)
   */
  async cleanupExpiredTokens() {
    const result = await this.db.query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < datetime('now', '-7 days')` // Keep 7 days for audit
    );

    console.log(`[Cleanup] Deleted ${result.changes} expired refresh tokens`);
  }
}

module.exports = RefreshTokenService;
```

### 7.3 Token Refresh Endpoint

```javascript
// src/routes/auth.js

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token required'
      });
    }

    // Verify JWT signature
    const decoded = verifyRefreshToken(refreshToken);

    // Validate in database (reuse detection)
    const stored = await refreshTokenService.validateRefreshToken(
      decoded.tokenId,
      refreshToken
    );

    // Get user
    const user = await db.getUserById(stored.user_id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account inactive'
      });
    }

    // Revoke old refresh token
    await refreshTokenService.revokeRefreshToken(decoded.tokenId);

    // Generate new token pair
    const newAccessToken = generateAccessToken(user);
    const newRefresh = generateRefreshToken(user);

    // Store new refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await refreshTokenService.storeRefreshToken(
      user.id,
      newRefresh.tokenId,
      newRefresh.token,
      expiresAt,
      req
    );

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefresh.token
    });

  } catch (error) {
    console.error('[Auth] Refresh token error:', error);

    if (error.message.includes('reuse detected')) {
      return res.status(401).json({
        error: 'Security Alert',
        message: error.message
      });
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token'
    });
  }
});
```

---

## 8. A09:2021 - Security Logging & Monitoring

### 8.1 Audit Log Implementation

```javascript
// src/audit/auditLogger.js

const crypto = require('crypto');

class AuditLogger {
  constructor(db) {
    this.db = db;
    this.previousHash = null;
  }

  /**
   * Log audit event with hash chain
   */
  async log(event) {
    const {
      userId,
      action,
      resourceType,
      resourceId,
      requestPayload,
      responseStatus,
      ipAddress,
      userAgent
    } = event;

    // Sanitize payloads (remove sensitive data)
    const sanitizedRequest = this.sanitizePayload(requestPayload);

    // Get previous hash
    if (!this.previousHash) {
      this.previousHash = await this.getLatestHash();
    }

    // Calculate current hash
    const timestamp = new Date().toISOString();
    const dataToHash = `${userId}|${action}|${timestamp}|${this.previousHash || 'GENESIS'}`;
    const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    // Insert log
    await this.db.query(
      `INSERT INTO audit_log
       (user_id, action, resource_type, resource_id, request_payload,
        response_status, ip_address, user_agent, previous_hash, current_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(sanitizedRequest),
        responseStatus,
        ipAddress,
        userAgent,
        this.previousHash,
        currentHash,
        timestamp
      ]
    );

    // Update previous hash for next call
    this.previousHash = currentHash;
  }

  /**
   * Remove sensitive fields from payloads
   */
  sanitizePayload(payload) {
    if (!payload) return null;

    const sanitized = { ...payload };

    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'creditCard'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Get latest hash from audit log
   */
  async getLatestHash() {
    const result = await this.db.query(
      'SELECT current_hash FROM audit_log ORDER BY id DESC LIMIT 1'
    );

    return result?.current_hash || null;
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity() {
    const logs = await this.db.query(
      'SELECT id, user_id, action, timestamp, previous_hash, current_hash FROM audit_log ORDER BY id'
    );

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const expectedPrevHash = i === 0 ? null : logs[i - 1].current_hash;

      if (log.previous_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAt: log.id,
          message: `Hash chain broken at record ${log.id}`
        };
      }

      // Recalculate current hash
      const dataToHash = `${log.user_id}|${log.action}|${log.timestamp}|${log.previous_hash || 'GENESIS'}`;
      const expectedCurrentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (log.current_hash !== expectedCurrentHash) {
        return {
          valid: false,
          brokenAt: log.id,
          message: `Hash mismatch at record ${log.id} - possible tampering`
        };
      }
    }

    return { valid: true, message: 'Audit log integrity verified' };
  }
}

module.exports = AuditLogger;
```

### 8.2 Audit Middleware

```javascript
// src/middleware/auditMiddleware.js

const AuditLogger = require('../audit/auditLogger');

function auditMiddleware(auditLogger) {
  return async (req, res, next) => {
    // Capture response details
    const originalSend = res.send;

    res.send = function (data) {
      res.locals.responseBody = data;
      originalSend.call(this, data);
    };

    // Log after response is sent
    res.on('finish', async () => {
      try {
        await auditLogger.log({
          userId: req.user?.id || null,
          action: `${req.method} ${req.path}`,
          resourceType: extractResourceType(req.path),
          resourceId: req.params.id || null,
          requestPayload: req.body,
          responseStatus: res.statusCode,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (error) {
        console.error('[Audit] Failed to log event:', error);
      }
    });

    next();
  };
}

function extractResourceType(path) {
  const match = path.match(/\/api\/([^\/]+)/);
  return match ? match[1] : 'unknown';
}

module.exports = auditMiddleware;
```

---

## 9. Security Testing Pipeline

### 9.1 GitHub Actions CI/CD

```yaml
# .github/workflows/security-tests.yml

name: Security Tests

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1' # Weekly on Monday 2am

jobs:
  dependency-check:
    name: Dependency Vulnerability Scan
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk test
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  zap-scan:
    name: OWASP ZAP Baseline Scan
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Start application
        run: |
          docker-compose up -d
          sleep 30 # Wait for app to start

      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.7.0
        with:
          target: 'http://localhost:8000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'

      - name: Upload ZAP report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: zap-report
          path: zap_report.html

  secret-scan:
    name: Secret Scanning
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Full history for gitleaks

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  unit-security-tests:
    name: Security Unit Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run security-focused tests
        run: npm run test:security

      - name: Check test coverage
        run: |
          npm run test:coverage
          # Fail if coverage < 80%
          npx nyc check-coverage --lines 80 --functions 80
```

### 9.2 ZAP Configuration

```.tsv
# .zap/rules.tsv
# Rule ID	Threshold	Action
10021	MEDIUM	FAIL	# Persistent XSS
10023	LOW	WARN	# Information Disclosure - Debug Error Messages
10027	MEDIUM	FAIL	# Information Disclosure - Suspicious Comments
10032	MEDIUM	FAIL	# Viewstate
10040	MEDIUM	FAIL	# Secure Pages Include Mixed Content
10049	MEDIUM	FAIL	# Content Cacheability
10050	LOW	WARN	# Retrieved from Cache
10051	LOW	WARN	# Relative Path Overwrite
10052	LOW	WARN	# X-ChromeLogger-Data Header Information Leak
10055	LOW	WARN	# CSP Header Not Set
10056	MEDIUM	FAIL	# X-Debug-Token Information Leak
10061	LOW	WARN	# X-AspNet-Version Response Header
10062	LOW	WARN	# PII Disclosure
10063	LOW	WARN	# Feature Policy Header Not Set
10094	MEDIUM	FAIL	# Base64 Disclosure
10095	LOW	WARN	# Backup File Disclosure
10096	LOW	WARN	# Timestamp Disclosure
10097	LOW	WARN	# Hash Disclosure
10098	LOW	WARN	# Cross-Domain Misconfiguration
10099	LOW	WARN	# Source Code Disclosure
10105	LOW	WARN	# Weak Authentication Method
10108	MEDIUM	FAIL	# Reverse Tabnabbing
10109	LOW	WARN	# Modern Web Application
40003	MEDIUM	FAIL	# CRLF Injection
40012	MEDIUM	FAIL	# Cross Site Scripting (Reflected)
40014	MEDIUM	FAIL	# Cross Site Scripting (Persistent)
40016	MEDIUM	FAIL	# Cross Site Scripting (Persistent - Prime)
40017	MEDIUM	FAIL	# Cross Site Scripting (Persistent - Spider)
40018	MEDIUM	FAIL	# SQL Injection
40019	HIGH	FAIL	# SQL Injection - MySQL
40020	HIGH	FAIL	# SQL Injection - Hypersonic
40021	HIGH	FAIL	# SQL Injection - Oracle
40022	HIGH	FAIL	# SQL Injection - PostgreSQL
40023	HIGH	FAIL	# Possible Username Enumeration
40024	MEDIUM	FAIL	# SQL Injection - SQLite
40025	MEDIUM	FAIL	# Proxy Disclosure
40026	MEDIUM	FAIL	# Cross Site Scripting (DOM Based)
40027	MEDIUM	FAIL	# SQL Injection - MsSQL
40028	HIGH	FAIL	# ELMAH Information Leak
40029	LOW	WARN	# Trace.axd Information Leak
40032	MEDIUM	FAIL	# .htaccess Information Leak
40034	MEDIUM	FAIL	# .env Information Leak
90019	MEDIUM	FAIL	# Server Side Code Injection
90020	MEDIUM	FAIL	# Remote OS Command Injection
90021	HIGH	FAIL	# XPath Injection
90022	MEDIUM	FAIL	# Application Error Disclosure
90023	MEDIUM	FAIL	# XML External Entity Attack
90024	MEDIUM	FAIL	# Generic Padding Oracle
90025	MEDIUM	FAIL	# Expression Language Injection
90026	MEDIUM	FAIL	# SOAP Action Spoofing
90027	MEDIUM	FAIL	# Cookie Slack Detector
90028	MEDIUM	FAIL	# Insecure HTTP Method
90029	LOW	WARN	# HTTPS Content Available via HTTP
90033	HIGH	FAIL	# Loosely Scoped Cookie
```

### 9.3 Load Testing with k6

```javascript
// tests/security/rate-limit-test.js

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    rate_limit_test: {
      executor: 'constant-arrival-rate',
      rate: 200, // 200 requests per timeUnit
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 10,
    },
  },
  thresholds: {
    'http_req_failed{expected_response:true}': ['rate<0.01'], // Less than 1% legitimate failures
    'http_reqs{status:429}': ['count>0'], // Rate limiter should trigger
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

export default function () {
  const res = http.get(`${BASE_URL}/api/inventory`, {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  });

  check(res, {
    'rate limit enforced': (r) => {
      if (r.status === 429) {
        console.log('Rate limit hit (expected)');
        return true;
      }
      return r.status === 200;
    },
  });
}
```

---

## 10. Incident Response Playbooks

### 10.1 Suspected Token Compromise

**Trigger:** Multiple failed authorization attempts, unusual access patterns, token seen in logs

**Response Steps:**

1. **Immediate (< 5 minutes):**
   ```bash
   # Revoke all tokens for affected user
   psql $DATABASE_URL -c "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $USER_ID;"

   # Force user logout
   redis-cli DEL "session:$USER_ID:*"

   # Block IP if needed
   redis-cli SET "blocked:$IP_ADDRESS" "1" EX 3600
   ```

2. **Investigation (< 1 hour):**
   - Query audit logs for suspicious activity
   - Check for unauthorized data access
   - Identify scope of compromise
   ```sql
   SELECT * FROM audit_log
   WHERE user_id = ? AND timestamp > (NOW() - INTERVAL '24 HOURS')
   ORDER BY timestamp DESC;
   ```

3. **Communication (< 2 hours):**
   - Notify affected user via email
   - Request password reset
   - Document incident in security log

4. **Follow-up (< 24 hours):**
   - Review token generation/validation code
   - Check for other compromised accounts
   - Update security measures if needed

### 10.2 SQL Injection Attempt Detected

**Trigger:** WAF alert, suspicious query patterns in logs, ZAP scan findings

**Response Steps:**

1. **Immediate:**
   ```bash
   # Review recent database queries
   tail -n 1000 /var/log/postgres/postgresql.log | grep -i "UNION\|DROP\|--\|;--"

   # Check for data exfiltration
   psql $DATABASE_URL -c "SELECT * FROM audit_log WHERE action LIKE '%SELECT%' AND response_status = 200 ORDER BY timestamp DESC LIMIT 100;"
   ```

2. **Containment:**
   - Block attacker IP
   - Review all parameterized query implementations
   - Verify no data was exfiltrated

3. **Remediation:**
   - Patch vulnerable endpoint
   - Add input validation
   - Deploy fix via hotfix branch
   - Run regression tests

4. **Prevention:**
   - Add WAF rule to block similar patterns
   - Increase monitoring on database queries
   - Schedule security code review

---

## 11. Key Rotation Procedures

### 11.1 JWT Secret Rotation

**Frequency:** Every 6 months or immediately after suspected compromise

**Procedure:**

1. **Generate new secrets:**
   ```bash
   NEW_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
   NEW_JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
   ```

2. **Dual-secret period (1 week):**
   ```javascript
   // Support both old and new secrets during transition
   function verifyAccessToken(token) {
     try {
       return jwt.verify(token, NEW_JWT_SECRET);
     } catch (error) {
       // Fallback to old secret
       return jwt.verify(token, OLD_JWT_SECRET);
     }
   }
   ```

3. **Update environment variables:**
   ```bash
   # Railway
   railway variables set JWT_SECRET=$NEW_JWT_SECRET
   railway variables set JWT_REFRESH_SECRET=$NEW_JWT_REFRESH_SECRET

   # Vercel
   vercel env add JWT_SECRET production
   vercel env add JWT_REFRESH_SECRET production
   ```

4. **Force re-deploy:**
   ```bash
   git commit --allow-empty -m "chore: rotate JWT secrets"
   git push origin main
   ```

5. **After 1 week, remove old secret support**

### 11.2 Database Encryption Key Rotation

**Frequency:** Annually

**Procedure:**

1. **Generate new key:**
   ```bash
   NEW_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```

2. **Re-encrypt all sensitive data:**
   ```javascript
   // scripts/rotate-encryption-key.js
   const users = await db.query('SELECT id, api_key_encrypted FROM users WHERE api_key_encrypted IS NOT NULL');

   for (const user of users) {
     const decrypted = decryptWithOldKey(user.api_key_encrypted);
     const reencrypted = encryptWithNewKey(decrypted);

     await db.query('UPDATE users SET api_key_encrypted = ? WHERE id = ?', [reencrypted, user.id]);
   }
   ```

3. **Update environment variable**
4. **Verify re-encryption**
5. **Destroy old key securely**

---

**END OF OWASP TOP 10 IMPLEMENTATION GUIDE**

---

## Next Steps

1. **Week 1:** Implement input validation (Zod) + rate limiting + helmet
2. **Week 2:** JWT refresh tokens + audit logging with hash chain
3. **Week 3:** Automated security testing (ZAP + GitHub Actions)
4. **Week 4:** Incident response documentation + team training

**Document Owner:** AppSec Team
**Review Schedule:** Quarterly
**Last Updated:** 2025-10-28
