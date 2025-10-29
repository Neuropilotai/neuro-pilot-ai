# NeuroNexus v19.0 Autonomous Foundation - Railway Deployment Guide

**Version:** v19.0
**Platform:** Railway (Backend + ML Service)
**Deployment Mode:** Manual via Railway Dashboard + Auto-Deploy from GitHub
**Estimated Time:** 30-45 minutes
**Cron Timezone:** UTC (critical)

---

## 📋 Prerequisites

- ✅ Code pushed to GitHub (commits: 814cf140a9, 6d86c6f0ba)
- ✅ Railway account with "Inventory Systems" project
- ✅ GitHub repo: `Neuropilotai/neuro-pilot-ai`
- ✅ SMTP credentials for email notifications
- ✅ JWT secret generated (`openssl rand -hex 32`)

---

## 🎯 Deployment Architecture

```
Railway Project: "Inventory Systems"
├── Service 1: backend (Node.js Express)
│   ├── Path: inventory-enterprise/backend
│   ├── Port: 3000 (or $PORT from Railway)
│   ├── Health: /api/health
│   └── Scheduler: Runs in-process (node-cron)
│
└── Service 2: ml-service (Python FastAPI)
    ├── Path: inventory-enterprise/ml-service
    ├── Port: 8000 (or $PORT from Railway)
    └── Health: /status
```

**Internal Communication:**
Backend → ML Service via `http://ml-service.railway.internal:8000`

---

## 🚀 Step-by-Step Deployment

### Step 1: Open Railway Dashboard

1. Navigate to https://railway.app
2. Sign in with GitHub
3. Select project: **"Inventory Systems"**
4. You should see existing services (if any)

**What you'll see:**
- Project overview with services list
- GitHub integration status
- Environment tabs (production, staging)

---

### Step 2: Link GitHub Repository & Enable Auto-Deploy

#### 2.1 Connect GitHub Repo (if not already connected)

1. Click **Settings** (gear icon) in top right
2. Navigate to **GitHub** tab
3. Click **Connect GitHub Repository**
4. Select: `Neuropilotai/neuro-pilot-ai`
5. Branch: `main`
6. Click **Connect**

#### 2.2 Enable Auto-Deploy

