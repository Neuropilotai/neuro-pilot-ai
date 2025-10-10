# 📋 Enhanced Physical Count System Guide

## Overview

The physical count system now includes comprehensive tracking fields for accurate inventory snapshots:

1. **Count Date** - When the physical count was performed
2. **Order Cutoff Date** - Only include orders/cases received on or before this date
3. **People On Site** - Number of people present during the count
4. **Notes** - Optional notes about the count
5. **Case Selection** - Select which cases are actually in stock

---

## 🎯 Why These Fields Matter

### Count Date
Records **when** the physical count was performed. This creates an audit trail.

### Order Cutoff Date
**Critical for accurate snapshots**. Only cases from orders received **on or before** this date are considered in the count.

**Example:**
- Count Date: October 7, 2024
- Cutoff Date: October 5, 2024
- **Result**: Only cases from orders received Oct 5 or earlier are counted
- Cases from Oct 6-7 are **excluded** from this snapshot

### People On Site
Records staffing level during count. Useful for:
- Audit compliance
- Understanding count accuracy (more people = faster/more accurate)
- Tracking labor hours

---

## 📝 How to Use

### Method 1: Web Interface (Easiest)

1. **Open Case Tracker**
   ```
   http://localhost:8083/case-tracker.html
   ```

2. **Select Item**
   - Search for item code or description
   - Click on item card

3. **Enter Count Information**
   - **Count Date**: When you're doing the count (e.g., 2024-10-07)
   - **Order Cutoff Date**: Last order date to include (e.g., 2024-10-05)
   - **People On Site**: Number of staff (e.g., 5)
   - **Notes**: "End of week inventory" or "Monthly audit"

4. **Select Cases**
   - Check boxes for cases you have in stock
   - Use last 4 digits for easy matching (e.g., ...9095)

5. **Submit**
   - Click "Update Inventory from Count"
   - Review confirmation
   - Confirm

### Method 2: API (For Automation)

```bash
curl -X PUT http://localhost:8083/api/case-inventory/1169211/physical-count \
  -H "Content-Type: application/json" \
  -d '{
    "caseNumbers": ["9095", "9096", "9097"],
    "countDate": "2024-10-07",
    "cutoffDate": "2024-10-05",
    "peopleOnSite": 5,
    "notes": "Weekly inventory - Friday close"
  }'
```

**Response:**
```json
{
  "success": true,
  "itemCode": "1169211",
  "countDate": "2024-10-07",
  "cutoffDate": "2024-10-05",
  "peopleOnSite": 5,
  "casesInCount": 3,
  "eligibleCases": 10,
  "excludedCases": 2,
  "newTotalCases": 3,
  "newTotalWeight": "92.81",
  "summary": {
    "countPerformed": "2024-10-07",
    "ordersCutoff": "2024-10-05",
    "peopleOnSite": 5,
    "casesVerified": 3,
    "casesMarkedUsed": 7,
    "casesExcluded": 2
  }
}
```

---

## 🎓 Example Scenarios

### Scenario 1: End of Month Inventory

**Situation:**
- Today is October 31, 2024
- You want to count inventory as of October 30 (Friday close)
- 3 people on staff

**Setup:**
```
Count Date: 2024-10-31
Cutoff Date: 2024-10-30
People On Site: 3
Notes: End of month inventory - October 2024
```

**Cases with dates:**
- Case ...9095 (received Oct 28) ✅ **INCLUDED**
- Case ...9096 (received Oct 29) ✅ **INCLUDED**
- Case ...9097 (received Oct 30) ✅ **INCLUDED**
- Case ...9098 (received Oct 31) ❌ **EXCLUDED** (after cutoff)

### Scenario 2: Weekly Count

**Situation:**
- Today is Monday, October 7
- Counting inventory from previous week (ended Friday, Oct 4)
- 5 people counting

**Setup:**
```
Count Date: 2024-10-07
Cutoff Date: 2024-10-04
People On Site: 5
Notes: Week 40 inventory count
```

**What happens:**
- Only cases from orders received on or before Oct 4 are counted
- Orders from Oct 5-7 (weekend/Monday) are excluded
- Clean snapshot of Friday close inventory

### Scenario 3: Audit Count

**Situation:**
- Auditor visit on October 15
- Need to verify inventory as of October 10
- Full staff present (8 people)

**Setup:**
```
Count Date: 2024-10-15
Cutoff Date: 2024-10-10
People On Site: 8
Notes: Annual audit - verified by external auditor Smith & Co.
```

---

## 📊 What the System Does

### 1. Filters Cases by Cutoff Date
Only cases from orders **on or before** the cutoff date are eligible for counting.

