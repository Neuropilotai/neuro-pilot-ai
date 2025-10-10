#!/bin/bash
# PDF Invoice Manager API Test Script

echo "🧪 Testing PDF Invoice Manager API..."
echo ""

# 1. Login
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Login successful (token: ${TOKEN:0:20}...)"
echo ""

# 2. List all PDFs
echo "2. Listing all PDFs..."
PDF_LIST=$(curl -s "http://localhost:8083/api/owner/pdfs?status=all" \
  -H "Authorization: Bearer $TOKEN")

TOTAL=$(echo "$PDF_LIST" | jq -r '.summary.total')
PROCESSED=$(echo "$PDF_LIST" | jq -r '.summary.processed')
UNPROCESSED=$(echo "$PDF_LIST" | jq -r '.summary.unprocessed')

echo "✅ PDF Summary:"
echo "   Total: $TOTAL"
echo "   Processed: $PROCESSED"
echo "   Unprocessed: $UNPROCESSED"
echo ""

# 3. List unprocessed PDFs with cutoff
echo "3. Testing cutoff filter (2025-10-01)..."
CUTOFF_LIST=$(curl -s "http://localhost:8083/api/owner/pdfs?status=unprocessed&cutoff=2025-10-01" \
  -H "Authorization: Bearer $TOKEN")

CUTOFF_COUNT=$(echo "$CUTOFF_LIST" | jq -r '.data | length')
echo "✅ Cutoff filter returned $CUTOFF_COUNT PDFs"
echo ""

# 4. Mark 3 PDFs as processed (if we have unprocessed ones)
if [ "$UNPROCESSED" -gt 0 ]; then
  echo "4. Marking first 3 unprocessed PDFs as processed..."

  INVOICE_IDS=$(echo "$PDF_LIST" | jq -r '[.data[] | select(.isProcessed == false) | .document_id] | .[0:3]')
  COUNT_ID="TEST_$(date +%s)"

  echo "   Invoice IDs: $INVOICE_IDS"
  echo "   Count ID: $COUNT_ID"

  MARK_RESULT=$(curl -s -X POST "http://localhost:8083/api/owner/pdfs/mark-processed" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"invoiceIds\": $INVOICE_IDS,
      \"countId\": \"$COUNT_ID\",
      \"processedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }")

  PROCESSED_COUNT=$(echo "$MARK_RESULT" | jq -r '.data.processed_count')
  LINKED_COUNT=$(echo "$MARK_RESULT" | jq -r '.data.linked_count')

  echo "✅ Processed: $PROCESSED_COUNT, Linked: $LINKED_COUNT"
  echo ""
else
  echo "⚠️  No unprocessed PDFs to test marking"
  echo ""
fi

# 5. Test PDF preview
echo "5. Testing PDF preview..."
FIRST_DOC=$(echo "$PDF_LIST" | jq -r '.data[0].document_id')

if [ -n "$FIRST_DOC" ] && [ "$FIRST_DOC" != "null" ]; then
  PREVIEW_RESPONSE=$(curl -s -I "http://localhost:8083/api/owner/pdfs/$FIRST_DOC/preview" \
    -H "Authorization: Bearer $TOKEN")

  CONTENT_TYPE=$(echo "$PREVIEW_RESPONSE" | grep -i "content-type" | awk '{print $2}' | tr -d '\r')

  if [ "$CONTENT_TYPE" = "application/pdf" ]; then
    echo "✅ PDF preview works (Content-Type: $CONTENT_TYPE)"
  else
    echo "⚠️  Preview returned: $CONTENT_TYPE"
  fi
  echo ""
else
  echo "⚠️  No documents available for preview test"
  echo ""
fi

# 6. Check Prometheus metrics
echo "6. Checking Prometheus metrics..."
METRICS=$(curl -s http://localhost:8083/metrics | grep owner_pdf)

if [ -n "$METRICS" ]; then
  echo "✅ Prometheus metrics detected:"
  echo "$METRICS" | head -10
else
  echo "⚠️  No PDF metrics found"
fi
echo ""

echo "✅ All API tests completed!"
