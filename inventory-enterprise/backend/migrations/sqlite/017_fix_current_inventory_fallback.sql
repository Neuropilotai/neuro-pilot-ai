-- =====================================================================
-- Migration 017: Fix Current Inventory with Fallback Logic
-- =====================================================================
-- Purpose: Update v_current_inventory to use par_level as fallback
--          when no snapshots exist yet
--
-- Behavior:
-- - If snapshots exist: Use actual snapshot quantities
-- - If no snapshots: Use par_level as "estimated stock" for forecasting
--
-- This allows the forecasting system to work immediately even before
-- the first inventory count is completed.

DROP VIEW IF EXISTS v_current_inventory;

CREATE VIEW v_current_inventory AS
SELECT
  im.item_code,
  im.item_name,
  im.category,
  im.unit,
  -- Use snapshot quantity if available, otherwise fall back to par_level
  COALESCE(isi.quantity, im.par_level, 0) as current_stock,
  im.par_level,
  im.reorder_point,
  im.unit_cost,
  -- Calculate estimated value if no snapshot
  COALESCE(isi.total_value, im.par_level * im.unit_cost, 0) as total_value,
  isi.location,
  im.active,
  -- Flag to indicate if this is real data or estimated
  CASE WHEN isi.quantity IS NOT NULL THEN 1 ELSE 0 END as has_real_count
FROM item_master im
LEFT JOIN (
  -- Get latest snapshot items (if any exist)
  SELECT
    isi.item_code,
    SUM(isi.quantity) as quantity,
    AVG(isi.unit_cost) as avg_unit_cost,
    SUM(isi.total_value) as total_value,
    GROUP_CONCAT(DISTINCT isi.location) as location
  FROM inventory_snapshot_items isi
  INNER JOIN (
    -- Find the most recent snapshot (if it exists)
    SELECT snapshot_id, MAX(created_at) as latest_time
    FROM inventory_snapshots
    GROUP BY snapshot_id
    ORDER BY latest_time DESC
    LIMIT 1
  ) latest_snapshot ON isi.snapshot_id = latest_snapshot.snapshot_id
  GROUP BY isi.item_code
) isi ON im.item_code = isi.item_code
WHERE im.active = 1;

-- Verification query
-- SELECT
--   COUNT(*) as total_items,
--   SUM(current_stock) as total_stock,
--   SUM(CASE WHEN has_real_count = 1 THEN 1 ELSE 0 END) as items_with_real_count,
--   SUM(CASE WHEN has_real_count = 0 THEN 1 ELSE 0 END) as items_with_estimated_stock
-- FROM v_current_inventory;
