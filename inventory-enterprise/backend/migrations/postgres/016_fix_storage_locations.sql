-- Migration 016: Fix storage_locations table for inventory routes
-- Fixes: relation "storage_locations" does not exist
-- Also ensures is_active column exists (code uses is_active, some schemas use active)

-- ============================================================================
-- CREATE STORAGE_LOCATIONS TABLE IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS storage_locations (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL DEFAULT 'default',
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'warehouse',
  is_active BOOLEAN DEFAULT TRUE,
  sequence INTEGER DEFAULT 0,
  latitude REAL,
  longitude REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_active ON storage_locations(is_active);

-- ============================================================================
-- ADD MISSING COLUMNS IF TABLE EXISTS WITH OLD SCHEMA
-- ============================================================================

-- Add is_active column if missing (some schemas use 'active' instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_locations'
    AND column_name = 'is_active'
  ) THEN
    -- Check if 'active' column exists instead
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'storage_locations'
      AND column_name = 'active'
    ) THEN
      -- Add is_active and copy data from active
      ALTER TABLE storage_locations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
      UPDATE storage_locations SET is_active = active;
    ELSE
      ALTER TABLE storage_locations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
  END IF;
END $$;

-- Add tenant_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_locations'
    AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE storage_locations ADD COLUMN tenant_id VARCHAR(255) DEFAULT 'default';
  END IF;
END $$;

-- Add name column if missing (some schemas use location_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_locations'
    AND column_name = 'name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'storage_locations'
      AND column_name = 'location_name'
    ) THEN
      ALTER TABLE storage_locations ADD COLUMN name VARCHAR(255);
      UPDATE storage_locations SET name = location_name;
    ELSE
      ALTER TABLE storage_locations ADD COLUMN name VARCHAR(255) DEFAULT 'Default Location';
    END IF;
  END IF;
END $$;

-- Add type column if missing (some schemas use location_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_locations'
    AND column_name = 'type'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'storage_locations'
      AND column_name = 'location_type'
    ) THEN
      ALTER TABLE storage_locations ADD COLUMN type VARCHAR(50);
      UPDATE storage_locations SET type = location_type;
    ELSE
      ALTER TABLE storage_locations ADD COLUMN type VARCHAR(50) DEFAULT 'warehouse';
    END IF;
  END IF;
END $$;

-- Add sequence column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_locations'
    AND column_name = 'sequence'
  ) THEN
    ALTER TABLE storage_locations ADD COLUMN sequence INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- SEED DEFAULT LOCATION IF TABLE IS EMPTY
-- ============================================================================

INSERT INTO storage_locations (id, tenant_id, name, type, is_active, sequence)
SELECT 'LOC-DEFAULT', 'default', 'Main Warehouse', 'warehouse', true, 1
WHERE NOT EXISTS (SELECT 1 FROM storage_locations LIMIT 1);

-- ============================================================================
-- COMPLETE
-- ============================================================================
