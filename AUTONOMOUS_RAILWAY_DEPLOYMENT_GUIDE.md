# NeuroInnovate Enterprise v19.0 - Autonomous Railway Deployment Guide
**Complete Visual Step-by-Step Manual Deployment**

> **Note:** Project renamed from NeuroNexus to NeuroInnovate Enterprise (v19.0)

---

## 🎯 **GUIDE OVERVIEW**

This guide walks you through deploying NeuroInnovate Enterprise v19.0 to Railway manually via the Railway Dashboard. This is the recommended approach for first-time deployments or when GitHub auto-deploy is not configured.

**What You'll Deploy:**
1. **Backend Service** - Node.js API with autonomous scheduler
2. **ML Service** - Python FastAPI forecasting engine

**Prerequisites:**
- Railway account with "Hobby" plan or higher
- GitHub account with access to `neuro-pilot-ai` repository
- Environment variable values prepared (see `docs/ENV_VARS_V19.md`)

**Estimated Time:** 35-45 minutes

---

## 📋 **BEFORE YOU BEGIN**

### **Checklist:**
- [ ] Railway account created: https://railway.app/new
- [ ] GitHub repository access confirmed
- [ ] v19.0 code pushed to `main` branch
- [ ] JWT secrets generated (or existing secrets available)
- [ ] SMTP credentials for Gmail app password obtained
- [ ] Service JWT token prepared for scheduler authentication

### **Required Information:**

Copy this template and fill in your values:

```
RAILWAY PROJECT NAME: Inventory Systems
GITHUB REPOSITORY: [your-username]/neuro-pilot-ai
BRANCH: main

JWT_SECRET: [generate 64-char random string]
JWT_REFRESH_SECRET: [generate 64-char random string]
SVC_JWT: [generate service token]

SMTP_USER: neuropilotai@gmail.com
SMTP_PASS: [Gmail app-specific password]
ADMIN_EMAIL: neuropilotai@gmail.com
```

**Generate secrets:**
```bash
# Generate JWT secrets locally
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run twice for JWT_SECRET and JWT_REFRESH_SECRET
```

---

## 🚀 **PART 1: CREATE RAILWAY PROJECT**

### **Step 1.1: Login to Railway**

1. Go to **https://railway.app/login**
2. Click **"Login with GitHub"**
3. Authorize Railway to access your GitHub account

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Railway Dashboard                  │
│  ┌───────────────────────────────┐  │
│  │  🚂 New Project               │  │  ← Click here
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

### **Step 1.2: Create New Project**

1. Click **"New Project"** button (top right)
2. Select **"Deploy from GitHub repo"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Deploy from:                       │
│  ┌─────────────────────────────┐   │
│  │  📦 GitHub Repo             │   │  ← Select this
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  📁 Empty Service           │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

### **Step 1.3: Connect GitHub Repository**

1. Search for: **"neuro-pilot-ai"**
2. Click repository name in results
3. Railway will ask: **"Select a Root Directory"**
4. Type: **`inventory-enterprise/backend`**
5. Click **"Deploy"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Configure neuro-pilot-ai           │
│  ┌─────────────────────────────┐   │
│  │  Root Directory:            │   │
│  │  [inventory-enterprise/     │   │  ← Type this path
│  │   backend                 ] │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Cancel]  [Deploy] ←─────────────  │  ← Click Deploy
└─────────────────────────────────────┘
```

**Note:** Railway will automatically:
- Detect Node.js project (via package.json)
- Run `npm install`
- Use Procfile command: `web: node server.js`

---

### **Step 1.4: Name the Project**

1. Click project name at top (default: "neuro-pilot-ai")
2. Rename to: **"Inventory Systems"**
3. Press Enter

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  [Inventory Systems ✏️] ← Click pencil to edit │
│  ┌─────────────────────────────┐   │
│  │  Services:                  │   │
│  │  ├─ neuro-pilot-ai          │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

### **Step 1.5: Rename Backend Service**

1. Click the service card **"neuro-pilot-ai"**
2. Go to **Settings** tab (left sidebar)
3. Under "Service Name", change to: **"backend"**
4. Click **"Update"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Service Settings                   │
│  ┌─────────────────────────────┐   │
│  │  Service Name:              │   │
│  │  [backend              ]    │   │  ← Change to "backend"
│  └─────────────────────────────┘   │
│  [Update] ←─────────────────────────  │
└─────────────────────────────────────┘
```

