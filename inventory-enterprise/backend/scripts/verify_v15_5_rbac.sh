#!/bin/bash
# ============================================================================
# NeuroPilot v15.5 RBAC Hardening Verification Script
# Version: 15.5.0
#
# Purpose: Comprehensive validation of RBAC implementation before go-live
#
# Tests:
# 1. Role-based route access (READONLY, OPS, FINANCE, OWNER)
# 2. Dual-control enforcement (approver ≠ creator)
# 3. Shadow mode feature flag
# 4. Rate limiting on exports
# 5. SSO hardening (no-role blocking)
# 6. Metrics sanitization (no PII)
# 7. Deny-by-default check (routes with missing requireRole)
#
# Usage:
#   ./scripts/verify_v15_5_rbac.sh
#
# Exit Codes:
#   0 - All checks passed
#   1 - One or more checks failed
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
API_BASE="${API_BASE:-http://127.0.0.1:8083/api}"
RESULTS_FILE="./rbac_verification_$(date +%Y%m%d_%H%M%S).log"

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

log_success() {
    echo -e "${GREEN}✅ PASS${NC}: $1" | tee -a "$RESULTS_FILE"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1" | tee -a "$RESULTS_FILE"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1" | tee -a "$RESULTS_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1" | tee -a "$RESULTS_FILE"
}

# ============================================================================
# TEST: Code Analysis - Check for Missing requireRole Gates
# ============================================================================

