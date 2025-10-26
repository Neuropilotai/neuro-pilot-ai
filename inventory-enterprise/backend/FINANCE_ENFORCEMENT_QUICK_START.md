# NeuroPilot v16.2.0 Finance Enforcement - Quick Start Guide

**Goal:** Achieve ≥95% auto-mapping rate with the starter Item Bank and mapping rules pack.

**Time to complete:** 15 minutes

---

## Prerequisites

- ✅ NeuroPilot v16.2.0 backend running on port 8083
- ✅ Owner token available (either in `.owner_token` file or as `$TOKEN` env var)
- ✅ At least 30-60 days of GFS invoices imported
- ✅ Database migration 031 applied

---

## Step 1: Save the Item Bank CSV

Create a file named `item_bank_starter.csv` with this content:

```csv
gfs_item_no,description,pack_size,uom,finance_code,taxable_gst,taxable_qst,vendor_sku,upc,status
10001,All Purpose Flour Unbleached,20KG,BAG,BAKE,1,0,RDMS-10001,061500000105,ACTIVE
10002,Whole Milk 3.25% Homogenized,4x4L,CS,MILK,1,0,DAIR-10002,061500000211,ACTIVE
10003,Ground Beef Regular 20% Fat,10LB,CS,MEAT,1,0,MEAT-10003,061500000327,ACTIVE
10004,Romaine Lettuce Hearts,24CT,CS,PROD,1,0,PROD-10004,061500000433,ACTIVE
10005,Instant Coffee Granules,500G,JAR,BEV+ECO,1,1,BEVG-10005,061500000549,ACTIVE
10006,White Sugar Granulated,20KG,BAG,GROC+MISC,1,0,GROC-10006,061500000655,ACTIVE
10007,Dish Detergent Liquid Concentrate,4L,BTL,CLEAN,1,1,CHEM-10007,061500000761,ACTIVE
10008,Paper Towel Roll 2-Ply White,30RL,CS,PAPER,1,1,PAPR-10008,061500000877,ACTIVE
10009,Chicken Breast Boneless Skinless,10LB,CS,MEAT,1,0,MEAT-10009,061500000983,ACTIVE
10010,Cheddar Cheese Aged 12 Months,5LB,BLK,MILK,1,0,DAIR-10010,061500001096,ACTIVE
10011,Yellow Onions Large,50LB,BAG,PROD,1,0,PROD-10011,061500001102,ACTIVE
10012,Canola Oil Pure,16L,JUG,GROC+MISC,1,0,GROC-10012,061500001218,ACTIVE
10013,Bacon Strips Smoked Sliced,10LB,CS,MEAT,1,0,MEAT-10013,061500001324,ACTIVE
10014,Tomatoes Roma Fresh,25LB,CS,PROD,1,0,PROD-10014,061500001430,ACTIVE
10015,Bleach Liquid 6% Sodium Hypochlorite,4L,BTL,CLEAN,1,1,CHEM-10015,061500001546,ACTIVE
10016,Coffee Beans Whole Medium Roast,2LB,BAG,BEV+ECO,1,1,BEVG-10016,061500001652,ACTIVE
10017,Butter Unsalted AA Grade,36x1LB,CS,MILK,1,0,DAIR-10017,061500001768,ACTIVE
10018,Plastic Gloves Nitrile Powder-Free,1000CT,CS,GROC+MISC,1,1,SUPL-10018,061500001874,ACTIVE
10019,Striploin Steak AAA 10oz,10LB,CS,MEAT,1,0,MEAT-10019,061500001980,ACTIVE
10020,Potatoes Russet Large 80ct,50LB,BAG,PROD,1,0,PROD-10020,061500002093,ACTIVE
10021,Sanitizer Spray Multi-Surface,12x750ML,CS,CLEAN,1,1,CHEM-10021,061500002109,ACTIVE
10022,Napkins White 2-Ply Dinner,3000CT,CS,PAPER,1,1,PAPR-10022,061500002215,ACTIVE
10023,Heavy Cream 35% MF,12x1L,CS,MILK,1,0,DAIR-10023,061500002321,ACTIVE
10024,Freight Charge Fuel Surcharge,1EA,EA,FREIGHT,1,1,FRGT-10024,,ACTIVE
10025,Apron Bib White Adjustable,12CT,DZ,LINEN,1,1,LINR-10025,061500002543,ACTIVE
```

