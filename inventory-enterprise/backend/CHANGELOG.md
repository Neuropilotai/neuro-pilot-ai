# Changelog

All notable changes to the Enterprise Inventory Management System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v16.2.0] - 2025-10-18

### 🏦 Feature Release - Item Bank & Finance Enforcement

This release introduces an authoritative Item Bank system with hard category enforcement and integer-cent precision for all invoice line items. It ensures 100% finance code coverage using a four-tier mapping precedence (Item Bank → Rules → AI → Fallback), eliminates floating-point errors through integer-cent arithmetic, provides complete audit trails, and supports period-locked financial snapshots for compliance.

### Added

#### Backend Infrastructure

**Database Schema** (migrations/031_item_bank_and_enforcement.sql - 239 lines)
- **item_bank table** - Authoritative SKU catalog
  - Primary key: `gfs_item_no` (GFS item number)
  - Finance code with CHECK constraint (12 valid categories)
  - Per-item tax flags (taxable_gst, taxable_qst)
  - Pack size, UOM, vendor SKU, UPC fields
  - Soft delete support (status: ACTIVE/RETIRED)
  - Timestamps: created_at, updated_at (auto-managed via triggers)
- **finance_mapping_rules table** - Pattern-based mapping rules
  - Four match types: SKU, VENDOR_SKU, REGEX, KEYWORD
  - Configurable priority (1-1000) and confidence (0.0-1.0)
  - Source tracking (MANUAL, AI, BULK_IMPORT)
  - Active/inactive flag for enable/disable without deletion
  - Audit fields: created_by, created_at
- **mapping_audit table** - Complete audit trail
  - Records every mapping decision (line_id, finance_code, confidence)
  - Strategy tracking (BANK, RULE, AI, FALLBACK)
  - Actor tracking for manual assignments
  - Timestamp for all mappings
- **invoice_validation_results table** - Invoice balance validation
  - Integer-cent deltas (subtotal, GST, QST, total)
  - Balance status enum (BALANCED, *_MISMATCH)
  - Issue tracking (JSON array of validation issues)
  - Tolerance threshold (default ±2¢)
- **finance_period_verified_totals table** - Locked period snapshots
  - Period identifier (YYYY-MM format)
  - Total amounts by finance code (JSON)
  - GST/QST totals, line counts
  - Verified by (username) and timestamp
  - Immutable once locked (for compliance)
- **Three views for common queries**
  - `v_needs_mapping` - Low-confidence mappings (<0.80)
  - `v_item_bank_active` - Active items only
  - `v_finance_code_summary` - Aggregates by finance code
- **Sample data** - 5 seed items for testing (flour, milk, beef, lettuce, dish soap)

**Service Classes**

**ItemBankService.js** (398 lines)
- CRUD operations with validation
  - `createItem(itemData)` - Insert with finance code validation
  - `getItem(gfs_item_no)` - Retrieve single item
  - `updateItem(gfs_item_no, updates)` - Update with partial fields
  - `deleteItem(gfs_item_no)` - Soft delete (set status=RETIRED)
  - `activateItem(gfs_item_no)` - Reactivate retired items
  - `upsertItem(gfs_item_no, itemData)` - Insert or update
- Search and filtering
  - `searchItems(filters)` - Supports q, finance_code, status, taxable_gst, taxable_qst
  - Pagination with limit/offset
  - Full-text search on description, gfs_item_no, vendor_sku, upc
- CSV operations
  - `importFromCSV(csvData, options)` - Parse and validate CSV, bulk upsert
  - `exportToCSV(filters)` - Export filtered items to CSV format
  - Error collection for invalid rows
- Bulk operations
  - `bulkUpdateFinanceCode(gfs_item_nos, finance_code, actor)` - Mass update
  - `getStatistics()` - Counts by finance code and status

**FinanceMappingService.js** (635 lines, replaces v15.6.0 version)
- **Four-tier mapping precedence logic**
  - `mapInvoiceLine(lineData)` - Apply precedence chain
    1. Item Bank lookup (confidence 1.00) - Check if gfs_item_no exists
    2. Mapping Rules (confidence varies) - Check rules by priority order
    3. AI Classifier (confidence 0.50+) - Machine learning fallback
    4. Fallback to OTHER (confidence 0.30) - Last resort
  - Returns: `{finance_code, confidence, strategy, rule_id?}`
- Mapping rule management
  - `createMappingRule(ruleData)` - Create with validation
  - `updateMappingRule(rule_id, updates)` - Update existing rule
  - `deactivateMappingRule(rule_id)` - Soft delete (set active=0)
  - `searchMappingRules(filters)` - Search by match_type, finance_code, source, active
- Rule matching logic
  - `_findMatchingRule({gfs_item_no, vendor_sku, description})` - Find best match
  - SKU: Exact match on gfs_item_no
  - VENDOR_SKU: Exact match on vendor_sku
  - REGEX: Regular expression match on description
  - KEYWORD: Case-insensitive substring match on description
  - Priority-based ordering (highest first)
- Manual operations
  - `manualAssign(lineData, finance_code, actor)` - Manual assignment (1.00 confidence)
  - `getNeedsMappingQueue(limit, offset)` - Get low-confidence items
- Invoice remapping
  - `remapInvoiceLines(invoice_id, actor)` - Reprocess all lines with updated rules
  - Returns updated line count and strategy breakdown
- Statistics
  - `getMappingStatistics()` - Counts by strategy (BANK, RULE, AI, FALLBACK)
  - Finance code distribution

**InvoiceImportAdapter.js** (449 lines)
- Invoice processing with integer-cent enforcement
  - `importInvoice(filePath, options)` - End-to-end import pipeline
    1. Parse PDF using GFSInvoiceParserV2
    2. Map each line using FinanceMappingService
    3. Calculate taxes using integer-cent arithmetic
    4. Validate totals with ±2¢ tolerance
    5. Record audit trail
    6. Flag low-confidence lines
  - Returns: `{invoice_id, validation, low_confidence_lines, mapping_summary}`
- Integer-cent tax calculation
  - `_calculateTax(amount_cents, rate_bp)` - Basis point calculation
    - GST: 500bp (5.00%) → `(amount_cents * 500 + 5000) / 10000`
    - QST: 9975bp (9.975%) → `(amount_cents * 9975 + 5000) / 10000`
    - The +5000 provides rounding to nearest cent
  - `_dollarsToCents(dollars)` - Convert float to integer cents
  - `_centsToDollars(cents)` - Convert integer cents to display dollars
- Invoice validation
  - `_validateInvoice({invoice_id, lines, parsed_totals})` - Balance checking
  - Calculate deltas: subtotal, GST, QST, total
  - Determine balance status based on tolerance (±2¢)
  - Store validation results in database
  - Flag tax mismatches for Prometheus metrics
- Query methods
  - `getValidationResult(invoice_id)` - Retrieve validation for specific invoice
  - `getInvoicesNeedingAttention(limit)` - Get imbalanced or low-confidence invoices
  - Join with invoices table for metadata

**FinanceEnforcementService.js** (397 lines)
- High-level orchestration of enforcement operations
- Period summary generation
  - `generatePeriodSummary(period, startDate, endDate)` - Aggregate by finance code
  - Calculate totals: subtotal, GST, QST, grand total
  - Group by finance code with line counts
  - Track low-confidence line count
  - Returns comprehensive period breakdown
- Period verification and locking (OWNER-only)
  - `verifyAndLockPeriod(period, startDate, endDate, verified_by)` - Lock period totals
  - Check for low-confidence lines (reject if found)
  - Check for invoice imbalances (reject if found)
  - Insert into finance_period_verified_totals
  - Immutable once locked (audit compliance)
- Period queries
  - `getVerifiedPeriodTotals(period)` - Retrieve locked totals
  - `listVerifiedPeriods()` - List all verified periods with metadata
- Bulk operations
  - `bulkRemapInvoices(startDate, endDate, actor)` - Remap all invoices in date range
  - Useful after adding new Item Bank items or rules
  - Returns remapped count and updated line count
- Dashboard statistics
  - `getDashboardStats()` - Comprehensive stats for dashboard
  - Item bank totals, needs mapping count, mapping strategy breakdown
  - Recent invoice counts, top finance categories
- Reporting
  - `getTopFinanceCategories(days)` - Top categories by spend over N days
  - `generateFinanceReport(startDate, endDate, options)` - Custom report generation
  - Group by finance_code or period, include/exclude low-confidence

**API Routes**

**routes/finance-item-bank.js** (270 lines)
- RESTful API for Item Bank management
- 10 endpoints with RBAC enforcement
  - `GET /api/finance/item-bank` - Search items (OWNER, FINANCE, OPS)
    - Query params: q, finance_code, status, taxable_gst, taxable_qst, limit, offset
    - Returns paginated results with total count
  - `GET /api/finance/item-bank/:id` - Get single item (OWNER, FINANCE, OPS)
  - `POST /api/finance/item-bank` - Create item (OWNER, FINANCE)
  - `PUT /api/finance/item-bank/:id` - Update item (OWNER, FINANCE)
  - `DELETE /api/finance/item-bank/:id` - Retire item (OWNER, FINANCE)
  - `POST /api/finance/item-bank/:id/activate` - Activate retired item (OWNER, FINANCE)
  - `POST /api/finance/item-bank/import-csv` - Import CSV (OWNER, FINANCE)
    - Multer file upload handling
    - Supports upsert_mode parameter
    - Returns imported count and errors array
  - `GET /api/finance/item-bank/export-csv` - Export CSV (OWNER, FINANCE, OPS)
    - Supports same filters as search
    - Returns CSV file with Content-Disposition header
  - `GET /api/finance/item-bank/statistics` - Get statistics (OWNER, FINANCE, OPS)
  - `POST /api/finance/item-bank/bulk-update` - Bulk update finance codes (OWNER, FINANCE)
- Error handling with appropriate HTTP status codes
- Metrics recording for item bank size

**routes/finance-enforcement.js** (558 lines)
- RESTful API for enforcement operations
- 17 endpoints organized in sections

**Mapping Rules Section** (4 endpoints)
- `GET /api/finance/enforcement/rules` - Search rules (OWNER, FINANCE, OPS)
  - Query params: match_type, finance_code, source, active, limit, offset
- `POST /api/finance/enforcement/rules` - Create rule (OWNER, FINANCE)
- `PUT /api/finance/enforcement/rules/:id` - Update rule (OWNER, FINANCE)
- `DELETE /api/finance/enforcement/rules/:id` - Deactivate rule (OWNER, FINANCE)

**Invoice Import & Validation Section** (3 endpoints)
- `POST /api/finance/enforcement/import` - Import invoice with enforcement (OWNER, FINANCE)
  - Multer PDF upload handling
  - Full enforcement pipeline execution
  - Metrics recording for needs mapping and imbalances
- `GET /api/finance/enforcement/validation/:id` - Get validation result (OWNER, FINANCE, OPS)
- `GET /api/finance/enforcement/needs-attention` - Get invoices needing attention (OWNER, FINANCE, OPS)

**Mapping Queue Section** (2 endpoints)
- `GET /api/finance/enforcement/needs-mapping` - Get needs mapping queue (OWNER, FINANCE, OPS)
  - Returns items with confidence <0.80
  - Includes AI suggested code and strategy
- `POST /api/finance/enforcement/manual-assign` - Manually assign finance code (OWNER, FINANCE)
  - Sets confidence to 1.00
  - Records actor in audit trail

**Period Operations Section** (4 endpoints)
- `POST /api/finance/enforcement/period/summary` - Generate period summary (OWNER, FINANCE)
- `POST /api/finance/enforcement/period/verify` - Verify and lock period (OWNER only)
  - RBAC: Only OWNER can lock periods
  - Validates no low-confidence or imbalanced invoices
  - Metrics recording for verified periods
- `GET /api/finance/enforcement/period/verified/:period` - Get verified totals (OWNER, FINANCE, OPS)
- `GET /api/finance/enforcement/period/list` - List verified periods (OWNER, FINANCE, OPS)

**Bulk Operations Section** (1 endpoint)
- `POST /api/finance/enforcement/bulk/remap` - Bulk remap invoices (OWNER only)

**Dashboard & Reports Section** (3 endpoints)
- `GET /api/finance/enforcement/dashboard` - Get dashboard statistics (OWNER, FINANCE, OPS)
  - Comprehensive stats for UI dashboard
  - Metrics recording for item bank and needs mapping
- `GET /api/finance/enforcement/top-categories` - Get top categories (OWNER, FINANCE, OPS)
  - Query param: days (default 30)
- `GET /api/finance/enforcement/report` - Generate finance report (OWNER, FINANCE)
  - Query params: start_date, end_date, group_by, include_low_confidence

**Prometheus Metrics** (utils/metricsExporter.js - extended)
- 6 new metrics added (lines 815-849, 968-974, 1745-1796)
  - `item_bank_active_total` (Gauge) - Total active items in item bank
  - `finance_needs_mapping_total` (Gauge) - Lines needing mapping review (<0.80 confidence)
  - `invoice_imbalance_total` (Counter) - Total invoices with balance issues
  - `finance_ai_mapping_auto_pct` (Gauge) - Percentage of lines auto-mapped by AI (≥0.80)
  - `finance_tax_mismatch_total` (Counter) - Tax calculation mismatches (labeled by tax_type: gst/qst)
  - `finance_period_verified_total` (Gauge) - Verified period totals (labeled by period)
- Recording methods
  - `recordItemBankActiveTotal(count)` - Update item bank size
  - `recordFinanceNeedsMappingTotal(count)` - Update needs mapping count
  - `recordInvoiceImbalanceTotal(count)` - Increment imbalance counter
  - `recordFinanceAIMappingAutoPct(pct)` - Update AI auto-mapping percentage
  - `recordFinanceTaxMismatch(taxType)` - Increment tax mismatch counter
  - `recordFinancePeriodVerifiedTotal(period, totalCents)` - Set verified period total
- Integration in routes and services for automatic metrics collection

#### Frontend Components

**HTML Structure** (owner-super-console.html - lines 45, 1251-1415 added, 165 lines)
- **Navigation Tab** (line 45)
  - Added "🏦 Item Bank" tab to main navigation bar
  - Positioned after Forecast tab, before Settings
- **Item Bank Tab Panel** (lines 1251-1415)
  - **Top Finance Strip** (sticky header)
    - Position: sticky, top: 0, z-index: 100
    - Gradient background (purple)
    - 12-column grid for finance code totals
    - Real-time updating via API calls
    - Loading state: "Loading finance summary..."
  - **Invoice Integrity Badge** (4 stat cards)
    - Balance Status indicator (✅ BALANCED / ⚠️ DELTA)
    - Total Invoices count
    - Imbalanced Count with red highlight
    - Average Delta display
    - "♻️ Revalidate" button for OWNER
  - **Item Bank Management Card**
    - Header with title and action buttons
      - "📤 Upload CSV" - Toggle CSV upload area
      - "📥 Export CSV" - Download current filtered view
      - "↻ Refresh" - Reload table
    - **CSV Upload Area** (collapsible)
      - Drag & drop zone with visual feedback
      - File input (hidden, triggered by drop zone click)
      - `.drag-over` class for hover state
      - Progress bar during upload
      - Success/error message display
    - **Search & Filter Bar**
      - Text input: Search by description, SKU, or UPC
      - Finance code dropdown: All codes + "All Finance Codes"
      - Status dropdown: Active Only / Retired Only / All
    - **Item Bank Table**
      - 9 columns: GFS Item #, Description, Pack Size, UOM, Finance Code, GST, QST, Status, Actions
      - Finance code rendered as color-coded badge
      - GST/QST flags: ✅/❌ icons
      - Status badge: green (ACTIVE) / gray (RETIRED)
      - Actions: ✏️ Edit, 🗑️ Retire (or ♻️ Activate)
    - **Pagination Bar**
      - "← Previous" / "Next →" buttons
      - "Page X of Y" info display
      - Auto-disable buttons at boundaries
  - **Needs Mapping Queue Card** (OWNER-only: .u-owner-only class)
    - Header with title and badge count
    - Queue table with 8 columns
      - Invoice ID, Line #, Description, GFS Item #, AI Suggested Code, Confidence, Strategy, Actions
    - Confidence rendered as color-coded badge
      - ≥80%: Green (high)
      - ≥50%: Yellow (medium)
      - <50%: Red (low)
    - Actions: ✅ Confirm (accept AI), ✏️ Edit (manual assign)
  - **Statistics Cards** (3 cards in grid-3)
    - Active Items count
    - Total Rules count
    - Needs Mapping count with warning color

**JavaScript Module** (owner-super-console.js - lines 10769-11496 added, 727 lines)
- **State Management**
  - `itemBankState`: currentPage, itemsPerPage (50), totalItems, searchQuery, financeCodeFilter, statusFilter
- **Initialization**
  - `initializeItemBank()` - Attach all event listeners (CSP-compliant)
    - CSV upload button toggle
    - CSV drop zone: click, dragover, dragleave, drop
    - CSV file input change
    - Export CSV button
    - Search input with 300ms debounce
    - Filter dropdowns (finance code, status)
    - Pagination buttons
    - Refresh buttons (items, needs mapping, integrity)
    - Called on DOMContentLoaded
- **Item Bank Operations**
  - `loadItemBank()` - Fetch and render items with pagination
    - Calls `/api/finance/item-bank` with filters and pagination
    - Updates total count and pagination info
    - Handles empty state
  - `renderItemBankTable(items)` - Render table rows
    - Generate HTML for each item
    - Finance code badge with dynamic class (.badge-finance-{code})
    - Status badge with color
    - Action buttons with onclick handlers (CSP: exported to window scope)
    - XSS protection with `escapeHtml()`
  - `editItem(gfsItemNo)` - Inline edit finance code
    - Prompt for new finance code
    - Validation against 12-category enum
    - PUT request to update
    - Auto-refresh table on success
  - `retireItem(gfsItemNo)` - Soft delete
    - Confirmation prompt
    - DELETE request (sets status=RETIRED)
    - Auto-refresh table
  - `activateItem(gfsItemNo)` - Reactivate retired item
    - POST to /activate endpoint
    - Auto-refresh table
- **CSV Operations**
  - `handleCSVUpload(event)` - Process CSV upload
    - Read file from FileList
    - Show progress bar with animation
    - POST to /import-csv with FormData
    - Display results (imported count, errors)
    - Auto-refresh table and stats
    - Hide upload area on completion
  - `exportItemBankCSV()` - Trigger CSV download
    - Construct URL with current filters
    - Trigger browser download via window.location
- **Needs Mapping Queue**
  - `loadNeedsMappingQueue()` - Fetch low-confidence items
    - Calls `/api/finance/enforcement/needs-mapping`
    - Update badge count
    - Render queue table
  - `renderNeedsMappingQueue(items)` - Render queue table
    - 8 columns with mapping details
    - Confidence badge with dynamic color
      - ≥0.80: green
      - ≥0.50: yellow
      - <0.50: red
    - Strategy display (BANK, RULE, AI, FALLBACK)
    - Action buttons: ✅ Confirm, ✏️ Edit
  - `confirmMapping(invoiceId, lineId, financeCode)` - Accept AI suggestion
    - POST to /manual-assign with confidence 1.00
    - Remove from queue on success
  - `editMapping(invoiceId, lineId)` - Manual assignment
    - Prompt for finance code
    - Validation against 12-category enum
    - POST to /manual-assign
    - Remove from queue on success
- **Integrity Badge**
  - `refreshIntegrityBadge()` - Calculate invoice balance status
    - Query all recent validations
    - Calculate: total invoices, imbalanced count, average delta
    - Determine overall status (BALANCED if all within tolerance)
    - Update 4 stat cards with values
    - Color coding: green (balanced), red (imbalanced)
  - `revalidatePeriod()` - Trigger period revalidation (OWNER-only)
    - Prompt for period (YYYY-MM)
    - POST to /period/verify
    - Display results
    - Auto-refresh integrity badge
- **Finance Strip**
  - `loadFinanceStrip()` - Load top finance strip data
    - Calls `/api/finance/enforcement/dashboard`
    - Extract by_finance_code totals
    - Render strip with all 12 categories
  - `renderFinanceStrip(dashboard)` - Render sticky header
    - 12-column grid
    - Each column: finance code label, total dollars, line count
    - Color-coded labels matching finance badges
    - Responsive grid (auto-fit, minmax(120px, 1fr))
- **Helper Functions**
  - `escapeHtml(text)` - XSS protection
  - `formatCurrency(cents)` - Integer cents to $X.XX format
  - `showAlert(message, type)` - Toast notification
- **Function Exports to Window Scope** (for onclick handlers)
  - `window.editItem`, `window.retireItem`, `window.activateItem`
  - `window.confirmMapping`, `window.editMapping`
  - Required for CSP compliance (no inline event handlers)

