# NeuroInnovate v19.3 – Railway Deployment Instructions

**Status:** ✅ Git operations COMPLETE
**Next:** Apply Railway environment variables

---

## ✅ COMPLETED: Git Operations

```
✅ Branch created: v19.3-optimization
✅ Files committed:
   - DEPLOY_V19_3_NOW.sh
   - V19_3_DEPLOYMENT_MANIFEST.md
   - inventory-enterprise/docs/ENV_V19_3_PROPOSED.md
✅ Merged to main
✅ Tagged: v19.3.0
✅ Pushed to GitHub
```

**GitHub Repo:** https://github.com/Neuropilotai/neuro-pilot-ai/tree/v19.3.0

---

## 🔧 NEXT STEP: Railway Environment Variables

### Option 1: Railway Dashboard (RECOMMENDED)

1. **Go to:** https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299

2. **Click:** `backend` service → `Variables` tab → `Raw Editor` button

3. **PASTE THIS BLOCK** (add to existing variables):

```env
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

4. **Click:** `Save` (Railway will auto-deploy)

---

### Option 2: Railway CLI

```bash
# Authenticate (if not already)
railway login

# Link to project
railway link 6eb48b9a-8fe0-4836-8247-f6cef566f299

# Set variables one by one
railway variables set STREAMING_BATCH_DELAY_MS=300 -s backend
railway variables set PREDICTIVE_CACHE_ENABLED=true -s backend
railway variables set PREDICTIVE_CACHE_WARMUP_ON_STARTUP=true -s backend
railway variables set PREDICTIVE_CACHE_LOOKBACK_HOURS=168 -s backend
railway variables set PREDICTIVE_CACHE_FORECAST_HOURS=12 -s backend
railway variables set PREDICTIVE_CACHE_TOPK=200 -s backend
railway variables set PREDICTIVE_CACHE_PEAK_WINDOWS="02:00-03:00,12:00-13:00" -s backend
railway variables set PREDICTIVE_CACHE_FALLBACK_TO_BASELINE=true -s backend
railway variables set PREDICTIVE_CACHE_PRELOAD_TIMEOUT_MS=30000 -s backend
railway variables set OUTLIER_ROUTING_ENABLED=true -s backend
railway variables set OUTLIER_MODEL_STRATEGY=auto -s backend
railway variables set OUTLIER_MADF_THRESHOLD=3.0 -s backend
railway variables set OUTLIER_MAX_PER_RUN=10 -s backend
railway variables set OUTLIER_LOG_DECISIONS=true -s backend
railway variables set DEFAULT_REGION=us -s backend
railway variables set ALLOWED_REGIONS=us,eu -s backend
railway variables set MULTIREGION_READY=true -s backend
railway variables set CACHE_REGION_AWARE_KEYS=true -s backend
railway variables set APP_VERSION=19.3.0 -s backend
railway variables set DEPLOYMENT_DATE=2025-11-05 -s backend

# Trigger deployment (if auto-deploy is off)
railway up -s backend
```

---

## 🚢 Deployment Monitoring

### 1. Watch Deployment Status

**Dashboard:** https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/service/backend

**Look for:**
- Build: `Building...` → `Build Complete`
- Deploy: `Deploying...` → `Active`
- Status: Green checkmark

**ETA:** 3-5 minutes

### 2. Check Build Logs

```bash
railway logs -s backend --tail 100
```

**Look for:**
- `Starting server on port 3000`
- `Connected to database`
- `Scheduler initialized`
- No ERROR messages

---

## 🧪 Smoke Tests (AFTER DEPLOYMENT)

### Get Your Backend URL

**Option A:** From Railway Dashboard
1. Go to backend service
2. Look for "Domains" section
3. Copy the URL (e.g., `backend-production.up.railway.app`)

**Option B:** From CLI
```bash
railway domain -s backend
```

### Run Tests

Replace `<BASE_URL>` with your actual URL:

```bash
export BASE_URL="https://YOUR-BACKEND.up.railway.app"

# Test 1: Health check
curl -fsS "$BASE_URL/api/health" | jq '.'

# Test 2: Version check
curl -fsS "$BASE_URL/api/health" | jq '.version'
# Expected: "19.3.0" or "19.3"

# Test 3: Streaming config
curl -fsS "$BASE_URL/api/health" | jq '.streaming'
# Expected: {enabled: true, batchDelay: 300}

# Test 4: Cache config
curl -fsS "$BASE_URL/api/health" | jq '.cache'
# Expected: {predictiveEnabled: true}

