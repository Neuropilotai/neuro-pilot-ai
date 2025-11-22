-- Migration 015: Add inventory_items and related tables
-- Fixes: relation "inventory_items" does not exist

-- Inventory Items (Master SKU List)
CREATE TABLE IF NOT EXISTS inventory_items (
  item_id SERIAL PRIMARY KEY,
  item_code TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'EA',
  category TEXT,
  cost_code TEXT,
  par_level REAL DEFAULT 0,
  reorder_point REAL DEFAULT 0,
  current_quantity REAL DEFAULT 0,
  last_count_date DATE,
  last_invoice_date DATE,
  last_invoice_no TEXT,
  is_active INTEGER DEFAULT 1,
  barcode TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON inventory_items(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active);

-- Item Locations (Storage Locations)
CREATE TABLE IF NOT EXISTS item_locations (
  location_id SERIAL PRIMARY KEY,
  location_code TEXT NOT NULL UNIQUE,
  location_name TEXT NOT NULL,
  location_type TEXT DEFAULT 'STORAGE',
  sequence INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_item_locations_type ON item_locations(location_type);

-- Seed default locations
INSERT INTO item_locations (location_code, location_name, location_type, sequence) VALUES
  ('COOLER-01', 'Walk-in Cooler #1', 'COOLER', 1),
  ('FREEZER-01', 'Walk-in Freezer #1', 'FREEZER', 2),
  ('DRY-STORAGE', 'Dry Storage Room', 'DRY', 3),
  ('PANTRY-01', 'Main Pantry', 'STORAGE', 4),
  ('RECEIVING', 'Receiving Area', 'STORAGE', 5)
ON CONFLICT (location_code) DO NOTHING;

-- Item Location Assignments
CREATE TABLE IF NOT EXISTS item_location_assignments (
  assignment_id SERIAL PRIMARY KEY,
  item_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_code, location_code)
);

CREATE INDEX IF NOT EXISTS idx_item_location_item ON item_location_assignments(item_code);
CREATE INDEX IF NOT EXISTS idx_item_location_location ON item_location_assignments(location_code);

-- Documents (PDF/Invoice Registry)
CREATE TABLE IF NOT EXISTS documents (
  document_id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  document_type TEXT DEFAULT 'INVOICE',
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  processed_date TIMESTAMP,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
