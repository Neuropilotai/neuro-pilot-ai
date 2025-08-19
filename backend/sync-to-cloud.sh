#!/bin/bash

# Automated sync script for multiple cloud services
# Keeps Fly.io as primary, uses cloud storage for backup

echo "☁️  Cloud Sync for Inventory System"
echo "=================================="

# 1. Ensure Fly.io is updated (PRIMARY)
echo "1️⃣ Updating Fly.io (Primary)..."
if [ -f "./upload-inventory-to-fly.sh" ]; then
    ./upload-inventory-to-fly.sh
else
    echo "❌ Fly.io upload script not found"
fi

# 2. Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="inventory_backup_$TIMESTAMP"

echo ""
echo "2️⃣ Creating backup archive..."
mkdir -p backups
tar -czf "backups/${BACKUP_NAME}.tar.gz" \
    data/inventory/*.json \
    data/gfs_orders/gfs_order_*.json \
    data/catalog/*.json \
    data/storage_locations/*.json \
    data/secure_users.json \
    data/real_business_data.json 2>/dev/null

# 3. GitHub sync (VERSION CONTROL)
echo ""
echo "3️⃣ Syncing to GitHub..."
if [ -f "./upload-to-github.sh" ]; then
    ./upload-to-github.sh
else
    # Create GitHub sync if it doesn't exist
    git add data/inventory/*.json data/gfs_orders/*.json data/catalog/*.json data/storage_locations/*.json
    git commit -m "📊 Inventory sync - $TIMESTAMP" || echo "No changes to commit"
    git push origin main || echo "Push failed - check credentials"
fi

# 4. Google Drive sync (if rclone is configured)
echo ""
echo "4️⃣ Checking Google Drive sync..."
if command -v rclone &> /dev/null; then
    echo "Syncing to Google Drive..."
    rclone copy "backups/${BACKUP_NAME}.tar.gz" "gdrive:CampInventoryBackups/"
    rclone sync data/inventory "gdrive:CampInventory/inventory" --exclude "*.log"
    rclone sync data/gfs_orders "gdrive:CampInventory/gfs_orders" --include "gfs_order_*.json"
else
    echo "ℹ️  rclone not configured. To set up Google Drive sync:"
    echo "   1. Install rclone: brew install rclone"
    echo "   2. Configure: rclone config"
    echo "   3. Create remote named 'gdrive'"
fi

# 5. OneDrive sync (if configured)
echo ""
echo "5️⃣ Checking OneDrive sync..."
if [ -d "$HOME/OneDrive" ]; then
    echo "Copying to OneDrive..."
    mkdir -p "$HOME/OneDrive/CampInventory/backups"
    cp "backups/${BACKUP_NAME}.tar.gz" "$HOME/OneDrive/CampInventory/backups/"
    echo "✅ Copied to OneDrive"
elif [ -d "$HOME/Library/CloudStorage/OneDrive-Personal" ]; then
    echo "Copying to OneDrive..."
    mkdir -p "$HOME/Library/CloudStorage/OneDrive-Personal/CampInventory/backups"
    cp "backups/${BACKUP_NAME}.tar.gz" "$HOME/Library/CloudStorage/OneDrive-Personal/CampInventory/backups/"
    echo "✅ Copied to OneDrive"
else
    echo "ℹ️  OneDrive folder not found"
fi

# 6. Summary
echo ""
echo "📊 Sync Summary:"
echo "=================="
echo "✅ Primary (Fly.io): https://backend-silent-mountain-3362.fly.dev"
echo "✅ Backup created: backups/${BACKUP_NAME}.tar.gz"
echo "📍 GitHub: Check git status"
echo "📍 Google Drive: $(command -v rclone &> /dev/null && echo "Configured" || echo "Not configured")"
echo "📍 OneDrive: $([ -d "$HOME/OneDrive" ] || [ -d "$HOME/Library/CloudStorage/OneDrive-Personal" ] && echo "Available" || echo "Not found")"

# Clean up old backups (keep last 7)
echo ""
echo "🧹 Cleaning old backups..."
cd backups
ls -t inventory_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
cd ..

echo ""
echo "✅ Cloud sync complete!"