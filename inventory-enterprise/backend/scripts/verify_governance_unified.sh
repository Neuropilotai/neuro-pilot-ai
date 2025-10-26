#!/usr/bin/env bash
#
# verify_governance_unified.sh (v16.5.0)
#
# Integration test for Unified Governance Command Center (Phase 16.5)
#
# Tests:
# 1. Predictive Trend API (/api/governance/predictive/trend)
# 2. Unified Status API (/api/governance/predictive/unified)
# 3. Recompute API (/api/governance/predictive/recompute)
# 4. Frontend Panel Assets
# 5. UI Metrics
#
# Usage: ./scripts/verify_governance_unified.sh
#
# Exit codes:
#   0 = All tests passed
#   1 = One or more tests failed
#
# Author: NeuroPilot AI Development Team
# Date: 2025-10-19

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8083}"
TOKEN=""
OWNER_EMAIL="${OWNER_EMAIL:-neuropilotai@gmail.com}"
OWNER_PASSWORD="${OWNER_PASSWORD:-SecureOwnerPass2025!}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper function to print section headers
print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

# Helper function to print test results
print_test() {
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ "$1" = "PASS" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $2"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAIL${NC}: $2"
    if [ -n "$3" ]; then
      echo -e "${RED}   Error: $3${NC}"
    fi
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Helper function to make authenticated requests
api_get() {
  local endpoint="$1"
  curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint"
}

api_post() {
  local endpoint="$1"
  local data="$2"
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint"
}

# ==============================================================================
# MAIN SCRIPT
# ==============================================================================

print_section "🎯 Phase 16.5 Unified Governance Verification"

echo "Starting verification at $(date)"
echo "Base URL: $BASE_URL"
echo ""

# ==============================================================================
# Step 1: Authenticate as Owner
# ==============================================================================

print_section "1️⃣  Authentication"

echo "Authenticating as owner..."
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  print_test "PASS" "Owner authentication successful"
  echo "Token: ${TOKEN:0:20}..."
else
  print_test "FAIL" "Owner authentication failed" "$AUTH_RESPONSE"
  echo ""
  echo -e "${RED}Cannot proceed without authentication. Exiting.${NC}"
  exit 1
fi

# ==============================================================================
# Step 2: Test Predictive Trend API
# ==============================================================================

print_section "2️⃣  Predictive Trend API"

echo "Testing GET /api/governance/predictive/trend..."

TREND_RESPONSE=$(api_get "/api/governance/predictive/trend?pillar=composite&days=7&lookback=30")

if echo "$TREND_RESPONSE" | grep -q '"success":true'; then
  print_test "PASS" "Predictive trend API responding"

  # Check for required fields
  if echo "$TREND_RESPONSE" | grep -q '"current_score"'; then
    print_test "PASS" "Trend response includes current_score"
  else
    print_test "FAIL" "Trend response missing current_score"
  fi

  if echo "$TREND_RESPONSE" | grep -q '"historical"'; then
    print_test "PASS" "Trend response includes historical data"
  else
    print_test "FAIL" "Trend response missing historical data"
  fi

  if echo "$TREND_RESPONSE" | grep -q '"forecast"'; then
    print_test "PASS" "Trend response includes forecast data"
  else
    print_test "FAIL" "Trend response missing forecast data"
  fi

  if echo "$TREND_RESPONSE" | grep -q '"trend"'; then
    TREND_DIR=$(echo "$TREND_RESPONSE" | grep -o '"trend":"[^"]*' | cut -d'"' -f4)
    print_test "PASS" "Trend direction detected: $TREND_DIR"
  else
    print_test "FAIL" "Trend response missing trend direction"
  fi

  if echo "$TREND_RESPONSE" | grep -q '"confidence"'; then
    CONFIDENCE=$(echo "$TREND_RESPONSE" | grep -o '"confidence":[0-9.]*' | cut -d':' -f2)
    print_test "PASS" "Confidence score: $CONFIDENCE"
  else
    print_test "FAIL" "Trend response missing confidence"
  fi

else
  print_test "FAIL" "Predictive trend API failed" "$TREND_RESPONSE"
fi

# Test different pillars
echo ""
echo "Testing other pillars..."

for PILLAR in finance health ai menu; do
  PILLAR_RESPONSE=$(api_get "/api/governance/predictive/trend?pillar=$PILLAR&days=7")
  if echo "$PILLAR_RESPONSE" | grep -q '"success":true'; then
    print_test "PASS" "Pillar '$PILLAR' trend working"
  else
    print_test "FAIL" "Pillar '$PILLAR' trend failed"
  fi
done

# ==============================================================================
# Step 3: Test Unified Status API
# ==============================================================================

print_section "3️⃣  Unified Status API"

echo "Testing GET /api/governance/predictive/unified..."

UNIFIED_RESPONSE=$(api_get "/api/governance/predictive/unified")

if echo "$UNIFIED_RESPONSE" | grep -q '"success":true'; then
  print_test "PASS" "Unified status API responding"

  # Check for governance score
  if echo "$UNIFIED_RESPONSE" | grep -q '"governance_score"'; then
    GOV_SCORE=$(echo "$UNIFIED_RESPONSE" | grep -o '"governance_score":[0-9.]*' | cut -d':' -f2)
    print_test "PASS" "Governance score: $GOV_SCORE/100"
  else
    print_test "FAIL" "Unified response missing governance_score"
  fi

  # Check for finance integrity
  if echo "$UNIFIED_RESPONSE" | grep -q '"finance_integrity"'; then
    print_test "PASS" "Finance integrity data present"

    FIN_SCORE=$(echo "$UNIFIED_RESPONSE" | grep -o '"finance_integrity":{"score":[0-9.]*' | grep -o '[0-9.]*$')
    FIN_STATUS=$(echo "$UNIFIED_RESPONSE" | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)
    echo "   Finance: $FIN_SCORE/100 ($FIN_STATUS)"
  else
    print_test "FAIL" "Unified response missing finance_integrity"
  fi

  # Check for AI intelligence
  if echo "$UNIFIED_RESPONSE" | grep -q '"ai_intelligence"'; then
    print_test "PASS" "AI intelligence data present"

    AI_INDEX=$(echo "$UNIFIED_RESPONSE" | grep -o '"ai_intelligence":{"index":[0-9.]*' | grep -o '[0-9.]*$')
    echo "   AI Index: $AI_INDEX/100"
  else
    print_test "FAIL" "Unified response missing ai_intelligence"
  fi

  # Check for health score
  if echo "$UNIFIED_RESPONSE" | grep -q '"health_score"'; then
    print_test "PASS" "Health score data present"
  else
    print_test "FAIL" "Unified response missing health_score"
  fi

  # Check for overall status
  if echo "$UNIFIED_RESPONSE" | grep -q '"overall_status"'; then
    OVERALL_STATUS=$(echo "$UNIFIED_RESPONSE" | grep -o '"overall_status":"[^"]*' | cut -d'"' -f4)
    print_test "PASS" "Overall status: $OVERALL_STATUS"
  else
    print_test "FAIL" "Unified response missing overall_status"
  fi

else
  print_test "FAIL" "Unified status API failed" "$UNIFIED_RESPONSE"
fi

# ==============================================================================
# Step 4: Test Recompute API
# ==============================================================================

print_section "4️⃣  Recompute API"

echo "Testing POST /api/governance/predictive/recompute..."

RECOMPUTE_RESPONSE=$(api_post "/api/governance/predictive/recompute" "{}")

if echo "$RECOMPUTE_RESPONSE" | grep -q '"success":true'; then
  print_test "PASS" "Recompute API responding"

  if echo "$RECOMPUTE_RESPONSE" | grep -q '"forecast_count"'; then
    FORECAST_COUNT=$(echo "$RECOMPUTE_RESPONSE" | grep -o '"forecast_count":[0-9]*' | cut -d':' -f2)
    print_test "PASS" "Generated $FORECAST_COUNT forecasts"
  else
    print_test "FAIL" "Recompute response missing forecast_count"
  fi

  if echo "$RECOMPUTE_RESPONSE" | grep -q '"runtime_seconds"'; then
    RUNTIME=$(echo "$RECOMPUTE_RESPONSE" | grep -o '"runtime_seconds":[0-9.]*' | cut -d':' -f2)
    print_test "PASS" "Recompute runtime: ${RUNTIME}s"
  else
    print_test "FAIL" "Recompute response missing runtime_seconds"
  fi

else
  print_test "FAIL" "Recompute API failed" "$RECOMPUTE_RESPONSE"
fi

# ==============================================================================
# Step 5: Verify Frontend Assets
# ==============================================================================

print_section "5️⃣  Frontend Assets"

echo "Checking frontend panel assets..."

# Check HTML component
if [ -f "../frontend/owner-governance-panel.html" ]; then
  print_test "PASS" "owner-governance-panel.html exists"
else
  print_test "FAIL" "owner-governance-panel.html not found"
fi

# Check JavaScript module
if [ -f "../frontend/public/js/governance-panel.js" ]; then
  print_test "PASS" "governance-panel.js exists"

  # Check for key classes/functions
  if grep -q "class GovernancePanel" "../frontend/public/js/governance-panel.js"; then
    print_test "PASS" "GovernancePanel class defined"
  else
    print_test "FAIL" "GovernancePanel class not found"
  fi
else
  print_test "FAIL" "governance-panel.js not found"
fi

# Check CSS styling
if [ -f "../frontend/public/css/governance-panel.css" ]; then
  print_test "PASS" "governance-panel.css exists"
else
  print_test "FAIL" "governance-panel.css not found"
fi

# ==============================================================================
# Step 6: Test UI Metrics
# ==============================================================================

print_section "6️⃣  UI Metrics"

echo "Testing Prometheus UI metrics..."

METRICS_RESPONSE=$(curl -s "$BASE_URL/metrics")

if echo "$METRICS_RESPONSE" | grep -q 'ui_hits_total'; then
  print_test "PASS" "ui_hits_total metric registered"
else
  print_test "FAIL" "ui_hits_total metric not found"
fi

if echo "$METRICS_RESPONSE" | grep -q 'ui_actions_total'; then
  print_test "PASS" "ui_actions_total metric registered"
else
  print_test "FAIL" "ui_actions_total metric not found"
fi

if echo "$METRICS_RESPONSE" | grep -q 'ui_websocket_connections_current'; then
  print_test "PASS" "ui_websocket_connections_current metric registered"
else
  print_test "FAIL" "ui_websocket_connections_current metric not found"
fi

if echo "$METRICS_RESPONSE" | grep -q 'ui_panel_render_duration_ms'; then
  print_test "PASS" "ui_panel_render_duration_ms metric registered"
else
  print_test "FAIL" "ui_panel_render_duration_ms metric not found"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================

print_section "📊 Test Summary"

echo ""
echo "Total Tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed:      $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "${RED}Failed:      $TESTS_FAILED${NC}"
else
  echo -e "${GREEN}Failed:      $TESTS_FAILED${NC}"
fi
echo ""

# Calculate pass rate
if [ $TESTS_TOTAL -gt 0 ]; then
  PASS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))
  echo "Pass Rate: $PASS_RATE%"
fi

echo ""
echo "Completed at $(date)"

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed! Phase 16.5 is operational.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Review the output above.${NC}"
  exit 1
fi
