-- =====================================================================
-- Migration 021: AI Learning Infrastructure
-- =====================================================================
-- Purpose: Create tables for autonomous learning, anomaly detection,
--          and contextual pattern recognition
--
-- Tables:
-- - ai_daily_forecast_cache: Stores daily predictions for comparison
-- - ai_actual_usage_log: Records actual consumption for learning
-- - ai_learning_insights: Discovered cause-effect patterns
-- - ai_anomaly_log: Deviation tracking with hypotheses
-- - ai_confidence_scores: Model confidence by item/category over time
-- - ai_consumption_split: Contractor vs cafeteria tracking

-- =====================================================================
-- TABLE: ai_daily_forecast_cache
-- =====================================================================
-- Stores each day's predictions for comparison against actuals

CREATE TABLE IF NOT EXISTS ai_daily_forecast_cache (
  cache_id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_date DATE NOT NULL,
  item_code TEXT NOT NULL,
  predicted_qty REAL NOT NULL,
  unit TEXT NOT NULL,
  current_stock REAL,
  forecast_source TEXT,              -- 'menu', 'breakfast', 'beverage', 'sandwich'
  confidence REAL DEFAULT 0.9,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(forecast_date, item_code, forecast_source)
);

CREATE INDEX IF NOT EXISTS idx_forecast_cache_date ON ai_daily_forecast_cache(forecast_date);
CREATE INDEX IF NOT EXISTS idx_forecast_cache_item ON ai_daily_forecast_cache(item_code);

-- =====================================================================
-- TABLE: ai_actual_usage_log
-- =====================================================================
-- Records actual consumption for learning comparison

CREATE TABLE IF NOT EXISTS ai_actual_usage_log (
  usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_date DATE NOT NULL,
  item_code TEXT NOT NULL,
  actual_qty REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT,                       -- 'cafeteria', 'contractor', 'dorms', 'waste'
  notes TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(usage_date, item_code, source)
);

CREATE INDEX IF NOT EXISTS idx_usage_log_date ON ai_actual_usage_log(usage_date);
CREATE INDEX IF NOT EXISTS idx_usage_log_item ON ai_actual_usage_log(item_code);

-- =====================================================================
-- TABLE: ai_learning_insights
-- =====================================================================
-- Stores discovered cause-effect patterns

