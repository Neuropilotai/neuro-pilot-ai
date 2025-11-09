# 🚀 NeuroInnovate Enterprise v19.0 - Railway Deployment Summary
**Quick Reference Guide**

---

## ⚡ **ONE-COMMAND DEPLOYMENT**

```bash
git commit --allow-empty -m "deploy: v19.0 NeuroInnovate Enterprise"
git push origin main
```

**What This Does:**
- ✅ Triggers GitHub Actions CI/CD pipeline
- ✅ Railway auto-deploys backend service
- ✅ Railway auto-deploys ml-service
- ✅ Health checks verify deployment
- ✅ Autonomous scheduler starts automatically

---

## 📦 **RAILWAY PROJECT INFO**

| Property | Value |
|----------|-------|
| **Project Name** | NeuroInnovate Enterprise |
| **Project ID** | `6eb48b9a-8fe0-4836-8247-f6cef566f299` |
| **Dashboard** | https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299 |
| **Services** | backend, ml-service |
| **Branch** | main |
| **Auto-Deploy** | ✅ Enabled |

---

## 🎯 **CRITICAL ENVIRONMENT VARIABLES**

### **Backend Service:**
```bash
NODE_ENV=production
ML_URL=http://ml-service.railway.internal:8000
JWT_SECRET=[64-char-hex]
JWT_REFRESH_SECRET=[64-char-hex]
SVC_JWT=[service-jwt-token]
SMTP_PASS=[gmail-app-password]
SCHEDULER_ENABLED=true
```

### **ML Service:**
```bash
LOG_LEVEL=info
DB_PATH=../backend/database.db
```

**Set Variables:**
Railway Dashboard → Service → Variables → Raw Editor → Paste → Save

**Validate:**
```bash
node inventory-enterprise/backend/scripts/validate-env.mjs
```

---

## 🔧 **SERVICE CONFIGURATION**

### **Backend:**
- **Root:** `inventory-enterprise/backend`
- **Build:** `npm install`
- **Start:** `node server.js`
- **Health:** `/api/health` (100s timeout)
- **Port:** `0.0.0.0:${PORT}`

### **ML Service:**
- **Root:** `inventory-enterprise/ml-service`
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health:** `/status` (60s timeout)

---

## ✅ **VERIFICATION CHECKLIST**

After deployment, verify:

```bash
export BACKEND_URL="https://[your-backend].railway.app"
export ML_URL="https://[your-ml-service].railway.app"

# 1. Backend Health
curl -f "$BACKEND_URL/api/health"
# Expected: {"status":"healthy","scheduler":{"enabled":true}}

# 2. ML Service Health
curl -f "$ML_URL/status"
# Expected: {"status":"healthy"}

# 3. Scheduler Status
curl -s "$BACKEND_URL/api/health" | jq '.scheduler.enabled'
# Expected: true

# 4. Backend → ML Communication
curl -f "$BACKEND_URL/api/forecast/recommendations"
# Expected: 200 OK

# 5. Auth Protection
curl -I "$BACKEND_URL/api/inventory" | grep "401"
# Expected: 401 Unauthorized
```

---

## 📅 **AUTONOMOUS SCHEDULE**

| Job | Schedule | Description |
|-----|----------|-------------|
| **Daily Forecast** | 02:00 UTC | Generate predictions for all items |
| **Daily Report** | 02:15 UTC | Email intelligence report |
| **Weekly Retrain** | Sunday 03:00 UTC | Retrain ML models |

**Expected Email:**
- **Subject:** `NeuroInnovate Daily Intelligence Report - YYYY-MM-DD`
- **From:** `NeuroInnovate Autonomous System <neuropilotai@gmail.com>`
- **Delivery:** 02:15 UTC daily

---

## 🔄 **ROLLBACK PROCEDURES**

### **Quick Rollback (30 seconds):**
```bash
# Railway Dashboard → backend → Variables
SCHEDULER_ENABLED=false
# Save → Service restarts
```

