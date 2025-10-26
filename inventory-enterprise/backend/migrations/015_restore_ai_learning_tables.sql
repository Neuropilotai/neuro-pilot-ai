-- ============================================================================
-- Migration 015: Restore AI Learning Tables
-- Purpose: Recreate missing tables for breakfast/menu learning and health scoring
-- Date: 2025-10-12
-- Author: NeuroPilot v13.5
-- ============================================================================

-- 1. Site Population (Breakfast/Beverage Profiles)
CREATE TABLE IF NOT EXISTS site_population (
  population_id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date DATE NOT NULL UNIQUE,
  total_population INTEGER NOT NULL,
  indian_count INTEGER DEFAULT 0,
  breakfast_profile TEXT, -- JSON: { bread_slices_per_person: 2, eggs_per_person: 2, ... }
  beverages_profile TEXT, -- JSON: { coffee_cups_per_person: 1.5, creamer_oz_per_cup: 2, ... }
  lunch_profile TEXT, -- JSON: future use
  dinner_profile TEXT, -- JSON: future use
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. AI Daily Forecast Cache (for health scoring & quick lookups)
CREATE TABLE IF NOT EXISTS ai_daily_forecast_cache (
  cache_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  date DATE NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_demand REAL,
  confidence REAL,
  model_used TEXT,
  metadata TEXT, -- JSON: additional forecast info
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_code, date)
);

-- 3. AI Learning Insights (for health scoring & learning dashboard)
CREATE TABLE IF NOT EXISTS ai_learning_insights (
  insight_id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_text TEXT NOT NULL,
  source TEXT, -- e.g., 'user_feedback', 'auto_learning', 'rl_agent'
  confidence REAL CHECK(confidence >= 0 AND confidence <= 1),
  applied_at TIMESTAMP,
  impact_score REAL, -- how much this insight improved predictions
  metadata TEXT, -- JSON: additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. AI Feedback Comments (user training input from UI)
CREATE TABLE IF NOT EXISTS ai_feedback_comments (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT,
  comment_text TEXT NOT NULL,
  category TEXT, -- e.g., 'breakfast', 'inventory', 'forecast'
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'applied', 'rejected')),
  sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral', NULL)),
  processed_at TIMESTAMP,
  applied_insight_id INTEGER, -- FK to ai_learning_insights
  metadata TEXT, -- JSON: additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (applied_insight_id) REFERENCES ai_learning_insights(insight_id)
);

-- 5. Item Alias Map (breakfast item → inventory code mapping)
CREATE TABLE IF NOT EXISTS item_alias_map (
  alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_name TEXT NOT NULL, -- e.g., 'bread', 'eggs', 'coffee'
  item_code TEXT NOT NULL, -- e.g., 'BREAD-WHITE-SLICED'
  category TEXT, -- e.g., 'breakfast', 'beverage', 'lunch'
  conversion_factor REAL DEFAULT 1.0, -- e.g., 1 slice = 1 unit
  conversion_unit TEXT, -- e.g., 'slices', 'ea', 'oz'
  notes TEXT,
  active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alias_name, category)
);

-- 6. Views for Breakfast/Beverage Demand (referenced by BreakfastPredictor.js)
CREATE VIEW IF NOT EXISTS v_breakfast_demand_today_v2 AS
SELECT
  DATE('now') as demand_date,
  sp.total_population,
  sp.indian_count,
  COALESCE(json_extract(sp.breakfast_profile, '$.bread_slices_per_person'), 2) as bread_slices_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.eggs_per_person'), 2) as eggs_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.bacon_strips_per_person'), 2) as bacon_strips_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.ham_slices_per_person'), 1) as ham_slices_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.bologna_slices_per_person'), 1) as bologna_slices_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.sausage_links_per_person'), 2) as sausage_links_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.butter_pats_per_person'), 2) as butter_pats_per_person,
  COALESCE(json_extract(sp.breakfast_profile, '$.jam_packets_per_person'), 2) as jam_packets_per_person,
  -- Calculated demands
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.bread_slices_per_person'), 2) as bread_demand_slices,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.eggs_per_person'), 2) as eggs_demand_ea,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.bacon_strips_per_person'), 2) as bacon_demand_strips,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.ham_slices_per_person'), 1) as ham_demand_slices,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.bologna_slices_per_person'), 1) as bologna_demand_slices,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.sausage_links_per_person'), 2) as sausage_demand_links,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.butter_pats_per_person'), 2) as butter_demand_pats,
  sp.total_population * COALESCE(json_extract(sp.breakfast_profile, '$.jam_packets_per_person'), 2) as jam_demand_packets