Save to: `/Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend/item_bank_starter.csv`

---

## Step 2: Import Item Bank CSV

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Import CSV (must be first step)
curl -X POST http://localhost:8083/api/finance/item-bank/import-csv \
  -H "Authorization: Bearer $(cat .owner_token)" \
  -F "csv_file=@item_bank_starter.csv" \
  -F "upsert_mode=true"
```

**Expected output:**
```json
{
  "success": true,
  "imported": 25,
  "errors": []
}
```

**Verify:**
```bash
curl -H "Authorization: Bearer $(cat .owner_token)" \
  http://localhost:8083/api/finance/item-bank/statistics
```

Should show `"total": 25` and `"active": 25`.

---

## Step 3: Import Mapping Rules (20 Rules)

We've provided a helper script that imports all 20 rules automatically:

```bash
# Run the import script
./scripts/import_mapping_rules.sh
```

**Expected output:**
```
📦 Importing 20 Mapping Rules to NeuroPilot Finance Enforcement
==============================================================

Importing: SKU '10001' → BAKE
  ✅ Created rule ID: 1

Importing: SKU '10002' → MILK
  ✅ Created rule ID: 2

...

==============================================================
📊 Import Summary
==============================================================
Imported: 20
Failed: 0

✅ All rules imported successfully!
```

**Verify:**
```bash
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/rules?active=1"
```

Should show `"total": 20`.

---

## Step 4: Bulk Remap Last 60 Days

Now remap all invoices from the last 60 days to apply the new Item Bank and rules:

```bash
START_DATE=$(date -v-60d +%Y-%m-%d 2>/dev/null || date -d '60 days ago' +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

curl -X POST http://localhost:8083/api/finance/enforcement/bulk/remap \
  -H "Authorization: Bearer $(cat .owner_token)" \
  -H "Content-Type: application/json" \
  -d "{\"start_date\": \"$START_DATE\", \"end_date\": \"$END_DATE\"}"
```

**Expected output:**
```json
{
  "success": true,
  "remapped": 45,
  "updated": 2350,
  "start_date": "2024-08-19",
  "end_date": "2024-10-18"
}
```

**This may take 30-60 seconds for large invoice sets.**

---

## Step 5: Check Auto-Mapping Rate

```bash
curl -H "Authorization: Bearer $(cat .owner_token)" \
  http://localhost:8083/api/finance/enforcement/dashboard | jq .
```

**Look for these key metrics:**

```json
{
  "item_bank": {
    "total_active": 25
  },
  "needs_mapping_count": 12,        // Should be <5% of total lines
  "mapping_stats": {
    "total_mapped": 2350,
    "by_strategy": {
      "BANK": 450,                   // High (from Item Bank)
      "RULE": 1200,                  // High (from rules)
      "AI": 680,                     // Medium (AI classifier)
      "FALLBACK": 20                 // Low (OTHER category)
    }
  }
}
```

**Calculate auto-mapping rate:**
```
Auto-mapping % = (BANK + RULE + high-confidence AI) / total_mapped * 100
```

**Target:** ≥95%

---

## Step 6: Review Needs Mapping Queue

Check which items still need attention:

```bash
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/needs-mapping?limit=10" | jq .
```

**For each low-confidence item, you can:**

1. **Add to Item Bank** (if it's a recurring SKU)
2. **Create a mapping rule** (if it's a pattern)
3. **Manually assign** (if it's a one-off)

---

## Step 7: Run Smoke Tests

Verify everything works end-to-end:

```bash
./scripts/smoke_test_finance_enforcement.sh
```

**Expected output:**
```
🧪 NeuroPilot v16.2.0 Finance Enforcement Smoke Tests
======================================================

Test 1: Item Bank Statistics
✅ PASS: GET /api/finance/item-bank/statistics

Test 2: Create Item + Retrieve
✅ PASS: POST + GET /api/finance/item-bank

...

Test 7: Period Summary (Current Month)
✅ PASS: POST period/summary (integer-cent + GST/QST)

======================================================
📊 SMOKE TEST RESULTS
======================================================
Passed: 7
Failed: 0

✅ All smoke tests passed!
```

---

## Step 8: Set Up Grafana Dashboard (Optional)

Import the pre-built Grafana dashboard:

1. Open Grafana (e.g., `http://localhost:3000`)
2. Navigate to **Dashboards → Import**
3. Upload `grafana/neuropilot_finance_enforcement_dashboard.json`
4. Select your Prometheus datasource
5. Click **Import**

**Dashboard includes:**
- Item Bank size (single stat)
- Needs Mapping count (single stat + sparkline)
- Invoice imbalance rate (time series)
- AI auto-mapping % (gauge)
- Tax mismatch rate (stacked time series)
- Verified period totals (table + bar chart)

---

## Maintenance & Next Steps

### Weekly Tasks
- [ ] Review needs mapping queue
- [ ] Create rules for recurring patterns
- [ ] Add new items to Item Bank

### Monthly Tasks
- [ ] Generate period summary
- [ ] Review invoice integrity badge
- [ ] Revalidate period totals
- [ ] Lock period (OWNER only)

### As Needed
- [ ] Export Item Bank CSV for backup
- [ ] Bulk update finance codes
- [ ] Remap invoices after rule changes

---

## Troubleshooting

### Issue: Auto-mapping rate is <95%

**Diagnosis:**
```bash
# Check needs mapping queue
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/needs-mapping?limit=100" | jq .
```

**Solutions:**
1. Identify common patterns in descriptions
2. Create KEYWORD or REGEX rules for patterns
3. Add frequently-appearing SKUs to Item Bank
4. Run bulk remap after changes

---

### Issue: Too many FALLBACK mappings

**Diagnosis:**
```bash
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/dashboard" | jq .mapping_stats
```

**Solutions:**
- Review items mapped to OTHER category
- Create specific rules for these items
- Improve rule priorities (higher = checked first)

---

### Issue: Invoice integrity badge is red

**See:** `docs/INTEGRITY_BADGE_GUIDE.md` for detailed troubleshooting

**Quick fix:**
```bash
# Get invoices needing attention
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/needs-attention" | jq .

# Check specific invoice validation
curl -H "Authorization: Bearer $(cat .owner_token)" \
  "http://localhost:8083/api/finance/enforcement/validation/INVOICE_ID" | jq .
```

---

## Reference Files

- **Item Bank CSV:** `item_bank_starter.csv` (25 items)
- **Mapping Rules:** Imported via `scripts/import_mapping_rules.sh` (20 rules)
- **Smoke Tests:** `scripts/smoke_test_finance_enforcement.sh`
- **Grafana Dashboard:** `grafana/neuropilot_finance_enforcement_dashboard.json`
- **Integrity Badge Guide:** `docs/INTEGRITY_BADGE_GUIDE.md`
- **Full Documentation:** `FINANCE_ITEM_BANK_README.md`

---

## Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Auto-mapping rate | ≥95% | <90% |
| Needs mapping count | <50 lines | >100 lines |
| Invoice imbalance rate | <5% | >10% |
| Item Bank size | Growing | Stagnant |
| Average invoice delta | <2¢ | >5¢ |

---

## Support

**Questions?** Consult:
1. `FINANCE_ITEM_BANK_README.md` - Complete usage guide
2. `docs/INTEGRITY_BADGE_GUIDE.md` - Balance troubleshooting
3. Verification scripts - Test API functionality

**Bugs or Issues?**
- Run verification scripts to diagnose
- Check Prometheus metrics
- Review server logs

---

## Success Checklist

After completing this guide, you should have:

- [x] 25 items in Item Bank (all ACTIVE)
- [x] 20 mapping rules (all active)
- [x] ≥95% auto-mapping rate
- [x] Green integrity badge (or <5% imbalanced)
- [x] All smoke tests passing
- [x] Grafana dashboard showing metrics
- [x] Needs mapping queue reviewed
- [x] Period summary generated for current month

**Congratulations!** Your NeuroPilot v16.2.0 Finance Enforcement is production-ready. 🎉

---

**Version:** 16.2.0
**Last Updated:** 2025-10-18
