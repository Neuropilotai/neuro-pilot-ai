#!/bin/bash
# PDF Invoice Manager - Integration Test Script
# Version: v4.1.0
# Date: 2025-10-10

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "  PDF Invoice Manager - Integration Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:8083"
DB_PATH="./db/inventory_enterprise.db"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function for test results
test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
    ((TESTS_FAILED++))
  fi
}

echo "Step 1: Verify server is running..."
echo "──────────────────────────────────────────────────────────────"
if curl -s -f "$API_BASE/health" > /dev/null; then
  test_result 0 "Server is running on $API_BASE"
else
  test_result 1 "Server is NOT running on $API_BASE"
  echo "Please start the server with: npm start"
  exit 1
fi

echo ""
echo "Step 2: Login and get auth token..."
echo "──────────────────────────────────────────────────────────────"
TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "neuro.pilot.ai@gmail.com",
    "password": "Admin123!@#"
  }' | jq -r '.token')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  test_result 0 "Successfully authenticated as owner"
  echo "   Token: ${TOKEN:0:20}..."
else
  test_result 1 "Authentication failed"
  exit 1
fi

echo ""
echo "Step 3: Test GET /api/owner/pdfs (list all)"
echo "──────────────────────────────────────────────────────────────"
RESPONSE=$(curl -s "$API_BASE/api/owner/pdfs?status=all" \
  -H "Authorization: Bearer $TOKEN")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
TOTAL=$(echo "$RESPONSE" | jq -r '.summary.total')

if [ "$SUCCESS" == "true" ]; then
  test_result 0 "Retrieved PDF list successfully"
  echo "   Total PDFs: $TOTAL"
  echo "   Processed: $(echo "$RESPONSE" | jq -r '.summary.processed')"
  echo "   Unprocessed: $(echo "$RESPONSE" | jq -r '.summary.unprocessed')"
else
  test_result 1 "Failed to retrieve PDF list"
  echo "   Error: $(echo "$RESPONSE" | jq -r '.error')"
fi

echo ""
echo "Step 4: Test GET /api/owner/pdfs (filter unprocessed)"
echo "──────────────────────────────────────────────────────────────"
RESPONSE=$(curl -s "$API_BASE/api/owner/pdfs?status=unprocessed" \
  -H "Authorization: Bearer $TOKEN")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
UNPROCESSED_COUNT=$(echo "$RESPONSE" | jq -r '.summary.unprocessed')

if [ "$SUCCESS" == "true" ]; then
  test_result 0 "Retrieved unprocessed PDFs successfully"
  echo "   Unprocessed count: $UNPROCESSED_COUNT"
else
  test_result 1 "Failed to retrieve unprocessed PDFs"
fi

echo ""
echo "Step 5: Test GET /api/owner/pdfs (with cutoff date)"
echo "──────────────────────────────────────────────────────────────"
CUTOFF_DATE="2025-10-01"
RESPONSE=$(curl -s "$API_BASE/api/owner/pdfs?status=unprocessed&cutoff=$CUTOFF_DATE" \
  -H "Authorization: Bearer $TOKEN")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
CUTOFF_COUNT=$(echo "$RESPONSE" | jq -r '.summary.unprocessed')
CUTOFF_APPLIED=$(echo "$RESPONSE" | jq -r '.summary.cutoffApplied')

if [ "$SUCCESS" == "true" ] && [ "$CUTOFF_APPLIED" == "$CUTOFF_DATE" ]; then
  test_result 0 "Cutoff date filter working"
  echo "   Cutoff: $CUTOFF_APPLIED"
  echo "   Results: $CUTOFF_COUNT"
else
  test_result 1 "Cutoff date filter failed"
fi

echo ""
echo "Step 6: Test POST /api/owner/pdfs/mark-processed"
echo "──────────────────────────────────────────────────────────────"

# Get first 2 unprocessed document IDs
DOC_IDS=$(curl -s "$API_BASE/api/owner/pdfs?status=unprocessed" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0:2] | map(.id)')

DOC_COUNT=$(echo "$DOC_IDS" | jq '. | length')

if [ "$DOC_COUNT" -ge 2 ]; then
  echo "   Selected $DOC_COUNT documents for processing"

  # Generate unique count ID
  COUNT_ID="COUNT_TEST_$(date +%Y%m%d_%H%M%S)"

  # Mark as processed
  RESPONSE=$(curl -s -X POST "$API_BASE/api/owner/pdfs/mark-processed" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"invoiceIds\": $DOC_IDS,
      \"countId\": \"$COUNT_ID\",
      \"processedAt\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"
    }")

  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  LINKED_COUNT=$(echo "$RESPONSE" | jq -r '.data.linkedCount')
  PROCESSED_COUNT=$(echo "$RESPONSE" | jq -r '.data.processedInvoicesCreated')

  if [ "$SUCCESS" == "true" ] && [ "$LINKED_COUNT" -gt 0 ]; then
    test_result 0 "Successfully marked PDFs as processed"
    echo "   Count ID: $COUNT_ID"
    echo "   Linked: $LINKED_COUNT"
    echo "   Processed invoices created: $PROCESSED_COUNT"
  else
    test_result 1 "Failed to mark PDFs as processed"
    echo "   Error: $(echo "$RESPONSE" | jq -r '.error // "Unknown error"')"
  fi
else
  echo -e "${YELLOW}⚠ SKIP${NC}: Not enough unprocessed documents for bulk test"
fi

echo ""
echo "Step 7: Verify database changes"
echo "──────────────────────────────────────────────────────────────"

