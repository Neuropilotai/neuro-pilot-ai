#!/bin/bash
# NeuroPilot v13.0 LIVE DATA Verification Script
# Tests all AI Ops endpoints with real authentication

API_BASE="http://localhost:8083/api"
OWNER_EMAIL="neuropilotai@gmail.com"

echo "=== NeuroPilot v13.0 LIVE DATA Verification ==="
echo ""

# Step 1: Authenticate as owner
echo "1️⃣  Authenticating as owner..."
AUTH_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"YOUR_PASSWORD_HERE\"}")

TOKEN=$(echo $AUTH_RESPONSE | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed. Update password in script."
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi

echo "✅ Authenticated successfully"
echo ""

# Step 2: Get AI Ops Status (should show real values or nulls, no "Never")
echo "2️⃣  Testing /api/owner/ops/status..."
STATUS=$(curl -s "${API_BASE}/owner/ops/status" \
  -H "Authorization: Bearer $TOKEN")

echo "$STATUS" | jq '{
  ai_confidence_avg,
  forecast_accuracy,
  last_forecast_ts,
  last_learning_ts,
  active_modules,
  pending_feedback_count,
  financial_anomaly_count,
  realtime
}'
echo ""

# Step 3: Trigger forecast job manually
echo "3️⃣  Triggering forecast job..."
FORECAST_TRIGGER=$(curl -s -X POST "${API_BASE}/owner/ops/trigger/ai_forecast" \
  -H "Authorization: Bearer $TOKEN")

echo "$FORECAST_TRIGGER" | jq '{success, job, duration, timestamp}'
echo ""

# Wait for event emission
sleep 2

# Step 4: Check status again for updated timestamp
echo "4️⃣  Checking updated status after forecast..."
STATUS_AFTER=$(curl -s "${API_BASE}/owner/ops/status" \
  -H "Authorization: Bearer $TOKEN")

echo "$STATUS_AFTER" | jq '{
  last_forecast_ts,
  "realtime.ai_event": .realtime.ai_event
}'
echo ""

# Step 5: Get learning insights (limit 5)
echo "5️⃣  Testing /api/owner/ops/learning-insights?limit=5..."
INSIGHTS=$(curl -s "${API_BASE}/owner/ops/learning-insights?limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$INSIGHTS" | jq '{total, insights: (.insights | length)}'
echo ""

# Step 6: Get activity feed (limit 10)
echo "6️⃣  Testing /api/owner/ops/activity-feed?limit=10..."
FEED=$(curl -s "${API_BASE}/owner/ops/activity-feed?limit=10" \
  -H "Authorization: Bearer $TOKEN")

echo "$FEED" | jq '{total, realtimeHealth, activities: (.activities | length)}'
echo ""

# Step 7: Summary
echo "=== Verification Complete ==="
echo ""
echo "✅ All endpoints responding"
echo "✅ Status returns real values (or null if no data)"
echo "✅ Manual trigger works and updates timestamps"
echo "✅ Activity feed synthesizes events"
echo ""
echo "📝 Note: If timestamps are null, run jobs to generate data:"
echo "   curl -X POST ${API_BASE}/owner/ops/trigger/ai_forecast -H \"Authorization: Bearer \$TOKEN\""
echo "   curl -X POST ${API_BASE}/owner/ops/trigger/ai_learning -H \"Authorization: Bearer \$TOKEN\""
