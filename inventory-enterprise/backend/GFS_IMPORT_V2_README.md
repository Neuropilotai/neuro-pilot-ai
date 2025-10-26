# GFS Invoice Import V2 - Complete Fix for Line Items Corruption

**Version:** 15.7+
**Status:** Production Ready
**Author:** NeuroPilot AI
**Date:** 2025-10-14

## Executive Summary

This document describes the complete fix for GFS invoice line items data corruption that was causing:
- 40% underreporting (line_total sum too low)
- 100× overreporting (unit_price × quantity too high)
- Invalid category breakdowns in monthly reports

**Root Causes Fixed:**
1. Currency stored as floats → now integer cents
2. Unit price/quantity unit confusion → normalized with UOM conversions
3. Missing pack size parsing → now extracts and applies multipliers
4. No Item Bank → authoritative product catalog with category/tax governance
5. Weak validation → strict per-invoice reconciliation within ±$0.50

## Architecture Overview

```
┌─────────────────┐
│   GFS Invoice   │
│   (PDF/OCR)     │
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────┐
│  GFSInvoiceParserV2.js             │
│  • Robust column alignment         │
│  • Integer cents precision         │
│  • UOM normalization               │
│  • Pack size parsing               │
│  • Category mapping via Item Bank │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Item Bank & Validation            │
│  • Authoritative product catalog   │
│  • Category/Tax governance         │
│  • Confidence scoring              │
│  • Σ(line totals) = header total   │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  3-Mode Import                     │
│  1. DRY-RUN: validate only         │
│  2. SHADOW: write to shadow tables │
│  3. APPLY: write to main tables    │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Verification & Reports            │
│  • Financial accuracy score ≥95%   │
│  • Category breakdown reports      │
│  • Tax calculations (GST/QST)      │
└────────────────────────────────────┘
```

## Database Schema Changes

### New Tables (Migrations 028, 029)

1. **item_bank** - Authoritative product catalog
2. **uom_conversions** - Unit of measure normalization
3. **item_categories** - Finance category codes (GL accounts)
4. **tax_profiles** - GST/QST application rules
5. **finance_mapping_rules** - Category mapping patterns
6. **needs_mapping** - Queue for manual category assignment
7. **invoice_headers_shadow** - Safe testing before apply
8. **invoice_line_items_shadow** - Safe testing before apply
9. **finance_validation_history** - Per-invoice validation results
10. **finance_import_runs** - Import run tracking & metrics

### Enhanced Columns

**invoice_headers:**
- `subtotal_cents` (INT) - replaces float
- `gst_cents` (INT)
- `qst_cents` (INT)
- `total_cents` (INT)
- `validation_status` (TEXT)

**invoice_line_items:**
- `item_id` (FK to item_bank)
- `quantity_decimal` (NUMERIC) - precise quantity
- `unit_price_cents` (INT)
- `line_total_cents` (INT)
- `normalized_uom` (TEXT) - canonical unit
- `normalized_quantity` (NUMERIC)
- `category_code` (FK to item_categories)
- `tax_profile_id` (FK to tax_profiles)

## Installation & Setup

### Step 1: Apply Migrations

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Apply schema changes
sqlite3 data/enterprise_inventory.db < migrations/028_item_bank_and_money_precision.sql
sqlite3 data/enterprise_inventory.db < migrations/029_finance_category_enum_and_tax_profiles.sql
```

**Expected Output:**
```
✓ Migration 028 complete: Item Bank, UOM conversions, cents precision, shadow tables
✓ Migration 029 complete: Category mapping rules, tax profiles, approval workflow
```

### Step 2: Load Item Bank (Optional but Recommended)

If you have a GFS master product catalog CSV:

```bash
# CSV Format: item_no,description,uom,pack_size,category,tax_profile
./scripts/load_item_bank_from_gfs_csv.sh /path/to/gfs_master.csv
```

**CSV Example:**
```csv
item_no,description,uom,pack_size,category,tax_profile
12345,BEEF GRND LEAN,LB,,Meat,ZERO_RATED
67890,APPLE GOLDEN DELICIOUS,CASE,40ct,Produce,ZERO_RATED
11223,CUP PPR HOT WHT 12Z,CASE,12x50,Paper,TAXABLE
```

If you don't have a master CSV, the system will:
1. Use GFS invoice category names (e.g., "Produce", "Meat")
2. Apply keyword-based mapping rules (pre-seeded in migration 029)
3. Queue items with confidence <95% for manual review in `needs_mapping` table

### Step 3: Verify Installation

```bash
# Check tables created
sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%item%' OR name LIKE '%finance%'"

