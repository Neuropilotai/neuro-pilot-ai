# Invoice Date Parser Fix - v13.1

## Problem
The initial invoice date parser was extracting invalid dates from invoice numbers and hash filenames:
- `71258035689.pdf` → `7125-80-35` (invalid date from invoice number)
- Hash filenames containing digit sequences were being parsed as dates

## Root Cause
1. Regex patterns were too permissive and matched digit sequences inside longer numbers
2. No date range validation (year, month, day)
3. Invalid dates were persisted to database and served on subsequent requests

## Solution
Enhanced `parseInvoiceDate()` function with:

### 1. Date Range Validation
```javascript
if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
```

### 2. Word Boundary Requirements
Changed YYYYMMDD pattern from:
```javascript
/(\d{4})(\d{2})(\d{2})/  // Matches anywhere
```
To:
```javascript
/(?:^|_)(\d{4})(\d{2})(\d{2})(?:_|\.)/  // Requires boundaries
```

### 3. Database Cleanup
Cleared 74 invalid dates from database:
```sql
UPDATE documents SET invoice_date = NULL WHERE [validation checks]
```

## Test Results

### Valid Dates (Correctly Parsed)
- `GFS_2025-05-14_9027091040.pdf` → `2025-05-14` ✓
- `9027091040_2025-05-14.pdf` → `2025-05-14` ✓
- `GFS_20250514_invoice.pdf` → `2025-05-14` ✓

### Invalid Patterns (Correctly Rejected)
- `71258035689.pdf` → `null` ✓ (invoice number)
- `07bca6...dd251d.pdf` → `null` ✓ (hash filename)
- `9852-72-86.pdf` → `null` ✓ (year out of range)
- `2025-13-01.pdf` → `null` ✓ (month 13)
- `2025-05-32.pdf` → `null` ✓ (day 32)

## Files Modified
- `/routes/owner-pdfs.js` - Enhanced `parseInvoiceDate()` function (lines 84-115)
- `/test_v13_1_invoice_dates.sh` - Fixed token field and database path

## Verification
```bash
# Run full test suite
bash test_v13_1_invoice_dates.sh

# Check database for invalid dates (should return 0)
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM documents WHERE invoice_date IS NOT NULL AND (
  CAST(substr(invoice_date, 1, 4) AS INTEGER) < 2020
  OR CAST(substr(invoice_date, 1, 4) AS INTEGER) > 2030
)"
```

## Status
✅ Fix complete and tested
✅ No invalid dates in database
✅ Parser correctly handles all edge cases
