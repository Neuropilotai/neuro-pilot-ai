# Database Retry Operations Verification

**Date:** 2025-10-19
**Version:** v13.0.2 (MenuPredictor v6.9, FeedbackTrainer v6.9, Phase3Cron v13.0.2)
**Objective:** Validate retry effectiveness, eliminate transient DB errors, reach AI Intelligence Index ≥ 60

---

## 1. Pre-Flight Verification Checklist

### ✅ Code Integrity
- [ ] MenuPredictor.js contains `_withDatabaseRetry()` method
- [ ] FeedbackTrainer.js contains `_withDatabaseRetry()` method
- [ ] phase3_cron.js watchdog schedule = `*/15 * * * *`
- [ ] phase3_cron.js has `_watchdogRunning` mutex with finally block
- [ ] All 21 database calls wrapped (7 in MenuPredictor, 14 in FeedbackTrainer)

### ✅ Retry Configuration
- [ ] Max retries: 3 attempts
- [ ] Backoff: 200ms → 400ms → 800ms (exponential base-2)
- [ ] Error detection: catches SQLITE_ERROR, SQLITE_BUSY, SQLITE_LOCKED, "no such table"
- [ ] Logging: includes attempt number, delay, and error message

### ✅ SQLite Hardening (check at startup)
```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-20000;
PRAGMA busy_timeout=5000;
PRAGMA temp_store=MEMORY;
```

### ✅ Operational State
- [ ] No concurrent server processes (`lsof -ti:8083` returns single PID)
- [ ] database.db exists and is not corrupted
- [ ] Cron jobs initialized (6 Phase 3 jobs)
- [ ] Watchdog last check within 15 minutes

---

## 2. Success Criteria (24-hour window)

| **Metric** | **Baseline** | **Target** | **Critical Threshold** |
|------------|--------------|------------|------------------------|
| AI Intelligence Index | 51/100 | ≥ 60/100 | < 55/100 |
| Transient DB Errors | ~12/hour | ≈ 0/hour | > 3/hour |
| Retry Success Rate | N/A | ≥ 95% | < 85% |
| Retry Exhaustions | N/A | 0 | > 5/day |
| Watchdog Mutex Skips | N/A | < 2/day | > 10/day |
| P99 Response Time | Unknown | < 500ms | > 1000ms |

---

## 3. Prometheus Metrics Specification

### Metric Definitions

```javascript
// Add to metricsExporter.js

const { Counter, Gauge } = require('prom-client');

// Database Retry Metrics
const dbRetryAttempts = new Counter({
  name: 'db_retry_attempts_total',
  help: 'Total database retry attempts',
  labelNames: ['service', 'operation', 'attempt']
});

const dbRetrySuccess = new Counter({
  name: 'db_retry_success_total',
  help: 'Successful database operations after retry',
  labelNames: ['service', 'operation', 'attempts_used']
});

const dbRetryExhausted = new Counter({
  name: 'db_retry_exhausted_total',
  help: 'Database operations that failed after all retries',
  labelNames: ['service', 'operation', 'error_code']
});

const watchdogMutexSkips = new Counter({
  name: 'watchdog_mutex_skips_total',
  help: 'Watchdog cycles skipped due to mutex lock'
});

const aiIntelligenceIndex = new Gauge({
  name: 'ai_intelligence_index',
  help: 'Current AI Intelligence Index (0-100)',
  labelNames: ['component']
});

// Export for use in services
module.exports = {
  // ... existing exports
  dbRetryAttempts,
  dbRetrySuccess,
  dbRetryExhausted,
  watchdogMutexSkips,
  aiIntelligenceIndex
};
```

### Exposition Format (what appears at /metrics)

