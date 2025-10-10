# Cut-Off Date Inventory Counting Guide

**Purpose**: Properly count inventory with a specific cut-off date
**Example**: Count all orders received up to July 31st, excluding orders received in August

---

## 🎯 What is Cut-Off Date Counting?

### The Problem:
If you're counting inventory in October but want to establish your inventory as of **July 31st**, you need to:
1. **Include** all orders received up to July 31st
2. **Exclude** all orders received after July 31st
3. After counting, **add back** the excluded orders

### The Solution:
The system handles this automatically with cut-off date counting.

---

## 📋 Step-by-Step Process

### Step 1: Choose Your Cut-Off Date

**Cut-off date** = Date of the LAST order you want INCLUDED in your count

**Example Scenarios**:

#### Scenario A: End of Month Count
- You want inventory as of July 31st
- Last order received in July was July 28th
- **Cut-off date**: `2025-07-28`
- **Result**: Count includes all orders up to July 28th

#### Scenario B: Specific Invoice
- You want to count up to a specific invoice
- Last invoice you want included: `9024785494`
- **Cut-off**: Just enter the invoice number
- **Result**: System finds the date and uses it

#### Scenario C: Before Receiving New Shipment
- Current date: October 4th
- Last order you physically have: September 27th
- New orders arriving next week
- **Cut-off date**: `2025-09-27`
- **Result**: Counts what you have, excludes future orders

---

### Step 2: Prepare Count with Cut-off

```bash
node prepare_cutoff_inventory.js
```

**What happens**:
1. Shows your recent orders
2. Asks for cut-off date (or invoice number)
3. Shows orders INCLUDED (up to cut-off)
4. Shows orders EXCLUDED (after cut-off)
5. Marks only included orders as ready to count

**Example Output**:
```
📅 Cut-off Date: 2025-07-28

✅ Orders INCLUDED in count (up to 2025-07-28): 120
   Total Value: $650,000.00

⏭️  Orders EXCLUDED from count (after 2025-07-28): 47
   Total Value: $279,333.14

Orders that will NOT be in your count sheet:
--------------------------------------------------------------------------------
  2025-07-29 - Invoice 9024785490 - $12,450.00
  2025-07-30 - Invoice 9024785491 - $15,320.50
  2025-08-01 - Invoice 9025025278 - $18,750.25
  ... and 44 more
```

---

### Step 3: Export Count Sheet

```bash
node export_count_sheet.js
```

**What you get**:
- Count sheet with ONLY items from orders up to cut-off date
- Expected quantities based on those orders
- Expected values based on those orders

**File**: `data/inventory_counts/inventory_count_sheet_2025-07-28.csv`

---

### Step 4: Perform Physical Count

**Important**: Count EVERYTHING you have physically, regardless of when it arrived.

**Why?** Because you want to know:
- What you actually have
- If there's shrinkage/waste
- If items are missing
- If you have more than expected

---

### Step 5: Import Counts

```bash
node import_inventory_count.js data/inventory_counts/inventory_count_sheet_2025-07-28_COUNTED.csv
```

**What happens**:
1. Your counted quantities are imported
2. Variances calculated (actual vs. expected)
3. Items marked as "COUNTED"

---

### Step 6: View Pending Orders

```bash
node show_pending_orders.js
```

**Shows you**:
- All orders received AFTER your cut-off date
- These are NOT included in your count
- These will be ADDED to your inventory after count

**Example**:
```
📦 Orders Received AFTER 2025-07-28:
--------------------------------------------------------------------------------
Date       | Invoice     | Note/Context | Items | Value
--------------------------------------------------------------------------------
2025-07-29 | 9024785490 | BEN 3-4      |    45 | $12,450.00
2025-07-30 | 9024785491 |              |    52 | $15,320.50
2025-08-01 | 9025025278 | AIR INUIT    |    12 | $18,750.25
--------------------------------------------------------------------------------
TOTAL: 47 orders | 2,145 items | $279,333.14
```

---

### Step 7: Reconcile Your Inventory

After the count, your inventory consists of:

1. **Your Physical Count** (what you actually have)
2. **Plus: Pending Orders** (orders received after cut-off)
3. **Equals: Total Current Inventory**

**Example**:
```
Physical Count (as of July 28): $580,000  (you counted this)
Pending Orders (July 29 - Oct 4): $279,333  (system adds this)
─────────────────────────────────────────
Current Inventory: $859,333
```

---

## 📊 Real-World Example

### Your Situation:
- Today is October 4, 2025
- You want to establish inventory as of **end of July**
- Last July order was July 28, 2025 (Invoice 9024785494)

### Process:

#### 1. Prepare with Cut-off
```bash
node prepare_cutoff_inventory.js
# Enter: 2025-07-28 (or 9024785494)
```

**Result**:
- 120 orders included (Jan 18 - July 28)
- $650,000 expected value
- 47 orders excluded (July 29 - Oct 4)
- $279,333 pending

#### 2. Export Count Sheet
```bash
node export_count_sheet.js
```

