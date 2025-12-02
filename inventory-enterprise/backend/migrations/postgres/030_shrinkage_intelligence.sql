-- ============================================
-- Migration 030: Shrinkage & Variance Intelligence V1
-- NeuroPilot AI Enterprise V22.3
--
-- Computes unexplained shrinkage per item per period:
--   shrinkage = opening + received - waste - closing
--
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. HELPER FUNCTION: Get item unit cost (latest FIFO)
-- ============================================

CREATE OR REPLACE FUNCTION get_item_unit_cost(p_item_code VARCHAR, p_org_id VARCHAR DEFAULT 'default-org')
RETURNS DECIMAL(12,4) AS $$
DECLARE
  v_cost DECIMAL(12,4);
BEGIN
  SELECT unit_cost INTO v_cost
  FROM fifo_cost_layers
  WHERE item_code = p_item_code
    AND (org_id = p_org_id OR org_id IS NULL)
    AND quantity_remaining > 0
  ORDER BY received_date DESC, created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_cost, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 2. SHRINKAGE CALCULATION VIEW
-- ============================================

-- Drop existing view if exists (for idempotent re-runs)
DROP MATERIALIZED VIEW IF EXISTS mv_item_shrinkage_weekly CASCADE;

CREATE MATERIALIZED VIEW mv_item_shrinkage_weekly AS
WITH
-- Define weekly periods (last 12 weeks)
periods AS (
  SELECT
    date_trunc('week', d)::date AS period_start,
    (date_trunc('week', d) + interval '6 days')::date AS period_end,
    EXTRACT(WEEK FROM d) AS week_num,
    EXTRACT(YEAR FROM d) AS year_num
  FROM generate_series(
    date_trunc('week', NOW() - interval '12 weeks')::date,
    date_trunc('week', NOW())::date,
    interval '1 week'
  ) d
),

-- Get all active items
items AS (
  SELECT DISTINCT
    item_code,
    item_name,
    category,
    unit,
    COALESCE(org_id, 'default-org') AS org_id
  FROM inventory_items
  WHERE is_active = 1
),

-- Cross join to get all item-period combinations
item_periods AS (
  SELECT
    i.item_code,
    i.item_name,
    i.category,
    i.unit,
    i.org_id,
    p.period_start,
    p.period_end,
    p.week_num,
    p.year_num
  FROM items i
  CROSS JOIN periods p
),

-- Received quantities from FIFO layers
received AS (
  SELECT
    item_code,
    COALESCE(org_id, 'default-org') AS org_id,
    date_trunc('week', received_date)::date AS period_start,
    SUM(quantity_received) AS qty_received,
    SUM(quantity_received * unit_cost) AS value_received
  FROM fifo_cost_layers
  WHERE received_date >= NOW() - interval '12 weeks'
  GROUP BY item_code, org_id, date_trunc('week', received_date)
),

-- Opening counts (count at start of period)
opening_counts AS (
  SELECT DISTINCT ON (icr.item_code, date_trunc('week', ic.created_at))
    icr.item_code,
    COALESCE(ic.org_id, 'default-org') AS org_id,
    date_trunc('week', ic.created_at)::date AS period_start,
    icr.counted_qty AS qty_counted
  FROM inventory_count_rows icr
  JOIN inventory_counts ic ON ic.id = icr.count_id
  WHERE ic.created_at >= NOW() - interval '12 weeks'
    AND ic.status IN ('closed', 'approved')
  ORDER BY icr.item_code, date_trunc('week', ic.created_at), ic.created_at ASC
),

-- Closing counts (count at end of period)
closing_counts AS (
  SELECT DISTINCT ON (icr.item_code, date_trunc('week', ic.created_at))
    icr.item_code,
    COALESCE(ic.org_id, 'default-org') AS org_id,
    date_trunc('week', ic.created_at)::date AS period_start,
    icr.counted_qty AS qty_counted
  FROM inventory_count_rows icr
  JOIN inventory_counts ic ON ic.id = icr.count_id
  WHERE ic.created_at >= NOW() - interval '12 weeks'
    AND ic.status IN ('closed', 'approved')
  ORDER BY icr.item_code, date_trunc('week', ic.created_at), ic.created_at DESC
),

-- Waste logs aggregated by period
waste AS (
  SELECT
    item_code,
    COALESCE(org_id, 'default-org') AS org_id,
    date_trunc('week', waste_date)::date AS period_start,
    SUM(quantity) AS qty_wasted,
    SUM(COALESCE(value_cents, 0)) / 100.0 AS value_wasted
  FROM waste_logs
  WHERE waste_date >= NOW() - interval '12 weeks'
    AND deleted_at IS NULL
  GROUP BY item_code, org_id, date_trunc('week', waste_date)
)

