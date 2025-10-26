# Database Retry Production Runbook v13.0.2

**Target:** AI Intelligence Index ≥ 60, zero transient DB errors, no watchdog overlap
**Timeline:** 24-hour validation window
**Owner:** DevOps / SRE Team

---

## 1. Verification Plan

### 1.1 Pre-Flight Check (before restart)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Verify code changes are in place
grep -n "_withDatabaseRetry" src/ai/forecast/MenuPredictor.js | head -1
# Expected: line number + async _withDatabaseRetry(operation

grep -n "*/15 \* \* \* \*" cron/phase3_cron.js
# Expected: const watchdogJob = cron.schedule('*/15 * * * *'

grep -n "dbRetryAttempts" utils/metricsExporter.js | head -1
# Expected: this.dbRetryAttempts = new promClient.Counter

# Ensure no processes on port 8083
lsof -ti:8083 || echo "Port 8083 is free ✓"
```

### 1.2 Clean Restart

```bash
# Kill all server processes
pkill -f "node server.js" || true

# Wait for cleanup
sleep 2

# Start server with all features
npm run start:all &

# Capture PID for later reference
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for startup (30 seconds max)
timeout 30 bash -c 'until curl -s http://localhost:8083/health > /dev/null; do sleep 1; done' && echo "✓ Server is up"
```

### 1.3 API Validation (Green/Yellow/Red)

```bash
# Test 1: Health Status (no auth required)
curl -s http://127.0.0.1:8083/api/health/status | jq -r '.status, .version'
# ✅ GREEN: "ok" + "14.4.2"
# 🟡 YELLOW: 5xx error
# 🔴 RED: Connection refused

# Test 2: Governance Status (requires owner token)
TOKEN=$(cat .owner_token 2>/dev/null || echo "missing")
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8083/api/governance/status | jq '.status, .score'
# ✅ GREEN: "healthy" + numeric score
# 🟡 YELLOW: 401 Unauthorized (check token)
# 🔴 RED: 500 Internal Server Error

# Test 3: Metrics Endpoint (no auth)
curl -s http://127.0.0.1:8083/metrics | grep -c "db_retry_attempts_total"
# ✅ GREEN: 1 (metric exists)
# 🟡 YELLOW: 0 (metric not registered)
# 🔴 RED: Connection refused

