#!/bin/bash
# ============================================================================
# NeuroPilot Database Backup Script
# Version: 15.5.0
#
# Features:
# - SQLite database backup with integrity check
# - SHA256 checksum for verification
# - 30-day retention policy
# - Prometheus metrics export
# - Email notifications on failure (optional)
#
# Usage:
#   ./scripts/backup_db.sh [database_path] [backup_dir]
#
# Environment Variables:
#   DB_PATH - Path to SQLite database (default: ./data/neuropilot.db)
#   BACKUP_DIR - Backup storage directory (default: ./backups)
#   BACKUP_RETENTION_DAYS - Days to keep backups (default: 30)
#   METRICS_FILE - Prometheus metrics file (default: /var/lib/node_exporter/textfile_collector/db_backup.prom)
#   ALERT_EMAIL - Email for failure notifications (optional)
#
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

DB_PATH="${1:-${DB_PATH:-./data/neuropilot.db}}"
BACKUP_DIR="${2:-${BACKUP_DIR:-./backups}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
METRICS_FILE="${METRICS_FILE:-/var/lib/node_exporter/textfile_collector/db_backup.prom}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/neuropilot_backup_${TIMESTAMP}.db"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# LOGGING
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================================================
# METRICS FUNCTIONS
# ============================================================================

write_metrics() {
    local success=$1
    local duration=$2
    local size=$3
    local error_msg="${4:-}"

    # Create metrics directory if it doesn't exist
    mkdir -p "$(dirname "$METRICS_FILE")" 2>/dev/null || true

    cat > "$METRICS_FILE" <<EOF
# HELP db_backup_success_total Total number of successful database backups
# TYPE db_backup_success_total counter
db_backup_success_total{database="neuropilot"} $success

# HELP db_backup_last_success_timestamp Unix timestamp of last successful backup
# TYPE db_backup_last_success_timestamp gauge
db_backup_last_success_timestamp{database="neuropilot"} $(date +%s)

# HELP db_backup_duration_seconds Duration of backup operation in seconds
# TYPE db_backup_duration_seconds gauge
db_backup_duration_seconds{database="neuropilot"} $duration

# HELP db_backup_size_bytes Size of backup file in bytes
# TYPE db_backup_size_bytes gauge
db_backup_size_bytes{database="neuropilot"} $size

# HELP db_backup_age_hours Hours since last backup
# TYPE db_backup_age_hours gauge
db_backup_age_hours{database="neuropilot"} 0
EOF

    if [ -n "$error_msg" ]; then
        cat >> "$METRICS_FILE" <<EOF

# HELP db_backup_last_error Last backup error message
# TYPE db_backup_last_error gauge
db_backup_last_error{database="neuropilot",error="$error_msg"} 1
EOF
    fi
}

# ============================================================================
# NOTIFICATION FUNCTIONS
# ============================================================================

send_alert() {
    local subject="$1"
    local body="$2"

    if [ -n "$ALERT_EMAIL" ]; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || \
            log_warning "Failed to send email alert to $ALERT_EMAIL"
    fi
}

# ============================================================================
# BACKUP FUNCTIONS
# ============================================================================

validate_database() {
    log "Validating database integrity..."

    if [ ! -f "$DB_PATH" ]; then
        log_error "Database file not found: $DB_PATH"
        return 1
    fi

    # Check if SQLite database is valid
    if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        log_error "Database integrity check failed"
        return 1
    fi

    log_success "Database integrity check passed"
    return 0
}

create_backup() {
    log "Creating backup: $BACKUP_FILE"

    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"

    # Perform backup using SQLite's backup command (online backup)
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" || {
        log_error "Backup creation failed"
        return 1
    }

    # Get backup file size
    BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
    log "Backup size: $(numfmt --to=iec-i --suffix=B "$BACKUP_SIZE" 2>/dev/null || echo "$BACKUP_SIZE bytes")"

    return 0
}

