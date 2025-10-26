-- ============================================================================
-- Migration 018: Create v_current_inventory View
-- Purpose: Create v_current_inventory as alias to v_current_inventory_estimate
-- Date: 2025-10-12
-- ============================================================================

-- Drop if exists
DROP VIEW IF EXISTS v_current_inventory;

-- Create v_current_inventory as simpler view mapping to estimate view
CREATE VIEW v_current_inventory AS
SELECT
  item_code,
  item_name,
  unit,
  category,
  par_level,
  inferred_qty as current_stock,  -- Map inferred_qty to current_stock
  confidence,
  source,
  last_invoice_date,
  last_count_date
FROM v_current_inventory_estimate;

-- ============================================================================
-- Migration Complete Marker
-- ============================================================================

INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('018_create_v_current_inventory_view', datetime('now'));

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Views Created: 1
-- - v_current_inventory (alias to v_current_inventory_estimate)
-- ============================================================================
