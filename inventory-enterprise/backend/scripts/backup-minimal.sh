#!/usr/bin/env bash
################################################################################
# NeuroPilot Inventory - Minimal Backup Script
#
# Dependencies:
#   - pg_dump (postgresql-client)
#   - rclone (configured for OneDrive)
#
# Setup:
#   1. Install: brew install postgresql rclone (macOS) or apt install postgresql-client rclone (Linux)
#   2. Configure rclone: rclone config (create 'onedrive' remote)
#   3. Set DATABASE_URL env var or .env file
#   4. Schedule with cron: 0 2 * * * /path/to/backup-minimal.sh
#
# Usage:
#   ./backup-minimal.sh
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

# Load .env if present
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set. Export it or add to .env file."
  exit 1
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/tmp/neuropilot-backups}"
ONEDRIVE_REMOTE="${ONEDRIVE_REMOTE:-onedrive}"
ONEDRIVE_PATH="${ONEDRIVE_PATH:-NeuroPilot/backups/db}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ============================================================================
# Backup
# ============================================================================

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamped filename
TS=$(date +%F_%H-%M-%S)
FILE="${BACKUP_DIR}/inventory_${TS}.dump"

echo "→ Starting backup: $TS"
echo "→ Database: ${DATABASE_URL%%@*}@..."

# Perform pg_dump (custom format for compression)
if pg_dump "$DATABASE_URL" -Fc -f "$FILE"; then
  SIZE=$(du -h "$FILE" | cut -f1)
  echo "✅ Dump completed: $SIZE"
else
  echo "❌ Backup failed!"
  exit 1
fi

# ============================================================================
# Upload to OneDrive
# ============================================================================

echo "→ Uploading to OneDrive: ${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/"

if rclone copy "$FILE" "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" --progress; then
  echo "✅ Upload completed"
else
  echo "❌ Upload failed! Backup saved locally: $FILE"
  exit 1
fi

# ============================================================================
# Cleanup
# ============================================================================

# Securely delete local file
echo "→ Cleaning up local file..."
if command -v shred &> /dev/null; then
  shred -u "$FILE"
else
  rm -f "$FILE"
fi

# Delete old local backups
echo "→ Removing local backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "inventory_*.dump" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# Delete old remote backups
echo "→ Removing remote backups older than ${RETENTION_DAYS} days..."
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)

rclone lsf "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/" | while read -r remote_file; do
  if [[ $remote_file =~ inventory_([0-9]{4}-[0-9]{2}-[0-9]{2})_ ]]; then
    file_date="${BASH_REMATCH[1]}"
    if [[ "$file_date" < "$CUTOFF_DATE" ]]; then
      echo "  - Deleting: $remote_file"
      rclone delete "${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/${remote_file}"
    fi
  fi
done

echo "✅ Backup complete: $TS"

# ============================================================================
# Summary
# ============================================================================

cat << EOF

╔════════════════════════════════════════════════════════════════╗
║                    Backup Summary                               ║
╚════════════════════════════════════════════════════════════════╝

📅 Timestamp:       $TS
📦 Size:            $SIZE
☁️  Remote:          ${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/inventory_${TS}.dump
🗂️  Retention:       ${RETENTION_DAYS} days

To restore:
  rclone copy ${ONEDRIVE_REMOTE}:${ONEDRIVE_PATH}/inventory_${TS}.dump ./
  pg_restore -d "\$DATABASE_URL" -c inventory_${TS}.dump

EOF
