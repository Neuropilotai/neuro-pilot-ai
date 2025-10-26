-- ============================================================================
-- Migration 032: Predictive Stability Layer
-- Version: v16.3.0
-- Description: Adaptive retry tuning, cron throttling, and stability governance
-- Author: NeuroInnovate AI Team
-- Date: 2025-10-19
-- ============================================================================

-- ============================================================================
-- 1. Stability Policy (Singleton Configuration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stability_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton row
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 1 AND 10),
  base_delay_ms INTEGER NOT NULL DEFAULT 200 CHECK (base_delay_ms BETWEEN 50 AND 5000),
  jitter_pct INTEGER NOT NULL DEFAULT 30 CHECK (jitter_pct BETWEEN 0 AND 100),
  cron_min_interval_min INTEGER NOT NULL DEFAULT 15 CHECK (cron_min_interval_min BETWEEN 5 AND 120),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  auto_tune_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_tune_enabled IN (0, 1)),
  observation_window_days INTEGER NOT NULL DEFAULT 7 CHECK (observation_window_days BETWEEN 1 AND 30),
  tune_threshold_events INTEGER NOT NULL DEFAULT 100 CHECK (tune_threshold_events >= 10),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT 'SYSTEM'
);

-- Insert default policy
INSERT OR IGNORE INTO stability_policy (id, max_retries, base_delay_ms, jitter_pct, cron_min_interval_min, enabled, auto_tune_enabled)
VALUES (1, 3, 200, 30, 15, 1, 1);

-- ============================================================================
-- 2. Stability Observations (Telemetry Data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stability_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  service TEXT NOT NULL, -- 'menu_predictor', 'feedback_trainer', 'phase3_cron', etc.
  operation TEXT NOT NULL, -- 'getPredictedUsageForToday', 'applyLearningFromComment', etc.
  attempts INTEGER NOT NULL CHECK (attempts >= 1),
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  error_class TEXT, -- 'SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_ERROR', NULL if success
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)), -- DB lock detected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stability_obs_ts ON stability_observations(ts);
CREATE INDEX IF NOT EXISTS idx_stability_obs_service_op ON stability_observations(service, operation);
CREATE INDEX IF NOT EXISTS idx_stability_obs_success ON stability_observations(success);

-- ============================================================================
-- 3. Stability Recommendations (Tuning History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stability_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),

  -- From (current)
  from_max_retries INTEGER NOT NULL,
  from_base_delay_ms INTEGER NOT NULL,
  from_jitter_pct INTEGER NOT NULL,
  from_cron_min_interval_min INTEGER NOT NULL,

  -- To (recommended)
  to_max_retries INTEGER NOT NULL,
  to_base_delay_ms INTEGER NOT NULL,
  to_jitter_pct INTEGER NOT NULL,
  to_cron_min_interval_min INTEGER NOT NULL,

  reason TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'AUTO', -- 'AUTO' or user email
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  applied_at TEXT,
  applied_by TEXT,

  -- Telemetry snapshot
  observation_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL,
  avg_attempts REAL,
  p95_duration_ms INTEGER,
  lock_rate REAL,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stability_rec_ts ON stability_recommendations(ts);
CREATE INDEX IF NOT EXISTS idx_stability_rec_applied ON stability_recommendations(applied);

-- ============================================================================
-- 4. Stability Metrics Rollup (Daily Aggregates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stability_metrics_daily (
  date TEXT NOT NULL, -- YYYY-MM-DD
  service TEXT NOT NULL,
  operation TEXT,
  total_operations INTEGER NOT NULL DEFAULT 0,
  successful_operations INTEGER NOT NULL DEFAULT 0,
  failed_operations INTEGER NOT NULL DEFAULT 0,
  total_retries INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  lock_events INTEGER NOT NULL DEFAULT 0,
  avg_attempts REAL,
  success_rate REAL,
  p95_duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, service, operation)
);

CREATE INDEX IF NOT EXISTS idx_stability_daily_date ON stability_metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_stability_daily_service ON stability_metrics_daily(service);

-- ============================================================================
-- 5. View: Recent Stability Summary (Last 7 Days)
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_stability_recent AS
SELECT
  service,
  operation,
  COUNT(*) as observation_count,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_ops,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_ops,
  ROUND(AVG(attempts), 2) as avg_attempts,
  ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) as lock_events,
  ROUND(100.0 * SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as lock_rate
FROM stability_observations
WHERE ts >= datetime('now', '-7 days')
GROUP BY service, operation;

-- ============================================================================
-- 6. View: Stability Health Score (Governance Integration)
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_stability_health AS
SELECT
  CASE
    WHEN success_rate >= 99.0 AND avg_attempts <= 1.2 AND lock_rate <= 1.0 THEN 100
    WHEN success_rate >= 98.0 AND avg_attempts <= 1.5 AND lock_rate <= 2.0 THEN 90
    WHEN success_rate >= 95.0 AND avg_attempts <= 2.0 AND lock_rate <= 5.0 THEN 80
    WHEN success_rate >= 90.0 AND avg_attempts <= 2.5 AND lock_rate <= 10.0 THEN 70
    WHEN success_rate >= 85.0 THEN 60
    WHEN success_rate >= 75.0 THEN 50
    ELSE 40
  END as stability_score,
  observation_count,
  success_rate,
  avg_attempts,
  lock_rate,
  datetime('now') as computed_at
FROM (
  SELECT
    COUNT(*) as observation_count,
    ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
    ROUND(AVG(attempts), 2) as avg_attempts,
    ROUND(100.0 * SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as lock_rate
  FROM stability_observations
  WHERE ts >= datetime('now', '-7 days')
);

-- ============================================================================
-- 7. View: Current Stability Policy (Easy Access)
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_stability_policy_current AS
SELECT
  max_retries,
  base_delay_ms,
  jitter_pct,
  cron_min_interval_min,
  enabled,
  auto_tune_enabled,
  observation_window_days,
  tune_threshold_events,
  updated_at,
  updated_by
FROM stability_policy
WHERE id = 1;

-- ============================================================================
-- 8. Trigger: Update stability_policy.updated_at
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS trg_stability_policy_updated_at
AFTER UPDATE ON stability_policy
FOR EACH ROW
BEGIN
  UPDATE stability_policy
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- ============================================================================
-- 9. View: Pending Recommendations
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_stability_recommendations_pending AS
SELECT
  id,
  ts,
  from_max_retries,
  from_base_delay_ms,
  from_jitter_pct,
  from_cron_min_interval_min,
  to_max_retries,
  to_base_delay_ms,
  to_jitter_pct,
  to_cron_min_interval_min,
  reason,
  author,
  observation_count,
  success_rate,
  avg_attempts,
  p95_duration_ms,
  lock_rate,
  created_at
FROM stability_recommendations
WHERE applied = 0
ORDER BY ts DESC;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary:
--   - stability_policy: singleton config for retry/cron params
--   - stability_observations: telemetry from DB operations
--   - stability_recommendations: tuning suggestions (manual or auto)
--   - stability_metrics_daily: aggregated daily rollups
--   - 4 views for health scoring, recent stats, pending recommendations
--   - Triggers for auto-updating timestamps
-- ============================================================================
