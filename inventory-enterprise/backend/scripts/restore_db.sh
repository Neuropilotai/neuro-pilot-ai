#!/bin/bash
# ============================================================================
# NeuroPilot Database Restore Script
# Version: 15.5.0
#
# Features:
# - Restore from backup with SHA256 verification
# - Safety checks and confirmations
# - Automatic database backup before restore
# - Integrity validation after restore
#
# Usage:
#   ./scripts/restore_db.sh <backup_file> [target_db_path]
#
# Examples:
#   ./scripts/restore_db.sh ./backups/neuropilot_backup_20250415_023000.db
#   ./scripts/restore_db.sh ./backups/neuropilot_backup_20250415_023000.db ./data/neuropilot.db
#
# Safety Features:
# - Requires explicit confirmation before restore
# - Verifies backup checksum before restore
# - Creates safety backup of current database
# - Validates restored database integrity
#
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-${DB_PATH:-./data/neuropilot.db}}"
SAFETY_BACKUP_DIR="./backups/safety"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# LOGGING
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

validate_backup_file() {
    local backup="$1"

    log "Validating backup file..."

    if [ ! -f "$backup" ]; then
        log_error "Backup file not found: $backup"
        return 1
    fi

    # Check if it's a SQLite database
    if ! file "$backup" | grep -q "SQLite"; then
        log_error "File is not a SQLite database: $backup"
        return 1
    fi

    # Check database integrity
    if ! sqlite3 "$backup" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        log_error "Backup file integrity check failed"
        return 1
    fi

    log_success "Backup file is valid"
    return 0
}

verify_checksum() {
    local backup="$1"
    local checksum_file="${backup}.sha256"

    log "Verifying backup checksum..."

    if [ ! -f "$checksum_file" ]; then
        log_warning "Checksum file not found: $checksum_file"
        log_warning "Skipping checksum verification"
        return 0
    fi

    local expected_checksum
    expected_checksum=$(cat "$checksum_file")

    local actual_checksum
    if command -v shasum >/dev/null 2>&1; then
        actual_checksum=$(shasum -a 256 "$backup" | awk '{print $1}')
    elif command -v sha256sum >/dev/null 2>&1; then
        actual_checksum=$(sha256sum "$backup" | awk '{print $1}')
    else
        log_warning "No SHA256 utility found, skipping checksum verification"
        return 0
    fi

    if [ "$expected_checksum" != "$actual_checksum" ]; then
        log_error "Checksum mismatch!"
        log_error "Expected: $expected_checksum"
        log_error "Actual:   $actual_checksum"
        return 1
    fi

    log_success "Checksum verification passed"
    return 0
}

# ============================================================================
# SAFETY FUNCTIONS
# ============================================================================

create_safety_backup() {
    local db="$1"

    log "Creating safety backup of current database..."

    if [ ! -f "$db" ]; then
        log_info "No existing database to backup"
        return 0
    fi

    # Create safety backup directory
    mkdir -p "$SAFETY_BACKUP_DIR"

    local safety_backup="${SAFETY_BACKUP_DIR}/neuropilot_safety_${TIMESTAMP}.db"

    # Copy current database
    cp "$db" "$safety_backup" || {
        log_error "Failed to create safety backup"
        return 1
    }

    # Generate checksum
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$safety_backup" | awk '{print $1}' > "${safety_backup}.sha256"
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$safety_backup" | awk '{print $1}' > "${safety_backup}.sha256"
    fi

    log_success "Safety backup created: $safety_backup"
    log_info "You can restore this backup if needed using the same restore script"

    return 0
}

# ============================================================================
# RESTORE FUNCTIONS
# ============================================================================

perform_restore() {
    local backup="$1"
    local target="$2"

    log "Restoring database..."

    # Create target directory if it doesn't exist
    mkdir -p "$(dirname "$target")"

    # Copy backup to target
    cp "$backup" "$target" || {
        log_error "Failed to copy backup to target location"
        return 1
    }

    # Verify restored database
    if ! sqlite3 "$target" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        log_error "Restored database integrity check failed"
        return 1
    fi

    log_success "Database restored successfully"
    return 0
}

