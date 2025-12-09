# Next TODO Items

## 🎯 Priority 1 - Immediate (401 Fix Verification)

### 1. Verify 401 Errors Resolved in Production ✅
**Status:** Pending user verification  
**Action Required:**
- [ ] Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- [ ] Check browser console for: `✅ Correct version loaded: 23.6.11`
- [ ] Verify `/api/owner/ops/status` returns `200` (no 401 errors)
- [ ] Test other owner endpoints: `/api/owner/dashboard/stats`, `/api/owner/reports/finance`

**Verification Script:**
```bash
./scripts/verify-railway-deployment.sh
```

---

## 🔧 Priority 2 - Code TODOs

### 2. Implement Usage Report Viewer
**Location:** `backend/public/js/owner-super-console.js` line 4684  
**Status:** TODO comment found  
**Description:** Need to implement usage report viewer functionality

**Action:**
- [ ] Review existing report viewers in owner console
- [ ] Design usage report viewer UI
- [ ] Implement API endpoint for usage data
- [ ] Add viewer to owner console

### 3. Refactor Inline Event Handlers for CSP Compliance
**Location:** `backend/server.js` line 193  
**Status:** TODO comment - CSP allows `'unsafe-inline'`  
**Description:** Refactor inline event handlers (onclick, etc.) to use `addEventListener` for better CSP compliance

**Action:**
- [ ] Audit all inline event handlers in HTML files
- [ ] Convert to `addEventListener` in JavaScript
- [ ] Remove `'unsafe-inline'` from CSP policy
- [ ] Test all functionality still works

**Files to Update:**
- `backend/public/owner-super-console-v15.html`
- `backend/public/js/owner-super-console.js`
- `backend/server.js` (CSP configuration)

---

## 🧪 Priority 3 - Testing

### 4. Test All Owner Console Endpoints
**Status:** Should be done after 401 fix verification  
**Action:**
- [ ] Test `/api/owner/ops/status` - Should return 200
- [ ] Test `/api/owner/dashboard/stats` - Should return 200
- [ ] Test `/api/owner/reports/finance` - Should return 200
- [ ] Test `/api/owner/pdfs` - Should return 200 or 403 (if no PDFs)
- [ ] Test `/api/owner/config` - Should return 200
- [ ] Verify all requests include correct headers:
  - `Authorization: Bearer <token>`
  - `X-Owner-Device: <device-id>`

---

## 📝 Priority 4 - Documentation

### 5. Update CHANGELOG.md and package.json
**Status:** Pending  
**Action:**
- [ ] Update `CHANGELOG.md` with v23.6.11 changes:
  - Function conflict resolution
  - Authentication header fixes
  - Dockerfile build fix
  - Cache-busting improvements
- [ ] Update `package.json` version to `23.6.11`
- [ ] Document breaking changes (if any)
- [ ] Document new features

---

## 🚀 Priority 5 - Future Features (from V2.4.0 Status)

### 6. Update API Routes with Tenant Scoping
**Status:** From V2.4.0 PASS G status  
**Priority:** High (required for production)  
**Action:**
- [ ] Update `routes/inventory.js` with tenant scoping
- [ ] Update `routes/orders.js` with tenant scoping
- [ ] Verify cross-tenant isolation
- [ ] Test with multiple tenants

### 7. Create Tenant Management Endpoints
**Status:** From V2.4.0 next steps  
**Priority:** Medium  
**Action:**
- [ ] Create `routes/tenants.js`
- [ ] Implement CRUD operations for tenants
- [ ] Add authentication/authorization
- [ ] Add to owner console UI

### 8. Create Role Management Endpoints
**Status:** From V2.4.0 next steps  
**Priority:** Medium  
**Action:**
- [ ] Create `routes/roles-api.js`
- [ ] Implement CRUD operations for roles
- [ ] Add permission management
- [ ] Add to owner console UI

### 9. Extend Metrics Exporter
**Status:** From V2.4.0 next steps  
**Priority:** Medium  
**Action:**
- [ ] Extend `utils/metricsExporter.js` with new metrics
- [ ] Add tenant-specific metrics
- [ ] Add RBAC metrics
- [ ] Update Grafana dashboards

### 10. Create Integration Tests
**Status:** From V2.4.0 next steps  
**Priority:** High (required for confidence)  
**Action:**
- [ ] Create test suite for owner console
- [ ] Test authentication flows
- [ ] Test API endpoints
- [ ] Test tenant isolation
- [ ] Aim for ≥85% coverage

---

## 📊 Summary

**Immediate (Do Now):**
1. Verify 401 fix in production
2. Test all owner console endpoints

**Short Term (This Week):**
3. Implement usage report viewer
4. Refactor inline event handlers for CSP
5. Update CHANGELOG and package.json

**Medium Term (This Month):**
6. Update API routes with tenant scoping
7. Create tenant/role management endpoints
8. Extend metrics exporter
9. Create integration tests

---

**Last Updated:** December 9, 2025  
**Next Review:** After 401 fix verification complete

