-- =====================================================================
-- Migration 022: Link All Recipe Ingredients (Full Program Coverage)
-- =====================================================================
-- Purpose: Connect recipes to actual item_codes with quantities
--          Enables menu-based forecasting for all daily programs
--
-- Programs Covered:
-- - Sandwich Program (500/day baseline)
-- - Steak Night (Saturday, 250 servings)
-- - Jigg Dinner (daily turkey service, 250 servings)
-- - Indian Meals (20/day)
-- - Breakfast Service (already covered via population forecasting)

-- =====================================================================
-- RECIPE: SANDWICH_DAILY (500 sandwiches/day baseline)
-- =====================================================================
-- Standard sandwich: 2 slices bread, 3oz turkey, 1oz cheese, lettuce, tomato

INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct, notes)
VALUES
  -- Base: 500 sandwiches
  ('SANDWICH_DAILY', 'BREAD-WHITE', 2, 'slices', 3.0, '2 slices per sandwich'),
  ('SANDWICH_DAILY', 'TURKEY-BREAST-SLICED', 0.1875, 'lb', 2.0, '3oz per sandwich'),
  ('SANDWICH_DAILY', 'CHEESE-CHEDDAR', 0.0625, 'lb', 2.0, '1oz per sandwich'),
  ('SANDWICH_DAILY', 'LETTUCE-ICEBERG', 0.05, 'head', 5.0, 'Leafy, higher waste'),
  ('SANDWICH_DAILY', 'TOMATO-SLICING', 0.05, 'lb', 5.0, '~1 slice per sandwich'),
  ('SANDWICH_DAILY', 'MAYO-BULK', 0.01, 'gal', 1.0, '~0.5oz per sandwich'),
  ('SANDWICH_DAILY', 'MUSTARD-BULK', 0.008, 'gal', 1.0, '~0.4oz per sandwich');

-- =====================================================================
-- RECIPE: STEAK_NIGHT (Saturday event, 250 servings)
-- =====================================================================
-- 10oz AAA steak + baked potato per person

INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct, notes)
VALUES
  ('STEAK_NIGHT', 'STEAK-AAA-10OZ', 1, 'ea', 3.0, 'AAA grade ribeye, 10oz portion'),
  ('STEAK_NIGHT', 'POTATO-BAKING', 1, 'ea', 5.0, 'Large Idaho baking potato'),
  ('STEAK_NIGHT', 'BUTTER-PATS', 2, 'ea', 2.0, 'For potato'),
  ('STEAK_NIGHT', 'LETTUCE-ICEBERG', 0.1, 'head', 5.0, 'Side salad'),
  ('STEAK_NIGHT', 'TOMATO-SLICING', 0.08, 'lb', 5.0, 'Side salad');

-- =====================================================================
-- RECIPE: JIGG_DINNER (Daily traditional meal, 250 servings)
-- =====================================================================
-- Traditional Newfoundland Jigg Dinner: turkey, cabbage, carrot, potato, turnip

INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct, notes)
VALUES
  ('JIGG_DINNER', 'TURKEY-BREAST-SLICED', 0.25, 'lb', 2.0, '4oz per serving'),
  ('JIGG_DINNER', 'POTATO-BAKING', 1, 'ea', 5.0, 'Boiled potato'),
  ('JIGG_DINNER', 'LETTUCE-ICEBERG', 0.08, 'head', 8.0, 'Cabbage substitute (track real cabbage later)'),
  ('JIGG_DINNER', 'BUTTER-PATS', 1, 'ea', 2.0, 'For vegetables');

-- Note: Real Jigg Dinner uses cabbage, carrots, turnips - add these items to item_master later

-- =====================================================================
-- RECIPE: INDIAN_DAILY (20 servings/day)
-- =====================================================================
-- Typical Indian meal: rice, dal (lentils), curry (chickpeas), yogurt, spices

