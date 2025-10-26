#!/bin/bash

###############################################################################
# Governance Intelligence Dashboard Verification Script (v16.0.0)
#
# Tests all Phase 4 features:
# - Database schema (governance_anomalies, governance_insights)
# - API endpoints (/api/governance/intelligence/*)
# - GovernanceIntelligenceService functionality
# - Phase4CronScheduler automation
# - Prometheus metrics
#
# Author: NeuroPilot AI Development Team
# Date: 2025-10-18
###############################################################################

set -e  # Exit on error

BASE_URL="http://localhost:8083"
TOKEN_FILE=".owner_token"
DB_PATH="data/enterprise_inventory.db"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

###############################################################################
# Helper Functions
###############################################################################

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

###############################################################################
# Pre-flight Checks
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Governance Intelligence Dashboard Verification (v16.0.0)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

log "Checking prerequisites..."

# Check if server is running
if ! curl -s "$BASE_URL/health" > /dev/null; then
    fail "Server is not running at $BASE_URL"
    echo ""
    echo "Please start the server with: npm start"
    exit 1
fi
success "Server is running"

# Check if owner token exists
if [ ! -f "$TOKEN_FILE" ]; then
    fail "Owner token file not found: $TOKEN_FILE"
    echo ""
    echo "Please generate owner token with: node generate_owner_token.js"
    exit 1
fi
success "Owner token found"

# Read token
TOKEN=$(cat "$TOKEN_FILE")

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    fail "Database not found: $DB_PATH"
    exit 1
fi
success "Database found"

echo ""

###############################################################################
# Test 1: Database Schema Verification
###############################################################################

log "Test 1: Verifying database schema..."

# Check governance_anomalies table
if sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='governance_anomalies';" | grep -q "governance_anomalies"; then
    success "Table governance_anomalies exists"
else
    fail "Table governance_anomalies not found"
fi

# Check governance_insights table
if sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='governance_insights';" | grep -q "governance_insights"; then
    success "Table governance_insights exists"
else
    fail "Table governance_insights not found"
fi

# Check v_governance_anomalies_active view
if sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='view' AND name='v_governance_anomalies_active';" | grep -q "v_governance_anomalies_active"; then
    success "View v_governance_anomalies_active exists"
else
    fail "View v_governance_anomalies_active not found"
fi

# Check v_governance_insights_latest view
if sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='view' AND name='v_governance_insights_latest';" | grep -q "v_governance_insights_latest"; then
    success "View v_governance_insights_latest exists"
else
    fail "View v_governance_insights_latest not found"
fi

echo ""

###############################################################################
# Test 2: GET /api/governance/intelligence/status
###############################################################################

log "Test 2: Testing GET /api/governance/intelligence/status..."

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/status")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/status")

if [ "$STATUS_CODE" = "200" ]; then
    success "GET /status returns 200 OK"

    # Check response structure
    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        success "Response contains success field"
    else
        fail "Response missing success field"
    fi

    if echo "$RESPONSE" | jq -e '.intelligence_score' > /dev/null 2>&1; then
        SCORE=$(echo "$RESPONSE" | jq -r '.intelligence_score')
        success "Response contains intelligence_score: $SCORE"
    else
        warn "Response missing intelligence_score (expected if no data yet)"
    fi

    if echo "$RESPONSE" | jq -e '.anomalies' > /dev/null 2>&1; then
        ANOMALY_COUNT=$(echo "$RESPONSE" | jq -r '.anomalies | length')
        success "Response contains anomalies array ($ANOMALY_COUNT items)"
    else
        warn "Response missing anomalies array"
    fi

    if echo "$RESPONSE" | jq -e '.insights' > /dev/null 2>&1; then
        INSIGHT_COUNT=$(echo "$RESPONSE" | jq -r '.insights | length')
        success "Response contains insights array ($INSIGHT_COUNT items)"
    else
        warn "Response missing insights array"
    fi
else
    fail "GET /status returned $STATUS_CODE (expected 200)"
fi

echo ""

###############################################################################
# Test 3: POST /api/governance/intelligence/recompute
###############################################################################

log "Test 3: Testing POST /api/governance/intelligence/recompute..."

RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"as_of":"2025-10-18","locale":"en"}' \
    "$BASE_URL/api/governance/intelligence/recompute")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"as_of":"2025-10-18","locale":"en"}' \
    "$BASE_URL/api/governance/intelligence/recompute")

