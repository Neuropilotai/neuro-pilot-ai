#!/usr/bin/env bash
set -euo pipefail

# dr-drill.sh
# Disaster Recovery Drill - Test backup restoration
# Run quarterly (15 minutes)

echo "🚨 Disaster Recovery Drill"
echo "============================"
echo ""
echo "⚠️  This script tests backup restoration on a Neon branch."
echo "   It will NOT affect production data."
echo ""

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$HOME/Library/CloudStorage/OneDrive-Personal/NeuroPilot/backups}"
NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"

if [[ -z "$NEON_PROJECT_ID" ]]; then
  echo "❌ Set NEON_PROJECT_ID environment variable"
  echo "   Get it from: https://console.neon.tech/app/projects"
  exit 1
fi

# Check prerequisites
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing $1"; exit 1; }; }
need psql
need jq
need curl

echo "1️⃣  Finding Latest Backup"
echo "-------------------------"

# Find most recent backup
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1)

if [[ -z "$LATEST_BACKUP" ]]; then
  echo "❌ No backups found in $BACKUP_DIR"
  exit 1
fi

BACKUP_DATE=$(basename "$LATEST_BACKUP" .dump | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "unknown")
BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)

echo "Latest backup: $LATEST_BACKUP"
echo "Date: $BACKUP_DATE"
echo "Size: $BACKUP_SIZE"
echo ""

read -p "Continue with DR drill? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Drill cancelled"
  exit 0
fi

echo ""
echo "2️⃣  Creating Test Branch"
echo "-------------------------"

# Create Neon branch for testing
BRANCH_NAME="dr-drill-$(date +%Y%m%d-%H%M%S)"

echo "Creating branch: $BRANCH_NAME"
# Note: Replace with actual Neon API call or use neonctl if available
# neonctl branches create --project-id "$NEON_PROJECT_ID" --name "$BRANCH_NAME"

echo "⚠️  Manual step required:"
echo "   1. Go to https://console.neon.tech/app/projects/$NEON_PROJECT_ID"
echo "   2. Create a branch named: $BRANCH_NAME"
echo "   3. Copy the connection string"
echo ""

read -p "Enter test branch DATABASE_URL: " TEST_DB_URL

if [[ -z "$TEST_DB_URL" ]]; then
  echo "❌ No DATABASE_URL provided"
  exit 1
fi

echo ""
echo "3️⃣  Restoring Backup"
echo "--------------------"

echo "Restoring to test branch..."
if pg_restore -c -d "$TEST_DB_URL" "$LATEST_BACKUP" 2>&1 | head -20; then
  echo "✅ Restore completed (check for errors above)"
else
  echo "⚠️  Restore completed with warnings"
fi

echo ""
echo "4️⃣  Verification Tests"
echo "----------------------"

# Test 1: Table count
echo "Checking tables..."
TABLE_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
echo "Tables found: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -lt 10 ]]; then
  echo "⚠️  Low table count - backup may be incomplete"
fi

# Test 2: Critical tables
echo "Checking critical tables..."
CRITICAL_TABLES=("app_user" "refresh_token" "tenants" "item_master")
for table in "${CRITICAL_TABLES[@]}"; do
  if psql "$TEST_DB_URL" -t -c "SELECT 1 FROM $table LIMIT 1" >/dev/null 2>&1; then
    echo "  ✅ $table"
  else
    echo "  ❌ $table (missing or empty)"
  fi
done

# Test 3: Row counts
echo "Checking data integrity..."
USER_COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM app_user" 2>/dev/null || echo "0")
echo "Users: $USER_COUNT"

echo ""
echo "5️⃣  Cleanup"
echo "-----------"

read -p "Delete test branch? (Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo "⚠️  Manual cleanup required:"
  echo "   Delete branch: $BRANCH_NAME"
  echo "   From: https://console.neon.tech/app/projects/$NEON_PROJECT_ID"
else
  echo "Test branch kept: $BRANCH_NAME"
fi

echo ""
echo "============================"
echo "🎉 DR Drill Complete"
echo "============================"
echo ""
echo "Summary:"
echo "  Backup file: $LATEST_BACKUP"
echo "  Backup date: $BACKUP_DATE"
echo "  Backup size: $BACKUP_SIZE"
echo "  Tables restored: $TABLE_COUNT"
echo "  Users restored: $USER_COUNT"
echo ""
echo "Next DR drill: $(date -v+3m +%Y-%m-%d 2>/dev/null || date -d '+3 months' +%Y-%m-%d 2>/dev/null || echo 'in 3 months')"