FROM site_population sp
WHERE sp.effective_date = DATE('now')
LIMIT 1;

CREATE VIEW IF NOT EXISTS v_beverage_demand_today_v1 AS
SELECT
  DATE('now') as demand_date,
  sp.total_population,
  sp.indian_count,
  COALESCE(json_extract(sp.beverages_profile, '$.coffee_cups_per_person'), 1.5) as coffee_cups_per_person,
  COALESCE(json_extract(sp.beverages_profile, '$.coffee_cup_size_oz'), 12) as coffee_cup_size_oz,
  COALESCE(json_extract(sp.beverages_profile, '$.coffee_grounds_g_per_cup'), 15) as coffee_grounds_g_per_cup,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.coffee_cups_per_person'), 1.5) * COALESCE(json_extract(sp.beverages_profile, '$.coffee_grounds_g_per_cup'), 15) as coffee_demand_g,
  COALESCE(json_extract(sp.beverages_profile, '$.creamer_oz_per_cup'), 2) as creamer_oz_per_cup,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.coffee_cups_per_person'), 1.5) * COALESCE(json_extract(sp.beverages_profile, '$.creamer_oz_per_cup'), 2) as creamer_demand_oz,
  COALESCE(json_extract(sp.beverages_profile, '$.milk_oz_per_person'), 8) as milk_oz_per_person,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.milk_oz_per_person'), 8) as milk_demand_oz,
  COALESCE(json_extract(sp.beverages_profile, '$.tea_bags_per_person'), 0.5) as tea_bags_per_person,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.tea_bags_per_person'), 0.5) as tea_demand_bags,
  COALESCE(json_extract(sp.beverages_profile, '$.orange_juice_oz_per_person'), 6) as orange_juice_oz_per_person,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.orange_juice_oz_per_person'), 6) as orange_juice_demand_oz,
  COALESCE(json_extract(sp.beverages_profile, '$.apple_juice_oz_per_person'), 4) as apple_juice_oz_per_person,
  sp.total_population * COALESCE(json_extract(sp.beverages_profile, '$.apple_juice_oz_per_person'), 4) as apple_juice_demand_oz
