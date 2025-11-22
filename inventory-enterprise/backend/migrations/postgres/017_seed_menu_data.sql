-- Migration 017: Seed 4-week menu cycle data
-- Populates menus, recipes, menu_days, and menu_recipes tables

-- ============================================================================
-- SEED MENUS (4-week cycle)
-- ============================================================================

INSERT INTO menus (id, org_id, name, cycle_week, start_date, end_date, active, notes, created_at)
SELECT 1, 'default-org', 'Week 1 Menu', 1, CURRENT_DATE, CURRENT_DATE + 6, true, '4-week rotating menu - Week 1', NOW()
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE id = 1);

INSERT INTO menus (id, org_id, name, cycle_week, start_date, end_date, active, notes, created_at)
SELECT 2, 'default-org', 'Week 2 Menu', 2, CURRENT_DATE + 7, CURRENT_DATE + 13, true, '4-week rotating menu - Week 2', NOW()
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE id = 2);

INSERT INTO menus (id, org_id, name, cycle_week, start_date, end_date, active, notes, created_at)
SELECT 3, 'default-org', 'Week 3 Menu', 3, CURRENT_DATE + 14, CURRENT_DATE + 20, true, '4-week rotating menu - Week 3', NOW()
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE id = 3);

INSERT INTO menus (id, org_id, name, cycle_week, start_date, end_date, active, notes, created_at)
SELECT 4, 'default-org', 'Week 4 Menu', 4, CURRENT_DATE + 21, CURRENT_DATE + 27, true, '4-week rotating menu - Week 4', NOW()
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE id = 4);

-- ============================================================================
-- SEED RECIPES (Sample recipes for each meal type)
-- ============================================================================

-- Week 1 Recipes
INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 1, 'default-org', 'RCP-W1-BF-01', 'Scrambled Eggs & Toast', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 1);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 2, 'default-org', 'RCP-W1-LU-01', 'Chicken Biryani', 280, 'servings', 'dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 2);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 3, 'default-org', 'RCP-W1-DI-01', 'Beef Stew & Mashed Potatoes', 280, 'servings', 'dairy,gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 3);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 4, 'default-org', 'RCP-W1-BF-02', 'Pancakes with Maple Syrup', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 4);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 5, 'default-org', 'RCP-W1-LU-02', 'Grilled Cheese Sandwich', 280, 'servings', 'gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 5);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 6, 'default-org', 'RCP-W1-DI-02', 'Roast Chicken with Vegetables', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 6);

-- Week 2 Recipes
INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 7, 'default-org', 'RCP-W2-BF-01', 'Waffles & Fresh Berries', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 7);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 8, 'default-org', 'RCP-W2-LU-01', 'Turkey Club Sandwich', 280, 'servings', 'gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 8);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 9, 'default-org', 'RCP-W2-DI-01', 'Pork Chops with Apple Sauce', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 9);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 10, 'default-org', 'RCP-W2-BF-02', 'Oatmeal with Honey', 280, 'servings', 'gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 10);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 11, 'default-org', 'RCP-W2-LU-02', 'Vegetable Soup & Bread', 280, 'servings', 'gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 11);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 12, 'default-org', 'RCP-W2-DI-02', 'Pasta Carbonara', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 12);

-- Week 3 Recipes
INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 13, 'default-org', 'RCP-W3-BF-01', 'French Toast', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 13);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 14, 'default-org', 'RCP-W3-LU-01', 'Fish Tacos', 280, 'servings', 'fish,gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 14);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 15, 'default-org', 'RCP-W3-DI-01', 'Grilled Steak & Fries', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 15);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 16, 'default-org', 'RCP-W3-BF-02', 'Smoothie Bowl', 280, 'servings', 'dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 16);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 17, 'default-org', 'RCP-W3-LU-02', 'Caesar Salad with Chicken', 280, 'servings', 'eggs,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 17);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 18, 'default-org', 'RCP-W3-DI-02', 'Lamb Stew', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 18);

-- Week 4 Recipes
INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 19, 'default-org', 'RCP-W4-BF-01', 'Eggs Benedict', 280, 'servings', 'eggs,gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 19);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 20, 'default-org', 'RCP-W4-LU-01', 'Fried Rice', 280, 'servings', 'eggs,soy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 20);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 21, 'default-org', 'RCP-W4-DI-01', 'BBQ Ribs', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 21);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 22, 'default-org', 'RCP-W4-BF-02', 'Croissants & Jam', 280, 'servings', 'gluten,dairy', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 22);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 23, 'default-org', 'RCP-W4-LU-02', 'Minestrone Soup', 280, 'servings', 'gluten', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 23);

INSERT INTO recipes (id, org_id, code, name, yield_qty, yield_uom, allergens, active, created_at)
SELECT 24, 'default-org', 'RCP-W4-DI-02', 'Roast Turkey Dinner', 280, 'servings', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE id = 24);

-- Reset sequence for recipes
SELECT setval('recipes_id_seq', COALESCE((SELECT MAX(id) FROM recipes), 0) + 1, false);

-- ============================================================================
-- SEED MENU_DAYS (Days for each week)
-- ============================================================================

-- Check menu_days schema first
DO $$
DECLARE
  has_menu_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_days' AND column_name = 'menu_id'
  ) INTO has_menu_id;

  IF has_menu_id THEN
    -- Week 1 Days
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 0, CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 0);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 1, CURRENT_DATE + 1 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 1);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 2, CURRENT_DATE + 2 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 2);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 3, CURRENT_DATE + 3 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 3);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 4, CURRENT_DATE + 4 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 4);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 5, CURRENT_DATE + 5 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 5);
    INSERT INTO menu_days (menu_id, day_of_week, day_date)
    SELECT 1, 6, CURRENT_DATE + 6 WHERE NOT EXISTS (SELECT 1 FROM menu_days WHERE menu_id = 1 AND day_of_week = 6);
  END IF;
END $$;

-- ============================================================================
-- COMPLETE
-- ============================================================================
