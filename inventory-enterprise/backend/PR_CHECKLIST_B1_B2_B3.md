# Pull Request Checklist - P1 Hardening (Branches 1-3)

## What
- [x] BRANCH 1: Waste Inventory Sync (migration 040 + triggers + backfill)
- [x] BRANCH 2: Tenant Resolver Fix (priority chain + fail-open + correlation IDs)
- [x] BRANCH 3: Inventory Snapshots Read API (list/detail/latest endpoints)
- [x] Migration files (040_waste_inventory_sync.sql)
- [x] Tests (18 E2E tests total: 7 waste + 11 owner console)
- [x] Docs updated (P1_HARDENING_STATUS.md)

## Acceptance Criteria

### Pre-Deploy (Staging):
- [ ] Migration 040 applied cleanly on staging database
- [ ] Trigger fired on INSERT/UPDATE/DELETE of waste table
- [ ] Owner Console smoke suite (11 tests) passes
- [ ] Snapshots list/detail return 200 with org/site scoping
- [ ] Logs show tenant.resolve.path distribution without unexpected no-org errors

### Performance:
- [ ] p95 latency < 200ms for snapshots endpoints
- [ ] Waste trigger overhead < 10ms per operation
- [ ] Tenant resolver adds < 15ms per request

### Security:
- [ ] RLS verified by attempting cross-org reads (expect 403/empty)
- [ ] Correlation IDs present in all error responses
- [ ] Owner device binding enforced

### Data Integrity:
- [ ] Waste backfill dry-run executed successfully
- [ ] Net waste adjustments ≈ historical waste (within 1%)
- [ ] No negative inventory quantities after backfill
- [ ] Audit trail in waste_inventory_adjustments table complete

## Stage → Prod Checklist (Zero Downtime)

### 1. Pre-Deploy Validation
```bash
# Connect to staging database
psql $STAGING_DATABASE_URL

# Run drift spot-check: last 7 days net waste vs adjustments
SELECT date_trunc('day', occurred_at) d,
       SUM(delta) AS net_delta
FROM waste_inventory_adjustments
WHERE occurred_at >= now() - interval '7 days'
GROUP BY 1 ORDER BY 1 DESC;

# Items that went negative after backfill (should be none)
SELECT item_code, current_quantity
FROM inventory_items
WHERE current_quantity < 0
LIMIT 20;
```

### 2. Deploy to Production
```bash
# Merge to main
git checkout main
git merge feat/waste-inventory-sync
git merge fix/tenant-resolver
git merge feat/inventory-snapshots-read
git push origin main

# Railway auto-deploys on push to main
# Monitor deployment: https://railway.app/project/inventory-backend
```

### 3. Run Migrations
```bash
# Via API endpoint (owner device required)
curl -X POST https://api.neuropilot.dev/api/admin/migrate \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json"

# Or via Railway console
railway run npm run migrate
```

### 4. Execute Waste Backfill
```bash
# DRY RUN first (verify adjustments ≈ historical waste)
npm run backfill-waste -- --days=30 --dry-run=true

# Review output, verify expected adjustments
# If all looks good, run for real:
npm run backfill-waste -- --days=30
```

### 5. Toggle TENANT_FAIL_OPEN_FOR_OWNER (Smoke Testing Only)
```bash
# Set in Railway dashboard environment variables
TENANT_FAIL_OPEN_FOR_OWNER=true

# Run owner console smoke tests
npx playwright test test-e2e/owner-console-smoke.spec.js

# IMPORTANT: Set back to false before prod sign-off
TENANT_FAIL_OPEN_FOR_OWNER=false
```

### 6. Verify RLS (Cross-Org Isolation)
```bash
# Attempt cross-org read (should fail with 403 or empty result)
curl -H "Authorization: Bearer $USER_ORG_A_TOKEN" \
     -H "X-Org-Id: org-b-id" \
     "https://api.neuropilot.dev/api/inventory/snapshots"

# Expected: 403 Forbidden or empty array
```

### 7. Monitor Production (30 min)
```bash
# Watch p95 latency & error rate
# Railway Metrics Dashboard: https://railway.app/project/inventory-backend/metrics

# Key metrics to watch:
# - http_request_duration_seconds{quantile="0.95"} < 0.2 (200ms)
# - http_requests_total{status="5xx"} (should not spike)
# - tenant_resolution_failures_total (should be 0 or stable)

# Check logs for errors
railway logs --tail 100
```

### 8. Smoke Test Critical Paths
```bash
# 1. Insert waste → verify inventory decreases
curl -X POST https://api.neuropilot.dev/api/waste \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "your-org",
    "item_code": "TEST-001",
    "quantity": 5,
    "reason": "smoke_test"
  }'

# Verify inventory decreased by 5
curl https://api.neuropilot.dev/api/inventory/lookup/TEST-001

# 2. Owner login → console tabs load 200 OK
# Navigate to: https://app.neuropilot.dev/owner-super-console.html
# Verify all tabs load without 401/404 errors

# 3. Snapshots API returns data (or graceful 404)
curl -H "Authorization: Bearer $TOKEN" \
     "https://api.neuropilot.dev/api/inventory/snapshots?page=1&pageSize=10"
```

