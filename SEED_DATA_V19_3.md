# NeuroInnovate v19.3 – Seed Data

**Purpose:** Initial SKUs and inventory records for first forecast run
**Date:** 2025-11-05
**Items:** 6 SKUs + 6 inventory records

---

## Items CSV

**File:** `items_seed.csv`

```csv
sku,name,category,uom,reorder_min,reorder_max,par_level,active
SKU-1001,Chicken Breast,Protein,kg,10,40,25,true
SKU-1002,Ground Beef,Protein,kg,8,30,18,true
SKU-2001,Milk 2%,Dairy,L,20,80,50,true
SKU-3001,Tomatoes,Produce,kg,6,24,14,true
SKU-4001,Mozzarella,Dairy,kg,5,20,12,true
SKU-5001,Basmati Rice,Dry,kg,10,60,30,true
```

**To create file:**
```bash
cat > items_seed.csv <<'EOF'
sku,name,category,uom,reorder_min,reorder_max,par_level,active
SKU-1001,Chicken Breast,Protein,kg,10,40,25,true
SKU-1002,Ground Beef,Protein,kg,8,30,18,true
SKU-2001,Milk 2%,Dairy,L,20,80,50,true
SKU-3001,Tomatoes,Produce,kg,6,24,14,true
SKU-4001,Mozzarella,Dairy,kg,5,20,12,true
SKU-5001,Basmati Rice,Dry,kg,10,60,30,true
EOF
```

---

## Inventory CSV

**File:** `inventory_seed.csv`

```csv
sku,location,quantity,lot,expires_at,last_counted_at
SKU-1001,Freezer-A,18,CHB-241101,2025-12-10,2025-11-05T10:00:00Z
SKU-1002,Freezer-B,12,GBF-241103,2025-12-15,2025-11-05T10:00:00Z
SKU-2001,Cooler-1,42,MIL-241030,2025-11-20,2025-11-05T10:00:00Z
SKU-3001,Cooler-2,25,TOM-241105,2025-11-14,2025-11-05T10:00:00Z
SKU-4001,Cooler-3,9,MOZ-241020,2025-12-05,2025-11-05T10:00:00Z
SKU-5001,Dry-1,38,RIC-241001,2026-01-30,2025-11-05T10:00:00Z
```

**To create file:**
```bash
cat > inventory_seed.csv <<'EOF'
sku,location,quantity,lot,expires_at,last_counted_at
SKU-1001,Freezer-A,18,CHB-241101,2025-12-10,2025-11-05T10:00:00Z
SKU-1002,Freezer-B,12,GBF-241103,2025-12-15,2025-11-05T10:00:00Z
SKU-2001,Cooler-1,42,MIL-241030,2025-11-20,2025-11-05T10:00:00Z
SKU-3001,Cooler-2,25,TOM-241105,2025-11-14,2025-11-05T10:00:00Z
SKU-4001,Cooler-3,9,MOZ-241020,2025-12-05,2025-11-05T10:00:00Z
SKU-5001,Dry-1,38,RIC-241001,2026-01-30,2025-11-05T10:00:00Z
EOF
```

---

## Import Commands

**Prerequisites:**
- Backend must be deployed and running
- Import endpoints must exist: `/api/items/import` and `/api/inventory/import`
- If endpoints don't exist, add them to backend first

**Import:**
```bash
# Set your backend URL
export BASE_URL="https://YOUR-BACKEND.up.railway.app"

# Import items
curl -X POST "$BASE_URL/api/items/import" \
  -H "Content-Type: text/csv" \
  --data-binary @items_seed.csv

# Import inventory
curl -X POST "$BASE_URL/api/inventory/import" \
  -H "Content-Type: text/csv" \
  --data-binary @inventory_seed.csv
```

**Verification:**
```bash
# Count items
curl "$BASE_URL/api/items?active=true" | jq 'length'
# Expected: 6

# View inventory summary
curl "$BASE_URL/api/inventory/summary" | jq

# List all items
curl "$BASE_URL/api/items" | jq '.[].sku'
```

