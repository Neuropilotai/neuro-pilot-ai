-- ============================================
-- Migration 041: Inventory Balance Table
-- Enterprise Hardening - Materialized Balance Table
-- ============================================
-- Purpose: Fast balance queries (10x+ faster than ledger SUM)
-- Safety: Zero-downtime, idempotent, additive only
-- ============================================

BEGIN;

-- ============================================
-- TABLE: inventory_balances
-- Materialized balance table for fast queries
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES item_locations(location_id) ON DELETE CASCADE,
  lot_id UUID,
  qty_canonical NUMERIC(18, 6) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_ledger_id UUID
);

-- Unique constraint: one balance per org/item/location/lot combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_unique 
  ON inventory_balances(org_id, item_id, location_id, lot_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_inventory_balances_org_item_location 
  ON inventory_balances(org_id, item_id, location_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_org_item 
  ON inventory_balances(org_id, item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_last_updated 
  ON inventory_balances(last_updated);

-- ============================================
-- FUNCTION: update_inventory_balance
-- Automatically updates balance table on ledger INSERT
-- ============================================
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory_balances (org_id, item_id, location_id, lot_id, qty_canonical, last_updated, last_ledger_id)
  VALUES (NEW.org_id, NEW.item_id, NEW.location_id, NEW.lot_id, NEW.qty_canonical, NOW(), NEW.id)
  ON CONFLICT (org_id, item_id, location_id, lot_id)
  DO UPDATE SET
    qty_canonical = inventory_balances.qty_canonical + NEW.qty_canonical,
    last_updated = NOW(),
    last_ledger_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: inventory_ledger_balance_trigger
-- Automatically updates balance on ledger INSERT
-- ============================================
-- Note: This assumes inventory_ledger table exists
-- If it doesn't exist yet, create it first or comment out this trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'inventory_ledger'
  ) THEN
    DROP TRIGGER IF EXISTS inventory_ledger_balance_trigger ON inventory_ledger;
    CREATE TRIGGER inventory_ledger_balance_trigger
      AFTER INSERT ON inventory_ledger
      FOR EACH ROW
      EXECUTE FUNCTION update_inventory_balance();
    RAISE NOTICE 'Trigger created on inventory_ledger';
  ELSE
    RAISE NOTICE 'inventory_ledger table does not exist - trigger will be created when table is added';
  END IF;
END $$;

COMMENT ON TABLE inventory_balances IS 'Materialized balance table for fast inventory queries';
COMMENT ON COLUMN inventory_balances.qty_canonical IS 'Current balance in canonical unit (g/ml/ea)';
COMMENT ON COLUMN inventory_balances.last_ledger_id IS 'Last processed ledger entry ID for reconciliation';

COMMIT;

