# NeuroNexus v19.0 - Deployment Runbook

**Version:** v19.0 Autonomous Foundation
**Platform:** Railway (Backend + ML Service)
**Time to Deploy:** 30-45 minutes
**Date:** 2025-10-29

---

## 🚀 10-STEP DEPLOYMENT RUNBOOK

Follow these steps exactly to deploy v19.0 to Railway production:

### Step 1: Pre-Deployment Verification (5 min)

```bash
# Verify code is pushed to GitHub
git status
git log --oneline -1
# Expected: "chore: update package-lock.json for pino dependency" (or latest)

# Verify critical fix applied (server.js binds to 0.0.0.0)
grep "listen(PORT, '0.0.0.0'" inventory-enterprise/backend/server.js
# Expected: Match found on line 637

# Verify all deployment files exist
ls -l inventory-enterprise/railway.json
ls -l inventory-enterprise/backend/Procfile
ls -l inventory-enterprise/ml-service/Procfile
ls -l inventory-enterprise/.github/workflows/autonomous_railway_deploy.yml
# Expected: All files exist
```

**Checklist:**
- [ ] ✅ Latest code pushed to `main` branch
- [ ] ✅ `server.js` binds to `0.0.0.0` (not `127.0.0.1`)
- [ ] ✅ `railway.json`, Procfiles, workflow exist
- [ ] ✅ Database migrations ready (`migrations/002_autonomous_foundation.sql`)

---

### Step 2: Open Railway Dashboard (1 min)

1. Navigate to https://railway.app
2. Sign in with GitHub
3. Select project: **"Inventory Systems"**
4. Confirm environment: **production**

**Screenshot: You should see:**
- Project name: "Inventory Systems"
- Environment: production (selected)
- Existing services (if any)

---

### Step 3: Configure Backend Service (10 min)

#### 3A: Create or Update Service

**If backend service exists:**
- Click service card
- Go to **Settings**

**If creating new:**
- Click **+ New Service**
- Select **GitHub Repo** → `Neuropilotai/neuro-pilot-ai`

#### 3B: Set Root Directory & Commands

**Settings → General:**
```
Service Name: backend
Root Directory: inventory-enterprise/backend
Watch Paths: inventory-enterprise/backend/**
```

**Build:**
```
Build Command: (leave empty - auto-detected npm ci)
```

**Deploy:**
```
Start Command: node server.js
```

**Health Check:**
```
Enabled: ✅
Path: /api/health
Port: $PORT
Timeout: 100 seconds
```

#### 3C: Set Environment Variables

**Settings → Variables → Add all:**

```bash
NODE_ENV=production
SCHEDULER_ENABLED=true
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true
MAX_HEALTH_FAILURES=3
MAPE_THRESHOLD=30
BACKEND_URL=https://resourceful-achievement-production.up.railway.app
ML_URL=http://ml-service.railway.internal:8000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=<GET_FROM_GMAIL_APP_PASSWORDS>
JWT_SECRET=<GENERATE: openssl rand -hex 32>
DATA_KEY=f021d529b92313359f211a280f83d2d97fa9c551aa09c4f9f0272b4eaa4b077c
ADMIN_EMAIL=neuropilotai@gmail.com
ADMIN_PASSWORD=SecurePass123!
DATABASE_PATH=backend/database.db
LOG_LEVEL=info
```

**CRITICAL SECRETS (generate now):**
```bash
# JWT_SECRET:
openssl rand -hex 32
# Copy output → Railway Variables

# SMTP_PASS:
# 1. Go to https://myaccount.google.com/apppasswords
# 2. App: "Mail", Device: "Railway Backend"
# 3. Generate → Copy 16-char password → Railway Variables
```

---

### Step 4: Configure ML Service (5 min)

#### 4A: Create Service

- Click **+ New Service**
- Select **GitHub Repo** → `Neuropilotai/neuro-pilot-ai`
- Service name: `ml-service`

#### 4B: Set Root Directory & Commands

**Settings → General:**
```
Service Name: ml-service
Root Directory: inventory-enterprise/ml-service
Watch Paths: inventory-enterprise/ml-service/**
```

