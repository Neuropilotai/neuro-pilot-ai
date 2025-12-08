#!/bin/bash
# P1 Hardening Validation Script
# Tests all P1 features: waste sync, tenant context, read APIs, reorder alerts

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="${API_BASE:-http://127.0.0.1:8083/api}"
EMAIL="${EMAIL:-neuro.pilot.ai@gmail.com}"
PASSWORD="${PASSWORD:-Admin123!@#}"

PASSED=0
FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test function wrapper
test_case() {
    local name="$1"
    local command="$2"
    
    log_info "Testing: $name"
    if eval "$command"; then
        log_success "$name"
        return 0
    else
        log_error "$name"
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "🧪 P1 Hardening Validation Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# PHASE 1: Authentication & Tenant Context
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 1: Authentication & Tenant Context"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Login and get token
TOKEN=""
test_case "Login and get JWT token" "
    RESPONSE=\$(curl -s -X POST \${API_BASE}/auth/login \\
      -H \"Content-Type: application/json\" \\
      -d \"{\\\"email\\\":\\\"\${EMAIL}\\\",\\\"password\\\":\\\"\${PASSWORD}\\\"}\")
    TOKEN=\$(echo \$RESPONSE | jq -r '.accessToken // empty')
    if [ -z \"\$TOKEN\" ] || [ \"\$TOKEN\" == \"null\" ]; then
        echo \"Failed to get token. Response: \$RESPONSE\"
        exit 1
    fi
    echo \"Token received: \${TOKEN:0:20}...\"
"

if [ -z "$TOKEN" ]; then
    log_error "Cannot proceed without authentication token"
    exit 1
fi

# Test 2: Get org_id from /api/me
ORG_ID=""
test_case "Get org_id from /api/me endpoint" "
    RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \${API_BASE}/me)
    ORG_ID=\$(echo \$RESPONSE | jq -r '.user.org_id // empty')
    if [ -z \"\$ORG_ID\" ] || [ \"\$ORG_ID\" == \"null\" ]; then
        echo \"Failed to get org_id. Response: \$RESPONSE\"
        exit 1
    fi
    echo \"Org ID: \$ORG_ID\"
"

if [ -z "$ORG_ID" ]; then
    log_warning "Cannot get org_id, some tests may fail"
fi

# Test 3: Test X-Org-Id header
if [ -n "$ORG_ID" ]; then
    test_case "Test X-Org-Id header resolution" "
        RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \\
          -H \"X-Org-Id: \$ORG_ID\" \\
          \${API_BASE}/items?limit=1)
        SUCCESS=\$(echo \$RESPONSE | jq -r '.success // false')
        if [ \"\$SUCCESS\" != \"true\" ]; then
            echo \"X-Org-Id header not working. Response: \$RESPONSE\"
            exit 1
        fi
    "
fi

# ============================================================================
# PHASE 2: Read APIs
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 2: New Read APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 4: Inventory Snapshots List
test_case "GET /api/inventory/snapshots (list)" "
    RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \\
      \${API_BASE}/inventory/snapshots?page=1&limit=10)
    SUCCESS=\$(echo \$RESPONSE | jq -r '.success // false')
    if [ \"\$SUCCESS\" != \"true\" ]; then
        echo \"Snapshots list failed. Response: \$RESPONSE\"
        exit 1
    fi
    echo \"Response structure valid\"
"

# Test 5: Inventory Snapshots Detail (if any exist)
SNAPSHOT_ID=""
test_case "GET /api/inventory/snapshots/:id (detail) - structure check" "
    # Try to get first snapshot, or just verify endpoint exists
    RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \\
      \${API_BASE}/inventory/snapshots/1 2>&1)
    # Accept both 200 (found) and 404 (not found) as valid responses
    if echo \"\$RESPONSE\" | grep -q '\"success\"'; then
        echo \"Endpoint exists and returns valid JSON\"
    elif echo \"\$RESPONSE\" | grep -q '404'; then
        echo \"Endpoint exists (no snapshot found)\"
    else
        echo \"Unexpected response: \$RESPONSE\"
        exit 1
    fi
"

# Test 6: Batch Recipe Costing
test_case "POST /api/recipes/cost/batch - structure check" "
    # Try with empty array to test validation
    RESPONSE=\$(curl -s -X POST \\
      -H \"Authorization: Bearer \$TOKEN\" \\
      -H \"Content-Type: application/json\" \\
      -d '{\"recipe_ids\":[]}' \\
      \${API_BASE}/recipes/cost/batch)
    # Should return 400 (validation error) or 200 (if recipes exist)
    if echo \"\$RESPONSE\" | grep -q '\"success\"' || echo \"\$RESPONSE\" | grep -q '400'; then
        echo \"Endpoint exists and validates input\"
    else
        echo \"Unexpected response: \$RESPONSE\"
        exit 1
    fi
"

# ============================================================================
# PHASE 3: Reorder Alerts
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 3: Reorder Alerts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 7: Reorder Alerts Endpoint
test_case "GET /api/inventory/reorder-alerts" "
    RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \\
      \${API_BASE}/inventory/reorder-alerts?page=1&limit=10)
    SUCCESS=\$(echo \$RESPONSE | jq -r '.success // false')
    if [ \"\$SUCCESS\" != \"true\" ]; then
        echo \"Reorder alerts endpoint failed. Response: \$RESPONSE\"
        exit 1
    fi
    echo \"Response structure valid\"
"

# Test 8: Reorder Alerts with Filtering
test_case "GET /api/inventory/reorder-alerts?alert_level=urgent" "
    RESPONSE=\$(curl -s -H \"Authorization: Bearer \$TOKEN\" \\
      \${API_BASE}/inventory/reorder-alerts?alert_level=urgent&limit=5)
    SUCCESS=\$(echo \$RESPONSE | jq -r '.success // false')
    if [ \"\$SUCCESS\" != \"true\" ]; then
        echo \"Filtered alerts failed. Response: \$RESPONSE\"
        exit 1
    fi
    echo \"Filtering works\"
"

# ============================================================================
# PHASE 4: Code Validation
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 4: Code Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 9: Syntax Check - reorderAlerts.js
test_case "Syntax check: backend/services/reorderAlerts.js" "
    node -c backend/services/reorderAlerts.js
"

# Test 10: Syntax Check - inventory.js routes
test_case "Syntax check: backend/routes/inventory.js" "
    node -c backend/routes/inventory.js
"

# Test 11: Syntax Check - recipes.js routes
test_case "Syntax check: backend/routes/recipes.js" "
    node -c backend/routes/recipes.js
"

# Test 12: Migration Files Exist
test_case "Migration file exists: 040_waste_inventory_sync.sql" "
    [ -f backend/db/migrations/040_waste_inventory_sync.sql ]
"

test_case "Migration file exists: 041_reorder_alert_runs.sql" "
    [ -f backend/db/migrations/041_reorder_alert_runs.sql ]
"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📊 Validation Summary"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All P1 Hardening validation tests passed!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some validation tests failed. Please review the errors above.${NC}"
    echo ""
    exit 1
fi