### **Full Rollback (2 minutes):**
```bash
# Railway Dashboard → backend → Deployments
# Select previous deployment → Click ⋯ → Rollback
```

### **Git Rollback:**
```bash
git revert HEAD
git push origin main
```

---

## 📊 **MONITORING**

### **Watch Logs:**
```bash
railway logs --service backend --follow
railway logs --service ml-service --follow
```

### **Check Health:**
```bash
# Every 5 minutes for first hour
watch -n 300 curl -s "$BACKEND_URL/api/health"
```

### **Monitor First Report:**
```bash
# Set alarm for 02:10 UTC
railway logs --service backend --follow | grep "intelligence report"

# Expected at 02:15 UTC:
# ✅ Daily intelligence report sent successfully
```

---

## 🆘 **TROUBLESHOOTING**

| Issue | Quick Fix |
|-------|-----------|
| **Backend won't start** | Check logs: `railway logs --service backend` |
| **ML service unreachable** | Verify `ML_URL=http://ml-service.railway.internal:8000` |
| **Scheduler not starting** | Check `SCHEDULER_ENABLED=true` and `SVC_JWT` is set |
| **Email not sending** | Verify `SMTP_PASS` is Gmail app password |
| **Health check fails** | Verify server binds to `0.0.0.0` (not `127.0.0.1`) |

**Full Troubleshooting:** See `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag section

---

## 📚 **DOCUMENTATION**

| Document | Purpose |
|----------|---------|
| `PR_NEUROINNOVATE_V19_DEPLOYMENT.md` | Complete deployment plan (this PR) |
| `.env.production.template` | Environment variable template |
| `V19_DEPLOYMENT_RUNBOOK.md` | Detailed 10-step deployment procedure |
| `scripts/smoke-tests.md` | Post-deployment verification tests |
| `docs/ROLLBACK_PLAN.md` | Recovery procedures |

---

## 🎯 **DEFINITION OF DONE**

Deployment complete when:
- [ ] Both services show "Active" in Railway
- [ ] Backend health returns 200
- [ ] ML service status returns 200
- [ ] Scheduler enabled (check `/api/health`)
- [ ] Forecast API works
- [ ] No errors in logs (past 10 min)
- [ ] Email received at 02:15 UTC

---

## 🚀 **DEPLOYMENT COMMANDS**

### **Initial Setup:**
```bash
# 1. Connect Railway to GitHub
# Railway Dashboard → Settings → GitHub → Connect Repository

# 2. Set environment variables
# Copy from .env.production.template to Railway Variables

# 3. Enable auto-deploy
# Railway Dashboard → Service → Settings → Enable auto-deploy
```

### **Deploy:**
```bash
git commit --allow-empty -m "deploy: v19.0 NeuroInnovate Enterprise"
git push origin main
```

### **Verify:**
```bash
# Get URLs
railway status

# Test
curl https://[backend-url]/api/health
curl https://[ml-url]/status

# Run full verification
node scripts/verify-deployment.js
```

---

## ⏱️ **DEPLOYMENT TIMELINE**

| Phase | Duration | Total |
|-------|----------|-------|
| Setup environment variables | 10 min | 10 min |
| Enable auto-deploy | 5 min | 15 min |
| Push to main | 1 min | 16 min |
| Railway build & deploy | 8 min | 24 min |
| Health checks & verification | 5 min | 29 min |
| **Total** | — | **~30 min** |

---

## 📞 **SUPPORT**

**Railway Dashboard:**
https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299

**GitHub Actions:**
https://github.com/[your-org]/neuro-pilot-ai/actions

**Documentation:**
- Full deployment guide: `PR_NEUROINNOVATE_V19_DEPLOYMENT.md`
- Environment variables: `.env.production.template`
- Troubleshooting: `V19_DEPLOYMENT_RUNBOOK.md`

---

**Status:** 🟢 PRODUCTION-READY
**Version:** v19.0
**Last Updated:** 2025-10-30
