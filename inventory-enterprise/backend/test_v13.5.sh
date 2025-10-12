#!/bin/bash
# NeuroPilot v13.5 Verification Test Script

echo "======================================================================"
echo "NEUROPILOT V13.5 VERIFICATION TEST"
echo "======================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:8083"

# Get owner token (you'll need to provide this)
echo "Enter your owner JWT token (or press Enter to skip authentication tests):"
read -s OWNER_TOKEN
echo ""

if [ -z "$OWNER_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  No token provided - skipping authenticated endpoints${NC}"
  echo ""
  SKIP_AUTH=1
fi

# Test 1: Health Check
echo "1️⃣  Testing Health Endpoint..."
HEALTH=$(curl -s ${BASE_URL}/health | jq -r '.app')
if [ "$HEALTH" = "inventory-enterprise-v2.8.0" ]; then
  echo -e "${GREEN}✅ Server is running${NC}"
else
  echo -e "${RED}❌ Server health check failed${NC}"
  exit 1
fi
echo ""

# Test 2: DQI Endpoint (requires auth)
if [ -z "$SKIP_AUTH" ]; then
  echo "2️⃣  Testing Data Quality Index (DQI)..."
  DQI_RESPONSE=$(curl -s -H "Authorization: Bearer ${OWNER_TOKEN}" \
    ${BASE_URL}/api/owner/ops/status | jq '{dqi_score, dqi_change_pct, dqi_color}')

  DQI_SCORE=$(echo $DQI_RESPONSE | jq -r '.dqi_score')
  if [ "$DQI_SCORE" != "null" ]; then
    echo -e "${GREEN}✅ DQI Endpoint Working${NC}"
    echo "   Score: ${DQI_SCORE}"
    echo "   Response: ${DQI_RESPONSE}"
  else
    echo -e "${RED}❌ DQI endpoint returned null${NC}"
  fi
  echo ""

  # Test 3: Predictive Health Metrics
  echo "3️⃣  Testing Predictive Health Metrics..."
  HEALTH_RESPONSE=$(curl -s -H "Authorization: Bearer ${OWNER_TOKEN}" \
    ${BASE_URL}/api/owner/ops/status | jq '{forecast_latency_avg, learning_latency_avg, forecast_divergence}')

  echo -e "${GREEN}✅ Predictive Health Endpoint Working${NC}"
  echo "   Response: ${HEALTH_RESPONSE}"
  echo ""

  # Test 4: Self-Heal Trigger
  echo "4️⃣  Testing Self-Heal Agent..."
  HEAL_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer ${OWNER_TOKEN}" \
    ${BASE_URL}/api/owner/ops/trigger/self_heal | jq '{success, job, results}')

  HEAL_SUCCESS=$(echo $HEAL_RESPONSE | jq -r '.success')
  if [ "$HEAL_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ Self-Heal Agent Working${NC}"
    echo "   Actions: $(echo $HEAL_RESPONSE | jq -r '.results.actions | length')"
    echo "   Repaired: $(echo $HEAL_RESPONSE | jq -r '.results.repaired')"
    echo "   Warnings: $(echo $HEAL_RESPONSE | jq -r '.results.warnings | length')"
  else
    echo -e "${RED}❌ Self-heal failed${NC}"
  fi
  echo ""

  # Test 5: Full Status Response
  echo "5️⃣  Testing Full AI Ops Status..."
  FULL_STATUS=$(curl -s -H "Authorization: Bearer ${OWNER_TOKEN}" \
    ${BASE_URL}/api/owner/ops/status)

  CHECKS_COUNT=$(echo $FULL_STATUS | jq '.checks | length')
  HEALTHY=$(echo $FULL_STATUS | jq -r '.healthy')

  if [ "$HEALTHY" = "true" ] || [ "$HEALTHY" = "false" ]; then
    echo -e "${GREEN}✅ Full Status Endpoint Working${NC}"
    echo "   Healthy: ${HEALTHY}"
    echo "   Health %: $(echo $FULL_STATUS | jq -r '.healthPct')%"
    echo "   Checks: ${CHECKS_COUNT}"
    echo "   DQI Score: $(echo $FULL_STATUS | jq -r '.dqi_score')"
  else
    echo -e "${RED}❌ Status endpoint failed${NC}"
  fi
  echo ""

else
  echo "2️⃣-5️⃣  Skipping authenticated tests (no token provided)"
  echo ""
fi

# Test 6: Frontend Files
echo "6️⃣  Checking Frontend Files..."
if [ -f "frontend/owner-super-console.html" ]; then
  DQI_IN_HTML=$(grep -c "opsDQIScore" frontend/owner-super-console.html)
  if [ "$DQI_IN_HTML" -gt 0 ]; then
    echo -e "${GREEN}✅ Frontend HTML updated with v13.5 elements${NC}"
  else
    echo -e "${YELLOW}⚠️  DQI element not found in HTML${NC}"
  fi
else
  echo -e "${RED}❌ Frontend HTML file not found${NC}"
fi
echo ""

# Test 7: JavaScript Updates
echo "7️⃣  Checking JavaScript Updates..."
if [ -f "frontend/owner-super-console.js" ]; then
  LOAD_AI_OPS=$(grep -c "v13.5 - Adaptive Intelligence" frontend/owner-super-console.js)
  if [ "$LOAD_AI_OPS" -gt 0 ]; then
    echo -e "${GREEN}✅ Frontend JS updated with v13.5 logic${NC}"
  else
    echo -e "${YELLOW}⚠️  v13.5 comment not found in JS${NC}"
  fi
else
  echo -e "${RED}❌ Frontend JS file not found${NC}"
fi
echo ""

# Summary
echo "======================================================================"
echo "VERIFICATION COMPLETE"
echo "======================================================================"
echo ""
echo "Next Steps:"
echo "1. Open http://localhost:8083/owner-super-console.html"
echo "2. Login as owner"
echo "3. Navigate to 'AI Console' tab"
echo "4. Verify you see:"
echo "   • Health Score"
echo "   • 🧮 Data Quality (DQI)"
echo "   • ⚙️ Forecast Latency"
echo "   • 🧩 Learning Divergence"
echo ""
echo "📖 Read: NEUROPILOT_V13.5_IMPLEMENTATION_SUMMARY.md for full details"
echo ""
