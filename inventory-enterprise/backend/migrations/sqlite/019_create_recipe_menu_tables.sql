-- =====================================================================
-- Migration 019: Create Recipe and Menu Calendar Tables
-- =====================================================================
-- Purpose: Create the recipe management and menu planning tables
--          needed by the forecasting system
--
-- Tables created:
-- - recipes: Master recipe definitions
-- - recipe_ingredients: Ingredients per recipe with quantities
-- - menu_calendar: Daily menu planning (which recipes on which days)

-- =====================================================================
-- TABLE: recipes
-- =====================================================================
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT,                      -- 'breakfast', 'lunch', 'dinner', 'indian', 'sandwich'
  serving_size INTEGER DEFAULT 1,     -- How many portions this recipe yields
  prep_time_minutes INTEGER DEFAULT 0,
  cook_time_minutes INTEGER DEFAULT 0,
  instructions TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recipes_code ON recipes(recipe_code);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_active ON recipes(is_active);

-- =====================================================================
-- TABLE: recipe_ingredients
-- =====================================================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  ingredient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  qty_per_unit REAL NOT NULL DEFAULT 1.0,  -- Quantity needed per serving
  unit TEXT NOT NULL,                       -- Unit of measurement
  waste_pct REAL DEFAULT 5.0,               -- Expected waste percentage
  notes TEXT,
  FOREIGN KEY (recipe_code) REFERENCES recipes(recipe_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON recipe_ingredients(item_code);

-- =====================================================================
-- TABLE: menu_calendar
-- =====================================================================
CREATE TABLE IF NOT EXISTS menu_calendar (
  calendar_id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_code TEXT NOT NULL,
  plan_date DATE NOT NULL,
  qty INTEGER NOT NULL DEFAULT 250,        -- Number of servings planned
  meal_type TEXT,                          -- 'breakfast', 'lunch', 'dinner', 'snack'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_code) REFERENCES recipes(recipe_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_calendar_date ON menu_calendar(plan_date);
CREATE INDEX IF NOT EXISTS idx_menu_calendar_recipe ON menu_calendar(recipe_code);
CREATE INDEX IF NOT EXISTS idx_menu_calendar_meal ON menu_calendar(meal_type);

-- =====================================================================
-- SEED DATA: Default Recipes for Immediate Testing
-- =====================================================================

-- Recurring Saturday event: Steak Night
INSERT OR IGNORE INTO recipes (recipe_code, display_name, category, serving_size, is_active)
VALUES ('STEAK_NIGHT', 'Saturday Steak Night', 'dinner', 250, 1);

-- Jigg Dinner daily service
INSERT OR IGNORE INTO recipes (recipe_code, display_name, category, serving_size, is_active)
VALUES ('JIGG_DINNER', 'Traditional Jigg Dinner', 'lunch', 250, 1);

-- Sandwich program baseline
INSERT OR IGNORE INTO recipes (recipe_code, display_name, category, serving_size, is_active)
VALUES ('SANDWICH_DAILY', 'Daily Sandwich Service', 'lunch', 500, 1);

-- Breakfast service (linked to population breakfast demand)
INSERT OR IGNORE INTO recipes (recipe_code, display_name, category, serving_size, is_active)
VALUES ('BREAKFAST_SERVICE', 'Standard Breakfast Service', 'breakfast', 250, 1);

-- Indian meal service
INSERT OR IGNORE INTO recipes (recipe_code, display_name, category, serving_size, is_active)
VALUES ('INDIAN_DAILY', 'Indian Meal Service', 'dinner', 20, 1);

-- =====================================================================
-- SEED DATA: Sample Recipe Ingredients
-- =====================================================================
-- Note: These are placeholders. Real item_codes need to be linked
-- based on actual item_master data.

-- Steak Night ingredients (example - needs real item codes)
-- INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct)
-- VALUES
--   ('STEAK_NIGHT', 'MEAT_STEAK_AAA', 10, 'oz', 3.0),
--   ('STEAK_NIGHT', 'VEG_POTATO', 2, 'ea', 5.0);

-- Sandwich program baseline ingredients
-- INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct)
-- VALUES
--   ('SANDWICH_DAILY', 'BREAD_WHITE', 2, 'slices', 3.0),
--   ('SANDWICH_DAILY', 'MEAT_TURKEY', 3, 'oz', 2.0),
--   ('SANDWICH_DAILY', 'CHEESE_CHEDDAR', 1, 'oz', 2.0);

-- =====================================================================
-- SEED DATA: Sample Menu Calendar for Today
-- =====================================================================
-- Insert today's planned menu (allows immediate forecasting)

-- Breakfast service (every day)
INSERT OR IGNORE INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
VALUES ('BREAKFAST_SERVICE', DATE('now'), 250, 'breakfast');

-- Sandwich program (every day)
INSERT OR IGNORE INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
VALUES ('SANDWICH_DAILY', DATE('now'), 500, 'lunch');

-- Indian meal service (every day)
INSERT OR IGNORE INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
VALUES ('INDIAN_DAILY', DATE('now'), 20, 'dinner');

-- Steak Night (only on Saturdays)
-- This will be added dynamically by the system when date matches Saturday
-- INSERT OR IGNORE INTO menu_calendar (recipe_code, plan_date, qty, meal_type)
-- SELECT 'STEAK_NIGHT', DATE('now'), 250, 'dinner'
-- WHERE CAST(strftime('%w', DATE('now')) AS INTEGER) = 6;  -- 6 = Saturday

-- Verification queries
-- SELECT COUNT(*) as recipe_count FROM recipes;
-- SELECT COUNT(*) as ingredient_count FROM recipe_ingredients;
-- SELECT COUNT(*) as planned_meals_today FROM menu_calendar WHERE plan_date = DATE('now');