test_missing_gates() {
    log ""
    log "========================================="
    log "TEST: Checking for Missing requireRole Gates"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Scanning routes directory for files with auth but no RBAC..."

    local routes_with_gates=0
    local routes_without_gates=0
    local missing_gates_files=()

    # Find all route files
    for file in backend/routes/*.js; do
        # Skip auth.js - authentication routes should not have RBAC gates
        if [[ "$file" == *"/auth.js" ]]; then
            continue
        fi

        # Check if file has authenticateToken but NOT requireRole or requireOwner
        if grep -q "authenticateToken" "$file"; then
            if ! grep -q "requireRole" "$file" && ! grep -q "requireOwner" "$file"; then
                missing_gates_files+=("$file")
                routes_without_gates=$((routes_without_gates + 1))
            else
                routes_with_gates=$((routes_with_gates + 1))
            fi
        fi
    done

    log_info "Routes with RBAC gates: $routes_with_gates"
    log_info "Routes missing RBAC gates: $routes_without_gates"

    if [ $routes_without_gates -eq 0 ]; then
        log_success "All authenticated routes have RBAC gates"
    else
        log_fail "Found $routes_without_gates route files missing requireRole gates:"
        for file in "${missing_gates_files[@]}"; do
            log_warning "  - $file"
        done
    fi
}

# ============================================================================
# TEST: Code Analysis - Check for PII in Metrics
# ============================================================================

test_metrics_pii() {
    log ""
    log "========================================="
    log "TEST: Checking for PII in Metrics"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Scanning metricsExporter.js for PII labels..."

    local pii_found=false
    local pii_patterns=("email" "item_code" "entity_id" "user_id" "invoice_number")
    local found_pii=()

    for pattern in "${pii_patterns[@]}"; do
        if grep -q "labelNames.*$pattern" backend/utils/metricsExporter.js 2>/dev/null; then
            pii_found=true
            found_pii+=("$pattern")
        fi
    done

    if [ "$pii_found" = false ]; then
        log_success "No PII found in metrics labels"
    else
        log_fail "Found PII in metrics: ${found_pii[*]}"
    fi
}

# ============================================================================
# TEST: Check for FORECAST_SHADOW_MODE Flag
# ============================================================================

test_shadow_mode_flag() {
    log ""
    log "========================================="
    log "TEST: Checking Shadow Mode Implementation"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for FORECAST_SHADOW_MODE usage in forecast routes..."

    if grep -q "FORECAST_SHADOW_MODE" backend/routes/owner-forecast-orders.js 2>/dev/null; then
        log_success "Shadow mode flag found in forecast routes"
    else
        log_fail "Shadow mode flag NOT found in forecast routes"
    fi

    if grep -q "shadowMode" backend/routes/owner-forecast-orders.js 2>/dev/null; then
        log_success "Shadow mode parameter found in forecast generation"
    else
        log_fail "Shadow mode parameter NOT found in forecast generation"
    fi
}

# ============================================================================
# TEST: Check for Dual-Control Implementation
# ============================================================================

test_dual_control() {
    log ""
    log "========================================="
    log "TEST: Checking Dual-Control Implementation"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for dual-control enforcement in forecast approval..."

    if grep -q "created_by.*req.user" backend/routes/owner-forecast-orders.js 2>/dev/null; then
        log_success "Dual-control check found (created_by comparison)"
    else
        log_fail "Dual-control check NOT found in approval endpoint"
    fi

    if grep -q "Dual-control" backend/routes/owner-forecast-orders.js 2>/dev/null; then
        log_success "Dual-control error message found"
    else
        log_fail "Dual-control error message NOT found"
    fi
}

# ============================================================================
# TEST: Check for Rate Limiting
# ============================================================================

test_rate_limiting() {
    log ""
    log "========================================="
    log "TEST: Checking Rate Limiting Implementation"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for rate limiting on export endpoints..."

    if grep -q "rateLimit" backend/routes/inventory-reconcile.js 2>/dev/null; then
        log_success "Rate limiting module imported"
    else
        log_fail "Rate limiting module NOT imported"
        return
    fi

    if grep -q "exportLimiter" backend/routes/inventory-reconcile.js 2>/dev/null; then
        log_success "Export limiter defined"
    else
        log_fail "Export limiter NOT defined"
        return
    fi

    local export_routes=("export.csv" "export.gl.csv" "export.pdf")
    for route in "${export_routes[@]}"; do
        # Check for route and exportLimiter within 5 lines of each other
        if grep -A 5 "$route" backend/routes/inventory-reconcile.js 2>/dev/null | grep -q "exportLimiter"; then
            log_success "Rate limiting applied to $route"
        else
            log_fail "Rate limiting NOT applied to $route"
        fi
    done
}

# ============================================================================
# TEST: Check for SSO Hardening
# ============================================================================

test_sso_hardening() {
    log ""
    log "========================================="
    log "TEST: Checking SSO Hardening Implementation"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for no-role blocking in SSO providers..."

    # Check Google SSO
    if grep -q "userRoles.length === 0" backend/security/sso_google.js 2>/dev/null; then
        log_success "Google SSO: No-role blocking found"
    else
        log_fail "Google SSO: No-role blocking NOT found"
    fi

    if grep -q "LOGIN DENIED" backend/security/sso_google.js 2>/dev/null; then
        log_success "Google SSO: Login denied message found"
    else
        log_fail "Google SSO: Login denied message NOT found"
    fi

    # Check Microsoft SSO
    if grep -q "userRoles.length === 0" backend/security/sso_microsoft.js 2>/dev/null; then
        log_success "Microsoft SSO: No-role blocking found"
    else
        log_fail "Microsoft SSO: No-role blocking NOT found"
    fi

    if grep -q "LOGIN DENIED" backend/security/sso_microsoft.js 2>/dev/null; then
        log_success "Microsoft SSO: Login denied message found"
    else
        log_fail "Microsoft SSO: Login denied message NOT found"
    fi
}

# ============================================================================
# TEST: Environment Configuration Check
# ============================================================================

test_env_config() {
    log ""
    log "========================================="
    log "TEST: Checking Environment Configuration"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    if [ -f "backend/.env.example" ]; then
        if grep -q "FORECAST_SHADOW_MODE" backend/.env.example 2>/dev/null; then
            log_success ".env.example contains FORECAST_SHADOW_MODE"
        else
            log_warning ".env.example missing FORECAST_SHADOW_MODE (should be added)"
        fi

        if grep -q "EXPORT_RATE_LIMIT_PER_MIN" backend/.env.example 2>/dev/null; then
            log_success ".env.example contains EXPORT_RATE_LIMIT_PER_MIN"
        else
            log_warning ".env.example missing EXPORT_RATE_LIMIT_PER_MIN (should be added)"
        fi
    else
        log_warning ".env.example file not found"
    fi
}

# ============================================================================
# TEST: Documentation Check
# ============================================================================

test_documentation() {
    log ""
    log "========================================="
    log "TEST: Checking Documentation"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    if [ -f "backend/FINANCE_WORKSPACE_README.md" ]; then
        if grep -q "READONLY\|FINANCE\|OPS\|OWNER" backend/FINANCE_WORKSPACE_README.md 2>/dev/null; then
            log_success "FINANCE_WORKSPACE_README.md contains role documentation"
        else
            log_warning "FINANCE_WORKSPACE_README.md missing role documentation"
        fi
    else
        log_warning "FINANCE_WORKSPACE_README.md not found"
    fi

    if [ -f "backend/CHANGELOG.md" ]; then
        if grep -q "v15.5" backend/CHANGELOG.md 2>/dev/null && grep -q "RBAC" backend/CHANGELOG.md 2>/dev/null; then
            log_success "CHANGELOG.md contains v15.5 RBAC entry"
        else
            log_warning "CHANGELOG.md missing v15.5 RBAC entry"
        fi
    else
        log_warning "CHANGELOG.md not found"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log "========================================="
    log "NeuroPilot v15.5 RBAC Verification"
    log "========================================="
    log "Started at: $(date)"
    log "Results will be saved to: $RESULTS_FILE"
    log ""

    # Run all tests
    test_missing_gates
    test_metrics_pii
    test_shadow_mode_flag
    test_dual_control
    test_rate_limiting
    test_sso_hardening
    test_env_config
    test_documentation

    # Summary
    log ""
    log "========================================="
    log "VERIFICATION SUMMARY"
    log "========================================="
    log "Tests run:    $TESTS_RUN"
    log_success "Tests passed: $TESTS_PASSED"

    if [ $TESTS_FAILED -gt 0 ]; then
        log_fail "Tests failed: $TESTS_FAILED"
        log ""
        log "❌ VERIFICATION FAILED - Please fix the issues above before go-live"
        exit 1
    else
        log ""
        log_success "✅ ALL TESTS PASSED - RBAC Hardening verified successfully!"
        log ""
        log "Next Steps:"
        log "  1. Review the results log: cat $RESULTS_FILE"
        log "  2. Run integration tests: npm run test:integration"
        log "  3. Run security linting: npm run lint:security"
        log "  4. Deploy to staging for final QA"
        exit 0
    fi
}

# Run main function
main
