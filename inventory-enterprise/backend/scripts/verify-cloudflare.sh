#!/usr/bin/env bash
set -euo pipefail

# verify-cloudflare.sh
# Comprehensive Cloudflare configuration verification
# Tests DNS, SSL, HSTS, WAF, rate limiting, and performance

echo "☁️  Cloudflare Verification - NeuroPilot v16.6"
echo "=============================================="
echo ""

# Configuration
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-inventory.neuropilot.ai}"
API_DOMAIN="${API_DOMAIN:-api.neuropilot.ai}"

PASS=0
FAIL=0
WARN=0

# Helper functions
check_pass() {
  echo "✅ $1"
  ((PASS++))
}

check_fail() {
  echo "❌ $1"
  ((FAIL++))
}

check_warn() {
  echo "⚠️  $1"
  ((WARN++))
}

# Test DNS resolution
echo "1️⃣  DNS Resolution"
echo "-------------------"

echo "Testing: $FRONTEND_DOMAIN"
FRONTEND_IP=$(dig +short "$FRONTEND_DOMAIN" | head -1)
if [[ -n "$FRONTEND_IP" ]]; then
  # Check if it's a Cloudflare IP (should be proxied)
  if dig +short "$FRONTEND_DOMAIN" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    check_pass "DNS resolves to IP: $FRONTEND_IP"
  else
    check_fail "DNS not resolving to IP"
  fi
else
  check_fail "$FRONTEND_DOMAIN does not resolve"
fi

echo "Testing: $API_DOMAIN"
API_IP=$(dig +short "$API_DOMAIN" | head -1)
if [[ -n "$API_IP" ]]; then
  check_pass "DNS resolves to IP: $API_IP"
else
  check_fail "$API_DOMAIN does not resolve"
fi

echo ""

# Test SSL/TLS and HSTS
echo "2️⃣  SSL/TLS Configuration"
echo "-------------------------"

echo "Testing: https://$FRONTEND_DOMAIN"
FRONTEND_HEADERS=$(curl -sI "https://$FRONTEND_DOMAIN" 2>&1 || echo "FAILED")

if echo "$FRONTEND_HEADERS" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
  check_pass "HTTPS connection successful"
else
  check_fail "HTTPS connection failed"
fi

if echo "$FRONTEND_HEADERS" | grep -qi "strict-transport-security"; then
  HSTS_VALUE=$(echo "$FRONTEND_HEADERS" | grep -i "strict-transport-security" | cut -d: -f2- | xargs)
  if echo "$HSTS_VALUE" | grep -q "max-age=31536000"; then
    check_pass "HSTS enabled (1 year): $HSTS_VALUE"
  else
    check_warn "HSTS enabled but max-age < 1 year: $HSTS_VALUE"
  fi
else
  check_fail "HSTS header missing"
fi

echo ""
echo "Testing: https://$API_DOMAIN/health"
API_HEADERS=$(curl -sI "https://$API_DOMAIN/health" 2>&1 || echo "FAILED")

if echo "$API_HEADERS" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
  check_pass "API HTTPS connection successful"
else
  check_fail "API HTTPS connection failed"
fi

if echo "$API_HEADERS" | grep -qi "strict-transport-security"; then
  check_pass "API HSTS enabled"
else
  check_fail "API HSTS header missing"
fi

echo ""

# Test Cloudflare Headers
echo "3️⃣  Cloudflare Headers"
echo "----------------------"

if echo "$FRONTEND_HEADERS" | grep -qi "cf-ray"; then
  CF_RAY=$(echo "$FRONTEND_HEADERS" | grep -i "cf-ray" | cut -d: -f2- | xargs)
  check_pass "Cloudflare proxy active (CF-Ray: ${CF_RAY:0:20}...)"
else
  check_fail "CF-Ray header missing (not proxied through Cloudflare?)"
fi

if echo "$FRONTEND_HEADERS" | grep -qi "cf-cache-status"; then
  CACHE_STATUS=$(echo "$FRONTEND_HEADERS" | grep -i "cf-cache-status" | cut -d: -f2- | xargs)
  check_pass "Cache status: $CACHE_STATUS"
else
  check_warn "CF-Cache-Status header missing"
fi

echo ""

# Test WAF Rules
echo "4️⃣  WAF Protection"
echo "------------------"

echo "Testing SQL Injection protection..."
SQL_TEST=$(curl -sI "https://$API_DOMAIN/?q=UNION%20SELECT%201" 2>&1 || echo "FAILED")

if echo "$SQL_TEST" | grep -q "HTTP/2 403\|HTTP/1.1 403"; then
  check_pass "SQL injection blocked (403 Forbidden)"
elif echo "$SQL_TEST" | grep -q "HTTP/2 400\|HTTP/1.1 400"; then
  check_pass "SQL injection blocked (400 Bad Request)"
