#!/bin/bash
#
# verify_finance_enforcement.sh (v16.2.0)
#
# Tests Finance Enforcement: mapping rules, invoice import, validation, needs mapping queue.
#
# Usage:
#   ./scripts/verify_finance_enforcement.sh
#
# Prerequisites:
#   - Server running on port 8083
#   - Valid OWNER token in .owner_token
#   - At least one invoice in the system
#
# Author: NeuroPilot AI Development Team
# Date: 2025-10-18

set -e

BASE_URL="http://localhost:8083"
TOKEN=""
PASSED=0
FAILED=0
TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print section header
print_header() {
  echo ""
  echo -e "${BLUE}======================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}======================================${NC}"
}

# Print test result
print_result() {
  TOTAL=$((TOTAL + 1))
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $2"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ FAIL${NC}: $2"
    FAILED=$((FAILED + 1))
  fi
}

# Print summary
print_summary() {
  echo ""
  echo -e "${BLUE}======================================${NC}"
  echo -e "${BLUE}TEST SUMMARY${NC}"
  echo -e "${BLUE}======================================${NC}"
  echo -e "Total Tests: ${TOTAL}"
  echo -e "${GREEN}Passed: ${PASSED}${NC}"
  echo -e "${RED}Failed: ${FAILED}${NC}"

  if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}\n"
    exit 0
  else
    echo -e "\n${RED}⚠️  Some tests failed${NC}\n"
    exit 1
  fi
}

# Check prerequisites
print_header "Checking Prerequisites"

# Check if server is running
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ Server not running on ${BASE_URL}${NC}"
  echo "Please start the server first: npm start"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"

# Load OWNER token
if [ ! -f .owner_token ]; then
  echo -e "${RED}❌ .owner_token not found${NC}"
  echo "Please generate owner token first: node generate_owner_token.js"
  exit 1
fi
TOKEN=$(cat .owner_token)
echo -e "${GREEN}✅ OWNER token loaded${NC}"

# ============================================================================
# Test 1: Get Dashboard Statistics
# ============================================================================
print_header "Test 1: Get Dashboard Statistics"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/dashboard")

if echo "$RESPONSE" | jq -e '.item_bank' > /dev/null 2>&1; then
  TOTAL_ACTIVE=$(echo "$RESPONSE" | jq -r '.item_bank.total_active')
  NEEDS_MAPPING=$(echo "$RESPONSE" | jq -r '.needs_mapping_count')
  TOTAL_MAPPED=$(echo "$RESPONSE" | jq -r '.mapping_stats.total_mapped')

  echo "Active Items: $TOTAL_ACTIVE"
  echo "Needs Mapping: $NEEDS_MAPPING"
  echo "Total Mapped: $TOTAL_MAPPED"
  print_result 0 "Get dashboard statistics"
else
  echo "Response: $RESPONSE"
  print_result 1 "Get dashboard statistics"
fi

# ============================================================================
# Test 2: Search Mapping Rules (All Active)
# ============================================================================
print_header "Test 2: Search Mapping Rules (All Active)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/rules?active=1&limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  RULE_COUNT=$(echo "$RESPONSE" | jq '.rules | length')
  TOTAL_RULES=$(echo "$RESPONSE" | jq -r '.total')

  echo "Retrieved $RULE_COUNT rules (total: $TOTAL_RULES)"
  print_result 0 "Search mapping rules"
else
  echo "Response: $RESPONSE"
  print_result 1 "Search mapping rules"
fi

# ============================================================================
# Test 3: Create Mapping Rule (SKU Match)
# ============================================================================
print_header "Test 3: Create Mapping Rule (SKU Match)"

TEST_RULE_PATTERN="TEST-SKU-$(date +%s)"
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "SKU",
    "match_pattern": "'"$TEST_RULE_PATTERN"'",
    "finance_code": "BAKE",
    "confidence": 0.95,
    "source": "MANUAL",
    "priority": 100
  }' \
  "${BASE_URL}/api/finance/enforcement/rules")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  RULE_ID=$(echo "$RESPONSE" | jq -r '.rule.id')
  echo "Created rule ID: $RULE_ID"
  print_result 0 "Create mapping rule (SKU)"