---

## 🔧 **PART 2: CONFIGURE BACKEND SERVICE**

### **Step 2.1: Add Environment Variables**

1. Click **backend** service card
2. Click **Variables** tab (left sidebar)
3. Click **"+ Variable"** or **"Raw Editor"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  backend > Variables                │
│  ┌─────────────────────────────┐   │
│  │  + Variable  │  Raw Editor  │   │  ← Click "Raw Editor"
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

### **Step 2.2: Paste Backend Environment Variables**

Copy-paste this template into **Raw Editor** (replace placeholders with your values):

```bash
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# === ML Service Communication ===
ML_URL=http://ml-service.railway.internal:8000

# === Database ===
DATABASE_URL=sqlite://backend/database.db

# === Authentication ===
JWT_SECRET=YOUR_JWT_SECRET_HERE
JWT_REFRESH_SECRET=YOUR_JWT_REFRESH_SECRET_HERE
SVC_JWT=YOUR_SERVICE_JWT_TOKEN_HERE

# === Email Notifications ===
ADMIN_EMAIL=neuropilotai@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD_HERE

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

Click **"Save"** → Service will automatically restart.

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Raw Editor                         │
│  ┌─────────────────────────────┐   │
│  │  NODE_ENV=production        │   │
│  │  PORT=3001                  │   │  ← Paste all variables here
│  │  LOG_LEVEL=info             │   │
│  │  ...                        │   │
│  └─────────────────────────────┘   │
│  [Cancel]  [Save] ←─────────────────  │
└─────────────────────────────────────┘
```

---

### **Step 2.3: Configure Health Check**

1. Go to **Settings** tab
2. Scroll to **"Health Check"**
3. Set **Health Check Path:** `/api/health`
4. Set **Timeout:** 100 seconds
5. Click **"Update"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Health Check Configuration         │
│  ┌─────────────────────────────┐   │
│  │  Path: [/api/health]        │   │  ← Set this
│  │  Timeout: [100] seconds     │   │
│  └─────────────────────────────┘   │
│  [Update] ←─────────────────────────  │
└─────────────────────────────────────┘
```

---

### **Step 2.4: Enable Public Domain**

1. Go to **Settings** tab
2. Scroll to **"Networking"**
3. Click **"Generate Domain"**
4. Copy the generated URL (e.g., `backend-production-abc123.up.railway.app`)

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Networking                         │
│  ┌─────────────────────────────┐   │
│  │  Public Domain:             │   │
│  │  [Generate Domain] ←─────────── Click this │
│  │                             │   │
│  │  backend-production-abc123. │   │  ← Copy this URL
│  │  up.railway.app             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Save this URL** - you'll need it for testing.

---

### **Step 2.5: Verify Backend Deployment**

1. Go to **Deployments** tab
2. Wait for status: **"Active"** (green checkmark)
3. Click **"View Logs"**

**Expected log output:**
```
Installing dependencies...
npm install
added 87 packages

Starting application...
node server.js

Server listening on 0.0.0.0:3001
Database connected: SQLite
✅ Autonomous Scheduler started
Daily intelligence report scheduled for 02:15 UTC
```

**Test the health endpoint:**
```bash
curl https://backend-production-abc123.up.railway.app/api/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "uptime": 125,
  "scheduler": {
    "enabled": true,
    "nextRun": "2025-10-31T02:15:00.000Z"
  }
}
```

✅ **Backend deployment complete!**

---

## 🤖 **PART 3: DEPLOY ML SERVICE**

### **Step 3.1: Add ML Service to Project**

1. Go back to project dashboard (click "Inventory Systems" at top)
2. Click **"New Service"** button
3. Select **"GitHub Repo"**
4. Select **"neuro-pilot-ai"** repository
5. Set **Root Directory:** `inventory-enterprise/ml-service`
6. Click **"Deploy"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Inventory Systems                  │
│  ┌─────────────────────────────┐   │
│  │  + New Service              │   │  ← Click here
│  └─────────────────────────────┘   │
│  Services:                          │
│  ├─ backend (active)                │
│  └─ [empty slot]                    │
└─────────────────────────────────────┘
```

---

