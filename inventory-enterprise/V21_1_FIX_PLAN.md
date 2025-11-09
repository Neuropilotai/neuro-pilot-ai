# V21.1 Deployment Fix Plan

**Status:** 🔴 V21.1 Failed to Deploy - v20.1.0 Still Active
**Date:** 2025-11-09
**Root Cause:** Conflicting healthcheck configurations across Railway Dashboard, railway.toml, and railway.json

---

## Problem Summary

### Current State
- **Active Deployment:** v20.1.0 (SQLite-based)
- **Expected:** V21.1 (PostgreSQL + Neon)
- **Issue:** V21.1 healthcheck failed, Railway kept v20.1.0 active

### Evidence
```bash
# v20.1.0 is serving (old healthcheck path works)
$ curl https://inventory-backend-7-agent-build.up.railway.app/api/health/status
{"success":true,"data":{"version":"20.1.0",...}}

# V21.1 healthcheck path returns 404 (V21.1 never started)
$ curl https://inventory-backend-7-agent-build.up.railway.app/health
404 Not Found
```

---

## Root Cause: Configuration Conflicts

| Configuration File | Healthcheck Path | Timeout | Status |
|-------------------|------------------|---------|--------|
| Railway Dashboard | `/api/health/status` | 300s | ❌ WRONG (v20 path) |
| backend/railway.toml | `/api/health/status` → `/health` | 100s → 300s | ✅ FIXED |
| backend/railway.json | `/health` | 100s → 300s | ✅ FIXED |
| server-v21_1.js | Both paths supported | N/A | ✅ OK |

**Railway Dashboard was configured with the OLD v20 healthcheck path**, causing V21.1 deployments to fail healthchecks.

---

## Fix Steps (5 minutes)

### Step 1: Update Railway Dashboard Settings ⚠️ MANUAL REQUIRED

**You must do this in the Railway Dashboard UI:**

1. Go to: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/service/8153394f-c7df-44a8-9691-d0f53da3d43d
2. Click **"Deploy"** tab → **"Settings"** section
3. Find **"Healthcheck Path"** field
4. Change from: `/api/health/status` ❌
5. Change to: `/health` ✅
6. Verify **"Healthcheck Timeout"** is set to `300` (seconds)
7. Click **"Save"** or **"Update"**

### Step 2: Commit Configuration Fixes (Already Done)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Files updated:
# ✅ backend/railway.toml (healthcheckPath = "/health", timeout = 300)
# ✅ backend/railway.json (healthcheckPath = "/health", timeout = 300)

git add backend/railway.toml backend/railway.json
git commit -m "fix(railway): align healthcheck path to /health with 300s timeout for V21.1"
git push origin main
```

### Step 3: Verify Railway Environment Variables

These must be set in Railway Dashboard → Variables:

```bash
✅ DATABASE_URL=postgresql://neondb_owner:***@ep-long-feather-adwltebn-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
✅ NODE_ENV=production
✅ PCI_ENFORCE=true
✅ SCHEDULER_ENABLED=true
✅ BASE=https://inventory-backend-7-agent-build.up.railway.app
✅ JWT_SECRET=************ (32+ characters)
✅ PORT=(Railway auto-assigns, should be 8080 or auto)
```

### Step 4: Trigger New Deployment

**Option A: Automatic (recommended)**
```bash
git push origin main
# Railway will auto-deploy when it detects changes to main branch
```

**Option B: Manual via CLI**
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
railway up --detach
```

**Option C: Manual via Dashboard**
1. Go to Railway Dashboard → Deployments tab
2. Click **"Deploy"** or **"Redeploy"** button

### Step 5: Monitor Deployment

```bash
# Watch deployment logs (requires Railway CLI in backend directory)
cd backend
railway logs --follow

# Expected output:
# ================================================
# 🚀 Neuro.Pilot.AI V21.1 Starting...
# ================================================
#   Port: 8080
#   Environment: production
#   Version: 21.1.0
#   Database: PostgreSQL (configured)
#   Health: http://localhost:8080/health
# ================================================
```

