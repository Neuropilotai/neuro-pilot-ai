-- ============================================
-- Migration 036: inventory_reconcile_detail View
-- NeuroPilot AI Enterprise v23.4.3
-- ============================================
-- Creates a compatibility view for FinancialAccuracy.js
-- which expects inventory_reconcile_detail but the actual
-- table is inventory_reconcile_diffs from migration 019.
-- ============================================

-- ============================================
-- STEP 1: Ensure inventory_reconcile_runs exists (PostgreSQL version)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_reconcile_runs (
    id SERIAL PRIMARY KEY,
    reconcile_id VARCHAR(100) NOT NULL UNIQUE,
    org_id VARCHAR(255) DEFAULT 'default-org',
    as_of_date DATE NOT NULL,
    physical_count_id INTEGER,
    locations JSONB DEFAULT '["*"]'::jsonb,
    total_items_checked INTEGER DEFAULT 0,
    total_variance_qty DECIMAL(12,4) DEFAULT 0.0,
    total_variance_value DECIMAL(12,4) DEFAULT 0.0,
    over_items INTEGER DEFAULT 0,
    short_items INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    artifacts_path TEXT,
    summary_csv_path TEXT,
    triggered_by VARCHAR(255),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconcile_runs_id ON inventory_reconcile_runs(reconcile_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_date ON inventory_reconcile_runs(as_of_date);
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_status ON inventory_reconcile_runs(status);
CREATE INDEX IF NOT EXISTS idx_reconcile_runs_org ON inventory_reconcile_runs(org_id);

-- ============================================
-- STEP 2: Ensure inventory_reconcile_diffs exists (PostgreSQL version)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_reconcile_diffs (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES inventory_reconcile_runs(id) ON DELETE CASCADE,
    org_id VARCHAR(255) DEFAULT 'default-org',
    item_code VARCHAR(100) NOT NULL,
    item_name TEXT,
    location_code VARCHAR(100),
    physical_qty DECIMAL(12,4) DEFAULT 0.0,
    system_qty DECIMAL(12,4) DEFAULT 0.0,
    variance_qty DECIMAL(12,4) DEFAULT 0.0,
    uom VARCHAR(50),
    unit_cost DECIMAL(12,4),
    variance_value DECIMAL(12,4) DEFAULT 0.0,
    variance_pct DECIMAL(8,4),
    category VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_run ON inventory_reconcile_diffs(run_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_item ON inventory_reconcile_diffs(item_code);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_category ON inventory_reconcile_diffs(category);
CREATE INDEX IF NOT EXISTS idx_reconcile_diffs_org ON inventory_reconcile_diffs(org_id);

-- ============================================
-- STEP 3: Create inventory_reconcile_detail VIEW
-- Maps to inventory_reconcile_diffs with the columns
-- expected by FinancialAccuracy.js
-- ============================================
CREATE OR REPLACE VIEW inventory_reconcile_detail AS
SELECT
    d.id,
    r.reconcile_id,
    d.run_id,
    d.org_id,
    d.item_code,
    d.item_name,
    d.location_code,
    d.physical_qty,
    d.system_qty,
    d.variance_qty,
    d.uom AS unit,
    d.unit_cost,
    d.variance_value,
    d.variance_pct,
    d.category,
    d.notes,
    d.created_at
FROM inventory_reconcile_diffs d
JOIN inventory_reconcile_runs r ON d.run_id = r.id;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('036_inventory_reconcile_detail_view.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 036_inventory_reconcile_detail_view.sql completed successfully' AS result;
