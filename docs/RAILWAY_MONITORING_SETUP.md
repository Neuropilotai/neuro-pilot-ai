# Railway Monitoring & Notifications Setup

## Real-Time Monitoring Configuration

### 1. Railway Notifications (Critical)

**Enable Build & Health Failure Alerts:**

1. Open Railway dashboard: https://railway.app/dashboard
2. Navigate to: `fantastic-tranquility` → `production` environment
3. Click: **Settings** → **Notifications**
4. Enable the following:
   - ✅ **Build Failures** - Get alerted immediately if deployment fails
   - ✅ **Health Check Failures** - Auto-rollback trigger alerts
   - ✅ **Deployment Status** - Track deployment lifecycle
5. Add notification channels:
   - Email: Your team's ops email
   - Slack (recommended): Add Railway integration to #alerts channel
   - Discord: Alternative webhook option

### 2. Log Retention

**Configure 30-day minimum retention:**

1. Railway dashboard → Project → **Settings** → **Logs**
2. Set retention: **30 days minimum** (or max available)
3. Enable log aggregation if available

**Alternative: External Log Sink**

For long-term retention, configure Railway to forward logs:
- Datadog (recommended)
- Papertrail
- Logtail
- CloudWatch Logs

### 3. Sentry Integration (Runtime Error Tracking)

**Add Sentry DSN to Railway environment:**

1. Sign up at: https://sentry.io
2. Create new project: "NeuroPilot Inventory Backend"
3. Copy DSN (looks like: `https://xxx@xxx.ingest.sentry.io/xxx`)
4. In Railway → Environment Variables → Add:
   ```
   SENTRY_DSN=<your_sentry_dsn>
   SENTRY_ENVIRONMENT=production
   SENTRY_RELEASE=v18.0-secure-cors
   ```

**Update `railway-server-production.js`:**

```javascript
// Add after dotenv config
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    release: process.env.SENTRY_RELEASE || 'unknown',
    tracesSampleRate: 0.1, // 10% performance monitoring
  });
  console.log('[SENTRY] Initialized for environment:', process.env.SENTRY_ENVIRONMENT);
}
```

**Install Sentry:**
```bash
cd /Users/davidmikulis/neuro-pilot-ai
npm install @sentry/node --save
```

### 4. Datadog Integration (Optional - Enterprise)

**For full observability:**

1. Sign up at: https://www.datadoghq.com
2. Create API key
3. Add to Railway environment:
   ```
   DD_API_KEY=<your_datadog_api_key>
   DD_SITE=datadoghq.com
   DD_SERVICE=neuropilot-inventory
   DD_ENV=production
   DD_VERSION=v18.0-secure-cors
   ```

**Install Datadog APM:**
```bash
npm install dd-trace --save
```

**Update server start:**
```javascript
// Must be first import
if (process.env.DD_API_KEY) {
  require('dd-trace').init({
    service: 'neuropilot-inventory',
    env: 'production',
    version: 'v18.0-secure-cors'
  });
}
```

### 5. Healthcheck Monitoring

**Railway automatically monitors `/api/health`:**

- Configured in: `railway.json` → `deploy.healthcheckPath`
- Timeout: 30 seconds (configurable)
- Failure behavior: Auto-rollback after 3 consecutive failures

**Monitor healthcheck externally with UptimeRobot:**

1. Sign up (free): https://uptimerobot.com
2. Add monitor:
   - Type: HTTP(s)
   - URL: `https://resourceful-achievement-production.up.railway.app/api/health`
   - Interval: 5 minutes
   - Alert contacts: Email/Slack/SMS
3. Expected response: `200 OK` with JSON body

### 6. Performance Metrics

**Built-in Railway Metrics:**

Railway dashboard → Service → **Metrics** tab shows:
- CPU usage
- Memory usage
- Network I/O
- Request rate

**Set up alerts:**
- CPU > 80% for 5 minutes → Alert
- Memory > 90% → Alert
- Request rate spike (10x baseline) → Alert

### 7. Security Event Monitoring

**Monitor CORS violations:**

