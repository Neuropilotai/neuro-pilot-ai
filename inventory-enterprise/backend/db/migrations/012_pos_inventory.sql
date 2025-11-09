-- ============================================
-- Migration 012: POS Inventory Integration
-- Bridges POS sales to inventory decrements
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. INVENTORY DELTAS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS pos_inventory_deltas (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  order_line_id INTEGER NOT NULL REFERENCES pos_order_lines(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  item_sku VARCHAR(100) NOT NULL,
  delta_qty DECIMAL(10,3) NOT NULL, -- negative for sales
  uom VARCHAR(20) NOT NULL DEFAULT 'EA',
  reason VARCHAR(50) NOT NULL DEFAULT 'sale',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_line_id, item_sku)
);

CREATE INDEX IF NOT EXISTS idx_pos_inventory_deltas_order_line ON pos_inventory_deltas(order_line_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_deltas_order ON pos_inventory_deltas(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_deltas_item_sku ON pos_inventory_deltas(item_sku);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_deltas_org_site ON pos_inventory_deltas(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_deltas_applied_at ON pos_inventory_deltas(applied_at);

-- ============================================
-- 2. INVENTORY APPLICATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION apply_pos_inventory(p_order_id INTEGER)
RETURNS TABLE(
  lines_processed INTEGER,
  items_decremented INTEGER,
  recipes_expanded INTEGER
) AS $$
DECLARE
  v_line RECORD;
  v_recipe_item RECORD;
  v_org_id INTEGER;
  v_site_id INTEGER;
  v_default_location INTEGER;
  v_lines_processed INTEGER := 0;
  v_items_decremented INTEGER := 0;
  v_recipes_expanded INTEGER := 0;
BEGIN
  -- Get order org/site
  SELECT org_id, site_id INTO v_org_id, v_site_id
  FROM pos_orders
  WHERE id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Get default sale location from settings
  SELECT (value->>'default_sale_location_id')::INTEGER INTO v_default_location
  FROM pos_settings
  WHERE org_id = v_org_id
    AND site_id = v_site_id
    AND key = 'default_sale_location_id';

  IF v_default_location IS NULL THEN
    v_default_location := 1; -- fallback
  END IF;

  -- Process each order line
  FOR v_line IN
    SELECT *
    FROM pos_order_lines
    WHERE order_id = p_order_id
    ORDER BY line_no
  LOOP
    v_lines_processed := v_lines_processed + 1;

    IF v_line.kind = 'item' THEN
      -- Direct item sale: decrement inventory
      INSERT INTO pos_inventory_deltas (
        org_id,
        site_id,
        order_line_id,
        order_id,
        item_sku,
        delta_qty,
        uom,
        reason
      ) VALUES (
        v_org_id,
        v_site_id,
        v_line.id,
        p_order_id,
        v_line.sku_or_code,
        -v_line.qty, -- negative for decrement
        v_line.uom,
        'sale'
      )
      ON CONFLICT (order_line_id, item_sku) DO NOTHING;

      v_items_decremented := v_items_decremented + 1;

    ELSIF v_line.kind = 'recipe' THEN
      -- Recipe sale: expand BOM and decrement ingredients
      v_recipes_expanded := v_recipes_expanded + 1;

      FOR v_recipe_item IN
        SELECT
          ri.item_sku,
          ri.qty as recipe_qty,
          ri.uom
        FROM recipe_items ri
        JOIN recipes r ON r.id = ri.recipe_id
        WHERE r.code = v_line.sku_or_code
      LOOP
        INSERT INTO pos_inventory_deltas (
          org_id,
          site_id,
          order_line_id,
          order_id,
          item_sku,
          delta_qty,
          uom,
          reason
        ) VALUES (
          v_org_id,
          v_site_id,
          v_line.id,
          p_order_id,
          v_recipe_item.item_sku,
          -(v_line.qty * v_recipe_item.recipe_qty), -- negative for decrement
          v_recipe_item.uom,
          'sale'
        )
        ON CONFLICT (order_line_id, item_sku) DO NOTHING;

        v_items_decremented := v_items_decremented + 1;
      END LOOP;

    END IF;
    -- kind='misc' → no inventory impact
  END LOOP;

  RETURN QUERY SELECT v_lines_processed, v_items_decremented, v_recipes_expanded;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. TRIGGER: AUTO-APPLY INVENTORY ON PAYMENT
-- ============================================

CREATE OR REPLACE FUNCTION trigger_apply_pos_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Only apply inventory when order transitions to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Call apply_pos_inventory function
    SELECT * INTO v_result FROM apply_pos_inventory(NEW.id);

    RAISE NOTICE 'POS inventory applied for order %: % lines, % items, % recipes',
      NEW.id, v_result.lines_processed, v_result.items_decremented, v_result.recipes_expanded;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pos_order_paid_inventory') THEN
    CREATE TRIGGER pos_order_paid_inventory
      AFTER UPDATE ON pos_orders
      FOR EACH ROW
      EXECUTE FUNCTION trigger_apply_pos_inventory();
  END IF;
END $$;

-- ============================================
-- 4. INVENTORY RECONCILIATION VIEW
-- ============================================

-- View to see POS sales impact on inventory
CREATE OR REPLACE VIEW vw_pos_inventory_impact AS
SELECT
  pid.org_id,
  pid.site_id,
  pid.item_sku,
  pid.uom,
  COUNT(DISTINCT pid.order_id) as order_count,
  SUM(pid.delta_qty) as total_qty_decremented,
  MIN(pid.applied_at) as first_sale,
  MAX(pid.applied_at) as last_sale,
  COUNT(*) as delta_count
FROM pos_inventory_deltas pid
GROUP BY
  pid.org_id,
  pid.site_id,
  pid.item_sku,
  pid.uom;

-- ============================================
-- 5. HELPER FUNCTION: GET SELLABLE ITEMS
-- ============================================

-- Function to get items flagged as sellable with current prices
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
    i.sku::VARCHAR,
    i.name::VARCHAR,
    i.category::VARCHAR,
    i.uom::VARCHAR,
    COALESCE(
      (SELECT (get_current_vendor_price(i.sku)).price * 100)::INTEGER,
      0
    ) as current_price_cents,
    COALESCE(
      (SELECT (get_current_vendor_price(i.sku)).vendor_name)::VARCHAR,
      'N/A'
    ) as vendor_name,
    COALESCE(i.qty_on_hand > 0, false) as in_stock
  FROM items i
  WHERE i.org_id = p_org
    AND i.site_id = p_site
    AND (p_search IS NULL OR i.name ILIKE '%' || p_search || '%' OR i.sku ILIKE '%' || p_search || '%')
  ORDER BY i.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. HELPER FUNCTION: GET SELLABLE RECIPES
-- ============================================

-- Function to get recipes flagged as sellable with costs
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
  RETURN QUERY
  SELECT
    r.code::VARCHAR,
    r.name::VARCHAR,
    COALESCE(r.category, 'General')::VARCHAR,
    r.portion_size,
    r.portion_uom::VARCHAR,
    COALESCE(
      (SELECT (calculate_recipe_cost(r.code)).total_cost * 100)::INTEGER,
      0
    ) as cost_cents,
    COALESCE(
      (SELECT (calculate_recipe_cost(r.code)).total_cost * p_markup * 100)::INTEGER,
      0
    ) as suggested_price_cents
  FROM recipes r
  WHERE r.org_id = p_org
    AND r.site_id = p_site
    AND (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.code ILIKE '%' || p_search || '%')
  ORDER BY r.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. AUDIT TABLE FOR POS EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_audit_log (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  event_type VARCHAR(50) NOT NULL,
  user_id INTEGER,
  register_id INTEGER,
  shift_id INTEGER,
  order_id INTEGER,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_audit_log_org_site ON pos_audit_log(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_audit_log_event_type ON pos_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_pos_audit_log_user ON pos_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_pos_audit_log_created_at ON pos_audit_log(created_at);

-- Migration complete
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 012: POS Inventory Integration - COMPLETE';
END $$;
