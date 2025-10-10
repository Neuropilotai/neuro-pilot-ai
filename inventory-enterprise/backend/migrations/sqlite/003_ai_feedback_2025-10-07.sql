-- Migration: AI Feedback & Self-Optimization Engine
-- Version: v2.2.0-2025-10-07
-- Description: Adds tables for AI feedback loop, auto-retraining, and RL policy optimization
-- Database: SQLite

-- =============================================================================
-- AI Feedback Table
-- =============================================================================
-- Stores ground truth vs forecast comparisons for accuracy tracking
CREATE TABLE IF NOT EXISTS ai_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL,
    date DATE NOT NULL,
    forecast REAL,
    actual REAL,
    mape REAL,           -- Mean Absolute Percentage Error
    rmse REAL,           -- Root Mean Square Error
    source TEXT,         -- 'sales', 'invoice', 'stock_count', 'order_fulfillment'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_code, date, source)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_item_date
    ON ai_feedback(item_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created
    ON ai_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_mape
    ON ai_feedback(mape) WHERE mape IS NOT NULL;

-- =============================================================================
-- AI Policy Table (Current State)
-- =============================================================================
-- Stores current reorder policy parameters for each item
CREATE TABLE IF NOT EXISTS ai_policy (
    item_code TEXT PRIMARY KEY,
    reorder_point REAL NOT NULL DEFAULT 0,
    safety_stock REAL NOT NULL DEFAULT 0,
    eoq_factor REAL NOT NULL DEFAULT 1.0,
    policy_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,         -- 'rl_agent', 'admin', 'system'
    FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_policy_updated
    ON ai_policy(updated_at DESC);

-- =============================================================================
-- AI Policy History (Append-Only Audit)
-- =============================================================================
-- Tracks all policy changes with rationale and reward
CREATE TABLE IF NOT EXISTS ai_policy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL,
    reorder_point REAL NOT NULL,
    safety_stock REAL NOT NULL,
    eoq_factor REAL NOT NULL,
    policy_version INTEGER NOT NULL,
    reward REAL,             -- RL reward from simulation
    reason TEXT,             -- 'drift_detected', 'rl_improvement', 'manual_override'
    updated_by TEXT,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_policy_history_item
    ON ai_policy_history(item_code, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_policy_history_ts
    ON ai_policy_history(ts DESC);

-- =============================================================================
-- AI Auto-Training Jobs Table
-- =============================================================================
-- Tracks automated retraining jobs triggered by drift detection
CREATE TABLE IF NOT EXISTS ai_autotrain_jobs (
    job_id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    trigger TEXT NOT NULL,  -- 'drift', 'cron', 'manual'
    status TEXT NOT NULL,    -- 'pending', 'running', 'success', 'failed'
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    metrics TEXT,            -- JSON: {"mape": 12.5, "rmse": 5.2, "training_time": 18.3}
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_autotrain_item
    ON ai_autotrain_jobs(item_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_autotrain_status
    ON ai_autotrain_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_autotrain_trigger
    ON ai_autotrain_jobs(trigger);

-- =============================================================================
-- Materialized View: Daily MAPE per Item (Approximation)
-- =============================================================================
-- SQLite doesn't support materialized views, so we use a table with periodic refresh
CREATE TABLE IF NOT EXISTS ai_feedback_daily_rollup (
    item_code TEXT NOT NULL,
    date DATE NOT NULL,
    avg_mape REAL,
    avg_rmse REAL,
    forecast_count INTEGER,
    actual_count INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_code, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_rollup_date
    ON ai_feedback_daily_rollup(date DESC);

-- =============================================================================
-- Trigger: Update Policy Timestamp
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS ai_policy_update_timestamp
AFTER UPDATE ON ai_policy
FOR EACH ROW
BEGIN
    UPDATE ai_policy SET updated_at = CURRENT_TIMESTAMP WHERE item_code = NEW.item_code;
END;

-- =============================================================================
-- Initial Data: Default Policies for Existing Items
-- =============================================================================
-- Insert default policies for items that don't have one yet
INSERT OR IGNORE INTO ai_policy (item_code, reorder_point, safety_stock, eoq_factor, policy_version, updated_by)
SELECT
    item_code,
    COALESCE(par_level * 0.5, 10) as reorder_point,
    COALESCE(par_level * 0.2, 5) as safety_stock,
    1.0 as eoq_factor,
    1 as policy_version,
    'system' as updated_by
FROM item_master
WHERE item_code NOT IN (SELECT item_code FROM ai_policy);

-- =============================================================================
-- Version Tracking
-- =============================================================================
INSERT OR REPLACE INTO schema_version (version, description, applied_at)
VALUES ('003_ai_feedback_2025-10-07', 'AI Feedback & Self-Optimization Engine', CURRENT_TIMESTAMP);

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Migration 003_ai_feedback_2025-10-07 applied successfully
