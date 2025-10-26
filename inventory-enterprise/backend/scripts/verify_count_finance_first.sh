#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Verification Script: Count by Invoice (Finance-First) v15.6.0
# ═══════════════════════════════════════════════════════════════════════════
# Purpose: End-to-end test of finance-first count workflow
# Date: 2025-10-14
# Author: NeuroPilot AI Team
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

# Configuration
BASE_URL="${BASE_URL:-http://127.0.0.1:8083}"
API_BASE="${BASE_URL}/api/owner/counts"
TOKEN="${TOKEN:-}"
TENANT_ID="${TENANT_ID:-default}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# ═══════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════════

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

make_request() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -z "$TOKEN" ]; then
        log_error "TOKEN not set. Please export TOKEN with valid JWT token."
        exit 1
    fi

    if [ "$method" = "POST" ]; then
        curl -s -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$endpoint"
    else
        curl -s -X GET \
            -H "Authorization: Bearer $TOKEN" \
            "$endpoint"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════
# Pre-Flight Checks
# ═══════════════════════════════════════════════════════════════════════════

log_info "═══════════════════════════════════════════════════════════════════"
log_info "  COUNT BY INVOICE VERIFICATION v15.6.0"
log_info "═══════════════════════════════════════════════════════════════════"
echo ""

log_info "Configuration:"
log_info "  Base URL: $BASE_URL"
log_info "  Tenant ID: $TENANT_ID"
log_info "  Token: ${TOKEN:0:20}..."
echo ""

log_info "Checking server availability..."
if curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    log_success "Server is running"
else
    log_error "Server is not responding at $BASE_URL"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 1: Start Count Session (from_last mode)
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 1: Start Count Session (from_last mode)"
log_info "───────────────────────────────────────────────────────────────────"

PERIOD_MONTH=$(date +%-m)
PERIOD_YEAR=$(date +%Y)

START_DATA=$(cat <<EOF
{
  "mode": "from_last",
  "period_month": $PERIOD_MONTH,
  "period_year": $PERIOD_YEAR,
  "location_id": "MAIN",
  "gst_rate": 0.05,
  "qst_rate": 0.09975,
  "notes": "Verification test run"
}
EOF
)

