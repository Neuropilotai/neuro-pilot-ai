-- Migration 015: Menu Beverage Learning & Daily Predictive Demand
-- Version: v6.7
-- Date: 2025-10-10
-- Owner: David Mikulis
--
-- Purpose: Add breakfast + beverage forecasting, population-based scaling,
-- and AI learning from owner free-text comments

-- =====================================================================
-- TABLE: ai_feedback_comments
-- Store owner free-text hints for AI learning
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_feedback_comments (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_text TEXT NOT NULL,
  parsed_intent TEXT,                    -- e.g., 'set_coffee_per_person', 'adjust_breakfast_qty'
  parsed_item_code TEXT,                 -- e.g., 'COFFEE-GROUNDS-001'
  parsed_value REAL,                     -- e.g., 1.3 for "coffee 1.3 cups/person"
  parsed_unit TEXT,                      -- e.g., 'cups', 'oz', 'g', 'ea'
  applied INTEGER DEFAULT 0,             -- 0 = pending, 1 = applied to models
  applied_at TIMESTAMP,
  comment_source TEXT DEFAULT 'owner_console',
  tenant_id TEXT,
  user_email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_applied ON ai_feedback_comments(applied, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_item ON ai_feedback_comments(parsed_item_code, applied);

-- =====================================================================
-- TABLE: site_population
-- Store daily site population and demographic segments
-- =====================================================================

CREATE TABLE IF NOT EXISTS site_population (
  population_id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date DATE NOT NULL UNIQUE,
  total_count INTEGER NOT NULL DEFAULT 250,
  indian_count INTEGER NOT NULL DEFAULT 20,
  beverages_profile TEXT,                -- JSON: {"coffee_cups_per_person": 1.3, ...}
  breakfast_profile TEXT,                -- JSON: {"bread_slices_per_person": 2.5, ...}
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_population_date ON site_population(effective_date DESC);

-- Seed default population for today
INSERT OR IGNORE INTO site_population (
  effective_date,
  total_count,
  indian_count,
  beverages_profile,
  breakfast_profile,
  notes
) VALUES (
  DATE('now'),
  250,
  20,
  json_object(
    'coffee_cups_per_person', 1.3,
    'coffee_cup_size_oz', 8,
    'coffee_grounds_g_per_cup', 10,
    'creamer_oz_per_cup', 0.5,
    'milk_oz_per_person', 4,
    'tea_bags_per_person', 0.3,
    'orange_juice_oz_per_person', 6,
    'apple_juice_oz_per_person', 4
  ),
  json_object(
    'bread_slices_per_person', 2.5,
    'eggs_per_person', 1.2,
    'bacon_strips_per_person', 2.0,
    'ham_slices_per_person', 1.5,
    'bologna_slices_per_person', 1.0,
    'sausage_links_per_person', 1.5,
    'butter_pats_per_person', 2,
    'jam_packets_per_person', 1
  ),
  'Default population - adjust as needed'
);

-- =====================================================================
-- TABLE: item_alias_map
-- Map common beverage/breakfast names to inventory SKUs
-- =====================================================================

CREATE TABLE IF NOT EXISTS item_alias_map (
  alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_name TEXT NOT NULL UNIQUE,       -- e.g., 'coffee', 'creamer', 'eggs'
  item_code TEXT NOT NULL,               -- e.g., 'COFFEE-GROUNDS-001'
  category TEXT,                         -- 'beverage', 'breakfast', 'lunch'
  conversion_factor REAL DEFAULT 1.0,    -- For unit conversions
  conversion_unit TEXT,                  -- 'g', 'oz', 'ea'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_item_alias_name ON item_alias_map(alias_name);
CREATE INDEX IF NOT EXISTS idx_item_alias_category ON item_alias_map(category);

-- Seed common beverage/breakfast aliases
INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit) VALUES
  ('coffee', 'COFFEE-GROUNDS', 'beverage', 1.0, 'g'),
  ('creamer', 'COFFEE-CREAMER', 'beverage', 1.0, 'oz'),
  ('milk', 'MILK-WHOLE', 'beverage', 1.0, 'oz'),
  ('tea', 'TEA-BAGS', 'beverage', 1.0, 'ea'),
  ('orange_juice', 'ORANGE-JUICE', 'beverage', 1.0, 'oz'),
  ('apple_juice', 'APPLE-JUICE', 'beverage', 1.0, 'oz'),
  ('bread', 'BREAD-WHITE', 'breakfast', 1.0, 'slices'),
  ('eggs', 'EGGS-LARGE', 'breakfast', 1.0, 'ea'),
  ('bacon', 'BACON-STRIPS', 'breakfast', 1.0, 'ea'),
  ('ham', 'HAM-SLICES', 'breakfast', 1.0, 'ea'),
  ('bologna', 'BOLOGNA-SLICES', 'breakfast', 1.0, 'ea'),
  ('sausage', 'SAUSAGE-LINKS', 'breakfast', 1.0, 'ea'),
  ('butter', 'BUTTER-PATS', 'breakfast', 1.0, 'ea'),
  ('jam', 'JAM-PACKETS', 'breakfast', 1.0, 'ea');

-- =====================================================================
-- VIEW: v_breakfast_demand_today_v2
-- Population-based breakfast demand for today
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_breakfast_demand_today_v2 AS
SELECT
  sp.effective_date as demand_date,
  sp.total_count as total_population,
  sp.indian_count,
  json_extract(sp.breakfast_profile, '$.bread_slices_per_person') as bread_slices_per_person,
  json_extract(sp.breakfast_profile, '$.eggs_per_person') as eggs_per_person,
  json_extract(sp.breakfast_profile, '$.bacon_strips_per_person') as bacon_strips_per_person,
  json_extract(sp.breakfast_profile, '$.ham_slices_per_person') as ham_slices_per_person,
  json_extract(sp.breakfast_profile, '$.bologna_slices_per_person') as bologna_slices_per_person,
  json_extract(sp.breakfast_profile, '$.sausage_links_per_person') as sausage_links_per_person,
  json_extract(sp.breakfast_profile, '$.butter_pats_per_person') as butter_pats_per_person,
  json_extract(sp.breakfast_profile, '$.jam_packets_per_person') as jam_packets_per_person,

  -- Calculate total demands (population × per-person rate)
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.bread_slices_per_person'), 1) as bread_demand_slices,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.eggs_per_person'), 1) as eggs_demand_ea,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.bacon_strips_per_person'), 1) as bacon_demand_strips,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.ham_slices_per_person'), 1) as ham_demand_slices,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.bologna_slices_per_person'), 1) as bologna_demand_slices,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.sausage_links_per_person'), 1) as sausage_demand_links,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.butter_pats_per_person'), 1) as butter_demand_pats,
  ROUND(sp.total_count * json_extract(sp.breakfast_profile, '$.jam_packets_per_person'), 1) as jam_demand_packets
