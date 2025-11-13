-- Add missing V21.1 tables for vendors, recipes, waste
-- These tables are required by the V21.1 API routes

-- ============================================================================
-- VENDORS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(100) DEFAULT 'Canada',
  payment_terms VARCHAR(100),
  lead_time_days INTEGER DEFAULT 7,
  notes TEXT,
  preferred BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_org_site ON vendors(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(active);
CREATE INDEX IF NOT EXISTS idx_vendors_preferred ON vendors(preferred);

CREATE TABLE IF NOT EXISTS vendor_prices (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  sku VARCHAR(255) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_size VARCHAR(50),
  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  UNIQUE(vendor_id, org_id, sku, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_vendor_prices_vendor ON vendor_prices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_item ON vendor_prices(sku);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_current ON vendor_prices(is_current, effective_date);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_updated ON vendor_prices(updated_at);

-- ============================================================================
-- RECIPES TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  yield_qty DECIMAL(10,2) DEFAULT 1,
  yield_uom VARCHAR(50) DEFAULT 'serving',
  prep_loss_pct DECIMAL(5,2) DEFAULT 0,
  allergens TEXT DEFAULT '[]',
  nutrition TEXT DEFAULT '{}',
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE(org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_recipes_org_site ON recipes(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_recipes_active ON recipes(active);
CREATE INDEX IF NOT EXISTS idx_recipes_code ON recipes(code);

CREATE TABLE IF NOT EXISTS recipe_items (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL,
  item_sku VARCHAR(255) NOT NULL,
  qty DECIMAL(10,4) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_item ON recipe_items(item_sku);

-- ============================================================================
-- WASTE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS waste_reasons (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, reason)
);

CREATE INDEX IF NOT EXISTS idx_waste_reasons_category ON waste_reasons(category);
CREATE INDEX IF NOT EXISTS idx_waste_reasons_active ON waste_reasons(is_active);

-- Default waste reasons
INSERT INTO waste_reasons (category, reason, description) VALUES
  ('spoilage', 'Expired', 'Item past expiration date'),
  ('spoilage', 'Damaged', 'Physical damage to item'),
  ('spoilage', 'Temperature', 'Temperature abuse'),
  ('preparation', 'Over Production', 'Prepared too much'),
  ('preparation', 'Trim Waste', 'Normal preparation waste'),
  ('preparation', 'Cooking Error', 'Mistake during preparation'),
  ('service', 'Customer Return', 'Returned by customer'),
  ('service', 'Presentation', 'Does not meet quality standards'),
  ('other', 'Contamination', 'Cross-contamination or foreign object'),
  ('other', 'Other', 'Other unspecified reason')
ON CONFLICT (category, reason) DO NOTHING;

CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),
  event_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  item_sku VARCHAR(255),
  recipe_id INTEGER,
  qty DECIMAL(10,4) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  reason_id INTEGER NOT NULL,
  cost_at_event DECIMAL(10,2) DEFAULT 0,
  logged_by VARCHAR(255),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reason_id) REFERENCES waste_reasons(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
  CHECK (item_sku IS NOT NULL OR recipe_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_waste_logs_org_site ON waste_logs(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_item ON waste_logs(item_sku);
CREATE INDEX IF NOT EXISTS idx_waste_logs_recipe ON waste_logs(recipe_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_timestamp ON waste_logs(event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_waste_logs_reason ON waste_logs(reason_id);

-- ============================================================================
-- FUNCTIONS FOR RECIPE COSTING (referenced by recipes route)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_recipe_cost(
  p_recipe_id INTEGER,
  p_cost_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  recipe_id INTEGER,
  recipe_name VARCHAR,
  total_cost DECIMAL,
  cost_per_yield DECIMAL,
  item_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    COALESCE(SUM(ri.qty * COALESCE(i.unit_cost, 0)), 0) AS total_cost,
    CASE
      WHEN r.yield_qty > 0 THEN
        COALESCE(SUM(ri.qty * COALESCE(i.unit_cost, 0)), 0) / r.yield_qty
      ELSE 0
    END AS cost_per_yield,
    COUNT(ri.id)::INTEGER AS item_count
  FROM recipes r
  LEFT JOIN recipe_items ri ON r.id = ri.recipe_id
  LEFT JOIN item i ON ri.item_sku = i.item_number
  WHERE r.id = p_recipe_id
  GROUP BY r.id, r.name, r.yield_qty;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS FOR VENDOR PRICING (referenced by vendors route)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_vendor_price(
  p_vendor_id INTEGER,
  p_sku VARCHAR,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  vendor_id INTEGER,
  sku VARCHAR,
  unit_price DECIMAL,
  unit_size VARCHAR,
  effective_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.vendor_id,
    vp.sku,
    vp.unit_price,
    vp.unit_size,
    vp.effective_date
  FROM vendor_prices vp
  WHERE vp.vendor_id = p_vendor_id
    AND vp.sku = p_sku
    AND vp.effective_date <= p_date
    AND (vp.end_date IS NULL OR vp.end_date >= p_date)
    AND vp.is_current = TRUE
  ORDER BY vp.effective_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETE
-- ============================================================================
