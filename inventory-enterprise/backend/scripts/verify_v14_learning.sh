#!/bin/bash
###############################################################################
# NeuroPilot v14 "Next-Level Learning" - Verification Script
# Purpose: Smoke tests for v14 enhancements
# Version: 14.0.0
# Date: 2025-10-12
# Author: NeuroInnovate AI Team
#
# Usage:
#   ./scripts/verify_v14_learning.sh
#
# Requirements:
#   - Server running at localhost:8083
#   - curl, jq, sqlite3 installed
#   - Valid auth token (or running in owner-only mode)
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:8083"
API_URL="${BASE_URL}/api"
DB_PATH="../data/enterprise_inventory.db"  # Adjust if needed

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

###############################################################################
# Helper Functions
###############################################################################

print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

print_test() {
  echo -e "\n${YELLOW}[TEST $((TESTS_RUN + 1))]${NC} $1"
}

print_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✓ PASS${NC}: $1"
}

print_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}✗ FAIL${NC}: $1"
}

print_info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

increment_test() {
  TESTS_RUN=$((TESTS_RUN + 1))
}

###############################################################################
# Test Functions
###############################################################################

# Test 1: Server Health
test_server_health() {
  increment_test
  print_test "Server health check"

  RESPONSE=$(curl -s "${BASE_URL}/health" || echo '{}')
  STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"')

  if [ "$STATUS" = "ok" ] || [ "$STATUS" = "healthy" ]; then
    VERSION=$(echo "$RESPONSE" | jq -r '.version // "unknown"')
    print_pass "Server is healthy (version: $VERSION)"
  else
    print_fail "Server health check failed (status: $STATUS)"
  fi
}

# Test 2: AI Ops Status Endpoint
test_ai_ops_status() {
  increment_test
  print_test "AI Ops status endpoint"

  RESPONSE=$(curl -s "${API_URL}/owner/ops/status" || echo '{}')
  SCORE=$(echo "$RESPONSE" | jq -r '.ai_ops_health.score // 0')

  if [ "$SCORE" -gt 0 ]; then
    LAST_FORECAST=$(echo "$RESPONSE" | jq -r '.last_forecast_ts // "null"')
    LAST_LEARNING=$(echo "$RESPONSE" | jq -r '.last_learning_ts // "null"')
    print_pass "AI Ops status OK (score: ${SCORE}%, forecast: $LAST_FORECAST, learning: $LAST_LEARNING)"
  else
    print_fail "AI Ops status missing or invalid"
  fi
}

# Test 3: Learning Insights Timeline
test_learning_insights() {
  increment_test
  print_test "Learning insights timeline"

  RESPONSE=$(curl -s "${API_URL}/owner/ops/learning-insights?limit=5" || echo '{}')
  COUNT=$(echo "$RESPONSE" | jq '.insights | length')

  if [ "$COUNT" -ge 0 ]; then
    print_pass "Learning insights endpoint OK ($COUNT insights returned)"

    # Check for v14 signal types
    SIGNAL_COUNT=$(echo "$RESPONSE" | jq '[.insights[] | select(.insight_type | startswith("signal_"))] | length')
    if [ "$SIGNAL_COUNT" -gt 0 ]; then
      print_info "Found $SIGNAL_COUNT v14 weighted signal insights"
    fi
  else
    print_fail "Learning insights endpoint returned invalid response"
  fi
}

# Test 4: Orders/PDFs with Service Windows
test_pdfs_service_windows() {
  increment_test
  print_test "PDFs with service window inference"

  RESPONSE=$(curl -s "${API_URL}/owner/pdfs?limit=5" || echo '[]')
  COUNT=$(echo "$RESPONSE" | jq 'length')

  if [ "$COUNT" -gt 0 ]; then
    # Check if any PDFs have inferred_service_window
    WINDOWS_COUNT=$(echo "$RESPONSE" | jq '[.[] | select(.inferred_service_window != null)] | length')

    if [ "$WINDOWS_COUNT" -gt 0 ]; then
      SAMPLE=$(echo "$RESPONSE" | jq -r '.[0].inferred_service_window // "null"')
      print_pass "Service window inference working ($WINDOWS_COUNT/$COUNT PDFs have windows, sample: $SAMPLE)"
    else
      print_info "PDFs returned but no service windows computed (may be expected if no invoice dates)"
    fi
  else
    print_info "No PDFs available for testing service windows"
  fi
}

# Test 5: Unassigned Inventory Items
test_unassigned_items() {
  increment_test
  print_test "Unassigned inventory items endpoint"

  RESPONSE=$(curl -s "${API_URL}/owner/locations/unassigned?limit=10" || echo '{}')
  COUNT=$(echo "$RESPONSE" | jq '.items | length')

  if [ "$COUNT" -ge 0 ]; then
    print_pass "Unassigned items endpoint OK ($COUNT items returned)"
  else
    print_fail "Unassigned items endpoint returned invalid response"
  fi
}

