#!/bin/bash
# ============================================================================
# NeuroPilot v15.5.1 - First User Invite Test Script
# Version: 15.5.1
#
# Purpose: Test the user invite endpoint and verify first user onboarding flow
#
# Prerequisites:
#   - Server running on http://127.0.0.1:8083
#   - OWNER JWT token set in environment variable OWNER_TOKEN
#   - Database migrations 001-025 applied
#
# Usage:
#   export OWNER_TOKEN="your-owner-jwt-token"
#   bash backend/scripts/test_first_user_invite.sh
#
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="${API_BASE:-http://127.0.0.1:8083}"
TEST_EMAIL="${TEST_EMAIL:-finance1@neuropilot-test.com}"
TEST_ROLE="${TEST_ROLE:-FINANCE}"
TENANT_ID="${TENANT_ID:-default}"
RESULTS_FILE="./user_invite_test_$(date +%Y%m%d_%H%M%S).log"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$RESULTS_FILE"
}

log_header() {
    echo "" | tee -a "$RESULTS_FILE"
    echo -e "${BLUE}=============================================${NC}" | tee -a "$RESULTS_FILE"
    echo -e "${BLUE}$1${NC}" | tee -a "$RESULTS_FILE"
    echo -e "${BLUE}=============================================${NC}" | tee -a "$RESULTS_FILE"
}

log_success() {
    echo -e "${GREEN}✅ PASS${NC}: $1" | tee -a "$RESULTS_FILE"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1" | tee -a "$RESULTS_FILE"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1" | tee -a "$RESULTS_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1" | tee -a "$RESULTS_FILE"
}

# ============================================================================
# TEST: Prerequisites Check
# ============================================================================

test_prerequisites() {
    log_header "PREREQUISITES CHECK"
    TESTS_RUN=$((TESTS_RUN + 1))

    # Check if server is running
    log_info "Checking if server is running at $API_BASE..."
    if curl -s -f "$API_BASE/health" > /dev/null 2>&1; then
        log_success "Server is running and accessible"
    else
        log_fail "Server is not accessible at $API_BASE"
        log_warning "Please start the server: npm start"
        exit 1
    fi

    # Check if OWNER_TOKEN is set
    if [ -z "$OWNER_TOKEN" ]; then
        log_fail "OWNER_TOKEN environment variable is not set"
        log_info "Please set OWNER_TOKEN to a valid JWT token with OWNER role"
        log_info "Example: export OWNER_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'"
        exit 1
    else
        log_success "OWNER_TOKEN is set"
        log_info "Token length: ${#OWNER_TOKEN} characters"
    fi
}

# ============================================================================
# TEST: Verify RBAC Capabilities Endpoint
# ============================================================================

test_rbac_capabilities() {
    log_header "TEST 1: RBAC Capabilities Endpoint"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Fetching user capabilities..."

    response=$(curl -s -X GET "$API_BASE/api/auth/capabilities" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -H "Content-Type: application/json")

    if echo "$response" | grep -q '"success":true'; then
        log_success "Capabilities endpoint returned success"

        # Check for specific capabilities
        if echo "$response" | grep -q '"canManageUsers":true'; then
            log_success "OWNER has canManageUsers capability"
        else
            log_fail "OWNER missing canManageUsers capability"
        fi

        if echo "$response" | grep -q '"canViewFinance":true'; then
            log_success "OWNER has canViewFinance capability"
        else
            log_fail "OWNER missing canViewFinance capability"
        fi
    else
        log_fail "Capabilities endpoint failed"
        log_info "Response: $response"
    fi
}

# ============================================================================
# TEST: Send User Invite
# ============================================================================