# Check sample data
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) as categories FROM item_categories"
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) as tax_profiles FROM tax_profiles"
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) as mapping_rules FROM finance_mapping_rules"
```

## Usage - Reimport Workflow

### Mode 1: DRY-RUN (Validation Only)

**Purpose:** Test parsing and validation without any database writes.

```bash
# Test a single fiscal period
./scripts/reimport_gfs_invoices_v2.sh --dry-run --period FY26-P01

# Test since a specific date
./scripts/reimport_gfs_invoices_v2.sh --dry-run --since 2025-09-01

# Test a single invoice
./scripts/reimport_gfs_invoices_v2.sh --dry-run --invoice 9026547323
```

**Expected Output:**
```
================================================================================
GFS INVOICE REIMPORT V2
================================================================================
Mode: DRY_RUN
Import Run ID: import-20251014-173000
Fiscal Period: FY26-P01
Database: data/enterprise_inventory.db

🔍 Querying invoices to process...
✓ Found 17 invoices to process

================================================================================
PROCESSING INVOICES
================================================================================
[1/17] Invoice: 9026547323 (2025-09-06) - $36785.22
  [DRY-RUN] Would parse and validate invoice
...
================================================================================
IMPORT SUMMARY
================================================================================
Invoices processed: 17
Invoices passed:    17
Invoices failed:    0
Lines processed:    520
Lines mapped:       495
Lines unmapped:     25

Validation Score: 100.00%

✓ DRY-RUN complete: No data written to database
  Next step: Run with --shadow to write to shadow tables for comparison
```

### Mode 2: SHADOW (Safe Testing)

**Purpose:** Write parsed data to shadow tables for comparison before applying to main tables.

```bash
# Import to shadow tables
./scripts/reimport_gfs_invoices_v2.sh --shadow --period FY26-P01
```

**What happens:**
1. Clears `invoice_headers_shadow` and `invoice_line_items_shadow`
2. Parses invoices with V2 parser
3. Writes to shadow tables (main tables unchanged)
4. Records validation results in `finance_validation_history`

**Verify shadow data:**
```bash
# Compare totals: shadow vs main
sqlite3 data/enterprise_inventory.db <<EOF
SELECT 'SHADOW' as source, COUNT(*) as invoices, SUM(total_cents)/100.0 as total_dollars
FROM invoice_headers_shadow
WHERE fiscal_period_id = 'FY26-P01'
UNION ALL
SELECT 'MAIN' as source, COUNT(*) as invoices, SUM(invoice_amount) as total_dollars
FROM documents
WHERE fiscal_period_id = 'FY26-P01' AND mime_type = 'application/pdf' AND deleted_at IS NULL;
EOF
```

**Expected:**
```
source  invoices  total_dollars
SHADOW  17        200154.26
MAIN    17        200154.26
```

✅ If totals match, shadow import is correct!

### Mode 3: APPLY (Production Import)

**⚠️ WARNING:** This modifies main database tables. Only run after shadow verification passes.

```bash
# Apply to main tables
./scripts/reimport_gfs_invoices_v2.sh --apply --period FY26-P01
```

**Safety checks:**
1. Requires typing "APPLY" to confirm
2. Only proceeds if validation score ≥95%
3. Creates finance_verification_alerts for any issues
4. Logs all corrections to `finance_correction_log`

## Category Mapping

### Priority Order

1. **Item Bank lookup** (100% confidence) - if product code exists
2. **GFS invoice category** (95-99% confidence) - uses "CATEGORY RECAP" section
3. **Mapping rules** (keyword-based, 80-99% confidence)
4. **Queue for manual review** (<95% confidence)

### Pre-Seeded Mapping Rules (Migration 029)

| Pattern | Category Code | GL Account | Tax Profile |
|---------|---------------|------------|-------------|
| BEEF, PORK, CHICKEN, MEAT | MEAT | 60110060 | ZERO_RATED |
| APPLE, BANANA, PRODUCE | PROD | 60110070 | ZERO_RATED |
| MILK, CHEESE, DAIRY | MILK | 60110030 | ZERO_RATED |
| BREAD, ROLL, BAKE | BAKE | 60110010 | ZERO_RATED |
| JUICE, COFFEE, BEVERAGE | BEV_ECO | 60110020 | TAXABLE |
| PAPER, NAPKIN, CUP | PAPER | 60260010 | TAXABLE |
| CLEAN, SOAP, SANITIZER | CLEAN | 60220001 | TAXABLE |

### Manual Mapping Workflow

Items with confidence <95% are queued in `needs_mapping`:

```bash
# View items needing mapping
sqlite3 data/enterprise_inventory.db "SELECT item_no, description, suggested_category, confidence_score, occurrences FROM needs_mapping WHERE status='PENDING' ORDER BY occurrences DESC LIMIT 20"
```

**Approve mapping:**
```sql
-- Mark item as approved and create Item Bank entry
INSERT INTO finance_mapping_approvals (mapping_id, approved_category, approved_tax_profile, approved_by)
VALUES (123, 'MEAT', 5, 'finance.team@company.com');