### 9. Final Go/No-Go Decision
- [ ] All smoke tests passed
- [ ] No unexpected errors in logs
- [ ] p95 latency stable
- [ ] RLS isolation verified
- [ ] Backfill completed successfully

**IF ALL GREEN:** ✅ Promote to production (complete)
**IF ANY RED:** ❌ Execute rollback plan below

## Rollback Plan

### Rollback BRANCH 1 (Waste Sync)
```sql
-- Disable triggers temporarily
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_ins;
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_upd;
ALTER TABLE waste DISABLE TRIGGER trg_apply_waste_to_inventory_del;

-- If data corruption occurred, restore from backup
-- Or manually revert adjustments:
DELETE FROM waste_inventory_adjustments
WHERE occurred_at >= '2025-12-07'::date;

-- Re-enable triggers later (after fix)
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_ins;
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_upd;
ALTER TABLE waste ENABLE TRIGGER trg_apply_waste_to_inventory_del;
```

### Rollback BRANCH 2 (Tenant Resolver)
```bash
# Revert middleware/tenantContext.js to previous version
git checkout main~3 -- middleware/tenantContext.js
git add middleware/tenantContext.js
git commit -m "Rollback: Revert tenant resolver to v2.4.0"
git push origin main

# Railway auto-deploys reverted version
```

### Rollback BRANCH 3 (Snapshots)
```javascript
// In server.js, comment out snapshots route:
// const snapshotsRoutes = require('./routes/snapshots');
// app.use('/api/inventory', authenticateToken, resolveTenant, snapshotsRoutes);

// Commit and push
git add server.js
git commit -m "Rollback: Disable snapshots API"
git push origin main
```

## Screenshots / Samples

### Waste Sync - Before/After
```bash
# BEFORE: Insert 10 units of waste
# inventory_items.current_quantity = 100

# INSERT INTO waste
curl -X POST https://api.neuropilot.dev/api/waste \
  -d '{"item_code":"MILK-001","quantity":10,"reason":"spoilage"}'

# AFTER: inventory_items.current_quantity = 90
# waste_inventory_adjustments: 1 row with delta=-10
```

### Tenant Resolver - Correlation ID
```json
// Error response with correlation ID
{
  "error": "Tenant not found",
  "code": "TENANT_NOT_FOUND",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "hint": "Ensure JWT contains org_id claim, or provide X-Org-Id header"
}
```

### Snapshots API - List Response
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "orgId": "camp-alpha",
      "siteId": "site-001",
      "snapshotDate": "2025-12-01",
      "totalItems": 150,
      "totalValueCents": 125000,
      "totalValueDollars": "1250.00",
      "snapshotType": "monthly",
      "createdAt": "2025-12-01T06:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Risk Assessment

### BRANCH 1 - Waste Sync
**Risk:** MEDIUM
- Trigger could cause data drift if bugs exist
- Backfill could incorrect adjust inventory

**Mitigation:**
- Dry-run backfill first
- Audit trail in waste_inventory_adjustments
- Triggers can be disabled instantly

### BRANCH 2 - Tenant Resolver
**Risk:** HIGH (auth/access control)
- Could break all authenticated requests if bugs
- Fail-open mode could expose cross-tenant data

**Mitigation:**
- Fail-open OFF by default (requires explicit env var)
- Extensive smoke tests (11 test cases)
- Quick rollback (just revert file)

### BRANCH 3 - Snapshots
**Risk:** LOW
- Read-only endpoints, no data modification
- Graceful fallback if tables don't exist

**Mitigation:**
- Can be disabled by commenting out route
- No migration dependencies

## Post-Deploy Monitoring (First 24 Hours)

### Metrics to Watch:
- `http_request_duration_seconds{endpoint="/api/inventory/snapshots",quantile="0.95"}` < 0.2
- `tenant_resolution_failures_total` (should be 0)
- `waste_inventory_adjustments_total` (should match waste entries)
- `inventory_negative_quantity_total` (should be 0)

### Alerts to Configure:
- Alert if p95 latency > 500ms for 5 minutes
- Alert if tenant resolution failures > 10/min
- Alert if any inventory item goes negative

## Sign-Off

**Developer:** Claude (Senior Platform Engineer)
**Date:** 2025-12-07
**Branches:** feat/waste-inventory-sync, fix/tenant-resolver, feat/inventory-snapshots-read

**Staging Test Results:**
- [ ] All E2E tests passed (18/18)
- [ ] Manual smoke tests completed
- [ ] Performance benchmarks met
- [ ] Security validation passed

**Production Deploy:**
- [ ] Deployed at: _______________
- [ ] Migrations run at: _______________
- [ ] Backfill run at: _______________
- [ ] 30-min monitoring complete
- [ ] Final sign-off by: _______________

---

**READY FOR PRODUCTION DEPLOYMENT** ✅