generate_checksum() {
    log "Generating SHA256 checksum..."

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$BACKUP_FILE" | awk '{print $1}' > "$CHECKSUM_FILE"
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$BACKUP_FILE" | awk '{print $1}' > "$CHECKSUM_FILE"
    else
        log_error "No SHA256 utility found (shasum or sha256sum required)"
        return 1
    fi

    CHECKSUM=$(cat "$CHECKSUM_FILE")
    log_success "Checksum: $CHECKSUM"

    return 0
}

verify_backup() {
    log "Verifying backup integrity..."

    # Verify backup is a valid SQLite database
    if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        log_error "Backup verification failed - invalid database"
        return 1
    fi

    # Verify checksum
    if command -v shasum >/dev/null 2>&1; then
        echo "$(cat "$CHECKSUM_FILE")  $BACKUP_FILE" | shasum -a 256 -c - > /dev/null 2>&1 || {
            log_error "Checksum verification failed"
            return 1
        }
    elif command -v sha256sum >/dev/null 2>&1; then
        echo "$(cat "$CHECKSUM_FILE")  $BACKUP_FILE" | sha256sum -c - > /dev/null 2>&1 || {
            log_error "Checksum verification failed"
            return 1
        }
    fi

    log_success "Backup verification passed"
    return 0
}

cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    if [ ! -d "$BACKUP_DIR" ]; then
        return 0
    fi

    # Find and delete old backup files
    DELETED_COUNT=0
    while IFS= read -r -d '' file; do
        rm -f "$file" "$file.sha256"
        ((DELETED_COUNT++)) || true
        log "Deleted old backup: $(basename "$file")"
    done < <(find "$BACKUP_DIR" -name "neuropilot_backup_*.db" -type f -mtime +"$RETENTION_DAYS" -print0 2>/dev/null)

    # Also clean up old log files
    find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

    if [ "$DELETED_COUNT" -gt 0 ]; then
        log "Deleted $DELETED_COUNT old backup(s)"
    else
        log "No old backups to delete"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log "========================================"
    log "NeuroPilot Database Backup v15.5.0"
    log "========================================"
    log "Database: $DB_PATH"
    log "Backup Directory: $BACKUP_DIR"
    log "Retention: $RETENTION_DAYS days"
    log ""

    START_TIME=$(date +%s)
    SUCCESS=0
    ERROR_MSG=""

    # Validate database before backup
    if ! validate_database; then
        ERROR_MSG="Database validation failed"
        write_metrics 0 0 0 "$ERROR_MSG"
        send_alert "❌ NeuroPilot Backup Failed" "Database validation failed for $DB_PATH"
        exit 1
    fi

    # Create backup
    if ! create_backup; then
        ERROR_MSG="Backup creation failed"
        write_metrics 0 0 0 "$ERROR_MSG"
        send_alert "❌ NeuroPilot Backup Failed" "Failed to create backup of $DB_PATH"
        exit 1
    fi

    # Generate checksum
    if ! generate_checksum; then
        ERROR_MSG="Checksum generation failed"
        write_metrics 0 0 0 "$ERROR_MSG"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    # Verify backup
    if ! verify_backup; then
        ERROR_MSG="Backup verification failed"
        write_metrics 0 0 0 "$ERROR_MSG"
        send_alert "❌ NeuroPilot Backup Failed" "Backup verification failed for $BACKUP_FILE"
        rm -f "$BACKUP_FILE" "$CHECKSUM_FILE"
        exit 1
    fi

    # Cleanup old backups
    cleanup_old_backups

    # Calculate duration
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Write success metrics
    write_metrics 1 "$DURATION" "$BACKUP_SIZE"

    log ""
    log_success "Backup completed successfully in ${DURATION}s"
    log "Backup file: $BACKUP_FILE"
    log "Checksum file: $CHECKSUM_FILE"
    log "========================================"

    exit 0
}

# Run main function
main