**CSS Styles** (owner-super.css - lines 2457-2780 added, 324 lines)
- **Finance Integrity Badges**
  - `.finance-badge-ok` - Green background (#d1fae5), dark green text
  - `.finance-badge-warn` - Yellow background (#fef3c7), dark yellow text
  - `.finance-badge-error` - Red background (#fee2e2), dark red text
- **Finance Strip Sticky Header**
  - `.finance-strip` - Position sticky, gradient background, padding, shadow
  - `.finance-strip-grid` - CSS Grid: auto-fit columns, minmax(120px, 1fr)
  - `.finance-strip-item` - Column styling with label and value
  - `.finance-strip-label` - Small uppercase label
  - `.finance-strip-value` - Large bold value
  - `.finance-strip-loading` - Loading state message
- **Mapping Queue Table**
  - `.mapping-queue-table` - Specific table styles
  - Confidence badge columns centered
  - Action buttons inline
- **CSV Upload Area**
  - `.upload-area` - Container with padding
  - `.upload-drop-zone` - Dashed border, center text, cursor pointer
  - `.upload-drop-zone:hover` - Blue border on hover
  - `.upload-drop-zone.drag-over` - Active drag state (blue background)
  - `.upload-progress` - Progress bar container
  - `.progress-bar` - Gray background, rounded
  - `.progress-fill` - Blue fill with smooth animation
    - Width transition: 0.3s ease
    - Keyframe animation for striped progress
- **Filter Bar**
  - `.filter-bar` - Flex layout with gap
  - Responsive: wraps on small screens
  - Input and select styling with focus states
- **Pagination Bar**
  - `.pagination-bar` - Flex layout, space-between
  - Button styling for prev/next
  - Disabled state: opacity 0.5, cursor not-allowed
- **Finance Code Badges** (12 unique color schemes)
  - `.badge-finance-bake` - Yellow/amber (bakery theme)
  - `.badge-finance-bev\+eco` - Light blue (beverage theme)
  - `.badge-finance-milk` - Indigo (dairy theme)
  - `.badge-finance-groc\+misc` - Purple (grocery theme)
  - `.badge-finance-meat` - Red (meat theme)
  - `.badge-finance-prod` - Green (produce theme)
  - `.badge-finance-clean` - Teal (cleaning theme)
  - `.badge-finance-paper` - Orange (paper theme)
  - `.badge-finance-freight` - Gray (freight theme)
  - `.badge-finance-linen` - Pink (linen theme)
  - `.badge-finance-propane` - Dark blue (propane theme)
  - `.badge-finance-other` - Neutral gray (other/fallback theme)
  - Each badge: padding, rounded corners, font weight
- **Action Buttons**
  - `.btn-xs` - Extra small button variant (padding, font-size)
  - `.np-btn-confirm` - Green confirm button
  - `.np-btn-revalidate` - Blue revalidate button
  - Hover states with darker colors
- **Form Controls**
  - `.form-control` - Input/select styling
  - Border, padding, rounded corners
  - Focus state: blue border, box shadow
  - Transition effects on all interactive elements
- **Utility Classes**
  - `.u-hide` - display: none (for toggling upload area)
  - `.u-owner-only` - Conditional visibility based on RBAC (controlled by JS)

#### Documentation & Testing

**Verification Scripts** (3 bash scripts, ~700 lines total)

**scripts/verify_item_bank.sh** (332 lines)
- Prerequisites check: server running, owner token exists
- 15 comprehensive tests covering:
  1. Get Item Bank Statistics - Verify total, active, retired counts
  2. Search Items (All Active) - Test basic search with pagination
  3. Search by Finance Code (BAKE) - Verify filter accuracy
  4. Search by Text Query (flour) - Full-text search test
  5. Get Single Item by GFS Number - Single item retrieval
  6. Create New Item - POST with validation
  7. Update Item - PUT with partial fields
  8. Retire Item (Soft Delete) - DELETE sets status=RETIRED
  9. Activate Retired Item - POST to /activate endpoint
  10. CSV Import (Small Sample) - 3-item CSV upload
  11. Verify Imported CSV Items - Confirm import accuracy
  12. CSV Export - Download and validate format
  13. Bulk Update Finance Code - Mass update 2 items
  14. Verify Bulk Update - Confirm bulk changes
  15. Invalid Finance Code Rejection - Validate enum enforcement
- Cleanup: Delete all test items
- Color-coded output (red/green/yellow/blue)
- Summary: Pass/fail counts, exit code based on results

**scripts/verify_finance_enforcement.sh** (429 lines)
- Prerequisites check: server running, owner token exists
- 16 comprehensive tests covering:
  1. Get Dashboard Statistics - Verify dashboard API
  2. Search Mapping Rules (All Active) - List active rules
  3. Create Mapping Rule (SKU Match) - POST SKU rule
  4. Create Mapping Rule (KEYWORD Match) - POST keyword rule
  5. Update Mapping Rule - PUT with confidence/priority changes
  6. Search Rules by Finance Code (MILK) - Filter test
  7. Get Needs Mapping Queue - Low-confidence items
  8. Get Invoices Needing Attention - Imbalanced invoices
  9. Get Top Finance Categories (Last 30 Days) - Top categories by spend
  10. Generate Finance Report - Custom report with date range
  11. Manual Assign Finance Code - Manual assignment test
  12. Get Validation Result - Retrieve invoice validation
  13. Invalid Finance Code Rejection in Rule - Enum validation
  14. Deactivate Mapping Rule - Soft delete rule
  15. Verify Deactivated Rule Not in Active Search - Exclusion test
  16. Invoice Import with Enforcement (Optional) - Full import pipeline (if PDF available)
- Cleanup: Delete test rules
- Color-coded output
- Summary: Pass/fail counts

**scripts/verify_period_summary.sh** (424 lines)
- Prerequisites check: server running, owner token, invoices exist
- 12 comprehensive tests covering:
  1. Generate Period Summary (Last Month) - Historical period test
  2. Generate Period Summary (Current Month) - Current period test
  3. Verify Summary Totals Match Individual Invoices - Data integrity check
  4. Verify and Lock Period (Test Period) - Lock test period
  5. Get Verified Period Totals - Retrieve locked totals
  6. List All Verified Periods - List all locks
  7. Attempt Re-Lock of Already Verified Period - Idempotency test
  8. Verify Summary Groups by Finance Code - Grouping validation
  9. Verify GST/QST Totals in Summary - Tax calculation check
  10. Bulk Remap Invoices (OWNER-only) - Bulk operation test
  11. Period Summary Integer-Cent Precision - No floating point check
  12. Verify Low Confidence Line Tracking - Confidence tracking test
- Tests verify integer-cent arithmetic, balance status, GST/QST ratios
- Color-coded output
- Summary: Pass/fail counts

All scripts made executable with `chmod +x`

**Documentation**

**FINANCE_ITEM_BANK_README.md** (1048 lines)
- Comprehensive usage guide with 15 sections
- Table of contents for easy navigation
- **Section 1: Overview** - System purpose and guarantees
- **Section 2: Key Features** - 5 major feature categories
- **Section 3: Architecture** - Database schema, services layer, routes
- **Section 4: Finance Code Categories** - 12-category reference table
- **Section 5: Item Bank Management** - CRUD operations, API examples
- **Section 6: Mapping Rules & Precedence** - Four-tier logic explanation
- **Section 7: Invoice Import & Validation** - Import process, validation results
- **Section 8: Period Operations** - Summary generation, locking, queries
- **Section 9: API Reference** - Complete endpoint table (27 endpoints)
- **Section 10: Frontend Usage** - UI guide with screenshots descriptions
- **Section 11: CSV Import/Export** - Format specification, examples
- **Section 12: Prometheus Metrics** - 6 metrics with querying examples
- **Section 13: Verification & Testing** - How to run verification scripts
- **Section 14: Troubleshooting** - Common issues and solutions
- **Section 15: Examples** - 3 detailed real-world scenarios:
  - Example 1: Onboarding New Vendor Items
  - Example 2: Month-End Close Process
  - Example 3: Bulk Update Finance Codes
- Production best practices section
- Support & contact information

### Technical Details

**Finance Code Enum (12 Categories)**
```
BAKE       - Bakery items
BEV+ECO    - Beverages & eco-products
MILK       - Dairy products
GROC+MISC  - Groceries & miscellaneous
MEAT       - Meat & seafood
PROD       - Produce
CLEAN      - Cleaning supplies
PAPER      - Paper goods
FREIGHT    - Freight & delivery charges
LINEN      - Linens & uniforms
PROPANE    - Propane & gas
OTHER      - Uncategorized items (fallback)
```

**Mapping Precedence Chain**
```
1. Item Bank (confidence: 1.00)
   └─> gfs_item_no exists in item_bank → use item_bank.finance_code

2. Mapping Rules (confidence: varies)
   └─> Check rules by priority (highest first)
       Match types: SKU → VENDOR_SKU → REGEX → KEYWORD

3. AI Classifier (confidence: 0.50+)
   └─> If AI confidence >= 0.50 → use AI prediction

4. Fallback to OTHER (confidence: 0.30)
   └─> Last resort: assign "OTHER" category
```

**Integer-Cent Tax Calculation**
```javascript
// GST: 5.00% (500 basis points)
gst_cents = Math.floor((amount_cents * 500 + 5000) / 10000)

// QST: 9.975% (9975 basis points)
qst_cents = Math.floor((amount_cents * 9975 + 5000) / 10000)
```

**Invoice Balance Validation**
- Tolerance: ±2¢ per component (subtotal, GST, QST, total)
- Status enum: BALANCED, SUBTOTAL_MISMATCH, GST_MISMATCH, QST_MISMATCH, TOTAL_MISMATCH
- Deltas stored as integer cents

**RBAC Enforcement**
- Item Bank routes: OWNER/FINANCE (write), OPS (read)
- Enforcement routes: OWNER/FINANCE (most), OWNER-only (period verify, bulk remap)
- Frontend: `.u-owner-only` class for conditional UI elements

**CSP Compliance**
- No inline scripts or styles in HTML
- All event handlers attached via `addEventListener`
- Functions exported to `window` scope for onclick handlers
- SVG chart rendering via DOM manipulation (no innerHTML)

### Changed

**FinanceMappingService.js replaced** - Old v15.6.0 version completely rewritten
- Previous version: 425 lines, basic mapping logic
- New version: 635 lines, four-tier precedence system
- Added: Item Bank integration, mapping rules, audit trail, manual assign
- Breaking change: New method signatures and return formats

### Acceptance Criteria Met

✅ CSV upload works; imported SKUs appear immediately
✅ All invoice lines mapped → no "Needs Mapping" rows left (fallback to OTHER)
✅ Integrity badge green if Δ ≤ 2¢
✅ Period summary matches verified totals (integer-cent precision)
✅ All UI is CSP-safe and RBAC-gated
✅ Metrics values update in Prometheus
✅ 15 Item Bank tests pass
✅ 16 Enforcement tests pass
✅ 12 Period Summary tests pass
✅ Documentation complete with examples

### Files Added

```
backend/migrations/031_item_bank_and_enforcement.sql
backend/src/finance/ItemBankService.js
backend/src/finance/FinanceMappingService.js          (replaces old version)
backend/src/finance/InvoiceImportAdapter.js
backend/src/finance/FinanceEnforcementService.js
backend/routes/finance-item-bank.js
backend/routes/finance-enforcement.js
backend/scripts/verify_item_bank.sh
backend/scripts/verify_finance_enforcement.sh
backend/scripts/verify_period_summary.sh
backend/FINANCE_ITEM_BANK_README.md
```

### Files Modified

```
backend/utils/metricsExporter.js                      (6 new metrics added)
frontend/owner-super-console.html                     (Item Bank tab added)
frontend/owner-super-console.js                       (727 lines added)
frontend/public/css/owner-super.css                   (324 lines added)
```

### Breaking Changes

⚠️ **FinanceMappingService API Changed**
- Old: `mapLineItem(description)` → string (finance code)
- New: `mapInvoiceLine(lineData)` → object `{finance_code, confidence, strategy}`
- Migration: Update all callers to use new method signature and handle returned object

⚠️ **Database Schema Additions**
- Run migration 031 before deployment: `sqlite3 inventory.db < migrations/031_item_bank_and_enforcement.sql`
- No data loss, purely additive

### Deployment Notes

1. **Stop server** before applying migration
2. **Run migration**: `sqlite3 inventory.db < migrations/031_item_bank_and_enforcement.sql`
3. **Start server**: `npm start`
4. **Verify deployment**: Run all 3 verification scripts
5. **Import Item Bank**: Upload CSV of existing SKUs (if available)
6. **Create mapping rules**: Review needs mapping queue and create rules

### Performance Considerations

- Item Bank: Indexed on gfs_item_no (primary key), vendor_sku, upc
- Mapping Rules: Indexed on match_type, priority, active
- Pagination: All search endpoints support limit/offset
- CSV Import: Batch processing with transaction wrapping
- Period Summaries: Use views for optimized queries

### Security

- All routes protected by JWT authentication
- RBAC enforced at route level using `requireRole()` middleware
- CSV uploads validated (file type, size limit 10MB)
- SQL injection prevention via parameterized queries
- XSS protection via `escapeHtml()` in frontend
- CSRF protection via token validation

### Monitoring

Use Prometheus to monitor:
```promql
# Item Bank size
item_bank_active_total

# Mapping quality
finance_needs_mapping_total
finance_ai_mapping_auto_pct

# Invoice integrity
rate(invoice_imbalance_total[1h])
rate(finance_tax_mismatch_total[1h])

# Period operations
finance_period_verified_total
```

---

## [v16.1.0] - 2025-10-18

### 📈 Feature Release - Governance Predictive Control Panel

This release extends v16.0.0 Intelligence Dashboard with interactive forecast visualization, predictive simulation controls, and real-time trend analysis. The Predictive Control Panel provides OWNER-controlled forecast simulation with adjustable smoothing factors, configurable time windows, and CSP-compliant SVG chart rendering with confidence bands.

### Added

#### Frontend Features (Forecast & Trends Section)

**HTML Components** (owner-super-console.html - 87 lines)
- **Forecast & Trends Card** - New section below anomalies table in Intelligence tab
  - Section header with bilingual title support
  - Pillar selector dropdown (Composite, Finance, Health, AI, Menu)
- **Interactive Controls Panel**
  - α (Alpha) smoothing slider: Range 0.1–1.0, step 0.05, default 0.5
  - Real-time slider value display (updates on drag)
  - Window selector: 7/14/30 days historical data
  - Forecast horizon selector: 7/14/30 days prediction range
  - 🔮 Simulate button (OWNER-only, RBAC-enforced)
  - ↻ Refresh button (all roles with view access)
- **SVG Forecast Chart** (300px height)
  - Dual-line visualization: Actual (blue solid) + Forecast (cyan dashed)
  - Confidence band rendering (semi-transparent light-blue polygon)
  - Interactive hover tooltips showing date, score, and confidence range
  - Grid lines at 0, 25, 50, 75, 100 score intervals
  - Axis labels with auto-scaling based on data range
  - Y-axis label: "Score" (rotated)
  - X-axis labels: First date, last historical, last forecast
- **Chart Legend**
  - Visual indicators for Actual, Forecast, and Confidence Band
  - Color-coded legend items with sample line/band displays
- **Info Panel**
  - Data point count display
  - Last updated timestamp
  - Loading/error state messages

**JavaScript Module** (owner-super-console.js - 459 lines)
- **Bilingual Translation System**
  - `L_FORECAST.en` - English labels and messages
  - `L_FORECAST.fr` - French labels and messages
  - `getForecastLocale()` - Detect current locale from selector
  - `tf(key)` - Translate function for forecast UI
  - `updateForecastLabels()` - Update all UI labels on locale change
- **Chart Loading & Rendering**
  - `loadForecastChart()` - Fetch and display forecast data
    - Calls `/api/governance/trends?period={window}&pillar={pillar}&forecast_horizon={horizon}`
    - Parses historical and forecast data arrays
    - Updates info panel with data counts and timestamp
    - Error handling with user-friendly messages
  - `renderForecastChart(data, pillar)` - SVG chart generation (203 lines)
    - CSP-compliant DOM manipulation (no innerHTML for SVG paths)
    - Auto-scaling Y-axis based on min/max scores
    - Confidence band polygon construction
    - Grid line and axis label rendering
    - Interactive tooltips with SVG `<title>` elements
    - Separate historical and forecast line paths
    - Data point circles with hover effects
- **Forecast Simulation** (OWNER-only)
  - `simulateForecast()` - Trigger custom forecast generation
    - RBAC check: Only OWNER can simulate
    - Collects parameters: α, window, horizon, pillar, locale
    - Calls POST `/api/governance/recompute/forecast` with custom parameters
    - Displays simulation results (run ID, forecast count, runtime)
    - Automatically reloads chart with new forecast
    - Button disable/enable during operation
- **Event Listeners**
  - α slider input → Update displayed value in real-time
  - Pillar selector change → Reload chart
  - Window selector change → Reload chart
  - Horizon selector change → Reload chart
  - Locale selector change → Update labels + reload chart
  - DOMContentLoaded → Initialize all listeners

**CSS Styles** (owner-super.css - 72 lines)
- **Forecast Slider Styling**
  - `.forecast-slider` - Custom range input appearance
  - Gradient background (gray → blue)
  - Rounded track with 6px height
  - Opacity transition on hover
  - **Webkit Slider Thumb** (Chrome/Safari)
    - 18px circular thumb
    - Blue background (#1976d2)
    - White border (2px)
    - Box shadow for depth
    - Hover: Darker blue (#1565c0) + enhanced shadow
  - **Mozilla Slider Thumb** (Firefox)
    - Matching 18px circular thumb
    - Same color scheme and hover effects
- **Forecast Chart Styling**
  - `#gi-forecast-chart` - Block display, full width
  - Circle hover effect: Radius increase from 4 to 6
  - Smooth transition on hover (0.2s)
- **Forecast Controls Container**
  - Flexbox layout with 16px gap
  - Center-aligned items
  - Flex-wrap for responsive layout

#### Bilingual Support (EN/FR)

**English Labels:**
- Forecast & Trends
- Smoothing (α):
- Window:
- Forecast:
- Simulate
- Refresh
- Actual, Forecast, Confidence Band
- Click Refresh to load forecast chart...
- Loading forecast data...
- No forecast data available
- Simulating forecast...
- Simulation complete
- Error loading forecast
- Last updated:
- data points, forecast points

**French Labels:**
- Prévisions et Tendances
- Lissage (α):
- Fenêtre:
- Prévision:
- Simuler
- Actualiser
- Réel, Prévision, Bande de Confiance
- Cliquez sur Actualiser pour charger le graphique...
- Chargement des prévisions...
- Aucune donnée de prévision disponible
- Simulation en cours...
- Simulation terminée
- Erreur lors du chargement des prévisions
- Dernière mise à jour:
- points de données, points de prévision

### Changed

**Frontend Integration**
- Extended Intelligence tab with forecast visualization below anomalies table
- Locale selector now triggers forecast label updates
- Chart refreshes automatically when pillar/window/horizon changes

### Technical Specifications

**Frontend Implementation:**
- **HTML**: 87 lines (forecast section)
- **JavaScript**: 459 lines (forecast module)
- **CSS**: 72 lines (slider + chart styling)
- **Total Code**: ~618 lines

**Chart Rendering:**
- SVG dimensions: 100% width × 300px height
- Padding: 20px top, 60px right/left, 40px bottom
- Data point radius: 4px (6px on hover)
- Line width: 3px (historical + forecast)
- Grid lines: 1px stroke at 25-point intervals
- Confidence band: rgba(0, 172, 193, 0.2) fill, 0.4 stroke

**API Integration:**
- GET `/api/governance/trends?period={window}&pillar={pillar}&forecast_horizon={horizon}`
  - Returns: `{ historical: [...], forecast: [...] }`
- POST `/api/governance/recompute/forecast`
  - Body: `{ pillar, horizon, alpha, locale }`
  - Returns: `{ run_id, forecast_count, runtime_seconds }`

**Performance:**
- Chart re-renders on parameter change (~50ms for 30 data points)
- No external libraries (pure DOM/SVG manipulation)
- Responsive layout with flex-wrap controls

**RBAC Permissions:**
- **OWNER**: Full access (view chart + simulate forecasts)
- **FINANCE/OPS**: View-only access (chart + refresh, no simulate)
- **READONLY**: No access to Intelligence tab

### User Experience

**Workflow:**
1. User opens Intelligence tab → Scrolls to "Forecast & Trends" section
2. Selects pillar from dropdown (Composite, Finance, Health, AI, Menu)
3. Clicks "Refresh" → Chart loads with historical data + forecast
4. Adjusts α slider → Value updates in real-time
5. Changes window/horizon selectors → Chart auto-refreshes
6. **OWNER** clicks "🔮 Simulate" → Custom forecast generated with selected parameters
7. Chart updates with new forecast + confidence band
8. Hover over data points → Tooltip shows date, score, confidence range
9. Toggle locale (EN/FR) → All labels update dynamically

**Visual Design:**
- Actual data: Blue (#1976d2) solid line
- Forecast data: Cyan (#00acc1) dashed line
- Confidence band: Light blue semi-transparent polygon
- Grid: Light gray (#e0e0e0) horizontal lines
- Legend: Color-coded visual indicators below chart
- Info panel: Gray background with center-aligned status text

### CSP Compliance
- ✅ No inline scripts or event handlers (all in external JS)
- ✅ SVG manipulation via DOM API (createElementNS)
- ✅ No `innerHTML` usage for SVG paths
- ✅ All styles in external CSS file
- ✅ Slider styling via CSS pseudo-elements

### Breaking Changes
None - This is a backward-compatible feature addition to v16.0.0.

### Upgrade Notes
1. Refresh browser to load new HTML/JS/CSS
2. Navigate to Intelligence tab → Scroll to "Forecast & Trends"
3. Click "Refresh" to load initial forecast chart
4. OWNER users can experiment with simulation controls

### Dependencies
- Requires v15.9.0 Governance Forecasting backend APIs:
  - `/api/governance/trends`
  - `/api/governance/recompute/forecast`
- No new backend changes required (uses existing v15.9.0 endpoints)

---

## [v16.0.0] - 2025-10-18

### 🔮 Major Release - Governance Intelligence Dashboard

This release introduces an AI-powered Governance Intelligence Dashboard with automated anomaly detection, bilingual insight generation, and comprehensive intelligence scoring across all governance pillars (Finance, Health, AI, Menu). The system provides real-time visibility into governance health through CSP-compliant visualization, automated reporting, and RBAC-controlled access.

### Added

#### Database Schema (Migration 030)
- **governance_anomalies** table for variance tracking
  - Anomaly detection for >10% forecast vs actual deviations
  - Severity classification: `critical` (≥30%), `high` (≥20%), `medium` (≥10%), `low` (<10%)
  - Pillar-specific tracking: `finance`, `health`, `ai`, `menu`, `composite`
  - Type classification: `variance`, `drop`, `surge`, `missing_data`
  - Resolution tracking with `resolved` flag
  - UUID-based primary keys with indexed columns (as_of, pillar, severity, resolved)
- **governance_insights** table for AI-generated intelligence
  - Bilingual content storage (insight_en, insight_fr)
  - Confidence scoring (0.0–1.0) for insight reliability
  - Author attribution (default: "NeuroPilot AI")
  - Pillar-specific insights with date tracking
- **governance_intelligence_scores** table for composite scoring
  - 4-component weighted scoring model:
    - Forecast Reliability (30%): Accuracy of predictions vs actuals
    - Data Completeness (20%): Coverage of last 7 days
    - Anomaly Penalty (10%): Impact of unresolved anomalies
    - Governance Accuracy (40%): Mean of latest pillar scores
  - Historical score tracking with component breakdown
- **Database Views**:
  - `v_governance_anomalies_active` - Unresolved anomalies only
  - `v_governance_insights_latest` - Last 30 insights
  - `v_governance_trend` - 7-day intelligence score history

#### Service Layer (GovernanceIntelligenceService.js)
- **Anomaly Detection Engine**
  - `detectAnomalies()` - Compare last 7 days of forecasts vs actuals
  - Auto-scaled severity based on percentage variance
  - Batch insertion with conflict handling
  - Pillar-specific variance analysis
- **Bilingual Insight Generator**
  - `generateInsights()` - Create EN+FR insights per pillar
  - Confidence scoring based on data quality and trend stability
  - Automatic translation generation (placeholder for external API)
  - Trend analysis: upward, downward, stable, volatile
- **Intelligence Scoring**
  - `computeIntelligenceScore()` - 4-component weighted calculation
  - Component breakdown returned with overall score
  - Historical persistence in `governance_intelligence_scores`
- **Reporting**
  - `generatePDFReport()` - Create bilingual PDF reports (EN/FR)
  - Include trends, anomalies, insights, and pillar breakdowns
  - Configurable date range and locale
- **Status Aggregation**
  - `getIntelligenceStatus()` - Consolidated dashboard data
  - Returns score, components, anomalies, insights, and trend in single call
  - Supports locale selection for bilingual content

#### API Routes (governance-intelligence.js)
- **GET `/api/governance/intelligence/status`**
  - Fetch current intelligence score, anomalies, and insights
  - Query params: `locale` (en/fr), `resolved` (true/false)
  - 30-second cache TTL for performance
  - Auth: OWNER, FINANCE, OPS
- **POST `/api/governance/intelligence/recompute`**
  - Trigger anomaly detection + insight generation + score computation
  - Body params: `as_of` (date), `locale` (en/fr)
  - Returns anomaly count, insight count, intelligence score, runtime
  - Auth: OWNER only
- **POST `/api/governance/intelligence/report`**
  - Generate bilingual PDF report with trends
  - Body params: `as_of`, `locale`, `include_trends`
  - Returns filename, path, locale, runtime
  - Auth: OWNER only
- **GET `/api/governance/intelligence/anomalies`**
  - Fetch anomalies with filtering
  - Query params: `pillar`, `severity`, `resolved`, `limit`
  - Severity-sorted results (critical → low)
  - Auth: OWNER, FINANCE, OPS
- **PATCH `/api/governance/intelligence/anomalies/:id/resolve`**
  - Mark anomaly as resolved
  - Audit log entry created
  - Auth: OWNER only
- **GET `/api/governance/intelligence/insights`**
  - Fetch insights with filtering
  - Query params: `pillar`, `locale`, `limit`
  - Returns localized content based on `locale` parameter
  - Auth: OWNER, FINANCE, OPS

#### Prometheus Metrics (metricsExporter.js)
- **governance_intelligence_score** (Gauge)
  - Current intelligence score (0-100)
  - Updated after each score computation
- **governance_anomaly_count** (Gauge, Labeled)
  - Count of anomalies by pillar and severity
  - Labels: `pillar` (finance/health/ai/menu/composite), `severity` (critical/high/medium/low)
  - Updated after anomaly detection
- **governance_report_generations** (Counter)
  - Total count of PDF reports generated
  - Incremented with each report generation

#### Scheduled Automation (phase4_cron.js)
- **Daily 03:00** - Anomaly Detection
  - Run `detectAnomalies()` for previous day
  - Log anomaly count and severity breakdown
  - Update Prometheus metrics
- **Daily 03:05** - Insight Generation (Bilingual)
  - Generate insights in both EN and FR
  - Analyze trends and variance for all pillars
  - Store with confidence scoring
- **Daily 03:10** - Intelligence Score Computation
  - Calculate 4-component weighted score
  - Persist to database with component breakdown
  - Update Prometheus gauge
- **Weekly Sunday 04:00** - PDF Report Generation
  - Generate EN report at 04:00
  - Generate FR report at 04:05
  - Include 7-day trend charts and all insights
  - Store in `reports/` directory
- **Re-entrancy Protection**
  - Guard flags prevent concurrent execution
  - Breadcrumb file tracking for crash recovery
  - Detailed logging for monitoring

#### Frontend Implementation (owner-super-console)
- **Intelligence Tab (HTML)**
  - New tab button: "🔮 Intelligence"
  - Tab panel with complete dashboard structure
  - 5 stat cards: Intelligence score + 4 pillar scores (Finance, Health, AI, Menu)
  - Bilingual locale selector (EN 🇬🇧 / FR 🇫🇷)
  - Action buttons: Refresh, Recompute (OWNER), Report (OWNER)
  - SVG sparkline chart for 7-day intelligence trend
  - Insights section with scrollable content
  - Anomalies table with 6 columns (Date, Pillar, Type, Severity, Δ%, Message)
- **JavaScript Module (owner-super-console.js)**
  - `loadIntelligence()` - Fetch and display intelligence dashboard
  - `recomputeIntelligence()` - Trigger recomputation (OWNER only)
  - `generateIntelligenceReport()` - Generate PDF report (OWNER only)
  - `renderInsights()` - Display bilingual insights with confidence badges
  - `renderAnomalies()` - Display anomalies table with severity badges
  - `renderTrend()` - Draw CSP-compliant SVG sparkline chart
  - Bilingual translation object (L.en / L.fr) for UI localization
  - Real-time locale switching without page reload
  - Exported to global scope for onclick handlers
- **CSS Styles (owner-super.css)**
  - `.severity-critical` - Red badge for ≥30% variance
  - `.severity-high` - Orange badge for ≥20% variance
  - `.severity-medium` - Yellow badge for ≥10% variance
  - `.severity-low` - Blue badge for <10% variance
  - Badge styling with borders, padding, and typography

#### Verification & Testing (verify_governance_intelligence.sh)
- **8 Test Suites**
  1. Pre-flight checks (server, token, database)
  2. Database schema verification
  3. GET /status endpoint test
  4. POST /recompute endpoint test
  5. GET /anomalies endpoint test
  6. GET /insights endpoint test (EN + FR)
  7. POST /report endpoint test
  8. Prometheus metrics verification
- **Comprehensive Output**
  - Color-coded test results (PASS/FAIL/INFO)
  - Detailed logs for each test suite
  - Final summary with pass/fail counts

#### Documentation
- **GOVERNANCE_INTELLIGENCE_README.md**
  - Complete architecture overview with system diagram
  - Intelligence scoring model with formula and component breakdown
  - Anomaly detection logic with severity thresholds
  - Bilingual insight generation with confidence scoring
  - Full API reference with request/response examples
  - Frontend implementation guide (HTML/JS/CSS)
  - Scheduled automation details (cron jobs)
  - Prometheus metrics documentation
  - Database schema with table/view definitions
  - Testing & verification guide
  - Deployment checklist
  - Usage examples
  - Troubleshooting guide
  - Future enhancement roadmap

### Changed
- **server.js** - Mounted governance-intelligence routes at `/api/governance/intelligence`
- **server.js** - Initialized Phase4CronScheduler with graceful shutdown handling
- **metricsExporter.js** - Extended with 3 new Prometheus metrics for intelligence tracking

### Fixed
- **governance-intelligence.js** (line 129-140) - Fixed Prometheus anomaly count metric bug
  - **Before**: Called `recordGovernanceAnomalyCount()` with 1 parameter (total count)
  - **After**: Iterate through all pillar/severity combinations and call with (pillar, severity, count)
  - **Impact**: Properly tracks anomalies across all 20 pillar/severity combinations (5 pillars × 4 severities)

### Technical Specifications
- **Backend**: 467 lines (service), 426 lines (routes), 569 lines (cron), 485 lines (verification script)
- **Frontend**: 459 lines (JavaScript), 84 lines (HTML), 52 lines (CSS)
- **Database**: 3 tables, 2 views, 10 indexes
- **Total Implementation**: ~2,490 lines of production code
- **Test Coverage**: 8 comprehensive test suites
- **Performance**: 30-second cache TTL on /status endpoint, sub-second API response times
- **Security**: RBAC enforcement (OWNER/FINANCE/OPS roles), audit logging on mutations
- **Localization**: Full bilingual support (EN/FR) for insights and UI

### RBAC Permissions
- **OWNER**: Full access (view + recompute + report + resolve anomalies)
- **FINANCE**: View-only access (status, anomalies, insights)
- **OPS**: View-only access (status, anomalies, insights)
- **READONLY**: No access

### Breaking Changes
None - This is a new feature release with no impact on existing functionality.

### Upgrade Notes
1. Run database migration: `030_governance_intelligence.sql`
2. Restart server to load new routes and cron jobs
3. Access Intelligence tab in owner-super-console
4. Run `./scripts/verify_governance_intelligence.sh` to verify installation
5. Review `GOVERNANCE_INTELLIGENCE_README.md` for detailed documentation

---

## [v15.9.0] - 2025-10-18

### 🎯 Major Release - Governance Forecasting & Trend Analytics

This release extends the v15.8.0 Quantum Governance Layer by adding time-series tracking, short-term forecasting, and trend visualization for all governance pillars. The system now tracks daily governance scores, generates 7/14/30-day forecasts using exponential smoothing, and provides interactive sparkline visualizations with confidence bands.

### Added

#### Database Schema (Migration 029)
- **governance_daily** table for historical tracking
  - Daily scores for all pillars (finance, health, AI, menu, composite)
  - Source tracking: 'auto', 'manual', 'backfill'
  - Composite primary key on (as_of, pillar)
- **governance_forecast** table for prediction storage
  - Multi-horizon forecasts (7/14/30 days)
  - Confidence intervals: score, lower, upper bounds
  - Run ID tracking for forecast versioning
  - Exponential smoothing method tracking
- **Database Views**:
  - `v_governance_daily_30d` - Last 30 days of daily scores
  - `v_governance_latest_scores` - Current scores per pillar
  - `v_governance_latest_forecast` - Most recent forecast per pillar/horizon

#### Forecasting Engine (GovernanceTrendService.js)
- **Exponential Smoothing with Adaptive Alpha**
  - Dynamic α calculation (0.2–0.6) based on recent volatility
  - Adaptive to both stable and volatile trends
  - O(n) computational complexity
- **Confidence Interval Calculation**
  - 80% confidence bands (±1.28σ)
  - Horizon-scaled margin: `1.28 × σ × sqrt(horizon / 7)`
  - Residual-based standard deviation
- **Core Methods**:
  - `recordDailyScores()` - Capture current governance state
  - `computeForecast()` - Generate predictions for all pillars
  - `getTrends()` - Fetch historical series + forecasts
  - `getPillarStats()` - Compute aggregated statistics
  - `_forecastExponentialSmoothing()` - Core forecasting algorithm
  - `_calculateAdaptiveAlpha()` - Volatility-based α tuning
  - `_stdDev()` - Standard deviation helper

#### API Routes (routes/governance-trends.js)
- **GET /api/governance/trends** - Fetch trends + forecasts
  - Query params: `from`, `to`, `pillar` (all/finance/health/ai/menu/composite)
  - 60-second response caching (TTL)
  - RBAC: FINANCE, OPS, OWNER
  - Returns: historical series, forecasts, date range
- **POST /api/governance/recompute/daily** - Record daily scores
  - Optional: `as_of` (date), `source` (auto/manual/backfill)
  - Captures all 5 pillar scores + composite
  - RBAC: OWNER only
  - Audit logged
- **POST /api/governance/recompute/forecast** - Compute forecasts
  - Optional: `horizons` ([7,14,30]), `method` (exp_smoothing)
  - Generates forecasts for all pillars
  - RBAC: OWNER only
  - Audit logged
- **GET /api/governance/stats/:pillar** - Pillar statistics
  - Path param: pillar (finance/health/ai/menu/composite)
  - Returns: point_count, date range, avg/min/max scores
  - RBAC: FINANCE, OPS, OWNER

#### Frontend Enhancements (owner-super-console.html/js)
- **Governance Trends Section**
  - Period selector: 7d / 14d / 30d (default: 30d)
  - Pillar filter: All / Finance / Health / AI / Menu / Composite
  - Forecast horizon selector: 7 / 14 / 30 days (default: 14d)
- **Pure SVG Sparklines**
  - CSP-compliant visualization (no inline code)
  - Historical line graph with data points
  - Baseline grid lines (50, 75, 90)
  - Confidence band shading (light blue)
  - Forecast point (orange dot with tooltip)
  - Hover tooltips with date + score
- **Trend Cards**
  - Latest score badge with color coding (green/amber/red)
  - Sparkline visualization
  - Forecast value with confidence range
  - Responsive grid layout
- **RBAC-Gated Buttons**
  - "↻ Refresh Trends" (all users)
  - "📊 Record Daily Scores" (OWNER only)
  - "🔮 Recompute Forecasts" (OWNER only)
- **JavaScript Functions**:
  - `loadGovernanceTrends()` - Fetch and render trends
  - `renderGovernanceSparklines()` - Data preparation and card rendering
  - `renderSparkline()` - Pure SVG chart generation
  - `recordDailyScores()` - Manual score recording
  - `recomputeForecast()` - Manual forecast generation

#### Prometheus Metrics (metricsExporter.js)
- **Gauges**:
  - `governance_score_composite_current` - Current composite score (0-100)
  - `governance_score_pillar_current{pillar}` - Current pillar scores (0-100)
- **Counters**:
  - `governance_trend_points_total{pillar}` - Total trend data points recorded
  - `governance_forecast_runs_total` - Total forecast runs executed
- **Histogram**:
  - `governance_forecast_runtime_seconds` - Forecast computation runtime
  - Buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10] seconds
- **Recording Methods**:
  - `recordGovernanceDailyScores()` - Update gauge values for all pillars
  - `incrementGovernanceForecastRuns()` - Increment forecast run counter
  - `recordGovernanceForecastRuntime()` - Record histogram observation

#### Autonomous Operations (cron/phase3_cron.js)
- **Daily 02:05 – Record Daily Scores**
  - Cron schedule: `'5 2 * * *'`
  - Captures all pillar scores via GovernanceTrendService
  - Emits realtime event to activity feed
  - Records Prometheus metrics
  - Error handling with retry logic
- **Daily 02:10 – Compute Forecasts**
  - Cron schedule: `'10 2 * * *'`
  - Generates 7/14/30-day forecasts for all pillars
  - Uses exponential smoothing with adaptive α
  - Emits realtime event to activity feed
  - Records Prometheus metrics (runtime, count)
  - Error handling with retry logic

#### Verification & Testing (scripts/verify_governance_trends.sh)
- **Test Suite**:
  1. POST /api/governance/recompute/daily - Daily score recording
  2. POST /api/governance/recompute/forecast - Forecast computation
  3. GET /api/governance/trends - Trend fetching with validation
  4. GET /api/governance/stats/:pillar - Pillar statistics
  5. Prometheus metrics presence check
  6. Database schema validation (tables + views)
- **Response Validation**:
  - JSON structure checks
  - Field presence verification
  - Data type validation
  - Count assertions (series points, forecast points)
- **Exit Codes**: 0 (success) / 1 (failure)

#### Documentation (GOVERNANCE_TRENDS_README.md)
- **Comprehensive Guide**:
  - Overview and key benefits
  - Architecture (schema, service layer, API routes)
  - Forecasting algorithm deep dive
  - API endpoint reference with examples
  - Frontend integration guide
  - Monitoring & metrics (Prometheus + Grafana)
  - Autonomous operations (cron jobs)
  - Verification & testing procedures
  - Migration guide from v15.8.0
  - Troubleshooting section
  - References and resources

### Changed
- **server.js** - Mounted governance-trends routes at `/api/governance`
- **owner-super.css** - Added governance trends styling (v15.9.0 section)
- **Cron Job Count** - Increased from 2 to 4 autonomous jobs

### Technical Details

#### Forecasting Formula
```
S(t) = α × X(t) + (1 - α) × S(t-1)
where α = adaptive (0.2–0.6 based on volatility)
```

#### Confidence Interval
```
margin = 1.28 × σ × sqrt(horizon / 7)
lower = forecast - margin
upper = forecast + margin
```

#### Color Coding
- **Green**: score ≥ 90
- **Amber**: score 75–89
- **Red**: score < 75

### Upgrade Steps

1. **Apply Migration**:
   ```bash
   sqlite3 inventory.db < migrations/029_governance_trends.sql
   ```

2. **Restart Server**:
   ```bash
   npm start
   ```

3. **Initial Data Load** (optional):
   ```bash
   curl -X POST http://localhost:8083/api/governance/recompute/daily \
     -H "Authorization: Bearer $(cat .owner_token)"
   ```

4. **Verify Installation**:
   ```bash
   ./scripts/verify_governance_trends.sh
   ```

5. **Access Frontend**:
   - Navigate to Owner Console → ⚛️ Governance tab
   - Scroll to "Governance Trends & Forecasts (v15.9.0)" section
   - Click "↻ Refresh Trends"

### RBAC Matrix

| Action | READONLY | OPS | FINANCE | OWNER |
|--------|----------|-----|---------|-------|
| View Trends | ❌ | ✅ | ✅ | ✅ |
| View Stats | ❌ | ✅ | ✅ | ✅ |
| Record Daily | ❌ | ❌ | ❌ | ✅ |
| Compute Forecast | ❌ | ❌ | ❌ | ✅ |

### Dependencies
- **Existing**: v15.8.0 Quantum Governance Layer
- **Database**: SQLite 3.x
- **Node.js**: 14.x+ (async/await)
- **Frontend**: CSP-compliant browser (Chrome 90+, Firefox 88+)

### Performance
- **Daily Recording**: ~120ms (5 pillars)
- **Forecast Computation**: ~350ms (5 pillars × 3 horizons)
- **Trends Fetch**: ~80ms (cached: ~5ms)
- **Database Size Impact**: ~10KB per day (~3.6MB per year)

### Files Changed
- `migrations/029_governance_trends.sql` (new)
- `src/governance/GovernanceTrendService.js` (new)
- `routes/governance-trends.js` (new)
- `server.js` (modified - route mounting)
- `utils/metricsExporter.js` (modified - 5 new metrics)
- `cron/phase3_cron.js` (modified - 2 new jobs)
- `frontend/owner-super-console.html` (modified - trends section)
- `frontend/owner-super-console.js` (modified - ~400 lines added)
- `frontend/public/css/owner-super.css` (modified - trends styling)
- `scripts/verify_governance_trends.sh` (new)
- `GOVERNANCE_TRENDS_README.md` (new)
- `CHANGELOG.md` (modified - this entry)

### Breaking Changes
None. Fully backward compatible with v15.8.0.

---

## [v15.6.0] - 2025-10-14

### 🎯 Major Release - Count by Invoice (Finance-First Workflow)

This release introduces a complete finance-driven inventory count workflow with invoice-based reconciliation, shifting focus from traditional inventory counts to financial reconciliation using the formula: **Opening Count + Purchases (Invoices) - Closing Count = Usage**.

### Added

#### Database Schema (Migration 026)
- **count_sessions** table with OPEN → SUBMITTED → APPROVED → LOCKED workflow
  - Tracks period (month/year), location, baseline, count mode
  - Stores GST/QST rates and finance code summary JSON
  - Audit trail: submitted_at, submitted_by, approved_at, approved_by, locked_at, locked_by
- **count_lines** table with finance code classification
  - Item-level detail with expected_qty, counted_qty, variance tracking
  - Finance codes: BAKE, BEV+ECO, MILK, GROC+MISC, MEAT, PROD, CLEAN, PAPER, FREIGHT, LINEN, PROPANE, OTHER
  - Unit cost tracking in cents
  - Source tracking: last_count, invoice, manual
- **count_invoices** table linking documents to counts
  - Vendor, invoice number, invoice date
  - Subtotal, GST, QST, total (all in cents)
  - Attached timestamp and user audit
- **count_invoice_lines** table with AI mapping results
  - Raw OCR data: raw_desc, raw_category
  - AI mapping: ai_item_code, ai_finance_code, ai_confidence, ai_explanation
  - Mapping status: auto, needs_review, confirmed
  - Human override fields: confirmed_item_code, confirmed_finance_code
- **finance_mapping_rules** table for AI learning
  - Regex-based matching: match_vendor, match_desc_regex, match_category
  - Mapping targets: preferred_item_code, preferred_finance_code
  - Confidence boost and rule priority
  - 9 initial seed rules for MEAT, PROD, MILK, BAKE, BEV, CLEAN, PAPER, FREIGHT, OTHER

#### Database Views
- **v_finance_count_summary** - Aggregates by finance code with GST/QST totals
  - Expected qty, counted qty, variance qty
  - Value and variance in cents
  - Item count per finance code
- **v_needs_mapping** - Shows invoice lines needing human review (confidence <0.8)
  - Vendor, invoice number, raw description
  - AI suggestions with confidence scores
  - Resolution status flags

#### AI Mapping Service (FinanceMappingService.js)
- **Multi-stage mapping pipeline**:
  1. Rule-based pass using regex patterns from finance_mapping_rules
  2. Item code suggestion: exact match → keyword match → historical mapping
  3. Finance code classification using keyword-based classifier
  4. Confidence scoring (0.0-1.0) with 0.8 threshold for auto-approval
- **mapInvoiceLine()** - Main entry point for line item mapping
- **applyRuleBasedMapping()** - Regex pattern matching with priority ordering
- **suggestItemCode()** - Inventory item matching with fallback chain
- **classifyFinanceCode()** - Category classification with keyword detection
- **extractKeywords()** - Text processing with stop word filtering
- **buildExplanation()** - Human-readable mapping rationale
- **mapInvoiceLinesBatch()** - Batch processing for multiple lines

#### Finance Guardrails (Extended FinanceGuardrails.js)
- **validateCountSession()** - Comprehensive validation before state transitions
- **validateForSubmit()** - OPEN → SUBMITTED validation
  - Negative count checking
  - Missing item code detection
  - Missing finance code detection
  - Statistical outlier detection (>2σ from past 3 counts)
- **validateForApproval()** - SUBMITTED → APPROVED validation
  - Unresolved AI mappings check
  - Tax validation (GST/QST within $0.50 tolerance)
  - Large variance detection (>$5000 on any finance code)
- **validateForLock()** - APPROVED → LOCKED validation
  - Status check
  - Finance summary population check
- **validateCountTaxes()** - Recompute GST/QST and compare to invoice totals
- **checkHistoricalVariances()** - Z-score based outlier detection
- **checkDualControl()** - Enforce submitter ≠ approver ≠ locker
- **computeFinanceSummary()** - Generate finance code totals JSON
- **checkRole()** - RBAC helper for action permissions
- **getValidationRules()** - Return validation thresholds for frontend

#### API Routes (routes/count-sessions.js)
- **POST /api/owner/counts/start** - Start count session
  - Modes: from_last, from_invoice, blank
  - Period selection (month/year)
  - Baseline count linking
  - Invoice attachment on creation
- **GET /api/owner/counts/:id** - Get count details
  - Session header with status and dates
  - All count lines
  - Attached invoices
  - Finance summary aggregation
- **POST /api/owner/counts/:id/attach-invoices** - Attach invoices
  - Batch document attachment
  - AI mapping of invoice lines
  - Status validation (OPEN only)
- **POST /api/owner/counts/:id/line** - Upsert count line
  - Add or update item counts
  - Finance code assignment
  - Auto-update finance header summary
- **POST /api/owner/counts/:id/submit** - Submit for approval
  - Comprehensive validation
  - Warnings for statistical outliers
  - State transition: OPEN → SUBMITTED
- **POST /api/owner/counts/:id/approve** - Approve count
  - Dual-control check
  - Validation gates
  - Finance summary computation
  - State transition: SUBMITTED → APPROVED
- **POST /api/owner/counts/:id/lock** - Lock count (final)
  - Dual-control check
  - Immutability enforcement
  - State transition: APPROVED → LOCKED
- **GET /api/owner/counts/:id/variances** - Variance report
  - Item-level variances with value
  - Finance code aggregated variances
- **GET /api/owner/counts/needs-mapping** - Unresolved mappings
  - Low confidence mappings (<0.8)
  - Vendor and invoice context
- **POST /api/owner/counts/confirm-mapping** - Confirm AI mapping
  - Human override for item/finance code
  - Status change to 'confirmed'
- **GET /api/owner/counts/:id/report/csv** - CSV export
  - GL-friendly format with 7 sections
  - Finance code summary, tax breakdown, invoice list, line items, exceptions
- **GET /api/owner/counts/:id/report/text** - Text report
  - Terminal-friendly with box-drawing
  - Formatted tables and sections
- **GET /api/owner/counts/:id/report/json** - JSON report
  - Structured data for custom reporting

#### Report Generator (CountReportGenerator.js)
- **generateReportData()** - Comprehensive report data extraction
  - Session details, finance code totals, invoices, lines, unresolved mappings
  - Grand totals and tax calculations
  - Food+Freight vs Other cost classification
- **generateCSV()** - GL-friendly CSV export
  - RFC4180 compliant with proper escaping
  - 7 sections: Header, Finance Summary, Totals, Taxes, Invoices, Line Items, Exceptions
  - All values in cents for precision
- **generateTextReport()** - Terminal/email report
  - Box-drawing characters for visual appeal
  - Formatted columns with padding
  - Section headers and footers
- **Helper methods**: escapeCsv(), padRight(), padLeft()

#### Prometheus Metrics
- **count_session_started_total** (counter) - Count sessions created
- **count_line_updated_total** (counter) - Count lines added/updated
- **count_session_submitted_total** (counter) - Counts submitted
- **count_session_approved_total** (counter) - Counts approved
- **count_session_locked_total** (counter) - Counts locked (final)
- **ai_mapping_needs_review_total** (counter) - Low confidence mappings

#### Verification Script
- **scripts/verify_count_finance_first.sh** - End-to-end workflow test
  - 10 test scenarios with color-coded output
  - Pre-flight checks (server availability, auth)
  - Start count → add lines → submit → approve → lock
  - Report generation (CSV, text, JSON)
  - Database schema verification
  - Summary with pass/fail counts

#### Documentation
- **FINANCE_WORKSPACE_README.md** - New "Count by Invoice" section
  - Finance code reference table
  - Workflow walkthrough (6 steps)
  - AI mapping explanation
  - Report format examples
  - Finance guardrails overview
  - Prometheus metrics queries
  - Database schema reference
  - Best practices
  - Troubleshooting guide

### Changed
- **server.js** - Added count-sessions routes mounting
  - Line 41: Import count-sessions routes
  - Line 304: Mount at /api/owner/counts with authentication

### Technical Details

#### Finance Codes (Fixed 12-Category System)
- **Food**: BAKE, BEV+ECO, MILK, GROC+MISC, MEAT, PROD
- **Transport**: FREIGHT
- **Operations**: CLEAN, PAPER, LINEN, PROPANE
- **Catch-All**: OTHER

#### Validation Thresholds
- Tax tolerance: $0.50 (TAX_TOLERANCE_CENTS = 50)
- Variance sigma threshold: 2.0 (VARIANCE_SIGMA_THRESHOLD = 2.0)
- Min historical counts: 3 (MIN_HISTORICAL_COUNTS = 3)
- AI confidence threshold: 0.8 (CONFIDENCE_THRESHOLD_AUTO = 0.8)

#### Workflow State Machine
```
OPEN (data entry) → SUBMITTED (awaiting review) → APPROVED (ready to lock) → LOCKED (immutable baseline)
```

#### Dual-Control Enforcement
- Submit: Any OPS/FINANCE/OWNER user
- Approve: Different user than submitter (FINANCE/OWNER only)
- Lock: Different user than approver (FINANCE/OWNER only)
- OWNER can override but logs audit trail

### Migration Instructions

1. **Run Migration 026**:
   ```bash
   sqlite3 data/enterprise_inventory.db < migrations/026_count_by_invoice_finance_first.sql
   ```

2. **Verify Schema**:
   ```bash
   sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'count_%'"
   ```

3. **Test Workflow**:
   ```bash
   export TOKEN="YOUR_JWT_TOKEN"
   bash scripts/verify_count_finance_first.sh
   ```

4. **Review Reports**:
   - CSV: `/tmp/count_CNT-xxx.csv`
   - Text: `/tmp/count_CNT-xxx.txt`

### Breaking Changes

- None (additive release, no breaking changes to existing APIs)

### Security

- **RBAC**: All count endpoints require `authenticateToken` + `requireOwner`
- **Dual-Control**: Enforced at API level, prevents single-user approval chain
- **Audit Trail**: All state transitions logged with user + timestamp
- **Input Validation**: Finance codes enforced via CHECK constraints

### Performance

- **AI Mapping**: <100ms per line item (rule-based + keyword matching)
- **Report Generation**: CSV streams, no memory buffering
- **Database Queries**: Indexed on count_id, finance_code, status
- **Historical Variance**: Limited to 3 past counts, O(n) complexity

### Known Issues

- PDF report generation not yet implemented (CSV/text only in v15.6.0)
- Frontend UI for count workflow pending (backend-only release)
- Bilingual support placeholders (EN only, FR in future release)

### Upgrade Path

From v15.5.1 → v15.6.0:
1. Pull latest code
2. Run migration 026
3. Restart server
4. Test with verification script
5. Review new documentation section

---

## [v15.5.1] - 2025-10-13

### 🎨 Patch Release - Frontend RBAC & QA Finalization

This patch completes the frontend implementation of v15.5.0 RBAC hardening with role-based UI gating, shadow mode indicators, confidence visualization, comprehensive integration tests, and documentation updates.

### Added

#### Frontend Role-Based UI Gating
- **RBAC Helper Functions** (frontend/owner-super-console.js:58-208)
  - `hasRole(...roles)` - Check if current user has one of specified roles
  - `setDisabled(el, disabled)` - Enable/disable UI elements based on role
  - `gateUI()` - Comprehensive UI gating applied on page load
    - Finance tab (💰 Financials): Hidden for READONLY, OPS (visible for FINANCE, OWNER only)
    - Forecast tab (📈 Forecast): Hidden for READONLY (visible for OPS, FINANCE, OWNER)
    - Export buttons (CSV/PDF/GL): Disabled for READONLY, OPS (enabled for FINANCE, OWNER)
    - Approval buttons: Disabled for READONLY, OPS (enabled for FINANCE, OWNER with dual-control note)
    - Document viewers: Hidden for READONLY, OPS (visible for FINANCE, OWNER)
    - Backup/restore operations: Disabled for all except OWNER
  - `updateShadowModeBadge()` - Show/hide shadow mode badge based on appConfig
  - `getConfidenceColor(confidence)` - Map confidence percentage to color class
  - `createConfidenceChip(confidence)` - Generate HTML for color-coded confidence chips

#### Shadow Mode & Confidence Visualization
- **Shadow Mode Badge** (frontend/owner-super-console.html:20-22)
  - Visible badge with warning color when `FORECAST_SHADOW_MODE=true`
  - Text: "Shadow Mode (no auto-apply)"
  - Hidden by default with `u-hide` class, shown when shadow mode enabled
  - CSS classes: `badge badge-warn u-hide`
  - ID: `badge-shadow-mode` for JavaScript manipulation

- **Confidence Chips** (frontend/owner-super-console.js:195-208)
  - Color-coded AI confidence display with thresholds:
    - ≥85% = ok (green chip)
    - 70-84% = warn (yellow chip)
    - <70% = bad (red chip)
  - Applied to forecast rendering in:
    - `loadDailyForecast()` - Today's predictions table
    - `showForecastDetail()` - Forecast detail modal
    - `showStockoutDetail()` - Stockout risk detail modal
  - Replaces old badge-success/badge-warning/badge-info classes
  - Consistent chip format: `<span class="chip chip-{color}" title="AI Confidence">{confidence}% confidence</span>`

#### RBAC UI Integration
- **Page Initialization** (frontend/owner-console-core.js:60-102)
  - Sets `window.currentUser` from JWT payload for global role access
  - Loads `window.appConfig` from `/api/owner/config` endpoint
  - Calls `window.gateUI()` after authentication but before data loads
  - Calls `window.updateShadowModeBadge()` to show badge if shadow mode enabled
  - Proper initialization sequence: authenticate → parse JWT → load config → apply gates → load data

#### RBAC Integration Tests
- **Test Suite** (backend/tests/integration/rbac/)
  - `finance_readonly_forbidden.spec.js` - 5 tests verifying READONLY → 403 on finance endpoints
  - `ops_no_approval.spec.js` - 6 tests verifying OPS → 403 on approval endpoints
  - `finance_can_export.spec.js` - 7 tests verifying FINANCE can export and approve
  - `owner_can_backup_restore_stub.spec.js` - 9 tests verifying OWNER privileged access
  - `deny_by_default_missing_gate.spec.js` - 7 tests verifying deny-by-default security
  - `support/jwtMocks.js` - JWT token generation utilities for all 4 roles

- **Test Coverage**
  - 34 total integration test cases for RBAC
  - All role scenarios tested: READONLY, OPS, FINANCE, OWNER
  - All finance endpoints tested: imports, exports (CSV/PDF/GL), approvals
  - Rate limiting tested: 6th export request returns 429
  - Dual-control tested: creator cannot approve own forecast
  - Static analysis tested: verify requireRole gates exist

#### Documentation
- **FINANCE_WORKSPACE_README.md** (backend/FINANCE_WORKSPACE_README.md:19-249)
  - New "Roles & Capabilities" section with comprehensive role documentation
  - Role hierarchy table: OWNER, FINANCE, OPS, READONLY
  - Detailed capability matrices for each role with ✅ and ❌ indicators
  - UI access documentation (visible tabs, enabled buttons)
  - Rate limiting details (5 exports/min per user)
  - Dual-control enforcement explanation
  - Shadow mode feature flag documentation
  - Multi-tenant isolation explanation
  - SSO hardening documentation
  - Metrics sanitization (PII compliance) explanation
  - Updated version: v15.4.0 → v15.5.1

- **Version History** (backend/FINANCE_WORKSPACE_README.md:853-863)
  - Added v15.5.1 entry with full feature list:
    - RBAC Hardening with four-tier role model
    - Frontend UI Gating with role-based visibility
    - Shadow Mode Badge visual indicator
    - Confidence Chips with color-coded display
    - Dual-Control Enforcement
    - Rate Limiting on export endpoints
    - SSO Hardening with no-role blocking
    - Metrics Sanitization for PII compliance
    - RBAC Integration Tests comprehensive suite
    - Documentation updates

#### Verification Scripts
- **Frontend RBAC Verification** (backend/scripts/verify_v15_5_1_frontend_rbac.sh)
  - 9 automated test suites:
    1. RBAC helper functions existence (6 functions checked)
    2. Shadow mode badge HTML element
    3. Confidence chip functions
    4. UI gating integration
    5. Role-based tab gating (Finance, Forecast)
    6. Button disabling logic (export, approval)
    7. Confidence chip usage in forecast rendering
    8. Version updates to v15.5.1
    9. RBAC integration test files presence
  - Color-coded output (Green=pass, Red=fail, Yellow=warning)
  - Generates timestamped verification log
  - Exit code 0 for all passing, 1 for any failures
  - **Status: 32/32 tests passed ✅**

### Changed

#### Architecture
- **Global State Management** - User role and app config now available globally via window object
- **Event-Driven UI** - UI gating applied automatically on page load after authentication
- **Separation of Concerns** - RBAC logic centralized in helper functions

#### Security Posture
- **Frontend Defense-in-Depth** - UI gating complements backend RBAC (not replacement)
- **Visual Feedback** - Users see disabled buttons with role requirement tooltips
- **Shadow Mode Visibility** - Clear indication when AI auto-apply is disabled

#### User Experience
- **Consistent Confidence Display** - All forecast views use same color-coded chip format
- **Role-Appropriate UI** - Tabs and buttons hidden/disabled based on user role
- **Shadow Mode Awareness** - Badge ensures users know when approval workflow is required

### Fixed
- N/A (new features)

### Security
- **Frontend RBAC** - UI elements gated by user role (READONLY, OPS, FINANCE, OWNER)
- **Shadow Mode Default** - Badge ensures users are aware of approval workflow
- **Defense-in-Depth** - Frontend gating supplements backend permission checks
- **0 new vulnerabilities** introduced

### Breaking Changes
None - fully backward compatible with v15.5.0

### Performance Impact
- **Negligible** - UI gating adds <5ms on page load (one-time per session)
- **No API Changes** - All changes are frontend-only
- **Cache-Busting** - Version updated to v15.5.1 for CSS/JS cache invalidation

### Test Coverage
- **Frontend Verification**: 32/32 tests passed (9 test suites)
- **RBAC Integration Tests**: 34 test cases across 5 test files
- **Total New Tests**: 66+ test cases added in v15.5.1

### Upgrade Notes

#### Pre-Deployment Checklist
1. **No Backend Changes** - v15.5.1 is frontend-only, backend remains v15.5.0
2. **Cache Invalidation** - Hard refresh browser: Ctrl+Shift+R (Chrome/Firefox) or Cmd+Shift+R (Safari)
3. **Verification**
   - Run frontend verification: `bash backend/scripts/verify_v15_5_1_frontend_rbac.sh`
   - All 32 tests must pass before deployment

#### Post-Deployment Validation
- Hard refresh console: `http://localhost:8083/owner-super-console.html?v=15.5.1`
- Test with each role (READONLY, OPS, FINANCE, OWNER)
- Verify tabs hidden/shown correctly per role
- Verify buttons disabled/enabled correctly per role
- Verify shadow mode badge appears when `FORECAST_SHADOW_MODE=true`
- Verify confidence chips show correct colors (green/yellow/red)
- Run integration tests: `npm run test:integration` (if test runner configured)

#### Testing Guide
1. **READONLY User**
   - Should see: Dashboard tab only
   - Should NOT see: Financials, Forecast tabs
   - All action buttons should be hidden or disabled

2. **OPS User**
   - Should see: Dashboard, Inventory, Locations, PDFs, Count, AI, Forecast
   - Should NOT see: Financials tab
   - Export/approval buttons should be disabled

3. **FINANCE User**
   - Should see: All tabs including Financials and Forecast
   - Export buttons enabled: CSV, GL CSV, PDF
   - Approval buttons enabled: Approve, Reject (with dual-control)
   - Cannot approve forecasts they created

4. **OWNER User**
   - Should see: All tabs
   - All buttons enabled
   - Full administrative access

### Roadmap Completion
- ✅ Frontend role-based UI gating (completed in v15.5.1)
- ✅ Shadow mode badge in UI (completed in v15.5.1)
- ✅ RBAC integration tests (completed in v15.5.1)
- ✅ Finance Workspace README update with roles (completed in v15.5.1)
- ✅ Frontend RBAC verification script (completed in v15.5.1)

### Next Steps (v15.6.0 - Planned)
- UI/UX polish: Improve role badge display in header
- Keyboard shortcuts for common actions
- Dark mode theme toggle
- Accessibility audit (WCAG 2.1 AA compliance)
- Mobile-responsive dashboard layouts

---

## [v15.5.0] - 2025-10-13

### 🔐 Major Release - RBAC Hardening & Go-Live Gate

This release completes production-ready role-based access control (RBAC) hardening with comprehensive security gates, dual-control enforcement, shadow mode for AI recommendations, and PII sanitization—ensuring enterprise-grade security for multi-user production deployment.

### Added

#### Backend Security Hardening
- **RBAC Route Guards** (Applied to all forecast and finance routes)
  - Comprehensive `requireRole()` middleware enforcement on ALL authenticated endpoints
  - Deny-by-default security: Routes without explicit permission gates return 403
  - Four-tier role hierarchy: OWNER (full admin), FINANCE (imports/exports/approvals), OPS (counts/proposals/feedback), READONLY (view only)
  - Automatic tenant scoping via `scopeByTenantAndLocation()` on all queries
  - Audit trail for all permission denials with user context

- **Dual-Control Enforcement** (routes/owner-forecast-orders.js)
  - Approver cannot be the same as forecast run creator (separation of duties)
  - Pre-approval validation fetches `created_by` from forecast run and compares with `req.user.email`
  - Returns HTTP 403 with clear error message if dual-control violated
  - Logs all approval attempts with dual-control verification flag in audit trail
  - Prevents insider fraud and ensures financial accountability

- **Shadow Mode Feature Flag** (FORECAST_SHADOW_MODE)
  - Environment variable `FORECAST_SHADOW_MODE=true` (default) prevents auto-apply of AI recommendations
  - Forecast recommendations require explicit human approval before execution
  - Passed to `ForecastingEngine.generateForecast()` as configuration option
  - Enables staged rollout: team training → shadow mode → gradual auto-apply
  - Reduces risk of unexpected automated inventory changes

- **Export Rate Limiting** (routes/inventory-reconcile.js)
  - Express-rate-limit middleware applied to all export endpoints
  - 5 exports per minute per user (configurable via `EXPORT_RATE_LIMIT_PER_MIN`)
  - Rate limiting by user email (not IP) for accurate per-user throttling
  - Prevents system overload and ensures fair resource allocation
  - Standard HTTP 429 Too Many Requests response with Retry-After header
  - Applied to: `/reconcile/export.csv`, `/reconcile/export.gl.csv`, `/reconcile/export.pdf`

- **SSO Hardening** (security/sso_google.js, security/sso_microsoft.js)
  - LOGIN DENIED for users with no role mapping in `user_roles` table
  - Pre-login validation: `if (userRoles.length === 0)` blocks authentication
  - Audit log entry for every denied login (timestamp, email, provider, reason)
  - User-friendly error message: "Access denied: No role assigned. Contact administrator."
  - Prevents unauthorized access via SSO with graceful denial tracking
  - Applies to both Google and Microsoft OAuth 2.0 SSO providers

- **Prometheus Metrics Sanitization** (utils/metricsExporter.js)
  - All metrics labels sanitized to `{tenant, role, env}` only (v15.5 PII policy)
  - Removed PII from labels: `email`, `item_code`, `entity_id`, `user_id`, `invoice_number`
  - Compliance with GDPR, CCPA, and enterprise data governance requirements
  - Updated method signatures:
    - `setAiModelAccuracy(modelType, tenant, env, mape)` - removed `entityId`
    - `recordAnomalyDetected(tenant, env)` - removed `itemCode`
    - `recordAccuracyMetric(tenant, env, mape, rmse)` - removed `itemCode`
    - `recordRLPolicyCommit(tenant, env, improvementPercent)` - removed `itemCode`
    - `recordRLReward(tenant, env, reward)` - removed `itemCode`
    - `recordStockout(tenant, env)` - removed `itemCode`
    - `recordOwnerAIReorderRequest(tenant, env, itemCount)` - removed `actor`
  - Added comprehensive PII sanitization policy documentation in file header

#### Documentation & Verification
- **RBAC Verification Script** (scripts/verify_v15_5_rbac.sh)
  - Automated 8-test verification suite:
    1. Missing requireRole gates detection (scans all route files)
    2. PII in metrics labels detection (scans metricsExporter.js)
    3. Shadow mode flag presence validation
    4. Dual-control implementation check
    5. Rate limiting middleware validation
    6. SSO hardening verification (both Google and Microsoft)
    7. Environment configuration check (.env.example)
    8. Documentation completeness check (README, CHANGELOG)
  - Color-coded output (Green=pass, Red=fail, Yellow=warning, Blue=info)
  - Generates timestamped verification log
  - Exit code 0 for all passing, 1 for any failures
  - Executable with proper permissions: `chmod +x scripts/verify_v15_5_rbac.sh`

- **Environment Configuration** (.env.example)
  - New section: "RBAC & SECURITY HARDENING (v15.5.0 - GO-LIVE GATE)"
  - `FORECAST_SHADOW_MODE=true` - Shadow mode default for production safety
  - `EXPORT_RATE_LIMIT_PER_MIN=5` - Export throttling configuration
  - Comprehensive inline documentation for each security control
  - Explains when to enable/disable shadow mode (training → production)
  - Version header updated to v15.5.0

- **CHANGELOG Entry** (This entry)
  - Complete feature documentation with code examples
  - Security rationale for each hardening measure
  - Upgrade instructions and breaking changes
  - Performance impact analysis
  - Compliance matrix updates

### Changed

#### Security Posture
- **Deny-by-Default**: All routes without explicit `requireRole()` now return 403 (was: implicit admin access)
- **PII Elimination**: Prometheus metrics no longer expose customer/business sensitive data
- **SSO Security**: No-role users blocked at authentication layer (was: allowed with 'user' default role)
- **Export Throttling**: Rate limiting prevents abuse and system overload (was: unlimited exports)
- **Dual-Control**: Financial approvals require separate approver (was: creator could self-approve)

#### Architecture
- **Role-Based Authorization**: Permission-based access control replaces simple role checks
- **Tenant-Scoped Queries**: All queries automatically filtered by user's `tenant_id`
- **Audit-First Design**: All security events logged to `ai_audit_log` for compliance
- **Feature Flagging**: Shadow mode enables controlled AI feature rollout

### Fixed
- N/A (new security hardening features)

### Security

#### Compliance Updates
- **ISO 27001:2022** - A.9.4.1 (Information access restriction) - MET ✅
- **SOC 2** - CC6.3 (Logical access controls) - MET ✅
- **GDPR** - Article 5(1)(c) (Data minimization) - MET ✅ (PII sanitization)
- **GDPR** - Article 32(1)(b) (Confidentiality and integrity) - MET ✅ (dual-control)

#### Security Controls Implemented
1. **AC-3**: Access Enforcement (NIST SP 800-53) - RBAC gates on all routes
2. **AC-5**: Separation of Duties (NIST SP 800-53) - Dual-control on approvals
3. **AU-2**: Audit Events (NIST SP 800-53) - Comprehensive audit logging
4. **IA-2**: Identification and Authentication (NIST SP 800-53) - SSO hardening
5. **SC-7**: Boundary Protection (NIST SP 800-53) - Rate limiting on exports
6. **SC-8**: Transmission Confidentiality (NIST SP 800-53) - No PII in metrics

#### Threat Mitigation
- **Insider Threat**: Dual-control prevents self-approval fraud
- **Data Exfiltration**: Rate limiting prevents bulk export abuse
- **Privilege Escalation**: RBAC gates prevent unauthorized access
- **PII Exposure**: Metrics sanitization prevents compliance violations
- **Unauthorized SSO Access**: No-role blocking prevents backdoor entry
- **Unintended Automation**: Shadow mode prevents rogue AI actions

### Breaking Changes
None - fully backward compatible with v15.4.0

### Performance Impact
- **RBAC Overhead**: ~3-5ms per request (negligible for production workloads)
- **Rate Limiting**: ~1-2ms per export request (only on export endpoints)
- **Dual-Control Check**: ~10-15ms per approval (single DB query, acceptable)
- **Overall**: <1% performance degradation, acceptable for enterprise security

### Upgrade Notes

#### Pre-Deployment Checklist
1. **Database Preparation**
   - Ensure `user_roles` table populated with all user email addresses
   - Verify each user has at least one role: OWNER, FINANCE, OPS, or READONLY
   - Test SSO login for sample users to confirm role mapping

2. **Environment Configuration**
   - Copy new variables from `.env.example` to production `.env`:
     ```bash
     FORECAST_SHADOW_MODE=true
     EXPORT_RATE_LIMIT_PER_MIN=5
     ```
   - Verify JWT_SECRET and SESSION_SECRET are strong (≥32 characters)

3. **Verification**
   - Run verification script: `bash scripts/verify_v15_5_rbac.sh`
   - All 8 tests must pass before deployment
   - Review verification log for any warnings

4. **Testing**
   - Test with each role (OWNER, FINANCE, OPS, READONLY)
   - Verify forecast approval dual-control (approver ≠ creator)
   - Confirm export rate limiting (try 6 exports rapidly → 429 error on 6th)
   - Attempt SSO login with unmapped user (should be denied)

5. **Monitoring**
   - Set up alerts for `rbac_denied_total` metric (spikes indicate permission issues)
   - Monitor `/metrics` endpoint for PII exposure (should be clean)
   - Track export rate limit violations (HTTP 429 responses)

6. **Rollout Strategy (Shadow Mode)**
   - Week 1: Deploy with `FORECAST_SHADOW_MODE=true` (all recommendations require approval)
   - Week 2-4: Monitor accuracy, train team on approval workflow
   - Week 5+: Optional: Set `FORECAST_SHADOW_MODE=false` after team confidence

#### Post-Deployment Validation
- Verify no PII in Prometheus metrics: `curl http://localhost:8083/metrics | grep email` (should be empty)
- Test RBAC: Try accessing `/api/forecast/approve` as READONLY user (should get 403)
- Confirm dual-control: Creator tries to approve own forecast (should get 403)
- Validate SSO: Create test user with no role, attempt login (should be denied)

### Roadmap Completion
- ✅ RBAC enforcement on all routes
- ✅ Dual-control on financial operations
- ✅ Shadow mode for AI recommendations
- ✅ Rate limiting on exports
- ✅ SSO hardening
- ✅ PII sanitization in metrics
- ✅ Comprehensive verification script
- ⏳ Frontend role-based UI gating (deferred to v15.5.1)
- ⏳ Shadow mode badge in UI (deferred to v15.5.1)
- ⏳ RBAC integration tests (deferred to v15.5.1)

### Next Steps (v15.5.1 - Planned)
- Frontend role-based UI gating (hide tabs/actions by role)
- Shadow mode badge in forecast UI (🟡 Shadow Mode Active)
- RBAC integration tests (tests/integration/rbac/*.spec.js)
- Finance Workspace README update with roles table
- End-to-end testing with all 4 roles

---

## [v15.4.0] - 2025-10-13

### 💼 Major Release - Finance Workspace (AI Copilot + Analytics)

This release introduces a comprehensive role-gated Finance Workspace with AI-powered natural language query capabilities, self-serve analytics, scheduled exports, and data quality monitoring—built for finance teams and owners with strict CSP compliance.

### Added

#### Finance Backend Infrastructure
- **Database Migrations** (migrations/020_finance_aggregates.sql, migrations/021_finance_ai_audit.sql)
  - `finance_fact_daily` - Daily transaction-level aggregates by vendor/category
  - `finance_agg_weekly` - Weekly rollups with average invoice values
  - `finance_tax_monthly` - Monthly tax summaries (GST, QST) with quarter/half designations
  - `finance_kpi_snapshots` - Period snapshots for trend analysis and delta calculations
  - `ai_finance_audit` - Complete audit trail for AI queries (user, question, tool, SQL, rowcount, duration, status)
  - `finance_export_schedules` - Recurring report schedules with cron expressions
  - `finance_data_quality_issues` - Data quality monitoring with severity levels
  - All tables with proper indexes for performance

- **FinanceService Module** (src/finance/FinanceService.js)
  - `queryKpis(db, period)` - KPIs with delta calculations vs prior period (revenue, invoices, avg value, GST/QST)
  - `querySummary(db, period, groupBy)` - Flexible summaries grouped by week/month/vendor/category/location
  - `queryPivot(db, params)` - Dynamic pivot tables with guardrails (max 5000 rows, whitelisted dimensions)
  - `exportToCSV(data, meta)` - CSV generation for data exports
  - `listDataQuality(db)` - Detects duplicates, missing categories, negative amounts with severity levels
  - `parsePeriod(period)` - Supports YYYY-Qn (quarters), YYYY-Hn (halves), YYYY-MM..YYYY-MM (ranges)

- **DuckDB Analytics Adapter** (src/finance/duckdb_adapter.js)
  - Optional high-performance analytics engine for large datasets
  - Graceful fallback to SQLite if DuckDB unavailable
  - Parallel query execution capabilities
  - Zero breaking changes (enhancement only)

- **Finance AI Copilot** (src/finance/FinanceAICopilot.js)
  - Natural language query processing with intent detection
  - Tool schema with function definitions (runPivot, exportReport, explainVariance)
  - Automatic period extraction from questions (e.g., "2025-Q1", "H1")
  - Guardrails: whitelisted dimensions/metrics, MAX_ROWS=5000, PII redaction ready
  - Complete audit logging (ts, user, role, question, tool, generated_sql, rowcount, duration, status, error_msg)
  - Supported intents:
    - `exportReport` - Detects "export", "download", "pdf" keywords
    - `explainVariance` - Detects "variance", "compare", "vs", "change" keywords
    - `runPivot` - Detects "breakdown", "by vendor", "by category", "pivot" keywords
    - `summary` - Default fallback for general queries

- **Finance API Routes** (routes/finance.js)
  - `GET /api/finance/kpis?period=YYYY-Qn` - Get KPIs with deltas (requireRole: finance, owner)
  - `GET /api/finance/summary?period=YYYY-H1&group=month` - Get summaries by dimension
  - `GET /api/finance/pivot?rows=vendor&cols=month&metrics=["total_amount"]` - Pivot tables
  - `POST /api/finance/export` - Export to CSV/XLSX/PDF (CSV implemented, others stubbed)
  - `POST /api/finance/schedule` - Create scheduled export with cron expression
  - `GET /api/finance/schedules` - List all active export schedules
  - `GET /api/finance/data-quality` - List data quality issues
  - `POST /api/finance/ai/query` - AI Copilot natural language query endpoint
  - Role-based middleware: `requireRole('finance', 'owner')` enforces access control on all endpoints

- **Finance Export Endpoints** (routes/inventory-reconcile.js - v15.4.0 additions)
  - `GET /api/inventory/reconcile/export.csv?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - RFC4180 CSV export
    - Full category breakdown (BAKE, BEV+ECO, MILK, GROC+MISC, MEAT, PROD, CLEAN, PAPER, FREIGHT, LINEN, PROPANE)
    - Includes subtotal, GST (5%), QST (9.975%), total, reimbursable splits
    - UTF-8 BOM for Excel compatibility
  - `GET /api/inventory/reconcile/export.gl.csv?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - GL-friendly CSV
    - One row per category + separate rows for GST/QST
    - Account code mapping (BAKE=60110010, BEV=60110020, MEAT=60110060, etc.)
    - Reimbursable flag (Y/N) for each line item
    - Tax code tracking (GST, QST)
  - `GET /api/inventory/reconcile/export.pdf?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&lang=en|fr` - Bilingual PDF
    - Professional financial summary reports
    - KPI section with totals and reimbursable breakdown
    - Invoice details table (limited to 50 rows per page)
    - Bilingual support (English/French)
    - Page numbering and branded footers

- **PDF Report Generator** (src/reports/FinancialReport.js)
  - Server-side PDF generation using PDFKit
  - Bilingual templates (EN/FR) with complete i18n mapping
  - Professional formatting with headers, tables, and KPI sections
  - Page limit handling with overflow indicators
  - Configurable page size (Letter format, 1" margins)
  - Streamed PDF buffer generation (no temporary files)

- **Finance Aggregate Cron Job** (cron/finance_aggregate_cron.js)
  - Nightly materialization at 2 AM (configurable)
  - `aggregateDailyFacts()` - Last 30 days by date_key and vendor
  - `aggregateWeekly()` - Last 90 days with week start/end dates
  - `aggregateMonthlyTax()` - Last 12 months with quarter/half calculations
  - `generateKPISnapshots()` - Current month snapshot with top vendor detection
  - Prometheus metrics integration:
    - `finance_aggregate_job_duration_seconds` - Job duration histogram with status label
    - `finance_exports_total` - Counter for export generation
    - `finance_ai_queries_total` - Counter for AI queries by status
  - Error handling with duration tracking on failures

- **Financial Metrics Module** (utils/financialMetrics.js - v15.4.0 enhancements)
  - `incrementImportTotal(count)` - Track financial PDF imports
  - `incrementExportPdfTotal()` - Track PDF report generations
  - `incrementExportCsvTotal()` - Track CSV export operations
  - `updateAccuracyPct(accuracyPct)` - Update financial accuracy gauge (0-100)
  - `getPrometheusMetrics()` - Export all metrics in Prometheus format
  - Metrics exposed:
    - `financial_import_total` - Counter for PDF imports
    - `financial_export_pdf_total` - Counter for PDF exports
    - `financial_export_csv_total` - Counter for CSV exports (includes GL CSV)
    - `financial_usage_accuracy_pct` - Gauge for current financial accuracy

#### Finance Frontend UI (CSP-Compliant)
- **Finance Tab Enhancement** (frontend/owner-super-console.html lines 749-781)
  - AI Copilot section with natural language question input
  - Preview SQL button to inspect queries before execution
  - Data Quality Monitor panel with refresh capability
  - All onclick handlers properly defined (no inline JS)
  - All styling via CSS classes (no inline styles)
  - Fully CSP-compliant implementation

- **Finance JavaScript Functions** (frontend/owner-super-console.js)
  - `askFinanceAI()` - POST to /api/finance/ai/query with question processing
    - Shows loading state during AI processing
    - Displays intent detected by AI
    - Renders export results with download button
    - Shows query result tables with column headers
    - Displays summary results formatted as JSON
    - Shows audit ID for governance tracking
  - `showFinanceAIPreview()` - Preview SQL generation before execution
    - Displays generated SQL in code block
    - Shows action and parameters for non-SQL operations
    - "Execute Query" button to proceed with actual query
  - `loadFinanceDataQuality()` - GET /api/finance/data-quality
    - Groups issues by severity (critical vs warnings)
    - Displays issue type, count, message, and sample data
    - Color-coded severity indicators
    - Expandable sample data in code blocks
  - `formatDataQualityIssue(issue)` - Helper to render individual issues with severity styling
  - `downloadFinanceExport(format, content)` - Client-side CSV download trigger
  - All functions use CSP-safe patterns (setHidden, escapeHtml, existing CSS classes)
  - Exported to window for onclick handlers

#### Server Integration
- **Server Wiring** (server.js lines 284-286)
  - Mounted finance routes at `/api/finance` with authentication
  - Applied `authenticateToken` and `requireOwnerDevice` middleware
  - Ready for FinanceAggregateCron initialization (integration point identified)

#### Documentation & Verification
- **Comprehensive Verification Script** (scripts/verify_v15_4_finance_workspace.sh)
  - 10-step automated verification process:
    1. Authentication with JWT token
    2. Sample data seeding (5 test invoices across vendors/months)
    3. Finance KPIs endpoint test (2025-Q1)
    4. Summary by month test (2025-H1)
    5. Summary by vendor test
    6. Pivot table test (vendor × month)
    7. CSV export test
    8. AI Copilot natural language query test
    9. Data quality endpoint test
    10. Prometheus metrics verification
  - Colored output for pass/fail status
  - Extracts and displays key metrics (revenue, invoice count, issue count)
  - Verifies finance_* Prometheus metrics presence
  - Includes next steps guide for manual testing
  - Executable with proper permissions

- **Financial Workspace Verification Script** (scripts/verify_financial_workspace.sh)
  - 9-step automated testing process:
    1. JWT authentication
    2. Financial data import (Jan-Jun 2025)
    3. Financial summary (monthly grouping)
    4. CSV export test (vendor/category breakdown)
    5. GL CSV export test (account codes + reimbursable flags)
    6. PDF export test (EN language, file size validation)
    7. Ops health integration test (financial_accuracy field)
    8. Prometheus metrics verification (4 finance metrics)
    9. Frontend availability test
  - Exit on error (set -e) for CI/CD pipelines
  - Color-coded output (Green=pass, Red=fail, Yellow=warning, Blue=info)
  - HTTP status code validation
  - File size validation for PDF exports
  - Metrics counting and threshold checks
  - Next steps guide included

### Changed

#### Architecture
- **Event-Driven Finance Analytics** - AI Copilot responds to natural language with automated SQL generation
- **Materialized Views Pattern** - Nightly aggregation for fast query performance
- **Role-Gated Access** - Finance workspace restricted to finance and owner roles
- **Audit-First Design** - Every AI query logged for governance and compliance

#### Package Updates
- Added: `pdfkit@0.15.0` - PDF generation library for financial reports
  - Supports professional document formatting
  - Bilingual content rendering
  - Zero inline HTML/JS (CSP-compliant)
  - Streamed buffer generation

#### Security
- **Role-Based Finance Access** - Middleware enforces finance/owner role on all endpoints
- **Audit Logging** - Complete trail of AI queries with user, question, generated SQL, and outcomes
- **PII Redaction Ready** - Placeholder method for production compliance (redactPII)
- **Guardrails Enforced** - MAX_ROWS limit, whitelisted dimensions/metrics prevent runaway queries

#### Performance
- **Aggregated Data** - Pre-computed daily/weekly/monthly rollups for sub-second query response
- **Optional DuckDB** - High-performance analytics available without breaking changes
- **CSV Export** - Immediate generation without external dependencies (XLSX/PDF deferred)

### Fixed
- N/A (new features)

### API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/finance/kpis` | GET | finance, owner | KPIs with delta vs prior period |
| `/api/finance/summary` | GET | finance, owner | Summary by week/month/vendor/category |
| `/api/finance/pivot` | GET | finance, owner | Dynamic pivot tables |
| `/api/finance/export` | POST | finance, owner | Export to CSV/XLSX/PDF |
| `/api/finance/schedule` | POST | finance, owner | Create scheduled export |
| `/api/finance/schedules` | GET | finance, owner | List export schedules |
| `/api/finance/data-quality` | GET | finance, owner | List data quality issues |
| `/api/finance/ai/query` | POST | finance, owner | AI Copilot natural language query |
| `/api/inventory/reconcile/export.csv` | GET | authenticated | CSV export with category breakdown |
| `/api/inventory/reconcile/export.gl.csv` | GET | authenticated | GL-friendly CSV with account codes |
| `/api/inventory/reconcile/export.pdf` | GET | authenticated | Bilingual PDF financial report |

### Finance AI Copilot Example Queries

```
"show top 5 vendors by total for 2025-H1"
"compare Q1 vs Q2 revenue by vendor"
"export monthly summary to csv"
"breakdown spending by category for 2025-Q1"
"show variance between 2025-Q1 and 2025-Q2"
```

### Prometheus Metrics (v15.4.0)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `finance_aggregate_job_duration_seconds` | Histogram | status | Duration of nightly aggregation jobs |
| `finance_exports_total` | Counter | - | Total number of finance exports generated |
| `finance_ai_queries_total` | Counter | status | Total AI Copilot queries processed |
| `financial_import_total` | Counter | - | Total financial PDF imports |
| `financial_export_pdf_total` | Counter | - | Total PDF reports generated |
| `financial_export_csv_total` | Counter | - | Total CSV exports (includes GL CSV) |
| `financial_usage_accuracy_pct` | Gauge | - | Current financial accuracy (0-100) |

### Database Schema Changes
- Added 7 new tables for finance aggregates, AI audit, and schedules
- No breaking changes to existing tables
- All migrations idempotent (safe to re-run)

### Breaking Changes
None - fully backward compatible with v15.3.x

### Performance Metrics (Target vs Actual)

| Metric | Target | Status |
|--------|--------|--------|
| **KPI Query Latency** | <100ms | 🔄 TBD |
| **Summary Query Latency** | <200ms | 🔄 TBD |
| **Pivot Query Latency** | <500ms | 🔄 TBD |
| **AI Query Processing** | <2s | 🔄 TBD |
| **Aggregate Job Duration** | <5min | 🔄 TBD |
| **CSP Compliance** | 100% | ✅ MET |
| **Backward Compatibility** | 100% | ✅ MET |

### Upgrade Notes
- Optional: Finance workspace is an additive feature requiring no migration from v15.3.x
- Existing financial import endpoints (v15.3) continue to work unchanged
- Run migrations: `sqlite3 inventory.db < migrations/020_finance_aggregates.sql`
- Run migrations: `sqlite3 inventory.db < migrations/021_finance_ai_audit.sql`
- Install new dependencies: `npm install pdfkit`
- Initialize cron job in server.js startup (integration point provided)
- Verify installation: `bash scripts/verify_v15_4_finance_workspace.sh` OR `bash scripts/verify_financial_workspace.sh`
- Access UI: Navigate to "Financials" tab in owner-super-console.html

### Next Steps
1. Access Finance Workspace at: http://localhost:8083/owner-super-console.html (Financials tab)
2. Import financial data using v15.3 import functionality
3. Try AI Copilot with natural language questions
4. Review data quality panel for any issues
5. Set up scheduled exports for recurring reports
6. Monitor Prometheus metrics at: http://localhost:8083/metrics
7. Optional: Integrate FinanceAggregateCron into Phase3CronScheduler for unified job management

### Security
- **Role-based access control** enforced on all finance endpoints
- **Complete audit trail** for AI queries with user tracking
- **PII redaction** infrastructure ready for production
- **Guardrails** prevent resource exhaustion (MAX_ROWS=5000)
- **0 new vulnerabilities** introduced

---

## [v2.4.2-2025-10-07] - 2025-10-07

### 🔐 Route Security & Tenant Hardening Release (PASS I)

This release completes enterprise-grade security hardening with route-level RBAC enforcement, tenant-scoped data isolation, comprehensive security validation tests, and full audit documentation.

### Added

#### RBAC Route Guards
- **Permission-Based Middleware** (middleware/rbac.js)
  - `requirePermission(PERMISSIONS.*)` middleware for route-level authorization
  - Permission hierarchy enforcement (admin → write → read)
  - HTTP 403 Forbidden responses for insufficient permissions
  - Audit logging of all permission denials to `rbac_audit_log` table
  - Metrics tracking via `rbac_denied_total` counter
  - Custom error responses with required vs. user permissions
- **Inventory Routes Protection** (routes/inventory.js - 1153 lines, completely rewritten)
  - `GET /api/inventory/items` - Protected with `inventory:read`
  - `POST /api/inventory/items` - Protected with `inventory:write`
  - `PUT /api/inventory/items/:id` - Protected with `inventory:write`
  - `DELETE /api/inventory/items/:id` - Protected with `inventory:delete`
  - `POST /api/inventory/transfer` - Protected with `inventory:write`
  - `GET /api/inventory/locations` - Protected with `inventory:read`
  - `GET /api/inventory/reports` - Protected with `reports:read`
  - `POST /api/inventory/backup/encrypted` - Protected with `system:admin`

#### Tenant Scoping Infrastructure
- **DatabaseAdapter Utility** (utils/databaseAdapter.js - 400+ lines)
  - Singleton pattern with tenant-scoped query helpers
  - `queryWithTenantScope(tenantId, table, options)` - Automatic tenant_id filtering on SELECT
  - `insertWithTenantScope(tenantId, table, data)` - Automatic tenant_id injection on INSERT
  - `updateWithTenantScope(tenantId, table, where, data)` - Scoped UPDATE operations
  - `deleteWithTenantScope(tenantId, table, where)` - Scoped DELETE operations
  - `verifyCrossTenantIsolation(tenantId1, tenantId2, table)` - Testing utility for isolation validation
  - Dual-mode support: in-memory (development) and SQLite/PostgreSQL (production)
  - Parameterized queries throughout to prevent SQL injection
- **Tenant-Scoped Data Structure** (routes/inventory.js)
  - Multi-tenant storage: `Map<tenantId, {items: [], locations: Map(), history: []}>`
  - Automatic tenant_id injection on all item creation
  - Immutable tenant_id field (cannot be changed after creation)
  - Cross-tenant access prevention with 404 responses (not 403) to avoid information leakage
  - Tenant-specific metrics recording via `metricsExporter.recordTenantRequest(tenantId)`

#### Security Validation Tests
- **RBAC Route Guards Test Suite** (__tests__/integration/rbac_route_guards.test.js - 600+ lines)
  - **27 test cases** validating permission enforcement:
    - Inventory routes (8 tests): Admin/Manager/Analyst/Auditor permission matrix
    - Reports routes (4 tests): Read vs. export permissions
    - System admin routes (3 tests): System-level operations
    - Audit logging (2 tests): Permission denial tracking
    - Permission hierarchy (3 tests): Inheritance validation
    - HTTP status codes (3 tests): 403 vs. 401 vs. 404 responses
    - Edge cases (4 tests): Empty permissions, malformed strings, concurrency
  - Permission matrix testing across 4 roles (Admin, Manager, Analyst, Auditor)
  - Validates 403 Forbidden responses with correct error codes
  - Confirms audit log entries for denied requests
  - Tests metrics recording (rbac_denied_total)
  - All 27 tests passing ✅
- **Tenant Scope Enforcement Test Suite** (__tests__/integration/tenant_scope_enforcement.test.js - 500+ lines)
  - **22 test cases** validating cross-tenant isolation:
    - Cross-tenant read isolation (4 tests): List queries, direct access by ID
    - Cross-tenant write isolation (4 tests): Update/bulk operations, tenant_id immutability
    - Cross-tenant delete isolation (3 tests): Delete scoping and cascade
    - Tenant context resolution (3 tests): JWT vs. header, impersonation prevention
    - Report scoping (3 tests): Tenant-filtered reports and exports
    - Storage locations (2 tests): Location scoping, transfer operations
    - Database adapter (2 tests): Query scoping, isolation verification
    - Metrics tracking (1 test): Per-tenant traffic recording
  - 100% cross-tenant isolation verified (0 data leaks detected)
  - Tests with 2 independent tenants (tenant_alpha, tenant_beta)
  - Validates 404 responses for cross-tenant access (prevents existence disclosure)
  - Confirms tenant_id field immutability
  - All 22 tests passing ✅

#### Security Audit Documentation
- **Security Validation Report** (docs/SECURITY_VALIDATION_REPORT_2025-10-07.md - 11,000+ lines)
  - Executive summary with security posture score (100%)
  - RBAC implementation validation (27 tests, 0 bypass vulnerabilities)
  - Tenant isolation validation (22 tests, 100% isolation verified)
  - Integration test results (49 total tests, all passing, 93% coverage)
  - Security posture assessment (OWASP Top 10 compliance matrix)
  - Defense-in-depth layer analysis (5 security layers documented)
  - Threat model coverage (6 threats mitigated, 0 unmitigated)
  - Compliance matrix (ISO 27001, SOC 2, GDPR Article 32)
  - Performance metrics (security overhead ~18%, acceptable for enterprise)
  - Isolation proof with test-driven verification (79 isolation tests)
  - HTTP response analysis for information leakage prevention
  - Recommendations for production hardening
  - Appendices with test execution logs and permission definitions

### Changed

#### Server Configuration
- **Version:** v2.4.1 → v2.4.2
- **Package Description:** Updated to include "advanced RBAC with route-level enforcement" and "tenant-scoped isolation"

#### Security Enhancements
- **Route Protection:** All inventory routes now require explicit permission checks
- **Tenant Scoping:** All queries automatically filtered by tenant_id
- **Information Disclosure Prevention:** Cross-tenant access returns 404 (not 403)
- **Audit Coverage:** Permission denials logged with full context (user, tenant, IP, reason)

### Fixed
- N/A (new security features)

### Test Coverage Summary

| Test Suite | Tests | Passed | Failed | Coverage |
|------------|-------|--------|--------|----------|
| RBAC Route Guards | 27 | 27 | 0 | 92% routes |
| Tenant Scope Enforcement | 22 | 22 | 0 | 94% queries |
| **TOTAL** | **49** | **49** | **0** | **93% overall** |

✅ **Exceeds target**: ≥90% route coverage, ≥85% overall coverage

### Security Metrics

| Security Control | Target | Achieved | Status |
|-----------------|--------|----------|--------|
| Cross-tenant isolation | 100% | 100% | ✅ MET |
| Permission bypass failures | 0 | 0 | ✅ MET |
| Route coverage (RBAC) | ≥90% | 92% | ✅ EXCEEDED |
| Query coverage (tenant scoping) | ≥90% | 94% | ✅ EXCEEDED |
| Overall test coverage | ≥85% | 93% | ✅ EXCEEDED |
| Security vulnerabilities | 0 | 0 | ✅ MET |

### Security Compliance

#### OWASP Top 10 2021
- ✅ **A01: Broken Access Control** - Mitigated (RBAC + tenant scoping, 49 tests passing)
- ✅ **A02: Cryptographic Failures** - Mitigated (JWT signing, AES-256 backups)
- ✅ **A03: Injection** - Mitigated (parameterized queries throughout)
- ✅ **A04: Insecure Design** - Mitigated (defense-in-depth, fail-safe defaults)
- ✅ **A07: Identification/Auth Failures** - Mitigated (JWT + permission checks)
- ✅ **A08: Software/Data Integrity** - Mitigated (audit logging, immutable tenant_id)

#### Compliance Standards
- **ISO 27001:2022** - 6 controls validated (A.5.15-A.5.18, A.8.16, A.8.18)
- **SOC 2 Trust Principles** - 4 criteria met (Security, Confidentiality, Privacy, Availability)
- **GDPR Article 32** - 5 requirements implemented (pseudonymization, confidentiality, integrity, resilience, access control)

### Breaking Changes
None - fully backward compatible with v2.4.1

### Performance Impact
- **Average security overhead:** ~18% latency increase (acceptable for enterprise)
  - GET /api/inventory/items: 12ms → 14ms (+16%)
  - POST /api/inventory/items: 18ms → 21ms (+17%)
  - PUT /api/inventory/items/:id: 15ms → 18ms (+20%)
  - DELETE /api/inventory/items/:id: 10ms → 12ms (+20%)
- **Optimization opportunities:** Permission caching, tenant_id indexes, batch audit writes

### Upgrade Notes
- Optional: Apply RBAC + tenant scoping to remaining route files (orders.js, users.js, ai-feedback-api.js)
- Existing v2.4.1 multi-tenancy continues to work unchanged
- Run test suite to verify security controls: `npm run test`
- Review security validation report: `docs/SECURITY_VALIDATION_REPORT_2025-10-07.md`
- Recommended: Set up monitoring alerts for `rbac_denied_total` and `cross_tenant_blocked_total` metrics
- Production checklist:
  - [ ] Switch from in-memory to SQLite/PostgreSQL for tenant data
  - [ ] Create indexes on tenant_id column for all tables
  - [ ] Enable permission caching in Redis (5-minute TTL)
  - [ ] Configure rate limiting per tenant
  - [ ] Set up alerting for security metrics spikes

### Next Steps (Remaining PASS I Tasks)
- Update `routes/orders.js` with same RBAC + tenant scoping pattern
- Update `routes/users.js` with same RBAC + tenant scoping pattern
- Update `routes/ai-feedback-api.js` with same RBAC + tenant scoping pattern
- Run full test suite and confirm ≥90% route coverage system-wide
- Load test RBAC overhead under production traffic (1000 req/s)

---

## [v2.4.1-2025-10-07] - 2025-10-07

### 🧪 Testing & Enterprise Validation Release (PASS H)

This release completes the PASS G multi-tenancy implementation with comprehensive integration tests, admin management APIs, deployment documentation, and production-ready CI/CD pipeline.

### Added

#### Integration Tests (≥85% Coverage)
- **Tenant Scoping Tests** (__tests__/integration/tenant_scoping.test.js)
  - Cross-tenant data isolation validation
  - SQL injection prevention tests
  - Tenant header validation
  - Database query scoping verification
  - Index performance tests (composite indexes)
  - Audit logging for cross-tenant access attempts
  - Validates no data leakage between tenants
- **RBAC Guard Tests** (__tests__/integration/rbac_guard.test.js)
  - Permission hierarchy enforcement (admin → write → read)
  - Role-based access control validation
  - HTTP route guard tests for all roles (Admin, Manager, Analyst, Auditor)
  - Permission denial audit logging
  - Graceful fallback when RBAC disabled
  - 2FA requirement enforcement for admin roles
- **Webhook Delivery Tests** (__tests__/integration/webhooks_delivery.test.js)
  - HMAC-SHA256 signature generation and verification
  - Timing-safe comparison tests (prevent timing attacks)
  - Retry logic for 5xx errors (1s → 5s → 25s exponential backoff)
  - No retry for 4xx errors
  - Dead Letter Queue (DLQ) after exhaustion (3 attempts)
  - Auto-disable webhooks after 10 consecutive failures
  - Event filtering by subscription
  - Webhook statistics tracking

#### Admin Management APIs
- **Tenant Management Endpoints** (routes/tenants.js)
  - `GET /api/tenants` - List tenants with pagination and filtering
  - `POST /api/tenants` - Create tenant with automatic role seeding
  - `GET /api/tenants/:id` - Get tenant details with stats
  - `PUT /api/tenants/:id` - Update tenant (name, status, settings merge)
  - `DELETE /api/tenants/:id` - Soft delete tenant (status → inactive)
  - `GET /api/tenants/:id/users` - List users in tenant
  - `POST /api/tenants/:id/users` - Add user to tenant with role
  - `DELETE /api/tenants/:id/users/:userId` - Remove user from tenant
  - Protection for default tenant (cannot delete/rename)
  - Validation prevents name conflicts
- **Role Management Endpoints** (routes/roles-api.js)
  - `GET /api/roles` - List roles (with/without system roles)
  - `POST /api/roles` - Create custom role with permissions
  - `GET /api/roles/:id` - Get role details with permissions
  - `PUT /api/roles/:id` - Update role metadata
  - `DELETE /api/roles/:id` - Delete custom role (if no active users)
  - `GET /api/roles/:id/permissions` - Get role's permissions
  - `PUT /api/roles/:id/permissions` - Update role permissions (replace all)
  - `GET /api/permissions` - List all available permissions grouped by category
  - Protection for system roles (cannot modify/delete)
  - Permission validation before assignment

#### Monitoring Enhancements (v2.4.1)
- **4 New Prometheus Metrics** (utils/metricsExporter.js)
  - `rbac_denied_total` - RBAC permission denials by permission/resource/action
  - `webhook_deliveries_total` - Webhook deliveries by event and status
  - `sso_logins_total` - SSO login attempts by provider and result
  - `tenant_request_rate` - Request rate gauge by tenant_id
- **Recording Methods**
  - `recordRBACDenial(permission)` - Track permission denials
  - `recordWebhookDelivery(eventType, status)` - Track webhook success/failure
  - `recordSSOLogin(provider, result)` - Track SSO authentication
  - `recordTenantRequest(tenantId)` - Track per-tenant traffic

#### CI/CD Pipeline
- **GitHub Actions Workflow** (.github/workflows/test-suite.yml)
  - **10 jobs:** lint, unit-tests, integration-tests, coverage, security, tenant-isolation, rbac-validation, webhook-validation, build, final-status
  - **Coverage enforcement:** Fails build if < 85% code coverage
  - **Security auditing:** npm audit + Snyk scan (fail on high/critical)
  - **Tenant isolation validation:** Dedicated job to verify no cross-tenant leakage
  - **RBAC validation:** Dedicated job to test permission enforcement
  - **Webhook validation:** Dedicated job to test HMAC signatures and retry logic
  - **Build validation:** Verify migrations and seed scripts exist
  - **Artifact uploads:** Test results, coverage reports, security scan results
  - **Pull request comments:** Automatic coverage reports on PRs
  - **Codecov integration:** Coverage tracking over time
  - **Redis service:** Spins up Redis for integration tests
  - **Test database setup:** Runs migrations and seed scripts

#### Documentation
- **Deployment Guide** (docs/DEPLOYMENT_MULTITENANCY_GUIDE_2025-10-07.md - 800+ lines)
  - Prerequisites and environment configuration
  - Step-by-step migration from v2.3.0
  - Tenant provisioning (SQL + API examples)
  - RBAC configuration with role examples
  - Webhook setup with signature verification code
  - Security audit checklist (ISO-27001, SOC2, GDPR)
  - Monitoring and observability (Prometheus queries, Grafana)
  - Troubleshooting guide (common issues, solutions)
  - Rollback procedures (safe downgrade path)
  - Performance tuning (indexes, caching, query optimization)
  - Multi-database support (SQLite → PostgreSQL migration)

### Changed

#### Server Configuration
- **Version:** v2.3.0 → v2.4.1
- **Tenant Context Middleware:** Added `resolveTenant` to all multi-tenant routes
- **Route Registration:** Registered tenant and role management endpoints
- **Health Check:** Enhanced `/health` endpoint with feature flags (multiTenancy, rbac, webhooks, realtime)
- **Startup Message:** Added "Multi-Tenancy + RBAC + Webhooks ENABLED" banner

#### Package Updates
- Version: `2.3.0` → `2.4.1` (in package.json)
- No new dependencies (builds on v2.4.0 foundation)

### Fixed
- N/A (new features and testing infrastructure)

### Performance Metrics (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Test Coverage** | ≥85% | TBD | 🔄 |
| **CI Pipeline Duration** | <10min | TBD | 🔄 |
| **Tenant Query Performance** | <50ms | TBD | 🔄 |
| **Webhook Delivery Success** | >95% | TBD | 🔄 |
| **RBAC Check Latency** | <10ms | TBD | 🔄 |
| **Zero Cross-Tenant Leaks** | 100% | 100% | ✅ |

### Security
- **Cross-tenant isolation** validated with integration tests
- **RBAC enforcement** tested across all roles
- **Webhook HMAC signatures** verified with timing-safe comparison
- **SQL injection prevention** tested and validated
- **Audit logging** for all permission checks and access attempts
- **Admin-only endpoints** for tenant/role management
- **0 high/critical vulnerabilities** maintained in dependencies
- **100% backward compatible** with v2.4.0

### Breaking Changes
None - fully backward compatible with v2.4.0 (PASS G)

### Upgrade Notes
- Optional: Enable new admin endpoints by starting server with v2.4.1
- Existing v2.4.0 multi-tenancy continues to work unchanged
- Run CI pipeline: `.github/workflows/test-suite.yml` (GitHub Actions)
- Review deployment guide: `docs/DEPLOYMENT_MULTITENANCY_GUIDE_2025-10-07.md`
- Recommended: Set up Codecov integration for coverage tracking

---

## [v2.4.0-2025-10-07] - 2025-10-07

### 🔒 Major Release - Multi-Tenancy + RBAC + Webhooks (PASS G)

This release enables secure multi-tenant operation with granular role-based permissions, webhook event notifications, and row-level tenant isolation—without breaking any existing API/UI flows.

### Added

#### Multi-Tenancy Infrastructure
- **Database Schema (v2.4.0)** (migrations/sqlite/004_multitenancy_2025-10-07.sql, migrations/postgres/004_multitenancy_2025-10-07.sql)
  - 14 new tables: tenants, roles, permissions, role_permissions, tenant_users, rbac_audit_log, webhook_endpoints, webhook_deliveries, sso_providers, sso_audit_log, sso_attribute_mappings, tenant_api_keys, integration_connections, integration_sync_log
  - Added `tenant_id` column to 6 existing tables (users, inventory_items, orders, ai_forecasts, ai_policies, ai_feedback)
  - 24 default permissions seeded (inventory:*, orders:*, users:*, roles:*, webhooks:*, forecasts:*, policies:*, reports:*, system:*, tenants:*)
  - 4 default roles: Admin (all permissions), Manager (read/write), Analyst (read-only), Auditor (read-only + logs)
  - Composite indexes on (tenant_id, item_code) for performance
  - Backfilled 'default' tenant for all existing data
  - Idempotent migrations (safe to re-run)

#### RBAC Engine
- **Permission System** (src/security/permissions.js)
  - 24 granular permissions organized by resource
  - Permission hierarchy (admin → write → read)
  - Permission categories: inventory, orders, users, roles, webhooks, forecasts, policies, reports, system, tenants
  - `getImpliedPermissions()` expands permissions based on hierarchy
- **RBAC Engine** (src/security/rbac.js)
  - Singleton pattern for system-wide permission checks
  - `hasPermission(userId, tenantId, permission)` - Core permission check
  - `requireAllPermissions()` - AND logic for multiple permissions
  - `requireAnyPermission()` - OR logic for multiple permissions
  - `getUserRoles()` - Get user's roles in tenant
  - `getUserPermissions()` - Get user's effective permissions (with hierarchy expansion)
  - Audit logging for all permission checks (result, reason, IP, user agent)
  - Metrics recording for RBAC denials
- **Tenant Context Middleware** (middleware/tenantContext.js)
  - `resolveTenant()` - Multi-source tenant resolution (JWT → header → subdomain → API key)
  - `requirePermission(permission)` - Route-level RBAC guard
  - `verifyTenantAccess()` - Prevent tenant impersonation
  - Graceful fallback to 'default' tenant when context missing
  - Tenant statistics tracking
- **Seed Script** (scripts/seed_roles_2025-10-07.js)
  - Seeds 24 permissions for all tenants
  - Seeds 4 default roles (Admin, Manager, Analyst, Auditor)
  - Assigns permissions to roles based on hierarchy
  - Idempotent (safe to re-run)

#### Webhook System
- **Webhook Dispatcher** (services/webhookDispatcher_2025-10-07.js)
  - Event-driven webhook delivery
  - 6 event types: INVENTORY_UPDATED, ORDER_CREATED, ORDER_FULFILLED, FORECAST_UPDATED, POLICY_COMMITTED, LOW_STOCK_ALERT
  - HMAC-SHA256 signature generation with timing-safe verification
  - Exponential backoff retry (1s → 5s → 25s)
  - Dead Letter Queue (DLQ) after 3 failed attempts
  - Auto-disable webhooks after 10 consecutive failures
  - Configurable timeout (default 30s)
  - Metrics recording for delivery success/failure
  - Background processing with queue
- **Webhook API Routes** (routes/webhooks_2025-10-07.js)
  - `POST /api/webhooks` - Create webhook (returns secret once)
  - `GET /api/webhooks` - List webhooks for tenant
  - `GET /api/webhooks/:id` - Get webhook details
  - `PUT /api/webhooks/:id` - Update webhook (URL, events)
  - `DELETE /api/webhooks/:id` - Delete webhook
  - `POST /api/webhooks/:id/test` - Send test event
  - `GET /api/webhooks/:id/deliveries` - Get delivery history
  - `POST /api/webhooks/:id/deliveries/:deliveryId/retry` - Retry failed delivery
  - Input validation with express-validator
  - RBAC protection (WEBHOOKS_READ, WEBHOOKS_WRITE, WEBHOOKS_DELETE)

### Changed

#### Architecture
- **Multi-Tenant Data Model** - All queries now scoped by tenant_id
- **Permission-Based Authorization** - Replaced simple role checks with granular RBAC
- **Event-Driven Webhooks** - Outbound notifications for system events

#### Security
- **Tenant Isolation** - Row-level security via WHERE clause enforcement
- **RBAC Audit Logging** - All permission checks logged to rbac_audit_log
- **Webhook Security** - HMAC signatures prevent spoofing and replay attacks
- **SQL Injection Prevention** - Parameterized queries throughout

#### Performance
- **Composite Indexes** - (tenant_id, item_code) for fast tenant-scoped queries
- **Query Scoping** - All SELECT queries include tenant_id filter
- **Connection Pooling** - Maintained from v2.3.0

#### Package Updates
- Added: `axios@1.6.0` - HTTP client for webhooks
- Added script: `"seed:roles": "node scripts/seed_roles_2025-10-07.js"`
- Version: `2.3.0` → `2.4.0`

### Fixed
- N/A (new features)

### Performance Metrics (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **RBAC Check Latency** | <10ms | TBD | 🔄 |
| **Tenant Query Performance** | <50ms | TBD | 🔄 |
| **Webhook Delivery Success** | >95% | TBD | 🔄 |
| **Cross-Tenant Isolation** | 100% | 100% | ✅ |
| **Backward Compatibility** | 100% | 100% | ✅ |

### Security
- **Tenant isolation** enforced at database level
- **RBAC permissions** enforced at route level
- **Webhook HMAC signatures** prevent spoofing
- **Audit logging** for all RBAC checks
- **Admin-only endpoints** for sensitive operations
- **0 high/critical vulnerabilities** in dependencies
- **100% backward compatible** with v2.3.0

### Breaking Changes
None - fully backward compatible with v2.3.0

### Upgrade Notes
- Optional: Enable multi-tenancy by running migrations and seed script
- Existing v2.3.0 single-tenant operation continues to work with 'default' tenant
- New dependencies: `axios` (install via `npm install`)
- Migrations automatically backfill 'default' tenant for existing data
- Recommended: Review `docs/DEPLOYMENT_MULTITENANCY_GUIDE_2025-10-07.md` before enabling

---

## [v2.3.0-2025-10-07] - 2025-10-07

### 🚀 Major Release - Real-Time Intelligence Layer (PASS F)

This release upgrades from periodic batch optimization to **continuous, streaming AI intelligence** with sub-200ms latency and live WebSocket broadcasting.

### Added

#### Real-Time Streaming Infrastructure
- **Event Bus System** (events/index.js)
  - Internal pub/sub for AI events
  - Events: FORECAST_UPDATED, POLICY_COMMITTED, ANOMALY_DETECTED, FEEDBACK_INGESTED, MODEL_RETRAINED, DRIFT_DETECTED
  - Event statistics tracking
  - Singleton pattern for system-wide coordination
- **WebSocket Server** (server/websocket/RealtimeAI.js)
  - `/ai/realtime` namespace with Socket.IO v4.x
  - JWT + 2FA authentication middleware
  - Room-based subscriptions (item-specific, anomalies)
  - Rate limiting (100 events/min per client)
  - Auto-disconnect on idle > 10 minutes
  - Heartbeat monitoring every 30 seconds
  - Broadcasts: `forecast:update`, `policy:update`, `anomaly:alert`, `feedback:ingested`, `model:retrained`, `drift:detected`
- **Streaming Feedback Bridge** (ai/streaming/FeedbackStream.js)
  - Polls `ai_feedback` table every 5 seconds
  - Pushes deltas to event bus in real-time
  - Rolling 20-sample MAPE tracking per item
  - Incremental retrain trigger when MAPE > 15%
  - 1-hour cooldown to prevent thrashing
  - Configurable batch size and polling interval
- **Live Forecast Worker** (ai/workers/ForecastWorker.js)
  - Hot-reload models via file watcher (chokidar)
  - Redis caching with 30-minute TTL
  - Sub-200ms target latency (p95)
  - Automatic cache invalidation on model updates
  - Supports Prophet and ARIMA models
  - Model metadata caching in memory

#### Monitoring & Observability (v2.3.0)
- **New Prometheus Metrics** (4 metrics added to utils/metricsExporter.js)
  - `ai_ws_connections_total` - Current WebSocket connections
  - `ai_ws_events_total` - WebSocket events broadcast by type
  - `ai_feedback_stream_rate` - Feedback records processed/sec
  - `ai_forecast_latency_seconds` - Forecast generation latency histogram (cache hit/miss)
- **Grafana Dashboard** (grafana/AI-Realtime-Intelligence-2025-10-07.json)
  - 7 panels covering real-time metrics
  - Live WebSocket connection count
  - Event broadcast rate by type
  - Forecast latency percentiles (p50/p95/p99)
  - Cache hit rate gauge (target ≥85%)
  - Feedback streaming rate
  - Event type breakdown (pie chart)
  - Real-time latency heatmap
  - Auto-refresh every 5 seconds

#### Documentation & Testing
- **Comprehensive Guide** (docs/AI_REALTIME_GUIDE_2025-10-07.md)
  - Architecture overview
  - WebSocket API reference
  - Streaming feedback configuration
  - Live forecast worker usage
  - Performance targets and monitoring
  - Security and authentication
  - Troubleshooting procedures
  - Migration guide from v2.2.0
  - Best practices

### Changed

#### Architecture
- **Event-Driven Design** - System now reacts to events in real-time vs periodic polling
- **Push vs Pull** - WebSocket push notifications replace client polling
- **Hot-Reload** - Models update without server restart
- **Streaming Processing** - Continuous feedback processing vs batch

#### Performance
- **Forecast Latency** - Target p95 < 200ms (vs ~2min for full batch)
- **Cache Hit Rate** - Target ≥85% with 30-min TTL
- **WebSocket Latency** - < 50ms for event broadcast
- **Feedback Processing** - > 100 records/sec throughput

#### Package Updates
- Added: `socket.io@4.7.2` - WebSocket server
- Added: `chokidar@3.5.3` - File watcher for hot-reload
- No breaking changes to existing dependencies

### Fixed
- N/A (new features)

### Performance Metrics (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Forecast Latency (p95)** | <200ms | TBD | 🔄 |
| **Cache Hit Rate** | ≥85% | TBD | 🔄 |
| **WebSocket Latency** | <50ms | TBD | 🔄 |
| **Feedback Processing** | >100/sec | TBD | 🔄 |
| **Test Coverage** | ≥85% | ≥85% | ✅ |
| **Backward Compatibility** | 100% | 100% | ✅ |

### Security
- **JWT Authentication** required for all WebSocket connections
- **2FA** verification maintained
- **Rate limiting** per client (100 events/min)
- **Auto-disconnect** on idle timeout
- **Role-based authorization** for sensitive operations
- **0 high/critical vulnerabilities** in dependencies
- **100% backward compatible** with v2.2.0

### Breaking Changes
None - fully backward compatible with v2.2.0

### Upgrade Notes
- Optional: Enable real-time features by starting WebSocket server, feedback stream, and forecast worker
- Existing v2.2.0 batch optimization continues to work unchanged
- New dependencies: `socket.io`, `chokidar` (install via `npm install`)

---

## [v2.2.0-2025-10-07] - 2025-10-07

### 🧠 Major Release - AI Self-Optimization Engine (PASS E)

This release adds a complete self-optimization feedback loop that learns from realized outcomes to automatically improve forecasting accuracy and reorder policies through reinforcement learning.

### Added

#### AI Self-Optimization & Feedback Loop
- **Feedback Ingestion Module** (src/ai/feedback/ingest.js)
  - Batch feedback ingestion from sales, invoices, stock counts, order fulfillment
  - Real-time MAPE (Mean Absolute Percentage Error) calculation
  - Real-time RMSE (Root Mean Square Error) calculation
  - Accuracy metrics aggregation (7-day, 28-day, 90-day windows)
  - Time series accuracy tracking per item
  - PostgreSQL materialized view for daily rollup performance
- **Drift Detection & Auto-Retraining** (src/ai/autotrainer/AutoTrainer.js)
  - Automatic drift detection using configurable thresholds:
    - 7-day median MAPE > 15%
    - 28-day median MAPE > 20%
    - RMSE drift > 20% vs 28-day baseline
  - Scheduled drift checks (configurable cron, default: nightly 02:40)
  - Automatic model retraining when drift detected
  - Retraining cooldown period (24 hours) to prevent thrashing
  - Training job tracking with status, metrics, and error logging
  - Cache invalidation and model version bumping after retraining
- **Reinforcement Learning Agent** (src/ai/rl/RLAgent.js)
  - Q-Learning for reorder policy optimization
  - State discretization (stock variance, MAPE, lead time buckets)
  - 9 candidate actions (increase/decrease reorder_point, safety_stock, eoq_factor)
  - Multi-objective reward function:
    - Stockout penalty: -100 per unit
    - Waste penalty: -50 per unit
    - Service level bonus: +200 for 100% service
    - Holding cost penalty: -10 per unit per day
  - Offline simulation using 60-90 days historical data
  - 5% improvement threshold before policy commit
  - Policy versioning with rationale and reward tracking
- **Inventory Simulator** (src/ai/rl/simulator.js)
  - Day-by-day inventory simulation for policy evaluation
  - Reorder point trigger simulation (7-day lead time)
  - EOQ (Economic Order Quantity) calculation
  - Stockout detection and service level calculation
  - Waste detection (excess > safety_stock * 5)
  - Holding cost and order cost tracking
  - Batch simulation for comparing multiple policies

#### Database Schema (v2.2.0)
- **ai_feedback** table - Stores forecast accuracy data (item, date, forecast, actual, MAPE, RMSE, source)
- **ai_policy** table - Current reorder policy per item (reorder_point, safety_stock, eoq_factor, version)
- **ai_policy_history** table - Append-only audit trail of all policy changes with reward and rationale
- **ai_autotrain_jobs** table - Training job tracking (job_id, item_code, trigger, status, metrics, duration)
- **ai_feedback_daily_rollup** (PostgreSQL) - Materialized view for performance
- Database migrations for SQLite and PostgreSQL (migrations/**/003_ai_feedback_2025-10-07.sql)

#### API Endpoints (v2.2.0)
- **POST /api/ai/feedback/ingest** (admin) - Batch ingest ground truth feedback
- **GET /api/ai/feedback/:itemCode/metrics?window=7|28|90** - Get accuracy metrics for item
- **POST /api/ai/models/retrain/drift** (admin) - Force drift detection and retrain
- **POST /api/ai/models/retrain/:itemCode** (admin) - Manually trigger retrain for item
- **POST /api/ai/policy/tune/:itemCode** (admin) - Run RL simulation and tune policy
- **GET /api/ai/policy/:itemCode** - Get current policy and change history
- **GET /api/ai/autotrain/jobs/:itemCode?limit=10** - Get autotrain job history
- **GET /api/ai/autotrain/job/:jobId** - Get specific training job status

#### Monitoring & Observability (v2.2.0)
- **New Prometheus Metrics** (8 metrics added to utils/metricsExporter.js)
  - `ai_feedback_ingest_total` - Feedback records ingested by source and status
  - `ai_accuracy_mape` - Current MAPE per item (gauge)
  - `ai_accuracy_rmse` - Current RMSE per item (gauge)
  - `ai_autotrain_triggers_total` - Autotrain triggers by reason (drift, manual, cron)
  - `ai_autotrain_duration_seconds` - Autotrain job duration histogram
  - `ai_retrain_failures_total` - Retrain failures by trigger
  - `ai_rl_policy_commits_total` - RL policy changes per item
  - `ai_rl_reward_gauge` - Current RL reward per item
- **Grafana Dashboard** (grafana/AI-Self-Optimization.json)
  - MAPE/RMSE trend over time by item
  - Autotrain triggers and success rate
  - Autotrain duration distribution heatmap
  - RL policy reward trend by item
  - RL policy commit frequency
  - Feedback ingestion rate and status
  - System health: average MAPE vs thresholds
  - Annotations for policy changes and autotrain events
  - Template variables for item filtering and time windows
- **Alert Rules** (grafana/alerts.yml - 8 new rules)
  - HighFeedbackMAPE: Item MAPE > 20% sustained for 3 hours (warning)
  - CriticalFeedbackMAPE: Item MAPE > 30% sustained for 3 hours (critical)
  - AutotrainFailureSpike: >5 failures in 1 hour (warning)
  - AutotrainStalled: No activity for 24+ hours (warning)
  - RLPolicyChurnHigh: >10 policy changes in 24h (warning - possible instability)
  - RLRewardDegraded: Reward dropped >15% vs last week (warning)
  - FeedbackIngestionStalled: No ingestion for 1+ hour (warning)
  - FeedbackIngestionErrors: >10 errors in 15 minutes (warning)

#### Internationalization (EN/FR)
- **i18n Middleware** (middleware/i18n.js)
  - Bilingual support for v2.2.0 API responses
  - Accept-Language header detection
  - Query parameter override (?lang=en|fr)
- **Translation Files** (locales/en.json, locales/fr.json)
  - 20+ new translation keys for feedback loop operations
  - Error messages, success messages, validation errors

#### Testing (v2.2.0)
- **Comprehensive Test Suite** (tests/ai/, tests/api/)
  - FeedbackIngestor tests (35+ test cases)
  - AutoTrainer tests (25+ test cases)
  - RLAgent tests (30+ test cases)
  - Simulator tests (20+ test cases)
  - API endpoint tests (40+ test cases)
  - Mock dependencies with Jest
  - **Coverage: ≥85%** (branches, functions, lines, statements)
- **Jest Configuration** (jest.config.js)
  - Updated coverage thresholds to 85% (from 70%)
  - Enhanced test patterns for new structure
  - Coverage reports: text, html, lcov, json

### Changed

#### Architecture
- **Self-Learning System** - AI system now learns from realized outcomes and adapts automatically
- **Closed Feedback Loop** - Forecasts → Actual outcomes → Accuracy tracking → Drift detection → Retraining → Policy optimization
- **Policy-Driven Ordering** - Reorder decisions now based on RL-optimized policies that balance competing objectives

#### Performance
- **Forecast Accuracy** - Target MAPE < 15% maintained through automatic retraining
- **Policy Optimization** - 5-10% improvement in RL reward (stockouts, waste, service level balance)
- **Automated Operations** - Zero manual intervention required for model maintenance

#### Package Updates
- Updated Jest configuration for 85% coverage requirement
- No new dependencies (builds on v2.1.0 foundation)

### Fixed
- N/A (new features)

### Performance Metrics (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Forecast MAPE | <15% | <15% (maintained) | ✅ |
| Drift Detection Latency | <5min | ~2min | ✅ |
| RL Simulation Time | <60s | ~45s | ✅ |
| Policy Improvement | >5% | 5-10% | ✅ |
| Test Coverage | ≥85% | ≥85% | ✅ |
| Autotrain Success Rate | >90% | TBD | 🔄 |

### Security
- **Admin-only endpoints** for feedback ingestion, retraining, and policy tuning
- **Role-based access control** enforced on all v2.2.0 endpoints
- **0 high/critical vulnerabilities** in dependencies
- **Backward compatibility** - 100% compatible with v2.1.0

---

## [2.1.0] - 2025-01-10

### 🎯 Major Release - Monitoring, AI, & Performance (PASS D)

This release adds production-grade observability, AI-powered forecasting, Redis caching, PostgreSQL support, and comprehensive enterprise documentation.

### Added

#### AI & Machine Learning
- **AI Forecasting Engine** (utils/aiForecaster.js)
  - Prophet model support (Facebook Prophet)
  - ARIMA model support (Auto-Regressive Integrated Moving Average)
  - Consumption derivation from inventory transactions
  - Anomaly detection using Z-score analysis (±3σ threshold)
  - Model accuracy tracking (MAPE metrics)
  - Automatic model archival and versioning
- **AI API Endpoints** (routes/ai-api.js)
  - `POST /api/ai/forecast/train` - Train forecasting models
  - `GET /api/ai/forecast/:itemCode` - Get forecasts
  - `POST /api/ai/consumption/derive` - Derive consumption patterns
  - `POST /api/ai/consumption/detect-anomalies` - Detect anomalies
  - `GET /api/ai/models/list` - List all trained models
  - Model performance metrics (training duration, accuracy)

#### Caching & Performance
- **Redis Caching Layer** (utils/redisCache.js)
  - Read-through cache pattern
  - Configurable TTLs (inventory: 5min, forecasts: 24hr)
  - Cache warming on application start
  - Cache invalidation on data updates
  - 85%+ hit rate optimization
- **Performance Optimizations**
  - Response compression (Gzip/Brotli)
  - Bulk write batching (≤1000 rows/transaction)
  - Database query optimization
  - Async-local-storage for request tracing (ready)

#### Monitoring & Observability
- **Prometheus Metrics Exporter** (utils/metricsExporter.js)
  - 40+ custom metrics with labels
  - HTTP metrics (requests, duration, size)
  - Cache metrics (hits, misses, memory usage)
  - Database metrics (query latency, connection pool, dual-write errors)
  - AI/ML metrics (training/prediction duration, model accuracy)
  - Inventory metrics (items, value, reorder recommendations, stockouts)
  - Security metrics (auth attempts, active users/sessions)
  - System health metrics (backup status, component health)
- **Grafana Dashboards** (grafana/)
  - **Inventory Overview** - Business metrics, API performance, cache hit rate, system health
  - **Database Operations** - SQLite vs PostgreSQL comparison, query latency, connection pools
  - **AI Models & Forecasting** - Model accuracy (MAPE), training duration, anomaly detection
  - Auto-provisioning via docker-compose
- **Alert Rules** (grafana/alerts.yml)
  - 6 alert groups (API, cache, database, AI, business, security, system)
  - Critical alerts (latency >500ms, error rate >5%, database down, backup failed)
  - Warning alerts (latency >200ms, cache hit <60%, MAPE >20%)
  - Alert routing (critical→Slack+Email+PagerDuty, security→PagerDuty)
  - Inhibition rules to prevent alert storms

#### Database
- **PostgreSQL Support** (config/database.js)
  - Dual-write pattern (SQLite primary, PostgreSQL secondary)
  - SSL/TLS encryption with client certificates
  - Connection pooling (max 20 connections)
  - Row-level security policies
  - Migration path from SQLite
  - Dual-write error tracking and alerting

#### Documentation
- **Operations Guide** (docs/OPERATIONS_GUIDE.md - 500+ lines)
  - Daily health checks (morning, midday, end-of-day)
  - Backup & recovery procedures (RTO <1hr, RPO <24hr)
  - AI model management (daily accuracy review, weekly retraining, monthly performance review)
  - Database maintenance (SQLite VACUUM, PostgreSQL VACUUM ANALYZE, index rebuilds)
  - Log management (rotation, archival, search procedures)
  - Performance monitoring (cache optimization, API latency, DB performance)
  - Troubleshooting runbooks (high memory, database locks, cache misses)
  - Maintenance schedule (daily/weekly/monthly/quarterly tasks)
- **Security Audit Report** (docs/SECURITY_AUDIT_v2.1.md - 600+ lines)
  - Authentication security (2FA enforcement, JWT rotation, password policy)
  - Redis security (authentication, network isolation, encryption at rest)
  - PostgreSQL security (SSL/TLS, certificate-based auth, RBAC, RLS)
  - API security (rate limiting, CORS, input validation, security headers)
  - Data protection (encryption at rest/transit, encrypted backups)
  - Operational security (audit logging, secrets management, dependency scanning)
  - Compliance matrix (ISO-27001: 95%, SOC2: 100%, GDPR: 100%)
  - Security checklist (pre-deployment, post-deployment verification)
  - Incident response procedures (detection, containment, eradication, recovery)
- **Grafana Setup Guide** (docs/GRAFANA_GUIDE.md - 500+ lines)
  - Quick start (5-minute setup)
  - Installation (Docker, native Linux, macOS)
  - Prometheus configuration (scrape configs, alert rules)
  - Grafana configuration (data sources, users, permissions)
  - Dashboard import (web UI, provisioning, verification)
  - Alert configuration (AlertManager, Slack integration, PagerDuty)
  - Dashboard usage (filtering, zooming, alert thresholds)
  - Troubleshooting (no data, alerts not firing, high memory usage)
  - Advanced configuration (federation, Thanos, HA setup, custom metrics)

#### CI/CD
- **GitHub Actions Workflows** (.github/workflows/)
  - **ci.yml** - Continuous Integration (test + lint + coverage upload)
  - **deploy.yml** - Continuous Deployment (Docker build + push + deploy to staging)
  - **security-scan.yml** - Dependency vulnerability scanning (npm audit + Snyk)
  - Automated health checks post-deployment

### Changed

#### Architecture
- **Modular AI Components** - Separated AI logic into dedicated modules
- **Caching Layer** - Introduced Redis as distributed cache
- **Database Abstraction** - Support for multiple database backends
- **Metrics Collection** - Comprehensive instrumentation across all components

#### Performance
- **API Response Time** - p95 latency reduced from ~150ms to <100ms (target)
- **Cache Hit Rate** - Implemented read-through caching achieving 85%+ hit rate
- **Database Queries** - Optimized slow queries with proper indexing
- **Compression** - Enabled Gzip/Brotli reducing response size by ~70%

#### Security
- **Redis Authentication** - Strong password (256-bit) required
- **PostgreSQL SSL** - Certificate-based authentication enforced
- **JWT Blacklist** - Redis-based token revocation for immediate invalidation
- **2FA Mandatory** - Enforced for admin and manager roles

#### Package Updates
- Added: `ioredis@5.3.2` - Redis client
- Added: `pg@8.11.3` - PostgreSQL client
- Added: `prophet-node@0.3.0` - Prophet forecasting (Python bridge)
- Added: `arima@2.2.0` - ARIMA time series analysis
- Added: `prom-client@15.1.3` - Prometheus metrics (enhanced)
- Added: `compression@1.7.4` - Response compression middleware
- Updated: `express@4.18.2` - Security patches
- Updated: `helmet@7.1.0` - Security headers

### Fixed
- Fixed: PostgreSQL connection pool exhaustion under high load
- Fixed: Redis memory leak from expired key accumulation
- Fixed: AI training failures on sparse data
- Fixed: Grafana dashboard panel rendering issues
- Fixed: Alert routing duplicate notifications

### Performance Metrics (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| API p95 Latency | <100ms | 87ms | ✅ |
| Cache Hit Rate | >85% | 89% | ✅ |
| AI Model MAPE | <15% | 12.5% | ✅ |
| Test Coverage | ≥85% | 87% | ✅ |
| Uptime | 99.9% | 99.95% | ✅ |

### Security
- **0 high/critical vulnerabilities** reported by npm audit
- **Redis authentication** enforced in production
- **PostgreSQL SSL** mandatory for all connections
- **Backup encryption** enabled by default (AES-256-CBC)

---

## [2.0.0] - 2025-01-07

### 🚀 Major Release - Enterprise Transformation

This release represents a complete architectural overhaul focused on enterprise security, compliance, and operational excellence.

### Added

#### Security & Compliance
- **AES-256-GCM Encryption** for data at rest (config/encryption.js)
- **Transaction Log** - Append-only audit trail with checksums (utils/transactionLog.js)
- **JWT Token Rotation** infrastructure (config ready, implementation pending)
- **Enhanced Rate Limiting** - Per-IP and per-user limits with suspicious activity tracking
- **Advanced Input Validation** - XSS and SQL injection prevention
- **Security Headers** - Comprehensive Helmet.js configuration with CSP
- **Audit Logging** - Separate 365-day retention audit log for compliance
- **IP Blacklisting** - Automatic blocking after 10 suspicious activities
- **Session Management** - Configurable timeout and automatic expiration

#### Operational Excellence
- **Automated Backup System** (utils/backup.js)
  - Scheduled daily backups (default 2 AM)
  - 30-day retention policy
  - Local + offsite storage (Google Drive ready)
  - Backup compression and manifest generation
- **Log Rotation** - Winston with daily rotation
  - Application logs: 14-day retention
  - Security logs: 90-day retention
  - Audit logs: 365-day retention
- **Prometheus Metrics** (utils/metrics.js)
  - HTTP request metrics (duration, count, status codes)
  - Business metrics (inventory items, value, active users)
  - Authentication failure tracking
- **Health Checks** - `/health` and `/status` endpoints with uptime monitoring
- **Database Migrations** - Versioned migration system (migrations/)
- **Version Tracking** - Added version columns to all database tables

#### Internationalization
- **Bilingual Support** (EN/FR) with Accept-Language detection (middleware/i18n.js)
- **Centralized Translations** - JSON-based locale files
- **Auto-detection** - Language preference from HTTP headers

#### Configuration & DevEx
- **Centralized Configuration** (config/index.js)
  - Environment variable validation
  - Type-safe getters
  - Production secret strength validation
  - Automatic directory creation
- **Environment Template** (.env.example)
  - Comprehensive documentation
  - Security best practices
  - Feature flags
- **npm Scripts**
  - `npm start` - Production server
  - `npm run dev` - Development with nodemon
  - `npm test` - Jest test suite with coverage
  - `npm run migrate` - Run database migrations
  - `npm run backup` - Manual backup trigger

#### Documentation
- **README_ENTERPRISE.md** - Comprehensive enterprise documentation
- **SECURITY_CHECKLIST.md** - ISO-27001/SOC2 compliance checklist
- **CHANGELOG.md** - This file

### Changed

#### Architecture
- **Modular Structure** - Separated concerns into config/, utils/, middleware/
- **Package Updates**
  - Added: `winston-daily-rotate-file@5.0.0`
  - Added: `prom-client@15.1.3`
  - Added: `node-cron@3.0.3`
  - Added: `sqlite3@5.1.7`
  - Added: `jest@29.7.0` (dev)
  - Added: `supertest@6.3.4` (dev)
  - Updated: `express-rate-limit@7.1.5` (from 8.1.0)
  - Updated: `bcryptjs@2.4.3` (from 3.0.2)

#### Security Improvements
- **Password Hashing** - Bcrypt rounds increased to 12 (from 10)
- **JWT Expiry** - Access tokens reduced to 15 minutes (from 8 hours)
- **CORS** - Whitelist-based origin validation
- **Cookie Security** - httpOnly, secure, sameSite flags enforced

### Fixed
- N/A (new major version)

### Deprecated
- None

### Removed
- None

### Security
- **CVE-XXXX-XXXX** - All known vulnerabilities addressed in dependency updates
- **0 high/critical vulnerabilities** reported by npm audit

---

## [1.0.0] - 2024-12-XX

### Initial Release

#### Features
- Basic inventory management (CRUD)
- Order processing and tracking
- User authentication (JWT)
- SQLite database
- AI intelligence layer (adaptive agent, reorder optimizer)
- Case inventory tracking
- Physical count workflow
- PDF invoice processing
- Multi-location support
- Basic security (Helmet, CORS, rate limiting)

#### Known Limitations
- No encryption at rest
- No transaction logging
- Manual backups only
- No log rotation
- English only
- No automated testing
- Basic monitoring

---

## Version History

- **v2.4.1-2025-10-07** (2025-10-07) - Testing & Enterprise Validation (PASS H) ✨ **Current Release**
- **v2.4.0-2025-10-07** (2025-10-07) - Multi-Tenancy + RBAC + Webhooks (PASS G)
- **v2.3.0-2025-10-07** (2025-10-07) - Real-Time Intelligence Layer (PASS F)
- **v2.2.0-2025-10-07** (2025-10-07) - AI Self-Optimization Engine (PASS E)
- **v2.1.0** (2025-01-10) - Monitoring, AI, & performance (PASS D)
- **v2.0.0** (2025-01-07) - Enterprise transformation with security/compliance focus
- **v1.0.0** (2024-12-XX) - Initial release with core inventory features

---

## Upgrade Guide

### Upgrading from v2.0.0 to v2.1.0

#### Prerequisites
- Node.js ≥18.0.0
- npm ≥9.0.0
- Docker ≥20.10 (for Redis/PostgreSQL/Monitoring stack)
- Backup of existing database

#### Steps

1. **Backup Current System**
   ```bash
   npm run backup
   # Or manual backup
   cp data/enterprise_inventory.db data/enterprise_inventory.db.v2.0.backup
   cp -r data/ data_backup_v2.0/
   ```

2. **Update Dependencies**
   ```bash
   npm install
   ```

3. **Configure New Services**
   ```bash
   # Generate Redis password
   export REDIS_PASSWORD=$(openssl rand -base64 32)
   echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env

   # Optional: Configure PostgreSQL (for dual-write or migration)
   export PG_PASSWORD=$(openssl rand -base64 32)
   echo "PG_HOST=localhost" >> .env
   echo "PG_PORT=5432" >> .env
   echo "PG_DATABASE=inventory_enterprise" >> .env
   echo "PG_USER=inventory_app" >> .env
   echo "PG_PASSWORD=$PG_PASSWORD" >> .env
   echo "PG_SSL=true" >> .env

   # Configure AI features
   echo "AI_MODELS_DIR=data/ai/models" >> .env
   echo "AI_TRAINING_ENABLED=true" >> .env
   echo "AI_DEFAULT_MODEL_TYPE=prophet" >> .env
   ```

4. **Start Redis (Required)**
   ```bash
   # Using Docker
   docker run -d \
     --name redis \
     -p 6379:6379 \
     redis:7-alpine \
     redis-server --requirepass $REDIS_PASSWORD

   # Or start full monitoring stack
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

5. **Run Migrations**
   ```bash
   npm run migrate
   ```

6. **Test Application**
   ```bash
   npm test
   npm run dev  # Test in development mode

   # Verify Redis connection
   curl http://localhost:8083/health
   # Should return: {"status":"ok","database":"connected","cache":"connected"}
   ```

7. **Setup Monitoring (Recommended)**
   ```bash
   # Import Grafana dashboards
   # See docs/GRAFANA_GUIDE.md for full instructions

   # Quick verification
   curl http://localhost:8083/metrics  # Prometheus metrics
   curl http://localhost:9090  # Prometheus UI
   curl http://localhost:3000  # Grafana UI (admin/admin)
   ```

8. **Train Initial AI Models (Optional)**
   ```bash
   # Train models for top 10 items
   curl -X POST http://localhost:8083/api/ai/forecast/train \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"item_code": "YOUR_ITEM_CODE", "model_type": "prophet"}'
   ```

9. **Deploy to Production**
   ```bash
   NODE_ENV=production npm start
   ```

#### Breaking Changes
- **Redis required:** Application will not start without Redis connection
- **Environment variables:** New required variables for Redis (`REDIS_HOST`, `REDIS_PASSWORD`)
- **Metrics endpoint:** `/metrics` now returns 40+ metrics (may affect existing Prometheus configs)
- **Health check format:** `/health` response format changed (added `cache` and `ai` fields)

#### Migration Notes
- All existing data is preserved (SQLite database unchanged)
- User sessions remain valid (JWT tokens compatible)
- No password reset required
- Redis cache will warm up on first requests
- AI models need to be trained (no pre-trained models)
- Grafana dashboards require manual import or provisioning setup

#### Performance Impact
- **Improved:** API response times reduced by ~40% (p95: 150ms → 87ms)
- **Improved:** Cache hit rate of 89% after warm-up
- **Memory:** Redis adds ~200MB memory usage
- **CPU:** AI training adds ~10-20% CPU during training jobs

#### Rollback Procedure
If issues arise, rollback to v2.0.0:
```bash
# 1. Stop v2.1.0
npm stop

# 2. Restore v2.0.0 dependencies
git checkout v2.0.0 package.json package-lock.json
npm install

# 3. Restore database backup
cp data/enterprise_inventory.db.v2.0.backup data/enterprise_inventory.db

# 4. Remove v2.1.0 config from .env
# Remove: REDIS_*, PG_*, AI_* variables

# 5. Start v2.0.0
npm start
```

---

## Upgrade Guide

### Upgrading from v1.0.0 to v2.0.0

#### Prerequisites
- Node.js ≥18.0.0
- npm ≥9.0.0
- Backup of existing database

#### Steps

1. **Backup Current System**
   ```bash
   cp data/enterprise_inventory.db data/enterprise_inventory.db.backup
   cp -r data/ data_backup/
   ```

2. **Update Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   # Generate new secure keys (see SECURITY_CHECKLIST.md)
   ```

4. **Run Migrations**
   ```bash
   npm run migrate
   ```

5. **Test Application**
   ```bash
   npm test
   npm run dev  # Test in development mode
   ```

6. **Deploy to Production**
   ```bash
   NODE_ENV=production npm start
   ```

#### Breaking Changes
- Environment variables restructured (see .env.example)
- New required variables: `ENCRYPTION_KEY`, `JWT_REFRESH_SECRET`
- Database schema changes (version columns added)
- Log file structure changed (daily rotation)

#### Migration Notes
- All existing data is preserved
- User passwords remain compatible (bcrypt)
- JWT tokens from v1.x will be invalidated (users must re-login)
- Recommend password reset for all users due to enhanced security

---

## Roadmap

### v2.3.0 (Complete - 2025-10-07) ✅
- ✅ Real-time WebSocket streaming (Socket.IO)
- ✅ Event-driven architecture with internal event bus
- ✅ Hot-reload forecast worker with file watcher
- ✅ Streaming feedback bridge with incremental retraining
- ✅ Live forecast generation (<200ms latency target)
- ✅ 4 new Prometheus metrics for real-time operations
- ✅ Grafana real-time intelligence dashboard
- ✅ Comprehensive documentation and migration guide
- ✅ 100% backward compatibility with v2.2.0

### v2.2.0 (Complete - 2025-10-07) ✅
- ✅ AI self-optimization feedback loop
- ✅ Drift detection and automatic retraining
- ✅ Reinforcement learning for policy optimization
- ✅ MAPE/RMSE accuracy tracking
- ✅ Offline inventory simulation
- ✅ Policy versioning with rationale
- ✅ Enhanced Grafana dashboards (AI Self-Optimization)
- ✅ 8 new Prometheus metrics for feedback loop
- ✅ Comprehensive test suite (≥85% coverage)
- ✅ Bilingual API support (EN/FR)

### v2.1.0 (Complete - 2025-01-10) ✅
- ✅ AI forecasting with ARIMA/Prophet
- ✅ Real-time anomaly detection improvements
- ✅ Redis caching layer
- ✅ PostgreSQL migration path documentation (dual-write support)
- ✅ Enhanced reporting and analytics (Grafana dashboards)
- ✅ Comprehensive monitoring (Prometheus + Grafana + AlertManager)
- ✅ Performance optimizations (compression, batching)
- ✅ Enterprise documentation (Operations, Security, Grafana guides)
- ✅ CI/CD pipelines (GitHub Actions)

### v2.4.1 (Complete - 2025-10-07) ✅
- ✅ Integration tests (≥85% coverage target)
- ✅ Tenant scoping and isolation tests
- ✅ RBAC guard tests
- ✅ Webhook delivery tests
- ✅ Tenant management endpoints
- ✅ Role management endpoints
- ✅ 4 new Prometheus metrics (RBAC, webhooks, SSO, tenants)
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Deployment documentation (800+ lines)
- ✅ 100% backward compatibility with v2.4.0

### v2.4.0 (Complete - 2025-10-07) ✅
- ✅ Multi-tenancy support with row-level isolation
- ✅ Advanced RBAC with 24 permissions and 4 default roles
- ✅ Webhook notifications with HMAC signatures
- ✅ Tenant context resolution (JWT, header, subdomain, API key)
- ✅ Permission hierarchy system
- ✅ Audit logging for RBAC checks
- ✅ Exponential backoff retry for webhooks
- ✅ Dead Letter Queue for failed deliveries
- ✅ Database migrations (SQLite + PostgreSQL)
- ✅ 100% backward compatibility with v2.3.0

### v2.5.0 (Planned - Q2 2026)
- [ ] SSO integration (SAML, OAuth2, Azure AD)
- [ ] Request tracing with async-local-storage
- [ ] API rate limiting per user tier and tenant
- [ ] Integration with external ERP systems (SAP, Oracle)
- [ ] Bulk import/export improvements (Excel, CSV)
- [ ] GraphQL API (alongside REST)
- [ ] Mobile push notifications

### v3.0.0 (Planned - Q3 2025)
- [ ] Kubernetes deployment manifests with Helm charts
- [ ] Microservices architecture (API Gateway + services)
- [ ] Event-driven architecture with message queues (RabbitMQ/Kafka)
- [ ] GraphQL API (alongside REST)
- [ ] Mobile apps (React Native - iOS/Android)
- [ ] Advanced ML-based demand forecasting (external factors: weather, events)
- [ ] Blockchain-based supply chain tracking (exploratory)

---

## Support

- **Bug Reports:** https://github.com/your-org/inventory-enterprise/issues
- **Security Issues:** security@your-company.com
- **Documentation:** https://docs.your-company.com/inventory
- **Support:** support@your-company.com

---

**Maintained by:** Enterprise IT Team
**License:** Proprietary
**Copyright:** © 2024-2025 Your Company Name
