-- Migration 005: Recipe Management System
-- Tracks recipes, ingredients, costing snapshots

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  yield_qty DECIMAL(10,3) NOT NULL,
  yield_uom TEXT NOT NULL,
  prep_loss_pct DECIMAL(5,2) DEFAULT 0,
  allergens JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, code)
);

CREATE INDEX idx_recipes_org ON recipes(org_id);
CREATE INDEX idx_recipes_code ON recipes(code);
CREATE INDEX idx_recipes_active ON recipes(active);
CREATE INDEX idx_recipes_org_active ON recipes(org_id, active);

-- Recipe Ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_sku TEXT NOT NULL,
  qty DECIMAL(10,3) NOT NULL,
  uom TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_sku ON recipe_ingredients(item_sku);

-- Recipe Cost Snapshots (historical costing)
CREATE TABLE IF NOT EXISTS recipe_cost_snapshots (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unit_cost DECIMAL(10,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  vendor_id INTEGER REFERENCES vendors(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_cost_snapshots_recipe ON recipe_cost_snapshots(recipe_id);
CREATE INDEX idx_recipe_cost_snapshots_computed ON recipe_cost_snapshots(computed_at DESC);
