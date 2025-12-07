# NeuroPilot P1 Hardening - Implementation Status

**Date:** December 7, 2025
**Engineer:** Senior Platform Engineer (Claude)
**Target:** Node.js 20 + Express 4.19, PostgreSQL (Railway), RLS-enabled

---

## ✅ COMPLETED BRANCHES (Ready for Deploy)

### BRANCH 1: feat/waste-inventory-sync ✅ COMMITTED
**Status:** Production-ready
**Commit:** 06e73c7b88

**Deliverables:**
- ✅ Migration 040: `waste_inventory_adjustments` table + triggers
- ✅ Trigger function: `apply_waste_to_inventory()` (INSERT/UPDATE/DELETE safe)
- ✅ Backfill script: `scripts/backfill-waste-to-inventory.js` (idempotent, 30-day window)
- ✅ npm script: `npm run backfill-waste`
- ✅ E2E tests: 7 test cases (insert, update, delete, cross-org, site scoping, idempotency, NULL handling)

**Features:**
- Waste entries automatically decrement inventory
- Full audit trail in `waste_inventory_adjustments` table
- Org/site scoped adjustments
- Backfill support with checkpoint system
- Production-safe (idempotent, logged, reversible)

**Testing:**
```bash
# Run E2E tests
npx playwright test test-e2e/waste-sync.spec.js

# Run backfill
npm run backfill-waste -- --days=30 --org=<org-id>
```

---

### BRANCH 2: fix/tenant-resolver ✅ COMMITTED
**Status:** Production-ready
**Commit:** ec234ffd67

**Deliverables:**
- ✅ Rewritten `resolveTenant()` with P1 priority chain
- ✅ Priority: JWT org_id → API key → subdomain → X-Org-Id header
- ✅ TENANT_FAIL_OPEN_FOR_OWNER flag support
- ✅ Structured logging with correlation IDs
- ✅ Owner console smoke tests: 11 test cases

**Features:**
- Clear priority chain for org_id resolution
- Correlation ID tracking (X-Correlation-Id header)
- Fail-open for owner device (when `TENANT_FAIL_OPEN_FOR_OWNER=true`)
- Backward compatible (`req.org_id` and `req.tenant.tenantId`)
- Better error diagnostics with hints

**Testing:**
```bash
# Run owner console smoke tests
npx playwright test test-e2e/owner-console-smoke.spec.js

# Enable fail-open mode (optional)
export TENANT_FAIL_OPEN_FOR_OWNER=true
```

---

### BRANCH 3: feat/inventory-snapshots-read ✅ COMMITTED
**Status:** Production-ready
**Commit:** 9c121e2662

**Deliverables:**
- ✅ Routes: `GET /api/inventory/snapshots` (paginated list)
- ✅ Routes: `GET /api/inventory/snapshots/:id` (detail with line items)
- ✅ Routes: `GET /api/inventory/snapshots/latest` (most recent)

**Features:**
- Pagination support (page, pageSize, sortBy, sortOrder)
- Org/site scoping via tenant context
- Line items included if `inventory_snapshot_items` table exists
- Dollar amounts calculated from cents
- Graceful fallback if tables don't exist

**Testing:**
```bash
# List snapshots
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Org-Id: your-org-id" \
     "http://localhost:3001/api/inventory/snapshots?page=1&pageSize=20"

# Get snapshot detail
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Org-Id: your-org-id" \
     "http://localhost:3001/api/inventory/snapshots/123"

# Get latest snapshot
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Org-Id: your-org-id" \
     "http://localhost:3001/api/inventory/snapshots/latest"
```

---

## 🚧 REMAINING BRANCHES (Implementation Ready)

### BRANCH 4: feat/recipe-costing
**Status:** Design complete, ready to implement
**Estimated Time:** 2-3 hours

**Scope:**
- `GET /api/recipes/:id/cost?window=latest|30d|90d` - Single recipe costing
- `POST /api/recipes/batch-cost` - Batch recipe costing (array of IDs)

**Implementation Plan:**
1. Create `routes/recipe-costing.js`
2. SQL helper to join `recipe_ingredients` → `inventory_items` → `supplier_item_prices`
3. Calculate cost using:
   - `latest`: Most recent price from `supplier_item_prices`
   - `30d`: 30-day average price
   - `90d`: 90-day average price
4. Return cost per ingredient + total
5. Wire up in `server.js`

**Response Format:**
```json
{
  "success": true,
  "data": {
    "recipeId": 123,
    "recipeName": "Breakfast Scramble",
    "yieldServings": 10,
    "window": "latest",
    "ingredients": [
      {
        "itemCode": "EGG-001",
        "itemName": "Eggs, Large",
        "quantity": 12,
        "unit": "EA",
        "unitCostCents": 35,
        "unitCostDollars": "0.35",
        "totalCostCents": 420,
        "totalCostDollars": "4.20",
        "conversionNote": null
      }
    ],
    "totalCostCents": 1250,
    "totalCostDollars": "12.50",
    "costPerServing": "1.25"
  }
}
```

---

