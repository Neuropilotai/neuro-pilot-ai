# ⚡ Quick Start - Complete Inventory System

## 🚀 START EVERYTHING (One Command)

```bash
./start-complete-inventory.sh
```

**✅ Done!** Everything is now running:
- API Server → http://localhost:3000
- AI Monitor → Checking every 5 minutes
- Auto-alerts for low stock

---

## 🛑 STOP EVERYTHING

```bash
./stop-complete-inventory.sh
```

---

## 📥 IMPORT YOUR INVENTORY COUNT

### 1. Prepare Excel File:

| Item_Code | Counted_Cases | Counted_Units | Location | Notes |
|-----------|---------------|---------------|----------|-------|
| 1001042 | 6 | 2 | Freezer A | |
| 1010106 | 25 | 0 | Freezer B | |

### 2. Import:

```bash
node import_count_from_excel.js your_file.xlsx
```

### 3. Auto-assign locations and par levels:

```bash
node assign_item_locations_from_count.js
node set_initial_par_levels.js
```

**✅ AI is now monitoring automatically!**

---

## 👀 WATCH AI MONITORING LIVE

```bash
tail -f logs/ai_monitor.log
```

---

## 📊 MONTHLY COUNT WORKFLOW

```bash
# 1. Prepare
node prepare_cutoff_inventory.js
node lock_orders_after_cutoff.js
node export_count_sheet.js

# 2. Count (physically)

# 3. Import
node import_count_from_excel.js month_count.xlsx
node assign_item_locations_from_count.js

# 4. Snapshot
node create_inventory_snapshot.js

# 5. AI learns and adjusts par levels automatically!
```

---

## 🤖 AI FEATURES

### Automatic:
- ✅ Monitors every 5 minutes
- ✅ Alerts for low stock
- ✅ Suggests reorder quantities
- ✅ Learns from your counts
- ✅ Adjusts par levels

### After 2nd Count:
- AI calculates actual usage
- Recommends new min/max levels
- You review and approve

---

## 📍 MULTI-LOCATION

Same item in multiple places? No problem!

```
Item #1001042:
  Freezer A: 6 cases
  Freezer B: 3 cases
  Total: 9 cases
```

Each location has its own min/max/reorder levels.

---

## 🌐 BILINGUAL

Works in French AND English:
- ✅ Columns: `Counted_Cases` OR `Boîte`
- ✅ Locations: `Freezer A` OR `Congélateur A`
- ✅ Item codes: Same in both languages

---

## 📋 USEFUL COMMANDS

### Check what's running:
```bash
ps aux | grep node
```

### View alerts only:
```bash
tail -f logs/ai_monitor.log | grep "🚨\|⚠️"
```

### Check par level recommendations:
```bash
tail -f logs/ai_monitor.log | grep "Recommendation"
```

### Generate reports:
```bash
node report_from_snapshot.js
```

---

## 📖 FULL DOCUMENTATION

See `COMPLETE_SYSTEM_GUIDE.md` for detailed information.

---

**You're all set! The AI is watching your inventory 24/7** 🎉
