# Grafana Cloud Setup Guide - NeuroPilot v17.1

**Complete observability setup with dashboards, alerts, and metrics**

---

## 📋 Prerequisites

- NeuroPilot v16.6+ deployed (Railway + Vercel)
- Grafana Cloud account (free tier: 10k metrics, 50GB logs)
- 15 minutes setup time

---

## 🚀 Quick Setup (5 steps)

### Step 1: Create Grafana Cloud Account

1. Go to https://grafana.com/auth/sign-up
2. Sign up with email or GitHub
3. Create organization name (e.g., "neuropilot")
4. Select free plan (10k metrics, 50GB logs, 14-day retention)
5. Note your instance URL (e.g., `https://neuropilot.grafana.net`)

**Cost**: $0/month ✅

---

### Step 2: Get API Credentials

#### Grafana URL

From dashboard homepage:
```
https://your-org.grafana.net
```

#### API Key

1. Go to: https://your-org.grafana.net/org/apikeys
2. Click "Add API key"
3. Name: `NeuroPilot v17.1`
4. Role: `Editor`
5. Time to live: `Never expire` (or 1 year)
6. Click "Add"
7. **Copy the key immediately** (shown only once!)

Save credentials:
```bash
export GRAFANA_URL="https://your-org.grafana.net"
export GRAFANA_API_KEY="your_api_key_here"
```

---

### Step 3: Run Setup Script

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Set environment variables
export GRAFANA_URL="https://your-org.grafana.net"
export GRAFANA_API_KEY="your_api_key_here"

# Run setup
./monitoring/grafana-import.sh
```

**Expected output**:
```
📊 NeuroPilot v17.1 Grafana Setup
==================================

1️⃣  Testing Grafana connection...
✅ Connected to Grafana

2️⃣  Configuring Prometheus data source...
✅ Prometheus data source created (ID: 1)

3️⃣  Creating NeuroPilot dashboard...
✅ Dashboard imported successfully
   URL: https://your-org.grafana.net/d/neuropilot-v17

4️⃣  Creating alert rules...
✅ Alert rules created

==================================
✅ Grafana Setup Complete
==================================
```

---

### Step 4: Configure Backend Metrics Export

Update `backend/server.js` to export metrics:

```javascript
// Add after other imports
const promClient = require('prom-client');
const register = new promClient.Registry();

// Collect default metrics (CPU, memory, event loop)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 400, 800, 1600]
});
register.registerMetric(httpRequestDuration);

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;

    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);

    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });

  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

Install dependencies:
```bash
npm install prom-client --save
```

Deploy changes:
```bash
railway up --detached
```

---

### Step 5: Verify Metrics

Test metrics endpoint:
```bash
curl https://api.neuropilot.ai/metrics
```

**Expected output**:
```
# HELP http_request_duration_ms Duration of HTTP requests in ms
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="10",method="GET",route="/health",status_code="200"} 45
http_request_duration_ms_bucket{le="50",method="GET",route="/health",status_code="200"} 98
...

# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status_code="200"} 1523
...
```

---

## 📊 Dashboard Overview

### Panels Included

1. **API Latency (p95)** - 95th percentile request duration
2. **Request Rate** - Requests per second by endpoint
3. **Error Rate** - 5xx errors as percentage
4. **Cache Hit Ratio** - CDN cache effectiveness
5. **Database Query Time** - Average query duration
6. **Memory Usage** - Process memory consumption
7. **Active Users** - Unique users in last 5 minutes
8. **Uptime** - Service uptime since last restart

### Dashboard URL

```
https://your-org.grafana.net/d/neuropilot-v17
```

### Refresh Rate

- Default: 30 seconds
- Time range: Last 6 hours
- Adjust in dashboard settings

---

## 🔔 Alert Rules

### 1. High API Latency

**Condition**: p95 latency > 400ms for 5 minutes
**Severity**: Warning
**Action**: Notify team, trigger auto-healing

**Query**:
```promql
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 400
```

### 2. High Error Rate

**Condition**: 5xx errors > 5% for 2 minutes
**Severity**: Critical
**Action**: Page on-call, trigger cache purge

**Query**:
```promql
rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
```

---

## 📧 Alert Notifications

### Configure Slack Integration