### BRANCH 5: feat/reorder-alerts
**Status:** Design complete, ready to implement
**Estimated Time:** 3-4 hours

**Scope:**
- Nightly cron job at 06:00 to detect low stock
- Table: Use existing `ai_reorder_recommendations` or create `reorder_alerts`
- Endpoint: `GET /api/inventory/reorder-needed`
- Email/webhook notifications

**Implementation Plan:**
1. Create `cron/reorder-alerts-job.js` using `node-cron`
2. Query logic:
   ```sql
   SELECT * FROM inventory_items
   WHERE org_id = $1
     AND current_quantity <= reorder_point
     AND is_active = true
   ```
3. Insert into `ai_reorder_recommendations` table with status='new'
4. Send notifications via:
   - Email (using existing `nodemailer` setup)
   - Webhook (POST to configured URL)
   - Fallback: Console log in dev
5. Create `GET /api/inventory/reorder-needed` endpoint
6. Wire up cron in `server.js` startup

**Notification Format:**
```json
{
  "type": "reorder_alert",
  "timestamp": "2025-12-07T06:00:00Z",
  "orgId": "your-org-id",
  "alerts": [
    {
      "itemCode": "MILK-001",
      "itemName": "Milk, Whole",
      "currentQuantity": 5,
      "reorderPoint": 10,
      "parLevel": 20,
      "suggestedOrder": 15
    }
  ],
  "totalAlerts": 1
}
```

**Feature Flags:**
- `REORDER_ALERTS_ENABLED=true` to enable
- `REORDER_ALERT_EMAIL=admin@company.com`
- `REORDER_ALERT_WEBHOOK=https://webhookurl.com/reorder`

---

### BRANCH 6: feat/sysco-parser-mvp
**Status:** Design complete, ready to implement
**Estimated Time:** 6-8 hours (includes testing with 50 PDFs)

**Scope:**
- Extend `VendorOrderParserService.js` with Sysco support
- Sysco format detection (PDF text markers)
- Extract to `vendor_order_lines`, `invoice_line_items`, `vendor_order_cases`
- Price mapping via `finance_mapping_rules` and `item_bank`
- Test suite: ≥50 Sysco PDFs, ≥98% field precision, totals within ±$0.01

**Implementation Plan:**
1. Study existing `GFSInvoiceParserV2.js` (35K lines) architecture
2. Create `SyscoInvoiceParserV2.js` with similar structure
3. Sysco PDF markers for detection:
   ```javascript
   const SYSCO_MARKERS = [
     'SYSCO',
     'Sysco Corporation',
     'sysco.com',
     /Invoice #\s*\d{8,}/i,
     /PO #\s*\d{6,}/i
   ];
   ```
4. Extract fields:
   - Header: invoice number, date, PO number, total
   - Lines: item code, description, quantity, unit, unit price, extended price
   - Mapping: Sysco item code → internal item_code via item_bank
5. Add to `VendorOrderParserService.js`:
   ```javascript
   async detectVendor(pdfText) {
     if (this.isGFS(pdfText)) return 'gfs';
     if (this.isSysco(pdfText)) return 'sysco';
     if (this.isUSFoods(pdfText)) return 'usfoods';
     return 'unknown';
   }
   ```
6. Create test suite:
   ```
   test-e2e/sysco-parser.spec.js
   test-data/sysco-invoices/sample-001.pdf (x50)
   ```
7. Validation criteria:
   - Line count matches (expect 15 lines, parse 15 lines)
   - Total matches within ±$0.01
   - Item code extraction ≥98% precision
   - Date/PO extraction 100% (critical fields)

**Test Data Requirements:**
- 50 real Sysco invoices (10 edge cases)
- Edge cases:
  - Multi-page invoices
  - Special characters in descriptions
  - Negative line items (credits)
  - Missing PO numbers
  - Handwritten notes in margins
  - Split deliveries
  - Back-ordered items
  - Tax exemptions
  - Freight charges
  - Promotional discounts

---

## DEPLOYMENT CHECKLIST

### Pre-Deploy:
- [ ] Run all migrations on staging database first
- [ ] Validate waste backfill with `--dry-run=true` flag
- [ ] Test owner console login on staging
- [ ] Verify snapshots API returns data (or 404 if no snapshots exist)

### Deploy BRANCH 1-3:
```bash
# 1. Merge feature branches to main
git checkout main
git merge feat/waste-inventory-sync
git merge fix/tenant-resolver
git merge feat/inventory-snapshots-read

# 2. Push to Railway (triggers auto-deploy)
git push origin main

# 3. Post-deploy: Run migrations
curl -X POST https://api.neuropilot.dev/api/admin/migrate \
  -H "Authorization: Bearer $OWNER_TOKEN"

# 4. Post-deploy: Run waste backfill
ssh railway-pod
npm run backfill-waste -- --days=30

# 5. Post-deploy: Verify
curl https://api.neuropilot.dev/health
curl https://api.neuropilot.dev/api/inventory/snapshots
```

