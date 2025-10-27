# 🚨 Railway Manual Deployment Required - CORS Security Fix

## Critical Security Issue Status

**Severity:** CRITICAL
**Impact:** Wildcard CORS (`access-control-allow-origin: *`) active in production
**Fix Applied:** ✅ Code patched and committed to `main`
**Deployment Status:** ⏸️ PENDING MANUAL TRIGGER

---

## Root Cause Analysis

Railway's GitHub webhook is **NOT triggering** on pushes to `main` branch.

**Discovery:**
1. Railway deploys from `railway-server-production.js` (repo root), NOT from `inventory-enterprise/backend/server.js`
2. The nixpacks builder in `/railway.json` specifies: `startCommand: "node railway-server-production.js"`
3. Line 22 of `railway-server-production.js` had insecure fallback: `origin: process.env.FRONTEND_URL || '*'`
4. Pushes to main (commits `38482237ca`, `3818ddacd0`, `2c4af1deeb`) did NOT trigger Railway builds

---

## Fixes Applied (Committed to `main`)

### Commit `2c4af1deeb` - CRITICAL CORS FIX
**File:** `/railway-server-production.js`

**Changes:**
```javascript
// BEFORE (INSECURE):
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',  // ❌ WILDCARD!
    credentials: true
}));

// AFTER (SECURE):
app.use(cors({
  origin: function (origin, callback) {
    const isAllowed = matchOrigin(origin, allowlist);
    if (isAllowed) {
      callback(null, origin || true);
    } else {
      // Log SHA256 hash only (no secret leakage)
      const hash = origin ? crypto.createHash('sha256').update(origin).digest('hex').slice(0, 8) : 'null';
      console.warn('CORS blocked unauthorized origin hash:', hash);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  maxAge: 600
}));
```

**Security Enhancements:**
- ✅ Wildcard subdomain support: `https://*.vercel.app`
- ✅ Default allowlist (no env needed): `https://neuropilot-inventory.vercel.app`, `https://*.vercel.app`
- ✅ SHA256 hash logging for blocked origins (no PII)
- ✅ Startup banner logs `allowlist_count` only (no secrets)
- ✅ Credential support for authenticated requests

### Additional Commits
- `38482237ca` - Hardened `backend/server.js` (inventory-enterprise backend)
- Added CI regression tripwires:
  - `backend/test/cors.guardrail.test.js` - Jest test that fails if wildcard CORS detected
  - `backend/scripts/grep-guardrails.sh` - Lint gate to block insecure patterns

---

## Manual Deployment Steps

Railway CLI cannot auto-select services in non-TTY mode. **Follow these steps:**

### Option 1: Railway Dashboard (Recommended)

1. **Open Railway Dashboard:**
   ```
   https://railway.app/dashboard
   ```

2. **Navigate to Project:**
   - Select project: `fantastic-tranquility`
   - Select environment: `production`

3. **Trigger Deployment:**
   - Go to "Deployments" tab
   - Click "Deploy" button
   - Confirm commit `2c4af1deeb` is selected
   - Wait for build to complete (2-4 minutes for nixpacks)

4. **Monitor Build:**
   - Watch logs for: `[SECURE-CORS] mode=production allowlist_count=2`
   - Check for successful healthcheck

### Option 2: Railway CLI (Interactive Terminal)

```bash
# In a real terminal (not headless):
cd /Users/davidmikulis/neuro-pilot-ai
railway service  # Select the backend service when prompted
railway up --detach
```

### Option 3: Fix Webhook (Long-term Solution)

1. Go to Railway project settings → Integrations → GitHub
2. Check webhook configuration:
   - Verify webhook URL is active
   - Check delivery logs for failures
   - Re-authorize if needed
3. Test webhook:
   - Make empty commit: `git commit --allow-empty -m "test: railway webhook"`
   - Push and verify build triggers

---

## Post-Deployment Verification

**Once Railway deployment completes, run this verification suite:**

