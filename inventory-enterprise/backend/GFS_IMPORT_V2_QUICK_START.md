# GFS Import V2 - Quick Start Guide

**🎯 Goal:** Fix corrupted line items data and generate accurate monthly reports with category breakdowns.

**⏱️ Time:** 15-30 minutes for test period (FY26-P01)

---

## Prerequisites

- SQLite3 installed
- Node.js installed (for parser)
- Python 3 with pandas, openpyxl installed
- Backup of current database (recommended)

```bash
# Install Python dependencies
pip3 install pandas openpyxl

# Create backup (optional but recommended)
cp backend/data/enterprise_inventory.db backend/data/enterprise_inventory.db.backup
```

---

## Step 1: Apply Database Migrations (5 min)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Apply schema changes
sqlite3 data/enterprise_inventory.db < migrations/028_item_bank_and_money_precision.sql
sqlite3 data/enterprise_inventory.db < migrations/029_finance_category_enum_and_tax_profiles.sql
```

**✅ Verify:**
```bash
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM item_categories"
# Expected: 13 categories

sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM finance_mapping_rules"
# Expected: ~60 mapping rules
```

---

## Step 2: Test with DRY-RUN (2 min)

```bash
# Test parsing without writing to database
./scripts/reimport_gfs_invoices_v2.sh --dry-run --period FY26-P01
```

**Expected Output:**
```
GFS INVOICE REIMPORT V2
Mode: DRY_RUN
✓ Found 17 invoices to process

IMPORT SUMMARY
Invoices processed: 17
Invoices passed:    17
Validation Score: 100.00%

✓ DRY-RUN complete: No data written to database
```

---

## Step 3: Import to Shadow Tables (5 min)

```bash
# Import to shadow tables for safe testing
./scripts/reimport_gfs_invoices_v2.sh --shadow --period FY26-P01
```

**What happens:**
- Clears shadow tables
- Parses all invoices with V2 parser
- Writes to `invoice_headers_shadow` and `invoice_line_items_shadow`
- Main tables remain unchanged

---

## Step 4: Verify Data Quality (3 min)

```bash
# Run comprehensive verification
./scripts/verify_financial_accuracy_v3.sh FY26-P01
```

**Expected Output:**
```
FINANCIAL ACCURACY VERIFICATION V3
Period: FY26-P01

Check 1: Invoice Totals Comparison
  Invoices:      17
  Shadow Total:  $200154.26
  Main Total:    $200154.26
  Variance:      $0.00
  ✓ PASS: Variance within tolerance

Check 2: Line Item Reconciliation
  Invoices with line item variance >$0.50: 0
  ✓ PASS: All invoices reconciled

Check 3: Category Coverage
  Total Line Items:   520
  Mapped:             495
  Unmapped:           25
  Coverage:           95.2%
  ⚠️  WARNING: 25 items unmapped

Check 4: Category Breakdown
  category           line_count  total_dollars
  Meat                     156       45123.45
  Produce                  134       28456.78
  ...

VERIFICATION SUMMARY
Checks Passed:   3
Checks Warning:  1
Checks Failed:   0
Overall Score:   97.5%

✅ VERIFICATION PASSED - Safe to apply import
```

---

## Step 5: Generate Report from Shadow Data (2 min)

```bash
# Generate report with category breakdowns
python3 scripts/generate_monthly_gfs_reports_v2.py FY26-P01
```

**Expected Output:**
```
GFS FINANCIAL REPORT V2 - FY26-P01
✓ Found 17 invoices
✓ Found 520 line items

SUMMARY STATISTICS
Total Invoices:        17
Total Line Items:      520
Total Amount:          $200,154.26
Total Subtotal:        $188,465.32
Total GST:             $9,423.27
Total QST:             $18,810.67

CATEGORY BREAKDOWN
GL Account    Category                 Total Amount  Line Count
60110060      Meat                     $45,123.45    156
60110070      Produce                  $28,456.78    134
60110030      Dairy & Milk             $22,789.12    89
...

✅ Report generated successfully!
📁 Report saved: /Users/davidmikulis/Desktop/GFS_Fiscal_Reports/GFS_Report_V2_FY26-P01_20251014.xlsx
```

---

## Step 6: Review Unmapped Items (Optional, 5 min)

If verification showed unmapped items:

```bash
# View items needing manual category assignment
sqlite3 data/enterprise_inventory.db \
  "SELECT item_no, description, suggested_category, confidence_score, occurrences
   FROM needs_mapping WHERE status='PENDING' ORDER BY occurrences DESC LIMIT 20" \
  -header -column
```

**Sample Output:**
```
item_no  description              suggested_category  confidence_score  occurrences
45678    SPECIAL SEASONING MIX    GROC_MISC          0.85              12
91234    CUSTOM BLEND COFFEE      BEV_ECO            0.88              8
```

**To approve a mapping:**
```sql
-- Mark as approved and assign category
UPDATE needs_mapping
SET status = 'APPROVED',
    reviewed_by = 'your.email@company.com',
    reviewed_at = CURRENT_TIMESTAMP
