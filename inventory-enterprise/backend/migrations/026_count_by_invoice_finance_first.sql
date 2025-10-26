-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026: Count by Invoice (Finance-First) v15.6.0
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: Implement finance-driven count workflow with invoice-based reconciliation
-- Date: 2025-10-14
-- Jira: INV-156
-- ═══════════════════════════════════════════════════════════════════════════

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 1: Count Sessions (Header)
-- █████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS count_sessions (
  count_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL,
  updated_at TEXT,
  
  -- Status workflow: OPEN → SUBMITTED → APPROVED → LOCKED
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'SUBMITTED', 'APPROVED', 'LOCKED')),
  
  -- Scope
  location_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  
  -- Period
  period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK(period_year >= 2024),
  
  -- Baseline
  baseline_count_id TEXT, -- FK to previous locked count
  count_mode TEXT NOT NULL CHECK(count_mode IN ('from_last', 'from_invoice', 'blank')),
  
  -- Tax rates
  gst_rate REAL NOT NULL DEFAULT 0.05,
  qst_rate REAL NOT NULL DEFAULT 0.09975,
  
  -- Finance summary (JSONB stored as TEXT in SQLite)
  finance_code_header TEXT, -- JSON: {"BAKE": 12500, "MEAT": 45000, "GST": 2875, "QST": 5738, ...}
  
  -- Audit
  submitted_at TEXT,
  submitted_by TEXT,
  approved_at TEXT,
  approved_by TEXT,
  locked_at TEXT,
  locked_by TEXT,
  
  notes TEXT,
  
  FOREIGN KEY (location_id) REFERENCES storage_locations(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (baseline_count_id) REFERENCES count_sessions(count_id)
);