**Count Sheet Contains**:
- All items from 120 orders (Jan 18 - July 28)
- Expected quantities based on those orders
- NOT including any orders after July 28

#### 3. Physical Count
You count your actual inventory and find:
- $580,000 worth (counted value)
- This is LESS than expected $650,000
- **Variance**: -$70,000 (you've used $70K worth)

**This is normal!** You've been using inventory from January to July.

#### 4. Import Counts
```bash
node import_inventory_count.js [your_file]
```

**System shows**:
- Counted: $580,000
- Expected: $650,000
- Variance: -$70,000 (shrinkage/usage)

#### 5. Check Pending Orders
```bash
node show_pending_orders.js
```

**Shows**:
- 47 orders after July 28
- $279,333 value
- These will be added to your $580K count

#### 6. Final Inventory
```
Your July 28 inventory: $580,000 (counted)
Orders since July 28:   $279,333 (pending)
─────────────────────────────────
Current inventory:      $859,333
```

---

## 🎯 Why Use Cut-Off Dates?

### Benefits:

1. **Accurate Period Reporting**
   - Know exactly what you had at end of July
   - Track consumption/usage month by month
   - Proper financial reporting

2. **Easier Counting**
   - Don't need to count while receiving shipments
   - Count is "frozen" at a point in time
   - Can reconcile later with new orders

3. **Variance Analysis**
   - Compare expected vs. actual for specific period
   - Identify shrinkage, waste, theft
   - Improve ordering accuracy

4. **Flexible Timing**
   - Count whenever convenient
   - Backdate to any point in time
   - No rush to count on specific day

---

## 📅 Common Cut-Off Scenarios

### Monthly Count (Month-End)
```
Cut-off: Last order of the month
Example: July 31st count, last order July 28
Command: node prepare_cutoff_inventory.js
Enter: 2025-07-28
```

### Quarterly Count
```
Cut-off: Last order of quarter
Example: Q2 2025 (June 30), last order June 28
Command: node prepare_cutoff_inventory.js
Enter: 2025-06-28
```

### Year-End Count
```
Cut-off: Last order of year
Example: Dec 31, 2025, last order Dec 30
Command: node prepare_cutoff_inventory.js
Enter: 2025-12-30
```

### Before Major Event
```
Cut-off: Last order before event
Example: Before inventory audit, last normal order
Command: node prepare_cutoff_inventory.js
Enter: [date before audit]
```

---

## 🔍 Understanding the Numbers

### What "Expected" Means:
- **Expected Quantity**: Sum of all orders up to cut-off date
- **Expected Value**: Total value of those orders
- **This is NOT what you should count**
- This is what you WOULD have if nothing was used

### What Your Count Shows:
- **Actual Quantity**: What you physically counted
- **Actual Value**: Value of what you have
- **This IS what you have today**

### Variance Calculation:
```
Variance = Actual Count - Expected

Positive Variance: You have MORE than expected
  → Possible overstock, returns, found items

Negative Variance: You have LESS than expected
  → Normal! This is consumption/usage/waste
```

---

## 📊 After Your Count

### Immediate Actions:

1. **Review Variance Report**
   ```bash
   node inventory_variance_report.js
   ```

2. **Check Pending Orders**
   ```bash
   node show_pending_orders.js
   ```

3. **Calculate Total Inventory**
   ```
   Counted Value + Pending Orders = Total Current Inventory
   ```

### For Your Example (July 28 cut-off):
```
July 28 Count:     $580,000
Pending (29-Oct4): $279,333
─────────────────────────
October 4 Total:   $859,333
```

---

## ✅ Quick Reference Commands

```bash
# Step 1: Set cut-off date
node prepare_cutoff_inventory.js

# Step 2: Export count sheet
node export_count_sheet.js

# Step 3: Do physical count (manual)

# Step 4: Import counts
node import_inventory_count.js [file]

# Step 5: Review variances
node inventory_variance_report.js

# Step 6: Check pending orders
node show_pending_orders.js
```

---

## 💡 Pro Tips

1. **Choose Meaningful Dates**
   - End of month for monthly reporting
   - Before/after major events
   - When inventory is stable (not during receiving)

2. **Count Completely**
   - Count everything, even items received after cut-off
   - The system will reconcile automatically
   - Better to overcount than undercount

3. **Document Context**
   - Note any special circumstances
   - Record damaged/expired items separately
   - Keep photos of problem areas

4. **Verify Pending Orders**
   - After count, check `show_pending_orders.js`
   - Make sure those orders are physically present
   - If not, they haven't arrived yet (normal)

---

## 🎯 Your Next Steps

For your July inventory count:

```bash
# 1. Set cut-off to end of July
node prepare_cutoff_inventory.js
# Enter: 2025-07-28 (or last July invoice number)

# 2. Export count sheet
node export_count_sheet.js

# 3. Count your inventory

# 4. Import your counts
node import_inventory_count.js [your_file]

# 5. See what orders came after July
node show_pending_orders.js
```

**You'll know exactly what you had on July 28th! 🎉**
