#!/bin/bash

# Final upload script for Fly.io
APP_NAME="backend-silent-mountain-3362"

echo "🚀 Uploading inventory data to Fly.io..."

# First create the SFTP batch file
cat > sftp_commands.txt << 'EOF'
put data/inventory/inventory_items.json /data/inventory/inventory_items.json
put data/inventory/locations.json /data/inventory/locations.json  
put data/inventory/master_inventory.json /data/inventory/master_inventory.json
put data/inventory/suppliers.json /data/inventory/suppliers.json
put data/inventory/products.json /data/inventory/products.json
put data/inventory/orders.json /data/inventory/orders.json
put data/secure_users.json /data/secure_users.json
put data/real_business_data.json /data/real_business_data.json
EOF

# Upload GFS orders
for file in data/gfs_orders/gfs_order_*.json; do
    if [ -f "$file" ]; then
        echo "put $file /data/gfs_orders/$(basename $file)" >> sftp_commands.txt
    fi
done

echo "quit" >> sftp_commands.txt

# Execute SFTP upload
echo "📤 Uploading files via SFTP..."
flyctl ssh sftp shell -a $APP_NAME < sftp_commands.txt

# Clean up
rm -f sftp_commands.txt

# Restart the app
echo "🔄 Restarting application..."
flyctl machine restart 7811113c0711d8 -a $APP_NAME

echo "✅ Upload complete!"
echo ""
echo "🌐 Check your inventory at:"
echo "   https://backend-silent-mountain-3362.fly.dev"