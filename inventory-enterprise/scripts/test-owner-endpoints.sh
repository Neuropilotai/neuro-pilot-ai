#!/bin/bash

# Test Owner Console Endpoints After 401 Fix
# Verifies all owner endpoints are working correctly

RAILWAY_URL="https://inventory-backend-production-3a2c.up.railway.app"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Testing Owner Console Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  NOTE: This script tests endpoints without authentication."
echo "   For full testing, you need to:"
echo "   1. Login via /quick_login.html"
echo "   2. Get JWT token from localStorage"
echo "   3. Use token in Authorization header"
echo ""
echo "Testing public endpoints first..."
echo ""

# Test health endpoint (should work without auth)
echo "1. Testing /api/health (public)..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${RAILWAY_URL}/api/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
  echo "   ✅ /api/health → 200 (OK)"
else
  echo "   ❌ /api/health → $HEALTH_RESPONSE (FAILED)"
fi

# Test owner endpoints (should return 401 without auth - this is expected)
echo ""
echo "2. Testing owner endpoints (should return 401 without auth)..."
echo ""

ENDPOINTS=(
  "/api/owner/ops/status"
  "/api/owner/dashboard/stats"
  "/api/owner/reports/finance"
  "/api/owner/config"
  "/api/owner/console/locations"
)

for endpoint in "${ENDPOINTS[@]}"; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${RAILWAY_URL}${endpoint}")
  if [ "$RESPONSE" = "401" ]; then
    echo "   ✅ ${endpoint} → 401 (Expected - auth required)"
  elif [ "$RESPONSE" = "200" ]; then
    echo "   ⚠️  ${endpoint} → 200 (Unexpected - should require auth)"
  else
    echo "   ❌ ${endpoint} → $RESPONSE (Unexpected status)"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Manual Testing Instructions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To fully test with authentication:"
echo ""
echo "1. Open browser and visit:"
echo "   ${RAILWAY_URL}/quick_login.html"
echo ""
echo "2. Login with your credentials"
echo ""
echo "3. Open browser console (F12) and run:"
echo "   localStorage.getItem('np_owner_jwt')"
echo "   localStorage.getItem('np_owner_device')"
echo ""
echo "4. Test endpoints with curl:"
echo "   TOKEN='<your-token>'"
echo "   DEVICE='<your-device-id>'"
echo "   curl -H \"Authorization: Bearer \$TOKEN\" \\"
echo "        -H \"X-Owner-Device: \$DEVICE\" \\"
echo "        ${RAILWAY_URL}/api/owner/ops/status"
echo ""
echo "5. Expected results:"
echo "   ✅ All endpoints return 200"
echo "   ✅ No 401 errors"
echo "   ✅ Console shows: '✅ Correct version loaded: 23.6.11'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

