#!/bin/bash
#
# smoke_test_finance_enforcement.sh
# Minimal E2E smoke test for NeuroPilot v16.2.0 Finance Enforcement
#
# Usage:
#   TOKEN=your_token ./smoke_test_finance_enforcement.sh
#   OR (if .owner_token exists):
#   ./smoke_test_finance_enforcement.sh

set -e

BASE_URL="http://localhost:8083"
TOKEN="${TOKEN:-$(cat .owner_token 2>/dev/null || echo '')}"
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $2"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ FAIL${NC}: $2"
    FAILED=$((FAILED + 1))
  fi
}

# Check TOKEN
if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR: TOKEN not set and .owner_token not found${NC}"
  exit 1
fi

echo "🧪 NeuroPilot v16.2.0 Finance Enforcement Smoke Tests"
echo "======================================================"

# Test 1: GET /api/finance/item-bank/statistics
echo ""
echo "Test 1: Item Bank Statistics"
RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/item-bank/statistics")
if echo "$RESP" | jq -e '.statistics.total' >/dev/null 2>&1; then
  TOTAL=$(echo "$RESP" | jq -r '.statistics.total')
  echo "  Total items: $TOTAL"
  test_result 0 "GET /api/finance/item-bank/statistics"
else
  echo "  Response: $RESP"
  test_result 1 "GET /api/finance/item-bank/statistics"
fi

# Test 2: POST /api/finance/item-bank (create item) + GET by id
echo ""
echo "Test 2: Create Item + Retrieve"
TEST_ITEM="TEST-SMOKE-$$"
CREATE_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"gfs_item_no\": \"$TEST_ITEM\",
    \"description\": \"Smoke Test Item\",
    \"pack_size\": \"1EA\",
    \"uom\": \"EA\",
    \"finance_code\": \"OTHER\",
    \"taxable_gst\": 1,
    \"taxable_qst\": 1
  }" \
  "${BASE_URL}/api/finance/item-bank")

if echo "$CREATE_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  # Now GET by id
  GET_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/item-bank/${TEST_ITEM}")
  if echo "$GET_RESP" | jq -e '.item.gfs_item_no' | grep -q "$TEST_ITEM"; then
    echo "  Created and retrieved: $TEST_ITEM"
    test_result 0 "POST + GET /api/finance/item-bank"
  else
    echo "  GET failed: $GET_RESP"
    test_result 1 "POST + GET /api/finance/item-bank (GET failed)"
  fi
else
  echo "  POST failed: $CREATE_RESP"
  test_result 1 "POST + GET /api/finance/item-bank (POST failed)"
fi

# Test 3: POST /api/finance/enforcement/rules (keyword rule)
echo ""
echo "Test 3: Create Mapping Rule (KEYWORD: romaine)"
RULE_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "KEYWORD",
    "match_pattern": "romaine",
    "finance_code": "PROD",
    "priority": 750,
    "confidence": 0.90,
    "source": "SMOKE_TEST",
    "active": 1
  }' \
  "${BASE_URL}/api/finance/enforcement/rules")

if echo "$RULE_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  RULE_ID=$(echo "$RULE_RESP" | jq -r '.rule.id')
  echo "  Created rule ID: $RULE_ID"
  test_result 0 "POST /api/finance/enforcement/rules"
else
  echo "  Response: $RULE_RESP"
  test_result 1 "POST /api/finance/enforcement/rules"
fi

# Test 4: GET /api/finance/enforcement/needs-mapping (baseline count)
echo ""
echo "Test 4: Needs Mapping Queue (Baseline)"
NEEDS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/enforcement/needs-mapping?limit=100")
if echo "$NEEDS_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  N0=$(echo "$NEEDS_RESP" | jq -r '.total')
  echo "  Baseline count: $N0"
  test_result 0 "GET /api/finance/enforcement/needs-mapping"
else
  echo "  Response: $NEEDS_RESP"
  test_result 1 "GET /api/finance/enforcement/needs-mapping"
  N0=0
fi

# Test 5: POST /api/finance/enforcement/bulk/remap (last 30 days)
echo ""
echo "Test 5: Bulk Remap (Last 30 Days)"
START_DATE=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

REMAP_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"start_date\": \"$START_DATE\", \"end_date\": \"$END_DATE\"}" \
  "${BASE_URL}/api/finance/enforcement/bulk/remap")