**Deploy:**
```
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

**Health Check:**
```
Enabled: ✅
Path: /status
Port: $PORT
Timeout: 30 seconds
```

#### 4C: Set Environment Variables

**Settings → Variables:**
```bash
LOG_LEVEL=INFO
PYTHONUNBUFFERED=1
MODEL_STORE=/data/models
FORECAST_HORIZON=28
```

---

### Step 5: Enable Auto-Deploy from GitHub (2 min)

**Backend service:**
1. Settings → **GitHub** tab
2. Repository: `Neuropilotai/neuro-pilot-ai` (already linked)
3. Branch: `main`
4. Auto-Deploy: **ON** (toggle)

**ML service:**
1. Same steps as backend

**Verification:**
- You should see: ✅ "Auto-deploy from main branch enabled"

---

### Step 6: Deploy Both Services (5 min)

**Option A: Trigger via Git Push (RECOMMENDED)**

```bash
# Empty commit to trigger deploy
git commit --allow-empty -m "deploy: trigger Railway v19.0 deployment"
git push origin main
```

**Option B: Manual Deploy in Railway**

1. Backend service → **Deployments** tab
2. Click **Deploy** button
3. Select commit: Latest (`6d86c6f0ba` or newer)
4. Click **Deploy**
5. Repeat for ML service

**Monitor build logs:**
- Backend: Watch for "Autonomous Scheduler started"
- ML Service: Watch for "Uvicorn running on..."

---

### Step 7: Monitor Deployment (5 min)

**Railway Dashboard → Services → Logs**

**Backend logs should show:**
```
Nixpacks detected: Node.js
Installing dependencies...
npm ci
...
Starting server...
🤖 Initializing NeuroNexus Autonomous Foundation (v19.0)...
✅ Autonomous Scheduler started
📊 Daily Forecast: 02:00 UTC
🔄 Weekly Retrain: Sunday 03:00 UTC
💓 Health Check: Every 5 minutes
Server listening on port 3000
```

**ML service logs should show:**
```
Nixpacks detected: Python
Installing requirements.txt...
...
INFO:     Started server process [1]
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Wait for:**
- Backend: Status **Active**, Health ✅
- ML Service: Status **Active**, Health ✅

**Typical build time:** 2-3 minutes per service

---

### Step 8: Run Smoke Tests (5 min)

```bash
# Test 1: Backend health
curl -sSf https://resourceful-achievement-production.up.railway.app/api/health | jq .
# Expected: {"status":"healthy","scheduler":{"enabled":true,...}}

# Test 2: ML service (via backend)
railway run --service backend curl -f http://ml-service.railway.internal:8000/status | jq .
# Expected: {"status":"healthy",...}

# Test 3: Scheduler enabled
curl -s https://resourceful-achievement-production.up.railway.app/api/health | jq '.scheduler.enabled'
# Expected: true

# Test 4: Environment variables set
railway run --service backend node -e "console.log({
  scheduler: process.env.SCHEDULER_ENABLED,
  ml_url: process.env.ML_URL,
  smtp: process.env.SMTP_HOST
})"
# Expected: All values present
```

**Full smoke test suite:**
```bash
# See: scripts/smoke-tests.md
# Run all 13 tests
```

---

### Step 9: Verify Autonomous Jobs (5 min)

**Wait 5 minutes, then check for first health check:**

```bash
railway logs --service backend | grep "health check"
```

**Expected output:**
```
⚡ Running scheduled health check...
✅ Backend health: OK
✅ ML service health: OK
✅ Database integrity: OK
Health check complete (105ms)
```

**Verify cron schedule:**
```bash
railway run --service backend date -u
# Should show UTC timezone (e.g., Wed Oct 29 14:00:00 UTC 2025)
```

---

### Step 10: Tag Release & Document (2 min)

```bash
# Tag deployment
git tag -a v19.0-deploy-$(date +%Y%m%d) -m "v19.0 deployed to production"
git push origin --tags

# Create deployment record
echo "v19.0 deployed on $(date)" >> docs/DEPLOYMENTS.log
git add docs/DEPLOYMENTS.log
git commit -m "docs: record v19.0 deployment"
git push origin main
```

**Final verification:**
- [ ] Backend: Active & Healthy
- [ ] ML Service: Active & Healthy
- [ ] Scheduler: Running (check logs)
- [ ] Health check: Ran within 5 minutes
- [ ] Smoke tests: All passed
- [ ] Release tagged: v19.0-deploy-YYYYMMDD
- [ ] Team notified: "v19.0 deployed successfully"

