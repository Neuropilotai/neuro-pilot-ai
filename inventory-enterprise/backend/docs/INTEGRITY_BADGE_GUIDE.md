# How to Read the Invoice Integrity Badge

**Version:** 16.2.0
**Audience:** Finance Staff, Operations Managers, Owners

---

## Overview

The **Invoice Integrity Badge** displays the real-time balance status of all invoices in the system. It tells you at a glance whether invoice totals calculated from line items match the totals printed on the PDF invoices.

---

## The Badge: What Makes It Green?

### ✅ Green Badge = "BALANCED"

Your system shows a **green badge** when:

1. **All invoice deltas are within ±2¢ tolerance**
   - Subtotal delta ≤ 2¢
   - GST delta ≤ 2¢
   - QST delta ≤ 2¢
   - Total delta ≤ 2¢

2. **No unresolved validation errors**

3. **All line items have finance codes** (even if fallback to OTHER)

**What this means:** Your financial data is accurate and ready for reporting. Period summaries can be locked without issues.

---

## The Badge: What Makes It Red/Yellow?

### ⚠️ Yellow/Red Badge = "DELTA" or "MISMATCH"

You'll see a **warning badge** when:

1. **One or more invoices have deltas >2¢**
   - Subtotal doesn't match sum of line amounts
   - GST doesn't match calculated GST (5.00%)
   - QST doesn't match calculated QST (9.975%)
   - Grand total doesn't match invoice total

2. **Common causes:**
   - PDF parsing errors (OCR misread numbers)
   - Manual corrections not synced
   - Rounding differences beyond tolerance
   - Missing line items during import

**What this means:** Requires review before locking period totals. Check the "Invoices Needing Attention" list.

---

## Understanding the 4 Stat Cards

The Integrity Badge section shows 4 key metrics:

### 1. Balance Status
- **Value:** ✅ BALANCED or ⚠️ DELTA $X.XX
- **Meaning:** Overall system status. "BALANCED" = all good. "DELTA" = issues found.

### 2. Total Invoices
- **Value:** Count of invoices with validation results
- **Meaning:** How many invoices have been validated (imported with enforcement).

### 3. Imbalanced Count
- **Value:** Number of invoices with deltas >2¢
- **Meaning:** How many invoices need attention. **Target: 0**

### 4. Average Delta
- **Value:** Average absolute delta across all invoices (in cents)
- **Meaning:** Average variance. **Target: <2¢**

---

## Where Deltas Show Up

### Invoice Level
Navigate to **Invoices Needing Attention** to see:
- Invoice ID
- Balance Status (which component failed: SUBTOTAL_MISMATCH, GST_MISMATCH, etc.)
- Specific deltas (e.g., "GST off by 8¢")
- Date imported

### Validation Details
For a specific invoice, call:
```
GET /api/finance/enforcement/validation/:invoice_id
```

Response shows:
```json
{
  "balance_status": "GST_MISMATCH",
  "subtotal_delta_cents": 0,
  "gst_delta_cents": 8,
  "qst_delta_cents": -2,
  "total_delta_cents": 6,
  "tolerance_cents": 2,
  "issues": [
    "GST delta (8¢) exceeds tolerance (2¢)"
  ]
}
```

**Reading the deltas:**
- **Positive delta:** Calculated value > PDF value
- **Negative delta:** Calculated value < PDF value
- **Zero delta:** Perfect match

---

## Common Scenarios

### Scenario 1: Green Badge, Everything Normal ✅
- **Status:** BALANCED
- **Imbalanced Count:** 0
- **Action:** None. You're good to lock period totals.

---

### Scenario 2: Yellow Badge, Minor Issues ⚠️
- **Status:** DELTA $1.50
- **Imbalanced Count:** 2 invoices
- **Average Delta:** 1.5¢
- **Action:** Review 2 invoices. Likely rounding differences or small OCR errors. If totals are close, you can proceed with locking.

---

### Scenario 3: Red Badge, Major Issues ❌
- **Status:** DELTA $45.00
- **Imbalanced Count:** 12 invoices
- **Average Delta:** 37.5¢
- **Action:** **Do NOT lock period.** Investigate:
  1. Check PDF parsing quality (did OCR miss lines?)
  2. Verify line item counts match PDF
  3. Re-import problematic invoices
  4. Contact support if issue persists

---

## The ±2¢ Tolerance: Why?

