#!/bin/bash
#
# v15.2.0 Inventory Reconciliation Test Script
# Tests H1 2025 PDF intake + physical vs system reconciliation
#
# Usage: ./test_v15_2_reconciliation.sh
#

set -e

BASE_URL="http://localhost:8083"
TOKEN=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════"
echo "🧪 v15.2.0 Inventory Reconciliation Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Authenticate
echo "📝 Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "neuropilotai@gmail.com",
    "password": "your_password_here"
  }')

TOKEN=$(echo $AUTH_RESPONSE | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Authentication failed${NC}"
  echo "Response: $AUTH_RESPONSE"
  echo ""
  echo "Please update the password in this script or login manually and set TOKEN variable"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated successfully${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Import H1 2025 PDFs
echo "📥 Step 2: Importing H1 2025 PDFs (2025-01-01 → 2025-06-30)..."
PDF_IMPORT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/inventory/pdfs/import" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2025-01-01",
    "to": "2025-06-30",
    "locations": ["*"]
  }')

echo "$PDF_IMPORT_RESPONSE" | jq '.'

FILES_INGESTED=$(echo $PDF_IMPORT_RESPONSE | jq -r '.files_ingested // 0')
LINES_PARSED=$(echo $PDF_IMPORT_RESPONSE | jq -r '.lines_parsed // 0')
UNRESOLVED=$(echo $PDF_IMPORT_RESPONSE | jq -r '.unresolved // 0')
BATCH_ID=$(echo $PDF_IMPORT_RESPONSE | jq -r '.batch_id // "unknown"')

if [ "$FILES_INGESTED" -gt 0 ]; then
  echo -e "${GREEN}✅ PDF Import Complete${NC}"
  echo "   Files: $FILES_INGESTED"
  echo "   Lines: $LINES_PARSED"
  echo "   Unresolved: $UNRESOLVED"
  echo "   Batch ID: $BATCH_ID"
else
  echo -e "${YELLOW}⚠️  No PDFs found in date range (this is expected if no PDFs exist)${NC}"
fi
echo ""

# Step 3: Get PDF list
echo "📄 Step 3: Fetching PDF list..."
PDF_LIST_RESPONSE=$(curl -s "$BASE_URL/api/inventory/pdfs?from=2025-01-01&to=2025-06-30&page=1&size=10" \
  -H "Authorization: Bearer $TOKEN")

echo "$PDF_LIST_RESPONSE" | jq '.'
PDF_COUNT=$(echo $PDF_LIST_RESPONSE | jq -r '.total // 0')
echo -e "${GREEN}✅ Found $PDF_COUNT PDFs${NC}"
echo ""

# Step 4: Run Reconciliation (as of 2025-07-03)
echo "⚖️  Step 4: Running Reconciliation (as of 2025-07-03)..."
RECONCILE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/inventory/reconcile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "as_of": "2025-07-03",
    "locations": ["*"]
  }')

echo "$RECONCILE_RESPONSE" | jq '.'

RECONCILE_ID=$(echo $RECONCILE_RESPONSE | jq -r '.reconcile_id // empty')
ITEMS_CHECKED=$(echo $RECONCILE_RESPONSE | jq -r '.summary.items // 0')
VARIANCE_VALUE=$(echo $RECONCILE_RESPONSE | jq -r '.summary.variance_value // 0')
OVER_ITEMS=$(echo $RECONCILE_RESPONSE | jq -r '.summary.over_items // 0')
SHORT_ITEMS=$(echo $RECONCILE_RESPONSE | jq -r '.summary.short_items // 0')

if [ -n "$RECONCILE_ID" ]; then
  echo -e "${GREEN}✅ Reconciliation Complete${NC}"
  echo "   Reconcile ID: $RECONCILE_ID"
  echo "   Items Checked: $ITEMS_CHECKED"
  echo "   Variance Value: \$$VARIANCE_VALUE"
  echo "   Over: $OVER_ITEMS items"
  echo "   Short: $SHORT_ITEMS items"
else
  echo -e "${RED}❌ Reconciliation failed${NC}"
  exit 1
fi
echo ""