```prometheus
# HELP db_retry_attempts_total Total database retry attempts
# TYPE db_retry_attempts_total counter
db_retry_attempts_total{service="menu_predictor",operation="getPredictedUsageForToday",attempt="1"} 12
db_retry_attempts_total{service="menu_predictor",operation="getPredictedUsageForToday",attempt="2"} 3
db_retry_attempts_total{service="feedback_trainer",operation="applyAllPendingComments",attempt="1"} 8

# HELP db_retry_success_total Successful database operations after retry
# TYPE db_retry_success_total counter
db_retry_success_total{service="menu_predictor",operation="getPredictedUsageForToday",attempts_used="1"} 9
db_retry_success_total{service="menu_predictor",operation="getPredictedUsageForToday",attempts_used="2"} 3

# HELP db_retry_exhausted_total Database operations that failed after all retries
# TYPE db_retry_exhausted_total counter
db_retry_exhausted_total{service="menu_predictor",operation="getPredictedUsageForToday",error_code="SQLITE_BUSY"} 0

# HELP watchdog_mutex_skips_total Watchdog cycles skipped due to mutex lock
# TYPE watchdog_mutex_skips_total counter
watchdog_mutex_skips_total 0

# HELP ai_intelligence_index Current AI Intelligence Index (0-100)
# TYPE ai_intelligence_index gauge
ai_intelligence_index{component="forecast"} 62
ai_intelligence_index{component="learning"} 58
ai_intelligence_index{component="overall"} 60
```

---

## 4. Alert Rules (Prometheus)

```yaml
# prometheus-alerts.yml

groups:
  - name: neuropilot_db_retry_alerts
    interval: 30s
    rules:

      # CRITICAL: Retries are failing completely
      - alert: DatabaseRetryExhausted
        expr: increase(db_retry_exhausted_total[10m]) > 0
        for: 2m
        labels:
          severity: critical
          component: database
        annotations:
          summary: "Database retries exhausted for {{ $labels.service }}"
          description: "{{ $labels.service }}.{{ $labels.operation }} failed after 3 retries (error: {{ $labels.error_code }}). Check database locks and contention."
          runbook: "https://docs.neuropilot.ai/runbooks/db-retry-exhausted"

      # WARNING: Retry success rate dropping
      - alert: DatabaseRetrySuccessRateLow
        expr: |
          (
            1 - (
              sum(rate(db_retry_success_total[15m]))
              /
              clamp_min(sum(rate(db_retry_attempts_total[15m])), 0.001)
            )
          ) > 0.05
        for: 5m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Database retry success rate below 95%"
          description: "Retry success rate: {{ $value | humanizePercentage }}. Expected > 95%. Possible lock contention or schema issues."
          runbook: "https://docs.neuropilot.ai/runbooks/retry-success-rate-low"

      # WARNING: Watchdog mutex contention
      - alert: WatchdogMutexContentionHigh
        expr: increase(watchdog_mutex_skips_total[30m]) > 2
        for: 10m
        labels:
          severity: warning
          component: cron
        annotations:
          summary: "Watchdog mutex skipping cycles frequently"
          description: "{{ $value }} watchdog skips in 30min. Expected < 2. Check for long-running forecast/learning operations."
          runbook: "https://docs.neuropilot.ai/runbooks/watchdog-contention"

      # CRITICAL: AI Intelligence Index below target
      - alert: AIIntelligenceIndexLow
        expr: ai_intelligence_index{component="overall"} < 55
        for: 30m
        labels:
          severity: critical
          component: ai
        annotations:
          summary: "AI Intelligence Index critically low"
          description: "Current index: {{ $value }}. Target: ≥ 60. Check forecast completion, learning cycles, and data quality."
          runbook: "https://docs.neuropilot.ai/runbooks/ai-intelligence-low"

      # INFO: First retry succeeded (monitoring for trends)
      - alert: DatabaseRetryFirstAttemptFailureRate
        expr: |
          sum(rate(db_retry_attempts_total{attempt="2"}[1h]))
          /
          sum(rate(db_retry_attempts_total{attempt="1"}[1h]))
          > 0.10
        for: 1h
        labels:
          severity: info
          component: database
        annotations:
          summary: "Database first-attempt failure rate elevated"
          description: "{{ $value | humanizePercentage }} of operations require retry. Consider tuning PRAGMA busy_timeout or reducing concurrency."
```

---

## 5. Integration: Instrumented Retry Helper with Jitter

### Updated `_withDatabaseRetry` (with metrics + jitter)

