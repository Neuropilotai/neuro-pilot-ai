-- Migration: Add Inventory Balance Table with Trigger
-- This migration creates a materialized balance table and trigger to keep it updated

-- Step 1: Create inventory_balances table (Prisma will handle this via schema)
-- This SQL is for the trigger only - the table is created by Prisma migration

-- Step 2: Create function to update inventory balance
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update balance record
  INSERT INTO inventory_balances (
    id,
    org_id,
    item_id,
    location_id,
    lot_id,
    qty_canonical,
    last_updated,
    last_ledger_id
  )
  VALUES (
    gen_random_uuid()::text,
    NEW.org_id,
    NEW.item_id,
    NEW.location_id,
    NEW.lot_id,
    NEW.qty_canonical,
    NOW(),
    NEW.id
  )
  ON CONFLICT (org_id, item_id, location_id, lot_id)
  DO UPDATE SET
    qty_canonical = inventory_balances.qty_canonical + NEW.qty_canonical,
    last_updated = NOW(),
    last_ledger_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger on inventory_ledger INSERT
DROP TRIGGER IF EXISTS inventory_ledger_balance_trigger ON inventory_ledger;

CREATE TRIGGER inventory_ledger_balance_trigger
AFTER INSERT ON inventory_ledger
FOR EACH ROW
EXECUTE FUNCTION update_inventory_balance();

-- Step 4: Create index on inventory_balances for performance
CREATE INDEX IF NOT EXISTS inventory_balances_org_item_location_idx 
  ON inventory_balances(org_id, item_id, location_id);

CREATE INDEX IF NOT EXISTS inventory_balances_org_item_idx 
  ON inventory_balances(org_id, item_id);

CREATE INDEX IF NOT EXISTS inventory_balances_last_updated_idx 
  ON inventory_balances(last_updated);

