# NeuroInnovate v19.2 — Monitoring Guardrails

**Version:** v19.2-stable
**Effective:** 2025-11-15 onwards
**Status:** 🔒 LOCKED — Do not modify without v19.3+ migration approval

---

## 🎯 **Locked Configuration Values**

These configuration values are locked for v19.2-stable and must not be changed without approval:

```env
# Core Performance Thresholds (LOCKED)
MAPE_THRESHOLD=20                    # Down from 25 in v19.1 (tighter accuracy)
MAX_HEALTH_FAILURES=6                # Up from 5 (tolerance for tight threshold)
MEMORY_WARNING_THRESHOLD_PERCENT=70  # Down from 75 (earlier warnings)

# Cache Configuration (LOCKED)
FORECAST_CACHE_PRELOAD=true
CACHE_PRELOAD_ASYNC=true
CACHE_PRELOAD_TIMEOUT_MS=30000
CACHE_STALE_WHILE_REVALIDATE=true
QUERY_CACHE_TTL=7200
FORECAST_CACHE_TTL=86400
CACHE_STALE_TTL_MS=60000

# Streaming Forecast (LOCKED)
ENABLE_STREAMING_FORECAST=true
FORECAST_BATCH_SIZE=20
STREAMING_BATCH_DELAY_MS=500        # v19.3 target: 300ms
LOG_BATCH_PROGRESS=true

# MAPE Monitoring (LOCKED)
ENABLE_ITEM_MAPE_MONITORING=true
MAPE_ITEM_THRESHOLD_MULTIPLIER=1.5
INCLUDE_HIGH_VARIANCE_ITEMS_IN_REPORT=true
MAX_HIGH_VARIANCE_ITEMS_IN_REPORT=10

# Self-Healing Watchdog (LOCKED)
ENABLE_SELF_HEALING=true
SCHEDULER_WATCHDOG_ENABLED=true
SCHEDULER_WATCHDOG_INTERVAL_MS=300000   # 5 minutes
SCHEDULER_WATCHDOG_TIMEOUT_MS=120000    # 2 minutes
```

---

## 🚨 **Alert Configuration**

### **Critical Alerts (Immediate Action Required)**

#### 1. Cache Hit Rate Degradation
```yaml
alert: cache_hit_rate_critical
condition: cache_hit_rate < 98.5% for 10 minutes
severity: critical
action:
  - Check cache preload logs
  - Verify FORECAST_CACHE_PRELOAD=true
  - Check database query performance
  - Review last forecast completion time
notification: ops-team@neuronexus.ai, Slack #alerts
```

#### 2. API Latency Spike (P95)
```yaml
alert: api_p95_latency_high
condition: api_p95 > 20ms for 10 minutes
severity: critical
action:
  - Check database connection pool
  - Review cache hit rate
  - Verify composite indexes exist
  - Check system CPU/memory
notification: ops-team@neuronexus.ai, Slack #alerts
```

#### 3. API Latency Spike (P99)
```yaml
alert: api_p99_latency_high
condition: api_p99 > 40ms for 10 minutes
severity: critical
action:
  - Identify slow queries in logs
  - Check for uncached requests
  - Review database query plan
  - Consider emergency cache warmup
notification: ops-team@neuronexus.ai, Slack #alerts
```

#### 4. Peak Memory Exceeded
```yaml
alert: peak_memory_critical
condition: peak_mem > 62% during forecast run
severity: critical
action:
  - Review batch size configuration
  - Check for memory leaks
  - Verify garbage collection logs
  - Consider reducing FORECAST_BATCH_SIZE from 20 to 15
notification: ops-team@neuronexus.ai, Slack #alerts
```

#### 5. Forecast Failures (24h Window)
```yaml
alert: forecast_failure_critical
condition: 2 or more forecast failures within 24 hours
severity: critical
action:
  - Review forecast error logs
  - Check MAPE values (threshold: 20%)
  - Verify ML service health
  - Execute rollback if 3rd failure imminent
notification: ops-team@neuronexus.ai, devops-lead@neuronexus.ai, Slack #alerts
rollback_trigger: YES (automatic on 3rd failure)
```

---

### **Warning Alerts (Monitor Closely)**

#### 6. MAPE Approaching Threshold
```yaml
alert: mape_warning
condition: mape_average > 19.0% (within 1% of threshold)
severity: warning
action:
  - Review high-variance SKUs
  - Check recent model training date
  - Verify historical data quality
  - Consider manual model retrain
notification: devops-lead@neuronexus.ai, Slack #monitoring
```

#### 7. Cache Hit Rate Degraded
```yaml
alert: cache_hit_rate_warning
condition: cache_hit_rate < 99.0% for 30 minutes
severity: warning
action:
  - Monitor for degradation trend
  - Review cache preload duration
  - Check for new query patterns
notification: Slack #monitoring
```

#### 8. Memory Usage Elevated
```yaml
alert: memory_elevated
condition: peak_mem > 58% during forecast run
severity: warning
action:
  - Monitor for upward trend
  - Review batch processing logs
  - Check garbage collection efficiency
notification: Slack #monitoring
```

#### 9. Watchdog Intervention
```yaml
alert: watchdog_restart
condition: watchdog triggers scheduler restart
severity: warning
action:
  - Review scheduler logs for stuck events
  - Check node-cron health
  - Verify SCHEDULER_WATCHDOG_TIMEOUT_MS=120000
  - Investigate root cause if >1 intervention per week
notification: devops-lead@neuronexus.ai, Slack #monitoring
```

---

## 📊 **Daily Monitoring Dashboard (09:00 UTC)**

### **Automated Daily Snapshot (Append to PROD_DAILY_SNAPSHOTS.md)**

