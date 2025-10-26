#!/bin/bash
################################################################################
# NeuroPilot Inventory - PostgreSQL Backup Script
#
# Features:
# - Automated pg_dump with compression
# - GPG encryption
# - OneDrive sync via rclone
# - Retention policy (30 days)
# - Verification checks
# - Slack/email notifications
#
# Usage: ./backup-database.sh [--force] [--skip-upload]
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

# Load config file if exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/.backup-config"

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
else
    echo "⚠️  Warning: Config file not found at $CONFIG_FILE"
    echo "Creating template config..."
    cat > "$CONFIG_FILE" << 'EOF'
# PostgreSQL Connection (Neon.tech)
export PGHOST="your-project.neon.tech"
export PGDATABASE="neuropilot_inventory"
export PGUSER="app_user"
export PGPASSWORD="your_password_here"
export PGSSLMODE="require"

# Backup Settings
BACKUP_DIR="/tmp/neuropilot-backups"
RETENTION_DAYS=30
GPG_RECIPIENT="backup@yourcompany.com"
GPG_KEY_ID="YOUR_GPG_KEY_ID"

# OneDrive Settings (rclone remote name)
ONEDRIVE_REMOTE="onedrive"
ONEDRIVE_PATH="NeuroPilot/Backups"

# Notifications
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
NOTIFY_EMAIL="ops@yourcompany.com"

# Optional: Backup verification
VERIFY_BACKUPS=true
EOF
    echo "✅ Template config created. Please edit $CONFIG_FILE with your credentials."
    exit 1
fi

# Parse command line arguments
FORCE_BACKUP=false
SKIP_UPLOAD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_BACKUP=true
            shift
            ;;
        --skip-upload)
            SKIP_UPLOAD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--force] [--skip-upload]"
            exit 1
            ;;
    esac
done

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

send_slack_notification() {
    local message=$1
    local emoji=${2:-":warning:"}

    if [ -n "${SLACK_WEBHOOK_URL:-}" ] && [ "$SLACK_WEBHOOK_URL" != "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"${emoji} NeuroPilot Backup: ${message}\"}" \
            "$SLACK_WEBHOOK_URL" &>/dev/null || true
    fi
}

send_email_notification() {
    local subject=$1
    local body=$2

    if [ -n "${NOTIFY_EMAIL:-}" ] && command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$NOTIFY_EMAIL" || true
    fi
}

check_dependencies() {
    local missing_deps=()

    # Required tools
    command -v pg_dump &> /dev/null || missing_deps+=("postgresql-client")
    command -v gpg &> /dev/null || missing_deps+=("gnupg")
    command -v rclone &> /dev/null || missing_deps+=("rclone")
    command -v gzip &> /dev/null || missing_deps+=("gzip")

    if [ ${#missing_deps[@]} -gt 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo ""
        echo "Install with:"
        echo "  brew install postgresql gnupg rclone  # macOS"
        echo "  apt install postgresql-client gnupg rclone gzip  # Ubuntu/Debian"
        exit 1
    fi
}

verify_gpg_key() {
    if ! gpg --list-keys "$GPG_RECIPIENT" &> /dev/null; then
        error "GPG key not found for $GPG_RECIPIENT"
        echo ""
        echo "Generate a new GPG key:"
        echo "  gpg --full-generate-key"
        echo ""
        echo "Or import existing key:"
        echo "  gpg --import /path/to/private.key"
        exit 1
    fi
    log "✅ GPG key verified for $GPG_RECIPIENT"
}

verify_rclone() {
    if [ "$SKIP_UPLOAD" = true ]; then
        return 0
    fi

    if ! rclone listremotes | grep -q "^${ONEDRIVE_REMOTE}:$"; then
        error "rclone remote '$ONEDRIVE_REMOTE' not configured"
        echo ""
        echo "Configure OneDrive with rclone:"
        echo "  rclone config"
        echo "  - Choose: New remote"
        echo "  - Name: $ONEDRIVE_REMOTE"
        echo "  - Type: onedrive"
        echo "  - Follow the authentication flow"
        exit 1
    fi
    log "✅ rclone remote verified"
}

create_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"  # Restrict permissions
}

perform_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/neuropilot_${timestamp}.sql"
    local compressed_file="${backup_file}.gz"
    local encrypted_file="${compressed_file}.gpg"

    log "Starting PostgreSQL backup..."
    log "Database: $PGDATABASE@$PGHOST"

    # Perform pg_dump with verbose output
    if pg_dump \
        --verbose \
        --format=plain \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --file="$backup_file" \
        2>&1 | tee "${BACKUP_DIR}/backup_${timestamp}.log"; then

        log "✅ Database dump completed: $backup_file"
    else
        error "pg_dump failed"
        send_slack_notification "Database backup FAILED" ":x:"
        send_email_notification "NeuroPilot Backup FAILED" "pg_dump failed at $(date)"
        exit 1
    fi

    # Get backup size
    local dump_size=$(du -h "$backup_file" | cut -f1)
    log "Dump size: $dump_size"

    # Compress
    log "Compressing backup..."
    gzip -9 "$backup_file"
    local compressed_size=$(du -h "$compressed_file" | cut -f1)
    log "✅ Compressed: $compressed_size"

    # Encrypt with GPG
    log "Encrypting backup..."
    gpg --encrypt \
        --recipient "$GPG_RECIPIENT" \
        --trust-model always \
        --output "$encrypted_file" \
        "$compressed_file"

    # Remove unencrypted file
    rm -f "$compressed_file"

    local encrypted_size=$(du -h "$encrypted_file" | cut -f1)
    log "✅ Encrypted: $encrypted_size"

    # Generate checksum
    local checksum_file="${encrypted_file}.sha256"
    sha256sum "$encrypted_file" > "$checksum_file"
    log "✅ Checksum: $(cut -d' ' -f1 "$checksum_file")"

    # Export metadata
    local metadata_file="${BACKUP_DIR}/neuropilot_${timestamp}.json"
    cat > "$metadata_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "database": "$PGDATABASE",
  "host": "$PGHOST",
  "dump_size": "$dump_size",
  "compressed_size": "$compressed_size",
  "encrypted_size": "$encrypted_size",
  "checksum": "$(cut -d' ' -f1 "$checksum_file")",
  "pg_version": "$(pg_dump --version | head -n1)",
  "backup_file": "$(basename "$encrypted_file")"
}
EOF

    echo "$encrypted_file"
}

