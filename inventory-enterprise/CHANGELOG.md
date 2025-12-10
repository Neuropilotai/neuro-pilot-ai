# Changelog

All notable changes to NeuroPilot Inventory Enterprise System.

## [23.6.12] - 2025-12-09

### 🔒 Security - CSP Strict Mode Enabled

#### Complete CSP Refactor - Remove 'unsafe-inline'
- **Achievement:** Converted all 143 inline event handlers to CSP-compliant `addEventListener` pattern
- **Details:**
  - **Phase 1-5:** Converted 100 static handlers (tab nav, buttons, modals, filters)
  - **Phase 6:** Converted 43 dynamic innerHTML handlers
  - **Form handlers:** 5 onsubmit handlers handled dynamically by `setupEventListeners`
  - **Total:** 143 handlers converted, 0 onclick handlers remaining
- **CSP Updates:**
  - Removed `'unsafe-inline'` from `scriptSrc` directive
  - Removed `'unsafe-eval'` from `scriptSrc` directive
  - Changed `scriptSrcAttr` from `['unsafe-inline']` to `['none']`
  - Strict CSP mode now enabled
- **Features Added:**
  - Scroll-to functionality: `data-scroll-to` attribute support
  - Helper functions: `openUrl()`, `scrollToElement()`, `closeParentCard()`, `reloadPage()`
  - Enhanced argument parsing: supports comma-separated args and escaped quotes
  - Automatic form onsubmit conversion at runtime
- **Files:** `backend/public/owner-super-console-v15.html`, `backend/public/js/owner-console-core.js`, `backend/public/js/owner-super-console.js`, `backend/server-v21_1.js`
- **Documentation:** `CSP_TESTING_GUIDE.md`, `CSP_REFACTOR_COMPLETE.md`

## [23.6.11] - 2025-12-09

### 🐛 Critical Bug Fixes

#### Owner Console Authentication (401 Errors)
- **Fixed Function Conflict**: Removed duplicate `loadAIOpsStatus()` function in `owner-console-core.js` that was calling wrong endpoint
- **Fixed Authentication Headers**: Updated `authHeaders()` to prioritize `np_owner_jwt` and include `X-Owner-Device` header
- **Fixed Route Middleware**: Updated all owner routes to use `authenticateToken` + `requireOwnerDevice` instead of `authGuard(['owner'])`
- **Fixed Dockerfile Build**: Ensured `backend/public/` (updated HTML v23.6.11) takes precedence over `frontend/public/` (old HTML v23.5.1)

#### Cache-Busting Improvements
- **Version Bump**: Updated to v23.6.11 with timestamp-based cache busting
- **Server-Side Headers**: Added `no-cache, no-store, must-revalidate` headers for all `.js` files
- **Client-Side Version Check**: Added automatic version detection with auto-reload if wrong version detected
- **Service Worker Unregister**: Added script to unregister service workers that might cache old versions

### ✨ New Features

#### Usage Report Viewer
- **Implemented**: Full usage report viewer with stats, summary, and detailed items table
- **Features**: Shows opening, purchases, closing, and usage quantities per item
- **Anomaly Detection**: Highlights items with negative usage anomalies and items not counted
- **CSV Export**: Added export functionality for usage reports
- **Location**: `backend/public/js/owner-super-console.js` (resolves TODO at line 4684)

### 🔧 Infrastructure

#### Dockerfile Improvements
- **Fixed Copy Order**: Ensured `backend/public/` is copied last to override `frontend/public/` files
- **Build Optimization**: Updated comments explaining file copy precedence

#### Testing & Verification
- **Added Test Script**: `scripts/test-owner-endpoints.sh` for automated endpoint testing
- **Added Verification Script**: `scripts/verify-railway-deployment.sh` for deployment verification
- **Documentation**: Created comprehensive guides for troubleshooting and verification

### 📝 Documentation

#### New Documentation Files
- `COMPLETE_FIX_SUMMARY.md` - Complete summary of all fixes
- `401_FIX_COMPLETE.md` - 401 error fix details
- `RAILWAY_DEPLOYMENT_ISSUE.md` - Diagnostic guide for deployment issues
- `NEXT_TODO_ITEMS.md` - Prioritized TODO list
- `IMMEDIATE_BROWSER_FIX.md` - Browser cache clearing guide

### 🔄 Files Changed