if echo "$REMAP_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  REMAPPED=$(echo "$REMAP_RESP" | jq -r '.remapped')
  UPDATED=$(echo "$REMAP_RESP" | jq -r '.updated')
  echo "  Remapped: $REMAPPED invoices, $UPDATED lines"
  test_result 0 "POST /api/finance/enforcement/bulk/remap"
else
  echo "  Response: $REMAP_RESP"
  # May fail if no invoices - that's OK for smoke test
  if echo "$REMAP_RESP" | jq -e '.error' | grep -q "No invoices found"; then
    echo "  (No invoices in period - acceptable)"
    test_result 0 "POST /api/finance/enforcement/bulk/remap (no data)"
  else
    test_result 1 "POST /api/finance/enforcement/bulk/remap"
  fi
fi

# Test 6: GET needs-mapping again (should be ≤ N0)
echo ""
echo "Test 6: Needs Mapping Queue (After Remap)"
NEEDS_RESP2=$(curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/enforcement/needs-mapping?limit=100")
if echo "$NEEDS_RESP2" | jq -e '.success == true' >/dev/null 2>&1; then
  N1=$(echo "$NEEDS_RESP2" | jq -r '.total')
  echo "  After remap count: $N1 (was: $N0)"

  if [ "$N1" -le "$N0" ]; then
    echo "  Count improved or stayed same ✓"
    test_result 0 "GET needs-mapping (count ≤ baseline)"
  else
    echo "  Count increased (unexpected)"
    test_result 1 "GET needs-mapping (count > baseline)"
  fi
else
  echo "  Response: $NEEDS_RESP2"
  test_result 1 "GET needs-mapping (after remap)"
fi

# Test 7: POST /api/finance/enforcement/period/summary (current month)
echo ""
echo "Test 7: Period Summary (Current Month)"
CURRENT_MONTH=$(date +%Y-%m)
CURRENT_START="${CURRENT_MONTH}-01"
CURRENT_END=$(date +%Y-%m-%d)

SUMMARY_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"period\": \"$CURRENT_MONTH\", \"start_date\": \"$CURRENT_START\", \"end_date\": \"$CURRENT_END\"}" \
  "${BASE_URL}/api/finance/enforcement/period/summary")

if echo "$SUMMARY_RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  # Check integer-cent fields
  TOTAL_CENTS=$(echo "$SUMMARY_RESP" | jq -r '.summary.total_cents')
  GST_CENTS=$(echo "$SUMMARY_RESP" | jq -r '.summary.gst_cents // 0')
  QST_CENTS=$(echo "$SUMMARY_RESP" | jq -r '.summary.qst_cents // 0')

  echo "  Total: ${TOTAL_CENTS}¢"
  echo "  GST: ${GST_CENTS}¢"
  echo "  QST: ${QST_CENTS}¢"

  # Verify all are integers (no decimal points)
  if [[ "$TOTAL_CENTS" =~ ^[0-9]+$ ]] && [[ "$GST_CENTS" =~ ^[0-9]+$ ]] && [[ "$QST_CENTS" =~ ^[0-9]+$ ]]; then
    echo "  Integer-cent validation ✓"

    # Check GST/QST are present (even if zero)
    if [ -n "$GST_CENTS" ] && [ -n "$QST_CENTS" ]; then
      test_result 0 "POST period/summary (integer-cent + GST/QST)"
    else
      test_result 1 "POST period/summary (missing GST/QST)"
    fi
  else
    echo "  Non-integer values detected!"
    test_result 1 "POST period/summary (floating point detected)"
  fi
elif echo "$SUMMARY_RESP" | jq -e '.error' | grep -q "No invoices found"; then
  echo "  No invoices in current month (acceptable for smoke test)"
  test_result 0 "POST period/summary (no data)"
else
  echo "  Response: $SUMMARY_RESP"
  test_result 1 "POST period/summary"
fi

# Cleanup
echo ""
echo "🧹 Cleanup"
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/item-bank/${TEST_ITEM}" >/dev/null
if [ -n "$RULE_ID" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/finance/enforcement/rules/${RULE_ID}" >/dev/null
fi
echo "  Test data cleaned"

# Summary
echo ""
echo "======================================================"
echo "📊 SMOKE TEST RESULTS"
echo "======================================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAILED test(s) failed${NC}"
  exit 1
fi
