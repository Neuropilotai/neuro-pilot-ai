#!/bin/bash
# NeuroPilot v13.0 LIVE DATA Verification
# Run this script to verify all endpoints work correctly

API_BASE="http://localhost:8083/api"
OWNER_EMAIL="neuropilotai@gmail.com"

echo "═══════════════════════════════════════════════════════════════"
echo "  NeuroPilot v13.0 LIVE DATA Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Authenticate
echo "1️⃣  Authenticating as owner..."
echo "   Email: $OWNER_EMAIL"
echo "   (Update password in this script if needed)"
echo ""
read -sp "Enter password: " PASSWORD
echo ""

AUTH_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"${PASSWORD}\"}")

TOKEN=$(echo $AUTH_RESPONSE | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed."
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi

echo "✅ Authenticated successfully"
echo ""

# Step 2: Check current status BEFORE triggers
echo "2️⃣  Checking current AI Ops status..."
curl -s "${API_BASE}/owner/ops/status" \
  -H "Authorization: Bearer $TOKEN" | jq '{
  last_forecast_ts,
  last_learning_ts,
  ai_confidence_avg,
  forecast_accuracy,
  pending_feedback_count,
  realtime: {
    clients,
    ai_event
  }
}'
echo ""

# Step 3: Trigger forecast job
echo "3️⃣  Triggering AI forecast job..."
FORECAST_RESULT=$(curl -s -X POST "${API_BASE}/owner/ops/trigger/ai_forecast" \
  -H "Authorization: Bearer $TOKEN")

echo "$FORECAST_RESULT" | jq '{success, job, duration, timestamp}'
echo ""

# Wait for event to propagate
sleep 1

# Step 4: Trigger learning job
echo "4️⃣  Triggering AI learning job..."
LEARNING_RESULT=$(curl -s -X POST "${API_BASE}/owner/ops/trigger/ai_learning" \
  -H "Authorization: Bearer $TOKEN")

echo "$LEARNING_RESULT" | jq '{success, job, duration, timestamp}'
echo ""

# Wait for events to propagate
sleep 2

# Step 5: Check status AFTER triggers (should show updated timestamps)
echo "5️⃣  Checking updated status (timestamps should be recent)..."
curl -s "${API_BASE}/owner/ops/status" \
  -H "Authorization: Bearer $TOKEN" | jq '{
  last_forecast_ts,
  last_learning_ts,
  realtime: {
    clients,
    ai_event: {
      lastEmit,
      emitCount
    }
  }
}'
echo ""

# Step 6: Get learning insights
echo "6️⃣  Fetching learning insights (last 5)..."
curl -s "${API_BASE}/owner/ops/learning-insights?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '{
  total,
  first_item: .insights[0]
}'
echo ""

# Step 7: Get activity feed
echo "7️⃣  Fetching activity feed (last 10)..."
curl -s "${API_BASE}/owner/ops/activity-feed?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '{
  total,
  realtimeHealth: {
    overallHealthy,
    ai_event: .realtimeHealth.channels.ai_ops
  },
  first_activity: .activities[0]
}'
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "  Verification Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ Check that:"
echo "   - last_forecast_ts and last_learning_ts are recent"
echo "   - realtime.ai_event.emitCount increased"
echo "   - realtime.ai_event.lastEmit is within last few seconds"
echo "   - Activity feed shows recent events"
echo ""
echo "🌐 Open Frontend:"
echo "   http://localhost:8083/owner-super-console.html"
echo "   Navigate to AI Ops tab and verify LIVE badge is 🟢"
echo ""