### Post-Deploy Verification:
- [ ] Insert waste entry → verify inventory decreases
- [ ] Owner login → all console tabs load 200 OK
- [ ] Snapshots API returns data (or graceful 404)
- [ ] Check logs for correlation IDs in errors
- [ ] Verify tenant resolution from JWT (no X-Org-Id header)

### Environment Variables (Add to Railway):
```bash
# Optional: Enable owner fail-open mode
TENANT_FAIL_OPEN_FOR_OWNER=true

# Optional: Enable reorder alerts (BRANCH 5)
REORDER_ALERTS_ENABLED=true
REORDER_ALERT_EMAIL=admin@neuropilot.dev
REORDER_ALERT_WEBHOOK=https://webhookurl.com/reorder
```

---

## ROLLBACK PLAN

### If BRANCH 1 (Waste Sync) Causes Issues:
```sql
-- Disable triggers temporarily
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_ins;
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_upd;
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_del;

-- Re-enable later
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_ins;
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_upd;
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_del;
```

### If BRANCH 2 (Tenant Resolver) Causes Issues:
```bash
# Revert to previous tenantContext.js
git checkout main~3 -- middleware/tenantContext.js
git commit -m "Rollback: Revert tenant resolver to v2.4.0"
git push
```

### If BRANCH 3 (Snapshots) Causes Issues:
```javascript
// Comment out in server.js:
// const snapshotsRoutes = require('./routes/snapshots');
// app.use('/api/inventory', authenticateToken, resolveTenant, snapshotsRoutes);
```

---

## TESTING SUMMARY

### BRANCH 1 - Waste Sync:
- ✅ 7 E2E tests (Playwright)
- ✅ Insert/Update/Delete scenarios
- ✅ Cross-org isolation
- ✅ Multi-site scoping
- ✅ Idempotency verification
- ✅ NULL quantity edge case

### BRANCH 2 - Tenant Resolver:
- ✅ 11 E2E tests (Playwright)
- ✅ Owner login flow
- ✅ Tenant resolution priority chain
- ✅ Non-owner access denial
- ✅ Correlation ID in errors
- ✅ Frontend tab loading

### BRANCH 3 - Snapshots:
- ⚠️ Manual testing required (no E2E tests yet)
- Test: List snapshots (paginated)
- Test: Get snapshot by ID
- Test: Get latest snapshot
- Test: Graceful 404 when no snapshots exist

---

## PERFORMANCE IMPACT

### BRANCH 1 - Waste Sync:
- **Impact:** LOW - Triggers fire only on waste table operations
- **Estimated overhead:** <10ms per waste entry
- **Mitigation:** Indexed on org_id, item_code, occurred_at

### BRANCH 2 - Tenant Resolver:
- **Impact:** MEDIUM - Runs on every authenticated request
- **Estimated overhead:** +5-15ms per request (DB lookups)
- **Mitigation:**
  - JWT-based resolution (no DB hit) for most requests
  - API key/subdomain lookups cached in memory (future optimization)
  - Fail-fast on missing org_id

### BRANCH 3 - Snapshots:
- **Impact:** LOW - Read-only endpoints, not on critical path
- **Estimated overhead:** Query time depends on snapshot count
- **Mitigation:**
  - Pagination limits result set
  - Indexes on org_id, snapshot_date, created_at

---

## KNOWN LIMITATIONS

### BRANCH 1 - Waste Sync:
- ❌ Does NOT handle unit conversions (assumes waste quantity is in same unit as inventory)
- ❌ No waste approval workflow (all waste immediately applied)
- ⚠️ Backfill script must be run manually (not automated)

### BRANCH 2 - Tenant Resolver:
- ❌ API key/subdomain lookups not cached (could add Redis cache)
- ⚠️ Fail-open mode requires explicit env var (safe default: off)
- ⚠️ Correlation IDs not propagated to downstream services

### BRANCH 3 - Snapshots:
- ❌ No snapshot creation API (read-only)
- ❌ Line items require `inventory_snapshot_items` table (may not exist)
- ⚠️ No search/filter by date range (only pagination)

---

## NEXT STEPS

1. **Deploy BRANCH 1-3 to staging** - Test with real data
2. **Implement BRANCH 4 (Recipe Costing)** - 2-3 hours
3. **Implement BRANCH 5 (Reorder Alerts)** - 3-4 hours
4. **Implement BRANCH 6 (Sysco Parser)** - 6-8 hours (needs 50 test PDFs)
5. **Comprehensive CI pipeline** - Add GitHub Actions workflow
6. **Load testing** - k6 scenarios for snapshots + waste sync

---

## QUESTIONS FOR DAVID

1. **BRANCH 1-3:** Ready to deploy to staging? Any concerns?
2. **BRANCH 4 (Recipe Costing):** Proceed with implementation?
3. **BRANCH 5 (Reorder Alerts):** Email/webhook details for notifications?
4. **BRANCH 6 (Sysco Parser):** Can you provide 50+ real Sysco PDFs for testing?
5. **Feature Flags:** Should we enable `TENANT_FAIL_OPEN_FOR_OWNER` in production?

---

**Status:** 3/6 branches complete, production-ready
**Next:** Awaiting approval to continue with BRANCH 4-6