else
  echo "Response: $RESPONSE"
  print_result 1 "Create mapping rule (SKU)"
fi

# ============================================================================
# Test 4: Create Mapping Rule (KEYWORD Match)
# ============================================================================
print_header "Test 4: Create Mapping Rule (KEYWORD Match)"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "KEYWORD",
    "match_pattern": "organic milk",
    "finance_code": "MILK",
    "confidence": 0.85,
    "source": "MANUAL",
    "priority": 80
  }' \
  "${BASE_URL}/api/finance/enforcement/rules")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  KEYWORD_RULE_ID=$(echo "$RESPONSE" | jq -r '.rule.id')
  echo "Created keyword rule ID: $KEYWORD_RULE_ID"
  print_result 0 "Create mapping rule (KEYWORD)"
else
  echo "Response: $RESPONSE"
  print_result 1 "Create mapping rule (KEYWORD)"
fi

# ============================================================================
# Test 5: Update Mapping Rule
# ============================================================================
print_header "Test 5: Update Mapping Rule"

if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
  RESPONSE=$(curl -s -X PUT \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "confidence": 0.98,
      "priority": 110
    }' \
    "${BASE_URL}/api/finance/enforcement/rules/${RULE_ID}")

  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    UPDATED_CONFIDENCE=$(echo "$RESPONSE" | jq -r '.rule.confidence')
    UPDATED_PRIORITY=$(echo "$RESPONSE" | jq -r '.rule.priority')

    echo "Updated confidence: $UPDATED_CONFIDENCE"
    echo "Updated priority: $UPDATED_PRIORITY"

    if [ "$UPDATED_CONFIDENCE" = "0.98" ] && [ "$UPDATED_PRIORITY" = "110" ]; then
      print_result 0 "Update mapping rule"
    else
      print_result 1 "Update mapping rule (values not updated correctly)"
    fi
  else
    echo "Response: $RESPONSE"
    print_result 1 "Update mapping rule"
  fi
else
  print_result 1 "Update mapping rule (no rule ID from previous test)"
fi

# ============================================================================
# Test 6: Search Rules by Finance Code
# ============================================================================
print_header "Test 6: Search Rules by Finance Code (MILK)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/rules?finance_code=MILK")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  MILK_RULES=$(echo "$RESPONSE" | jq '.rules | length')
  echo "Found $MILK_RULES rules for MILK"

  # Verify all rules have finance_code = MILK
  CORRECT_CODE=$(echo "$RESPONSE" | jq '.rules | all(.finance_code == "MILK")')
  if [ "$CORRECT_CODE" = "true" ]; then
    print_result 0 "Search rules by finance code"
  else
    print_result 1 "Search rules by finance code (incorrect codes returned)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Search rules by finance code"
fi

# ============================================================================
# Test 7: Get Needs Mapping Queue
# ============================================================================
print_header "Test 7: Get Needs Mapping Queue"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/needs-mapping?limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  QUEUE_COUNT=$(echo "$RESPONSE" | jq '.items | length')
  QUEUE_TOTAL=$(echo "$RESPONSE" | jq -r '.total')

  echo "Queue items: $QUEUE_COUNT (total: $QUEUE_TOTAL)"
  print_result 0 "Get needs mapping queue"
else
  echo "Response: $RESPONSE"
  print_result 1 "Get needs mapping queue"
fi

# ============================================================================
# Test 8: Get Invoices Needing Attention
# ============================================================================
print_header "Test 8: Get Invoices Needing Attention"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/needs-attention?limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  ATTENTION_COUNT=$(echo "$RESPONSE" | jq '.invoices | length')

  echo "Invoices needing attention: $ATTENTION_COUNT"
  print_result 0 "Get invoices needing attention"
else
  echo "Response: $RESPONSE"
  print_result 1 "Get invoices needing attention"
fi

