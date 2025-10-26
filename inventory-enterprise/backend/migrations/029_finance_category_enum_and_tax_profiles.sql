-- Migration 029: Finance Category Mapping Rules & Tax Profiles
-- Purpose: Authoritative category mapping rules and tax calculation governance
-- Author: NeuroPilot v15.7+
-- Date: 2025-10-14

-- ============================================================================
-- PART 1: Finance Mapping Rules (ML + Manual Overrides)
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_mapping_rules (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL, -- KEYWORD, REGEX, ITEM_NO, VENDOR_CATEGORY, MANUAL
  vendor TEXT NOT NULL DEFAULT 'GFS',
  pattern TEXT NOT NULL,       -- keyword, regex, or item_no
  category_code TEXT NOT NULL REFERENCES item_categories(category_code),
  tax_profile_id INTEGER NOT NULL REFERENCES tax_profiles(tax_profile_id),
  priority INTEGER DEFAULT 100, -- lower = higher priority
  confidence NUMERIC(3,2) DEFAULT 0.95,
  active BOOLEAN DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor, rule_type, pattern)
);

CREATE INDEX idx_mapping_rules_category ON finance_mapping_rules(category_code);
CREATE INDEX idx_mapping_rules_active ON finance_mapping_rules(active);
CREATE INDEX idx_mapping_rules_priority ON finance_mapping_rules(priority);

-- ============================================================================
-- PART 2: Seed Mapping Rules (GFS-specific patterns)
-- ============================================================================

-- BAKE: Bakery products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'BREAD', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'ROLL', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BUN', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BAGEL', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'MUFFIN', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'PASTRY', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'CROISSANT', 'BAKE', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'DONUT', 'BAKE', 5, 10, 0.98, 'system');

-- BEV_ECO: Beverages & Eco products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'JUICE', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'COFFEE', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'TEA', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BEVERAGE', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'DRINK', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SODA', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'WATER', 'BEV_ECO', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'ECO', 'BEV_ECO', 1, 15, 0.95, 'system');

-- MILK: Dairy products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'MILK', 'MILK', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CHEESE', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'YOGURT', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'CREAM', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BUTTER', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'DAIRY', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'MOZZ', 'MILK', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'CHEDDAR', 'MILK', 5, 10, 0.98, 'system');

-- GROC_MISC: Grocery & Misc
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'SAUCE', 'GROC_MISC', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'SPICE', 'GROC_MISC', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'OIL', 'GROC_MISC', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'PASTA', 'GROC_MISC', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'RICE', 'GROC_MISC', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'FLOUR', 'GROC_MISC', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SUGAR', 'GROC_MISC', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SALT', 'GROC_MISC', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SEASONING', 'GROC_MISC', 1, 10, 0.95, 'system');

-- MEAT: Meat products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'BEEF', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'PORK', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CHICKEN', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'TURKEY', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'BACON', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'SAUSAGE', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'HAM', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'LAMB', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'FISH', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'SEAFOOD', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'SALMON', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'HADDOCK', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'MEATBALL', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'PASTRAMI', 'MEAT', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'BOLOGNA', 'MEAT', 5, 10, 0.99, 'system');

-- PROD: Produce
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'APPLE', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'BANANA', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'ORANGE', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'LETTUCE', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'TOMATO', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'ONION', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'POTATO', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CARROT', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CELERY', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'BROCCOLI', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CAULIFLOWER', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'CABBAGE', 'PROD', 5, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'PRODUCE', 'PROD', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'FRUIT', 'PROD', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'VEG', 'PROD', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BERRY', 'PROD', 5, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'BEET', 'PROD', 5, 10, 0.99, 'system');

-- CLEAN: Cleaning supplies
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'CLEAN', 'CLEAN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SOAP', 'CLEAN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'DETERGENT', 'CLEAN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'SANITIZER', 'CLEAN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'DISINFECTANT', 'CLEAN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'CHEMICAL', 'CLEAN', 1, 15, 0.90, 'system');

-- PAPER: Paper products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'PAPER', 'PAPER', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'TOWEL', 'PAPER', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'NAPKIN', 'PAPER', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'TISSUE', 'PAPER', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'PPR', 'PAPER', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'CUP', 'PAPER', 1, 15, 0.90, 'system'),
  ('KEYWORD', 'GFS', 'PLATE', 'PAPER', 1, 15, 0.90, 'system'),
  ('KEYWORD', 'GFS', 'DISPOSABLE', 'PAPER', 1, 15, 0.85, 'system'),
  ('KEYWORD', 'GFS', 'ECO PLATE', 'PAPER', 1, 10, 0.95, 'system');

