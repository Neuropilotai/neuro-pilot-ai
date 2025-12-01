-- ============================================
-- Migration 021: Population (Headcount) Table
-- NeuroPilot AI Enterprise V22.2
--
-- Required for /api/population routes
-- Daily headcount tracking by meal for planning
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. POPULATION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS population (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),
  date DATE NOT NULL,

  -- Meal counts
  breakfast INTEGER DEFAULT 0,
  lunch INTEGER DEFAULT 0,
  dinner INTEGER DEFAULT 0,

  -- Computed total (generated column)
  total INTEGER GENERATED ALWAYS AS (COALESCE(breakfast, 0) + COALESCE(lunch, 0) + COALESCE(dinner, 0)) STORED,

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),

  -- Unique constraint for upsert support
  UNIQUE(org_id, site_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_population_org ON population(org_id);
CREATE INDEX IF NOT EXISTS idx_population_org_site ON population(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_population_date ON population(date DESC);
CREATE INDEX IF NOT EXISTS idx_population_org_date ON population(org_id, date);

-- ============================================
-- 2. TRIGGER FOR updated_at
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_population_updated') THEN
    CREATE TRIGGER tr_population_updated
      BEFORE UPDATE ON population
      FOR EACH ROW EXECUTE FUNCTION trigger_update_timestamp();
  END IF;
END $$;

-- ============================================
-- 3. COMMENTS
-- ============================================

COMMENT ON TABLE population IS 'V22.2 Daily headcount tracking by meal for planning';
COMMENT ON COLUMN population.breakfast IS 'Number of people for breakfast service';
COMMENT ON COLUMN population.lunch IS 'Number of people for lunch service';
COMMENT ON COLUMN population.dinner IS 'Number of people for dinner service';
COMMENT ON COLUMN population.total IS 'Auto-computed total of all meals';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 021: Population Table - COMPLETE';
END $$;
