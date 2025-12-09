#!/bin/bash
# Test Owner Authentication and Finance Endpoint
# Usage: ./scripts/test-owner-auth.sh [email] [password] [device-id]

set -e

BASE_URL="${RAILWAY_URL:-https://inventory-backend-production-3a2c.up.railway.app}"
EMAIL="${1:-neuropilotai@gmail.com}"
PASSWORD="${2:-Admin123!@#}"
DEVICE_ID="${3:-${OWNER_DEVICE_ID}}"

if [ -z "$DEVICE_ID" ]; then
  echo "❌ Error: Device ID required"
  echo "Usage: $0 [email] [password] [device-id]"
  echo "Or set OWNER_DEVICE_ID environment variable"
  exit 1
fi

echo "🧪 Testing Owner Authentication"
echo "================================"
echo "Base URL: $BASE_URL"
echo "Email: $EMAIL"
echo "Device ID: $DEVICE_ID"
echo ""

# Step 1: Login
echo "📝 Step 1: Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${ACCESS_TOKEN:0:20}..."
echo ""

# Step 2: Test auth-check endpoint
echo "🔍 Step 2: Testing auth-check endpoint..."
AUTH_CHECK=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/owner/auth-check" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID")

HTTP_CODE=$(echo "$AUTH_CHECK" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$AUTH_CHECK" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Auth-check passed"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Auth-check failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
echo ""

# Step 3: Test finance endpoint
echo "💰 Step 3: Testing finance endpoint..."
FINANCE_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/owner/reports/finance" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID")

HTTP_CODE=$(echo "$FINANCE_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$FINANCE_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Finance endpoint working"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Finance endpoint failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
echo ""

# Step 4: Test ops/status endpoint
echo "⚙️  Step 4: Testing ops/status endpoint..."
OPS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/owner/ops/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID")

HTTP_CODE=$(echo "$OPS_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$OPS_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Ops/status endpoint working"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ Ops/status endpoint failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
echo ""

echo "🎉 All tests passed!"
echo ""
echo "💡 To use in browser:"
echo "1. Visit: $BASE_URL/quick_login.html"
echo "2. Login with email: $EMAIL"
echo "3. Enter device ID: $DEVICE_ID"
echo "4. Token will be stored in localStorage as 'np_owner_jwt'"
echo "5. Device will be stored as 'np_owner_device'"

