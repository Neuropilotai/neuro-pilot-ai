# NeuroInnovate v19.2 — Quick Verification Commands

**Version:** v19.2-stable
**Last Updated:** 2025-11-17
**Audience:** On-Call Engineers, Ops Team

---

## ⚡ **Daily Health Check (5 minutes)**

Run this command at 09:00 UTC daily:

```bash
#!/bin/bash
# daily-health-check.sh

BACKEND_URL="https://backend-production.railway.app"
DATE=$(date -u +"%Y-%m-%d %H:%M UTC")

echo "## $DATE" >> PROD_DAILY_SNAPSHOTS.md

# 1. Overall health
echo "📊 Fetching health metrics..."
curl -s "$BACKEND_URL/api/v1/health" | jq -r '
  "- **Status:** \(.status)",
  "- **Cache Hit Rate:** \(.cache_hit_rate)% (target: ≥99%)",
  "- **Peak Memory:** \(.peak_memory_percent)% (target: ≤60%)",
  "- **API P95:** \(.latency.p95)ms (target: ≤15ms)",
  "- **API P99:** \(.latency.p99)ms (target: ≤30ms)",
  "- **MAPE Average:** \(.mape_average)% (target: <20%)",
  "- **High-Variance SKUs:** \(.high_variance_items | length) items",
  "- **Watchdog Interventions:** \(.watchdog_interventions_24h)",
  "- **Scheduler Runs:** \(.scheduler_runs_24h.success)/\(.scheduler_runs_24h.total)",
  "- **Status:** \(if .status == "healthy" then "✅ Stable" else "⚠️ Check logs" end)",
  ""
' >> PROD_DAILY_SNAPSHOTS.md

echo "✅ Daily snapshot appended to PROD_DAILY_SNAPSHOTS.md"
```

**Expected Output:**
```
## 2025-11-17 09:00 UTC
- **Status:** healthy
- **Cache Hit Rate:** 99.3% (target: ≥99%)
- **Peak Memory:** 60.1% (target: ≤60%)
- **API P95:** 12.7ms (target: ≤15ms)
- **API P99:** 18.9ms (target: ≤30ms)
- **MAPE Average:** 19.8% (target: <20%)
- **High-Variance SKUs:** 4 items
- **Watchdog Interventions:** 0
- **Scheduler Runs:** 1/1
- **Status:** ✅ Stable
```

---

## 🔍 **Individual Metric Checks**

### **1. Cache Performance**

```bash
# Cache hit rate (last 24h)
curl -s "$BACKEND_URL/api/v1/health/metrics" | jq '{
  cache_hit_rate: .cache_hit_rate,
  cache_preload_duration: .cache_preload_duration_ms,
  last_preload: .last_cache_preload
}'
```

**Expected:**
```json
{
  "cache_hit_rate": 99.3,
  "cache_preload_duration": 3000,
  "last_preload": "2025-11-17T02:06:15Z"
}
```

**Alerts:**
- 🔴 Critical: cache_hit_rate < 98.5%
- 🟡 Warning: cache_hit_rate < 99.0%

---

### **2. API Latency**

```bash
# API latency percentiles
curl -s "$BACKEND_URL/api/v1/health/metrics" | jq '{
  p50: .latency.p50,
  p95: .latency.p95,
  p99: .latency.p99,
  avg: .latency.avg
}'
```

**Expected:**
```json
{
  "p50": 6.2,
  "p95": 12.7,
  "p99": 18.9,
  "avg": 11.5
}
```

**Alerts:**
- 🔴 Critical: p95 > 20ms OR p99 > 40ms (for 10 minutes)
- 🟡 Warning: p95 > 15ms OR p99 > 30ms

---

### **3. Memory Usage**

```bash
# Current and peak memory
curl -s "$BACKEND_URL/api/v1/health/metrics" | jq '{
  current_memory_percent: .current_memory_percent,
  peak_memory_percent: .peak_memory_percent,
  last_forecast_peak: .last_forecast_peak_memory
}'
```

**Expected:**
```json
{
  "current_memory_percent": 42.3,
  "peak_memory_percent": 60.1,
  "last_forecast_peak": 60.1
}
```

