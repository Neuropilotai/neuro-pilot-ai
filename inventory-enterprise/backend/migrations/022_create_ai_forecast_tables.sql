-- v15.5.0: AI Forecasting + Order Recommendation Engine
-- Creates tables for forecast predictions and feedback learning

-- ============================================================================
-- ai_forecast_history: Stores all forecast predictions
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_forecast_history (
  forecast_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  forecast_date DATE NOT NULL,
  forecast_for_date DATE NOT NULL,
  predicted_usage REAL NOT NULL DEFAULT 0,
  actual_usage REAL,
  variance REAL,
  variance_pct REAL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  prediction_method TEXT NOT NULL DEFAULT 'exponential_smoothing',
  input_signals TEXT NOT NULL, -- JSON: {population: 150, menu_rotation: true, ...}
  weight_vector TEXT NOT NULL, -- JSON: {usage_history: 0.4, population: 0.3, ...}
  storage_location TEXT,
  category TEXT,
  unit TEXT NOT NULL,
  par_level REAL,
  recommended_order_qty REAL,
  order_status TEXT DEFAULT 'pending', -- pending|approved|adjusted|rejected|ordered
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_history_item ON ai_forecast_history(item_code);
CREATE INDEX IF NOT EXISTS idx_forecast_history_date ON ai_forecast_history(forecast_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_history_run ON ai_forecast_history(run_id);
CREATE INDEX IF NOT EXISTS idx_forecast_history_status ON ai_forecast_history(order_status);

-- ============================================================================
-- ai_feedback_loop: Stores human corrections and learning feedback
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_feedback_loop (
  feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  feedback_type TEXT NOT NULL, -- adjustment|correction|approval|rejection
  original_prediction REAL NOT NULL,
  human_adjustment REAL,
  adjustment_reason TEXT,
  adjustment_delta REAL,
  adjustment_delta_pct REAL,
  weight_adjustments TEXT, -- JSON: {usage_history: +0.05, population: -0.02, ...}
  applied BOOLEAN DEFAULT 0,
  applied_at TEXT,
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  impact_score REAL, -- How much this feedback improved future forecasts
  FOREIGN KEY (forecast_id) REFERENCES ai_forecast_history(forecast_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_loop_forecast ON ai_feedback_loop(forecast_id);
CREATE INDEX IF NOT EXISTS idx_feedback_loop_item ON ai_feedback_loop(item_code);
CREATE INDEX IF NOT EXISTS idx_feedback_loop_applied ON ai_feedback_loop(applied);
CREATE INDEX IF NOT EXISTS idx_feedback_loop_date ON ai_feedback_loop(submitted_at DESC);

-- ============================================================================
-- ai_forecast_runs: Tracks forecast generation runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_forecast_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  forecast_date DATE NOT NULL,
  forecast_horizon_days INTEGER NOT NULL DEFAULT 7,
  items_forecasted INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL,
  total_predicted_value REAL,
  model_version TEXT NOT NULL,
  input_data_sources TEXT, -- JSON: {usage_history: true, menu_rotation: true, ...}
  execution_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running', -- running|completed|failed
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_date ON ai_forecast_runs(forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_runs_status ON ai_forecast_runs(status);

-- ============================================================================
-- ai_forecast_accuracy: Aggregated accuracy metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_forecast_accuracy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calculation_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_forecasts INTEGER NOT NULL DEFAULT 0,
  accurate_forecasts INTEGER NOT NULL DEFAULT 0, -- Within 10% variance
  accuracy_pct REAL NOT NULL DEFAULT 0,
  avg_variance_pct REAL,
  total_variance_value REAL,
  category_breakdown TEXT, -- JSON: {BAKE: 95.2, MEAT: 88.3, ...}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_date ON ai_forecast_accuracy(calculation_date DESC);

-- ============================================================================
-- Views: Aggregated forecast data
-- ============================================================================

-- v_forecast_accuracy_current: Latest accuracy metrics
CREATE VIEW IF NOT EXISTS v_forecast_accuracy_current AS
SELECT
  accuracy_pct,
  avg_variance_pct,
  total_forecasts,
  accurate_forecasts,
  category_breakdown,
  calculation_date
FROM ai_forecast_accuracy
ORDER BY calculation_date DESC
LIMIT 1;

-- v_forecast_pending_orders: Current recommended orders pending approval
CREATE VIEW IF NOT EXISTS v_forecast_pending_orders AS
SELECT
  h.forecast_id,
  h.item_code,
  h.item_name,
  h.forecast_for_date,
  h.predicted_usage,
  h.recommended_order_qty,
  h.confidence_score,
  h.category,
  h.storage_location,
  h.unit,
  h.par_level,
  i.current_stock,
  i.unit_cost,
  (h.recommended_order_qty * COALESCE(i.unit_cost, 0)) as estimated_cost
FROM ai_forecast_history h
LEFT JOIN inventory_items i ON h.item_code = i.item_code
WHERE h.order_status = 'pending'
  AND h.forecast_for_date >= date('now')
ORDER BY h.forecast_for_date ASC, h.category, h.item_name;

-- v_forecast_learning_insights: Feedback loop performance
CREATE VIEW IF NOT EXISTS v_forecast_learning_insights AS
SELECT
  f.item_code,
  i.item_name,
  COUNT(*) as feedback_count,
  AVG(f.adjustment_delta_pct) as avg_adjustment_pct,
  AVG(f.impact_score) as avg_impact_score,
  SUM(CASE WHEN f.applied = 1 THEN 1 ELSE 0 END) as applied_count,
  MAX(f.submitted_at) as last_feedback_date
FROM ai_feedback_loop f
LEFT JOIN inventory_items i ON f.item_code = i.item_code
GROUP BY f.item_code
HAVING feedback_count > 0
ORDER BY avg_impact_score DESC;

-- ============================================================================
-- Initial Data: Seed forecast accuracy metric in ops health
-- ============================================================================
INSERT OR IGNORE INTO ai_ops_health_metrics (metric_name, metric_value, weight, last_updated)
VALUES ('forecast_accuracy', 0.0, 0.20, datetime('now'));
