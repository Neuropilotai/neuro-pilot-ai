# Accounting Categories for Month-End Reports

## Overview

The inventory system now uses your actual GL (General Ledger) account codes for categorization. This ensures that inventory reports match your accounting system exactly for month-end reporting.

## Category Structure

### GL Account Codes

| Category Name | GL Account Code | Description |
|--------------|----------------|-------------|
| BAKE | 60110010 | Bakery items |
| BEV + ECO | 60110020 | Beverages and ECO items |
| MILK | 60110030 | Milk and dairy products |
| GROC+ MISC | 60110040 | Grocery and miscellaneous items |
| MEAT | 60110060 | Meat products |
| PROD | 60110070 | Produce |
| CLEAN | 60220001 | Cleaning supplies |
| PAPER | 60260010 | Paper products |
| Small Equip | 60665001 | Small equipment |
| FREIGHT | 62421100 | Freight charges |
| LINEN | 60240010 | Linen and textiles |
| PROPANE | 62869010 | Propane and gas |
| Other Costs | OTHER | Other miscellaneous costs |

## Auto-Categorization Rules

The system automatically assigns items to categories based on keywords in the item description:

### BAKE (60110010)
- bread, roll, bun, bagel, muffin, croissant, donut, pastry, cake, cookie, bake, dough

### BEV + ECO (60110020)
- juice, soda, coffee, tea, drink, beverage, eco, cup, lid, straw

### MILK (60110030)
- milk, cream, half & half, dairy, cheese, cheddar, mozzarella, parmesan, yogurt, butter, margarine, egg

### GROC+ MISC (60110040)
- pasta, rice, flour, grain, cereal, sauce, ketchup, mustard, mayo, dressing, oil, vinegar, spice, seasoning, canned, jar, condiment, snack, chip, cracker

### MEAT (60110060)
- beef, steak, ground beef, roast, pork, bacon, ham, sausage, chicken, turkey, poultry, fish, salmon, shrimp, seafood, tuna, meat, deli

### PROD (60110070)
- apple, banana, orange, grape, berry, melon, peach, pear, fruit, lettuce, tomato, onion, potato, carrot, celery, pepper, cucumber, vegetable, produce

### CLEAN (60220001)
- cleaner, sanitizer, detergent, soap, bleach, disinfect, wipe, clean

### PAPER (60260010)
- paper towel, paper plate, paper napkin, toilet paper, tissue, bag, wrap, foil, film, container, plate

### Small Equip (60665001)
- equipment, tool, utensil, knife, pan, pot, thermometer, scale, glove, apron

### FREIGHT (62421100)
- freight, shipping, delivery, fuel surcharge

### LINEN (60240010)
- linen, cloth, textile, rag, uniform, towel

### PROPANE (62869010)
- propane, gas, fuel, cylinder, tank

### Other Costs (OTHER)
- Default for items that don't match any category

## Setup Instructions

### 1. Initialize Accounting Categories

```bash
# Via API
curl -X POST http://localhost:3001/api/enterprise-inventory/categories/load-accounting

# Or via test script
node test_accounting_categories.js
```

### 2. Import Your Invoices

```bash
curl -X POST http://localhost:3001/api/enterprise-inventory/import-invoices
```

### 3. Auto-Categorize All Items

```bash
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

## Month-End Reports

### Get Inventory Value by GL Account

```bash
curl http://localhost:3001/api/enterprise-inventory/categories/inventory/value
```

**Response:**
```json
{
  "success": true,
  "categories": [
    {
      "category_id": 5,
      "category_name": "MEAT",
      "category_code": "60110060",
      "unique_items": 156,
      "total_line_items": 892,
      "total_quantity": 4250,
      "total_value": 18245678.90
    },
    {
      "category_id": 6,
      "category_name": "PROD",
      "category_code": "60110070",
      "unique_items": 245,
      "total_line_items": 1120,
      "total_quantity": 8900,
      "total_value": 12458920.50
    },
    ...
  ]
}
```

### Export for Accounting System

The API returns data in a format ready for export:

```javascript
// Example: Export to CSV for month-end
const categories = await fetch('/api/enterprise-inventory/categories/inventory/value');
const data = await categories.json();

// CSV Headers
console.log('GL Account,Category,Items,Value');

