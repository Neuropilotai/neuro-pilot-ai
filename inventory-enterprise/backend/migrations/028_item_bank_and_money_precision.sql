-- Migration 028: Item Bank & Money Precision
-- Purpose: Fix GFS invoice line items corruption by introducing:
--   1. Item Bank as authoritative product catalog
--   2. Integer cents for currency precision
--   3. Normalized UOM conversions
--   4. Shadow tables for safe reimport testing
-- Author: NeuroPilot v15.7+
-- Date: 2025-10-14

-- ============================================================================
-- PART 1: UOM Conversions (canonical unit normalization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS uom_conversions (
  uom_conversion_id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uom TEXT NOT NULL,           -- e.g., 'CASE', 'BOX', 'PACK'
  to_uom TEXT NOT NULL,             -- canonical e.g., 'EACH', 'LB', 'KG'
  multiplier NUMERIC(18,6) NOT NULL, -- conversion factor
  vendor TEXT NOT NULL DEFAULT 'GFS',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor, from_uom, to_uom)
);

-- Standard GFS UOM conversions
INSERT OR IGNORE INTO uom_conversions (from_uom, to_uom, multiplier, vendor) VALUES
  ('EA', 'EACH', 1.0, 'GFS'),
  ('EACH', 'EACH', 1.0, 'GFS'),
  ('LB', 'LB', 1.0, 'GFS'),
  ('KG', 'KG', 1.0, 'GFS'),
  ('CASE', 'EACH', 1.0, 'GFS'),  -- default; will be overridden by pack_size
  ('CS', 'EACH', 1.0, 'GFS'),
  ('BOX', 'EACH', 1.0, 'GFS'),
  ('PACK', 'EACH', 1.0, 'GFS'),
  ('PKG', 'EACH', 1.0, 'GFS'),
  ('BAG', 'EACH', 1.0, 'GFS'),
  ('CTN', 'EACH', 1.0, 'GFS'),
  ('CARTON', 'EACH', 1.0, 'GFS');

-- ============================================================================
-- PART 2: Item Bank (Authoritative Product Catalog)
-- ============================================================================

-- Item Categories (Finance GL Codes)
CREATE TABLE IF NOT EXISTS item_categories (
  category_code TEXT PRIMARY KEY,
  gl_account TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO item_categories (category_code, gl_account, label) VALUES
  ('BAKE', '60110010', 'Bakery'),
  ('BEV_ECO', '60110020', 'Beverages + Eco'),
  ('MILK', '60110030', 'Dairy & Milk'),
  ('GROC_MISC', '60110040', 'Grocery & Misc'),
  ('MEAT', '60110060', 'Meat'),
  ('PROD', '60110070', 'Produce'),
  ('CLEAN', '60220001', 'Cleaning Supplies'),
  ('PAPER', '60260010', 'Paper Products'),
  ('SMALL_EQUIP', '60665001', 'Small Equipment'),
  ('FREIGHT', '62421100', 'Freight'),
  ('LINEN', '60240010', 'Linen'),
  ('PROPANE', '62869010', 'Propane'),
  ('OTHER', '60110099', 'Other Costs');

-- Tax Profiles (GST/QST application rules)
CREATE TABLE IF NOT EXISTS tax_profiles (
  tax_profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_name TEXT NOT NULL UNIQUE,
  apply_gst BOOLEAN NOT NULL DEFAULT 1,
  apply_qst BOOLEAN NOT NULL DEFAULT 1,
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,    -- 5%
  qst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.09975, -- 9.975%
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tax_profiles (profile_name, apply_gst, apply_qst, description) VALUES
  ('TAXABLE', 1, 1, 'Standard taxable items (GST + QST)'),
  ('GST_ONLY', 1, 0, 'GST only (no QST)'),
  ('QST_ONLY', 0, 1, 'QST only (no GST)'),
  ('TAX_EXEMPT', 0, 0, 'Tax exempt items'),
  ('ZERO_RATED', 1, 0, 'Zero-rated GST (basic groceries)');

-- Item Bank (Master Product Catalog)
CREATE TABLE IF NOT EXISTS item_bank (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL DEFAULT 'GFS',
  item_no TEXT NOT NULL,              -- GFS product code
  description TEXT NOT NULL,
  uom TEXT NOT NULL,                  -- canonical: EACH, LB, KG, CASE, PACK, INNER
  pack_size TEXT,                     -- e.g., '6x2kg', '12/1lb'
  pack_multiplier NUMERIC(18,6),      -- computed from pack_size
  category_code TEXT NOT NULL REFERENCES item_categories(category_code),
  tax_profile_id INTEGER NOT NULL REFERENCES tax_profiles(tax_profile_id),
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DISCONTINUED, NEEDS_MAPPING
  unit_cost_cents INTEGER,            -- last known cost in cents
  confidence_score NUMERIC(3,2),      -- mapping confidence 0.00-1.00
  last_seen_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor, item_no),
  CHECK(status IN ('ACTIVE', 'DISCONTINUED', 'NEEDS_MAPPING'))
);

CREATE INDEX idx_item_bank_vendor_no ON item_bank(vendor, item_no);
CREATE INDEX idx_item_bank_category ON item_bank(category_code);
CREATE INDEX idx_item_bank_status ON item_bank(status);
CREATE INDEX idx_item_bank_description ON item_bank(description);

-- Needs Mapping Queue (items without confident category assignment)
CREATE TABLE IF NOT EXISTS needs_mapping (
  mapping_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL,
  item_no TEXT,
  description TEXT NOT NULL,
  uom TEXT,
  pack_size TEXT,
  suggested_category TEXT,
  confidence_score NUMERIC(3,2),
  invoice_number TEXT,
  line_total_cents INTEGER,
  occurrences INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_needs_mapping_status ON needs_mapping(status);
CREATE INDEX idx_needs_mapping_item ON needs_mapping(vendor, item_no);

-- ============================================================================
-- PART 3: Invoice Headers - Add Cents Columns
-- ============================================================================

-- Check if invoice_headers exists, if not create it
CREATE TABLE IF NOT EXISTS invoice_headers (
  invoice_header_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id),
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  vendor TEXT NOT NULL,
  customer_number TEXT,
  purchase_order TEXT,
  fiscal_year_id TEXT,
  fiscal_period_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor, invoice_number, invoice_date)
);

