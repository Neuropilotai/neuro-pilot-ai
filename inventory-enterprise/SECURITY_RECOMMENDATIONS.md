# Security Recommendations & Best Practices

**Status:** Production Security Hardening
**Priority:** Critical
**Timeline:** Implement before public launch

---

## 🔐 1. JWT Secret Management

### Current Risk
- JWT secrets in `.env` files can leak through git commits
- Long-lived secrets increase breach impact
- No rotation strategy in place

### Recommendations

#### ✅ Immediate Actions

**Generate Strong Secret (64+ characters):**

```bash
# Generate cryptographically secure secret
openssl rand -base64 64

# Output example:
# xK7mP2vQ9wR3sT8uY1zA4bC6dE0fG5hI9jK2lM3nO7pQ8rS1tU4vW6xY9zA0bC3dE5fG7hI0jK2lM3nO5pQ7r==
```

**Store in Environment Variables:**

```bash
# Railway Dashboard → Environment Variables
JWT_SECRET=your_64_char_secret_here
REFRESH_TOKEN_SECRET=another_64_char_secret_here

# Never commit to git!
# Add to .gitignore:
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore
```

#### 🔄 Regular Rotation (Every 90 Days)

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 64)

# 2. Update environment variable
railway variables set JWT_SECRET="$NEW_SECRET"

# 3. Restart backend (invalidates all existing tokens)
railway restart

# 4. Users must re-login
# Optional: Send email notification about forced logout
```

**Automation with Cron:**

```bash
# Set calendar reminder for secret rotation
# Or use Railway Cron (if available):
# 0 0 1 */3 * /scripts/rotate_jwt_secret.sh
```

---

## ⏰ 2. Token Expiry Strategy

### Current Risk
- Long-lived tokens (1 year) increase breach window
- No automatic token refresh

### Recommendations

#### ✅ Short-Lived Access Tokens (15-30 minutes)

**Backend (server.production-minimal.js):**

```javascript
// Generate short-lived access token
const accessToken = jwt.sign(
  {
    sub: user.id,
    email: user.email,
    role: user.role
  },
  JWT_SECRET,
  { expiresIn: '30m' } // 30 minutes
);
```

#### ✅ Long-Lived Refresh Tokens (90 days)

```javascript
// Generate refresh token (stored separately)
const refreshToken = jwt.sign(
  {
    sub: user.id,
    type: 'refresh'
  },
  REFRESH_TOKEN_SECRET,
  { expiresIn: '90d' }
);

