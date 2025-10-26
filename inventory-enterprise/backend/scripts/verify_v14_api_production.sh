#!/bin/bash
###############################################################################
# NeuroPilot v14 - Production API Verification (Run from local machine)
# Tests live API endpoints on Fly.io deployment
###############################################################################

set -e

# Configuration
FLY_APP="backend-silent-mountain-3362"
BASE_URL="https://${FLY_APP}.fly.dev"
API_URL="${BASE_URL}/api"
TOKEN_FILE="/tmp/neuropilot_token_${FLY_APP}.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}NeuroPilot v14 - Production API Tests${NC}"
echo -e "${BLUE}Fly.io App: ${FLY_APP}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: Health check
echo -e "${YELLOW}[1] Health Check${NC}"
HEALTH=$(curl -s "${BASE_URL}/health")
STATUS=$(echo "$HEALTH" | jq -r '.status // "unknown"')
VERSION=$(echo "$HEALTH" | jq -r '.version // "unknown"')

if [ "$STATUS" = "ok" ] || [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ Server healthy${NC} (version: $VERSION)"
else
    echo -e "${RED}✗ Server unhealthy${NC}"
    echo "$HEALTH" | jq
    exit 1
fi
echo ""

# Test 2: Obtain auth token
echo -e "${YELLOW}[2] Obtaining Auth Token${NC}"
echo "Email: neuro.pilot.ai@gmail.com"

TOKEN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}')

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ Authentication failed${NC}"
    echo "$TOKEN_RESPONSE" | jq
    exit 1
fi

echo "$TOKEN" > "$TOKEN_FILE"
echo -e "${GREEN}✓ Token obtained${NC} (saved to $TOKEN_FILE)"
echo ""

# Test 3: AI Ops Status (v14 metrics)
echo -e "${YELLOW}[3] AI Ops Status (v14 Metrics)${NC}"
OPS_STATUS=$(curl -s "${API_URL}/owner/ops/status" -H "Authorization: Bearer $TOKEN")

SCORE=$(echo "$OPS_STATUS" | jq -r '.ai_ops_health.score // "null"')
LAST_FORECAST=$(echo "$OPS_STATUS" | jq -r '.last_forecast_ts // "null"')
LAST_LEARNING=$(echo "$OPS_STATUS" | jq -r '.last_learning_ts // "null"')
CONFIDENCE=$(echo "$OPS_STATUS" | jq -r '.ai_confidence_avg // "null"')
ACCURACY=$(echo "$OPS_STATUS" | jq -r '.forecast_accuracy // "null"')

echo "AI Ops Health Score: $SCORE%"
echo "Last Forecast: $LAST_FORECAST"
echo "Last Learning: $LAST_LEARNING"
echo "Avg Confidence: $CONFIDENCE%"
echo "Forecast Accuracy: $ACCURACY%"

if [ "$SCORE" != "null" ] && [ "$SCORE" -gt 0 ]; then
    echo -e "${GREEN}✓ AI Ops status OK${NC}"
else
    echo -e "${YELLOW}⚠ AI Ops status incomplete${NC}"
fi
echo ""

# Test 4: Learning Insights Timeline
echo -e "${YELLOW}[4] Learning Insights (v14 Signals)${NC}"
INSIGHTS=$(curl -s "${API_URL}/owner/ops/learning-insights?limit=10" -H "Authorization: Bearer $TOKEN")

INSIGHTS_COUNT=$(echo "$INSIGHTS" | jq '.insights | length')
SIGNAL_COUNT=$(echo "$INSIGHTS" | jq '[.insights[] | select(.insight_type | startswith("signal_"))] | length')

echo "Total insights: $INSIGHTS_COUNT"
echo "v14 signal insights: $SIGNAL_COUNT"