```bash
# Run daily at 09:00 UTC via cron or Railway scheduled job
DATE=$(date -u +"%Y-%m-%d %H:%M UTC")
cat >> PROD_DAILY_SNAPSHOTS.md <<EOF

## $DATE
- **Cache Hit Rate:** [value]% (target: ≥99%)
- **Peak Memory:** [value]% (target: ≤60%)
- **API P95:** [value]ms (target: ≤15ms)
- **API P99:** [value]ms (target: ≤30ms)
- **MAPE Average:** [value]% (target: <20%)
- **High-Variance SKUs:** [count] items (typical: 3-5)
- **Watchdog Interventions:** [count] (expected: 0)
- **Scheduler Runs:** [success/total] (expected: 1/1)
- **Status:** ✅ Stable | ⚠️ Degraded | ❌ Critical

EOF
```

### **Manual Verification Commands**

```bash
# 1. Check cache hit rate (last 24h)
curl -s https://[backend-url]/api/v1/health/metrics | jq '.cache_hit_rate'

# 2. Check API latency (P95/P99)
curl -s https://[backend-url]/api/v1/health/metrics | jq '.latency | {p95, p99}'

# 3. Check last forecast MAPE
curl -s https://[backend-url]/api/v1/health/metrics | jq '.mape_average'

# 4. Check memory usage
curl -s https://[backend-url]/api/v1/health/metrics | jq '.peak_memory_percent'

# 5. Check high-variance SKUs
curl -s https://[backend-url]/api/v1/health/metrics | jq '.high_variance_items[]'

# 6. Check watchdog activity (last 24h)
curl -s https://[backend-url]/api/v1/health/watchdog | jq '.interventions_24h'

# 7. Full health check
curl -s https://[backend-url]/api/v1/health | jq
```

---

## 🔄 **Rollback Procedure**

### **Automatic Rollback Triggers**

The system will automatically rollback to v19.1-stable if ANY of the following occur:

1. **3 forecast failures within 24 hours** (MAX_HEALTH_FAILURES=6, tolerance up to 6)
2. **Cache hit rate < 95% for 30 minutes** (sustained degradation)
3. **Peak memory > 70% during forecast** (risk of OOM)
4. **MAPE > 22% for 2 consecutive runs** (model accuracy collapse)

### **Manual Rollback (< 3 minutes)**

```bash
# 1. Tag current state for forensics
git tag -a v19.2-rollback-$(date +%s) -m "Rollback initiated: [reason]"
git push origin --tags

# 2. Deploy v19.1-stable
railway service update --ref v19.1-stable backend
railway service update --ref v19.1-stable ml-service

# 3. Update environment to v19.1 config
railway variables set \
  MAPE_THRESHOLD=25 \
  MAX_HEALTH_FAILURES=5 \
  MEMORY_WARNING_THRESHOLD_PERCENT=75 \
  STREAMING_BATCH_DELAY_MS=0

# 4. Restart services
railway service restart backend
railway service restart ml-service

# 5. Verify rollback
curl -s https://[backend-url]/api/v1/health | jq '.version' # Should show v19.1

# 6. Notify team
echo "🔄 Rollback to v19.1-stable completed. Reason: [reason]" | \
  slack-cli post -c alerts "v19.2 Rollback Alert"
```

---

## 📈 **Performance Baselines (v19.2-stable)**

Use these values to detect performance regression:

| Metric | Baseline | Warning | Critical |
|--------|----------|---------|----------|
| Cache Hit Rate | 99.3% | <99.0% | <98.5% |
| API P95 Latency | 12.7ms | >15ms | >20ms |
| API P99 Latency | 18.9ms | >30ms | >40ms |
| Peak Memory | 60.1% | >58% | >62% |
| MAPE Average | 19.8% | >19.0% | >20.0% |
| Forecast Duration | 85s | >100s | >120s |
| High-Variance SKUs | 3-5 items | >6 items | >10 items |
| Watchdog Interventions | 0/day | >1/week | >1/day |

---

## 🔐 **Change Control**

### **Who Can Modify Guardrails?**

- **Locked Values:** Require v19.3+ planning approval from DevOps Lead
- **Alert Thresholds:** DevOps Team Lead approval (document in CHANGELOG_ops.md)
- **Monitoring Scripts:** On-Call Engineer can adjust with peer review

### **Modification Process**

1. Create issue: `[v19.2] Guardrail Change Request: [description]`
2. Document justification with metrics/logs
3. Obtain approval from DevOps Team Lead
4. Test in staging with 24h validation window
5. Update this document with change log entry
6. Commit with message: `ops(guardrails): [change description]`

### **Change Log**

| Date | Change | Reason | Approver |
|------|--------|--------|----------|
| 2025-11-15 | Initial v19.2 guardrails locked | Production deployment | DevOps Team |
| | | | |

---

## 📞 **Escalation Contacts**

| Severity | Contact | Response Time |
|----------|---------|---------------|
| Critical | ops-team@neuronexus.ai + Slack #alerts | <15 minutes |
| Warning | devops-lead@neuronexus.ai + Slack #monitoring | <2 hours |
| Info | Slack #monitoring | Next business day |

**On-Call Rotation:** https://oncall.neuronexus.ai
**Runbook:** [V19_DEPLOYMENT_RUNBOOK.md](V19_DEPLOYMENT_RUNBOOK.md)
**Incident Response:** https://wiki.neuronexus.ai/incident-response

---

**🔒 This document is locked for v19.2-stable.**
**Next review:** v19.3 planning (2025-11-22)
**Last updated:** 2025-11-17
**Maintainer:** DevOps Team
