# NeuroNexus Autonomous Foundation - Deployment Guide
## Phase 1: Zero-Touch Operations

**Version:** 1.0
**Date:** 2025-10-29
**Status:** Production-Ready

---

## 📦 What You're Deploying

A fully autonomous inventory management system that:
- ✅ Generates forecasts daily at 02:00 UTC (zero human trigger)
- ✅ Retrains models weekly on Sunday 03:00 UTC
- ✅ Monitors health every 5 minutes with auto-rollback
- ✅ Sends email reports automatically
- ✅ Maintains hash-chained audit trail

**Expected Impact:**
- 80%+ orders auto-generated
- < 10 min forecast latency
- MAPE < 30%
- 99.5%+ uptime with auto-rollback

---

## 🚀 Quick Start (30 Minutes)

### Prerequisites

```bash
# Required
- Node.js 18+
- Python 3.11+
- Railway CLI (npm install -g @railway/cli)
- Gmail account (for SMTP)

# Optional
- Slack webhook for alerts
- PagerDuty for critical alerts
```

### Step 1: Database Migration (5 min)

```bash
cd inventory-enterprise

# Run migration
sqlite3 backend/database.db < migrations/002_autonomous_foundation.sql

# Verify tables created
sqlite3 backend/database.db ".tables"
# Should see: usage_history, forecasts, reorder_recommendations, forecast_errors, audit_log
```

### Step 2: Install Dependencies (5 min)

```bash
# Backend dependencies
cd backend
npm install node-cron axios nodemailer pino

# ML service dependencies
cd ../ml-service
pip install fastapi uvicorn pandas numpy sqlite3

# Or use requirements.txt
pip install -r requirements.txt
```

### Step 3: Configure Environment (10 min)

```bash
# Copy template
cp .env.autonomous .env

# Edit with your values
nano .env
```

**Required Variables:**
```bash
# Backend
BACKEND_URL=https://your-api.railway.app
ML_URL=http://ml-service:8000

# Email (Gmail)
ADMIN_EMAIL=your-email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password  # Generate at https://myaccount.google.com/apppasswords

# Database
DATABASE_URL=sqlite://backend/database.db

# Service authentication
SVC_JWT=your-service-jwt-token
```

**Generate Service JWT:**
```bash
# In Node.js REPL
node
> const jwt = require('jsonwebtoken');
> jwt.sign({ service: 'scheduler', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '365d' })
# Copy this token to SVC_JWT
```

### Step 4: Wire Up Routes (5 min)

```bash
# Add to backend/server.js or app.js
```

```javascript
// Import scheduler
import './scheduler.js';  // This starts cron jobs

// Import recommendations routes
const recommendationsRouter = require('./routes/recommendations');
app.use('/api/forecast/recommendations', recommendationsRouter);
```

### Step 5: Deploy (5 min)

```bash
# Deploy ML service
cd ml-service
railway up --service ml-service

# Deploy backend (with scheduler)
cd ../backend
railway up

# Verify deployment
curl https://your-api.railway.app/api/health
curl http://your-ml-service.railway.app/status
```

---

## 📝 Detailed Setup

### Backend Integration

**1. Update server.js:**

```javascript
// backend/server.js
import express from 'express';
import './scheduler.js';  // ← ADD THIS (starts autonomous jobs)

const app = express();

// ... existing middleware ...

// Add recommendations routes
app.use('/api/forecast/recommendations', require('./routes/recommendations'));

// ... rest of server setup ...
```

**2. Database connection (if not already set):**

```javascript
// backend/database.js
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

const db = new sqlite3.Database(process.env.DATABASE_URL || 'backend/database.db');

// Promisify for async/await
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbRun = promisify(db.run.bind(db));

module.exports = {
  all: dbAll,
  get: dbGet,
  run: dbRun,
  raw: db
};
```

### ML Service Setup

**1. Create requirements.txt:**

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
pandas==2.1.3
numpy==1.26.2
pydantic==2.5.0
```

**2. Run ML service:**

```bash
# Development
cd ml-service
uvicorn main:app --reload --port 8000

# Production (Railway)
railway up --service ml-service
```

### Ops Guard Setup

**1. Make executable:**

```bash
chmod +x ops_guard.sh
```

**2. Deploy to monitoring server:**

```bash
# Option A: Run as systemd service (recommended)
sudo cp ops_guard.sh /usr/local/bin/neuronexus-ops-guard
sudo nano /etc/systemd/system/neuronexus-ops-guard.service
```

```ini
[Unit]
Description=NeuroNexus Ops Guard
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/neuronexus-ops-guard
Restart=always
Environment="BACKEND_URL=https://your-api.railway.app"
Environment="ADMIN_EMAIL=your-email@gmail.com"

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable neuronexus-ops-guard
sudo systemctl start neuronexus-ops-guard
sudo systemctl status neuronexus-ops-guard
```

**Option B: Run as cron (simpler):**

```bash
# Add to crontab
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * /path/to/ops_guard.sh >> /var/log/neuronexus_ops.log 2>&1
```

---

## 🧪 Testing

### 1. Test Forecast Generation

```bash
# Trigger manual forecast (via ML service)
curl -X POST http://localhost:8000/train/infer-latest \
  -H "Content-Type: application/json" \
  -d '{"mode": "daily"}'

