# Changelog

All notable changes to NeuroPilot Inventory Enterprise System.

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
