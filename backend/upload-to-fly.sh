#!/bin/bash

# Upload local data to Fly.io as a tar archive
APP_NAME="backend-silent-mountain-3362"
LOCAL_DATA_DIR="./data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Preparing to sync local inventory data to Fly.io..."

# Create a tar archive of the data
echo "📦 Creating data archive..."
cd "$LOCAL_DATA_DIR"
tar -czf ../data_sync_$TIMESTAMP.tar.gz \
    inventory/*.json \
    gfs_orders/gfs_order_*.json \
    catalog/*.json \
    storage_locations/*.json \
    secure_users.json \
    real_business_data.json 2>/dev/null || true
cd ..

echo "📤 Uploading archive to Fly.io..."
# First, let's SSH into the machine and prepare
flyctl ssh console -a $APP_NAME <<'REMOTE_SCRIPT'
#!/bin/sh
# Backup current data
cd /data
if [ -d inventory ]; then
    tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz inventory/ gfs_orders/ catalog/ storage_locations/ secure_users.json real_business_data.json 2>/dev/null || true
    echo "✅ Backup created"
fi

# Create necessary directories
mkdir -p /data/inventory /data/gfs_orders /data/catalog /data/storage_locations
echo "✅ Directories ready"
REMOTE_SCRIPT

# Now upload and extract the archive
echo "📥 Transferring and extracting data..."
cat data_sync_$TIMESTAMP.tar.gz | flyctl ssh console -a $APP_NAME -C "cd /data && tar -xzf - && echo '✅ Data extracted successfully'"

# Clean up local archive
rm -f data_sync_$TIMESTAMP.tar.gz

echo "🔄 Restarting the application..."
flyctl apps restart $APP_NAME

echo ""
echo "✅ Sync complete!"
echo "🌐 Your inventory system at https://$APP_NAME.fly.dev"
echo "   now has all your local data!"
echo ""
echo "📊 To verify, visit:"
echo "   https://$APP_NAME.fly.dev/health"