# Test 5: Forecasts (may be empty initially - OK)
curl -fsS "$BASE_URL/api/forecasts" | jq 'length'
```

**All tests passing?** ✅ Proceed to data import

---

## 📥 Seed Data Import

### Create CSV Files

```bash
# Items CSV
cat > /tmp/items_seed.csv <<'EOF'
sku,name,category,uom,reorder_min,reorder_max,par_level,active
SKU-1001,Chicken Breast,Protein,kg,10,40,25,true
SKU-1002,Ground Beef,Protein,kg,8,30,18,true
SKU-2001,Milk 2%,Dairy,L,20,80,50,true
SKU-3001,Tomatoes,Produce,kg,6,24,14,true
SKU-4001,Mozzarella,Dairy,kg,5,20,12,true
SKU-5001,Basmati Rice,Dry,kg,10,60,30,true
EOF

# Inventory CSV
cat > /tmp/inventory_seed.csv <<'EOF'
sku,location,quantity,lot,expires_at,last_counted_at
SKU-1001,Freezer-A,18,CHB-241101,2025-12-10,2025-11-05T10:00:00Z
SKU-1002,Freezer-B,12,GBF-241103,2025-12-15,2025-11-05T10:00:00Z
SKU-2001,Cooler-1,42,MIL-241030,2025-11-20,2025-11-05T10:00:00Z
SKU-3001,Cooler-2,25,TOM-241105,2025-11-14,2025-11-05T10:00:00Z
SKU-4001,Cooler-3,9,MOZ-241020,2025-12-05,2025-11-05T10:00:00Z
SKU-5001,Dry-1,38,RIC-241001,2026-01-30,2025-11-05T10:00:00Z
EOF
```

### Import Data

```bash
export BASE_URL="https://YOUR-BACKEND.up.railway.app"

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
```

**Note:** If import endpoints don't exist yet, you'll need to add them to the backend first.

---

## ⏰ Scheduler Verification

### Next Run Times

| Job | Cron | Next Run (UTC) | Time Until Run |
|-----|------|----------------|----------------|
| **Forecast** | `5 2 * * *` | 2025-11-06 02:05:00 | ~14 hours |
| **Email Report** | `20 2 * * *` | 2025-11-06 02:20:00 | ~14.25 hours |

### Check Scheduler Status

```bash
curl "$BASE_URL/api/health/scheduler" | jq '{
  nextForecast: .nextForecastRun,
  nextReport: .nextReportRun,
  lastRun: .lastForecastRun
}'
```

---

## 📊 24h Monitoring Plan

### Tonight (Nov 5, 18:00-22:00 UTC)
- [ ] Check Railway logs every 2 hours
- [ ] Monitor memory usage (should be <50% at rest)
- [ ] Verify no ERROR logs
- [ ] API latency stable

### Critical: Tomorrow Morning (Nov 6, 02:00-03:00 UTC)

**Set alarm for 01:55 UTC** ⏰

**02:05 UTC - Forecast Run**
- [ ] Watch Railway logs in real-time
- [ ] Monitor duration (target: <84s)
- [ ] Check peak memory (target: <62%)
- [ ] Verify batch delay: 300ms intervals in logs
- [ ] Check MAPE (target: <20%)

**02:20 UTC - Email Report**
- [ ] Check email: neuropilotai@gmail.com
- [ ] Verify forecast summary included
- [ ] Check high-variance items section

### Tomorrow Afternoon (Nov 6, 12:00 UTC)
- [ ] Collect 24h metrics
- [ ] Compare vs v19.2 baseline
- [ ] Decide: Keep or rollback

---

## 🔄 Quick Rollback (if needed)

### ENV Revert (<1 min)
```bash
railway variables set STREAMING_BATCH_DELAY_MS=500 -s backend
railway variables set PREDICTIVE_CACHE_ENABLED=false -s backend
railway variables set OUTLIER_ROUTING_ENABLED=false -s backend
railway service restart backend
```

### Dashboard Rollback (<3 min)
1. Go to Railway → Deployments
2. Find previous deployment (before v19.3)
3. Click "Rollback"

---

## ✅ Success Criteria (First 24h)

- [ ] Deployment: Active with no errors
- [ ] Health check: status=healthy, version=19.3.0
- [ ] First forecast: Duration <84s, MAPE <20%, Memory <62%
- [ ] Email report: Delivered at 02:20 UTC
- [ ] Cache hit rate: ≥99%
- [ ] API latency: P95 <15ms
- [ ] No critical alerts
- [ ] Uptime: 100%

**All checks pass?** ✅ v19.3 is stable, continue monitoring

**Any failures?** 🔄 Execute rollback and investigate

---

## 📞 Support Resources

- **Railway Dashboard:** https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299
- **GitHub Release:** https://github.com/Neuropilotai/neuro-pilot-ai/releases/tag/v19.3.0
- **Deployment Manifest:** See `V19_3_DEPLOYMENT_MANIFEST.md` in repo
- **Railway Docs:** https://docs.railway.app

---

**Status:** 🟡 READY FOR RAILWAY DEPLOYMENT
**Next Action:** Apply environment variables in Railway dashboard
**Generated:** 2025-11-05