1. Go to: https://your-org.grafana.net/alerting/notifications
2. Click "Add contact point"
3. Name: `Slack - NeuroPilot`
4. Type: `Slack`
5. Webhook URL: Your Slack webhook (create at https://api.slack.com/messaging/webhooks)
6. Channel: `#neuropilot-alerts`
7. Save

### Configure Email Notifications

1. Go to: https://your-org.grafana.net/alerting/notifications
2. Click "Add contact point"
3. Name: `Email - Team`
4. Type: `Email`
5. Addresses: `team@neuropilot.ai`
6. Save

### Link Alerts to Contact Points

1. Go to: https://your-org.grafana.net/alerting/notification-policies
2. Edit default policy
3. Add contact points:
   - Warning alerts → Slack
   - Critical alerts → Slack + Email + PagerDuty
4. Save

---

## 📈 Metrics Reference

### System Metrics (Automatic)

| Metric | Description | Unit |
|--------|-------------|------|
| `process_cpu_seconds_total` | Total CPU time | seconds |
| `process_resident_memory_bytes` | Memory usage | bytes |
| `nodejs_eventloop_lag_seconds` | Event loop lag | seconds |
| `nodejs_active_handles_total` | Active handles | count |

### Custom Metrics

| Metric | Description | Labels | Type |
|--------|-------------|--------|------|
| `http_request_duration_ms` | Request latency | method, route, status_code | Histogram |
| `http_requests_total` | Total requests | method, route, status_code | Counter |
| `cache_hits_total` | Cache hits | type | Counter |
| `cache_requests_total` | Cache requests | type | Counter |
| `db_query_duration_ms` | Query time | query_type | Histogram |

---

## 🔍 Querying Metrics

### PromQL Examples

**Average latency by route**:
```promql
rate(http_request_duration_ms_sum[5m]) / rate(http_request_duration_ms_count[5m])
```

**Request rate by status code**:
```promql
sum(rate(http_requests_total[5m])) by (status_code)
```

**Error rate percentage**:
```promql
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

**Cache hit ratio**:
```promql
sum(rate(cache_hits_total[5m])) / sum(rate(cache_requests_total[5m])) * 100
```

---

## 🧪 Testing & Validation

### 1. Generate Test Traffic

```bash
# Install k6
brew install k6  # macOS
sudo apt install k6  # Linux

# Run load test
cd backend
./scripts/run_benchmark.sh
```

### 2. Verify Metrics Appear

Wait 1-2 minutes, then check dashboard:
```
https://your-org.grafana.net/d/neuropilot-v17
```

You should see:
- ✅ Request rate increasing
- ✅ Latency histogram populated
- ✅ Memory usage visible

### 3. Trigger Alert

```bash
# Generate high latency (make many slow requests)
for i in {1..100}; do
  curl "https://api.neuropilot.ai/api/items?delay=500" &
done
```

Check alerts:
```
https://your-org.grafana.net/alerting/list
```

---

## 🛠️ Customization

### Add New Panel

1. Open dashboard
2. Click "Add panel"
3. Select visualization type (Graph, Stat, Table)
4. Add query:
   ```promql
   rate(http_requests_total[5m])
   ```
5. Configure display (title, units, thresholds)
6. Save dashboard

### Add New Alert

1. Go to: https://your-org.grafana.net/alerting/new
2. Name: `Database Query Slow`
3. Condition:
   ```promql
   rate(db_query_duration_ms_sum[5m]) / rate(db_query_duration_ms_count[5m]) > 500
   ```
4. Evaluate every: `1m`
5. For: `3m`
6. Contact point: `Slack - NeuroPilot`
7. Save

---

## 💰 Cost Analysis

### Free Tier Limits

| Resource | Limit | Usage Expected | Status |
|----------|-------|----------------|--------|
| Active series | 10,000 | ~200 | ✅ 2% |
| DPM (Data Points/Min) | 100k | ~5k | ✅ 5% |
| Logs (GB/month) | 50 GB | ~2 GB | ✅ 4% |
| Retention | 14 days | N/A | ✅ Free |
| Dashboards | Unlimited | 1 | ✅ Free |
| Alerts | 100 rules | 2 | ✅ 2% |

**Total Cost**: $0/month ✅

### When to Upgrade to Pro ($49/mo)

Consider upgrading when:
- Active series > 10k (more metrics)
- Need longer retention (>14 days)
- Want advanced features (SLOs, synthetic monitoring)
- Team size > 3 users

---

## 🐛 Troubleshooting

### Issue: No Metrics Appearing

**Symptom**: Dashboard shows "No data"

**Fix**:
1. Check metrics endpoint: `curl https://api.neuropilot.ai/metrics`
2. Verify Prometheus data source configured
3. Wait 2-3 minutes for first scrape
4. Check time range (last 6 hours)

### Issue: Alerts Not Firing

**Symptom**: Condition met but no alert

**Fix**:
1. Go to: https://your-org.grafana.net/alerting/list
2. Check alert state (Normal, Pending, Alerting)
3. Verify contact point configured
4. Check notification policy routes
5. Test contact point manually

### Issue: High Cardinality Warning

**Symptom**: "Too many unique label combinations"

**Fix**:
```javascript
// Limit route labels
const route = req.route ? req.route.path : 'unknown';

// Don't include dynamic IDs
if (route.includes('/:id')) {
  route = route.replace(/:\w+/g, ':id');
}
```

---

## 📚 Additional Resources

**Grafana Docs**: https://grafana.com/docs/grafana/latest/
**PromQL Guide**: https://prometheus.io/docs/prometheus/latest/querying/basics/
**NeuroPilot Metrics**: See `backend/src/metrics.js`

---

## ✅ Success Checklist

After setup, verify:

- [ ] Grafana Cloud account created
- [ ] API key generated and saved
- [ ] Setup script ran successfully
- [ ] Backend exports `/metrics` endpoint
- [ ] Dashboard visible with data
- [ ] Alerts configured and tested
- [ ] Slack notifications working
- [ ] Load test shows metrics in real-time
- [ ] All panels populated (8/8)
- [ ] Cost within free tier limits

---

**Status**: Ready for production
**Time to Setup**: 15 minutes
**Cost**: $0/month (free tier)
**Metrics Collected**: 15+ system + custom metrics
**Alerts Configured**: 2 (High Latency, High Error Rate)
