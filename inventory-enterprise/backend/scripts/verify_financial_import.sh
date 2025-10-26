#!/bin/bash

# ============================================================================
# Financial Import Verification Script (v15.3)
# Verifies financial PDF import, accuracy computation, and monthly summaries
# ============================================================================

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🧪 NeuroPilot v15.3 Financial Import Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Configuration
API_BASE="http://127.0.0.1:8083"
START_DATE="2025-01-01"
END_DATE="2025-06-30"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if TOKEN is set
if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ ERROR: TOKEN environment variable not set${NC}"
  echo "Please export your auth token: export TOKEN=your_token_here"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

echo "📊 Step 1: Checking database for ai_reconcile_history table..."
sqlite3 ../db/inventory_enterprise.db "SELECT COUNT(*) as count FROM ai_reconcile_history;" 2>/dev/null && echo -e "${GREEN}✅ Table exists${NC}" || echo -e "${YELLOW}⚠️  Table not found or empty${NC}"
echo ""

echo "📥 Step 2: Testing financial PDF import endpoint..."
echo "Date range: ${START_DATE} → ${END_DATE}"

IMPORT_RESPONSE=$(curl -s -X POST "${API_BASE}/api/inventory/reconcile/import-pdfs" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"startDate\": \"${START_DATE}\", \"endDate\": \"${END_DATE}\"}")

IMPORT_SUCCESS=$(echo "$IMPORT_RESPONSE" | jq -r '.success // false')

if [ "$IMPORT_SUCCESS" = "true" ]; then
  IMPORTED_COUNT=$(echo "$IMPORT_RESPONSE" | jq -r '.importedCount // 0')
  TOTAL_VALUE=$(echo "$IMPORT_RESPONSE" | jq -r '.totalValue // 0')
  VENDORS=$(echo "$IMPORT_RESPONSE" | jq -r '.vendors | join(", ")')

  echo -e "${GREEN}✅ Import successful${NC}"
  echo "   Imported: ${IMPORTED_COUNT} invoices"
  echo "   Total Value: \$${TOTAL_VALUE}"
  echo "   Vendors: ${VENDORS}"
else
  ERROR_MSG=$(echo "$IMPORT_RESPONSE" | jq -r '.error // "Unknown error"')
  echo -e "${RED}❌ Import failed: ${ERROR_MSG}${NC}"
  echo ""
  echo "Response:"
  echo "$IMPORT_RESPONSE" | jq '.'
fi
echo ""

echo "📊 Step 3: Fetching monthly financial summaries (Jan-Jun 2025)..."
SUMMARY_RESPONSE=$(curl -s "${API_BASE}/api/inventory/reconcile/financial-summary?startDate=${START_DATE}&endDate=${END_DATE}&period=monthly" \
  -H "$AUTH_HEADER")

SUMMARY_SUCCESS=$(echo "$SUMMARY_RESPONSE" | jq -r '.success // false')

if [ "$SUMMARY_SUCCESS" = "true" ]; then
  SUMMARY_COUNT=$(echo "$SUMMARY_RESPONSE" | jq -r '.summary | length')
  echo -e "${GREEN}✅ Monthly summaries retrieved${NC}"
  echo "   Periods found: ${SUMMARY_COUNT}"
  echo ""
  echo "   Month-by-Month Breakdown:"
  echo "$SUMMARY_RESPONSE" | jq -r '.summary[] | "   • \(.period): Invoice Total=\(.totalInvoiceAmount), Food+Freight=\(.foodFreightReimb), GST=\(.gstTotal), QST=\(.qstTotal)"'
else
  ERROR_MSG=$(echo "$SUMMARY_RESPONSE" | jq -r '.error // "Unknown error"')
  echo -e "${YELLOW}⚠️  Summary retrieval issue: ${ERROR_MSG}${NC}"
fi
echo ""

echo "🔍 Step 4: Checking AI Ops Status for financial accuracy..."
STATUS_RESPONSE=$(curl -s "${API_BASE}/api/owner/ops/status" \
  -H "$AUTH_HEADER")