**Alerts:**
- 🔴 Critical: peak_memory_percent > 62% during forecast
- 🟡 Warning: peak_memory_percent > 58%

---

### **4. MAPE & Forecast Accuracy**

```bash
# MAPE metrics and outliers
curl -s "$BACKEND_URL/api/v1/health/metrics" | jq '{
  mape_average: .mape_average,
  mape_threshold: .mape_threshold,
  high_variance_items: [.high_variance_items[] | {sku: .sku_id, mape: .mape}]
}'
```

**Expected:**
```json
{
  "mape_average": 19.8,
  "mape_threshold": 20,
  "high_variance_items": [
    {"sku": "SKU-6823", "mape": 28.0},
    {"sku": "SKU-8932", "mape": 28.8},
    {"sku": "SKU-4782", "mape": 27.5},
    {"sku": "SKU-5491", "mape": 26.9}
  ]
}
```

**Alerts:**
- 🔴 Critical: mape_average > 20% (rollback trigger)
- 🟡 Warning: mape_average > 19.0% (approaching threshold)

---

### **5. Watchdog Activity**

```bash
# Self-healing watchdog status
curl -s "$BACKEND_URL/api/v1/health/watchdog" | jq '{
  enabled: .watchdog_enabled,
  checks_24h: .checks_24h,
  interventions_24h: .interventions_24h,
  last_check: .last_check_time
}'
```

**Expected:**
```json
{
  "enabled": true,
  "checks_24h": 288,
  "interventions_24h": 0,
  "last_check": "2025-11-17T08:55:00Z"
}
```

**Alerts:**
- 🟡 Warning: interventions_24h > 0 (investigate root cause)
- 🔴 Critical: interventions_24h > 3 (scheduler instability)

---

### **6. Scheduler Status**

```bash
# Forecast scheduler runs
curl -s "$BACKEND_URL/api/v1/health/scheduler" | jq '{
  next_run: .next_forecast_run,
  last_run: .last_forecast_run,
  last_duration_seconds: .last_forecast_duration_seconds,
  success_rate_24h: .scheduler_success_rate_24h
}'
```

**Expected:**
```json
{
  "next_run": "2025-11-18T02:05:00Z",
  "last_run": "2025-11-17T02:05:12Z",
  "last_duration_seconds": 85,
  "success_rate_24h": 1.0
}
```

**Alerts:**
- 🔴 Critical: 2 failures within 24h (auto-rollback trigger)
- 🟡 Warning: last_duration_seconds > 100s (approaching 120s threshold)

---

## 🛠️ **Diagnostic Commands**

### **View Recent Logs (Last 100 Lines)**

```bash
# Backend logs
railway logs --service backend --tail 100

# ML service logs
railway logs --service ml-service --tail 100

# Filter for errors only
railway logs --service backend --tail 500 | grep ERROR
```

---

### **Check Database Health**

```bash
# Database size and WAL status
curl -s "$BACKEND_URL/api/v1/health/database" | jq '{
  database_size_mb: .database_size_mb,
  wal_enabled: .wal_enabled,
  connection_pool_size: .connection_pool_size,
  active_connections: .active_connections
}'
```

**Expected:**
```json
{
  "database_size_mb": 234.5,
  "wal_enabled": true,
  "connection_pool_size": 10,
  "active_connections": 3
}
```

---

### **Test Forecast Endpoint (Manual Trigger)**

```bash
# Trigger manual forecast (requires admin API key)
curl -X POST "$BACKEND_URL/api/v1/admin/trigger-forecast" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" | jq
```

**Expected:**
```json
{
  "status": "success",
  "forecast_id": "f_1234567890",
  "duration_seconds": 85,
  "items_processed": 127,
  "mape_average": 19.8
}
```

---

### **Check Environment Variables**

```bash
# List all environment variables for backend service
railway variables list --service backend

# Check specific locked configs
railway variables list --service backend | grep -E 'MAPE_THRESHOLD|MAX_HEALTH_FAILURES|STREAMING_BATCH_DELAY_MS'
```

**Expected:**
```
MAPE_THRESHOLD=20
MAX_HEALTH_FAILURES=6
STREAMING_BATCH_DELAY_MS=500
```

