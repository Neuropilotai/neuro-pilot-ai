# Full Bilingual Inventory System - File Structure

This document lists all files used by the full bilingual inventory system for future updates.

## Core System Files

### 1. Main Application File
- **`inventory-complete-bilingual.js`** - The main server file containing all functionality
  - Port: 8083
  - Features: Bilingual UI, Sysco catalog, GFS orders, storage management, AI integration

### 2. Data Storage Directories
- **`data/`** - Main data directory
  - **`data/catalog/`** - Sysco catalog files
    - `sysco_catalog_*.json` - Product catalog data
  - **`data/gfs_orders/`** - GFS order history
    - `gfs_order_*.json` - Individual order files
  - **`data/inventory/`** - Inventory tracking data
    - `inventory_items.json` - Current inventory items
    - `locations.json` - Storage location definitions
    - `master_inventory.json` - Master inventory data
    - `movements.json` - Inventory movement history
    - `orders.json` - Order history
    - `products.json` - Product definitions
    - `suppliers.json` - Supplier information
    - `alerts.json` - Alert configurations
    - `analytics.json` - Analytics data
    - `forecasts.json` - Forecast data
  - **`data/storage_locations/`** - Storage location data
    - `locations.json` - Location configurations
  - **`data/inventory_backups/`** - Automated backups
  - **`data/inventory_imports/`** - Import staging area
  - **`data/cloud-storage/`** - Cloud storage integration
    - `backups/` - Cloud backups
    - `exports/` - Export files

### 3. Dependencies (from package.json)
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "multer": "^1.4.5-lts.1",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5"
}
```

### 4. User Authentication
- Uses JWT tokens for authentication
- Default credentials: david.mikulis@camp-inventory.com / inventory2025

### 5. API Endpoints (all require authentication)
- `POST /api/auth/login` - User login
- `GET /api/inventory/items` - Get all inventory items
- `POST /api/inventory/items` - Add new item
- `PUT /api/inventory/items/:id` - Update item
- `DELETE /api/inventory/items/:id` - Delete item
- `GET /api/sysco/catalog` - Get Sysco catalog
- `GET /api/gfs/orders` - Get GFS orders
- `POST /api/gfs/orders` - Add GFS order
- `GET /api/storage/locations` - Get storage locations
- `POST /api/storage/locations` - Add storage location
- `PUT /api/storage/locations/:id` - Update location
- `DELETE /api/storage/locations/:id` - Delete location
- `POST /api/inventory/export` - Export data
- `POST /api/inventory/import` - Import data

### 6. Frontend (Embedded in JS file)
- Single-page application embedded in the main JS file
- Bilingual support (English/French)
- Temperature conversion (F/C)
- Real-time inventory tracking
- Export/Import functionality

## File Usage Guidelines

### When Making Updates:
1. **Always edit**: `inventory-complete-bilingual.js`
2. **Data persistence**: All data is stored in JSON files under `data/` directory
3. **Backups**: System automatically creates backups in `data/inventory_backups/`
4. **Localization**: Language strings are embedded in the main JS file
5. **Security**: JWT authentication is required for all API calls

### Do NOT Use These Files:
- `inventory-system.js` (old version)
- `inventory-system-original.js` (backup)
- `inventory-system-protected.js` (protected version)
- `inventory-compact.js` (simplified version)

### To Start the System:
```bash
node inventory-complete-bilingual.js
```

## Important Notes:
- The system is self-contained in a single file for easy deployment
- All data is persisted to JSON files
- The system includes built-in security with JWT authentication
- Bilingual support is built into the UI
- Temperature conversion is automatic based on user preference
- The system loads Sysco catalog and GFS orders on startup

## Data File Locations:
- Inventory items: `data/inventory/inventory_items.json`
- Storage locations: `data/storage_locations/locations.json`
- Sysco catalog: `data/catalog/sysco_catalog_*.json`
- GFS orders: `data/gfs_orders/gfs_order_*.json`
- Backups: `data/inventory_backups/backup_*.json`

Last updated: January 2025