STATUS_SUCCESS=$(echo "$STATUS_RESPONSE" | jq -r '.success // false')

if [ "$STATUS_SUCCESS" = "true" ]; then
  FINANCIAL_ACCURACY=$(echo "$STATUS_RESPONSE" | jq -r '.financial_accuracy // "null"')
  FINANCIAL_COLOR=$(echo "$STATUS_RESPONSE" | jq -r '.financial_accuracy_color // "null"')

  if [ "$FINANCIAL_ACCURACY" != "null" ]; then
    echo -e "${GREEN}✅ Financial accuracy metric found${NC}"
    echo "   Accuracy: ${FINANCIAL_ACCURACY}%"
    echo "   Status: ${FINANCIAL_COLOR}"
  else
    echo -e "${YELLOW}⚠️  Financial accuracy not yet computed${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Status endpoint unavailable${NC}"
fi
echo ""

echo "📈 Step 5: Checking Prometheus metrics..."
METRICS_RESPONSE=$(curl -s "${API_BASE}/metrics")

IMPORT_TOTAL=$(echo "$METRICS_RESPONSE" | grep '^financial_import_total ' | awk '{print $2}')
ACCURACY_PCT=$(echo "$METRICS_RESPONSE" | grep '^financial_usage_accuracy_pct ' | awk '{print $2}')

if [ -n "$IMPORT_TOTAL" ]; then
  echo -e "${GREEN}✅ financial_import_total: ${IMPORT_TOTAL}${NC}"
else
  echo -e "${YELLOW}⚠️  financial_import_total metric not found${NC}"
fi

if [ -n "$ACCURACY_PCT" ]; then
  echo -e "${GREEN}✅ financial_usage_accuracy_pct: ${ACCURACY_PCT}%${NC}"
else
  echo -e "${YELLOW}⚠️  financial_usage_accuracy_pct metric not found${NC}"
fi
echo ""

echo "🗄️  Step 6: Checking database for imported records..."
RECORD_COUNT=$(sqlite3 ../db/inventory_enterprise.db "SELECT COUNT(*) FROM ai_reconcile_history WHERE invoice_date BETWEEN '${START_DATE}' AND '${END_DATE}';" 2>/dev/null || echo "0")
echo "   Records in database: ${RECORD_COUNT}"

if [ "$RECORD_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Financial data persisted in database${NC}"

  # Show sample data
  echo ""
  echo "   Sample records:"
  sqlite3 -header -column ../db/inventory_enterprise.db "
    SELECT
      vendor,
      invoice_date,
      invoice_number,
      subtotal,
      gst,
      qst,
      total_amount
    FROM ai_reconcile_history
    WHERE invoice_date BETWEEN '${START_DATE}' AND '${END_DATE}'
    ORDER BY invoice_date DESC
    LIMIT 5
  " 2>/dev/null | sed 's/^/   /'
else
  echo -e "${YELLOW}⚠️  No records found in database${NC}"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Financial Import Verification Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  • Import endpoint: $([ "$IMPORT_SUCCESS" = "true" ] && echo -e "${GREEN}WORKING${NC}" || echo -e "${RED}FAILED${NC}")"
echo "  • Monthly summaries: $([ "$SUMMARY_SUCCESS" = "true" ] && echo -e "${GREEN}WORKING${NC}" || echo -e "${YELLOW}PARTIAL${NC}")"
echo "  • Financial accuracy: $([ "$FINANCIAL_ACCURACY" != "null" ] && echo -e "${GREEN}COMPUTED${NC}" || echo -e "${YELLOW}PENDING${NC}")"
echo "  • Prometheus metrics: $([ -n "$IMPORT_TOTAL" ] && [ -n "$ACCURACY_PCT" ] && echo -e "${GREEN}AVAILABLE${NC}" || echo -e "${YELLOW}PARTIAL${NC}")"
echo "  • Database persistence: $([ "$RECORD_COUNT" -gt 0 ] && echo -e "${GREEN}OK (${RECORD_COUNT} records)${NC}" || echo -e "${YELLOW}EMPTY${NC}")"
echo ""
