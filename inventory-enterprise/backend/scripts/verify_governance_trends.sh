#!/usr/bin/env bash
#
# verify_governance_trends.sh (v15.9.0)
#
# Purpose: Verify Governance Forecasting & Trend Analytics implementation
#
# Tests:
# 1. POST /api/governance/recompute/daily
# 2. POST /api/governance/recompute/forecast
# 3. GET /api/governance/trends with validation
# 4. Check /metrics for new gauges/counters
#
# Exit codes:
# 0 - All tests passed
# 1 - One or more tests failed
#
# Author: NeuroPilot AI Development Team
# Date: 2025-10-18

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8083}"
TOKEN_FILE="${TOKEN_FILE:-./.owner_token}"
FAILED_TESTS=0

echo -e "${BLUE}================================================================"
echo "   v15.9.0 Governance Trends & Forecasting Verification"
echo -e "================================================================${NC}\n"

# Load token
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  echo -e "${GREEN}✓${NC} Loaded auth token from $TOKEN_FILE"
else
  echo -e "${RED}✗${NC} Token file not found: $TOKEN_FILE"
  echo "   Run: node generate_owner_token.js"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# Helper function to check HTTP response code
check_response() {
  local response=$1
  local expected_code=$2
  local test_name=$3

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓${NC} $test_name (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 0
  else
    echo -e "${RED}✗${NC} $test_name (Expected $expected_code, got $http_code)"
    echo "$body"
    ((FAILED_TESTS++))
    return 1
  fi
}

# Test 1: Record Daily Scores
echo -e "\n${BLUE}Test 1: Record Daily Governance Scores${NC}"
echo "================================================"
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}' \
  "$BASE_URL/api/governance/recompute/daily")

if check_response "$response" "200" "POST /api/governance/recompute/daily"; then
  # Validate response structure
  body=$(echo "$response" | sed '$d')

  if echo "$body" | jq -e '.success' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.as_of' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.scores.finance' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.scores.health' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.scores.ai' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.scores.menu' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.scores.composite' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Response structure valid (all pillar scores present)"
  else
    echo -e "${RED}✗${NC} Response structure invalid (missing fields)"
    ((FAILED_TESTS++))
  fi
fi

# Test 2: Compute Forecasts
echo -e "\n${BLUE}Test 2: Compute Governance Forecasts${NC}"
echo "================================================"
response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"horizons": [7, 14, 30], "method": "exp_smoothing"}' \
  "$BASE_URL/api/governance/recompute/forecast")

if check_response "$response" "200" "POST /api/governance/recompute/forecast"; then
  # Validate response structure
  body=$(echo "$response" | sed '$d')

  if echo "$body" | jq -e '.success' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.run_id' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.forecast_count' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.runtime_seconds' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Response structure valid (run_id, forecast_count, runtime present)"

    forecast_count=$(echo "$body" | jq -r '.forecast_count')
    if [ "$forecast_count" -gt 0 ]; then
      echo -e "${GREEN}✓${NC} Forecasts generated: $forecast_count"
    else
      echo -e "${YELLOW}⚠${NC} Warning: No forecasts generated (may need more historical data)"
    fi
  else
    echo -e "${RED}✗${NC} Response structure invalid (missing fields)"
    ((FAILED_TESTS++))
  fi
fi

# Test 3: Get Trends (30 days, all pillars)
echo -e "\n${BLUE}Test 3: Get Governance Trends${NC}"
echo "================================================"

# Calculate date range (last 30 days)
from_date=$(date -u -v-30d +"%Y-%m-%d" 2>/dev/null || date -u -d "30 days ago" +"%Y-%m-%d")
to_date=$(date -u +"%Y-%m-%d")

response=$(curl -s -w "\n%{http_code}" -G \
  -H "$AUTH_HEADER" \
  --data-urlencode "from=$from_date" \
  --data-urlencode "to=$to_date" \
  --data-urlencode "pillar=all" \
  "$BASE_URL/api/governance/trends")

