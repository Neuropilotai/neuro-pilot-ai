-- ============================================================================
-- Migration 031: Item Bank & Finance Category Enforcement (v16.2.0)
-- ============================================================================
-- Purpose: Authoritative item catalog with hard category enforcement and
--          integer-cent line-item integrity for accurate finance reports
--
-- Author: NeuroPilot AI Development Team
-- Date: 2025-10-18
-- ============================================================================

-- ============================================================================
-- 1. Item Bank (Authoritative Catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_bank (
  gfs_item_no TEXT PRIMARY KEY,          -- GFS item number (authoritative key)
  vendor_sku TEXT,                        -- Vendor's SKU (nullable, may differ)
  upc TEXT,                               -- UPC barcode (nullable)
  description TEXT NOT NULL,              -- Item description
  pack_size TEXT,                         -- Pack size (e.g., "12x1L", "24/16oz")
  uom TEXT NOT NULL DEFAULT 'EA',        -- Unit of measure (EA, CS, LB, etc.)
  finance_code TEXT NOT NULL CHECK(finance_code IN (
    'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT',
    'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
  )),
  taxable_gst INTEGER NOT NULL DEFAULT 1 CHECK(taxable_gst IN (0, 1)),  -- 5% GST
  taxable_qst INTEGER NOT NULL DEFAULT 1 CHECK(taxable_qst IN (0, 1)),  -- 9.975% QST
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RETIRED')),
  notes TEXT,                             -- Optional notes
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for item_bank
CREATE INDEX IF NOT EXISTS idx_item_bank_vendor_sku ON item_bank(vendor_sku) WHERE vendor_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_bank_upc ON item_bank(upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_bank_finance_code_status ON item_bank(finance_code, status);
CREATE INDEX IF NOT EXISTS idx_item_bank_status ON item_bank(status);
CREATE INDEX IF NOT EXISTS idx_item_bank_description ON item_bank(description COLLATE NOCASE);

-- ============================================================================
-- 2. Finance Mapping Rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_mapping_rules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  match_type TEXT NOT NULL CHECK(match_type IN ('SKU', 'VENDOR_SKU', 'REGEX', 'KEYWORD')),
  match_value TEXT NOT NULL,              -- SKU, vendor SKU, regex pattern, or keyword
  finance_code TEXT NOT NULL CHECK(finance_code IN (
    'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT',
    'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
  )),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  source TEXT NOT NULL CHECK(source IN ('RULE', 'AI', 'MANUAL')),
  created_by TEXT NOT NULL DEFAULT 'system',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for finance_mapping_rules
CREATE INDEX IF NOT EXISTS idx_mapping_rules_match_type ON finance_mapping_rules(match_type, active);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_finance_code ON finance_mapping_rules(finance_code);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_source ON finance_mapping_rules(source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_rules_unique_match ON finance_mapping_rules(match_type, match_value, active) WHERE active = 1;

-- ============================================================================
-- 3. Mapping Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS mapping_audit (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  invoice_id TEXT NOT NULL,               -- References invoice
  line_id TEXT,                           -- Optional line identifier
  gfs_item_no TEXT,                       -- Item matched (if any)
  description TEXT,                       -- Line description
  strategy TEXT NOT NULL CHECK(strategy IN ('BANK', 'RULE', 'AI', 'MANUAL', 'FALLBACK')),
  confidence REAL NOT NULL DEFAULT 0.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  old_code TEXT,                          -- Previous finance code (if remapped)
  new_code TEXT NOT NULL,                 -- Assigned finance code
  actor TEXT NOT NULL DEFAULT 'system',   -- User or system that performed mapping
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for mapping_audit
CREATE INDEX IF NOT EXISTS idx_mapping_audit_invoice ON mapping_audit(invoice_id);
CREATE INDEX IF NOT EXISTS idx_mapping_audit_strategy ON mapping_audit(strategy);
CREATE INDEX IF NOT EXISTS idx_mapping_audit_timestamp ON mapping_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_mapping_audit_new_code ON mapping_audit(new_code);

-- ============================================================================
-- 4. Invoice Validation Results
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_validation_results (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  invoice_id TEXT NOT NULL UNIQUE,        -- References invoice
  total_lines INTEGER NOT NULL DEFAULT 0,
  mapped_lines INTEGER NOT NULL DEFAULT 0,
  unmapped_lines INTEGER NOT NULL DEFAULT 0,
  low_confidence_lines INTEGER NOT NULL DEFAULT 0,  -- confidence < 0.80
  computed_subtotal_cents INTEGER NOT NULL,         -- Sum of ext_price_cents
  parsed_subtotal_cents INTEGER,                    -- From invoice header
  subtotal_delta_cents INTEGER,                     -- Difference
  computed_gst_cents INTEGER NOT NULL,              -- Calculated 5%
  parsed_gst_cents INTEGER,                         -- From invoice header
  gst_delta_cents INTEGER,                          -- Difference
  computed_qst_cents INTEGER NOT NULL,              -- Calculated 9.975%
  parsed_qst_cents INTEGER,                         -- From invoice header
  qst_delta_cents INTEGER,                          -- Difference
  computed_total_cents INTEGER NOT NULL,            -- Subtotal + taxes
  parsed_total_cents INTEGER,                       -- From invoice header
  total_delta_cents INTEGER,                        -- Difference
  balance_status TEXT NOT NULL CHECK(balance_status IN ('BALANCED', 'IMBALANCE', 'TAX_ERROR', 'UNKNOWN')),
  validation_errors TEXT,                           -- JSON array of errors
  validated_at TEXT NOT NULL DEFAULT (datetime('now')),
  validated_by TEXT NOT NULL DEFAULT 'system'
);

-- Indexes for invoice_validation_results
CREATE INDEX IF NOT EXISTS idx_validation_invoice ON invoice_validation_results(invoice_id);
CREATE INDEX IF NOT EXISTS idx_validation_status ON invoice_validation_results(balance_status);
CREATE INDEX IF NOT EXISTS idx_validation_unmapped ON invoice_validation_results(unmapped_lines) WHERE unmapped_lines > 0;
CREATE INDEX IF NOT EXISTS idx_validation_low_confidence ON invoice_validation_results(low_confidence_lines) WHERE low_confidence_lines > 0;

-- ============================================================================
-- 5. Period Verification Totals
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_period_verified_totals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  period TEXT NOT NULL UNIQUE,            -- e.g., 'FY26-P01'
  finance_code TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  gst_cents INTEGER NOT NULL,
  qst_cents INTEGER NOT NULL,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_by TEXT NOT NULL DEFAULT 'system'
);

-- Indexes for finance_period_verified_totals
CREATE INDEX IF NOT EXISTS idx_period_verified_period ON finance_period_verified_totals(period);
CREATE INDEX IF NOT EXISTS idx_period_verified_code ON finance_period_verified_totals(finance_code);

-- ============================================================================
-- 6. Needs Mapping Queue (View)
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_needs_mapping AS
SELECT
  ma.id,
  ma.invoice_id,
  ma.line_id,
  ma.gfs_item_no,
  ma.description,
  ma.new_code,
  ma.confidence,
  ma.strategy,
  ma.timestamp
FROM mapping_audit ma
WHERE ma.confidence < 0.80 OR ma.strategy = 'FALLBACK'
ORDER BY ma.confidence ASC, ma.timestamp DESC;

-- ============================================================================
-- 7. Active Item Bank (View)
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_item_bank_active AS
SELECT
  gfs_item_no,
  vendor_sku,
  upc,
  description,
  pack_size,
  uom,
  finance_code,
  taxable_gst,
  taxable_qst,
  created_at,
  updated_at
FROM item_bank
WHERE status = 'ACTIVE';

-- ============================================================================
-- 8. Finance Code Summary (View)
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_finance_code_summary AS
SELECT
  finance_code,
  COUNT(*) as item_count,
  SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN status = 'RETIRED' THEN 1 ELSE 0 END) as retired_count
FROM item_bank
GROUP BY finance_code
ORDER BY finance_code;

-- ============================================================================
-- 9. Update Trigger for item_bank
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_item_bank_update
AFTER UPDATE ON item_bank
FOR EACH ROW
BEGIN
  UPDATE item_bank SET updated_at = datetime('now') WHERE gfs_item_no = NEW.gfs_item_no;
END;

-- ============================================================================
-- 10. Update Trigger for finance_mapping_rules
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_mapping_rules_update
AFTER UPDATE ON finance_mapping_rules
FOR EACH ROW
BEGIN
  UPDATE finance_mapping_rules SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================================
-- 11. Sample Data (Optional - for testing)
-- ============================================================================

-- Insert sample finance categories if item_bank is empty
INSERT OR IGNORE INTO item_bank
  (gfs_item_no, description, pack_size, uom, finance_code, taxable_gst, taxable_qst, status)
VALUES
  ('1234567', 'Sample Bread Item', '12x1', 'CS', 'BAKE', 1, 1, 'ACTIVE'),
  ('2345678', 'Sample Milk Product', '4x4L', 'CS', 'MILK', 1, 1, 'ACTIVE'),
  ('3456789', 'Sample Cleaning Supply', '6x1L', 'CS', 'CLEAN', 1, 1, 'ACTIVE'),
  ('4567890', 'Sample Paper Towel', '12x2', 'CS', 'PAPER', 1, 1, 'ACTIVE'),
  ('5678901', 'Sample Freight Charge', '1', 'EA', 'FREIGHT', 0, 0, 'ACTIVE');

-- ============================================================================
-- Migration Complete
-- ============================================================================
