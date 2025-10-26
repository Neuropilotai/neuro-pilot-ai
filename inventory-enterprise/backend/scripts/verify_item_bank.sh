#!/bin/bash
#
# verify_item_bank.sh (v16.2.0)
#
# Tests Item Bank CRUD operations, CSV import/export, search/filter, and statistics.
#
# Usage:
#   ./scripts/verify_item_bank.sh
#
# Prerequisites:
#   - Server running on port 8083
#   - Valid OWNER token in .owner_token
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
# Test 1: Get Item Bank Statistics
# ============================================================================
print_header "Test 1: Get Item Bank Statistics"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/statistics")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  TOTAL_ITEMS=$(echo "$RESPONSE" | jq -r '.statistics.total')
  ACTIVE_ITEMS=$(echo "$RESPONSE" | jq -r '.statistics.active')
  RETIRED_ITEMS=$(echo "$RESPONSE" | jq -r '.statistics.retired')

  echo "Total Items: $TOTAL_ITEMS"
  echo "Active Items: $ACTIVE_ITEMS"
  echo "Retired Items: $RETIRED_ITEMS"
  print_result 0 "Get item bank statistics"
else
  echo "Response: $RESPONSE"
  print_result 1 "Get item bank statistics"
fi

# ============================================================================
# Test 2: Search Items (All Active)
# ============================================================================
print_header "Test 2: Search Items (All Active)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank?status=ACTIVE&limit=5")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  ITEM_COUNT=$(echo "$RESPONSE" | jq '.items | length')
  echo "Retrieved $ITEM_COUNT items"
  print_result 0 "Search active items"
else
  echo "Response: $RESPONSE"
  print_result 1 "Search active items"
fi

# ============================================================================
# Test 3: Search by Finance Code
# ============================================================================
print_header "Test 3: Search by Finance Code (BAKE)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank?finance_code=BAKE&limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  BAKE_COUNT=$(echo "$RESPONSE" | jq '.items | length')
  echo "Found $BAKE_COUNT BAKE items"

  # Verify all items have finance_code = BAKE
  CORRECT_CODE=$(echo "$RESPONSE" | jq '.items | all(.finance_code == "BAKE")')
  if [ "$CORRECT_CODE" = "true" ]; then
    print_result 0 "Search by finance code"
  else
    print_result 1 "Search by finance code (incorrect codes returned)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Search by finance code"
fi

# ============================================================================
# Test 4: Search by Text Query
# ============================================================================
print_header "Test 4: Search by Text Query (flour)"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank?q=flour&limit=10")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  FLOUR_COUNT=$(echo "$RESPONSE" | jq '.items | length')
  echo "Found $FLOUR_COUNT items matching 'flour'"
  print_result 0 "Search by text query"
else
  echo "Response: $RESPONSE"
  print_result 1 "Search by text query"
fi

# ============================================================================
# Test 5: Get Single Item by GFS Number
# ============================================================================
print_header "Test 5: Get Single Item by GFS Number"

# First, get a valid GFS item number from the search
FIRST_ITEM=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank?limit=1" | jq -r '.items[0].gfs_item_no')

if [ "$FIRST_ITEM" != "null" ] && [ -n "$FIRST_ITEM" ]; then
  RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "${BASE_URL}/api/finance/item-bank/${FIRST_ITEM}")

  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    DESCRIPTION=$(echo "$RESPONSE" | jq -r '.item.description')
    FINANCE_CODE=$(echo "$RESPONSE" | jq -r '.item.finance_code')
    echo "Item: $DESCRIPTION"
    echo "Finance Code: $FINANCE_CODE"
    print_result 0 "Get single item by GFS number"
  else
    echo "Response: $RESPONSE"
    print_result 1 "Get single item by GFS number"
  fi
else
  echo "No items found in database"
  print_result 1 "Get single item by GFS number (no items)"
fi

# ============================================================================
# Test 6: Create New Item
# ============================================================================
print_header "Test 6: Create New Item"

