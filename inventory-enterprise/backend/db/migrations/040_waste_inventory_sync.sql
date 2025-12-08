-- 040_waste_inventory_sync.sql
BEGIN;
-- Ensure audit table exists
CREATE TABLE IF NOT EXISTS waste_inventory_adjustments (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  item_code TEXT NOT NULL,
  delta NUMERIC(18,4) NOT NULL,
  reason TEXT,
  waste_id BIGINT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_waste_adj_org ON waste_inventory_adjustments(org_id);
CREATE INDEX IF NOT EXISTS idx_waste_adj_site ON waste_inventory_adjustments(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waste_adj_item ON waste_inventory_adjustments(item_code);
CREATE INDEX IF NOT EXISTS idx_waste_adj_occurred ON waste_inventory_adjustments(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_adj_waste_id ON waste_inventory_adjustments(waste_id) WHERE waste_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waste_adj_org_site_item ON waste_inventory_adjustments(org_id, site_id, item_code);

COMMENT ON TABLE waste_inventory_adjustments IS 'P1 Hardening: Audit trail for waste-to-inventory sync';
COMMENT ON COLUMN waste_inventory_adjustments.delta IS 'Inventory adjustment (negative = waste reduces stock)';
COMMENT ON COLUMN waste_inventory_adjustments.waste_id IS 'Foreign key to waste table (may be NULL for backfills)';

-- Trigger function (handles insert/update/delete with idempotency)
CREATE OR REPLACE FUNCTION apply_waste_to_inventory() RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
  v_site UUID;
  v_item TEXT;
  v_delta NUMERIC(18,4);
  v_reason TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := NEW.org_id; v_site := NEW.site_id; v_item := NEW.item_code;
    v_delta := COALESCE(NEW.quantity,0) * -1;        -- subtract on-hand
    v_reason := NEW.reason;
  ELSIF TG_OP = 'UPDATE' THEN
    v_org := NEW.org_id; v_site := NEW.site_id; v_item := NEW.item_code;
    v_delta := COALESCE(NEW.quantity,0) - COALESCE(OLD.quantity,0);
    v_delta := v_delta * -1;                         -- net change since old
    v_reason := COALESCE(NEW.reason, OLD.reason);
  ELSIF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id; v_site := OLD.site_id; v_item := OLD.item_code;
    v_delta := COALESCE(OLD.quantity,0);             -- delete = undo subtraction
    v_reason := OLD.reason;
  END IF;

  -- Optional: enforce unit normalization later; assume quantity is in stock unit for now.

  UPDATE inventory_items
  SET current_quantity = COALESCE(current_quantity,0) + v_delta,
      updated_at = now()
  WHERE org_id = v_org AND (site_id IS NOT DISTINCT FROM v_site) AND item_code = v_item;

  INSERT INTO waste_inventory_adjustments(org_id, site_id, item_code, delta, reason, waste_id)
  VALUES (v_org, v_site, v_item, v_delta, v_reason,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_ins ON waste;
DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_upd ON waste;
DROP TRIGGER IF EXISTS trg_apply_waste_to_inventory_del ON waste;

CREATE TRIGGER trg_apply_waste_to_inventory_ins AFTER INSERT ON waste
  FOR EACH ROW EXECUTE FUNCTION apply_waste_to_inventory();
CREATE TRIGGER trg_apply_waste_to_inventory_upd AFTER UPDATE ON waste
  FOR EACH ROW EXECUTE FUNCTION apply_waste_to_inventory();
CREATE TRIGGER trg_apply_waste_to_inventory_del AFTER DELETE ON waste
  FOR EACH ROW EXECUTE FUNCTION apply_waste_to_inventory();

COMMIT;