```javascript
/**
 * Retry wrapper for database operations with exponential backoff + jitter
 * @param {Function} operation - Async function to retry
 * @param {string} operationName - Name for metrics/logging
 * @param {number} maxRetries - Max attempts (default: 3)
 * @returns {Promise} Result of operation
 * @private
 */
async _withDatabaseRetry(operation, operationName = 'db_operation', maxRetries = 3) {
  const serviceName = this.constructor.name.toLowerCase().replace('predictor', '_predictor').replace('trainer', '_trainer');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Record attempt
      if (global.metricsExporter?.dbRetryAttempts) {
        global.metricsExporter.dbRetryAttempts.inc({
          service: serviceName,
          operation: operationName,
          attempt: String(attempt)
        });
      }

      const result = await operation();

      // Record success
      if (global.metricsExporter?.dbRetrySuccess) {
        global.metricsExporter.dbRetrySuccess.inc({
          service: serviceName,
          operation: operationName,
          attempts_used: String(attempt)
        });
      }

      return result;

    } catch (error) {
      const isSqliteError = error.code === 'SQLITE_ERROR' ||
                           error.code === 'SQLITE_BUSY' ||
                           error.code === 'SQLITE_LOCKED' ||
                           (error.message && error.message.includes('no such table'));

      if (isSqliteError && attempt < maxRetries) {
        // Exponential backoff with ±20% jitter
        const baseDelay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1); // ±20%
        const delay = Math.round(baseDelay + jitter);

        console.log(`[${this.constructor.name}] DB retry ${attempt}/${maxRetries} after ${delay}ms - Error: ${error.message}`);

        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Exhausted all retries or non-retryable error
      if (isSqliteError && attempt === maxRetries) {
        if (global.metricsExporter?.dbRetryExhausted) {
          global.metricsExporter.dbRetryExhausted.inc({
            service: serviceName,
            operation: operationName,
            error_code: error.code || 'UNKNOWN'
          });
        }
      }

      throw error;
    }
  }
}
```

### Watchdog Mutex Instrumentation

```javascript
// In phase3_cron.js watchdog job
const watchdogJob = cron.schedule('*/15 * * * *', async () => {
  if (_watchdogRunning) {
    logger.warn('Phase3Cron: Watchdog already running, skipping this cycle');

    // Increment mutex skip counter
    if (global.metricsExporter?.watchdogMutexSkips) {
      global.metricsExporter.watchdogMutexSkips.inc();
    }

    return;
  }

  _watchdogRunning = true;
  // ... rest of watchdog logic
});
```

---

## 6. Postmortem Template (db_retry_exhausted_total spike)

**Incident:** Database Retry Exhaustion Event

**Date/Time:**
**Duration:**
**Impact:** AI Intelligence Index drop, forecast/learning failures

### Root Cause (pick one or more):
- [ ] **SQLite Lock Contention**: Long-running transaction blocked retries
- [ ] **Schema Corruption**: Missing table/view not detected by retry logic
- [ ] **Disk I/O Saturation**: WAL checkpoint blocked for > 1.4s (sum of retries)
- [ ] **Code Bug**: Non-idempotent operation retried incorrectly
- [ ] **Concurrency Spike**: Multiple cron jobs overlapped despite mutex

### Evidence:
1. **Metrics Snapshot**: `db_retry_exhausted_total` value, affected service/operation
2. **Logs**: Error messages, stack traces, retry attempt sequence
3. **Database State**: `PRAGMA wal_checkpoint;` status, lock holders (`lsof database.db`)
4. **Timing**: Correlation with other cron jobs, high traffic, or deployments
5. **Recovery**: How index recovered (manual intervention, auto-healed, data backfill)

### Action Items:
- [ ] Short-term: Increase `busy_timeout`, add more jitter, split large transactions
- [ ] Medium-term: Move to PostgreSQL, add connection pooling, partition hot tables
- [ ] Long-term: Implement circuit breaker, dedicate worker queues per service

---

## 7. Validation Commands

### Clean Restart
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
pkill -f "node server.js" || true
sleep 2
npm run start:all
```

### Health Check
```bash
# Basic health
curl -s http://127.0.0.1:8083/api/health/status | jq .

