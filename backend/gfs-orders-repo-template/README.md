# GFS Orders Data Repository

This repository stores GFS (Gordon Food Service) orders for the Camp Inventory Management System.

## 📁 Structure

```
gfs-orders-data/
├── README.md           # This file
├── orders/            # All GFS order files go here
│   ├── 2025/         # Orders organized by year
│   │   ├── 01/       # January orders
│   │   └── 02/       # February orders
└── templates/         # Order templates
```

## 📝 How to Add Orders

### Option 1: Upload via GitHub Web

1. Navigate to the `orders/YYYY/MM/` folder
2. Click "Add file" → "Upload files"
3. Drag your order files (JSON or CSV)
4. Click "Commit changes"

### Option 2: Create New Order

1. Navigate to the appropriate month folder
2. Click "Add file" → "Create new file"
3. Name it: `gfs_order_YYYYMMDD_001.json`
4. Paste your order data
5. Click "Commit new file"

## 📋 Order Format

### JSON Format (Recommended):

```json
{
  "orderNumber": "GFS_20250120_001",
  "orderDate": "2025-01-20",
  "supplier": "GFS",
  "campLocation": "Main Kitchen",
  "items": [
    {
      "name": "Ground Beef",
      "quantity": 50,
      "unit": "lb",
      "category": "Meat"
    },
    {
      "name": "Chicken Breast",
      "quantity": 100,
      "unit": "lb",
      "category": "Meat"
    }
  ]
}
```

### CSV Format:

```csv
Date,Item,Quantity,Unit,Category
2025-01-20,Ground Beef,50,lb,Meat
2025-01-20,Chicken Breast,100,lb,Meat
```

## 🤖 Automatic Sync

The Camp Inventory System automatically syncs orders from this repository every 10 minutes.

- **Last Sync:** Check at https://backend-silent-mountain-3362.fly.dev/api/sync/status
- **Manual Sync:** POST to https://backend-silent-mountain-3362.fly.dev/api/sync/github-orders

## 📊 Integration

This repository is integrated with:

- **Camp Inventory System:** https://backend-silent-mountain-3362.fly.dev
- **Auto-sync:** Every 10 minutes
- **AI Processing:** Automatic inventory updates

## 👥 Contributing

To add orders:

1. Ensure proper file naming: `gfs_order_YYYYMMDD_XXX.json`
2. Validate JSON format before uploading
3. Place in correct year/month folder

## 📞 Support

For issues or questions:

- Check the inventory system logs
- Contact: david.mikulis@camp-inventory.com
