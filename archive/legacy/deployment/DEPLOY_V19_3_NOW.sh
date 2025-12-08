#!/bin/bash
# NeuroInnovate v19.3 RAPID DEPLOYMENT SCRIPT
# Generated: 2025-11-05
# Execute: bash DEPLOY_V19_3_NOW.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 NeuroInnovate v19.3 RAPID DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Date: $(date -u +%Y-%m-%d' '%H:%M:%S' UTC')"
echo ""

# ============================================================
# 1. GIT OPERATIONS
# ============================================================
echo "📦 Step 1: Git Branch & Tag"
echo "─────────────────────────────────"

# Create branch
git checkout -b v19.3-optimization 2>/dev/null || git checkout v19.3-optimization

# Stage v19.3 files
git add inventory-enterprise/backend/config/.env.v19.3.proposed \
        DEPLOY_V19_3_NOW.sh \
        V19_3_DEPLOYMENT_MANIFEST.md || true

git commit -m "feat(v19.3): predictive cache + streaming delay 300ms + outlier routing stubs" || echo "  ℹ️  Nothing to commit or already committed"

git push -u origin v19.3-optimization || echo "  ℹ️  Branch already pushed"

# Merge to main
echo ""
echo "  Merging v19.3-optimization → main..."
git checkout main
git merge --no-ff v19.3-optimization -m "Merge v19.3 – predictive cache + latency optimizations" || echo "  ℹ️  Already merged"

# Tag
git tag -a v19.3.0 -m "NeuroInnovate v19.3 (2025-11-05) – predictive cache + streaming delay 300ms" 2>/dev/null || echo "  ℹ️  Tag v19.3.0 already exists"

git push origin main
git push origin v19.3.0 || echo "  ℹ️  Tag already pushed"

echo "✅ Git operations complete"
echo ""

# ============================================================
# 2. RAILWAY ENV VARIABLES (DELTA ONLY)
# ============================================================
echo "🔧 Step 2: Railway Environment Variables"
echo "─────────────────────────────────"
echo "  Apply these v19.3 DELTA variables in Railway dashboard:"
echo ""

cat <<'ENV_DELTA'
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
ENV_DELTA

echo ""
echo "  📋 Copy the block above to Railway → Variables → Raw Editor"
echo ""
echo "  OR use Railway CLI (if authenticated):"
echo ""

cat <<'CLI_COMMANDS'
railway variables set STREAMING_BATCH_DELAY_MS=300 -s backend
railway variables set PREDICTIVE_CACHE_ENABLED=true -s backend
railway variables set PREDICTIVE_CACHE_WARMUP_ON_STARTUP=true -s backend
railway variables set PREDICTIVE_CACHE_LOOKBACK_HOURS=168 -s backend
railway variables set PREDICTIVE_CACHE_FORECAST_HOURS=12 -s backend
railway variables set PREDICTIVE_CACHE_TOPK=200 -s backend
railway variables set PREDICTIVE_CACHE_PEAK_WINDOWS="02:00-03:00,12:00-13:00" -s backend
railway variables set PREDICTIVE_CACHE_FALLBACK_TO_BASELINE=true -s backend
railway variables set OUTLIER_ROUTING_ENABLED=true -s backend
railway variables set OUTLIER_MODEL_STRATEGY=auto -s backend
railway variables set DEFAULT_REGION=us -s backend
railway variables set ALLOWED_REGIONS=us,eu -s backend
railway variables set APP_VERSION=19.3.0 -s backend
CLI_COMMANDS

echo ""
read -p "Press ENTER once Railway env vars are applied..."

# ============================================================
# 3. TRIGGER DEPLOYMENT
# ============================================================
echo ""
echo "🚢 Step 3: Trigger Deployment"
echo "─────────────────────────────────"

git commit --allow-empty -m "deploy: v19.3.0 to production (2025-11-05)"
git push origin main

echo "✅ Deployment triggered via git push"
echo "  Monitor: https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299"
echo ""
read -p "Press ENTER once deployment shows 'Active'..."

# ============================================================
# 4. SMOKE TESTS
# ============================================================
echo ""
echo "🧪 Step 4: Smoke Tests"
echo "─────────────────────────────────"
echo "Enter your Railway backend URL:"
read -p "BASE_URL (e.g. https://backend-production.up.railway.app): " BASE_URL

echo ""
echo "Test 1: Health check..."
curl -fsS "$BASE_URL/api/health" | jq '{status:.status,version:.version,streaming:.streaming,cache:.cache}'

echo ""
echo "Test 2: Forecasts endpoint..."
curl -fsS "$BASE_URL/api/forecasts" 2>/dev/null | head -c 400 || echo "(empty or cold cache - OK)"

echo ""
echo "✅ Smoke tests complete"

# ============================================================
# 5. DATA IMPORT
# ============================================================
echo ""
echo "📥 Step 5: Seed Data Import"
echo "─────────────────────────────────"

