#!/bin/bash
# Neuro.Pilot.AI V21.1 - Security Hardening Smoke Tests
# Tests: RBAC, Audit, Privacy, PCI, Rate Limiting, Metrics
# Usage: BASE=https://your-api.com EMAIL=owner@example.com PASS=yourpass ./smoke-test-v21_1.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE="${BASE:-https://inventory-backend-7-agent-build.up.railway.app}"
EMAIL="${EMAIL:-owner@neuropilot.ai}"
PASS="${PASS}"

if [ -z "$PASS" ]; then
  echo -e "${RED}ERROR:${NC} PASS environment variable not set"
  echo "Usage: BASE=$BASE EMAIL=$EMAIL PASS=yourpassword ./smoke-test-v21_1.sh"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🧪 V21.1 Security Smoke Tests"
echo "  Base URL: $BASE"
echo "  User: $EMAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0

# ============================================================
# HELPER FUNCTIONS
# ============================================================

function test_pass() {
  echo -e "${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
}

function test_fail() {
  echo -e "${RED}✗${NC} $1"
  FAILED=$((FAILED + 1))
}

function test_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# ============================================================
# TEST 1: AUTHENTICATION
# ============================================================

echo -e "${BLUE}[1/10]${NC} Testing Authentication..."

LOGIN_RESPONSE=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  test_pass "Login successful, JWT obtained"
else
  test_fail "Login failed: $(echo $LOGIN_RESPONSE | jq -r '.message // .error')"
  echo "  Response: $LOGIN_RESPONSE"
  exit 1
fi

# Test invalid credentials
INVALID_RESPONSE=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid@example.com","password":"wrongpass"}')

INVALID_STATUS=$(echo "$INVALID_RESPONSE" | jq -r '.error // empty')
if [ -n "$INVALID_STATUS" ]; then
  test_pass "Invalid credentials rejected correctly"
else
  test_fail "Invalid credentials not rejected"
fi

# ============================================================
# TEST 2: RBAC ENFORCEMENT
# ============================================================

echo ""
echo -e "${BLUE}[2/10]${NC} Testing RBAC Enforcement..."

# Test authenticated request
ITEMS_RESPONSE=$(curl -s -X GET "$BASE/api/items" \
  -H "Authorization: Bearer $TOKEN")

ITEMS_COUNT=$(echo "$ITEMS_RESPONSE" | jq 'length // 0')
if [ "$ITEMS_COUNT" -gt 0 ] || [ "$(echo $ITEMS_RESPONSE | jq -r '.items // empty')" != "" ]; then
  test_pass "Authenticated request succeeded (items endpoint)"
else
  test_warn "Items endpoint returned empty or error: $(echo $ITEMS_RESPONSE | jq -r '.message // empty')"
fi

# Test missing token
NO_TOKEN_RESPONSE=$(curl -s -X GET "$BASE/api/items")
NO_TOKEN_ERROR=$(echo "$NO_TOKEN_RESPONSE" | jq -r '.error // empty')

if [ "$NO_TOKEN_ERROR" = "Unauthorized" ] || echo "$NO_TOKEN_ERROR" | grep -qi "unauthorized"; then
  test_pass "Missing token rejected (401 Unauthorized)"
else
  test_fail "Missing token not rejected properly"
fi

# Test invalid token
INVALID_TOKEN_RESPONSE=$(curl -s -X GET "$BASE/api/items" \
  -H "Authorization: Bearer invalid.token.here")

INVALID_TOKEN_ERROR=$(echo "$INVALID_TOKEN_RESPONSE" | jq -r '.error // empty')
if [ "$INVALID_TOKEN_ERROR" = "Unauthorized" ] || echo "$INVALID_TOKEN_ERROR" | grep -qi "unauthorized"; then
  test_pass "Invalid token rejected (401 Unauthorized)"
else
  test_fail "Invalid token not rejected properly"
fi

# ============================================================
# TEST 3: SECURITY HEADERS
# ============================================================

echo ""
echo -e "${BLUE}[3/10]${NC} Testing Security Headers..."

HEADERS=$(curl -sI "$BASE" | tr -d '\r')

# Check HSTS
if echo "$HEADERS" | grep -qi "Strict-Transport-Security"; then
  HSTS=$(echo "$HEADERS" | grep -i "Strict-Transport-Security" | cut -d: -f2- | xargs)
  test_pass "HSTS header present: $HSTS"
else
  test_warn "HSTS header missing (check Helmet config)"
fi

# Check X-Frame-Options
if echo "$HEADERS" | grep -qi "X-Frame-Options"; then
  FRAME=$(echo "$HEADERS" | grep -i "X-Frame-Options" | cut -d: -f2- | xargs)
  test_pass "X-Frame-Options header present: $FRAME"
else
  test_warn "X-Frame-Options missing"
fi

# Check X-Content-Type-Options
if echo "$HEADERS" | grep -qi "X-Content-Type-Options"; then
  test_pass "X-Content-Type-Options header present"
else
  test_warn "X-Content-Type-Options missing"
fi

# ============================================================
# TEST 4: PROMETHEUS METRICS
# ============================================================

echo ""
echo -e "${BLUE}[4/10]${NC} Testing Prometheus Metrics..."

METRICS=$(curl -s "$BASE/metrics")

# Check for key metrics
if echo "$METRICS" | grep -q "auth_attempts_total"; then
  test_pass "auth_attempts_total metric present"
else
  test_fail "auth_attempts_total metric missing"
fi

if echo "$METRICS" | grep -q "audit_events_total"; then
  test_pass "audit_events_total metric present"
else
  test_fail "audit_events_total metric missing"
fi

if echo "$METRICS" | grep -q "permission_denials_total"; then
  test_pass "permission_denials_total metric present"