FROM site_population sp
WHERE sp.effective_date = DATE('now')
LIMIT 1;

-- =====================================================================
-- VIEW: v_beverage_demand_today_v1
-- Population-based beverage demand for today
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_beverage_demand_today_v1 AS
SELECT
  sp.effective_date as demand_date,
  sp.total_count as total_population,
  sp.indian_count,

  -- Coffee
  json_extract(sp.beverages_profile, '$.coffee_cups_per_person') as coffee_cups_per_person,
  json_extract(sp.beverages_profile, '$.coffee_cup_size_oz') as coffee_cup_size_oz,
  json_extract(sp.beverages_profile, '$.coffee_grounds_g_per_cup') as coffee_grounds_g_per_cup,
  ROUND(sp.total_count *
        json_extract(sp.beverages_profile, '$.coffee_cups_per_person') *
        json_extract(sp.beverages_profile, '$.coffee_grounds_g_per_cup'), 1) as coffee_demand_g,

  -- Creamer
  json_extract(sp.beverages_profile, '$.creamer_oz_per_cup') as creamer_oz_per_cup,
  ROUND(sp.total_count *
        json_extract(sp.beverages_profile, '$.coffee_cups_per_person') *
        json_extract(sp.beverages_profile, '$.creamer_oz_per_cup'), 1) as creamer_demand_oz,

  -- Milk
  json_extract(sp.beverages_profile, '$.milk_oz_per_person') as milk_oz_per_person,
  ROUND(sp.total_count * json_extract(sp.beverages_profile, '$.milk_oz_per_person'), 1) as milk_demand_oz,

  -- Tea
  json_extract(sp.beverages_profile, '$.tea_bags_per_person') as tea_bags_per_person,
  ROUND(sp.total_count * json_extract(sp.beverages_profile, '$.tea_bags_per_person'), 1) as tea_demand_bags,

  -- Orange Juice
  json_extract(sp.beverages_profile, '$.orange_juice_oz_per_person') as orange_juice_oz_per_person,
  ROUND(sp.total_count * json_extract(sp.beverages_profile, '$.orange_juice_oz_per_person'), 1) as orange_juice_demand_oz,

  -- Apple Juice
  json_extract(sp.beverages_profile, '$.apple_juice_oz_per_person') as apple_juice_oz_per_person,
  ROUND(sp.total_count * json_extract(sp.beverages_profile, '$.apple_juice_oz_per_person'), 1) as apple_juice_demand_oz
