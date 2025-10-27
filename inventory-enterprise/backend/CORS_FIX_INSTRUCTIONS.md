# CORS Security Fix - Critical Issue

## 🚨 Issue Identified

**File**: `backend/server.js` (line 175)
**Current Code**: `app.use(cors());`
**Problem**: Allows **ALL origins** (`access-control-allow-origin: *`)
**Risk**: HIGH - Any website can make authenticated requests to your API

---

## ✅ Solution

Replace the insecure CORS configuration with origin validation.

### Step 1: Update server.js

**Find this line** (around line 175):
```javascript
app.use(cors());
```

**Replace with**:
```javascript
// CORS Configuration - Security Hardened
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app',
      'https://neuropilot-inventory.vercel.app'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  maxAge: 600 // 10 minutes
}));
```

### Step 2: Set Railway Environment Variable

Go to Railway Dashboard → Your Project → Variables:

**Add**:
```bash
ALLOWED_ORIGINS=https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app,https://neuropilot-inventory.vercel.app
```

**Note**: If you add a custom domain later, add it to this comma-separated list.

---

## 🧪 Testing

### Before Fix (Current - INSECURE)
```bash
# Test from random origin - SHOULD FAIL but currently ALLOWS
curl -sI -X OPTIONS \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: GET" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep "access-control-allow-origin"

# Current output: access-control-allow-origin: *  ❌ BAD
```

### After Fix (Expected - SECURE)
```bash
# Test from unauthorized origin - SHOULD REJECT
curl -sI -X OPTIONS \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: GET" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep "access-control-allow-origin"

# Expected: No header or error ✅ GOOD

# Test from authorized origin - SHOULD ALLOW
curl -sI -X OPTIONS \
  -H "Origin: https://neuropilot-inventory.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep "access-control-allow-origin"

# Expected: access-control-allow-origin: https://neuropilot-inventory.vercel.app ✅ GOOD
```

---

## 📋 Deployment Checklist

1. [ ] Update `server.js` with secure CORS configuration
2. [ ] Add `ALLOWED_ORIGINS` to Railway environment variables
3. [ ] Commit changes to Git
4. [ ] Push to main branch (triggers CI/CD)
5. [ ] Wait for Railway deployment to complete
6. [ ] Test CORS with unauthorized origin (should reject)
7. [ ] Test CORS with authorized origin (should allow)
8. [ ] Test frontend functionality (should work)
9. [ ] Monitor Railway logs for "CORS blocked" warnings

---

## 🔍 Verification Script

Save this as `test-cors.sh`:

```bash
#!/bin/bash

BACKEND="https://resourceful-achievement-production.up.railway.app"

echo "🔍 Testing CORS Configuration..."
echo ""

echo "1. Testing unauthorized origin (should REJECT):"
RESULT=$(curl -sI -X OPTIONS \
  -H "Origin: https://evil-hacker-site.com" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND/api/health" | grep -i "access-control-allow-origin")

if [ -z "$RESULT" ]; then
  echo "✅ PASS - Unauthorized origin blocked"
else
  echo "❌ FAIL - Unauthorized origin allowed: $RESULT"
fi

echo ""
echo "2. Testing authorized origin (should ALLOW):"
RESULT=$(curl -sI -X OPTIONS \
  -H "Origin: https://neuropilot-inventory.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND/api/health" | grep -i "access-control-allow-origin")

if echo "$RESULT" | grep -q "neuropilot-inventory.vercel.app"; then
  echo "✅ PASS - Authorized origin allowed: $RESULT"
else
  echo "❌ FAIL - Authorized origin blocked or wrong value: $RESULT"
fi

echo ""
echo "3. Testing from no origin (curl/mobile - should ALLOW):"
RESULT=$(curl -sI "$BACKEND/api/health" | grep -i "access-control-allow-origin")

if [ -n "$RESULT" ] || [ $? -eq 0 ]; then
  echo "✅ PASS - No-origin requests allowed"
else
  echo "❌ FAIL - No-origin requests blocked"
fi

echo ""
echo "🏁 CORS testing complete!"
```

Make executable and run:
```bash
chmod +x test-cors.sh
./test-cors.sh
```

---

## 📊 Security Impact

### Before Fix
- **Risk Level**: CRITICAL
- **Attack Surface**: Entire API exposed to any website
- **Vulnerabilities**: CSRF, data exfiltration, credential theft
- **Security Score**: 3/10

### After Fix
- **Risk Level**: LOW
- **Attack Surface**: Only Vercel frontend allowed
- **Vulnerabilities**: Mitigated
- **Security Score**: 9/10

---

## 🚀 Quick Fix (30 seconds)

```bash
# 1. Edit server.js
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
nano server.js  # or your editor

# 2. Find line 175: app.use(cors());

# 3. Replace with the secure config above

# 4. Save and commit
git add server.js
git commit -m "fix(security): restrict CORS to authorized origins only"
git push origin main

# 5. Set Railway env var (via Dashboard)
# ALLOWED_ORIGINS=https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app,https://neuropilot-inventory.vercel.app

# 6. Wait for Railway auto-deploy (~2 minutes)

# 7. Test
./test-cors.sh
```

---

## 📞 Need Help?

**If CORS fix breaks frontend**:
1. Check Railway logs: `railway logs`
2. Verify `ALLOWED_ORIGINS` includes your Vercel URL exactly
3. Check browser console for CORS errors
4. Ensure no trailing slashes in URLs

**Common Issues**:
- **Frontend not loading**: Add both Vercel URLs to `ALLOWED_ORIGINS`
- **Still seeing wildcard**: Clear browser cache or use Incognito
- **Railway not deploying**: Check build logs for syntax errors

---

## ✅ Success Criteria

After fix is deployed:
- [ ] Unauthorized origins return no CORS header or error
- [ ] Authorized origins (Vercel) work perfectly
- [ ] Frontend console has no CORS errors
- [ ] All API calls from frontend succeed
- [ ] Security audit shows origin restrictions working

---

**Priority**: 🚨 CRITICAL - Fix before production launch
**Estimated Time**: 5 minutes to update, 2 minutes to deploy
**Testing Time**: 2 minutes
**Total Time**: ~10 minutes

---

**Created**: 2025-10-27
**Status**: ⏳ PENDING FIX
**Issue**: CORS wildcard allows all origins
**Fix**: Restrict to Vercel frontend only
