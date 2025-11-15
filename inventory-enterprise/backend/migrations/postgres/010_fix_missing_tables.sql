-- Fix missing tables and schema mismatches for V21.1
-- Addresses API 500 errors from population, recipes, vendors routes

-- ============================================================================
-- POPULATION TABLE (missing from 009)
-- ============================================================================

CREATE TABLE IF NOT EXISTS population (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),
  date DATE NOT NULL,
  breakfast INTEGER DEFAULT 0,
  lunch INTEGER DEFAULT 0,
  dinner INTEGER DEFAULT 0,
  total INTEGER GENERATED ALWAYS AS (breakfast + lunch + dinner) STORED,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, date)
);

CREATE INDEX IF NOT EXISTS idx_population_org_site ON population(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_population_date ON population(date DESC);

-- ============================================================================
-- RECIPE COST SNAPSHOTS TABLE (missing from 009)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recipe_cost_snapshots (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  items_costed INTEGER DEFAULT 0,
  items_missing_price INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_recipe ON recipe_cost_snapshots(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_created ON recipe_cost_snapshots(created_at DESC);

-- ============================================================================
-- FIX VENDOR_PRICES SCHEMA MISMATCH
-- ============================================================================

-- Add missing columns to vendor_prices if they don't exist
DO $$
BEGIN
  -- Add 'price' column as alias for unit_price (routes expect 'price')
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'price') THEN
    ALTER TABLE vendor_prices ADD COLUMN price DECIMAL(10,2);
    UPDATE vendor_prices SET price = unit_price WHERE price IS NULL;
  END IF;

  -- Add 'valid_from' column (routes expect this instead of effective_date)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'valid_from') THEN
    ALTER TABLE vendor_prices ADD COLUMN valid_from DATE;
    UPDATE vendor_prices SET valid_from = effective_date WHERE valid_from IS NULL;
  END IF;

  -- Add 'valid_to' column (routes expect this instead of end_date)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'valid_to') THEN
    ALTER TABLE vendor_prices ADD COLUMN valid_to DATE;
    UPDATE vendor_prices SET valid_to = end_date WHERE valid_to IS NULL;
  END IF;

  -- Add 'currency' column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'currency') THEN
    ALTER TABLE vendor_prices ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
  END IF;

  -- Add 'uom' column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'uom') THEN
    ALTER TABLE vendor_prices ADD COLUMN uom VARCHAR(50) DEFAULT 'EA';
  END IF;

  -- Add 'source' column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'source') THEN
    ALTER TABLE vendor_prices ADD COLUMN source VARCHAR(100);
  END IF;

  -- Add 'imported_by' column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'vendor_prices' AND column_name = 'imported_by') THEN
    ALTER TABLE vendor_prices ADD COLUMN imported_by VARCHAR(255);
  END IF;
END $$;

-- ============================================================================
-- FIX FUNCTION SIGNATURES TO MATCH ROUTE USAGE
-- ============================================================================

-- Drop and recreate get_current_vendor_price with correct signature
-- Routes call it as: get_current_vendor_price(org_id, sku, date)
DROP FUNCTION IF EXISTS get_current_vendor_price(INTEGER, VARCHAR, DATE);
DROP FUNCTION IF EXISTS get_current_vendor_price(VARCHAR, VARCHAR, DATE);

CREATE OR REPLACE FUNCTION get_current_vendor_price(
  p_org_id VARCHAR,
  p_sku VARCHAR,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  vendor_id INTEGER,
  vendor_name VARCHAR,
  sku VARCHAR,
  price DECIMAL,
  currency VARCHAR,
  uom VARCHAR,
  valid_from DATE,
  valid_to DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.vendor_id,
    v.name::VARCHAR,
    vp.sku::VARCHAR,
    COALESCE(vp.price, vp.unit_price)::DECIMAL,
    COALESCE(vp.currency, 'USD')::VARCHAR,
    COALESCE(vp.uom, 'EA')::VARCHAR,
    COALESCE(vp.valid_from, vp.effective_date)::DATE,
    COALESCE(vp.valid_to, vp.end_date)::DATE
  FROM vendor_prices vp
  JOIN vendors v ON v.id = vp.vendor_id
  WHERE vp.org_id = p_org_id
    AND vp.sku = p_sku
    AND COALESCE(vp.valid_from, vp.effective_date) <= p_date
    AND (COALESCE(vp.valid_to, vp.end_date) IS NULL OR COALESCE(vp.valid_to, vp.end_date) >= p_date)
  ORDER BY v.preferred DESC, COALESCE(vp.valid_from, vp.effective_date) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate calculate_recipe_cost to work without 'item' table
DROP FUNCTION IF EXISTS calculate_recipe_cost(INTEGER, DATE);

CREATE OR REPLACE FUNCTION calculate_recipe_cost(
  p_recipe_id INTEGER,
  p_cost_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  recipe_id INTEGER,
  recipe_name VARCHAR,
  total_cost DECIMAL,
  cost_per_portion DECIMAL,
  items_costed INTEGER,
  items_missing_price INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH ingredient_costs AS (
    SELECT
      ri.id,
      ri.item_sku,
      ri.qty,
      ri.uom,
      vp.price,
      (ri.qty * COALESCE(vp.price, 0)) AS line_cost,
      CASE WHEN vp.price IS NULL THEN 1 ELSE 0 END AS is_missing
    FROM recipe_items ri
    LEFT JOIN LATERAL (
      SELECT price FROM get_current_vendor_price(
        (SELECT org_id FROM recipes WHERE id = p_recipe_id),
        ri.item_sku,
        p_cost_date
      )
    ) vp ON true
    WHERE ri.recipe_id = p_recipe_id
  )
  SELECT
    r.id::INTEGER,
    r.name::VARCHAR,
    COALESCE(SUM(ic.line_cost), 0)::DECIMAL AS total_cost,
    CASE
      WHEN r.yield_qty > 0 THEN (COALESCE(SUM(ic.line_cost), 0) / r.yield_qty)::DECIMAL
      ELSE 0::DECIMAL
    END AS cost_per_portion,
    COUNT(ic.id)::INTEGER AS items_costed,
    SUM(ic.is_missing)::INTEGER AS items_missing_price
  FROM recipes r
  LEFT JOIN ingredient_costs ic ON true
  WHERE r.id = p_recipe_id
  GROUP BY r.id, r.name, r.yield_qty;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETE
-- ============================================================================
