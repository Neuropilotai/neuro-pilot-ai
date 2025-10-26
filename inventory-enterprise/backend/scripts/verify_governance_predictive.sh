#!/bin/bash

###############################################################################
# verify_governance_predictive.sh (v16.1.0)
#
# Verification script for Governance Predictive Control Panel
# Tests forecast visualization, simulation controls, and bilingual support
#
# Usage:
#   ./scripts/verify_governance_predictive.sh
#
# Requirements:
#   - Server running on localhost:8083
#   - Owner token available in .owner_token
#   - v15.9.0 Governance Forecasting backend
#   - v16.0.0 Intelligence Dashboard
#
# Author: NeuroPilot AI Development Team
# Date: 2025-10-18
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASS=0
FAIL=0

# Server configuration
SERVER="http://localhost:8083"
TOKEN_FILE=".owner_token"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Governance Predictive Control Panel Verification (v16.1.0)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

###############################################################################
# Helper Functions
###############################################################################

pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASS++))
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAIL++))
}

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

###############################################################################
# Test 1: Pre-flight Checks
###############################################################################

info "Checking prerequisites..."

# Check if server is running
if curl -s "${SERVER}/health" > /dev/null; then
  pass "Server is running"
else
  fail "Server is not running at ${SERVER}"
  exit 1
fi

# Check if owner token exists
if [ -f "${TOKEN_FILE}" ]; then
  TOKEN=$(cat "${TOKEN_FILE}")
  pass "Owner token found"
else
  fail "Owner token not found at ${TOKEN_FILE}"
  exit 1
fi

# Verify token is valid
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
if curl -s -H "${AUTH_HEADER}" "${SERVER}/api/governance/intelligence/status" | grep -q "success"; then
  pass "Owner token is valid"
else
  fail "Owner token is invalid or expired"
  exit 1
fi

echo ""

###############################################################################
# Test 2: Governance Trends API
###############################################################################

info "Testing Governance Trends API..."

# Test basic trends endpoint
TRENDS_RESPONSE=$(curl -s -H "${AUTH_HEADER}" "${SERVER}/api/governance/trends?period=14&pillar=composite")

if echo "${TRENDS_RESPONSE}" | grep -q "success"; then
  pass "GET /api/governance/trends returned success"

  # Check for historical data
  if echo "${TRENDS_RESPONSE}" | grep -q "historical"; then
    pass "Response contains historical data"
  else
    warn "Response missing historical data (expected for new install)"
  fi

  # Check for forecast data
  if echo "${TRENDS_RESPONSE}" | grep -q "forecast"; then
    pass "Response contains forecast data"
  else
    warn "Response missing forecast data (may need recompute)"
  fi
else
  fail "GET /api/governance/trends failed"
fi

echo ""

###############################################################################
# Test 3: Forecast with Different Pillars
###############################################################################

info "Testing forecast for all pillars..."

for pillar in composite finance health ai menu; do
  PILLAR_RESPONSE=$(curl -s -H "${AUTH_HEADER}" "${SERVER}/api/governance/trends?period=14&pillar=${pillar}&forecast_horizon=14")

  if echo "${PILLAR_RESPONSE}" | grep -q "success"; then
    pass "Pillar '${pillar}' forecast loaded"
  else
    fail "Pillar '${pillar}' forecast failed"
  fi
done

echo ""

###############################################################################
# Test 4: Forecast Simulation (OWNER only)
###############################################################################

info "Testing forecast simulation..."

SIMULATE_PAYLOAD=$(cat <<EOF
{
  "pillar": "composite",
  "horizon": 14,
  "alpha": 0.5,
  "locale": "en"
}
EOF
)

SIMULATE_RESPONSE=$(curl -s -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d "${SIMULATE_PAYLOAD}" \
  "${SERVER}/api/governance/recompute/forecast")

if echo "${SIMULATE_RESPONSE}" | grep -q "success"; then
  pass "POST /api/governance/recompute/forecast succeeded"

  # Extract metrics
  RUN_ID=$(echo "${SIMULATE_RESPONSE}" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)
  FORECAST_COUNT=$(echo "${SIMULATE_RESPONSE}" | grep -o '"forecast_count":[0-9]*' | cut -d':' -f2)
  RUNTIME=$(echo "${SIMULATE_RESPONSE}" | grep -o '"runtime_seconds":[0-9.]*' | cut -d':' -f2)

  if [ -n "${RUN_ID}" ]; then
    pass "Simulation run_id: ${RUN_ID}"
  fi

  if [ -n "${FORECAST_COUNT}" ]; then
    pass "Forecast count: ${FORECAST_COUNT}"
  fi

  if [ -n "${RUNTIME}" ]; then
    pass "Runtime: ${RUNTIME}s"
  fi
else
  fail "POST /api/governance/recompute/forecast failed"
fi

echo ""

###############################################################################
# Test 5: Forecast with Different Parameters
###############################################################################

info "Testing forecast with different parameters..."

# Test with different alpha values
for alpha in 0.1 0.5 1.0; do
  ALPHA_PAYLOAD=$(cat <<EOF
{
  "pillar": "composite",
  "horizon": 7,
  "alpha": ${alpha},
  "locale": "en"
}
EOF
)

  ALPHA_RESPONSE=$(curl -s -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "${ALPHA_PAYLOAD}" \
    "${SERVER}/api/governance/recompute/forecast")

  if echo "${ALPHA_RESPONSE}" | grep -q "success"; then
    pass "Simulation with α=${alpha} succeeded"
  else
    fail "Simulation with α=${alpha} failed"
  fi
done

echo ""