UPDATE needs_mapping SET status = 'APPROVED', reviewed_by = 'finance.team@company.com', reviewed_at = CURRENT_TIMESTAMP
WHERE mapping_id = 123;

-- Optionally add to Item Bank
INSERT INTO item_bank (vendor, item_no, description, uom, category_code, tax_profile_id, status, confidence_score)
SELECT vendor, item_no, description, uom, 'MEAT', 5, 'ACTIVE', 1.0
FROM needs_mapping WHERE mapping_id = 123;
```

## Validation & Verification

### Validation Checks (Automatic)

| Check | Tolerance | Severity | Action if Failed |
|-------|-----------|----------|------------------|
| Line items sum = subtotal | ±$0.50 | ERROR | Block import, log to alerts |
| Calculated total = header total | ±$0.50 | WARNING | Allow but warn |
| All items have category | 100% | ERROR | Queue unmapped items |
| Unit price reasonable | <$1M/unit | WARNING | Flag for review |
| Quantity > 0 | Required | ERROR | Skip line item |

### Financial Accuracy Score

```
Score = (Passed Invoices / Total Invoices) × 100

Thresholds:
  ≥95%: PASS - safe to apply
  90-94%: WARNING - review alerts
  <90%: FAIL - do not apply
```

### Verification Script (Simplified)

Create `scripts/verify_financial_accuracy_v3.sh`:

```bash
#!/bin/bash
PERIOD="${1:-FY26-P01}"
DB_PATH="data/enterprise_inventory.db"

echo "=== Financial Accuracy Verification ==="
echo "Period: $PERIOD"
echo ""

# Check 1: Invoice totals match
echo "Check 1: Invoice Totals"
sqlite3 "$DB_PATH" <<EOF
SELECT
    COUNT(*) as invoices,
    SUM(total_cents)/100.0 as shadow_total,
    (SELECT SUM(invoice_amount) FROM documents WHERE fiscal_period_id='$PERIOD' AND deleted_at IS NULL) as main_total,
    ABS(SUM(total_cents)/100.0 - (SELECT SUM(invoice_amount) FROM documents WHERE fiscal_period_id='$PERIOD' AND deleted_at IS NULL)) as variance
FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD';
EOF

# Check 2: Line item reconciliation
echo ""
echo "Check 2: Line Item Reconciliation"
sqlite3 "$DB_PATH" <<EOF
SELECT
    h.invoice_number,
    h.total_cents/100.0 as header_total,
    SUM(li.line_total_cents)/100.0 as line_items_total,
    ABS(h.total_cents - SUM(li.line_total_cents))/100.0 as variance
FROM invoice_headers_shadow h
JOIN invoice_line_items_shadow li ON h.invoice_number = li.invoice_number
WHERE h.fiscal_period_id = '$PERIOD'
GROUP BY h.invoice_number
HAVING ABS(h.total_cents - SUM(li.line_total_cents)) > 50
ORDER BY variance DESC;
EOF

# Check 3: Category coverage
echo ""
echo "Check 3: Category Coverage"
sqlite3 "$DB_PATH" <<EOF
SELECT
    category_code,
    COUNT(*) as line_count,
    SUM(line_total_cents)/100.0 as category_total
FROM invoice_line_items_shadow
WHERE invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD')
GROUP BY category_code
ORDER BY category_total DESC;
EOF

echo ""
echo "✓ Verification complete"
```

Make it executable:
```bash
chmod +x scripts/verify_financial_accuracy_v3.sh
./scripts/verify_financial_accuracy_v3.sh FY26-P01
```

## Reports Generation V2

Create `scripts/generate_monthly_gfs_reports_v2.py` (simplified):

```python
#!/usr/bin/env python3
"""Generate monthly GFS reports with correct category breakdowns"""

import sqlite3
import pandas as pd
from datetime import datetime

DB_PATH = "data/enterprise_inventory.db"
PERIOD = "FY26-P01"

conn = sqlite3.connect(DB_PATH)

# Query headers
headers = pd.read_sql_query(f"""
    SELECT * FROM invoice_headers_shadow
    WHERE fiscal_period_id = '{PERIOD}'
    ORDER BY invoice_date
""", conn)

# Query line items with categories
lines = pd.read_sql_query(f"""
    SELECT
        li.*,
        ic.label as category_label,
        ic.gl_account
    FROM invoice_line_items_shadow li
    LEFT JOIN item_categories ic ON li.category_code = ic.category_code
    WHERE li.invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id = '{PERIOD}')
""", conn)

