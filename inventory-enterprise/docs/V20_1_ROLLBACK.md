# V20.1 Rollback Procedures

**Environment:** Staging Only (inventory-backend-7-agent-build.up.railway.app)
**Rollback To:** v20.0-fast-track (railway-server-v20.js)

---

## When to Rollback

Rollback if you encounter:

- **Critical Errors:** 500 errors on health endpoints
- **Authentication Failures:** Users unable to login
- **Redis Crashes:** App crashes when Redis unavailable (should not happen)
- **Database Corruption:** Data loss or integrity issues
- **Performance Degradation:** Response times >5s
- **Cron Failures:** Maintenance job causes crashes

---

## Rollback Options

### Option A: Railway Dashboard (Fastest - 30 seconds)

**Best for:** Emergency rollbacks, immediate restoration

1. **Go to Railway Dashboard**
   - https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299
   - Navigate to `inventory-backend-staging` service

2. **View Deployments Tab**
   - Click "Deployments" in left sidebar
   - Find the last successful v20.0 deployment (before v20.1)
   - Look for commit message containing "v20.0-fast-track"

3. **Redeploy Previous Version**
   - Click the three dots (⋮) on the v20.0 deployment row
   - Select "Redeploy"
   - Confirm

4. **Verify**
   ```bash
   curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq '.data.version'
   # Expected: "20.0.0-fast-track"
   ```

**Duration:** ~30 seconds
**Downtime:** ~10-30 seconds during container restart

---

### Option B: Update railway.json (Safe - 2 minutes)

**Best for:** Controlled rollback with git history

1. **Update startCommand**

   Edit `inventory-enterprise/backend/railway.json`:

   ```json
   {
     "deploy": {
       "startCommand": "node railway-server-v20.js",
       "healthcheckPath": "/api/health/status",
       ...
     }
   }
   ```

2. **Commit and Push**

   ```bash
   cd /Users/davidmikulis/neuro-pilot-ai

   git add inventory-enterprise/backend/railway.json

   git commit -m "rollback(v20.1): revert to v20.0 server

   Reason: [describe reason]

   Changes:
   - startCommand: server-v20_1.js → railway-server-v20.js
   - Disables: Redis, JWT auth, metrics, cron
   - Preserves: Database, all v20.0 CRUD functionality
   "

   git push origin main
   ```

3. **Monitor Deployment**

   ```bash
   # Railway auto-deploys on push
   # Watch logs for successful startup

   # Verify v20.0 is running
   curl https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .
   ```

**Duration:** ~2 minutes
**Downtime:** ~10-30 seconds during container restart
**Benefit:** Full git history of rollback

---

### Option C: Git Revert (Nuclear - 1 minute)

**Best for:** Complete removal of v20.1 code from git history

1. **Find v20.1 Merge Commit**

   ```bash
   git log --oneline --grep="v20.1" -n 5

   # Example output:
   # abc1234 feat(v20.1): add Redis caching, metrics, JWT auth
   # def5678 merge: v20_1-upgrades branch
   ```

2. **Revert Merge Commit**

   ```bash
   # If v20.1 was a single commit:
   git revert <commit-sha> --no-edit

   # If v20.1 was a merge commit:
   git revert -m 1 <merge-commit-sha> --no-edit
   ```

3. **Push Revert**

   ```bash
   git push origin main
   ```

**Duration:** ~1 minute
**Downtime:** ~10-30 seconds
**Caution:** Creates revert commit in git history

---

## Post-Rollback Checklist

After rollback, verify v20.0 functionality:

### 1. Health Check

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .

# Expected v20.0 response (no Redis, no JWT):
{
  "success": true,
  "data": {
    "version": "20.0.0-fast-track",
    "database": {
      "connected": true,
      "items_count": 7
    }
  }
}
```

### 2. Database Integrity

```bash
# Verify items still exist
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/items | jq '.count'
# Expected: 7 (or your current count)

# Verify inventory still exists
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/inventory/summary | jq '.data'
```

### 3. CRUD Operations (No Auth Required in v20.0)

```bash
# Create item (no Bearer token needed in v20.0)
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/items \
  -H 'Content-Type: application/json' \
  -d '{"sku":"ROLLBACK-TEST","name":"Rollback Test Item","category":"Test","uom":"ea"}' | jq .

