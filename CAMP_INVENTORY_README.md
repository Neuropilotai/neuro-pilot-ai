# Camp Inventory Management System

A comprehensive inventory management system designed for camp sites with 200-400 people and 11 storage locations.

## Features

### ✅ Digital Count Sheets
- Location-based inventory counting
- Real-time variance calculation
- Print-friendly format
- Mobile-responsive design

### ✅ Usage Tracking
- Record items taken by staff
- Track quantity and reason
- Real-time inventory updates
- Usage history logs

### ✅ Min/Max Reporting
- Automated reorder alerts
- Comprehensive inventory status
- Visual status indicators
- Export to CSV functionality

### ✅ Order Management
- Generate orders from reorder alerts
- Side-by-side current stock vs order quantities
- Order review and approval workflowto 
- Print-ready order sheets

### ✅ Print-Friendly Design
- Each location has printable sheets
- Count sheets for manual tracking
- Order sheets for suppliers
- Professional formatting

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Start the Server
```bash
npm start
# or for development
npm run dev
```

### 3. Access the System
Open your browser and go to:
```
http://localhost:8000/inventory
```

## System Setup

### Initial Configuration

1. **Add Storage Locations** (Setup Tab)
   - Name: Freezer #1, Cooler A, Dry Storage, etc.
   - Code: FRZ01, COL01, DRY01 (for easy identification)
   - Type: Freezer, Cooler, Dry Storage, Kitchen, Pantry, Other

2. **Add Inventory Items** (Setup Tab)
   - Item name and category (Food, Beverage, Supplies, etc.)
   - Unit of measurement (Each, Box, Case, Pound, etc.)
   - Min/Max quantities and reorder points

### Database Options

The system supports two database configurations:

**Option 1: MongoDB (Recommended for Production)**
```bash
# Install MongoDB locally or use MongoDB Atlas
# Set MONGODB_URI environment variable
export MONGODB_URI="mongodb://localhost:27017/camp_inventory"
```

**Option 2: Demo Mode (No Database)**
- System runs without persistence
- Great for testing and evaluation
- Data resets on server restart

## Daily Workflow

### Morning Inventory Count
1. Go to **Count Sheets** tab
2. Select storage location
3. Enter your name as counter
4. Count items and enter quantities
5. Print sheet for manual backup
6. Submit count to update system

### Recording Usage Throughout Day
1. Go to **Usage Tracker** tab
2. Select item and location
3. Enter quantity taken and staff name
4. Add reason/notes if needed
5. Submit to update inventory

### Weekly Reporting
1. Go to **Min/Max Report** tab
2. Review items below minimum levels
3. Filter by status (Below Min, Above Max, etc.)
4. Generate orders for items needing restock
5. Export report to CSV for records

### Order Management
1. Go to **Order Review** tab
2. Review generated orders
3. Compare current stock vs order quantities
4. Print orders for suppliers
5. Update order status as needed

## Key Benefits

### For Camp Managers
- **Real-time visibility** into all 11 storage locations
- **Automated alerts** when items need reordering
- **Historical tracking** of usage patterns
- **Cost control** through min/max inventory levels

### For Kitchen Staff
- **Easy usage tracking** when taking items
- **Quick access** to current stock levels
- **Mobile-friendly** interface for on-the-go use

### For Purchasing
- **Automated order generation** based on reorder points
- **Side-by-side comparison** of current vs needed quantities
- **Professional order sheets** for suppliers
- **Export capabilities** for procurement systems

## Technical Features

### Built for Camp Environments
- **Offline-capable** count sheets (printable backup)
- **Mobile responsive** for tablets and phones
- **Fast loading** even with limited internet
- **Print optimization** for various paper sizes

### Data Management
- **Real-time updates** across all devices
- **Variance tracking** between counts and system
- **Usage history** for trend analysis
- **Backup and restore** capabilities

### Security & Access
- **Role-based access** (optional)
- **Audit trails** for all changes
- **Data validation** to prevent errors
- **Backup notifications**

## Support & Customization

The system is designed to be easily customizable for your specific camp needs:

- **Custom categories** for different types of items
- **Additional locations** as your camp expands
- **Custom reports** for specific requirements
- **Integration** with existing systems

## File Structure

```
backend/
├── models/           # Database models
│   ├── inventory.js  # Inventory items
│   ├── location.js   # Storage locations
│   ├── countSheet.js # Count sheet records
│   ├── order.js      # Purchase orders
│   └── usageLog.js   # Usage tracking
├── routes/
│   └── inventory.js  # API endpoints
├── public/
│   └── inventory.html # Web interface
└── server.js         # Main server file
```

## API Endpoints

The system provides RESTful API endpoints for integration:

- `GET /api/inventory/items` - Get all items
- `GET /api/inventory/locations` - Get all locations
- `POST /api/inventory/count-sheets` - Submit count sheet
- `POST /api/inventory/usage` - Record usage
- `GET /api/inventory/reports/min-max` - Get min/max report
- `POST /api/inventory/orders/generate` - Generate order

---

**Need Help?** The system includes built-in help and intuitive navigation. Each tab has clear instructions and the interface guides you through each process.

**Perfect for:** Summer camps, winter camps, retreat centers, outdoor education facilities, and any organization managing food and supplies for large groups in multiple storage locations.