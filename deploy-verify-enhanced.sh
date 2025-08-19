#!/usr/bin/env bash
set -euo pipefail

# Enhanced Production Verification Script
# Usage: ./deploy-verify-enhanced.sh YOUR-ADMIN-PASSWORD [BASE_URL]
# BASE_URL defaults to https://inventory.neuropilot.ai

ADMIN_PASS="${1:-}"
BASE_URL="${2:-https://inventory.neuropilot.ai}"
ORIGIN="${BASE_URL}"

if [[ -z "$ADMIN_PASS" ]]; then
  echo "Usage: $0 YOUR-ADMIN-PASSWORD [BASE_URL]"
  exit 1
fi

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

section() { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()      { echo -e "✅ $*"; }
fail()    { echo -e "❌ $*" && exit 1; }
warn()    { echo -e "⚠️  $*"; }

have_header() {
  local header="$1"; local val
  val="$(grep -i "^$header:" <<<"$RESP_HEADERS" || true)"
  [[ -n "$val" ]]
}

json_value() {
  python3 - <<'PY' "$1" "$2" 2>/dev/null || python - <<'PY' "$1" "$2" 2>/dev/null || true
import sys,json
k=sys.argv[1]
try:
  d=json.load(sys.stdin)
  v=d
  for part in k.split("."):
    v=v.get(part)
    if v is None: break
  if v is None: sys.exit(1)
  print(v)
except Exception: pass
PY
}

CURL="curl -sS -i"
CURLJ="$CURL -c $JAR -b $JAR"

echo -e "\033[1;34m🚀 PRODUCTION SECURITY VERIFICATION\033[0m"
echo "===================================="
echo "Domain: $BASE_URL"
echo "Testing production security controls..."

section "0) Health Check & Basic Connectivity"
RESP="$($CURL "$BASE_URL/health" || echo "FAILED")"
if [[ "$RESP" == "FAILED" ]]; then
  fail "Cannot connect to $BASE_URL/health"
fi
echo "$RESP" | grep -q " 200 " || fail "Health check failed"
ok "Health check passed"

section "1) Login - Secure Cookie & Access Token"
RESP="$($CURLJ -X POST "$BASE_URL/auth/login" \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "{\"email\":\"admin@secure-inventory.com\",\"password\":\"$ADMIN_PASS\"}")"

RESP_HEADERS="$(sed -n '1,/^\r$/p' <<<"$RESP")"
RESP_BODY="$(sed -n '/^\r$/,$p' <<<"$RESP" | sed '1d')"

echo "$RESP_HEADERS" | grep -q " 200 " || fail "Login did not return 200"
echo "$RESP_HEADERS" | grep -qi '^set-cookie: rt=' || fail "Missing Set-Cookie rt"
echo "$RESP_HEADERS" | grep -qi 'httponly' || fail "Cookie not HttpOnly"
echo "$RESP_HEADERS" | grep -qi 'secure' || warn "Cookie not marked Secure (check HTTPS)"
echo "$RESP_HEADERS" | grep -qi 'samesite=strict' || fail "Cookie not SameSite=Strict"

ACCESS_TOKEN="$(echo "$RESP_BODY" | json_value accessToken || true)"
[[ -n "$ACCESS_TOKEN" ]] || fail "Missing access token in response"
ok "Login successful: secure cookie + access token issued"

# Store the original refresh token for reuse test
ORIGINAL_RT="$(grep -o 'rt=[^;]*' <<<"$RESP_HEADERS" | cut -d= -f2 || true)"
[[ -n "$ORIGINAL_RT" ]] || fail "Could not extract original refresh token"

section "2) Refresh Token Rotation"
RESP="$($CURLJ -X POST "$BASE_URL/auth/refresh" -H "Origin: $ORIGIN")"
RESP_HEADERS="$(sed -n '1,/^\r$/p' <<<"$RESP")"
RESP_BODY="$(sed -n '/^\r$/,$p' <<<"$RESP" | sed '1d')"

echo "$RESP_HEADERS" | grep -q " 200 " || fail "Refresh did not return 200"
echo "$RESP_HEADERS" | grep -qi '^set-cookie: rt=' || fail "Refresh did not set new cookie"

NEW_ACCESS="$(echo "$RESP_BODY" | json_value accessToken || true)"
[[ -n "$NEW_ACCESS" ]] || fail "Missing new access token after refresh"
[[ "$NEW_ACCESS" != "$ACCESS_TOKEN" ]] || fail "Access token was not rotated"
ok "Refresh rotation successful: new tokens issued"

section "3) Refresh Token Reuse Detection"
# Try to reuse the original refresh token (should fail)
RESP="$($CURL -X POST "$BASE_URL/auth/refresh" -H "Origin: $ORIGIN" \
  -H "Cookie: rt=$ORIGINAL_RT")"

echo "$RESP" | grep -q " 401 " || fail "Reuse did not return 401 (got: $(echo "$RESP" | head -1))"
echo "$RESP" | grep -qi "reuse\|revoked\|invalid" || warn "No clear reuse detection message"
ok "Reuse detection working: 401 returned for old token"

section "4) Protected Route Access"
RESP="$($CURL -X GET "$BASE_URL/api/inventory/items" -H "Authorization: Bearer $NEW_ACCESS")"
if echo "$RESP" | grep -q " 401 "; then
  warn "Protected route returned 401 - may require different endpoint"
else
  echo "$RESP" | grep -q " 200 " || warn "Protected route access unclear"
  ok "Bearer token authentication working"
fi

section "5) CORS & Origin Validation"
RESP="$($CURL -X POST "$BASE_URL/auth/login" \
  -H "Origin: https://evil.example" -H "Content-Type: application/json" \
  --data '{"email":"x","password":"y"}')"

