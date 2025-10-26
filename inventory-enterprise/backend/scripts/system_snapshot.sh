#!/bin/bash
# ============================================================================
# NeuroPilot Enterprise System Snapshot Generator
# Version: 15.5.3
#
# Purpose: Generate comprehensive system state report for certification
#
# Outputs:
#   - Migration versions
#   - Database checksum
#   - NAS mount verification
#   - RBAC matrix summary
#   - TLS cert fingerprint
#   - Metrics snapshot
#   - Configuration summary
#
# Usage:
#   bash backend/scripts/system_snapshot.sh
#
# Exit Codes:
#   0 - Snapshot generated successfully
#   1 - Snapshot generation failed
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="backend"
FRONTEND_DIR="frontend"
DATA_DIR="data"
SNAPSHOT_FILE="./system_snapshot_$(date +%Y%m%d_%H%M%S).txt"

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$SNAPSHOT_FILE"
}

log_header() {
    echo "" | tee -a "$SNAPSHOT_FILE"
    echo -e "${CYAN}=============================================${NC}" | tee -a "$SNAPSHOT_FILE"
    echo -e "${CYAN}$1${NC}" | tee -a "$SNAPSHOT_FILE"
    echo -e "${CYAN}=============================================${NC}" | tee -a "$SNAPSHOT_FILE"
}

log_info() {
    echo -e "${BLUE}$1${NC}" | tee -a "$SNAPSHOT_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$SNAPSHOT_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$SNAPSHOT_FILE"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$SNAPSHOT_FILE"
}

# ============================================================================
# SYSTEM INFORMATION
# ============================================================================

get_system_info() {
    log_header "SYSTEM INFORMATION"

    log_info "Hostname: $(hostname)"
    log_info "OS: $(uname -s) $(uname -r)"
    log_info "Architecture: $(uname -m)"
    log_info "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

    # CPU Info
    if [[ "$(uname)" == "Darwin" ]]; then
        log_info "CPU: $(sysctl -n machdep.cpu.brand_string)"
        log_info "CPU Cores: $(sysctl -n hw.ncpu)"
        log_info "Memory: $(sysctl -n hw.memsize | awk '{print $1/1024/1024/1024 " GB"}')"
    else
        log_info "CPU: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
        log_info "CPU Cores: $(nproc)"
        log_info "Memory: $(free -h | grep Mem | awk '{print $2}')"
    fi

    # Disk Space
    log_info "Disk Space:"
    df -h | grep -E '^/|UGREEN' | tee -a "$SNAPSHOT_FILE"
}

# ============================================================================
# DATABASE SNAPSHOT
# ============================================================================

get_database_snapshot() {
    log_header "DATABASE SNAPSHOT"

    # Check for SQLite database
    if [ -f "$DATA_DIR/enterprise_inventory.db" ]; then
        log_success "Database found: $DATA_DIR/enterprise_inventory.db"

        # Database size
        local db_size=$(du -h "$DATA_DIR/enterprise_inventory.db" | cut -f1)
        log_info "Database size: $db_size"

        # Database checksum
        if command -v sha256sum &> /dev/null; then
            local checksum=$(sha256sum "$DATA_DIR/enterprise_inventory.db" | cut -d' ' -f1)
            log_info "Database SHA256: $checksum"
        elif command -v shasum &> /dev/null; then
            local checksum=$(shasum -a 256 "$DATA_DIR/enterprise_inventory.db" | cut -d' ' -f1)
            log_info "Database SHA256: $checksum"
        fi

        # Migration versions
        log_info ""
        log_info "Applied Migrations:"
        sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT id, name, applied_at FROM migrations ORDER BY id;" 2>&1 | tee -a "$SNAPSHOT_FILE"

        # Table count
        local table_count=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>&1)
        log_info ""
        log_info "Total tables: $table_count"

        # Check for RBAC tables
        log_info ""
        log_info "RBAC Tables:"
        local rbac_tables=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%user%' OR name LIKE '%role%' OR name LIKE '%invite%') ORDER BY name;" 2>&1)
        if [ -z "$rbac_tables" ]; then
            log_warning "No RBAC tables found (requires migration 023, 025)"
        else
            echo "$rbac_tables" | tee -a "$SNAPSHOT_FILE"
        fi

        # Check for audit tables
        log_info ""
        log_info "Audit Tables:"
        local audit_tables=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%audit%' ORDER BY name;" 2>&1)
        if [ -z "$audit_tables" ]; then
            log_warning "No audit tables found (requires migration 021)"
        else
            echo "$audit_tables" | tee -a "$SNAPSHOT_FILE"
        fi

        # Record counts
        log_info ""
        log_info "Record Counts (selected tables):"
        for table in migrations invoice_line_items inventory_items ai_forecasts ai_forecast_history; do
            if sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"; then
                local count=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT COUNT(*) FROM $table;" 2>&1)
                log_info "  $table: $count records"
            fi
        done
    else
        log_error "Database not found at: $DATA_DIR/enterprise_inventory.db"
    fi
}