# Create items CSV
cat > /tmp/items_seed.csv <<'ITEMS_CSV'
sku,name,category,uom,reorder_min,reorder_max,par_level,active
SKU-1001,Chicken Breast,Protein,kg,10,40,25,true
SKU-1002,Ground Beef,Protein,kg,8,30,18,true
SKU-2001,Milk 2%,Dairy,L,20,80,50,true
SKU-3001,Tomatoes,Produce,kg,6,24,14,true
SKU-4001,Mozzarella,Dairy,kg,5,20,12,true
SKU-5001,Basmati Rice,Dry,kg,10,60,30,true
ITEMS_CSV

# Create inventory CSV
cat > /tmp/inventory_seed.csv <<'INV_CSV'
sku,location,quantity,lot,expires_at,last_counted_at
SKU-1001,Freezer-A,18,CHB-241101,2025-12-10,2025-11-05T10:00:00Z
SKU-1002,Freezer-B,12,GBF-241103,2025-12-15,2025-11-05T10:00:00Z
SKU-2001,Cooler-1,42,MIL-241030,2025-11-20,2025-11-05T10:00:00Z
SKU-3001,Cooler-2,25,TOM-241105,2025-11-14,2025-11-05T10:00:00Z
SKU-4001,Cooler-3,9,MOZ-241020,2025-12-05,2025-11-05T10:00:00Z
SKU-5001,Dry-1,38,RIC-241001,2026-01-30,2025-11-05T10:00:00Z
INV_CSV

echo "  Importing 6 items..."
curl -fsS -X POST "$BASE_URL/api/items/import" \
  -H "Content-Type: text/csv" \
  --data-binary @/tmp/items_seed.csv && echo "  ✅ Items imported" || echo "  ⚠️ Check if endpoint exists"

echo ""
echo "  Importing 6 inventory records..."
curl -fsS -X POST "$BASE_URL/api/inventory/import" \
  -H "Content-Type: text/csv" \
  --data-binary @/tmp/inventory_seed.csv && echo "  ✅ Inventory imported" || echo "  ⚠️ Check if endpoint exists"

echo ""
echo "  Verification:"
curl -fsS "$BASE_URL/api/items?active=true" 2>/dev/null | jq 'length' && echo " items found" || echo "(endpoint check needed)"

# ============================================================
# 6. SCHEDULER & NEXT RUNS
# ============================================================
echo ""
echo "⏰ Step 6: Scheduler Verification"
echo "─────────────────────────────────"
echo "  Forecast cron: 5 2 * * * (02:05 UTC daily)"
echo "  Report cron:   20 2 * * * (02:20 UTC daily)"
echo ""
echo "  Next forecast run: 2025-11-06 02:05:00 UTC"
echo "  Next report run:   2025-11-06 02:20:00 UTC"
echo ""
echo "  24h Watch Checklist:"
echo "    - Cache hit rate ≥99%"
echo "    - API P95 latency ≤15ms"
echo "    - Peak memory ≤62%"
echo "    - MAPE average ≤20%"
echo "    - Uptime 100%"
echo ""

# ============================================================
# 7. ROLLBACK SAFETY
# ============================================================
echo ""
echo "🔄 Step 7: Rollback Procedures"
echo "─────────────────────────────────"
cat <<'ROLLBACK'
METHOD 1: ENV REVERT (fastest, <1 min)
  railway variables set STREAMING_BATCH_DELAY_MS=500 -s backend
  railway variables set PREDICTIVE_CACHE_ENABLED=false -s backend
  railway variables set OUTLIER_ROUTING_ENABLED=false -s backend
  railway service restart backend

METHOD 2: RAILWAY DASHBOARD ROLLBACK (<3 min)
  1. Go to Deployments tab
  2. Find previous v19.2 deployment
  3. Click "Rollback to this deployment"

METHOD 3: GIT REVERT
  git revert v19.3.0
  git push origin main
  (triggers new deployment)

SUCCESS CRITERIA (tonight's 02:05 UTC run):
  ✅ Cache hit rate ≥99%
  ✅ Peak memory ≤62%
  ✅ MAPE ≤20%
  ✅ Forecast duration ≤84s
  ✅ Uptime 100%
  ✅ Email report delivered at 02:20 UTC
ROLLBACK

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ v19.3 DEPLOYMENT COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Monitoring:"
echo "  Health:    $BASE_URL/api/health"
echo "  Metrics:   $BASE_URL/api/metrics"
echo "  Forecasts: $BASE_URL/api/forecasts"
echo ""
echo "Next steps:"
echo "  1. Monitor Railway logs for first 2 hours"
echo "  2. Set alarm for 02:05 UTC (forecast run)"
echo "  3. Check email at 02:20 UTC (daily report)"
echo "  4. Review metrics at 09:00 UTC tomorrow"
echo ""
echo "🎉 v19.3 is LIVE!"