# Test 4: Check Watchdog Schedule in Logs
tail -100 logs/$(ls -t logs/ | head -1) | grep "Phase3Cron.*jobs started"
# ✅ GREEN: "All jobs started" with jobCount=6
# 🟡 YELLOW: jobCount ≠ 6
# 🔴 RED: No log entry (cron not initialized)
```

### 1.4 Live Log Monitoring (non-blocking)

```bash
# Terminal 1: Monitor retries (should be RARE)
tail -f logs/*.log | egrep --line-buffered "DB retry|MenuPredictor|FeedbackTrainer" &
TAIL_PID=$!

# Expected output (GOOD):
# [MenuPredictor] DB retry 1/3 after 215ms - Error: database is locked
# [MenuPredictor] Operation succeeded on attempt 2
# Frequency: < 5 per hour

# Expected output (BAD):
# [MenuPredictor] DB retry 1/3 after 200ms - Error: no such table
# [MenuPredictor] DB retry 2/3 after 400ms - Error: no such table
# [MenuPredictor] DB retry 3/3 after 800ms - Error: no such table
# ERROR: Database operation failed after all retries
# Frequency: > 10 per hour → INVESTIGATE IMMEDIATELY

# Terminal 2: Monitor watchdog mutex (should see ZERO skips normally)
tail -f logs/*.log | egrep --line-buffered "watchdog.*skipping this cycle" &

# Expected output (GOOD): (silence)
# Expected output (WARNING): 1-2 skips per day
# Expected output (BAD): > 5 skips per hour → Long-running jobs blocking
```

### 1.5 Metrics Inspection (after 15 minutes of uptime)

```bash
# Wait for first watchdog cycle (15 min) + margin
sleep 960

# Check retry metrics
curl -s http://127.0.0.1:8083/metrics | grep "db_retry" | sort

# ✅ GREEN (ideal - no retries needed):
# db_retry_attempts_total{service="menu_predictor",operation="getPredictedUsageForToday",attempt="1"} 4
# db_retry_success_total{service="menu_predictor",operation="getPredictedUsageForToday",attempts_used="1"} 4
# db_retry_exhausted_total 0

# 🟡 YELLOW (retries working):
# db_retry_attempts_total{...attempt="1"} 10
# db_retry_attempts_total{...attempt="2"} 3
# db_retry_success_total{...attempts_used="1"} 7
# db_retry_success_total{...attempts_used="2"} 3
# db_retry_exhausted_total 0

# 🔴 RED (exhaustions happening):
# db_retry_exhausted_total{service="menu_predictor",operation="...",error_code="SQLITE_BUSY"} 2
# → ALERT: Immediate investigation required

# Check watchdog mutex
curl -s http://127.0.0.1:8083/metrics | grep "watchdog_mutex_skips_total"
# ✅ GREEN: watchdog_mutex_skips_total 0
# 🟡 YELLOW: watchdog_mutex_skips_total 1-2
# 🔴 RED: watchdog_mutex_skips_total > 5 → Long-running forecasts

# Check AI Intelligence Index (may take 24h to stabilize)
curl -s http://127.0.0.1:8083/metrics | grep "ai_intelligence_index"
# ✅ GREEN: ai_intelligence_index{component="overall"} 62
# 🟡 YELLOW: ai_intelligence_index{component="overall"} 55-59
# 🔴 RED: ai_intelligence_index{component="overall"} < 55
```

### 1.6 Success Criteria (24-hour checkpoint)

| Metric | Target | Check Command |
|--------|--------|---------------|
| `db_retry_exhausted_total` | = 0 | `curl -s http://localhost:8083/metrics \| grep exhausted` |
| Retry success rate | ≥ 95% | Prometheus query (see Section 3) |
| `watchdog_mutex_skips_total` | < 2 | `curl -s http://localhost:8083/metrics \| grep mutex` |
| `ai_intelligence_index` | ≥ 60 | `curl -s http://localhost:8083/metrics \| grep intelligence` |
| Transient errors in logs | < 5/day | `grep -c "DB retry" logs/*.log` |

---

## 2. Prometheus Metrics Implementation

### 2.1 Metric Definitions (already added to metricsExporter.js)

```javascript
// In utils/metricsExporter.js initializeMetrics()

const promClient = require('prom-client');

// Database Retry Metrics
this.dbRetryAttempts = new promClient.Counter({
  name: 'db_retry_attempts_total',
  help: 'Total database retry attempts',
  labelNames: ['service', 'operation', 'attempt']
});

this.dbRetrySuccess = new promClient.Counter({
  name: 'db_retry_success_total',
  help: 'Successful database operations after retry',
  labelNames: ['service', 'operation', 'attempts_used']
});

this.dbRetryExhausted = new promClient.Counter({
  name: 'db_retry_exhausted_total',
  help: 'Database operations that failed after all retries',
  labelNames: ['service', 'operation', 'error_code']
});

this.watchdogMutexSkips = new promClient.Counter({
  name: 'watchdog_mutex_skips_total',
  help: 'Watchdog cycles skipped due to mutex lock'
});

this.aiIntelligenceIndex = new promClient.Gauge({
  name: 'ai_intelligence_index',
  help: 'Current AI Intelligence Index (0-100)',
  labelNames: ['component']
});

// Register metrics
this.register.registerMetric(this.dbRetryAttempts);
this.register.registerMetric(this.dbRetrySuccess);
this.register.registerMetric(this.dbRetryExhausted);
this.register.registerMetric(this.watchdogMutexSkips);
this.register.registerMetric(this.aiIntelligenceIndex);
```

### 2.2 Helper Methods (already added)

```javascript
// In utils/metricsExporter.js (class methods)

recordDbRetryAttempt(service, operation, attempt) {
  this.dbRetryAttempts.labels(service, operation, String(attempt)).inc();
}

recordDbRetrySuccess(service, operation, attemptsUsed) {
  this.dbRetrySuccess.labels(service, operation, String(attemptsUsed)).inc();
}

recordDbRetryExhausted(service, operation, errorCode) {
  this.dbRetryExhausted.labels(service, operation, errorCode || 'UNKNOWN').inc();
}

recordWatchdogMutexSkip() {
  this.watchdogMutexSkips.inc();
}

setAiIntelligenceIndex(component, score) {
  this.aiIntelligenceIndex.labels(component).set(score);
}
```

### 2.3 Integration Example (current implementation)

```javascript
// In MenuPredictor.js _withDatabaseRetry() method

async _withDatabaseRetry(operation, operationName = 'db_operation', maxRetries = 3) {
  const serviceName = 'menu_predictor';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Record attempt
      if (global.metricsExporter?.recordDbRetryAttempt) {
        global.metricsExporter.recordDbRetryAttempt(serviceName, operationName, attempt);
      }

      const result = await operation();

      // Record success
      if (global.metricsExporter?.recordDbRetrySuccess) {
        global.metricsExporter.recordDbRetrySuccess(serviceName, operationName, attempt);
      }

      return result;

    } catch (error) {
      const isSqliteError = error.code === 'SQLITE_ERROR' ||
                           error.code === 'SQLITE_BUSY' ||
                           error.code === 'SQLITE_LOCKED' ||
                           (error.message && error.message.includes('no such table'));

      if (isSqliteError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
        console.log(`[MenuPredictor] DB retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Exhausted all retries
      if (isSqliteError && attempt === maxRetries) {
        if (global.metricsExporter?.recordDbRetryExhausted) {
          global.metricsExporter.recordDbRetryExhausted(
            serviceName,
            operationName,
            error.code || 'UNKNOWN'
          );
        }
      }

      throw error;
    }
  }
}
```

### 2.4 Example /metrics Output

```prometheus
# HELP db_retry_attempts_total Total database retry attempts
# TYPE db_retry_attempts_total counter
db_retry_attempts_total{service="menu_predictor",operation="getPredictedUsageForToday",attempt="1"} 12
db_retry_attempts_total{service="menu_predictor",operation="getPredictedUsageForToday",attempt="2"} 3
db_retry_attempts_total{service="feedback_trainer",operation="applyAllPendingComments",attempt="1"} 8
db_retry_attempts_total{service="feedback_trainer",operation="applyAllPendingComments",attempt="2"} 1

# HELP db_retry_success_total Successful database operations after retry
# TYPE db_retry_success_total counter
db_retry_success_total{service="menu_predictor",operation="getPredictedUsageForToday",attempts_used="1"} 9
db_retry_success_total{service="menu_predictor",operation="getPredictedUsageForToday",attempts_used="2"} 3
db_retry_success_total{service="feedback_trainer",operation="applyAllPendingComments",attempts_used="1"} 7
db_retry_success_total{service="feedback_trainer",operation="applyAllPendingComments",attempts_used="2"} 1

# HELP db_retry_exhausted_total Database operations that failed after all retries
# TYPE db_retry_exhausted_total counter
db_retry_exhausted_total{service="menu_predictor",operation="getPredictedUsageForToday",error_code="SQLITE_BUSY"} 0

# HELP watchdog_mutex_skips_total Watchdog cycles skipped due to mutex lock
# TYPE watchdog_mutex_skips_total counter
watchdog_mutex_skips_total 0

# HELP ai_intelligence_index Current AI Intelligence Index (0-100)
# TYPE ai_intelligence_index gauge
ai_intelligence_index{component="forecast"} 64
ai_intelligence_index{component="learning"} 58
ai_intelligence_index{component="overall"} 61
```

---

## 3. Prometheus Alert Rules

### 3.1 Alert Rule File (prometheus-db-retry-alerts.yml)

```yaml
groups:
  - name: neuropilot_database_retry_alerts
    interval: 30s
    rules:

      # ========================================================================
      # CRITICAL: Database retries completely exhausted
      # ========================================================================
      - alert: DatabaseRetryExhausted
        expr: increase(db_retry_exhausted_total[10m]) > 0
        for: 2m
        labels:
          severity: critical
          component: database
          team: backend
        annotations:
          summary: "Database retries exhausted for {{ $labels.service }}"
          description: |
            Service: {{ $labels.service }}
            Operation: {{ $labels.operation }}
            Error Code: {{ $labels.error_code }}

            All 3 retry attempts failed. This indicates a persistent database issue.

            Immediate Actions:
            1. Check database locks: sqlite3 database.db "PRAGMA wal_checkpoint;"
            2. Verify schema exists: sqlite3 database.db ".tables" | grep {{ $labels.operation }}
            3. Check disk space: df -h
            4. Review logs: tail -100 logs/*.log | grep "{{ $labels.operation }}"
          runbook_url: "https://docs.neuropilot.ai/runbooks/db-retry-exhausted"
          dashboard_url: "https://grafana.neuropilot.ai/d/database-health"

      # ========================================================================
      # WARNING: Retry success rate dropping below 95%
      # ========================================================================
      - alert: DatabaseRetrySuccessRateLow
        expr: |
          (
            sum(rate(db_retry_success_total[15m]))
            /
            clamp_min(sum(rate(db_retry_attempts_total[15m])), 0.001)
          ) < 0.95
        for: 5m
        labels:
          severity: warning
          component: database
          team: backend
        annotations:
          summary: "Database retry success rate below 95%"
          description: |
            Current success rate: {{ $value | humanizePercentage }}
            Target: ≥ 95%

            Possible causes:
            - Increased database contention
            - Long-running transactions
            - Disk I/O saturation
            - Schema corruption

            Actions:
            1. Check for long-running queries
            2. Review recent schema changes
            3. Monitor disk I/O with iostat
            4. Consider increasing PRAGMA busy_timeout
          runbook_url: "https://docs.neuropilot.ai/runbooks/retry-success-rate-low"

      # ========================================================================
      # WARNING: Watchdog mutex contention (jobs running too long)
      # ========================================================================
      - alert: WatchdogMutexContentionHigh
        expr: increase(watchdog_mutex_skips_total[30m]) > 2
        for: 10m
        labels:
          severity: warning
          component: cron
          team: backend
        annotations:
          summary: "Watchdog skipping cycles due to mutex contention"
          description: |
            Skipped cycles in last 30 minutes: {{ $value }}
            Expected: < 2

            The watchdog mutex is preventing concurrent runs, which means
            forecast/learning jobs are taking longer than 15 minutes.

            Actions:
            1. Check forecast duration: grep "getPredictedUsageForToday" logs/*.log
            2. Check learning duration: grep "applyAllPendingComments" logs/*.log
            3. Review data volume: sqlite3 database.db "SELECT COUNT(*) FROM menu_calendar;"
            4. Consider splitting large operations into batches
          runbook_url: "https://docs.neuropilot.ai/runbooks/watchdog-contention"

      # ========================================================================
      # CRITICAL: AI Intelligence Index critically low
      # ========================================================================
      - alert: AIIntelligenceIndexCritical
        expr: ai_intelligence_index{component="overall"} < 55
        for: 30m
        labels:
          severity: critical
          component: ai
          team: data-science
        annotations:
          summary: "AI Intelligence Index critically low"
          description: |
            Current index: {{ $value }}
            Target: ≥ 60
            Critical threshold: < 55

            This indicates forecasting and learning loops are not completing successfully.

            Root causes:
            1. Database errors preventing forecast completion
            2. Missing input data (governance_daily, ai_daily_forecast_cache)
            3. Stuck pending comments in feedback_trainer
            4. Schema corruption

            Immediate triage:
            1. Check db_retry_exhausted_total (should be 0)
            2. Verify tables exist and have recent data
            3. Clear stuck pending comments if backlog > 100
            4. Run manual forecast: node -e "require('./src/ai/forecast/MenuPredictor.js')"
          runbook_url: "https://docs.neuropilot.ai/runbooks/ai-intelligence-low"
          dashboard_url: "https://grafana.neuropilot.ai/d/ai-intelligence"

      # ========================================================================
      # INFO: First-attempt failure rate elevated (monitoring trend)
      # ========================================================================
      - alert: DatabaseRetryFirstAttemptFailureRateElevated
        expr: |
          (
            sum(rate(db_retry_attempts_total{attempt="2"}[1h]))
            /
            clamp_min(sum(rate(db_retry_attempts_total{attempt="1"}[1h])), 0.001)
          ) > 0.10
        for: 1h
        labels:
          severity: info
          component: database
          team: backend
        annotations:
          summary: "Database first-attempt failure rate elevated"
          description: |
            Failure rate: {{ $value | humanizePercentage }}
            Target: < 10%

            {{ $value | humanizePercentage }} of database operations are requiring retries.
            This may indicate increasing contention or performance degradation.

            Consider:
            1. Tuning PRAGMA busy_timeout (current: 5000ms)
            2. Reducing concurrent cron job frequency
            3. Adding indexes to frequently queried tables
            4. Migrating to PostgreSQL for production workloads
          runbook_url: "https://docs.neuropilot.ai/runbooks/db-tuning"
```

### 3.2 PromQL Queries for Dashboards

```promql
# Retry Success Rate (15-minute window)
(
  sum(rate(db_retry_success_total[15m]))
  /
  clamp_min(sum(rate(db_retry_attempts_total[15m])), 1)
) * 100

# Retry Exhaustion Count (10-minute increase)
increase(db_retry_exhausted_total[10m])

# Watchdog Mutex Skips (30-minute increase)
increase(watchdog_mutex_skips_total[30m])

# AI Intelligence Index (current value)
ai_intelligence_index{component="overall"}

# Retry Attempts by Service (per-second rate)
sum(rate(db_retry_attempts_total[5m])) by (service)

# Average Retry Attempts per Operation
sum(rate(db_retry_attempts_total[5m])) by (service, operation)
/
sum(rate(db_retry_success_total[5m])) by (service, operation)
```

---

## 4. Improved Backoff with Jitter

### 4.1 Enhanced Retry Helper (src/utils/dbRetryHelper.js)

**Create new file:** `src/utils/dbRetryHelper.js`

```javascript
/**
 * Database Retry Helper with Exponential Backoff + Jitter
 *
 * @module dbRetryHelper
 * @version 13.0.3
 */

