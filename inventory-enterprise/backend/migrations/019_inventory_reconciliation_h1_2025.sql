-- Migration 019: Inventory Reconciliation + PDF Intake (H1 2025)
-- v15.2.0: Full reconciliation system for physical inventory vs system stock
-- Date: 2025-10-13

-- PDF Documents registry
CREATE TABLE IF NOT EXISTS inventory_pdf_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE, -- SHA256 to prevent duplicates
  invoice_no TEXT,
  vendor TEXT,
  invoice_date TEXT, -- ISO 8601 date
  total_amount REAL,
  currency TEXT DEFAULT 'USD',
  parsed_at TEXT NOT NULL, -- ISO 8601 timestamp
  parsed_by TEXT, -- user email
  metadata TEXT, -- JSON: {page_count, file_size, etc}
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pdf_docs_batch ON inventory_pdf_docs(batch_id);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_date ON inventory_pdf_docs(invoice_date);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_hash ON inventory_pdf_docs(file_hash);

-- PDF Line Items (extracted from documents)
CREATE TABLE IF NOT EXISTS inventory_pdf_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  line_number INTEGER NOT NULL,
  item_code TEXT, -- resolved canonical code (NULL if unresolved)
  raw_description TEXT NOT NULL,
  quantity REAL NOT NULL,
  uom TEXT NOT NULL, -- unit of measure (EA, LB, CS, etc)
  unit_cost REAL,
  line_total REAL,
  resolution_status TEXT DEFAULT 'pending', -- pending, resolved, unresolved
  resolution_confidence REAL, -- 0.0-1.0 fuzzy match score
  normalized_item_code TEXT, -- if converted/mapped
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (doc_id) REFERENCES inventory_pdf_docs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pdf_lines_doc ON inventory_pdf_lines(doc_id);
CREATE INDEX IF NOT EXISTS idx_pdf_lines_item ON inventory_pdf_lines(item_code);
CREATE INDEX IF NOT EXISTS idx_pdf_lines_status ON inventory_pdf_lines(resolution_status);

-- Reconciliation Runs (compare physical vs system stock)
CREATE TABLE IF NOT EXISTS inventory_reconcile_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reconcile_id TEXT NOT NULL UNIQUE, -- e.g., "rec_2025h1_001"
  as_of_date TEXT NOT NULL, -- ISO 8601 date (e.g., 2025-07-03)
  physical_count_id INTEGER, -- FK to physical_inventory_header if exists
  locations TEXT, -- JSON array of location codes (["*"] = all)
  total_items_checked INTEGER DEFAULT 0,
  total_variance_qty REAL DEFAULT 0.0,
  total_variance_value REAL DEFAULT 0.0,
  over_items INTEGER DEFAULT 0, -- count of items with surplus
  short_items INTEGER DEFAULT 0, -- count of items with shortage
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed
  artifacts_path TEXT, -- /tmp/reconcile_{id}.json
  summary_csv_path TEXT, -- /tmp/reconcile_{id}.csv
  triggered_by TEXT, -- user email
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reconcile_runs_id ON inventory_reconcile_runs(reconcile_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_date ON inventory_reconcile_runs(as_of_date);
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_status ON inventory_reconcile_runs(status);

-- Reconciliation Differences (item-level variances)
CREATE TABLE IF NOT EXISTS inventory_reconcile_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT,
  location_code TEXT,
  physical_qty REAL DEFAULT 0.0,
  system_qty REAL DEFAULT 0.0,
  variance_qty REAL DEFAULT 0.0, -- physical - system
  uom TEXT,
  unit_cost REAL, -- for valuation
  variance_value REAL DEFAULT 0.0, -- variance_qty * unit_cost
  variance_pct REAL, -- (variance / system) * 100
  category TEXT, -- over, short, match
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES inventory_reconcile_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_run ON inventory_reconcile_diffs(run_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_item ON inventory_reconcile_diffs(item_code);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_category ON inventory_reconcile_diffs(category);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_value ON inventory_reconcile_diffs(variance_value);

-- Item code mapping/fuzzy matching cache (for PDF normalization)
CREATE TABLE IF NOT EXISTS inventory_item_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_description TEXT NOT NULL UNIQUE,
  canonical_item_code TEXT NOT NULL,
  confidence REAL DEFAULT 1.0, -- 0.0-1.0
  source TEXT DEFAULT 'manual', -- manual, fuzzy, exact
  verified BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_item_mapping_raw ON inventory_item_mapping(raw_description);
CREATE INDEX IF NOT EXISTS idx_item_mapping_code ON inventory_item_mapping(canonical_item_code);

-- Metrics snapshot (for Prometheus integration)
CREATE TABLE IF NOT EXISTS inventory_reconcile_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  labels TEXT, -- JSON: {run_id, location, etc}
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reconcile_metrics_name ON inventory_reconcile_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_reconcile_metrics_ts ON inventory_reconcile_metrics(timestamp);
