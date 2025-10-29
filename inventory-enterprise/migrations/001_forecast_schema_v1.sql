-- Migration: 001_forecast_schema_v1.sql
-- Description: Create demand forecast and reorder recommendation schema
-- Author: Platform Engineering Team
-- Date: 2025-10-28
-- Version: 1.0.0

-- ============================================================================
-- USAGE HISTORY (Core Fact Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  usage_date DATE NOT NULL,
  quantity_used DECIMAL(10,2) NOT NULL CHECK (quantity_used >= 0),
  quantity_wasted DECIMAL(10,2) DEFAULT 0 CHECK (quantity_wasted >= 0),
  is_special_event BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, usage_date)
);

CREATE INDEX idx_usage_history_sku_date ON usage_history(sku, usage_date);
CREATE INDEX idx_usage_history_date ON usage_history(usage_date);
CREATE INDEX idx_usage_history_sku ON usage_history(sku);

-- ============================================================================
-- SPECIAL EVENTS (External Regressors for ML)
-- ============================================================================

CREATE TABLE IF NOT EXISTS special_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date DATE NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(50), -- holiday, promotion, closure, weather, maintenance
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0 CHECK (impact_multiplier >= 0),
  applies_to_category VARCHAR(100), -- NULL means all categories
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (event_date, event_name)
);

CREATE INDEX idx_special_events_date ON special_events(event_date);
CREATE INDEX idx_special_events_type ON special_events(event_type);
CREATE INDEX idx_special_events_category ON special_events(applies_to_category);

-- ============================================================================
-- FORECAST FEATURES (Computed Daily by ETL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_features (
  sku VARCHAR(100) NOT NULL,
  feature_date DATE NOT NULL,

  -- Lag features (trailing usage)
  usage_lag_1w DECIMAL(10,2),
  usage_lag_2w DECIMAL(10,2),
  usage_lag_4w DECIMAL(10,2),

  -- Rolling statistics (4-week window)
  usage_mean_4w DECIMAL(10,2),
  usage_std_4w DECIMAL(10,2),
  usage_min_4w DECIMAL(10,2),
  usage_max_4w DECIMAL(10,2),

  -- Rolling statistics (12-week window)
  usage_mean_12w DECIMAL(10,2),
  usage_std_12w DECIMAL(10,2),
  usage_min_12w DECIMAL(10,2),
  usage_max_12w DECIMAL(10,2),

  -- Trend features
  usage_trend_4w DECIMAL(10,2), -- linear regression slope
  usage_pct_change_4w DECIMAL(5,2), -- percentage change from 4 weeks ago

  -- Seasonality indicators
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Monday, 6=Sunday
  week_of_year INTEGER CHECK (week_of_year BETWEEN 1 AND 53),
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  is_month_start BOOLEAN DEFAULT FALSE,
  is_month_end BOOLEAN DEFAULT FALSE,
  is_quarter_start BOOLEAN DEFAULT FALSE,
  is_quarter_end BOOLEAN DEFAULT FALSE,
  is_holiday BOOLEAN DEFAULT FALSE,

  -- Inventory state
  current_stock DECIMAL(10,2),
  days_of_supply DECIMAL(5,1),
  stockout_flag BOOLEAN DEFAULT FALSE,

  -- External regressors
  event_multiplier DECIMAL(5,2) DEFAULT 1.0,
  event_type VARCHAR(50),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (sku, feature_date),
  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
);

CREATE INDEX idx_forecast_features_sku ON forecast_features(sku);
CREATE INDEX idx_forecast_features_date ON forecast_features(feature_date);

-- ============================================================================
-- FORECASTS (Model Predictions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  forecast_date DATE NOT NULL, -- when forecast was generated
  prediction_date DATE NOT NULL, -- date being predicted
  horizon_weeks INTEGER NOT NULL CHECK (horizon_weeks BETWEEN 1 AND 52),

  -- Point forecast
  predicted_quantity DECIMAL(10,2) NOT NULL CHECK (predicted_quantity >= 0),

  -- Prediction intervals (80% confidence)
  predicted_quantity_lower_80 DECIMAL(10,2),
  predicted_quantity_upper_80 DECIMAL(10,2),

  -- Prediction intervals (95% confidence)
  predicted_quantity_lower_95 DECIMAL(10,2),
  predicted_quantity_upper_95 DECIMAL(10,2),

  -- Model metadata
  model_name VARCHAR(50) NOT NULL, -- seasonal_naive, ets, prophet, lightgbm, ensemble
  model_version VARCHAR(50) NOT NULL,
  confidence_score DECIMAL(5,4) CHECK (confidence_score BETWEEN 0 AND 1), -- 0-1

  -- Actual usage (filled in after prediction_date passes)
  actual_quantity DECIMAL(10,2),
  absolute_error DECIMAL(10,2),
  percentage_error DECIMAL(5,2),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, forecast_date, prediction_date, model_name)
);

