-- v15.3: Financial Accuracy & Contract Change Integration
-- Create ai_reconcile_history table for audit trail

CREATE TABLE IF NOT EXISTS ai_reconcile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id TEXT NOT NULL,
  vendor TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  category_totals TEXT NOT NULL, -- JSON: {BAKE: 1000, MEAT: 500, ...}
  subtotal REAL NOT NULL DEFAULT 0,
  gst REAL NOT NULL DEFAULT 0,
  qst REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(invoice_number, invoice_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_reconcile_history_date ON ai_reconcile_history(invoice_date);
CREATE INDEX IF NOT EXISTS idx_ai_reconcile_history_vendor ON ai_reconcile_history(vendor);
CREATE INDEX IF NOT EXISTS idx_ai_reconcile_history_import_id ON ai_reconcile_history(import_id);

-- v15.3: Add issue_unit column to inventory_items for cost/unit consistency (if table exists)
-- Note: This will fail silently if inventory_items doesn't exist or column already exists

-- v15.3: Add financial_accuracy to ai_ops_health_metrics
CREATE TABLE IF NOT EXISTS ai_ops_health_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL UNIQUE,
  metric_value REAL NOT NULL,
  weight REAL NOT NULL DEFAULT 0.0,
  last_updated TEXT NOT NULL
);

-- Insert financial_accuracy metric
INSERT OR IGNORE INTO ai_ops_health_metrics (metric_name, metric_value, weight, last_updated)
VALUES ('financial_accuracy', 0.0, 0.15, datetime('now'));
