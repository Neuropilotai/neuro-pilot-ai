#!/bin/bash

# Sync local inventory data to Fly.io deployment
# Created: 2025-08-05

APP_NAME="backend-silent-mountain-3362"
LOCAL_DATA_DIR="./data"

echo "🚀 Syncing local inventory data to Fly.io..."

# First, let's SSH into the Fly machine and backup current data
echo "📦 Creating backup on remote server..."
flyctl ssh console -a $APP_NAME -C "cd /data && tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz inventory/ gfs_orders/ catalog/ storage_locations/ secure_users.json real_business_data.json 2>/dev/null || true"

# Now sync the important data directories
echo "📤 Uploading inventory data..."
flyctl ssh console -a $APP_NAME -C "mkdir -p /data/inventory /data/gfs_orders /data/catalog /data/storage_locations"

# Upload each critical directory
echo "  - Uploading inventory items..."
cat "$LOCAL_DATA_DIR/inventory/inventory_items.json" | flyctl ssh console -a $APP_NAME -C "cat > /data/inventory/inventory_items.json"

echo "  - Uploading locations..."
cat "$LOCAL_DATA_DIR/inventory/locations.json" | flyctl ssh console -a $APP_NAME -C "cat > /data/inventory/locations.json"

echo "  - Uploading storage locations..."
cat "$LOCAL_DATA_DIR/storage_locations/locations.json" | flyctl ssh console -a $APP_NAME -C "cat > /data/storage_locations/locations.json"

echo "  - Uploading catalog..."
cat "$LOCAL_DATA_DIR/catalog/sysco_catalog_1753182965099.json" | flyctl ssh console -a $APP_NAME -C "cat > /data/catalog/sysco_catalog_1753182965099.json"

echo "  - Uploading secure users..."
cat "$LOCAL_DATA_DIR/secure_users.json" | flyctl ssh console -a $APP_NAME -C "cat > /data/secure_users.json"

# Upload GFS orders (only active ones, not deleted)
echo "  - Uploading GFS orders..."
for file in $LOCAL_DATA_DIR/gfs_orders/gfs_order_*.json; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "    - $filename"
        cat "$file" | flyctl ssh console -a $APP_NAME -C "cat > /data/gfs_orders/$filename"
    fi
done

echo "🔄 Restarting the application..."
flyctl apps restart $APP_NAME

echo "✅ Sync complete! Your remote inventory at https://$APP_NAME.fly.dev should now match your local data."
echo "📊 Local stats:"
echo "  - Inventory items: $(jq '.length' $LOCAL_DATA_DIR/inventory/inventory_items.json 2>/dev/null || echo 'N/A')"
echo "  - GFS orders: $(ls -1 $LOCAL_DATA_DIR/gfs_orders/gfs_order_*.json 2>/dev/null | wc -l)"
echo "  - Storage locations: $(jq '.length' $LOCAL_DATA_DIR/storage_locations/locations.json 2>/dev/null || echo 'N/A')"