if check_response "$response" "200" "GET /api/governance/trends"; then
  # Validate response structure
  body=$(echo "$response" | sed '$d')

  if echo "$body" | jq -e '.success' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.series' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.forecasts' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Response structure valid (series, forecasts present)"

    series_count=$(echo "$body" | jq -r '.series | length')
    forecasts_count=$(echo "$body" | jq -r '.forecasts | length')

    echo -e "${GREEN}✓${NC} Series points: $series_count"
    echo -e "${GREEN}✓${NC} Forecast points: $forecasts_count"

    # Check if cached
    if echo "$body" | jq -e '.cached' > /dev/null 2>&1; then
      is_cached=$(echo "$body" | jq -r '.cached')
      if [ "$is_cached" = "true" ]; then
        cache_age=$(echo "$body" | jq -r '.cache_age_seconds')
        echo -e "${BLUE}ℹ${NC} Response was cached (age: ${cache_age}s)"
      fi
    fi
  else
    echo -e "${RED}✗${NC} Response structure invalid (missing fields)"
    ((FAILED_TESTS++))
  fi
fi

# Test 4: Get Pillar Stats
echo -e "\n${BLUE}Test 4: Get Pillar Statistics${NC}"
echo "================================================"
response=$(curl -s -w "\n%{http_code}" -G \
  -H "$AUTH_HEADER" \
  "$BASE_URL/api/governance/stats/composite")

if check_response "$response" "200" "GET /api/governance/stats/composite"; then
  body=$(echo "$response" | sed '$d')

  if echo "$body" | jq -e '.stats.point_count' > /dev/null 2>&1 && \
     echo "$body" | jq -e '.stats.avg_score' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Stats structure valid"

    point_count=$(echo "$body" | jq -r '.stats.point_count')
    avg_score=$(echo "$body" | jq -r '.stats.avg_score')

    echo -e "${GREEN}✓${NC} Point count: $point_count"
    echo -e "${GREEN}✓${NC} Average score: $avg_score"
  else
    echo -e "${RED}✗${NC} Stats structure invalid"
    ((FAILED_TESTS++))
  fi
fi

# Test 5: Check Prometheus Metrics
echo -e "\n${BLUE}Test 5: Verify Prometheus Metrics${NC}"
echo "================================================"
metrics=$(curl -s "$BASE_URL/metrics")

# Check for new metrics
metrics_to_check=(
  "governance_score_composite_current"
  "governance_score_pillar_current"
  "governance_trend_points_total"
  "governance_forecast_runs_total"
  "governance_forecast_runtime_seconds"
)

for metric in "${metrics_to_check[@]}"; do
  if echo "$metrics" | grep -q "^$metric"; then
    echo -e "${GREEN}✓${NC} Metric found: $metric"
  else
    echo -e "${RED}✗${NC} Metric missing: $metric"
    ((FAILED_TESTS++))
  fi
done

# Test 6: Database Schema Validation
echo -e "\n${BLUE}Test 6: Database Schema Validation${NC}"
echo "================================================"

# Check if database file exists
DB_PATH="${DB_PATH:-./inventory.db}"
if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}✗${NC} Database file not found: $DB_PATH"
  ((FAILED_TESTS++))
else
  echo -e "${GREEN}✓${NC} Database file found: $DB_PATH"

  # Check tables
  tables=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND (name='governance_daily' OR name='governance_forecast');")

  if echo "$tables" | grep -q "governance_daily"; then
    echo -e "${GREEN}✓${NC} Table exists: governance_daily"
  else
    echo -e "${RED}✗${NC} Table missing: governance_daily"
    ((FAILED_TESTS++))
  fi

  if echo "$tables" | grep -q "governance_forecast"; then
    echo -e "${GREEN}✓${NC} Table exists: governance_forecast"
  else
    echo -e "${RED}✗${NC} Table missing: governance_forecast"
    ((FAILED_TESTS++))
  fi

  # Check views
  views=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'v_governance%';")
  view_count=$(echo "$views" | wc -l)

  if [ "$view_count" -ge 3 ]; then
    echo -e "${GREEN}✓${NC} Views created: $view_count"
    echo "$views" | sed 's/^/     • /'
  else
    echo -e "${YELLOW}⚠${NC} Warning: Expected at least 3 views, found $view_count"
  fi

  # Check row counts
  daily_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_daily;")
  forecast_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_forecast;")

  echo -e "${BLUE}ℹ${NC} Daily records: $daily_count"
  echo -e "${BLUE}ℹ${NC} Forecast records: $forecast_count"
fi

# Summary
echo -e "\n${BLUE}================================================================"
echo "   Summary"
echo -e "================================================================${NC}\n"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo -e "\nGovernance Trends & Forecasting v15.9.0 is fully operational.\n"
  exit 0
else
  echo -e "${RED}✗ $FAILED_TESTS test(s) failed${NC}"
  echo -e "\nPlease review the errors above and fix any issues.\n"
  exit 1
fi
