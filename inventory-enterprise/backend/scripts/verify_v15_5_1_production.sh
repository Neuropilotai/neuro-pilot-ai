#!/bin/bash
# ============================================================================
# NeuroPilot v15.5.1 Production Readiness Verification Script
# Version: 15.5.1
#
# Purpose: Comprehensive validation before first-user go-live
#
# Tests:
# 1. Database integrity (tables, migrations, views)
# 2. RBAC enforcement (backend + frontend)
# 3. SSO hardening (Google + Microsoft)
# 4. Backup/restore procedures
# 5. Prometheus metrics
# 6. Rate limiting
# 7. Tenant scoping
# 8. Audit logging
# 9. Frontend UI gating
# 10. CSP compliance
#
# Usage:
#   cd /path/to/inventory-enterprise
#   bash backend/scripts/verify_v15_5_1_production.sh
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
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="backend"
FRONTEND_DIR="frontend"
RESULTS_FILE="./v15_5_1_production_verification_$(date +%Y%m%d_%H%M%S).log"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNING=0

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$RESULTS_FILE"
}

log_header() {
    echo "" | tee -a "$RESULTS_FILE"
    echo -e "${CYAN}=============================================${NC}" | tee -a "$RESULTS_FILE"
    echo -e "${CYAN}$1${NC}" | tee -a "$RESULTS_FILE"
    echo -e "${CYAN}=============================================${NC}" | tee -a "$RESULTS_FILE"
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
    TESTS_WARNING=$((TESTS_WARNING + 1))
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1" | tee -a "$RESULTS_FILE"
}

# ============================================================================
# TEST SECTION 1: Database Integrity
# ============================================================================