1. In GitHub settings, toggle **Auto-Deploy** to ON
2. Deployment trigger: **On every push to `main`**
3. Path filters: Leave blank for now (we'll fix in GH Actions)

**Screenshot callout:**
You should see: ✅ "Auto-deploy from main branch enabled"

---

### Step 3: Configure Backend Service

#### 3.1 Create or Update Backend Service

**If service exists (named "web" or "backend"):**
1. Click the service card
2. Go to **Settings**

**If creating new:**
1. Click **+ New Service**
2. Select **GitHub Repo**
3. Choose `Neuropilotai/neuro-pilot-ai`

#### 3.2 Set Service Configuration

Navigate to **Settings** → **General**:

| Setting | Value |
|---------|-------|
| **Service Name** | `backend` |
| **Root Directory** | `inventory-enterprise/backend` |
| **Build Command** | `npm ci` (auto-detected) |
| **Start Command** | `node server.js` |
| **Watch Paths** | `inventory-enterprise/backend/**` |

**CRITICAL:** Ensure "Root Directory" points to `inventory-enterprise/backend`, NOT repo root!

#### 3.3 Set Backend Environment Variables

Navigate to **Variables** tab:

```bash
# === Core Configuration ===
NODE_ENV=production
PORT=3000
ADMIN_EMAIL=neuropilotai@gmail.com
ADMIN_PASSWORD=SecurePass123!
DATA_KEY=f021d529b92313359f211a280f83d2d97fa9c551aa09c4f9f0272b4eaa4b077c

# === JWT Authentication ===
JWT_SECRET=<GENERATE_WITH: openssl rand -hex 32>

# === Autonomous Foundation ===
SCHEDULER_ENABLED=true
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true
MAX_HEALTH_FAILURES=3
MAPE_THRESHOLD=30
FORECAST_TIMEOUT_MS=600000

# === Service URLs ===
BACKEND_URL=https://resourceful-achievement-production.up.railway.app
ML_URL=http://ml-service.railway.internal:8000
ML_SERVICE_URL=http://ml-service.railway.internal:8000

# === Email Notifications ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=<YOUR_GMAIL_APP_PASSWORD>

# === Database ===
DATABASE_PATH=backend/database.db
DATABASE_URL=sqlite://backend/database.db

# === Logging ===
LOG_LEVEL=info
```

**Security Notes:**
- ⚠️ NEVER commit secrets to repo
- Use Railway's "Variables" UI (encrypted at rest)
- For `SMTP_PASS`: Use Gmail App Password (not account password)
  - Generate at: https://myaccount.google.com/apppasswords
- For `JWT_SECRET`: Run `openssl rand -hex 32` locally

**Quick sanity test after setting:**
```bash
railway run --service backend bash -c 'echo $SCHEDULER_ENABLED'
# Should output: true
```

---

### Step 4: Configure ML Service

#### 4.1 Create ML Service

1. Click **+ New Service**
2. Select **GitHub Repo**
3. Choose `Neuropilotai/neuro-pilot-ai`
4. Service name: `ml-service`

#### 4.2 Set ML Service Configuration

Navigate to **Settings** → **General**:

| Setting | Value |
|---------|-------|
| **Service Name** | `ml-service` |
| **Root Directory** | `inventory-enterprise/ml-service` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Watch Paths** | `inventory-enterprise/ml-service/**` |

**CRITICAL:**
- Use `$PORT` (Railway injects this automatically)
- Do NOT hardcode port 8000 in start command

#### 4.3 Set ML Service Environment Variables

Navigate to **Variables** tab:

```bash
# === Python/FastAPI Configuration ===
LOG_LEVEL=INFO
PYTHONUNBUFFERED=1

# === Model Configuration ===
MODEL_STORE=/data/models
FORECAST_HORIZON=28

# === Port (Railway sets this automatically) ===
# PORT is set by Railway, but defaults to 8000 in code
```

**Note:** Railway will inject `PORT` automatically. Your `main.py` should use:
```python
port = int(os.environ.get("PORT", 8000))
uvicorn.run(app, host="0.0.0.0", port=port)
```

---

### Step 5: Set Up Health Checks

#### Backend Health Check

Navigate to **Settings** → **Health Checks**:

| Setting | Value |
|---------|-------|
| **Enabled** | ✅ Yes |
| **Path** | `/api/health` |
| **Port** | `$PORT` |
| **Timeout** | 100 seconds |
| **Interval** | 60 seconds |

#### ML Service Health Check

| Setting | Value |
|---------|-------|
| **Enabled** | ✅ Yes |
| **Path** | `/status` |
| **Port** | `$PORT` |
| **Timeout** | 30 seconds |
| **Interval** | 60 seconds |

---

### Step 6: Deploy Services

#### 6.1 Trigger Initial Deployment

**Option A: Manual Deploy (Recommended for first deploy)**
1. Click **Deploy** button on each service
2. Select commit: `6d86c6f0ba` (latest)
3. Click **Deploy**
4. Watch build logs in real-time

**Option B: Push to GitHub (if Auto-Deploy enabled)**
```bash
git commit --allow-empty -m "trigger: deploy v19.0 to Railway"
git push origin main
```

#### 6.2 Monitor Build Logs

**Backend build should show:**
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

**ML service build should show:**
```
Nixpacks detected: Python
Installing requirements.txt...
...
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Common build errors (see Troubleshooting Matrix below)**

---

### Step 7: Verify Deployments

#### 7.1 Check Service Status

Both services should show:
- 🟢 **Status: Active**
- ✅ **Health: Passing**
- 📊 **CPU/Memory metrics visible**

#### 7.2 Test Health Endpoints

**Backend:**
```bash
curl -sSf https://resourceful-achievement-production.up.railway.app/api/health | jq .
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T13:30:00.000Z",
  "service": "neuro-pilot-ai",
  "version": "1.0.0",
  "scheduler": {
    "enabled": true,
    "status": "running",
    "jobs": {
      "daily_forecast": "02:00 UTC",
      "weekly_retrain": "Sunday 03:00 UTC",
      "health_check": "*/5 * * * *"
    }
  }
}
```

**ML Service (via backend proxy or direct):**
```bash
# If ML service has public domain:
curl -sSf https://ml-service-production.up.railway.app/status | jq .

