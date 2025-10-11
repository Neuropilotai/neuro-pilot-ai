# 🤖 NeuroPilot AI Chef - Quick Start Guide

## ⚡ Start Forecasting in 30 Seconds

### **Check Today's Forecast**
```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Full daily forecast (menu + breakfast + beverages)
bash scripts/verify_v4_addons.sh --run-menu-forecast

# Breakfast & beverage details
bash scripts/verify_v4_addons.sh --run-breakfast-forecast
```

### **Update Population**
```bash
# Change total headcount
bash scripts/verify_v4_addons.sh --set-population 275

# Change Indian meal count
bash scripts/verify_v4_addons.sh --set-indian-population 25
```

### **Teach the AI**
```bash
# The AI learns from your feedback!
# Submit a comment via API:
curl -X POST http://localhost:8083/api/owner/forecast/comment \
  -H "Content-Type: application/json" \
  -d '{"comment": "coffee 1.5 cups/person"}'

# Apply the learning
bash scripts/verify_v4_addons.sh --ai-train-feedback
```

---

## 📊 Current System Status

**✅ OPERATIONAL:** 14 items actively forecasted
- 8 breakfast items
- 6 beverage items
- Population: 250 (20 Indian)
- Confidence: 88-95%

**Today's Top Demands (2025-10-10):**
```
☕ Coffee:      3,348 g
🥤 OJ:          1,545 oz
🥛 Milk:        1,030 oz
🍞 Bread:         656 slices
🥓 Bacon:         525 strips
🥚 Eggs:          315 ea
```

---

## 🎯 What the AI Can Do Right Now

### 1. **Daily Demand Forecasting**
Predicts exactly how much of each item you'll need today based on:
- Population count (250 people)
- Per-person consumption rates
- Planned menu items
- Recurring events (Steak Night Saturdays)
- Sandwich program baseline (500/day)

### 2. **Stock-Out Risk Alerts**
Shows which items will run out before you can restock:
```
🔴 CRITICAL - Out of stock NOW
🟡 HIGH     - Less than 50% coverage
🟠 MEDIUM   - Less than 100% coverage
🟢 LOW      - Adequate stock
```

### 3. **Cultural Awareness**
Separately tracks:
- Standard menu (230 people)
- Indian meals (20 people)
- Specialized spice inventory

### 4. **Self-Learning**
AI gets smarter every day by:
- Learning from your comments ("coffee 1.5 cups/person")
- Comparing predictions vs actual usage
- Adjusting for waste patterns
- Detecting seasonal trends

---

## 🚀 Next Steps to Unlock Full Power

### **Priority 1: Link Recipes to Ingredients**
Currently, recipes exist but have no ingredients linked.

**How to fix:**
1. Open your menu Excel file
2. For each recipe, identify the item_codes needed
3. Insert into `recipe_ingredients`:
```sql
-- Example: Steak Night recipe
INSERT INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct)
VALUES
  ('STEAK_NIGHT', 'STEAK-AAA-10OZ', 1, 'ea', 3.0),
  ('STEAK_NIGHT', 'POTATO-BAKING', 1, 'ea', 5.0);
```

**Result:** Menu-based forecasts will activate (currently showing 0 because no ingredients linked)

### **Priority 2: Take First Inventory Count**
Currently, all stock levels are 0 (using par levels as estimates).

**How to fix:**
1. Go to frontend: http://localhost:8083
2. Use "Physical Count" feature
3. Count actual inventory
4. Save snapshot

**Result:** Forecast will show real stock vs predicted demand

### **Priority 3: Import Your 4-Week Menu**
Load your "Proposed Menu as of 18th July.xlsx" into `menu_calendar`.

**How to fix:**
```sql
-- Example: Load Monday's menu
INSERT INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
VALUES
  ('JIGG_DINNER', '2025-10-13', 250, 'lunch'),
  ('STEAK_NIGHT', '2025-10-13', 250, 'dinner');  -- If it's Saturday
```

**Result:** 7-day and 30-day rolling forecasts activated

---

## 💡 Tips for Maximum Accuracy

### **Teaching the AI**
The AI learns from natural language:
```javascript
"coffee 1.3 cups/person"        → Updates beverage profile
"eggs 1.5 per person"           → Updates breakfast profile
"500 sandwiches/day"            → Updates recipe quantity
"set population to 275"         → Updates daily headcount
"bacon 2.5 strips per person"   → Increases breakfast serving
```

### **Recurring Events**
Already configured:
- ✅ Saturday = Steak Night (10 oz AAA × population)
- ✅ Daily sandwiches (500 baseline)
- ✅ Daily breakfast service
- ✅ Daily Indian meals (20 servings)

Add your own:
```sql
-- Example: Friday Fish Fry
INSERT INTO recipes (recipe_code, display_name, category, serving_size)
VALUES ('FISH_FRY_FRIDAY', 'Friday Fish Fry', 'dinner', 250);

-- Schedule it
INSERT INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
SELECT 'FISH_FRY_FRIDAY', DATE('now'), 250, 'dinner'
WHERE CAST(strftime('%w', DATE('now')) AS INTEGER) = 5;  -- 5 = Friday
```

### **Waste Learning**
The system automatically adds waste percentages:
- Breakfast items: 5%
- Beverages: 3%
- Recipe-based: Configurable per ingredient

To adjust:
```sql
UPDATE recipe_ingredients
SET waste_pct = 8.0
WHERE item_code = 'LETTUCE-ICEBERG';  -- More waste on produce
```

---

## 📞 API Endpoints (All Owner-Only, Localhost)

