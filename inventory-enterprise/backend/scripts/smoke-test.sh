#!/usr/bin/env bash
set -euo pipefail

# smoke-test.sh
# Quick health + auth verification for deployed services

RAILWAY_URL="${RAILWAY_URL:-$(railway domain 2>&1 | head -n1 | tr -d '[:space:]')}"
TEST_EMAIL="${TEST_EMAIL:-neuropilotai@gmail.com}"
TEST_PASS="${TEST_PASS:-TestPassword123!}"

if [[ -z "$RAILWAY_URL" ]]; then
  echo "❌ Cannot detect Railway URL. Set RAILWAY_URL=https://your-app.up.railway.app"
  exit 1
fi

echo "🧪 Smoke Test for $RAILWAY_URL"
echo "================================"
echo ""

# 1. Health check
echo "1️⃣  Health Check"
if curl -fsSL "$RAILWAY_URL/health" | jq -e '.status == "ok"' >/dev/null 2>&1; then
  echo "✅ Health OK"
else
  echo "❌ Health check failed"
  exit 1
fi
echo ""

# 2. Login
echo "2️⃣  Login Test"
LOGIN_JSON=$(curl -s -X POST "$RAILWAY_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")

TOKEN=$(echo "$LOGIN_JSON" | jq -r '.token // empty')
REFRESH=$(echo "$LOGIN_JSON" | jq -r '.refreshToken // empty')

if [[ -z "$TOKEN" ]]; then
  echo "❌ Login failed"
  echo "$LOGIN_JSON" | jq .
  exit 1
fi
echo "✅ Login OK (token: ${TOKEN:0:20}...)"
echo ""

# 3. Auth verification
echo "3️⃣  Auth Verification"
if curl -fsSL "$RAILWAY_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq -e '.email' >/dev/null 2>&1; then
  echo "✅ Auth OK"
else
  echo "❌ Auth verification failed"
  exit 1
fi
echo ""

# 4. Token refresh
echo "4️⃣  Token Refresh"
REFRESH_JSON=$(curl -s -X POST "$RAILWAY_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}")

NEW_TOKEN=$(echo "$REFRESH_JSON" | jq -r '.token // empty')

if [[ -z "$NEW_TOKEN" ]]; then
  echo "❌ Refresh failed"
  exit 1
fi
echo "✅ Refresh OK (new token: ${NEW_TOKEN:0:20}...)"
echo ""

echo "================================"
echo "🎉 All smoke tests passed!"
echo ""
echo "Summary:"
echo "  ✅ Health check"
echo "  ✅ Login"
echo "  ✅ Auth verification"
echo "  ✅ Token refresh"