# Or test internal communication from backend:
railway run --service backend curl http://ml-service.railway.internal:8000/status
```

**Expected response:**
```json
{
  "status": "healthy",
  "service": "ml-forecasting",
  "version": "1.0.0",
  "model_version": "seasonal_naive_v1.0"
}
```

---

### Step 8: Verify Cron Scheduler (UTC Timing)

#### 8.1 Check Scheduler Initialization

View backend logs (Railway Dashboard → Logs):

```
[2025-10-29 13:30:00] 🤖 Initializing NeuroNexus Autonomous Foundation (v19.0)...
[2025-10-29 13:30:00] ✅ Autonomous Scheduler started
[2025-10-29 13:30:00] 📊 Daily Forecast: 02:00 UTC
[2025-10-29 13:30:00] 🔄 Weekly Retrain: Sunday 03:00 UTC
[2025-10-29 13:30:00] 💓 Health Check: Every 5 minutes
```

#### 8.2 Confirm First Health Check (Within 5 minutes)

```
[2025-10-29 13:35:00] ⚡ Running health check...
[2025-10-29 13:35:00] ✅ Backend health: OK
[2025-10-29 13:35:00] ✅ ML service health: OK
[2025-10-29 13:35:00] ✅ Database integrity: OK
```

#### 8.3 Verify UTC Timing

**CRITICAL:** Railway containers run in UTC by default.

**To confirm:**
```bash
railway run --service backend date -u
# Should output: Wed Oct 29 13:35:00 UTC 2025
```

**Next scheduled events:**
- ⏰ **Daily Forecast**: Tomorrow at 02:00 UTC
- ⏰ **Weekly Retrain**: Next Sunday at 03:00 UTC
- ⏰ **Health Check**: Every 5 minutes (next at :00, :05, :10, etc.)

**To see when next forecast will run:**
```bash
# If current time is 13:35 UTC, next forecast is:
# Tomorrow at 02:00 UTC (in ~12.5 hours)
```

---

### Step 9: Test Recommendations API

```bash
# Generate recommendations (requires authentication)
curl -X POST https://resourceful-achievement-production.up.railway.app/api/forecast/recommendations/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "serviceLevelA": 0.99,
    "serviceLevelB": 0.95,
    "serviceLevelC": 0.90
  }' | jq .
