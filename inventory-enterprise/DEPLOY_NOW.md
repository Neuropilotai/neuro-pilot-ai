# 🚀 Deploy V21.1 Now - Quick Start

**Status:** ✅ Code Ready | ⏸️ Awaiting Deployment
**Version:** V21.1 Security Hardening Package
**Commit:** 77dedcd017

---

## ⚡ Fastest Method (2 Commands)

Open Terminal.app and run:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
./quick-deploy-v21_1.sh
```

**Duration:** 5-8 minutes
**What it does:** Fetches DATABASE_URL → Runs deployment → Verifies with smoke tests

---

## 📋 Alternative: Step-by-Step

If quick-deploy fails, run these commands individually:

### 1. Navigate to Project
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
```

### 2. Fetch Database URL
```bash
cd backend
export DATABASE_URL=$(railway variables get DATABASE_URL)
cd ..
```

**If this fails:**
- Run `railway login` first
- Or manually copy DATABASE_URL from Railway dashboard → Variables

### 3. Run Deployment
```bash
./DEPLOY_V21_1_NOW.sh
```

### 4. Verify Deployment
```bash
export BASE="https://inventory-backend-7-agent-build.up.railway.app"
curl -fsSL "$BASE/health" | jq '.'
```

**Expected output:**
```json
{
  "status": "healthy",
  "version": "v21.1",
  "timestamp": "2025-11-09T..."
}
```

### 5. Run Smoke Tests
```bash
export EMAIL="owner@neuropilot.ai"
read -sp "Password: " PASS && echo
export PASS
./backend/scripts/smoke-test-v21_1.sh
```

**Expected:** 20/20 tests passing ✅

---

## 🌐 No Terminal? Use Railway Dashboard

### Step 1: Trigger Deployment
1. Go to https://railway.app
2. Select project: **Inventory Systems**
3. Select service: **backend**
4. Click **Deploy** button
5. Wait 2-3 minutes for build to complete

### Step 2: Apply Database Migration
In Railway dashboard → **Variables** → Copy DATABASE_URL value

Then in Terminal:
```bash
export DATABASE_URL="<paste-value-here>"
psql "$DATABASE_URL" -f backend/db/migrations/013_rbac_enforcement.sql
```

### Step 3: Set Environment Variables
In Railway dashboard → **Variables** → Add:
- `PCI_ENFORCE` = `true`
- `NODE_ENV` = `production`

Click **Restart** button

### Step 4: Verify
```bash
curl -fsSL https://inventory-backend-7-agent-build.up.railway.app/health | jq '.version'
# Expected: "v21.1"
```

---

## ✅ Post-Deployment Checklist

After deployment completes, verify:

- [ ] Health endpoint returns `version: "v21.1"`
- [ ] Security badge shows `{rbac: true, pci: true, audit: true}`
- [ ] Metrics endpoint exports Prometheus format
- [ ] 10 new database tables created (user_roles, security_events, etc.)
- [ ] 20/20 smoke tests passing
- [ ] No PCI violations in logs
- [ ] RBAC enforcing permissions (401 on missing token)

---

## 🔧 Troubleshooting

### "railway: command not found"
```bash
curl -fsSL https://railway.app/install.sh | sh
```

### "Cannot fetch DATABASE_URL"
1. Authenticate: `railway login`
2. Link project: `railway link`
3. Try again: `railway variables get DATABASE_URL`

Or manually copy from Railway dashboard → Variables

### "psql: command not found"
```bash
brew install postgresql@15
```

### Smoke tests failing
1. Check health endpoint is responding
2. Verify DATABASE_URL migration was applied
3. Check Railway logs for errors: `railway logs`
4. Verify PCI_ENFORCE=true in Railway variables

---

## 📚 Documentation

- **Full Deployment Guide:** `V21_1_MANUAL_DEPLOYMENT_GUIDE.md` (388 lines)
- **Validation Report:** `NEUROPILOT_V21_1_DEPLOYMENT_VALIDATION_REPORT.md` (834 lines)
- **Security Policy:** `docs/SECURITY_POLICY.md`
- **Compliance Report:** `docs/COMPLIANCE_REPORT.md`

---

## 🆘 Emergency Rollback

If deployment causes issues:

```bash
# Revert database
export DATABASE_URL=$(railway variables get DATABASE_URL)
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

# Revert code
git revert 77dedcd017 4d314b6b3b 868a25e16f --no-edit
railway up --service backend
```

---

## 🎯 What Gets Deployed

**Security Features:**
- ✅ RBAC with 6 roles and 40+ permissions
- ✅ JWT authentication with refresh tokens
- ✅ Audit logging (7-year retention)
- ✅ GDPR/CCPA privacy endpoints
- ✅ PCI DSS payment validation
- ✅ Rate limiting (token bucket)
- ✅ Prometheus metrics
- ✅ Helmet security headers

**Database Changes:**
- 10 new tables (migration 013)
- 1 PostgreSQL function (consume_tokens)
- 66 role-permission mappings

**Backend Changes:**
- 4 new middleware modules
- Updated server-v21_1.js
- 20-test smoke test suite

---

**Ready to deploy?** Run `./quick-deploy-v21_1.sh` now! 🚀