CREATE INDEX idx_forecasts_sku_pred ON forecasts(sku, prediction_date);
CREATE INDEX idx_forecasts_sku_forecast ON forecasts(sku, forecast_date);
CREATE INDEX idx_forecasts_date ON forecasts(forecast_date);
CREATE INDEX idx_forecasts_model ON forecasts(model_name, model_version);

-- ============================================================================
-- REORDER RECOMMENDATIONS (Action Items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reorder_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  recommendation_date DATE NOT NULL,

  -- ABC classification
  abc_class VARCHAR(1) NOT NULL CHECK (abc_class IN ('A', 'B', 'C')),
  annual_usage_value DECIMAL(12,2),
  usage_rank INTEGER, -- 1 = highest value item

  -- Demand forecast (next 4 weeks aggregated)
  forecasted_demand_4w DECIMAL(10,2) NOT NULL CHECK (forecasted_demand_4w >= 0),
  forecasted_demand_std DECIMAL(10,2),
  forecast_confidence DECIMAL(5,4),

  -- Safety stock calculation
  avg_demand_per_day DECIMAL(10,2) NOT NULL CHECK (avg_demand_per_day >= 0),
  demand_std_per_day DECIMAL(10,2) NOT NULL CHECK (demand_std_per_day >= 0),
  lead_time_days INTEGER NOT NULL CHECK (lead_time_days > 0),
  lead_time_std_days INTEGER DEFAULT 0, -- lead time variability
  service_level_target DECIMAL(5,4) NOT NULL CHECK (service_level_target BETWEEN 0 AND 1), -- 0.90, 0.95, 0.99
  z_score DECIMAL(5,2) NOT NULL, -- from service level
  safety_stock DECIMAL(10,2) NOT NULL CHECK (safety_stock >= 0),

  -- Reorder point
  reorder_point DECIMAL(10,2) NOT NULL CHECK (reorder_point >= 0),
  current_stock DECIMAL(10,2) NOT NULL CHECK (current_stock >= 0),
  current_on_order DECIMAL(10,2) DEFAULT 0 CHECK (current_on_order >= 0),
  stock_position DECIMAL(10,2), -- current_stock + current_on_order

  -- Recommendation
  should_reorder BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_order_quantity DECIMAL(10,2) CHECK (recommended_order_quantity >= 0),
  recommended_order_date DATE,
  min_order_quantity DECIMAL(10,2),
  lot_size DECIMAL(10,2),
  priority VARCHAR(20) CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  days_until_stockout DECIMAL(5,1),

  -- Cost analysis
  unit_cost DECIMAL(10,2),
  total_order_value DECIMAL(12,2),

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'cancelled')),
  approved_by INTEGER, -- user_id
  approved_at TIMESTAMP,
  approved_quantity DECIMAL(10,2), -- may differ from recommended_order_quantity
  actual_order_id INTEGER,
  rejection_reason TEXT,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (sku, recommendation_date)
);

CREATE INDEX idx_reorder_sku_date ON reorder_recommendations(sku, recommendation_date);
CREATE INDEX idx_reorder_status ON reorder_recommendations(status);
CREATE INDEX idx_reorder_priority ON reorder_recommendations(priority);
CREATE INDEX idx_reorder_abc ON reorder_recommendations(abc_class);
CREATE INDEX idx_reorder_should_reorder ON reorder_recommendations(should_reorder);
CREATE INDEX idx_reorder_date ON reorder_recommendations(recommendation_date);

