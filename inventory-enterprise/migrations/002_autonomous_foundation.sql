-- Migration: 002_autonomous_foundation.sql
-- Description: Add tables for autonomous forecast & reorder system
-- Author: NeuroNexus Autonomous Team
-- Date: 2025-10-29

-- ============================================================================
-- USAGE HISTORY (Enhanced from 001)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  usage_date DATE NOT NULL,
  qty_used DECIMAL(10,2) NOT NULL CHECK (qty_used >= 0),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  UNIQUE (item_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_history_item_date ON usage_history(item_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_usage_history_date ON usage_history(usage_date);

-- ============================================================================
-- FORECASTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  forecast_date DATE NOT NULL,         -- when forecast was generated
  horizon INTEGER NOT NULL,             -- days ahead
  mean_forecast DECIMAL(10,2) NOT NULL,
  p05_forecast DECIMAL(10,2),          -- 5th percentile (lower bound)
  p95_forecast DECIMAL(10,2),          -- 95th percentile (upper bound)
  mape DECIMAL(8,4),                   -- mean absolute percentage error
  model_version VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  UNIQUE (item_id, forecast_date, horizon)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_item ON forecasts(item_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON forecasts(forecast_date);

-- ============================================================================
-- REORDER RECOMMENDATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reorder_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  recommendation_date DATE NOT NULL,
  rec_qty DECIMAL(10,2) NOT NULL CHECK (rec_qty >= 0),
  reason TEXT,                         -- e.g., "Below ROP: 15 < 23.5"
  policy VARCHAR(10) NOT NULL,         -- A, B, or C class
  approved_by INTEGER,                 -- user_id who approved
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, ordered
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,

  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (item_id, recommendation_date)
);

CREATE INDEX IF NOT EXISTS idx_reorder_item ON reorder_recommendations(item_id);
CREATE INDEX IF NOT EXISTS idx_reorder_status ON reorder_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_reorder_date ON reorder_recommendations(recommendation_date);

-- ============================================================================
-- FORECAST ERRORS (For continuous learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  error_date DATE NOT NULL,
  actual_qty DECIMAL(10,2) NOT NULL,
  predicted_qty DECIMAL(10,2) NOT NULL,
  abs_pct_err DECIMAL(8,4),            -- abs((actual - predicted) / actual) * 100
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_errors_item ON forecast_errors(item_id);
CREATE INDEX IF NOT EXISTS idx_forecast_errors_date ON forecast_errors(error_date);

-- ============================================================================
-- AUDIT LOG (Hash-chained for tamper detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor VARCHAR(100),                   -- user_id or 'system'
  action VARCHAR(100) NOT NULL,         -- forecast_generated, reorder_approved, etc.
  payload TEXT,                         -- JSON
  prev_hash VARCHAR(64),
  hash VARCHAR(64) NOT NULL             -- SHA256(id || ts || action || prev_hash)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('002_autonomous_foundation', 'Autonomous forecast and reorder system tables');

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Recent forecast accuracy by item
CREATE VIEW IF NOT EXISTS v_forecast_accuracy AS
SELECT
  i.id as item_id,
  i.name as item_name,
  i.sku,
  AVG(fe.abs_pct_err) as avg_mape,
  COUNT(*) as error_count
FROM inventory_items i
INNER JOIN forecast_errors fe ON i.id = fe.item_id
WHERE fe.error_date > date('now', '-30 days')
GROUP BY i.id, i.name, i.sku
ORDER BY avg_mape DESC;

-- Active reorder recommendations
CREATE VIEW IF NOT EXISTS v_active_reorders AS
SELECT
  r.id,
  r.item_id,
  i.name as item_name,
  i.sku,
  r.rec_qty,
  r.policy as abc_class,
  r.reason,
  r.status,
  r.recommendation_date,
  CASE
    WHEN r.status = 'pending' AND r.policy = 'A' THEN 'urgent'
    WHEN r.status = 'pending' AND r.policy = 'B' THEN 'high'
    WHEN r.status = 'pending' THEN 'medium'
    ELSE 'low'
  END as priority
FROM reorder_recommendations r
INNER JOIN inventory_items i ON r.item_id = i.id
WHERE r.status = 'pending'
ORDER BY
  CASE r.policy
    WHEN 'A' THEN 1
    WHEN 'B' THEN 2
    WHEN 'C' THEN 3
  END,
  r.recommendation_date ASC;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