```

**Expected response:**
```json
{
  "success": true,
  "count": 150,
  "timestamp": "2025-10-29T13:35:00.000Z",
  "recommendations": [
    {
      "item_id": 1,
      "item_name": "Widget A",
      "sku": "WDG-001",
      "abc_class": "A",
      "current_stock": 100,
      "reorder_point": 250,
      "safety_stock": 50,
      "daily_demand": 10,
      "lead_time_days": 7,
      "should_reorder": false
    }
  ]
}
```

---

## ✅ Smoke Test Checklist

Run these tests after deployment:

- [ ] **Backend health endpoint responds 200 OK**
  ```bash
  curl -sSf https://resourceful-achievement-production.up.railway.app/api/health
  ```

- [ ] **ML service status endpoint responds 200 OK**
  ```bash
  railway run --service backend curl -f http://ml-service.railway.internal:8000/status
  ```

- [ ] **Scheduler initialization visible in logs**
  - Check Railway logs for "Autonomous Scheduler started"

- [ ] **First health check runs within 5 minutes**
  - Check logs for "Running health check"

- [ ] **Environment variables set correctly**
  ```bash
  railway run --service backend node -e "console.log({
    scheduler: process.env.SCHEDULER_ENABLED,
    ml_url: process.env.ML_URL,
    smtp: process.env.SMTP_HOST
  })"
  ```

- [ ] **Database migrations applied**
  ```bash
  railway run --service backend sqlite3 database.db ".tables"
  # Should show: forecasts, usage_history, reorder_recommendations, audit_log
  ```

- [ ] **Recommendations API accessible (with auth)**
  ```bash
  curl -X POST https://<backend>/api/forecast/recommendations/generate -H "Authorization: Bearer <token>"
  ```

- [ ] **SMTP configuration valid (send test email)**
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

- [ ] **First daily report scheduled for tomorrow 02:15 UTC**
  - Set reminder to check email at 02:15 UTC

- [ ] **Cron jobs registered (view scheduler state)**
  ```bash
  railway run --service backend node -e "
    const scheduler = require('./scheduler');
    console.log('Scheduler loaded:', !!scheduler.startScheduler);
  "
  ```

---

## 🎯 What You'll See When It Works

### Successful Deployment

**Railway Dashboard:**
- 🟢 Backend: Active, Health ✅
- 🟢 ML Service: Active, Health ✅
- 📊 CPU: 5-15%, Memory: 200-400 MB (backend), 300-500 MB (ml-service)

**Backend Logs (Real Example):**
```
[2025-10-29T13:30:00.000Z] Starting NeuroNexus v19.0...
[2025-10-29T13:30:00.500Z] 🤖 Initializing NeuroNexus Autonomous Foundation (v19.0)...
[2025-10-29T13:30:00.520Z] ✅ Autonomous Scheduler started
[2025-10-29T13:30:00.521Z]   📊 Daily Forecast: 02:00 UTC
[2025-10-29T13:30:00.522Z]   🔄 Weekly Retrain: Sunday 03:00 UTC
[2025-10-29T13:30:00.523Z]   💓 Health Check: Every 5 minutes
[2025-10-29T13:30:00.600Z] Server listening on port 3000
[2025-10-29T13:30:00.601Z] Environment: production
[2025-10-29T13:30:00.602Z] Database: SQLite (backend/database.db)
```

**ML Service Logs:**
```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### First Health Check (After ~5 Minutes)

```
[2025-10-29T13:35:00.000Z] ⚡ Running scheduled health check...
[2025-10-29T13:35:00.100Z] GET http://ml-service.railway.internal:8000/status → 200 OK
[2025-10-29T13:35:00.101Z] ✅ Backend health: OK
[2025-10-29T13:35:00.102Z] ✅ ML service health: OK
[2025-10-29T13:35:00.103Z] ✅ Database integrity: OK (PRAGMA integrity_check)
[2025-10-29T13:35:00.104Z] ✅ Audit chain valid (hash verification passed)
[2025-10-29T13:35:00.105Z] Health check complete (105ms)
```

### First Daily Forecast (Next Day 02:00 UTC)

```
[2025-10-30T02:00:00.000Z] ⚡ Starting daily forecast pipeline...
[2025-10-30T02:00:00.050Z] Step 1/8: Fetching active inventory items...
[2025-10-30T02:00:00.100Z]   → Found 150 active items
[2025-10-30T02:00:00.150Z] Step 2/8: Calling ML service for forecasts...
[2025-10-30T02:00:05.200Z]   → Generated 150 forecasts (5.05s)
[2025-10-30T02:00:05.250Z] Step 3/8: Classifying ABC inventory...
[2025-10-30T02:00:05.300Z]   → A: 20 items (80%), B: 30 items (15%), C: 100 items (5%)
[2025-10-30T02:00:05.350Z] Step 4/8: Calculating reorder recommendations...
[2025-10-30T02:00:06.400Z]   → Generated 45 reorder recommendations
[2025-10-30T02:00:06.450Z] Step 5/8: Saving to database...
[2025-10-30T02:00:06.500Z]   → Saved 150 forecasts, 45 recommendations
[2025-10-30T02:00:06.550Z] Step 6/8: Generating daily intelligence report...
[2025-10-30T02:00:08.600Z]   → Report generated (metrics collected)
[2025-10-30T02:00:08.650Z] Step 7/8: Sending email to neuropilotai@gmail.com...
[2025-10-30T02:00:10.700Z]   ✅ Email sent successfully
[2025-10-30T02:00:10.750Z] Step 8/8: Logging audit trail...
[2025-10-30T02:00:10.800Z] Daily forecast pipeline complete (10.75s)
```

### Sample Daily Report Email (Received at 02:15 UTC)

**Subject:** NeuroNexus Daily Intelligence Report - 2025-10-30