TEST_ITEM_NO="TEST-$(date +%s)"
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gfs_item_no": "'"$TEST_ITEM_NO"'",
    "description": "Test Item for Verification",
    "pack_size": "12/1LB",
    "uom": "CS",
    "finance_code": "GROC+MISC",
    "taxable_gst": 1,
    "taxable_qst": 1
  }' \
  "${BASE_URL}/api/finance/item-bank")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  echo "Created item: $TEST_ITEM_NO"
  print_result 0 "Create new item"
else
  echo "Response: $RESPONSE"
  print_result 1 "Create new item"
fi

# ============================================================================
# Test 7: Update Item
# ============================================================================
print_header "Test 7: Update Item"

RESPONSE=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Test Item UPDATED",
    "finance_code": "OTHER"
  }' \
  "${BASE_URL}/api/finance/item-bank/${TEST_ITEM_NO}")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  UPDATED_DESC=$(echo "$RESPONSE" | jq -r '.item.description')
  UPDATED_CODE=$(echo "$RESPONSE" | jq -r '.item.finance_code')

  if [ "$UPDATED_DESC" = "Test Item UPDATED" ] && [ "$UPDATED_CODE" = "OTHER" ]; then
    echo "Updated description: $UPDATED_DESC"
    echo "Updated finance code: $UPDATED_CODE"
    print_result 0 "Update item"
  else
    print_result 1 "Update item (fields not updated correctly)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Update item"
fi

# ============================================================================
# Test 8: Retire Item (Soft Delete)
# ============================================================================
print_header "Test 8: Retire Item (Soft Delete)"

RESPONSE=$(curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/${TEST_ITEM_NO}")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  STATUS=$(echo "$RESPONSE" | jq -r '.item.status')

  if [ "$STATUS" = "RETIRED" ]; then
    echo "Item status: $STATUS"
    print_result 0 "Retire item"
  else
    print_result 1 "Retire item (status not RETIRED)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Retire item"
fi

# ============================================================================
# Test 9: Activate Retired Item
# ============================================================================
print_header "Test 9: Activate Retired Item"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/${TEST_ITEM_NO}/activate")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  STATUS=$(echo "$RESPONSE" | jq -r '.item.status')

  if [ "$STATUS" = "ACTIVE" ]; then
    echo "Item status: $STATUS"
    print_result 0 "Activate retired item"
  else
    print_result 1 "Activate retired item (status not ACTIVE)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Activate retired item"
fi

# ============================================================================
# Test 10: CSV Import (Small Sample)
# ============================================================================
print_header "Test 10: CSV Import (Small Sample)"

# Create a temporary CSV file
CSV_FILE="/tmp/test_item_bank_import_$$.csv"
cat > "$CSV_FILE" <<EOF
gfs_item_no,description,pack_size,uom,finance_code,taxable_gst,taxable_qst,vendor_sku,upc
TEST-CSV-001,Test CSV Item 1,6/10OZ,CS,BAKE,1,1,VEND-001,123456789012
TEST-CSV-002,Test CSV Item 2,12/1LB,CS,MILK,1,1,VEND-002,234567890123
TEST-CSV-003,Test CSV Item 3,24/12OZ,CS,BEV+ECO,1,0,VEND-003,345678901234
EOF

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "csv_file=@${CSV_FILE}" \
  "${BASE_URL}/api/finance/item-bank/import-csv")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  IMPORTED=$(echo "$RESPONSE" | jq -r '.imported')
  ERRORS=$(echo "$RESPONSE" | jq -r '.errors | length')

  echo "Imported: $IMPORTED items"
  echo "Errors: $ERRORS"

  if [ "$IMPORTED" -ge 3 ] && [ "$ERRORS" -eq 0 ]; then
    print_result 0 "CSV import"
  else
    print_result 1 "CSV import (imported=$IMPORTED, errors=$ERRORS)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "CSV import"
fi

# Clean up CSV file
rm -f "$CSV_FILE"