-- LINEN: Linen products
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'LINEN', 'LINEN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'APRON', 'LINEN', 1, 10, 0.98, 'system'),
  ('KEYWORD', 'GFS', 'TOWEL', 'LINEN', 1, 15, 0.85, 'system'),
  ('KEYWORD', 'GFS', 'CLOTH', 'LINEN', 1, 15, 0.85, 'system');

-- SMALL_EQUIP: Small equipment
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'EQUIP', 'SMALL_EQUIP', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'UTENSIL', 'SMALL_EQUIP', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'PAN', 'SMALL_EQUIP', 1, 15, 0.85, 'system'),
  ('KEYWORD', 'GFS', 'POT', 'SMALL_EQUIP', 1, 15, 0.85, 'system'),
  ('KEYWORD', 'GFS', 'KNIFE', 'SMALL_EQUIP', 1, 10, 0.95, 'system'),
  ('KEYWORD', 'GFS', 'TABLETOP', 'SMALL_EQUIP', 1, 10, 0.90, 'system');

-- FREIGHT: Freight charges
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'FREIGHT', 'FREIGHT', 1, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'SHIPPING', 'FREIGHT', 1, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'DELIVERY', 'FREIGHT', 1, 15, 0.90, 'system'),
  ('KEYWORD', 'GFS', 'FUEL CHARGE', 'FREIGHT', 1, 10, 0.95, 'system');

-- PROPANE: Propane/gas
INSERT OR IGNORE INTO finance_mapping_rules (rule_type, vendor, pattern, category_code, tax_profile_id, priority, confidence, created_by) VALUES
  ('KEYWORD', 'GFS', 'PROPANE', 'PROPANE', 1, 10, 0.99, 'system'),
  ('KEYWORD', 'GFS', 'GAS', 'PROPANE', 1, 15, 0.85, 'system'),
  ('KEYWORD', 'GFS', 'FUEL', 'PROPANE', 1, 20, 0.80, 'system');

-- ============================================================================
-- PART 3: Category Recognition Patterns (for GFS invoice OCR)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gfs_category_patterns (
  pattern_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gfs_category_name TEXT NOT NULL UNIQUE, -- e.g., 'Produce', 'Meat', 'Dairy'
  category_code TEXT NOT NULL REFERENCES item_categories(category_code),
  confidence NUMERIC(3,2) DEFAULT 0.98,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Map GFS invoice category names to our category codes
INSERT OR IGNORE INTO gfs_category_patterns (gfs_category_name, category_code, confidence) VALUES
  ('Produce', 'PROD', 0.99),
  ('Meat', 'MEAT', 0.99),
  ('Poultry', 'MEAT', 0.99),
  ('Seafood', 'MEAT', 0.99),
  ('Dairy', 'MILK', 0.99),
  ('Frozen', 'GROC_MISC', 0.90),
  ('Grocery', 'GROC_MISC', 0.90),
  ('Beverage', 'BEV_ECO', 0.99),
  ('Disposables', 'PAPER', 0.95),
  ('Chemical', 'CLEAN', 0.95),
  ('Tabletop', 'SMALL_EQUIP', 0.90),
  ('Fuel Charge', 'FREIGHT', 0.95);

-- ============================================================================
-- PART 4: Finance Mapping Approval Workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_mapping_approvals (
  approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
  mapping_id INTEGER NOT NULL REFERENCES needs_mapping(mapping_id),
  approved_category TEXT NOT NULL REFERENCES item_categories(category_code),
  approved_tax_profile INTEGER NOT NULL REFERENCES tax_profiles(tax_profile_id),
  approved_by TEXT NOT NULL,
  approval_notes TEXT,
  create_item_bank_entry BOOLEAN DEFAULT 1,
  create_mapping_rule BOOLEAN DEFAULT 1,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approvals_mapping ON finance_mapping_approvals(mapping_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

INSERT INTO schema_migrations (version, description, applied_at) VALUES
  ('029', 'Finance Category Mapping Rules & Tax Profiles', CURRENT_TIMESTAMP);

SELECT '✓ Migration 029 complete: Category mapping rules, tax profiles, approval workflow' as status;