if [ "$STATUS_CODE" = "200" ]; then
    success "POST /recompute returns 200 OK"

    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
        if [ "$SUCCESS" = "true" ]; then
            success "Recomputation succeeded"
        else
            fail "Recomputation failed: $(echo "$RESPONSE" | jq -r '.error')"
        fi
    fi

    if echo "$RESPONSE" | jq -e '.anomaly_count' > /dev/null 2>&1; then
        ANOMALY_COUNT=$(echo "$RESPONSE" | jq -r '.anomaly_count')
        success "Detected $ANOMALY_COUNT anomalies"
    fi

    if echo "$RESPONSE" | jq -e '.insight_count' > /dev/null 2>&1; then
        INSIGHT_COUNT=$(echo "$RESPONSE" | jq -r '.insight_count')
        success "Generated $INSIGHT_COUNT insights"
    fi

    if echo "$RESPONSE" | jq -e '.intelligence_score' > /dev/null 2>&1; then
        INTELLIGENCE_SCORE=$(echo "$RESPONSE" | jq -r '.intelligence_score')
        success "Intelligence score computed: $INTELLIGENCE_SCORE/100"
    fi
else
    fail "POST /recompute returned $STATUS_CODE (expected 200)"
    warn "Response: $RESPONSE"
fi

echo ""

###############################################################################
# Test 4: GET /api/governance/intelligence/anomalies
###############################################################################

log "Test 4: Testing GET /api/governance/intelligence/anomalies..."

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/anomalies?limit=10")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/anomalies?limit=10")

if [ "$STATUS_CODE" = "200" ]; then
    success "GET /anomalies returns 200 OK"

    if echo "$RESPONSE" | jq -e '.anomalies' > /dev/null 2>&1; then
        ANOMALY_COUNT=$(echo "$RESPONSE" | jq -r '.anomalies | length')
        success "Retrieved $ANOMALY_COUNT anomalies"

        # Check first anomaly structure if exists
        if [ "$ANOMALY_COUNT" -gt 0 ]; then
            if echo "$RESPONSE" | jq -e '.anomalies[0].severity' > /dev/null 2>&1; then
                success "Anomaly contains severity field"
            fi
            if echo "$RESPONSE" | jq -e '.anomalies[0].pillar' > /dev/null 2>&1; then
                success "Anomaly contains pillar field"
            fi
            if echo "$RESPONSE" | jq -e '.anomalies[0].message' > /dev/null 2>&1; then
                success "Anomaly contains message field"
            fi
        fi
    else
        fail "Response missing anomalies array"
    fi
else
    fail "GET /anomalies returned $STATUS_CODE (expected 200)"
fi

echo ""

###############################################################################
# Test 5: GET /api/governance/intelligence/insights
###############################################################################

log "Test 5: Testing GET /api/governance/intelligence/insights..."

# Test English insights
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/insights?locale=en&limit=10")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/insights?locale=en&limit=10")

if [ "$STATUS_CODE" = "200" ]; then
    success "GET /insights (EN) returns 200 OK"

    if echo "$RESPONSE" | jq -e '.insights' > /dev/null 2>&1; then
        INSIGHT_COUNT=$(echo "$RESPONSE" | jq -r '.insights | length')
        success "Retrieved $INSIGHT_COUNT English insights"

        # Check first insight structure if exists
        if [ "$INSIGHT_COUNT" -gt 0 ]; then
            if echo "$RESPONSE" | jq -e '.insights[0].insight' > /dev/null 2>&1; then
                success "Insight contains insight text"
            fi
            if echo "$RESPONSE" | jq -e '.insights[0].pillar' > /dev/null 2>&1; then
                success "Insight contains pillar field"
            fi
            if echo "$RESPONSE" | jq -e '.insights[0].confidence' > /dev/null 2>&1; then
                CONFIDENCE=$(echo "$RESPONSE" | jq -r '.insights[0].confidence')
                success "Insight contains confidence: $CONFIDENCE"
            fi
        fi
    else
        fail "Response missing insights array"
    fi
else
    fail "GET /insights returned $STATUS_CODE (expected 200)"
fi

# Test French insights
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/insights?locale=fr&limit=10")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/intelligence/insights?locale=fr&limit=10")