upload_to_onedrive() {
    local encrypted_file=$1
    local checksum_file="${encrypted_file}.sha256"
    local timestamp=$(basename "$encrypted_file" | sed 's/neuropilot_\(.*\)\.sql\.gz\.gpg/\1/')
    local metadata_file="${BACKUP_DIR}/neuropilot_${timestamp}.json"

    if [ "$SKIP_UPLOAD" = true ]; then
        log "⏭️  Skipping upload (--skip-upload flag)"
        return 0
    fi

    log "Uploading to OneDrive..."

    # Create remote directory if it doesn't exist
    rclone mkdir "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}" 2>/dev/null || true

    # Upload encrypted backup
    if rclone copy "$encrypted_file" "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" --progress; then
        log "✅ Backup uploaded"
    else
        error "Failed to upload backup to OneDrive"
        send_slack_notification "Backup upload to OneDrive FAILED" ":x:"
        return 1
    fi

    # Upload checksum
    rclone copy "$checksum_file" "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" --progress

    # Upload metadata
    rclone copy "$metadata_file" "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" --progress

    log "✅ All files uploaded to ${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/"
}

verify_backup() {
    local encrypted_file=$1

    if [ "${VERIFY_BACKUPS:-false}" != "true" ]; then
        log "⏭️  Skipping verification (disabled in config)"
        return 0
    fi

    log "Verifying backup integrity..."

    # Test GPG decryption (without actually decrypting to disk)
    if gpg --decrypt "$encrypted_file" 2>/dev/null | gzip -t 2>/dev/null; then
        log "✅ Backup verification passed"
        return 0
    else
        error "Backup verification FAILED - file may be corrupted"
        send_slack_notification "Backup verification FAILED" ":x:"
        return 1
    fi
}

cleanup_old_backups() {
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."

    # Local cleanup
    find "$BACKUP_DIR" -name "neuropilot_*.sql.gz.gpg" -mtime +${RETENTION_DAYS} -delete
    find "$BACKUP_DIR" -name "neuropilot_*.sha256" -mtime +${RETENTION_DAYS} -delete
    find "$BACKUP_DIR" -name "neuropilot_*.json" -mtime +${RETENTION_DAYS} -delete
    find "$BACKUP_DIR" -name "backup_*.log" -mtime +${RETENTION_DAYS} -delete

    local remaining=$(find "$BACKUP_DIR" -name "neuropilot_*.sql.gz.gpg" | wc -l)
    log "✅ Local backups retained: $remaining"

    # Remote cleanup (OneDrive)
    if [ "$SKIP_UPLOAD" = false ]; then
        # List remote files older than retention period
        local cutoff_date=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

        rclone lsf "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" | while read -r file; do
            # Extract timestamp from filename (neuropilot_YYYYMMDD_HHMMSS.sql.gz.gpg)
            if [[ $file =~ neuropilot_([0-9]{8})_[0-9]{6} ]]; then
                file_date="${BASH_REMATCH[1]}"
                if [ "$file_date" -lt "$cutoff_date" ]; then
                    log "Deleting old remote backup: $file"
                    rclone delete "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/${file}"
                fi
            fi
        done

        log "✅ Remote cleanup completed"
    fi
}

generate_backup_report() {
    local encrypted_file=$1
    local duration=$2

    local backup_size=$(du -h "$encrypted_file" | cut -f1)
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')

    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║                 BACKUP REPORT                                   ║
╚════════════════════════════════════════════════════════════════╝

📅 Timestamp:       $timestamp
🗄️  Database:        $PGDATABASE @ $PGHOST
📦 Backup Size:     $backup_size
⏱️  Duration:        ${duration}s
🔐 Encryption:      GPG (recipient: $GPG_RECIPIENT)
☁️  Upload:          ${SKIP_UPLOAD:-false}
📂 Local Path:      $encrypted_file
📂 Remote Path:     ${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/
🔒 Retention:       ${RETENTION_DAYS} days

✅ Backup completed successfully!

EOF
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    local start_time=$(date +%s)

    log "=========================================="
    log "NeuroPilot PostgreSQL Backup"
    log "=========================================="

    # Pre-flight checks
    check_dependencies
    verify_gpg_key
    verify_rclone
    create_backup_dir

    # Perform backup
    local encrypted_file
    encrypted_file=$(perform_backup)

    # Upload to cloud
    if ! upload_to_onedrive "$encrypted_file"; then
        error "Upload failed, but backup exists locally: $encrypted_file"
    fi

    # Verify backup integrity
    verify_backup "$encrypted_file"

    # Cleanup old backups
    cleanup_old_backups

    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Generate report
    generate_backup_report "$encrypted_file" "$duration"

    # Send success notification
    local backup_size=$(du -h "$encrypted_file" | cut -f1)
    send_slack_notification "Database backup completed successfully ($backup_size in ${duration}s)" ":white_check_mark:"

    log "=========================================="
    log "Backup completed in ${duration}s"
    log "=========================================="
}

# Run main function
main "$@"
