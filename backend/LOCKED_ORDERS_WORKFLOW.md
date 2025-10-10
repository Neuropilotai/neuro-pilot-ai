# Locked Orders Workflow Guide

**Purpose**: Lock orders received after count date so they don't appear in reports until you're ready
**Use Case**: Prevent orders that arrived late from affecting your month-end count

---

## 🎯 The Problem This Solves

### Real-World Scenario:
You want to count inventory as of **July 31st**:
- ✅ Last July order received: **July 28th**
- ❌ But order from July 30th **arrived on August 5th** (late delivery)
- ❌ Another order from August 2nd is already in the system
- ❌ These shouldn't be in your July count!

### The Solution:
**Lock all orders after July 28th** → They're invisible until you unlock them

---

## 📋 Complete Workflow

### Step 1: Add Lock Functionality to Database
```bash
node add_lock_columns.js
```

**What this does:**
- Adds `locked_at`, `locked_by`, `lock_reason` columns
- Adds `unlocked_at`, `unlocked_by` columns
- One-time setup, run once

---

### Step 2: Prepare Count with Cut-Off Date
```bash
node prepare_cutoff_inventory.js
```

**Enter:**
- Cut-off date: `2025-07-28` (last July order date)
- OR invoice number: `9024785494` (last July invoice)

**What happens:**
- Marks orders up to July 28 as "READY_TO_COUNT"
- Identifies orders after July 28
- Saves configuration

**Example Output:**
```
✅ Orders INCLUDED (up to 2025-07-28): 120 orders, $650,000
⏭️  Orders EXCLUDED (after 2025-07-28): 47 orders, $279,333
```

---

### Step 3: Lock Orders After Cut-Off
```bash
node lock_orders_after_cutoff.js
```

**What this does:**
- Locks all orders received after July 28
- Changes status to "LOCKED"
- Records lock date, reason, who locked
- These orders become invisible

**Example:**
```
🔒 Orders to be LOCKED (received after 2025-07-28):
Date       | Invoice     | Items | Value
─────────────────────────────────────────
2025-07-29 | 9024785490 |    45 | $12,450.00
2025-07-30 | 9024785491 |    52 | $15,320.50
2025-08-01 | 9025025278 |    12 | $18,750.25
... and 44 more

Lock these orders? (yes/no): yes
✅ Locked 47 orders
```

---

### Step 4: Export Count Sheet (Locked Orders Excluded)
```bash
node export_count_sheet.js
```

