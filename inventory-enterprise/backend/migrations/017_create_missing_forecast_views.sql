-- ============================================================================
-- Migration 017: Create Missing Forecast Views
-- Purpose: Create v_predicted_usage_today_v2 and v_stockout_forecast_v2
-- Date: 2025-10-12
-- ============================================================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_predicted_usage_today_v2;
DROP VIEW IF EXISTS v_stockout_forecast_v2;

-- =====================================================================
-- VIEW: v_predicted_usage_today_v2
-- Aggregated predicted usage across all sources (menu + breakfast + beverage)
-- =====================================================================

CREATE VIEW v_predicted_usage_today_v2 AS
SELECT
  item_code,
  item_name,
  SUM(required_qty_with_waste) as total_predicted_qty,
  ingredient_unit as unit,
  MAX(current_stock) as current_stock,
  MAX(par_level) as par_level,
  MAX(stock_out_risk) as stock_out_risk,
  GROUP_CONCAT(DISTINCT forecast_source) as forecast_sources,
  ROUND(AVG(confidence), 2) as avg_confidence,
  COUNT(DISTINCT recipe_code) as num_recipes_using
FROM v_menu_demand_today_v2
GROUP BY item_code, item_name, ingredient_unit;

-- =====================================================================
-- VIEW: v_stockout_forecast_v2
-- Items at risk of stock-out with enhanced risk levels
-- =====================================================================

CREATE VIEW v_stockout_forecast_v2 AS
SELECT
  p.item_code,
  p.item_name,
  p.total_predicted_qty,
  p.unit,
  p.current_stock,
  p.par_level,
  p.current_stock - p.total_predicted_qty as shortage_qty,
  ROUND((p.total_predicted_qty - p.current_stock) / NULLIF(p.total_predicted_qty, 0) * 100, 1) as shortage_pct,
  p.forecast_sources,
  p.avg_confidence,
  p.num_recipes_using,
  CASE
    WHEN p.current_stock <= 0 THEN 'CRITICAL'
    WHEN p.current_stock < (p.total_predicted_qty * 0.5) THEN 'HIGH'
    WHEN p.current_stock < p.total_predicted_qty THEN 'MEDIUM'
    ELSE 'LOW'
  END as risk_level
FROM v_predicted_usage_today_v2 p
WHERE p.stock_out_risk = 1
ORDER BY
  CASE
    WHEN p.current_stock <= 0 THEN 1
    WHEN p.current_stock < (p.total_predicted_qty * 0.5) THEN 2
    WHEN p.current_stock < p.total_predicted_qty THEN 3
    ELSE 4
  END,
  p.total_predicted_qty DESC;

-- ============================================================================
-- Migration Complete Marker
-- ============================================================================

INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('017_create_missing_forecast_views', datetime('now'));

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Views Created: 2
-- - v_predicted_usage_today_v2 (aggregates from v_menu_demand_today_v2)
-- - v_stockout_forecast_v2 (items at risk with risk levels)
-- ============================================================================