FROM site_population sp
WHERE sp.effective_date = DATE('now')
LIMIT 1;

-- =====================================================================
-- VIEW: v_menu_demand_today_v2
-- Extended menu demand with breakfast + beverages
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_menu_demand_today_v2 AS
SELECT
  mc.plan_date,
  mc.recipe_code,
  r.display_name as recipe_name,
  mc.qty as recipe_qty,
  ri.item_code,
  ii.item_name,
  ri.qty_per_unit as qty_per_recipe_unit,
  ri.unit as ingredient_unit,
  ri.waste_pct,
  ROUND(mc.qty * ri.qty_per_unit * (1 + ri.waste_pct / 100.0), 2) as required_qty_with_waste,
  ii.current_stock,
  ii.par_level,
  CASE
    WHEN ii.current_stock < (mc.qty * ri.qty_per_unit * (1 + ri.waste_pct / 100.0)) THEN 1
    ELSE 0
  END as stock_out_risk,
  'menu' as forecast_source,
  0.95 as confidence
FROM menu_calendar mc
JOIN recipes r ON mc.recipe_code = r.recipe_code
JOIN recipe_ingredients ri ON r.recipe_code = ri.recipe_code
JOIN inventory_items ii ON ri.item_code = ii.item_code
WHERE mc.plan_date = DATE('now')
  AND r.is_active = 1

UNION ALL