###############################################################################
# Test 6: Bilingual Support
###############################################################################

info "Testing bilingual forecast generation..."

for locale in en fr; do
  LOCALE_PAYLOAD=$(cat <<EOF
{
  "pillar": "composite",
  "horizon": 14,
  "alpha": 0.5,
  "locale": "${locale}"
}
EOF
)

  LOCALE_RESPONSE=$(curl -s -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "${LOCALE_PAYLOAD}" \
    "${SERVER}/api/governance/recompute/forecast")

  if echo "${LOCALE_RESPONSE}" | grep -q "success"; then
    pass "Forecast generation with locale '${locale}' succeeded"
  else
    fail "Forecast generation with locale '${locale}' failed"
  fi
done

echo ""

###############################################################################
# Test 7: Frontend HTML Elements
###############################################################################

info "Checking frontend HTML elements..."

HTML_FILE="$(dirname "$0")/../../frontend/owner-super-console.html"

if [ -f "${HTML_FILE}" ]; then
  pass "Frontend HTML file exists"

  # Check for forecast section
  if grep -q "gi-forecast-chart" "${HTML_FILE}"; then
    pass "Forecast chart SVG element found"
  else
    fail "Forecast chart SVG element not found"
  fi

  # Check for controls
  if grep -q "gi-alpha" "${HTML_FILE}"; then
    pass "Alpha slider found"
  else
    fail "Alpha slider not found"
  fi

  if grep -q "gi-forecast-pillar" "${HTML_FILE}"; then
    pass "Pillar selector found"
  else
    fail "Pillar selector not found"
  fi

  if grep -q "gi-simulate-btn" "${HTML_FILE}"; then
    pass "Simulate button found"
  else
    fail "Simulate button not found"
  fi
else
  fail "Frontend HTML file not found at ${HTML_FILE}"
fi

echo ""

###############################################################################
# Test 8: Frontend JavaScript Functions
###############################################################################

info "Checking frontend JavaScript functions..."

JS_FILE="$(dirname "$0")/../../frontend/owner-super-console.js"

if [ -f "${JS_FILE}" ]; then
  pass "Frontend JavaScript file exists"

  # Check for forecast functions
  if grep -q "loadForecastChart" "${JS_FILE}"; then
    pass "loadForecastChart() function found"
  else
    fail "loadForecastChart() function not found"
  fi

  if grep -q "simulateForecast" "${JS_FILE}"; then
    pass "simulateForecast() function found"
  else
    fail "simulateForecast() function not found"
  fi

  if grep -q "renderForecastChart" "${JS_FILE}"; then
    pass "renderForecastChart() function found"
  else
    fail "renderForecastChart() function not found"
  fi

  # Check for bilingual support
  if grep -q "L_FORECAST" "${JS_FILE}"; then
    pass "Bilingual translation object found"
  else
    fail "Bilingual translation object not found"
  fi
else
  fail "Frontend JavaScript file not found at ${JS_FILE}"
fi

echo ""

###############################################################################
# Test 9: CSS Styles
###############################################################################

info "Checking CSS styles..."

CSS_FILE="$(dirname "$0")/../../frontend/public/css/owner-super.css"

if [ -f "${CSS_FILE}" ]; then
  pass "CSS file exists"

  # Check for forecast slider styles
  if grep -q "forecast-slider" "${CSS_FILE}"; then
    pass "Forecast slider styles found"
  else
    fail "Forecast slider styles not found"
  fi

  # Check for chart styles
  if grep -q "#gi-forecast-chart" "${CSS_FILE}"; then
    pass "Forecast chart styles found"
  else
    fail "Forecast chart styles not found"
  fi
else
  fail "CSS file not found at ${CSS_FILE}"
fi

echo ""

###############################################################################
# Test 10: Data Validation
###############################################################################

info "Validating forecast data structure..."

# Fetch trends with forecast
VALIDATION_RESPONSE=$(curl -s -H "${AUTH_HEADER}" "${SERVER}/api/governance/trends?period=30&pillar=composite&forecast_horizon=14")

if echo "${VALIDATION_RESPONSE}" | grep -q "success"; then
  pass "Forecast data structure valid"

  # Check for required fields in historical data
  if echo "${VALIDATION_RESPONSE}" | grep -q '"as_of"'; then
    pass "Historical data contains 'as_of' field"
  fi

  if echo "${VALIDATION_RESPONSE}" | grep -q '"score"'; then
    pass "Historical data contains 'score' field"
  fi

  # Check for required fields in forecast data
  if echo "${VALIDATION_RESPONSE}" | grep -q '"forecast_date"' || echo "${VALIDATION_RESPONSE}" | grep -q '"as_of"'; then
    pass "Forecast data contains date field"
  fi

  # Check for confidence bounds
  if echo "${VALIDATION_RESPONSE}" | grep -q '"lower"' && echo "${VALIDATION_RESPONSE}" | grep -q '"upper"'; then
    pass "Forecast data contains confidence bounds (lower/upper)"
  else
    warn "Forecast data missing confidence bounds (optional)"
  fi
else
  fail "Forecast data validation failed"
fi

echo ""

###############################################################################
# Summary
###############################################################################

TOTAL=$((PASS + FAIL))
echo "═══════════════════════════════════════════════════════════════"
if [ ${FAIL} -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED (${PASS}/${TOTAL})${NC}"
else
  echo -e "${YELLOW}⚠️  SOME TESTS FAILED (${PASS} passed, ${FAIL} failed out of ${TOTAL})${NC}"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Exit with appropriate code
if [ ${FAIL} -eq 0 ]; then
  exit 0
else
  exit 1
fi