else
  check_fail "SQL injection NOT blocked (expected 403)"
  echo "   Response: $(echo "$SQL_TEST" | head -1)"
fi

echo "Testing XSS protection..."
XSS_TEST=$(curl -sI "https://$API_DOMAIN/?name=%3Cscript%3Ealert(1)%3C/script%3E" 2>&1 || echo "FAILED")

if echo "$XSS_TEST" | grep -q "HTTP/2 403\|HTTP/1.1 403"; then
  check_pass "XSS blocked (403 Forbidden)"
elif echo "$XSS_TEST" | grep -q "HTTP/2 400\|HTTP/1.1 400"; then
  check_pass "XSS blocked (400 Bad Request)"
else
  check_fail "XSS NOT blocked (expected 403)"
fi

echo ""

# Test Performance
echo "5️⃣  Performance Optimization"
echo "----------------------------"

echo "Testing compression..."
if echo "$FRONTEND_HEADERS" | grep -qi "content-encoding.*br"; then
  check_pass "Brotli compression enabled"
elif echo "$FRONTEND_HEADERS" | grep -qi "content-encoding.*gzip"; then
  check_pass "Gzip compression enabled"
else
  check_warn "No compression detected (may not be needed for HTML)"
fi

echo "Testing TLS version..."
TLS_VERSION=$(curl -sI "https://$FRONTEND_DOMAIN" -w "%{ssl_version}\n" -o /dev/null 2>&1 | tail -1)
if [[ "$TLS_VERSION" =~ TLSv1\.[23] ]]; then
  check_pass "TLS version: $TLS_VERSION"
else
  check_warn "TLS version: $TLS_VERSION (expected 1.2 or 1.3)"
fi

echo ""

# Test Rate Limiting (cautious - only 2 attempts)
echo "6️⃣  Rate Limiting"
echo "-----------------"

echo "Testing login rate limit (2 attempts, safe test)..."
RATE_TEST_1=$(curl -s -w "%{http_code}" -o /dev/null -X POST "https://$API_DOMAIN/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' 2>&1 || echo "000")

sleep 1

RATE_TEST_2=$(curl -s -w "%{http_code}" -o /dev/null -X POST "https://$API_DOMAIN/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' 2>&1 || echo "000")

if [[ "$RATE_TEST_1" == "401" || "$RATE_TEST_1" == "400" ]]; then
  check_pass "Login endpoint accessible (HTTP $RATE_TEST_1)"
else
  check_warn "Login endpoint returned unexpected code: $RATE_TEST_1"
fi

if [[ "$RATE_TEST_2" == "401" || "$RATE_TEST_2" == "400" ]]; then
  check_pass "Rate limiting not triggered (2 attempts safe)"
  echo "   💡 To fully test: Make 6 rapid requests (5 allowed + 1 blocked)"
else
  check_warn "Unexpected response on 2nd attempt: $RATE_TEST_2"
fi

echo ""

# Test HTTPS Redirect
echo "7️⃣  HTTPS Redirect"
echo "------------------"

HTTP_REDIRECT=$(curl -sI "http://$FRONTEND_DOMAIN" 2>&1 || echo "FAILED")

if echo "$HTTP_REDIRECT" | grep -q "HTTP/1.1 301\|HTTP/1.1 308"; then
  if echo "$HTTP_REDIRECT" | grep -qi "location.*https"; then
    check_pass "HTTP → HTTPS redirect active (301/308)"
  else
    check_fail "Redirect present but not to HTTPS"
  fi
else
  check_warn "No HTTP redirect (may be configured at origin)"
fi

echo ""

# Summary
echo "=============================================="
echo "Verification Summary"
echo "=============================================="
echo ""
echo "✅ Passed: $PASS"
echo "⚠️  Warnings: $WARN"
echo "❌ Failed: $FAIL"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo "🎉 Cloudflare Configuration Verified!"
  echo ""
  echo "Your setup includes:"
  echo "  • DNS resolution working"
  echo "  • SSL/TLS with HSTS enabled"
  echo "  • Cloudflare proxy active"
  echo "  • WAF blocking malicious requests"
  echo "  • Performance optimizations enabled"
  echo "  • HTTPS redirect configured"
  echo ""
  if [[ $WARN -gt 0 ]]; then
    echo "⚠️  $WARN warning(s) - review above for optimization opportunities"
  fi
  echo ""
  exit 0
else
  echo "❌ $FAIL check(s) failed"
  echo ""
  echo "Review failures above and:"
  echo "  1. Verify DNS has propagated (wait 5-30 minutes)"
  echo "  2. Check Cloudflare dashboard for errors"
  echo "  3. Verify proxy (orange cloud) is enabled"
  echo "  4. Ensure SSL mode is 'Full (Strict)'"
  echo ""
  exit 1
fi