-- Breakfast items from population-based forecast
SELECT
  DATE('now') as plan_date,
  'BREAKFAST' as recipe_code,
  'Population Breakfast' as recipe_name,
  bd.total_population as recipe_qty,
  iam.item_code,
  ii.item_name,
  CASE iam.alias_name
    WHEN 'bread' THEN bd.bread_slices_per_person
    WHEN 'eggs' THEN bd.eggs_per_person
    WHEN 'bacon' THEN bd.bacon_strips_per_person
    WHEN 'ham' THEN bd.ham_slices_per_person
    WHEN 'bologna' THEN bd.bologna_slices_per_person
    WHEN 'sausage' THEN bd.sausage_links_per_person
    WHEN 'butter' THEN bd.butter_pats_per_person
    WHEN 'jam' THEN bd.jam_packets_per_person
    ELSE 0
  END as qty_per_recipe_unit,
  iam.conversion_unit as ingredient_unit,
  5.0 as waste_pct,
  CASE iam.alias_name
    WHEN 'bread' THEN bd.bread_demand_slices * 1.05
    WHEN 'eggs' THEN bd.eggs_demand_ea * 1.05
    WHEN 'bacon' THEN bd.bacon_demand_strips * 1.05
    WHEN 'ham' THEN bd.ham_demand_slices * 1.05
    WHEN 'bologna' THEN bd.bologna_demand_slices * 1.05
    WHEN 'sausage' THEN bd.sausage_demand_links * 1.05
    WHEN 'butter' THEN bd.butter_demand_pats * 1.05
    WHEN 'jam' THEN bd.jam_demand_packets * 1.05
    ELSE 0
  END as required_qty_with_waste,
  ii.current_stock,
  ii.par_level,
  CASE
    WHEN ii.current_stock < (
      CASE iam.alias_name
        WHEN 'bread' THEN bd.bread_demand_slices * 1.05
        WHEN 'eggs' THEN bd.eggs_demand_ea * 1.05
        WHEN 'bacon' THEN bd.bacon_demand_strips * 1.05
        WHEN 'ham' THEN bd.ham_demand_slices * 1.05
        WHEN 'bologna' THEN bd.bologna_demand_slices * 1.05
        WHEN 'sausage' THEN bd.sausage_demand_links * 1.05
        WHEN 'butter' THEN bd.butter_demand_pats * 1.05
        WHEN 'jam' THEN bd.jam_demand_packets * 1.05
        ELSE 0
      END
    ) THEN 1
    ELSE 0
  END as stock_out_risk,
  'breakfast_forecast' as forecast_source,
  0.85 as confidence
FROM v_breakfast_demand_today_v2 bd
CROSS JOIN item_alias_map iam
JOIN inventory_items ii ON iam.item_code = ii.item_code
WHERE iam.category = 'breakfast'

UNION ALL

-- Beverage items from population-based forecast
SELECT
  DATE('now') as plan_date,
  'BEVERAGE' as recipe_code,
  'Population Beverages' as recipe_name,
  bev.total_population as recipe_qty,
  iam.item_code,
  ii.item_name,
  CASE iam.alias_name
    WHEN 'coffee' THEN bev.coffee_cups_per_person * bev.coffee_grounds_g_per_cup
    WHEN 'creamer' THEN bev.coffee_cups_per_person * bev.creamer_oz_per_cup
    WHEN 'milk' THEN bev.milk_oz_per_person
    WHEN 'tea' THEN bev.tea_bags_per_person
    WHEN 'orange_juice' THEN bev.orange_juice_oz_per_person
    WHEN 'apple_juice' THEN bev.apple_juice_oz_per_person
    ELSE 0
  END as qty_per_recipe_unit,
  iam.conversion_unit as ingredient_unit,
  3.0 as waste_pct,
  CASE iam.alias_name
    WHEN 'coffee' THEN bev.coffee_demand_g * 1.03
    WHEN 'creamer' THEN bev.creamer_demand_oz * 1.03
    WHEN 'milk' THEN bev.milk_demand_oz * 1.03
    WHEN 'tea' THEN bev.tea_demand_bags * 1.03
    WHEN 'orange_juice' THEN bev.orange_juice_demand_oz * 1.03
    WHEN 'apple_juice' THEN bev.apple_juice_demand_oz * 1.03
    ELSE 0
  END as required_qty_with_waste,
  ii.current_stock,
  ii.par_level,
  CASE
    WHEN ii.current_stock < (
      CASE iam.alias_name
        WHEN 'coffee' THEN bev.coffee_demand_g * 1.03
        WHEN 'creamer' THEN bev.creamer_demand_oz * 1.03
        WHEN 'milk' THEN bev.milk_demand_oz * 1.03
        WHEN 'tea' THEN bev.tea_demand_bags * 1.03
        WHEN 'orange_juice' THEN bev.orange_juice_demand_oz * 1.03
        WHEN 'apple_juice' THEN bev.apple_juice_demand_oz * 1.03
        ELSE 0
      END
    ) THEN 1
    ELSE 0
  END as stock_out_risk,
  'beverage_forecast' as forecast_source,
  0.80 as confidence