# ============================================================================
# Test 11: Verify Imported CSV Items
# ============================================================================
print_header "Test 11: Verify Imported CSV Items"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/TEST-CSV-001")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  DESCRIPTION=$(echo "$RESPONSE" | jq -r '.item.description')
  FINANCE_CODE=$(echo "$RESPONSE" | jq -r '.item.finance_code')

  if [ "$DESCRIPTION" = "Test CSV Item 1" ] && [ "$FINANCE_CODE" = "BAKE" ]; then
    echo "CSV item verified: $DESCRIPTION ($FINANCE_CODE)"
    print_result 0 "Verify imported CSV items"
  else
    print_result 1 "Verify imported CSV items (data mismatch)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Verify imported CSV items"
fi

# ============================================================================
# Test 12: CSV Export
# ============================================================================
print_header "Test 12: CSV Export"

EXPORT_FILE="/tmp/item_bank_export_$$.csv"
curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/export-csv?finance_code=BAKE&status=ACTIVE" \
  -o "$EXPORT_FILE"

if [ -f "$EXPORT_FILE" ]; then
  LINE_COUNT=$(wc -l < "$EXPORT_FILE")
  HEADER=$(head -n 1 "$EXPORT_FILE")

  echo "Exported $LINE_COUNT lines"
  echo "Header: $HEADER"

  if [ "$LINE_COUNT" -gt 1 ] && echo "$HEADER" | grep -q "gfs_item_no"; then
    print_result 0 "CSV export"
  else
    print_result 1 "CSV export (invalid format)"
  fi
else
  print_result 1 "CSV export (file not created)"
fi

# Clean up export file
rm -f "$EXPORT_FILE"

# ============================================================================
# Test 13: Bulk Update Finance Code
# ============================================================================
print_header "Test 13: Bulk Update Finance Code"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gfs_item_nos": ["TEST-CSV-001", "TEST-CSV-002"],
    "finance_code": "OTHER"
  }' \
  "${BASE_URL}/api/finance/item-bank/bulk-update")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  UPDATED=$(echo "$RESPONSE" | jq -r '.updated')

  echo "Updated $UPDATED items"

  if [ "$UPDATED" -eq 2 ]; then
    print_result 0 "Bulk update finance code"
  else
    print_result 1 "Bulk update finance code (updated=$UPDATED, expected 2)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Bulk update finance code"
fi

# ============================================================================
# Test 14: Verify Bulk Update
# ============================================================================
print_header "Test 14: Verify Bulk Update"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/TEST-CSV-001")

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  FINANCE_CODE=$(echo "$RESPONSE" | jq -r '.item.finance_code')

  if [ "$FINANCE_CODE" = "OTHER" ]; then
    echo "Finance code updated to: $FINANCE_CODE"
    print_result 0 "Verify bulk update"
  else
    print_result 1 "Verify bulk update (code=$FINANCE_CODE, expected OTHER)"
  fi
else
  echo "Response: $RESPONSE"
  print_result 1 "Verify bulk update"
fi

# ============================================================================
# Test 15: Invalid Finance Code Rejection
# ============================================================================
print_header "Test 15: Invalid Finance Code Rejection"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gfs_item_no": "TEST-INVALID",
    "description": "Invalid Finance Code Test",
    "pack_size": "1EA",
    "uom": "EA",
    "finance_code": "INVALID_CODE",
    "taxable_gst": 1,
    "taxable_qst": 1
  }' \
  "${BASE_URL}/api/finance/item-bank")

# This should fail
if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  echo "Correctly rejected invalid finance code"
  print_result 0 "Invalid finance code rejection"
else
  echo "Response: $RESPONSE"
  print_result 1 "Invalid finance code rejection (should have failed)"
fi

# ============================================================================
# Cleanup Test Items
# ============================================================================
print_header "Cleanup Test Items"

echo "Cleaning up test items..."
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/${TEST_ITEM_NO}" > /dev/null
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/TEST-CSV-001" > /dev/null
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/TEST-CSV-002" > /dev/null
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/finance/item-bank/TEST-CSV-003" > /dev/null
echo "Cleanup complete"

# Print final summary
print_summary