### **GET Requests** (View Data)
```bash
# Today's full forecast
curl http://localhost:8083/api/owner/forecast/daily

# Breakfast demand
curl http://localhost:8083/api/owner/forecast/breakfast

# Beverage demand
curl http://localhost:8083/api/owner/forecast/beverage

# Stock-out risks
curl http://localhost:8083/api/owner/forecast/stockout

# Current population
curl http://localhost:8083/api/owner/forecast/population

# View all feedback comments
curl http://localhost:8083/api/owner/forecast/comments
```

### **POST Requests** (Modify Data)
```bash
# Update population
curl -X POST http://localhost:8083/api/owner/forecast/population \
  -H "Content-Type: application/json" \
  -d '{"total_count": 275, "indian_count": 25}'

# Submit learning comment
curl -X POST http://localhost:8083/api/owner/forecast/comment \
  -H "Content-Type: application/json" \
  -d '{"comment": "coffee 1.5 cups/person", "source": "owner_feedback"}'

# Apply all pending learning
curl -X POST http://localhost:8083/api/owner/forecast/train

# Update breakfast profile directly
curl -X POST http://localhost:8083/api/owner/forecast/breakfast/profile \
  -H "Content-Type: application/json" \
  -d '{"bread_slices_per_person": 3.0, "eggs_per_person": 1.5}'
```

---

## 🔍 Verify Everything Works

### **Test 1: Check Forecast**
```bash
node -e "
const MenuPredictor = require('./src/ai/forecast/MenuPredictor');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/inventory_enterprise.db');
const predictor = new MenuPredictor(db);
predictor.getPredictedUsageForToday().then(r => {
  console.log('✅ Forecast active:', r.items.length, 'items');
  console.log('📊 Stock-out risks:', r.summary.stock_out_items);
  console.log('🎯 Confidence:', (r.summary.avg_confidence * 100).toFixed(1) + '%');
  db.close();
});
"
```

**Expected:**
```
✅ Forecast active: 14 items
📊 Stock-out risks: 14
🎯 Confidence: 90.7%
```

### **Test 2: Check Population**
```bash
node -e "
const MenuPredictor = require('./src/ai/forecast/MenuPredictor');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/inventory_enterprise.db');
const predictor = new MenuPredictor(db);
predictor.getPopulationStats().then(r => {
  console.log('👥 Total:', r.total_count);
  console.log('🍛 Indian:', r.indian_count);
  console.log('☕ Coffee rate:', r.beverages_profile.coffee_cups_per_person, 'cups/person');
  db.close();
});
"
```

**Expected:**
```
👥 Total: 250
🍛 Indian: 20
☕ Coffee rate: 1.3 cups/person
```

---

## 🎓 Understanding the Output

### **Forecast JSON Structure**
```json
{
  "success": true,
  "date": "2025-10-10",
  "items": [
    {
      "item_code": "COFFEE-GROUNDS",
      "item_name": "Coffee Grounds (ground)",
      "total_predicted_qty": 3347.5,
      "unit": "g",
      "current_stock": 0,
      "par_level": 20,
      "stock_out_risk": 1,
      "shortage_qty": 3347.5,
      "coverage_days": 0,
      "risk_level": "CRITICAL"
    }
  ],
  "summary": {
    "total_items": 14,
    "stock_out_items": 14,
    "avg_confidence": 0.907,
    "sources": {
      "menu": 0,
      "breakfast": 8,
      "beverage": 6
    }
  }
}
```

### **Risk Levels Explained**
- **CRITICAL** - Out of stock (coverage = 0 days)
- **HIGH** - Less than 50% of predicted demand
- **MEDIUM** - 50-99% of predicted demand
- **LOW** - 100%+ coverage (adequate stock)

### **Confidence Scores**
- **95%** - Recipe-based (exact ingredient quantities)
- **90%** - Breakfast (population-based, proven ratios)
- **88%** - Beverages (population-based, slight variance)

---

## 🏆 Success Metrics

After you complete the 3 priority steps above, you'll see:

**Before:**
```
📊 Forecast active: 14 items
   Menu recipes: 0 items
   Breakfast: 8 items
   Beverages: 6 items
```

**After:**
```
📊 Forecast active: 50+ items
   Menu recipes: 30+ items
   Breakfast: 8 items
   Beverages: 6 items
   Sandwich program: 5+ items
```

---

## 🆘 Troubleshooting

### Problem: "No items in forecast"
**Cause:** Recipes have no ingredients linked
**Fix:** Add entries to `recipe_ingredients` table

### Problem: "All stock levels are 0"
**Cause:** No inventory snapshots created yet
**Fix:** Take first physical count OR system will use par_levels as estimates

### Problem: "Beverage forecast not showing"
**Cause:** No population record for today
**Fix:** Run `bash scripts/verify_v4_addons.sh --set-population 250`

### Problem: "CLI command hangs"
**Cause:** sqlite3 not properly installed
**Fix:** `npm install sqlite3 --save` and restart

---

## 🎯 Your Goal

Transform this system into the **#1 adaptive inventory forecasting platform** by:
1. ✅ **Linking all recipes** → Unlock menu-based forecasts
2. ✅ **Taking inventory counts** → Real stock vs predicted
3. ✅ **Training the AI** → Submit feedback comments daily
4. ✅ **Monitoring accuracy** → Compare predictions vs reality
5. ✅ **Continuous improvement** → AI learns and adapts

**Status:** 🟢 **SYSTEM READY** - Start using today!

---

> *"From data to decisions, from predictions to perfection."*
> **- NeuroPilot AI Predictive Chef, v6.7**