/**
 * Retry wrapper for database operations
 *
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} options.tries - Maximum attempts (default: 3)
 * @param {number} options.baseMs - Base delay in milliseconds (default: 200)
 * @param {number} options.jitterPct - Jitter as decimal (default: 0.2 = ±20%)
 * @param {string} options.serviceName - Service name for metrics
 * @param {string} options.operationName - Operation name for metrics
 * @returns {Promise<any>} Result of operation
 * @throws {Error} If all retries exhausted or non-retryable error
 */
async function withDatabaseRetry(operation, options = {}) {
  const {
    tries = 3,
    baseMs = 200,
    jitterPct = 0.2,
    serviceName = 'unknown',
    operationName = 'db_operation'
  } = options;

  // Validate inputs
  if (tries < 1 || tries > 10) {
    throw new Error(`Invalid tries: ${tries}. Must be 1-10.`);
  }
  if (baseMs < 10 || baseMs > 10000) {
    throw new Error(`Invalid baseMs: ${baseMs}. Must be 10-10000.`);
  }
  if (jitterPct < 0 || jitterPct > 0.5) {
    throw new Error(`Invalid jitterPct: ${jitterPct}. Must be 0-0.5.`);
  }

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      // Record attempt
      if (global.metricsExporter?.recordDbRetryAttempt) {
        global.metricsExporter.recordDbRetryAttempt(serviceName, operationName, attempt);
      }

      // Execute operation
      const result = await operation();

      // Record success
      if (global.metricsExporter?.recordDbRetrySuccess) {
        global.metricsExporter.recordDbRetrySuccess(serviceName, operationName, attempt);
      }

      return result;

    } catch (error) {
      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      if (isRetryable && attempt < tries) {
        // Calculate delay with jitter
        const exponentialDelay = Math.pow(2, attempt) * baseMs;
        const jitterRange = Math.floor(exponentialDelay * jitterPct);
        const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
        const delayMs = exponentialDelay + jitter;

        console.log(
          `[${serviceName}] DB retry ${attempt}/${tries} ` +
          `after ${delayMs}ms (base: ${exponentialDelay}ms, jitter: ${jitter >= 0 ? '+' : ''}${jitter}ms) ` +
          `- Error: ${error.message}`
        );

        await sleep(delayMs);
        continue;
      }

      // Exhausted all retries or non-retryable error
      if (isRetryable && attempt === tries) {
        if (global.metricsExporter?.recordDbRetryExhausted) {
          global.metricsExporter.recordDbRetryExhausted(
            serviceName,
            operationName,
            error.code || 'UNKNOWN'
          );
        }
        console.error(
          `[${serviceName}] DB operation "${operationName}" failed after ${tries} attempts. ` +
          `Last error: ${error.message}`
        );
      }

      throw error;
    }
  }
}