### 2. Validates Case Selection
If you try to count a case that's after the cutoff date, the system rejects it with an error:
```json
{
  "success": false,
  "error": "Some cases are after cutoff date",
  "invalidCases": [
    {
      "caseNumber": "410149599098",
      "invoiceDate": "2024-10-06",
      "reason": "Invoice date (2024-10-06) is after cutoff (2024-10-05)"
    }
  ]
}
```

### 3. Updates Case Status

**For counted cases:**
- Status: `IN_STOCK`
- Remaining weight: Full weight
- Records: `lastPhysicalCount` with all details

**For uncounted cases (eligible but not found):**
- Status: `USED`
- Remaining weight: 0
- Usage history: Added entry with count details

**For cases after cutoff:**
- Status: **Unchanged**
- Tagged with exclusion record for audit trail

### 4. Creates Count History
Each count is saved in `countHistory` array:
```json
{
  "countDate": "2024-10-07",
  "cutoffDate": "2024-10-05",
  "peopleOnSite": 5,
  "casesInCount": 3,
  "totalCases": 3,
  "totalWeight": 92.81,
  "eligibleCases": 10,
  "excludedCases": 2,
  "notes": "Weekly inventory",
  "performedAt": "2024-10-07T15:30:00.000Z"
}
```

---

## 🔍 Audit Trail

Every count creates a complete audit trail:

### Per Case:
```json
{
  "caseNumber": "410149599095",
  "lastPhysicalCount": {
    "countDate": "2024-10-07",
    "cutoffDate": "2024-10-05",
    "peopleOnSite": 5,
    "verified": true,
    "notes": "Weekly count"
  }
}
```

### Per Item:
```json
{
  "countHistory": [
    {
      "countDate": "2024-10-07",
      "cutoffDate": "2024-10-05",
      "peopleOnSite": 5,
      "casesInCount": 3,
      "totalCases": 3,
      "totalWeight": 92.81,
      "notes": "Weekly inventory",
      "performedAt": "2024-10-07T15:30:00.000Z"
    }
  ]
}
```

---

## 💡 Best Practices

### 1. Count Date vs Cutoff Date
- **Count Date**: When you physically counted (can be today)
- **Cutoff Date**: Last order date to include (usually yesterday or end of week)

### 2. Setting Cutoff Date
- **Daily counts**: Cutoff = yesterday
- **Weekly counts**: Cutoff = last day of previous week
- **Monthly counts**: Cutoff = last day of previous month
- **Audit counts**: Cutoff = date auditor specifies

### 3. People On Site
- Record actual number of people counting
- Helps explain count time/accuracy
- Required for some audit standards

### 4. Notes Field
Use for:
- "Weekly inventory - Week 40"
- "Month end - October 2024"
- "Annual audit - verified by Smith & Co."
- "Spot check after delivery issue"
- "Training count - new employee orientation"

---

## 🚨 Common Mistakes

### ❌ Wrong: Cutoff Date = Count Date
```json
{
  "countDate": "2024-10-07",
  "cutoffDate": "2024-10-07"  // ❌ Includes today's orders
}
```
**Problem**: Includes orders received during counting day

### ✅ Correct: Cutoff Date = Day Before
```json
{
  "countDate": "2024-10-07",
  "cutoffDate": "2024-10-06"  // ✅ Clean snapshot
}
```
**Result**: Only includes orders received before counting started

### ❌ Wrong: Counting Cases After Cutoff
If cutoff is Oct 5, you can't count cases from Oct 6-7.
System will **reject** the count.

---

## 📈 Viewing Count History

To see all counts for an item:
```bash
curl http://localhost:8083/api/case-inventory/1169211
```

The response includes:
```json
{
  "item": {
    "itemCode": "1169211",
    "countHistory": [
      {
        "countDate": "2024-10-07",
        "cutoffDate": "2024-10-05",
        "peopleOnSite": 5,
        "casesInCount": 3,
        "notes": "Weekly inventory"
      }
    ]
  }
}
```

---

## 🎯 Summary

The enhanced physical count system provides:

✅ **Accurate snapshots** - Cutoff date ensures clean inventory view
✅ **Audit compliance** - Complete trail with dates, staff count, notes
✅ **FIFO integrity** - Only counts cases from appropriate date range
✅ **Historical tracking** - Every count is recorded
✅ **Validation** - Prevents counting cases after cutoff
✅ **Flexibility** - Optional notes and people count fields

**Ready to use via:**
- Web UI: http://localhost:8083/case-tracker.html
- API: PUT `/api/case-inventory/:itemCode/physical-count`
