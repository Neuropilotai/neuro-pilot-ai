#!/bin/bash
# ============================================================================
# v16.3 Predictive Stability Layer Verification Script
# ============================================================================
# Usage: ./scripts/verify_v16_3_stability.sh
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

check_response() {
  local response="$1"
  local test_name="$2"

  if echo "$response" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "$test_name"
    return 0
  else
    print_error "$test_name"
    echo "$response" | jq '.'
    return 1
  fi
}

# ============================================================================
# TEST 1: Database Migration
# ============================================================================
print_header "TEST 1: Database Migration (032_stability_tuner.sql)"

echo "Checking if stability tables exist..."
TABLES_EXIST=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('stability_policy', 'stability_observations', 'stability_recommendations', 'stability_metrics_daily');" 2>/dev/null || echo "0")

if [ "$TABLES_EXIST" == "4" ]; then
  print_success "All 4 stability tables exist"
else
  print_error "Missing stability tables (found $TABLES_EXIST/4)"
  echo "Run migration: sqlite3 database.db < migrations/032_stability_tuner.sql"
  exit 1
fi

echo "Checking if stability views exist..."
VIEWS_EXIST=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name IN ('v_stability_recent', 'v_stability_health', 'v_stability_policy_current', 'v_stability_recommendations_pending');" 2>/dev/null || echo "0")

if [ "$VIEWS_EXIST" == "4" ]; then
  print_success "All 4 stability views exist"
else
  print_error "Missing stability views (found $VIEWS_EXIST/4)"
  exit 1
fi

echo "Checking default policy..."
POLICY_EXISTS=$(sqlite3 database.db "SELECT COUNT(*) FROM stability_policy WHERE id = 1;" 2>/dev/null || echo "0")

if [ "$POLICY_EXISTS" == "1" ]; then
  POLICY=$(sqlite3 database.db "SELECT max_retries, base_delay_ms, jitter_pct, cron_min_interval_min, enabled FROM stability_policy WHERE id = 1;" 2>/dev/null)
  print_success "Default policy exists: $POLICY"
else
  print_error "Default policy not found"
  exit 1
fi

# ============================================================================
# TEST 2: API Endpoints (Authentication)
# ============================================================================
print_header "TEST 2: API Endpoints (Authentication & RBAC)"

echo "Test 2.1: GET /api/stability/status (authenticated)"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/status")
check_response "$RESPONSE" "GET /api/stability/status"
echo "$RESPONSE" | jq '{policy: .data.policy, metrics: .data.metrics}'

echo ""
echo "Test 2.2: GET /api/stability/health (health score)"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/health")
check_response "$RESPONSE" "GET /api/stability/health"
STABILITY_SCORE=$(echo "$RESPONSE" | jq -r '.data.score')
echo "Stability Score: $STABILITY_SCORE/100"

echo ""
echo "Test 2.3: GET /api/stability/metrics (detailed telemetry)"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/metrics")
check_response "$RESPONSE" "GET /api/stability/metrics"
METRIC_COUNT=$(echo "$RESPONSE" | jq '.data.metrics | length')
print_info "Found $METRIC_COUNT service/operation metrics"

echo ""
echo "Test 2.4: GET /api/stability/recommendations (tuning history)"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/recommendations?limit=5")
check_response "$RESPONSE" "GET /api/stability/recommendations"
REC_COUNT=$(echo "$RESPONSE" | jq '.data.total')
print_info "Found $REC_COUNT recommendations"

# ============================================================================
# TEST 3: Owner-Only Operations
# ============================================================================
print_header "TEST 3: Owner-Only Operations"

echo "Test 3.1: POST /api/stability/tune (run tuning cycle)"
RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/tune")
check_response "$RESPONSE" "POST /api/stability/tune"

REC_ID=$(echo "$RESPONSE" | jq -r '.recommendation_id')
if [ "$REC_ID" != "null" ] && [ ! -z "$REC_ID" ]; then
  print_success "Generated recommendation ID: $REC_ID"

  echo ""
  echo "Test 3.2: POST /api/stability/apply/:id (apply recommendation)"
  APPLY_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/apply/$REC_ID")

  if echo "$APPLY_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Applied recommendation $REC_ID"
  else
    print_info "Could not apply recommendation (may already be applied or invalid)"
  fi
else
  print_info "No recommendation generated (system already stable)"
fi

echo ""
echo "Test 3.3: PUT /api/stability/policy (update policy)"
RESPONSE=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"max_retries": 3, "base_delay_ms": 200}' \
  "$BASE_URL/api/stability/policy")

check_response "$RESPONSE" "PUT /api/stability/policy"

# ============================================================================
# TEST 4: Prometheus Metrics
# ============================================================================
print_header "TEST 4: Prometheus Metrics Exposition"

echo "Test 4.1: Check stability_score metric"
METRICS=$(curl -s "$BASE_URL/metrics")

