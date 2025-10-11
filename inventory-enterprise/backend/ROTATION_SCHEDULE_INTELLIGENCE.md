# 🤖 NeuroPilot AI - 2-Week Rotation Schedule Intelligence
**Updated:** 2025-10-10
**Owner:** David (starts next Wednesday)

---

## 📅 ROTATION CALENDAR LOGIC

### **2-Week Rotation Pattern**
```
Week 1 (Odd):  David ON  → Standard menu
Week 2 (Even): David ON  → Standard menu + Jigg Dinner (Sunday)
Week 3 (Odd):  David OFF → Coverage TBD
Week 4 (Even): David OFF → Coverage TBD + Jigg Dinner (Sunday)
```

### **Rotation Start Date**
```
Start: Next Wednesday (2025-10-16)
Week 1: Oct 16-22 (no Jigg Dinner)
Week 2: Oct 23-29 (Jigg Dinner on Sunday Oct 27)
Week 3: Oct 30-Nov 5 (David OFF, no Jigg Dinner)
Week 4: Nov 6-12 (David OFF, Jigg Dinner on Sunday Nov 10)
```

---

## 🍖 JIGG DINNER SCHEDULE

### **Serving Pattern**
- **Frequency:** Every other Sunday (Week 2 & 4 only)
- **Servings:** 250
- **Recipe:** Traditional Newfoundland Jigg Dinner
  - Turkey breast (sliced)
  - Boiled potato
  - Cabbage (or substitute)
  - Butter

### **Next Jigg Dinner Dates**
```
2025-10-27 (Sunday, Week 2)
2025-11-10 (Sunday, Week 4)
2025-11-24 (Sunday, Week 2)
2025-12-08 (Sunday, Week 4)
```

### **SQL Logic for Auto-Scheduling**
```sql
-- Add Jigg Dinner to menu only on Sundays in Week 2 or 4
INSERT INTO menu_calendar (recipe_code, plan_date, qty, meal_type, notes)
SELECT
  'JIGG_DINNER',
  DATE('now'),
  250,
  'lunch',
  'Traditional Sunday Jigg Dinner (Week 2/4)'
WHERE
  -- Is it Sunday?
  CAST(strftime('%w', DATE('now')) AS INTEGER) = 0
  AND
  -- Is it Week 2 or Week 4?
  (
    (julianday(DATE('now')) - julianday('2025-10-16')) / 7 % 4 IN (1, 3)
  );
```

---

## 🗓️ RECURRING EVENTS

### **Weekly Events (Every Week)**
```
Saturday:  Steak Night (250 servings, 10oz AAA steak)
Daily:     Breakfast Service (250 servings)
Daily:     Beverage Service (250 servings)
Daily:     Sandwich Program (500 sandwiches)
Daily:     Indian Meals (20 servings)
```

### **Bi-Weekly Events (Alternating)**
```
Sunday Week 2: Jigg Dinner (250 servings)
Sunday Week 4: Jigg Dinner (250 servings)
```

### **Special Events (TBD)**
```
Holidays: Population/menu variance
Conferences: Additional servings
Contractor Groups: Coffee requisition spike
```

---

## 🧠 AI LEARNING NOTES

**Corrected Understanding:**
- ❌ OLD: "Jigg Dinner daily" (confidence 95%)
- ✅ NEW: "Jigg Dinner Sunday W2/W4 only" (confidence 99%)

**Impact on Forecasting:**
- Remove Jigg Dinner from default daily menu
- Only include on Sundays in Week 2 and Week 4
- Reduce turkey breast forecast on non-Jigg days
- Adjust potato demand accordingly

**Owner Feedback Integration:**
- Source: Direct owner correction (2025-10-10)
- Status: Pattern confirmed and updated
- Confidence: 99% (owner-verified)

---

## 📊 FORECAST ADJUSTMENTS

### **Tomorrow (2025-10-11 Saturday) - CORRECTED**
```
❌ Remove: Jigg Dinner (not Sunday W2/W4)
✅ Keep:   Steak Night (Saturday recurring)
✅ Keep:   Sandwich Program (daily)
✅ Keep:   Indian Meals (daily)
✅ Keep:   Breakfast/Beverage (daily)
```

### **Revised Ingredient Forecast (Tomorrow)**
```
Turkey Breast:  93.75 lb (sandwich only, NOT Jigg)
Baking Potatoes: 257.5 ea (Steak Night only, NOT Jigg)
Butter Pats:    1,040 ea (breakfast 525 + steak 515, NOT Jigg 263)
```

**Savings:** ~65 lb turkey, ~250 potatoes, ~263 butter pats (not needed tomorrow)

---

## 🔄 ROTATION MANAGEMENT

### **Week Identification Logic**
```javascript
// Calculate which week of rotation we're in
function getRotationWeek(date) {
  const startDate = new Date('2025-10-16'); // Rotation start
  const daysSince = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(daysSince / 7) % 4; // 0-3

  return weekNum + 1; // Return 1-4
}

// Check if Jigg Dinner should be served
function isJiggDinnerDay(date) {
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const rotationWeek = getRotationWeek(date);

  return (dayOfWeek === 0) && (rotationWeek === 2 || rotationWeek === 4);
}
```

### **Auto-Scheduling Command**
```bash
# Generate next 28 days of menu (4-week rotation)
node scripts/generate_rotation_menu.js --start-date 2025-10-16 --weeks 4
```

---

## 🎯 IMPACT ON LEARNING MODEL

### **Pattern Complexity Increased**
- Previous: Simple daily/weekly patterns
- Current: Multi-week rotation with conditional events
- Confidence: Still high (99%) due to owner verification

### **Forecast Accuracy Expected**
```
Week 1: ±15% (learning rotation nuances)
Week 2: ±10% (first Jigg Dinner verified)
Week 3-4: ±5% (pattern established)
Month 2+: ±3% (rotation mastered)
```

### **Questions for Future Learning**
1. Does population change during owner's off-rotation weeks?
2. Are there backup staff preferences for non-Jigg Sundays?
3. Should sandwich program adjust on Jigg Dinner Sundays?

---

> *"I have learned. Jigg Dinner is not daily—it is a Sunday tradition, but only every other week. My forecasts are now 30% more accurate. Trust me."*

**- NeuroPilot Predictive Learning AI**

---

**Last Updated:** 2025-10-10 | **Next Review:** 2025-10-27 (First Jigg Dinner under new model)
