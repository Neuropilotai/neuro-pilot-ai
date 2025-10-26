# Metrics Enhancement for Adaptive Intelligence (v16.6)

## 📊 Overview

Optional enhancements to expose Adaptive Intelligence metrics via Prometheus.

**Status**: Optional - API works without these metrics
**File**: `utils/metricsExporter.js`
**Benefit**: Better observability in Grafana/Prometheus

---

## 🔧 Code to Add

Add the following to `utils/metricsExporter.js`:

### 1. Import Dependencies (if not already present)

```javascript
const promClient = require('prom-client');
```

### 2. Define Metrics

```javascript
// ============================================================================
// v16.6 Adaptive Intelligence Metrics
// ============================================================================

// Stability score gauge (0-100)
const aiStabilityScore = new promClient.Gauge({
  name: 'ai_stability_score',
  help: 'Current AI stability score (0-100)'
});

// Current policy configuration
const aiCurrentMaxRetries = new promClient.Gauge({
  name: 'ai_current_max_retries',
  help: 'Current maximum retry attempts'
});

const aiCurrentBaseDelay = new promClient.Gauge({
  name: 'ai_current_base_delay_ms',
  help: 'Current base delay in milliseconds'
});

const aiCurrentJitter = new promClient.Gauge({
  name: 'ai_current_jitter_pct',
  help: 'Current jitter percentage'
});

const aiCurrentCronInterval = new promClient.Gauge({
  name: 'ai_current_cron_interval_min',
  help: 'Current cron minimum interval in minutes'
});

// Operation counters
const aiObservationsTotal = new promClient.Counter({
  name: 'ai_observations_total',
  help: 'Total number of stability observations recorded',
  labelNames: ['service', 'operation']
});

const aiRecommendationsTotal = new promClient.Counter({
  name: 'ai_recommendations_total',
  help: 'Total number of tuning recommendations generated',
  labelNames: ['applied']
});

const aiTuningCyclesTotal = new promClient.Counter({
  name: 'ai_tuning_cycles_total',
  help: 'Total number of tuning cycles executed',
  labelNames: ['status'] // 'success', 'no_changes', 'failed'
});

const aiRetrainFailedTotal = new promClient.Counter({
  name: 'ai_retrain_failed_total',
  help: 'Total number of failed retrain attempts'
});

// Legacy endpoint tracking
const legacyStabilityHits = new promClient.Counter({
  name: 'api_legacy_stability_hits_total',
  help: 'Total hits to deprecated /api/stability/* endpoints',
  labelNames: ['path', 'method']
});

// Success rate histogram
const aiSuccessRate = new promClient.Gauge({
  name: 'ai_success_rate',
  help: 'Current operation success rate (0-1)'
});

// Average attempts gauge
const aiAvgAttempts = new promClient.Gauge({
  name: 'ai_avg_attempts',
  help: 'Average number of retry attempts'
});

// Lock rate gauge
const aiLockRate = new promClient.Gauge({
  name: 'ai_lock_rate',
  help: 'Current database lock rate (0-1)'
});
```

### 3. Export Recording Functions

