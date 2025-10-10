# Item Categorization System

## Overview

The enterprise inventory system now includes a complete item categorization system with automatic categorization based on item descriptions.

## Features

### ✅ Category Hierarchy
- **Main Categories** (13 default categories)
- **Subcategories** (hierarchical organization)
- **Customizable** (add your own categories)

### ✅ Default Categories

1. **Produce** (PRODUCE)
   - Fresh Fruits
   - Fresh Vegetables
   - Herbs & Spices
   - Organic Produce

2. **Meat & Seafood** (MEAT)
   - Beef
   - Pork
   - Poultry
   - Seafood
   - Deli Meats

3. **Dairy & Eggs** (DAIRY)
   - Milk
   - Cheese
   - Yogurt
   - Butter & Margarine
   - Eggs

4. **Bakery** (BAKERY)

5. **Frozen Foods** (FROZEN)

6. **Dry Goods** (DRY)

7. **Canned & Jarred** (CANNED)

8. **Beverages** (BEVERAGE)

9. **Condiments & Sauces** (CONDIMENT)

10. **Snacks** (SNACKS)

11. **Cleaning Supplies** (CLEANING)

12. **Disposables** (DISPOSABLE)

13. **Other** (OTHER)

### ✅ Auto-Categorization

Smart keyword-based categorization automatically assigns categories based on item descriptions:

**Examples:**
- "Apple Golden Delicious" → Produce → Fresh Fruits
- "Bacon Sliced" → Meat & Seafood → Pork
- "Milk Whole Gallon" → Dairy & Eggs → Milk
- "Cheese Cheddar Block" → Dairy & Eggs → Cheese
- "Chicken Breast Boneless" → Meat & Seafood → Poultry

### ✅ Category Statistics

Track inventory by category:
- Unique items per category
- Total line items
- Total quantity
- Total value
- Status breakdown (Pending, Placed, Counted)

## Database Schema

### Tables

#### `item_categories`
```sql
- category_id (Primary Key)
- category_name (Unique)
- category_code (Unique short code)
- description
- parent_category_id (for subcategories)
- display_order
- active (1/0)
```

#### `item_master`
```sql
- item_code (Primary Key)
- barcode
- description
- category_id (Foreign Key)
- subcategory_id (Foreign Key)
- unit
- brand
- manufacturer
- pack_size
- current_unit_price
- is_perishable
- requires_refrigeration
- is_active
```

### Views

#### `v_category_inventory`
Shows inventory statistics for main categories

#### `v_subcategory_inventory`
Shows inventory statistics for subcategories

## API Endpoints

### Initialize Categories
```bash
POST /api/enterprise-inventory/categories/initialize
```
Initializes category tables with default categories

### Get All Categories
```bash
GET /api/enterprise-inventory/categories
```
Returns all main categories

### Get Subcategories
```bash
GET /api/enterprise-inventory/categories/:categoryId/subcategories
```
Returns subcategories for a specific category

### Create Category
```bash
POST /api/enterprise-inventory/categories
Content-Type: application/json

{
  "name": "Specialty Items",
  "code": "SPECIALTY",
  "description": "Special order items",
  "parentId": null,
  "displayOrder": 14
}
```

### Auto-Categorize All Items
```bash
POST /api/enterprise-inventory/categories/auto-categorize
```
Automatically categorizes all items based on descriptions

### Get Category Inventory
```bash
GET /api/enterprise-inventory/categories/inventory
```
Returns inventory statistics for each category

### Get Inventory Value by Category
```bash
GET /api/enterprise-inventory/categories/inventory/value
```
Returns inventory value breakdown by category (PLACED + COUNTED only)

### Get Subcategory Inventory
```bash
GET /api/enterprise-inventory/subcategories/inventory
```
Returns inventory statistics for subcategories

## Usage Examples

### 1. Initialize the System

```bash
# Initialize category tables
curl -X POST http://localhost:3001/api/enterprise-inventory/categories/initialize
```

### 2. Import and Categorize Items

```bash
# Import invoices
curl -X POST http://localhost:3001/api/enterprise-inventory/import-invoices

# Auto-categorize all items
curl -X POST http://localhost:3001/api/enterprise-inventory/categories/auto-categorize
```

**Response:**
```json
{
  "success": true,
  "message": "Categorized 3874 items",
  "results": {
    "total": 3874,
    "categorized": 3874,
    "failed": 0
  }
}
```

### 3. View Categories

```bash
# Get all categories
curl http://localhost:3001/api/enterprise-inventory/categories
```

