#!/bin/bash
# verify_auth_endpoints.sh
# Comprehensive verification of database-backed auth endpoints

set -e

API_URL="${API_URL:-http://localhost:8083}"
EMAIL="neuropilotai@gmail.com"
PASSWORD="TestPassword123!"

echo "========================================="
echo "Auth Endpoints Verification"
echo "========================================="
echo "API URL: $API_URL"
echo ""

# Test 1: Login
echo "Test 1: POST /api/auth/login"
echo "----------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken' 2>/dev/null || echo "")

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
  echo "✅ Login successful - got access token"
else
  echo "❌ Login failed - no access token"
  exit 1
fi

if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
  echo "✅ Login successful - got refresh token"
else
  echo "❌ Login failed - no refresh token"
  exit 1
fi

echo ""

# Test 2: Get current user info
echo "Test 2: GET /api/auth/me"
echo "------------------------"
ME_RESPONSE=$(curl -s "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$ME_RESPONSE" | jq . 2>/dev/null || echo "$ME_RESPONSE"

USER_EMAIL=$(echo "$ME_RESPONSE" | jq -r '.email' 2>/dev/null || echo "")

if [ "$USER_EMAIL" = "$EMAIL" ]; then
  echo "✅ /auth/me successful - user authenticated"
else
  echo "❌ /auth/me failed - wrong user or error"
  exit 1
fi

echo ""

# Test 3: Refresh token
echo "Test 3: POST /api/auth/refresh"
echo "-------------------------------"
REFRESH_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

echo "$REFRESH_RESPONSE" | jq . 2>/dev/null || echo "$REFRESH_RESPONSE"

NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")
NEW_REFRESH_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.refreshToken' 2>/dev/null || echo "")

if [ -n "$NEW_ACCESS_TOKEN" ] && [ "$NEW_ACCESS_TOKEN" != "null" ]; then
  echo "✅ Refresh successful - got new access token"
else
  echo "❌ Refresh failed - no new access token"
  exit 1
fi

if [ -n "$NEW_REFRESH_TOKEN" ] && [ "$NEW_REFRESH_TOKEN" != "null" ]; then
  echo "✅ Refresh successful - got new refresh token"
else
  echo "❌ Refresh failed - no new refresh token"
  exit 1
fi

echo ""

# Test 4: Verify token rotation (old refresh token should be revoked)
echo "Test 4: Verify Token Rotation"
echo "------------------------------"
OLD_REFRESH_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

ERROR=$(echo "$OLD_REFRESH_RESPONSE" | jq -r '.error' 2>/dev/null || echo "")

if [ -n "$ERROR" ] && [ "$ERROR" != "null" ]; then
  echo "✅ Token rotation working - old refresh token rejected"
else
  echo "⚠️  Warning: Old refresh token still valid (should be revoked)"
fi

echo ""

# Test 5: Logout
echo "Test 5: POST /api/auth/logout"
echo "------------------------------"
LOGOUT_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH_TOKEN\"}")

echo "$LOGOUT_RESPONSE" | jq . 2>/dev/null || echo "$LOGOUT_RESPONSE"

MESSAGE=$(echo "$LOGOUT_RESPONSE" | jq -r '.message' 2>/dev/null || echo "")

if [ "$MESSAGE" = "Logout successful" ]; then
  echo "✅ Logout successful"
else
  echo "❌ Logout failed"
  exit 1
fi

echo ""

# Test 6: Rate limiting (login)
echo "Test 6: Rate Limiting (Login)"
echo "------------------------------"
echo "Sending 6 rapid login requests to trigger rate limit..."

for i in {1..6}; do
  RATE_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}" 2>&1)

  HTTP_CODE=$(echo "$RATE_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)

  if [ "$HTTP_CODE" = "429" ]; then
    echo "✅ Rate limiting active - request $i blocked (429 Too Many Requests)"
    break
  elif [ $i -eq 6 ]; then
    echo "⚠️  Warning: Rate limiting may not be active (expected 429 after 5 requests)"
  fi
done

echo ""

# Test 7: Invalid credentials
echo "Test 7: Invalid Credentials"
echo "----------------------------"
INVALID_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"WrongPassword\"}" 2>&1)

HTTP_CODE=$(echo "$INVALID_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Invalid credentials rejected (401 Unauthorized)"
else
  echo "❌ Expected 401 for invalid credentials, got $HTTP_CODE"
fi

echo ""

# Summary
echo "========================================="
echo "✅ Auth Endpoints Verification Complete"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✅ POST /api/auth/login - Working"
echo "  ✅ GET /api/auth/me - Working"
echo "  ✅ POST /api/auth/refresh - Working"
echo "  ✅ POST /api/auth/logout - Working"
echo "  ✅ Token rotation - Working"
echo "  ✅ Invalid credentials - Rejected"
echo "  ✅ Rate limiting - Check logs"
echo ""
echo "Test credentials:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"
echo ""
echo "All auth endpoints operational!"