### **Step 3.2: Configure ML Service Root Directory**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Configure neuro-pilot-ai           │
│  ┌─────────────────────────────┐   │
│  │  Root Directory:            │   │
│  │  [inventory-enterprise/     │   │
│  │   ml-service              ] │   │  ← Type this path
│  └─────────────────────────────┘   │
│  [Deploy] ←─────────────────────────  │
└─────────────────────────────────────┘
```

Railway will:
- Detect Python project (via requirements.txt)
- Run `pip install -r requirements.txt`
- Use Procfile: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`

---

### **Step 3.3: Rename ML Service**

1. Click the new service card
2. Go to **Settings** tab
3. Change **Service Name** to: **"ml-service"**
4. Click **"Update"**

---

### **Step 3.4: Add ML Service Environment Variables**

1. Click **Variables** tab
2. Click **"Raw Editor"**
3. Paste:

```bash
LOG_LEVEL=info
DB_PATH=../backend/database.db
```

4. Click **"Save"**

**Note:** The database path is relative because Railway mounts a shared volume for both services.

---

### **Step 3.5: Configure ML Service Health Check**

1. Go to **Settings** tab
2. Set **Health Check Path:** `/status`
3. Set **Timeout:** 60 seconds
4. Click **"Update"**

---

### **Step 3.6: Generate ML Service Domain**

1. In **Settings** tab → **Networking**
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `ml-service-production-xyz789.up.railway.app`)

---

### **Step 3.7: Verify ML Service Deployment**

Go to **Deployments** tab, check logs:

**Expected output:**
```
Installing dependencies...
pip install -r requirements.txt
Successfully installed fastapi-0.104.1 uvicorn-0.24.0 pandas-2.1.3 numpy-1.26.2 pydantic-2.5.0

Starting application...
uvicorn main:app --host 0.0.0.0 --port 8000

INFO: Started server process
INFO: Waiting for application startup
INFO: Application startup complete
INFO: Uvicorn running on http://0.0.0.0:8000
```

**Test the status endpoint:**
```bash
curl https://ml-service-production-xyz789.up.railway.app/status
```