CREATE INDEX IF NOT EXISTS idx_count_sessions_status ON count_sessions(status);
CREATE INDEX IF NOT EXISTS idx_count_sessions_tenant_period ON count_sessions(tenant_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_count_sessions_location ON count_sessions(location_id);

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 2: Count Lines (Detail)
-- █████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS count_lines (
  count_line_id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL,
  
  -- Item identification
  item_code TEXT NOT NULL,
  item_desc TEXT,
  
  -- Finance classification
  finance_code TEXT NOT NULL CHECK(finance_code IN (
    'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 
    'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
  )),
  category_hint TEXT, -- e.g., "Dairy", "Produce"
  
  -- Quantities
  expected_qty REAL DEFAULT 0,
  expected_uom TEXT,
  counted_qty REAL DEFAULT 0,
  counted_uom TEXT,
  
  -- Costing
  unit_cost_cents INTEGER DEFAULT 0, -- Unit cost in cents
  
  -- Source tracking
  source TEXT NOT NULL CHECK(source IN ('last_count', 'invoice', 'manual')) DEFAULT 'manual',
  
  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  updated_by TEXT,
  notes TEXT,
  
  FOREIGN KEY (count_id) REFERENCES count_sessions(count_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code)
);

CREATE INDEX IF NOT EXISTS idx_count_lines_count ON count_lines(count_id);
CREATE INDEX IF NOT EXISTS idx_count_lines_item ON count_lines(item_code);
CREATE INDEX IF NOT EXISTS idx_count_lines_finance_code ON count_lines(finance_code);

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 3: Invoice Attachments (Links to Imports)
-- █████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS count_invoices (
  link_id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL,
  
  -- Invoice reference (from document imports)
  import_id TEXT, -- FK to documents.id or import batch
  document_id TEXT, -- FK to documents.id
  
  -- Invoice metadata
  vendor TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  
  -- Totals (in cents)
  subtotal_cents INTEGER DEFAULT 0,
  gst_cents INTEGER DEFAULT 0,
  qst_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  
  -- Audit
  attached_at TEXT NOT NULL DEFAULT (datetime('now')),
  attached_by TEXT,
  
  FOREIGN KEY (count_id) REFERENCES count_sessions(count_id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_count_invoices_count ON count_invoices(count_id);
CREATE INDEX IF NOT EXISTS idx_count_invoices_document ON count_invoices(document_id);
CREATE INDEX IF NOT EXISTS idx_count_invoices_vendor_date ON count_invoices(vendor, invoice_date);

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 4: Invoice Lines (Parsed with AI Mapping)
-- █████████████████████████████████████████████████████████████████████████████

CREATE TABLE IF NOT EXISTS count_invoice_lines (
  link_line_id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL,
  
  -- Source document line
  document_line_id TEXT, -- FK to processed_invoices.line_id or similar
  line_number INTEGER,
  
  -- Raw OCR data
  raw_desc TEXT NOT NULL,
  raw_category TEXT, -- From vendor's PDF categorization
  
  -- Quantities & pricing
  quantity REAL NOT NULL,
  uom TEXT,
  unit_price_cents INTEGER NOT NULL,
  extended_cents INTEGER NOT NULL, -- quantity * unit_price_cents
  
  -- AI Mapping results
  ai_item_code TEXT, -- Proposed inventory_items.item_code
  ai_finance_code TEXT CHECK(ai_finance_code IN (
    'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 
    'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
  )),
  ai_confidence REAL DEFAULT 0.0 CHECK(ai_confidence BETWEEN 0 AND 1),
  ai_explanation TEXT, -- Why this mapping was chosen
  
  -- Mapping status workflow
  mapping_status TEXT NOT NULL DEFAULT 'auto' CHECK(mapping_status IN ('auto', 'needs_review', 'confirmed')),
  
  -- Human override
  confirmed_item_code TEXT,
  confirmed_finance_code TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  
  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (link_id) REFERENCES count_invoices(link_id) ON DELETE CASCADE,
  FOREIGN KEY (ai_item_code) REFERENCES inventory_items(item_code),
  FOREIGN KEY (confirmed_item_code) REFERENCES inventory_items(item_code)
);

CREATE INDEX IF NOT EXISTS idx_count_invoice_lines_link ON count_invoice_lines(link_id);
CREATE INDEX IF NOT EXISTS idx_count_invoice_lines_mapping_status ON count_invoice_lines(mapping_status);
CREATE INDEX IF NOT EXISTS idx_count_invoice_lines_confidence ON count_invoice_lines(ai_confidence);

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 5: Extend Vendor Category Mapping (AI Rules)
-- █████████████████████████████████████████████████████████████████████████████

-- Extend existing vendor_category_map or create new mapping rules table
CREATE TABLE IF NOT EXISTS finance_mapping_rules (
  rule_id TEXT PRIMARY KEY,
  
  -- Match criteria
  match_vendor TEXT, -- e.g., "GFS", "Sysco", NULL for all
  match_desc_regex TEXT NOT NULL, -- e.g., ".*beef.*", ".*milk.*"
  match_category TEXT, -- Vendor's category hint (optional)
  
  -- Mapping targets
  preferred_item_code TEXT,
  preferred_finance_code TEXT NOT NULL CHECK(preferred_finance_code IN (
    'BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 
    'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'
  )),
  
  -- Confidence boost
  confidence_boost REAL DEFAULT 0.2, -- Add to base confidence
  
  -- Rule metadata
  rule_priority INTEGER DEFAULT 100, -- Lower = higher priority
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  notes TEXT,
  
  FOREIGN KEY (preferred_item_code) REFERENCES inventory_items(item_code)
);

CREATE INDEX IF NOT EXISTS idx_finance_mapping_rules_vendor ON finance_mapping_rules(match_vendor);
CREATE INDEX IF NOT EXISTS idx_finance_mapping_rules_active ON finance_mapping_rules(active);

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 6: Finance Summary Views
-- █████████████████████████████████████████████████████████████████████████████

-- View: Finance Count Summary (per count session)
CREATE VIEW IF NOT EXISTS v_finance_count_summary AS
SELECT
  cs.count_id,
  cs.period_month,
  cs.period_year,
  cs.status,
  cs.location_id,
  cl.finance_code,
  
  -- Quantity totals
  SUM(cl.expected_qty) as total_expected_qty,
  SUM(cl.counted_qty) as total_counted_qty,
  SUM(cl.counted_qty - cl.expected_qty) as variance_qty,
  
  -- Value totals (in cents)
  SUM(cl.counted_qty * cl.unit_cost_cents) as total_value_cents,
  SUM((cl.counted_qty - cl.expected_qty) * cl.unit_cost_cents) as variance_value_cents,
  
  -- Tax calculations (from invoices)
  COALESCE(
    (SELECT SUM(gst_cents) FROM count_invoices ci WHERE ci.count_id = cs.count_id),
    0
  ) as total_gst_cents,
  COALESCE(
    (SELECT SUM(qst_cents) FROM count_invoices ci WHERE ci.count_id = cs.count_id),
    0
  ) as total_qst_cents,
  
  COUNT(DISTINCT cl.item_code) as item_count

FROM count_sessions cs
LEFT JOIN count_lines cl ON cl.count_id = cs.count_id
GROUP BY cs.count_id, cs.period_month, cs.period_year, cs.status, cs.location_id, cl.finance_code;

-- View: Needs Mapping (unresolved invoice lines)
CREATE VIEW IF NOT EXISTS v_needs_mapping AS
SELECT
  cil.link_line_id,
  cil.link_id,
  ci.count_id,
  ci.vendor,
  ci.invoice_number,
  cil.raw_desc,
  cil.raw_category,
  cil.quantity,
  cil.uom,
  cil.extended_cents,
  cil.ai_item_code,
  cil.ai_finance_code,
  cil.ai_confidence,
  cil.ai_explanation,
  cil.mapping_status,
  
  -- Flag low confidence or needs review
  CASE
    WHEN cil.mapping_status = 'needs_review' THEN 'manual_review_required'
    WHEN cil.ai_confidence < 0.8 THEN 'low_confidence'
    ELSE 'ok'
  END as resolution_status

FROM count_invoice_lines cil
JOIN count_invoices ci ON ci.link_id = cil.link_id
WHERE cil.mapping_status IN ('auto', 'needs_review')
  AND (cil.ai_confidence < 0.8 OR cil.mapping_status = 'needs_review')
ORDER BY cil.ai_confidence ASC, ci.invoice_date DESC;

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 7: Seed Finance Mapping Rules (Initial Knowledge Base)
-- █████████████████████████████████████████████████████████████████████████████

INSERT OR IGNORE INTO finance_mapping_rules (rule_id, match_vendor, match_desc_regex, preferred_finance_code, confidence_boost, rule_priority, notes)
VALUES
  ('RULE-MEAT-001', NULL, '.*beef.*|.*steak.*|.*pork.*|.*chicken.*|.*turkey.*', 'MEAT', 0.3, 10, 'Meat keywords'),
  ('RULE-PROD-001', NULL, '.*lettuce.*|.*tomato.*|.*carrot.*|.*onion.*|.*pepper.*', 'PROD', 0.3, 10, 'Produce keywords'),
  ('RULE-MILK-001', NULL, '.*milk.*|.*cheese.*|.*butter.*|.*cream.*|.*yogurt.*', 'MILK', 0.3, 10, 'Dairy keywords'),
  ('RULE-BAKE-001', NULL, '.*flour.*|.*sugar.*|.*yeast.*|.*bread.*|.*dough.*', 'BAKE', 0.3, 10, 'Baking keywords'),
  ('RULE-BEV-001', NULL, '.*coffee.*|.*tea.*|.*juice.*|.*soda.*|.*water.*', 'BEV+ECO', 0.3, 10, 'Beverage keywords'),
  ('RULE-CLEAN-001', NULL, '.*detergent.*|.*soap.*|.*bleach.*|.*sanitizer.*', 'CLEAN', 0.3, 10, 'Cleaning keywords'),
  ('RULE-PAPER-001', NULL, '.*napkin.*|.*tissue.*|.*towel.*|.*toilet.*', 'PAPER', 0.3, 10, 'Paper goods keywords'),
  ('RULE-FREIGHT-001', 'GFS', '.*freight.*|.*delivery.*|.*shipping.*', 'FREIGHT', 0.4, 5, 'Freight charges'),
  ('RULE-OTHER-001', NULL, '.*misc.*|.*other.*|.*supply.*', 'OTHER', 0.2, 50, 'Catch-all for misc');

-- █████████████████████████████████████████████████████████████████████████████
-- SECTION 8: Audit & Metadata
-- █████████████████████████████████████████████████████████████████████████████

-- Migration metadata
INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at, description)
VALUES ('026', datetime('now'), 'Count by Invoice (Finance-First) v15.6.0');

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 026
-- ═══════════════════════════════════════════════════════════════════════════
