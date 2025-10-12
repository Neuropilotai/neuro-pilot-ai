# ✅ Fiscal Calendar Integration Complete - FY25 & FY26

## Summary

Your NeuroPilot inventory system is now **fully integrated with Sodexo's Fiscal Year Calendar** for FY25 and FY26, based on the official calendar documents provided.

**Date**: 2025-10-11
**Version**: NeuroPilot v13.5 - Fiscal Calendar Integration

---

## What Was Accomplished

### 1. Fiscal Year Structure ✅

**FY25 (September 2024 - August 2025)**
- Start Date: September 1, 2024
- End Date: August 31, 2025
- 12 calendar month periods
- Status: ACTIVE

**FY26 (September 2025 - August 2026)**
- Start Date: September 1, 2025
- End Date: August 31, 2026
- 12 calendar month periods
- Status: ACTIVE

### 2. Fiscal Period Alignment ✅

Your system now uses **calendar months** instead of the previous 4-week period structure:

| Period | FY25 Dates | FY26 Dates |
|--------|-----------|-----------|
| P01 (September) | 2024-09-01 to 2024-09-30 | 2025-09-01 to 2025-09-30 |
| P02 (October) | 2024-10-01 to 2024-10-31 | 2025-10-01 to 2025-10-31 |
| P03 (November) | 2024-11-01 to 2024-11-30 | 2025-11-01 to 2025-11-30 |
| P04 (December) | 2024-12-01 to 2024-12-31 | 2025-12-01 to 2025-12-31 |
| P05 (January) | 2025-01-01 to 2025-01-31 | 2026-01-01 to 2026-01-31 |
| P06 (February) | 2025-02-01 to 2025-02-28 | 2026-02-01 to 2026-02-28 |
| P07 (March) | 2025-03-01 to 2025-03-31 | 2026-03-01 to 2026-03-31 |
| P08 (April) | 2025-04-01 to 2025-04-30 | 2026-04-01 to 2026-04-30 |
| P09 (May) | 2025-05-01 to 2025-05-31 | 2026-05-01 to 2026-05-31 |
| P10 (June) | 2025-06-01 to 2025-06-30 | 2026-06-01 to 2026-06-30 |
| P11 (July) | 2025-07-01 to 2025-07-31 | 2026-07-01 to 2026-07-31 |
| P12 (August) | 2025-08-01 to 2025-08-31 | 2026-08-01 to 2026-08-31 |

### 3. Inventory Count Schedule ✅

**Monthly Count Windows** (24 total - 12 per fiscal year):
- Last few days of each month
- Transmission due by BD+1 (first business day of next month) at 11:45 PM ET

**Full Physical Inventory Counts** (4 total - 2 per fiscal year):
- **FY25 H1 Close**: February 28, 2025
- **FY25 Year-End**: August 31, 2025
- **FY26 H1 Close**: February 28, 2026
- **FY26 Year-End**: August 31, 2026

**Example FY25 Count Windows**:
```
September 2024:  Count window Sep 27-30, transmit by Oct 1
October 2024:    Count window Oct 28-31, transmit by Nov 1
November 2024:   Count window Nov 27-30, transmit by Dec 2
December 2024:   Count window Dec 28-31, transmit by Jan 2
...and so on
```

### 4. Month-End Close Schedule ✅

**5-Day Close Process** (BD+1 through BD+5):

**BD+1** (First Business Day after month end):
- Final transmission due by 11:45 PM ET
- All monthly financial activity must be submitted

**BD+2** (Second Business Day):
- Request/adjustments due by 5:00 PM ET
- Reflected in BD+3 preliminary reports

**BD+3** (Third Business Day):
- Financial close review
- All financial and client report adjustments due by 8:00 PM ET

**BD+4** (Fourth Business Day):
- Analyze financial results
- Critical financial adjustments due by 2:00 PM ET

**BD+5** (Fifth Business Day):
- Final statements/invoices available

**Example - October 2024 Close**:
- Period End: October 31, 2024
- BD+1: November 1, 2024 (11:45 PM deadline)
- BD+2: November 4, 2024 (5:00 PM deadline)
- BD+3: November 5, 2024 (8:00 PM deadline)
- BD+4: November 6, 2024 (2:00 PM deadline)
- BD+5: November 7, 2024 (Final statements available)