# ============================================================================
# RBAC MATRIX
# ============================================================================

get_rbac_matrix() {
    log_header "RBAC MATRIX"

    # Check if user_roles table exists
    if sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='user_roles';" 2>&1 | grep -q "user_roles"; then
        log_success "user_roles table exists"

        # Get role distribution
        log_info ""
        log_info "Role Distribution:"
        sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT role, COUNT(*) as count FROM user_roles GROUP BY role ORDER BY role;" 2>&1 | tee -a "$SNAPSHOT_FILE"

        # Get total users
        local user_count=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT COUNT(DISTINCT user_id) FROM user_roles;" 2>&1)
        log_info ""
        log_info "Total users with roles: $user_count"
    else
        log_warning "user_roles table not found - RBAC not implemented"
        log_info "Expected roles:"
        log_info "  - OWNER (Level 4): Full system access"
        log_info "  - FINANCE (Level 3): Finance workspace, exports, reports"
        log_info "  - OPS (Level 2): Forecasts, inventory, read-only finance"
        log_info "  - READONLY (Level 1): Reports only"
    fi

    # Check route protection
    log_info ""
    log_info "Route Protection Analysis:"
    local requireRole_count=$(grep -r "requireRole(" routes/ 2>/dev/null | wc -l | xargs)
    if [ "$requireRole_count" -gt 0 ]; then
        log_success "Found $requireRole_count requireRole() gates in routes"

        log_info ""
        log_info "Top protected routes:"
        grep -r "requireRole(" routes/ 2>/dev/null | head -10 | tee -a "$SNAPSHOT_FILE"
    else
        log_warning "No requireRole() gates found - routes not RBAC-protected"
    fi
}

# ============================================================================
# STORAGE & NAS
# ============================================================================

