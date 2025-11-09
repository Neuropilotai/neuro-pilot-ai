-- Migration 009: Menu Planning, Recipes, Vendors, Waste, Population
-- Idempotent: Safe to re-run
-- Purpose: Complete enterprise food service management

-- ============================================
-- VENDORS & PRICING
-- ============================================

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  payment_terms TEXT,
  lead_time_days INTEGER DEFAULT 3,
  minimum_order NUMERIC(10,2),
  preferred BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT vendors_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT vendors_org_name_unique UNIQUE(org_id, name),
  CONSTRAINT vendors_org_code_unique UNIQUE(org_id, code) WHERE code IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vendors_org_id ON vendors(org_id);
CREATE INDEX IF NOT EXISTS idx_vendors_preferred ON vendors(org_id, preferred) WHERE preferred = true;
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(org_id, active) WHERE active = true;

CREATE TABLE IF NOT EXISTS vendor_prices (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  price NUMERIC(10,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  uom TEXT,
  case_qty INTEGER,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'api', 'scrape')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT vendor_prices_vendor_fk FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT vendor_prices_positive_price CHECK (price >= 0),
  CONSTRAINT vendor_prices_valid_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_vendor_prices_vendor_id ON vendor_prices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_sku ON vendor_prices(sku);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_org_sku_valid ON vendor_prices(org_id, sku, valid_from DESC, valid_to DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_valid_from ON vendor_prices(valid_from DESC);

-- Org vendor preferences
CREATE TABLE IF NOT EXISTS org_vendor_defaults (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER,
  category TEXT,
  preferred_vendor_id INTEGER NOT NULL,
  fallback_vendor_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT org_vendor_defaults_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_vendor_defaults_vendor_fk FOREIGN KEY (preferred_vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT org_vendor_defaults_fallback_fk FOREIGN KEY (fallback_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  UNIQUE(org_id, site_id, category)
);

CREATE INDEX IF NOT EXISTS idx_org_vendor_defaults_org_site ON org_vendor_defaults(org_id, site_id);

-- ============================================
-- RECIPES
-- ============================================

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  yield_portions INTEGER NOT NULL,
  yield_uom TEXT DEFAULT 'servings',
  prep_loss_pct NUMERIC(5,2) DEFAULT 0 CHECK (prep_loss_pct >= 0 AND prep_loss_pct <= 100),
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  instructions TEXT,
  allergens JSONB DEFAULT '[]'::jsonb,
  nutrition JSONB DEFAULT '{}'::jsonb,
  category TEXT,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT,

  CONSTRAINT recipes_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT recipes_org_code_unique UNIQUE(org_id, code),
  CONSTRAINT recipes_positive_yield CHECK (yield_portions > 0)
);

CREATE INDEX IF NOT EXISTS idx_recipes_org_id ON recipes(org_id);
CREATE INDEX IF NOT EXISTS idx_recipes_org_site ON recipes(org_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(org_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_active ON recipes(org_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_recipes_code ON recipes(org_id, code);

CREATE TABLE IF NOT EXISTS recipe_items (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT,
  qty NUMERIC(10,3) NOT NULL,
  uom TEXT NOT NULL,
  prep_notes TEXT,
  optional BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT recipe_items_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT recipe_items_positive_qty CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_sku ON recipe_items(sku);
CREATE INDEX IF NOT EXISTS idx_recipe_items_org_recipe ON recipe_items(org_id, recipe_id);

-- Recipe cost snapshots
CREATE TABLE IF NOT EXISTS recipe_cost_snapshots (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  total_cost NUMERIC(10,4) NOT NULL,
  cost_per_portion NUMERIC(10,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  vendor_prices_used JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,
  notes TEXT,

  CONSTRAINT recipe_cost_snapshots_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_recipe ON recipe_cost_snapshots(recipe_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_org ON recipe_cost_snapshots(org_id);

-- ============================================
-- MENUS
-- ============================================

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cycle_week INTEGER NOT NULL CHECK (cycle_week BETWEEN 1 AND 52),
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,

  CONSTRAINT menus_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE,
  CONSTRAINT menus_valid_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_menus_org_site ON menus(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_menus_cycle_week ON menus(org_id, site_id, cycle_week);
CREATE INDEX IF NOT EXISTS idx_menus_status ON menus(org_id, site_id, status);

CREATE TABLE IF NOT EXISTS menu_days (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL,
  date DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT menu_days_menu_fk FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  UNIQUE(menu_id, date, meal)
);

CREATE INDEX IF NOT EXISTS idx_menu_days_menu_id ON menu_days(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_days_date ON menu_days(date);
CREATE INDEX IF NOT EXISTS idx_menu_days_meal ON menu_days(menu_id, meal);

CREATE TABLE IF NOT EXISTS menu_recipes (
  id SERIAL PRIMARY KEY,
  menu_day_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  portions INTEGER NOT NULL CHECK (portions > 0),
  actual_portions INTEGER,
  cost_snapshot_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT menu_recipes_menu_day_fk FOREIGN KEY (menu_day_id) REFERENCES menu_days(id) ON DELETE CASCADE,
  CONSTRAINT menu_recipes_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT,
  CONSTRAINT menu_recipes_cost_snapshot_fk FOREIGN KEY (cost_snapshot_id) REFERENCES recipe_cost_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_recipes_menu_day ON menu_recipes(menu_day_id);
CREATE INDEX IF NOT EXISTS idx_menu_recipes_recipe ON menu_recipes(recipe_id);

-- ============================================
-- POPULATION
-- ============================================

CREATE TABLE IF NOT EXISTS population (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  date DATE NOT NULL,
  breakfast INTEGER DEFAULT 0 CHECK (breakfast >= 0),
  lunch INTEGER DEFAULT 0 CHECK (lunch >= 0),
  dinner INTEGER DEFAULT 0 CHECK (dinner >= 0),
  snack INTEGER DEFAULT 0 CHECK (snack >= 0),
  total INTEGER GENERATED ALWAYS AS (breakfast + lunch + dinner + snack) STORED,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'api', 'projected')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT population_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE,
  UNIQUE(org_id, site_id, date)
);

CREATE INDEX IF NOT EXISTS idx_population_org_site ON population(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_population_date ON population(date DESC);
CREATE INDEX IF NOT EXISTS idx_population_org_site_date ON population(org_id, site_id, date DESC);

-- ============================================
-- WASTE LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS waste_reasons (
  id SERIAL PRIMARY KEY,
  org_id INTEGER,
  code TEXT NOT NULL,
  description TEXT,
  category TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT waste_reasons_org_code_unique UNIQUE(org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_waste_reasons_org ON waste_reasons(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waste_reasons_active ON waste_reasons(org_id, active) WHERE active = true;

-- Pre-populate standard reasons (org_id NULL = global defaults)
INSERT INTO waste_reasons (org_id, code, description, category) VALUES
  (NULL, 'spoilage', 'Spoilage/Expired', 'quality'),
  (NULL, 'overproduction', 'Overproduction', 'planning'),
  (NULL, 'plate_waste', 'Plate Waste', 'service'),
  (NULL, 'prep_trim', 'Prep Trim/Loss', 'preparation'),
  (NULL, 'damaged', 'Damaged/Contaminated', 'quality'),
  (NULL, 'recall', 'Recall/Withdrawal', 'safety'),
  (NULL, 'other', 'Other', 'misc')
ON CONFLICT (org_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sku', 'recipe')),
  ref TEXT NOT NULL,
  item_name TEXT,
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  uom TEXT NOT NULL,
  reason TEXT NOT NULL,
  subreason TEXT,
  category TEXT,
  location TEXT,
  unit_cost NUMERIC(10,4),
  total_cost NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  event_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logged_by TEXT,
  photo_url TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT waste_logs_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_waste_logs_org_site ON waste_logs(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_event_ts ON waste_logs(event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_waste_logs_reason ON waste_logs(org_id, reason);
CREATE INDEX IF NOT EXISTS idx_waste_logs_type_ref ON waste_logs(type, ref);
CREATE INDEX IF NOT EXISTS idx_waste_logs_org_site_event ON waste_logs(org_id, site_id, event_ts DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get current vendor price for SKU
CREATE OR REPLACE FUNCTION get_current_vendor_price(
  p_org_id INTEGER,
  p_sku TEXT,
  p_at_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  vendor_id INTEGER,
  vendor_name TEXT,
  price NUMERIC,
  currency TEXT,
  uom TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.name,
    vp.price,
    vp.currency,
    vp.uom
  FROM vendor_prices vp
  JOIN vendors v ON v.id = vp.vendor_id
  WHERE vp.org_id = p_org_id
    AND vp.sku = p_sku
    AND vp.valid_from <= p_at_date
    AND (vp.valid_to IS NULL OR vp.valid_to >= p_at_date)
  ORDER BY v.preferred DESC, vp.valid_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Calculate recipe cost
CREATE OR REPLACE FUNCTION calculate_recipe_cost(
  p_recipe_id INTEGER,
  p_at_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_cost NUMERIC,
  cost_per_portion NUMERIC,
  items_costed INTEGER,
  items_missing_price INTEGER
) AS $$
DECLARE
  v_org_id INTEGER;
  v_yield INTEGER;
  v_prep_loss NUMERIC;
  v_total NUMERIC := 0;
  v_costed INTEGER := 0;
  v_missing INTEGER := 0;
  v_item RECORD;
  v_price RECORD;
BEGIN
  -- Get recipe details
  SELECT org_id, yield_portions, prep_loss_pct
  INTO v_org_id, v_yield, v_prep_loss
  FROM recipes
  WHERE id = p_recipe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found: %', p_recipe_id;
  END IF;

  -- Calculate cost for each ingredient
  FOR v_item IN
    SELECT sku, qty
    FROM recipe_items
    WHERE recipe_id = p_recipe_id
  LOOP
    SELECT * INTO v_price
    FROM get_current_vendor_price(v_org_id, v_item.sku, p_at_date);

    IF v_price.price IS NOT NULL THEN
      v_total := v_total + (v_item.qty * v_price.price);
      v_costed := v_costed + 1;
    ELSE
      v_missing := v_missing + 1;
    END IF;
  END LOOP;

  -- Apply prep loss
  IF v_prep_loss > 0 THEN
    v_total := v_total * (1 + v_prep_loss / 100.0);
  END IF;

  RETURN QUERY SELECT
    v_total,
    CASE WHEN v_yield > 0 THEN v_total / v_yield ELSE 0 END,
    v_costed,
    v_missing;
END;
$$ LANGUAGE plpgsql;

-- Update recipe updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendor_prices_updated_at BEFORE UPDATE ON vendor_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER menus_updated_at BEFORE UPDATE ON menus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER population_updated_at BEFORE UPDATE ON population
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE vendors IS 'V21.1: Vendor master data';
COMMENT ON TABLE vendor_prices IS 'V21.1: Vendor pricing with effective dating';
COMMENT ON TABLE recipes IS 'V21.1: Recipe master with yield and prep loss';
COMMENT ON TABLE recipe_items IS 'V21.1: Recipe ingredients (bill of materials)';
COMMENT ON TABLE recipe_cost_snapshots IS 'V21.1: Historical recipe costing';
COMMENT ON TABLE menus IS 'V21.1: Menu cycles (4-week planning)';
COMMENT ON TABLE menu_days IS 'V21.1: Individual menu days with meals';
COMMENT ON TABLE menu_recipes IS 'V21.1: Recipes assigned to menu days';
COMMENT ON TABLE population IS 'V21.1: Daily headcount by meal for scaling';
COMMENT ON TABLE waste_logs IS 'V21.1: Waste tracking with auto-cost';
COMMENT ON TABLE waste_reasons IS 'V21.1: Standardized waste reason codes';
