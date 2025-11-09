# V20.1 DEPLOYMENT VERIFICATION

**Status:** 🚀 Code Pushed - Railway Deploying
**Commit:** 929ae480c8
**Deployed:** 2025-11-06

---

## STEP 1: SET RAILWAY ENVIRONMENT VARIABLES

### Railway Dashboard Click-Path:
1. Go to https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299
2. Select **inventory-backend-staging** service
3. Click **Variables** tab
4. Add the following:

### Required Variables

```bash
APP_VERSION=20.1.0
JWT_SECRET=gY/sGQFRdtqP9keGvCim2OL/1D4InyQnut8sNPsxVpM=
```

### Optional Variables (Recommended)

```bash
# Cache TTLs
CACHE_TTL_ITEMS=300
CACHE_TTL_SUMMARY=300

# Rate Limiting
RATE_LIMIT_WINDOW_MIN=5
RATE_LIMIT_MAX=100

# CORS
CORS_ALLOWLIST=https://inventory-backend-7-agent-build.up.railway.app

# Cron
CRON_DAILY=5 2 * * *

# Logging
LOG_LEVEL=info
```

### Optional Redis (for maximum performance)

**If you want caching:**
1. Railway Dashboard → **Add Plugin** → **Redis**
2. After Redis is created, copy `REDIS_URL` from plugin
3. Add to service variables:
   ```bash
   REDIS_URL=redis://default:<password>@redis.railway.internal:6379
   ```

**If you skip Redis:** App works fine, just no caching (cache hit rate = 0%)

---

## STEP 2: MONITOR DEPLOYMENT (2-5 minutes)

```bash
# Option 1: Railway CLI
railway logs --service inventory-backend-staging

# Option 2: Railway Dashboard
# https://railway.app/project/.../deployments

# Watch for:
# ✅ "Database connected: /tmp/inventory_v20.db"
# ✅ "Redis connected" (if REDIS_URL set)
# ✅ "Server running on port 8080"
# ✅ "Cron job scheduled: 5 2 * * * UTC"
# ✅ "NeuroInnovate Inventory v20.1.0"
```

---

## STEP 3: VERIFICATION COMMANDS

### 1. Health Check (Basic)

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health | jq .

# Expected:
# {
#   "status": "healthy",
#   "version": "20.1.0",
#   "service": "inventory-backend-staging"
# }
```

### 2. Health Check (Detailed)

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "version": "20.1.0",
#     "database": {
#       "connected": true,
#       "items_count": 7
#     },
#     "redis": {
#       "connected": true or false
#     },
#     "features": {
#       "auth": true,
#       "caching": true or false,
#       "metrics": true,
#       "rate_limiting": true,
#       "cron_jobs": true
#     }
#   }
# }
```

**✅ Pass Criteria:** `version` = "20.1.0" and `database.connected` = true

---

### 3. Authentication Test

```bash
# Login as admin
curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@local","password":"admin123"}' | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "expiresIn": "12h",
#     "user": {
#       "id": 1,
#       "email": "admin@local",
#       "role": "admin"
#     }
#   }
# }

# Save token for next tests:
export TOKEN="<paste_token_here>"
```

**✅ Pass Criteria:** Received JWT token, role = "admin"

---

### 4. RBAC Test (Admin-Only Route)

```bash
# Admin-only maintenance job
curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/jobs/maintenance \
  -H "Authorization: Bearer $TOKEN" | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "duration": <milliseconds>,
#     "tasks_completed": 4,
#     "tasks_total": 4
#   }
# }
```

**✅ Pass Criteria:** Returns success, tasks_completed = 4

---

### 5. RBAC Enforcement Test (Staff Login)

```bash
# Login as staff (should have limited permissions)
TOKEN_STAFF=$(curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff@local","password":"staff123"}' | jq -r '.data.token')

# Try admin route (should fail with 403)
curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/jobs/maintenance \
  -H "Authorization: Bearer $TOKEN_STAFF" | jq .

# Expected:
# {
#   "success": false,
#   "error": "Insufficient permissions. Required roles: admin"
# }
```

**✅ Pass Criteria:** Returns 403 with permission error

---

### 6. Cache Test (If Redis enabled)

```bash
# First call (MISS)
time curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary -o /dev/null

# Second call (HIT - should be faster)
time curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary -o /dev/null

# Check cache header
curl -I https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary | grep -i x-cache
# Expected: X-Cache: HIT (on second call)
```

**✅ Pass Criteria:** Second call is faster, X-Cache: HIT header present

---

### 7. Prometheus Metrics Test

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/metrics | head -n 40

# Expected output (Prometheus text format):
# # HELP http_request_duration_seconds Duration of HTTP requests in seconds
# # TYPE http_request_duration_seconds histogram
# http_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/items",status_code="200"} 12
# ...
# # HELP nodejs_eventloop_lag_seconds Lag of event loop in seconds.
# # TYPE nodejs_eventloop_lag_seconds gauge
# nodejs_eventloop_lag_seconds 0.000123456
```

**✅ Pass Criteria:** Returns Prometheus-format metrics (starts with # HELP)

---

### 8. Rate Limiting Test

```bash
# Fire 105 requests quickly (limit is 100)
for i in {1..105}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://inventory-backend-7-agent-build.up.railway.app/api/health)
  echo "Request $i: HTTP $STATUS"
  if [ "$STATUS" == "429" ]; then
    echo "✅ Rate limit triggered at request $i"
    break
  fi
