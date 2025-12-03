-- ============================================
-- Migration 034: Vendor Order Cases Item Bank Integration
-- NeuroPilot AI Enterprise v23.3
-- ============================================
-- Links vendor_order_cases to Item Bank entries
-- Enables full traceability: invoice -> case -> Item Bank -> FIFO
-- ============================================

-- ============================================
-- ALTER: vendor_order_cases - Add Item Bank refs
-- ============================================
ALTER TABLE vendor_order_cases
ADD COLUMN IF NOT EXISTS master_item_id INTEGER REFERENCES master_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voc_master_item ON vendor_order_cases(master_item_id);
CREATE INDEX IF NOT EXISTS idx_voc_supplier_item ON vendor_order_cases(supplier_item_id);

-- ============================================
-- VIEW: vendor_order_cases_enriched
-- Cases with full Item Bank and FIFO details
-- ============================================
CREATE OR REPLACE VIEW vendor_order_cases_enriched AS
SELECT
    voc.id AS case_id,
    voc.order_id,
    voc.line_id,
    voc.org_id,
    voc.item_code,
    voc.case_number,
    voc.box_id,
    voc.weight_kg,
    voc.weight_lb,
    voc.weight_unit,
    voc.sequence_number,
    voc.status,
    voc.consumed_at,
    voc.consumed_by,
    voc.created_at,
    -- FIFO Layer details
    voc.fifo_layer_id,
    fcl.unit_cost AS fifo_unit_cost,
    fcl.received_date AS fifo_received_date,
    fcl.quantity_remaining AS fifo_qty_remaining,
    -- Item Bank - Master Item
    voc.master_item_id,
    mi.description AS master_description,
    mi.category AS master_category,
    mi.fifo_category,
    mi.is_perishable,
    -- Item Bank - Supplier Item
    voc.supplier_item_id,
    si.supplier_item_code,
    si.description AS supplier_description,
    si.pack_size,
    si.vendor_id,
    v.name AS vendor_name,
    -- Latest price
    (
        SELECT unit_price_cents
        FROM supplier_item_prices sip
        WHERE sip.supplier_item_id = voc.supplier_item_id
        ORDER BY effective_date DESC
        LIMIT 1
    ) AS latest_price_cents
FROM vendor_order_cases voc
LEFT JOIN fifo_cost_layers fcl ON voc.fifo_layer_id = fcl.layer_id
LEFT JOIN master_items mi ON voc.master_item_id = mi.id
LEFT JOIN supplier_items si ON voc.supplier_item_id = si.id
LEFT JOIN vendors v ON si.vendor_id = v.id;

-- ============================================
-- FUNCTION: backfill_case_item_bank_refs
-- Backfills Item Bank refs for existing cases
-- ============================================
CREATE OR REPLACE FUNCTION backfill_case_item_bank_refs() RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    -- Update cases from their associated FIFO layers
    UPDATE vendor_order_cases voc
    SET
        supplier_item_id = fcl.supplier_item_id,
        master_item_id = fcl.master_item_id
    FROM fifo_cost_layers fcl
    WHERE voc.fifo_layer_id = fcl.layer_id
      AND voc.supplier_item_id IS NULL
      AND (fcl.supplier_item_id IS NOT NULL OR fcl.master_item_id IS NOT NULL);

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Also try to match by item_code through supplier_items
    UPDATE vendor_order_cases voc
    SET supplier_item_id = si.id
    FROM supplier_items si
    WHERE voc.item_code = si.supplier_item_code
      AND voc.supplier_item_id IS NULL
      AND si.is_active = TRUE;

    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('034_vendor_order_cases_item_bank.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 034_vendor_order_cases_item_bank.sql completed successfully' AS result;
