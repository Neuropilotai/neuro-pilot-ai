-- ============================================
-- Migration 030: 4-Week Menu Cycle Items
-- NeuroPilot AI Enterprise v23.0
-- ============================================
-- Normalized menu model for 4-week rotation menus:
-- menus → menu_cycle_days → menu_cycle_items
-- ============================================

-- ============================================
-- TABLE: menu_cycle_days
-- Links weeks to days with station groupings
-- ============================================
CREATE TABLE IF NOT EXISTS menu_cycle_days (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Cycle identification
    cycle_week INTEGER NOT NULL CHECK (cycle_week BETWEEN 1 AND 4),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    -- 0=Wednesday, 1=Thursday, 2=Friday, 3=Saturday, 4=Sunday, 5=Monday, 6=Tuesday

    day_name VARCHAR(20) NOT NULL,
    meal_period VARCHAR(20) NOT NULL DEFAULT 'dinner',
    -- breakfast, lunch, dinner, snack

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    -- Unique constraint: one entry per week/day/meal combo
    CONSTRAINT unique_cycle_day UNIQUE (org_id, cycle_week, day_of_week, meal_period)
);

CREATE INDEX IF NOT EXISTS idx_mcd_org ON menu_cycle_days(org_id);
CREATE INDEX IF NOT EXISTS idx_mcd_week ON menu_cycle_days(cycle_week);
CREATE INDEX IF NOT EXISTS idx_mcd_day ON menu_cycle_days(day_of_week);

-- ============================================
-- TABLE: menu_stations
-- Station/category definitions (Western, South Asian, Healthy, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS menu_stations (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    cuisine_type VARCHAR(50),
    -- western, south_asian, healthy, dessert, beverage

    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_station_code UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ms_org ON menu_stations(org_id);
CREATE INDEX IF NOT EXISTS idx_ms_active ON menu_stations(is_active);

-- Seed default stations
INSERT INTO menu_stations (org_id, code, name, display_order, cuisine_type) VALUES
    ('default-org', 'WESTERN_MAIN', 'Western Main Courses', 1, 'western'),
    ('default-org', 'WESTERN_SIDE', 'Western Sides', 2, 'western'),
    ('default-org', 'SALAD', 'Salad Bar', 3, 'western'),
    ('default-org', 'FRIES', 'French Fries Station', 4, 'western'),
    ('default-org', 'HEALTHY', 'Healthy Option', 5, 'healthy'),
    ('default-org', 'SOUTH_ASIAN_MAIN', 'South Asian Main', 6, 'south_asian'),
    ('default-org', 'SOUTH_ASIAN_SIDE', 'South Asian Sides', 7, 'south_asian'),
    ('default-org', 'RICE', 'Rice Station', 8, 'south_asian'),
    ('default-org', 'VEGETABLES', 'Daily Vegetables', 9, 'western')
ON CONFLICT (org_id, code) DO NOTHING;

-- ============================================
-- TABLE: menu_cycle_items
-- Individual menu items for each day/station
-- ============================================
CREATE TABLE IF NOT EXISTS menu_cycle_items (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- References
    cycle_day_id INTEGER NOT NULL REFERENCES menu_cycle_days(id) ON DELETE CASCADE,
    station_id INTEGER REFERENCES menu_stations(id) ON DELETE SET NULL,

    -- Item details
    item_name VARCHAR(255) NOT NULL,
    item_name_normalized VARCHAR(255),
    -- Lowercased, trimmed for matching

    -- Optional recipe/inventory linkage
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    inventory_item_code VARCHAR(100),

    -- Display/categorization
    display_order INTEGER DEFAULT 0,
    is_vegetarian BOOLEAN DEFAULT FALSE,
    is_vegan BOOLEAN DEFAULT FALSE,
    allergens TEXT[],

    -- Quantity planning
    portion_target INTEGER,
    -- Expected servings

    -- Source tracking
    excel_row INTEGER,
    excel_col INTEGER,
    import_batch_id VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_mci_org ON menu_cycle_items(org_id);
CREATE INDEX IF NOT EXISTS idx_mci_day ON menu_cycle_items(cycle_day_id);
CREATE INDEX IF NOT EXISTS idx_mci_station ON menu_cycle_items(station_id);
CREATE INDEX IF NOT EXISTS idx_mci_recipe ON menu_cycle_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_mci_item_name ON menu_cycle_items(item_name_normalized);
CREATE INDEX IF NOT EXISTS idx_mci_batch ON menu_cycle_items(import_batch_id);

-- ============================================
-- VIEW: menu_cycle_view
-- Denormalized view for easy querying
-- ============================================
CREATE OR REPLACE VIEW menu_cycle_view AS
SELECT
    mci.id AS item_id,
    mci.org_id,
    mcd.cycle_week,
    mcd.day_of_week,
    mcd.day_name,
    mcd.meal_period,
    ms.code AS station_code,
    ms.name AS station_name,
    ms.cuisine_type,
    mci.item_name,
    mci.recipe_id,
    mci.inventory_item_code,
    mci.is_vegetarian,
    mci.is_vegan,
    mci.allergens,
    mci.portion_target,
    mci.display_order,
    mci.created_at,
    mci.updated_at
FROM menu_cycle_items mci
JOIN menu_cycle_days mcd ON mci.cycle_day_id = mcd.id
LEFT JOIN menu_stations ms ON mci.station_id = ms.id
ORDER BY mcd.cycle_week, mcd.day_of_week, ms.display_order, mci.display_order;

-- ============================================
-- TABLE: menu_import_log
-- Track menu imports for audit/rollback
-- ============================================
CREATE TABLE IF NOT EXISTS menu_import_log (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    batch_id VARCHAR(100) NOT NULL UNIQUE,
    file_name VARCHAR(255),
    file_hash VARCHAR(64),

    items_imported INTEGER DEFAULT 0,
    items_skipped INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,

    status VARCHAR(20) DEFAULT 'pending',
    -- pending, processing, completed, failed, rolled_back

    imported_by VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,

    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mil_org ON menu_import_log(org_id);
CREATE INDEX IF NOT EXISTS idx_mil_batch ON menu_import_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_mil_status ON menu_import_log(status);

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('030_menu_cycle_items.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 030_menu_cycle_items.sql completed successfully' AS result;