# ============================================================================
# INFO DISPLAY
# ============================================================================

display_backup_info() {
    local backup="$1"
    local target="$2"

    log ""
    log "========================================"
    log "DATABASE RESTORE INFORMATION"
    log "========================================"
    log "Backup file:  $backup"
    log "Target database: $target"
    log ""

    # Get backup file info
    local backup_size
    backup_size=$(stat -f%z "$backup" 2>/dev/null || stat -c%s "$backup" 2>/dev/null)
    log "Backup size: $(numfmt --to=iec-i --suffix=B "$backup_size" 2>/dev/null || echo "$backup_size bytes")"

    local backup_date
    backup_date=$(stat -f%Sm -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || stat -c%y "$backup" 2>/dev/null | cut -d'.' -f1)
    log "Backup date: $backup_date"

    # Get database stats from backup
    log ""
    log "Database Contents:"
    local table_count
    table_count=$(sqlite3 "$backup" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "Unknown")
    log "  Tables: $table_count"

    # Check if target database exists
    if [ -f "$target" ]; then
        log ""
        log_warning "⚠️  WARNING: Target database already exists and will be OVERWRITTEN!"
        local target_size
        target_size=$(stat -f%z "$target" 2>/dev/null || stat -c%s "$target" 2>/dev/null)
        log "Current database size: $(numfmt --to=iec-i --suffix=B "$target_size" 2>/dev/null || echo "$target_size bytes")"
    fi

    log "========================================"
    log ""
}

# ============================================================================
# USER CONFIRMATION
# ============================================================================

confirm_restore() {
    log_warning "This operation will:"
    log_warning "  1. Create a safety backup of the current database (if exists)"
    log_warning "  2. OVERWRITE the target database with the backup"
    log_warning "  3. This action cannot be undone (except via safety backup)"
    log ""

    read -p "Are you sure you want to proceed? (type 'yes' to confirm): " -r
    echo

    if [[ ! $REPLY =~ ^yes$ ]]; then
        log "Restore cancelled by user"
        exit 0
    fi

    log "User confirmed restore operation"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log "========================================"
    log "NeuroPilot Database Restore v15.5.0"
    log "========================================"
    log ""

    # Check if backup file is provided
    if [ -z "$BACKUP_FILE" ]; then
        log_error "Usage: $0 <backup_file> [target_db_path]"
        log_error "Example: $0 ./backups/neuropilot_backup_20250415_023000.db"
        exit 1
    fi

    # Validate backup file
    if ! validate_backup_file "$BACKUP_FILE"; then
        exit 1
    fi

    # Verify checksum
    if ! verify_checksum "$BACKUP_FILE"; then
        log_error "Checksum verification failed. The backup file may be corrupted."
        read -p "Do you want to continue anyway? (type 'yes' to proceed): " -r
        echo
        if [[ ! $REPLY =~ ^yes$ ]]; then
            log "Restore cancelled"
            exit 1
        fi
    fi

    # Display backup information
    display_backup_info "$BACKUP_FILE" "$TARGET_DB"

    # Confirm with user
    confirm_restore

    # Create safety backup
    if ! create_safety_backup "$TARGET_DB"; then
        log_error "Failed to create safety backup. Aborting restore."
        exit 1
    fi

    # Perform restore
    if ! perform_restore "$BACKUP_FILE" "$TARGET_DB"; then
        log_error "Restore failed!"
        log_error "Your original database is preserved in the safety backup:"
        log_error "  ${SAFETY_BACKUP_DIR}/neuropilot_safety_${TIMESTAMP}.db"
        exit 1
    fi

    log ""
    log_success "✅ Database restore completed successfully!"
    log ""
    log "Next steps:"
    log "  1. Restart your application: pm2 restart neuropilot"
    log "  2. Verify application functionality"
    log "  3. Safety backup is available at:"
    log "     ${SAFETY_BACKUP_DIR}/neuropilot_safety_${TIMESTAMP}.db"
    log ""
    log "========================================"

    exit 0
}

# Run main function
main
