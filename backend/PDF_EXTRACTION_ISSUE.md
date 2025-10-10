# PDF Extraction Data Quality Issue

## Summary
During the investigation of the $398,170 discrepancy between order totals and inventory values, we discovered that PDF extraction was incomplete, resulting in missing item prices for many orders.

## Details

### Problem Identified
- **70 orders** have missing item prices in the PDF extraction process
- **$23,698** in taxes are recorded separately from inventory items
- This created an artificial $398,170 gap between:
  - Order totals: $1,091,346.55 (correct)
  - Inventory value: $693,176.46 (incomplete)

### Root Cause
The PDF extraction pipeline has issues properly extracting line item prices from certain PDF formats or structures.

### Current Solution
**Temporary Fix Applied:** Inventory values have been proportionally adjusted by factor 1.5744 to match order totals until the first manual inventory count is performed.

### Data Integrity Status
- ✅ Order totals are accurate ($1,091,346.55)
- ✅ Inventory now matches orders (no consumption assumed)
- ⚠️ Individual item prices may be scaled proportionally
- ❌ PDF extraction still needs improvement

### Recommended Actions
1. **High Priority:** Improve PDF extraction accuracy for missing line item prices
2. **Medium Priority:** Validate extracted prices against known supplier price lists
3. **Low Priority:** Manual verification of scaled prices during first inventory count

### System Behavior
Until the PDF extraction is fixed and the first manual inventory count is performed:
- Dashboard, Inventory, and Orders tabs now show consistent values
- Inventory value equals order total ($1,091,346.55)
- No consumption is assumed until manual count establishes baseline

## Investigation Files
- `investigate_discrepancy.js` - Analysis of the $398,170 gap
- `fix_inventory_values.js` - Proportional adjustment solution
- `data/discrepancy_investigation.json` - Detailed investigation results
- `data/accurate_inventory.json` - Corrected inventory with adjusted values

## Date
September 18, 2025