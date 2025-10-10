#!/bin/sh
# PostgreSQL Automated Backup Script for v2.8.0
# Runs daily at 2:00 AM via cron

set -e

# Configuration
BACKUP_DIR="/backups"
ARCHIVE_DIR="/backups/archive"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/inventory_enterprise_${TIMESTAMP}.sql"
BACKUP_FILE_COMPRESSED="${BACKUP_FILE}.gz"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Database connection details
PGHOST=${POSTGRES_HOST:-postgres-primary}
PGPORT=${POSTGRES_PORT:-5432}
PGUSER=${POSTGRES_USER:-inventory_admin}
PGPASSWORD=${POSTGRES_PASSWORD}
PGDATABASE=${POSTGRES_DB:-inventory_enterprise}

export PGPASSWORD

# Create backup directories
mkdir -p "${BACKUP_DIR}"
mkdir -p "${ARCHIVE_DIR}"

echo "========================================"
echo "PostgreSQL Backup Started: $(date)"
echo "========================================"

# Perform backup
echo "Creating backup: ${BACKUP_FILE}"
pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
  --format=plain \
  --verbose \
  --no-owner \
  --no-acl \
  > "${BACKUP_FILE}" 2>&1

if [ $? -eq 0 ]; then
  echo "✓ Backup created successfully"
else
  echo "✗ Backup failed!"
  exit 1
fi

# Compress backup
echo "Compressing backup..."
gzip "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
  echo "✓ Backup compressed: ${BACKUP_FILE_COMPRESSED}"
else
  echo "✗ Compression failed!"
  exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_FILE_COMPRESSED}" | cut -f1)
echo "Backup size: ${BACKUP_SIZE}"

# Create checksum
CHECKSUM=$(sha256sum "${BACKUP_FILE_COMPRESSED}" | cut -d' ' -f1)
echo "${CHECKSUM}" > "${BACKUP_FILE_COMPRESSED}.sha256"
echo "✓ Checksum created: ${CHECKSUM}"

# Verify backup integrity
echo "Verifying backup integrity..."
if gunzip -t "${BACKUP_FILE_COMPRESSED}" 2>/dev/null; then
  echo "✓ Backup integrity verified"
else
  echo "✗ Backup integrity check failed!"
  exit 1
fi

# Remove old backups
echo "Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "inventory_enterprise_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "inventory_enterprise_*.sql.gz.sha256" -type f -mtime +${RETENTION_DAYS} -delete
echo "✓ Old backups removed"

# Remove old WAL archives
echo "Removing WAL archives older than ${RETENTION_DAYS} days..."
find "${ARCHIVE_DIR}" -type f -mtime +${RETENTION_DAYS} -delete
echo "✓ Old archives removed"

# Count remaining backups
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "inventory_enterprise_*.sql.gz" -type f | wc -l)
echo "Total backups: ${BACKUP_COUNT}"

# Create backup report
REPORT_FILE="${BACKUP_DIR}/backup_report_${TIMESTAMP}.txt"
cat > "${REPORT_FILE}" <<EOF
PostgreSQL Backup Report
========================
Timestamp: $(date)
Database: ${PGDATABASE}
Host: ${PGHOST}:${PGPORT}
Backup File: ${BACKUP_FILE_COMPRESSED}
Backup Size: ${BACKUP_SIZE}
Checksum (SHA256): ${CHECKSUM}
Retention Days: ${RETENTION_DAYS}
Total Backups: ${BACKUP_COUNT}
Status: SUCCESS
EOF

echo "✓ Backup report created: ${REPORT_FILE}"

# Test restore capability (dry run)
echo "Testing restore capability (dry run)..."
TEST_DB="inventory_enterprise_test_restore"

# Drop test database if exists
psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres \
  -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1

# Create test database
psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres \
  -c "CREATE DATABASE ${TEST_DB};" >/dev/null 2>&1

# Restore to test database
gunzip -c "${BACKUP_FILE_COMPRESSED}" | \
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${TEST_DB}" \
  >/dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✓ Restore test successful"
  # Drop test database
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres \
    -c "DROP DATABASE ${TEST_DB};" >/dev/null 2>&1
else
  echo "✗ Restore test failed!"
  exit 1
fi

echo "========================================"
echo "PostgreSQL Backup Completed: $(date)"
echo "========================================"

# Send notification (optional)
# curl -X POST "${SLACK_WEBHOOK_URL}" \
#   -H 'Content-Type: application/json' \
#   -d "{\"text\":\"✓ PostgreSQL backup completed: ${BACKUP_FILE_COMPRESSED} (${BACKUP_SIZE})\"}"

exit 0
