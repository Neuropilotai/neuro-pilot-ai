# NeuroNexus v19.0 - Phase 1.5 Deployment Guide
## Auto-Deployment & Self-Reporting Layer

**Version:** 1.5.0
**Date:** 2025-10-29
**Status:** Production-Ready
**Prerequisites:** Phase 1 (Autonomous Foundation) must be deployed

---

## 📋 Overview

Phase 1.5 adds three critical capabilities to the NeuroNexus Autonomous Foundation:

1. **Auto-Deployment Engine** - CI/CD pipeline with automatic testing and rollback
2. **Daily Intelligence Reports** - Comprehensive HTML email reports with metrics
3. **Enhanced Self-Healing** - Advanced health monitoring with DB integrity checks

---

## 🎯 Phase 1.5 Components

### 1. Auto-Deployment Engine
- **Location:** `.github/workflows/autonomous_ci.yml`
- **Triggers:** Push to main/develop, PRs, nightly security scans
- **Stages:**
  1. Security scanning (Snyk, Gitleaks, OWASP ZAP)
  2. Linting and type checking
  3. Unit and integration tests
  4. Deployment to Railway
  5. Auto-rollback on failure
  6. Nightly compliance reports

### 2. Daily Intelligence Reports
- **Location:** `backend/generate_daily_report.js`
- **Template:** `autonomous_report_template.html`
- **Schedule:** 02:15 UTC (after daily forecast)
- **Content:**
  - Executive summary (uptime, MAPE, orders, CVEs)
  - Forecast performance metrics
  - Reorder recommendations
  - System health status
  - Security scan results
  - ML training cycle updates
  - Action items

### 3. Enhanced Ops Guard
- **Location:** `ops_guard_enhanced.sh`
- **Features:**
  - HTTP health checks
  - Database integrity verification
  - Audit log hash chain validation
  - ML service monitoring
  - Auto-rollback with detailed incident logging
  - Multi-channel alerting (Email, Slack, PagerDuty)

---

## 🚀 Deployment Steps

### Prerequisites

Ensure Phase 1 is already deployed:
- ✅ Backend server running on Railway
- ✅ ML service deployed
- ✅ Autonomous scheduler active
- ✅ Database migrations completed
- ✅ Email notifications working

### Step 1: GitHub Secrets Configuration (10 min)

Configure the following secrets in your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value | Required |
|-------------|-------|----------|
| `RAILWAY_TOKEN` | Railway API token | ✅ Yes |
| `RAILWAY_PROJECT_ID` | Railway project ID | ✅ Yes |
| `ADMIN_EMAIL` | Your email for alerts | ✅ Yes |
| `SMTP_HOST` | smtp.gmail.com | ✅ Yes |
| `SMTP_USER` | Your Gmail address | ✅ Yes |
| `SMTP_PASS` | Gmail app password | ✅ Yes |
| `SNYK_TOKEN` | Snyk API token | ⚠️ Recommended |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | ⚠️ Optional |
| `PAGERDUTY_KEY` | PagerDuty routing key | ⚠️ Optional |

**Get Railway Token:**
```bash
# Login to Railway
railway login

# Get project token
railway whoami
```

**Get Snyk Token:**
1. Go to https://snyk.io
2. Sign up / Login
3. Account Settings → API Token
4. Copy token

### Step 2: Deploy CI/CD Workflow (5 min)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Verify workflow file exists
ls -la .github/workflows/autonomous_ci.yml

# Commit and push
git add .github/workflows/autonomous_ci.yml
git commit -m "feat: add Phase 1.5 auto-deployment CI/CD pipeline"
git push origin main
```

**Verify deployment:**
1. Go to GitHub → Actions tab
2. Watch "Autonomous Deployment Pipeline" workflow run
3. All stages should pass ✅

### Step 3: Deploy Daily Report Generator (5 min)

```bash
# Install additional dependencies
cd backend
npm install handlebars  # For template rendering (optional)

# Test report generation locally
node generate_daily_report.js

# Check your email for test report
```

**Expected output:**
```
📊 Generating daily intelligence report...
✅ Daily intelligence report sent successfully
   To: your-email@gmail.com
   Forecast MAPE: 26.8%
   Recommendations: 18
   System Uptime: 99.95%
   Action Items: 0
```

### Step 4: Deploy Enhanced Ops Guard (10 min)

```bash
# Make enhanced ops guard executable
chmod +x ops_guard_enhanced.sh