### 5. Invoice Assignment ✅

**All 183 existing invoices** have been assigned to their correct fiscal periods:

- **166 invoices** → FY25 (January - September 2025 invoices)
- **17 invoices** → FY26 (September 2025+ invoices)
- **100% assignment rate** (0 unmatched invoices)

**Sample Assignments**:
```
Invoice 9018357846: 2025-01-18 → FY25 Period 5 (January)
Invoice 9018827318: 2025-02-01 → FY25 Period 6 (February)
Invoice 9019067251: 2025-03-01 → FY25 Period 7 (March)
```

---

## Database Structure

### New Tables Created

**1. fiscal_years**
- Stores fiscal year definitions (FY25, FY26)
- Fields: fiscal_year_id, fiscal_year_number, start_date, end_date, status

**2. fiscal_periods** (updated)
- Calendar month periods for each fiscal year
- Fields: fiscal_year, period (1-12), period_start_date, period_end_date, fiscal_year_id

**3. inventory_count_schedule**
- Monthly count windows and full physical count dates
- Fields: count_schedule_id, period_id, fiscal_year_id, count_type, count_window_start, count_window_end, transmission_due_date

**4. fiscal_month_close_schedule**
- BD+1 through BD+5 deadlines for each period
- Fields: close_schedule_id, period_id, fiscal_year_id, bd1_date through bd5_date, status

**5. fiscal_weeks**
- Weekly periods with P/C numbers (for future use)

### Updated Tables

**documents** (invoices):
- Added: fiscal_year_id (e.g., 'FY25')
- Added: fiscal_period_id (e.g., 'FY25-P05')
- All 183 invoices now have fiscal assignments

**inventory_counts**:
- Added: fiscal_year_id
- Added: fiscal_period_id
- Added: count_schedule_id
- Future counts will be linked to fiscal schedule

### Views Created

**v_current_fiscal_period**
- Shows the current active fiscal period based on today's date

**v_upcoming_count_schedule**
- Displays upcoming inventory count windows with status (UPCOMING, IN_WINDOW, PAST)

**v_month_end_close_status**
- Shows current month-end close status for all periods

---

## How to Use

### Check Current Fiscal Period

```sql
SELECT * FROM v_current_fiscal_period;
```

Returns:
- Current fiscal year and period
- Period start and end dates
- Fiscal year status

### View Upcoming Count Schedule

```sql
SELECT
  count_schedule_id,
  period_name,
  count_type,
  count_window_start,
  count_window_end,
  transmission_due_date,
  window_status
FROM v_upcoming_count_schedule
WHERE window_status IN ('UPCOMING', 'IN_WINDOW')
ORDER BY count_window_start
LIMIT 5;
```

### Check Invoice Fiscal Assignments

```sql
SELECT
  invoice_number,
  invoice_date,
  fiscal_year_id,
  fiscal_period_id
FROM documents
WHERE fiscal_period_id IS NOT NULL
ORDER BY invoice_date DESC
LIMIT 20;
```

### View Month-End Close Status

```sql
SELECT
  period_name,
  period_number,
  fiscal_year_number,
  bd1_date,
  bd2_date,
  bd3_date,
  bd4_date,
  bd5_date,
  close_status
FROM v_month_end_close_status
ORDER BY period_number;
```

---

## Scripts Created

### 1. `load_fiscal_calendar_fy25_fy26.js`
**Purpose**: Load FY25 and FY26 fiscal calendar data
**What it does**:
- Clears old 4-week period structure
- Loads 24 calendar month periods (12 FY25 + 12 FY26)
- Creates 24 month-end close schedules with BD+1 through BD+5 dates
- Creates 24 inventory count schedules
- Marks February and August as full physical counts

**Usage**:
```bash
node scripts/load_fiscal_calendar_fy25_fy26.js
```

### 2. `assign_fiscal_periods_to_invoices.js`
**Purpose**: Assign fiscal periods to existing invoices
**What it does**:
- Reads all invoice dates
- Matches each invoice to the correct fiscal period
- Updates fiscal_year_id and fiscal_period_id fields

**Usage**:
```bash
node scripts/assign_fiscal_periods_to_invoices.js
```

---

## Migration Files

**Migration 014**: `migrations/014_fiscal_calendar_schema.sql`
- Creates comprehensive fiscal calendar schema
- Adds fiscal tracking to existing tables
- Creates views for fiscal period queries