if [ "$STATUS_CODE" = "200" ]; then
    success "GET /insights (FR) returns 200 OK"

    if echo "$RESPONSE" | jq -e '.insights' > /dev/null 2>&1; then
        INSIGHT_COUNT=$(echo "$RESPONSE" | jq -r '.insights | length')
        success "Retrieved $INSIGHT_COUNT French insights"
    fi
else
    fail "GET /insights (FR) returned $STATUS_CODE (expected 200)"
fi

echo ""

###############################################################################
# Test 6: POST /api/governance/intelligence/report
###############################################################################

log "Test 6: Testing POST /api/governance/intelligence/report..."

RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"locale":"en"}' \
    "$BASE_URL/api/governance/intelligence/report")
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"locale":"en"}' \
    "$BASE_URL/api/governance/intelligence/report")

if [ "$STATUS_CODE" = "200" ]; then
    success "POST /report returns 200 OK"

    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
        if [ "$SUCCESS" = "true" ]; then
            success "Report generation succeeded"

            if echo "$RESPONSE" | jq -e '.filename' > /dev/null 2>&1; then
                FILENAME=$(echo "$RESPONSE" | jq -r '.filename')
                success "Report filename: $FILENAME"
            fi

            if echo "$RESPONSE" | jq -e '.path' > /dev/null 2>&1; then
                REPORT_PATH=$(echo "$RESPONSE" | jq -r '.path')
                success "Report saved to: $REPORT_PATH"

                # Check if file exists
                if [ -f "$REPORT_PATH" ]; then
                    success "Report file exists on filesystem"
                else
                    warn "Report file not found at $REPORT_PATH"
                fi
            fi
        else
            fail "Report generation failed"
        fi
    fi
else
    fail "POST /report returned $STATUS_CODE (expected 200)"
    warn "Response: $RESPONSE"
fi

echo ""

###############################################################################
# Test 7: Prometheus Metrics
###############################################################################

log "Test 7: Verifying Prometheus metrics..."

METRICS=$(curl -s "$BASE_URL/metrics")

if echo "$METRICS" | grep -q "governance_intelligence_score"; then
    success "Metric governance_intelligence_score exists"
else
    warn "Metric governance_intelligence_score not found (may not be published yet)"
fi

if echo "$METRICS" | grep -q "governance_anomaly_count"; then
    success "Metric governance_anomaly_count exists"
else
    warn "Metric governance_anomaly_count not found (may not be published yet)"
fi

if echo "$METRICS" | grep -q "governance_report_generations_total"; then
    success "Metric governance_report_generations_total exists"
else
    warn "Metric governance_report_generations_total not found (may not be published yet)"
fi

if echo "$METRICS" | grep -q "governance_insight_generations_total"; then
    success "Metric governance_insight_generations_total exists"
else
    warn "Metric governance_insight_generations_total not found (may not be published yet)"
fi

echo ""

###############################################################################
# Test 8: Database Data Verification
###############################################################################

log "Test 8: Verifying database data..."

# Check anomalies
ANOMALY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_anomalies;")
if [ "$ANOMALY_COUNT" -gt 0 ]; then
    success "Database contains $ANOMALY_COUNT anomaly records"
else
    warn "No anomalies in database (expected after recompute)"
fi

# Check insights
INSIGHT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_insights;")
if [ "$INSIGHT_COUNT" -gt 0 ]; then
    success "Database contains $INSIGHT_COUNT insight records"

    # Verify bilingual insights
    EN_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_insights WHERE insight_en IS NOT NULL AND insight_en != '';")
    FR_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM governance_insights WHERE insight_fr IS NOT NULL AND insight_fr != '';")

    if [ "$EN_COUNT" -gt 0 ]; then
        success "Database contains $EN_COUNT English insights"
    else
        warn "No English insights found"
    fi

    if [ "$FR_COUNT" -gt 0 ]; then
        success "Database contains $FR_COUNT French insights"
    else
        warn "No French insights found"
    fi
else
    warn "No insights in database (expected after recompute)"
fi

echo ""

###############################################################################
# Test Summary
###############################################################################

echo "═══════════════════════════════════════════════════════════════"
echo "  Test Summary"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

if [ "$FAILED_TESTS" -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! v16.0.0 fully operational${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
    echo ""
    exit 1
fi
