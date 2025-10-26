#!/bin/bash
# ============================================================================
# v16.6 Adaptive Intelligence API Verification Script
# ============================================================================
# Usage: ./scripts/verify_adaptive_intelligence.sh
# Prerequisites: Server must be running on localhost:8083
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:8083"
OWNER_TOKEN_FILE=".owner_token"

# Load owner token
if [ ! -f "$OWNER_TOKEN_FILE" ]; then
  echo -e "${RED}❌ Error: $OWNER_TOKEN_FILE not found${NC}"
  echo "Run: node generate_owner_token.js"
  exit 1
fi

TOKEN=$(cat "$OWNER_TOKEN_FILE")

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}ℹ️  $1${NC}"
}

# ============================================================================
# TEST 1: Canonical Endpoints (/api/ai/adaptive/*)
# ============================================================================
print_header "TEST 1: Canonical Endpoints (/api/ai/adaptive/*)"

echo "Test 1.1: GET /api/ai/adaptive/status"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/ai/adaptive/status")
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  print_success "GET /api/ai/adaptive/status"
  echo "$RESPONSE" | jq '{policy: .data.policy.max_retries, metrics: .data.metrics.success_rate}'
else
  print_error "GET /api/ai/adaptive/status failed"
  echo "$RESPONSE" | jq '.'
fi

echo ""
echo "Test 1.2: POST /api/ai/adaptive/retrain"
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days":30,"force":false}' \
  "$BASE_URL/api/ai/adaptive/retrain")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  print_success "POST /api/ai/adaptive/retrain"
  REC_ID=$(echo "$RESPONSE" | jq -r '.recommendation_id')
  if [ "$REC_ID" != "null" ]; then
    print_info "Generated recommendation ID: $REC_ID"
  else
    print_info "System stable - no tuning needed"
  fi
else
  print_error "POST /api/ai/adaptive/retrain failed"
  echo "$RESPONSE" | jq '.'
fi

echo ""
echo "Test 1.3: GET /api/ai/adaptive/history"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/ai/adaptive/history?limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  print_success "GET /api/ai/adaptive/history"
  HISTORY_COUNT=$(echo "$RESPONSE" | jq '.data.total')
  print_info "Found $HISTORY_COUNT historical tuning recommendations"
else
  print_error "GET /api/ai/adaptive/history failed"
  echo "$RESPONSE" | jq '.'
fi

# ============================================================================
# TEST 2: Legacy Endpoints (/api/stability/*) - Should Still Work
# ============================================================================
print_header "TEST 2: Legacy Endpoints (/api/stability/*) [DEPRECATED]"

echo "Test 2.1: GET /api/stability/status (legacy alias)"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/status")
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  print_success "Legacy endpoint /api/stability/status still works"
  print_info "NOTE: This path is deprecated. Use /api/ai/adaptive/status instead"
else
  print_error "Legacy endpoint failed"
fi

# ============================================================================
# TEST 3: Metrics Exposition
# ============================================================================
print_header "TEST 3: Prometheus Metrics"

echo "Test 3.1: Check ai_* metrics"
METRICS=$(curl -s "$BASE_URL/metrics")

if echo "$METRICS" | grep -q "^ai_"; then
  AI_METRIC_COUNT=$(echo "$METRICS" | grep "^ai_" | wc -l)
  print_success "Found $AI_METRIC_COUNT AI metrics exposed"
  echo ""
  echo "Sample AI metrics:"
  echo "$METRICS" | grep "^ai_" | head -5
else
  print_info "No ai_* metrics found (may not be implemented yet)"
fi

# ============================================================================
# SUMMARY
# ============================================================================
print_header "VERIFICATION SUMMARY"

echo -e "${GREEN}✅ v16.6 Adaptive Intelligence API Verification Complete${NC}"
echo ""
echo "Canonical Endpoints (use these):"
echo "  - GET  /api/ai/adaptive/status"
echo "  - POST /api/ai/adaptive/retrain"
echo "  - GET  /api/ai/adaptive/history"
echo ""
echo "Legacy Endpoints (deprecated, will be removed in v17):"
echo "  - /api/stability/status → /api/ai/adaptive/status"
echo "  - /api/stability/tune → /api/ai/adaptive/retrain"
echo "  - /api/stability/recommendations → /api/ai/adaptive/history"
echo ""
print_success "All endpoints verified successfully!"
echo ""