-- Add new cents columns to invoice_headers
ALTER TABLE invoice_headers ADD COLUMN subtotal_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN gst_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN qst_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN total_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN freight_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN fuel_charge_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN misc_charges_cents INTEGER DEFAULT 0;
ALTER TABLE invoice_headers ADD COLUMN validation_status TEXT DEFAULT 'PENDING';
ALTER TABLE invoice_headers ADD COLUMN validation_error TEXT;
ALTER TABLE invoice_headers ADD COLUMN import_version TEXT DEFAULT 'v1';

-- ============================================================================
-- PART 4: Invoice Line Items - Add Cents & Normalization
-- ============================================================================

-- Add new columns to invoice_line_items
ALTER TABLE invoice_line_items ADD COLUMN item_id INTEGER REFERENCES item_bank(item_id);
ALTER TABLE invoice_line_items ADD COLUMN quantity_decimal NUMERIC(18,6);
ALTER TABLE invoice_line_items ADD COLUMN unit_price_cents INTEGER;
ALTER TABLE invoice_line_items ADD COLUMN line_total_cents INTEGER;
ALTER TABLE invoice_line_items ADD COLUMN normalized_uom TEXT;
ALTER TABLE invoice_line_items ADD COLUMN normalized_quantity NUMERIC(18,6);
ALTER TABLE invoice_line_items ADD COLUMN category_code TEXT REFERENCES item_categories(category_code);
ALTER TABLE invoice_line_items ADD COLUMN tax_profile_id INTEGER REFERENCES tax_profiles(tax_profile_id);
ALTER TABLE invoice_line_items ADD COLUMN import_version TEXT DEFAULT 'v1';
ALTER TABLE invoice_line_items ADD COLUMN validation_status TEXT DEFAULT 'PENDING';
ALTER TABLE invoice_line_items ADD COLUMN validation_error TEXT;

CREATE INDEX idx_line_items_item_id ON invoice_line_items(item_id);
CREATE INDEX idx_line_items_category ON invoice_line_items(category_code);
CREATE INDEX idx_line_items_validation ON invoice_line_items(validation_status);

