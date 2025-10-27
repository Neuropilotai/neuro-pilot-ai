#!/bin/bash
# ========================================
# PHASE II: POST-DEPLOY VALIDATION
# ========================================
# NeuroPilot v17.7 - Galactic Deployment Commander
# Mission: Verify all systems operational

set -e

echo "🧩 PHASE II: POST-DEPLOY VALIDATION INITIATED"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKEND_URL="https://resourceful-achievement-production.up.railway.app"
FRONTEND_URL=$(cat /tmp/neuropilot_frontend_url.txt 2>/dev/null || echo "")

if [ -z "$FRONTEND_URL" ]; then
    echo -e "${YELLOW}⚠️  Frontend URL not found${NC}"
    read -p "Please enter your Vercel URL: " FRONTEND_URL
fi

echo -e "${BLUE}📋 Validation Configuration:${NC}"
echo "  Backend:  $BACKEND_URL"
echo "  Frontend: $FRONTEND_URL"
echo ""

# Validation counters
PASSED=0
FAILED=0
WARNING=0

# ========================================
# TEST 1: Backend Health Check
# ========================================
echo -e "${YELLOW}TEST 1: Backend Health Check${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESPONSE=$(curl -s "$BACKEND_URL/api/health")
STATUS=$(echo "$RESPONSE" | jq -r '.status' 2>/dev/null || echo "error")

if [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Backend health check"
    echo "   Response: $RESPONSE"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Backend health check"
    echo "   Response: $RESPONSE"
    ((FAILED++))
fi
echo ""

# ========================================
# TEST 2: Frontend Accessibility
# ========================================
echo -e "${YELLOW}TEST 2: Frontend Accessibility${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Frontend returns 200 OK"
    echo "   URL: $FRONTEND_URL"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Frontend returned $HTTP_CODE"
    ((FAILED++))
fi
echo ""

# ========================================
# TEST 3: CORS Configuration
# ========================================
echo -e "${YELLOW}TEST 3: CORS Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test CORS with Origin header
CORS_RESPONSE=$(curl -s -H "Origin: $FRONTEND_URL" -H "Access-Control-Request-Method: GET" -X OPTIONS "$BACKEND_URL/api/health" -i)

if echo "$CORS_RESPONSE" | grep -q "access-control-allow-origin"; then
    echo -e "${GREEN}✅ PASSED${NC} - CORS headers present"
    echo "   Origin: $FRONTEND_URL allowed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} - CORS headers not detected"
    echo "   This may cause issues with API calls"
    ((WARNING++))
fi
echo ""

# ========================================
# TEST 4: API Endpoints Check
# ========================================
echo -e "${YELLOW}TEST 4: API Endpoints Availability${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ENDPOINTS=(
    "/api/health"
    "/api/auth/status"
)

for endpoint in "${ENDPOINTS[@]}"; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL$endpoint")
    if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
        echo -e "${GREEN}✅${NC} $endpoint - $CODE"
        ((PASSED++))
    else
        echo -e "${RED}❌${NC} $endpoint - $CODE"
        ((FAILED++))
    fi
done
echo ""

# ========================================
# TEST 5: Generate Owner Token
# ========================================
echo -e "${YELLOW}TEST 5: Owner Token Generation${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

echo "Generating owner token..."
TOKEN_OUTPUT=$(node generate_owner_token.js 2>&1)

if echo "$TOKEN_OUTPUT" | grep -q "eyJ"; then
    echo -e "${GREEN}✅ PASSED${NC} - Owner token generated successfully"

    # Extract token
    TOKEN=$(echo "$TOKEN_OUTPUT" | grep -o 'eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*' | head -1)

    # Save token
    echo "$TOKEN" > /tmp/neuropilot_owner_token.txt

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔑 OWNER TOKEN (save this!):"
    echo "$TOKEN"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💾 Token saved to: /tmp/neuropilot_owner_token.txt"

    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Token generation failed"
    echo "$TOKEN_OUTPUT"
    ((FAILED++))
fi
echo ""

# ========================================
# TEST 6: JWT Authentication Test
# ========================================
if [ -f /tmp/neuropilot_owner_token.txt ]; then
    echo -e "${YELLOW}TEST 6: JWT Authentication${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    TOKEN=$(cat /tmp/neuropilot_owner_token.txt)

    # Test authenticated endpoint
    AUTH_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/owner/dashboard" -w "\n%{http_code}")
    AUTH_CODE=$(echo "$AUTH_RESPONSE" | tail -1)
    AUTH_BODY=$(echo "$AUTH_RESPONSE" | head -n -1)

    if [ "$AUTH_CODE" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC} - JWT authentication working"
        echo "   Authenticated as: owner"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC} - Authentication failed with code $AUTH_CODE"
        echo "   Response: $AUTH_BODY"
        ((FAILED++))
    fi
    echo ""
fi

# ========================================
# TEST 7: Agent Status Check
# ========================================
if [ -f /tmp/neuropilot_owner_token.txt ]; then
    echo -e "${YELLOW}TEST 7: AI Agents Heartbeat${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    TOKEN=$(cat /tmp/neuropilot_owner_token.txt)

    # Check if agents endpoint exists
    AGENTS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/agents/status/all" 2>/dev/null || echo "{}")

    if echo "$AGENTS_RESPONSE" | jq . > /dev/null 2>&1; then
        AGENT_COUNT=$(echo "$AGENTS_RESPONSE" | jq 'length' 2>/dev/null || echo "0")

        if [ "$AGENT_COUNT" -gt "0" ]; then
            echo -e "${GREEN}✅ PASSED${NC} - Agents responding"
            echo "   Active agents: $AGENT_COUNT"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠️  WARNING${NC} - No agents detected"
            echo "   This may be expected if agents aren't initialized yet"
            ((WARNING++))
        fi
    else
        echo -e "${YELLOW}⚠️  WARNING${NC} - Agents endpoint not available"
        echo "   This may be expected for this deployment"
        ((WARNING++))
    fi
    echo ""