The system uses **integer-cent arithmetic** to avoid floating-point errors. However:
- PDFs may show rounded totals (e.g., $123.45)
- Per-line rounding can accumulate (±1¢ per line)
- Canadian tax calculations use precise basis points

**The ±2¢ tolerance accounts for:**
- PDF rounding (±1¢)
- Line-item rounding accumulation (±1¢)
- **Total acceptable variance: ±2¢**

This is **tighter than industry standard** (typically ±5¢), ensuring high accuracy.

---

## How to Fix Imbalanced Invoices

### Step 1: Identify the Problem Invoice
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/finance/enforcement/needs-attention
```

### Step 2: Get Validation Details
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/finance/enforcement/validation/INVOICE_ID
```

### Step 3: Review Issues
- **Subtotal Mismatch:** Check line item amounts sum correctly
- **GST/QST Mismatch:** Verify taxable flags on line items
- **Total Mismatch:** Check grand total calculation

### Step 4: Fix and Revalidate
Option A: **Re-import the invoice PDF**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "invoice_pdf=@corrected_invoice.pdf" \
  http://localhost:8083/api/finance/enforcement/import
```

Option B: **Manual correction** (if PDF is accurate but parsing failed)
- Update line item amounts in database
- Click **♻️ Revalidate** button in UI

---

## The Revalidate Button

**Location:** Top-right of Integrity Badge section
**Label:** ♻️ Revalidate
**Access:** OWNER only

**What it does:**
1. Recalculates all invoice validations
2. Updates all deltas based on current data
3. Refreshes integrity badge status

**When to use:**
- After bulk remapping invoices
- After updating Item Bank or mapping rules
- After manual database corrections
- Monthly before locking period totals

---

## Period Locking Rules

**You can only lock a period if:**
1. ✅ Integrity badge is GREEN (all deltas ≤2¢)
2. ✅ Needs Mapping Queue is empty (or <5% low-confidence)
3. ✅ No invoices in "Needs Attention" list

**If any condition fails:**
- System rejects lock attempt
- Error message explains which condition failed
- Fix issues and retry

---

## Prometheus Metrics for Monitoring

Track integrity health with these metrics:

```promql
# Current imbalanced invoice count
invoice_imbalance_total

# Rate of new imbalances per hour
rate(invoice_imbalance_total[1h])

# Tax calculation mismatches by type
rate(finance_tax_mismatch_total[1h])
```

**Set alerts:**
- `invoice_imbalance_total > 5` for 1 hour → Investigate
- `rate(finance_tax_mismatch_total[1h]) > 0.1` → Tax config issue

---

## FAQ

**Q: Why is my badge red when all my invoices look correct?**
A: The badge reflects **system validation**, not visual inspection. Even if invoices *look* correct, calculated totals may differ. Check the validation details to see exact deltas.

**Q: Can I lock a period with a yellow badge (small deltas)?**
A: No. The system enforces strict rules: all deltas must be ≤2¢. Fix issues first, then lock.

**Q: What if I can't get an invoice to balance?**
A: If delta is >2¢ and you've verified the PDF is accurate:
1. Check line item counts match PDF
2. Verify taxable flags (GST/QST)
3. Look for missing/duplicate lines
4. Contact support with invoice ID

**Q: Does the badge update automatically?**
A: Yes, it updates when:
- New invoices are imported
- Bulk remapping runs
- Manual revalidation triggered
- **Refresh interval:** Manual (click ↻ Refresh button)

**Q: What happens if I lock a period and later find an error?**
A: **Locked periods are immutable** for audit compliance. You cannot unlock them. If an error is found, you must:
1. Document the error
2. Create an adjustment entry in the next period
3. Update your accounting records

---

## Summary Checklist

Before month-end close, verify:

- [ ] Integrity Badge is ✅ GREEN
- [ ] Imbalanced Count = **0**
- [ ] Average Delta < **2¢**
- [ ] Needs Mapping Queue < **5%** of total lines
- [ ] All high-value invoices manually reviewed
- [ ] Revalidation run within last 24 hours

**Only then** should you lock the period.

---

**For more information, see:**
- FINANCE_ITEM_BANK_README.md (Section 7: Invoice Import & Validation)
- FINANCE_ITEM_BANK_README.md (Section 14: Troubleshooting)

---

**Questions? Contact:** finance@neuropilot.ai
