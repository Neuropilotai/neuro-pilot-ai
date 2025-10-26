-- =====================================================================
-- Migration 029: Governance Trends & Forecasting (v15.9.0)
-- =====================================================================
-- Purpose: Track daily pillar scores and generate short-term forecasts
-- Author: NeuroPilot AI Development Team
-- Date: 2025-10-18
-- =====================================================================

-- Daily governance pillar scores (historical tracking)
CREATE TABLE IF NOT EXISTS governance_daily (
  as_of DATE NOT NULL,
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  score REAL NOT NULL,
  source TEXT, -- 'auto' | 'manual' | 'backfill'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(as_of, pillar)
);

-- Governance forecasts with confidence bands
CREATE TABLE IF NOT EXISTS governance_forecast (
  run_id TEXT NOT NULL,
  as_of DATE NOT NULL,
  horizon INTEGER NOT NULL, -- 7, 14, or 30 days
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  score REAL NOT NULL, -- forecasted score
  lower REAL NOT NULL, -- lower confidence bound
  upper REAL NOT NULL, -- upper confidence bound
  method TEXT NOT NULL, -- 'exp_smoothing' | 'holt_winters'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(run_id, as_of, pillar, horizon)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_governance_daily_pillar_date
  ON governance_daily(pillar, as_of DESC);

CREATE INDEX IF NOT EXISTS idx_governance_forecast_pillar_date
  ON governance_forecast(pillar, as_of DESC);

CREATE INDEX IF NOT EXISTS idx_governance_forecast_run
  ON governance_forecast(run_id, created_at DESC);

-- View: Last 30 days of daily scores per pillar
CREATE VIEW IF NOT EXISTS v_governance_daily_30d AS
SELECT
  pillar,
  as_of,
  score,
  source,
  created_at
FROM governance_daily
WHERE as_of >= date('now', '-30 days')
ORDER BY pillar, as_of DESC;

-- View: Latest scores for all pillars
CREATE VIEW IF NOT EXISTS v_governance_latest_scores AS
SELECT
  pillar,
  as_of,
  score,
  source
FROM governance_daily gd
WHERE as_of = (
  SELECT MAX(as_of)
  FROM governance_daily
  WHERE pillar = gd.pillar
)
ORDER BY pillar;

-- View: Latest forecast run
CREATE VIEW IF NOT EXISTS v_governance_latest_forecast AS
SELECT
  gf.pillar,
  gf.as_of,
  gf.horizon,
  gf.score,
  gf.lower,
  gf.upper,
  gf.method,
  gf.created_at
FROM governance_forecast gf
WHERE gf.run_id = (
  SELECT run_id
  FROM governance_forecast
  ORDER BY created_at DESC
  LIMIT 1
)
ORDER BY gf.pillar, gf.horizon;

-- Metadata tracking
INSERT OR IGNORE INTO schema_version (version, description, applied_at)
VALUES (29, 'Governance trends and forecasting tables', datetime('now'));

-- =====================================================================
-- End Migration 029
-- =====================================================================