# Governance status (requires owner token)
curl -s -H "Authorization: Bearer $(cat .owner_token)" \
  http://127.0.0.1:8083/api/governance/status | jq .
```

### Metrics Inspection
```bash
# Check retry metrics
curl -s http://127.0.0.1:8083/metrics | grep -E \
  "db_retry|watchdog_mutex|ai_intelligence_index"

# Expected output (after a few cycles):
# db_retry_attempts_total{service="menu_predictor",...} 4
# db_retry_success_total{service="menu_predictor",...} 4
# db_retry_exhausted_total{...} 0
# watchdog_mutex_skips_total 0
# ai_intelligence_index{component="overall"} 62
```

### Live Log Monitoring
```bash
# Watch for retries (should be rare, not spammy)
tail -f logs/*.log | egrep "DB retry|watchdog|MenuPredictor|FeedbackTrainer"

# Good: occasional retry followed by success
# Bad: retry storms, exhausted messages, mutex skip spam
```

---

## 8. Triage Decision Tree (if AI Index < 60 after 24h)

### Step 1: Check Input Data Gaps (5 min)
```sql
-- Missing governance data?
SELECT COUNT(*) FROM governance_daily WHERE date >= DATE('now', '-7 days');
-- Expected: 7+ rows

-- Missing forecast cache?
SELECT COUNT(*) FROM ai_daily_forecast_cache WHERE date >= DATE('now', '-1 day');
-- Expected: 1+ rows

-- Backfill if needed
INSERT INTO governance_daily (...) VALUES (...);
```

### Step 2: Clear Feedback Trainer Backlog (2 min)
```sql
-- Check stuck pending comments
SELECT COUNT(*) FROM ai_feedback_comments WHERE applied = 0;

-- If > 100, manually apply or purge old ones
DELETE FROM ai_feedback_comments
WHERE applied = 0 AND created_at < datetime('now', '-30 days');
```

### Step 3: Identify Contention Hotspots (10 min)
```bash
# Enable SQLite query profiling
sqlite3 database.db "PRAGMA optimize;"

# Check for long transactions in logs
grep "TRANSACTION" logs/*.log | awk '{print $NF}' | sort -n | tail -20

# Look for batch sizes > 500 rows
grep "INSERT INTO" logs/*.log | grep -o "VALUES.*" | wc -l
```

### Step 4: Add Concurrency Limits (30 min code change)
```javascript
// If retry storms persist, add p-queue
const PQueue = require('p-queue');
const forecastQueue = new PQueue({ concurrency: 1 });

async getPredictedUsageForToday() {
  return forecastQueue.add(() => this._getPredictedUsageForTodayImpl());
}
```

---

## 9. Success Indicators (Green Light Criteria)

After 24 hours of operation, all must be true:

- ✅ `ai_intelligence_index{component="overall"}` ≥ 60
- ✅ `db_retry_exhausted_total` = 0 (no exhaustions)
- ✅ `db_retry_success_total / db_retry_attempts_total` ≥ 0.95 (95% success rate)
- ✅ `watchdog_mutex_skips_total` < 2 (minimal mutex contention)
- ✅ No CRITICAL alerts firing in Prometheus
- ✅ Logs show "DB retry" < 5 times/hour (rare retries are okay)
- ✅ P99 response time < 500ms for `/api/health/*` endpoints

If all green → **Production-ready for Finance user access**
If any red → **Escalate to triage decision tree**

---

## 10. Rollback Plan (if things get worse)

```bash
# Revert to v6.8 (pre-retry logic)
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
git checkout HEAD~1 src/ai/forecast/MenuPredictor.js
git checkout HEAD~1 src/ai/forecast/FeedbackTrainer.js
git checkout HEAD~1 cron/phase3_cron.js

# Restart
pkill -f "node server.js"
npm run start:all

# Confirm rollback
curl -s http://127.0.0.1:8083/health | jq '.version'
# Should show v14.4.2 (no mention of retry logic in logs)
```

**Rollback Trigger**: `db_retry_exhausted_total` increases by > 10 in 1 hour

---

**End of Document**