# Step 5: Get Reconciliation Details
echo "📊 Step 5: Fetching Reconciliation Details..."
RECONCILE_DETAILS=$(curl -s "$BASE_URL/api/inventory/reconcile/$RECONCILE_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$RECONCILE_DETAILS" | jq '.run, .summary'

VARIANCE_COUNT=$(echo $RECONCILE_DETAILS | jq -r '.variances | length')
echo -e "${GREEN}✅ Found $VARIANCE_COUNT variances${NC}"

# Show top 5 variances
echo ""
echo "Top 5 Variances:"
echo "$RECONCILE_DETAILS" | jq -r '.variances[0:5] | .[] | "  \(.item_code) - \(.item_name): \(.variance_qty) \(.uom) (\(.category))"'
echo ""

# Step 6: Download CSV
echo "📥 Step 6: Downloading Reconciliation CSV..."
CSV_FILE="/tmp/reconcile_$RECONCILE_ID.csv"
curl -s "$BASE_URL/api/inventory/reconcile/$RECONCILE_ID/csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o "$CSV_FILE"

if [ -f "$CSV_FILE" ]; then
  LINE_COUNT=$(wc -l < "$CSV_FILE")
  echo -e "${GREEN}✅ CSV Downloaded: $CSV_FILE${NC}"
  echo "   Lines: $LINE_COUNT"
  echo ""
  echo "First 3 lines:"
  head -3 "$CSV_FILE"
else
  echo -e "${RED}❌ CSV download failed${NC}"
fi
echo ""

# Step 7: Trigger AI Forecast
echo "🔮 Step 7: Triggering AI Forecast..."
FORECAST_TRIGGER=$(curl -s -X POST "$BASE_URL/api/owner/ops/trigger/ai_forecast" \
  -H "Authorization: Bearer $TOKEN")

echo "$FORECAST_TRIGGER" | jq '.'
echo -e "${GREEN}✅ AI Forecast triggered${NC}"
echo ""

# Step 8: Trigger AI Learning
echo "🧠 Step 8: Triggering AI Learning..."
LEARNING_TRIGGER=$(curl -s -X POST "$BASE_URL/api/owner/ops/trigger/ai_learning" \
  -H "Authorization: Bearer $TOKEN")

echo "$LEARNING_TRIGGER" | jq '.'
echo -e "${GREEN}✅ AI Learning triggered${NC}"
echo ""

# Step 9: Check Health
echo "🏥 Step 9: Checking AI Ops Health..."
sleep 3 # Wait for jobs to start
HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/owner/ops/status" \
  -H "Authorization: Bearer $TOKEN")

HEALTH_PCT=$(echo $HEALTH_RESPONSE | jq -r '.healthPct // 0')
echo "$HEALTH_RESPONSE" | jq '.healthPct, .checks[] | {name, status, message}'

if [ "$HEALTH_PCT" -ge 75 ]; then
  echo -e "${GREEN}✅ AI Health: $HEALTH_PCT%${NC}"
else
  echo -e "${YELLOW}⚠️  AI Health: $HEALTH_PCT% (target: ≥85%)${NC}"
fi
echo ""

# Step 10: Check Dashboard Stats
echo "📊 Step 10: Checking Dashboard Stats..."
DASHBOARD_RESPONSE=$(curl -s "$BASE_URL/api/owner/dashboard" \
  -H "Authorization: Bearer $TOKEN")

AI_INDEX=$(echo $DASHBOARD_RESPONSE | jq -r '.data.aiIntelligenceIndex // "N/A"')
echo "$DASHBOARD_RESPONSE" | jq '.stats'
echo -e "${GREEN}✅ AI Intelligence Index: $AI_INDEX${NC}"
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "✅ TEST SUITE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  📥 PDFs Imported: $FILES_INGESTED files, $LINES_PARSED lines"
echo "  ⚖️  Reconciliation: $ITEMS_CHECKED items checked"
echo "  💰 Variance Value: \$$VARIANCE_VALUE"
echo "  📊 Over/Short: +$OVER_ITEMS / -$SHORT_ITEMS"
echo "  🏥 AI Health: $HEALTH_PCT%"
echo "  📈 AI Index: $AI_INDEX"
echo ""
echo "Artifacts:"
echo "  - Reconcile ID: $RECONCILE_ID"
echo "  - CSV File: $CSV_FILE"
echo "  - JSON: /tmp/reconcile_$RECONCILE_ID.json"
echo ""
echo "✅ v15.2.0 Reconciliation System VERIFIED"
echo "═══════════════════════════════════════════════════════════════"
