# NeuroInnovate Enterprise v19.0 Deployment Runbook
**Autonomous Foundation → Railway Production**

> **Note:** Project renamed from NeuroNexus to NeuroInnovate Enterprise (v19.0)

---

## 🎯 **OBJECTIVE**
Deploy NeuroInnovate Enterprise v19.0 (Autonomous Foundation) to Railway with:
- Backend Node.js service (autonomous scheduler enabled)
- ML FastAPI service (forecasting & training)
- First daily intelligence report delivered at 02:15 UTC

**Deployment Time Target:** ≤45 minutes
**Rollback Time:** <5 minutes
**Zero-downtime deployment:** No (temporary service interruption acceptable)

---

## 📋 **PRE-DEPLOYMENT CHECKLIST**

- [ ] Code committed and pushed to `main` branch (commits: 814cf140a9, 6d86c6f0ba, 9326648516)
- [ ] Railway project exists: "Inventory Systems"
- [ ] Railway CLI authenticated: `railway whoami`
- [ ] Environment variables prepared (see `docs/ENV_VARS_V19.md`)
- [ ] Service JWT token generated for scheduler authentication
- [ ] SMTP credentials available for email notifications

---

## 🚀 **10-STEP DEPLOYMENT PROCEDURE**

### **STEP 1: Verify Code Repository**
```bash
cd /Users/davidmikulis/neuro-pilot-ai
git status
git log --oneline -5
```

**Expected Output:**
```
On branch main
Your branch is up to date with 'origin/main'.

9326648 feat: v19.0 Railway deployment package [PRODUCTION-READY]
6d86c6f feat: add NeuroNexus v19.0 Autonomous Foundation
...
```

**Validation:**
- All v19.0 code is committed
- Working directory is clean
- No uncommitted changes to critical files

---

### **STEP 2: Link Railway Project**
```bash
cd inventory-enterprise/backend
railway link
```

**Interactive Prompts:**
1. Select existing project: **Inventory Systems**
2. Select environment: **production**

**Expected Output:**
```
🎉 Linked to project: Inventory Systems (production)
```

**Validation:**
```bash
railway status
# Should show: Project: Inventory Systems, Service: [not set]
```

---

### **STEP 3: Deploy Backend Service**

**Option A: Railway Dashboard (Recommended for first deployment)**

1. Go to https://railway.app/dashboard
2. Select project: **Inventory Systems**
3. Click **New Service** → **GitHub Repo**
4. Select repository: `neuro-pilot-ai`
5. Configure service:
   - **Name:** `backend`
   - **Root Directory:** `inventory-enterprise/backend`
   - **Build Command:** (leave empty, uses `npm install`)
   - **Start Command:** `node server.js` (from Procfile)
   - **Health Check Path:** `/api/health`
   - **Port:** (Railway auto-detects from $PORT)

6. Click **Deploy**

**Expected Build Log (excerpt):**
```
Installing dependencies from package.json...
npm install
added 87 packages
Running start command: node server.js
Server listening on 0.0.0.0:3001
✅ Autonomous Scheduler started
```

**Option B: Railway CLI**
```bash
cd inventory-enterprise/backend
railway up --service backend
```

**Validation:**
```bash
# Get deployment URL
railway domain

# Test health endpoint
curl https://[backend-url].railway.app/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "uptime": 42,
  "scheduler": {
    "enabled": true,
    "nextRun": "2025-10-31T02:15:00.000Z"
  }
}
```

---

### **STEP 4: Deploy ML Service**

**Railway Dashboard:**

1. In **Inventory Systems** project, click **New Service**
2. Select same repository: `neuro-pilot-ai`
3. Configure service:
   - **Name:** `ml-service`
   - **Root Directory:** `inventory-enterprise/ml-service`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/status`
   - **Port:** (Railway auto-detects)

4. Click **Deploy**

**Expected Build Log:**
```
Installing Python dependencies...
pip install -r requirements.txt
Successfully installed fastapi uvicorn pandas numpy pydantic
Starting: uvicorn main:app --host 0.0.0.0 --port 8000
INFO: Application startup complete
```

**Validation:**
```bash
curl https://[ml-service-url].railway.app/status
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 30
}
```

---

### **STEP 5: Configure Backend Environment Variables**

Navigate to **backend service** → **Variables** tab in Railway Dashboard.

Copy-paste these variables (**replace placeholders with real values**):

```bash
# === Core Configuration ===
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# === ML Service URL ===
ML_URL=http://ml-service.railway.internal:8000

# === Database ===
DATABASE_URL=sqlite://backend/database.db

# === Authentication ===
JWT_SECRET=[your-jwt-secret-here]
JWT_REFRESH_SECRET=[your-refresh-secret-here]
SVC_JWT=[your-service-jwt-token-here]

# === Email Notifications ===
ADMIN_EMAIL=neuropilotai@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=[your-gmail-app-password]

# === Autonomous Scheduler ===
SCHEDULER_ENABLED=true
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true

# === Thresholds ===
MAX_HEALTH_FAILURES=3
MAPE_THRESHOLD=30
FORECAST_TIMEOUT_MS=600000

