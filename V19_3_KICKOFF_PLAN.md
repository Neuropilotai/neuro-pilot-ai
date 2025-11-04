# NeuroInnovate v19.3 — Kickoff Plan

**Version:** v19.3 (Next Release)
**Target Deploy:** 2025-11-29 (2 weeks post v19.2)
**Status:** 🚀 Planning Phase
**Owner:** DevOps Team Lead
**Approval Required:** Product Owner, DevOps Lead

---

## 🎯 **v19.3 Goals**

### **Primary Objective**
Optimize v19.2 for speed and intelligence while maintaining 99.5%+ stability score.

### **Success Criteria**
- Forecast duration: 85s → 83.6s (-1.6% improvement)
- Cache hit rate: 99.3% → 99.7% (+0.4pp improvement)
- Outlier SKU count: 4-5 → 2-3 (-40% reduction)
- Zero production incidents
- Stability score: ≥99.5/100 (maintain A+ grade)

---

## 📋 **Priority 1: Batch Delay Reduction** ⚡

**Effort:** 1 hour (config-only change)
**Risk:** Low
**Target Deploy:** 2025-11-22 (week 1)

### **Problem Statement**
Current batch delay of 500ms between forecast batches adds 3.5s to total forecast duration:
- 7 batches × 500ms = 3,500ms = 3.5s
- Current duration: 85s (target: <80s)

### **Proposed Solution**
Reduce `STREAMING_BATCH_DELAY_MS` from 500ms to 300ms:
- New delay: 7 batches × 300ms = 2,100ms = 2.1s
- Expected duration: 85s - 1.4s = **83.6s** (30% under 120s threshold)

### **Implementation**

#### **Configuration Change**
```env
# v19.2 (current)
STREAMING_BATCH_DELAY_MS=500

# v19.3 (proposed)
STREAMING_BATCH_DELAY_MS=300
```

#### **Testing Requirements**
1. **Staging Validation (24h window)**
   - Run 3 forecast cycles with 300ms delay
   - Monitor peak memory (must stay ≤60%)
   - Verify MAPE stays <20%
   - Check garbage collection logs

2. **Expected Metrics**
   | Metric | v19.2 Baseline | v19.3 Target | Pass Criteria |
   |--------|----------------|--------------|---------------|
   | Forecast Duration | 85s | 83.6s | <84s |
   | Peak Memory | 60.1% | ≤61% | <62% |
   | MAPE Average | 19.8% | ≤19.8% | <20% |
   | Cache Hit Rate | 99.3% | ≥99.3% | >99% |

3. **Rollback Plan**
   If peak memory exceeds 62% or MAPE > 20%:
   ```bash
   railway variables set STREAMING_BATCH_DELAY_MS=500
   railway service restart backend
   ```

### **Deployment Steps**
```bash
# 1. Update staging environment
railway variables set STREAMING_BATCH_DELAY_MS=300 --service backend --environment staging

# 2. Restart staging backend
railway service restart backend --environment staging

# 3. Run 3 test forecasts (manual trigger)
curl -X POST https://staging-backend.railway.app/api/v1/admin/trigger-forecast

# 4. Monitor for 24 hours
# - Watch PROD_DAILY_SNAPSHOTS.md
# - Check memory logs every 6 hours

# 5. Production deploy (if staging passes)
railway variables set STREAMING_BATCH_DELAY_MS=300 --service backend --environment production
railway service restart backend --environment production

# 6. Tag release
git tag -a v19.3-batch-delay -m "v19.3.1: Reduce batch delay 500ms→300ms"
git push origin v19.3-batch-delay
```

### **Documentation Updates**
- Update `CHANGELOG_ops.md` with new STREAMING_BATCH_DELAY_MS value
- Update `MONITORING_GUARDRAILS_V19_2.md` → `MONITORING_GUARDRAILS_V19_3.md`
- Append to `POST_DEPLOYMENT_REPORT_V19_3.md`

---

## 📋 **Priority 2: Predictive Cache Prefetch** 🔮

**Effort:** 2 weeks
**Risk:** Medium
**Target Deploy:** 2025-11-29 (week 2)

### **Problem Statement**
Current cache preload strategy is reactive:
- Cache preload runs immediately after forecast completion (02:06 UTC)
- Peak traffic occurs at 11:30 UTC and 17:30 UTC (business hours)
- 0.7% cache misses still occur for new query patterns

### **Proposed Solution**
Implement predictive cache prefetch at T+2min post-deploy AND pre-peak traffic windows:
- **Post-Deploy Prefetch:** 2 minutes after deployment completes
- **Pre-Peak Prefetch #1:** 11:28 UTC (2 minutes before first peak)
- **Pre-Peak Prefetch #2:** 17:28 UTC (2 minutes before second peak)