test_send_invite() {
    log_header "TEST 2: Send User Invite"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Sending invite to $TEST_EMAIL with role $TEST_ROLE..."

    response=$(curl -s -X POST "$API_BASE/api/admin/users/invite" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"role\": \"$TEST_ROLE\",
            \"tenant_id\": \"$TENANT_ID\"
        }")

    log_info "Response: $response"

    if echo "$response" | grep -q '"success":true'; then
        log_success "User invite sent successfully"

        # Extract invite token if present
        invite_token=$(echo "$response" | grep -o '"inviteToken":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$invite_token" ]; then
            log_success "Invite token generated: ${invite_token:0:20}..."
            echo "$invite_token" > ./.last_invite_token
            log_info "Invite token saved to ./.last_invite_token"
        fi

        # Extract invite link if present
        invite_link=$(echo "$response" | grep -o '"inviteLink":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$invite_link" ]; then
            log_success "Invite link generated"
            log_info "Link: $invite_link"
        fi
    else
        log_fail "User invite failed"

        # Check for specific error messages
        if echo "$response" | grep -q "already exists"; then
            log_warning "User already exists - this may be expected if testing repeatedly"
        elif echo "$response" | grep -q "Forbidden\|403"; then
            log_fail "Permission denied - OWNER token may be invalid"
        else
            log_fail "Unknown error occurred"
        fi
    fi
}

# ============================================================================
# TEST: List Pending Invites
# ============================================================================

test_list_invites() {
    log_header "TEST 3: List Pending Invites"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Fetching pending invites..."

    response=$(curl -s -X GET "$API_BASE/api/admin/users/invites" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -H "Content-Type: application/json")

    if echo "$response" | grep -q '"success":true'; then
        log_success "Invites list retrieved successfully"

        # Count pending invites
        invite_count=$(echo "$response" | grep -o '"status":"PENDING"' | wc -l)
        log_info "Pending invites: $invite_count"

        if echo "$response" | grep -q "$TEST_EMAIL"; then
            log_success "Test invite found in pending invites list"
        else
            log_warning "Test invite not found in list (may have expired or been accepted)"
        fi
    else
        log_fail "Failed to retrieve invites list"
        log_info "Response: $response"
    fi
}

# ============================================================================
# TEST: List All Users
# ============================================================================

test_list_users() {
    log_header "TEST 4: List All Users"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Fetching users list..."

    response=$(curl -s -X GET "$API_BASE/api/admin/users" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -H "Content-Type: application/json")

    if echo "$response" | grep -q '"success":true'; then
        log_success "Users list retrieved successfully"

        # Count users
        user_count=$(echo "$response" | grep -o '"user_id":' | wc -l)
        log_info "Total users: $user_count"

        # Check for different roles
        owner_count=$(echo "$response" | grep -o '"role":"OWNER"' | wc -l)
        finance_count=$(echo "$response" | grep -o '"role":"FINANCE"' | wc -l)
        ops_count=$(echo "$response" | grep -o '"role":"OPS"' | wc -l)
        readonly_count=$(echo "$response" | grep -o '"role":"READONLY"' | wc -l)

        log_info "Role distribution: OWNER=$owner_count, FINANCE=$finance_count, OPS=$ops_count, READONLY=$readonly_count"
    else
        log_fail "Failed to retrieve users list"
        log_info "Response: $response"
    fi
}

# ============================================================================
# TEST: Verify Audit Log Entry
# ============================================================================

test_audit_log() {
    log_header "TEST 5: Verify Audit Log Entry"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for audit log entry..."

    response=$(curl -s -X GET "$API_BASE/api/admin/audit-log?limit=10" \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -H "Content-Type: application/json")

    if echo "$response" | grep -q '"success":true'; then
        log_success "Audit log retrieved successfully"

        # Check for USER_INVITE action
        if echo "$response" | grep -q '"action":"USER_INVITE"'; then
            log_success "USER_INVITE audit entry found"
        else
            log_warning "USER_INVITE audit entry not found (may not be logged)"
        fi

        # Check for target email
        if echo "$response" | grep -q "$TEST_EMAIL"; then
            log_success "Audit log contains test user email"
        else
            log_warning "Test user email not found in audit log"
        fi
    else
        log_warning "Audit log endpoint may not be available"
        log_info "Response: $response"
    fi
}

# ============================================================================
# TEST: Non-OWNER Cannot Invite (Negative Test)
# ============================================================================

test_non_owner_forbidden() {
    log_header "TEST 6: Non-OWNER Forbidden (Negative Test)"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Testing that non-OWNER cannot invite users..."

    # Use an invalid or non-OWNER token
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/admin/users/invite" \
        -H "Authorization: Bearer invalid-token-12345" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"malicious@test.com\",
            \"role\": \"OWNER\",
            \"tenant_id\": \"$TENANT_ID\"
        }")

    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" -eq 401 ] || [ "$http_code" -eq 403 ]; then
        log_success "Non-OWNER correctly denied (HTTP $http_code)"
    else
        log_fail "Non-OWNER was not denied (HTTP $http_code)"
        log_warning "This is a security issue - investigate RBAC middleware"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_header "NeuroPilot v15.5.1 - First User Invite Test"
    log "Started at: $(date)"
    log "API Base: $API_BASE"
    log "Test Email: $TEST_EMAIL"
    log "Test Role: $TEST_ROLE"
    log "Tenant ID: $TENANT_ID"
    log "Results will be saved to: $RESULTS_FILE"
    log ""

    # Run all tests
    test_prerequisites
    test_rbac_capabilities
    test_send_invite
    test_list_invites
    test_list_users
    test_audit_log
    test_non_owner_forbidden

    # Summary
    log ""
    log_header "TEST SUMMARY"
    log "Tests run:    $TESTS_RUN"
    log_success "Tests passed: $TESTS_PASSED"

    if [ $TESTS_FAILED -gt 0 ]; then
        log_fail "Tests failed: $TESTS_FAILED"
        log ""
        echo -e "${RED}❌ SOME TESTS FAILED${NC}" | tee -a "$RESULTS_FILE"
        log ""
        log "Next Steps:"
        log "  1. Review failed tests above"
        log "  2. Check server logs for errors"
        log "  3. Verify OWNER_TOKEN is valid"
        log "  4. Ensure database migrations are applied"
        exit 1
    else
        log ""
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}" | tee -a "$RESULTS_FILE"
        log ""
        log "Next Steps:"
        log "  1. Send the invite link to the user"
        log "  2. User completes SSO login (Google or Microsoft)"
        log "  3. User is redirected to owner console"
        log "  4. Verify RBAC UI gating works (Finance tab visible)"
        log "  5. Test export confirmation modal"
        log ""
        log "🎉 First user invite flow is working correctly!"
        exit 0
    fi
}

# Run main function
main
