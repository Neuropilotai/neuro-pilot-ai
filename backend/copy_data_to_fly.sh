#!/bin/bash

# Copy essential data files to Fly.io persistent volume
echo "Copying data files to Fly.io..."

# Copy the entire data directory structure
echo "Creating data directory structure..."
fly ssh console --app backend-silent-mountain-3362 -C "mkdir -p /data/catalog /data/gfs_orders /data/gfs_orders_backup /data/inventory /data/storage_locations"

# Use fly sftp to copy files
echo "Copying catalog data..."
fly ssh sftp shell --app backend-silent-mountain-3362 <<EOF
put /Users/davidmikulis/neuro-pilot-ai/backend/data/catalog/sysco_catalog_1753182965099.json /data/catalog/sysco_catalog_1753182965099.json
exit
EOF

echo "Copying GFS orders..."
# Copy all GFS order files
fly ssh sftp shell --app backend-silent-mountain-3362 <<EOF
cd /data/gfs_orders
lcd /Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders
mput gfs_order_*.json
exit
EOF

echo "Copying inventory data..."
fly ssh sftp shell --app backend-silent-mountain-3362 <<EOF
cd /data/inventory
lcd /Users/davidmikulis/neuro-pilot-ai/backend/data/inventory
mput *.json
exit
EOF

echo "Copying storage locations..."
fly ssh sftp shell --app backend-silent-mountain-3362 <<EOF
cd /data/storage_locations
lcd /Users/davidmikulis/neuro-pilot-ai/backend/data/storage_locations
mput *.json
exit
EOF

echo "Data copy completed!"
echo "Restarting app to load new data..."
fly apps restart backend-silent-mountain-3362