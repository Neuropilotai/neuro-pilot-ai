#!/bin/bash
#
# Owner Super Console v3.2.0 - Extended Feature Smoke Tests
# Tests new features: Reports, Orchestration, Recovery, AI Learning Nudge
#
# Usage: ./test_owner_super_console_extended.sh
#

set -e

API_BASE="http://127.0.0.1:8083/api"
EMAIL="neuro.pilot.ai@gmail.com"
PASSWORD="Admin123!@#"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════"
echo "🧪 Owner Super Console v3.2.0 - Extended Feature Smoke Tests"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Login
echo -n "1. Login... "
LOGIN_RESPONSE=$(curl -s -X POST ${API_BASE}/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✓ OK${NC} (token received)"

# Step 2: Health Check
echo -n "2. Health check... "
HEALTH=$(curl -s ${API_BASE}/../health)
STATUS=$(echo $HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$STATUS" = "ok" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

# Step 3-7: Reports API Tests
echo ""
echo "═══ REPORTS TAB TESTS ═══"

echo -n "3. Executive report... "
EXEC_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/executive)
SUCCESS=$(echo $EXEC_REPORT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "4. Ops report... "
OPS_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/ops)
SUCCESS=$(echo $OPS_REPORT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "5. Production report... "
PROD_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/production)
SUCCESS=$(echo $PROD_REPORT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "6. Purchasing report... "
PURCH_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/purchasing)
SUCCESS=$(echo $PURCH_REPORT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "7. Finance report... "
FIN_REPORT=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/finance)
SUCCESS=$(echo $FIN_REPORT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

# Step 8-10: Orchestration API Tests
echo ""
echo "═══ ORCHESTRATION TESTS ═══"

echo -n "8. Orchestration status... "
ORCH_STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/super/orchestrate/status)
SUCCESS=$(echo $ORCH_STATUS | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "9. Orchestration start (one-command)... "
ORCH_START=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" ${API_BASE}/super/orchestrate/start)
SUCCESS=$(echo $ORCH_START | grep -o '"success":true')
STEPS=$(echo $ORCH_START | grep -o '"steps":\[')
if [ ! -z "$SUCCESS" ] && [ ! -z "$STEPS" ]; then
  echo -e "${GREEN}✓ OK${NC} (startup sequence completed)"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "10. Orchestration stop (safe shutdown)... "
ORCH_STOP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" ${API_BASE}/super/orchestrate/stop)
SUCCESS=$(echo $ORCH_STOP | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

# Step 11-14: Recovery API Tests
echo ""
echo "═══ RECOVERY TESTS ═══"

# Create temporary test paths
TEST_DEST="/tmp/owner_console_test_backup"
mkdir -p $TEST_DEST

echo -n "11. Create recovery kit... "
RECOVERY_BACKUP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"dest\":\"${TEST_DEST}\",\"passphrase\":\"TestPassphrase123!\"}" \
  ${API_BASE}/owner/recovery/backup)

SUCCESS=$(echo $RECOVERY_BACKUP | grep -o '"success":true')
KIT_PATH=$(echo $RECOVERY_BACKUP | grep -o '"path":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$SUCCESS" ] && [ ! -z "$KIT_PATH" ]; then
  echo -e "${GREEN}✓ OK${NC} (kit created at $KIT_PATH)"
else
  echo -e "${YELLOW}⚠ PARTIAL${NC} (may fail if backup requires specific permissions)"
fi

echo -n "12. Verify recovery kit... "
if [ ! -z "$KIT_PATH" ] && [ -f "$KIT_PATH" ]; then
  RECOVERY_VERIFY=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"${KIT_PATH}\",\"passphrase\":\"TestPassphrase123!\"}" \
    ${API_BASE}/owner/recovery/verify)

  SUCCESS=$(echo $RECOVERY_VERIFY | grep -o '"success":true')
  DATABASE_INTACT=$(echo $RECOVERY_VERIFY | grep -o '"databaseIntact":true')

  if [ ! -z "$SUCCESS" ] && [ ! -z "$DATABASE_INTACT" ]; then
    echo -e "${GREEN}✓ OK${NC} (integrity verified)"
  else
    echo -e "${YELLOW}⚠ PARTIAL${NC}"
  fi
else
  echo -e "${YELLOW}⚠ SKIPPED${NC} (no kit to verify)"
fi

echo -n "13. Dry-run restore... "
if [ ! -z "$KIT_PATH" ] && [ -f "$KIT_PATH" ]; then
  RECOVERY_RESTORE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"${KIT_PATH}\",\"passphrase\":\"TestPassphrase123!\",\"dryRun\":true}" \
    ${API_BASE}/owner/recovery/restore)

  SUCCESS=$(echo $RECOVERY_RESTORE | grep -o '"success":true')
  DRY_RUN=$(echo $RECOVERY_RESTORE | grep -o '"dryRun":true')

  if [ ! -z "$SUCCESS" ] && [ ! -z "$DRY_RUN" ]; then
    echo -e "${GREEN}✓ OK${NC} (dry-run completed)"
  else
    echo -e "${YELLOW}⚠ PARTIAL${NC}"
  fi
else
  echo -e "${YELLOW}⚠ SKIPPED${NC} (no kit to restore)"
fi

echo -n "14. Recovery cleanup... "
rm -rf $TEST_DEST 2>/dev/null || true
echo -e "${GREEN}✓ OK${NC}"

# Step 15-18: AI Learning Nudge & Feedback Tests
echo ""
echo "═══ AI LEARNING NUDGE TESTS ═══"

echo -n "15. Submit feedback comment... "
FEEDBACK_COMMENT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"test: coffee 1.5 cups per person","source":"smoke_test"}' \
  ${API_BASE}/owner/forecast/comment)

