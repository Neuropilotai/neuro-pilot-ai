-- UPDATE CATEGORIES TO USE ACTUAL ACCOUNTING CODES
-- Replace default categories with actual account structure

-- Clear existing categories
DELETE FROM item_categories;
DELETE FROM item_master;

-- Insert actual accounting categories
INSERT INTO item_categories (category_id, category_name, category_code, description, display_order, active) VALUES
  (1, 'BAKE', '60110010', 'Bakery items', 1, 1),
  (2, 'BEV + ECO', '60110020', 'Beverages and ECO items', 2, 1),
  (3, 'MILK', '60110030', 'Milk and dairy products', 3, 1),
  (4, 'GROC+ MISC', '60110040', 'Grocery and miscellaneous items', 4, 1),
  (5, 'MEAT', '60110060', 'Meat products', 5, 1),
  (6, 'PROD', '60110070', 'Produce', 6, 1),
  (7, 'CLEAN', '60220001', 'Cleaning supplies', 7, 1),
  (8, 'PAPER', '60260010', 'Paper products', 8, 1),
  (9, 'Small Equip', '60665001', 'Small equipment', 9, 1),
  (10, 'FREIGHT', '62421100', 'Freight charges', 10, 1),
  (11, 'LINEN', '60240010', 'Linen and textiles', 11, 1),
  (12, 'PROPANE', '62869010', 'Propane and gas', 12, 1),
  (13, 'Other Costs', 'OTHER', 'Other miscellaneous costs', 13, 1);

-- Update auto-categorization rules to match these categories
-- These will be used in the autoCategorizeItem function
