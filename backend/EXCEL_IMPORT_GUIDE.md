# Excel Import Guide - Inventory Count

Complete guide for importing physical inventory count results from Excel files.

---

## 📥 Quick Start

```bash
# Import your July count from Excel
node import_count_from_excel.js july_count.xlsx
```

---

## 📊 Excel File Format

### Required Columns:

1. **Item_Code** (required) - GFS item code
2. **Counted_Cases** (required) - Your physical count result

### Optional Columns:

3. **Description** - Item description (helpful for verification)
4. **Location** - Storage location (cooler, freezer, dry storage, etc.)
5. **Notes** - Any comments about the count

### Column Name Flexibility:

The system automatically detects columns with these variations:

**Item Code:**
- `Item_Code`
- `ItemCode`
- `Item Code`
- `Code`

**Counted Cases:**
- `Counted_Cases`
- `Counted`
- `Count`
- `Quantity`
- `Qty`

**Location:**
- `Location`
- `Storage`
- `Area`
- `Zone`

**Notes:**
- `Notes`
- `Comments`
- `Remarks`

---

## 📋 Example Excel File

| Item_Code | Description              | Counted_Cases | Location    | Notes              |
|-----------|-------------------------|---------------|-------------|-------------------|
| 3021      | APPLE GOLDEN DELICIOUS  | 12.5          | Cooler A    | Good condition    |
| 3111      | APPLE MCINTOSH          | 8.0           | Cooler A    |                   |
| 4037      | BACON SLICED            | 45.0          | Freezer B   |                   |
| 5012      | BREAD WHITE             | 23.0          | Dry Storage | 2 cases expired   |

---

## 🔄 Complete Workflow

### Step 1: Prepare Your Count

```bash
# Set cut-off date
node prepare_cutoff_inventory.js
# Enter: 2025-07-28 (last order in July)

# Lock orders after cut-off
node lock_orders_after_cutoff.js

# Export count sheet
node export_count_sheet.js
```

This creates `count_sheet_[date].csv` with all items to count.

### Step 2: Do Physical Count

1. Open the exported `count_sheet_[date].csv` in Excel
2. Count physical inventory
3. Fill in the `Counted_Cases` column
4. Add `Location` for items (optional)
5. Add `Notes` for any issues
6. Save as `.xlsx` or `.csv`

### Step 3: Import Results

```bash
node import_count_from_excel.js july_count.xlsx
```

**What happens:**
- System reads your Excel file
- Detects columns automatically
- Compares counted vs expected quantities
- Calculates variance (counted - expected)
- Calculates variance value
- Updates item status to 'COUNTED'
- Saves location data

**Example output:**
```
📥 IMPORT COUNT FROM EXCEL
========================================

📄 Reading: july_count.xlsx

📋 Sheet: Sheet1
✅ Found 127 rows

📊 Detected Columns:
──────────────────────────────
  • Item_Code
  • Description
  • Counted_Cases
  • Location
  • Notes

📋 Using Columns:
──────────────────────────────
  Item Code: Item_Code
  Counted: Counted_Cases
  Location: Location
  Notes: Notes

🔄 Importing counts...

  Processed 100 items...
  Processed 127 items...

📊 IMPORT SUMMARY
========================================
Items Imported: 127
Items Skipped: 0
Total Variance Value: -$1,234.56
Count Date: 2025-07-31

📝 Next Steps:
──────────────────────────────
1. Review variance report: node inventory_variance_report.js
2. Create snapshot: node create_inventory_snapshot.js
3. Generate reports: node report_from_snapshot.js
```

### Step 4: Create Snapshot

```bash
node create_inventory_snapshot.js
```

Enter:
- Count date: `2025-07-31`
- Snapshot name: `July 2025 Month-End`
- Notes: `Physical count completed`
- Your name: `David`

This creates a permanent baseline for flexible reporting.

### Step 5: Generate Reports

```bash
# Report 1: Just July count (no orders added)
node report_from_snapshot.js
# Choose snapshot: 1
# Include orders after count? n (to all)
# Result: Pure July inventory value

# Report 2: Current inventory (July + August + September)
node report_from_snapshot.js
# Choose snapshot: 1
# Include orders after count? y (to all)
# Result: Current total inventory value
```

---

## 🎯 Use Cases

### Use Case 1: July Month-End Count

**Scenario**: You want to close July books at $580,000 inventory value.

**Steps**:
1. Cut-off date: July 28 (last order received in July)
2. Export count sheet
3. Count physical inventory
4. Import from Excel
5. Create snapshot: "July 2025 Month-End"
6. Generate report with NO orders added = $580,000

### Use Case 2: Current Inventory After July Count

**Scenario**: You completed July count but need current inventory including August and September.

**Steps**:
1. Use existing "July 2025 Month-End" snapshot
2. Generate report from snapshot
3. Include ALL orders after July 28
4. Result: July count + Aug orders + Sep orders = Current total

### Use Case 3: Partial Period Reporting

**Scenario**: Need inventory for "July + First 2 weeks of August only"