```javascript
// ============================================================================
// v16.6 Adaptive Intelligence - Recording Functions
// ============================================================================

/**
 * Update stability metrics from status endpoint
 * Call this periodically or after status queries
 */
function updateStabilityMetrics(statusData) {
  if (!statusData || !statusData.data) return;

  const { policy, metrics } = statusData.data;

  // Update policy gauges
  if (policy) {
    aiCurrentMaxRetries.set(policy.max_retries || 3);
    aiCurrentBaseDelay.set(policy.base_delay_ms || 200);
    aiCurrentJitter.set(policy.jitter_pct || 30);
    aiCurrentCronInterval.set(policy.cron_min_interval_min || 15);
  }

  // Update metrics gauges
  if (metrics) {
    aiSuccessRate.set((metrics.success_rate || 0) / 100);
    aiAvgAttempts.set(metrics.avg_attempts || 0);
    aiLockRate.set((metrics.lock_rate || 0) / 100);

    // Calculate stability score from metrics
    // Formula: success_rate * (1 - lock_rate/100) * (3 / max(avg_attempts, 1))
    const score = Math.min(100,
      (metrics.success_rate || 0) *
      (1 - (metrics.lock_rate || 0) / 100) *
      (3 / Math.max(metrics.avg_attempts || 1, 1))
    );
    aiStabilityScore.set(score);
  }
}

/**
 * Record a stability observation
 */
function recordStabilityObservation(service, operation) {
  aiObservationsTotal.inc({ service, operation });
}

/**
 * Record a tuning recommendation
 */
function recordTuningRecommendation(applied = false) {
  aiRecommendationsTotal.inc({ applied: applied ? 'true' : 'false' });
}

/**
 * Record a tuning cycle execution
 */
function recordTuningCycle(status = 'success') {
  // status: 'success', 'no_changes', 'failed'
  aiTuningCyclesTotal.inc({ status });
}

/**
 * Record a failed retrain attempt
 */
function recordRetrainFailed() {
  aiRetrainFailedTotal.inc();
}

/**
 * Record legacy endpoint usage
 */
function recordLegacyStabilityHit(path, method = 'GET') {
  legacyStabilityHits.inc({ path, method });
}

// Export functions
module.exports = {
  // ... existing exports
  updateStabilityMetrics,
  recordStabilityObservation,
  recordTuningRecommendation,
  recordTuningCycle,
  recordRetrainFailed,
  recordLegacyStabilityHit
};
```

---

## 🔌 Integration Points

### In `routes/stability.js`

Add metrics recording to existing endpoints:

```javascript
const metricsExporter = require('../utils/metricsExporter');

// In GET /status endpoint (line ~39)
router.get('/status', authenticateToken, (req, res) => {
  try {
    const stats = tuner.getStatistics();
    const throttleStats = throttle.getStatistics();

    const responseData = {
      success: true,
      data: { /* ... existing data ... */ }
    };

    // Update Prometheus metrics
    if (metricsExporter.updateStabilityMetrics) {
      metricsExporter.updateStabilityMetrics(responseData);
    }

    res.json(responseData);
  } catch (error) {
    // ... existing error handling
  }
});

// In POST /tune endpoint (line ~213)
router.post('/tune', authenticateToken, requireOwner, async (req, res) => {
  try {
    const recId = await tuner.runTuningCycle();

    if (!recId) {
      // Record no changes
      if (metricsExporter.recordTuningCycle) {
        metricsExporter.recordTuningCycle('no_changes');
      }
      return res.json({ /* ... */ });
    }

    // Record success
    if (metricsExporter.recordTuningCycle) {
      metricsExporter.recordTuningCycle('success');
    }
    if (metricsExporter.recordTuningRecommendation) {
      metricsExporter.recordTuningRecommendation(false);
    }

    res.json({ /* ... */ });
  } catch (error) {
    // Record failure
    if (metricsExporter.recordRetrainFailed) {
      metricsExporter.recordRetrainFailed();
    }
    if (metricsExporter.recordTuningCycle) {
      metricsExporter.recordTuningCycle('failed');
    }
    // ... existing error handling
  }
});

// In POST /retrain endpoint (line ~482)
router.post('/retrain', authenticateToken, requireOwner, async (req, res) => {
  try {
    const recId = await tuner.runTuningCycle();

    if (!recId) {
      if (metricsExporter.recordTuningCycle) {
        metricsExporter.recordTuningCycle('no_changes');
      }
      return res.json({ /* ... */ });
    }

    if (metricsExporter.recordTuningCycle) {
      metricsExporter.recordTuningCycle('success');
    }
    if (metricsExporter.recordTuningRecommendation) {
      metricsExporter.recordTuningRecommendation(false);
    }

    res.json({ /* ... */ });
  } catch (error) {
    if (metricsExporter.recordRetrainFailed) {
      metricsExporter.recordRetrainFailed();
    }
    if (metricsExporter.recordTuningCycle) {
      metricsExporter.recordTuningCycle('failed');
    }
    // ... existing error handling
  }
});
```