---

## Data Description

### Items (SKUs)

| SKU | Name | Category | Location |
|-----|------|----------|----------|
| SKU-1001 | Chicken Breast | Protein | Freezer-A |
| SKU-1002 | Ground Beef | Protein | Freezer-B |
| SKU-2001 | Milk 2% | Dairy | Cooler-1 |
| SKU-3001 | Tomatoes | Produce | Cooler-2 |
| SKU-4001 | Mozzarella | Dairy | Cooler-3 |
| SKU-5001 | Basmati Rice | Dry | Dry-1 |

### Inventory Levels

| Location | Item | Qty | Status |
|----------|------|-----|--------|
| Freezer-A | Chicken Breast | 18 kg | Below par (25) |
| Freezer-B | Ground Beef | 12 kg | Below par (18) |
| Cooler-1 | Milk 2% | 42 L | Below par (50) |
| Cooler-2 | Tomatoes | 25 kg | Above par (14) ✅ |
| Cooler-3 | Mozzarella | 9 kg | Below par (12) |
| Dry-1 | Basmati Rice | 38 kg | Above par (30) ✅ |

**Expected Forecast Recommendations:**
- **Reorder:** SKU-1001, SKU-1002, SKU-2001, SKU-4001 (below par)
- **Adequate:** SKU-3001, SKU-5001 (above par)

---

## Alternative: Manual Database Insert

If CSV import endpoints don't exist, use direct database inserts:

```sql
-- Items table
INSERT INTO items (sku, name, category, uom, reorder_min, reorder_max, par_level, active) VALUES
('SKU-1001', 'Chicken Breast', 'Protein', 'kg', 10, 40, 25, 1),
('SKU-1002', 'Ground Beef', 'Protein', 'kg', 8, 30, 18, 1),
('SKU-2001', 'Milk 2%', 'Dairy', 'L', 20, 80, 50, 1),
('SKU-3001', 'Tomatoes', 'Produce', 'kg', 6, 24, 14, 1),
('SKU-4001', 'Mozzarella', 'Dairy', 'kg', 5, 20, 12, 1),
('SKU-5001', 'Basmati Rice', 'Dry', 'kg', 10, 60, 30, 1);

-- Inventory table
INSERT INTO inventory (sku, location, quantity, lot, expires_at, last_counted_at) VALUES
('SKU-1001', 'Freezer-A', 18, 'CHB-241101', '2025-12-10', '2025-11-05 10:00:00'),
('SKU-1002', 'Freezer-B', 12, 'GBF-241103', '2025-12-15', '2025-11-05 10:00:00'),
('SKU-2001', 'Cooler-1', 42, 'MIL-241030', '2025-11-20', '2025-11-05 10:00:00'),
('SKU-3001', 'Cooler-2', 25, 'TOM-241105', '2025-11-14', '2025-11-05 10:00:00'),
('SKU-4001', 'Cooler-3', 9, 'MOZ-241020', '2025-12-05', '2025-11-05 10:00:00'),
('SKU-5001', 'Dry-1', 38, 'RIC-241001', '2026-01-30', '2025-11-05 10:00:00');
```

**Via Railway CLI:**
```bash
railway connect
sqlite3 database.db < seed_data.sql
```

---

## Historical Data (Optional)

For more realistic forecasts, add 30-90 days of historical transactions:

**Pattern suggestion:**
- **Chicken/Beef:** Daily usage 2-5 kg (high variance)
- **Milk:** Daily usage 5-8 L (consistent)
- **Tomatoes:** Daily usage 3-6 kg (seasonal variance)
- **Mozzarella:** Daily usage 1-3 kg (consistent)
- **Rice:** Weekly usage 10-15 kg (low frequency)

Generate historical data:
```bash
# Use Python script to generate transactions
# (Script not included in v19.3, add in v19.4)
```

---

**Status:** 📋 Ready to import after Railway deployment
**Next:** Import after first health check passes
