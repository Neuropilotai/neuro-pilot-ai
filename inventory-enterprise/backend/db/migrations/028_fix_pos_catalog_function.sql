-- ============================================
-- Migration 028: Fix POS Catalog Function
-- Corrects table reference from 'items' to 'inventory_items'
-- Uses correct column names: item_code, item_name, current_quantity
-- Creates both INTEGER and TEXT function signatures for flexibility
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- First drop any existing functions
DROP FUNCTION IF EXISTS get_sellable_items(INTEGER, INTEGER, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_sellable_items(TEXT, TEXT, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_sellable_recipes(INTEGER, INTEGER, TEXT, DECIMAL, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_sellable_recipes(TEXT, TEXT, TEXT, DECIMAL, INTEGER, INTEGER) CASCADE;

-- INTEGER version for backwards compatibility
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
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    ii.item_code::VARCHAR as sku,
    ii.item_name::VARCHAR as name,
    COALESCE(ii.category, 'General')::VARCHAR,
    COALESCE(ii.unit, 'EA')::VARCHAR as uom,
    0::INTEGER as current_price_cents,
    'N/A'::VARCHAR as vendor_name,
    COALESCE(ii.current_quantity > 0, false) as in_stock
  FROM inventory_items ii
  WHERE ii.org_id = p_org::TEXT
    AND ii.is_active = 1
    AND (p_search IS NULL OR ii.item_name ILIKE '%' || p_search || '%' OR ii.item_code ILIKE '%' || p_search || '%')
  ORDER BY ii.item_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$func$ LANGUAGE plpgsql;

-- TEXT version for modern org_id handling
CREATE OR REPLACE FUNCTION get_sellable_items(
  p_org TEXT,
  p_site TEXT,
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
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    ii.item_code::VARCHAR as sku,
    ii.item_name::VARCHAR as name,
    COALESCE(ii.category, 'General')::VARCHAR,
    COALESCE(ii.unit, 'EA')::VARCHAR as uom,
    0::INTEGER as current_price_cents,
    'N/A'::VARCHAR as vendor_name,
    COALESCE(ii.current_quantity > 0, false) as in_stock
  FROM inventory_items ii
  WHERE ii.org_id = p_org
    AND ii.is_active = 1
    AND (p_search IS NULL OR ii.item_name ILIKE '%' || p_search || '%' OR ii.item_code ILIKE '%' || p_search || '%')
  ORDER BY ii.item_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$func$ LANGUAGE plpgsql;

-- INTEGER version for recipes
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
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    r.code::VARCHAR,
    r.name::VARCHAR,
    'Recipe'::VARCHAR as category,
    COALESCE(r.yield_qty, 1)::DECIMAL as portion_size,
    COALESCE(r.yield_uom, 'EA')::VARCHAR as portion_uom,
    0::INTEGER as cost_cents,
    0::INTEGER as suggested_price_cents
  FROM recipes r
  WHERE r.org_id = p_org::TEXT
    AND (r.site_id IS NULL OR r.site_id = p_site::TEXT)
    AND r.active = true
    AND (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.code ILIKE '%' || p_search || '%')
  ORDER BY r.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$func$ LANGUAGE plpgsql;

-- TEXT version for recipes
CREATE OR REPLACE FUNCTION get_sellable_recipes(
  p_org TEXT,
  p_site TEXT,
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
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    r.code::VARCHAR,
    r.name::VARCHAR,
    'Recipe'::VARCHAR as category,
    COALESCE(r.yield_qty, 1)::DECIMAL as portion_size,
    COALESCE(r.yield_uom, 'EA')::VARCHAR as portion_uom,
    0::INTEGER as cost_cents,
    0::INTEGER as suggested_price_cents
  FROM recipes r
  WHERE r.org_id = p_org
    AND (r.site_id IS NULL OR r.site_id = p_site)
    AND r.active = true
    AND (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.code ILIKE '%' || p_search || '%')
  ORDER BY r.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$func$ LANGUAGE plpgsql;

-- Migration complete
DO $$
BEGIN
  RAISE NOTICE '028: POS Catalog Function Fix - COMPLETE';
END $$;
