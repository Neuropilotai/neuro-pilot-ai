#!/bin/bash

# Copy essential data files to Fly.io persistent volume
echo "Copying data files to Fly.io..."

# Copy Sysco catalog
echo "Copying Sysco catalog..."
cat "/Users/davidmikulis/neuro-pilot-ai/backend/data/catalog/sysco_catalog_1753182965099.json" | flyctl ssh console --app backend-silent-mountain-3362 -C "cat > /data/sysco_catalog.json"

# Create GFS orders directory if it doesn't exist and copy orders
echo "Copying GFS orders..."
flyctl ssh console --app backend-silent-mountain-3362 -C "mkdir -p /data/gfs_orders"

# Copy some GFS orders (first 10 files)
for file in /Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders/gfs_order_*.json; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "Copying $filename..."
        cat "$file" | flyctl ssh console --app backend-silent-mountain-3362 -C "cat > /data/gfs_orders/$filename"
    fi
done

echo "Data copy completed!"