# === Feature Flags ===
AIOPS_ENABLED=true
GOVERNANCE_ENABLED=true
INSIGHT_ENABLED=true
COMPLIANCE_ENABLED=true
```

**Click "Save Changes"** → Service will automatically restart.

---

### **STEP 6: Configure ML Service Environment Variables**

Navigate to **ml-service** → **Variables** tab.

```bash
# === Core Configuration ===
LOG_LEVEL=info

# === Database Path ===
DB_PATH=../backend/database.db
```

**Note:** ML service shares the SQLite database with backend via shared volume (Railway handles this automatically).

**Click "Save Changes"** → Service restarts.

---

### **STEP 7: Verify Service Communication**

Test backend → ML service connectivity:

```bash
curl https://[backend-url].railway.app/api/forecast/recommendations

# This internally calls http://ml-service.railway.internal:8000/infer
```

**Expected Response (200 OK):**
```json
{
  "date": "2025-10-30",
  "recommendations": [],
  "modelVersion": "seasonal_naive_v1",
  "confidence": "medium"
}
```

If error occurs, check backend logs:
```bash
railway logs --service backend
```

Look for:
```
✅ ML service health check passed: http://ml-service.railway.internal:8000
```

---

### **STEP 8: Validate Autonomous Scheduler**

Check backend logs for scheduler initialization:

```bash
railway logs --service backend | grep -i scheduler
```

**Expected Log Output:**
```
INFO: Autonomous Scheduler starting...
INFO: Daily intelligence report scheduled for 02:15 UTC
INFO: Auto-retrain scheduled for weekly Sunday 03:00 UTC
✅ Autonomous Scheduler started
```

Test health endpoint to confirm scheduler status:
```bash
curl https://[backend-url].railway.app/api/health | jq '.scheduler'
```

**Expected:**
```json
{
  "enabled": true,
  "nextRun": "2025-10-31T02:15:00.000Z",
  "jobs": [
    {
      "name": "dailyIntelligenceReport",
      "schedule": "15 2 * * *",
      "lastRun": null
    },
    {
      "name": "weeklyRetrain",
      "schedule": "0 3 * * 0",
      "lastRun": null
    }
  ]
}
```

---

### **STEP 9: Execute Smoke Tests**

Run full smoke test suite:

```bash
# Backend health
curl -f https://[backend-url].railway.app/api/health || echo "❌ Backend health check failed"

# ML service health
curl -f https://[ml-service-url].railway.app/status || echo "❌ ML service health check failed"

# Forecast endpoint
curl -f https://[backend-url].railway.app/api/forecast/recommendations || echo "❌ Forecast API failed"

# Auth endpoint (should return 401 without token)
curl -I https://[backend-url].railway.app/api/inventory | grep "401"
```

**All checks should pass ✅**

Full smoke test documentation: `scripts/smoke-tests.md`

---

### **STEP 10: Monitor First Scheduled Run**

**Wait for first daily intelligence report at 02:15 UTC next day.**

Set up monitoring:
```bash
# Watch logs in real-time (starting 02:10 UTC)
railway logs --service backend --follow
```

**Expected log sequence (at 02:15 UTC):**
```
INFO: Daily intelligence report job triggered
INFO: Calling ML service for forecasts...
INFO: Received 127 forecast predictions
INFO: Generating executive summary via GPT-4...
INFO: Sending report to neuropilotai@gmail.com...
✅ Daily intelligence report sent successfully
```

**Check email inbox:** You should receive "NeuroNexus Daily Intelligence Report - [DATE]"

---

## ✅ **DEFINITION OF DONE**

- [x] Backend service deployed and healthy (status 200 from `/api/health`)
- [x] ML service deployed and healthy (status 200 from `/status`)
- [x] Backend can communicate with ML service (forecast API returns 200)
- [x] Autonomous scheduler is running (`scheduler.enabled: true`)
- [x] All environment variables configured correctly
- [x] No errors in Railway logs for past 5 minutes
- [x] Daily report scheduled for 02:15 UTC (visible in scheduler status)
- [x] All smoke tests pass (see Step 9)
- [x] Domain URLs accessible publicly
- [x] Railway services show "Active" status (green checkmark)

---

## 🔍 **QUICK DIAG: TOP 10 TROUBLESHOOTING CHECKS**

### 1. **Backend Service Won't Start**
```bash
railway logs --service backend | tail -50
```
Common causes:
- Missing `NODE_ENV` variable
- Port binding error (check server.js:637 uses `0.0.0.0`)
- Missing dependencies (check package.json)

**Fix:** Verify Procfile contains `web: node server.js`

---

### 2. **ML Service Won't Start**
```bash
railway logs --service ml-service | tail -50
```
Common causes:
- Missing `requirements.txt`
- Python version mismatch
- uvicorn port binding error

**Fix:** Verify Procfile contains `web: uvicorn main:app --host 0.0.0.0 --port $PORT`

---

### 3. **Health Check Fails (Backend)**
```bash
curl -v https://[backend-url].railway.app/api/health
```
Symptoms:
- 502 Bad Gateway
- Connection refused

**Fix:**
- Check `PORT` environment variable is NOT set manually (Railway injects it)
- Verify server.js listens on `process.env.PORT || 3001`
- Confirm health check path is `/api/health` (not `/health`)

---

### 4. **ML Service Unreachable from Backend**
```bash
railway logs --service backend | grep ML_URL
```
**Fix:**
- Verify `ML_URL=http://ml-service.railway.internal:8000` (NOT external URL)
- Both services must be in same Railway project
- Check ml-service is deployed and running

