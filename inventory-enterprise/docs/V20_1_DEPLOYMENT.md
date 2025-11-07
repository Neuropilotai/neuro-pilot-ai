# V20.1 Deployment Guide

**Version:** 20.1.0
**Environment:** Staging (inventory-backend-7-agent-build.up.railway.app)
**Upgrade From:** v20.0-fast-track

---

## What's New in v20.1

✅ **Redis Caching** - Optional layer with 99%+ hit rates for summary endpoints
✅ **Prometheus Metrics** - `/metrics` endpoint for observability
✅ **JWT Authentication** - Token-based auth with RBAC (admin/staff/viewer)
✅ **Daily Cron Job** - Automated maintenance at 02:05 UTC (21:05 Toronto)
✅ **Rate Limiting** - 100 req / 5 min per IP
✅ **Structured Logging** - Pino for JSON logs with correlation IDs
✅ **Cache Invalidation** - Automatic cache clearing on writes

---

## Prerequisites

1. **Railway Account** - Access to staging service
2. **Environment Variables** - JWT_SECRET and optional REDIS_URL
3. **Node.js 18+** - For local testing (optional)

---

## Step 1: Set Environment Variables

### In Railway Dashboard

Navigate to: **Project → inventory-backend-staging → Variables**

**Required:**
```bash
APP_VERSION=20.1.0
JWT_SECRET=<generate_with_openssl_rand_base64_32>
```

**Optional (Recommended):**
```bash
# Add Railway Redis plugin first, then set:
REDIS_URL=redis://default:<password>@redis.railway.internal:6379

# Cache TTLs (seconds)
CACHE_TTL_ITEMS=300
CACHE_TTL_SUMMARY=300

# Rate Limiting
RATE_LIMIT_WINDOW_MIN=5
RATE_LIMIT_MAX=100

# CORS
CORS_ALLOWLIST=https://inventory-backend-7-agent-build.up.railway.app

# Cron (default is 02:05 UTC)
CRON_DAILY=5 2 * * *
```

### Generate JWT Secret

```bash
# On macOS/Linux:
openssl rand -base64 32

# Example output:
# Xk9vP2mN8qR5tY7wZ3aB6cE4fH1jL0oU
```

Copy this value and set as `JWT_SECRET` in Railway.

---

## Step 2: Optional - Add Redis Plugin

Redis dramatically improves performance but app works without it.

1. Railway Dashboard → **Add Plugin** → **Redis**
2. Copy the `REDIS_URL` from plugin details
3. Add to environment variables as `REDIS_URL`

---

## Step 3: Update railway.json

