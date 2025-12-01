-- ============================================
-- Migration 028: Fix POS Catalog Function
-- Corrects table reference from 'items' to 'inventory_items'
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- Fix get_sellable_items to reference inventory_items table
CREATE OR REPLACE FUNCTION get_sellable_items(
  p_org INTEGER,
  p_site INTEGER,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  sku VARCHAR,
  name VARCHAR,
  category VARCHAR,
  uom VARCHAR,
  current_price_cents INTEGER,
  vendor_name VARCHAR,
  in_stock BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ii.sku::VARCHAR,
    ii.name::VARCHAR,
    COALESCE(ii.category, 'General')::VARCHAR,
    COALESCE(ii.unit, 'EA')::VARCHAR as uom,
    COALESCE(ii.unit_cost_cents, 0)::INTEGER as current_price_cents,
    COALESCE(ii.preferred_vendor, 'N/A')::VARCHAR as vendor_name,
    COALESCE(ii.qty_on_hand > 0, false) as in_stock
  FROM inventory_items ii
  WHERE ii.org_id = p_org::VARCHAR
    AND (ii.site_id IS NULL OR ii.site_id = p_site::VARCHAR)
    AND ii.is_active = 1
    AND (p_search IS NULL OR ii.name ILIKE '%' || p_search || '%' OR ii.sku ILIKE '%' || p_search || '%')
  ORDER BY ii.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Also fix get_sellable_recipes if recipes table doesn't exist, make it return empty
CREATE OR REPLACE FUNCTION get_sellable_recipes(
  p_org INTEGER,
  p_site INTEGER,
  p_search TEXT DEFAULT NULL,
  p_markup DECIMAL DEFAULT 1.30,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  code VARCHAR,
  name VARCHAR,
  category VARCHAR,
  portion_size DECIMAL,
  portion_uom VARCHAR,
  cost_cents INTEGER,
  suggested_price_cents INTEGER
) AS $$
BEGIN
  -- Check if recipes table exists and has data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes') THEN
    RETURN QUERY
    SELECT
      r.code::VARCHAR,
      r.name::VARCHAR,
      COALESCE(r.category, 'General')::VARCHAR,
      COALESCE(r.portion_size, 1)::DECIMAL,
      COALESCE(r.portion_uom, 'EA')::VARCHAR,
      COALESCE(r.cost_cents, 0)::INTEGER,
      COALESCE((r.cost_cents * p_markup)::INTEGER, 0) as suggested_price_cents
    FROM recipes r
    WHERE r.org_id = p_org::VARCHAR
      AND (r.site_id IS NULL OR r.site_id = p_site::VARCHAR)
      AND (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.code ILIKE '%' || p_search || '%')
    ORDER BY r.name
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Migration complete
DO $$
BEGIN
  RAISE NOTICE '028: POS Catalog Function Fix - COMPLETE';
END $$;