---

## ✅ Definition of Done

Your v19.0 deployment is **COMPLETE** when ALL items are checked:

- [ ] ✅ Backend service: **Active** + Health **Passing**
- [ ] ✅ ML service: **Active** + Health **Passing**
- [ ] ✅ Backend `/api/health` returns `scheduler.enabled: true`
- [ ] ✅ ML service `/status` returns `status: healthy`
- [ ] ✅ First health check logged within 5 minutes
- [ ] ✅ Backend → ML connectivity working (internal network)
- [ ] ✅ Database tables exist (forecasts, usage_history, etc.)
- [ ] ✅ SMTP connection verified (test email sent)
- [ ] ✅ JWT authentication working
- [ ] ✅ Auto-deploy enabled from GitHub `main` branch
- [ ] ✅ Smoke tests: 13/13 passed
- [ ] ✅ Release tagged in Git
- [ ] ✅ Monitoring confirmed: Railway metrics visible
- [ ] ✅ Next daily report scheduled: Tomorrow 02:15 UTC

**If all checked:** 🎉 **v19.0 DEPLOYMENT SUCCESSFUL**

**If any unchecked:** See "Quick Diag" section below

---

## 🔥 QUICK DIAG - Top 10 Failure Checks

Run these checks if deployment fails:

### 1. Health Check Fails (503 Service Unavailable)

**Check:**
```bash
railway logs --service backend | grep "listen\|port"
```

**Look for:**
```
Server listening on port 3000  # ✅ Good
```

**Common causes:**
- ❌ App not binding to `$PORT`
- ❌ App binding to `127.0.0.1` (should be `0.0.0.0`)
- ❌ App crashed during startup

**Fix:**
```bash
# Verify server.js line 637:
grep "listen(PORT" inventory-enterprise/backend/server.js
# Should show: listen(PORT, '0.0.0.0', ...)

# If wrong, fix and redeploy:
git add backend/server.js
git commit -m "fix: bind to 0.0.0.0 for Railway"
git push origin main
```

---

### 2. Build Fails (npm ci error)

**Check Railway logs:**
```
npm error Missing: pino@10.1.0 from lock file
```

**Cause:** `package-lock.json` out of sync with `package.json`

**Fix:**
```bash
cd inventory-enterprise/backend
npm install  # Regenerate package-lock.json
git add package-lock.json
git commit -m "chore: update package-lock.json"
git push origin main
```

---

### 3. Wrong Root Directory

**Check Railway Settings:**
```
Settings → General → Root Directory
```

**Should be:**
- Backend: `inventory-enterprise/backend`
- ML Service: `inventory-enterprise/ml-service`

**NOT:**
- ❌ `backend` (missing parent dir)
- ❌ `inventory-enterprise` (too high)
- ❌ Empty (repo root)

**Fix:** Update Root Directory in Railway UI → Redeploy

---

### 4. Environment Variables Missing

**Check:**
```bash
railway run --service backend node -e "console.log(process.env.SCHEDULER_ENABLED)"
```

**Expected:** `true`
**If undefined:** Variable not set in Railway

**Fix:**
- Railway Dashboard → backend → Variables
- Add `SCHEDULER_ENABLED=true`
- Service auto-redeploys

---

### 5. ML Service Unreachable

**Check:**
```bash
railway run --service backend curl -f http://ml-service.railway.internal:8000/status
```

**If fails:**
- Check ML service is running: Railway Dashboard → ml-service → Status
- Check service name exact match: `ml-service` (not "ml_service" or "mlservice")
- Check `ML_URL` in backend Variables: `http://ml-service.railway.internal:8000`

---

### 6. Health Check Path Wrong

**Check Railway Settings:**
```
Settings → Deploy → Health Check Path
```

**Should be:**
- Backend: `/api/health`
- ML Service: `/status`