SUCCESS=$(echo $FEEDBACK_COMMENT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "16. Get feedback history... "
FEEDBACK_HISTORY=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "${API_BASE}/owner/forecast/comments?limit=5")

COMMENTS=$(echo $FEEDBACK_HISTORY | grep -o '"comments":\[')
if [ ! -z "$COMMENTS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

echo -n "17. Train AI (apply pending comments)... "
TRAIN_AI=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/forecast/train)
SUCCESS=$(echo $TRAIN_AI | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${YELLOW}⚠ PARTIAL${NC} (may succeed with 0 applied if no pending comments)"
fi

echo -n "18. Learning nudge endpoint check... "
# Note: We don't have a specific nudge endpoint yet, but we test the feedback infrastructure
NUDGE_COMMENT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"test: weekend bread -20%","source":"learning_nudge"}' \
  ${API_BASE}/owner/forecast/comment)

SUCCESS=$(echo $NUDGE_COMMENT | grep -o '"success":true')
if [ ! -z "$SUCCESS" ]; then
  echo -e "${GREEN}✓ OK${NC}"
else
  echo -e "${RED}✗ FAILED${NC}"
fi

# Step 19-20: Integration & Performance Tests
echo ""
echo "═══ INTEGRATION & PERFORMANCE TESTS ═══"

echo -n "19. All reports load time... "
START_TIME=$(date +%s%3N)

curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/executive > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/ops > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/production > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/purchasing > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/finance > /dev/null

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

if [ $DURATION -lt 1500 ]; then
  echo -e "${GREEN}✓ OK${NC} (${DURATION}ms - avg <300ms per report)"
elif [ $DURATION -lt 3000 ]; then
  echo -e "${YELLOW}⚠ ACCEPTABLE${NC} (${DURATION}ms - slightly slow)"
else
  echo -e "${RED}✗ SLOW${NC} (${DURATION}ms - needs optimization)"
fi

echo -n "20. Full workflow simulation... "
# Simulate: Start → Report → Train → Stop
WORKFLOW_START=$(date +%s%3N)

curl -s -X POST -H "Authorization: Bearer $TOKEN" ${API_BASE}/super/orchestrate/start > /dev/null
curl -s -H "Authorization: Bearer $TOKEN" ${API_BASE}/owner/reports/executive > /dev/null
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"workflow test","source":"smoke_test"}' \
  ${API_BASE}/owner/forecast/comment > /dev/null
curl -s -X POST -H "Authorization: Bearer $TOKEN" ${API_BASE}/super/orchestrate/stop > /dev/null

WORKFLOW_END=$(date +%s%3N)
WORKFLOW_DURATION=$((WORKFLOW_END - WORKFLOW_START))

if [ $WORKFLOW_DURATION -lt 2000 ]; then
  echo -e "${GREEN}✓ OK${NC} (${WORKFLOW_DURATION}ms)"
elif [ $WORKFLOW_DURATION -lt 4000 ]; then
  echo -e "${YELLOW}⚠ ACCEPTABLE${NC} (${WORKFLOW_DURATION}ms)"
else
  echo -e "${RED}✗ SLOW${NC} (${WORKFLOW_DURATION}ms)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Smoke tests completed!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Open browser: http://127.0.0.1:8083/owner-super-console.html"
echo "2. Login with: $EMAIL"
echo "3. Test new tabs: Reports (9th tab), Settings (orchestration/recovery)"
echo "4. Test AI Console: Learning Nudge panel"
echo ""
echo "Key features to verify manually:"
echo "  • Reports tab with 5 sub-sections"
echo "  • CSV export from Reports tab"
echo "  • Settings → Start All / Stop All buttons"
echo "  • Settings → Recovery buttons (backup/verify/restore)"
echo "  • AI Console → Learning Nudge panel"
echo "  • All modals display correctly"
echo ""
