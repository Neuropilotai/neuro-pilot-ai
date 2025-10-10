-- Migration: AI Feedback & Self-Optimization Engine
-- Version: v2.2.0-2025-10-07
-- Description: Adds tables for AI feedback loop, auto-retraining, and RL policy optimization
-- Database: PostgreSQL

-- =============================================================================
-- AI Feedback Table
-- =============================================================================
-- Stores ground truth vs forecast comparisons for accuracy tracking
CREATE TABLE IF NOT EXISTS ai_feedback (
    id BIGSERIAL PRIMARY KEY,
    item_code TEXT NOT NULL,
    date DATE NOT NULL,
    forecast REAL,
    actual REAL,
    mape REAL,           -- Mean Absolute Percentage Error
    rmse REAL,           -- Root Mean Square Error
    source TEXT CHECK (source IN ('sales', 'invoice', 'stock_count', 'order_fulfillment')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_code, date, source)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_item_date
    ON ai_feedback(item_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created
    ON ai_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_mape
    ON ai_feedback(mape) WHERE mape IS NOT NULL;

-- Table comment
COMMENT ON TABLE ai_feedback IS 'Stores ground truth vs forecast comparisons for accuracy tracking and drift detection';

-- =============================================================================
-- AI Policy Table (Current State)
-- =============================================================================
-- Stores current reorder policy parameters for each item
CREATE TABLE IF NOT EXISTS ai_policy (
    item_code TEXT PRIMARY KEY,
    reorder_point REAL NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    safety_stock REAL NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    eoq_factor REAL NOT NULL DEFAULT 1.0 CHECK (eoq_factor > 0),
    policy_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT CHECK (updated_by IN ('rl_agent', 'admin', 'system', 'drift_detector'))
);

CREATE INDEX IF NOT EXISTS idx_ai_policy_updated
    ON ai_policy(updated_at DESC);

COMMENT ON TABLE ai_policy IS 'Current reorder policy parameters optimized by RL agent';

-- =============================================================================
-- AI Policy History (Append-Only Audit)
-- =============================================================================
-- Tracks all policy changes with rationale and reward
CREATE TABLE IF NOT EXISTS ai_policy_history (
    id BIGSERIAL PRIMARY KEY,
    item_code TEXT NOT NULL,
    reorder_point REAL NOT NULL,
    safety_stock REAL NOT NULL,
    eoq_factor REAL NOT NULL,
    policy_version INTEGER NOT NULL,
    reward REAL,             -- RL reward from simulation
    reason TEXT,             -- 'drift_detected', 'rl_improvement', 'manual_override'
    updated_by TEXT,
    ts TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_policy_history_item
    ON ai_policy_history(item_code, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_policy_history_ts
    ON ai_policy_history(ts DESC);

COMMENT ON TABLE ai_policy_history IS 'Append-only audit log of all policy changes with rewards and rationale';

-- =============================================================================
-- AI Auto-Training Jobs Table
-- =============================================================================
-- Tracks automated retraining jobs triggered by drift detection
CREATE TABLE IF NOT EXISTS ai_autotrain_jobs (
    job_id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('drift', 'cron', 'manual')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    metrics JSONB,           -- {"mape": 12.5, "rmse": 5.2, "training_time": 18.3}
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_autotrain_item
    ON ai_autotrain_jobs(item_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_autotrain_status
    ON ai_autotrain_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_autotrain_trigger
    ON ai_autotrain_jobs(trigger);
CREATE INDEX IF NOT EXISTS idx_ai_autotrain_metrics
    ON ai_autotrain_jobs USING GIN (metrics) WHERE metrics IS NOT NULL;

COMMENT ON TABLE ai_autotrain_jobs IS 'Tracks automated retraining jobs triggered by drift detection or cron';

-- =============================================================================
-- Materialized View: Daily MAPE per Item
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_feedback_daily_rollup AS
SELECT
    item_code,
    date,
    AVG(mape) as avg_mape,
    AVG(rmse) as avg_rmse,
    COUNT(CASE WHEN forecast IS NOT NULL THEN 1 END) as forecast_count,
    COUNT(CASE WHEN actual IS NOT NULL THEN 1 END) as actual_count,
    MAX(created_at) as updated_at
FROM ai_feedback
GROUP BY item_code, date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_rollup_pk
    ON ai_feedback_daily_rollup(item_code, date);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_rollup_date
    ON ai_feedback_daily_rollup(date DESC);

COMMENT ON MATERIALIZED VIEW ai_feedback_daily_rollup IS 'Daily rollup of MAPE/RMSE per item for performance';

-- =============================================================================
-- Function: Refresh Rollup (Concurrent Safe)
-- =============================================================================
CREATE OR REPLACE FUNCTION refresh_ai_feedback_rollup()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY ai_feedback_daily_rollup;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_ai_feedback_rollup IS 'Refreshes daily MAPE rollup (call nightly via cron)';

-- =============================================================================
-- Trigger: Update Policy Timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_ai_policy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_policy_update_timestamp
BEFORE UPDATE ON ai_policy
FOR EACH ROW
EXECUTE FUNCTION update_ai_policy_timestamp();

-- =============================================================================
-- Row-Level Security (if enabled)
-- =============================================================================
-- ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ai_feedback_select ON ai_feedback FOR SELECT USING (true);
-- CREATE POLICY ai_feedback_insert ON ai_feedback FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Initial Data: Default Policies for Existing Items
-- =============================================================================
-- Insert default policies for items that don't have one yet
INSERT INTO ai_policy (item_code, reorder_point, safety_stock, eoq_factor, policy_version, updated_by)
SELECT
    item_code,
    COALESCE(par_level * 0.5, 10) as reorder_point,
    COALESCE(par_level * 0.2, 5) as safety_stock,
    1.0 as eoq_factor,
    1 as policy_version,
    'system' as updated_by
FROM item_master
WHERE item_code NOT IN (SELECT item_code FROM ai_policy)
ON CONFLICT (item_code) DO NOTHING;

-- =============================================================================
-- Version Tracking
-- =============================================================================
INSERT INTO schema_version (version, description, applied_at)
VALUES ('003_ai_feedback_2025-10-07', 'AI Feedback & Self-Optimization Engine', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO UPDATE SET
    description = EXCLUDED.description,
    applied_at = CURRENT_TIMESTAMP;

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Migration 003_ai_feedback_2025-10-07 applied successfully
