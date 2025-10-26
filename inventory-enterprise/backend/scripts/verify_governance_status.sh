#!/usr/bin/env bash
# =====================================================================
# Governance Status Verification Script (v15.8.0)
# =====================================================================
# Tests all governance API endpoints with authentication
# Usage: ./scripts/verify_governance_status.sh [TOKEN]

set -e

# Configuration
BASE_URL="http://localhost:8083"
TOKEN="${1:-$(cat .owner_token 2>/dev/null || echo '')}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if token provided
if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ ERROR: No token provided${NC}"
  echo "Usage: $0 [TOKEN]"
  echo "Or: Create .owner_token file with valid JWT"
  exit 1
fi

echo "======================================================================="
echo "🔐 NeuroPilot Quantum Governance Verification (v15.8.0)"
echo "======================================================================="
echo ""

# Test 1: GET /api/governance/status
echo -e "${YELLOW}Test 1: Governance Status (Authenticated)${NC}"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/status")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
  SCORE=$(echo "$RESPONSE" | jq -r '.governance_score')
  STATUS=$(echo "$RESPONSE" | jq -r '.status')
  echo -e "${GREEN}✅ Status Check: SUCCESS${NC}"
  echo "   Governance Score: $SCORE/100"
  echo "   Status: $STATUS"
else
  echo -e "${RED}❌ Status Check: FAILED${NC}"
fi
echo ""

# Test 2: GET /api/governance/report/latest
echo -e "${YELLOW}Test 2: Governance Report (Authenticated)${NC}"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/report/latest")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Report Check: SUCCESS${NC}"
  SNAPSHOT_ID=$(echo "$RESPONSE" | jq -r '.snapshot.id')
  echo "   Snapshot ID: $SNAPSHOT_ID"
else
  echo -e "${YELLOW}⚠️  Report Check: No snapshot found (run recompute first)${NC}"
fi
echo ""

# Test 3: POST /api/governance/recompute
echo -e "${YELLOW}Test 3: Governance Recompute (Owner Only)${NC}"
RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/governance/recompute")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
  SCORE=$(echo "$RESPONSE" | jq -r '.governance_score')
  echo -e "${GREEN}✅ Recompute: SUCCESS${NC}"
  echo "   New Governance Score: $SCORE/100"
else
  echo -e "${RED}❌ Recompute: FAILED${NC}"
fi
echo ""

# Test 4: Verify Prometheus Metrics
echo -e "${YELLOW}Test 4: Prometheus Metrics (governance_score_current)${NC}"
RESPONSE=$(curl -s "$BASE_URL/metrics" | grep "governance_score_current")
if [ -n "$RESPONSE" ]; then
  echo -e "${GREEN}✅ Metrics Check: SUCCESS${NC}"
  echo "$RESPONSE"
else
  echo -e "${RED}❌ Metrics Check: No governance metrics found${NC}"
fi
echo ""

# Summary
echo "======================================================================="
echo "✅ Governance Verification Complete"
echo "======================================================================="
echo ""
echo "Next Steps:"
echo "  1. Check governance status in Owner Console"
echo "  2. Monitor /metrics endpoint for governance_* metrics"
echo "  3. Review governance_snapshots table in database"
echo ""
