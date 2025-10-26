# NeuroPilot v14 - Production Verification Guide (Fly.io)

## Quick Start

### Option 1: Automated API Testing (Recommended - Run from local machine)

```bash
cd inventory-enterprise/backend
./scripts/verify_v14_api_production.sh
```

This script will:
- ✓ Check server health and version
- ✓ Obtain authentication token
- ✓ Test all v14 API endpoints
- ✓ Verify learning signals are present
- ✓ Check service window inference
- ✓ Validate forecast cache
- ✓ Test unassigned items endpoint
- ✓ Optionally trigger learning jobs

### Option 2: Manual SSH Verification

```bash
# 1. SSH into Fly.io VM
fly ssh console -a backend-silent-mountain-3362

# 2. Copy and run the verification script
cat > /tmp/verify.sh << 'EOF'
# Paste contents of scripts/verify_v14_production.sh here
EOF

chmod +x /tmp/verify.sh
/tmp/verify.sh

# 3. Exit
exit
```

---

## Manual Verification Steps

### Step 1: Basic Health Check

```bash
# Check app status
fly status -a backend-silent-mountain-3362

# View recent logs
fly logs -a backend-silent-mountain-3362 --since 30m

# Test health endpoint
curl -s https://backend-silent-mountain-3362.fly.dev/health | jq
```

**Expected output:**
```json
{
  "status": "ok",
  "version": "14.0.0",
  "uptime": 12345,
  "timestamp": "2025-10-12T..."
}
```

### Step 2: Obtain Authentication Token

```bash
# Login as owner
curl -s -X POST https://backend-silent-mountain-3362.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.token' > /tmp/TOKEN

# Verify token saved
echo "Token: $(cat /tmp/TOKEN | cut -c1-20)..."
```

### Step 3: Test v14 API Endpoints

#### 3.1 AI Ops Status (v14 Metrics)

```bash
curl -s https://backend-silent-mountain-3362.fly.dev/api/owner/ops/status \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '{
    score: .ai_ops_health.score,
    explanations: .ai_ops_health.explanations,
    last_forecast_ts,
    last_learning_ts,
    ai_confidence_avg,
    forecast_accuracy,
    pending_feedback_count
  }'
```

**Expected output:**
```json
{
  "score": 87,
  "explanations": [
    "Forecast job completed 2h ago",
    "Learning insights generated with 0.85 confidence",
    "7 weighted signals analyzed"
  ],
  "last_forecast_ts": "2025-10-12T06:00:05Z",
  "last_learning_ts": "2025-10-12T21:05:10Z",
  "ai_confidence_avg": 85,
  "forecast_accuracy": 78,
  "pending_feedback_count": 3
}
```

**✓ PASS if**: `score > 0`, timestamps not null

#### 3.2 Learning Insights Timeline (v14 Signals)

```bash
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/ops/learning-insights?limit=10" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '{
    total: .insights | length,
    signal_insights: [.insights[] | select(.insight_type | startswith("signal_"))],
    sample: .insights[0]
  }'
```

**Expected output:**
```json
{
  "total": 10,
  "signal_insights": [
    {
      "insight_type": "signal_menu",
      "title": "MENU Signal",
      "description": "15 recipes appear weekly or more (strong demand pattern)",
      "confidence": 0.89,
      "source_tag": "autonomy_2025_v14"
    }
  ],
  "sample": { ... }
}
```

**✓ PASS if**: At least 1 insight with `insight_type` starting with `"signal_"`

#### 3.3 PDF Service Windows

```bash
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/pdfs?limit=10" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '[.[] | {
    invoice_number,
    invoice_date,
    inferred_service_window
  }]'
```

**Expected output:**
```json
[
  {
    "invoice_number": "9018357846",
    "invoice_date": "2025-01-18",
    "inferred_service_window": "Wed→Sun W2"
  },
  {
    "invoice_number": "9018827318",
    "invoice_date": "2025-02-01",
    "inferred_service_window": "Mon→Fri W1"
  }
]
```

