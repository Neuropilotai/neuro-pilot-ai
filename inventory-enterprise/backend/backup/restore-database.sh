#!/bin/bash
################################################################################
# NeuroPilot Inventory - PostgreSQL Restore Script
#
# Features:
# - Download backup from OneDrive
# - GPG decryption
# - PostgreSQL restore
# - Pre-restore validation
# - Backup current database before restore
#
# Usage: ./restore-database.sh [backup_file] [--from-onedrive] [--latest]
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/.backup-config"

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
else
    echo "❌ Error: Config file not found at $CONFIG_FILE"
    echo "Run backup-database.sh first to create config template."
    exit 1
fi

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] [BACKUP_FILE]

Restore NeuroPilot database from encrypted backup.

OPTIONS:
    --from-onedrive     Download backup from OneDrive
    --latest            Use latest backup (with --from-onedrive)
    --list              List available backups on OneDrive
    --no-backup         Skip pre-restore backup of current database
    --force             Skip confirmation prompts

EXAMPLES:
    # Restore from local file
    $0 /tmp/neuropilot-backups/neuropilot_20250120_120000.sql.gz.gpg

    # Restore latest backup from OneDrive
    $0 --from-onedrive --latest

    # List available backups
    $0 --list

EOF
}

check_dependencies() {
    local missing_deps=()

    command -v psql &> /dev/null || missing_deps+=("postgresql-client")
    command -v gpg &> /dev/null || missing_deps+=("gnupg")
    command -v gunzip &> /dev/null || missing_deps+=("gzip")

    if [ ${#missing_deps[@]} -gt 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
}

list_onedrive_backups() {
    log "Fetching backup list from OneDrive..."

    if ! rclone lsf "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" --include "neuropilot_*.sql.gz.gpg" 2>/dev/null; then
        error "Failed to list backups from OneDrive"
        exit 1
    fi
}

get_latest_backup() {
    local latest
    latest=$(rclone lsf "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" \
        --include "neuropilot_*.sql.gz.gpg" \
        2>/dev/null | sort -r | head -n1)

    if [ -z "$latest" ]; then
        error "No backups found on OneDrive"
        exit 1
    fi

    echo "$latest"
}

download_from_onedrive() {
    local backup_name=$1
    local local_path="${BACKUP_DIR}/${backup_name}"

    log "Downloading backup from OneDrive..."
    log "File: $backup_name"

    if rclone copy "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/${backup_name}" "$BACKUP_DIR/" --progress; then
        log "✅ Download completed: $local_path"
        echo "$local_path"
    else
        error "Failed to download backup from OneDrive"
        exit 1
    fi
}

verify_backup_file() {
    local backup_file=$1

    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi

    # Check if GPG encrypted
    if ! file "$backup_file" | grep -q "GPG"; then
        error "File is not GPG encrypted: $backup_file"
        exit 1
    fi

    # Verify checksum if available
    local checksum_file="${backup_file}.sha256"
    if [ -f "$checksum_file" ]; then
        log "Verifying checksum..."
        if sha256sum -c "$checksum_file" &>/dev/null; then
            log "✅ Checksum verified"
        else
            error "Checksum verification failed - file may be corrupted"
            exit 1
        fi
    else
        log "⚠️  No checksum file found - skipping verification"
    fi
}

decrypt_backup() {
    local encrypted_file=$1
    local decrypted_file="${encrypted_file%.gpg}"

    log "Decrypting backup..."

    if gpg --decrypt --output "$decrypted_file" "$encrypted_file" 2>/dev/null; then
        log "✅ Decryption successful"
        echo "$decrypted_file"
    else
        error "Decryption failed - check GPG key"
        exit 1
    fi
}

decompress_backup() {
    local compressed_file=$1
    local sql_file="${compressed_file%.gz}"

    log "Decompressing backup..."

    if gunzip -k "$compressed_file"; then
        log "✅ Decompression successful"
        echo "$sql_file"
    else
        error "Decompression failed"
        exit 1
    fi
}

backup_current_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local pre_restore_backup="${BACKUP_DIR}/pre_restore_${timestamp}.sql"

    log "Creating pre-restore backup of current database..."

    if pg_dump --verbose --format=plain --file="$pre_restore_backup" 2>&1 | tail -n 5; then
        gzip "$pre_restore_backup"
        log "✅ Pre-restore backup saved: ${pre_restore_backup}.gz"
    else
        error "Failed to create pre-restore backup"
        return 1
    fi
}

get_database_stats() {
    psql -t -c "
        SELECT
            'Tables: ' || COUNT(*) AS table_count
        FROM information_schema.tables
        WHERE table_schema = 'public';

        SELECT
            'Rows: ' || SUM(n_live_tup) AS total_rows
        FROM pg_stat_user_tables;
    " 2>/dev/null || echo "Unable to fetch stats"
}

restore_database() {
    local sql_file=$1

    log "Database before restore:"
    get_database_stats

    log "Starting database restore..."
    log "⚠️  This will DROP and recreate all tables!"

    # Execute restore
    if psql --echo-errors --file="$sql_file" 2>&1 | tee "${BACKUP_DIR}/restore_$(date +%Y%m%d_%H%M%S).log"; then
        log "✅ Database restore completed"
    else
        error "Database restore failed - check logs"
        return 1
    fi

    log "Database after restore:"
    get_database_stats
}

cleanup_temp_files() {
    local base_file=$1
    local encrypted_file="${base_file}.gz.gpg"
    local compressed_file="${base_file}.gz"
    local sql_file="$base_file"

    log "Cleaning up temporary files..."

    # Remove decrypted files (keep encrypted backup)
    rm -f "$compressed_file" "$sql_file"

    log "✅ Cleanup completed (encrypted backup preserved)"
}

confirm_restore() {
    local backup_file=$1

    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║                    ⚠️  RESTORE WARNING ⚠️                       ║
╚════════════════════════════════════════════════════════════════╝

You are about to restore the database from:
📁 Backup: $(basename "$backup_file")

⚠️  This will:
   1. DROP all existing tables
   2. Recreate schema from backup
   3. Load data from backup

Current database: $PGDATABASE @ $PGHOST

A pre-restore backup will be created automatically.

EOF

    read -p "Are you sure you want to continue? (yes/no): " -r
    echo

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Restore cancelled by user"
        exit 0
    fi
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    local backup_file=""
    local from_onedrive=false
    local use_latest=false
    local list_only=false
    local no_backup=false
    local force=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --from-onedrive)
                from_onedrive=true
                shift
                ;;
            --latest)
                use_latest=true
                shift
                ;;
            --list)
                list_only=true
                shift
                ;;
            --no-backup)
                no_backup=true
                shift
                ;;
            --force)
                force=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                backup_file=$1
                shift
                ;;
        esac
    done

    log "=========================================="
    log "NeuroPilot PostgreSQL Restore"
    log "=========================================="

    # List backups only
    if [ "$list_only" = true ]; then
        list_onedrive_backups
        exit 0
    fi

    # Pre-flight checks
    check_dependencies
    mkdir -p "$BACKUP_DIR"

    # Determine backup file
    if [ "$from_onedrive" = true ]; then
        if [ "$use_latest" = true ]; then
            local latest_backup
            latest_backup=$(get_latest_backup)
            log "Latest backup: $latest_backup"
            backup_file=$(download_from_onedrive "$latest_backup")
        elif [ -z "$backup_file" ]; then
            error "Specify backup file name or use --latest"
            echo ""
            echo "Available backups:"
            list_onedrive_backups
            exit 1
        else
            backup_file=$(download_from_onedrive "$(basename "$backup_file")")
        fi
    elif [ -z "$backup_file" ]; then
        error "No backup file specified"
        show_usage
        exit 1
    fi

    # Verify backup exists and is valid
    verify_backup_file "$backup_file"

    # Confirm restore (unless --force)
    if [ "$force" = false ]; then
        confirm_restore "$backup_file"
    fi

    # Backup current database before restore
    if [ "$no_backup" = false ]; then
        if ! backup_current_database; then
            error "Failed to create pre-restore backup"
            read -p "Continue anyway? (yes/no): " -r
            [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]] && exit 1
        fi
    fi

    # Decrypt backup
    local decrypted_file
    decrypted_file=$(decrypt_backup "$backup_file")

    # Decompress backup
    local sql_file
    sql_file=$(decompress_backup "$decrypted_file")

    # Restore database
    restore_database "$sql_file"

    # Cleanup temporary files
    cleanup_temp_files "${sql_file}"

    log "=========================================="
    log "✅ Restore completed successfully!"
    log "=========================================="

    cat << EOF

📋 Next Steps:
   1. Verify application connectivity
   2. Check data integrity
   3. Test critical workflows
   4. Monitor application logs

🔧 Rollback (if needed):
   Pre-restore backup saved in $BACKUP_DIR/pre_restore_*.sql.gz
   Restore with: gunzip -c pre_restore_*.sql.gz | psql

EOF
}

# Run main function
main "$@"
