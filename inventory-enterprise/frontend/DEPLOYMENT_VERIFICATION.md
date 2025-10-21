# Deployment Verification Checklist

**Branch:** `fix/broken-links-guard-v15`
**Feature:** Unified Token Management + API Wrapper
**Status:** ✅ Committed & Pushed

---

## Pre-Deployment Checklist

### 1. Build Frontend

```bash
cd frontend
npm install  # If new dependencies added
npm run build  # Or your build command

# Verify build output
ls -lh dist/  # Should see bundled JS/CSS
```

**Expected output:**
```
dist/
├── index.html
├── assets/
│   ├── auth-[hash].js
│   ├── api-[hash].js
│   └── owner-super-console-[hash].js
└── ...
```

---

### 2. Test Locally (Development Server)

```bash
# Start dev server
npm run dev  # Or npm run serve

# Open browser to http://localhost:5173 (or your dev port)
```

**Browser Console Tests:**

```javascript
// 1. Check auth module loaded
console.log(window.__auth);
// Should output: { setToken, getToken, logout, ... }

// 2. Set test token
window.__auth.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLTEiLCJlbWFpbCI6Im5ldXJvcGlsb3RhaUBnbWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NjA4OTc5MDIsImV4cCI6MTc5MjQzMzkwMn0.0FLDfmMFhT9hFYZRhCPTIZWF1w9btghdhfh6vaOIby4');

// 3. Verify token persisted
console.log(window.__auth.getToken());
// Should output: the JWT token

// 4. Check user info
console.log(window.__auth.getCurrentUser());
// Should output: { id: 'admin-1', email: 'neuropilotai@gmail.com', role: 'owner' }

// 5. Test API wrapper
window.__api.get('/api/health').then(r => r.json()).then(console.log);
// Should output: { status: 'ok', time: '...' }

// 6. Test authenticated endpoint
window.__api.get('/api/owner/pdfs?vendor=GFS&period=FY26-P02')
  .then(r => r.json())
  .then(data => console.log('✅ Auth working:', data.success));
// Should output: ✅ Auth working: true
```

---

### 3. Deploy to Vercel

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Deploy
vercel --prod

# Or link to GitHub for auto-deploy
vercel link
# Follow prompts to connect to GitHub repo
```

**Vercel Environment Variables:**

```bash
# In Vercel Dashboard → Project → Settings → Environment Variables
VITE_API_URL=https://your-backend.up.railway.app

# Or for production
VITE_API_URL=https://api.neuropilot.ai
```

**Verify Deployment:**

```bash
# Get deployment URL
vercel inspect

# Test deployed app
curl https://your-app.vercel.app
```

---

### 4. Deploy to Railway (Static Build)

Alternative to Vercel for static hosting:

```bash
# railway.json in frontend directory
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npx serve -s dist -l 3000",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}

# Deploy
railway up
```

---

## Post-Deployment Verification

### 1. Browser Network Tab (Chrome DevTools)

1. Open deployed app: `https://your-app.vercel.app`
2. Open DevTools → Network tab
3. Reload page
4. Click any API request

**Expected Headers:**

```
Request Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json

Response Headers:
  Access-Control-Allow-Origin: https://your-app.vercel.app
  Content-Type: application/json
```

**No Errors:**
- ✅ No CORS errors
- ✅ No 401 Unauthorized
- ✅ No 403 Forbidden (if token set)
- ✅ All requests return 200 OK

---

### 2. Backend Logs (Railway Dashboard)

Navigate to: Railway Dashboard → Backend Service → Logs

**Expected Log Output:**

```
[2025-01-20 18:00:00] ✅ 200 GET /api/health
[2025-01-20 18:00:05] 🔐 Auth: neuropilotai@gmail.com (owner)
[2025-01-20 18:00:05] ✅ 200 GET /api/owner/pdfs
[2025-01-20 18:00:10] 🔐 Auth: neuropilotai@gmail.com (owner)
[2025-01-20 18:00:10] ✅ 200 POST /api/movement
```

**Verify:**
- ✅ JWT middleware correctly extracts `email` and `role`
- ✅ RLS session variables set: `app.user_id`, `app.role`
- ✅ No 401/403 errors in logs
- ✅ User email appears in logs (from JWT)

