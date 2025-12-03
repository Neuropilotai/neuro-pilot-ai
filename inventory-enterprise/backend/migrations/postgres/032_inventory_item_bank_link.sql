-- ============================================
-- Migration 032: Inventory Item Bank Linkage
-- NeuroPilot AI Enterprise v23.3
-- ============================================
-- Links inventory_items to Item Bank (master_items, supplier_items)
-- Enables "Add by Code" functionality
-- ============================================

-- ============================================
-- ALTER: inventory_items - Add Item Bank FKs
-- ============================================
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS master_item_id INTEGER REFERENCES master_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS item_bank_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ii_master_item ON inventory_items(master_item_id);
CREATE INDEX IF NOT EXISTS idx_ii_supplier_item ON inventory_items(supplier_item_id);

-- ============================================
-- ALTER: fifo_cost_layers - Add Item Bank refs
-- ============================================
ALTER TABLE fifo_cost_layers
ADD COLUMN IF NOT EXISTS master_item_id INTEGER REFERENCES master_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fcl_master_item ON fifo_cost_layers(master_item_id);
CREATE INDEX IF NOT EXISTS idx_fcl_supplier_item ON fifo_cost_layers(supplier_item_id);

-- ============================================
-- ALTER: vendor_order_lines - Add Item Bank refs
-- ============================================
ALTER TABLE vendor_order_lines
ADD COLUMN IF NOT EXISTS supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS item_bank_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS item_bank_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vol_supplier_item ON vendor_order_lines(supplier_item_id);
CREATE INDEX IF NOT EXISTS idx_vol_item_bank ON vendor_order_lines(item_bank_processed);

-- ============================================
-- TABLE: location_item_assignments
-- Bridge table for locations ↔ Item Bank items
-- ============================================
CREATE TABLE IF NOT EXISTS location_item_assignments (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Location reference
    location_id VARCHAR(100) NOT NULL,
    location_name VARCHAR(255),

    -- Item Bank references (at least one required)
    master_item_id INTEGER REFERENCES master_items(id) ON DELETE CASCADE,
    supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE CASCADE,

    -- Denormalized item info for quick display
    item_code VARCHAR(100) NOT NULL,
    item_description TEXT,
    supplier_name VARCHAR(100),

    -- Location-specific settings
    par_level DECIMAL(10,2) DEFAULT 0,
    reorder_point DECIMAL(10,2) DEFAULT 0,
    default_unit_of_measure VARCHAR(50) DEFAULT 'EACH',

    -- Current state (updated by counts)
    quantity_on_hand DECIMAL(10,4) DEFAULT 0,
    last_counted_at TIMESTAMPTZ,
    last_count_id INTEGER,

    -- Price snapshot at time of assignment
    last_known_price_cents INTEGER,
    price_snapshot_date DATE,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    -- Constraints
    CONSTRAINT check_item_ref CHECK (master_item_id IS NOT NULL OR supplier_item_id IS NOT NULL),
    CONSTRAINT unique_location_item UNIQUE (org_id, location_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_lia_org ON location_item_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_lia_location ON location_item_assignments(location_id);
CREATE INDEX IF NOT EXISTS idx_lia_master ON location_item_assignments(master_item_id);
CREATE INDEX IF NOT EXISTS idx_lia_supplier ON location_item_assignments(supplier_item_id);
CREATE INDEX IF NOT EXISTS idx_lia_code ON location_item_assignments(item_code);
CREATE INDEX IF NOT EXISTS idx_lia_active ON location_item_assignments(is_active);

-- ============================================
-- VIEW: location_items_enriched
-- Location items with full Item Bank details
-- ============================================
CREATE OR REPLACE VIEW location_items_enriched AS
SELECT
    lia.id AS assignment_id,
    lia.org_id,
    lia.location_id,
    lia.location_name,
    lia.item_code,
    lia.item_description,
    lia.supplier_name,
    lia.par_level,
    lia.reorder_point,
    lia.quantity_on_hand,
    lia.last_counted_at,
    lia.last_known_price_cents,
    lia.is_active,
    -- Master item details
    mi.id AS master_item_id,
    mi.description AS master_description,
    mi.category AS master_category,
    mi.fifo_category,
    mi.is_perishable,
    -- Supplier item details
    si.id AS supplier_item_id,
    si.vendor_id,
    si.supplier_item_code,
    si.pack_size,
    si.supplier_category,
    -- Latest price from supplier
    sip.unit_price_cents AS current_price_cents,
    sip.effective_date AS current_price_date
FROM location_item_assignments lia
LEFT JOIN master_items mi ON lia.master_item_id = mi.id
LEFT JOIN supplier_items si ON lia.supplier_item_id = si.id
LEFT JOIN LATERAL (
    SELECT unit_price_cents, effective_date
    FROM supplier_item_prices
    WHERE supplier_item_id = lia.supplier_item_id
    ORDER BY effective_date DESC
    LIMIT 1
) sip ON lia.supplier_item_id IS NOT NULL
WHERE lia.is_active = TRUE;

-- ============================================
-- FUNCTION: link_inventory_item_to_bank
-- Links an inventory_item to Item Bank entries
-- ============================================
CREATE OR REPLACE FUNCTION link_inventory_item_to_bank(
    p_item_id INTEGER,
    p_master_item_id INTEGER DEFAULT NULL,
    p_supplier_item_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE inventory_items
    SET
        master_item_id = COALESCE(p_master_item_id, master_item_id),
        supplier_item_id = COALESCE(p_supplier_item_id, supplier_item_id),
        item_bank_linked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE item_id = p_item_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('032_inventory_item_bank_link.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 032_inventory_item_bank_link.sql completed successfully' AS result;