-- ============================================================================
-- MODEL REGISTRY (Trained Models Metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100), -- NULL = global model
  model_name VARCHAR(50) NOT NULL, -- seasonal_naive, ets, prophet, lightgbm, ensemble
  model_version VARCHAR(50) NOT NULL,

  -- Training metadata
  training_date TIMESTAMP NOT NULL,
  training_data_start DATE NOT NULL,
  training_data_end DATE NOT NULL,
  training_rows INTEGER,
  training_duration_seconds INTEGER,

  -- Performance metrics (from backtesting)
  backtest_mape DECIMAL(8,4), -- Mean Absolute Percentage Error
  backtest_rmse DECIMAL(12,4), -- Root Mean Squared Error
  backtest_mae DECIMAL(12,4), -- Mean Absolute Error
  backtest_mape_std DECIMAL(8,4), -- Std dev of MAPE across splits
  pi_coverage_80 DECIMAL(5,4), -- Prediction interval coverage (80%)
  pi_coverage_95 DECIMAL(5,4), -- Prediction interval coverage (95%)
  forecast_bias DECIMAL(10,4), -- Average forecast bias

  -- Model artifacts
  artifact_path VARCHAR(500), -- file path or S3 URL
  artifact_size_mb DECIMAL(10,2),
  artifact_hash VARCHAR(64), -- SHA256 for integrity check

  -- Deployment
  is_production BOOLEAN DEFAULT FALSE,
  deployed_at TIMESTAMP,
  decommissioned_at TIMESTAMP,

  -- Model configuration (stored as JSON text)
  hyperparameters TEXT, -- JSON
  feature_importance TEXT, -- JSON
  metadata TEXT, -- JSON

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, model_name, model_version)
);

CREATE INDEX idx_model_registry_prod ON model_registry(is_production, model_name);
CREATE INDEX idx_model_registry_sku ON model_registry(sku);
CREATE INDEX idx_model_registry_training_date ON model_registry(training_date);

-- ============================================================================
-- FORECAST ACCURACY TRACKING (Aggregated Metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_accuracy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100),
  abc_class VARCHAR(1),
  model_name VARCHAR(50),
  evaluation_date DATE NOT NULL,
  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,

  -- Aggregate metrics
  total_predictions INTEGER,
  mape DECIMAL(8,4),
  rmse DECIMAL(12,4),
  mae DECIMAL(12,4),
  bias DECIMAL(10,4),
  forecast_accuracy_pct DECIMAL(5,2), -- 100 - MAPE

  -- Prediction interval coverage
  pi_80_coverage DECIMAL(5,4),
  pi_95_coverage DECIMAL(5,4),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
);

CREATE INDEX idx_forecast_accuracy_sku ON forecast_accuracy(sku);
CREATE INDEX idx_forecast_accuracy_date ON forecast_accuracy(evaluation_date);
CREATE INDEX idx_forecast_accuracy_abc ON forecast_accuracy(abc_class);
CREATE INDEX idx_forecast_accuracy_model ON forecast_accuracy(model_name);

