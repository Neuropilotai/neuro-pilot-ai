# V20.1.0 vs V21.1 Configuration Comparison

## Current Situation

**Active:** v20.1.0 (working, but old)
**Attempting:** v21.1 (blocked by root directory issue)

---

## Configuration Comparison

| Component | V20.1.0 (Working) | V21.1 (Configured) | Status |
|-----------|-------------------|-------------------|---------|
| **Server File** | `server.js` (42KB) | `server-v21_1.js` (15KB) | ⚠️ Different |
| **Start Command** | Default (uses package.json "main") | `node server-v21_1.js` | ⚠️ Changed |
| **Healthcheck Path** | `/api/health/status` | `/health` | ⚠️ Changed |
| **Database** | SQLite (`/tmp/inventory_v20.db`) | Neon PostgreSQL | ⚠️ Changed |
| **Root Directory** | `inventory-enterprise/backend` OR `/inventory-enterprise/backend` | Should be `inventory-enterprise/backend` | 🔴 **BLOCKER** |
| **Version** | 20.1.0 | 21.1.0 | ✅ Updated |

---

## The Root Directory Problem

### What's Happening

Railway has TWO places where root directory can be configured:

1. **Environment Variable** `RAILWAY_SERVICE_ROOT` ✅
   - Currently: `inventory-enterprise/backend` (CORRECT)
   - This is set correctly

2. **Service Settings UI** → "Root Directory" field ❌
   - Currently: `/inventory-enterprise/backend` (WRONG - has leading slash)
   - This MUST be changed in Dashboard UI

### Why v20.1.0 Still Works

The old v20.1.0 deployment was created BEFORE the root directory issue existed. It's still running because:
- Railway keeps old deployments alive if new ones fail
- The healthcheck `/api/health/status` still passes
- The container hasn't been replaced

### Why v21.1 Won't Deploy

New deployments fail because:
1. Railway tries to find files at `/inventory-enterprise/backend` (absolute path)
2. That path doesn't exist in the container filesystem
3. Build fails with "Could not find root directory"
4. Railway keeps v20.1.0 running as fallback

---

## File Comparison

### server.js (v20.1.0 - 42KB)
- Full-featured server with:
  - SQLite database
  - `/api/health/status` endpoint
  - Redis caching (optional)
  - WebSocket support
  - AI Ops features
  - Governance features

### server-v21_1.js (v21.1 - 15KB)
- Streamlined V21.1 server with:
  - **Neon PostgreSQL** (via `db.js` shared pool)
  - `/health` endpoint
  - RBAC middleware
  - Privacy middleware
  - Audit logging
  - Prometheus metrics
  - Security hardening

---

## railway.json Evolution

### Current (V21.1 Configuration)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install --production=false"
  },
  "deploy": {
    "startCommand": "node server-v21_1.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Implied v20.1.0 Configuration
The old deployment likely had:
```json
{
  "deploy": {
    "startCommand": null,  // Uses package.json "main": "server.js"
    "healthcheckPath": "/api/health/status"  // v20 health endpoint
  }
}
```

---

## Package.json Mismatch

**Current package.json:**
```json
{
  "main": "server.js",           // ⚠️ Points to OLD server
  "version": "21.1.0",           // ✅ Updated
  "scripts": {
    "start": "node server-v21_1.js"  // ✅ Updated
  }
}
```

**Issue:** `main` field still points to old `server.js`, but Railway uses the explicit `startCommand` from railway.json, so this is OK.

---

## Database Comparison

### V20.1.0 (SQLite)
```
Database: /tmp/inventory_v20.db
Type: SQLite (single file)
Tables: ~15 (inventory-focused)
Connection: Direct file access
```

### V21.1 (Neon PostgreSQL)
```
Database: Neon PostgreSQL 17.5
Connection: postgresql://neondb_owner:***@ep-long-feather-adwltebn-pooler.c-2.us-east-1.aws.neon.tech/neondb
Tables: 14 (including V21.1 security tables)
Connection: Pool via db.js (max 20, SSL enabled)
```

---

## Why Railway Keeps v20.1.0 Active

Railway's deployment strategy:
1. **New deployment triggered** → Starts building v21.1
2. **Build fails** → "Could not find root directory"
3. **Healthcheck never runs** → New container never starts
4. **Old deployment kept** → v20.1.0 continues serving traffic
5. **Traffic not swapped** → Users still hit v20.1.0

This is actually a **good safety feature** - Railway won't take down a working deployment for a broken one.

---

## The Fix

### Step 1: Fix Railway Dashboard UI (REQUIRED)
1. Go to: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/service/8153394f-c7df-44a8-9691-d0f53da3d43d/settings
2. Settings → Service → **Root Directory** field
3. Change from: `/inventory-enterprise/backend` (wrong)
4. Change to: `inventory-enterprise/backend` (correct - no leading slash)
5. Click Save

### Step 2: Trigger New Deployment
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
railway up --detach
```

### Step 3: Wait & Verify (2-3 min)
```bash
# Watch build progress
railway logs | grep -E "(Building|Starting|health)"

# Check when v21.1 goes live
curl https://inventory-backend-7-agent-build.up.railway.app/health | jq .

# Expected:
# {
#   "success": true,
#   "version": "v21.1",
#   "database": "connected",
#   "uptime": 123.45
# }
```

---

## After Successful Deployment

### Verify V21.1 Features
```bash
# 1. Check version
curl https://inventory-backend-7-agent-build.up.railway.app/health | jq .

# 2. Verify Neon PostgreSQL
curl https://inventory-backend-7-agent-build.up.railway.app/health | jq '.database'

# 3. Check Prometheus metrics
curl https://inventory-backend-7-agent-build.up.railway.app/metrics | grep -E "http_requests|db_pool"

# 4. Test RBAC (should get 401 without auth)
curl https://inventory-backend-7-agent-build.up.railway.app/api/admin/users
```

### Cleanup Old Deployments
Once v21.1 is stable, old v20.1.0 deployments can be removed via Railway Dashboard.

---

## Summary

**Root Cause:** Railway Dashboard UI has `/inventory-enterprise/backend` (with leading slash) instead of `inventory-enterprise/backend`

**Impact:** All new deployments fail at build stage, v20.1.0 remains active

**Solution:** Manual fix in Railway Dashboard UI (cannot be done via CLI)

**Timeline:**
- Fix Dashboard setting: 1 minute
- Trigger deployment: 1 minute
- Build + deploy: 2-3 minutes
- Total: ~5 minutes to V21.1 live

---

**Status:** Ready to deploy once Dashboard root directory is corrected.