-- ============================================================================
-- PART 5: Shadow Tables for Safe Reimport Testing
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_headers_shadow (
  invoice_header_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  vendor TEXT NOT NULL,
  customer_number TEXT,
  purchase_order TEXT,
  fiscal_year_id TEXT,
  fiscal_period_id TEXT,
  subtotal_cents INTEGER DEFAULT 0,
  gst_cents INTEGER DEFAULT 0,
  qst_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  freight_cents INTEGER DEFAULT 0,
  fuel_charge_cents INTEGER DEFAULT 0,
  misc_charges_cents INTEGER DEFAULT 0,
  validation_status TEXT DEFAULT 'PENDING',
  validation_error TEXT,
  import_version TEXT DEFAULT 'v2',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_line_items_shadow (
  line_item_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  product_code TEXT NOT NULL,
  item_id INTEGER REFERENCES item_bank(item_id),
  description TEXT,
  category TEXT,
  category_code TEXT,
  tax_profile_id INTEGER,
  quantity_decimal NUMERIC(18,6) NOT NULL,
  unit TEXT,
  normalized_uom TEXT,
  normalized_quantity NUMERIC(18,6),
  unit_price REAL,
  unit_price_cents INTEGER,
  line_total REAL,
  line_total_cents INTEGER,
  pack_size TEXT,
  brand TEXT,
  barcode TEXT,
  import_version TEXT DEFAULT 'v2',
  validation_status TEXT DEFAULT 'PENDING',
  validation_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PART 6: Finance Validation History
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_validation_history (
  validation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  validation_run_id TEXT NOT NULL,
  fiscal_period_id TEXT,
  invoice_number TEXT,
  check_type TEXT NOT NULL,
  check_status TEXT NOT NULL, -- PASS, WARN, FAIL
  expected_value TEXT,
  actual_value TEXT,
  variance TEXT,
  severity TEXT NOT NULL, -- INFO, WARNING, ERROR, CRITICAL
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_validation_run ON finance_validation_history(validation_run_id);
CREATE INDEX idx_validation_invoice ON finance_validation_history(invoice_number);
CREATE INDEX idx_validation_status ON finance_validation_history(check_status);

-- Finance Verification Alerts
CREATE TABLE IF NOT EXISTS finance_verification_alerts (
  alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  fiscal_period_id TEXT,
  invoice_number TEXT,
  description TEXT NOT NULL,
  resolution_status TEXT DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, CLOSED
  assigned_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX idx_alerts_status ON finance_verification_alerts(resolution_status);
CREATE INDEX idx_alerts_period ON finance_verification_alerts(fiscal_period_id);

-- ============================================================================
-- PART 7: Audit Log for Corrections
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_correction_log (
  correction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  line_item_id TEXT,
  correction_type TEXT NOT NULL, -- UNIT_PRICE, QUANTITY, CATEGORY, TAX, UOM
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  corrected_by TEXT NOT NULL,
  approved_by TEXT,
  import_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_corrections_invoice ON finance_correction_log(invoice_number);
CREATE INDEX idx_corrections_type ON finance_correction_log(correction_type);

-- ============================================================================
-- PART 8: Import Run Metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_import_runs (
  import_run_id TEXT PRIMARY KEY,
  import_mode TEXT NOT NULL, -- DRY_RUN, SHADOW, APPLY
  fiscal_period_id TEXT,
  start_date TEXT,
  end_date TEXT,
  invoices_processed INTEGER DEFAULT 0,
  invoices_passed INTEGER DEFAULT 0,
  invoices_failed INTEGER DEFAULT 0,
  lines_processed INTEGER DEFAULT 0,
  lines_mapped INTEGER DEFAULT 0,
  lines_unmapped INTEGER DEFAULT 0,
  validation_score NUMERIC(5,2),
  status TEXT NOT NULL, -- RUNNING, COMPLETED, FAILED, ABORTED
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error_message TEXT
);

CREATE INDEX idx_import_runs_period ON finance_import_runs(fiscal_period_id);
CREATE INDEX idx_import_runs_status ON finance_import_runs(status);

-- ============================================================================
-- PART 9: Constraints and Checks
-- ============================================================================

-- Ensure non-negative money values
-- (SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we document the checks)
-- Future inserts/updates should validate:
--   - All *_cents columns >= 0
--   - quantity_decimal > 0
--   - unit_price_cents >= 0
--   - line_total_cents >= 0
--   - |sum(line_total_cents) - total_cents| <= 50 (within $0.50)

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Version tracking
INSERT INTO schema_migrations (version, description, applied_at) VALUES
  ('028', 'Item Bank & Money Precision', CURRENT_TIMESTAMP);

SELECT '✓ Migration 028 complete: Item Bank, UOM conversions, cents precision, shadow tables' as status;