**✓ PASS if**: At least 1 PDF has `inferred_service_window` populated

#### 3.4 Daily Forecast Cache

```bash
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/forecast/daily" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '{
    date,
    items_count: .items | length,
    stockout_count: .stockout | length,
    confidence: .summary.avg_confidence
  }'
```

**Expected output:**
```json
{
  "date": "2025-10-12",
  "items_count": 47,
  "stockout_count": 3,
  "confidence": 0.82
}
```

**✓ PASS if**: `items_count > 0`

#### 3.5 Unassigned Inventory Items

```bash
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/locations/unassigned?limit=10" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '{
    count: .items | length,
    sample: .items[0]
  }'
```

**Expected output:**
```json
{
  "count": 5,
  "sample": {
    "item_code": "COFFEE-001",
    "item_name": "Ground Coffee",
    "current_stock": 12,
    "unit": "BAG"
  }
}
```

**✓ PASS if**: Endpoint returns successfully (count may be 0 if all assigned)

### Step 4: Trigger Learning Jobs (Optional)

```bash
# Trigger forecast
curl -s -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_forecast \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq

# Wait 2 seconds
sleep 2

# Trigger learning
curl -s -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_learning \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq

# Wait 2 seconds
sleep 2

# Verify timestamps updated
curl -s https://backend-silent-mountain-3362.fly.dev/api/owner/ops/status \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '{
    last_forecast_ts,
    last_learning_ts
  }'
```

**✓ PASS if**: Timestamps are within last 10 seconds

### Step 5: SSH Database Verification

```bash
# SSH into VM
fly ssh console -a backend-silent-mountain-3362

# Find database
find . -maxdepth 3 -name "*.db" -o -name "*inventory*.db"

# Assuming db path is ./db/inventory_enterprise.db
DB_PATH="./db/inventory_enterprise.db"

# Check AI tables
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%' ORDER BY name;"

# Check learning insights count
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_learning_insights;"

# Check v14 signal insights
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_learning_insights WHERE insight_type LIKE 'signal_%';"

# Check ai_ops_breadcrumbs schema (v14 enhanced)
sqlite3 "$DB_PATH" "PRAGMA table_info(ai_ops_breadcrumbs);" | grep -E "(duration_ms|metadata|action)"

# Check recent breadcrumbs
sqlite3 "$DB_PATH" "SELECT job, datetime(ran_at), duration_ms FROM ai_ops_breadcrumbs ORDER BY ran_at DESC LIMIT 5;"

# Check fiscal calendar
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM fiscal_periods WHERE fiscal_year IN ('FY25','FY26');"

# Check invoice assignments
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents WHERE fiscal_period_id IS NOT NULL;"

# Exit SSH
exit
```

**✓ PASS if**:
- AI tables include: `ai_learning_insights`, `ai_daily_forecast_cache`, `ai_ops_breadcrumbs`, `ai_feedback_comments`
- `ai_ops_breadcrumbs` has columns: `duration_ms`, `metadata`, `action`
- Fiscal periods count = 24
- Some invoices have `fiscal_period_id` populated

---

## Verification Checklist

Use this checklist to ensure v14 is fully deployed:

- [ ] **Server Health**: Version shows 14.0.0 (or later)
- [ ] **Authentication**: Token obtained successfully
- [ ] **AI Ops Status**: Score > 0, timestamps not null
- [ ] **Learning Insights**: At least 1 `signal_*` insight present
- [ ] **Service Windows**: At least 1 PDF has `inferred_service_window`
- [ ] **Forecast Cache**: Items count > 0
- [ ] **Unassigned Items**: Endpoint returns successfully
- [ ] **Database Tables**: `ai_ops_breadcrumbs` has v14 columns
- [ ] **Fiscal Calendar**: 24 periods for FY25/FY26
- [ ] **LearningSignals.js**: Module exists in deployment

