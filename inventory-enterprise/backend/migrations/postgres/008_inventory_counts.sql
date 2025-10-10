-- Migration 008: Inventory Counts System
-- Version: 3.0.0
-- Description: Physical count entry with draft/submit/approve workflow

-- Inventory Counts (header table)
CREATE TABLE IF NOT EXISTS inventory_counts (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  location_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK(status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by VARCHAR(255),
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
  id SERIAL PRIMARY KEY,
  count_id VARCHAR(255) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  expected_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  variance NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_rows_count_id ON inventory_count_rows(count_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_rows_item_code ON inventory_count_rows(item_code);

-- Storage Locations (if not already exists)
CREATE TABLE IF NOT EXISTS storage_locations (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'warehouse',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);

-- Insert default location if none exist
INSERT INTO storage_locations (id, tenant_id, name, type)
SELECT 'LOC-DEFAULT', id, 'Main Warehouse', 'warehouse'
FROM tenants
WHERE id = 'default'
ON CONFLICT (id) DO NOTHING;

-- Add last_count_date to inventory_items if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items'
    AND column_name = 'last_count_date'
  ) THEN
    ALTER TABLE inventory_items ADD COLUMN last_count_date TIMESTAMP;
  END IF;
END $$;
