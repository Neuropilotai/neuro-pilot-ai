-- =====================================================================
-- Migration 018: Fix Forecast Views to Use Correct Schema
-- =====================================================================
-- Purpose: Update all forecast views created in migration 015
--          to use v_current_inventory instead of non-existent inventory_items
--
-- Changes:
-- - v_menu_demand_today_v2 → uses v_current_inventory
-- - v_breakfast_demand_today_v2 → uses v_current_inventory
-- - v_beverage_demand_today_v1 → uses v_current_inventory
-- - v_predicted_usage_today_v2 → unchanged (aggregates from menu_demand)
-- - v_stockout_forecast_v2 → unchanged (uses predicted_usage)

-- Drop and recreate v_menu_demand_today_v2
DROP VIEW IF EXISTS v_menu_demand_today_v2;

CREATE VIEW v_menu_demand_today_v2 AS
-- Menu-based demand from recipes
SELECT
  mc.plan_date,
  mc.recipe_code,
  r.display_name as recipe_name,
  mc.qty as recipe_qty,
  ri.item_code,
  ci.item_name,
  ri.qty_per_unit as qty_per_recipe_unit,
  ri.unit as ingredient_unit,
  ri.waste_pct,
  ROUND(mc.qty * ri.qty_per_unit * (1 + ri.waste_pct / 100.0), 2) as required_qty_with_waste,
  ci.current_stock,
  ci.par_level,
  CASE
    WHEN ci.current_stock < (mc.qty * ri.qty_per_unit * (1 + ri.waste_pct / 100.0)) THEN 1
    ELSE 0
  END as stock_out_risk,
  'menu' as forecast_source,
  0.95 as confidence
FROM menu_calendar mc
JOIN recipes r ON mc.recipe_code = r.recipe_code
JOIN recipe_ingredients ri ON r.recipe_code = ri.recipe_code
JOIN v_current_inventory ci ON ri.item_code = ci.item_code
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
  ci.item_name,
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
  ROUND(
    bd.total_population *
    CASE iam.alias_name
      WHEN 'bread' THEN bd.bread_demand_slices
      WHEN 'eggs' THEN bd.eggs_demand_ea
      WHEN 'bacon' THEN bd.bacon_demand_strips
      WHEN 'ham' THEN bd.ham_demand_slices
      WHEN 'bologna' THEN bd.bologna_demand_slices
      WHEN 'sausage' THEN bd.sausage_demand_links
      WHEN 'butter' THEN bd.butter_demand_pats
      WHEN 'jam' THEN bd.jam_demand_packets
      ELSE 0
    END / NULLIF(bd.total_population, 0) * (1 + 5.0 / 100.0),
    2
  ) as required_qty_with_waste,
  ci.current_stock,
  ci.par_level,
  CASE
    WHEN ci.current_stock < ROUND(
      bd.total_population *
      CASE iam.alias_name
        WHEN 'bread' THEN bd.bread_demand_slices
        WHEN 'eggs' THEN bd.eggs_demand_ea
        WHEN 'bacon' THEN bd.bacon_demand_strips
        WHEN 'ham' THEN bd.ham_demand_slices
        WHEN 'bologna' THEN bd.bologna_demand_slices
        WHEN 'sausage' THEN bd.sausage_demand_links
        WHEN 'butter' THEN bd.butter_demand_pats
        WHEN 'jam' THEN bd.jam_demand_packets
        ELSE 0
      END / NULLIF(bd.total_population, 0) * (1 + 5.0 / 100.0),
      2
    ) THEN 1
    ELSE 0
  END as stock_out_risk,
  'breakfast_forecast' as forecast_source,
  0.90 as confidence
FROM v_breakfast_demand_today_v2 bd
CROSS JOIN item_alias_map iam
JOIN v_current_inventory ci ON iam.item_code = ci.item_code
WHERE iam.category = 'breakfast'

UNION ALL

-- Beverage items from population-based forecast
SELECT
  DATE('now') as plan_date,
  'BEVERAGE' as recipe_code,
  'Population Beverages' as recipe_name,
  bev.total_population as recipe_qty,
  iam.item_code,
  ci.item_name,
  CASE iam.alias_name
    WHEN 'coffee' THEN bev.coffee_grounds_g_per_cup * bev.coffee_cups_per_person
    WHEN 'creamer' THEN bev.creamer_oz_per_cup * bev.coffee_cups_per_person
    WHEN 'milk' THEN bev.milk_oz_per_person
    WHEN 'tea' THEN bev.tea_bags_per_person
    WHEN 'orange_juice' THEN bev.orange_juice_oz_per_person
    WHEN 'apple_juice' THEN bev.apple_juice_oz_per_person
    ELSE 0
  END as qty_per_recipe_unit,
  iam.conversion_unit as ingredient_unit,
  3.0 as waste_pct,
  ROUND(
    bev.total_population *
    CASE iam.alias_name
      WHEN 'coffee' THEN bev.coffee_demand_g
      WHEN 'creamer' THEN bev.creamer_demand_oz
      WHEN 'milk' THEN bev.milk_demand_oz
      WHEN 'tea' THEN bev.tea_demand_bags
      WHEN 'orange_juice' THEN bev.orange_juice_demand_oz
      WHEN 'apple_juice' THEN bev.apple_juice_demand_oz
      ELSE 0
    END / NULLIF(bev.total_population, 0) * (1 + 3.0 / 100.0),
    2
  ) as required_qty_with_waste,
  ci.current_stock,
  ci.par_level,
  CASE
    WHEN ci.current_stock < ROUND(
      bev.total_population *
      CASE iam.alias_name
        WHEN 'coffee' THEN bev.coffee_demand_g
        WHEN 'creamer' THEN bev.creamer_demand_oz
        WHEN 'milk' THEN bev.milk_demand_oz
        WHEN 'tea' THEN bev.tea_demand_bags
        WHEN 'orange_juice' THEN bev.orange_juice_demand_oz
        WHEN 'apple_juice' THEN bev.apple_juice_demand_oz
        ELSE 0
      END / NULLIF(bev.total_population, 0) * (1 + 3.0 / 100.0),
      2
    ) THEN 1
    ELSE 0
  END as stock_out_risk,
  'beverage_forecast' as forecast_source,
  0.88 as confidence
FROM v_beverage_demand_today_v1 bev
CROSS JOIN item_alias_map iam
JOIN v_current_inventory ci ON iam.item_code = ci.item_code
WHERE iam.category = 'beverage';

-- Views v_predicted_usage_today_v2 and v_stockout_forecast_v2 don't need changes
-- as they aggregate from v_menu_demand_today_v2 which now uses v_current_inventory

-- Verification: Check if forecast works
-- SELECT COUNT(*) as forecasted_items FROM v_predicted_usage_today_v2;
-- SELECT * FROM v_predicted_usage_today_v2 LIMIT 5;
