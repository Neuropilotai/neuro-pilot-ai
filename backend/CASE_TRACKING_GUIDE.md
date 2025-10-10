# 📦 Case-Level Tracking System - Complete Guide

## ✅ System Overview

Your inventory system now includes **comprehensive case-level tracking** for meat and perishable products, enabling:

- **FIFO (First In, First Out) rotation monitoring**
- **Individual case tracking with weights**
- **Spot-checking with last 4 digits of case numbers**
- **Physical inventory counting**
- **Age-based rotation alerts**

---

## 🎯 What Was Implemented

### 1. **Case Extraction System** ✅
- **Script**: `comprehensive_case_tracker.js`
- **Extracted**: **2,724 cases** from 365 PDFs
- **Items Tracked**: **65 items** with case-level detail
- **Data File**: `data/case_inventory.json` (940KB)

### 2. **API Endpoints** ✅
All endpoints mounted at `/api/case-inventory`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/case-inventory` | GET | List all items with case tracking |
| `/api/case-inventory/:itemCode` | GET | Get detailed cases for an item (supports `?limit=10`) |
| `/api/case-inventory/:itemCode/use` | POST | Use cases from inventory (FIFO) |
| `/api/case-inventory/:itemCode/rotation-report` | GET | Get aging/rotation report |
| `/api/case-inventory/:itemCode/physical-count` | PUT | Update inventory from physical count |

### 3. **Web Interface** ✅
- **URL**: http://localhost:8083/case-tracker.html
- **Features**:
  - Visual card-based item browser
  - Search by item code or description
  - Case detail modal with FIFO ordering
  - **Configurable display**: Show last 10, 20, 50, or all cases
  - **Physical count tool**: Select which cases you have
  - Color-coded rotation status (FRESH/AGING/AGED)

---

## 📋 Usage Examples

### Example 1: View Beef Stripln Cases
According to your example (Item 1169211):

```bash
curl "http://localhost:8083/api/case-inventory/1169211?limit=10"
```

**Response shows**:
- Last 10 cases only (if you have 10 cases)
- Case numbers like: `...9095`, `...9096`, `...9097`, etc. (last 4 digits)
- Individual weights: 31.09, 30.69, 31.03, 30.35, 32.23
- FIFO order (oldest first)
- Age in days
- Rotation status

### Example 2: Physical Count Update

When doing inventory and you find cases `9095, 9096, 9097` on hand:

```bash
curl -X PUT http://localhost:8083/api/case-inventory/1169211/physical-count \
  -H "Content-Type: application/json" \
  -d '{"caseNumbers": ["9095", "9096", "9097"]}'
```

This will:
- Mark only these 3 cases as IN_STOCK
- Mark all other cases as USED
- Update total weight to match the 3 cases
- Record the adjustment in history

### Example 3: FIFO Usage

When using 60 lbs of beef for production:

```bash
curl -X POST http://localhost:8083/api/case-inventory/1169211/use \
  -H "Content-Type: application/json" \
  -d '{"quantity": 60, "reason": "Lunch prep - Wednesday"}'