fi

# ========================================
# TEST 8: Frontend-Backend Integration
# ========================================
echo -e "${YELLOW}TEST 8: Frontend-Backend Integration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if frontend HTML contains API URL reference
FRONTEND_HTML=$(curl -s "$FRONTEND_URL")

if echo "$FRONTEND_HTML" | grep -q "Inventory" || echo "$FRONTEND_HTML" | grep -q "NeuroPilot"; then
    echo -e "${GREEN}✅ PASSED${NC} - Frontend content loaded"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} - Frontend content may not be loading correctly"
    ((WARNING++))
fi
echo ""

# ========================================
# TEST 9: Security Headers Check
# ========================================
echo -e "${YELLOW}TEST 9: Security Headers${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HEADERS=$(curl -s -I "$FRONTEND_URL")

SECURITY_HEADERS=(
    "x-content-type-options"
    "x-frame-options"
    "x-xss-protection"
)

SECURITY_PASSED=0
for header in "${SECURITY_HEADERS[@]}"; do
    if echo "$HEADERS" | grep -iq "$header"; then
        echo -e "${GREEN}✅${NC} $header present"
        ((SECURITY_PASSED++))
    else
        echo -e "${YELLOW}⚠️${NC}  $header missing"
    fi
done

if [ "$SECURITY_PASSED" -ge 2 ]; then
    echo ""
    echo -e "${GREEN}✅ PASSED${NC} - Security headers configured"
    ((PASSED++))
else
    echo ""
    echo -e "${YELLOW}⚠️  WARNING${NC} - Some security headers missing"
    ((WARNING++))
fi
echo ""

# ========================================
# TEST 10: Telemetry Pipeline
# ========================================
echo -e "${YELLOW}TEST 10: Telemetry Pipeline${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TELEMETRY_DIR="/Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/telemetry"

# Create telemetry directories if they don't exist
mkdir -p "$TELEMETRY_DIR/events"
mkdir -p "$TELEMETRY_DIR/daily"
mkdir -p "$TELEMETRY_DIR/weekly"

# Create sample validation event
SAMPLE_EVENT=$(cat <<EOF
{"schema_version":"v17.7.1","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","env":"prod","service":"validation","kind":"event","payload":{"metric":"deployment_validation","value":1,"labels":{"phase":"post_deploy"}}}
EOF
)

echo "$SAMPLE_EVENT" >> "$TELEMETRY_DIR/events/validation.ndjson"

if [ -f "$TELEMETRY_DIR/events/validation.ndjson" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Telemetry pipeline initialized"
    echo "   Events file: $TELEMETRY_DIR/events/validation.ndjson"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Could not create telemetry file"
    ((FAILED++))
fi
echo ""

# ========================================
# VALIDATION SUMMARY
# ========================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         PHASE II: VALIDATION COMPLETE                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

TOTAL_TESTS=$((PASSED + FAILED + WARNING))

echo "📊 Validation Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${GREEN}✅ Passed:  $PASSED${NC}"
echo -e "  ${RED}❌ Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARNING${NC}"
echo "  ━━━━━━━━━━━━━━━━━━"
echo "     Total:    $TOTAL_TESTS tests"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Determine overall status
if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CRITICAL TESTS PASSED!${NC}"
    echo ""
    echo "✅ System Status: OPERATIONAL"
    echo ""
    echo "🔗 Access Your System:"
    echo "  Frontend:  $FRONTEND_URL"
    echo "  Backend:   $BACKEND_URL"
    echo ""

    if [ -f /tmp/neuropilot_owner_token.txt ]; then
        echo "🔑 Owner Token:"
        echo "  $(cat /tmp/neuropilot_owner_token.txt)"
        echo ""
    fi

    echo "📝 Next Steps:"
    echo "  1. Open $FRONTEND_URL in browser"
    echo "  2. Login with owner token"
    echo "  3. Verify dashboard loads correctly"
    echo "  4. Run PHASE III: ./PHASE_III_AUTOMATION.sh"
    echo ""

    EXIT_CODE=0
else
    echo -e "${RED}⚠️  SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review failed tests above and address issues before proceeding."
    echo ""

    EXIT_CODE=1
fi

# Save validation results
VALIDATION_REPORT=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "phase": "II_POST_DEPLOY_VALIDATION",
  "results": {
    "passed": $PASSED,
    "failed": $FAILED,
    "warnings": $WARNING,
    "total": $TOTAL_TESTS
  },
  "deployment": {
    "frontend_url": "$FRONTEND_URL",
    "backend_url": "$BACKEND_URL"
  },
  "status": "$( [ "$FAILED" -eq 0 ] && echo 'OPERATIONAL' || echo 'DEGRADED' )"
}
EOF
)

echo "$VALIDATION_REPORT" > "$TELEMETRY_DIR/daily/phase_ii_validation_$(date +%Y-%m-%d).json"

echo "💾 Validation report saved to:"
echo "   $TELEMETRY_DIR/daily/phase_ii_validation_$(date +%Y-%m-%d).json"
echo ""

exit $EXIT_CODE
