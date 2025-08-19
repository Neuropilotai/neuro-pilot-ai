#!/bin/bash

# GitHub sync script for inventory and orders data
# This syncs your actual inventory data to GitHub

echo "🚀 GitHub Inventory & Orders Sync"
echo "================================="

# Configuration
GITHUB_REPO="https://github.com/Neuropilotai/gfs-orders-data.git"
TEMP_DIR="/tmp/inventory-sync-$$"
DATA_DIR="/Users/davidmikulis/neuro-pilot-ai/backend/data"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Create temporary directory
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Clone the repository
echo "📥 Cloning repository..."
git clone "$GITHUB_REPO" . || {
    echo "❌ Failed to clone repository"
    echo "Make sure you have access to: $GITHUB_REPO"
    exit 1
}

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p inventory gfs_orders storage_locations catalog

# Copy inventory files
echo "📦 Copying inventory data..."
cp "$DATA_DIR/inventory/inventory_items.json" inventory/
cp "$DATA_DIR/inventory/locations.json" inventory/
cp "$DATA_DIR/inventory/master_inventory.json" inventory/ 2>/dev/null || true
cp "$DATA_DIR/inventory/suppliers.json" inventory/ 2>/dev/null || true
cp "$DATA_DIR/inventory/products.json" inventory/ 2>/dev/null || true

# Copy GFS orders (only active orders, not deleted ones)
echo "📋 Copying GFS orders..."
for file in "$DATA_DIR"/gfs_orders/gfs_order_*.json; do
    if [ -f "$file" ]; then
        cp "$file" gfs_orders/
    fi
done

# Copy storage locations
echo "🗄️ Copying storage locations..."
cp "$DATA_DIR/storage_locations/locations.json" storage_locations/

# Copy catalog (optional - it's large)
echo "📚 Copying Sysco catalog..."
cp "$DATA_DIR/catalog/sysco_catalog_1753182965099.json" catalog/ 2>/dev/null || {
    echo "ℹ️  Skipping large catalog file"
}

# Create README with inventory summary
echo "📝 Creating README..."
cat > README.md << EOF
# Camp Inventory & Orders Data

Last updated: $TIMESTAMP

## 📊 Current Inventory Status

- **Total Items**: $(jq '.length' inventory/inventory_items.json 2>/dev/null || echo "N/A")
- **GFS Orders**: $(ls -1 gfs_orders/gfs_order_*.json 2>/dev/null | wc -l)
- **Storage Locations**: $(jq '.length' storage_locations/locations.json 2>/dev/null || echo "N/A")

## 📁 Directory Structure

\`\`\`
├── inventory/
│   ├── inventory_items.json    # Main inventory items
│   ├── locations.json          # Item locations
│   └── master_inventory.json   # Master inventory list
├── gfs_orders/
│   └── gfs_order_*.json        # Individual GFS orders
├── storage_locations/
│   └── locations.json          # Storage location definitions
└── catalog/
    └── sysco_catalog_*.json    # Sysco product catalog
\`\`\`

## 🌐 Live System

Access the live inventory system at: https://backend-silent-mountain-3362.fly.dev

## 📄 Data Format

### Inventory Item Example:
\`\`\`json
{
  "id": 1,
  "name": {
    "en": "Product Name",
    "fr": "Nom du Produit"
  },
  "quantity": 10,
  "minQuantity": 5,
  "maxQuantity": 50,
  "category": "Produce",
  "unit": "CS",
  "supplier": "GFS",
  "location": "Cooler B2"
}
\`\`\`

---
*Automated sync from Camp Inventory System*
EOF

# Git operations
echo "💾 Committing changes..."
git add .
git commit -m "📊 Inventory sync - $TIMESTAMP

- $(jq '.length' inventory/inventory_items.json 2>/dev/null || echo "0") inventory items
- $(ls -1 gfs_orders/gfs_order_*.json 2>/dev/null | wc -l) GFS orders
- $(jq '.length' storage_locations/locations.json 2>/dev/null || echo "0") storage locations" || {
    echo "ℹ️  No changes to commit"
}

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main || {
    echo "❌ Push failed. You may need to:"
    echo "1. Set up SSH keys: ssh-keygen -t ed25519 -C 'your_email@example.com'"
    echo "2. Add key to GitHub: https://github.com/settings/keys"
    echo "3. Or use GitHub token for HTTPS"
}

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo ""
echo "✅ GitHub sync complete!"
echo "📍 View your data at: https://github.com/Neuropilotai/gfs-orders-data"
echo ""
echo "💡 To automate this sync:"
echo "   - Add to cron: crontab -e"
echo "   - Add line: 0 */6 * * * /Users/davidmikulis/neuro-pilot-ai/backend/github-inventory-sync.sh"