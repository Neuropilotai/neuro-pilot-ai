#!/usr/bin/env bash
set -Eeuo pipefail

ENV="$1"
APP="$2"

echo "🔒 Pre-${ENV} backup for ${APP}"
echo "==========================================="

# Create timestamp for backup
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="./backups/${ENV}/${TIMESTAMP}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Backup inventory files if they exist
if [[ -d "./data" ]]; then
  echo "📦 Backing up local data files..."
  cp -a ./data/*.json "${BACKUP_DIR}/" 2>/dev/null || echo "No JSON files to backup"
  cp -a ./data/*.db "${BACKUP_DIR}/" 2>/dev/null || echo "No DB files to backup"
fi

# Backup environment configuration
if [[ -f ".env.production" ]]; then
  echo "📋 Backing up production environment..."
  cp .env.production "${BACKUP_DIR}/.env.production.backup"
fi

# Create backup manifest
cat > "${BACKUP_DIR}/manifest.txt" <<EOF
Backup Manifest
===============
Environment: ${ENV}
App: ${APP}
Date: $(date)
Timestamp: ${TIMESTAMP}

Files backed up:
$(ls -la "${BACKUP_DIR}" 2>/dev/null || echo "No files")
EOF

# Optional: Sync to cloud storage
# Uncomment and configure as needed:

# Google Drive sync (requires rclone configured)
# if command -v rclone >/dev/null 2>&1; then
#   echo "☁️  Syncing to Google Drive..."
#   rclone copy "${BACKUP_DIR}" "gdrive:backups/${ENV}/${TIMESTAMP}" --progress
# fi

# AWS S3 sync (requires aws cli configured)
# if command -v aws >/dev/null 2>&1; then
#   echo "☁️  Syncing to S3..."
#   aws s3 sync "${BACKUP_DIR}" "s3://your-bucket/backups/${ENV}/${TIMESTAMP}"
# fi

# GitHub backup (for configuration files only)
# if [[ -d ".git" ]]; then
#   echo "📤 Creating git backup branch..."
#   git checkout -b "backup-${ENV}-${TIMESTAMP}" 2>/dev/null || true
#   git add -A
#   git commit -m "Backup before ${ENV} deployment - ${TIMESTAMP}" || true
#   git checkout main
# fi

echo "✅ Backup completed: ${BACKUP_DIR}"
echo "Total size: $(du -sh "${BACKUP_DIR}" | cut -f1)"

# Keep only last 10 backups
echo "🧹 Cleaning old backups..."
BACKUP_COUNT=$(ls -1 "./backups/${ENV}" 2>/dev/null | wc -l)
if [[ $BACKUP_COUNT -gt 10 ]]; then
  ls -1t "./backups/${ENV}" | tail -n +11 | while read -r old_backup; do
    echo "  Removing old backup: $old_backup"
    rm -rf "./backups/${ENV}/${old_backup}"
  done
fi

echo "✅ Pre-deployment backup complete"