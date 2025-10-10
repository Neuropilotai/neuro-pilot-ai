# 📋 Physical Count - Quick Reference

## ✅ What You Need to Enter

### 1. **Count Date** *(Required)*
When you performed the physical count
- Example: `2024-10-07` (today)

### 2. **Order Cutoff Date** *(Required)*
Last order date to include in count
- Example: `2024-10-06` (yesterday)
- **Rule**: Set to day before count date for clean snapshot

### 3. **People On Site** *(Optional)*
Number of staff during count
- Example: `5`

### 4. **Notes** *(Optional)*
Any notes about the count
- Example: "Weekly inventory - Week 40"

### 5. **Case Selection** *(Required)*
Check boxes for cases you have
- Uses last 4 digits: `...9095`, `...9096`, etc.

---

## 🎯 Quick Setup Examples

### Daily Count (Monday)
```
Count Date:    2024-10-07 (today)
Cutoff Date:   2024-10-06 (yesterday)
People:        3
Notes:         "Monday morning count"
```

### Weekly Count (Monday counting last week)
```
Count Date:    2024-10-07 (today)
Cutoff Date:   2024-10-04 (last Friday)
People:        5
Notes:         "Week 40 inventory"
```

### Month-End Count
```
Count Date:    2024-10-31 (today)
Cutoff Date:   2024-10-30 (yesterday)
People:        8
Notes:         "October 2024 month-end"
```

---

## 📱 Using the Web Interface

**URL:** http://localhost:8083/case-tracker.html

### Steps:
1. **Search** for item (code or name)
2. **Click** item card
3. **Fill in dates:**
   - Count Date (when counting)
   - Cutoff Date (last order to include)
   - People On Site
   - Notes
4. **Check boxes** for cases you have
5. **Click** "Update Inventory from Count"
6. **Confirm** and done!

---

## 🔧 Using the API

### Example Request:
```bash
curl -X PUT http://localhost:8083/api/case-inventory/1169211/physical-count \
  -H "Content-Type: application/json" \
  -d '{
    "caseNumbers": ["9095", "9096", "9097"],
    "countDate": "2024-10-07",
    "cutoffDate": "2024-10-06",
    "peopleOnSite": 5,
    "notes": "Weekly count"
  }'
```

### Success Response:
```json
{
  "success": true,
  "countDate": "2024-10-07",
  "cutoffDate": "2024-10-06",
  "peopleOnSite": 5,
  "casesInCount": 3,
  "eligibleCases": 10,
  "excludedCases": 2,
  "newTotalCases": 3,
  "newTotalWeight": "92.81",
  "summary": {
    "countPerformed": "2024-10-07",
    "ordersCutoff": "2024-10-06",
    "peopleOnSite": 5,
    "casesVerified": 3,
    "casesMarkedUsed": 7,
    "casesExcluded": 2
  }
}
```

---

## ⚠️ Important Rules

### Cutoff Date Logic
- **Eligible**: Cases from orders ≤ cutoff date
- **Excluded**: Cases from orders > cutoff date
- **Error**: System rejects if you try to count excluded cases

### Example:
```
Cutoff Date: 2024-10-05

Case ...9095 (order 2024-10-03) ✅ Can count
Case ...9096 (order 2024-10-05) ✅ Can count
Case ...9097 (order 2024-10-06) ❌ Cannot count (excluded)
```

---

## 💡 Pro Tips

1. **Always set cutoff before count date**
   - Count Date: Oct 7
   - Cutoff Date: Oct 6 ✅

2. **For weekly counts**: Cutoff = last day of previous week

3. **For month-end**: Cutoff = last day of previous month

4. **Record people on site**: Helps with audit compliance

5. **Use notes field**: Future you will thank you!

---

## 📊 What Happens After Count

### For Counted Cases:
- Status: `IN_STOCK`
- Full weight restored
- Tagged with count details

### For Missing Cases (eligible but not counted):
- Status: `USED`
- Weight: 0
- Added to usage history

### For Cases After Cutoff:
- Status: **Unchanged**
- Tagged with exclusion note
- Not affected by count

---

## 🎓 Real Example

**Scenario**: Weekly count on Monday

**Setup:**
```
Count Date:    2025-10-08
Cutoff Date:   2025-10-07
People:        5
Notes:         "Week 41 inventory"
Cases Found:   ...8170, ...8171
```

**Result:**
- 2 cases verified and counted
- 12 cases marked as used (not found)
- 0 cases excluded (all orders were before cutoff)
- New total: 18 cases, 491.40 lbs

**Summary shows:**
```
✅ Physical Count Updated!

Count Date: 2025-10-08
Cutoff Date: 2025-10-07
People On Site: 5

Cases Verified: 2
Cases Marked Used: 12
Cases Excluded (after cutoff): 0

New Total: 18 cases, 491.40 lbs
```

---

## 🚀 Quick Start Commands

### View items with case tracking:
```bash
curl http://localhost:8083/api/case-inventory
```

### View cases for specific item:
```bash
curl "http://localhost:8083/api/case-inventory/1169211?limit=10"
```

### Perform count:
```bash
curl -X PUT http://localhost:8083/api/case-inventory/1169211/physical-count \
  -H "Content-Type: application/json" \
  -d '{"caseNumbers":["9095"],"countDate":"2024-10-07","cutoffDate":"2024-10-06"}'
```

---

## ✅ System Ready!

- **Web UI**: http://localhost:8083/case-tracker.html
- **Server**: Running on port 8083
- **AI Agents**: Active and monitoring
- **Case Tracking**: 2,724 cases from 65 items

**All features operational!** 🎉