---

## Troubleshooting

### Issue: No v14 signal insights found

**Cause**: Learning job hasn't run yet

**Fix**:
```bash
# Trigger learning job manually
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_learning \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)"

# Wait 3 seconds, then check
sleep 3
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/ops/learning-insights?limit=5" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '.insights[].insight_type'
```

### Issue: Service windows show null

**Cause**: Invoices don't have `invoice_date` populated

**Fix**:
```bash
# Check how many invoices have dates
fly ssh console -a backend-silent-mountain-3362
sqlite3 ./db/inventory_enterprise.db "SELECT COUNT(*) FROM documents WHERE invoice_date IS NOT NULL;"
```

If count is 0, dates need to be backfilled from PDF filenames.

### Issue: AI Ops score = 0 or null

**Cause**: Breadcrumb data missing

**Fix**:
```bash
# Trigger both jobs to populate breadcrumbs
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_forecast \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)"
sleep 2
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_learning \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)"
```

### Issue: Forecast cache empty

**Cause**: Forecast job hasn't run today

**Fix**:
```bash
# Trigger forecast
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_forecast \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)"

# Wait and check
sleep 3
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/forecast/daily" \
  -H "Authorization: Bearer $(cat /tmp/TOKEN)" | jq '.items | length'
```

---

## Expected Cron Schedule

v14 learning jobs run automatically:

- **06:00 UTC**: Forecast generation (`ai_forecast`)
- **21:00 UTC**: Learning signal computation (`ai_learning`)

To verify cron is working:
```bash
# Check logs for cron job execution
fly logs -a backend-silent-mountain-3362 --since 24h | grep -E "(06:00|21:00|Forecast|Learning)"
```

---

## Quick Reference Commands

```bash
# Get token
export TOKEN=$(curl -s -X POST https://backend-silent-mountain-3362.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' | jq -r '.token')

# All-in-one health check
curl -s https://backend-silent-mountain-3362.fly.dev/api/owner/ops/status \
  -H "Authorization: Bearer $TOKEN" | jq '{
    version: .version,
    score: .ai_ops_health.score,
    forecast: .last_forecast_ts,
    learning: .last_learning_ts,
    confidence: .ai_confidence_avg,
    accuracy: .forecast_accuracy
  }'

# Check for v14 signals
curl -s "https://backend-silent-mountain-3362.fly.dev/api/owner/ops/learning-insights?limit=20" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '[.insights[] | select(.insight_type | startswith("signal_"))] | length'

# Trigger both jobs
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_forecast \
  -H "Authorization: Bearer $TOKEN" && sleep 2 && \
curl -X POST https://backend-silent-mountain-3362.fly.dev/api/owner/ops/trigger/ai_learning \
  -H "Authorization: Bearer $TOKEN"
```

---

## Success Criteria

v14 is **FULLY DEPLOYED** if:

1. ✅ Health endpoint returns version ≥ 14.0.0
2. ✅ AI Ops health score > 0
3. ✅ At least 1 `signal_*` insight in learning timeline
4. ✅ At least 1 PDF has `inferred_service_window`
5. ✅ Forecast cache contains items for today
6. ✅ `ai_ops_breadcrumbs` table has `duration_ms` column
7. ✅ Fiscal calendar has 24 FY25/FY26 periods
8. ✅ Learning job can be triggered successfully

---

## Contact & Support

- **Documentation**: `NEUROPILOT_V14_NEXT_LEVEL_LEARNING.md`
- **Local Verification**: `./scripts/verify_v14_learning.sh`
- **Production API Test**: `./scripts/verify_v14_api_production.sh`
- **Production DB Test**: `./scripts/verify_v14_production.sh`

**Fly.io App**: backend-silent-mountain-3362
**Production URL**: https://backend-silent-mountain-3362.fly.dev
**Owner Console**: https://backend-silent-mountain-3362.fly.dev/owner-console.html
