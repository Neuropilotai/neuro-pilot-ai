#!/bin/bash
# v14.4 Post-Deploy Verification Script
# 5 quick checks to verify deployment health

set -e

HOST="${1:-http://localhost:8083}"
echo "🔍 v14.4 Post-Deploy Verification"
echo "Target: $HOST"
echo "========================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

check_status() {
  local name="$1"
  local status=$2

  if [ $status -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name"
    ((PASS_COUNT++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name"
    ((FAIL_COUNT++))
  fi
}

echo ""
echo "1️⃣  Health Endpoints"
echo "-------------------"

# Check /healthz
status_code=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/healthz" || echo "000")
if [ "$status_code" = "200" ]; then
  check_status "/healthz endpoint" 0
else
  check_status "/healthz endpoint (got $status_code)" 1
fi

# Check /readyz
status_code=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/readyz" || echo "000")
if [ "$status_code" = "200" ]; then
  check_status "/readyz endpoint" 0
else
  check_status "/readyz endpoint (got $status_code)" 1
fi

echo ""
echo "2️⃣  Server Version"
echo "-------------------"

version=$(curl -s "$HOST/health" | jq -r '.version' 2>/dev/null || echo "unknown")
if [[ "$version" == *"14.4"* ]]; then
  echo -e "${GREEN}✅ PASS${NC}: Server version $version"
  ((PASS_COUNT++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: Server version $version (expected 14.4.x)"
fi

echo ""
echo "3️⃣  Console Redirect"
echo "-------------------"

redirect_url=$(curl -s -o /dev/null -w "%{redirect_url}" "$HOST/owner-console.html" || echo "")
status_code=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/owner-console.html" || echo "000")

if [ "$status_code" = "301" ]; then
  if [[ "$redirect_url" == *"owner-super-console.html"* ]]; then
    echo -e "${GREEN}✅ PASS${NC}: 301 redirect to owner-super-console.html"
    ((PASS_COUNT++))
  else
    echo -e "${RED}❌ FAIL${NC}: Wrong redirect target: $redirect_url"
    ((FAIL_COUNT++))
  fi
else
  echo -e "${RED}❌ FAIL${NC}: Expected 301, got $status_code"
  ((FAIL_COUNT++))
fi

echo ""
echo "4️⃣  File Existence"
echo "-------------------"

if [ -f "../frontend/owner-super-console.html" ]; then
  size=$(ls -lh ../frontend/owner-super-console.html | awk '{print $5}')
  echo -e "${GREEN}✅ PASS${NC}: owner-super-console.html exists ($size)"
  ((PASS_COUNT++))
else
  echo -e "${RED}❌ FAIL${NC}: owner-super-console.html not found"
  ((FAIL_COUNT++))
fi

if [ -f "../frontend/owner-console.css" ]; then
  size=$(ls -lh ../frontend/owner-console.css | awk '{print $5}')
  echo -e "${GREEN}✅ PASS${NC}: owner-console.css exists ($size)"
  ((PASS_COUNT++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: owner-console.css not found (optional)"
fi

echo ""
echo "5️⃣  Phase3CronScheduler"
echo "-------------------"

if grep -q "new MenuPredictor(this.db)" cron/phase3_cron.js 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC}: Phase3CronScheduler uses proper class instantiation"
  ((PASS_COUNT++))
else
  echo -e "${RED}❌ FAIL${NC}: Phase3CronScheduler may have broken AI class calls"
  ((FAIL_COUNT++))
fi

echo ""
echo "========================================"
echo "📊 Results Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 ALL CHECKS PASSED${NC}"
  echo "v14.4 deployment verified successfully!"
  exit 0
else
  echo ""
  echo -e "${RED}⚠️  SOME CHECKS FAILED${NC}"
  echo "Review failures above and address before going live."
  exit 1
fi
