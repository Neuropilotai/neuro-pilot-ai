-- ============================================
-- Migration 040: Waste Inventory Sync
-- NeuroPilot P1 Hardening
--
-- Purpose: Auto-sync waste entries to inventory levels
-- Scope: Insert/Update/Delete safe triggers with audit trail
-- Safety: Idempotent, org/site scoped, RLS-compatible
-- ============================================

BEGIN;

-- ============================================
-- 1. AUDIT TABLE FOR WASTE ADJUSTMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS waste_inventory_adjustments (
  id BIGSERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  site_id VARCHAR(255),
  item_code TEXT NOT NULL,
  delta NUMERIC(18,4) NOT NULL,
  reason TEXT,
  waste_id BIGINT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying and performance
CREATE INDEX IF NOT EXISTS idx_waste_adj_org ON waste_inventory_adjustments(org_id);
CREATE INDEX IF NOT EXISTS idx_waste_adj_item ON waste_inventory_adjustments(item_code);
CREATE INDEX IF NOT EXISTS idx_waste_adj_occurred ON waste_inventory_adjustments(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_adj_waste_id ON waste_inventory_adjustments(waste_id) WHERE waste_id IS NOT NULL;

COMMENT ON TABLE waste_inventory_adjustments IS 'P1 Hardening: Audit trail for waste-to-inventory sync';
COMMENT ON COLUMN waste_inventory_adjustments.delta IS 'Inventory adjustment (negative = waste reduces stock)';
COMMENT ON COLUMN waste_inventory_adjustments.waste_id IS 'Foreign key to waste table (may be NULL for backfills)';

-- ============================================
-- 2. TRIGGER FUNCTION (INSERT/UPDATE/DELETE SAFE)
-- ============================================

CREATE OR REPLACE FUNCTION apply_waste_to_inventory() RETURNS TRIGGER AS $$
DECLARE
  v_org VARCHAR(255);
  v_site VARCHAR(255);
  v_item TEXT;
  v_delta NUMERIC(18,4);
  v_reason TEXT;
  v_waste_id BIGINT;
  v_rows_updated INTEGER;
BEGIN
  -- Determine operation and extract values
  IF TG_OP = 'INSERT' THEN
    v_org := NEW.org_id;
    v_site := NEW.site_id;
    v_item := NEW.item_code;
    v_delta := COALESCE(NEW.quantity, 0) * -1;  -- Subtract from inventory
    v_reason := NEW.reason;
    v_waste_id := NEW.id;

  ELSIF TG_OP = 'UPDATE' THEN
    v_org := NEW.org_id;
    v_site := NEW.site_id;
    v_item := NEW.item_code;
    -- Net change: if quantity increased, subtract more; if decreased, add back
    v_delta := (COALESCE(OLD.quantity, 0) - COALESCE(NEW.quantity, 0));
    v_reason := COALESCE(NEW.reason, OLD.reason, 'waste_update');
    v_waste_id := NEW.id;

    -- If quantity didn't change, skip inventory update
    IF v_delta = 0 THEN
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
    v_site := OLD.site_id;
    v_item := OLD.item_code;
    v_delta := COALESCE(OLD.quantity, 0);  -- Add back to inventory (undo waste)
    v_reason := OLD.reason || ' (deleted)';
    v_waste_id := OLD.id;

  END IF;

  -- Validate required fields
  IF v_org IS NULL OR v_item IS NULL THEN
    RAISE WARNING 'apply_waste_to_inventory: Missing org_id or item_code, skipping';
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Update inventory_items (org/site scoped)
  UPDATE inventory_items
  SET
    current_quantity = COALESCE(current_quantity, 0) + v_delta,
    updated_at = now()
  WHERE
    org_id = v_org
    AND (site_id IS NOT DISTINCT FROM v_site)
    AND item_code = v_item;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Log the adjustment (even if no inventory_item exists yet - may be future item)
  INSERT INTO waste_inventory_adjustments(
    org_id,
    site_id,
    item_code,
    delta,
    reason,
    waste_id,
    occurred_at
  )
  VALUES (
    v_org,
    v_site,
    v_item,
    v_delta,
    v_reason,
    v_waste_id,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.logged_at
      ELSE NEW.logged_at
    END
  );

  -- Log warning if inventory item not found (common during initial data entry)
  IF v_rows_updated = 0 THEN
    RAISE NOTICE 'apply_waste_to_inventory: No inventory_item found for org=%, item=% (adjustment logged)',
      v_org, v_item;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. TRIGGERS (DROP + CREATE FOR IDEMPOTENCY)
-- ============================================

DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_ins ON waste;
DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_upd ON waste;
DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_del ON waste;

CREATE TRIGGER trg_apply_waste_to_inventory_ins
  AFTER INSERT ON waste
  FOR EACH ROW
  EXECUTE FUNCTION apply_waste_to_inventory();

CREATE TRIGGER trg_apply_waste_to_inventory_upd
  AFTER UPDATE ON waste
  FOR EACH ROW
  EXECUTE FUNCTION apply_waste_to_inventory();

CREATE TRIGGER trg_apply_waste_to_inventory_del
  AFTER DELETE ON waste
  FOR EACH ROW
  EXECUTE FUNCTION apply_waste_to_inventory();

-- ============================================
-- 4. HELPER VIEW FOR WASTE IMPACT SUMMARY
-- ============================================

CREATE OR REPLACE VIEW waste_impact_summary AS
SELECT
  w.org_id,
  w.site_id,
  w.item_code,
  COUNT(*) as waste_entries,
  SUM(w.quantity) as total_waste_quantity,
  SUM(w.cost_impact) as total_cost_impact,
  MAX(w.logged_at) as last_waste_date,
  SUM(wia.delta * -1) as total_inventory_adjustment
FROM waste w
LEFT JOIN waste_inventory_adjustments wia
  ON wia.waste_id = w.id
GROUP BY w.org_id, w.site_id, w.item_code;

COMMENT ON VIEW waste_impact_summary IS 'P1: Summary of waste impact per item with adjustment verification';

-- ============================================
-- 5. BACKFILL CHECKPOINT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS waste_backfill_runs (
  id SERIAL PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  org_id VARCHAR(255),
  items_processed INTEGER DEFAULT 0,
  adjustments_created INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_org ON waste_backfill_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_backfill_runs_date ON waste_backfill_runs(from_date, to_date);

COMMENT ON TABLE waste_backfill_runs IS 'P1: Checkpoint table for idempotent waste backfill operations';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 040: Waste Inventory Sync - COMPLETE';
  RAISE NOTICE '   - waste_inventory_adjustments table created';
  RAISE NOTICE '   - Triggers installed (INSERT/UPDATE/DELETE)';
  RAISE NOTICE '   - waste_impact_summary view available';
  RAISE NOTICE '   - waste_backfill_runs checkpoint table ready';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Next Steps:';
  RAISE NOTICE '   1. Run backfill script: npm run backfill-waste --days=30';
  RAISE NOTICE '   2. Verify adjustments: SELECT * FROM waste_inventory_adjustments LIMIT 10;';
  RAISE NOTICE '   3. Check impact: SELECT * FROM waste_impact_summary;';
END $$;

COMMIT;