### **Implementation**

#### **New Module: `cache-prefetch-scheduler.js`**
```javascript
import cron from "node-cron";
import { prefetchTopQueries } from "./cache-preload.js";
import logger from "./logger.js";

// Pre-peak prefetch: 11:28 UTC and 17:28 UTC
export function initPrefetchScheduler() {
  // Morning peak prefetch (11:28 UTC)
  cron.schedule("28 11 * * *", async () => {
    logger.info("🔮 [Prefetch] Morning peak prefetch started");
    await prefetchTopQueries({ priority: "peak-traffic" });
  });

  // Afternoon peak prefetch (17:28 UTC)
  cron.schedule("28 17 * * *", async () => {
    logger.info("🔮 [Prefetch] Afternoon peak prefetch started");
    await prefetchTopQueries({ priority: "peak-traffic" });
  });

  logger.info("✅ Cache prefetch scheduler initialized (11:28, 17:28 UTC)");
}
```

#### **New Environment Variables**
```env
# Prefetch Scheduling (NEW)
ENABLE_PREDICTIVE_PREFETCH=true
PREFETCH_MORNING_PEAK_HOUR=11
PREFETCH_AFTERNOON_PEAK_HOUR=17
PREFETCH_LEAD_TIME_MINUTES=2

# Query Priority (NEW)
PREFETCH_TOP_N_QUERIES=50         # Prefetch top 50 most common queries
PREFETCH_INCLUDE_RECENT=true      # Include queries from last 24h
```

#### **Post-Deploy Prefetch Hook**
```javascript
// railway-deploy-hook.js (NEW)
export async function onDeploymentComplete() {
  // Wait 2 minutes for services to stabilize
  await new Promise(resolve => setTimeout(resolve, 120000));

  logger.info("🔮 [Post-Deploy] Starting predictive cache prefetch");
  await prefetchTopQueries({ priority: "post-deploy" });

  logger.info("✅ [Post-Deploy] Cache prefetch completed");
}
```

### **Testing Requirements**

1. **Query Analysis (Pre-Implementation)**
   ```sql
   -- Identify top 50 most common queries (last 30 days)
   SELECT
     query_hash,
     query_pattern,
     COUNT(*) as hit_count,
     AVG(duration_ms) as avg_duration
   FROM query_log
   WHERE created_at > datetime('now', '-30 days')
   GROUP BY query_hash
   ORDER BY hit_count DESC
   LIMIT 50;
   ```

2. **Staging Validation (48h window)**
   - Deploy prefetch scheduler to staging
   - Run 2 full daily cycles with morning/afternoon prefetch
   - Monitor cache hit rate at 11:30 and 17:30 UTC
   - Verify prefetch duration <30s

3. **Expected Metrics**
   | Metric | v19.2 Baseline | v19.3 Target | Pass Criteria |
   |--------|----------------|--------------|---------------|
   | Cache Hit Rate | 99.3% | 99.7% | >99.5% |
   | Prefetch Duration | N/A | <30s | <30s |
   | Peak Hour Misses | 0.7% | <0.3% | <0.5% |
   | Memory Impact | N/A | +2-3% | <5% |

### **Deployment Steps**
```bash
# 1. Create cache-prefetch-scheduler.js module
# 2. Add new env vars to staging
railway variables set \
  ENABLE_PREDICTIVE_PREFETCH=true \
  PREFETCH_TOP_N_QUERIES=50 \
  PREFETCH_INCLUDE_RECENT=true \
  --service backend --environment staging

# 3. Deploy code changes to staging
git checkout -b feature/predictive-prefetch
git add backend/cache-prefetch-scheduler.js backend/railway-deploy-hook.js
git commit -m "feat(cache): add predictive prefetch scheduler"
git push origin feature/predictive-prefetch

railway service update --ref feature/predictive-prefetch --environment staging

# 4. Monitor staging for 48 hours
# 5. Merge to main and deploy to production
git checkout main
git merge feature/predictive-prefetch
git push origin main

railway service update --ref main --environment production

# 6. Tag release
git tag -a v19.3-prefetch -m "v19.3.2: Add predictive cache prefetch"
git push origin v19.3-prefetch
```

---

## 📋 **Priority 3: Outlier SKU ML Models** 🎯

**Effort:** 3 weeks
**Risk:** Medium-High
**Target Deploy:** 2025-12-13 (week 4-5, optional for v19.3)

