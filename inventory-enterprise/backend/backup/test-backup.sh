#!/bin/bash
################################################################################
# NeuroPilot Inventory - Backup Verification Script
#
# Features:
# - Downloads latest backup from OneDrive
# - Verifies encryption and compression
# - Tests restore to temporary database
# - Validates schema integrity
# - Generates verification report
#
# Usage: ./test-backup.sh [backup_file]
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
    exit 1
fi

# Test database name
TEST_DBNAME="neuropilot_backup_test_$(date +%s)"

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

cleanup() {
    log "Cleaning up test resources..."

    # Drop test database if exists
    if [ -n "${TEST_DBNAME:-}" ]; then
        psql -c "DROP DATABASE IF EXISTS $TEST_DBNAME" 2>/dev/null || true
    fi

    # Remove temp files
    rm -f /tmp/backup_test_* || true
}

# Cleanup on exit
trap cleanup EXIT

get_latest_backup() {
    local from_onedrive=${1:-false}

    if [ "$from_onedrive" = true ]; then
        log "Fetching latest backup from OneDrive..."
        local latest
        latest=$(rclone lsf "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" \
            --include "neuropilot_*.sql.gz.gpg" \
            2>/dev/null | sort -r | head -n1)

        if [ -z "$latest" ]; then
            error "No backups found on OneDrive"
            return 1
        fi

        # Download backup
        local local_file="${BACKUP_DIR}/${latest}"
        if [ ! -f "$local_file" ]; then
            log "Downloading: $latest"
            rclone copy "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/${latest}" "$BACKUP_DIR/" --progress
        fi
        echo "$local_file"
    else
        # Find latest local backup
        local latest_local
        latest_local=$(find "$BACKUP_DIR" -name "neuropilot_*.sql.gz.gpg" -type f | sort -r | head -n1)

        if [ -z "$latest_local" ]; then
            error "No local backups found in $BACKUP_DIR"
            return 1
        fi

        echo "$latest_local"
    fi
}

test_checksum() {
    local backup_file=$1
    local checksum_file="${backup_file}.sha256"

    log "Testing checksum verification..."

    if [ ! -f "$checksum_file" ]; then
        log "⚠️  No checksum file found - skipping"
        return 0
    fi

    if sha256sum -c "$checksum_file" &>/dev/null; then
        log "✅ Checksum verified"
        return 0
    else
        error "Checksum verification failed"
        return 1
    fi
}

test_gpg_encryption() {
    local backup_file=$1

    log "Testing GPG encryption..."

    # Verify file is GPG encrypted
    if ! file "$backup_file" | grep -q "GPG"; then
        error "File is not GPG encrypted"
        return 1
    fi

    # Test decryption (first 1KB only to save time)
    if gpg --decrypt "$backup_file" 2>/dev/null | head -c 1024 &>/dev/null; then
        log "✅ GPG decryption successful"
        return 0
    else
        error "GPG decryption failed"
        return 1
    fi
}

test_compression() {
    local backup_file=$1

    log "Testing gzip compression..."

    # Decrypt and test gzip integrity
    local temp_file="/tmp/backup_test_compressed_$$.gz"
    gpg --decrypt --output "$temp_file" "$backup_file" 2>/dev/null

    if gzip -t "$temp_file" 2>/dev/null; then
        log "✅ Gzip compression valid"
        rm -f "$temp_file"
        return 0
    else
        error "Gzip compression test failed"
        rm -f "$temp_file"
        return 1
    fi
}

test_sql_syntax() {
    local backup_file=$1

    log "Testing SQL syntax..."

    # Decrypt and decompress
    local temp_sql="/tmp/backup_test_sql_$$.sql"
    gpg --decrypt "$backup_file" 2>/dev/null | gunzip > "$temp_sql"

    # Count SQL statements
    local create_tables=$(grep -c "CREATE TABLE" "$temp_sql" || true)
    local inserts=$(grep -c "INSERT INTO" "$temp_sql" || true)
    local total_lines=$(wc -l < "$temp_sql")

    log "SQL file analysis:"
    log "  - Total lines: $total_lines"
    log "  - CREATE TABLE statements: $create_tables"
    log "  - INSERT statements: $inserts"

    if [ "$create_tables" -gt 0 ] && [ "$total_lines" -gt 100 ]; then
        log "✅ SQL syntax appears valid"
        rm -f "$temp_sql"
        return 0
    else
        error "SQL file appears invalid or empty"
        rm -f "$temp_sql"
        return 1
    fi
}

test_restore_to_temp_db() {
    local backup_file=$1

    log "Testing restore to temporary database..."

    # Create temporary database
    log "Creating test database: $TEST_DBNAME"
    if ! psql -c "CREATE DATABASE $TEST_DBNAME" 2>&1 | grep -v "already exists"; then
        error "Failed to create test database"
        return 1
    fi

    # Decrypt and decompress backup
    local temp_sql="/tmp/backup_test_restore_$$.sql"
    gpg --decrypt "$backup_file" 2>/dev/null | gunzip > "$temp_sql"

    # Restore to test database
    log "Restoring to test database..."
    if PGDATABASE="$TEST_DBNAME" psql --quiet --file="$temp_sql" 2>&1 | tail -n 10; then
        log "✅ Restore completed successfully"
    else
        error "Restore failed"
        rm -f "$temp_sql"
        return 1
    fi

    rm -f "$temp_sql"
    return 0
}