INSERT OR IGNORE INTO recipe_ingredients (recipe_code, item_code, qty_per_unit, unit, waste_pct, notes)
VALUES
  -- Basmati rice base
  ('INDIAN_DAILY', 'RICE-BASMATI', 0.25, 'lb', 2.0, '4oz cooked rice per serving'),

  -- Dal (lentil curry)
  ('INDIAN_DAILY', 'LENTILS-RED', 0.15, 'lb', 3.0, 'Red lentils for dal'),

  -- Chickpea curry
  ('INDIAN_DAILY', 'CHICKPEAS-DRY', 0.15, 'lb', 3.0, 'Chickpeas for curry'),

  -- Spices (small quantities, critical items)
  ('INDIAN_DAILY', 'SPICE-TURMERIC', 0.05, 'oz', 1.0, 'Turmeric powder'),
  ('INDIAN_DAILY', 'SPICE-CUMIN', 0.05, 'oz', 1.0, 'Cumin seeds'),
  ('INDIAN_DAILY', 'SPICE-CORIANDER', 0.04, 'oz', 1.0, 'Coriander powder'),
  ('INDIAN_DAILY', 'SPICE-GARAM-MASALA', 0.03, 'oz', 1.0, 'Garam masala blend'),

  -- Yogurt (raita)
  ('INDIAN_DAILY', 'YOGURT-PLAIN', 0.125, 'qt', 2.0, '4oz yogurt per serving');

-- Note: Add naan bread, ghee, and other authentic ingredients to item_master later

-- =====================================================================
-- RECIPE: BREAKFAST_SERVICE (already covered by population forecasting)
-- =====================================================================
-- This recipe exists for menu_calendar scheduling but ingredients
-- are calculated through v_breakfast_demand_today_v2 view
-- No ingredients needed here - handled by site_population profiles

-- =====================================================================
-- VERIFY: Check Ingredient Linkage
-- =====================================================================
-- SELECT
--   r.recipe_code,
--   r.display_name,
--   COUNT(ri.ingredient_id) as ingredient_count,
--   SUM(im.par_level * im.unit_cost) as estimated_recipe_cost
-- FROM recipes r
-- LEFT JOIN recipe_ingredients ri ON r.recipe_code = ri.recipe_code
-- LEFT JOIN item_master im ON ri.item_code = im.item_code
-- GROUP BY r.recipe_code, r.display_name;

-- =====================================================================
-- UPDATE: Menu Calendar for Tomorrow (Example)
-- =====================================================================
-- Schedule tomorrow's meals to enable forecasting

-- Clear tomorrow first (if re-running)
DELETE FROM menu_calendar WHERE plan_date = DATE('now', '+1 day');

-- Schedule tomorrow's meals
INSERT INTO menu_calendar (recipe_code, plan_date, qty, meal_type, notes)
VALUES
  -- Breakfast (every day)
  ('BREAKFAST_SERVICE', DATE('now', '+1 day'), 250, 'breakfast', 'Standard breakfast service'),

  -- Lunch: Sandwich program + Jigg Dinner
  ('SANDWICH_DAILY', DATE('now', '+1 day'), 500, 'lunch', 'Daily sandwich baseline'),
  ('JIGG_DINNER', DATE('now', '+1 day'), 250, 'lunch', 'Traditional Jigg Dinner'),

  -- Dinner: Indian meals
  ('INDIAN_DAILY', DATE('now', '+1 day'), 20, 'dinner', 'Indian meal service');

-- If tomorrow is Saturday (day 6), add Steak Night
INSERT INTO menu_calendar (recipe_code, plan_date, qty, meal_type, notes)
SELECT 'STEAK_NIGHT', DATE('now', '+1 day'), 250, 'dinner', 'Saturday Steak Night Special'
WHERE CAST(strftime('%w', DATE('now', '+1 day')) AS INTEGER) = 6;

-- Verification
-- SELECT
--   mc.plan_date,
--   mc.recipe_code,
--   r.display_name,
--   mc.qty as servings,
--   mc.meal_type,
--   COUNT(ri.ingredient_id) as ingredients_linked
-- FROM menu_calendar mc
-- JOIN recipes r ON mc.recipe_code = r.recipe_code
-- LEFT JOIN recipe_ingredients ri ON r.recipe_code = ri.recipe_code
-- WHERE mc.plan_date >= DATE('now')
-- GROUP BY mc.plan_date, mc.recipe_code, r.display_name, mc.qty, mc.meal_type
-- ORDER BY mc.plan_date,
--   CASE mc.meal_type
--     WHEN 'breakfast' THEN 1
--     WHEN 'lunch' THEN 2
--     WHEN 'dinner' THEN 3
--     ELSE 4
--   END;