```bash
BACKEND="https://resourceful-achievement-production.up.railway.app"
FRONTEND_OK="https://neuropilot-inventory.vercel.app"
BAD="https://evil.example"

echo "=== 1) Healthcheck ==="
curl -s -o /dev/null -w "HC:%{http_code}\n" "$BACKEND/api/health"

echo "=== 2) CORS Allowlisted Origin ==="
curl -sI -H "Origin: $FRONTEND_OK" "$BACKEND/api/health" | tr -d '\r' | grep -i '^access-control-allow-origin:'
# EXPECTED: access-control-allow-origin: https://neuropilot-inventory.vercel.app

echo "=== 3) CORS Disallowed Origin (should be empty) ==="
curl -sI -H "Origin: $BAD" "$BACKEND/api/health" | tr -d '\r' | grep -i '^access-control-allow-origin:' && echo "❌ FAIL" || echo "✅ PASS (blocked)"

echo "=== 4) Check Deployment Timestamp ==="
curl -sI "$BACKEND/api/health" | grep -i "date:"
# Compare with current time to verify new deployment
```

**Pass Criteria:**
- ✅ HC:200
- ✅ ACAO header present for `https://neuropilot-inventory.vercel.app`
- ✅ No ACAO header for `https://evil.example`
- ✅ Date header shows recent timestamp (within last 5 minutes)

---

## Current Production Status

**Last Verified:** 2025-10-27 18:23 GMT
**Status:** ❌ INSECURE (wildcard CORS active)
**Headers:**
```
access-control-allow-credentials: true
access-control-allow-origin: *
```

**Decision:** ❌ **NO-GO** until manual deployment completes

---

## Rollback Command

If the new deployment fails:
```bash
railway redeploy --rollback
# Or via Railway UI: Deployments → Select last known-good → Roll back
```

**Last Known-Good Deployment:** 9 hours ago (before CORS fix)
**Note:** Rollback will RESTORE wildcard CORS - only use if new deployment causes outages

---

## Environment Variables (Railway)

**Required env vars in Railway service:**
```
NODE_ENV=production
ALLOWED_ORIGINS=https://neuropilot-inventory.vercel.app,https://*.vercel.app
```

**Note:** Even if `ALLOWED_ORIGINS` is missing, the code defaults to the secure allowlist (no wildcard fallback).

---

## CI Regression Prevention

**Added Tests (Commit `38482237ca`):**

1. **Jest Test:** `backend/test/cors.guardrail.test.js`
   - Runs automated CORS checks against production URL
   - Fails CI if wildcard detected
   - Run with: `npm test cors.guardrail`

2. **Lint Gate:** `backend/scripts/grep-guardrails.sh`
   - Scans codebase for insecure CORS patterns
   - Blocks merge if `app.use(cors())` or `origin: '*'` found
   - Run with: `./backend/scripts/grep-guardrails.sh`

**Add to CI Pipeline (.github/workflows):**
```yaml
- name: CORS Security Guardrail
  run: |
    cd inventory-enterprise/backend
    ./scripts/grep-guardrails.sh
    BACKEND_URL=${{ secrets.BACKEND_URL }} npm test cors.guardrail.test.js
```

---

## Action Required

**Immediate:**
1. ⚠️ Open Railway dashboard: https://railway.app/dashboard
2. ⚠️ Navigate to project `fantastic-tranquility` → production environment
3. ⚠️ Click "Deploy" to build commit `2c4af1deeb`
4. ⚠️ Run verification script above after deployment
5. ⚠️ Report results (PASS/FAIL for each check)

**Follow-up:**
- Investigate Railway webhook failure
- Add CI pipeline for guardrail tests
- Set up alerting for deployment failures
- Document Railway service architecture (which services map to which repos/directories)

---

## Contact

If deployment fails or questions arise:
- Check Railway logs: `railway logs`
- Review build output for errors
- Verify Dockerfile/nixpacks build succeeds locally
- Check environment variables are set correctly

**Status will be updated after manual deployment completes.**
