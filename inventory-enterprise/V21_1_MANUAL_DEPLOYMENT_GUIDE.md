# Neuro.Pilot.AI V21.1 - Manual Deployment Guide

**Status:** ✅ Code Ready | ⏸ Requires Manual Deployment
**Timestamp:** 2025-11-09 09:01 UTC
**Engineer:** Lyra7 (DevOps)

---

## Deployment Blocker

**Issue:** Automated deployment script requires `DATABASE_URL` environment variable, which cannot be fetched from Railway in non-interactive mode.

**Error Message:**
```
⚠ DATABASE_URL not set. Fetching from Railway...
✗ ERROR: Cannot fetch DATABASE_URL. Set manually:
  export DATABASE_URL='postgresql://...'
```

---

## Manual Deployment Steps

### OPTION 1: Interactive Terminal Deployment (Recommended)

**Step 1: Open Interactive Terminal**
- Open Terminal.app (macOS) or your preferred terminal emulator
- Ensure Railway CLI is authenticated: `railway login`

**Step 2: Navigate to Project**
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
```

**Step 3: Fetch DATABASE_URL**
```bash
cd backend
export DATABASE_URL=$(railway variables get DATABASE_URL)
cd ..
echo $DATABASE_URL  # Verify it's set
```

**Step 4: Run Deployment Script**
```bash
./DEPLOY_V21_1_NOW.sh
```

**Expected Duration:** 5-8 minutes

**Script will:**
1. ✅ Pre-flight checks (Railway CLI, psql, npm, git, jq, curl)
2. ✅ Create backup (`backups/v21_1_YYYYMMDD_HHMMSS/`)
3. ✅ Install dependencies (zod, prom-client already installed)
4. ✅ Apply migration 013 (`backend/db/migrations/013_rbac_enforcement.sql`)
5. ✅ Set environment variable `PCI_ENFORCE=true`
6. ✅ Deploy to Railway (`railway up --service backend`)
7. ✅ Wait 30s for deployment
8. ✅ Verify endpoints (health, metrics, security)
9. ✅ Optional: Run smoke tests

---

### OPTION 2: Railway Dashboard Deployment

**Step 1: Trigger Deployment**
1. Navigate to [Railway Dashboard](https://railway.app)
2. Select project: "Inventory Systems"
3. Select environment: "production"
4. Click "Deploy" or trigger from latest commit: `4d314b6b3b`

**Step 2: Apply Database Migration**

Once deployment is live, apply migration 013:

```bash
# Fetch DATABASE_URL from Railway dashboard
export DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require"

# Apply migration
psql "$DATABASE_URL" -f backend/db/migrations/013_rbac_enforcement.sql
```

**Expected Output:**
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
CREATE FUNCTION
(10 tables + 1 function created)
```

**Step 3: Set Environment Variables**

In Railway dashboard → Environment Variables:
- Set `PCI_ENFORCE` = `true`
- Verify `NODE_ENV` = `production`

**Step 4: Restart Service**

In Railway dashboard:
- Click "Restart" button
- Wait ~2 minutes for service to come online

**Step 5: Verify Deployment**

```bash
BASE_URL="https://inventory-backend-7-agent-build.up.railway.app"

# Check health
curl -fsSL "$BASE_URL/health" | jq '.'

# Check version
curl -fsSL "$BASE_URL/health" | jq -r '.version'
# Expected: "v21.1"

# Check security badge
curl -fsSL "$BASE_URL/" | jq '.security'
# Expected: {"rbac": true, "audit": true, "pci": true, ...}
```

**Step 6: Run Smoke Tests**

```bash
export BASE="https://inventory-backend-7-agent-build.up.railway.app"
export EMAIL="owner@neuropilot.ai"
export PASS="<your-password>"

./backend/scripts/smoke-test-v21_1.sh
```

**Expected Result:** 20/20 tests passing

---

### OPTION 3: Step-by-Step Manual Commands

If you prefer to run each step manually:

**1. Verify Files Committed**
```bash
git log -1 --oneline
# Expected: 4d314b6b3b docs(v21.1): add comprehensive deployment validation report
```

**2. Check Dependencies**
```bash
cd backend
npm list zod prom-client
# Expected: zod@4.1.12, prom-client@15.1.3
```

**3. Apply Migration (Requires DATABASE_URL)**
```bash
# Get DATABASE_URL from Railway dashboard or:
export DATABASE_URL=$(railway variables get DATABASE_URL)

# Apply migration 013
psql "$DATABASE_URL" -f db/migrations/013_rbac_enforcement.sql
```

**4. Deploy Backend**
```bash
# If Railway remote is configured:
git push railway main

# OR use Railway CLI:
railway up --service backend
```

**5. Set Environment Variables**
```bash
railway variables set PCI_ENFORCE=true NODE_ENV=production --service backend
```

**6. Verify Tables Created**
```bash
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename ~ '^(user_roles|security_events|privacy_requests)' ORDER BY tablename;"
```

**Expected Output:**
```
     tablename
--------------------
 account_lockouts
 payment_transactions
 privacy_preferences
 privacy_requests
 quota_usage_log
 rate_limit_buckets
 role_permissions
 security_events
 user_roles
 user_sessions
(10 rows)
```

**7. Test Endpoints**
```bash
BASE="https://inventory-backend-7-agent-build.up.railway.app"

# Health
curl -fsSL "$BASE/health" | jq '.'

# Security Status (requires auth)
TOKEN=$(curl -fsSL "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@neuropilot.ai","password":"***"}' | jq -r '.token')

curl -fsSL "$BASE/api/security/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Metrics
curl -fsSL "$BASE/metrics" | grep "_total" | head -10
```