# Should return:
# {"success": true, "count": 50, "avg_mape": 25.3}
```

### 2. Test Recommendation Generation

```bash
# Generate recommendations (via backend)
curl -X POST https://your-api.railway.app/api/forecast/recommendations/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SVC_JWT" \
  -d '{
    "serviceLevelA": 0.99,
    "serviceLevelB": 0.95,
    "serviceLevelC": 0.90
  }'

# Should return recommendations with A/B/C classification
```

### 3. Test Health Monitoring

```bash
# Check health endpoint
curl https://your-api.railway.app/api/health
# Should return: {"status":"healthy","timestamp":"..."}

# Check ML service
curl http://your-ml-service.railway.app/status
# Should return: {"status":"healthy","version":"1.0.0","uptime_seconds":...}

# Test ops_guard (manually)
./ops_guard.sh
# Should show: [INFO] Health OK
```

### 4. Test Scheduler

```bash
# Check if scheduler is running
ps aux | grep scheduler

# Check logs
railway logs --tail --filter scheduler

# Should see cron jobs registered:
# [INFO] Scheduler started (UTC timers active)
```

---

## 📊 Monitoring

### Daily Forecast Job (02:00 UTC)

**What to expect:**
- Email arrives around 02:15 UTC
- Subject: "NeuroNexus Daily Forecast & Reorder Suggestions"
- Contains: count of recommendations, sample items

**Logs to check:**
```bash
railway logs --filter scheduler | grep "daily forecast"
```

**Success indicators:**
```
[INFO] [cron] daily forecast job start
[INFO] [cron] daily forecast OK {"count":45}
[INFO] [email] sent {"subject":"NeuroNexus Daily Forecast..."}
```

### Weekly Retrain Job (Sunday 03:00 UTC)

**What to expect:**
- Runs every Sunday
- Email: "NeuroNexus Weekly Retrain Summary"
- Duration: 5-15 minutes

**Logs to check:**
```bash
railway logs --filter scheduler | grep "retrain"
```

### Health Monitoring (every 5 min)

**What to expect:**
- Silent operation (no emails unless failure)
- Auto-rollback after 3 consecutive failures (15 min)

**Logs to check:**
```bash
# If using systemd
sudo journalctl -u neuronexus-ops-guard -f

# If using cron
tail -f /var/log/neuronexus_ops.log
```

**Alert conditions:**
```
[WARN] Health FAIL (HTTP 503) - Failure 1/3
[WARN] Health FAIL (HTTP 503) - Failure 2/3
[CRITICAL] 🚨 Max failures reached. Triggering automatic rollback...
[INFO] ✅ Railway rollback completed successfully
```

---

## 🔧 Configuration Tuning

### Adjust Forecast Schedule

```javascript
// backend/scheduler.js

// Change from 02:00 to 01:00 UTC
cron.schedule("0 1 * * *", async () => { ... });

// Run twice daily (02:00 and 14:00 UTC)
cron.schedule("0 2,14 * * *", async () => { ... });
```

### Adjust Service Levels

```javascript
// backend/routes/recommendations.js

// More conservative for A-class items
serviceLevelA = 0.995  // 99.5% instead of 99%

// More relaxed for C-class
serviceLevelC = 0.85   // 85% instead of 90%
```

### Adjust Rollback Threshold

```bash
# ops_guard.sh

# More aggressive (rollback after 2 failures = 10 min)
MAX_FAILURES=2

# More lenient (rollback after 5 failures = 25 min)
MAX_FAILURES=5
```

---

## 🐛 Troubleshooting

### Issue: Forecast job not running

**Symptoms:** No email at 02:00 UTC

**Check:**
```bash
# Is scheduler running?
railway ps | grep scheduler

# Check logs
railway logs --filter scheduler

# Verify cron syntax
node -e "const cron = require('node-cron'); console.log(cron.validate('0 2 * * *'))"
# Should print: true
```

**Fix:**
```bash
# Restart scheduler
railway restart --service backend
```

### Issue: ML service unreachable

**Symptoms:** Error in logs: `ECONNREFUSED localhost:8000`

**Check:**
```bash
# Is ML service running?
railway ps | grep ml-service

# Check ML service health
curl http://your-ml-service.railway.app/status
```

**Fix:**
```bash
# Update ML_URL in .env
# Use Railway internal URL
ML_URL=http://ml-service.railway.internal:8000