get_storage_info() {
    log_header "STORAGE & NAS VERIFICATION"

    # Check for NAS mount
    log_info "Checking for NAS mounts..."
    local nas_mounts=$(df -h | grep -i "ugreen\|nas\|mnt" || echo "")
    if [ -n "$nas_mounts" ]; then
        log_success "NAS mount(s) found:"
        echo "$nas_mounts" | tee -a "$SNAPSHOT_FILE"
    else
        log_warning "No NAS mounts detected"
    fi

    # Check backup directory
    log_info ""
    log_info "Checking backup directory..."
    if [ -d "/mnt/finance_share/backups" ]; then
        log_success "Backup directory exists: /mnt/finance_share/backups"
        local backup_count=$(ls -1 /mnt/finance_share/backups/*.sql.gz 2>/dev/null | wc -l | xargs)
        log_info "Backup files found: $backup_count"

        if [ "$backup_count" -gt 0 ]; then
            log_info "Latest backups:"
            ls -lht /mnt/finance_share/backups/*.sql.gz 2>/dev/null | head -5 | tee -a "$SNAPSHOT_FILE"
        fi
    else
        log_warning "Backup directory not found: /mnt/finance_share/backups"
    fi

    # Check local data directory
    log_info ""
    log_info "Local data directory:"
    if [ -d "$DATA_DIR" ]; then
        du -sh "$DATA_DIR" | tee -a "$SNAPSHOT_FILE"
        log_info "Data files:"
        ls -lh "$DATA_DIR" 2>/dev/null | tee -a "$SNAPSHOT_FILE"
    else
        log_warning "Data directory not found: $DATA_DIR"
    fi
}

# ============================================================================
# NETWORK & TLS
# ============================================================================

get_network_info() {
    log_header "NETWORK & TLS CONFIGURATION"

    # Check if server is running
    log_info "Checking application server..."
    if lsof -i :8083 &> /dev/null; then
        log_success "Application server running on port 8083"

        # Test health endpoint
        local health_response=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8083/health 2>&1)
        if [ "$health_response" = "200" ]; then
            log_success "Health endpoint responsive (HTTP 200)"
        else
            log_warning "Health endpoint returned: HTTP $health_response"
        fi
    else
        log_warning "Application server not running on port 8083"
    fi

    # Check for Nginx
    log_info ""
    log_info "Checking Nginx reverse proxy..."
    if command -v nginx &> /dev/null; then
        log_success "Nginx installed: $(nginx -v 2>&1)"

        if pgrep nginx > /dev/null; then
            log_success "Nginx is running"
        else
            log_warning "Nginx is not running"
        fi
    else
        log_warning "Nginx not installed"
    fi

    # Check for TLS certificates
    log_info ""
    log_info "Checking TLS certificates..."
    if [ -f "/etc/nginx/ssl/neuropilot.crt" ]; then
        log_success "TLS certificate found: /etc/nginx/ssl/neuropilot.crt"

        # Get certificate fingerprint
        if command -v openssl &> /dev/null; then
            local fingerprint=$(openssl x509 -in /etc/nginx/ssl/neuropilot.crt -noout -fingerprint -sha256 2>&1 | cut -d= -f2)
            log_info "Certificate SHA256 fingerprint: $fingerprint"

            # Get expiration date
            local expiry=$(openssl x509 -in /etc/nginx/ssl/neuropilot.crt -noout -enddate 2>&1 | cut -d= -f2)
            log_info "Certificate expiration: $expiry"
        fi
    else
        log_warning "TLS certificate not found (expected path: /etc/nginx/ssl/neuropilot.crt)"
    fi
}

# ============================================================================
# METRICS SNAPSHOT
# ============================================================================

get_metrics_snapshot() {
    log_header "METRICS SNAPSHOT"

    # Check if metrics endpoint is accessible
    log_info "Attempting to fetch metrics..."
    local metrics_response=$(curl -s http://127.0.0.1:8083/metrics 2>&1)

    if echo "$metrics_response" | grep -q "user_login_total\|forecast_run_total"; then
        log_success "Metrics endpoint accessible"

        log_info ""
        log_info "Key Metrics:"
        echo "$metrics_response" | grep -E "user_login_total|forecast_run_total|backup_success_total|audit_events_total|export_request_total" | tee -a "$SNAPSHOT_FILE"
    else
        log_warning "Metrics endpoint not accessible or metrics not configured"
        log_info "Expected metrics:"
        log_info "  - user_login_total"
        log_info "  - forecast_run_total"
        log_info "  - backup_success_total"
        log_info "  - audit_events_total"
        log_info "  - export_request_total"
    fi

    # Check for Prometheus
    log_info ""
    log_info "Checking Prometheus..."
    if command -v prometheus &> /dev/null; then
        log_success "Prometheus installed"

        if pgrep prometheus > /dev/null; then
            log_success "Prometheus is running"
        else
            log_warning "Prometheus is not running"
        fi
    else
        log_warning "Prometheus not installed"
    fi
}

# ============================================================================
# CONFIGURATION SUMMARY
# ============================================================================

get_config_summary() {
    log_header "CONFIGURATION SUMMARY"

    # Check environment files
    log_info "Environment configuration:"
    if [ -f ".env" ]; then
        log_success ".env file exists"

        # Check key variables (without exposing secrets)
        if grep -q "NODE_ENV=production" .env 2>/dev/null; then
            log_info "  NODE_ENV: production"
        else
            log_warning "  NODE_ENV: not set to production"
        fi

        if grep -q "FORECAST_SHADOW_MODE" .env 2>/dev/null; then
            local shadow_mode=$(grep "FORECAST_SHADOW_MODE" .env | cut -d= -f2)
            log_info "  FORECAST_SHADOW_MODE: $shadow_mode"
        else
            log_warning "  FORECAST_SHADOW_MODE: not set"
        fi

        if grep -q "TLS_ENABLED" .env 2>/dev/null; then
            local tls_enabled=$(grep "TLS_ENABLED" .env | cut -d= -f2)
            log_info "  TLS_ENABLED: $tls_enabled"
        else
            log_warning "  TLS_ENABLED: not set"
        fi
    else
        log_warning ".env file not found"
    fi

    # Check .env.production
    log_info ""
    if [ -f ".env.production" ]; then
        log_success ".env.production file exists (production config ready)"
    else
        log_warning ".env.production file not found"
    fi

    # Check scripts
    log_info ""
    log_info "Available scripts:"
    local scripts_found=0
    for script in backup_db.sh restore_db.sh verify_v15_5_1_production.sh test_first_user_invite.sh; do
        if [ -f "scripts/$script" ]; then
            log_success "  $script"
            scripts_found=$((scripts_found + 1))
        else
            log_warning "  $script (not found)"
        fi
    done

    log_info ""
    log_info "Scripts found: $scripts_found/4"
}

# ============================================================================
# VERSION INFORMATION
# ============================================================================

get_version_info() {
    log_header "VERSION INFORMATION"

    # Check Node.js version
    if command -v node &> /dev/null; then
        log_info "Node.js: $(node --version)"
    else
        log_warning "Node.js not found"
    fi

    # Check npm version
    if command -v npm &> /dev/null; then
        log_info "npm: $(npm --version)"
    else
        log_warning "npm not found"
    fi

    # Check SQLite version
    if command -v sqlite3 &> /dev/null; then
        log_info "SQLite: $(sqlite3 --version | cut -d' ' -f1)"
    else
        log_warning "SQLite not found"
    fi

    # Check for package.json
    log_info ""
    if [ -f "package.json" ]; then
        local app_version=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
        log_info "Application version (package.json): $app_version"
    else
        log_warning "package.json not found"
    fi

    # Check latest migration
    log_info ""
    if [ -f "$DATA_DIR/enterprise_inventory.db" ]; then
        local latest_migration=$(sqlite3 "$DATA_DIR/enterprise_inventory.db" "SELECT name FROM migrations ORDER BY id DESC LIMIT 1;" 2>&1)
        log_info "Latest database migration: $latest_migration"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_header "NeuroPilot Enterprise System Snapshot"
    log "Generated at: $(date)"
    log "Snapshot file: $SNAPSHOT_FILE"
    log ""

    # Run all snapshot functions
    get_system_info
    get_version_info
    get_database_snapshot
    get_rbac_matrix
    get_storage_info
    get_network_info
    get_metrics_snapshot
    get_config_summary

    # Summary
    log_header "SNAPSHOT COMPLETE"
    log "System snapshot saved to: $SNAPSHOT_FILE"
    log "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

    echo ""
    echo -e "${GREEN}✅ System snapshot generated successfully!${NC}"
    echo -e "${BLUE}View report: cat $SNAPSHOT_FILE${NC}"
    echo ""
}

# Run main function
main