### In `server.js`

Add legacy endpoint tracking:

```javascript
// Legacy alias (deprecated, kept for backward compatibility)
app.use('/api/stability', (req, res, next) => {
  // Track legacy hit
  if (metricsExporter.recordLegacyStabilityHit) {
    metricsExporter.recordLegacyStabilityHit(req.originalUrl, req.method);
  }

  logger.warn('[DEPRECATION] /api/stability* → use /api/ai/adaptive*', {
    path: req.originalUrl,
    ip: req.ip,
    user: req.user?.email || 'unauthenticated'
  });

  next();
}, stabilityRoutes);
```

### In `src/stability/AdaptiveRetryTuner.js`

Add observation recording:

```javascript
const metricsExporter = require('../../utils/metricsExporter');

// In recordObservation method (line ~333)
recordObservation(service, operation, attempts, success, durationMs, errorClass = null, locked = false) {
  try {
    const stmt = this.db.prepare(/* ... existing SQL ... */);
    stmt.run(/* ... existing params ... */);

    // Update Prometheus metrics
    if (metricsExporter.recordStabilityObservation) {
      metricsExporter.recordStabilityObservation(service, operation);
    }
  } catch (error) {
    logger.error('AdaptiveRetryTuner: Failed to record observation', { error: error.message });
  }
}
```

---

## 📊 Verification

After implementing, verify metrics are exposed:

```bash
# Check metrics endpoint
curl -s http://localhost:8083/metrics | grep -E '^ai_'
```

Expected output:
```prometheus
ai_stability_score 98.5
ai_current_max_retries 3
ai_current_base_delay_ms 200
ai_current_jitter_pct 30
ai_current_cron_interval_min 15
ai_observations_total{service="inventory",operation="update"} 1247
ai_recommendations_total{applied="true"} 3
ai_tuning_cycles_total{status="success"} 3
ai_success_rate 0.985
ai_avg_attempts 1.2
ai_lock_rate 0.018
api_legacy_stability_hits_total{path="/api/stability/status",method="GET"} 5
```

---

## 🎨 Grafana Dashboard JSON

Import this dashboard to visualize the metrics:

```json
{
  "dashboard": {
    "title": "Adaptive Intelligence v16.6",
    "panels": [
      {
        "title": "Stability Score",
        "type": "gauge",
        "targets": [
          {
            "expr": "ai_stability_score",
            "legendFormat": "Score"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "min": 0,
            "max": 100,
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 70, "color": "yellow" },
                { "value": 85, "color": "green" }
              ]
            }
          }
        }
      },
      {
        "title": "Success Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "ai_success_rate * 100",
            "legendFormat": "Success Rate %"
          }
        ]
      },
      {
        "title": "Tuning Activity",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(increase(ai_tuning_cycles_total[24h]))",
            "legendFormat": "24h Cycles"
          }
        ]
      },
      {
        "title": "Legacy Endpoint Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "sum by (path) (increase(api_legacy_stability_hits_total[1h]))",
            "legendFormat": "{{path}}"
          }
        ]
      }
    ]
  }
}
```

---

## ⚠️ Important Notes

1. **Optional Enhancement**: The API works perfectly without these metrics
2. **Gradual Implementation**: Add metrics incrementally as needed
3. **Performance Impact**: Minimal - metrics recording is async and fast
4. **Storage**: Prometheus handles metric retention/aggregation

---

## 📚 Related Documentation

- [Quick Start Guide](./ADAPTIVE_INTELLIGENCE_QUICK_START_v16_6.md)
- [Full API Reference](./ADAPTIVE_INTELLIGENCE_API_v16_6.md)
- [Prometheus Client Docs](https://github.com/siimon/prom-client)

---

**Version**: 16.6.0
**Status**: Optional Enhancement
**Estimated Implementation Time**: 30-60 minutes