FROM v_beverage_demand_today_v1 bev
CROSS JOIN item_alias_map iam
JOIN inventory_items ii ON iam.item_code = ii.item_code
WHERE iam.category = 'beverage';

-- =====================================================================
-- VIEW: v_predicted_usage_today_v2
-- Aggregated predicted usage across all sources
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_predicted_usage_today_v2 AS
SELECT
  item_code,
  item_name,
  SUM(required_qty_with_waste) as total_predicted_qty,
  ingredient_unit as unit,
  MAX(current_stock) as current_stock,
  MAX(par_level) as par_level,
  MAX(stock_out_risk) as stock_out_risk,
  GROUP_CONCAT(DISTINCT forecast_source) as forecast_sources,
  ROUND(AVG(confidence), 2) as avg_confidence,
  COUNT(DISTINCT recipe_code) as num_recipes_using
FROM v_menu_demand_today_v2
GROUP BY item_code, item_name, ingredient_unit;

-- =====================================================================
-- VIEW: v_stockout_forecast_v2
-- Items at risk of stock-out with enhanced details
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_stockout_forecast_v2 AS
SELECT
  p.item_code,
  p.item_name,
  p.total_predicted_qty,
  p.unit,
  p.current_stock,
  p.par_level,
  p.current_stock - p.total_predicted_qty as shortage_qty,
  ROUND((p.total_predicted_qty - p.current_stock) / NULLIF(p.total_predicted_qty, 0) * 100, 1) as shortage_pct,
  p.forecast_sources,
  p.avg_confidence,
  p.num_recipes_using,
  CASE
    WHEN p.current_stock <= 0 THEN 'CRITICAL'
    WHEN p.current_stock < (p.total_predicted_qty * 0.5) THEN 'HIGH'
    WHEN p.current_stock < p.total_predicted_qty THEN 'MEDIUM'
    ELSE 'LOW'
  END as risk_level
FROM v_predicted_usage_today_v2 p
WHERE p.stock_out_risk = 1
ORDER BY
  CASE
    WHEN p.current_stock <= 0 THEN 1
    WHEN p.current_stock < (p.total_predicted_qty * 0.5) THEN 2
    WHEN p.current_stock < p.total_predicted_qty THEN 3
    ELSE 4
  END,
  p.total_predicted_qty DESC;

-- =====================================================================
-- AUDIT LOG (commented out - audit_logs table not available in this database)
-- =====================================================================

-- INSERT INTO audit_logs (
--   event_type,
--   action,
--   endpoint,
--   user_id,
--   user_email,
--   ip_address,
--   user_agent,
--   request_body,
--   response_status,
--   success,
--   severity,
--   metadata,
--   created_at
-- ) VALUES (
--   'SCHEMA_MIGRATION',
--   'APPLY_MIGRATION',
--   '/migrations/015_menu_beverage_learning',
--   'SYSTEM',
--   'migration@neuroinnovate.local',
--   '127.0.0.1',
--   'SQLite/Migration',
--   json_object(
--     'migration_file', '015_menu_beverage_learning.sql',
--     'tables_added', json_array('ai_feedback_comments', 'site_population', 'item_alias_map'),
--     'views_added', json_array('v_breakfast_demand_today_v2', 'v_beverage_demand_today_v1', 'v_menu_demand_today_v2', 'v_predicted_usage_today_v2', 'v_stockout_forecast_v2')
--   ),
--   200,
--   1,
--   'INFO',
--   json_object('version', '015', 'phase', 'v6.7', 'completed', 1),
--   CURRENT_TIMESTAMP
-- );

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Version: 015
-- Tables Added: 3 (ai_feedback_comments, site_population, item_alias_map)
-- Views Added: 5 (_v2 suffix to avoid breaking existing)
-- Indexes Added: 5
-- Seed Data: Default population, beverage profile, breakfast profile, alias mappings
-- =====================================================================
