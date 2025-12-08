# P1 Hardening: New Read APIs - COMPLETE

**Date:** 2025-12-08  
**Branch:** `feat/waste-inventory-sync`  
**Status:** ✅ **COMPLETE**

---

## Summary

Successfully implemented new read APIs for inventory snapshots and batch recipe costing:
- ✅ `GET /api/inventory/snapshots` - List inventory snapshots
- ✅ `GET /api/inventory/snapshots/:id` - Get snapshot detail with items
- ✅ `POST /api/recipes/cost/batch` - Batch recipe costing

---

## 1. Inventory Snapshots API

### GET /api/inventory/snapshots (List)

**Purpose:** List all inventory snapshots with pagination and filtering

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 50, max: 100) - Items per page
- `status` (optional) - Filter by status: 'active' or 'archived'
- `from_date` (optional) - Filter snapshots from this date (ISO 8601)
- `to_date` (optional) - Filter snapshots to this date (ISO 8601)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "snapshot_id": 1,
      "snapshot_date": "2025-12-08",
      "snapshot_name": "Monthly Count",
      "status": "active",
      "notes": "End of month inventory",
      "created_at": "2025-12-08T10:00:00Z",
      "created_by": 123,
      "item_count": 150,
      "total_value": 12500.50
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 10,
    "pages": 1
  }
}
```

**Features:**
- ✅ Org/site scoped (if org_id/site_id columns exist)
- ✅ Pagination support
- ✅ Date range filtering
- ✅ Status filtering
- ✅ Aggregated item count and total value

---

### GET /api/inventory/snapshots/:id (Detail)

**Purpose:** Get detailed snapshot information with all items

**Path Parameters:**
- `id` (required) - Snapshot ID

**Response:**
```json
{
  "success": true,
  "data": {
    "snapshot_id": 1,
    "snapshot_date": "2025-12-08",
    "snapshot_name": "Monthly Count",
    "status": "active",
    "notes": "End of month inventory",
    "created_at": "2025-12-08T10:00:00Z",
    "created_by": 123,
    "items": [
      {
        "snapshot_item_id": 1,
        "item_code": "CHK-001",
        "item_name": "Chicken Breast",
        "quantity": 50.0,
        "unit": "LB",
        "unit_cost": 4.50,
        "total_value": 225.00,
        "location": "COOLER-01",
        "category": "MEAT",
        "created_at": "2025-12-08T10:00:00Z"
      }
    ],
    "summary": {
      "item_count": 150,
      "total_value": 12500.50
    }
  }
}
```

**Features:**
- ✅ Org/site scoped (if columns exist)
- ✅ Includes all snapshot items with details
- ✅ Item names and categories from inventory_items
- ✅ Summary statistics

---

## 2. Batch Recipe Costing API

### POST /api/recipes/cost/batch

**Purpose:** Calculate cost for multiple recipes in a single request

**Request Body:**
```json
{
  "recipe_ids": [1, 2, 3, 4, 5],
  "date": "2025-12-08"  // optional, defaults to today
}
```

**Constraints:**
- Maximum 100 recipes per batch
- All recipes must belong to the requesting org
- Invalid recipe IDs are returned in response

**Response:**
```json
{
  "success": true,
  "date": "2025-12-08",
  "total_requested": 5,
  "successful": 4,
  "failed": 1,
  "results": [
    {
      "recipe_id": 1,
      "success": true,
      "total_cost": 12.50,
      "cost_per_portion": 2.50,
      "items_costed": 5,
      "items_missing_price": 0
    },
    {
      "recipe_id": 2,
      "success": false,
      "error": "Cost calculation returned no results",
      "total_cost": 0,
      "cost_per_portion": 0,
      "items_costed": 0,
      "items_missing_price": 0
    }
  ],
  "summary": {
    "total_cost": 50.00,
    "total_items_costed": 20,
    "total_items_missing_price": 2
  }
}
```

**Features:**
- ✅ Parallel processing (Promise.all)
- ✅ Individual error handling per recipe
- ✅ Aggregated summary statistics
- ✅ Org-scoped (only recipes from user's org)
- ✅ Uses existing `calculate_recipe_cost` database function

---

## Implementation Details

### Files Modified:

1. **`backend/routes/inventory.js`**
   - Added `GET /api/inventory/snapshots` route
   - Added `GET /api/inventory/snapshots/:id` route
   - Both routes use `requirePermission(PERMISSIONS.INVENTORY_READ)`
   - Org/site scoping with graceful fallback if columns don't exist

2. **`backend/routes/recipes.js`**
   - Added `POST /api/recipes/cost/batch` route
   - Validates recipe_ids array (max 100)
   - Verifies all recipes belong to org
   - Parallel cost calculation using Promise.all

### Database Tables Used:

- `inventory_snapshots` - Snapshot headers
- `inventory_snapshot_items` - Snapshot line items
- `inventory_items` - Item details (for snapshot items)
- `recipes` - Recipe metadata
- `recipe_ingredients` - Recipe components
- `calculate_recipe_cost()` - Database function for costing

### Security:

- ✅ RBAC permission checks (`INVENTORY_READ` for snapshots)
- ✅ Org-scoped queries (prevents cross-org access)
- ✅ Input validation (express-validator)
- ✅ SQL injection protection (parameterized queries)

---

## Testing

### Test Inventory Snapshots:

```bash
# Get JWT token
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

# List snapshots
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/snapshots?page=1&limit=10"

# Get snapshot detail
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/snapshots/1"
```

### Test Batch Recipe Costing:

```bash
# Batch cost calculation
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipe_ids": [1, 2, 3], "date": "2025-12-08"}' \
  "http://localhost:8083/api/recipes/cost/batch"
```

---

## Next Steps

1. ✅ **Code Complete** - All endpoints implemented
2. ⏭️ **Test Endpoints** - Verify with real data
3. ⏭️ **Update API Documentation** - Add to OpenAPI spec
4. ⏭️ **Performance Testing** - Test with large batches (100 recipes)

---

**Status:** ✅ **READY FOR TESTING**

