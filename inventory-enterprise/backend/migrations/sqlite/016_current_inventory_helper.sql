-- =====================================================================
-- Migration 016: Current Inventory Helper View
-- =====================================================================
-- Purpose: Create v_current_inventory abstraction layer
--          Maps snapshot-based inventory to forecast-compatible format
--
-- This view provides:
-- - item_code, item_name from item_master
-- - current_stock from latest inventory_snapshot_items
-- - par_level, reorder_point from item_master
-- - Compatibility with forecast views expecting inventory_items table

-- Drop existing helper view if it exists
DROP VIEW IF EXISTS v_current_inventory;

-- Create current inventory helper view
CREATE VIEW v_current_inventory AS
SELECT
  im.item_code,
  im.item_name,
  im.category,
  im.unit,
  COALESCE(isi.quantity, 0) as current_stock,
  im.par_level,
  im.reorder_point,
  im.unit_cost,
  COALESCE(isi.total_value, 0) as total_value,
  isi.location,
  im.active
FROM item_master im
LEFT JOIN (
  -- Get latest snapshot items
  SELECT
    isi.item_code,
    SUM(isi.quantity) as quantity,
    AVG(isi.unit_cost) as avg_unit_cost,
    SUM(isi.total_value) as total_value,
    GROUP_CONCAT(DISTINCT isi.location) as location
  FROM inventory_snapshot_items isi
  INNER JOIN (
    -- Find the most recent snapshot
    SELECT snapshot_id, MAX(created_at) as latest_time
    FROM inventory_snapshots
    GROUP BY snapshot_id
    ORDER BY latest_time DESC
    LIMIT 1
  ) latest_snapshot ON isi.snapshot_id = latest_snapshot.snapshot_id
  GROUP BY isi.item_code
) isi ON im.item_code = isi.item_code
WHERE im.active = 1;

-- Create index-friendly materialized snapshot view
-- This helps with query performance
DROP VIEW IF EXISTS v_latest_snapshot_summary;

CREATE VIEW v_latest_snapshot_summary AS
SELECT
  (SELECT MAX(snapshot_id) FROM inventory_snapshots) as current_snapshot_id,
  (SELECT MAX(created_at) FROM inventory_snapshots) as snapshot_time,
  COUNT(DISTINCT item_code) as item_count,
  SUM(quantity) as total_units,
  SUM(total_value) as total_value
FROM inventory_snapshot_items
WHERE snapshot_id = (SELECT MAX(snapshot_id) FROM inventory_snapshots);

-- Verification: Show current inventory summary
-- SELECT
--   COUNT(*) as total_items,
--   SUM(current_stock) as total_stock,
--   SUM(total_value) as total_value,
--   COUNT(CASE WHEN current_stock < par_level THEN 1 END) as below_par
-- FROM v_current_inventory;