---

### 5. **Scheduler Not Starting**
```bash
curl https://[backend-url].railway.app/api/health | jq '.scheduler'
```
If `scheduler.enabled: false`:

**Fix:**
- Check `SCHEDULER_ENABLED=true` in backend variables
- Verify `SVC_JWT` token is set
- Check scheduler.js exists in backend directory

---

### 6. **Email Notifications Not Sending**
Check logs for SMTP errors:
```bash
railway logs --service backend | grep -i smtp
```

**Fix:**
- Verify SMTP credentials (Gmail app password, not regular password)
- Check `ADMIN_EMAIL` is valid
- Test with: `curl -X POST https://[backend-url]/api/test-email`

---

### 7. **Build Fails: "Module Not Found"**
```bash
railway logs --service backend | grep "Cannot find module"
```

**Fix:**
- Run `npm install` locally to verify package.json
- Check Railway build log for npm errors
- Verify `node_modules` is in `.gitignore`

---

### 8. **Database Connection Error**
```bash
railway logs --service backend | grep -i database
```

**Fix:**
- For SQLite: Verify `DATABASE_URL=sqlite://backend/database.db`
- Check database.db exists in backend directory
- Ensure write permissions (Railway persistent disk enabled)

---

### 9. **Service Restarts Continuously**
Check restart count:
```bash
railway status --service backend
```

If restarts > 5 in 5 minutes:

**Fix:**
- Check for crash logs: `railway logs --service backend | grep ERROR`
- Verify memory limits (Railway default: 512MB, upgrade if needed)
- Check for infinite loops in code

---

### 10. **Forecast API Returns 500 Error**
```bash
curl https://[backend-url]/api/forecast/recommendations -v
```

**Fix:**
- Check ML service is running: `curl https://[ml-service-url]/status`
- Verify database has inventory data
- Check backend logs for ML service timeout errors
- Increase `FORECAST_TIMEOUT_MS` if needed

---

## 📊 **DEPLOYMENT TIMELINE**

| Step | Task | Duration | Cumulative |
|------|------|----------|------------|
| 1 | Verify code repository | 2 min | 2 min |
| 2 | Link Railway project | 3 min | 5 min |
| 3 | Deploy backend service | 8 min | 13 min |
| 4 | Deploy ML service | 7 min | 20 min |
| 5 | Configure backend env vars | 5 min | 25 min |
| 6 | Configure ML env vars | 2 min | 27 min |
| 7 | Verify service communication | 5 min | 32 min |
| 8 | Validate scheduler | 3 min | 35 min |
| 9 | Execute smoke tests | 5 min | 40 min |
| 10 | Monitor first scheduled run | Wait for 02:15 UTC | — |

**Total Active Deployment Time:** ~40 minutes
**Buffer for issues:** +5 minutes
**Target:** ≤45 minutes

---

## 🔄 **ROLLBACK PROCEDURE**

See `docs/ROLLBACK_PLAN.md` for detailed rollback steps.

**Quick rollback (disable scheduler only):**
```bash
# Set SCHEDULER_ENABLED=false in Railway dashboard
# Service auto-restarts, scheduler stops
# Rollback time: <2 minutes
```

**Full rollback (revert to previous deployment):**
```bash
# Railway dashboard → Deployments tab → Select previous deployment → Rollback
# Rollback time: <5 minutes
```

---

## 📧 **POST-DEPLOYMENT NOTIFICATION**

Send notification to stakeholders:

**Subject:** ✅ NeuroNexus v19.0 Deployed to Production
**Body:**
```
NeuroNexus v19.0 (Autonomous Foundation) is now live on Railway.

🔗 Backend: https://[backend-url].railway.app
🔗 ML Service: https://[ml-service-url].railway.app

✅ All health checks passing
✅ Autonomous scheduler active
✅ First daily report scheduled for 02:15 UTC

Next steps:
- Monitor logs for first scheduled run
- Verify email delivery at 02:15 UTC
- Review forecast accuracy after 7 days

Runbook: V19_DEPLOYMENT_RUNBOOK.md
Support: neuro-pilot-ai/issues
```

---

## 📚 **RELATED DOCUMENTATION**

- **Manual Deployment Guide:** `AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md`
- **Environment Variables:** `docs/ENV_VARS_V19.md`
- **Smoke Tests:** `scripts/smoke-tests.md`
- **Rollback Plan:** `docs/ROLLBACK_PLAN.md`
- **Monorepo Layout:** `docs/MONOREPO_LAYOUT.md`
- **GitHub Actions:** `.github/workflows/autonomous_railway_deploy.yml`

---

**Last Updated:** 2025-10-30
**Version:** v19.0
**Maintainer:** DevOps Team
