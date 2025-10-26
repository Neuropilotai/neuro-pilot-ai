/**
 * Migration 024: Documents & OCR Pipeline for Multi-User v15.5.0
 *
 * Adds:
 * - Document storage with PDF/text extraction
 * - Line item extraction and mapping
 * - Vendor category mapping rules
 * - OCR processing tracking
 * - Idempotency via SHA256 checksums
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 * @date 2025-10-13
 */

-- ============================================================================
-- 1. DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'neuropilot',
  location_id TEXT,
  vendor TEXT,
  vendor_normalized TEXT, -- Cleaned vendor name for matching
  invoice_date TEXT, -- YYYY-MM-DD
  invoice_number TEXT,
  invoice_total REAL,
  tax_amount REAL,
  subtotal REAL,
  sha256 TEXT NOT NULL, -- File hash for idempotency
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  source_path TEXT, -- Original file path
  bytes BLOB, -- Optional: store actual file bytes

  -- OCR & Text Extraction
  text TEXT, -- Extracted text content
  ocr_confidence REAL, -- 0.0 to 1.0
  ocr_engine TEXT, -- 'tesseract', 'google-vision', 'none' (text PDF)
  ocr_processed_at TEXT,
  ocr_duration_ms INTEGER,

  -- Processing Status
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'ocr_pending', 'ocr_complete', 'mapped', 'reconciled', 'error')),
  error_message TEXT,

  -- Metadata
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reconciled_at TEXT,

  -- Constraints
  UNIQUE(tenant_id, sha256), -- Idempotency: same file can't be imported twice per tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(tenant_id, vendor, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);
CREATE INDEX IF NOT EXISTS idx_documents_invoice ON documents(tenant_id, invoice_number, invoice_date);

