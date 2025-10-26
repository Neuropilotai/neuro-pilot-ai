#!/bin/bash
# ============================================================================
# NeuroPilot v15.5.1 Frontend RBAC Verification Script
# Version: 15.5.1
#
# Purpose: Verify frontend role-based UI gating implementation
#
# Tests:
# 1. RBAC helper functions exist (hasRole, gateUI, etc.)
# 2. Shadow Mode badge HTML element exists
# 3. Confidence chip creation functions exist
# 4. UI gating is called on page load
# 5. Role-based tab visibility gating
# 6. Export button disabling for non-FINANCE roles
# 7. Approval button disabling for non-FINANCE/OWNER roles
#
# Usage:
#   ./scripts/verify_v15_5_1_frontend_rbac.sh
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
FRONTEND_DIR="./frontend"
RESULTS_FILE="./frontend_rbac_verification_$(date +%Y%m%d_%H%M%S).log"

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
# TEST: Check for RBAC Helper Functions
# ============================================================================

test_rbac_helpers() {
    log ""
    log "========================================="
    log "TEST: Checking RBAC Helper Functions"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Scanning owner-super-console.js for RBAC helpers..."

    local helpers_found=0
    local required_helpers=("hasRole" "setDisabled" "gateUI" "updateShadowModeBadge" "getConfidenceColor" "createConfidenceChip")

    for helper in "${required_helpers[@]}"; do
        if grep -q "function $helper" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
            log_success "Found RBAC helper: $helper"
            helpers_found=$((helpers_found + 1))
        else
            log_fail "Missing RBAC helper: $helper"
        fi
    done

    if [ $helpers_found -eq ${#required_helpers[@]} ]; then
        log_success "All RBAC helper functions found ($helpers_found/${#required_helpers[@]})"
    else
        log_fail "Missing RBAC helpers (found $helpers_found/${#required_helpers[@]})"
    fi
}

# ============================================================================
# TEST: Check for Shadow Mode Badge HTML
# ============================================================================

test_shadow_mode_badge() {
    log ""
    log "========================================="
    log "TEST: Checking Shadow Mode Badge HTML"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Scanning owner-super-console.html for shadow mode badge..."

    if grep -q 'id="badge-shadow-mode"' "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
        log_success "Shadow mode badge HTML element found"
    else
        log_fail "Shadow mode badge HTML element NOT found"
        return
    fi

    if grep -q 'badge-warn' "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null && \
       grep -q 'u-hide' "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
        log_success "Shadow mode badge has correct classes (badge-warn, u-hide)"
    else
        log_warning "Shadow mode badge may be missing correct CSS classes"
    fi

    if grep -q 'Shadow Mode (no auto-apply)' "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
        log_success "Shadow mode badge has correct text content"
    else
        log_warning "Shadow mode badge text may differ from spec"
    fi
}

# ============================================================================
# TEST: Check for Confidence Chip Functions
# ============================================================================

test_confidence_chip_functions() {
    log ""
    log "========================================="
    log "TEST: Checking Confidence Chip Functions"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Scanning owner-super-console.js for confidence chip functions..."

    if grep -q "function getConfidenceColor" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "getConfidenceColor function found"
    else
        log_fail "getConfidenceColor function NOT found"
    fi

    if grep -q "function createConfidenceChip" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "createConfidenceChip function found"
    else
        log_fail "createConfidenceChip function NOT found"
    fi

    # Check for correct thresholds (≥85% = ok, 70-84% = warn, <70% = bad)
    if grep -q "confidence >= 85" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "Confidence threshold (≥85% = ok) found"
    else
        log_warning "Confidence threshold (≥85% = ok) may be different"
    fi

    if grep -q "confidence >= 70" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "Confidence threshold (≥70% = warn) found"
    else
        log_warning "Confidence threshold (≥70% = warn) may be different"
    fi
}

# ============================================================================
# TEST: Check for UI Gating Integration
# ============================================================================

test_ui_gating_integration() {
    log ""
    log "========================================="
    log "TEST: Checking UI Gating Integration"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking if gateUI() is called on page load..."

    if grep -q "window.gateUI()" "$FRONTEND_DIR/owner-console-core.js" 2>/dev/null; then
        log_success "gateUI() called in initialization (owner-console-core.js)"
    else
        log_fail "gateUI() NOT called in initialization"
    fi

    if grep -q "window.currentUser" "$FRONTEND_DIR/owner-console-core.js" 2>/dev/null; then
        log_success "window.currentUser set in initialization"
    else
        log_fail "window.currentUser NOT set in initialization"
    fi

    if grep -q "window.appConfig" "$FRONTEND_DIR/owner-console-core.js" 2>/dev/null; then
        log_success "window.appConfig loaded in initialization"
    else
        log_fail "window.appConfig NOT loaded in initialization"
    fi
}

# ============================================================================
# TEST: Check for Role-Based Tab Gating
# ============================================================================

test_tab_gating() {
    log ""
    log "========================================="
    log "TEST: Checking Role-Based Tab Gating"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking if tabs are gated by role..."

    # Check for Finance tab gating (FINANCE, OWNER only)
    if grep -A 2 "financials" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null | grep -q "hasRole.*FINANCE.*OWNER"; then
        log_success "Finance tab gated to FINANCE/OWNER roles"
    else
        log_fail "Finance tab gating NOT found"
    fi

    # Check for Forecast tab gating (OPS, FINANCE, OWNER)
    if grep -A 2 "forecast" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null | grep -q "hasRole.*OPS.*FINANCE.*OWNER"; then
        log_success "Forecast tab gated to OPS/FINANCE/OWNER roles"
    else
        log_fail "Forecast tab gating NOT found"
    fi
}

# ============================================================================
# TEST: Check for Button Disabling
# ============================================================================

test_button_disabling() {
    log ""
    log "========================================="
    log "TEST: Checking Button Disabling Logic"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking if export buttons are disabled for non-FINANCE roles..."

    if grep -q "exportFinancial\|downloadShoppingListCSV" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null && \
       grep -q "setDisabled.*!hasRole.*FINANCE.*OWNER" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "Export buttons are disabled for non-FINANCE/OWNER roles"
    else
        log_warning "Export button disabling logic may differ"
    fi

    log_info "Checking if approval buttons are disabled for non-FINANCE roles..."

    if grep -q "approveForecast\|rejectForecast" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null && \
       grep -q "setDisabled.*!hasRole.*FINANCE.*OWNER" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "Approval buttons are disabled for non-FINANCE/OWNER roles"
    else
        log_warning "Approval button disabling logic may differ"
    fi
}

# ============================================================================
# TEST: Check for Confidence Chip Usage in Forecast Rendering
# ============================================================================

test_confidence_chip_usage() {
    log ""
    log "========================================="
    log "TEST: Checking Confidence Chip Usage"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking if confidence chips are used in forecast rendering..."

    if grep -q "createConfidenceChip(confidence)" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
        log_success "createConfidenceChip() called in forecast rendering"
    else
        log_fail "createConfidenceChip() NOT used in forecast rendering"
    fi

    # Count occurrences
    local chip_count=$(grep -c "createConfidenceChip" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null || echo "0")
    log_info "createConfidenceChip() used in $chip_count location(s)"

    if [ "$chip_count" -ge 2 ]; then
        log_success "Confidence chips used in multiple forecast views"
    else
        log_warning "Confidence chips may only be used in one forecast view"
    fi
}

# ============================================================================
# TEST: Check for Version Updates
# ============================================================================

test_version_updates() {
    log ""
    log "========================================="
    log "TEST: Checking Version Updates"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking if version was updated to v15.5.1..."

    if grep -q "v15.5.1" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
        log_success "HTML file updated to v15.5.1"
    else
        log_warning "HTML file version may not be v15.5.1"
    fi

    if grep -q "v=15.5.1" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
        log_success "CSS/JS cache-busting version updated to v15.5.1"
    else
        log_warning "Cache-busting version may not be v15.5.1"
    fi
}

# ============================================================================
# TEST: Check RBAC Integration Test Files
# ============================================================================

test_rbac_test_files() {
    log ""
    log "========================================="
    log "TEST: Checking RBAC Integration Test Files"
    log "========================================="
    TESTS_RUN=$((TESTS_RUN + 1))

    local test_files=(
        "backend/tests/integration/rbac/finance_readonly_forbidden.spec.js"
        "backend/tests/integration/rbac/ops_no_approval.spec.js"
        "backend/tests/integration/rbac/finance_can_export.spec.js"
        "backend/tests/integration/rbac/owner_can_backup_restore_stub.spec.js"
        "backend/tests/integration/rbac/deny_by_default_missing_gate.spec.js"
        "backend/tests/integration/support/jwtMocks.js"
    )

    local files_found=0
    for file in "${test_files[@]}"; do
        if [ -f "$file" ]; then
            log_success "Found test file: $file"
            files_found=$((files_found + 1))
        else
            log_fail "Missing test file: $file"
        fi
    done

    if [ $files_found -eq ${#test_files[@]} ]; then
        log_success "All RBAC integration test files found ($files_found/${#test_files[@]})"
    else
        log_fail "Missing RBAC test files (found $files_found/${#test_files[@]})"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log "========================================="
    log "NeuroPilot v15.5.1 Frontend RBAC Verification"
    log "========================================="
    log "Started at: $(date)"
    log "Results will be saved to: $RESULTS_FILE"
    log ""

    # Run all tests
    test_rbac_helpers
    test_shadow_mode_badge
    test_confidence_chip_functions
    test_ui_gating_integration
    test_tab_gating
    test_button_disabling
    test_confidence_chip_usage
    test_version_updates
    test_rbac_test_files

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
        log_success "✅ ALL TESTS PASSED - Frontend RBAC verified successfully!"
        log ""
        log "Next Steps:"
        log "  1. Review the results log: cat $RESULTS_FILE"
        log "  2. Run backend RBAC verification: bash backend/scripts/verify_v15_5_rbac.sh"
        log "  3. Run integration tests: npm run test:integration"
        log "  4. Test manually in browser with different role tokens"
        exit 0
    fi
}

# Run main function
main