# Redeploy
railway up
```

### Issue: Email not sending

**Symptoms:** No emails received, logs show `[email] failed`

**Check:**
```bash
# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587,
  auth: { user: '$SMTP_USER', pass: '$SMTP_PASS' }
});
transport.verify().then(console.log).catch(console.error);
"
```

**Fix:**
```bash
# Generate Gmail app-specific password
# 1. Go to https://myaccount.google.com/apppasswords
# 2. Create new app password
# 3. Update SMTP_PASS in .env
# 4. Redeploy
```

### Issue: Auto-rollback too aggressive

**Symptoms:** System rolls back frequently on transient errors

**Check ops_guard logs:**
```bash
tail -f /tmp/neuronexus_ops_guard.log
```

**Fix:**
```bash
# Increase MAX_FAILURES
nano ops_guard.sh
# Change: MAX_FAILURES=5 (instead of 3)

# Increase CHECK_INTERVAL
# Change: CHECK_INTERVAL=600 (10 min instead of 5)

# Restart
sudo systemctl restart neuronexus-ops-guard
```

---

## 📈 Success Metrics

Track these KPIs after deployment:

### Week 1 Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Forecast jobs executed | 7/7 days | Check email inbox |
| Average forecast latency | < 10 min | Email timestamp - 02:00 UTC |
| Recommendations generated | > 20 per day | Email content |
| Health check uptime | > 99% | ops_guard logs |
| Auto-rollbacks triggered | 0 | ops_guard incident log |

### Week 4 Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Forecast MAPE | < 30% | Query `forecasts` table |
| Order automation rate | > 80% | Approved vs generated |
| Manual intervention time | < 1 hour/week | Time tracking |
| Security scan pass rate | 100% (no High) | GitHub Actions |

### Query Examples

```sql
-- Average MAPE over last 30 days
SELECT AVG(mape) as avg_mape
FROM forecasts
WHERE forecast_date > date('now', '-30 days');

-- Recommendation approval rate
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
  ROUND(100.0 * SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) / COUNT(*), 2) as approval_rate
FROM reorder_recommendations
WHERE recommendation_date > date('now', '-7 days');

-- ABC distribution
SELECT
  policy as abc_class,
  COUNT(*) as count,
  AVG(rec_qty) as avg_qty
FROM reorder_recommendations
WHERE recommendation_date = date('now')
GROUP BY policy;
```

---

## 🎯 Next Steps After Deployment

### Immediate (Week 1)
- [ ] Verify daily emails arriving
- [ ] Check first recommendations for reasonableness
- [ ] Monitor health check logs
- [ ] Confirm no rollbacks triggered

### Short-term (Week 2-4)
- [ ] Tune service levels based on actual stockouts
- [ ] Adjust forecast horizon if needed
- [ ] Add more sophisticated models (ETS, Prophet)
- [ ] Implement approval workflow in UI

### Medium-term (Month 2-3)
- [ ] Add forecast accuracy dashboard
- [ ] Implement feedback loop (adjust weights based on approval/rejection)
- [ ] Add drift detection
- [ ] Integrate with existing PO system

### Long-term (Q1 2026)
- [ ] Multi-location optimization
- [ ] Supplier lead time prediction
- [ ] Price elasticity modeling
- [ ] Voice interface for approvals

---

## 📞 Support

**Logs:**
```bash
# Backend logs
railway logs --tail --filter backend

# ML service logs
railway logs --tail --filter ml-service

# Ops guard logs (if systemd)
sudo journalctl -u neuronexus-ops-guard -f
```

**Emergency Procedures:**

```bash
# Disable scheduler temporarily
railway variables set SCHEDULER_ENABLED=false

# Manual rollback
railway rollback

# Stop ops guard
sudo systemctl stop neuronexus-ops-guard
```

**Contact:**
- Email: neuropilotai@gmail.com
- GitHub Issues: Create issue with `[autonomous]` tag

---

## ✅ Deployment Checklist

Before going live:

- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] Dependencies installed (Node + Python)
- [ ] Routes wired up in server.js
- [ ] ML service deployed and accessible
- [ ] Backend deployed with scheduler
- [ ] Ops guard running (systemd or cron)
- [ ] Test forecast generation (manual trigger)
- [ ] Test recommendation generation
- [ ] Health endpoints returning 200
- [ ] Email notifications working
- [ ] Logs visible in Railway dashboard

After deployment:

- [ ] First email received next day at 02:15 UTC
- [ ] Recommendations look reasonable
- [ ] No errors in logs for 24 hours
- [ ] Health checks passing 100%
- [ ] MAPE calculated and < 35%

---

**STATUS:** ✅ Ready for Production Deployment

**Estimated Time to Deploy:** 30-45 minutes
**Maintenance:** < 30 min/week after stabilization

Deploy and let it run autonomously! 🚀