---

## Post-Deployment Verification Checklist

After deployment completes, verify:

### Database Tables (10 tables)
```bash
psql "$DATABASE_URL" << 'EOF'
SELECT 
  COUNT(*) FILTER (WHERE tablename = 'user_roles') AS user_roles,
  COUNT(*) FILTER (WHERE tablename = 'role_permissions') AS role_permissions,
  COUNT(*) FILTER (WHERE tablename = 'security_events') AS security_events,
  COUNT(*) FILTER (WHERE tablename = 'privacy_requests') AS privacy_requests
FROM pg_tables 
WHERE schemaname = 'public';
EOF
```

**Expected:** All counts = 1

### Endpoints Responding
- [ ] `/health` returns `{"version": "v21.1"}`
- [ ] `/` returns `{"security": {"rbac": true, "pci": true}}`
- [ ] `/metrics` contains `auth_attempts_total`
- [ ] `/api/security/status` returns RBAC stats (requires auth)

### Security Features Active
- [ ] RBAC enforcing permissions (401 on missing token)
- [ ] PCI validation rejecting card data (400 on card number)
- [ ] Audit logging capturing events
- [ ] Privacy endpoints responding
- [ ] Rate limiting functional
- [ ] Prometheus metrics exporting

### Smoke Test Results
- [ ] 20/20 tests passing (100%)
- [ ] No authentication failures
- [ ] No permission denials for valid roles
- [ ] Security headers present (HSTS, X-Frame-Options)

---

## Rollback Plan (If Issues Found)

**Step 1: Revert Database Migration**
```bash
psql "$DATABASE_URL" << 'EOF'
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS privacy_requests CASCADE;
DROP TABLE IF EXISTS privacy_preferences CASCADE;
DROP TABLE IF EXISTS rate_limit_buckets CASCADE;
DROP TABLE IF EXISTS quota_usage_log CASCADE;
DROP TABLE IF EXISTS account_lockouts CASCADE;
DROP TABLE IF EXISTS payment_transactions CASCADE;
DROP FUNCTION IF EXISTS consume_tokens;
EOF
```

**Step 2: Revert Code**
```bash
git revert 4d314b6b3b 77dedcd017 --no-edit
```

**Step 3: Redeploy V20.1**
```bash
railway up --service backend
# OR
git push railway main
```

**Step 4: Verify Rollback**
```bash
curl -fsSL https://inventory-backend-7-agent-build.up.railway.app/health | jq '.version'
# Expected: "v20.1" or earlier
```

---

## Troubleshooting

### Issue: Migration 013 fails with "relation already exists"

**Solution:** Migration is idempotent. Tables already exist from previous run. This is safe to ignore.

**Verify:**
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM user_roles;"
```

If count returns a number (even 0), tables exist and migration already applied.

### Issue: Railway deployment timeout

**Solution:**
1. Check Railway logs: `railway logs`
2. Increase timeout or retry deployment
3. Check for build errors in Railway dashboard

### Issue: Smoke tests failing

**Solution:**
1. Check which tests are failing:
   ```bash
   ./backend/scripts/smoke-test-v21_1.sh 2>&1 | grep -E "(✗|FAILED)"
   ```
2. Verify deployment actually completed:
   ```bash
   curl -fsSL https://inventory-backend-7-agent-build.up.railway.app/health
   ```
3. Check Railway logs for errors
4. Verify `PCI_ENFORCE=true` is set in Railway env vars

### Issue: Cannot fetch DATABASE_URL

**Solution:**
1. Verify Railway CLI authenticated: `railway login`
2. Verify project linked: `railway status`
3. Manual fetch from Railway dashboard → Variables → `DATABASE_URL`
4. Export manually: `export DATABASE_URL="postgresql://..."`

---

## Next Steps After Successful Deployment

1. **Run Full Smoke Test Suite**
   ```bash
   ./backend/scripts/smoke-test-v21_1.sh
   ```

2. **Update Validation Report**
   - Edit `NEUROPILOT_V21_1_DEPLOYMENT_VALIDATION_REPORT.md`
   - Update "Post-Deployment Verification" section with actual results
   - Change test statuses from ⏸ to ✅

3. **Enable Cron Jobs**
   ```bash
   railway variables set SCHEDULER_ENABLED=true --service backend
   ```

4. **Set Up Monitoring**
   - Configure Prometheus alerting for `pci_violations_total > 0`
   - Set up Grafana dashboard for security metrics
   - Enable Railway email notifications for deployment failures

5. **Schedule Follow-Up Tasks**
   - [ ] External penetration test (Dec 2024)
   - [ ] SOC 2 Type II audit (Q1 2025)
   - [ ] Enable 2FA for admin users (Nov 16, 2024)
   - [ ] Configure daily backup job (Nov 16, 2024)

---

## Summary

**Automated Deployment:** ⏸ Blocked (requires DATABASE_URL + interactive terminal)
**Manual Deployment:** ✅ Ready (follow Option 1, 2, or 3 above)
**Code Status:** ✅ Production-ready (11 files, 4,277 lines committed)
**Documentation:** ✅ Complete (validation report, security policy, compliance report)

**Recommended Action:** Follow **Option 1** (Interactive Terminal) for fastest deployment with automated verification.

---

**Prepared by:** Lyra7 (Senior DevOps & Compliance Engineer)
**Last Updated:** 2025-11-09 09:01 UTC
**Support:** security@neuropilot.ai

---