# Check count_pdfs table
COUNT_PDFS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM count_pdfs;")
if [ "$COUNT_PDFS_COUNT" -gt 0 ]; then
  test_result 0 "count_pdfs table has records"
  echo "   Total records: $COUNT_PDFS_COUNT"
  echo "   Last 3 entries:"
  sqlite3 "$DB_PATH" "SELECT '   ' || count_id || ' → ' || substr(document_id,1,16) || '...' FROM count_pdfs ORDER BY attached_at DESC LIMIT 3;"
else
  test_result 1 "count_pdfs table is empty"
fi

# Check processed_invoices table
PROCESSED_INVOICES_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM processed_invoices;")
if [ "$PROCESSED_INVOICES_COUNT" -gt 0 ]; then
  test_result 0 "processed_invoices table has records"
  echo "   Total records: $PROCESSED_INVOICES_COUNT"
else
  echo -e "${YELLOW}⚠ NOTE${NC}: processed_invoices table is empty (only created if invoice number extracted)"
fi

# Check audit log
AUDIT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM owner_console_events WHERE event_type='PDF_MARK_PROCESSED';")
if [ "$AUDIT_COUNT" -gt 0 ]; then
  test_result 0 "Audit logging working"
  echo "   PDF_MARK_PROCESSED events: $AUDIT_COUNT"
else
  test_result 1 "No audit logs found"
fi

echo ""
echo "Step 8: Test PDF preview endpoint"
echo "──────────────────────────────────────────────────────────────"

# Get first document ID
FIRST_DOC_ID=$(curl -s "$API_BASE/api/owner/pdfs?status=all" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

if [ -n "$FIRST_DOC_ID" ] && [ "$FIRST_DOC_ID" != "null" ]; then
  echo "   Testing preview for doc: ${FIRST_DOC_ID:0:16}..."

  # Test PDF preview (save to temp file)
  PREVIEW_STATUS=$(curl -s -o /tmp/test_preview.pdf -w "%{http_code}" \
    "$API_BASE/api/owner/pdfs/$FIRST_DOC_ID/preview" \
    -H "Authorization: Bearer $TOKEN")

  if [ "$PREVIEW_STATUS" == "200" ]; then
    # Check if it's a valid PDF
    FILE_TYPE=$(file -b /tmp/test_preview.pdf)
    if [[ "$FILE_TYPE" == *"PDF"* ]]; then
      test_result 0 "PDF preview working"
      echo "   File type: $FILE_TYPE"
      echo "   Size: $(stat -f%z /tmp/test_preview.pdf 2>/dev/null || stat -c%s /tmp/test_preview.pdf) bytes"
    else
      test_result 1 "Preview returned non-PDF file"
    fi
    rm -f /tmp/test_preview.pdf
  else
    test_result 1 "PDF preview failed (HTTP $PREVIEW_STATUS)"
  fi
else
  test_result 1 "Could not get document ID for preview test"
fi

echo ""
echo "Step 9: Test Prometheus metrics"
echo "──────────────────────────────────────────────────────────────"

METRICS=$(curl -s "$API_BASE/metrics")

# Check for PDF-specific metrics
if echo "$METRICS" | grep -q "owner_pdf_list_requests_total"; then
  test_result 0 "Metrics: owner_pdf_list_requests_total found"
else
  test_result 1 "Metrics: owner_pdf_list_requests_total NOT found"
fi

if echo "$METRICS" | grep -q "owner_pdf_mark_processed_total"; then
  test_result 0 "Metrics: owner_pdf_mark_processed_total found"
else
  test_result 1 "Metrics: owner_pdf_mark_processed_total NOT found"
fi

if echo "$METRICS" | grep -q "owner_pdf_preview_requests_total"; then
  test_result 0 "Metrics: owner_pdf_preview_requests_total found"
else
  test_result 1 "Metrics: owner_pdf_preview_requests_total NOT found"
fi

if echo "$METRICS" | grep -q "owner_pdf_route_latency_seconds"; then
  test_result 0 "Metrics: owner_pdf_route_latency_seconds found"

  # Show sample metric values
  echo "   Sample metrics:"
  echo "$METRICS" | grep "owner_pdf_" | head -5 | sed 's/^/   /'
else
  test_result 1 "Metrics: owner_pdf_route_latency_seconds NOT found"
fi

echo ""
echo "Step 10: Database schema validation"
echo "──────────────────────────────────────────────────────────────"

# Check if documents table has correct columns
DOCUMENTS_COLUMNS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(documents);" | grep -E "(id|filename|path|size_bytes|sha256)" | wc -l)
if [ "$DOCUMENTS_COLUMNS" -ge 5 ]; then
  test_result 0 "documents table schema is correct"
else
  test_result 1 "documents table schema may be incorrect"
fi

# Check if count_pdfs has document_id column
COUNT_PDFS_HAS_DOC_ID=$(sqlite3 "$DB_PATH" "PRAGMA table_info(count_pdfs);" | grep -c "document_id")
if [ "$COUNT_PDFS_HAS_DOC_ID" -eq 1 ]; then
  test_result 0 "count_pdfs has document_id column"
else
  test_result 1 "count_pdfs missing document_id column"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Summary"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Open http://localhost:3000/pdf-invoices in browser"
  echo "2. Test the UI functionality"
  echo "3. Check Grafana dashboard at http://localhost:3000/grafana (if configured)"
  exit 0
else
  echo -e "${RED}✗ Some tests failed.${NC}"
  echo ""
  echo "Please check the errors above and:"
  echo "1. Verify server is running: npm start"
  echo "2. Check database exists: $DB_PATH"
  echo "3. Verify owner credentials are correct"
  echo "4. Review implementation guide: PDF_INVOICE_MANAGER_IMPLEMENTATION.md"
  exit 1
fi
