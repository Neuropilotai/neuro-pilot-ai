# Missing Invoices Report

## Latest Invoice in System
- **Invoice Number**: 9026031906
- **Date**: August 23, 2025 (08/23/2025)
- **Status**: This is your most recent invoice

## Missing Invoices to Download

Since you order **once per week**, you're missing invoices from:

### Missing Week Dates (August 23 - Present)
1. **Week of August 30, 2025** - ~7 days after last invoice
2. **Week of September 6, 2025** - ~14 days after
3. **Week of September 13, 2025** - ~21 days after
4. **Week of September 20, 2025** - ~28 days after
5. **Week of September 27, 2025** - ~35 days after
6. **Week of October 4, 2025** (current week) - ~42 days after

### Expected Missing Invoices: **~6 invoices**

## How to Download

Since the last invoice **9026031906** was from **August 23, 2025**, and today is **October 3, 2025**, you're missing approximately **6 weeks** of orders.

### Download from GFS Portal:
1. Log into your GFS account
2. Go to Order History / Invoice History
3. Filter date range: **August 24, 2025** to **October 3, 2025**
4. Download all PDFs from this period
5. Place PDFs in: `/Users/davidmikulis/neuro-pilot-ai/backend/data/invoices/`

## After Downloading

Once you've downloaded the missing PDFs, run:

```bash
# Process the new PDFs
node flawless_pdf_extractor.js

# Check the results
ls -lt data/gfs_orders/*.json | head -10
```

## Expected Invoice Numbers
Based on the pattern, your missing invoices should be numbered around:
- 9026031906 ← **Last invoice (Aug 23)**
- 9026xxxxxx ← Week of Aug 30
- 9027xxxxxx ← Week of Sep 6
- 9027xxxxxx ← Week of Sep 13
- 9028xxxxxx ← Week of Sep 20
- 9028xxxxxx ← Week of Sep 27
- 9029xxxxxx ← Week of Oct 4 (this week)

**Note**: GFS invoice numbers increment sequentially, so look for invoices starting with 9026 and higher.

## Verification

After downloading, you should have:
- **Current PDFs**: 55 invoices
- **New PDFs**: ~6 invoices
- **Total**: ~61 invoices

This will bring your inventory system up to date through October 3, 2025.