FROM site_population sp
WHERE sp.effective_date = DATE('now')
LIMIT 1;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_site_population_date ON site_population(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_cache_date ON ai_daily_forecast_cache(date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_cache_item ON ai_daily_forecast_cache(item_code, date);
CREATE INDEX IF NOT EXISTS idx_learning_insights_created ON ai_learning_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_insights_confidence ON ai_learning_insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_status ON ai_feedback_comments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_category ON ai_feedback_comments(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_alias_category ON item_alias_map(category, alias_name);
CREATE INDEX IF NOT EXISTS idx_item_alias_active ON item_alias_map(active, category);

-- ============================================================================
-- Seed Default Data
-- ============================================================================

-- Seed default population record (if none exists)
INSERT OR IGNORE INTO site_population (effective_date, total_population, indian_count, breakfast_profile, beverages_profile)
VALUES (
  DATE('now'),
  100,
  10,
  json('{"bread_slices_per_person": 2, "eggs_per_person": 2, "bacon_strips_per_person": 2, "ham_slices_per_person": 1, "bologna_slices_per_person": 1, "sausage_links_per_person": 2, "butter_pats_per_person": 2, "jam_packets_per_person": 2}'),
  json('{"coffee_cups_per_person": 1.5, "coffee_cup_size_oz": 12, "coffee_grounds_g_per_cup": 15, "creamer_oz_per_cup": 2, "milk_oz_per_person": 8, "tea_bags_per_person": 0.5, "orange_juice_oz_per_person": 6, "apple_juice_oz_per_person": 4}')
);

-- Seed example alias mappings (update item_code to match your actual inventory)
INSERT OR IGNORE INTO item_alias_map (alias_name, item_code, category, conversion_factor, conversion_unit, notes)
VALUES
  ('bread', 'BREAD-WHITE-SLICED', 'breakfast', 1.0, 'slices', 'White bread slices'),
  ('eggs', 'EGGS-LARGE-DOZEN', 'breakfast', 1.0, 'ea', 'Large eggs'),
  ('bacon', 'BACON-STRIPS-LB', 'breakfast', 1.0, 'strips', 'Bacon strips'),
  ('ham', 'HAM-SLICED-LB', 'breakfast', 1.0, 'slices', 'Sliced ham'),
  ('bologna', 'BOLOGNA-SLICED-LB', 'breakfast', 1.0, 'slices', 'Sliced bologna'),
  ('sausage', 'SAUSAGE-LINKS-LB', 'breakfast', 1.0, 'links', 'Sausage links'),
  ('butter', 'BUTTER-PATS', 'breakfast', 1.0, 'pats', 'Butter pats'),
  ('jam', 'JAM-PACKETS', 'breakfast', 1.0, 'packets', 'Jam packets'),
  ('coffee', 'COFFEE-GROUNDS-LB', 'beverage', 1.0, 'g', 'Coffee grounds (grams)'),
  ('creamer', 'CREAMER-LIQUID-QT', 'beverage', 1.0, 'oz', 'Liquid creamer'),
  ('milk', 'MILK-WHOLE-GAL', 'beverage', 1.0, 'oz', 'Whole milk'),
  ('tea', 'TEA-BAGS-BOX', 'beverage', 1.0, 'bags', 'Tea bags'),
  ('orange_juice', 'OJ-FROZEN-12OZ', 'beverage', 1.0, 'oz', 'Orange juice'),
  ('apple_juice', 'APPLE-JUICE-64OZ', 'beverage', 1.0, 'oz', 'Apple juice');

-- Seed example learning insights (for health scoring boost)
INSERT OR IGNORE INTO ai_learning_insights (insight_text, source, confidence, applied_at)
VALUES
  ('Default breakfast profile: 2 eggs, 2 bread slices per person', 'system_default', 0.75, datetime('now')),
  ('Default beverage profile: 1.5 cups coffee per person', 'system_default', 0.75, datetime('now')),
  ('Coffee consumption: 15g grounds per 12oz cup', 'system_default', 0.80, datetime('now'));

-- Seed example forecast cache (for health scoring boost)
INSERT OR IGNORE INTO ai_daily_forecast_cache (item_code, date, forecast_date, predicted_demand, confidence, model_used)
VALUES
  ('BREAD-WHITE-SLICED', DATE('now'), DATE('now'), 200, 0.85, 'population_based'),
  ('EGGS-LARGE-DOZEN', DATE('now'), DATE('now'), 200, 0.85, 'population_based'),
  ('COFFEE-GROUNDS-LB', DATE('now'), DATE('now'), 2250, 0.80, 'population_based'),
  ('BREAD-WHITE-SLICED', DATE('now', '+1 day'), DATE('now'), 200, 0.82, 'population_based'),
  ('EGGS-LARGE-DOZEN', DATE('now', '+1 day'), DATE('now'), 200, 0.82, 'population_based');

-- ============================================================================
-- Migration Complete Marker
-- ============================================================================

INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('015_restore_ai_learning_tables', datetime('now'));

-- ============================================================================
-- End of Migration 015
-- ============================================================================
