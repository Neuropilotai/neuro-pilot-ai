-- Migration 007: Menu Planning & Population System
-- Links recipes to 4-week menu cycle, tracks daily headcount

-- Menus table (4-week cycle)
CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  cycle_week INTEGER NOT NULL CHECK (cycle_week BETWEEN 1 AND 4),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  service TEXT NOT NULL CHECK (service IN ('breakfast', 'lunch', 'dinner')),
  label TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, cycle_week, day_of_week, service)
);

CREATE INDEX idx_menus_org ON menus(org_id);
CREATE INDEX idx_menus_cycle ON menus(org_id, cycle_week);
CREATE INDEX idx_menus_week_day ON menus(cycle_week, day_of_week);

-- Menu Recipes (recipes assigned to menu slots)
CREATE TABLE IF NOT EXISTS menu_recipes (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  recipe_code TEXT NOT NULL,
  target_portions INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_menu_recipes_menu ON menu_recipes(menu_id);
CREATE INDEX idx_menu_recipes_recipe ON menu_recipes(recipe_code);

-- Population (daily headcount)
CREATE TABLE IF NOT EXISTS population (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER,
  date DATE NOT NULL,
  breakfast INTEGER DEFAULT 0,
  lunch INTEGER DEFAULT 0,
  dinner INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, date)
);

CREATE INDEX idx_population_org ON population(org_id);
CREATE INDEX idx_population_site ON population(site_id);
CREATE INDEX idx_population_date ON population(date DESC);
CREATE INDEX idx_population_org_date ON population(org_id, date DESC);