**Test manually:**
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health
# Should return 200 OK with JSON
```

**If 404:** Path wrong, update in Railway Settings

---

### 7. Start Command Wrong

**Check Railway Settings:**
```
Settings → Deploy → Start Command
```

**Should be:**
- Backend: `node server.js`
- ML Service: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Check Procfile matches:**
```bash
cat inventory-enterprise/backend/Procfile
# web: node server.js
```

---

### 8. Scheduler Not Starting

**Check logs:**
```bash
railway logs --service backend | grep "Scheduler"
```

**Expected:**
```
✅ Autonomous Scheduler started
```

**If missing:**
- Check `SCHEDULER_ENABLED=true` in Variables
- Check `scheduler.js` imported in `server.js`
- Check for startup errors before scheduler init

---

### 9. SMTP Errors (Email Not Sending)

**Check:**
```bash
railway run --service backend node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
transport.verify().then(console.log).catch(console.error);
"
```

**Common errors:**
- "Invalid login": `SMTP_PASS` wrong (use Gmail App Password, not account password)
- "Connection timeout": Firewall blocks port 587
- "Authentication failed": 2FA enabled but no App Password

**Fix:** Regenerate Gmail App Password at https://myaccount.google.com/apppasswords

---

### 10. Auto-Deploy Not Triggering

**Check GitHub integration:**
```
Railway Dashboard → Settings → GitHub
```

**Should show:**
- ✅ Repository connected: `Neuropilotai/neuro-pilot-ai`
- ✅ Auto-Deploy: ON
- ✅ Branch: `main`

**Test manually:**
```bash
git commit --allow-empty -m "test: trigger Railway deploy"
git push origin main
# Watch Railway Dashboard for new deployment
```

**If still doesn't trigger:**
- Check watch paths: `inventory-enterprise/backend/**`
- Verify files changed match watch paths: `git diff --name-only HEAD~1 HEAD`

---

## 🆘 Emergency Rollback

If deployment catastrophically fails:

```bash
# Method 1: Disable scheduler (30 seconds)
# Railway Dashboard → backend → Variables → SCHEDULER_ENABLED=false

# Method 2: Redeploy previous deployment (2 minutes)
# Railway Dashboard → backend → Deployments → Select previous → Redeploy

# Method 3: Git revert (5 minutes)
git revert HEAD --no-edit
git push origin main
```

**See full rollback procedures:** `docs/ROLLBACK_PLAN.md`

---

## 📞 Support Contacts

| Issue | Contact | Response Time |
|-------|---------|---------------|
| **P0 - Production down** | On-call + CTO | < 15 min |
| **P1 - Degraded** | On-call engineer | < 1 hour |
| **P2 - Non-critical** | Dev team Slack | < 4 hours |

**Railway Support:** https://railway.app/help

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| `AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md` | Full deployment guide with screenshots |
| `docs/ENV_VARS_V19.md` | Environment variables reference |
| `scripts/smoke-tests.md` | Post-deployment test suite |
| `docs/ROLLBACK_PLAN.md` | Rollback procedures |
| `docs/MONOREPO_LAYOUT.md` | Path mapping reference |
| `railway.json` | Railway configuration |

---

## ⏰ Post-Deployment Timeline

**Immediate (< 15 minutes):**
- ✅ Services healthy
- ✅ First health check runs

**Next 24 hours:**
- ⏰ Tomorrow 02:00 UTC - First daily forecast runs
- ⏰ Tomorrow 02:15 UTC - First daily report email sent
- ✅ Monitor logs for errors

**Next 7 days:**
- ⏰ Sunday 03:00 UTC - First weekly retrain runs
- ✅ Verify forecast accuracy (MAPE < 30%)
- ✅ Confirm 45+ reorder recommendations generated

**Next 30 days:**
- ✅ Monitor uptime (target: 99.9%)
- ✅ Track forecast coverage (target: 100%)
- ✅ Review compliance reports

---

**END OF RUNBOOK**
**Status:** Ready for production deployment
**Last Updated:** 2025-10-29
**Next Review:** After first deployment

---

## 🎯 Quick Start (Copy-Paste Commands)

```bash
# 1. Verify code
git status && git log --oneline -1

# 2. Deploy (trigger Railway auto-deploy)
git commit --allow-empty -m "deploy: v19.0 to production"
git push origin main

# 3. Wait 5 minutes, then test
curl -sSf https://resourceful-achievement-production.up.railway.app/api/health | jq '.scheduler.enabled'

# 4. Verify within 10 minutes
railway logs --service backend | grep "Autonomous Scheduler started"

# 5. Tag release
git tag -a v19.0-prod -m "v19.0 production deployment"
git push origin v19.0-prod

# Done! 🎉
```