**Steps**:
1. Use "July 2025 Month-End" snapshot
2. Generate report
3. Include: Aug 1-14 orders (y)
4. Exclude: Aug 15-31 orders (n)
5. Result: July + partial August

---

## 📍 Location Management

### Why Track Locations?

- Find items faster during counts
- Organize storage areas
- Track cooler vs freezer vs dry storage
- Identify misplaced items

### Location Examples:

```
Cooler A
Cooler B
Freezer 1
Freezer 2
Dry Storage - Shelf 1
Dry Storage - Shelf 2
Walk-in Freezer
Receiving Area
```

### Adding Locations:

**Option 1: During Excel Import**
Add `Location` column to your Excel file with location for each item.

**Option 2: After Import**
(Feature coming: Interactive location assignment tool)

---

## ⚠️ Important Notes

### Excel File Format:
- Supported formats: `.xlsx`, `.xls`, `.csv`
- First row MUST be column headers
- Item codes must match exactly
- Counted quantities can be decimals (12.5 cases)

### Variance Calculation:
```
Variance = Counted - Expected
Variance Value = Variance × (Item Value / Item Quantity)

Positive variance = You counted MORE than expected
Negative variance = You counted LESS than expected
```

### Item Status Changes:
After import, items are marked as `COUNTED`:
```sql
UPDATE invoice_items
SET status = 'COUNTED'
WHERE item_code = ?
  AND status IN ('PLACED', 'READY_TO_COUNT')
```

### Locked Orders:
Locked orders are NOT included in variance calculations:
```sql
WHERE status IN ('PLACED', 'READY_TO_COUNT')
  AND (status != 'LOCKED' OR status IS NULL)
```

---

## 🔧 Troubleshooting

### Problem: "Excel support not installed"

**Solution**:
```bash
npm install xlsx
```

### Problem: "File not found"

**Solution**:
Provide full path to Excel file:
```bash
node import_count_from_excel.js /Users/david/Desktop/july_count.xlsx
```

### Problem: "Missing required column: Item_Code"

**Solution**:
Your Excel file must have a column with item codes. Column name should contain "Item" and "Code" (e.g., "Item_Code", "Item Code", "ItemCode").

### Problem: "No Counted column found"

**Solution**:
The system will look for any numeric column. Make sure you have a column with your count results. Recommended names: "Counted_Cases", "Counted", "Count", "Quantity".

### Problem: "No count data found for [date]"

**Solution**:
Check the date format. Must be YYYY-MM-DD (e.g., 2025-07-31).

---

## 📊 Sample Excel Templates

### Template 1: Minimal (Required columns only)

| Item_Code | Counted_Cases |
|-----------|---------------|
| 3021      | 12.5          |
| 3111      | 8.0           |
| 4037      | 45.0          |

### Template 2: With Locations

| Item_Code | Description              | Counted_Cases | Location    |
|-----------|-------------------------|---------------|-------------|
| 3021      | APPLE GOLDEN DELICIOUS  | 12.5          | Cooler A    |
| 3111      | APPLE MCINTOSH          | 8.0           | Cooler A    |
| 4037      | BACON SLICED            | 45.0          | Freezer B   |

### Template 3: Full Details

| Item_Code | Description              | Counted_Cases | Location    | Notes              |
|-----------|-------------------------|---------------|-------------|--------------------|
| 3021      | APPLE GOLDEN DELICIOUS  | 12.5          | Cooler A    | Good condition     |
| 3111      | APPLE MCINTOSH          | 8.0           | Cooler A    | Some bruising      |
| 4037      | BACON SLICED            | 45.0          | Freezer B   |                    |
| 5012      | BREAD WHITE             | 23.0          | Dry Storage | 2 cases expired    |

---

## 🎓 Advanced: Converting Count Sheet to Excel

If you exported a CSV count sheet and want to use Excel features:

1. Open `count_sheet_[date].csv` in Excel
2. Save As → Excel Workbook (.xlsx)
3. Add `Counted_Cases` column
4. Do your count
5. Import back: `node import_count_from_excel.js count_sheet_[date].xlsx`

---

## ✅ Checklist: Your First Count

- [ ] Set cut-off date: `node prepare_cutoff_inventory.js`
- [ ] Lock future orders: `node lock_orders_after_cutoff.js`
- [ ] Export count sheet: `node export_count_sheet.js`
- [ ] Do physical count (fill Excel file)
- [ ] Import results: `node import_count_from_excel.js [file]`
- [ ] Review variance: `node inventory_variance_report.js`
- [ ] Create snapshot: `node create_inventory_snapshot.js`
- [ ] Generate report: `node report_from_snapshot.js`
- [ ] Unlock future orders: `node unlock_orders.js`

---

## 📞 Summary

**Excel import gives you:**
1. **Flexible format** - Use any column names
2. **Location tracking** - Know where items are stored
3. **Automatic variance** - System calculates differences
4. **Status updates** - Items marked as counted
5. **Snapshot ready** - Creates baseline for flexible reporting

**Perfect for:**
- Month-end closing
- Quarterly audits
- Cycle counts
- Location-based inventory

---

**You're ready to import your July count! 🎉**