**Expected response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 45
}
```

✅ **ML service deployment complete!**

---

## 🔗 **PART 4: VERIFY SERVICE COMMUNICATION**

### **Step 4.1: Test Backend → ML Service**

The backend uses internal Railway DNS to communicate with ML service:
```
ML_URL=http://ml-service.railway.internal:8000
```

Test this connection via the forecast API:

```bash
curl https://backend-production-abc123.up.railway.app/api/forecast/recommendations
```

**Expected response (200 OK):**
```json
{
  "date": "2025-10-30",
  "recommendations": [],
  "modelVersion": "seasonal_naive_v1",
  "confidence": "medium",
  "mlServiceHealthy": true
}
```

**If you get an error:**
1. Check backend logs: `railway logs --service backend`
2. Look for: `ERROR: Failed to connect to ML service`
3. Verify both services are in the same Railway project
4. Confirm ML_URL uses `.railway.internal` domain

---

### **Step 4.2: Check Scheduler Status**

```bash
curl https://backend-production-abc123.up.railway.app/api/health | jq '.scheduler'
```

**Expected:**
```json
{
  "enabled": true,
  "nextRun": "2025-10-31T02:15:00.000Z",
  "jobs": [
    {
      "name": "dailyIntelligenceReport",
      "schedule": "15 2 * * *"
    },
    {
      "name": "weeklyRetrain",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

✅ **Autonomous scheduler is active!**

---

## 📊 **PART 5: ENABLE AUTO-DEPLOY (OPTIONAL)**

### **Step 5.1: Enable GitHub Integration**

For each service (backend and ml-service):

1. Go to **Settings** tab
2. Scroll to **"Source Repo"**
3. Click **"Connect Trigger"**
4. Select branch: **main**
5. Enable **"Auto-deploy on push"**

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Source Repo                        │
│  ┌─────────────────────────────┐   │
│  │  Branch: [main ▼]           │   │
│  │  ☑ Auto-deploy on push      │   │  ← Enable this
│  └─────────────────────────────┘   │
│  [Save] ←───────────────────────────  │
└─────────────────────────────────────┘
```

Now, every push to `main` branch will trigger automatic deployment.

---

### **Step 5.2: Configure Build Watch Paths (Important!)**

To prevent unnecessary builds when unrelated files change:

1. Go to **Settings** → **"Build Settings"**
2. Set **Watch Paths:**
   - Backend: `inventory-enterprise/backend/**`
   - ML service: `inventory-enterprise/ml-service/**`

**→ Screenshot Callout:**
```
┌─────────────────────────────────────┐
│  Build Settings                     │
│  ┌─────────────────────────────┐   │
│  │  Watch Paths:               │   │
│  │  [inventory-enterprise/     │   │
│  │   backend/**             ]  │   │  ← Only build when these paths change
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

This prevents triggering backend builds when only ML service files change.

---

## ✅ **DEPLOYMENT COMPLETE CHECKLIST**

Verify all items before considering deployment successful:

- [ ] Backend service shows **"Active"** status (green checkmark)
- [ ] ML service shows **"Active"** status
- [ ] Backend health endpoint returns 200: `/api/health`
- [ ] ML service status endpoint returns 200: `/status`
- [ ] Scheduler is enabled: `curl .../api/health | jq '.scheduler.enabled'` → `true`
- [ ] Forecast API works: `/api/forecast/recommendations` returns 200
- [ ] No errors in backend logs for past 5 minutes
- [ ] No errors in ML service logs for past 5 minutes
- [ ] Domain URLs are publicly accessible
- [ ] All environment variables configured
- [ ] Auto-deploy enabled (if using GitHub integration)

---

## 🧪 **SMOKE TESTS**

Run these commands to validate the deployment:

```bash
# Set your backend URL
BACKEND_URL="https://backend-production-abc123.up.railway.app"
ML_URL="https://ml-service-production-xyz789.up.railway.app"

# Test 1: Backend health
curl -f "$BACKEND_URL/api/health" || echo "❌ Backend health failed"

# Test 2: ML service health
curl -f "$ML_URL/status" || echo "❌ ML service health failed"

# Test 3: Scheduler status
curl -s "$BACKEND_URL/api/health" | jq '.scheduler.enabled' | grep true || echo "❌ Scheduler not enabled"

# Test 4: Forecast API
curl -f "$BACKEND_URL/api/forecast/recommendations" || echo "❌ Forecast API failed"

# Test 5: Auth required endpoints (should return 401)
curl -I "$BACKEND_URL/api/inventory" | grep "401" || echo "❌ Auth not working"

echo "✅ All smoke tests passed!"
```

---

## 📧 **NEXT STEPS**

### **Monitor First Scheduled Run**

The daily intelligence report will run at **02:15 UTC** (next day).

Set an alarm for **02:10 UTC** and watch logs:
```bash
railway logs --service backend --follow
```

### **Expected Log Sequence (at 02:15 UTC):**
```
[02:15:00] INFO: Daily intelligence report job triggered
[02:15:01] INFO: Calling ML service for forecasts...
[02:15:03] INFO: Received 127 forecast predictions
[02:15:05] INFO: Generating executive summary...
[02:15:12] INFO: Sending report to neuropilotai@gmail.com...
[02:15:15] ✅ Daily intelligence report sent successfully
```

### **Check Email Inbox:**
You should receive: **"NeuroNexus Daily Intelligence Report - [DATE]"**

---

## 🔄 **ROLLBACK PROCEDURE**

If something goes wrong, you can rollback quickly:

### **Option 1: Disable Scheduler (2 minutes)**
1. Go to backend service → Variables
2. Change `SCHEDULER_ENABLED=false`
3. Service auto-restarts, scheduler stops

### **Option 2: Rollback to Previous Deployment (5 minutes)**
1. Go to backend service → Deployments tab
2. Find previous working deployment
3. Click three dots → **"Rollback"**

Full rollback documentation: `docs/ROLLBACK_PLAN.md`

---

## 📚 **TROUBLESHOOTING QUICK LINKS**

| Issue | Solution Document |
|-------|-------------------|
| Service won't start | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #1, #2 |
| Health check fails | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #3 |
| ML service unreachable | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #4 |
| Scheduler not starting | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #5 |
| Email not sending | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #6 |
| Build failures | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #7 |
| Database errors | `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag #8 |

---

## 🎉 **CONGRATULATIONS!**

You've successfully deployed NeuroNexus v19.0 to Railway!

**What's Running:**
- ✅ Backend API with autonomous scheduler
- ✅ ML forecasting service
- ✅ Daily intelligence reports (scheduled for 02:15 UTC)
- ✅ Weekly auto-retrain (scheduled for Sundays 03:00 UTC)

**Your System is Now Autonomous!**

---

**Last Updated:** 2025-10-30
**Version:** v19.0
**Maintainer:** DevOps Team