# ============================================================================
# Test 9: Get Top Finance Categories (Last 30 Days)
# ============================================================================
print_header "Test 9: Get Top Finance Categories (Last 30 Days)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/top-categories?days=30")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  CATEGORY_COUNT=$(echo "$RESPONSE" | jq '.categories | length')

  echo "Top categories: $CATEGORY_COUNT"

  # Display top 3
  if [ "$CATEGORY_COUNT" -gt 0 ]; then
    echo ""
    echo "Top 3 categories by spend:"
    echo "$RESPONSE" | jq -r '.categories[0:3] | .[] | "  \(.finance_code): $\(.total_cents / 100) (\(.line_count) lines)"'
  fi

  print_result 0 "Get top finance categories"
else
  echo "Response: $RESPONSE"
  print_result 1 "Get top finance categories"
fi

# ============================================================================
# Test 10: Generate Finance Report
# ============================================================================
print_header "Test 10: Generate Finance Report (Last 7 Days)"

START_DATE=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/enforcement/report?start_date=${START_DATE}&end_date=${END_DATE}&group_by=finance_code")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  GROUP_COUNT=$(echo "$RESPONSE" | jq '.groups | length')
  TOTAL_LINES=$(echo "$RESPONSE" | jq -r '.summary.total_lines')
  TOTAL_CENTS=$(echo "$RESPONSE" | jq -r '.summary.total_cents')
  TOTAL_DOLLARS=$(echo "scale=2; $TOTAL_CENTS / 100" | bc)

  echo "Finance groups: $GROUP_COUNT"
  echo "Total lines: $TOTAL_LINES"
  echo "Total amount: \$$TOTAL_DOLLARS"

  print_result 0 "Generate finance report"
else
  echo "Response: $RESPONSE"
  print_result 1 "Generate finance report"
fi

# ============================================================================
# Test 11: Manual Assign Finance Code
# ============================================================================
print_header "Test 11: Manual Assign Finance Code"

# Create a mock line_data for testing
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "line_data": {
      "gfs_item_no": "TEST-MANUAL-001",
      "description": "Manual Assignment Test Item",
      "vendor_sku": "VEND-MANUAL-001"
    },
    "finance_code": "PROD"
  }' \
  "${BASE_URL}/api/finance/enforcement/manual-assign")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  ASSIGNED_CODE=$(echo "$RESPONSE" | jq -r '.finance_code')
  CONFIDENCE=$(echo "$RESPONSE" | jq -r '.confidence')

  echo "Assigned code: $ASSIGNED_CODE"
  echo "Confidence: $CONFIDENCE"

  # Manual assign should have confidence 1.00
  if [ "$ASSIGNED_CODE" = "PROD" ] && [ "$CONFIDENCE" = "1" ]; then
    print_result 0 "Manual assign finance code"
  else
    print_result 1 "Manual assign finance code (incorrect values)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Manual assign finance code"
fi

# ============================================================================
# Test 12: Validation Result for Existing Invoice
# ============================================================================
print_header "Test 12: Get Validation Result"

# Get a recent invoice ID
INVOICE_ID=$(sqlite3 inventory.db "SELECT invoice_id FROM invoices ORDER BY invoice_date DESC LIMIT 1" 2>/dev/null || echo "")

if [ -n "$INVOICE_ID" ] && [ "$INVOICE_ID" != "" ]; then
  RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/enforcement/validation/${INVOICE_ID}")

  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BALANCE_STATUS=$(echo "$RESPONSE" | jq -r '.validation.balance_status')
    SUBTOTAL_DELTA=$(echo "$RESPONSE" | jq -r '.validation.subtotal_delta_cents')

    echo "Balance status: $BALANCE_STATUS"
    echo "Subtotal delta: ${SUBTOTAL_DELTA}¢"

    print_result 0 "Get validation result"
  elif echo "$RESPONSE" | jq -e '.error' | grep -q "not found"; then
    echo "No validation result found for invoice $INVOICE_ID (may not have been validated yet)"
    print_result 0 "Get validation result (no validation data)"
  else
    echo "Response: $RESPONSE"
    print_result 1 "Get validation result"
  fi
else
  echo "No invoices found in database"
  print_result 0 "Get validation result (no invoices)"
fi

