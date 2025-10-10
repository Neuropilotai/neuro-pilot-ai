-- ITEM CATEGORIZATION SYSTEM
-- Add categories, subcategories, and item classification

-- ============================================================================
-- 1. ITEM CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_categories (
  category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  category_code TEXT UNIQUE,                    -- Short code (e.g., 'PRODUCE', 'MEAT', 'DAIRY')
  description TEXT,
  parent_category_id INTEGER,                   -- For subcategories
  display_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parent_category_id) REFERENCES item_categories(category_id)
);

CREATE INDEX IF NOT EXISTS idx_categories_code ON item_categories(category_code);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON item_categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON item_categories(active);

-- ============================================================================
-- 2. ITEM MASTER DATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_master (
  item_code TEXT PRIMARY KEY,
  barcode TEXT,
  description TEXT NOT NULL,
  category_id INTEGER,
  subcategory_id INTEGER,
  unit TEXT,

  -- Classification
  brand TEXT,
  manufacturer TEXT,
  pack_size TEXT,

  -- Pricing
  current_unit_price REAL,
  last_price_update TEXT,

  -- Flags
  is_perishable INTEGER DEFAULT 0,
  requires_refrigeration INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,

  -- Metadata
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (category_id) REFERENCES item_categories(category_id),
  FOREIGN KEY (subcategory_id) REFERENCES item_categories(category_id)
);

CREATE INDEX IF NOT EXISTS idx_item_master_category ON item_master(category_id);
CREATE INDEX IF NOT EXISTS idx_item_master_subcategory ON item_master(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_item_master_barcode ON item_master(barcode);
CREATE INDEX IF NOT EXISTS idx_item_master_active ON item_master(is_active);

-- ============================================================================
-- 3. DEFAULT CATEGORIES
-- ============================================================================
-- Main categories
INSERT OR IGNORE INTO item_categories (category_id, category_name, category_code, description, display_order) VALUES
  (1, 'Produce', 'PRODUCE', 'Fresh fruits and vegetables', 1),
  (2, 'Meat & Seafood', 'MEAT', 'Fresh and frozen meat, poultry, seafood', 2),
  (3, 'Dairy & Eggs', 'DAIRY', 'Milk, cheese, yogurt, eggs', 3),
  (4, 'Bakery', 'BAKERY', 'Bread, baked goods, pastries', 4),
  (5, 'Frozen Foods', 'FROZEN', 'Frozen vegetables, meals, desserts', 5),
  (6, 'Dry Goods', 'DRY', 'Pasta, rice, flour, grains', 6),
  (7, 'Canned & Jarred', 'CANNED', 'Canned vegetables, fruits, sauces', 7),
  (8, 'Beverages', 'BEVERAGE', 'Juices, sodas, water', 8),
  (9, 'Condiments & Sauces', 'CONDIMENT', 'Ketchup, mustard, dressings', 9),
  (10, 'Snacks', 'SNACKS', 'Chips, crackers, nuts', 10),
  (11, 'Cleaning Supplies', 'CLEANING', 'Detergents, sanitizers, paper products', 11),
  (12, 'Disposables', 'DISPOSABLE', 'Plates, cups, utensils, containers', 12),
  (13, 'Other', 'OTHER', 'Miscellaneous items', 99);

-- Produce subcategories
INSERT OR IGNORE INTO item_categories (category_name, category_code, parent_category_id, display_order) VALUES
  ('Fresh Fruits', 'FRUIT', 1, 1),
  ('Fresh Vegetables', 'VEGETABLE', 1, 2),
  ('Herbs & Spices', 'HERBS', 1, 3),
  ('Organic Produce', 'ORGANIC_PRODUCE', 1, 4);

-- Meat & Seafood subcategories
INSERT OR IGNORE INTO item_categories (category_name, category_code, parent_category_id, display_order) VALUES
  ('Beef', 'BEEF', 2, 1),
  ('Pork', 'PORK', 2, 2),
  ('Poultry', 'POULTRY', 2, 3),
  ('Seafood', 'SEAFOOD', 2, 4),
  ('Deli Meats', 'DELI', 2, 5);

-- Dairy subcategories
INSERT OR IGNORE INTO item_categories (category_name, category_code, parent_category_id, display_order) VALUES
  ('Milk', 'MILK', 3, 1),
  ('Cheese', 'CHEESE', 3, 2),
  ('Yogurt', 'YOGURT', 3, 3),
  ('Butter & Margarine', 'BUTTER', 3, 4),
  ('Eggs', 'EGGS', 3, 5);

-- ============================================================================
-- 4. CATEGORY STATISTICS VIEW
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_category_inventory AS
SELECT
  c.category_id,
  c.category_name,
  c.category_code,
  COUNT(DISTINCT ii.item_code) as unique_items,
  COUNT(*) as total_line_items,
  SUM(ii.quantity) as total_quantity,
  SUM(ii.quantity * ii.unit_price) as total_value,
  SUM(CASE WHEN ii.status = 'PENDING_PLACEMENT' THEN 1 ELSE 0 END) as pending_items,
  SUM(CASE WHEN ii.status = 'PLACED' THEN 1 ELSE 0 END) as placed_items,
  SUM(CASE WHEN ii.status = 'COUNTED' THEN 1 ELSE 0 END) as counted_items
FROM item_categories c
LEFT JOIN item_master im ON c.category_id = im.category_id
LEFT JOIN invoice_items ii ON im.item_code = ii.item_code
WHERE c.parent_category_id IS NULL  -- Main categories only
  AND c.active = 1
GROUP BY c.category_id, c.category_name, c.category_code
ORDER BY c.display_order;

-- ============================================================================
-- 5. SUBCATEGORY STATISTICS VIEW
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_subcategory_inventory AS
SELECT
  c.category_id,
  c.category_name,
  c.category_code,
  pc.category_name as parent_category,
  COUNT(DISTINCT ii.item_code) as unique_items,
  COUNT(*) as total_line_items,
  SUM(ii.quantity) as total_quantity,
  SUM(ii.quantity * ii.unit_price) as total_value
FROM item_categories c
LEFT JOIN item_categories pc ON c.parent_category_id = pc.category_id
LEFT JOIN item_master im ON c.category_id = im.subcategory_id
LEFT JOIN invoice_items ii ON im.item_code = ii.item_code
WHERE c.parent_category_id IS NOT NULL  -- Subcategories only
  AND c.active = 1
GROUP BY c.category_id, c.category_name, c.category_code, pc.category_name
ORDER BY pc.display_order, c.display_order;