WHERE item_no = '45678';

-- Optionally add to Item Bank for future imports
INSERT INTO item_bank (vendor, item_no, description, uom, category_code, tax_profile_id, status, confidence_score)
VALUES ('GFS', '45678', 'SPECIAL SEASONING MIX', 'EACH', 'GROC_MISC', 1, 'ACTIVE', 1.0);
```

---

## Step 7: Apply to Production (2 min)

**⚠️ WARNING:** This modifies main database tables. Only run if verification passed.

```bash
# Apply changes to main tables
./scripts/reimport_gfs_invoices_v2.sh --apply --period FY26-P01
```

**You will be prompted to type "APPLY" to confirm.**

---

## Step 8: Generate Final Production Report (2 min)

After applying, generate the final report:

```bash
# Generate from main tables (or shadow if you haven't applied yet)
python3 scripts/generate_monthly_gfs_reports_v2.py FY26-P01
```

---

## Validation Checklist

Before applying to production, verify:

- [ ] **Invoice totals match**: Shadow total = Main total (±$0.50)
- [ ] **Line item reconciliation**: Σ(line_total_cents) = header_total_cents for all invoices
- [ ] **Category coverage**: ≥95% of line items have category assignments
- [ ] **Report accuracy**: Total in report matches known control ($200,154.26 for FY26-P01)
- [ ] **No duplicate invoices**: Unique constraint enforced
- [ ] **Validation score**: ≥95%

---

## Troubleshooting

### Issue: "No such table: item_bank"
**Solution:** Run migrations from Step 1

### Issue: "Validation score <95%"
**Solution:**
1. Check `sqlite3 data/enterprise_inventory.db "SELECT * FROM finance_verification_alerts WHERE resolution_status='OPEN'"`
2. Review and approve mappings in `needs_mapping`
3. Re-run with --shadow to incorporate fixes

### Issue: "Line items sum doesn't match header"
**Solution:**
- Check if freight/fuel charges are in line items vs header
- Review OCR extraction quality for that invoice
- May need manual correction in shadow tables before applying

### Issue: "Node.js script fails"
**Solution:**
- Verify Node.js modules: `cd backend && npm install`
- Check database connection in `src/db/connection.js`

---

## Backfill Historical Periods

After successful test on FY26-P01, backfill other periods:

```bash
# Process all periods
for period in FY25-P05 FY25-P06 FY25-P07 FY25-P08 FY25-P09 FY25-P10 FY25-P11 FY25-P12 FY26-P01; do
  echo "Processing $period..."
  ./scripts/reimport_gfs_invoices_v2.sh --shadow --period $period
  ./scripts/verify_financial_accuracy_v3.sh $period

  # If verification passes, apply
  if [ $? -eq 0 ]; then
    ./scripts/reimport_gfs_invoices_v2.sh --apply --period $period
    python3 scripts/generate_monthly_gfs_reports_v2.py $period
  fi
done
```

---

## Success Criteria

You'll know it's working when:

1. ✅ **Verification passes** with score ≥95%
2. ✅ **Report totals match** known control values
3. ✅ **Category breakdown** shows realistic distribution (not all "Other")
4. ✅ **No massive values** (e.g., $9M "Other Costs" is gone)
5. ✅ **Line item reconciliation** passes for 100% of invoices

**Example of GOOD category distribution:**
```
Meat:           $45,123   (23%)
Produce:        $28,457   (14%)
Dairy & Milk:   $22,789   (11%)
Grocery & Misc: $18,234   (9%)
Beverages:      $15,678   (8%)
Paper:          $12,456   (6%)
...
Other:          $5,234    (3%)  ← Small, not 90%!
```

---

## Next Steps

1. **Test period FY26-P01** (17 invoices) - easiest to validate
2. **Backfill FY25 periods** (8 periods, 166 invoices)
3. **Set up monthly automation** for new invoices
4. **Integrate with Prometheus metrics** for monitoring
5. **Train finance team** on manual mapping workflow

---

## Support & Documentation

- Full documentation: `GFS_IMPORT_V2_README.md`
- Migrations: `migrations/028_*.sql`, `migrations/029_*.sql`
- Parser: `src/finance/GFSInvoiceParserV2.js`
- Scripts: `scripts/reimport_gfs_invoices_v2.sh`, `scripts/verify_financial_accuracy_v3.sh`

**Questions?** Check the main README or review import run logs:
```bash
sqlite3 data/enterprise_inventory.db "SELECT * FROM finance_import_runs ORDER BY started_at DESC LIMIT 5" -header -column
```

---

**Version:** 15.7+
**Last Updated:** 2025-10-14
**Status:** ✅ Production Ready