START_RESPONSE=$(make_request POST "$API_BASE/start" "$START_DATA")
COUNT_ID=$(echo "$START_RESPONSE" | grep -o '"count_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$COUNT_ID" ]; then
    log_error "Failed to create count session"
    echo "$START_RESPONSE"
    exit 1
fi

log_success "Created count session: $COUNT_ID"

# ═══════════════════════════════════════════════════════════════════════════
# Test 2: Get Count Session Details
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 2: Get Count Session Details"
log_info "───────────────────────────────────────────────────────────────────"

DETAILS_RESPONSE=$(make_request GET "$API_BASE/$COUNT_ID" "")
SESSION_STATUS=$(echo "$DETAILS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)

if [ "$SESSION_STATUS" = "OPEN" ]; then
    log_success "Count session status is OPEN"
else
    log_error "Expected status OPEN, got: $SESSION_STATUS"
fi

LINE_COUNT=$(echo "$DETAILS_RESPONSE" | grep -o '"lines":\[' | wc -l)
log_info "Count has $LINE_COUNT lines (from baseline)"

# ═══════════════════════════════════════════════════════════════════════════
# Test 3: Add/Update Count Lines
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 3: Add/Update Count Lines"
log_info "───────────────────────────────────────────────────────────────────"

# Add 5 test lines
TEST_ITEMS=(
  '{"item_code":"TEST-BEEF-001","item_desc":"Ground Beef","finance_code":"MEAT","counted_qty":50,"counted_uom":"LB","unit_cost_cents":599}'
  '{"item_code":"TEST-MILK-001","item_desc":"Whole Milk","finance_code":"MILK","counted_qty":24,"counted_uom":"GAL","unit_cost_cents":499}'
  '{"item_code":"TEST-PROD-001","item_desc":"Lettuce","finance_code":"PROD","counted_qty":12,"counted_uom":"HEAD","unit_cost_cents":299}'
  '{"item_code":"TEST-BAKE-001","item_desc":"Flour","finance_code":"BAKE","counted_qty":100,"counted_uom":"LB","unit_cost_cents":89}'
  '{"item_code":"TEST-BEV-001","item_desc":"Coffee Beans","finance_code":"BEV+ECO","counted_qty":10,"counted_uom":"LB","unit_cost_cents":1299}'
)

LINES_ADDED=0
for item_data in "${TEST_ITEMS[@]}"; do
    LINE_RESPONSE=$(make_request POST "$API_BASE/$COUNT_ID/line" "$item_data")
    if echo "$LINE_RESPONSE" | grep -q '"success":true'; then
        LINES_ADDED=$((LINES_ADDED + 1))
    fi
done

if [ $LINES_ADDED -eq 5 ]; then
    log_success "Added/updated 5 count lines"
else
    log_error "Expected 5 lines added, got: $LINES_ADDED"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 4: Get Variances Report
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 4: Get Variances Report"
log_info "───────────────────────────────────────────────────────────────────"

VARIANCES_RESPONSE=$(make_request GET "$API_BASE/$COUNT_ID/variances" "")
if echo "$VARIANCES_RESPONSE" | grep -q '"success":true'; then
    log_success "Retrieved variances report"
    FINANCE_CODES=$(echo "$VARIANCES_RESPONSE" | grep -o '"finance_code":"[^"]*"' | wc -l)
    log_info "Report includes $FINANCE_CODES finance codes"
else
    log_error "Failed to retrieve variances report"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 5: Submit Count (OPEN → SUBMITTED)
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 5: Submit Count (OPEN → SUBMITTED)"
log_info "───────────────────────────────────────────────────────────────────"

SUBMIT_RESPONSE=$(make_request POST "$API_BASE/$COUNT_ID/submit" "{}")
if echo "$SUBMIT_RESPONSE" | grep -q '"success":true'; then
    log_success "Count submitted for approval"

    # Check for warnings
    if echo "$SUBMIT_RESPONSE" | grep -q '"warnings"'; then
        log_warning "Submission includes validation warnings"
    fi
else
    log_error "Failed to submit count"
    echo "$SUBMIT_RESPONSE"
fi

# Verify status changed
DETAILS_RESPONSE=$(make_request GET "$API_BASE/$COUNT_ID" "")
SESSION_STATUS=$(echo "$DETAILS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
if [ "$SESSION_STATUS" = "SUBMITTED" ]; then
    log_success "Status changed to SUBMITTED"
else
    log_error "Expected status SUBMITTED, got: $SESSION_STATUS"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 6: Approve Count (SUBMITTED → APPROVED)
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 6: Approve Count (SUBMITTED → APPROVED)"
log_info "───────────────────────────────────────────────────────────────────"

log_warning "Note: Dual-control check may prevent approval by same user"

APPROVE_RESPONSE=$(make_request POST "$API_BASE/$COUNT_ID/approve" "{}")
if echo "$APPROVE_RESPONSE" | grep -q '"success":true'; then
    log_success "Count approved"

    # Check if finance summary was computed
    if echo "$APPROVE_RESPONSE" | grep -q '"finance_summary"'; then
        log_success "Finance summary computed"
    fi
else
    if echo "$APPROVE_RESPONSE" | grep -q "dual-control"; then
        log_warning "Dual-control prevented approval (expected behavior)"
        log_info "Skipping approve and lock tests (dual-control enforced)"
        SKIP_APPROVE_LOCK=1
    else
        log_error "Failed to approve count"
        echo "$APPROVE_RESPONSE"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 7: Lock Count (APPROVED → LOCKED)
# ═══════════════════════════════════════════════════════════════════════════

if [ -z "$SKIP_APPROVE_LOCK" ]; then
    log_info "───────────────────────────────────────────────────────────────────"
    log_info "Test 7: Lock Count (APPROVED → LOCKED)"
    log_info "───────────────────────────────────────────────────────────────────"

    LOCK_RESPONSE=$(make_request POST "$API_BASE/$COUNT_ID/lock" "{}")
    if echo "$LOCK_RESPONSE" | grep -q '"success":true'; then
        log_success "Count locked (final, immutable)"
    else
        log_error "Failed to lock count"
        echo "$LOCK_RESPONSE"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 8: Generate Reports
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 8: Generate Reports"
log_info "───────────────────────────────────────────────────────────────────"

# Test JSON report
JSON_REPORT=$(make_request GET "$API_BASE/$COUNT_ID/report/json" "")
if echo "$JSON_REPORT" | grep -q '"success":true'; then
    log_success "Generated JSON report"
else
    log_error "Failed to generate JSON report"
fi

# Test CSV export
CSV_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/$COUNT_ID/report/csv")
if echo "$CSV_REPORT" | grep -q "Count Session Report"; then
    log_success "Generated CSV export"
    CSV_FILE="/tmp/count_${COUNT_ID}.csv"
    echo "$CSV_REPORT" > "$CSV_FILE"
    log_info "CSV saved to: $CSV_FILE"
else
    log_error "Failed to generate CSV export"
fi

# Test text report
TEXT_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/$COUNT_ID/report/text")
if echo "$TEXT_REPORT" | grep -q "COUNT SESSION REPORT"; then
    log_success "Generated text report"
    TEXT_FILE="/tmp/count_${COUNT_ID}.txt"
    echo "$TEXT_REPORT" > "$TEXT_FILE"
    log_info "Text report saved to: $TEXT_FILE"
else
    log_error "Failed to generate text report"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 9: Needs Mapping View
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 9: Needs Mapping View"
log_info "───────────────────────────────────────────────────────────────────"

MAPPINGS_RESPONSE=$(make_request GET "$API_BASE/needs-mapping" "")
if echo "$MAPPINGS_RESPONSE" | grep -q '"success":true'; then
    log_success "Retrieved needs-mapping view"
    MAPPING_COUNT=$(echo "$MAPPINGS_RESPONSE" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
    log_info "Found $MAPPING_COUNT mappings needing review"
else
    log_error "Failed to retrieve needs-mapping view"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Test 10: Database Schema Verification
# ═══════════════════════════════════════════════════════════════════════════

log_info "───────────────────────────────────────────────────────────────────"
log_info "Test 10: Database Schema Verification"
log_info "───────────────────────────────────────────────────────────────────"

DB_PATH="${DB_PATH:-./data/enterprise_inventory.db}"

if [ -f "$DB_PATH" ]; then
    TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'count_%' ORDER BY name")
    TABLE_COUNT=$(echo "$TABLES" | wc -l)

    if [ $TABLE_COUNT -ge 4 ]; then
        log_success "Found $TABLE_COUNT count-related tables"
        log_info "Tables: $(echo $TABLES | tr '\n' ', ')"
    else
        log_error "Expected at least 4 count tables, found: $TABLE_COUNT"
    fi

    # Check views
    VIEWS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='view' AND (name = 'v_finance_count_summary' OR name = 'v_needs_mapping')")
    VIEW_COUNT=$(echo "$VIEWS" | wc -l)

    if [ $VIEW_COUNT -ge 2 ]; then
        log_success "Found required views: v_finance_count_summary, v_needs_mapping"
    else
        log_error "Missing required views"
    fi
else
    log_warning "Database file not found at $DB_PATH, skipping schema checks"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════

echo ""
log_info "═══════════════════════════════════════════════════════════════════"
log_info "  VERIFICATION SUMMARY"
log_info "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    log_success "All tests passed! ($TESTS_PASSED/$TESTS_PASSED)"
    echo ""
    log_info "Count ID: $COUNT_ID"
    log_info "Reports saved:"
    log_info "  - CSV: /tmp/count_${COUNT_ID}.csv"
    log_info "  - Text: /tmp/count_${COUNT_ID}.txt"
    echo ""
    exit 0
else
    log_error "Some tests failed ($TESTS_PASSED passed, $TESTS_FAILED failed)"
    echo ""
    exit 1
fi