/**
 * Check if error is retryable (SQLite-specific)
 *
 * @param {Error} error - Error object
 * @returns {boolean} True if error should trigger retry
 */
function isRetryableError(error) {
  if (!error) return false;

  const retryableCodes = ['SQLITE_ERROR', 'SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_IOERR'];
  const retryableMessages = ['no such table', 'database is locked', 'disk I/O error'];

  // Check error code
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  // Check error message
  if (error.message) {
    const msgLower = error.message.toLowerCase();
    return retryableMessages.some(pattern => msgLower.includes(pattern));
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  withDatabaseRetry,
  isRetryableError
};
```

### 4.2 Usage in MenuPredictor.js

```javascript
// At top of MenuPredictor.js
const { withDatabaseRetry } = require('../../utils/dbRetryHelper');

class MenuPredictor {
  constructor(db) {
    this.db = db;
    this.dbAll = db.all.bind(db);
    this.dbGet = db.get.bind(db);
    this.dbRun = db.run.bind(db);
  }

  /**
   * Get predicted usage for today (with retry)
   */
  async getPredictedUsageForToday() {
    const date = new Date().toISOString().split('T')[0];

    const items = await withDatabaseRetry(
      () => this.dbAll(`
        SELECT
          item_code,
          item_name,
          total_predicted_qty,
          unit,
          current_stock,
          par_level,
          stock_out_risk,
          forecast_sources,
          avg_confidence,
          num_recipes_using
        FROM v_predicted_usage_today_v2
        ORDER BY stock_out_risk DESC, total_predicted_qty DESC
      `),
      {
        tries: 3,
        baseMs: 200,
        jitterPct: 0.2,
        serviceName: 'menu_predictor',
        operationName: 'getPredictedUsageForToday'
      }
    );

    // ... rest of method
  }
}
```

### 4.3 Usage in FeedbackTrainer.js

```javascript
// At top of FeedbackTrainer.js
const { withDatabaseRetry } = require('../../utils/dbRetryHelper');

class FeedbackTrainer {
  constructor(db) {
    this.db = db;
    this.dbAll = db.all.bind(db);
    this.dbGet = db.get.bind(db);
    this.dbRun = db.run.bind(db);
  }

  /**
   * Apply learning from all pending comments (with retry)
   */
  async applyAllPendingComments() {
    const pending = await withDatabaseRetry(
      () => this.dbAll(`
        SELECT comment_id
        FROM ai_feedback_comments
        WHERE applied = 0
        ORDER BY created_at ASC
      `),
      {
        tries: 3,
        baseMs: 200,
        jitterPct: 0.2,
        serviceName: 'feedback_trainer',
        operationName: 'applyAllPendingComments'
      }
    );

    // ... rest of method
  }
}
```

### 4.4 Benefits of Jitter

**Before (no jitter):**
```
Attempt 1: fails at t=0ms
Attempt 2: fails at t=200ms (collision if multiple processes retry)
Attempt 3: succeeds at t=600ms
```

**After (with ±20% jitter):**
```
Process A:
  Attempt 1: fails at t=0ms
  Attempt 2: fails at t=215ms (+15ms jitter)
  Attempt 3: succeeds at t=627ms (+27ms jitter)

Process B:
  Attempt 1: fails at t=0ms
  Attempt 2: succeeds at t=187ms (-13ms jitter) ← Avoided collision!
```

**Key advantages:**
- Prevents thundering herd when multiple processes retry simultaneously
- Spreads retry attempts across time window
- Reduces likelihood of concurrent lock contention
- Maintains average backoff delay (jitter averages to 0)

---

## 5. Postmortem Template (db_retry_exhausted_total spike)

### Incident Report: Database Retry Exhaustion

**Date/Time:** YYYY-MM-DD HH:MM UTC
**Duration:** X hours
**Impact:** AI Intelligence Index degradation, forecast/learning failures
**Severity:** Critical / High / Medium

---

#### 1. Trigger

**What caused the alert to fire?**
- [ ] `db_retry_exhausted_total` increased by X in Y minutes
- [ ] Specific service: `menu_predictor` / `feedback_trainer` / both
- [ ] Specific operation: `getPredictedUsageForToday` / `applyAllPendingComments` / other
- [ ] Error code: `SQLITE_BUSY` / `SQLITE_LOCKED` / `SQLITE_ERROR` / other
- [ ] First observed: [timestamp from logs]
- [ ] Alert triggered: [timestamp from Prometheus]

**Evidence:**
```bash
# Metrics snapshot
db_retry_exhausted_total{service="menu_predictor",operation="getPredictedUsageForToday",error_code="SQLITE_BUSY"} 12

# Log excerpt (include timestamps)
[2025-10-19 14:23:15] [MenuPredictor] DB retry 1/3 after 215ms - Error: database is locked
[2025-10-19 14:23:15] [MenuPredictor] DB retry 2/3 after 387ms - Error: database is locked
[2025-10-19 14:23:16] [MenuPredictor] DB retry 3/3 after 812ms - Error: database is locked
[2025-10-19 14:23:16] ERROR: Database operation failed after all retries
```

---

#### 2. Impact

**Who/what was affected?**
- [ ] AI Intelligence Index dropped from X to Y
- [ ] Forecast completion rate: Z% (normal: >95%)
- [ ] Learning cycle failures: N events
- [ ] User-facing impact: Yes / No (describe if yes)
- [ ] Data loss: Yes / No (describe if yes)
- [ ] Financial impact: $X (if applicable)

**Metrics impact:**
```
ai_intelligence_index{component="overall"}: 61 → 47 (↓14 points)
forecast_completion_rate: 98% → 52% (↓46%)
learning_cycle_failures: 0 → 18 events
```

---

#### 3. Contributing Factors

**Root cause (select primary):**
- [ ] **SQLite Lock Contention:** Long-running transaction blocked retries
  - Evidence: `lsof database.db` showed PID X holding lock for Y seconds
  - Transaction: [describe which operation]
  - Lock type: EXCLUSIVE / SHARED / RESERVED

- [ ] **Schema Corruption:** Missing table/view not caught by retry logic
  - Evidence: `sqlite3 database.db ".schema table_name"` returned empty
  - Affected table: `menu_calendar` / `ai_feedback_comments` / other
  - Cause: Migration failed / Manual deletion / Disk corruption

- [ ] **Disk I/O Saturation:** WAL checkpoint blocked for > 1.4s (sum of retry delays)
  - Evidence: `iostat -x 1 10` showed util >95%
  - WAL size: X MB (normal: <10MB)
  - Checkpoint status: `PRAGMA wal_checkpoint;` → BUSY

- [ ] **Concurrent Cron Spike:** Multiple jobs overlapped despite mutex
  - Evidence: Logs show N concurrent forecast/learning operations
  - Mutex failure: Watchdog + hourly + daily jobs all fired within 60s window
  - Trigger: Server restart aligned cron schedules

- [ ] **Code Bug:** Non-idempotent operation retried incorrectly
  - Evidence: Database state changed between retry attempts
  - Operation: [describe]
  - Side effect: [describe]

---

#### 4. What Worked

**Successful mitigations during incident:**
- [ ] Manual intervention: Killed long-running PID X
- [ ] WAL checkpoint: `PRAGMA wal_checkpoint(FULL);` recovered lock
- [ ] Cron disable: Temporarily disabled watchdog to reduce contention
- [ ] Data backfill: Re-ran missing forecast manually
- [ ] Retry logic: **DID** prevent some failures (success rate: X%)
- [ ] Alerts: Fired within X minutes, enabled fast response

**Evidence of effectiveness:**
```
# Before mitigation
db_retry_exhausted_total: +12 in 10min

# After mitigation (killed PID 12345)
db_retry_exhausted_total: 0 new exhaustions
ai_intelligence_index: recovered from 47 → 59 in 2 hours
```

---

#### 5. Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| **Short-term (this week):** | | | |
| Increase `PRAGMA busy_timeout` from 5000ms to 10000ms | DevOps | YYYY-MM-DD | ⏳ In Progress |
| Add circuit breaker to FeedbackTrainer (max 5 pending comments/run) | Backend | YYYY-MM-DD | 📝 To Do |
| Split MenuPredictor query into 2 batches (reduce lock duration) | Backend | YYYY-MM-DD | 📝 To Do |
| Add ±30% jitter to all retry helpers (up from ±20%) | Backend | YYYY-MM-DD | 📝 To Do |
| **Medium-term (this month):** | | | |
| Implement p-queue for forecast operations (max concurrency: 1) | Backend | YYYY-MM-DD | 📝 To Do |
| Add database connection pooling (even for SQLite) | Backend | YYYY-MM-DD | 📝 To Do |
| Create Grafana dashboard for retry metrics + alerts | DevOps | YYYY-MM-DD | 📝 To Do |
| Document WAL checkpoint runbook | SRE | YYYY-MM-DD | 📝 To Do |
| **Long-term (next quarter):** | | | |
| Migrate to PostgreSQL for production workloads | Arch Team | YYYY-MM-DD | 📝 To Do |
| Implement read replicas for forecast queries | Arch Team | YYYY-MM-DD | 📝 To Do |
| Add distributed tracing (OpenTelemetry) to track lock waits | Observability | YYYY-MM-DD | 📝 To Do |

---

**Postmortem Review:**
- [ ] Reviewed by: [Name, Date]
- [ ] Approved by: [Manager, Date]
- [ ] Shared with team: [Date]
- [ ] Follow-up scheduled: [Date]

---

## 6. Quick Reference

### 6.1 Emergency Commands

```bash
# Kill stuck database process
lsof database.db
kill -9 <PID>

# Force WAL checkpoint
sqlite3 database.db "PRAGMA wal_checkpoint(FULL);"

# Check table existence
sqlite3 database.db ".tables" | grep menu_calendar

# View retry metrics
curl -s http://localhost:8083/metrics | grep db_retry | sort

# Tail retries only
tail -f logs/*.log | grep "DB retry"

# Count exhaustions in last hour
grep -c "failed after all retries" logs/*.log
```

### 6.2 Escalation Path

| Severity | First Responder | Escalate To | Escalate After |
|----------|----------------|-------------|----------------|
| Critical | On-call SRE | Backend Lead | 15 minutes |
| High | DevOps | Backend Team | 30 minutes |
| Medium | Backend Team | Engineering Manager | 2 hours |
| Low | Backend Team | Tech Lead | Next business day |

### 6.3 Communication Template

```
🚨 ALERT: Database Retry Exhausted

Service: menu_predictor
Operation: getPredictedUsageForToday
Error: SQLITE_BUSY
Count: 12 exhaustions in 10 minutes

Impact:
- AI Intelligence Index: 61 → 47
- Forecast completion: 52% (normally 98%)

Investigating:
- [X] Checked for stuck processes
- [ ] Reviewing cron schedule overlap
- [ ] Analyzing database locks

ETA for resolution: 30 minutes
Updates every: 15 minutes
```

---

**End of Runbook**

**Version:** v13.0.2
**Last Updated:** 2025-10-19
**Next Review:** After first production incident or 30 days
**Owner:** Backend Team / SRE