done

# Expected: Status 429 after ~100 requests
```

**✅ Pass Criteria:** Receives 429 Too Many Requests after 100 calls

---

### 9. Database Integrity Test

```bash
# Verify v20.0 data still exists
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/items | jq '.count'
# Expected: 7 (or current count)

curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary | jq '.data'
# Expected: totals match v20.0 data
```

**✅ Pass Criteria:** Item count unchanged, data intact

---

### 10. CRUD Operations Test

```bash
# Create new item (requires staff token)
TOKEN_STAFF=$(curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff@local","password":"staff123"}' | jq -r '.data.token')

curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_STAFF" \
  -d '{"sku":"V20_1-TEST","name":"V20.1 Test Item","category":"Test","uom":"ea","par_level":10}' | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "id": 8,
#     "sku": "V20_1-TEST",
#     "name": "V20.1 Test Item"
#   }
# }

# Verify creation
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/items/V20_1-TEST | jq .
```

**✅ Pass Criteria:** Item created, can be retrieved

---

## STEP 4: VALIDATION CHECKLIST

Mark each as complete:

- [ ] Health endpoint returns v20.1.0
- [ ] Database connected (items_count shows data)
- [ ] Redis connected (if enabled) OR features.caching = false
- [ ] Login successful for admin@local
- [ ] Login successful for staff@local
- [ ] Login successful for viewer@local
- [ ] RBAC enforced (staff blocked from /jobs/maintenance)
- [ ] Cache HIT on second request (if Redis enabled)
- [ ] Prometheus metrics endpoint returns data
- [ ] Rate limiting triggers 429 after 100 requests
- [ ] All v20.0 items still exist
- [ ] CRUD operations work with authentication

---

## ROLLBACK (If Needed)

### Option 1: Railway Dashboard (30 seconds)

1. Railway → Deployments
2. Find v20.0 deployment (commit: 75ab1ce2ce)
3. Click ⋮ → "Redeploy"

### Option 2: Update railway.json (2 minutes)

```bash
# Edit railway.json
# Change: "startCommand": "node server-v20_1.js"
# To: "startCommand": "node railway-server-v20.js"

git add inventory-enterprise/backend/railway.json
git commit -m "rollback(v20.1): revert to v20.0"
git push origin main
```

### Option 3: Git Revert (1 minute)

```bash
git revert HEAD --no-edit
git push origin main
```

**See:** [inventory-enterprise/docs/V20_1_ROLLBACK.md](inventory-enterprise/docs/V20_1_ROLLBACK.md)

---

## KNOWN LIMITATIONS

1. **No Redis by default** - Caching disabled unless REDIS_URL is set
2. **Static test users** - Production would use database-backed users
3. **In-memory JWT** - Tokens don't persist across server restarts
4. **Basic rate limiting** - No IP whitelist or user-based tiers

---

## NEXT ACTIONS (After 48h Validation)

1. **Monitor metrics** for 48 hours
2. **Check cron execution** (runs at 02:05 UTC daily)
3. **Review logs** for errors or warnings
4. **Measure performance**:
   - Cache hit rate (target: >90%)
   - API latency (target: p95 <100ms)
   - Memory usage (target: <80%)
5. **Plan v20.2** enhancements

---

## ENV VARS REFERENCE

```bash
# REQUIRED
APP_VERSION=20.1.0
JWT_SECRET=gY/sGQFRdtqP9keGvCim2OL/1D4InyQnut8sNPsxVpM=

# OPTIONAL (with defaults if not set)
REDIS_URL=                                  # Redis disabled if not set
CACHE_TTL_ITEMS=300                         # 5 minutes
CACHE_TTL_SUMMARY=300                       # 5 minutes
RATE_LIMIT_WINDOW_MIN=5                     # 5 minute window
RATE_LIMIT_MAX=100                          # 100 req/window
CORS_ALLOWLIST=https://inventory-backend-7-agent-build.up.railway.app
CRON_DAILY=5 2 * * *                        # 02:05 UTC
LOG_LEVEL=info                              # debug/info/warn/error

# ALREADY SET (from v20.0)
PORT=8080                                   # Railway auto-assigns
NODE_ENV=production
DATABASE_PATH=/tmp/inventory_v20.db
```

---

**Deployment Completed By:** LYRA-7 Autonomous DevOps
**Timestamp:** 2025-11-06 05:28 EST
**GitHub Commit:** 929ae480c8
**Railway Service:** inventory-backend-staging
**Status:** ✅ READY FOR VALIDATION

---

## CONTACT

**Issues:** https://github.com/Neuropilotai/neuro-pilot-ai/issues
**Docs:** inventory-enterprise/docs/V20_1_DEPLOYMENT.md
**Rollback:** inventory-enterprise/docs/V20_1_ROLLBACK.md
