-- Migration 008: Inventory Counts System
-- Version: 3.0.0
-- Description: Physical count entry with draft/submit/approve workflow

-- Inventory Counts (header table)
CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  approved_at TIMESTAMP,
  notes TEXT,
  approval_notes TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_created_at ON inventory_counts(created_at DESC);

-- Inventory Count Rows (line items)
CREATE TABLE IF NOT EXISTS inventory_count_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  expected_qty REAL NOT NULL DEFAULT 0,
  counted_qty REAL NOT NULL DEFAULT 0,
  variance REAL NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_rows_count_id ON inventory_count_rows(count_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_rows_item_code ON inventory_count_rows(item_code);

-- Storage Locations (if not already exists)
CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'warehouse',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);

-- Insert default location if none exist
INSERT OR IGNORE INTO storage_locations (id, tenant_id, name, type)
SELECT 'LOC-DEFAULT', id, 'Main Warehouse', 'warehouse'
FROM tenants
WHERE id = 'default';

-- Add last_count_date to inventory_items if not exists
ALTER TABLE inventory_items ADD COLUMN last_count_date TIMESTAMP;