The `railway.json` file should point to the new server:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install --production=false"
  },
  "deploy": {
    "startCommand": "node server-v20_1.js",
    "healthcheckPath": "/api/health/status",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Step 4: Deploy

### Option A: Git Push (Triggers Auto-Deploy)

```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Ensure all v20.1 files are staged
git add inventory-enterprise/backend/server-v20_1.js
git add inventory-enterprise/backend/config/
git add inventory-enterprise/backend/middleware/auth-v20_1.js
git add inventory-enterprise/backend/middleware/cache-v20_1.js
git add inventory-enterprise/backend/metrics-v20_1.js
git add inventory-enterprise/backend/jobs/daily-v20_1.js
git add inventory-enterprise/backend/railway.json
git add .github/workflows/backend-v20_1.yml

# Commit
git commit -m "feat(v20.1): add Redis caching, Prometheus metrics, JWT+RBAC, cron, rate limiting"

# Push (triggers Railway deployment)
git push origin main
```

### Option B: Railway CLI

```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Deploy
railway up --service inventory-backend-staging
```

---

## Step 5: Monitor Deployment

```bash
# Option 1: Railway Dashboard
# https://railway.app/project/... → Deployments → View logs

# Option 2: Railway CLI
railway logs --service inventory-backend-staging

# Watch for:
# ✅ "Database connected: /tmp/inventory_v20.db"
# ✅ "Redis connected" (if configured)
# ✅ "Server running on port 8080"
# ✅ "Cron job scheduled: 5 2 * * * UTC"
```

---

## Step 6: Verify Deployment

### Health Check

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "version": "20.1.0",
#     "redis": { "connected": true },
#     "features": {
#       "auth": true,
#       "caching": true,
#       "metrics": true,
#       "rate_limiting": true,
#       "cron_jobs": true
#     }
#   }
# }
```

### Test Authentication

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
#       "role": "admin"
#     }
#   }
# }
```

Save the token for next steps:
```bash
export TOKEN="<your_token_here>"
```

### Test RBAC (Admin-Only Route)

```bash
# Maintenance job (requires admin role)
curl -fsS -X POST https://inventory-backend-7-agent-build.up.railway.app/jobs/maintenance \
  -H "Authorization: Bearer $TOKEN" | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "tasks_completed": 4,
#     "tasks_total": 4
#   }
# }
```

### Test Cache Performance

```bash
# First call (MISS - slower)
time curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary > /dev/null

# Second call (HIT - faster)
time curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary > /dev/null

# Check headers
curl -I https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary
# Look for: X-Cache: HIT
```

### Prometheus Metrics

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/metrics | head -n 30

# Expected output:
# # HELP http_request_duration_seconds Duration of HTTP requests in seconds
# # TYPE http_request_duration_seconds histogram
# http_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/items",status_code="200"} 24
# ...
```

### Rate Limiting Test

```bash
# Fire 101 requests (should get 429 on last one)
for i in {1..101}; do
  curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health > /dev/null
  echo "Request $i"
done

# Last requests should return:
# {
#   "success": false,
#   "error": "Too many requests, please try again later."
# }
```

---

## Test Users (Staging)

| Email | Password | Role | Permissions |
|-------|----------|------|-------------|
| admin@local | admin123 | admin | All routes |
| staff@local | staff123 | staff | CRUD, imports (no maintenance) |
| viewer@local | viewer123 | viewer | Read-only |

---

## Role Permission Matrix

| Route | Viewer | Staff | Admin |
|-------|--------|-------|-------|
| GET /api/items | ✅ | ✅ | ✅ |
| GET /api/inventory | ✅ | ✅ | ✅ |
| POST /api/items | ❌ | ✅ | ✅ |
| POST /api/items/import | ❌ | ✅ | ✅ |
| POST /api/inventory/import | ❌ | ✅ | ✅ |
| POST /jobs/maintenance | ❌ | ❌ | ✅ |

---

## Cron Schedule

**Job:** Daily Maintenance
**Schedule:** `5 2 * * *` (02:05 UTC)
**Toronto Time:** 21:05 EST / 22:05 EDT

**Tasks:**
1. Warm cache with inventory summary
2. Warm cache with active items
3. Database health check
4. Cache statistics collection

---

## Production Deployment Checklist

Before deploying v20.1 to production:

- [ ] Staging validated for 48+ hours
- [ ] No errors in Railway logs
- [ ] Cache hit rate >90% (check `/metrics`)
- [ ] Auth working for all 3 roles
- [ ] Rate limiting tested
- [ ] Cron job ran successfully at least once
- [ ] Generate production JWT_SECRET (different from staging)
- [ ] Configure production REDIS_URL
- [ ] Update CORS_ALLOWLIST to production domain
- [ ] Create separate Railway production service
- [ ] Test rollback procedure

---

## Troubleshooting

### Issue: "Invalid or expired token"

**Cause:** JWT_SECRET mismatch or token expired
**Fix:** Regenerate token via `/api/auth/login`

### Issue: Redis connection failed

**Cause:** REDIS_URL incorrect or Redis plugin not added
**Fix:** App works without Redis (caching disabled). Check Railway Redis plugin configuration.

### Issue: Cron job not running

**Cause:** Invalid cron expression
**Fix:** Verify `CRON_DAILY` format with https://crontab.guru

### Issue: Rate limit too aggressive

**Cause:** `RATE_LIMIT_MAX` too low
**Fix:** Increase `RATE_LIMIT_MAX` to 200-500 for staging

---

## Monitoring

### Key Metrics to Watch

1. **HTTP Request Duration** (`http_request_duration_seconds`)
   - p95 should be <100ms with cache
   - p99 should be <500ms

2. **Cache Hit Rate**
   - `cache_hits_total / (cache_hits_total + cache_misses_total)`
   - Target: >90%

3. **Request Rate**
   - `http_requests_total`
   - Monitor for unexpected spikes

4. **Database Query Time**
   - `database_query_duration_seconds`
   - Should be <50ms for simple queries

---

## Next Steps

After successful v20.1 deployment:

1. **Monitor for 48 hours** - Watch logs and metrics
2. **Test all CRUD operations** - Verify data integrity
3. **Validate cron execution** - Check logs at 02:05 UTC
4. **Plan v20.2** - Additional features (PostgreSQL, advanced auth, etc.)

---

**Deployed By:** LYRA-7 DevOps Architect
**Last Updated:** 2025-11-06
**Support:** https://github.com/Neuropilotai/neuro-pilot-ai/issues
