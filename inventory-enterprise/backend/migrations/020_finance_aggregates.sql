-- ============================================================================
-- Finance Aggregates Tables (v15.4.0)
-- Materialized views for fast finance reporting
-- ============================================================================

-- Daily finance facts (granular transaction level)
CREATE TABLE IF NOT EXISTS finance_fact_daily (
  fact_id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT NOT NULL,  -- YYYY-MM-DD
  vendor TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT DEFAULT 'ALL',
  invoice_count INTEGER DEFAULT 0,
  subtotal REAL DEFAULT 0.0,
  gst REAL DEFAULT 0.0,
  qst REAL DEFAULT 0.0,
  total_amount REAL DEFAULT 0.0,
  food_freight REAL DEFAULT 0.0,
  other_reimb REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_fact_date ON finance_fact_daily(date_key);
CREATE INDEX IF NOT EXISTS idx_finance_fact_vendor ON finance_fact_daily(vendor);
CREATE INDEX IF NOT EXISTS idx_finance_fact_category ON finance_fact_daily(category);

-- Weekly aggregates (for performance)
CREATE TABLE IF NOT EXISTS finance_agg_weekly (
  agg_id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL,  -- YYYY-Wnn (ISO week)
  week_start TEXT NOT NULL,  -- YYYY-MM-DD
  week_end TEXT NOT NULL,    -- YYYY-MM-DD
  vendor TEXT DEFAULT 'ALL',
  category TEXT DEFAULT 'ALL',
  invoice_count INTEGER DEFAULT 0,
  subtotal REAL DEFAULT 0.0,
  gst REAL DEFAULT 0.0,
  qst REAL DEFAULT 0.0,
  total_amount REAL DEFAULT 0.0,
  food_freight REAL DEFAULT 0.0,
  other_reimb REAL DEFAULT 0.0,
  avg_invoice_value REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_agg_week ON finance_agg_weekly(week_key);
CREATE INDEX IF NOT EXISTS idx_finance_agg_weekly_vendor ON finance_agg_weekly(vendor);

-- Monthly tax aggregates (for compliance reporting)
CREATE TABLE IF NOT EXISTS finance_tax_monthly (
  tax_id INTEGER PRIMARY KEY AUTOINCREMENT,
  month_key TEXT NOT NULL,  -- YYYY-MM
  period_name TEXT NOT NULL,  -- e.g., "2025 Q1", "2025 H1"
  quarter INTEGER,  -- 1-4
  half INTEGER,     -- 1-2
  subtotal REAL DEFAULT 0.0,
  gst_collected REAL DEFAULT 0.0,
  qst_collected REAL DEFAULT 0.0,
  total_with_tax REAL DEFAULT 0.0,
  invoice_count INTEGER DEFAULT 0,
  vendor_count INTEGER DEFAULT 0,
  avg_invoice_value REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_tax_month ON finance_tax_monthly(month_key);
CREATE INDEX IF NOT EXISTS idx_finance_tax_quarter ON finance_tax_monthly(quarter);

-- Finance KPI snapshots (for deltas)
CREATE TABLE IF NOT EXISTS finance_kpi_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_key TEXT NOT NULL,  -- YYYY-MM, YYYY-Qn, YYYY-Hn
  period_type TEXT NOT NULL,  -- month, quarter, half, year
  total_revenue REAL DEFAULT 0.0,
  total_invoices INTEGER DEFAULT 0,
  avg_invoice_value REAL DEFAULT 0.0,
  top_vendor TEXT,
  top_category TEXT,
  food_pct REAL DEFAULT 0.0,
  gst_pct REAL DEFAULT 0.0,
  qst_pct REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_kpi_period ON finance_kpi_snapshots(period_key, period_type);
