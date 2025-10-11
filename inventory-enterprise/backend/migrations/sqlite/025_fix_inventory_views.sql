-- Migration 025: Fix Inventory Views for Data Schema Compatibility
-- Removes dependency on v_predicted_usage_today_v2 (not present in data/enterprise_inventory.db)

-- Drop existing views that depend on missing forecast views
DROP VIEW IF EXISTS v_current_inventory_estimate;
DROP VIEW IF EXISTS v_stockout_risk_detailed;

-- Recreate v_current_inventory_estimate WITHOUT forecast dependencies
CREATE VIEW v_current_inventory_estimate AS
SELECT
  ii.item_code,
  ii.item_name,
  ii.unit,
  ii.category,
  ii.par_level,

  -- Inferred quantity logic (simplified without forecast)
  CASE
    -- If we have a recent count, use it
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN ii.current_quantity

    -- If we have recent invoice, estimate based on par level
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') THEN
      MAX(0,
        COALESCE(
          (SELECT SUM(quantity)
           FROM processed_invoices
           WHERE item_code = ii.item_code
           AND received_date >= DATE('now', '-7 days')
          ), ii.par_level * 0.8
        )
      )

    -- Fallback to par level
    ELSE ii.par_level * 0.5
  END as inferred_qty,

  -- Confidence scoring (0.0 - 1.0)
  CASE
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN 1.0
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') THEN 0.5
    WHEN ii.last_invoice_date >= DATE('now', '-30 days') THEN 0.3
    ELSE 0.2
  END as confidence,

  -- Source indicator
  CASE
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN 'recent_count'
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') THEN 'invoice_estimate'
    ELSE 'par_level'
  END as source,

  ii.last_invoice_date,
  ii.last_invoice_no,
  ii.last_count_date,

  -- has_forecast always 0 (no forecast data available)
  0 as has_forecast

FROM inventory_items ii
WHERE ii.is_active = 1;

-- Recreate v_stockout_risk_detailed WITHOUT forecast dependencies
CREATE VIEW v_stockout_risk_detailed AS
SELECT
  est.item_code,
  est.item_name,
  est.unit,
  est.inferred_qty as available_qty,

  -- Use par level as predicted 24h usage
  est.par_level * 0.1 as predicted_24h,
  (est.par_level * 0.1) - est.inferred_qty as shortage_qty,

  -- Risk level based on par level
  CASE
    WHEN est.inferred_qty <= 0 THEN 'CRITICAL'
    WHEN est.inferred_qty < (est.par_level * 0.3) THEN 'HIGH'
    WHEN est.inferred_qty < (est.par_level * 0.5) THEN 'MEDIUM'
    ELSE 'LOW'
  END as risk_level,

  -- Reason string
  CASE
    WHEN est.inferred_qty <= 0 THEN 'OUT OF STOCK - Immediate replenishment required'
    WHEN est.inferred_qty < (est.par_level * 0.3) THEN
      est.item_name || ': Below 30% of par level (' ||
      CAST(ROUND(est.inferred_qty, 1) as TEXT) || ' ' || est.unit || ' available)'
    WHEN est.inferred_qty < (est.par_level * 0.5) THEN
      'Below 50% of par level - monitor closely'
    ELSE 'Adequate stock'
  END as reason,

  est.confidence,
  est.source as estimate_source,
  'par_level' as forecast_sources,
  est.last_invoice_date,
  est.last_count_date

FROM v_current_inventory_estimate est
WHERE est.inferred_qty < (est.par_level * 0.5)
ORDER BY
  CASE
    WHEN est.inferred_qty <= 0 THEN 1
    WHEN est.inferred_qty < (est.par_level * 0.3) THEN 2
    WHEN est.inferred_qty < (est.par_level * 0.5) THEN 3
    ELSE 4
  END,
  est.par_level DESC;

-- Add location_code column to storage_locations if it doesn't exist
-- First check if column exists, then add if missing
-- SQLite doesn't support ALTER COLUMN, so we use a conditional approach

-- Note: This will fail silently if column already exists (expected)
-- Using PRAGMA to check would require procedural logic not available in SQL
-- So we'll handle this in the route code instead
