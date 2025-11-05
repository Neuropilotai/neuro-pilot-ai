# NeuroInnovate v19.3 – Deployment Manifest

**Deploy Date:** 2025-11-05
**Version:** 19.3.0
**Status:** 🟢 READY TO DEPLOY
**Railway Project:** 6eb48b9a-8fe0-4836-8247-f6cef566f299

---

## 🎯 v19.3 Delta Summary

### Configuration Changes (ENV variables)
```env
STREAMING_BATCH_DELAY_MS=300                         # ⬇ from 500ms (saves 1.4s)
PREDICTIVE_CACHE_ENABLED=true                        # ➕ NEW
PREDICTIVE_CACHE_WARMUP_ON_STARTUP=true              # ➕ NEW
PREDICTIVE_CACHE_LOOKBACK_HOURS=168                  # ➕ NEW (7 days)
PREDICTIVE_CACHE_FORECAST_HOURS=12                   # ➕ NEW
PREDICTIVE_CACHE_TOPK=200                            # ➕ NEW
PREDICTIVE_CACHE_PEAK_WINDOWS=02:00-03:00,12:00-13:00  # ➕ NEW
PREDICTIVE_CACHE_FALLBACK_TO_BASELINE=true           # ➕ NEW
OUTLIER_ROUTING_ENABLED=true                         # ➕ NEW
OUTLIER_MODEL_STRATEGY=auto                          # ➕ NEW
OUTLIER_MADF_THRESHOLD=3.0                           # ➕ NEW
OUTLIER_MAX_PER_RUN=10                               # ➕ NEW
DEFAULT_REGION=us                                     # ➕ NEW (scaffold)
ALLOWED_REGIONS=us,eu                                 # ➕ NEW (scaffold)
MULTIREGION_READY=true                                # ➕ NEW (scaffold)
APP_VERSION=19.3.0                                    # ⬆ from 19.2.0
DEPLOYMENT_DATE=2025-11-05                            # ⬆ updated
```

**Total: 1 modified + 16 new = 17 env variable changes**

---

## 📊 Expected KPIs (v19.2 → v19.3)

| Metric | v19.2 Baseline | v19.3 Target | Change |
|--------|----------------|--------------|--------|
| Forecast Duration | 85.0s | 83.6s | -1.6% |
| Cache Hit Rate | 99.3% | 99.6-99.8% | +0.3-0.5pp |
| API P95 Latency | 12.7ms | ≤12.5ms | -1.6% |
| Peak Memory | 60.1% | ≤60.5% | +0.4% |
| MAPE Average | 19.8% | ≤19.5% | -1.5% |
| Outlier SKUs | 3-4 | 1-3 | -40% |
| Stability Score | 99.5/100 | 99.6/100 | +0.1 |

---

## 🚀 Deployment Steps (RAPID)

### 1. Execute Deployment Script
```bash
chmod +x DEPLOY_V19_3_NOW.sh
bash DEPLOY_V19_3_NOW.sh
```

The script will:
1. Create `v19.3-optimization` branch
2. Commit v19.3 files
3. Merge to `main`
4. Tag `v19.3.0`
5. Push to GitHub
6. Prompt for Railway env variable application
7. Trigger deployment
8. Run smoke tests
9. Import seed data (6 SKUs + 6 inventory records)
10. Display next run times

### 2. Manual Railway Dashboard Steps

**Go to:** https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299

**Navigate to:** backend service → Variables → Raw Editor

**Paste this block:**
```
STREAMING_BATCH_DELAY_MS=300
PREDICTIVE_CACHE_ENABLED=true
PREDICTIVE_CACHE_WARMUP_ON_STARTUP=true
PREDICTIVE_CACHE_LOOKBACK_HOURS=168
PREDICTIVE_CACHE_FORECAST_HOURS=12
PREDICTIVE_CACHE_TOPK=200
PREDICTIVE_CACHE_PEAK_WINDOWS=02:00-03:00,12:00-13:00
PREDICTIVE_CACHE_FALLBACK_TO_BASELINE=true
PREDICTIVE_CACHE_PRELOAD_TIMEOUT_MS=30000
OUTLIER_ROUTING_ENABLED=true
OUTLIER_MODEL_STRATEGY=auto
OUTLIER_MADF_THRESHOLD=3.0
OUTLIER_MAX_PER_RUN=10
OUTLIER_LOG_DECISIONS=true
DEFAULT_REGION=us
ALLOWED_REGIONS=us,eu
MULTIREGION_READY=true
CACHE_REGION_AWARE_KEYS=true
APP_VERSION=19.3.0
DEPLOYMENT_DATE=2025-11-05
```

**Click:** Save

---

## 🧪 Smoke Tests (Replace BASE_URL)

```bash
export BASE_URL="https://YOUR-BACKEND.railway.app"

# 1. Health check
curl -fsS "$BASE_URL/api/health" | jq '{status,version,streaming,cache}'

# 2. Version verification
curl -fsS "$BASE_URL/api/health" | jq '.version'
# Expected: "19.3.0"

# 3. Streaming config
curl -fsS "$BASE_URL/api/health" | jq '.streaming'
# Expected: {enabled: true, batchSize: 20, batchDelay: 300}

# 4. Cache config
curl -fsS "$BASE_URL/api/health" | jq '.cache.forecastCache'
# Expected: {preloadEnabled: true, predictiveEnabled: true}

# 5. Forecasts endpoint (may be empty initially)
curl -fsS "$BASE_URL/api/forecasts" | jq 'length'
```