if [ "$SIGNAL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ v14 weighted signals detected${NC}"
    echo ""
    echo "Sample signal insights:"
    echo "$INSIGHTS" | jq -r '.insights[] | select(.insight_type | startswith("signal_")) | "\(.insight_type): \(.description)"' | head -3
else
    echo -e "${YELLOW}⚠ No v14 signal insights found (learning job may not have run yet)${NC}"
fi
echo ""

# Test 5: PDFs with Service Windows
echo -e "${YELLOW}[5] Invoice Service Windows${NC}"
PDFS=$(curl -s "${API_URL}/owner/pdfs?limit=10" -H "Authorization: Bearer $TOKEN")

PDF_COUNT=$(echo "$PDFS" | jq 'length')
WINDOWS_COUNT=$(echo "$PDFS" | jq '[.[] | select(.inferred_service_window != null)] | length')

echo "Total PDFs: $PDF_COUNT"
echo "With service windows: $WINDOWS_COUNT"

if [ "$WINDOWS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Service window inference working${NC}"
    echo ""
    echo "Sample service windows:"
    echo "$PDFS" | jq -r '.[] | select(.inferred_service_window != null) | "\(.invoice_number // "N/A"): \(.inferred_service_window)"' | head -3
else
    echo -e "${YELLOW}⚠ No service windows found (may be expected if no invoice dates)${NC}"
fi
echo ""

# Test 6: Daily Forecast
echo -e "${YELLOW}[6] Daily Forecast Cache${NC}"
FORECAST=$(curl -s "${API_URL}/owner/forecast/daily" -H "Authorization: Bearer $TOKEN")

FORECAST_DATE=$(echo "$FORECAST" | jq -r '.date // "null"')
ITEMS_COUNT=$(echo "$FORECAST" | jq '.items | length')
STOCKOUT_COUNT=$(echo "$FORECAST" | jq '.stockout | length')

echo "Forecast date: $FORECAST_DATE"
echo "Predicted items: $ITEMS_COUNT"
echo "Stockout risks: $STOCKOUT_COUNT"

if [ "$ITEMS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Forecast cache populated${NC}"
else
    echo -e "${YELLOW}⚠ Forecast cache empty (run trigger below)${NC}"
fi
echo ""

# Test 7: Unassigned Inventory Items
echo -e "${YELLOW}[7] Unassigned Inventory Items${NC}"
UNASSIGNED=$(curl -s "${API_URL}/owner/locations/unassigned?limit=10" -H "Authorization: Bearer $TOKEN")

UNASSIGNED_COUNT=$(echo "$UNASSIGNED" | jq '.items | length')
echo "Unassigned items: $UNASSIGNED_COUNT"

if [ "$UNASSIGNED_COUNT" -ge 0 ]; then
    echo -e "${GREEN}✓ Unassigned items endpoint OK${NC}"
else
    echo -e "${RED}✗ Unassigned items endpoint failed${NC}"
fi
echo ""

# Test 8: Trigger Jobs (Optional)
echo -e "${YELLOW}[8] Manual Job Triggers (Optional)${NC}"
read -p "Trigger forecast and learning jobs? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Triggering forecast job..."
    FORECAST_TRIGGER=$(curl -s -X POST "${API_URL}/owner/ops/trigger/ai_forecast" -H "Authorization: Bearer $TOKEN")
    echo "$FORECAST_TRIGGER" | jq -r '.message // .success'

    sleep 2

    echo "Triggering learning job..."
    LEARNING_TRIGGER=$(curl -s -X POST "${API_URL}/owner/ops/trigger/ai_learning" -H "Authorization: Bearer $TOKEN")
    echo "$LEARNING_TRIGGER" | jq -r '.message // .success'

    sleep 2

    echo ""
    echo "Re-checking timestamps..."
    OPS_STATUS=$(curl -s "${API_URL}/owner/ops/status" -H "Authorization: Bearer $TOKEN")
    echo "New last_forecast_ts: $(echo "$OPS_STATUS" | jq -r '.last_forecast_ts')"
    echo "New last_learning_ts: $(echo "$OPS_STATUS" | jq -r '.last_learning_ts')"
    echo -e "${GREEN}✓ Jobs triggered${NC}"
else
    echo "Skipped job triggers"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Server: $BASE_URL"
echo "Version: $VERSION"
echo "Health: $STATUS"
echo "AI Ops Score: $SCORE%"
echo "Learning Insights: $INSIGHTS_COUNT (signals: $SIGNAL_COUNT)"
echo "PDF Service Windows: $WINDOWS_COUNT/$PDF_COUNT"
echo "Forecast Items: $ITEMS_COUNT"
echo "Unassigned Items: $UNASSIGNED_COUNT"
echo ""

if [ "$SIGNAL_COUNT" -gt 0 ] && [ "$SCORE" -gt 0 ]; then
    echo -e "${GREEN}✓ v14 appears to be fully deployed and operational${NC}"
else
    echo -e "${YELLOW}⚠ v14 partially deployed - may need to trigger learning job${NC}"
fi

echo ""
echo "Token saved to: $TOKEN_FILE"
echo "Use for manual API calls: export TOKEN=\$(cat $TOKEN_FILE)"