-- Final shrinkage calculation
SELECT
  ip.item_code,
  ip.item_name,
  ip.category,
  ip.unit,
  ip.org_id,
  ip.period_start,
  ip.period_end,
  ip.week_num,
  ip.year_num,

  -- Quantities
  COALESCE(oc.qty_counted, 0) AS qty_counted_start,
  COALESCE(r.qty_received, 0) AS qty_received,
  COALESCE(w.qty_wasted, 0) AS qty_wasted,
  COALESCE(cc.qty_counted, 0) AS qty_counted_end,

  -- Theoretical available = opening + received - waste
  COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) - COALESCE(w.qty_wasted, 0) AS qty_theoretical_available,

  -- Unexplained shrinkage = theoretical - actual closing
  GREATEST(0,
    COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) - COALESCE(w.qty_wasted, 0) - COALESCE(cc.qty_counted, 0)
  ) AS qty_unexplained_shrinkage,

  -- Shrinkage percentage (of theoretical available)
  CASE
    WHEN (COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) - COALESCE(w.qty_wasted, 0)) > 0 THEN
      ROUND(
        GREATEST(0,
          COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) - COALESCE(w.qty_wasted, 0) - COALESCE(cc.qty_counted, 0)
        ) * 100.0 /
        (COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) - COALESCE(w.qty_wasted, 0))
      , 2)
    ELSE 0
  END AS shrinkage_percent,

  -- Values (using latest FIFO cost)
  COALESCE(r.value_received, 0) AS value_received,
  COALESCE(w.value_wasted, 0) AS value_wasted,

  -- Flags for data quality
  CASE WHEN oc.qty_counted IS NOT NULL THEN true ELSE false END AS has_opening_count,
  CASE WHEN cc.qty_counted IS NOT NULL THEN true ELSE false END AS has_closing_count,
  CASE WHEN r.qty_received IS NOT NULL THEN true ELSE false END AS has_receipts,

  NOW() AS calculated_at

FROM item_periods ip
LEFT JOIN received r ON r.item_code = ip.item_code
  AND r.org_id = ip.org_id
  AND r.period_start = ip.period_start
LEFT JOIN opening_counts oc ON oc.item_code = ip.item_code
  AND oc.org_id = ip.org_id
  AND oc.period_start = ip.period_start
LEFT JOIN closing_counts cc ON cc.item_code = ip.item_code
  AND cc.org_id = ip.org_id
  AND cc.period_start = ip.period_start
LEFT JOIN waste w ON w.item_code = ip.item_code
  AND w.org_id = ip.org_id
  AND w.period_start = ip.period_start

-- Only include rows with some activity
WHERE COALESCE(oc.qty_counted, 0) + COALESCE(r.qty_received, 0) +
      COALESCE(w.qty_wasted, 0) + COALESCE(cc.qty_counted, 0) > 0;

-- ============================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_shrinkage_item_period
ON mv_item_shrinkage_weekly(item_code, period_start);

CREATE INDEX IF NOT EXISTS idx_shrinkage_category
ON mv_item_shrinkage_weekly(category);

CREATE INDEX IF NOT EXISTS idx_shrinkage_percent
ON mv_item_shrinkage_weekly(shrinkage_percent DESC);

CREATE INDEX IF NOT EXISTS idx_shrinkage_org_period
ON mv_item_shrinkage_weekly(org_id, period_start);

-- ============================================
-- 4. SUPPORTING INDEXES ON SOURCE TABLES
-- ============================================

-- Index on waste_logs for shrinkage queries
CREATE INDEX IF NOT EXISTS idx_waste_logs_item_date
ON waste_logs(item_code, waste_date)
WHERE deleted_at IS NULL;

-- Index on inventory_count_rows for item lookups
CREATE INDEX IF NOT EXISTS idx_count_rows_item
ON inventory_count_rows(item_code);

-- Index on fifo_cost_layers for received queries
CREATE INDEX IF NOT EXISTS idx_fifo_received_date
ON fifo_cost_layers(received_date, item_code);

-- ============================================
-- 5. REFRESH FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION refresh_shrinkage_view()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_item_shrinkage_weekly;

  -- Log the refresh
  INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
  VALUES ('shrinkage_view_refreshed', jsonb_build_object(
    'refreshed_at', NOW(),
    'rows_count', (SELECT COUNT(*) FROM mv_item_shrinkage_weekly)
  ), NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. AGGREGATED SHRINKAGE BY CATEGORY VIEW
-- ============================================

CREATE OR REPLACE VIEW v_shrinkage_by_category AS
SELECT
  category,
  org_id,
  period_start,
  period_end,
  COUNT(DISTINCT item_code) AS item_count,
  SUM(qty_received) AS total_qty_received,
  SUM(qty_wasted) AS total_qty_wasted,
  SUM(qty_unexplained_shrinkage) AS total_qty_shrinkage,
  CASE
    WHEN SUM(qty_theoretical_available) > 0 THEN
      ROUND(SUM(qty_unexplained_shrinkage) * 100.0 / SUM(qty_theoretical_available), 2)
    ELSE 0
  END AS category_shrinkage_percent,
  SUM(value_received) AS total_value_received,
  SUM(value_wasted) AS total_value_wasted
FROM mv_item_shrinkage_weekly
GROUP BY category, org_id, period_start, period_end;

-- ============================================
-- 7. COMMENTS
-- ============================================

COMMENT ON MATERIALIZED VIEW mv_item_shrinkage_weekly IS
'Weekly shrinkage analysis per item. Formula: shrinkage = opening + received - waste - closing';

COMMENT ON VIEW v_shrinkage_by_category IS
'Aggregated shrinkage metrics by category per period';

COMMENT ON FUNCTION refresh_shrinkage_view() IS
'Refreshes the shrinkage materialized view. Call daily or after inventory counts.';

-- ============================================
-- 8. INITIAL UNIQUE INDEX FOR CONCURRENT REFRESH
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_shrinkage_unique
ON mv_item_shrinkage_weekly(item_code, org_id, period_start);

-- ============================================
-- 9. RECORD MIGRATION
-- ============================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('030', 'shrinkage_intelligence', NOW())
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 030: Shrinkage & Variance Intelligence V1 - COMPLETE';
END $$;