### Step 6: Verify V21.1 is Active

```bash
# Check health endpoint (should return V21.1)
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/health | jq .

# Expected output:
{
  "status": "healthy",
  "version": "21.1.0",
  "database": {
    "connected": true,
    "type": "postgresql"
  },
  "timestamp": "2025-11-09T23:30:00.000Z"
}

# Verify backward compatibility (v20 path should still work)
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .

# Check metrics endpoint
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/metrics | grep -E "_total|version"
```

---

## Why This Happened

1. **Railway Dashboard Config Takes Precedence:** The healthcheck path in the Dashboard overrides `railway.toml` and `railway.json`

2. **Documentation Updated But Not Dashboard:** Your deployment docs (V21_1_FINAL_DEPLOYMENT_STATUS.md) stated:
   > "railway.json healthcheck path = `/health`"

   But the Railway Dashboard was never updated from `/api/health/status`

3. **V21.1 Server Supports Both Paths:**
   - server-v21_1.js:167 - `/health` (new V21.1 endpoint)
   - server-v21_1.js:187 - `/api/health/status` (backward compatibility)

   So the issue wasn't the server code, but Railway checking the wrong path during deployment

4. **Silent Failure:** Railway kept v20.1.0 active when V21.1 healthcheck failed, which is correct rollback behavior, but no alert was generated

---

## Expected Timeline

| Step | Duration | Status |
|------|----------|--------|
| Update Dashboard healthcheck | 1 min | ⏳ Manual action required |
| Commit config fixes | 1 min | ✅ Complete |
| Git push to trigger deploy | 1 min | ⏳ Pending |
| Railway build & deploy | 5-8 min | ⏳ Pending |
| Healthcheck & traffic swap | 1-2 min | ⏳ Pending |
| **Total** | **~10 min** | |

---

## Post-Deployment Validation

Run the full smoke test suite:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
export EMAIL="owner@neuropilot.ai"
export PASS="your-password"
export BASE="https://inventory-backend-7-agent-build.up.railway.app"

./quick-deploy-v21_1.sh
```

---

## Rollback Plan (If V21.1 Fails Again)

If V21.1 deployment fails after these fixes:

1. **Railway will auto-rollback to v20.1.0** (already active)
2. **Check logs for errors:**
   ```bash
   cd backend
   railway logs | grep -E "(ERROR|FATAL|health)" | tail -50
   ```
3. **Common issues to check:**
   - DATABASE_URL connection timeout (Neon accessibility)
   - Missing JWT_SECRET or other required env vars
   - Port binding issues (Railway assigns PORT dynamically)
   - npm dependency installation failures

---

## Success Criteria

- [x] Configuration files aligned (`/health`, 300s timeout)
- [ ] Railway Dashboard healthcheck = `/health`
- [ ] Git push triggers new deployment
- [ ] Railway build completes successfully
- [ ] `/health` endpoint returns `"version": "21.1.0"`
- [ ] `/api/health/status` endpoint still works (backward compatibility)
- [ ] `/metrics` endpoint returns Prometheus counters
- [ ] Smoke tests pass with 0 failures

---

## Files Modified

```
✅ backend/railway.toml (healthcheckPath, timeout)
✅ backend/railway.json (healthcheckTimeout)
📝 V21_1_FIX_PLAN.md (this file)
```

---

## Next Action

**👉 YOU MUST UPDATE RAILWAY DASHBOARD MANUALLY** (Step 1 above)

Railway CLI does not support changing healthcheck path. You must use the web UI.

After updating the Dashboard, run:
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
git add backend/railway.toml backend/railway.json V21_1_FIX_PLAN.md
git commit -m "fix(railway): align healthcheck path to /health with 300s timeout for V21.1"
git push origin main
```

Then monitor the deployment:
```bash
cd backend
railway logs --follow
```

---

**Once deployment completes, V21.1 will be active and serving traffic. 🚀**