Current implementation logs blocked origins as SHA256 hashes:
```javascript
console.warn('CORS blocked unauthorized origin hash:', hash);
```

**Set up log alerts:**
1. Railway logs → Search for: `CORS blocked`
2. Create alert rule: More than 100 CORS blocks in 1 hour
3. Action: Notify ops team (potential attack)

**Monitor runtime guardrails:**
```javascript
console.error('[SECURE-RUNTIME] Uncaught exception detected:', err.message);
```

**Alert on:**
- `[SECURE-RUNTIME] Uncaught exception` → Immediate alert
- `[SECURE-RUNTIME] Unhandled rejection` → Warning alert
- Process exit code 1 → Auto-rollback triggered

## Monitoring Checklist

### Daily
- [ ] Check Railway deployment status
- [ ] Review error logs for `[SECURE-RUNTIME]` entries
- [ ] Verify healthcheck uptime (should be 99.9%+)

### Weekly
- [ ] Review Sentry error trends
- [ ] Check resource usage (CPU/Memory)
- [ ] Verify CORS block logs (should be minimal)

### Monthly
- [ ] Review log retention policy
- [ ] Audit Railway environment variables
- [ ] Check TLS certificate expiry (auto-renewed by Railway)
- [ ] Review security baseline (v18.0-secure-cors compliance)

## Alert Response Procedures

### Healthcheck Failure Alert

**Severity:** CRITICAL
**Auto-action:** Railway triggers rollback after 3 failures

**Response:**
1. Check Railway logs for error cause
2. Verify v18.0-secure-cors is still the baseline
3. If rollback occurred, investigate commit that caused failure
4. Run: `./verify-cors-security.sh` to verify security posture

### CORS Security Alert

**Severity:** HIGH
**Trigger:** Unexpected wildcard CORS detected

**Response:**
1. Immediate rollback: `railway redeploy --rollback`
2. Verify: `./verify-cors-security.sh`
3. Review commits since v18.0-secure-cors
4. Re-run CI: GitHub Actions → Re-run failed jobs

### Runtime Exception Alert

**Severity:** MEDIUM-HIGH
**Trigger:** `[SECURE-RUNTIME] Uncaught exception`

**Response:**
1. Check Sentry for full stack trace
2. Review Railway logs for context
3. If repeated: Rollback to v18.0-secure-cors
4. Create hotfix branch: `git checkout -b hotfix/runtime-exception`

## Notification Channels (Recommended)

| Channel | Use Case | Setup |
|---------|----------|-------|
| **Email** | All alerts | Railway → Settings → Notifications |
| **Slack** | Build/Deploy/Health | Railway Slack integration |
| **Sentry** | Runtime errors | DSN in env vars |
| **UptimeRobot** | External uptime | 3rd party monitoring |
| **PagerDuty** | On-call escalation | Enterprise only |

## Environment Variables for Monitoring

Add these to Railway:

```bash
# Sentry (Error Tracking)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=v18.0-secure-cors

# Datadog (Optional - Full Observability)
DD_API_KEY=<your_datadog_api_key>
DD_SITE=datadoghq.com
DD_SERVICE=neuropilot-inventory
DD_ENV=production
DD_VERSION=v18.0-secure-cors

# Application
NODE_ENV=production
ALLOWED_ORIGINS=https://neuropilot-inventory.vercel.app,https://*.vercel.app
```

## Verification

After setup, verify monitoring is active:

```bash
# 1. Trigger test error (in staging only!)
curl -X POST https://staging.example.com/api/test-error

# 2. Check Sentry dashboard for error
# 3. Verify Railway alert received

# 4. Test healthcheck
curl https://resourceful-achievement-production.up.railway.app/api/health
# Expected: 200 OK

# 5. Verify nightly checks
# GitHub Actions → Workflows → Nightly Security Verification
# Should run daily at 3 AM UTC
```

## Additional Resources

- Railway Docs: https://docs.railway.app/
- Sentry Node.js SDK: https://docs.sentry.io/platforms/node/
- Datadog APM: https://docs.datadoghq.com/tracing/
- UptimeRobot: https://uptimerobot.com/