-- ============================================================================
-- 2. DOCUMENT LINE ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_line_items (
  line_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,

  -- Extracted Line Data
  line_number INTEGER,
  raw_text TEXT NOT NULL, -- Original extracted line
  description TEXT,
  quantity REAL,
  unit_price REAL,
  amount REAL NOT NULL,
  unit TEXT, -- 'ea', 'lb', 'case', etc.

  -- AI Classification
  category_guess TEXT, -- AI-suggested category
  confidence REAL, -- 0.0 to 1.0

  -- Manual Mapping
  mapped_category TEXT, -- User-assigned category
  mapped_gl_account TEXT, -- User-assigned GL account
  mapping_status TEXT NOT NULL DEFAULT 'unmapped' CHECK(mapping_status IN ('unmapped', 'mapped', 'reviewed', 'disputed')),
  mapped_by TEXT,
  mapped_at TEXT,
  mapping_notes TEXT,

  -- Reconciliation Link
  reconcile_id TEXT, -- FK to ai_reconcile_history if linked

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_line_items_document ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_line_items_tenant_status ON document_line_items(tenant_id, mapping_status);
CREATE INDEX IF NOT EXISTS idx_line_items_unmapped ON document_line_items(tenant_id, mapping_status) WHERE mapping_status = 'unmapped';
CREATE INDEX IF NOT EXISTS idx_line_items_category ON document_line_items(mapped_category);

-- ============================================================================
-- 3. VENDOR CATEGORY MAPPING RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_category_map (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,

  -- Matching Rules
  vendor TEXT NOT NULL, -- Vendor name or pattern
  vendor_pattern TEXT, -- Regex or LIKE pattern for flexible matching
  description_pattern TEXT, -- Match line item descriptions
  amount_min REAL, -- Min amount threshold
  amount_max REAL, -- Max amount threshold

  -- Mapping Target
  category_code TEXT NOT NULL,
  gl_account TEXT,
  cost_center TEXT,

  -- Rule Metadata
  priority INTEGER DEFAULT 50, -- Higher priority rules checked first
  active INTEGER NOT NULL DEFAULT 1,
  auto_apply INTEGER NOT NULL DEFAULT 1, -- Auto-apply during import?

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  usage_count INTEGER DEFAULT 0,

  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_map_tenant ON vendor_category_map(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_vendor_map_vendor ON vendor_category_map(tenant_id, vendor, active);
CREATE INDEX IF NOT EXISTS idx_vendor_map_priority ON vendor_category_map(tenant_id, priority DESC, active);

-- ============================================================================
-- 4. OCR PROCESSING QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ocr_queue (
  queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
  priority INTEGER DEFAULT 50,

  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,

  error_message TEXT,
  error_stack TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ocr_queue_status ON ocr_queue(tenant_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_queue_document ON ocr_queue(document_id);

-- ============================================================================
-- 5. VIEWS FOR FINANCE WORKFLOWS
-- ============================================================================

-- Unmapped Lines Needing Attention
CREATE VIEW IF NOT EXISTS v_finance_unmapped_lines AS
SELECT
  d.tenant_id,
  d.document_id,
  d.vendor,
  d.invoice_date,
  d.invoice_number,
  COUNT(li.line_id) as unmapped_line_count,
  SUM(li.amount) as unmapped_total_amount,
  MAX(d.created_at) as document_created_at
FROM documents d
JOIN document_line_items li ON d.document_id = li.document_id
WHERE li.mapping_status = 'unmapped'
GROUP BY d.tenant_id, d.document_id, d.vendor, d.invoice_date, d.invoice_number
ORDER BY d.created_at DESC;

-- Out-of-Tolerance Documents (tax mismatch, total mismatch, etc.)
CREATE VIEW IF NOT EXISTS v_finance_out_of_tolerance AS
SELECT
  d.tenant_id,
  d.document_id,
  d.vendor,
  d.invoice_date,
  d.invoice_number,
  d.invoice_total,
  d.tax_amount,
  d.subtotal,

  -- Calculate line item totals
  SUM(li.amount) as line_items_total,

  -- Variance checks
  ABS(d.invoice_total - SUM(li.amount)) as total_variance,
  ABS(d.subtotal + d.tax_amount - d.invoice_total) as tax_math_variance,

  -- Tolerance flags
  CASE
    WHEN ABS(d.invoice_total - SUM(li.amount)) > 0.50 THEN 'Line items do not match invoice total'
    WHEN ABS(d.subtotal + d.tax_amount - d.invoice_total) > 0.50 THEN 'Tax + Subtotal do not match total'
    WHEN d.vendor IS NULL OR d.vendor = '' THEN 'Unknown vendor'
    WHEN d.invoice_date IS NULL THEN 'Missing invoice date'
    WHEN d.invoice_total < 0 THEN 'Negative total without credit note flag'
    ELSE 'Other'
  END as issue_type,

  d.created_at
FROM documents d
LEFT JOIN document_line_items li ON d.document_id = li.document_id
WHERE d.status != 'error'
GROUP BY d.document_id
HAVING total_variance > 0.50
    OR tax_math_variance > 0.50
    OR d.vendor IS NULL
    OR d.invoice_date IS NULL
    OR d.invoice_total < 0
ORDER BY d.created_at DESC;

-- Document Processing Summary
CREATE VIEW IF NOT EXISTS v_documents_summary AS
SELECT
  tenant_id,
  status,
  COUNT(*) as document_count,
  SUM(invoice_total) as total_value,
  AVG(ocr_confidence) as avg_confidence,
  MIN(created_at) as oldest_document,
  MAX(created_at) as newest_document
FROM documents
WHERE created_at >= date('now', '-30 days')
GROUP BY tenant_id, status;

-- Vendor Mapping Rule Effectiveness
CREATE VIEW IF NOT EXISTS v_vendor_rule_effectiveness AS
SELECT
  vcm.tenant_id,
  vcm.vendor,
  vcm.category_code,
  vcm.usage_count,
  vcm.last_used_at,
  COUNT(DISTINCT li.line_id) as lines_matched_last_30d,
  vcm.active,
  vcm.priority
FROM vendor_category_map vcm
LEFT JOIN document_line_items li ON
  li.tenant_id = vcm.tenant_id
  AND li.mapped_category = vcm.category_code
  AND li.mapped_at >= date('now', '-30 days')
WHERE vcm.active = 1
GROUP BY vcm.rule_id
ORDER BY lines_matched_last_30d DESC, vcm.usage_count DESC;

-- ============================================================================
-- 6. DUPLICATE DETECTION HELPER
-- ============================================================================

-- Find potential duplicates (same vendor, invoice number, date)
CREATE VIEW IF NOT EXISTS v_potential_duplicate_documents AS
SELECT
  d1.document_id as doc_id_1,
  d2.document_id as doc_id_2,
  d1.tenant_id,
  d1.vendor,
  d1.invoice_number,
  d1.invoice_date,
  d1.invoice_total as total_1,
  d2.invoice_total as total_2,
  d1.sha256 as sha256_1,
  d2.sha256 as sha256_2,
  d1.created_at as created_1,
  d2.created_at as created_2
FROM documents d1
JOIN documents d2 ON
  d1.tenant_id = d2.tenant_id
  AND d1.vendor = d2.vendor
  AND d1.invoice_number = d2.invoice_number
  AND d1.invoice_date = d2.invoice_date
  AND d1.document_id < d2.document_id -- Prevent double counting
WHERE d1.sha256 != d2.sha256; -- Different files, same invoice metadata

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Record migration
INSERT OR REPLACE INTO schema_version (version, applied_at, description)
VALUES (24, datetime('now'), 'Add documents and OCR pipeline for multi-user v15.5.0');
