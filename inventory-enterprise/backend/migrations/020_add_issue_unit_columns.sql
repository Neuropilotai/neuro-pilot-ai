-- v15.2.2: Add issue_* columns for reconciliation math
-- Safe to re-run: columns created only if missing
--
-- These columns enable proper unit of measure conversion:
-- - issue_unit: The unit in which items are typically issued/counted (EA, CS, LB)
-- - issue_qty: Quantity per issue unit (e.g., 1 CS = 12 EA)
-- - issue_to_base_factor: Conversion factor to base unit

-- Note: This file is designed to be run through a JS guard that checks
-- column existence via PRAGMA table_info before executing ALTERs.
-- Direct execution will fail if columns already exist.

ALTER TABLE inventory_items ADD COLUMN issue_unit TEXT;
ALTER TABLE inventory_items ADD COLUMN issue_qty REAL DEFAULT 1.0;
ALTER TABLE inventory_items ADD COLUMN issue_to_base_factor REAL DEFAULT 1.0;

-- Backfill from existing columns
UPDATE inventory_items
SET issue_unit = COALESCE(issue_unit, unit, 'EA'),
    issue_qty = COALESCE(issue_qty, 1.0),
    issue_to_base_factor = COALESCE(issue_to_base_factor, 1.0)
WHERE issue_unit IS NULL OR issue_qty IS NULL OR issue_to_base_factor IS NULL;