```

**System will**:
- Use oldest cases first (FIFO)
- Deduct from case `9095` (31.09 lbs) - fully used
- Deduct from case `9096` (28.91 lbs out of 30.69) - partial
- Return exactly which cases were used
- Update remaining weights

---

## 🖥️ Using the Web Interface

### Step 1: Access the Interface
Open browser: **http://localhost:8083/case-tracker.html**

### Step 2: Find Your Item
- Search by item code (e.g., "1169211") or description (e.g., "BEEF STRIPLN")
- Click on the item card

### Step 3: View Cases
- **Modal opens** showing all cases in FIFO order
- Use dropdown: "Show last: **10 cases**" (default)
- See case numbers as: `...9095`, `...9096`, etc.
- View weights, age, and rotation status

### Step 4: Physical Count (Optional)
1. Check/uncheck boxes for cases you have on hand
2. Click "**💾 Update Inventory from Count**"
3. Confirm the update
4. System adjusts inventory to match your count

---

## 🔄 FIFO Rotation Monitoring

### Case Age Categories:

| Status | Age | Color | Action |
|--------|-----|-------|--------|
| **FRESH** | 0-14 days | 🟢 Green | Normal use |
| **AGING** | 15-30 days | 🟡 Yellow | Use soon |
| **AGED** | 30+ days | 🔴 Red | Use immediately |

### Rotation Report:

```bash
curl http://localhost:8083/api/case-inventory/1169211/rotation-report
```

Returns:
- Cases grouped by age (fresh/aging/aged)
- Oldest case age
- Rotation alerts
- Recommended actions

---

## 📊 Data Structure Example

For item **1169211 - BEEF STRIPLN** with 5 cases:

```json
{
  "itemCode": "1169211",
  "description": "BEEF STRIPLN 0X1 1/4IN 6KG/UP CAB FRSH",
  "unit": "MT",
  "totalCases": 5,
  "totalWeight": 155.39,
  "allCases": [
    {
      "caseNumber": "410149599095",
      "caseNumberShort": "9095",
      "weight": 31.09,
      "remainingWeight": 31.09,
      "status": "IN_STOCK",
      "invoiceNumber": "9018357843",
      "invoiceDate": "2024-09-13",
      "ageInDays": 24,
      "rotationStatus": "AGING"
    },
    // ... 4 more cases
  ]
}
```

---

## 🚀 Quick Start Workflow

### Daily Operations:

1. **Morning**: Check rotation report for AGING/AGED items
   ```bash
   curl http://localhost:8083/api/case-inventory | jq '.items | sort_by(.oldestCaseDate)'
   ```

2. **Production**: Use cases via API or record manually
   ```bash
   curl -X POST http://localhost:8083/api/case-inventory/:itemCode/use \
     -H "Content-Type: application/json" \
     -d '{"quantity": 50, "reason": "Production"}'
   ```

3. **Weekly**: Physical count using web interface
   - Go to http://localhost:8083/case-tracker.html
   - Select item
   - Check cases on hand
   - Click "Update Inventory from Count"

### Inventory Count:

1. **Print case list** (last 4 digits for easy spotting):
   - Visit case-tracker.html
   - Click on item
   - Select "Show last: 10 cases"
   - Write down: `...9095`, `...9096`, etc.

2. **Walk cooler/freezer**:
   - Check each case number against list
   - Verify weights if needed

3. **Update system**:
   - Check boxes for cases found
   - Uncheck boxes for missing cases
   - Submit count

---

## 📁 Files Created/Modified

### New Files:
1. `comprehensive_case_tracker.js` - Case extraction engine
2. `routes/case-inventory-api.js` - API endpoints
3. `public/case-tracker.html` - Web interface
4. `data/case_inventory.json` - Case data (940KB, 32,714 lines)

### Modified Files:
1. `server.js` - Added case inventory routes

---

## 🎯 Top 10 Items by Case Count

1. **13401885** - BOLOGNA WAX FRSH: **278 cases**, 2,398.64 MT
2. **67635054** - HAM TOUPIE SMKD BNLS WHL FRSH: **240 cases**, 3,172.28 MT
3. **75364053** - BEEF RST CKD SLCD DELI: **226 cases**, 6,957.16 MT
4. **13401884** - BOLOGNA WAX FRSH: **180 cases**, 1,553.32 MT
5. **67635053** - HAM TOUPIE SMKD BNLS WHL: **170 cases**, 2,273.26 MT
6. **13401883** - BOLOGNA WAX FRSH: **120 cases**, 1,040.96 MT
7. **75364054** - BEEF RST CKD SLCD DELI: **102 cases**, 3,259.54 MT
8. **13316353** - BEEF PASTRAMI EYE OF RND: **90 cases**, 535.74 MT
9. **11240152** - TOMATO ITAL: **88 cases**, 514.72 PR
10. **13316352** - BEEF PASTRAMI EYE OF RND: **78 cases**, 527.86 MT

---

## 🔧 Maintenance

### Re-extract Cases from PDFs:
If new PDFs are added:
```bash
node comprehensive_case_tracker.js
```

### Backup Case Data:
```bash
cp data/case_inventory.json data/case_inventory_backup_$(date +%Y%m%d).json
```

---

## ✅ System Status

- ✅ **Server Running**: http://localhost:8083
- ✅ **Case Tracker UI**: http://localhost:8083/case-tracker.html
- ✅ **API Endpoints**: All functional
- ✅ **Data Extracted**: 2,724 cases from 65 items
- ✅ **FIFO Ready**: Full rotation monitoring
- ✅ **Physical Count**: Ready for use

---

## 🎉 Key Benefits

1. **Spot Checking Made Easy**: Only see last 4 digits (`...9095` instead of `410149599095`)
2. **FIFO Compliance**: Oldest cases automatically used first
3. **Flexible Display**: Choose to show last 10, 20, 50, or all cases
4. **Physical Count Integration**: Select actual cases on hand
5. **Rotation Monitoring**: Age-based alerts (FRESH/AGING/AGED)
6. **Weight Tracking**: Individual case weights for variable meat products
7. **Usage History**: Track when and why cases were used

---

## 📞 Support

For issues or questions:
- Check server logs: `pm2 logs` or `tail -f server.log`
- Verify API: `curl http://localhost:8083/health`
- Test endpoint: `curl http://localhost:8083/api/case-inventory`

**System is ready for production use!** 🚀