-- ============================================================================
-- AUDIT LOG (Security & Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL, -- forecast_generated, recommendation_approved, model_retrained
  resource_type VARCHAR(50), -- sku, model, recommendation
  resource_id VARCHAR(100),

  -- Request/response payload (sanitized, stored as JSON text)
  request_payload TEXT,
  response_status INTEGER,

  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Hash chain for tamper detection
  previous_hash VARCHAR(64),
  current_hash VARCHAR(64), -- SHA256(id || timestamp || action || previous_hash)

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_forecast_audit_log_user ON forecast_audit_log(user_id);
CREATE INDEX idx_forecast_audit_log_timestamp ON forecast_audit_log(timestamp);
CREATE INDEX idx_forecast_audit_log_action ON forecast_audit_log(action);
CREATE INDEX idx_forecast_audit_log_resource ON forecast_audit_log(resource_type, resource_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ============================================================================

-- Usage history updated_at trigger
CREATE TRIGGER IF NOT EXISTS update_usage_history_timestamp
AFTER UPDATE ON usage_history
FOR EACH ROW
BEGIN
  UPDATE usage_history SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Reorder recommendations updated_at trigger
CREATE TRIGGER IF NOT EXISTS update_reorder_recommendations_timestamp
AFTER UPDATE ON reorder_recommendations
FOR EACH ROW
BEGIN
  UPDATE reorder_recommendations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active reorder recommendations by priority
CREATE VIEW IF NOT EXISTS v_active_recommendations AS
SELECT
  r.id,
  r.sku,
  i.name AS sku_name,
  i.category,
  r.abc_class,
  r.priority,
  r.should_reorder,
  r.recommended_order_quantity,
  r.recommended_order_date,
  r.current_stock,
  r.safety_stock,
  r.reorder_point,
  r.days_until_stockout,
  r.total_order_value,
  r.status,
  r.recommendation_date,
  r.forecasted_demand_4w,
  r.forecast_confidence
FROM reorder_recommendations r
INNER JOIN inventory_items i ON r.sku = i.sku
WHERE r.status = 'pending'
  AND r.should_reorder = TRUE
ORDER BY
  CASE r.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  r.days_until_stockout ASC;

-- View: Latest forecast accuracy by SKU
CREATE VIEW IF NOT EXISTS v_latest_forecast_accuracy AS
SELECT
  fa.sku,
  i.name AS sku_name,
  i.category,
  fa.abc_class,
  fa.model_name,
  fa.mape,
  fa.rmse,
  fa.forecast_accuracy_pct,
  fa.bias,
  fa.evaluation_date,
  fa.total_predictions
FROM forecast_accuracy fa
INNER JOIN inventory_items i ON fa.sku = i.sku
WHERE fa.evaluation_date = (
  SELECT MAX(evaluation_date)
  FROM forecast_accuracy fa2
  WHERE fa2.sku = fa.sku
)
ORDER BY fa.abc_class, fa.mape ASC;

-- View: Recent usage with rolling averages
CREATE VIEW IF NOT EXISTS v_usage_with_trends AS
SELECT
  uh.sku,
  i.name AS sku_name,
  i.category,
  uh.usage_date,
  uh.quantity_used,
  uh.is_special_event,
  AVG(uh.quantity_used) OVER (
    PARTITION BY uh.sku
    ORDER BY uh.usage_date
    ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
  ) AS usage_avg_4w,
  AVG(uh.quantity_used) OVER (
    PARTITION BY uh.sku
    ORDER BY uh.usage_date
    ROWS BETWEEN 83 PRECEDING AND CURRENT ROW
  ) AS usage_avg_12w
FROM usage_history uh
INNER JOIN inventory_items i ON uh.sku = i.sku
ORDER BY uh.sku, uh.usage_date DESC;

-- ============================================================================
-- SEED DATA: Common holidays and special events
-- ============================================================================

INSERT OR IGNORE INTO special_events (event_date, event_name, event_type, impact_multiplier, applies_to_category, notes)
VALUES
  -- 2025 Holidays
  ('2025-01-01', 'New Year''s Day', 'holiday', 1.3, NULL, 'Increased demand'),
  ('2025-02-14', 'Valentine''s Day', 'holiday', 1.2, 'Desserts', 'Increased dessert sales'),
  ('2025-03-17', 'St. Patrick''s Day', 'holiday', 1.15, 'Beverages', 'Increased beverage sales'),
  ('2025-04-20', 'Easter', 'holiday', 1.25, NULL, 'Spring holiday'),
  ('2025-05-12', 'Mother''s Day', 'holiday', 1.2, NULL, 'Increased dining'),
  ('2025-06-15', 'Father''s Day', 'holiday', 1.15, NULL, 'Increased dining'),
  ('2025-07-04', 'Independence Day', 'holiday', 1.3, NULL, 'Major holiday'),
  ('2025-09-01', 'Labor Day', 'holiday', 1.2, NULL, 'End of summer'),
  ('2025-10-31', 'Halloween', 'holiday', 1.15, 'Desserts', 'Increased candy/desserts'),
  ('2025-11-27', 'Thanksgiving', 'holiday', 1.5, NULL, 'Major cooking holiday'),
  ('2025-12-25', 'Christmas', 'holiday', 1.6, NULL, 'Highest demand day'),
  ('2025-12-31', 'New Year''s Eve', 'holiday', 1.4, NULL, 'High demand')
;

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description)
VALUES ('001_forecast_schema_v1', 'Initial forecast and reorder recommendation schema');

-- ============================================================================
-- COMMENTS (SQLite doesn't support COMMENT ON, documented here)
-- ============================================================================

/*
TABLE DESCRIPTIONS:

usage_history:
  Core fact table storing daily usage/consumption of inventory items.
  Primary data source for forecast models.

special_events:
  Calendar of known events (holidays, promotions) that affect demand.
  Used as external regressors in Prophet and LightGBM models.

forecast_features:
  Pre-computed feature store for ML models.
  Updated daily by ETL pipeline to avoid recomputing during inference.

forecasts:
  All forecast predictions with point estimates and prediction intervals.
  Includes actual_quantity field for ex-post accuracy evaluation.

reorder_recommendations:
  Actionable reorder recommendations with priority levels.
  Integrates forecast output with safety stock calculations.

model_registry:
  Metadata for all trained ML models.
  Tracks model versions, performance metrics, and deployment status.

forecast_accuracy:
  Aggregated accuracy metrics over time.
  Used for model monitoring dashboards.

forecast_audit_log:
  Security audit trail with hash chain for tamper detection.
  Records all forecast generation, approvals, and model training events.
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