### **Problem Statement**
Current v19.2 system flags 4-5 persistent high-variance SKUs:
- **SKU-6823:** 28.0% MAPE (40% above threshold)
- **SKU-8932:** 28.8% MAPE (44% above threshold)
- **SKU-4782:** 27.5% MAPE (38% above threshold)
- **SKU-5491:** 26.9% MAPE (35% above threshold)

These items likely exhibit intermittent demand patterns that Prophet (current model) struggles with.

### **Proposed Solution**
Implement hybrid forecasting approach:
- **Regular items (<25% MAPE):** Continue using Prophet
- **Intermittent items (>25% MAPE):** Switch to Croston's method or TSB (Teunter-Syntetos-Babai)

### **Implementation**

#### **New Module: `ml-service/intermittent_demand.py`**
```python
import numpy as np
from typing import List, Dict

def croston_forecast(
    demand: List[float],
    periods_ahead: int = 7,
    alpha: float = 0.1
) -> Dict[str, float]:
    """
    Croston's method for intermittent demand forecasting.

    Best for items with:
    - Sporadic demand (many zero periods)
    - High variance between demand periods

    Returns:
        Dict with 'forecast' (7-day array) and 'mape' (backtest)
    """
    # Identify non-zero demand periods
    nonzero_indices = np.where(np.array(demand) > 0)[0]

    # Calculate demand size and inter-demand interval
    demand_size = np.mean([demand[i] for i in nonzero_indices])
    intervals = np.diff(nonzero_indices)
    avg_interval = np.mean(intervals) if len(intervals) > 0 else len(demand)

    # Forecast = average demand size / average interval
    forecast_value = demand_size / avg_interval

    return {
        "forecast": [forecast_value] * periods_ahead,
        "method": "croston",
        "demand_size": demand_size,
        "avg_interval": avg_interval
    }
```

#### **Hybrid Model Selection Logic**
```python
# ml-service/model_selector.py (NEW)
def select_model_for_sku(sku_id: str, historical_data: List[float]) -> str:
    """
    Select optimal forecasting model based on demand pattern.

    Returns: "prophet" | "croston" | "tsb"
    """
    # Calculate intermittency metrics
    zero_ratio = (np.array(historical_data) == 0).mean()
    cv_squared = (np.std(historical_data) / np.mean(historical_data)) ** 2

    # Decision tree
    if zero_ratio > 0.5:  # >50% zero periods
        return "croston"
    elif cv_squared > 0.49:  # High variance (Syntetos-Boylan threshold)
        return "tsb"
    else:
        return "prophet"  # Default for regular demand
```

#### **New Environment Variables**
```env
# Hybrid Forecasting (NEW)
ENABLE_HYBRID_FORECASTING=true
INTERMITTENT_DEMAND_ZERO_RATIO_THRESHOLD=0.5
INTERMITTENT_DEMAND_CV_SQUARED_THRESHOLD=0.49
CROSTON_ALPHA=0.1
TSB_ALPHA=0.1
TSB_BETA=0.1
```

### **Testing Requirements**

1. **Backtest on Outlier SKUs (Pre-Implementation)**
   ```python
   # Test Croston's method on SKU-6823 historical data
   from intermittent_demand import croston_forecast

   sku_6823_data = [0, 0, 15, 0, 0, 22, 0, 0, 0, 18, ...]  # 90 days

   prophet_mape = 28.0%  # Current baseline
   croston_mape = backtest_croston(sku_6823_data)

   print(f"Prophet: {prophet_mape}% | Croston: {croston_mape}%")
   # Target: Croston MAPE < 22% (improvement >21%)
   ```

2. **Staging Validation (7-day window)**
   - Deploy hybrid model selector to staging
   - Run 7 daily forecast cycles
   - Track MAPE for flagged outlier SKUs
   - Verify overall system MAPE ≤19.8%

3. **Expected Metrics**
   | Metric | v19.2 Baseline | v19.3 Target | Pass Criteria |
   |--------|----------------|---------------|---------------|
   | Outlier SKU Count | 4-5 items | 2-3 items | ≤3 items |
   | Avg Outlier MAPE | 27.8% | <22% | <24% |
   | Overall MAPE | 19.8% | ≤19.8% | <20% |
   | Forecast Duration | 85s | ≤86s | <90s |

