# Governance Forecasting & Trend Analytics (v15.9.0)

**Author:** NeuroPilot AI Development Team
**Date:** 2025-10-18
**Version:** 15.9.0

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Forecasting Algorithm](#forecasting-algorithm)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Monitoring & Metrics](#monitoring--metrics)
7. [Autonomous Operations](#autonomous-operations)
8. [Verification & Testing](#verification--testing)

---

## Overview

The Governance Forecasting & Trend Analytics system extends the v15.8.0 Quantum Governance Layer by adding:

- **Daily Score Tracking**: Historical recording of governance pillar scores (finance, health, AI, menu, composite)
- **Short-Term Forecasting**: 7/14/30-day predictions using exponential smoothing
- **Trend Visualization**: CSP-compliant SVG sparklines with confidence bands
- **Autonomous Recomputation**: Nightly cron jobs for data collection and forecasting
- **Prometheus Integration**: Real-time metrics for monitoring

### Key Benefits
- Track governance score evolution over time
- Predict future governance states with confidence intervals
- Identify trends and degradation patterns early
- Data-driven decision making for system improvements

---

## Architecture

### Database Schema

```sql
-- Daily governance pillar scores (historical tracking)
CREATE TABLE governance_daily (
  as_of DATE NOT NULL,
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  score REAL NOT NULL,
  source TEXT,  -- 'auto', 'manual', 'backfill'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(as_of, pillar)
);

-- Governance forecasts with confidence bands
CREATE TABLE governance_forecast (
  run_id TEXT NOT NULL,
  as_of DATE NOT NULL,
  horizon INTEGER NOT NULL,  -- 7, 14, or 30 days
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  score REAL NOT NULL,
  lower REAL NOT NULL,  -- Lower confidence bound
  upper REAL NOT NULL,  -- Upper confidence bound
  method TEXT NOT NULL, -- 'exp_smoothing'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(run_id, as_of, pillar, horizon)
);
```

### Service Layer

**`GovernanceTrendService.js`**
- `recordDailyScores()`: Captures current governance state
- `computeForecast()`: Generates predictions using exponential smoothing
- `getTrends()`: Retrieves historical series + forecasts for visualization
- `getPillarStats()`: Computes aggregated statistics per pillar

### API Routes

**`governance-trends.js`**
- GET `/api/governance/trends` - Fetch trends + forecasts (FINANCE/OPS/OWNER)
- POST `/api/governance/recompute/daily` - Record daily scores (OWNER only)
- POST `/api/governance/recompute/forecast` - Compute forecasts (OWNER only)
- GET `/api/governance/stats/:pillar` - Get pillar statistics (FINANCE/OPS/OWNER)

---

## Forecasting Algorithm

### Exponential Smoothing with Adaptive Alpha

**Core Formula:**
```
S(t) = α × X(t) + (1 - α) × S(t-1)
```

Where:
- `S(t)` = Smoothed value at time t
- `X(t)` = Actual observation at time t
- `α` = Smoothing parameter (0.2–0.6, adaptive)

### Adaptive Alpha Calculation

```javascript
calculateAdaptiveAlpha(values) {
  const recentWindow = values.slice(-7);  // Last 7 observations
  const volatility = stdDev(recentWindow);

  const baseAlpha = 0.3;
  const adaptiveFactor = Math.min(volatility / 10, 0.3);

  return Math.max(0.2, Math.min(0.6, baseAlpha + adaptiveFactor));
}
```

**Logic:**
- High volatility → Higher α → More responsive to recent changes
- Low volatility → Lower α → More smoothing

### Confidence Intervals (80% Band)

```javascript
margin = 1.28 × σ × sqrt(horizon / 7)
lower = forecast - margin
upper = forecast + margin
```

Where:
- `1.28` = Z-score for 80% confidence
- `σ` = Standard deviation of forecast residuals
- `sqrt(horizon / 7)` = Horizon scaling factor

### Why Exponential Smoothing?

1. **Simplicity**: Single-parameter method, easy to interpret
2. **Adaptive**: Automatically adjusts to recent trends
3. **Robust**: Handles noisy data well
4. **Fast**: Computationally efficient (O(n) complexity)
5. **Industry Standard**: Widely used for short-term forecasting

---

## API Endpoints

### GET /api/governance/trends

**Description:** Fetch governance trends and forecasts

**Query Parameters:**
- `from` (optional): Start date (YYYY-MM-DD), default: 30 days ago
- `to` (optional): End date (YYYY-MM-DD), default: today
- `pillar` (optional): all|finance|health|ai|menu|composite, default: all

**Response:**
```json
{
  "success": true,
  "series": [
    {
      "as_of": "2025-10-01",
      "pillar": "finance",
      "score": 88.5,
      "source": "auto"
    }
  ],
  "forecasts": [
    {
      "pillar": "finance",
      "as_of": "2025-10-25",
      "horizon": 14,
      "score": 89.2,
      "lower": 85.1,
      "upper": 93.3,
      "method": "exp_smoothing"
    }
  ],
  "from": "2025-09-18",
  "to": "2025-10-18",
  "cached": false
}
```

**Caching:** 60-second TTL

**RBAC:** FINANCE, OPS, OWNER

---

### POST /api/governance/recompute/daily

**Description:** Record daily governance scores for all pillars

**Request Body:**
```json
{
  "as_of": "2025-10-18",  // Optional, defaults to today
  "source": "manual"       // Optional: 'auto'|'manual'|'backfill'
}
```

**Response:**
```json
{
  "success": true,
  "as_of": "2025-10-18",
  "scores": {
    "finance": 88.5,
    "health": 92.3,
    "ai": 85.7,
    "menu": 90.1,
    "composite": 89.2
  },
  "source": "manual",
  "runtime_seconds": 0.12
}
```

**RBAC:** OWNER only

**Audit:** Logged to `audit_log` table

---

### POST /api/governance/recompute/forecast

**Description:** Compute forecasts for all pillars

**Request Body:**
```json
{
  "horizons": [7, 14, 30],       // Optional, default: [7, 14, 30]
  "method": "exp_smoothing"      // Optional, default: 'exp_smoothing'
}
```

**Response:**
```json
{
  "success": true,
  "run_id": "2025-10-18T14:30:00.000Z",
  "method": "exp_smoothing",
  "forecast_count": 15,
  "runtime_seconds": 0.35
}
```

**RBAC:** OWNER only

**Audit:** Logged to `audit_log` table

---

### GET /api/governance/stats/:pillar

**Description:** Get statistics for a specific pillar

**Path Parameters:**
- `pillar`: finance|health|ai|menu|composite

**Response:**
```json
{
  "success": true,
  "pillar": "finance",
  "stats": {
    "point_count": 30,
    "first_date": "2025-09-18",
    "last_date": "2025-10-18",
    "avg_score": 88.7,
    "min_score": 82.3,
    "max_score": 94.1
  }
}
```

**RBAC:** FINANCE, OPS, OWNER

---

## Frontend Integration

### Governance Tab Enhancements

**Location:** `frontend/owner-super-console.html` → ⚛️ Governance Tab

**Components:**
1. **Period Selector**: 7d / 14d / 30d (default: 30d)
2. **Pillar Filter**: All / Finance / Health / AI / Menu / Composite
3. **Forecast Horizon**: 7 / 14 / 30 days (default: 14d)
4. **Sparkline Cards**: One card per pillar with:
   - Latest score badge (color-coded)
   - Pure SVG sparkline (historical + forecast)
   - Forecast value with confidence range

### Visualization

**Sparkline Features:**
- **Historical Line**: Blue line connecting data points
- **Baseline Grid**: Dashed lines at 50, 75, 90
- **Confidence Band**: Light blue shaded area (±1.28σ)
- **Forecast Point**: Orange dot with tooltip
- **Tooltips**: Date + score on hover

**Color Coding:**
- Green badge: score ≥ 90
- Amber badge: score 75–89
- Red badge: score < 75

### CSP Compliance

All visualization code is:
- Pure JavaScript (no inline `<script>`)
- CSS classes only (no inline `style=`)
- SVG created via `document.createElementNS()`
- Event listeners added via `addEventListener()`

---

## Monitoring & Metrics

### Prometheus Metrics

**Gauges:**
```promql
# Current composite score
governance_score_composite_current{} 89.2

# Current pillar scores
governance_score_pillar_current{pillar="finance"} 88.5
governance_score_pillar_current{pillar="health"} 92.3
governance_score_pillar_current{pillar="ai"} 85.7
governance_score_pillar_current{pillar="menu"} 90.1
```

**Counters:**
```promql
# Total trend points recorded
governance_trend_points_total{pillar="finance"} 156
governance_trend_points_total{pillar="health"} 156

# Total forecast runs executed
governance_forecast_runs_total{} 42
```

**Histogram:**
```promql
# Forecast computation runtime (seconds)
governance_forecast_runtime_seconds_bucket{le="0.5"} 38
governance_forecast_runtime_seconds_bucket{le="1.0"} 42
governance_forecast_runtime_seconds_sum 12.8
governance_forecast_runtime_seconds_count 42
```

### Grafana Dashboard Example

```json
{
  "title": "Governance Trends",
  "panels": [
    {
      "title": "Composite Score Trend",
      "targets": [
        {
          "expr": "governance_score_composite_current",
          "legendFormat": "Current Score"
        }
      ]
    },
    {
      "title": "Forecast Runtime",
      "targets": [
        {
          "expr": "rate(governance_forecast_runtime_seconds_sum[5m])",
          "legendFormat": "Avg Runtime"
        }
      ]
    }
  ]
}
```

---

## Autonomous Operations

### Cron Jobs (phase3_cron.js)

**Daily 02:05 – Record Daily Scores**
```javascript
cron.schedule('5 2 * * *', async () => {
  const govTrendService = new GovernanceTrendService(db);
  await govTrendService.recordDailyScores({ source: 'auto' });
  // Logs, metrics, event emission
});
```

**Daily 02:10 – Compute Forecasts**
```javascript
cron.schedule('10 2 * * *', async () => {
  const govTrendService = new GovernanceTrendService(db);
  await govTrendService.computeForecast({
    horizons: [7, 14, 30],
    method: 'exp_smoothing'
  });
  // Logs, metrics, event emission
});
```

**Why these times?**
- 02:05: After midnight, data is stable
- 02:10: After daily recording, forecasts use fresh data
- Low-traffic window: Minimal user impact

---

## Verification & Testing

### Run Verification Script

```bash
cd backend
./scripts/verify_governance_trends.sh
```

**Tests:**
1. POST /api/governance/recompute/daily
2. POST /api/governance/recompute/forecast
3. GET /api/governance/trends with validation
4. GET /api/governance/stats/:pillar
5. Prometheus metrics presence
6. Database schema validation

**Expected Output:**
```
================================================================
   v15.9.0 Governance Trends & Forecasting Verification
================================================================

✓ Loaded auth token from ./.owner_token

Test 1: Record Daily Governance Scores
================================================
✓ POST /api/governance/recompute/daily (HTTP 200)
✓ Response structure valid (all pillar scores present)

Test 2: Compute Governance Forecasts
================================================
✓ POST /api/governance/recompute/forecast (HTTP 200)
✓ Response structure valid (run_id, forecast_count, runtime present)
✓ Forecasts generated: 15

...

================================================================
   Summary
================================================================

✓ All tests passed!

Governance Trends & Forecasting v15.9.0 is fully operational.
```

### Manual Testing

**1. Trigger Daily Recording:**
```bash
curl -X POST http://localhost:8083/api/governance/recompute/daily \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

**2. Generate Forecasts:**
```bash
curl -X POST http://localhost:8083/api/governance/recompute/forecast \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"horizons": [7, 14, 30]}'
```

**3. Fetch Trends:**
```bash
curl -G http://localhost:8083/api/governance/trends \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "from=2025-09-18" \
  --data-urlencode "to=2025-10-18" \
  --data-urlencode "pillar=all"
```

**4. Check Metrics:**
```bash
curl http://localhost:8083/metrics | grep governance
```

---

## Migration Guide (from v15.8.0)

### Step 1: Apply Migration

```bash
cd backend
sqlite3 inventory.db < migrations/029_governance_trends.sql
```

Verify tables created:
```bash
sqlite3 inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'governance%';"
```

### Step 2: Restart Server

```bash
npm start
```

Server should mount new routes:
```
✅ Server listening on port 8083
✅ Governance Trends routes mounted at /api/governance
```

### Step 3: Initial Data Load

Record first daily snapshot:
```bash
curl -X POST http://localhost:8083/api/governance/recompute/daily \
  -H "Authorization: Bearer $(cat .owner_token)" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

### Step 4: Verify Frontend

1. Open Owner Console: http://localhost:8083/owner-super-console.html
2. Navigate to ⚛️ Governance tab
3. Scroll to "Governance Trends & Forecasts (v15.9.0)" section
4. Click "↻ Refresh Trends"
5. Verify sparklines appear

### Step 5: Enable Cron Jobs

Cron jobs are automatically enabled via `phase3_cron.js`. Verify:
```bash
tail -f logs/cron.log | grep governance
```

Wait for 02:05 (daily recording) and 02:10 (forecasting) to run.

---

## Troubleshooting

### No forecasts generated

**Symptom:** `forecast_count: 0` in response

**Cause:** Insufficient historical data (< 3 data points)

**Solution:** Record daily scores manually for 3+ days:
```bash
# Backfill last 7 days
for i in {1..7}; do
  date=$(date -u -v-${i}d +"%Y-%m-%d" 2>/dev/null || date -u -d "$i days ago" +"%Y-%m-%d")
  curl -X POST http://localhost:8083/api/governance/recompute/daily \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"as_of\": \"$date\", \"source\": \"backfill\"}"
  sleep 1
done
```

### Trends not visible in frontend

**Symptom:** Sparklines show "Loading..." or "No data"

**Cause:** JavaScript error or missing data

**Solution:**
1. Open browser console (F12)
2. Look for errors in console
3. Check Network tab for failed API calls
4. Verify data exists: `sqlite3 inventory.db "SELECT COUNT(*) FROM governance_daily;"`

### Metrics not appearing in /metrics

**Symptom:** `curl http://localhost:8083/metrics | grep governance` returns nothing

**Cause:** Metrics not recorded yet

**Solution:** Trigger daily recording to populate metrics:
```bash
curl -X POST http://localhost:8083/api/governance/recompute/daily \
  -H "Authorization: Bearer $TOKEN"
```

---

## References

- v15.8.0: Quantum Governance Layer
- Exponential Smoothing: [Wikipedia](https://en.wikipedia.org/wiki/Exponential_smoothing)
- Prometheus Best Practices: [prometheus.io](https://prometheus.io/docs/practices/)
- Content Security Policy: [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

**For questions or support, contact the NeuroPilot AI Development Team.**
