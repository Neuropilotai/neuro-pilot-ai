#!/bin/bash
# CORS Security Test Script
# Tests that CORS is properly restricted to authorized origins only

set -e

BACKEND="https://resourceful-achievement-production.up.railway.app"
PASS_COUNT=0
FAIL_COUNT=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "🔒 CORS Security Test"
echo "========================================"
echo ""
echo "Backend: $BACKEND"
echo ""

# Test 1: Unauthorized origin should be REJECTED
echo "${BLUE}Test 1: Unauthorized origin (should REJECT)${NC}"
echo "Origin: https://evil-hacker-site.com"

RESULT=$(curl -sI -X OPTIONS \
  -H "Origin: https://evil-hacker-site.com" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND/api/health" 2>/dev/null | grep -i "access-control-allow-origin" || true)

if [ -z "$RESULT" ]; then
  echo -e "${GREEN}✅ PASS - Unauthorized origin blocked (no CORS header)${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}❌ FAIL - Unauthorized origin allowed: $RESULT${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

# Test 2: Authorized origin should be ALLOWED
echo "${BLUE}Test 2: Authorized origin (should ALLOW)${NC}"
echo "Origin: https://neuropilot-inventory.vercel.app"

RESULT=$(curl -sI -X OPTIONS \
  -H "Origin: https://neuropilot-inventory.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND/api/health" 2>/dev/null | grep -i "access-control-allow-origin" || true)

if echo "$RESULT" | grep -q "neuropilot-inventory.vercel.app"; then
  echo -e "${GREEN}✅ PASS - Authorized origin allowed${NC}"
  echo "   $RESULT"
  PASS_COUNT=$((PASS_COUNT + 1))
elif echo "$RESULT" | grep -q "\*"; then
  echo -e "${RED}❌ FAIL - Wildcard still present (insecure): $RESULT${NC}"
  echo -e "${YELLOW}   This means CORS fix hasn't been deployed yet${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo -e "${RED}❌ FAIL - Authorized origin blocked or wrong value: $RESULT${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

# Test 3: No origin (curl/mobile) should be ALLOWED
echo "${BLUE}Test 3: No origin/curl (should ALLOW)${NC}"
echo "Testing direct curl request..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/api/health")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ PASS - No-origin requests allowed (HTTP $HTTP_CODE)${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}❌ FAIL - No-origin requests blocked (HTTP $HTTP_CODE)${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

# Test 4: Alternative Vercel URL should be ALLOWED
echo "${BLUE}Test 4: Alternative Vercel URL (should ALLOW)${NC}"
echo "Origin: https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app"

RESULT=$(curl -sI -X OPTIONS \
  -H "Origin: https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND/api/health" 2>/dev/null | grep -i "access-control-allow-origin" || true)

if echo "$RESULT" | grep -q "neuropilot-inventory"; then
  echo -e "${GREEN}✅ PASS - Alternative Vercel URL allowed${NC}"
  echo "   $RESULT"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${YELLOW}⚠️  WARN - Alternative URL not explicitly allowed${NC}"
  echo "   $RESULT"
  echo "   This may be OK if using wildcard subdomain matching"
fi

echo ""
echo "========================================"
echo "📊 Test Results"
echo "========================================"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ All critical CORS tests passed!${NC}"
  echo "Your API is properly secured against unauthorized origins."
  exit 0
else
  echo -e "${RED}❌ Some CORS tests failed!${NC}"
  echo ""
  echo "Possible issues:"
  echo "1. CORS fix not deployed yet - wait for Railway deployment"
  echo "2. ALLOWED_ORIGINS env var not set in Railway"
  echo "3. Backend still using old code with cors()"
  echo ""
  echo "Check Railway logs: railway logs"
  echo "Check env vars: railway variables"
  exit 1
fi