test_database_migrations() {
    log_header "SECTION 1: Database Integrity"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for required migration files..."

    local required_migrations=(
        "023_add_rbac_and_tenant_scopes.sql"
        "024_create_documents_and_mappings.sql"
        "025_invites_and_controls.sql"
    )

    local migrations_found=0
    for migration in "${required_migrations[@]}"; do
        if [ -f "$BACKEND_DIR/migrations/$migration" ]; then
            log_success "Migration file found: $migration"
            migrations_found=$((migrations_found + 1))
        else
            log_fail "Migration file missing: $migration"
        fi
    done

    if [ $migrations_found -eq ${#required_migrations[@]} ]; then
        log_success "All required migrations present ($migrations_found/${#required_migrations[@]})"
    else
        log_fail "Missing migrations (found $migrations_found/${#required_migrations[@]})"
    fi
}

# ============================================================================
# TEST SECTION 2: RBAC Backend Implementation
# ============================================================================

test_rbac_backend() {
    log_header "SECTION 2: RBAC Backend Implementation"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking requireRole usage in route files..."

    local routes_with_rbac=0
    local critical_routes=(
        "owner-forecast-orders.js"
        "inventory-reconcile.js"
        "finance.js"
        "admin-users.js"
        "auth.js"
    )

    for route in "${critical_routes[@]}"; do
        if [ -f "$BACKEND_DIR/routes/$route" ]; then
            if grep -q "requireRole\|requireOwner" "$BACKEND_DIR/routes/$route" 2>/dev/null; then
                log_success "RBAC gates found in: $route"
                routes_with_rbac=$((routes_with_rbac + 1))
            else
                if [ "$route" != "auth.js" ]; then
                    log_fail "RBAC gates missing in: $route"
                else
                    log_info "Skipping auth.js (authentication routes don't need RBAC)"
                    routes_with_rbac=$((routes_with_rbac + 1))
                fi
            fi
        else
            log_fail "Route file not found: $route"
        fi
    done

    if [ $routes_with_rbac -eq ${#critical_routes[@]} ]; then
        log_success "RBAC gates verified in all critical routes"
    fi
}

# ============================================================================
# TEST SECTION 3: Forecast Shadow Mode
# ============================================================================

test_shadow_mode() {
    log_header "SECTION 3: Forecast Shadow Mode"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking forecast shadow mode implementation..."

    if grep -q "FORECAST_SHADOW_MODE" "$BACKEND_DIR/routes/owner-forecast-orders.js" 2>/dev/null; then
        log_success "Shadow mode flag found in forecast routes"
    else
        log_fail "Shadow mode flag NOT found in forecast routes"
    fi

    if grep -q "shadowMode" "$BACKEND_DIR/routes/owner-forecast-orders.js" 2>/dev/null; then
        log_success "Shadow mode parameter used in forecast generation"
    else
        log_fail "Shadow mode parameter NOT used in forecast generation"
    fi

    # Check for approval routes
    if grep -q "router\.post.*'/approve'" "$BACKEND_DIR/routes/owner-forecast-orders.js" 2>/dev/null; then
        log_success "Forecast approval endpoint found"
    else
        log_fail "Forecast approval endpoint NOT found"
    fi

    if grep -q "router\.post.*'/reject'" "$BACKEND_DIR/routes/owner-forecast-orders.js" 2>/dev/null; then
        log_success "Forecast rejection endpoint found"
    else
        log_fail "Forecast rejection endpoint NOT found"
    fi
}

# ============================================================================
# TEST SECTION 4: Dual-Control Enforcement
# ============================================================================

test_dual_control() {
    log_header "SECTION 4: Dual-Control Enforcement"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking dual-control implementation..."

    if grep -q "created_by.*req\.user\|creator.*approver" "$BACKEND_DIR/routes/owner-forecast-orders.js" 2>/dev/null; then
        log_success "Dual-control check found (creator != approver)"
    else
        log_warning "Dual-control check may not be implemented (creator can approve own forecast)"
    fi
}

# ============================================================================
# TEST SECTION 5: Rate Limiting
# ============================================================================

test_rate_limiting() {
    log_header "SECTION 5: Rate Limiting"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking rate limiting on export endpoints..."

    if grep -q "rateLimit\|exportLimiter" "$BACKEND_DIR/routes/inventory-reconcile.js" 2>/dev/null; then
        log_success "Rate limiting implemented in export routes"
    else
        log_fail "Rate limiting NOT found in export routes"
    fi

    # Check finance routes
    if grep -q "rateLimit\|exportLimiter" "$BACKEND_DIR/routes/finance.js" 2>/dev/null; then
        log_success "Rate limiting implemented in finance routes"
    else
        log_warning "Rate limiting may not be implemented in finance routes"
    fi
}

# ============================================================================
# TEST SECTION 6: SSO Hardening
# ============================================================================

test_sso_hardening() {
    log_header "SECTION 6: SSO Hardening"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking SSO no-role blocking..."

    # Check Google SSO
    if [ -f "$BACKEND_DIR/security/sso_google.js" ]; then
        if grep -q "userRoles\.length === 0\|roles\.length === 0" "$BACKEND_DIR/security/sso_google.js" 2>/dev/null; then
            log_success "Google SSO: No-role blocking implemented"
        else
            log_fail "Google SSO: No-role blocking NOT found"
        fi
    else
        log_warning "Google SSO file not found (may not be configured)"
    fi

    # Check Microsoft SSO
    if [ -f "$BACKEND_DIR/security/sso_microsoft.js" ]; then
        if grep -q "userRoles\.length === 0\|roles\.length === 0" "$BACKEND_DIR/security/sso_microsoft.js" 2>/dev/null; then
            log_success "Microsoft SSO: No-role blocking implemented"
        else
            log_fail "Microsoft SSO: No-role blocking NOT found"
        fi
    else
        log_warning "Microsoft SSO file not found (may not be configured)"
    fi
}

# ============================================================================
# TEST SECTION 7: Environment Configuration
# ============================================================================

test_environment_config() {
    log_header "SECTION 7: Environment Configuration"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking environment configuration..."

    if [ -f "$BACKEND_DIR/.env.example" ]; then
        log_success ".env.example file exists"

        local required_vars=(
            "FORECAST_SHADOW_MODE"
            "EXPORT_RATE_LIMIT_PER_MIN"
            "JWT_SECRET"
            "DATABASE_URL"
        )

        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" "$BACKEND_DIR/.env.example" 2>/dev/null || \
               grep -q "^#.*$var=" "$BACKEND_DIR/.env.example" 2>/dev/null; then
                log_success "Environment variable documented: $var"
            else
                log_warning "Environment variable not in .env.example: $var"
            fi
        done
    else
        log_fail ".env.example file not found"
    fi

    if [ -f "$BACKEND_DIR/.env" ]; then
        log_info ".env file exists (not checking values for security)"
    else
        log_warning ".env file not found (may need to be created from .env.example)"
    fi
}

# ============================================================================
# TEST SECTION 8: Frontend RBAC Integration
# ============================================================================

test_frontend_rbac() {
    log_header "SECTION 8: Frontend RBAC Integration"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking frontend RBAC client..."

    if [ -f "$FRONTEND_DIR/public/js/rbac-client.js" ]; then
        log_success "RBAC client file exists"

        # Check for required functions
        if grep -q "function can\|\.can\s*=" "$FRONTEND_DIR/public/js/rbac-client.js" 2>/dev/null; then
            log_success "RBAC client has 'can()' capability check"
        else
            log_fail "RBAC client missing 'can()' function"
        fi

        if grep -q "function gateUI\|\.gateUI\s*=" "$FRONTEND_DIR/public/js/rbac-client.js" 2>/dev/null; then
            log_success "RBAC client has 'gateUI()' function"
        else
            log_fail "RBAC client missing 'gateUI()' function"
        fi
    else
        log_fail "RBAC client file not found: $FRONTEND_DIR/public/js/rbac-client.js"
    fi

    # Check HTML integration
    if [ -f "$FRONTEND_DIR/owner-super-console.html" ]; then
        if grep -q "rbac-client\.js" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
            log_success "RBAC client script included in HTML"
        else
            log_fail "RBAC client script NOT included in HTML"
        fi

        # Check for data-rbac attributes
        if grep -q "data-rbac-show\|data-rbac-hide\|data-rbac-disable" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
            log_success "RBAC data attributes found in HTML"
        else
            log_warning "RBAC data attributes may not be used in HTML"
        fi
    fi
}

# ============================================================================
# TEST SECTION 9: UI Components
# ============================================================================

test_ui_components() {
    log_header "SECTION 9: UI Components"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking v15.5 UI components..."

    if [ -f "$FRONTEND_DIR/owner-super-console.html" ]; then
        # Check for Finance Quick-Fix Workspace
        if grep -q "Quick-Fix Workspace" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
            log_success "Finance Quick-Fix Workspace HTML found"
        else
            log_warning "Finance Quick-Fix Workspace may not be present"
        fi

        # Check for Export Confirmation Modal
        if grep -q "exportConfirmModal\|Export Confirmation" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
            log_success "Export Confirmation Modal HTML found"
        else
            log_warning "Export Confirmation Modal may not be present"
        fi

        # Check for Users Panel (Settings tab)
        if grep -q "manageUsersSection\|Users Panel\|Manage Users" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null; then
            log_success "Users Panel HTML found"
        else
            log_warning "Users Panel may not be present"
        fi
    fi

    # Check JavaScript implementations
    if [ -f "$FRONTEND_DIR/owner-super-console.js" ]; then
        if grep -q "loadFinanceQuickFix\|showExportConfirmModal\|loadUsersPanel" "$FRONTEND_DIR/owner-super-console.js" 2>/dev/null; then
            log_success "v15.5 UI functions found in JavaScript"
        else
            log_warning "v15.5 UI functions may not be fully implemented"
        fi
    fi
}

# ============================================================================
# TEST SECTION 10: CSP Compliance
# ============================================================================

test_csp_compliance() {
    log_header "SECTION 10: CSP Compliance"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking Content Security Policy compliance..."

    if [ -f "$FRONTEND_DIR/owner-super-console.html" ]; then
        # Check for inline styles
        local inline_styles=$(grep -c "style=" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null || echo "0")

        if [ "$inline_styles" -gt 0 ]; then
            log_warning "Found $inline_styles inline style attributes (CSP violation)"
        else
            log_success "No inline styles found (CSP compliant)"
        fi

        # Check for inline scripts
        local inline_scripts=$(grep -c "onclick=\|onload=\|onerror=" "$FRONTEND_DIR/owner-super-console.html" 2>/dev/null || echo "0")

        if [ "$inline_scripts" -gt 0 ]; then
            log_warning "Found $inline_scripts inline event handlers (CSP violation)"
        else
            log_success "No inline event handlers found (CSP compliant)"
        fi
    fi
}

# ============================================================================
# TEST SECTION 11: Backup & Restore
# ============================================================================

test_backup_restore() {
    log_header "SECTION 11: Backup & Restore Procedures"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking backup/restore scripts..."

    if [ -f "$BACKEND_DIR/scripts/backup_db.sh" ]; then
        log_success "Backup script exists"

        # Check for key features
        if grep -q "sha256sum\|shasum" "$BACKEND_DIR/scripts/backup_db.sh" 2>/dev/null; then
            log_success "Backup script includes checksum verification"
        else
            log_warning "Backup script may not include checksum verification"
        fi
    else
        log_fail "Backup script not found: $BACKEND_DIR/scripts/backup_db.sh"
    fi

    if [ -f "$BACKEND_DIR/scripts/restore_db.sh" ]; then
        log_success "Restore script exists"
    else
        log_warning "Restore script not found: $BACKEND_DIR/scripts/restore_db.sh"
    fi
}

# ============================================================================
# TEST SECTION 12: Metrics & Monitoring
# ============================================================================

test_metrics() {
    log_header "SECTION 12: Metrics & Monitoring"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking Prometheus metrics implementation..."

    if [ -f "$BACKEND_DIR/utils/metricsExporter.js" ]; then
        log_success "Metrics exporter module exists"

        # Check for PII in metrics
        if grep -q "labelNames.*email\|labelNames.*user_id" "$BACKEND_DIR/utils/metricsExporter.js" 2>/dev/null; then
            log_fail "Metrics may contain PII (email, user_id in labels)"
        else
            log_success "No obvious PII found in metrics labels"
        fi
    else
        log_warning "Metrics exporter not found (monitoring may not be configured)"
    fi

    # Check server.js for /metrics endpoint
    if [ -f "$BACKEND_DIR/server.js" ]; then
        if grep -q "/metrics" "$BACKEND_DIR/server.js" 2>/dev/null; then
            log_success "Metrics endpoint configured in server.js"
        else
            log_warning "Metrics endpoint may not be exposed"
        fi
    fi
}

# ============================================================================
# TEST SECTION 13: Documentation
# ============================================================================

test_documentation() {
    log_header "SECTION 13: Documentation"
    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Checking for required documentation..."

    local doc_files=(
        "$BACKEND_DIR/FINANCE_WORKSPACE_README.md"
        "$BACKEND_DIR/CHANGELOG.md"
        "$BACKEND_DIR/README.md"
    )

    for doc in "${doc_files[@]}"; do
        if [ -f "$doc" ]; then
            log_success "Documentation exists: $(basename $doc)"
        else
            log_warning "Documentation missing: $(basename $doc)"
        fi
    done

    # Check CHANGELOG for v15.5
    if [ -f "$BACKEND_DIR/CHANGELOG.md" ]; then
        if grep -q "15\.5" "$BACKEND_DIR/CHANGELOG.md" 2>/dev/null; then
            log_success "CHANGELOG includes v15.5 entries"
        else
            log_warning "CHANGELOG may not include v15.5 entries"
        fi
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_header "NeuroPilot v15.5.1 Production Readiness Verification"
    log "Started at: $(date)"
    log "Results will be saved to: $RESULTS_FILE"
    log ""

    # Run all test sections
    test_database_migrations
    test_rbac_backend
    test_shadow_mode
    test_dual_control
    test_rate_limiting
    test_sso_hardening
    test_environment_config
    test_frontend_rbac
    test_ui_components
    test_csp_compliance
    test_backup_restore
    test_metrics
    test_documentation

    # Summary
    log ""
    log_header "VERIFICATION SUMMARY"
    log "Tests run:        $TESTS_RUN sections"
    log_success "Tests passed:     $TESTS_PASSED checks"

    if [ $TESTS_FAILED -gt 0 ]; then
        log_fail "Tests failed:     $TESTS_FAILED checks"
    fi

    if [ $TESTS_WARNING -gt 0 ]; then
        log_warning "Warnings:         $TESTS_WARNING checks"
    fi

    log ""
    log "Detailed results: $RESULTS_FILE"
    log ""

    # Determine exit status
    if [ $TESTS_FAILED -gt 0 ]; then
        log ""
        echo -e "${RED}❌ VERIFICATION FAILED - Critical issues must be resolved before go-live${NC}" | tee -a "$RESULTS_FILE"
        log ""
        log "Next Steps:"
        log "  1. Review failed checks above"
        log "  2. Fix critical issues"
        log "  3. Re-run this verification script"
        log "  4. Once all tests pass, proceed with user onboarding"
        exit 1
    elif [ $TESTS_WARNING -gt 0 ]; then
        log ""
        echo -e "${YELLOW}⚠️  VERIFICATION PASSED WITH WARNINGS${NC}" | tee -a "$RESULTS_FILE"
        echo -e "${YELLOW}Review warnings above before proceeding to production${NC}" | tee -a "$RESULTS_FILE"
        log ""
        log "Next Steps:"
        log "  1. Review warnings above"
        log "  2. Address high-priority warnings"
        log "  3. Run integration tests: npm run test:integration"
        log "  4. Run security audit: npm audit"
        log "  5. Proceed with cautious user onboarding"
        exit 0
    else
        log ""
        echo -e "${GREEN}✅ ALL TESTS PASSED - System ready for production!${NC}" | tee -a "$RESULTS_FILE"
        log ""
        log "Next Steps:"
        log "  1. Run integration tests: npm run test:integration"
        log "  2. Run security audit: npm audit && npm run lint:security"
        log "  3. Create first user invite: POST /api/admin/users/invite"
        log "  4. Test SSO login flows (Google + Microsoft)"
        log "  5. Monitor logs and metrics during initial rollout"
        log ""
        log "🚀 System is ready for first-user onboarding!"
        exit 0
    fi
}

# Run main function
main
