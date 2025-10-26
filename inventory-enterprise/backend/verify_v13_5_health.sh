#!/bin/bash
# NeuroPilot v13.5 "Health Boost" - Verification Script
# Verifies AI Ops System Health Score ≥85%

echo "══════════════════════════════════════════════════════════════"
echo "🔍 NeuroPilot v13.5 Health Boost - Verification Suite"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8083"

# Check if token is provided
if [ -z "$OWNER_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  OWNER_TOKEN not set. Some tests will be skipped.${NC}"
  echo "   Export your token: export OWNER_TOKEN='your-jwt-token'"
  echo ""
  exit 1
fi

# Test 1: Health Check
echo "1️⃣  Testing Server Health..."
HEALTH=$(curl -s ${BASE_URL}/health 2>/dev/null)
if [ $? -eq 0 ]; then
  APP=$(echo $HEALTH | jq -r '.app' 2>/dev/null)
  if [ "$APP" != "null" ] && [ -n "$APP" ]; then
    echo -e "${GREEN}✅ Server is running: $APP${NC}"
  else
    echo -e "${RED}❌ Server responded but health check failed${NC}"
  fi
else
  echo -e "${RED}❌ Server is not reachable${NC}"
  exit 1
fi
echo ""

# Test 2: Trigger Jobs (Manual)
echo "2️⃣  Triggering AI Jobs..."
echo "   Triggering forecast job..."
FORECAST_TRIGGER=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" ${BASE_URL}/api/owner/ops/trigger/ai_forecast 2>/dev/null)
FORECAST_SUCCESS=$(echo $FORECAST_TRIGGER | jq -r '.success' 2>/dev/null)
if [ "$FORECAST_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Forecast job triggered${NC}"
else
  echo -e "${YELLOW}⚠️  Forecast trigger: $(echo $FORECAST_TRIGGER | jq -r '.error' 2>/dev/null)${NC}"
fi

echo "   Triggering learning job..."
LEARNING_TRIGGER=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" ${BASE_URL}/api/owner/ops/trigger/ai_learning 2>/dev/null)
LEARNING_SUCCESS=$(echo $LEARNING_TRIGGER | jq -r '.success' 2>/dev/null)
if [ "$LEARNING_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Learning job triggered${NC}"
else
  echo -e "${YELLOW}⚠️  Learning trigger: $(echo $LEARNING_TRIGGER | jq -r '.error' 2>/dev/null)${NC}"
fi

echo "   Waiting 3 seconds for jobs to complete..."
sleep 3
echo ""

# Test 3: AI Ops Health Score
echo "3️⃣  Checking AI Ops System Health Score..."
OPS_STATUS=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" ${BASE_URL}/api/owner/ops/status 2>/dev/null)
if [ $? -eq 0 ]; then
  HEALTH_SCORE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.score' 2>/dev/null)

  if [ "$HEALTH_SCORE" != "null" ] && [ -n "$HEALTH_SCORE" ]; then
    echo ""
    echo "   ╔════════════════════════════════════════╗"
    echo "   ║  AI Ops System Health Score: ${HEALTH_SCORE}%      ║"
    echo "   ╚════════════════════════════════════════╝"
    echo ""

    # Check if score meets target
    if [ "$HEALTH_SCORE" -ge 85 ]; then
      echo -e "${GREEN}✅ SUCCESS: Health score ≥85% (Target Met!)${NC}"
    elif [ "$HEALTH_SCORE" -ge 70 ]; then
      echo -e "${YELLOW}⚠️  Health score ≥70% but <85% (Needs improvement)${NC}"
    else
      echo -e "${RED}❌ Health score <70% (Critical)${NC}"
    fi

    # Show component breakdown
    echo ""
    echo "   Component Breakdown:"
    echo "   ────────────────────"

    FORECAST_RECENCY=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.forecastRecency.score' 2>/dev/null)
    FORECAST_VALUE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.forecastRecency.value' 2>/dev/null)
    echo "   Forecast Recency (25%):    ${FORECAST_RECENCY}/100 (${FORECAST_VALUE})"

    LEARNING_RECENCY=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.learningRecency.score' 2>/dev/null)
    LEARNING_VALUE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.learningRecency.value' 2>/dev/null)
    echo "   Learning Recency (20%):    ${LEARNING_RECENCY}/100 (${LEARNING_VALUE})"

    CONFIDENCE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.confidence7d.score' 2>/dev/null)
    echo "   AI Confidence 7d (15%):    ${CONFIDENCE}/100"

    ACCURACY=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.accuracy7d.score' 2>/dev/null)
    echo "   Forecast Accuracy (15%):   ${ACCURACY}/100"

    PIPELINE_SCORE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.pipelineHealth.score' 2>/dev/null)
    PIPELINE_CHECKS=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.pipelineHealth.checksPassed' 2>/dev/null)
    echo "   Pipeline Health (15%):     ${PIPELINE_SCORE}/100 (${PIPELINE_CHECKS}/4 checks)"

    LATENCY_SCORE=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.latencyRealtime.score' 2>/dev/null)
    AVG_LATENCY=$(echo $OPS_STATUS | jq -r '.ai_ops_health.components.latencyRealtime.avgMs' 2>/dev/null)
    if [ "$AVG_LATENCY" != "null" ]; then
      AVG_LATENCY_SEC=$(echo "scale=2; $AVG_LATENCY / 1000" | bc)
      echo "   Latency/Realtime (10%):    ${LATENCY_SCORE}/100 (${AVG_LATENCY_SEC}s avg)"
    else
      echo "   Latency/Realtime (10%):    ${LATENCY_SCORE}/100 (No data)"
    fi

    # Show explanations
    echo ""
    echo "   Explanations:"
    echo "   ─────────────"
    echo $OPS_STATUS | jq -r '.ai_ops_health.explanations[]' 2>/dev/null | sed 's/^/     • /'

  else
    echo -e "${RED}❌ Health score not available${NC}"
  fi
else
  echo -e "${RED}❌ AI Ops status endpoint failed${NC}"
fi
echo ""

# Test 4: Legacy Metrics (Backwards Compatibility)
echo "4️⃣  Checking Legacy Metrics (Backwards Compatibility)..."
FORECAST_TS=$(echo $OPS_STATUS | jq -r '.last_forecast_ts' 2>/dev/null)
LEARNING_TS=$(echo $OPS_STATUS | jq -r '.last_learning_ts' 2>/dev/null)
AI_CONFIDENCE=$(echo $OPS_STATUS | jq -r '.ai_confidence_avg' 2>/dev/null)
FORECAST_ACCURACY=$(echo $OPS_STATUS | jq -r '.forecast_accuracy' 2>/dev/null)
FORECAST_LATENCY=$(echo $OPS_STATUS | jq -r '.forecast_latency_avg' 2>/dev/null)

echo "   Last Forecast: ${FORECAST_TS:-null}"
echo "   Last Learning: ${LEARNING_TS:-null}"
echo "   AI Confidence: ${AI_CONFIDENCE:-null}%"
echo "   Forecast Accuracy: ${FORECAST_ACCURACY:-null}%"
echo "   Forecast Latency: ${FORECAST_LATENCY:-null}ms"

if [ "$FORECAST_TS" != "null" ] && [ -n "$FORECAST_TS" ]; then
  echo -e "${GREEN}✅ Legacy endpoints still functional${NC}"
else
  echo -e "${YELLOW}⚠️  Some legacy fields may be null (expected if jobs haven't run)${NC}"
fi
echo ""

# Test 5: Database Verification
echo "5️⃣  Checking Database Tables..."
if [ -f "data/enterprise_inventory.db" ]; then
  BREADCRUMBS=$(sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM ai_ops_breadcrumbs WHERE created_at >= datetime('now', '-72 hours');" 2>/dev/null)
  echo "   Breadcrumbs (72h): ${BREADCRUMBS:-0}"

  FORECAST_CACHE=$(sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM ai_daily_forecast_cache WHERE date >= date('now');" 2>/dev/null)
  echo "   Forecast Cache (today+): ${FORECAST_CACHE:-0}"

  LEARNING=$(sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM ai_learning_insights WHERE created_at >= datetime('now', '-7 days');" 2>/dev/null)
  echo "   Learning Insights (7d): ${LEARNING:-0}"

  if [ "${BREADCRUMBS:-0}" -gt 0 ]; then
    echo -e "${GREEN}✅ Database pipeline active${NC}"
  else
    echo -e "${YELLOW}⚠️  Database pipeline needs activity${NC}"
  fi
else
  echo -e "${RED}❌ Database file not found${NC}"
fi
echo ""

# Summary
echo "══════════════════════════════════════════════════════════════"
if [ "$HEALTH_SCORE" -ge 85 ]; then
  echo -e "${GREEN}✅ VERIFICATION COMPLETE: Target Met (${HEALTH_SCORE}% ≥ 85%)${NC}"
else
  echo -e "${YELLOW}⚠️  VERIFICATION COMPLETE: Target Not Met (${HEALTH_SCORE}% < 85%)${NC}"
  echo ""
  echo "Next Steps to Improve Score:"
  echo "1. Ensure forecast and learning jobs run daily"
  echo "2. Upload invoices with valid dates (for pipeline health)"
  echo "3. Run jobs manually: curl -X POST -H 'Authorization: Bearer \$OWNER_TOKEN' ${BASE_URL}/api/owner/ops/trigger/ai_forecast"
fi
echo "══════════════════════════════════════════════════════════════"
echo ""