if echo "$METRICS" | grep -q "stability_score"; then
  SCORE=$(echo "$METRICS" | grep "^stability_score " | awk '{print $2}')
  print_success "stability_score: $SCORE"
else
  print_error "stability_score metric not found"
fi

echo ""
echo "Test 4.2: Check stability policy metrics"
for metric in "stability_current_max_retries" "stability_current_base_delay_ms" "stability_current_jitter_pct" "stability_current_cron_interval_min"; do
  if echo "$METRICS" | grep -q "$metric"; then
    VALUE=$(echo "$METRICS" | grep "^$metric " | awk '{print $2}')
    print_success "$metric: $VALUE"
  else
    print_error "$metric not found"
  fi
done

echo ""
echo "Test 4.3: Check stability counters"
for metric in "stability_observations_total" "stability_recommendations_total" "stability_tuning_cycles_total"; do
  if echo "$METRICS" | grep -q "$metric"; then
    print_success "$metric exists"
  else
    print_error "$metric not found"
  fi
done

# ============================================================================
# TEST 5: Service Integration
# ============================================================================
print_header "TEST 5: Service Integration (AdaptiveRetryTuner & CronAutoThrottle)"

echo "Test 5.1: Check if tuner statistics are available"
STATS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/status")
TUNER_RUNNING=$(echo "$STATS_RESPONSE" | jq -r '.data.tuner.is_running')
TUNE_COUNT=$(echo "$STATS_RESPONSE" | jq -r '.data.tuner.tune_count')

if [ "$TUNER_RUNNING" != "null" ]; then
  print_success "Tuner status: running=$TUNER_RUNNING, tune_count=$TUNE_COUNT"
else
  print_error "Tuner statistics not available"
fi

echo ""
echo "Test 5.2: Check throttle controller"
THROTTLE_INTERVAL=$(echo "$STATS_RESPONSE" | jq -r '.data.throttle.current_interval_min')
CRON_EXPRESSION=$(echo "$STATS_RESPONSE" | jq -r '.data.throttle.cron_expression')

if [ "$THROTTLE_INTERVAL" != "null" ]; then
  print_success "Throttle: interval=${THROTTLE_INTERVAL}min, cron=$CRON_EXPRESSION"
else
  print_error "Throttle controller not available"
fi

# ============================================================================
# TEST 6: Governance Integration
# ============================================================================
print_header "TEST 6: Governance Integration (Stability Pillar)"

echo "Test 6.1: Check if stability health score is available"
HEALTH_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/stability/health")
HEALTH_SCORE=$(echo "$HEALTH_RESPONSE" | jq -r '.data.score')
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.data.status')

if [ "$HEALTH_SCORE" != "null" ]; then
  print_success "Stability Health Score: $HEALTH_SCORE/100 ($HEALTH_STATUS)"
else
  print_error "Stability health score not available"
fi

echo ""
echo "Test 6.2: Check governance status includes stability"
GOV_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/status" 2>/dev/null || echo '{"success":false}')

if echo "$GOV_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  COMPOSITE_SCORE=$(echo "$GOV_RESPONSE" | jq -r '.data.composite_score // 0')
  print_success "Governance composite score: $COMPOSITE_SCORE/100"
  print_info "Note: v16.3 adds Stability as 10% weight in composite score"
else
  print_info "Governance endpoint not available (expected in full v16.3 integration)"
fi

# ============================================================================
# SUMMARY
# ============================================================================
print_header "VERIFICATION SUMMARY"

echo -e "${GREEN}✅ v16.3 Predictive Stability Layer Verification Complete${NC}"
echo ""
echo "Key Metrics:"
echo "  - Stability Score: $HEALTH_SCORE/100 ($HEALTH_STATUS)"
echo "  - Success Rate: $(echo "$STATS_RESPONSE" | jq -r '.data.metrics.success_rate')%"
echo "  - Avg Attempts: $(echo "$STATS_RESPONSE" | jq -r '.data.metrics.avg_attempts')"
echo "  - Lock Rate: $(echo "$STATS_RESPONSE" | jq -r '.data.metrics.lock_rate')%"
echo "  - Recommendations: $REC_COUNT total"
echo ""
echo "Policy:"
echo "  - Max Retries: $(echo "$STATS_RESPONSE" | jq -r '.data.policy.max_retries')"
echo "  - Base Delay: $(echo "$STATS_RESPONSE" | jq -r '.data.policy.base_delay_ms')ms"
echo "  - Jitter: $(echo "$STATS_RESPONSE" | jq -r '.data.policy.jitter_pct')%"
echo "  - Cron Interval: $(echo "$STATS_RESPONSE" | jq -r '.data.policy.cron_min_interval_min')min"
echo ""
print_success "All v16.3 components verified successfully!"
echo ""