CREATE TABLE IF NOT EXISTS ai_learning_insights (
  insight_id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL,        -- 'cause_effect', 'seasonal', 'event_driven', 'anomaly'
  category TEXT,                     -- 'beverage', 'breakfast', 'supplies', 'waste'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,       -- 0.0 - 1.0
  evidence_count INTEGER DEFAULT 1,  -- How many times pattern observed
  first_observed DATE NOT NULL,
  last_confirmed DATE,
  status TEXT DEFAULT 'learning',    -- 'learning', 'confirmed', 'rejected', 'temporary'
  owner_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_insights_type ON ai_learning_insights(pattern_type);
CREATE INDEX IF NOT EXISTS idx_insights_status ON ai_learning_insights(status);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON ai_learning_insights(confidence);

-- =====================================================================
-- TABLE: ai_anomaly_log
-- =====================================================================
-- Tracks deviations from predictions with AI-generated hypotheses

CREATE TABLE IF NOT EXISTS ai_anomaly_log (
  anomaly_id INTEGER PRIMARY KEY AUTOINCREMENT,
  anomaly_date DATE NOT NULL,
  item_code TEXT NOT NULL,
  predicted_qty REAL NOT NULL,
  actual_qty REAL NOT NULL,
  deviation_pct REAL NOT NULL,       -- Percentage difference
  severity TEXT,                     -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
  ai_hypothesis TEXT,                -- Auto-generated possible cause
  owner_confirmed_cause TEXT,        -- Owner clarification
  resolution TEXT,                   -- How it was resolved
  is_temporary INTEGER DEFAULT 1,    -- 1 = short-term spike, 0 = permanent change
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anomaly_date ON ai_anomaly_log(anomaly_date);
CREATE INDEX IF NOT EXISTS idx_anomaly_item ON ai_anomaly_log(item_code);
CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON ai_anomaly_log(severity);

-- =====================================================================
-- TABLE: ai_confidence_scores
-- =====================================================================
-- Tracks model confidence evolution by item category

CREATE TABLE IF NOT EXISTS ai_confidence_scores (
  score_id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_date DATE NOT NULL,
  category TEXT NOT NULL,            -- 'breakfast', 'beverage', 'menu', 'overall'
  item_code TEXT,                    -- NULL for category-wide scores
  confidence REAL NOT NULL,          -- 0.0 - 1.0
  accuracy_pct REAL,                 -- % accurate over last 7 days
  sample_size INTEGER DEFAULT 0,     -- Number of predictions evaluated
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(score_date, category, item_code)
);

CREATE INDEX IF NOT EXISTS idx_confidence_date ON ai_confidence_scores(score_date);
CREATE INDEX IF NOT EXISTS idx_confidence_category ON ai_confidence_scores(category);

-- =====================================================================
-- TABLE: ai_consumption_split
-- =====================================================================
-- Tracks cafeteria vs contractor vs dorms usage patterns

CREATE TABLE IF NOT EXISTS ai_consumption_split (
  split_id INTEGER PRIMARY KEY AUTOINCREMENT,
  split_date DATE NOT NULL,
  item_code TEXT NOT NULL,
  cafeteria_qty REAL DEFAULT 0,
  contractor_qty REAL DEFAULT 0,
  dorms_qty REAL DEFAULT 0,
  waste_qty REAL DEFAULT 0,
  total_qty REAL NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(split_date, item_code)
);

CREATE INDEX IF NOT EXISTS idx_split_date ON ai_consumption_split(split_date);
CREATE INDEX IF NOT EXISTS idx_split_item ON ai_consumption_split(item_code);

-- =====================================================================
-- SEED: Initial Learning Insights (Known Patterns)
-- =====================================================================

INSERT OR IGNORE INTO ai_learning_insights (pattern_type, category, title, description, confidence, evidence_count, first_observed, status)
VALUES
  ('event_driven', 'meat', 'Saturday Steak Night Spike',
   'Every Saturday: 10oz AAA steak per person (250 servings). Predictable recurring event.',
   0.99, 50, DATE('now'), 'confirmed'),

  ('cause_effect', 'supplies', 'Dishwasher Failure → Paper Plate Surge',
   'When dishwasher breaks, paper plate usage increases 300-500%. Temporary spike until repair.',
   0.92, 3, DATE('now'), 'confirmed'),

  ('cause_effect', 'beverage', 'Contractor Arrival → Small Coffee Bag Requisitions',
   'New contractor groups trigger increase in small coffee bag requisitions (not cafeteria use).',
   0.85, 5, DATE('now'), 'confirmed'),

  ('seasonal', 'beverage', 'Hot Days → Cold Beverage Increase',
   'Temperature >25°C correlates with 15-20% increase in cold juice/milk consumption.',
   0.78, 12, DATE('now'), 'learning'),

  ('cause_effect', 'supplies', 'Hot Water Tank Failure → Disposable Use',
   'Hot water outage increases disposable plate/utensil usage significantly. Returns to normal after repair.',
   0.88, 2, DATE('now'), 'confirmed'),

  ('event_driven', 'meat', 'Daily Jigg Dinner Service',
   'Sliced turkey breast served every day as traditional Jigg Dinner. Stable demand.',
   0.95, 365, DATE('now'), 'confirmed'),

  ('baseline', 'bread', 'Daily Sandwich Program Baseline',
   '500 sandwiches per day baseline. Adjusts ±10% based on waste and population.',
   0.90, 100, DATE('now'), 'confirmed'),

  ('cultural', 'indian', 'Indian Meal Daily Service',
   '20 Indian meals per day. Requires specialized spice inventory (turmeric, cumin, garam masala).',
   0.93, 200, DATE('now'), 'confirmed');

-- =====================================================================
-- SEED: Initial Confidence Scores (Current State)
-- =====================================================================

INSERT OR IGNORE INTO ai_confidence_scores (score_date, category, item_code, confidence, accuracy_pct, sample_size)
VALUES
  (DATE('now'), 'breakfast', NULL, 0.90, NULL, 0),
  (DATE('now'), 'beverage', NULL, 0.88, NULL, 0),
  (DATE('now'), 'menu', NULL, 0.50, NULL, 0),    -- Low until recipe linkage complete
  (DATE('now'), 'overall', NULL, 0.76, NULL, 0);

-- Verification queries
-- SELECT COUNT(*) as cache_entries FROM ai_daily_forecast_cache;
-- SELECT COUNT(*) as insights FROM ai_learning_insights WHERE status = 'confirmed';
-- SELECT category, confidence FROM ai_confidence_scores WHERE score_date = DATE('now');