**Response:**
```json
{
  "success": true,
  "count": 13,
  "categories": [
    {
      "category_id": 1,
      "category_name": "Produce",
      "category_code": "PRODUCE",
      "description": "Fresh fruits and vegetables",
      "display_order": 1
    },
    ...
  ]
}
```

### 4. View Category Inventory

```bash
# Get inventory by category
curl http://localhost:3001/api/enterprise-inventory/categories/inventory
```

**Response:**
```json
{
  "success": true,
  "categories": [
    {
      "category_id": 1,
      "category_name": "Produce",
      "category_code": "PRODUCE",
      "unique_items": 245,
      "total_line_items": 892,
      "total_quantity": 3450,
      "total_value": 12458920.50,
      "pending_items": 45,
      "placed_items": 720,
      "counted_items": 127
    },
    ...
  ]
}
```

### 5. View Inventory Value by Category

```bash
# Get value breakdown
curl http://localhost:3001/api/enterprise-inventory/categories/inventory/value
```

**Response:**
```json
{
  "success": true,
  "categories": [
    {
      "category_id": 2,
      "category_name": "Meat & Seafood",
      "category_code": "MEAT",
      "unique_items": 156,
      "total_value": 18245678.90
    },
    {
      "category_id": 1,
      "category_name": "Produce",
      "category_code": "PRODUCE",
      "unique_items": 245,
      "total_value": 12458920.50
    },
    ...
  ]
}
```

## Testing

Run the test script to see categorization in action:

```bash
node test_categorization.js
```

This will:
1. Initialize category system
2. Show all categories and subcategories
3. Auto-categorize all items
4. Display category statistics
5. Show inventory value by category
6. Display sample categorized items

## Customization

### Add Custom Category

```javascript
const manager = new EnterpriseInventoryManager();
await manager.initialize();
await manager.initializeCategories();

// Add main category
await manager.createCategory(
  'Specialty Items',
  'SPECIALTY',
  'Special order items',
  null,  // no parent
  14     // display order
);

// Add subcategory
await manager.createCategory(
  'Imported Goods',
  'IMPORTED',
  'Items from overseas',
  14,    // parent category ID
  1      // display order
);
```

### Customize Auto-Categorization

Edit the `autoCategorizeItem()` method in `enterprise_inventory_manager.js` to add more keyword rules:

```javascript
const categoryRules = [
  // Your custom rules
  { keywords: ['organic', 'natural'], category: 1, subcategory: 17 },
  { keywords: ['vegan', 'plant-based'], category: 13 },
  // ... existing rules
];
```

## Benefits

✅ **Organized Inventory** - Items grouped by category for easy management
✅ **Automatic Classification** - Smart keyword-based categorization
✅ **Flexible Hierarchy** - Main categories and subcategories
✅ **Value Tracking** - See inventory value by category
✅ **Customizable** - Add your own categories and rules
✅ **API Ready** - Complete REST API for category management
✅ **Dashboard Integration** - Category metrics available in dashboard

## Integration with Existing Features

The categorization system integrates seamlessly with:
- ✅ Order processing
- ✅ Location assignment
- ✅ Physical counts
- ✅ Min/Max levels (can be set per category)
- ✅ Duplicate prevention
- ✅ Inventory value tracking

## Complete Workflow

```bash
# 1. Initialize system
curl -X POST http://localhost:3001/api/enterprise-inventory/categories/initialize

# 2. Import invoices
curl -X POST http://localhost:3001/api/enterprise-inventory/import-invoices

# 3. Auto-categorize
curl -X POST http://localhost:3001/api/enterprise-inventory/categories/auto-categorize

# 4. View results
curl http://localhost:3001/api/enterprise-inventory/categories/inventory/value

# 5. Get dashboard with category breakdown
curl http://localhost:3001/api/enterprise-inventory/dashboard
```

## Files

- `/backend/database/add_categories.sql` - Category schema
- `/backend/enterprise_inventory_manager.js` - Category management logic
- `/backend/routes/enterprise-inventory-api.js` - Category API endpoints
- `/backend/test_categorization.js` - Test script
- `/backend/CATEGORIZATION_SYSTEM.md` - This documentation

## Next Steps

The categorization system is complete and ready to use. You can:

1. **Import your data** and auto-categorize items
2. **View reports** by category
3. **Add custom categories** specific to your business
4. **Track costs** by category
5. **Set min/max levels** per category
6. **Generate dashboards** with category breakdowns

Category system is production-ready! 🎉