**Check RLS Propagation:**

```javascript
// In backend server.js withDb() function
console.log('🔒 RLS Session Vars:', {
  user_id: req.user.id,
  role: req.user.role
});
```

---

### 3. Browser Console (Production)

Open production app and run these tests:

```javascript
// Test 1: Auth module loaded
console.log('Auth module:', typeof window.__auth);
// Expected: 'object'

// Test 2: API wrapper loaded
console.log('API module:', typeof window.__api);
// Expected: 'object'

// Test 3: Set token
window.__auth.setToken('YOUR_VALID_JWT_HERE');
console.log('Token set:', window.__auth.isAuthenticated());
// Expected: true

// Test 4: Test authenticated request
window.__api.get('/api/owner/pdfs?vendor=GFS&period=FY26-P02')
  .then(r => r.json())
  .then(data => {
    console.log('✅ API Response:', data);
    console.log('📊 PDFs found:', data.data?.length);
  })
  .catch(err => console.error('❌ Error:', err));

// Test 5: Check user info
console.log('👤 Current user:', window.__auth.getCurrentUser());
// Expected: { id, email, role }

// Test 6: Test logout
window.__auth.logout(false); // Don't redirect
console.log('Logged out:', !window.__auth.isAuthenticated());
// Expected: true
```

---

## Security Verification

### 1. JWT Secret Rotation

**Backend (.env):**

```bash
# Generate new JWT secret every 90 days
openssl rand -base64 64

# Update in Railway
railway variables set JWT_SECRET="new_secret_here"

# Restart backend
railway restart
```

**Note:** All existing tokens will be invalidated. Users must re-login.

---

### 2. Token Expiry Testing

```javascript
// In browser console
const payload = window.__auth.getTokenPayload();
console.log('Token expires:', new Date(payload.exp * 1000));
console.log('Expired?', window.__auth.isTokenExpired());

// Should auto-logout if expired
setTimeout(() => {
  console.log('Still authenticated?', window.__auth.isAuthenticated());
}, 60000); // Check after 1 minute
```

---

### 3. Rate Limiting Verification

**Test Login Rate Limit:**

```bash
# Rapid fire 10 login requests
for i in {1..10}; do
  curl -X POST https://api.neuropilot.ai/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' &
done
wait

# Expected: Some requests return 429 Too Many Requests
```

**Backend Rate Limit Config:**

```javascript
// server.production-minimal.js
app.use('/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later'
}));
```

---

### 4. CORS Verification

**Test CORS from Unauthorized Origin:**

```bash
# Should be blocked
curl -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -X OPTIONS \
  https://api.neuropilot.ai/api/health

# Expected: No Access-Control-Allow-Origin header
```

**Allowed Origins (Backend):**

```javascript
// server.production-minimal.js
cors({
  origin: [
    'https://your-app.vercel.app',
    'https://app.neuropilot.ai',
    'http://localhost:5173' // Dev only
  ]
})
```

---

## Common Issues & Fixes

### Issue 1: "401 Unauthorized" on all requests

**Cause:** Token not set or expired

**Fix:**
```javascript
// Check token
console.log(window.__auth.getToken());

// If null, set it
window.__auth.setToken('VALID_JWT_HERE');

// Or re-login
```

---

### Issue 2: CORS errors

**Cause:** Frontend domain not in allowed origins

**Fix in Backend:**
```javascript
// Add frontend domain to ALLOW_ORIGIN
export ALLOW_ORIGIN="https://your-app.vercel.app,https://app.neuropilot.ai"
```

---

### Issue 3: "Network error: Cannot reach server"

**Cause:** Wrong API base URL

**Fix:**
```javascript
// Check API URL
console.log(window.__api.baseUrl);

// Update in Vercel environment variables
VITE_API_URL=https://correct-backend.up.railway.app
```

---

### Issue 4: Backend doesn't log user email/role

**Cause:** JWT middleware not extracting payload correctly

**Fix in Backend:**
```javascript
// Verify JWT middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id || payload.sub,
      email: payload.email,
      role: payload.role
    };
    console.log('🔐 Authenticated user:', req.user.email, `(${req.user.role})`);
  }
  next();
});
```