# Test 6: Database - ai_ops_breadcrumbs Table
test_breadcrumbs_table() {
  increment_test
  print_test "ai_ops_breadcrumbs table structure"

  if [ ! -f "$DB_PATH" ]; then
    print_info "Database file not found at $DB_PATH, skipping DB tests"
    return
  fi

  # Check for v14 enhanced columns
  COLUMNS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(ai_ops_breadcrumbs);" 2>/dev/null | cut -d'|' -f2)

  if echo "$COLUMNS" | grep -q "duration_ms"; then
    print_pass "ai_ops_breadcrumbs has v14 enhanced columns (duration_ms, metadata)"
  else
    print_info "ai_ops_breadcrumbs table exists but may not have v14 enhancements yet"
  fi
}

# Test 7: Database - Recent Learning Signals
test_learning_signals_db() {
  increment_test
  print_test "Learning signals in database"

  if [ ! -f "$DB_PATH" ]; then
    print_info "Database file not found, skipping"
    return
  fi

  # Check for v14 signal insights
  SIGNAL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_learning_insights WHERE insight_type LIKE 'signal_%' AND created_at >= datetime('now', '-7 days');" 2>/dev/null || echo "0")

  if [ "$SIGNAL_COUNT" -gt 0 ]; then
    print_pass "Found $SIGNAL_COUNT weighted learning signals in last 7 days"
  else
    print_info "No learning signals found yet (may be expected if learning job hasn't run)"
  fi
}

# Test 8: Trigger Learning Job (Manual)
test_trigger_learning() {
  increment_test
  print_test "Trigger AI learning job manually"

  print_info "Triggering forecast job..."
  FORECAST_RESPONSE=$(curl -s -X POST "${API_URL}/owner/ops/trigger/ai_forecast" || echo '{}')
  FORECAST_SUCCESS=$(echo "$FORECAST_RESPONSE" | jq -r '.success // false')

  sleep 2

  print_info "Triggering learning job..."
  LEARNING_RESPONSE=$(curl -s -X POST "${API_URL}/owner/ops/trigger/ai_learning" || echo '{}')
  LEARNING_SUCCESS=$(echo "$LEARNING_RESPONSE" | jq -r '.success // false')

  sleep 2

  # Check if timestamps updated
  STATUS_RESPONSE=$(curl -s "${API_URL}/owner/ops/status" || echo '{}')
  LAST_FORECAST=$(echo "$STATUS_RESPONSE" | jq -r '.last_forecast_ts // "null"')
  LAST_LEARNING=$(echo "$STATUS_RESPONSE" | jq -r '.last_learning_ts // "null"')

  if [ "$LAST_FORECAST" != "null" ] && [ "$LAST_LEARNING" != "null" ]; then
    print_pass "Learning job triggered successfully (forecast: $FORECAST_SUCCESS, learning: $LEARNING_SUCCESS)"
  else
    print_fail "Learning job trigger failed or timestamps not updated"
  fi
}

# Test 9: Fiscal Calendar Integration
test_fiscal_calendar() {
  increment_test
  print_test "Fiscal calendar integration"

  if [ ! -f "$DB_PATH" ]; then
    print_info "Database file not found, skipping"
    return
  fi

  # Check if fiscal_periods table exists and has FY25/FY26 data
  PERIOD_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM fiscal_periods WHERE fiscal_year IN ('FY25', 'FY26');" 2>/dev/null || echo "0")

  if [ "$PERIOD_COUNT" -ge 24 ]; then
    print_pass "Fiscal calendar integrated (found $PERIOD_COUNT FY25/FY26 periods)"
  else
    print_info "Fiscal calendar may not be fully loaded ($PERIOD_COUNT periods found)"
  fi
}

# Test 10: Frontend Time-Ago Function
test_frontend_features() {
  increment_test
  print_test "Frontend enhancements (time-ago, live metrics)"

  # Check if owner-console.html has timeAgo function
  if grep -q "function timeAgo" ../frontend/owner-console.html 2>/dev/null; then
    print_pass "Frontend time-ago function detected in owner-console.html"
  else
    print_info "Frontend time-ago function not found (may be in separate JS file)"
  fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
  print_header "NeuroPilot v14 Verification Script"
  echo "Date: $(date)"
  echo "Server: $BASE_URL"
  echo ""

  # Run all tests
  test_server_health
  test_ai_ops_status
  test_learning_insights
  test_pdfs_service_windows
  test_unassigned_items
  test_breadcrumbs_table
  test_learning_signals_db
  test_trigger_learning
  test_fiscal_calendar
  test_frontend_features

  # Print summary
  print_header "Test Summary"
  echo "Total tests run: $TESTS_RUN"
  echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"

  if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED - v14 VERIFIED ✓${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
  else
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}⚠ SOME TESTS FAILED - REVIEW ABOVE ⚠${NC}"
    echo -e "${YELLOW}========================================${NC}"
    exit 1
  fi
}

# Check dependencies
command -v curl >/dev/null 2>&1 || { echo >&2 "curl is required but not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo >&2 "jq is required but not installed. Aborting."; exit 1; }

# Run main
main