**Body (HTML):**
```
Executive Summary
─────────────────
✅ System Status: Healthy (99.9% uptime)
📊 Forecasts Generated: 150 items
🎯 Forecast Accuracy (MAPE): 12.3% (Target: <30%)
📦 Reorder Recommendations: 45 items ($12,450 total value)
🔐 Security: 0 incidents, 0 failed logins

Forecast Performance
────────────────────
Coverage: 100% (150/150 items)
Avg MAPE: 12.3%
RMSE: 8.5
Forecast Latency: 5.05s (Target: <10s)

Action Items
────────────────────
🟢 No critical actions required
📊 45 items need reordering (see recommendations)
✅ All systems operating normally
```

---

## 🔄 Rollback Plan

### Quick Rollback (Emergency)

**Option 1: Disable Scheduler (Safe Switch)**
```bash
# In Railway Dashboard → backend → Variables
SCHEDULER_ENABLED=false

# Redeploy backend
railway up --service backend
```
**Effect:** Stops all cron jobs, keeps API running

**Option 2: Revert to Last Known-Good Deployment**

1. **Railway Dashboard:**
   - Click backend service
   - Navigate to **Deployments** tab
   - Find last successful deployment (before v19.0)
   - Click **⋯** (three dots) → **Redeploy**

2. **Verify rollback:**
   ```bash
   curl https://resourceful-achievement-production.up.railway.app/api/health | jq .version
   # Should show old version
   ```

**Option 3: Revert Git Commit**

```bash
# Find last good commit
git log --oneline -10

# Revert to commit before v19.0
git revert 814cf140a9 6d86c6f0ba --no-edit

# Push (triggers auto-deploy if enabled)
git push origin main
```

### Tagging Releases

**Create release tag:**
```bash
# Tag current deployment
git tag -a v19.0 -m "Autonomous Foundation Release"
git push origin v19.0

# Tag future deployments
git tag -a v19.0.1 -m "Hotfix: scheduler timing"
git push origin v19.0.1
```

**Deploy specific tag in Railway:**
1. Settings → **GitHub** → **Deploy Branch/Tag**
2. Enter tag: `v19.0`
3. Click **Deploy**

---

## 🛠️ Troubleshooting Matrix

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **Build fails: "npm: command not found"** | Wrong buildpack detected | Add `nixpacks.toml` or `package.json` to root dir |
| **Build fails: "No package.json found"** | Root directory not set | Settings → Root Directory = `inventory-enterprise/backend` |
| **Health check fails (503)** | App not listening on `$PORT` | Ensure `server.js` uses `process.env.PORT` or 3000 |
| **Health check fails (404)** | Wrong health check path | Settings → Health Check Path = `/api/health` |
| **ML service unreachable** | Wrong internal URL | Use `http://ml-service.railway.internal:8000` (not localhost) |
| **Scheduler doesn't start** | `SCHEDULER_ENABLED` not set | Variables → Add `SCHEDULER_ENABLED=true` |
| **Cron runs at wrong time** | Container timezone not UTC | Railway defaults to UTC; verify with `date -u` |
| **Email not sending** | SMTP credentials wrong | Use Gmail App Password, not account password |
| **Database errors** | Migrations not run | Run `railway run sqlite3 database.db < migrations/002_autonomous_foundation.sql` |
| **"Module not found" errors** | Dependencies not installed | Check build logs; ensure `npm ci` ran successfully |
| **Port already in use** | Multiple start commands | Kill old process or use Railway's single start command |
| **JWT auth fails** | `JWT_SECRET` not set | Variables → Add `JWT_SECRET=<32-byte-hex>` |
| **Auto-deploy not triggering** | GitHub integration disabled | Settings → GitHub → Enable Auto-Deploy |
| **Deployment stuck "Building"** | Build timeout (>10 min) | Cancel and redeploy; check for large dependencies |
| **Memory limit exceeded** | Forecast processing too large | Reduce forecast batch size or increase Railway plan |

### Quick Diagnostic Commands

