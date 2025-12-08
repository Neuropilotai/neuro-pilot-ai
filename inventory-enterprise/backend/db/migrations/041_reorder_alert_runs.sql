-- ============================================================================
-- Migration: 041_reorder_alert_runs.sql
-- P1 Hardening: Reorder Alerts - Alert Run Tracking Table
-- ============================================================================

-- Optional table to track reorder alert runs
-- If table doesn't exist, the service will gracefully skip logging

CREATE TABLE IF NOT EXISTS reorder_alert_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,  -- NULL for global runs
    items_checked INTEGER NOT NULL DEFAULT 0,
    alerts_generated INTEGER NOT NULL DEFAULT 0,
    run_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    metadata JSONB,
    
    CONSTRAINT fk_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reorder_alert_runs_org ON reorder_alert_runs(org_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_reorder_alert_runs_date ON reorder_alert_runs(run_at DESC);

-- Add comment
COMMENT ON TABLE reorder_alert_runs IS 'Tracks nightly reorder alert check runs for monitoring and auditing';

