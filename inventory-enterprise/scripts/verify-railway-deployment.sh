#!/bin/bash
# Verify Railway Deployment Status
# Checks if latest code is deployed and routes are working

set -e

BASE_URL="${RAILWAY_URL:-https://inventory-backend-production-3a2c.up.railway.app}"

echo "🔍 Verifying Railway Deployment"
echo "================================"
echo "Base URL: $BASE_URL"
echo ""

# Check health endpoint
echo "1️⃣  Checking health endpoint..."
HEALTH=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$HEALTH" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Health check failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
echo ""

# Check if quick_login.html is accessible
echo "2️⃣  Checking quick_login.html..."
QUICK_LOGIN=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/quick_login.html")
HTTP_CODE=$(echo "$QUICK_LOGIN" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ quick_login.html is accessible"
else
  echo "❌ quick_login.html not found (HTTP $HTTP_CODE)"
  echo "This may indicate a deployment issue"
fi
echo ""

# Check auth endpoint (should return 400/401 without credentials, not 404)
echo "3️⃣  Checking auth/login endpoint..."
AUTH_CHECK=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP_CODE=$(echo "$AUTH_CHECK" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$AUTH_CHECK" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Auth endpoint exists (HTTP $HTTP_CODE - expected without credentials)"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Auth endpoint not found (HTTP 404)"
  echo "Route may not be registered"
else
  echo "⚠️  Unexpected response (HTTP $HTTP_CODE)"
  echo "$BODY"
fi
echo ""

# Check owner/reports endpoint (should return 401 without auth, not 404)
echo "4️⃣  Checking owner/reports endpoint..."
REPORTS_CHECK=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/owner/reports/finance")
HTTP_CODE=$(echo "$REPORTS_CHECK" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$REPORTS_CHECK" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Owner reports endpoint exists (HTTP 401 - auth required, route is working!)"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Owner reports endpoint not found (HTTP 404)"
  echo "Route may not be registered in server-v21_1.js"
  echo "Check Railway logs for: [STARTUP] ✓ owner-reports loaded"
else
  echo "⚠️  Unexpected response (HTTP $HTTP_CODE)"
  echo "$BODY"
fi
echo ""

# Check owner/ops endpoint
echo "5️⃣  Checking owner/ops endpoint..."
OPS_CHECK=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/owner/ops/status")
HTTP_CODE=$(echo "$OPS_CHECK" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Owner ops endpoint exists (HTTP 401 - auth required)"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Owner ops endpoint not found (HTTP 404)"
else
  echo "⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi
echo ""

echo "📊 Summary"
echo "=========="
echo "If all endpoints return 401 (not 404), routes are registered correctly."
echo "Next step: Log in via /quick_login.html to get authentication token."
echo ""
echo "💡 To test with authentication:"
echo "   export OWNER_DEVICE_ID='your-device-id'"
echo "   ./scripts/test-owner-auth.sh"