// Data rows
data.categories.forEach(cat => {
  console.log(`${cat.category_code},${cat.category_name},${cat.unique_items},${cat.total_value}`);
});
```

**Output:**
```
GL Account,Category,Items,Value
60110060,MEAT,156,18245678.90
60110070,PROD,245,12458920.50
60110030,MILK,89,8234567.80
60110010,BAKE,45,3456789.20
...
```

## Dashboard Integration

The dashboard now includes category breakdown:

```bash
curl http://localhost:3001/api/enterprise-inventory/dashboard
```

Returns inventory value by GL account code for easy reconciliation with your accounting system.

## Manual Category Assignment

If an item is miscategorized, you can manually update it:

```javascript
const manager = new EnterpriseInventoryManager();
await manager.initialize();

// Update single item
await manager.updateItemCategory(
  '10857692',  // item_code
  5,           // category_id (MEAT)
  null         // subcategory_id
);
```

## Customizing Keywords

To improve auto-categorization for your specific inventory, edit the keywords in:

`/backend/enterprise_inventory_manager.js` → `autoCategorizeItem()` method

Example:
```javascript
// Add more meat keywords
{ keywords: ['beef', 'steak', 'ribeye', 'sirloin', 'chuck', ...], category: 5 }

// Add your specific product names
{ keywords: ['special sauce', 'house blend'], category: 4 }
```

## Month-End Workflow

### Step 1: Perform Physical Count
```bash
# Create count with cut-off date (e.g., last day of month)
curl -X POST http://localhost:3001/api/enterprise-inventory/counts/create \
  -H "Content-Type: application/json" \
  -d '{"cutOffDate":"2025-10-31","performedBy":"USER","notes":"October month-end count"}'
```

### Step 2: Complete Physical Count
```bash
# After counting all items
curl -X POST http://localhost:3001/api/enterprise-inventory/counts/1/complete
```

### Step 3: Generate Reports by GL Account
```bash
# Get final inventory value by GL account
curl http://localhost:3001/api/enterprise-inventory/categories/inventory/value
```

### Step 4: Export to Accounting
Export the category totals to your accounting system:
- GL Account Code
- Category Name
- Inventory Value
- Variance (if any)

## Reports Available

### 1. Inventory Value by Category
Shows total value for each GL account:
```
MEAT (60110060):        $18,245,678.90
PROD (60110070):        $12,458,920.50
MILK (60110030):        $8,234,567.80
...
```

### 2. Category Statistics
Shows detailed breakdown:
```
MEAT (60110060):
  Unique Items: 156
  Total Line Items: 892
  Total Quantity: 4,250
  Total Value: $18,245,678.90
  Pending: 12 items
  Placed: 750 items
  Counted: 130 items
```

### 3. Month-End Reconciliation
Compare physical count vs. system value by GL account

## Testing

Run the test to verify categorization:

```bash
node test_accounting_categories.js
```

**Output:**
```
Category Name        | GL Account  | Description
--------------------------------------------------------------------------------
BAKE               | 60110010    | Bakery items
BEV + ECO          | 60110020    | Beverages and ECO items
MILK               | 60110030    | Milk and dairy products
GROC+ MISC         | 60110040    | Grocery and miscellaneous items
MEAT               | 60110060    | Meat products
PROD               | 60110070    | Produce
CLEAN              | 60220001    | Cleaning supplies
PAPER              | 60260010    | Paper products
Small Equip        | 60665001    | Small equipment
FREIGHT            | 62421100    | Freight charges
LINEN              | 60240010    | Linen and textiles
PROPANE            | 62869010    | Propane and gas
Other Costs        | OTHER       | Other miscellaneous costs
```

## Files

- `/backend/database/update_categories_accounting.sql` - Accounting category schema
- `/backend/enterprise_inventory_manager.js` - Auto-categorization logic
- `/backend/routes/enterprise-inventory-api.js` - Category API endpoints
- `/backend/test_accounting_categories.js` - Test script
- `/backend/ACCOUNTING_CATEGORIES.md` - This documentation

## API Endpoints

All category endpoints with accounting codes:

```
POST /api/enterprise-inventory/categories/load-accounting
GET  /api/enterprise-inventory/categories
POST /api/enterprise-inventory/categories/auto-categorize
GET  /api/enterprise-inventory/categories/inventory/value
```

## Benefits

✅ **GL Account Integration** - Categories match your accounting system exactly
✅ **Month-End Ready** - Reports by GL account code for easy reconciliation
✅ **Automatic Classification** - Smart keyword-based categorization
✅ **100% Accurate Values** - Inventory totals by accounting category
✅ **Export Ready** - Data formatted for accounting system import
✅ **Audit Trail** - Track which items are in which GL account

## Summary

Your inventory is now categorized using your actual GL account codes:
- **13 categories** matching your chart of accounts
- **Automatic categorization** based on item descriptions
- **Month-end reports** by GL account code
- **Ready for export** to your accounting system

Perfect for month-end inventory reconciliation! 🎉