---

## Key Benefits

### 1. **Accurate Financial Reporting**
- All invoices now tied to correct fiscal periods
- Easy to generate period-over-period comparisons
- Month-end close process tracked systematically

### 2. **Automated Count Schedule**
- System knows when counts are due
- Can send reminders for upcoming count windows
- Tracks which counts are full physical vs. regular monthly

### 3. **Sodexo Compliance**
- Calendar matches official Sodexo FY25/FY26 calendars exactly
- BD+1 through BD+5 deadlines built into system
- Transmission deadlines (11:45 PM ET) documented

### 4. **Future-Ready**
- Structure supports adding FY27, FY28, etc.
- Dashboard can display fiscal year context
- Reports can filter/group by fiscal period

---

## Next Steps

### Immediate

1. **Perform Your First Physical Count**
   - Use the Owner Console → Counts tab
   - This will correct quantity estimates from invoices
   - Establish accurate baseline for FIFO costing

### Dashboard Integration (Upcoming)

The following features can now be added to your dashboard:

- Current fiscal period display
- Days until next count window
- Month-end close status indicator
- Period-over-period spending comparison
- Fiscal year budget tracking

### Reporting Enhancements (Upcoming)

New reports possible with fiscal calendar:

- Spending by fiscal period
- Invoice volume by period
- Count frequency tracking
- Month-end close compliance
- Year-over-year comparisons

---

## Technical Details

### Period ID Format
- Fiscal Year ID: `FY25`, `FY26`
- Period ID: `FY25-P01`, `FY25-P02`, ... `FY25-P12`
- Count Schedule ID: `FY25-P01-COUNT`
- Close Schedule ID: `FY25-P01-CLOSE`

### Business Day Calculation
The system calculates business days automatically, skipping weekends:
- BD+1 = First business day after period end
- BD+2 through BD+5 = Subsequent business days

### Fiscal Period Assignment Logic
Invoices are assigned to periods based on invoice_date:
```sql
WHERE date(invoice_date) BETWEEN date(period_start_date) AND date(period_end_date)
```

---

## Summary Statistics

| Component | Count | Status |
|-----------|-------|--------|
| **Fiscal Years Loaded** | 2 | ✅ FY25, FY26 |
| **Fiscal Periods** | 24 | ✅ 12 months × 2 years |
| **Count Schedules** | 24 | ✅ Monthly windows configured |
| **Full Physical Counts** | 4 | ✅ Feb & Aug each year |
| **Close Schedules** | 24 | ✅ BD+1 through BD+5 |
| **Invoices Assigned** | 183 | ✅ 100% assignment rate |
| **FY25 Invoices** | 166 | ✅ Jan-Sep 2025 |
| **FY26 Invoices** | 17 | ✅ Sep 2025+ |

---

## Support

### To Add Future Fiscal Years

1. Update `FY27_PERIODS` constant in `load_fiscal_calendar_fy25_fy26.js`
2. Add FY27 data with calendar dates
3. Run the script

### To Re-assign Invoices

If invoice dates change or new invoices are added:
```bash
node scripts/assign_fiscal_periods_to_invoices.js
```

### To View Calendar Data

```sql
-- View all periods
SELECT * FROM fiscal_periods ORDER BY fiscal_year, period;

-- View all count schedules
SELECT * FROM inventory_count_schedule ORDER BY count_window_start;

-- View all close schedules
SELECT * FROM fiscal_month_close_schedule ORDER BY bd1_date;
```

---

## Compliance Notes

**Source Documents**:
- Calendar FY25 Final.docx
- Calendar FY26 Final.docx

**Key Compliance Points**:
- All transmission deadlines: 11:45 PM ET
- Monthly count transmission: Monday after count by 11:45 PM ET
- Full physical counts: February (H1 close) and August (FY close)
- Month-end close: 5-day process (BD+1 through BD+5)
- Adjust/deadline times match Sodexo requirements exactly

---

**🎯 Your NeuroPilot system is now fully aligned with Sodexo's fiscal calendar for FY25 and FY26!**

**📅 All invoices are properly categorized by fiscal period**

**📊 Ready for fiscal reporting and period-based analytics**

Date: 2025-10-11
Version: NeuroPilot v13.5 - Fiscal Calendar Integration Complete
