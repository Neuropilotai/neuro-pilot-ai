#!/usr/bin/env bash
set -Eeuo pipefail

ENV="$1"
APP="$2"

echo "🔒 Pre-${ENV} backup for ${APP}"
echo "==========================================="

# Lighter backup for staging
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="./backups/${ENV}/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

# Just backup config files for staging
echo "📋 Backing up staging configuration..."
cp fly.toml "${BACKUP_DIR}/" 2>/dev/null || true
cp .env.* "${BACKUP_DIR}/" 2>/dev/null || true

echo "✅ Staging backup completed: ${BACKUP_DIR}"