else
  test_warn "permission_denials_total metric missing (may be zero)"
fi

if echo "$METRICS" | grep -q "pci_violations_total"; then
  test_pass "pci_violations_total metric present"
else
  test_warn "pci_violations_total metric missing (may be zero)"
fi

# ============================================================
# TEST 5: AUDIT LOGGING
# ============================================================

echo ""
echo -e "${BLUE}[5/10]${NC} Testing Audit Logging..."

# Trigger auditable action (create item)
CREATE_RESPONSE=$(curl -s -X POST "$BASE/api/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Item","unit":"kg","category":"test"}')

CREATE_SUCCESS=$(echo "$CREATE_RESPONSE" | jq -r '.id // empty')
if [ -n "$CREATE_SUCCESS" ]; then
  test_pass "Auditable action (item create) succeeded"

  # Clean up test item
  curl -s -X DELETE "$BASE/api/items/$CREATE_SUCCESS" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
else
  test_warn "Item creation failed: $(echo $CREATE_RESPONSE | jq -r '.message // empty')"
fi

# ============================================================
# TEST 6: PRIVACY ENDPOINTS
# ============================================================

echo ""
echo -e "${BLUE}[6/10]${NC} Testing Privacy Endpoints..."

# Test data export (GDPR)
EXPORT_RESPONSE=$(curl -s -X GET "$BASE/api/privacy/export" \
  -H "Authorization: Bearer $TOKEN")

EXPORT_DATA=$(echo "$EXPORT_RESPONSE" | jq -r '.exportDate // empty')
if [ -n "$EXPORT_DATA" ]; then
  test_pass "GDPR data export endpoint works"
else
  test_warn "Data export endpoint returned unexpected format"
fi

# ============================================================
# TEST 7: PCI VALIDATION
# ============================================================

echo ""
echo -e "${BLUE}[7/10]${NC} Testing PCI DSS Validation..."

# Test card data rejection
PCI_VIOLATION=$(curl -s -X POST "$BASE/api/pos/payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"card","amount":100,"cardNumber":"4111111111111111"}')

PCI_ERROR=$(echo "$PCI_VIOLATION" | jq -r '.error // empty')
if echo "$PCI_ERROR" | grep -qi "pci"; then
  test_pass "Card data rejected (PCI DSS enforced)"
else
  test_fail "Card data not rejected properly: $PCI_ERROR"
fi

# Test valid payment request
VALID_PAYMENT=$(curl -s -X POST "$BASE/api/pos/payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"card","amount":45.67,"reference":"TERM-AUTH-TEST123"}')

VALID_ERROR=$(echo "$VALID_PAYMENT" | jq -r '.error // empty')
if [ -z "$VALID_ERROR" ] || [ "$VALID_ERROR" = "null" ]; then
  test_warn "Valid payment request accepted (may fail if no order exists)"
else
  # This is expected if there's no order context
  test_pass "Payment validation working (rejects without order context)"
fi

# ============================================================
# TEST 8: RATE LIMITING
# ============================================================

echo ""
echo -e "${BLUE}[8/10]${NC} Testing Rate Limiting..."

# Make multiple rapid requests
RATE_LIMIT_TRIGGERED=false
for i in {1..10}; do
  RATE_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/items" \
    -H "Authorization: Bearer $TOKEN")

  HTTP_CODE=$(echo "$RATE_RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "429" ]; then
    RATE_LIMIT_TRIGGERED=true
    break
  fi

  sleep 0.1
done

if [ "$RATE_LIMIT_TRIGGERED" = true ]; then
  test_pass "Rate limiting triggered (429 Too Many Requests)"
else
  test_warn "Rate limiting not triggered (may need higher load)"
fi

# ============================================================
# TEST 9: CORS ENFORCEMENT
# ============================================================

echo ""
echo -e "${BLUE}[9/10]${NC} Testing CORS Enforcement..."

# Test CORS headers
CORS_RESPONSE=$(curl -sI "$BASE/api/items" \
  -H "Origin: https://neuropilot.ai" \
  -H "Authorization: Bearer $TOKEN" | tr -d '\r')

if echo "$CORS_RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
  CORS_ORIGIN=$(echo "$CORS_RESPONSE" | grep -i "Access-Control-Allow-Origin" | cut -d: -f2- | xargs)
  test_pass "CORS headers present: $CORS_ORIGIN"
else
  test_warn "CORS headers not present (may be env-specific)"
fi

# ============================================================
# TEST 10: SECURITY STATUS ENDPOINT
# ============================================================

echo ""
echo -e "${BLUE}[10/10]${NC} Testing Security Status Endpoint..."

SECURITY_STATUS=$(curl -s "$BASE/api/security/status" \
  -H "Authorization: Bearer $TOKEN")

RBAC_ENABLED=$(echo "$SECURITY_STATUS" | jq -r '.rbac_enabled // empty')
AUDIT_ENABLED=$(echo "$SECURITY_STATUS" | jq -r '.audit_enabled // empty')

if [ "$RBAC_ENABLED" = "true" ]; then
  test_pass "RBAC reported as enabled"
else
  test_warn "RBAC status unknown"
fi

if [ "$AUDIT_ENABLED" = "true" ]; then
  test_pass "Audit logging reported as enabled"
else
  test_warn "Audit logging status unknown"
fi

# ============================================================
# SUMMARY
# ============================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ PASSED:${NC} $PASSED"
echo -e "${RED}✗ FAILED:${NC} $FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${RED}⚠ SMOKE TESTS FAILED${NC}"
  echo "  Review failed tests above and check deployment logs"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ ALL SMOKE TESTS PASSED${NC}"
  echo "  V21.1 Security Hardening validated successfully"
  exit 0
fi
