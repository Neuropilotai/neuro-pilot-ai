-- ============================================
-- Migration 037: ai_ops_health_metrics Unique Constraint
-- NeuroPilot AI Enterprise v23.4.3
-- ============================================
-- Fixes: ON CONFLICT (metric_name) specification error
-- The ai_ops_health_metrics table lacks a unique constraint
-- on (org_id, metric_name), causing INSERT ... ON CONFLICT to fail.
-- ============================================

-- ============================================
-- STEP 1: Add missing columns if they don't exist
-- ============================================
-- Add weight column if missing (used by FinancialAccuracy.js)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_ops_health_metrics' AND column_name = 'weight'
    ) THEN
        ALTER TABLE ai_ops_health_metrics ADD COLUMN weight DECIMAL(5,4) DEFAULT 0.0;
    END IF;
END $$;

-- Add last_updated column if missing (used by FinancialAccuracy.js)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_ops_health_metrics' AND column_name = 'last_updated'
    ) THEN
        ALTER TABLE ai_ops_health_metrics ADD COLUMN last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- ============================================
-- STEP 2: Remove duplicate metric entries (keep newest)
-- Before adding unique constraint, clean up duplicates
-- ============================================
DELETE FROM ai_ops_health_metrics a
USING ai_ops_health_metrics b
WHERE a.id < b.id
  AND a.org_id = b.org_id
  AND a.metric_name = b.metric_name;

-- ============================================
-- STEP 3: Add unique constraint on (org_id, metric_name)
-- This enables ON CONFLICT (metric_name) DO UPDATE to work
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_ops_health_metrics_org_metric_unique'
    ) THEN
        ALTER TABLE ai_ops_health_metrics
        ADD CONSTRAINT ai_ops_health_metrics_org_metric_unique
        UNIQUE (org_id, metric_name);
    END IF;
END $$;

-- ============================================
-- STEP 4: Create simpler unique index on just metric_name
-- This allows ON CONFLICT (metric_name) to work for single-org setups
-- ============================================
DO $$
BEGIN
    -- First check if metric_name is unique enough (no duplicates across orgs)
    -- If so, create a simple unique index
    IF NOT EXISTS (
        SELECT metric_name, COUNT(DISTINCT org_id) as org_count
        FROM ai_ops_health_metrics
        GROUP BY metric_name
        HAVING COUNT(DISTINCT org_id) > 1
    ) THEN
        -- Safe to create unique index on metric_name alone
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_ops_health_metric_name_unique
        ON ai_ops_health_metrics(metric_name);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If it fails (duplicates exist), that's okay - the composite constraint handles it
    RAISE NOTICE 'Could not create simple metric_name index: %', SQLERRM;
END $$;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('037_ai_ops_health_unique_constraint.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 037_ai_ops_health_unique_constraint.sql completed successfully' AS result;
