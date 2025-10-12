#!/bin/bash
# NeuroPilot v13.x Zero-Bug Sprint - Verification Script

echo "═══════════════════════════════════════════════════════════════"
echo "🔍 NeuroPilot v13.x Zero-Bug Sprint - Verification Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8083"

# Check if token is provided
if [ -z "$OWNER_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  OWNER_TOKEN not set. Some tests will be skipped.${NC}"
  echo "   Export your token: export OWNER_TOKEN='your-jwt-token'"
  echo ""
fi

# Test 1: Health Check
echo "1️⃣  Testing Server Health..."
HEALTH=$(curl -s ${BASE_URL}/health 2>/dev/null)
if [ $? -eq 0 ]; then
  APP=$(echo $HEALTH | jq -r '.app' 2>/dev/null)
  if [ "$APP" != "null" ] && [ -n "$APP" ]; then
    echo -e "${GREEN}✅ Server is running: $APP${NC}"
  else
    echo -e "${RED}❌ Server responded but health check failed${NC}"
  fi
else
  echo -e "${RED}❌ Server is not reachable${NC}"
  exit 1
fi
echo ""

# Test 2: Database Schema
echo "2️⃣  Checking Database Schema..."
BREADCRUMBS=$(sqlite3 data/enterprise_inventory.db "PRAGMA table_info(ai_ops_breadcrumbs);" 2>/dev/null | wc -l)
if [ $BREADCRUMBS -ge 6 ]; then
  echo -e "${GREEN}✅ ai_ops_breadcrumbs has $BREADCRUMBS columns (expected ≥6)${NC}"
else
  echo -e "${RED}❌ ai_ops_breadcrumbs schema incomplete${NC}"
fi

WORKSPACE=$(sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_workspace';" 2>/dev/null)
if [ "$WORKSPACE" = "inventory_workspace" ]; then
  echo -e "${GREEN}✅ inventory_workspace table exists${NC}"
else
  echo -e "${YELLOW}⚠️  inventory_workspace table not found${NC}"
fi
echo ""

# Test 3: GFS Reports Directory
echo "3️⃣  Checking GFS Reports Directory..."
if [ -d "reports/gfs" ]; then
  echo -e "${GREEN}✅ reports/gfs/ directory exists${NC}"
  FILE_COUNT=$(ls -1 reports/gfs/ 2>/dev/null | wc -l)
  echo "   Files: $FILE_COUNT"
else
  echo -e "${RED}❌ reports/gfs/ directory not found${NC}"
fi
echo ""

if [ -n "$OWNER_TOKEN" ]; then
  # Test 4: Owner Dashboard
  echo "4️⃣  Testing Owner Dashboard..."
  DASHBOARD=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" ${BASE_URL}/api/owner/dashboard 2>/dev/null)
  if [ $? -eq 0 ]; then
    SUCCESS=$(echo $DASHBOARD | jq -r '.success' 2>/dev/null)
    if [ "$SUCCESS" = "true" ]; then
      FORECAST_RUN=$(echo $DASHBOARD | jq -r '.data.aiModules.forecasting.lastRun' 2>/dev/null)
      LEARNING_RUN=$(echo $DASHBOARD | jq -r '.data.aiModules.governance.lastRun' 2>/dev/null)

      if [ "$FORECAST_RUN" != "null" ] && [ "$FORECAST_RUN" != "null" ]; then
        echo -e "${GREEN}✅ Dashboard returns LIVE timestamps${NC}"
        echo "   Forecast Last Run: $FORECAST_RUN"
        echo "   Learning Last Run: $LEARNING_RUN"
      else
        echo -e "${YELLOW}⚠️  Dashboard timestamps are null (run jobs manually)${NC}"
      fi
    else
      echo -e "${RED}❌ Dashboard request failed${NC}"
    fi
  else
    echo -e "${RED}❌ Cannot reach dashboard endpoint${NC}"
  fi
  echo ""

  # Test 5: AI Ops Status
  echo "5️⃣  Testing AI Ops Status..."
  OPS=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" ${BASE_URL}/api/owner/ops/status 2>/dev/null)
  if [ $? -eq 0 ]; then
    DQI=$(echo $OPS | jq -r '.dqi_score' 2>/dev/null)
    CONF=$(echo $OPS | jq -r '.ai_confidence_avg' 2>/dev/null)
    ACC=$(echo $OPS | jq -r '.forecast_accuracy' 2>/dev/null)
    LAT=$(echo $OPS | jq -r '.forecast_latency_avg' 2>/dev/null)

    echo "   DQI Score: ${DQI:-null}"
    echo "   AI Confidence: ${CONF:-null}%"
    echo "   Forecast Accuracy: ${ACC:-null}%"
    echo "   Forecast Latency: ${LAT:-null}ms"

    if [ "$DQI" != "null" ] && [ -n "$DQI" ]; then
      echo -e "${GREEN}✅ AI Ops metrics returning data${NC}"
    else
      echo -e "${YELLOW}⚠️  Some metrics are null (expected if no jobs ran yet)${NC}"
    fi
  else
    echo -e "${RED}❌ AI Ops status endpoint failed${NC}"
  fi
  echo ""

  # Test 6: PDF Date Extraction
  echo "6️⃣  Testing PDF Date Extraction..."
  PDFS=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" "${BASE_URL}/api/owner/pdfs?limit=10" 2>/dev/null)
  if [ $? -eq 0 ]; then
    TOTAL=$(echo $PDFS | jq '.summary.total' 2>/dev/null)
    WITH_DATE=$(echo $PDFS | jq '.summary.with_date' 2>/dev/null)

    if [ -n "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
      PCT=$((WITH_DATE * 100 / TOTAL))
      echo "   Total PDFs: $TOTAL"
      echo "   With Dates: $WITH_DATE ($PCT%)"

      if [ $PCT -ge 90 ]; then
        echo -e "${GREEN}✅ Date extraction working well (≥90%)${NC}"
      elif [ $PCT -ge 70 ]; then
        echo -e "${YELLOW}⚠️  Date extraction at $PCT% (target: ≥90%)${NC}"
      else
        echo -e "${RED}❌ Date extraction below 70%${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  No PDFs found in database${NC}"
    fi
  else
    echo -e "${RED}❌ PDF endpoint failed${NC}"
  fi
  echo ""

  # Test 7: Fiscal Period
  echo "7️⃣  Testing Fiscal Period Lookup..."
  TODAY=$(date +%F)
  FISCAL=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" "${BASE_URL}/api/owner/reports/fiscal-period?date=$TODAY" 2>/dev/null)
  if [ $? -eq 0 ]; then
    PERIOD=$(echo $FISCAL | jq -r '.period_id' 2>/dev/null)
    if [ "$PERIOD" != "null" ] && [ -n "$PERIOD" ]; then
      echo -e "${GREEN}✅ Fiscal calendar working${NC}"
      echo "   Today ($TODAY): $PERIOD"
    else
      echo -e "${YELLOW}⚠️  Fiscal period not found for $TODAY${NC}"
    fi
  else
    echo -e "${RED}❌ Fiscal endpoint failed${NC}"
  fi
  echo ""

  # Test 8: Inventory Workspaces
  echo "8️⃣  Testing Inventory Workspaces..."
  WORKSPACES=$(curl -s -H "Authorization: Bearer $OWNER_TOKEN" "${BASE_URL}/api/owner/inventory/workspaces" 2>/dev/null)
  if [ $? -eq 0 ]; then
    SUCCESS=$(echo $WORKSPACES | jq -r '.success' 2>/dev/null)
    if [ "$SUCCESS" = "true" ]; then
      COUNT=$(echo $WORKSPACES | jq '.count' 2>/dev/null)
      echo -e "${GREEN}✅ Workspace endpoint working${NC}"
      echo "   Workspaces: $COUNT"
    else
      echo -e "${RED}❌ Workspace endpoint returned error${NC}"
    fi
  else
    echo -e "${RED}❌ Workspace endpoint failed${NC}"
  fi
  echo ""

else
  echo "4️⃣-8️⃣ Skipping authenticated tests (no OWNER_TOKEN)"
  echo ""
fi

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Verification Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "1. If timestamps show 'null', trigger jobs manually:"
echo "   curl -X POST -H \"Authorization: Bearer \$OWNER_TOKEN\" \\"
echo "     ${BASE_URL}/api/owner/ops/trigger/ai_forecast"
echo ""
echo "2. Open dashboard: ${BASE_URL}/owner-super-console.html"
echo ""
echo "3. Check release notes: RELEASE_NOTES_V13X_ZERO_BUG_SPRINT.md"
echo ""