---

## 🚨 **Emergency Response**

### **Check for Active Incidents**

```bash
# All critical health failures
curl -s "$BACKEND_URL/api/v1/health" | jq 'select(.status != "healthy")'
```

If output is not empty, escalate immediately.

---

### **Quick Rollback to v19.1**

```bash
# Only if 3 forecast failures OR critical alert triggered
railway service update --ref v19.1-stable backend
railway service update --ref v19.1-stable ml-service

railway variables set \
  MAPE_THRESHOLD=25 \
  MAX_HEALTH_FAILURES=5 \
  STREAMING_BATCH_DELAY_MS=0 \
  --service backend

railway service restart backend
railway service restart ml-service

# Verify rollback
curl -s "$BACKEND_URL/api/v1/health" | jq '.version'
# Should output: "v19.1-stable"
```

**Rollback Time:** <3 minutes

---

### **Manual Cache Warmup**

```bash
# If cache hit rate drops suddenly
curl -X POST "$BACKEND_URL/api/v1/admin/warmup-cache" \
  -H "Authorization: Bearer $ADMIN_API_KEY" | jq

# Verify cache hit rate after 5 minutes
sleep 300
curl -s "$BACKEND_URL/api/v1/health/metrics" | jq '.cache_hit_rate'
```

---

## 📊 **Weekly Summary (Sundays 09:00 UTC)**

Run this command to generate a weekly summary:

```bash
#!/bin/bash
# weekly-summary.sh

BACKEND_URL="https://backend-production.railway.app"
WEEK_START=$(date -u -d '7 days ago' +"%Y-%m-%d")
WEEK_END=$(date -u +"%Y-%m-%d")

echo "## Weekly Summary: $WEEK_START to $WEEK_END" > WEEKLY_SUMMARY.md

curl -s "$BACKEND_URL/api/v1/health/weekly-summary" | jq -r '
  "### Uptime",
  "- Uptime: \(.uptime_percent)%",
  "- Total Downtime: \(.downtime_minutes) minutes",
  "",
  "### Performance",
  "- Avg Cache Hit Rate: \(.avg_cache_hit_rate)%",
  "- Avg API P95: \(.avg_api_p95)ms",
  "- Avg API P99: \(.avg_api_p99)ms",
  "- Avg Peak Memory: \(.avg_peak_memory)%",
  "",
  "### Forecasts",
  "- Total Runs: \(.total_forecast_runs)",
  "- Success Rate: \(.forecast_success_rate)%",
  "- Avg Duration: \(.avg_forecast_duration)s",
  "- Avg MAPE: \(.avg_mape)%",
  "",
  "### Incidents",
  "- Watchdog Interventions: \(.watchdog_interventions)",
  "- Rollbacks: \(.rollbacks)",
  "- Critical Alerts: \(.critical_alerts)",
  "- Warning Alerts: \(.warning_alerts)"
' >> WEEKLY_SUMMARY.md

echo "✅ Weekly summary generated: WEEKLY_SUMMARY.md"
```

---

## 📚 **Reference Documentation**

- Full monitoring guardrails: `MONITORING_GUARDRAILS_V19_2.md`
- Deployment report: `POST_DEPLOYMENT_REPORT_V19_2.md`
- Ops changelog: `CHANGELOG_ops.md`
- Handoff message: `OPS_HANDOFF_V19_2.md`
- v19.3 planning: `V19_3_KICKOFF_PLAN.md`

---

## 📞 **When to Escalate**

### **Immediate Escalation (Slack #alerts + ops-team@neuronexus.ai)**
- Cache hit rate < 98.5% for 10 minutes
- API P95 > 20ms OR P99 > 40ms for 10 minutes
- Peak memory > 62% during forecast
- 2 forecast failures within 24 hours
- Any service downtime > 2 minutes

### **Next Business Day (Slack #monitoring)**
- Cache hit rate < 99.0% for 30 minutes
- MAPE > 19.0% (approaching threshold)
- Memory usage > 58%
- Watchdog intervention triggered
- Forecast duration > 100s

---

**Bookmark this page for daily operations!**

**Last Updated:** 2025-11-17
**Maintained By:** DevOps Team