# Test it
./ops_guard_enhanced.sh --test
```

**Expected output:**
```
[INFO] ✅ Health OK [HTTP:1 DB:1 Audit:1 ML:1]
```

**Deploy as systemd service (recommended):**
```bash
sudo nano /etc/systemd/system/neuronexus-ops-guard.service
```

```ini
[Unit]
Description=NeuroNexus Enhanced Ops Guard (Phase 1.5)
After=network.target

[Service]
Type=simple
ExecStart=/path/to/ops_guard_enhanced.sh
Restart=always
RestartSec=10
Environment="BACKEND_URL=https://resourceful-achievement-production.up.railway.app"
Environment="ML_URL=http://ml-service.railway.internal:8000"
Environment="DB_PATH=/path/to/backend/database.db"
Environment="ADMIN_EMAIL=your-email@gmail.com"
Environment="SMTP_HOST=smtp.gmail.com"
Environment="SMTP_USER=your-email@gmail.com"
Environment="SMTP_PASS=your-app-password"

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable neuronexus-ops-guard
sudo systemctl start neuronexus-ops-guard
sudo systemctl status neuronexus-ops-guard
```

**Alternative: Deploy as cron job (simpler):**
```bash
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * /path/to/ops_guard_enhanced.sh >> /var/log/neuronexus_ops.log 2>&1
```

### Step 5: Update Scheduler (Already Done ✅)

The scheduler has been updated to automatically call `generate_daily_report.js` after the daily forecast job completes. No additional action required.

### Step 6: Configure Alert Channels (Optional, 15 min)

#### Slack Integration
1. Go to https://api.slack.com/apps
2. Create new app → "NeuroNexus Alerts"
3. Incoming Webhooks → Add New Webhook
4. Copy webhook URL
5. Add to `.env`:
   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

#### PagerDuty Integration
1. Go to PagerDuty → Services
2. Create service → "NeuroNexus"
3. Integrations → Events API v2
4. Copy Integration Key
5. Add to `.env`:
   ```bash
   PAGERDUTY_KEY=your-integration-key
   ```

---

## ✅ Verification

### 1. Verify CI/CD Pipeline (5 min)

**Test deployment:**
```bash
# Make a small change
echo "# Test CI/CD" >> README.md
git add README.md
git commit -m "test: verify CI/CD pipeline"
git push origin main
```

**Check GitHub Actions:**
1. Go to repository → Actions
2. Watch "Autonomous Deployment Pipeline"
3. All stages should pass:
   - ✅ Security scan
   - ✅ Lint and type check
   - ✅ Run test suite
   - ✅ Deploy to Railway
   - ✅ Verify deployment health

**Expected email:**
Subject: "✅ NeuroNexus Deployment Successful - [commit hash]"

### 2. Verify Daily Reports (1 min)

**Manual trigger:**
```bash
cd backend
node generate_daily_report.js
```

**Check your email for:**
Subject: "NeuroNexus Daily Intelligence Report - 2025-10-29"

**Verify email contains:**
- ✅ Executive summary metrics
- ✅ Forecast performance section
- ✅ Reorder recommendations table
- ✅ System health status
- ✅ Security status
- ✅ ML training cycle info
- ✅ Action items (if any)

### 3. Verify Enhanced Ops Guard (2 min)

**Check logs:**
```bash
# If using systemd
sudo journalctl -u neuronexus-ops-guard -f

# If using cron
tail -f /var/log/neuronexus_ops.log
```

**Expected output (every 5 minutes):**
```
[INFO] ✅ Health OK [HTTP:1 DB:1 Audit:1 ML:1]
[INFO] System stable - all health checks passing
```

**Test failure detection:**
```bash
# Stop backend temporarily
killall node

# Watch logs for failure detection
tail -f /tmp/neuronexus_ops_guard.log

# Should see:
# [WARN] ❌ Health FAIL [HTTP:0 DB:1 Audit:1 ML:1] - Failure 1/3
# [WARN] ❌ Health FAIL [HTTP:0 DB:1 Audit:1 ML:1] - Failure 2/3
# [WARN] ❌ Health FAIL [HTTP:0 DB:1 Audit:1 ML:1] - Failure 3/3
# [CRITICAL] 🚨 Max failures reached. Triggering automatic rollback...

