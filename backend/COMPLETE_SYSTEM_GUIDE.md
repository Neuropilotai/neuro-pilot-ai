# Complete Inventory System - One Command Startup

**Enterprise-grade inventory management with AI monitoring, multi-location tracking, and bilingual support**

---

## 🚀 Quick Start - ONE COMMAND

```bash
./start-complete-inventory.sh
```

**That's it!** The complete system starts with:
- ✅ Inventory API Server
- ✅ AI Monitoring Agent (auto-checks every 5 minutes)
- ✅ OneDrive PDF Auto-Import
- ✅ Multi-location tracking
- ✅ Min/Max par level monitoring
- ✅ Automated alerts and reorder suggestions

---

## 🛑 Stop Everything

```bash
./stop-complete-inventory.sh
```

---

## 📊 What's Running?

### 1. **Inventory API Server** (`http://localhost:3000`)
- Web interface for inventory management
- RESTful API for all inventory operations
- Real-time dashboard

### 2. **AI Monitoring Agent**
- Checks inventory levels every 5 minutes
- Generates alerts for:
  - 🚨 Critical: Items below reorder point
  - ⚠️ Warning: Items below minimum
  - 📦 Info: Overstocked items
- Learns from your counts and adjusts par levels

### 3. **OneDrive PDF Monitor** (if configured)
- Watches `~/Library/CloudStorage/OneDrive-Personal/GFS Order PDF/`
- Auto-imports new invoices
- Extracts item data automatically
- No manual intervention needed

---

## 📋 View Logs

### See AI Monitor in Real-Time:
```bash
tail -f logs/ai_monitor.log
```

### See API Server:
```bash
tail -f logs/inventory_api.log
```

### See OneDrive Monitor:
```bash
tail -f logs/onedrive_monitor.log
```

### See All Logs:
```bash
tail -f logs/*.log
```

---

## 🎯 Complete Workflow

### First Time Setup:

```bash
# 1. Start the complete system
./start-complete-inventory.sh

# 2. Import your July inventory count
node import_count_from_excel.js data/inventory_counts/july_count.xlsx

# 3. Assign items to locations (automatic from count)
node assign_item_locations_from_count.js

# 4. Set initial par levels (automatic calculation)
node set_initial_par_levels.js
```

**Now the AI is monitoring and will alert you automatically!**

---

## 📍 Multi-Location System

### Your items can be in multiple locations:

**Example:**
- Item #1001042
  - Freezer A: 6 cases
  - Freezer B: 3 cases
  - **Total: 9 cases across 2 locations**

### Available Locations:

| Code | English | Français |
|------|---------|----------|
| `FREEZER-A` | Freezer A | Congélateur A |
| `FREEZER-B` | Freezer B | Congélateur B |
| `COOLER-A` | Cooler A | Réfrigérateur A |
| `COOLER-B` | Cooler B | Réfrigérateur B |
| `DRY-STORAGE-1` | Dry Storage - Shelf 1 | Entreposage sec - Étagère 1 |
| `DRY-STORAGE-2` | Dry Storage - Shelf 2 | Entreposage sec - Étagère 2 |
| `DRY-STORAGE-3` | Dry Storage - Shelf 3 | Entreposage sec - Étagère 3 |
| `WALK-IN-FREEZER` | Walk-in Freezer | Congélateur-chambre |
| `RECEIVING` | Receiving Area | Zone de réception |
| `PREP-AREA` | Prep Area | Zone de préparation |

---

## 🤖 AI Agent Features

### 1. **Automatic Monitoring**
- Checks every 5 minutes
- No manual intervention needed
- Alerts appear in logs and dashboard

### 2. **Smart Par Levels**
- **Initial**: Based on current inventory (50% min, 150% max)
- **After 2nd count**: AI learns actual usage
- **Auto-adjusts**: Recommends new par levels based on patterns

### 3. **Learning System**
After your second inventory count, AI will:
```bash
# Calculate actual usage between counts
# Recommend adjusted par levels
# You can review and approve recommendations
```

**Example:**
```
Item #1001042 - Frozen Spring Rolls
Current: Min 3 / Max 9
AI Recommendation: Min 8 / Max 16
Reason: Usage exceeds current max - increase par levels
Confidence: 80%
```

### 4. **Automated Alerts**

**Critical (🚨):** Below reorder point → Order NOW
**Warning (⚠️):** Below minimum → Order soon
**Info (📦):** Above maximum → Consider moving/reducing orders

---

## 📊 Monthly Count Workflow

### Month-End Count:

```bash
# 1. Prepare count (lock future orders)
node prepare_cutoff_inventory.js
# Enter: 2025-07-31 (last order of month)

# 2. Lock August+ orders
node lock_orders_after_cutoff.js

# 3. Export count sheet
node export_count_sheet.js

# 4. Do physical count (fill Excel)

# 5. Import results
node import_count_from_excel.js august_count.xlsx

# 6. Assign locations (automatic)
node assign_item_locations_from_count.js

# 7. Create snapshot
node create_inventory_snapshot.js
# Name: "August 2025 Month-End"

# 8. AI learns and recommends par adjustments
# Check logs/ai_monitor.log for recommendations
```

---

## 📁 Excel Import Format

### Your Excel file should have:

| Item_Code | Description | Counted_Cases | Counted_Units | Location | Notes |
|-----------|-------------|---------------|---------------|----------|-------|
| 1001042 | Pâtés impériaux | 6 | 2 | Freezer A | |
| 1010106 | Saucisse porc | 25 | 0 | Freezer B | |

**Supported column names** (flexible):
- `Item_Code`, `ItemCode`, `Item Code`, `Code`
- `Counted_Cases`, `Cases`, `Boîte`, `Boite`
- `Counted_Units`, `Units`, `Unité`, `Unite`
- `Location`, `Storage`, `Emplacement`

---

## 🌐 Bilingual Support

### Everything works in French AND English:

**Column Names:**
- `Counted_Cases` OR `Boîte` ✅
- `Location` OR `Emplacement` ✅
- `Units` OR `Unité` ✅

**Location Names:**
- "Freezer A" OR "Congélateur A" ✅
- "Dry Storage" OR "Entreposage sec" ✅

**Item Codes:**
- Always #1001042 (same in both languages) ✅

---

## 📈 Dashboards & Reports

### View Current Inventory:
```bash
# Open in browser
open http://localhost:3000
```

### Generate Reports:
```bash
# From snapshot (flexible date range)
node report_from_snapshot.js

# Variance report
node inventory_variance_report.js

# Location-based report
node location_inventory_report.js
```

---

## 🔄 System Status

### Check What's Running:
```bash
ps aux | grep node
```

### Restart Everything:
```bash
./stop-complete-inventory.sh
./start-complete-inventory.sh
```

### View AI Recommendations:
```bash
# Check latest recommendations
sqlite3 data/enterprise_inventory.db "SELECT * FROM par_level_recommendations ORDER BY created_at DESC LIMIT 10"
```

---

## 💡 Pro Tips

### 1. **Monitor AI Alerts in Real-Time**
```bash
tail -f logs/ai_monitor.log | grep "🚨\|⚠️"
```

### 2. **See Only Critical Alerts**
```bash
tail -f logs/ai_monitor.log | grep "🚨 CRITICAL"
```

### 3. **Check Par Level Learning**
After 2nd count, AI will log recommendations:
```bash
tail -f logs/ai_monitor.log | grep "AI Recommendation"
```

### 4. **Auto-Start on System Boot**
Add to crontab:
```bash
@reboot cd /Users/davidmikulis/neuro-pilot-ai/backend && ./start-complete-inventory.sh
```

---

## 🎯 What Makes This System Complete?

### ✅ Fully Automated
- One command starts everything
- No manual monitoring needed
- AI handles alerts automatically

### ✅ Intelligent Learning
- Learns from your counts
- Adjusts par levels based on actual usage
- Improves accuracy over time

### ✅ Multi-Location
- Track same item in different locations
- Separate min/max per location
- Complete visibility

### ✅ Bilingual
- French and English column names
- French and English locations
- Universal item codes

### ✅ Enterprise-Grade
- API server for integrations
- Audit trails
- Snapshot system for historical reporting
- Variance tracking

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────┐
│         COMPLETE INVENTORY SYSTEM                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   API Server │  │ AI Monitor   │  │ OneDrive  │ │
│  │   Port 3000  │  │  (5 min)     │  │  Monitor  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                  │                 │       │
│         └──────────────────┴─────────────────┘       │
│                           │                          │
│                  ┌────────▼────────┐                 │
│                  │   SQLite DB     │                 │
│                  │  • Invoices     │                 │
│                  │  • Locations    │                 │
│                  │  • Par Levels   │                 │
│                  │  • Alerts       │                 │
│                  │  • Snapshots    │                 │
│                  └─────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 You're Ready!

### Start the complete system:
```bash
./start-complete-inventory.sh
```

### Import your July inventory:
```bash
node import_count_from_excel.js your_july_count.xlsx
```

### Watch the AI work:
```bash
tail -f logs/ai_monitor.log
```

**The system is now monitoring your inventory 24/7!** 🎉