# Verify creation
curl https://inventory-backend-7-agent-build.up.railway.app/api/items/ROLLBACK-TEST | jq .
```

### 4. Verify v20.1 Features Are Gone

```bash
# These should fail in v20.0:

# Auth endpoint (404)
curl -I https://inventory-backend-7-agent-build.up.railway.app/api/auth/login
# Expected: 404 Not Found

# Metrics endpoint (404)
curl -I https://inventory-backend-7-agent-build.up.railway.app/metrics
# Expected: 404 Not Found

# Maintenance job (404)
curl -I https://inventory-backend-7-agent-build.up.railway.app/jobs/maintenance
# Expected: 404 Not Found
```

---

## What Gets Rolled Back

| Feature | v20.1 | v20.0 (After Rollback) |
|---------|-------|------------------------|
| Database CRUD | ✅ | ✅ |
| CSV Import | ✅ | ✅ |
| Health Endpoints | ✅ | ✅ |
| JWT Auth | ✅ | ❌ |
| RBAC | ✅ | ❌ |
| Redis Caching | ✅ | ❌ |
| Prometheus Metrics | ✅ | ❌ |
| Rate Limiting | ✅ | ❌ |
| Cron Jobs | ✅ | ❌ |
| Structured Logging | ✅ | ❌ (basic console.log) |

---

## Data Safety

**Good News:** All rollback options preserve data.

- **Database:** SQLite file persists across deployments
- **Items:** All items remain intact
- **Inventory:** All inventory records remain intact
- **Imports:** Previous CSV imports are not affected

**What You Lose:**
- Cached data in Redis (temporary data, regenerates on next request)
- JWT tokens (users need to re-login)
- Metrics history (not stored persistently)

---

## Troubleshooting Rollback Issues

### Issue: Rollback deployment fails

**Symptoms:** Railway deployment crashes after rollback
**Cause:** Environment variables conflict (JWT_SECRET set but not used)
**Fix:** Remove v20.1-specific environment variables:

```bash
# In Railway Dashboard → Variables, remove:
- JWT_SECRET
- REDIS_URL
- CACHE_TTL_ITEMS
- CACHE_TTL_SUMMARY
- RATE_LIMIT_WINDOW_MIN
- RATE_LIMIT_MAX
- CRON_DAILY
```

### Issue: Database connection failed

**Symptoms:** "Database connection failed" in logs
**Cause:** DATABASE_PATH changed or volume unmounted
**Fix:** Verify `DATABASE_PATH=/tmp/inventory_v20.db` in env vars

### Issue: Import endpoints not working

**Symptoms:** CSV import returns 500 error
**Cause:** v20.0 uses different CSV parser
**Fix:** Ensure CSV files have Unix line endings (LF, not CRLF)

```bash
# Convert line endings:
sed -i '' 's/\r$//' items_seed.csv
```

---

## Re-Deploying v20.1 After Rollback

If you rolled back due to a bug and want to re-deploy v20.1 after fixing:

1. **Fix the Issue**
   - Update server-v20_1.js or configuration
   - Test locally if possible

2. **Update railway.json**
   ```json
   {
     "deploy": {
       "startCommand": "node server-v20_1.js",
       ...
     }
   }
   ```

3. **Commit and Push**
   ```bash
   git add inventory-enterprise/backend/
   git commit -m "fix(v20.1): resolve [issue description]"
   git push origin main
   ```

4. **Re-verify All Tests** (see V20_1_DEPLOYMENT.md)

---

## Emergency Contacts

If rollback fails or data corruption occurs:

1. **Check Railway Logs:** Dashboard → Deployments → View Logs
2. **Database Backup:** SQLite file at `/tmp/inventory_v20.db` (ephemeral - no backup unless volume mounted)
3. **GitHub Issues:** https://github.com/Neuropilotai/neuro-pilot-ai/issues

---

## Rollback History Log

Document all rollbacks here:

| Date | Version | Rolled Back To | Reason | Duration | Data Loss |
|------|---------|----------------|--------|----------|-----------|
| YYYY-MM-DD | v20.1 | v20.0 | [Reason] | [Time] | None |

---

**Prepared By:** LYRA-7 DevOps Architect
**Last Updated:** 2025-11-06
**Environment:** Staging Only