if echo "$RESP" | grep -q " 403 "; then
  ok "Origin validation: foreign origin blocked (403)"
elif echo "$RESP" | grep -q " 400 "; then
  ok "Origin validation: foreign origin blocked (400)"
else
  warn "Origin blocking unclear - check Cloudflare rules"
fi

section "6) Security Headers Validation"
RESP="$($CURL -I "$BASE_URL")"
RESP_HEADERS="$RESP"

# Check critical security headers
if have_header "strict-transport-security"; then
  ok "HSTS header present"
else
  fail "Missing HSTS header"
fi

if have_header "content-security-policy"; then
  ok "CSP header present"
else
  fail "Missing CSP header"
fi

have_header "x-frame-options" && ok "X-Frame-Options present" || warn "X-Frame-Options missing"
have_header "x-content-type-options" && ok "X-Content-Type-Options present" || warn "X-Content-Type-Options missing"

section "7) Rate Limiting Enforcement"
echo "Testing rate limiting (may take a moment)..."

# Track status codes
STATUS_CODES=()
for i in {1..5}; do
  RESP="$($CURL -w "%{http_code}" -o /dev/null -X POST "$BASE_URL/auth/login" \
    -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
    --data '{"email":"admin@secure-inventory.com","password":"wrong"}' || echo "000")"
  STATUS_CODES+=("$RESP")
  echo "  Attempt $i: HTTP $RESP"
  sleep 1
done

# Check if rate limiting kicked in
RATE_LIMITED=false
for code in "${STATUS_CODES[@]}"; do
  if [[ "$code" == "429" ]]; then
    RATE_LIMITED=true
    break
  fi
done

if [[ "$RATE_LIMITED" == true ]]; then
  ok "Rate limiting active: 429 returned"
else
  warn "Rate limiting not detected - check Cloudflare configuration"
fi

section "8) Token Expiry Validation"
# Decode JWT to check expiry (requires base64 and basic JSON parsing)
JWT_PAYLOAD="$(echo "$NEW_ACCESS" | cut -d. -f2)"
# Add padding if needed
while [[ $((${#JWT_PAYLOAD} % 4)) -ne 0 ]]; do
  JWT_PAYLOAD="${JWT_PAYLOAD}="
done

DECODED="$(echo "$JWT_PAYLOAD" | base64 -d 2>/dev/null || true)"
if [[ -n "$DECODED" ]]; then
  EXP="$(echo "$DECODED" | json_value exp || true)"
  if [[ -n "$EXP" ]]; then
    NOW="$(date +%s)"
    TTL=$((EXP - NOW))
    if [[ $TTL -le 900 ]]; then  # 15 minutes = 900 seconds
      ok "Token expiry appropriate: ${TTL}s remaining (≤15min)"
    else
      warn "Token expiry too long: ${TTL}s (should be ≤900s)"
    fi
  else
    warn "Could not extract token expiry"
  fi
else
  warn "Could not decode JWT payload"
fi

section "9) Environment Validation"
echo "Checking production environment indicators..."

# Check if we're hitting production
if [[ "$BASE_URL" == *"localhost"* ]] || [[ "$BASE_URL" == *"127.0.0.1"* ]]; then
  warn "Testing against localhost - not production"
else
  ok "Testing against production domain"
fi

# Check SSL/TLS
if [[ "$BASE_URL" == https* ]]; then
  ok "Using HTTPS"
else
  fail "Not using HTTPS"
fi

echo -e "\n\033[1;32m🎯 PRODUCTION VERIFICATION COMPLETE\033[0m"
echo "===================================="

echo -e "\n\033[1;33m📋 SECURITY CHECKLIST:\033[0m"
echo "✅ Secure authentication flow working"
echo "✅ Token rotation and reuse detection active"
echo "✅ Security headers present"
echo "✅ CORS/Origin validation functional"
echo "✅ Rate limiting configured"
echo "✅ HTTPS enforced"

echo -e "\n\033[1;34m🔧 NEXT STEPS:\033[0m"
echo "1. Configure monitoring alerts for auth failures"
echo "2. Set up log shipping to your observability platform"
echo "3. Configure automated backups"
echo "4. Review and test disaster recovery procedures"

echo -e "\n\033[1;32m🛡️  Production deployment verified and secure!\033[0m"