# First Inventory Count Guide

**System**: Enterprise Inventory Management
**Status**: Production Ready for Testing
**Date**: October 4, 2025

---

## 🎯 Overview

This guide will walk you through performing your first physical inventory count and reconciling it with the system.

### What You Have Right Now
- **167 invoices** processed ($929,333 net value)
- **1,833 unique items** ready to count
- **7,536 purchase line items** in the system
- **All items categorized** with GL codes for reporting

---

## 📋 Step-by-Step Process

### Step 1: Prepare for Count

Run the preparation script:
```bash
cd /Users/davidmikulis/neuro-pilot-ai/backend
node prepare_first_inventory.js
```

This will:
- Mark all items as "READY_TO_COUNT"
- Show you how many items need counting
- Display breakdown by category

**Expected Output**:
- Total items: ~1,833
- Total value: ~$929K
- Items grouped by GL code

---

### Step 2: Export Count Sheet

Generate the Excel-compatible count sheet:
```bash
node export_count_sheet.js
```

This creates:
- **File**: `data/inventory_counts/inventory_count_sheet_2025-10-04.csv`
- **Columns**: GL_Code, Item_Code, Description, Unit, Expected_Cases, Expected_Value, Counted_Cases, Notes

**What to do**:
1. Open the CSV in Excel or Google Sheets
2. Print it (or use on tablet/computer during count)
3. Keep it handy for physical counting

---

### Step 3: Perform Physical Count

Walk through your storage areas and count inventory:

#### Counting Tips:
1. **Work by Category** - Count all MILK items, then all MEAT items, etc.
2. **Count in Cases** - The system expects cases, not individual units
3. **Mark Partial Cases** - If you have 2.5 cases, enter "2.5"
4. **Note Discrepancies** - If you find items not on the sheet, add notes
5. **Double Check High-Value Items** - Recount items worth >$1,000

#### Example Count Sheet Entry:
| GL_Code  | Item_Code | Description          | Unit | Expected | Expected_Value | **Counted** | **Notes** |
|----------|-----------|---------------------|------|----------|----------------|-------------|-----------|
| 60110030 | 12345678  | MILK 2% 4L JUG      | CS   | 10       | 45.50          | **8**       | **2 expired** |

---

### Step 4: Save Your Counted Data

After counting:
1. Fill in the "Counted_Cases" column for each item
2. Add notes for any discrepancies
3. Save the file as: `inventory_count_sheet_2025-10-04_COUNTED.csv`
4. Keep it in `data/inventory_counts/` folder

---

### Step 5: Import Count Data

Import your physical counts into the system:
```bash
node import_inventory_count.js data/inventory_counts/inventory_count_sheet_2025-10-04_COUNTED.csv
```

This will:
- Import all counted quantities
- Calculate variances (difference between expected and counted)
- Calculate variance values ($ impact)
- Mark items as "COUNTED" in the system

**Expected Output**:
- Number of items counted
- Number of items with variances
- Total variance value (+/-)

---

### Step 6: Review Variance Report

Generate detailed variance report:
```bash
node inventory_variance_report.js
```

This shows:
- **Perfect Counts**: Items that matched exactly
- **Over-counts**: Items you have more of than expected
- **Under-counts**: Items you have less of than expected
- **Significant Variances**: Items with >$10 difference
- **Variance by Category**: Breakdown by GL code

#### What to Look For:
1. **Large Variances** (>$100) - Investigate these first
2. **Pattern Variances** - All items in one category short? Might indicate systematic issue
3. **Zero Counts** - Items you expected but didn't find
4. **High Counts** - Items you found but didn't expect much of

---

## 🔍 Understanding Variances

### Common Variance Causes:

#### 1. **Positive Variance** (More than expected)
- Items ordered but not yet used
- Returns from kitchen/dining
- Duplicate orders not tracked
- **Action**: Verify orders, check for duplicates

#### 2. **Negative Variance** (Less than expected)
- Items used/consumed
- Spoilage/waste
- Theft
- Items moved to different location
- **Action**: Check usage logs, verify locations

#### 3. **Zero Count** (Expected but not found)
- Items fully consumed
- Items in different storage area
- Items on loan to another department
- **Action**: Search all locations, check with staff

---

## 📊 Expected Results

### For Your First Count:

Based on $929K of orders since January 2025, you'll likely find:

1. **High-Value Categories**:
   - PROD (Produce): ~$165K expected
   - MILK: ~$136K expected
   - MEAT: ~$123K expected
   - GROC+MISC: ~$99K expected