### **Deployment Steps**
```bash
# 1. Implement Croston's method in ml-service
cd ml-service
touch intermittent_demand.py model_selector.py

# 2. Add new env vars
railway variables set \
  ENABLE_HYBRID_FORECASTING=true \
  CROSTON_ALPHA=0.1 \
  --service ml-service --environment staging

# 3. Deploy to staging
git checkout -b feature/hybrid-forecasting
git add ml-service/intermittent_demand.py ml-service/model_selector.py
git commit -m "feat(ml): add hybrid forecasting with Croston's method"
git push origin feature/hybrid-forecasting

railway service update --ref feature/hybrid-forecasting --environment staging

# 4. Run 7-day backtest
# 5. Merge and deploy to production
git checkout main
git merge feature/hybrid-forecasting
git push origin main

railway service update --ref main --environment production

# 6. Tag release
git tag -a v19.3-hybrid-ml -m "v19.3.3: Add hybrid forecasting for intermittent demand"
git push origin v19.3-hybrid-ml
```

### **Risk Mitigation**
- **Fallback Strategy:** If hybrid model MAPE > 20%, automatically revert to Prophet-only
- **Gradual Rollout:** Enable for top 5 outliers first, then expand to all flagged items
- **A/B Testing:** Run Prophet + Croston in parallel for 7 days, compare backtests

---

## 📅 **v19.3 Timeline**

### **Week 1 (2025-11-18 to 2025-11-24)**
- **Monday-Tuesday:** Priority 1 staging validation (batch delay 300ms)
- **Wednesday:** Priority 1 production deploy + 24h monitoring
- **Thursday-Friday:** Begin Priority 2 query analysis and module development

### **Week 2 (2025-11-25 to 2025-12-01)**
- **Monday-Wednesday:** Complete Priority 2 prefetch scheduler implementation
- **Thursday:** Deploy Priority 2 to staging
- **Friday-Sunday:** 48h staging validation for Priority 2

### **Week 3 (2025-12-02 to 2025-12-08)**
- **Monday:** Priority 2 production deploy if staging passes
- **Tuesday-Friday:** Priority 3 Croston's method implementation + backtesting

### **Week 4 (2025-12-09 to 2025-12-15)**
- **Monday-Wednesday:** Priority 3 staging validation (7 days)
- **Thursday:** GO/NO-GO decision for Priority 3
- **Friday:** Production deploy if approved, or defer to v19.4

---

## 🎯 **v19.3 Success Metrics**

| Priority | Metric | v19.2 Baseline | v19.3 Target | Status |
|----------|--------|----------------|--------------|--------|
| P1 | Forecast Duration | 85s | 83.6s (-1.6%) | 🔲 |
| P1 | Peak Memory | 60.1% | ≤61% | 🔲 |
| P2 | Cache Hit Rate | 99.3% | 99.7% (+0.4pp) | 🔲 |
| P2 | Peak Hour Misses | 0.7% | <0.3% | 🔲 |
| P3 | Outlier SKU Count | 4-5 items | 2-3 items (-40%) | 🔲 |
| P3 | Avg Outlier MAPE | 27.8% | <22% | 🔲 |
| Overall | Stability Score | 99.5/100 | ≥99.5/100 | 🔲 |

---

## 🚨 **Rollback Plan**

### **Priority 1 Rollback (Batch Delay)**
```bash
railway variables set STREAMING_BATCH_DELAY_MS=500
railway service restart backend
# Rollback time: <1 minute
```

### **Priority 2 Rollback (Prefetch)**
```bash
railway variables set ENABLE_PREDICTIVE_PREFETCH=false
railway service restart backend
# Rollback time: <1 minute
```

### **Priority 3 Rollback (Hybrid ML)**
```bash
railway variables set ENABLE_HYBRID_FORECASTING=false
railway service restart ml-service
# Rollback time: <2 minutes
```

---

## 📞 **Team Assignments**

| Priority | Owner | Reviewer | Support |
|----------|-------|----------|---------|
| P1: Batch Delay | DevOps Engineer | DevOps Lead | N/A |
| P2: Prefetch | Backend Engineer | Senior Backend | DevOps |
| P3: Hybrid ML | ML Engineer | ML Lead | Data Science |

---

## 📝 **Approval & Sign-Off**

- [ ] **Product Owner:** Approved scope and timeline
- [ ] **DevOps Lead:** Technical review complete
- [ ] **ML Lead:** P3 approach validated (if applicable)
- [ ] **Security Team:** No security concerns identified
- [ ] **On-Call Engineer:** Runbook updated, rollback tested

**Kickoff Meeting:** 2025-11-18 10:00 UTC
**Slack Channel:** #v19-3-release
**Jira Epic:** [NEURO-193] v19.3 Optimization Release

---

**Status:** 🚀 Ready for Kickoff
**Last Updated:** 2025-11-17
**Next Review:** 2025-11-18 (Kickoff Meeting)
