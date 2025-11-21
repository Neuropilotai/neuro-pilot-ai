-- Migration 013: Menu Planning Tables
-- Creates tables required by /api/menu routes
-- Safe to re-run (uses IF NOT EXISTS)

-- ============================================
-- MENUS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id INTEGER,
  name TEXT,
  cycle_week INTEGER NOT NULL CHECK (cycle_week BETWEEN 1 AND 52),
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_menus_org_id ON menus(org_id);
CREATE INDEX IF NOT EXISTS idx_menus_org_site ON menus(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_menus_cycle_week ON menus(org_id, cycle_week);
CREATE INDEX IF NOT EXISTS idx_menus_active ON menus(org_id, active);

-- ============================================
-- MENU_DAYS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS menu_days (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(menu_id, date)
);

CREATE INDEX IF NOT EXISTS idx_menu_days_menu_id ON menu_days(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_days_date ON menu_days(date);

-- ============================================
-- MENU_RECIPES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS menu_recipes (
  id SERIAL PRIMARY KEY,
  menu_day_id INTEGER NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
  recipe_id INTEGER,
  meal TEXT CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  portion_target INTEGER DEFAULT 0 CHECK (portion_target >= 0),
  actual_portions INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_menu_recipes_menu_day ON menu_recipes(menu_day_id);
CREATE INDEX IF NOT EXISTS idx_menu_recipes_recipe ON menu_recipes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_menu_recipes_meal ON menu_recipes(meal);

-- ============================================
-- POPULATION TABLE (for headcount)
-- ============================================

CREATE TABLE IF NOT EXISTS population (
  id SERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id INTEGER,
  date DATE NOT NULL,
  breakfast INTEGER DEFAULT 0 CHECK (breakfast >= 0),
  lunch INTEGER DEFAULT 0 CHECK (lunch >= 0),
  dinner INTEGER DEFAULT 0 CHECK (dinner >= 0),
  snack INTEGER DEFAULT 0 CHECK (snack >= 0),
  source TEXT DEFAULT 'manual',
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, date)
);

CREATE INDEX IF NOT EXISTS idx_population_org_id ON population(org_id);
CREATE INDEX IF NOT EXISTS idx_population_org_site ON population(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_population_date ON population(date DESC);