```bash
# 1. Check if backend is responding
curl -I https://resourceful-achievement-production.up.railway.app/api/health

# 2. Check environment variables
railway run --service backend env | grep SCHEDULER_ENABLED

# 3. Check port binding
railway logs --service backend | grep "listening on port"

# 4. Check scheduler initialization
railway logs --service backend | grep "Autonomous Scheduler"

# 5. Check ML service connectivity
railway run --service backend curl http://ml-service.railway.internal:8000/status

# 6. Check database tables
railway run --service backend sqlite3 database.db ".tables"

# 7. Check cron timing
railway run --service backend date -u

# 8. Test SMTP connection
railway run --service backend node -e "require('nodemailer').createTransport({host:'smtp.gmail.com',port:587,auth:{user:'neuropilotai@gmail.com',pass:process.env.SMTP_PASS}}).verify().then(console.log).catch(console.error)"

# 9. Check build logs
railway logs --service backend --deployment <deployment-id>

# 10. Force redeploy
railway up --service backend
```

---

## 🔒 Security Checklist

- [ ] **JWT_SECRET** set (32+ bytes, randomly generated)
- [ ] **SMTP_PASS** uses App Password (not account password)
- [ ] **DATA_KEY** set (64-char hex for encryption)
- [ ] **ADMIN_PASSWORD** changed from default
- [ ] **No secrets in .env files** committed to repo
- [ ] **Railway Variables** encrypted at rest
- [ ] **HTTPS enforced** (Railway does this by default)
- [ ] **CORS configured** (check `server.js` for allowlist)
- [ ] **Rate limiting active** (5 attempts per 15 min)
- [ ] **Audit log hash chain** enabled (tamper detection)

**To rotate secrets:**
```bash
# Generate new JWT secret
openssl rand -hex 32

# Update in Railway Dashboard → Variables
# Redeploy services
railway up --service backend
```

---

## ✅ Definition of Done

Your v19.0 deployment is complete when ALL of these are true:

- [ ] ✅ Backend service: **Active** and **Health Passing**
- [ ] ✅ ML service: **Active** and **Health Passing**
- [ ] ✅ Health endpoint returns 200 OK with `scheduler.enabled: true`
- [ ] ✅ ML service `/status` endpoint responds 200 OK
- [ ] ✅ First health check runs within 5 minutes (visible in logs)
- [ ] ✅ Scheduler logs show UTC cron times (02:00, 03:00 Sunday)
- [ ] ✅ All environment variables set (no undefined in logs)
- [ ] ✅ Recommendations API responds (with valid JWT)
- [ ] ✅ Database migrations applied (tables exist)
- [ ] ✅ SMTP test email sends successfully
- [ ] ✅ Auto-deploy from GitHub enabled
- [ ] ✅ First daily report email received at 02:15 UTC (next day)
- [ ] ✅ Rollback plan tested (dry run: disabled scheduler, re-enabled)
- [ ] ✅ Monitoring dashboards accessible (Railway metrics)
- [ ] ✅ Documentation updated (this guide shared with team)

**Final Validation Command:**
```bash
# Run all smoke tests
curl -sSf https://resourceful-achievement-production.up.railway.app/api/health | jq '.scheduler.enabled'
# Expected: true

railway run --service backend curl -f http://ml-service.railway.internal:8000/status | jq '.status'
# Expected: "healthy"
```

---

## 📞 Support & Next Steps

**If deployment succeeds:**
- ✅ Monitor logs for next 24 hours
- ✅ Wait for first daily report email (02:15 UTC)
- ✅ Set up Railway alerts (Settings → Notifications)
- ✅ Document any deviations from this guide

**If deployment fails:**
- 🔍 Review Troubleshooting Matrix above
- 📋 Check Quick Diagnostic Commands
- 📧 Email logs to team with error context
- 🔄 Rollback if critical (see Rollback Plan)

**Resources:**
- Railway Docs: https://docs.railway.app
- Railway Status: https://railway.statuspage.io
- This repo: https://github.com/Neuropilotai/neuro-pilot-ai

---

**END OF DEPLOYMENT GUIDE**
**Next:** See `scripts/smoke-tests.md` for detailed test suite
**Next:** See `docs/ROLLBACK_PLAN.md` for detailed rollback procedures
**Next:** See `docs/MONOREPO_LAYOUT.md` for architecture diagram