2. **Typical Variance**: 10-20% for first count
   - Food service typically has 10-15% usage/waste
   - First counts often have 15-25% variance until system is tuned

3. **Investigation Threshold**:
   - Variance >$1,000 per item: Investigate immediately
   - Variance >$100 per item: Review and document
   - Variance <$100: Normal for first count

---

## 🎯 After Your First Count

### Immediate Actions:

1. **Review High Variances** (>$100)
   ```bash
   # See all significant variances
   node inventory_variance_report.js | grep "Significant"
   ```

2. **Adjust for Known Issues**:
   - Mark spoiled/expired items
   - Note items in transit
   - Document usage between order and count

3. **Establish Baselines**:
   - This count becomes your starting point
   - Future counts will be more accurate
   - System learns your patterns

### System Updates:

The system will now show:
- **Actual inventory value** (based on count)
- **Variance tracking** (expected vs. actual)
- **Consumption rates** (orders vs. counts)
- **Reorder points** (based on usage)

---

## 🔄 Regular Inventory Counts

After your first count, establish a routine:

### Weekly Counts
- High-value items (>$1,000)
- Fast-moving items (MILK, PRODUCE, MEAT)
- Items prone to spoilage

### Monthly Counts
- All categories
- Full reconciliation
- Variance analysis

### Quarterly Counts
- Complete physical inventory
- Financial audit
- System accuracy verification

---

## 📝 Troubleshooting

### Issue: Can't find an item on the count sheet
**Solution**:
- Check if it's a different size/pack
- Search by description, not code
- Add to notes for later investigation

### Issue: Found items not on count sheet
**Solution**:
- Add manually to spreadsheet
- Note as "FOUND - NOT IN SYSTEM"
- These might be:
  - Old inventory from before January
  - Items ordered outside GFS
  - Items from other suppliers

### Issue: Variance seems too high
**Solution**:
- Recount high-value items
- Check all storage locations
- Verify items not in use (kitchen, dining room)
- Check for items in freezer, cooler, dry storage

### Issue: Import fails
**Solution**:
- Check CSV format (must match export format)
- Verify all "Counted_Cases" are numbers
- Remove any extra columns
- Make sure file is saved as CSV (not Excel)

---

## 🚀 Production Checklist

Before going full production:

- [ ] Complete first physical count
- [ ] Review and understand variances
- [ ] Investigate variances >$100
- [ ] Document any system issues
- [ ] Train staff on count procedures
- [ ] Establish count schedule (weekly/monthly)
- [ ] Set variance alert thresholds
- [ ] Create variance investigation process

---

## 📞 Next Steps After First Count

### Immediate (Today):
1. ✅ Run `prepare_first_inventory.js`
2. ✅ Export count sheet
3. ✅ Perform physical count
4. ✅ Import counts
5. ✅ Review variance report

### Short-term (This Week):
1. Investigate significant variances
2. Document findings
3. Adjust system if needed
4. Plan second count (in 1 week)

### Long-term (This Month):
1. Establish regular count schedule
2. Train additional staff
3. Fine-tune variance thresholds
4. Integrate with ordering system

---

## 📊 Expected Files

After your first count, you'll have:

```
data/inventory_counts/
├── inventory_count_sheet_2025-10-04.csv          # Original export
└── inventory_count_sheet_2025-10-04_COUNTED.csv  # Your counts
```

Database will contain:
- `inventory_counts` table with all count data
- Variance calculations
- Count history for trending

---

## ✅ Success Criteria

Your first count is successful when:

1. **All items counted**: 1,833 items have values in "Counted_Cases"
2. **Variances calculated**: System shows variance report
3. **High variances investigated**: Items >$100 variance documented
4. **Data imported**: All counts in database
5. **Report generated**: Variance report reviewed

**Expected Time**:
- Small operation (1 person): 4-6 hours
- Medium operation (2-3 people): 2-3 hours
- Large operation (team): 1-2 hours

---

## 🎯 Ready to Start?

Run this command to begin:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/backend
node prepare_first_inventory.js
```

**Good luck with your first inventory count! 🎉**

---

## 📝 Notes Section (For Your Use)

**Count Date**: _______________

**Counters**: _______________

**Start Time**: _______________

**End Time**: _______________

**Total Variance**: $_______________

**Significant Issues Found**:
- _______________________________________________
- _______________________________________________
- _______________________________________________

**Actions Needed**:
- _______________________________________________
- _______________________________________________
- _______________________________________________