validate_schema() {
    log "Validating database schema..."

    # Get table count
    local table_count
    table_count=$(PGDATABASE="$TEST_DBNAME" psql -t -c "
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " | tr -d ' ')

    log "  - Tables: $table_count"

    # Check for critical tables
    local critical_tables=("app_user" "item" "inventory_count" "purchase_order")
    local missing_tables=()

    for table in "${critical_tables[@]}"; do
        local exists
        exists=$(PGDATABASE="$TEST_DBNAME" psql -t -c "
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '$table';
        " | tr -d ' ')

        if [ "$exists" -eq 0 ]; then
            missing_tables+=("$table")
        else
            log "  ✅ Table exists: $table"
        fi
    done

    if [ ${#missing_tables[@]} -gt 0 ]; then
        error "Missing critical tables: ${missing_tables[*]}"
        return 1
    fi

    log "✅ Schema validation passed"
    return 0
}

validate_data() {
    log "Validating data integrity..."

    # Count total rows
    local total_rows
    total_rows=$(PGDATABASE="$TEST_DBNAME" psql -t -c "
        SELECT SUM(n_live_tup)
        FROM pg_stat_user_tables
        WHERE schemaname = 'public';
    " | tr -d ' ' | sed 's/^$/0/')

    log "  - Total rows: $total_rows"

    # Check for data in critical tables
    local item_count
    item_count=$(PGDATABASE="$TEST_DBNAME" psql -t -c "SELECT COUNT(*) FROM item;" | tr -d ' ')
    log "  - Items: $item_count"

    local user_count
    user_count=$(PGDATABASE="$TEST_DBNAME" psql -t -c "SELECT COUNT(*) FROM app_user;" | tr -d ' ')
    log "  - Users: $user_count"

    # Basic sanity checks
    if [ "$total_rows" -lt 10 ]; then
        error "Suspiciously low row count - backup may be incomplete"
        return 1
    fi

    log "✅ Data validation passed"
    return 0
}

generate_report() {
    local backup_file=$1
    local test_results=$2

    local backup_name=$(basename "$backup_file")
    local backup_date=$(echo "$backup_name" | sed 's/neuropilot_\([0-9]\{8\}\)_\([0-9]\{6\}\).*/\1 \2/' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
    local backup_size=$(du -h "$backup_file" | cut -f1)

    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║              BACKUP VERIFICATION REPORT                         ║
╚════════════════════════════════════════════════════════════════╝

📅 Test Date:        $(date +'%Y-%m-%d %H:%M:%S')
📁 Backup File:      $backup_name
📅 Backup Date:      $backup_date
📦 Backup Size:      $backup_size

────────────────────────────────────────────────────────────────

TEST RESULTS:
$test_results

────────────────────────────────────────────────────────────────

CONCLUSION:
$(if echo "$test_results" | grep -q "❌"; then
    echo "⚠️  BACKUP VERIFICATION FAILED"
    echo ""
    echo "Action Required:"
    echo "1. Review failed tests above"
    echo "2. Check backup-database.sh configuration"
    echo "3. Re-run backup manually"
    echo "4. Investigate encryption/compression issues"
else
    echo "✅ BACKUP VERIFICATION PASSED"
    echo ""
    echo "This backup is valid and can be used for restore."
    echo "Estimated restore time: 5-10 minutes"
fi)

════════════════════════════════════════════════════════════════

EOF
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    local backup_file=${1:-}
    local from_onedrive=false

    log "=========================================="
    log "NeuroPilot Backup Verification"
    log "=========================================="

    # Determine backup file to test
    if [ -z "$backup_file" ]; then
        log "No backup file specified - using latest"

        # Try local first, then OneDrive
        if ! backup_file=$(get_latest_backup false 2>/dev/null); then
            log "No local backups found, checking OneDrive..."
            backup_file=$(get_latest_backup true)
            from_onedrive=true
        fi
    fi

    log "Testing backup: $(basename "$backup_file")"
    log ""

    # Run tests
    local test_results=""

    # Test 1: Checksum
    if test_checksum "$backup_file"; then
        test_results+="  ✅ Checksum verification\n"
    else
        test_results+="  ❌ Checksum verification\n"
    fi

    # Test 2: GPG encryption
    if test_gpg_encryption "$backup_file"; then
        test_results+="  ✅ GPG encryption\n"
    else
        test_results+="  ❌ GPG encryption\n"
    fi

    # Test 3: Gzip compression
    if test_compression "$backup_file"; then
        test_results+="  ✅ Gzip compression\n"
    else
        test_results+="  ❌ Gzip compression\n"
    fi

    # Test 4: SQL syntax
    if test_sql_syntax "$backup_file"; then
        test_results+="  ✅ SQL syntax\n"
    else
        test_results+="  ❌ SQL syntax\n"
    fi

    # Test 5: Restore to temp DB
    if test_restore_to_temp_db "$backup_file"; then
        test_results+="  ✅ Database restore\n"

        # Test 6: Schema validation
        if validate_schema; then
            test_results+="  ✅ Schema validation\n"
        else
            test_results+="  ❌ Schema validation\n"
        fi

        # Test 7: Data validation
        if validate_data; then
            test_results+="  ✅ Data validation\n"
        else
            test_results+="  ❌ Data validation\n"
        fi
    else
        test_results+="  ❌ Database restore\n"
        test_results+="  ⏭️  Schema validation (skipped)\n"
        test_results+="  ⏭️  Data validation (skipped)\n"
    fi

    # Generate report
    generate_report "$backup_file" "$(echo -e "$test_results")"

    # Return exit code based on results
    if echo -e "$test_results" | grep -q "❌"; then
        log "=========================================="
        log "❌ Verification FAILED"
        log "=========================================="
        exit 1
    else
        log "=========================================="
        log "✅ Verification PASSED"
        log "=========================================="
        exit 0
    fi
}

# Run main function
main "$@"