---

## 📥 Seed Data Import

### Items CSV (6 SKUs)
```csv
sku,name,category,uom,reorder_min,reorder_max,par_level,active
SKU-1001,Chicken Breast,Protein,kg,10,40,25,true
SKU-1002,Ground Beef,Protein,kg,8,30,18,true
SKU-2001,Milk 2%,Dairy,L,20,80,50,true
SKU-3001,Tomatoes,Produce,kg,6,24,14,true
SKU-4001,Mozzarella,Dairy,kg,5,20,12,true
SKU-5001,Basmati Rice,Dry,kg,10,60,30,true
```

### Inventory CSV (6 Records)
```csv
sku,location,quantity,lot,expires_at,last_counted_at
SKU-1001,Freezer-A,18,CHB-241101,2025-12-10,2025-11-05T10:00:00Z
SKU-1002,Freezer-B,12,GBF-241103,2025-12-15,2025-11-05T10:00:00Z
SKU-2001,Cooler-1,42,MIL-241030,2025-11-20,2025-11-05T10:00:00Z
SKU-3001,Cooler-2,25,TOM-241105,2025-11-14,2025-11-05T10:00:00Z
SKU-4001,Cooler-3,9,MOZ-241020,2025-12-05,2025-11-05T10:00:00Z
SKU-5001,Dry-1,38,RIC-241001,2026-01-30,2025-11-05T10:00:00Z
```

### Import Commands
```bash
# Save CSVs to /tmp
# (Script does this automatically)

# Import items
curl -X POST "$BASE_URL/api/items/import" \
  -H "Content-Type: text/csv" \
  --data-binary @/tmp/items_seed.csv

# Import inventory
curl -X POST "$BASE_URL/api/inventory/import" \
  -H "Content-Type: text/csv" \
  --data-binary @/tmp/inventory_seed.csv

# Verify
curl "$BASE_URL/api/items?active=true" | jq 'length'
# Expected: 6

curl "$BASE_URL/api/inventory/summary" | jq
# Expected: summary with 6 locations
```

---

## ⏰ Scheduler Next Runs

| Job | Cron | Next Run (UTC) | Purpose |
|-----|------|----------------|---------|
| Forecast | `5 2 * * *` | 2025-11-06 02:05:00 | Generate 7-day forecasts |
| Email Report | `20 2 * * *` | 2025-11-06 02:20:00 | Send daily summary |
| Weekly Retrain | `0 4 * * 0` | 2025-11-10 04:00:00 | Retrain ML models |

**Critical:** First forecast runs tonight at 02:05 UTC (Nov 6)

---

## 📈 24h Monitoring Checklist

### T+2h (Nov 5, ~14:00 UTC)
- [ ] Deployment status: Active
- [ ] Health check: status=healthy, version=19.3.0
- [ ] API latency: P95 <15ms, P99 <30ms
- [ ] Memory: <50% at rest
- [ ] Logs: No errors

### T+6h (Nov 5, ~18:00 UTC)
- [ ] Cache warming complete
- [ ] API traffic patterns normal
- [ ] No alerts triggered

### T+16h (Nov 6, 02:05 UTC) ⭐ CRITICAL
- [ ] **Forecast run starts**
- [ ] Monitor duration (target: <84s)
- [ ] Monitor peak memory (target: <62%)
- [ ] Check batch delay logs (expect 300ms intervals)
- [ ] Verify MAPE (target: <20%)
- [ ] Check outlier routing (expect 1-3 SKUs flagged)

### T+16.25h (Nov 6, 02:20 UTC)
- [ ] **Email report delivered** to neuropilotai@gmail.com
- [ ] Report includes forecast summary
- [ ] High-variance items section populated

### T+24h (Nov 6, 12:00 UTC)
- [ ] Collect full metrics snapshot
- [ ] Compare vs v19.2 baseline
- [ ] Generate 24h summary
- [ ] Decide: Keep v19.3 or rollback

---

## 🔄 Rollback Procedures

### Quick Rollback (ENV revert, <1 min)
```bash
railway variables set STREAMING_BATCH_DELAY_MS=500 -s backend
railway variables set PREDICTIVE_CACHE_ENABLED=false -s backend
railway variables set OUTLIER_ROUTING_ENABLED=false -s backend
railway service restart backend
```

### Dashboard Rollback (<3 min)
1. Go to Railway → Deployments
2. Find previous v19.2 deployment
3. Click "Rollback to this deployment"

### Full Git Revert
```bash
git revert v19.3.0
git push origin main
```

---

## ✅ Success Criteria (48h)

- [ ] Forecast duration ≤84s
- [ ] Cache hit rate ≥99.5%
- [ ] Peak memory ≤62%
- [ ] MAPE ≤20%
- [ ] Outlier count ≤3
- [ ] API P95 ≤15ms
- [ ] Zero rollbacks
- [ ] Zero critical errors
- [ ] Uptime 100%
- [ ] Email reports delivered (2/2)

**If all criteria met:** Tag as `v19.3-stable`

---

## 📞 Support

- **Railway Dashboard:** https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299
- **GitHub Repo:** https://github.com/Neuropilotai/neuro-pilot-ai
- **Deployment Branch:** v19.3-optimization
- **Production Tag:** v19.3.0

---

**Status:** 🟢 READY TO DEPLOY
**Prepared:** 2025-11-05
**Owner:** DevOps Team
