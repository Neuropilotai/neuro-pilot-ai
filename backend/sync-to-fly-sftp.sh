#!/bin/bash

# Alternative sync method using flyctl sftp
APP_NAME="backend-silent-mountain-3362"
LOCAL_DATA_DIR="./data"

echo "🚀 Syncing local inventory data to Fly.io using SFTP..."

# Create necessary directories on remote
echo "📁 Creating remote directories..."
flyctl ssh console -a $APP_NAME -C "mkdir -p /data/inventory /data/gfs_orders /data/catalog /data/storage_locations"

# Use flyctl sftp to upload files
echo "📤 Uploading data files..."

# Upload inventory files
echo "  - Uploading inventory data..."
flyctl ssh sftp shell -a $APP_NAME <<EOF
put $LOCAL_DATA_DIR/inventory/inventory_items.json /data/inventory/inventory_items.json
put $LOCAL_DATA_DIR/inventory/locations.json /data/inventory/locations.json
put $LOCAL_DATA_DIR/inventory/master_inventory.json /data/inventory/master_inventory.json
put $LOCAL_DATA_DIR/inventory/suppliers.json /data/inventory/suppliers.json
put $LOCAL_DATA_DIR/inventory/products.json /data/inventory/products.json
put $LOCAL_DATA_DIR/inventory/orders.json /data/inventory/orders.json
put $LOCAL_DATA_DIR/inventory/movements.json /data/inventory/movements.json
put $LOCAL_DATA_DIR/inventory/analytics.json /data/inventory/analytics.json
put $LOCAL_DATA_DIR/inventory/alerts.json /data/inventory/alerts.json
put $LOCAL_DATA_DIR/inventory/forecasts.json /data/inventory/forecasts.json
put $LOCAL_DATA_DIR/inventory/training_progress.json /data/inventory/training_progress.json
EOF

# Upload storage locations
echo "  - Uploading storage locations..."
flyctl ssh sftp shell -a $APP_NAME <<EOF
put $LOCAL_DATA_DIR/storage_locations/locations.json /data/storage_locations/locations.json
EOF

# Upload catalog
echo "  - Uploading Sysco catalog..."
flyctl ssh sftp shell -a $APP_NAME <<EOF
put $LOCAL_DATA_DIR/catalog/sysco_catalog_1753182965099.json /data/catalog/sysco_catalog_1753182965099.json
EOF

# Upload secure users
echo "  - Uploading secure users..."
flyctl ssh sftp shell -a $APP_NAME <<EOF
put $LOCAL_DATA_DIR/secure_users.json /data/secure_users.json
EOF

# Upload real business data if exists
if [ -f "$LOCAL_DATA_DIR/real_business_data.json" ]; then
    echo "  - Uploading business data..."
    flyctl ssh sftp shell -a $APP_NAME <<EOF
put $LOCAL_DATA_DIR/real_business_data.json /data/real_business_data.json
EOF
fi

# Upload GFS orders
echo "  - Uploading GFS orders..."
for file in $LOCAL_DATA_DIR/gfs_orders/gfs_order_*.json; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "    - $filename"
        flyctl ssh sftp shell -a $APP_NAME <<EOF
put $file /data/gfs_orders/$filename
EOF
    fi
done

echo "🔄 Restarting the application..."
flyctl apps restart $APP_NAME

echo "✅ Sync complete!"
echo ""
echo "📊 Your remote inventory at https://$APP_NAME.fly.dev now has:"
echo "  - $(ls -1 $LOCAL_DATA_DIR/gfs_orders/gfs_order_*.json 2>/dev/null | wc -l) GFS orders"
echo "  - Sysco catalog with 2,932 items"
echo "  - All inventory data from your local system"