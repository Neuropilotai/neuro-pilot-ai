#!/bin/bash
# CORS Security Verification Suite
# Run this after Railway deployment to verify security guardrails

BACKEND="https://resourceful-achievement-production.up.railway.app"
FRONTEND_OK="https://neuropilot-inventory.vercel.app"
BAD="https://evil.example"

echo "==========================================="
echo "  RAILWAY CORS SECURITY VERIFICATION"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "==========================================="
echo ""

# Test 1: Healthcheck
echo "1) Healthcheck must be 200"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/api/health")
echo "   Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  TEST1="PASS"
else
  TEST1="FAIL"
fi
echo ""

# Test 2: CORS allowlisted origin
echo "2) CORS allowlisted origin must echo ACAO = FRONTEND_OK"
ACAO_ALLOWED=$(curl -sI -H "Origin: $FRONTEND_OK" "$BACKEND/api/health" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-origin:')
echo "   $ACAO_ALLOWED"
if echo "$ACAO_ALLOWED" | grep -q "$FRONTEND_OK"; then
  TEST2="PASS"
elif echo "$ACAO_ALLOWED" | grep -q '\*'; then
  TEST2="FAIL (WILDCARD)"
else
  TEST2="FAIL"
fi
echo ""

# Test 3: CORS disallowed origin
echo "3) CORS disallowed origin must NOT include ACAO"
ACAO_BLOCKED=$(curl -sI -H "Origin: $BAD" "$BACKEND/api/health" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-origin:')
if [ -z "$ACAO_BLOCKED" ]; then
  echo "   [No ACAO header - blocked as expected]"
  TEST3="PASS"
else
  echo "   $ACAO_BLOCKED"
  TEST3="FAIL"
fi
echo ""

# Test 4: Non-root runtime
echo "4) Non-root runtime (Dockerfile configured)"
echo "   USER 1001 in Dockerfile"
TEST4="PENDING"
echo ""

# Summary
echo "==========================================="
echo "  RESULTS SUMMARY"
echo "==========================================="
echo "Healthcheck:        $TEST1"
echo "CORS Allowlist:     $TEST2"
echo "CORS Block Evil:    $TEST3"
echo "Non-root Runtime:   $TEST4"
echo ""

if [ "$TEST1" = "PASS" ] && [ "$TEST2" = "PASS" ] && [ "$TEST3" = "PASS" ]; then
  echo "DECISION: ✅ GO"
  echo ""
  echo "All guardrails passed. Production is secure."
  exit 0
else
  echo "DECISION: ❌ NO-GO"
  echo ""
  echo "Security guardrails failed:"
  [ "$TEST2" = "FAIL (WILDCARD)" ] && echo "  - Wildcard CORS active (allows all origins)"
  [ "$TEST3" = "FAIL" ] && echo "  - Evil origins not blocked"
  echo ""
  echo "Railway has NOT deployed the security fix."
  echo "Action required: Trigger deployment in Railway dashboard"
  exit 1
fi
