#!/bin/bash

# Verify All Owner Console Fixes
# This script checks if all fixes are properly deployed and working

set -e

RAILWAY_URL="https://inventory-backend-production-3a2c.up.railway.app"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Verifying Owner Console Fixes..."
echo ""

# Check 1: HTML Version
echo "1. Checking HTML version..."
HTML_VERSION=$(curl -s "${RAILWAY_URL}/owner-super-console-v15.html" | grep -o "owner-super-console.js?v=[0-9.]*" | head -1 | cut -d'=' -f2)
if [ "$HTML_VERSION" = "23.6.9" ]; then
    echo -e "${GREEN}✅ HTML version: v${HTML_VERSION} (correct)${NC}"
else
    echo -e "${YELLOW}⚠️  HTML version: v${HTML_VERSION} (expected v23.6.9)${NC}"
    echo "   Railway may not have deployed latest fixes yet"
fi
echo ""

# Check 2: Force Cache Clear Page
echo "2. Checking force-cache-clear.html..."
CACHE_CLEAR_STATUS=$(curl -sI "${RAILWAY_URL}/force-cache-clear.html" | head -1 | grep -o "200")
if [ "$CACHE_CLEAR_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ force-cache-clear.html exists${NC}"
else
    echo -e "${RED}❌ force-cache-clear.html not found${NC}"
fi
echo ""

# Check 3: Quick Login Page
echo "3. Checking quick_login.html..."
QUICK_LOGIN_STATUS=$(curl -sI "${RAILWAY_URL}/quick_login.html" | head -1 | grep -o "200")
if [ "$QUICK_LOGIN_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ quick_login.html exists${NC}"
else
    echo -e "${RED}❌ quick_login.html not found${NC}"
fi
echo ""

# Check 4: Cache Headers
echo "4. Checking cache headers..."
CACHE_HEADER=$(curl -sI "${RAILWAY_URL}/owner-super-console-v15.html" | grep -i "cache-control" | head -1)
if echo "$CACHE_HEADER" | grep -q "no-cache"; then
    echo -e "${GREEN}✅ Cache headers configured correctly${NC}"
    echo "   $CACHE_HEADER"
else
    echo -e "${YELLOW}⚠️  Cache headers may not be configured${NC}"
fi
echo ""

# Check 5: Owner Routes (requires auth, so just check if they exist)
echo "5. Checking owner routes..."
OPS_STATUS=$(curl -sI "${RAILWAY_URL}/api/owner/ops/status" | head -1 | grep -oE "(401|403|404|200)")
if [ "$OPS_STATUS" = "401" ] || [ "$OPS_STATUS" = "403" ]; then
    echo -e "${GREEN}✅ /api/owner/ops/status exists (returns ${OPS_STATUS} - auth required)${NC}"
elif [ "$OPS_STATUS" = "404" ]; then
    echo -e "${RED}❌ /api/owner/ops/status not found${NC}"
else
    echo -e "${YELLOW}⚠️  /api/owner/ops/status returned ${OPS_STATUS}${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Summary:"
echo ""

if [ "$HTML_VERSION" = "23.6.9" ]; then
    echo -e "${GREEN}✅ All fixes appear to be deployed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Clear browser cache (visit /force-cache-clear.html)"
    echo "  2. Re-login via /quick_login.html"
    echo "  3. Test owner console - should see 200 responses"
else
    echo -e "${YELLOW}⚠️  Railway may not have fully deployed yet${NC}"
    echo ""
    echo "Current status:"
    echo "  • HTML version: v${HTML_VERSION} (expected v23.6.9)"
    echo "  • Check Railway dashboard for deployment status"
    echo "  • Wait for full deployment, then clear browser cache"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