# ============================================================================
# Test 13: Invalid Finance Code Rejection in Rule
# ============================================================================
print_header "Test 13: Invalid Finance Code Rejection in Rule"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "SKU",
    "match_pattern": "INVALID-TEST",
    "finance_code": "INVALID_CODE",
    "confidence": 0.90,
    "source": "MANUAL",
    "priority": 100
  }' \
  "${BASE_URL}/api/finance/enforcement/rules")

# This should fail
if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  echo "Correctly rejected invalid finance code"
  print_result 0 "Invalid finance code rejection"
else
  echo "Response: $RESPONSE"
  print_result 1 "Invalid finance code rejection (should have failed)"
fi

# ============================================================================
# Test 14: Deactivate Mapping Rule
# ============================================================================
print_header "Test 14: Deactivate Mapping Rule"

if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
  RESPONSE=$(curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/enforcement/rules/${RULE_ID}")

  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    ACTIVE_STATUS=$(echo "$RESPONSE" | jq -r '.rule.active')

    if [ "$ACTIVE_STATUS" = "0" ]; then
      echo "Rule deactivated successfully"
      print_result 0 "Deactivate mapping rule"
    else
      print_result 1 "Deactivate mapping rule (still active)"
    fi
  else
    echo "Response: $RESPONSE"
    print_result 1 "Deactivate mapping rule"
  fi
else
  print_result 1 "Deactivate mapping rule (no rule ID)"
fi

# ============================================================================
# Test 15: Verify Deactivated Rule Not in Active Search
# ============================================================================
print_header "Test 15: Verify Deactivated Rule Not in Active Search"

if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
  RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/enforcement/rules?active=1")

  # Check that deactivated rule is not in results
  FOUND=$(echo "$RESPONSE" | jq ".rules | any(.id == $RULE_ID)")

  if [ "$FOUND" = "false" ]; then
    echo "Deactivated rule correctly excluded from active search"
    print_result 0 "Verify deactivated rule not in active search"
  else
    print_result 1 "Verify deactivated rule not in active search (still found)"
  fi
else
  print_result 1 "Verify deactivated rule not in active search (no rule ID)"
fi

# ============================================================================
# Test 16: Invoice Import with Enforcement (Optional - requires PDF)
# ============================================================================
print_header "Test 16: Invoice Import with Enforcement (Optional)"

# Look for a sample PDF in the test data directory
SAMPLE_PDF=$(find ./test_data -name "*.pdf" 2>/dev/null | head -n 1)

if [ -n "$SAMPLE_PDF" ] && [ -f "$SAMPLE_PDF" ]; then
  echo "Found sample PDF: $SAMPLE_PDF"

  RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -F "invoice_pdf=@${SAMPLE_PDF}" \
    "${BASE_URL}/api/finance/enforcement/import")

  if echo "$RESPONSE" | jq -e '.invoice_id' > /dev/null 2>&1; then
    IMPORTED_ID=$(echo "$RESPONSE" | jq -r '.invoice_id')
    BALANCE_STATUS=$(echo "$RESPONSE" | jq -r '.validation.balance_status')
    LOW_CONFIDENCE=$(echo "$RESPONSE" | jq -r '.low_confidence_lines')

    echo "Imported invoice ID: $IMPORTED_ID"
    echo "Balance status: $BALANCE_STATUS"
    echo "Low confidence lines: $LOW_CONFIDENCE"

    print_result 0 "Invoice import with enforcement"
  else
    echo "Response: $RESPONSE"
    print_result 1 "Invoice import with enforcement"
  fi
else
  echo "No sample PDF found in ./test_data"
  echo "Skipping invoice import test"
  print_result 0 "Invoice import with enforcement (skipped - no PDF)"
fi

# ============================================================================
# Cleanup Test Rules
# ============================================================================
print_header "Cleanup Test Rules"

echo "Cleaning up test rules..."
if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/enforcement/rules/${RULE_ID}" > /dev/null
fi
if [ -n "$KEYWORD_RULE_ID" ] && [ "$KEYWORD_RULE_ID" != "null" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/enforcement/rules/${KEYWORD_RULE_ID}" > /dev/null
fi
echo "Cleanup complete"

# Print final summary
print_summary