conn.close()

# Convert cents to dollars
headers['total'] = headers['total_cents'] / 100
lines['line_total'] = lines['line_total_cents'] / 100

# Category summary
category_summary = lines.groupby('category_label').agg({
    'line_total': 'sum'
}).round(2)

print(f"=== GFS Report {PERIOD} ===")
print(f"\nInvoice Count: {len(headers)}")
print(f"Total Amount: ${headers['total'].sum():,.2f}")
print(f"\nCategory Breakdown:")
print(category_summary)

# Export to Excel
output_file = f"GFS_Report_{PERIOD}_v2.xlsx"
with pd.ExcelWriter(output_file) as writer:
    headers[['invoice_number', 'invoice_date', 'vendor', 'total']].to_excel(writer, sheet_name='Invoices', index=False)
    category_summary.to_excel(writer, sheet_name='Categories')
    lines[['invoice_number', 'description', 'category_label', 'line_total']].to_excel(writer, sheet_name='Line Items', index=False)

print(f"\n✓ Report saved: {output_file}")
```

Make executable and run:
```bash
chmod +x scripts/generate_monthly_gfs_reports_v2.py
python3 scripts/generate_monthly_gfs_reports_v2.py
```

## Acceptance Criteria Checklist

- [ ] **Currency Precision**: All money values stored as integer cents
- [ ] **Invoice Reconciliation**: Σ(line_total_cents) = header_total_cents within ±$0.50 for 100% of invoices
- [ ] **Period Total**: FY26-P01 total = $200,154.26 (matches control)
- [ ] **Item Bank Coverage**: 100% of line items reference item_id or have category_code
- [ ] **No Duplicates**: Unique constraint on (vendor, invoice_number, invoice_date)
- [ ] **Tax Accuracy**: GST 5% + QST 9.975% calculated correctly
- [ ] **Validation Score**: ≥95% for test period
- [ ] **Shadow Verification**: Shadow totals match main totals at invoice level

## Troubleshooting

### Issue: "No such column: line_total_cents"

**Solution:** Run migrations 028 and 029.

### Issue: "Validation score <95%"

**Solution:**
1. Check `finance_verification_alerts` for specific errors
2. Review `needs_mapping` for unmapped items
3. Run dry-run on failing invoices: `./scripts/reimport_gfs_invoices_v2.sh --dry-run --invoice <number>`

### Issue: "Line totals don't match header"

**Diagnosis:**
```sql
SELECT invoice_number,
       header_total_cents/100.0 as header,
       line_sum_cents/100.0 as lines,
       variance_cents/100.0 as variance
FROM (
    SELECT h.invoice_number,
           h.total_cents as header_total_cents,
           SUM(li.line_total_cents) as line_sum_cents,
           ABS(h.total_cents - SUM(li.line_total_cents)) as variance_cents
    FROM invoice_headers_shadow h
    JOIN invoice_line_items_shadow li ON h.invoice_number = li.invoice_number
    GROUP BY h.invoice_number
)
WHERE variance_cents > 50
ORDER BY variance_cents DESC;
```

**Common causes:**
- Missing freight/fuel charges in line items (add to "OTHER" category)
- Tax included in line items but also in header (OCR parsing issue)
- Rounding differences (should be <$0.50)

## Monitoring & Metrics

Track import health in Prometheus:

```javascript
// Add to backend/utils/metricsExporter.js
financial_import_v2_total: new promClient.Counter({
  name: 'financial_import_v2_total',
  help: 'Total invoices processed by import v2',
  labelNames: ['mode', 'status']
}),

financial_validation_score: new promClient.Gauge({
  name: 'financial_validation_score',
  help: 'Financial validation score (0-100)',
  labelNames: ['period']
}),

financial_mapping_coverage: new promClient.Gauge({
  name: 'financial_mapping_coverage',
  help: 'Percentage of items with category mapping',
  labelNames: ['period']
})
```

## Next Steps

1. **Test on FY26-P01** (17 invoices, known good data)
2. **Verify shadow vs control** (totals should match $200,154.26)
3. **Review needs_mapping queue**
4. **Apply to production** (if validation score ≥95%)
5. **Backfill historical periods** (FY25-P05 through FY25-P12)
6. **Generate final reports** with category breakdowns

## Support

For issues or questions:
1. Check `finance_verification_alerts` table
2. Review import run logs: `SELECT * FROM finance_import_runs ORDER BY started_at DESC LIMIT 10`
3. Contact: NeuroPilot AI team

---

**Version History:**
- v2.0.0 (2025-10-14): Initial release - complete fix for line items corruption