# Restart backend
cd backend && node server.js &
```

### 4. Verify Nightly Compliance Report (Next Day)

**Check GitHub Actions at 01:00 UTC:**
- Navigate to Actions → "Autonomous Deployment Pipeline"
- Find scheduled run from cron
- Check for "Generate Compliance Report" stage
- Verify artifacts uploaded

**Check email:**
Subject: "📋 NeuroNexus Nightly Compliance Report - 2025-10-29"

---

## 📊 Monitoring Dashboard

### Key Metrics to Track

**CI/CD Pipeline:**
- Deployment frequency (per day)
- Deployment success rate (%)
- Average deployment time (min)
- Rollback frequency (per month)
- Test pass rate (%)

**Daily Reports:**
- Email delivery rate (%)
- Report generation latency (sec)
- Action items generated (per day)
- Action items resolved (%)

**Ops Guard:**
- Health check pass rate (%)
- Mean time to detect (MTTD)
- Mean time to recover (MTTR)
- False positive rate (%)
- Auto-rollback count (per month)

### Monitoring Queries

```sql
-- Deployment frequency (last 30 days)
SELECT
  DATE(created_at) as date,
  COUNT(*) as deployments
FROM audit_log
WHERE action = 'deployment_success'
  AND created_at > datetime('now', '-30 days')
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Daily report generation stats
SELECT
  DATE(created_at) as date,
  COUNT(*) as reports_sent,
  AVG(CAST(json_extract(metadata, '$.action_items') AS INTEGER)) as avg_action_items
FROM audit_log
WHERE action = 'daily_report_sent'
  AND created_at > datetime('now', '-30 days')
GROUP BY DATE(created_at);

-- Ops guard incidents
SELECT
  DATE(created_at) as date,
  COUNT(*) as incident_count,
  json_extract(metadata, '$.reason') as reason
FROM audit_log
WHERE action = 'ops_guard_rollback'
  AND created_at > datetime('now', '-90 days')
GROUP BY DATE(created_at), reason
ORDER BY date DESC;
```

---

## 🎯 Success Criteria

### Week 1 (Smoke Tests)
- [ ] CI/CD pipeline runs successfully on first commit
- [ ] All security scans pass (no High/Critical)
- [ ] Daily report received 7/7 days
- [ ] Ops guard running without false positives
- [ ] No unplanned rollbacks

### Week 2-4 (Functional Validation)
- [ ] Deployment frequency > 1 per day
- [ ] Deployment success rate > 95%
- [ ] Average deployment time < 10 min
- [ ] Email delivery rate > 98%
- [ ] Health check pass rate > 99.9%

### Month 2-3 (Production Stability)
- [ ] Zero Critical CVEs detected
- [ ] Rollback accuracy 100% (all rollbacks successful)
- [ ] MTTD < 5 minutes
- [ ] MTTR < 10 minutes
- [ ] Compliance reports generated 100% of nights

---

## 🔧 Troubleshooting

### CI/CD Pipeline Failures

#### "Security scan failed"
**Cause:** High/Critical vulnerabilities detected
**Fix:**
```bash
# Check Snyk report
snyk test --severity-threshold=high

# Update vulnerable dependencies
npm update
npm audit fix

# Re-commit and re-deploy
git add package*.json
git commit -m "fix: update vulnerable dependencies"
git push
```

#### "Deployment to Railway failed"
**Cause:** Invalid Railway token or project ID
**Fix:**
1. Verify secrets in GitHub: Settings → Secrets
2. Check Railway token is valid:
   ```bash
   railway whoami
   ```
3. Re-generate token if needed:
   ```bash
   railway logout
   railway login
   ```

#### "Test suite failed"
**Cause:** Failing integration tests
**Fix:**
```bash
# Run tests locally
cd backend && npm test

# Fix failing tests
# Re-commit and push
```

### Daily Report Issues

#### "No email received"
**Cause:** SMTP credentials invalid or report generation failed
**Fix:**
```bash
# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
transport.verify().then(console.log).catch(console.error);
"

# Test report generation
cd backend
node generate_daily_report.js
```

#### "Report shows incorrect metrics"
**Cause:** Database queries returning no data
**Fix:**
```bash
# Verify database has data
sqlite3 backend/database.db "SELECT COUNT(*) FROM forecasts WHERE forecast_date = date('now');"

# If 0, run forecast manually
curl -X POST http://localhost:8000/train/infer-latest \
  -H "Content-Type: application/json" \
  -d '{"mode": "daily"}'
```

### Ops Guard Issues

#### "False positive rollbacks"
**Cause:** Overly sensitive failure threshold
**Fix:**
```bash
# Increase MAX_FAILURES
nano ops_guard_enhanced.sh
# Change: MAX_FAILURES=5 (instead of 3)

# Restart service
sudo systemctl restart neuronexus-ops-guard
```

#### "Ops guard not detecting failures"
**Cause:** Health check URL incorrect or timeout too short
**Fix:**
```bash
# Test health URL manually
curl -v https://your-backend.railway.app/health