// Return both tokens
res.json({
  accessToken,
  refreshToken,
  expiresIn: 1800 // 30 minutes in seconds
});
```

#### ✅ Refresh Token Endpoint

**Backend Route:**

```javascript
// POST /auth/refresh
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    // Verify refresh token
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Get user from database
    const user = await db.query('SELECT * FROM app_user WHERE id = $1', [payload.sub]);

    if (!user.rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Issue new access token
    const newAccessToken = jwt.sign(
      {
        sub: user.rows[0].id,
        email: user.rows[0].email,
        role: user.rows[0].role
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    res.json({
      accessToken: newAccessToken,
      expiresIn: 1800
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});
```

**Frontend (Silent Refresh):**

```javascript
// In auth.js
let refreshTimeout;

function scheduleTokenRefresh() {
  const payload = getTokenPayload();
  if (!payload || !payload.exp) return;

  // Refresh 5 minutes before expiry
  const expiresIn = payload.exp * 1000 - Date.now();
  const refreshIn = expiresIn - 5 * 60 * 1000;

  if (refreshIn > 0) {
    refreshTimeout = setTimeout(async () => {
      await refreshAccessToken();
    }, refreshIn);
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    logout();
    return;
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const { accessToken } = await response.json();
    setToken(accessToken);
    scheduleTokenRefresh(); // Schedule next refresh
  } catch (error) {
    console.error('Token refresh failed:', error);
    logout();
  }
}

// Auto-schedule on token set
export function setToken(token) {
  // ... existing code
  scheduleTokenRefresh();
}
```

---

## 🚦 3. Rate Limiting on /auth/login

### Current Risk
- Brute force attacks can try unlimited password combinations
- No protection against credential stuffing

### Recommendations

#### ✅ Express Rate Limit Middleware

**Backend (server.production-minimal.js):**

```javascript
const rateLimit = require('express-rate-limit');

// Create rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator (use IP + email if available)
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${req.ip}-${email}`;
  },
  // Skip successful logins from count
  skipSuccessfulRequests: false,
  // Store in memory (upgrade to Redis for production)
  store: new MemoryStore()
});

// Apply to auth routes only
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
```

#### ✅ Redis-Based Rate Limiting (Production)

```bash
# Install Redis store
npm install rate-limit-redis ioredis
```

```javascript
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:'
  })
});
```

#### ✅ Progressive Delays (Exponential Backoff)

```javascript
const loginAttempts = new Map(); // Or Redis

app.post('/auth/login', async (req, res) => {
  const key = `${req.ip}-${req.body.email}`;
  const attempts = loginAttempts.get(key) || 0;

  // Exponential backoff delay
  const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds

  if (attempts > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Attempt login
  const user = await authenticateUser(req.body.email, req.body.password);

  if (!user) {
    // Increment failure count
    loginAttempts.set(key, attempts + 1);

    // Auto-clear after 1 hour
    setTimeout(() => loginAttempts.delete(key), 60 * 60 * 1000);

    return res.status(401).json({
      error: 'Invalid credentials',
      retryAfter: Math.ceil(delay / 1000)
    });
  }

  // Clear attempts on success
  loginAttempts.delete(key);

  // Generate tokens
  const token = jwt.sign({ ... }, JWT_SECRET);
  res.json({ token });
});
```

---

## 🔒 4. HttpOnly Cookie Migration (Future)

### Why HttpOnly Cookies?

**Benefits:**
- ✅ Not accessible to JavaScript (XSS protection)
- ✅ Automatic send with every request
- ✅ Secure + SameSite flags prevent CSRF
- ✅ Browser handles token storage/expiry

**Current Risk:**
- Tokens in localStorage are vulnerable to XSS attacks

### Migration Plan

#### Phase 1: Backend Changes

```javascript
// After login, set cookie instead of returning token
app.post('/auth/login', async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = jwt.sign({ ... }, JWT_SECRET, { expiresIn: '30m' });

  // Set HttpOnly cookie
  res.cookie('access_token', accessToken, {
    httpOnly: true,     // Not accessible to JavaScript
    secure: true,       // HTTPS only
    sameSite: 'lax',    // CSRF protection
    maxAge: 30 * 60 * 1000, // 30 minutes
    path: '/',
    domain: process.env.COOKIE_DOMAIN // .neuropilot.ai
  });

  // Don't return token in response
  res.json({ success: true, user: { email: user.email, role: user.role } });
});

// Read cookie in auth middleware
app.use((req, res, next) => {
  const token = req.cookies.access_token; // From cookie-parser middleware

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
    } catch (err) {
      // Token invalid - clear cookie
      res.clearCookie('access_token');
    }
  }
  next();
});

// Logout - clear cookie
app.post('/auth/logout', (req, res) => {
  res.clearCookie('access_token');
  res.json({ success: true });
});
```

#### Phase 2: Frontend Changes

```javascript
// Remove all localStorage token code from auth.js
// Tokens are now in cookies (automatic)

// Login
async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include', // Send cookies
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  // No token to store - it's in httpOnly cookie!
  window.location.href = '/dashboard';
}

// API calls - cookies sent automatically
async function api(path, init = {}) {
  return fetch(path, {
    ...init,
    credentials: 'include' // Send cookies
  });
}

// Logout
async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });

  window.location.href = '/login';
}
```

---

## 🛡️ 5. Protect All Routes with Middleware

### Current Risk
- Some routes may not have authentication
- Inconsistent protection across endpoints

### Recommendations

#### ✅ Apply Auth Middleware Globally

**Backend (server.production-minimal.js):**

```javascript
// Public routes (no auth required)
const PUBLIC_ROUTES = [
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/refresh'
];

// Global auth middleware
app.use((req, res, next) => {
  // Skip public routes
  if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  // Require auth for all other routes
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub || payload.id,
      email: payload.email,
      role: payload.role
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// All routes below this point require authentication
app.get('/inventory/low-stock', requireRole(['admin', 'manager']), ...);
app.post('/movement', requireRole(['counter', 'manager', 'admin']), ...);
```

#### ✅ Role-Based Route Protection

```javascript
// Middleware factory for RBAC
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

// Usage
app.get('/admin/users', requireRole(['admin']), ...);
app.get('/inventory/counts', requireRole(['admin', 'manager', 'counter']), ...);
app.get('/reports', requireRole(['admin', 'manager', 'counter', 'viewer']), ...);
```

#### ✅ Route Protection Matrix

| Endpoint | Viewer | Counter | Manager | Admin |
|----------|--------|---------|---------|-------|
| `GET /inventory/low-stock` | ❌ | ❌ | ✅ | ✅ |
| `GET /inventory/counts` | ✅ | ✅ | ✅ | ✅ |
| `POST /inventory/counts` | ❌ | ✅ | ✅ | ✅ |
| `PUT /inventory/counts/:id` | ❌ | ❌ | ✅ | ✅ |
| `POST /movement` | ❌ | ✅ | ✅ | ✅ |
| `GET /reports/*` | ✅ | ✅ | ✅ | ✅ |
| `GET /admin/*` | ❌ | ❌ | ❌ | ✅ |

---

## 📊 6. Additional Security Best Practices

### ✅ Password Hashing (bcrypt)

```bash
npm install bcrypt
```

```javascript
const bcrypt = require('bcrypt');

// On registration
const hashedPassword = await bcrypt.hash(password, 12); // 12 rounds
await db.query('INSERT INTO app_user (email, password, role) VALUES ($1, $2, $3)', [email, hashedPassword, 'viewer']);

// On login
const user = await db.query('SELECT * FROM app_user WHERE email = $1', [email]);
const valid = await bcrypt.compare(password, user.rows[0].password);

if (!valid) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
```

### ✅ Input Validation (Zod)

```bash
npm install zod
```

```javascript
const { z } = require('zod');

// Define schema
const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100)
});

// Validate in route
app.post('/auth/login', (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    // ... authenticate
  } catch (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.errors
    });
  }
});
```

### ✅ SQL Injection Prevention

**Already protected** by using parameterized queries:

```javascript
// ✅ GOOD (parameterized)
db.query('SELECT * FROM users WHERE email = $1', [email]);

// ❌ BAD (vulnerable to SQL injection)
db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### ✅ XSS Prevention

**Already protected** by:
- Content-Type: application/json (not HTML)
- CSP headers in Helmet
- React/Vue escapes output automatically

### ✅ CSRF Protection

**Already protected** by:
- SameSite cookies
- Origin checking in CORS
- No state-changing GET requests

---

## 🔍 7. Security Monitoring

### ✅ Log All Auth Events

```javascript
// Log successful logins
logger.info('Login successful', {
  user: user.email,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// Log failed logins
logger.warn('Login failed', {
  email: req.body.email,
  ip: req.ip,
  reason: 'Invalid credentials'
});

// Log suspicious activity
if (failedAttempts > 10) {
  logger.alert('Potential brute force attack', {
    email: req.body.email,
    ip: req.ip,
    attempts: failedAttempts
  });
}
```

### ✅ Alert Rules

```yaml
# Datadog / Grafana alerts
- alert: HighLoginFailureRate
  expr: rate(auth_login_failed[5m]) > 10
  message: "Potential brute force attack"

- alert: SuspiciousIPActivity
  expr: count by (ip) (auth_login_failed) > 20
  message: "IP {{$labels.ip}} has 20+ failed logins"
```

---

## 📋 Security Checklist

### Pre-Production (Must Do)

- [ ] Rotate JWT_SECRET to 64+ character random string
- [ ] Set token expiry to 30 minutes (access) + 90 days (refresh)
- [ ] Add rate limiting to /auth/login (5 req/15 min)
- [ ] Hash passwords with bcrypt (12 rounds)
- [ ] Validate all inputs with Zod
- [ ] Apply auth middleware to all non-public routes
- [ ] Enable HTTPS only (no HTTP)
- [ ] Set secure CORS origins
- [ ] Add CSP headers
- [ ] Test RLS policies

### Post-Launch (First Week)

- [ ] Monitor auth failure rates
- [ ] Set up security alerts
- [ ] Review rate limit effectiveness
- [ ] Test token refresh flow
- [ ] Verify RLS session propagation
- [ ] Audit user sessions
- [ ] Check for suspicious IPs

### Ongoing (Monthly)

- [ ] Rotate JWT secrets (every 90 days)
- [ ] Review and update RBAC policies
- [ ] Audit security logs
- [ ] Test backup/restore procedures
- [ ] Update dependencies (security patches)
- [ ] Penetration testing
- [ ] Security audit

---

**Priority:** 🔴 Critical - Implement before launch
**Timeline:** 1-2 weeks for full implementation
**Owner:** Backend Team
**Status:** In Progress
