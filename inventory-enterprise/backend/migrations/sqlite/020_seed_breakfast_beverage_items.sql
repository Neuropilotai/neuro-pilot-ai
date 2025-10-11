-- =====================================================================
-- Migration 020: Seed Breakfast and Beverage Items in item_master
-- =====================================================================
-- Purpose: Create the core breakfast and beverage inventory items
--          that are referenced by item_alias_map for forecasting
--
-- These items enable:
-- - Population-based breakfast forecasting
-- - Beverage demand forecasting
-- - Daily sandwich program tracking

-- =====================================================================
-- BREAKFAST ITEMS
-- =====================================================================

INSERT OR IGNORE INTO item_master (item_code, item_name, item_name_fr, category, unit, par_level, reorder_point, unit_cost, active)
VALUES
  ('BREAD-WHITE', 'White Bread Loaf', 'Pain blanc', 'bakery', 'loaf', 30, 15, 2.50, 1),
  ('EGGS-LARGE', 'Large Eggs (dozen)', 'Oeufs gros', 'dairy', 'dozen', 50, 25, 3.99, 1),
  ('BACON-STRIPS', 'Bacon Strips', 'Tranches de bacon', 'meat', 'lb', 25, 10, 8.99, 1),
  ('HAM-SLICES', 'Sliced Ham', 'Jambon tranché', 'meat', 'lb', 20, 10, 7.49, 1),
  ('BOLOGNA-SLICES', 'Bologna Slices', 'Tranches de mortadelle', 'meat', 'lb', 15, 8, 5.99, 1),
  ('SAUSAGE-LINKS', 'Breakfast Sausage Links', 'Saucisses petit déjeuner', 'meat', 'lb', 20, 10, 6.99, 1),
  ('BUTTER-PATS', 'Butter Pats', 'Portions de beurre', 'dairy', 'box', 10, 5, 12.99, 1),
  ('JAM-PACKETS', 'Jam Packets (assorted)', 'Sachets de confiture', 'condiments', 'box', 8, 4, 15.99, 1);

-- =====================================================================
-- BEVERAGE ITEMS
-- =====================================================================

INSERT OR IGNORE INTO item_master (item_code, item_name, item_name_fr, category, unit, par_level, reorder_point, unit_cost, active)
VALUES
  ('COFFEE-GROUNDS', 'Coffee Grounds (ground)', 'Café moulu', 'beverage', 'lb', 20, 10, 12.99, 1),
  ('COFFEE-CREAMER', 'Coffee Creamer (liquid)', 'Crème à café', 'dairy', 'qt', 15, 8, 4.99, 1),
  ('MILK-WHOLE', 'Whole Milk', 'Lait entier', 'dairy', 'gal', 30, 15, 5.49, 1),
  ('TEA-BAGS', 'Tea Bags (assorted)', 'Sachets de thé', 'beverage', 'box', 10, 5, 8.99, 1),
  ('ORANGE-JUICE', 'Orange Juice', 'Jus d''orange', 'beverage', 'gal', 20, 10, 6.99, 1),
  ('APPLE-JUICE', 'Apple Juice', 'Jus de pomme', 'beverage', 'gal', 15, 8, 5.99, 1);

-- =====================================================================
-- SANDWICH PROGRAM ITEMS (High-Volume Daily)
-- =====================================================================

INSERT OR IGNORE INTO item_master (item_code, item_name, item_name_fr, category, unit, par_level, reorder_point, unit_cost, active)
VALUES
  ('TURKEY-BREAST-SLICED', 'Turkey Breast (sliced)', 'Poitrine de dinde', 'meat', 'lb', 50, 25, 9.99, 1),
  ('CHEESE-CHEDDAR', 'Cheddar Cheese (sliced)', 'Fromage cheddar', 'dairy', 'lb', 30, 15, 7.99, 1),
  ('CHEESE-SWISS', 'Swiss Cheese (sliced)', 'Fromage suisse', 'cheese', 'lb', 20, 10, 8.99, 1),
  ('LETTUCE-ICEBERG', 'Iceberg Lettuce', 'Laitue iceberg', 'produce', 'head', 20, 10, 1.99, 1),
  ('TOMATO-SLICING', 'Tomatoes (slicing)', 'Tomates', 'produce', 'lb', 25, 12, 2.99, 1),
  ('MAYO-BULK', 'Mayonnaise (bulk)', 'Mayonnaise', 'condiments', 'gal', 5, 3, 18.99, 1),
  ('MUSTARD-BULK', 'Mustard (bulk)', 'Moutarde', 'condiments', 'gal', 4, 2, 15.99, 1);

-- =====================================================================
-- STEAK NIGHT ITEMS (Saturday Special Event)
-- =====================================================================

INSERT OR IGNORE INTO item_master (item_code, item_name, item_name_fr, category, unit, par_level, reorder_point, unit_cost, active)
VALUES
  ('STEAK-AAA-10OZ', 'AAA Steak (10 oz)', 'Bifteck AAA', 'meat', 'ea', 260, 100, 15.99, 1),
  ('POTATO-BAKING', 'Baking Potatoes', 'Pommes de terre', 'produce', 'lb', 100, 50, 1.49, 1);

-- =====================================================================
-- INDIAN MEAL PROGRAM ITEMS (20 servings daily)
-- =====================================================================

INSERT OR IGNORE INTO item_master (item_code, item_name, item_name_fr, category, unit, par_level, reorder_point, unit_cost, active)
VALUES
  ('RICE-BASMATI', 'Basmati Rice', 'Riz basmati', 'grains', 'lb', 50, 25, 3.99, 1),
  ('SPICE-TURMERIC', 'Turmeric Powder', 'Curcuma', 'spices', 'oz', 16, 8, 0.99, 1),
  ('SPICE-CUMIN', 'Cumin Seeds', 'Graines de cumin', 'spices', 'oz', 16, 8, 1.29, 1),
  ('SPICE-CORIANDER', 'Coriander Powder', 'Coriandre', 'spices', 'oz', 12, 6, 0.89, 1),
  ('SPICE-GARAM-MASALA', 'Garam Masala', 'Garam masala', 'spices', 'oz', 12, 6, 1.99, 1),
  ('CHICKPEAS-DRY', 'Chickpeas (dry)', 'Pois chiches', 'legumes', 'lb', 20, 10, 2.49, 1),
  ('LENTILS-RED', 'Red Lentils', 'Lentilles rouges', 'legumes', 'lb', 20, 10, 2.99, 1),
  ('YOGURT-PLAIN', 'Plain Yogurt', 'Yogourt nature', 'dairy', 'qt', 10, 5, 4.99, 1);

-- Verification query
-- SELECT category, COUNT(*) as item_count, SUM(par_level * unit_cost) as par_value
-- FROM item_master
-- WHERE category IN ('bakery', 'meat', 'dairy', 'beverage', 'produce', 'condiments', 'grains', 'spices', 'legumes')
-- GROUP BY category
-- ORDER BY category;