**What you get:**
- Count sheet with ONLY unlocked orders (Jan-July 28)
- NO orders after July 28 (they're locked)
- Expected value: $650,000 (not including $279K locked)

**File:** `inventory_count_sheet_2025-07-28.csv`

---

### Step 5: Perform Physical Count
- Count everything you have
- Fill in "Counted_Cases" column
- Save as `inventory_count_sheet_2025-07-28_COUNTED.csv`

---

### Step 6: Import Counts
```bash
node import_inventory_count.js data/inventory_counts/inventory_count_sheet_2025-07-28_COUNTED.csv
```

**Result:**
- Your count vs. expected (Jan-July 28)
- Variances calculated
- Locked orders still hidden

---

### Step 7: Review Variances
```bash
node inventory_variance_report.js
```

**Shows:**
- Count accuracy for July period
- What was used/consumed
- NO locked orders in report

---

### Step 8: Check Locked Orders (Optional)
```bash
node show_locked_orders.js
```

**Shows:**
- All currently locked orders
- When they were locked
- Why they were locked
- Total value locked

**Example:**
```
🔒 LOCKED ORDERS REPORT
Date       | Invoice     | Note   | Locked     | By     | Value
─────────────────────────────────────────────────────────────
2025-07-29 | 9024785490 | BEN 3-4 | 2025-10-04 | SYSTEM | $12,450.00
... 46 more orders

TOTAL: 47 orders | 2,145 items | $279,333.14
```

---

### Step 9: Unlock Orders (When Ready)
```bash
node unlock_orders.js
```

**Authorization Required:**
- Username: `david` (or `admin`)
- Password: (set in unlock_orders.js)

**Options:**
1. **Unlock ALL** - Unlock all locked orders
2. **Unlock Specific Invoice** - Unlock just one invoice
3. **Unlock After Date** - Unlock orders after specific date

**Example:**
```
🔐 Authorization Required
Username: david
Password: ********

✅ Authorized: david

🔒 Currently Locked Orders (47):
... list of orders ...

📋 Unlock Options:
1. Unlock ALL locked orders
2. Unlock specific invoice
3. Unlock orders after specific date
4. Cancel

Choose option (1-4): 1

⚠️  About to unlock: ALL locked orders
Confirm unlock? (yes/no): yes

✅ Unlocked 2,145 items

These orders are now ACTIVE and will:
  ✅ Appear in inventory reports
  ✅ Be included in inventory totals
```

---

## 🔐 Security Features

### Authorization Required to Unlock
- Username/password check
- Only authorized users can unlock
- Audit trail of who unlocked what

### Audit Trail
Every lock/unlock is recorded:
- `locked_at` - When locked
- `locked_by` - Who locked (SYSTEM or username)
- `lock_reason` - Why locked
- `unlocked_at` - When unlocked
- `unlocked_by` - Who unlocked

### Default Credentials
**⚠️ IMPORTANT: Change these passwords in `unlock_orders.js`!**
```javascript
const AUTHORIZED_USERS = {
  'david': 'admin123',  // ← Change this!
  'admin': 'secure456'  // ← Change this!
};
```

---

## 📊 Real-World Example

### Your Scenario: July Month-End Count

#### 1. Current Date: October 4, 2025
#### 2. You want: July 31 inventory
#### 3. Last July order: July 28, 2025

### Workflow:

```bash
# Add lock functionality (one-time)
node add_lock_columns.js

# Set cut-off to July 28
node prepare_cutoff_inventory.js
# Enter: 2025-07-28

# Lock everything after July 28
node lock_orders_after_cutoff.js
# Locks 47 orders ($279K)

# Export count sheet (only July orders)
node export_count_sheet.js
# Only includes Jan-July 28 ($650K)

# Count physically (you do this)
# Let's say you count $580K

# Import counts
node import_inventory_count.js [file]
# Shows variance: -$70K (consumption)

# Verify locked orders are hidden
node verify_system_accuracy.js
# Total: $580K (not $859K!)

# Later, when ready to include August+
node unlock_orders.js
# Enter credentials, unlock all

# Now system shows full inventory
node verify_system_accuracy.js
# Total: $859K ($580K count + $279K unlocked)
```

---

## 🎯 When to Use Locked Orders

### Use Locked Orders When:

1. **Month-End Counts**
   - Lock orders from next month
   - Count current month only
   - Unlock after count complete

2. **Late Deliveries**
   - Order placed in July
   - Delivered in August
   - Lock until ready to add

3. **Quarterly Audits**
   - Lock orders from next quarter
   - Audit current quarter
   - Unlock after audit

4. **Inventory Freeze**
   - Lock all new orders
   - Count existing inventory
   - Unlock when counting done

---

## 📝 Command Reference

### Lock Management:
```bash
# Add lock functionality (one-time)
node add_lock_columns.js

# Lock orders after cut-off
node lock_orders_after_cutoff.js

# Unlock orders (requires auth)
node unlock_orders.js

# Show locked orders
node show_locked_orders.js
```

### Count Workflow:
```bash
# Set cut-off date
node prepare_cutoff_inventory.js

# Export count sheet (excludes locked)
node export_count_sheet.js

# Import counts
node import_inventory_count.js [file]

# Review variances
node inventory_variance_report.js
```

### Verification:
```bash
# Check system totals (excludes locked)
node verify_system_accuracy.js

# Check pending/locked orders
node show_pending_orders.js
```

---

## ⚠️ Important Notes

### Locked Orders Are:
- ❌ NOT in count sheets
- ❌ NOT in inventory totals
- ❌ NOT in variance reports
- ❌ NOT in month-end reports
- ✅ Trackable via audit trail
- ✅ Reversible (unlock anytime)

### After Unlocking:
- ✅ Orders appear in all reports
- ✅ Inventory totals update
- ✅ All features include them
- ✅ Audit trail preserved

### Security:
- 🔐 Password required to unlock
- 📝 All actions logged
- 👤 User tracking enabled
- 🔍 Full audit trail

---

## 🚀 Quick Start

For your July count right now:

```bash
# 1. Setup (one-time)
node add_lock_columns.js

# 2. Set July 28 as cut-off
node prepare_cutoff_inventory.js
# Enter: 2025-07-28

# 3. Lock everything after
node lock_orders_after_cutoff.js

# 4. Export count sheet
node export_count_sheet.js

# 5. Do your count

# 6. Import counts
node import_inventory_count.js [file]

# 7. When ready, unlock
node unlock_orders.js
```

**That's it! Complete control over which orders appear in your count! 🎉**