# Update HEALTH_URL in service file
sudo nano /etc/systemd/system/neuronexus-ops-guard.service

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart neuronexus-ops-guard
```

---

## 📈 Advanced Configuration

### Custom Report Metrics

Add custom metrics to daily report:

```javascript
// backend/generate_daily_report.js

async function collectCustomMetrics() {
  // Add your custom queries
  const customData = await db.get('SELECT * FROM your_table');

  return {
    custom_metric_1: customData.value1,
    custom_metric_2: customData.value2,
  };
}

// In sendDailyReport():
const metrics = {
  forecast: await collectForecastMetrics(),
  // ... existing metrics
  custom: await collectCustomMetrics(),  // Add this
};
```

### Custom Alert Rules

Add custom alert rules to ops_guard:

```bash
# ops_guard_enhanced.sh

check_custom_rule() {
  # Example: Alert if database size exceeds 1GB
  local db_size_mb
  db_size_mb=$(du -m "$DB_PATH" | cut -f1)

  if [ "$db_size_mb" -gt 1024 ]; then
    log "WARN" "Database size ($db_size_mb MB) exceeds 1GB"
    send_alert "Database size warning: ${db_size_mb}MB"
    return 1
  fi

  return 0
}

# Add to check_health():
check_custom_rule || custom_ok=0
```

### Multi-Environment Support

Configure different settings per environment:

```yaml
# .github/workflows/autonomous_ci.yml

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    env:
      RAILWAY_ENVIRONMENT: staging
      BACKEND_URL: https://staging.railway.app
    # ... rest of job

  deploy-production:
    if: github.ref == 'refs/heads/main'
    env:
      RAILWAY_ENVIRONMENT: production
      BACKEND_URL: https://production.railway.app
    # ... rest of job
```

---

## ✅ Phase 1.5 Completion Checklist

### Infrastructure
- [ ] GitHub Actions workflow configured
- [ ] All GitHub secrets set
- [ ] Railway project linked
- [ ] Snyk account connected

### Daily Reports
- [ ] Report generator deployed
- [ ] Email template customized
- [ ] SMTP configured and tested
- [ ] Report scheduled in cron

### Ops Guard
- [ ] Enhanced ops guard deployed
- [ ] Systemd service configured
- [ ] Alert channels tested
- [ ] Incident logging verified

### Testing
- [ ] CI/CD pipeline tested (commit → deploy)
- [ ] Security scans passing
- [ ] Daily report received
- [ ] Ops guard detecting failures
- [ ] Auto-rollback working

### Monitoring
- [ ] Metrics dashboard configured
- [ ] Alert thresholds set
- [ ] Compliance reports enabled
- [ ] Incident log review process

---

## 🏁 Next Steps

### Phase 2: Advanced Intelligence
- Multi-model ensemble forecasting (ARIMA, ETS, Prophet, LightGBM)
- Automated hyperparameter tuning
- Drift detection and auto-retraining
- Feedback loop for continuous learning

### Phase 3: Business Intelligence
- Real-time inventory dashboard
- Predictive analytics for demand patterns
- Cost optimization recommendations
- Supplier performance analysis

### Phase 4: Enterprise Scale
- Multi-location support
- Advanced RBAC with audit trail
- API rate limiting and throttling
- Horizontal scaling with Redis

---

## 📞 Support

**Documentation:**
- Phase 1: AUTONOMOUS_DEPLOYMENT_GUIDE.md
- Phase 1.5: This document
- Test Suite: AUTONOMOUS_TEST_SUITE.md

**Logs:**
```bash
# CI/CD logs
# GitHub → Actions → Select workflow run

# Daily report logs
railway logs --tail --filter backend | grep "daily_report"

# Ops guard logs
sudo journalctl -u neuronexus-ops-guard -f
```

**Emergency Procedures:**
```bash
# Disable CI/CD temporarily
# GitHub → Actions → Disable workflow

# Stop daily reports
# Comment out in scheduler.js line 162-170

# Disable ops guard
sudo systemctl stop neuronexus-ops-guard
```

---

**Status:** ✅ **PHASE 1.5 READY FOR DEPLOYMENT**

**Deployment Time:** 30-45 minutes
**Maintenance:** < 15 min/week (monitoring only)
**Human Intervention:** Minimal (action items from reports)

**System Status:** 🚀 **FULLY AUTONOMOUS & SELF-MANAGING**

---

*Generated: 2025-10-29*
*NeuroNexus v19.0 - Phase 1.5: Auto-Deployment & Self-Reporting*
*Enterprise Autonomous Foundation*