#### Modified Files
- `backend/public/js/owner-console-core.js` - Removed duplicate function, fixed auth headers
- `backend/public/js/owner-super-console.js` - Fixed auth headers, implemented usage report viewer
- `backend/server-v21_1.js` - Updated route middleware, added cache headers
- `backend/routes/owner-ops.js` - Removed redundant middleware
- `backend/public/owner-super-console-v15.html` - Version bump, version check script, service worker unregister
- `Dockerfile` - Fixed file copy order to ensure correct HTML version

#### New Files
- `scripts/test-owner-endpoints.sh` - Endpoint testing script
- `scripts/verify-railway-deployment.sh` - Deployment verification script
- Multiple documentation files (see above)

### ⚠️ Breaking Changes

None - This is a bug fix release.

### 🎯 Upgrade Path

#### From v23.6.8 or earlier
1. Pull latest code: `git pull origin main`
2. Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
3. Re-login via `/quick_login.html` to get fresh token
4. Verify version: Check console for `✅ Correct version loaded: 23.6.11`

### 🧪 Testing

#### Automated
- Railway deployment verification script
- Owner endpoint testing script

#### Manual Testing Required
- Verify `/api/owner/ops/status` returns 200 (no 401 errors)
- Verify all owner console endpoints work correctly
- Test usage report viewer functionality

---

## [14.4.0] - 2025-10-12

### 🎉 Major Features

#### Console Unification Complete
- **Retired Legacy Console**: `owner-console.html` now permanently redirects (301) to `owner-super-console.html`
- **Telemetry Tracking**: All legacy console accesses are logged for monitoring bookmark usage
- **Single Source of Truth**: owner-super-console.html is now the only owner UI

#### AI Intelligence Index
- **New Metric**: Composite learning signals score (0-100) with 7 weighted categories:
  - Menu patterns (35%)
  - Population/demand (25%)
  - Waste reduction (10%)
  - Seasonality (10%)
  - Contractor patterns (10%)
  - FIFO compliance (5%)
  - Lead-time optimization (5%)
- **Dashboard Integration**: Added to `/api/owner/dashboard` with trend analysis
- **Console Display**: Prominently featured in Cognitive Overview section with color coding
- **Trend Analysis**: Week-over-week comparison with arrow indicators

#### Kubernetes-Style Health Probes
- **`/healthz`**: Liveness probe - Returns server uptime
- **`/readyz`**: Readiness probe - Validates database connection and critical services
- **Deployment Ready**: Full support for Fly.io, Render, and Kubernetes zero-downtime deploys

#### Inventory Playground API
- **New Endpoint**: `GET /api/owner/inventory/playground`
- **Purpose**: Provides unassigned inventory items for bulk updates and experimentation
- **Owner-Only**: Device-bound security enforcement

### 🔒 Security Enhancements

#### Content Security Policy (CSP)
- Enhanced helmet configuration with strict CSP directives
- WebSocket support for real-time features
- Referrer policy set to "no-referrer"
- HSTS enabled with 1-year max-age and preload

#### Rate Limiting
- **Job Trigger Protection**: 10 triggers per minute per IP address
- **HTTP 429 Response**: Clear error messages with reset time
- **Prevents Abuse**: Guards against malicious automation

### 🐛 Bug Fixes

#### Phase3CronScheduler AI Class Instantiation
- **Fixed**: MenuPredictor and FeedbackTrainer were being called as static methods
- **Solution**: Properly instantiate classes with database connection
- **Locations Fixed**:
  - Scheduled forecast job (line 133)
  - Scheduled learning job (line 209)
  - Watchdog forecast recovery (line 483)
  - Watchdog learning recovery (line 516)
  - Manual forecast trigger (line 718)
  - Manual learning trigger (line 742)
- **Impact**: AI jobs now execute correctly when triggered

### 📊 API Changes

#### New Endpoints
- `GET /healthz` - Liveness probe (public)
- `GET /readyz` - Readiness probe (public)
- `GET /api/owner/inventory/playground` - Unassigned items API (owner-only, rate-limited)

#### Modified Endpoints
- `GET /api/owner/dashboard` - Now includes `ai_intelligence_index` object with trend data
- `POST /api/owner/ops/trigger/:job` - Now rate-limited (10/minute)