---

## Security Hardening Checklist

### Immediate (Pre-Production)

- [ ] Rotate `JWT_SECRET` (generate new 64-char secret)
- [ ] Set short token expiry (30 minutes recommended)
- [ ] Add rate limiting to `/auth/login` (5 requests/15 minutes)
- [ ] Verify CORS only allows your frontend domain
- [ ] Enable HTTPS only (no HTTP)
- [ ] Add CSP headers (already in server.production-minimal.js)

### Week 1 (Post-Launch)

- [ ] Monitor auth failures in logs
- [ ] Set up alerts for high 401/403 rates
- [ ] Review rate limit thresholds based on real traffic
- [ ] Test token refresh flow (if implemented)
- [ ] Verify RLS policies work as expected

### Month 1 (Ongoing)

- [ ] Rotate JWT secret (first rotation)
- [ ] Audit user sessions (active tokens)
- [ ] Review and update RBAC policies
- [ ] Consider migrating to HttpOnly cookies
- [ ] Implement refresh token rotation
- [ ] Add security headers audit

### Future Enhancements

- [ ] **HttpOnly Cookies** (maximum XSS protection)
  ```javascript
  // Backend
  res.cookie('access_token', jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000
  });

  // Frontend: Remove localStorage, use credentials: 'include'
  ```

- [ ] **Refresh Token Pattern**
  ```javascript
  // Short-lived access token (30 min)
  // Long-lived refresh token (90 days)
  // Silent refresh before expiry
  ```

- [ ] **Multi-Factor Authentication (MFA)**
  ```javascript
  // TOTP (Time-based One-Time Password)
  // SMS backup codes
  // Recovery codes
  ```

- [ ] **Session Management Dashboard**
  ```javascript
  // Show active sessions
  // Revoke sessions remotely
  // Force logout all devices
  ```

---

## Monitoring & Alerts

### Datadog / Grafana Metrics

```javascript
// Track auth metrics
auth_login_total{status="success"} 1234
auth_login_total{status="failed"} 45
auth_token_expired_total 23
auth_logout_total 567

// Track API errors
api_errors_total{code="401"} 12
api_errors_total{code="403"} 3
api_errors_total{code="500"} 1

// Track RLS violations
rls_policy_violation_total{table="inventory_count"} 2
```

### Alert Rules

```yaml
- alert: HighAuthFailureRate
  expr: rate(auth_login_total{status="failed"}[5m]) > 10
  severity: warning
  message: "High authentication failure rate detected"

- alert: ManyExpiredTokens
  expr: rate(auth_token_expired_total[1h]) > 50
  severity: info
  message: "Many users with expired tokens - consider longer expiry"

- alert: RLSPolicyViolation
  expr: increase(rls_policy_violation_total[5m]) > 0
  severity: critical
  message: "RLS policy violation detected - potential security breach"
```

---

## Rollback Plan

If issues arise in production:

### Quick Rollback (Vercel)

```bash
# List recent deployments
vercel list

# Rollback to previous deployment
vercel rollback <deployment-url>

# Or promote specific deployment
vercel promote <deployment-url>
```

### Quick Rollback (Railway)

```bash
# Railway Dashboard → Deployments → Select previous deployment → Redeploy
```

### Disable Auth System (Emergency)

```javascript
// In server.production-minimal.js, comment out auth middleware temporarily
// app.use(authenticateToken); // <-- Disable this

// WARNING: This removes all authentication!
// Only use as last resort to restore service
```

---

## Success Criteria

Deployment is successful when:

- ✅ Frontend loads without errors
- ✅ All API calls include `Authorization: Bearer` header
- ✅ No CORS errors in browser console
- ✅ Backend logs show user email/role extracted from JWT
- ✅ 401 errors trigger automatic logout
- ✅ 403 errors show error message without logout
- ✅ Token persists across page reloads
- ✅ Legacy tokens auto-migrate to new system
- ✅ Rate limiting works (verified with load test)
- ✅ RLS session variables propagate correctly

---

**Version:** 1.0.0
**Last Updated:** 2025-01-20
**Status:** Production-Ready ✅
