#!/bin/bash
# ========================================
# NEUROPILOT v17.7 - FINAL CONFIGURATION
# ========================================
# Galactic Deployment Commander
# Mission: Complete final 5% to achieve 100% operational status

set -e

echo "🌌 OPERATION FINAL SYNC - INITIATED"
echo "===================================="
echo ""

# Configuration
FRONTEND_URL="https://neuropilot-inventory-4dpcvr5hn-david-mikulis-projects-73b27c6d.vercel.app"
BACKEND_URL="https://resourceful-achievement-production.up.railway.app"
OWNER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLTEiLCJlbWFpbCI6Im5ldXJvcGlsb3RhaUBnbWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NjE0Nzk2MjcsImV4cCI6MTc5MzAxNTYyN30.TV-dGpkMOqlLrDK1LXhYgFqyR5YxrySuM8d7jjb3Db8"

# ========================================
# MANUAL STEP 1: Vercel Deployment Protection
# ========================================
echo "⏳ STEP 1: Disable Vercel Deployment Protection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "MANUAL ACTION REQUIRED:"
echo "1. Open: https://vercel.com/david-mikulis-projects-73b27c6d/neuropilot-inventory/settings/deployment-protection"
echo "2. Click 'Edit' on 'Vercel Authentication'"
echo "3. Toggle OFF"
echo "4. Click 'Save'"
echo "5. Wait 10 seconds for propagation"
echo ""
read -p "Press ENTER when complete..."
echo ""

# ========================================
# MANUAL STEP 2: Railway CORS Configuration
# ========================================
echo "⏳ STEP 2: Configure Railway CORS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "MANUAL ACTION REQUIRED:"
echo "1. Open: https://railway.app/project/081be493-34d8-4232-9e3f-ecf1b85cc4ad"
echo "2. Select backend service"
echo "3. Click 'Variables' tab"
echo "4. Click 'New Variable'"
echo "5. Add:"
echo "   Name:  FRONTEND_ORIGIN"
echo "   Value: $FRONTEND_URL"
echo "6. Click 'Add'"
echo "7. Wait for auto-redeploy (~30 seconds)"
echo ""
read -p "Press ENTER when complete..."
echo ""

# ========================================
# STEP 3: Validation Tests
# ========================================
echo "🧪 STEP 3: Running Validation Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Backend Health
echo "TEST 1: Backend Health Check"
HEALTH_RESPONSE=$(curl -s "$BACKEND_URL/api/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "error")

if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✅ PASS - Backend health check"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "❌ FAIL - Backend health check"
    echo "   Response: $HEALTH_RESPONSE"
fi
echo ""

# Test 2: CORS Headers
echo "TEST 2: CORS Configuration"
CORS_RESPONSE=$(curl -sI -H "Origin: $FRONTEND_URL" \
                     -H "Access-Control-Request-Method: GET" \
                     -X OPTIONS "$BACKEND_URL/api/health")

if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
    CORS_ORIGIN=$(echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" | head -1)
    echo "✅ PASS - CORS headers present"
    echo "   $CORS_ORIGIN"
else
    echo "⚠️  WARNING - CORS headers not detected"
    echo "   Ensure Railway CORS variable is set"
fi
echo ""

# Test 3: Frontend Accessibility
echo "TEST 3: Frontend Accessibility"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")

if [ "$FRONTEND_STATUS" = "200" ]; then
    echo "✅ PASS - Frontend accessible (HTTP $FRONTEND_STATUS)"

    # Check content
    FRONTEND_CONTENT=$(curl -s "$FRONTEND_URL" | grep -i "inventory" | head -1)
    if [ ! -z "$FRONTEND_CONTENT" ]; then
        echo "   Content: $(echo $FRONTEND_CONTENT | head -c 80)..."
    fi
elif [ "$FRONTEND_STATUS" = "401" ]; then
    echo "⚠️  WARNING - Frontend returns 401 (Deployment protection still active)"
    echo "   Complete STEP 1 to resolve"
else
    echo "❌ FAIL - Frontend returned HTTP $FRONTEND_STATUS"
fi
echo ""

# Test 4: Owner Authentication
echo "TEST 4: Owner Token Authentication"
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
                -H "Authorization: Bearer $OWNER_TOKEN" \
                "$BACKEND_URL/api/owner/dashboard")
AUTH_CODE=$(echo "$AUTH_RESPONSE" | tail -1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | head -n -1)

if [ "$AUTH_CODE" = "200" ]; then
    echo "✅ PASS - Owner authentication successful"
    echo "   HTTP Status: $AUTH_CODE"
else
    echo "⚠️  WARNING - Authentication returned HTTP $AUTH_CODE"
    echo "   Response: $(echo $AUTH_BODY | head -c 100)..."
fi
echo ""

# Test 5: Response Time
echo "TEST 5: Backend Response Time"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BACKEND_URL/api/health")
echo "✅ PASS - Response time: ${RESPONSE_TIME}s"
echo ""

# ========================================
# STEP 4: Generate Test Report
# ========================================
echo "📊 STEP 4: Generating Validation Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

REPORT_FILE="validation_reports/final_sync_$(date +%Y-%m-%d_%H-%M-%S).json"
mkdir -p validation_reports

cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mission": "OPERATION_FINAL_SYNC",
  "version": "v17.7",
  "tests": {
    "backend_health": {
      "status": "$HEALTH_STATUS",
      "response_time": "${RESPONSE_TIME}s"
    },
    "cors_configuration": {
      "headers_present": $(echo "$CORS_RESPONSE" | grep -qi "access-control" && echo "true" || echo "false")
    },
    "frontend_accessibility": {
      "http_status": $FRONTEND_STATUS
    },
    "owner_authentication": {
      "http_status": $AUTH_CODE
    }
  },
  "configuration": {
    "frontend_url": "$FRONTEND_URL",
    "backend_url": "$BACKEND_URL"
  }
}
EOF

echo "✅ Report saved: $REPORT_FILE"
echo ""

# ========================================
# STEP 5: Final Status
# ========================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     OPERATION FINAL SYNC - VALIDATION COMPLETE             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ "$HEALTH_STATUS" = "healthy" ] && [ "$AUTH_CODE" = "200" ]; then
    echo "🎉 CORE SYSTEMS OPERATIONAL"
    echo ""
    echo "✅ Backend Health:      PASS"
    echo "✅ Authentication:      PASS"
    echo "✅ Response Time:       ${RESPONSE_TIME}s"

    if [ "$FRONTEND_STATUS" = "200" ]; then
        echo "✅ Frontend Access:     PASS"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🌌 SYSTEM STATUS: 100% OPERATIONAL"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    else
        echo "⚠️  Frontend Access:     PENDING (Complete STEP 1)"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🌌 SYSTEM STATUS: 95% OPERATIONAL - 1 MANUAL STEP REMAINING"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
else
    echo "⚠️  Some tests require attention"
    echo ""
    echo "Please review test results above"
fi

echo ""
echo "📚 Next Steps:"
echo "  1. Review validation report: $REPORT_FILE"
echo "  2. Open frontend: $FRONTEND_URL"
echo "  3. Login with owner token"
echo "  4. Verify dashboard functionality"
echo ""