#### Redirect Endpoints
- `GET /owner-console.html` → 301 redirect to `/owner-super-console.html`
- `GET /owner-console` → 301 redirect to `/owner-super-console.html`

### 📝 Version Updates

All version strings updated to **v14.4.0**:
- `backend/server.js:10,200,337` - Server version constant and health response
- `backend/routes/owner.js:8` - Owner routes version comment
- `frontend/owner-super-console.html:248` - Console UI version display

### 📦 Files Changed

#### New Files
- `backend/routes/owner-inventory.js` (50 lines) - Playground endpoint
- `backend/scripts/verify_v14_4_deploy.sh` (150 lines) - Post-deploy verification
- `backend/trigger_ai_jobs.js` (74 lines) - Manual job trigger utility
- `/tmp/V14_4_UPGRADE_COMPLETE.md` - Complete upgrade documentation

#### Modified Files
- `backend/server.js` (+50 lines) - Health probes, CSP, 301 redirects
- `backend/routes/owner-ops.js` (+45 lines) - AI Intelligence Index, rate limiting
- `backend/routes/owner.js` (+15 lines) - Dashboard AI Index integration
- `backend/cron/phase3_cron.js` (+35 lines) - AI class instantiation fixes
- `frontend/owner-super-console.html` (+30 lines) - AI Index UI display
- `frontend/owner-console-core.js` (+60 lines) - Load and display AI Index

**Total**: ~385 lines of new/modified code

### 🎯 Upgrade Path

#### From v14.3.x
1. Update codebase: `git pull`
2. Restart server: `npm start`
3. Verify deployment: `bash scripts/verify_v14_4_deploy.sh`
4. Update bookmarks: Change `owner-console.html` → `owner-super-console.html`

#### Database Migrations
No database changes required. System gracefully handles missing AI tables with fallback logic.

### ⚠️ Breaking Changes

#### Console URL Change
- **Old**: `http://localhost:8083/owner-console.html`
- **New**: `http://localhost:8083/owner-super-console.html`
- **Impact**: Automatic 301 redirect - update bookmarks to avoid redirect overhead

#### Phase3CronScheduler API
- Internal changes only - no external API impact
- AI jobs now properly instantiate classes instead of calling non-existent static methods

### 📈 Performance Improvements

- **Console Code Reduction**: From 3,242 lines to 1,720 lines (47% reduction)
- **External CSS**: Moved inline styles to `owner-console.css` for browser caching
- **Rate Limiting**: Prevents server overload from automated job triggers

### 🧪 Testing

#### Automated Checks
- Health endpoint validation (`/healthz`, `/readyz`)
- Console redirect verification (301 status)
- File existence checks
- Phase3Cron code validation

#### Manual Testing Required
- Login to owner console and verify AI Intelligence Index displays
- Trigger forecast/learning jobs and verify execution
- Check governance banner color coding

### 📚 Documentation

- [V14_4_UPGRADE_COMPLETE.md](/tmp/V14_4_UPGRADE_COMPLETE.md) - Full technical documentation
- [Console Unification v14.3.3](/tmp/CONSOLE_UNIFICATION_V14_3_3_COMPLETE.md) - Previous console work
- [Quick Start Guide](/tmp/QUICK_START_UNIFIED_CONSOLE.md) - User guide

### 🙏 Contributors

- **Claude Code (Sonnet 4.5)** - Implementation, testing, documentation
- **David Mikulis** - Product requirements, review, deployment

---

## [14.3.3] - 2025-10-12

### Console Unification (Previous Release)
- Created `owner-console-unified.html` merging both consoles
- Extracted CSS to `owner-console.css` (815 lines)
- Added governance monitoring with auto-check every 60s
- Full accessibility support (ARIA, keyboard shortcuts)

---

## [13.5.0] - 2025-10-11

### AI Ops Health Enhancements
- Added Data Quality Index (DQI) computation
- Implemented Predictive Health metrics
- Added Fiscal Calendar integration
- Enhanced self-healing watchdog

---

## Earlier Versions
See git history for versions prior to v13.5.0

[14.4.0]: https://github.com/neuropilotai/inventory-enterprise/compare/v14.3.3...v14.4.0
[14.3.3]: https://github.com/neuropilotai/inventory-enterprise/compare/v13.5.0...v14.3.3
[13.5.0]: https://github.com/neuropilotai/inventory-enterprise/releases/tag/v13.5.0
