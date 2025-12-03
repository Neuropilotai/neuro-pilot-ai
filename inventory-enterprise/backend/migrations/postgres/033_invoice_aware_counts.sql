-- ============================================
-- Migration 033: Invoice-Aware Counts
-- NeuroPilot AI Enterprise v23.3
-- ============================================
-- Links inventory counts to specific vendor_orders (invoices)
-- Allows excluding specific invoices from theoretical quantity calculations
-- ============================================

-- ============================================
-- TABLE: inventory_count_invoices
-- Links counts to the invoices that arrived before/during count
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_count_invoices (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Count reference
    count_id INTEGER NOT NULL,
    -- Note: References inventory_counts but FK constraint relaxed for flexibility

    -- Invoice reference
    vendor_order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,

    -- Link metadata
    linked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    linked_by VARCHAR(255),

    -- Exclusion flag - if TRUE, this invoice is excluded from theoretical qty
    is_excluded BOOLEAN DEFAULT FALSE,
    excluded_at TIMESTAMPTZ,
    excluded_by VARCHAR(255),
    exclusion_reason TEXT,

    -- Snapshot of invoice details at link time
    invoice_order_number VARCHAR(100),
    invoice_order_date DATE,
    invoice_vendor_name VARCHAR(255),
    invoice_total_cents INTEGER,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_count_invoice UNIQUE (org_id, count_id, vendor_order_id)
);

CREATE INDEX IF NOT EXISTS idx_ici_org ON inventory_count_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_ici_count ON inventory_count_invoices(count_id);
CREATE INDEX IF NOT EXISTS idx_ici_order ON inventory_count_invoices(vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_ici_excluded ON inventory_count_invoices(is_excluded);

-- ============================================
-- TABLE: count_theoretical_snapshots
-- Stores theoretical quantity calculations for variance analysis
-- ============================================
CREATE TABLE IF NOT EXISTS count_theoretical_snapshots (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Count reference
    count_id INTEGER NOT NULL,
    count_line_id INTEGER,

    -- Item identification
    item_code VARCHAR(100) NOT NULL,
    item_description TEXT,
    location_id VARCHAR(100),

    -- Theoretical calculation
    opening_quantity DECIMAL(10,4) DEFAULT 0,
    -- Quantity from last approved count

    received_quantity DECIMAL(10,4) DEFAULT 0,
    -- Sum from included invoices

    used_quantity DECIMAL(10,4) DEFAULT 0,
    -- Sum from production/waste/sales

    theoretical_quantity DECIMAL(10,4) DEFAULT 0,
    -- opening + received - used

    actual_quantity DECIMAL(10,4) DEFAULT 0,
    -- From the count

    variance_quantity DECIMAL(10,4) DEFAULT 0,
    -- actual - theoretical

    variance_percent DECIMAL(8,4) DEFAULT 0,
    -- (variance / theoretical) * 100

    -- Calculation metadata
    invoices_included INTEGER DEFAULT 0,
    invoices_excluded INTEGER DEFAULT 0,
    calculation_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_snapshot_item UNIQUE (org_id, count_id, item_code, location_id)
);

CREATE INDEX IF NOT EXISTS idx_cts_org ON count_theoretical_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_cts_count ON count_theoretical_snapshots(count_id);
CREATE INDEX IF NOT EXISTS idx_cts_item ON count_theoretical_snapshots(item_code);
CREATE INDEX IF NOT EXISTS idx_cts_variance ON count_theoretical_snapshots(variance_percent);

-- ============================================
-- FUNCTION: link_invoice_to_count
-- Links a vendor_order to an inventory count
-- ============================================
CREATE OR REPLACE FUNCTION link_invoice_to_count(
    p_org_id VARCHAR,
    p_count_id INTEGER,
    p_vendor_order_id UUID,
    p_linked_by VARCHAR DEFAULT 'system'
) RETURNS INTEGER AS $$
DECLARE
    v_link_id INTEGER;
    v_order RECORD;
BEGIN
    -- Get invoice details for snapshot
    SELECT order_number, order_date, vendor_name, total_cents
    INTO v_order
    FROM vendor_orders
    WHERE id = p_vendor_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vendor order not found: %', p_vendor_order_id;
    END IF;

    -- Insert or update link
    INSERT INTO inventory_count_invoices (
        org_id, count_id, vendor_order_id, linked_by,
        invoice_order_number, invoice_order_date, invoice_vendor_name, invoice_total_cents
    ) VALUES (
        p_org_id, p_count_id, p_vendor_order_id, p_linked_by,
        v_order.order_number, v_order.order_date, v_order.vendor_name, v_order.total_cents
    )
    ON CONFLICT (org_id, count_id, vendor_order_id) DO UPDATE SET
        linked_at = CURRENT_TIMESTAMP,
        linked_by = p_linked_by,
        is_excluded = FALSE,
        excluded_at = NULL,
        excluded_by = NULL,
        exclusion_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_link_id;

    RETURN v_link_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: exclude_invoice_from_count
-- Marks an invoice as excluded from theoretical calculation
-- ============================================
CREATE OR REPLACE FUNCTION exclude_invoice_from_count(
    p_org_id VARCHAR,
    p_count_id INTEGER,
    p_vendor_order_id UUID,
    p_excluded_by VARCHAR DEFAULT 'system',
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE inventory_count_invoices
    SET
        is_excluded = TRUE,
        excluded_at = CURRENT_TIMESTAMP,
        excluded_by = p_excluded_by,
        exclusion_reason = p_reason,
        updated_at = CURRENT_TIMESTAMP
    WHERE org_id = p_org_id
      AND count_id = p_count_id
      AND vendor_order_id = p_vendor_order_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: calculate_theoretical_quantity
-- Calculates theoretical quantity for an item considering invoice exclusions
-- ============================================
CREATE OR REPLACE FUNCTION calculate_theoretical_quantity(
    p_org_id VARCHAR,
    p_count_id INTEGER,
    p_item_code VARCHAR,
    p_location_id VARCHAR DEFAULT NULL
) RETURNS DECIMAL(10,4) AS $$
DECLARE
    v_opening DECIMAL(10,4) := 0;
    v_received DECIMAL(10,4) := 0;
    v_theoretical DECIMAL(10,4) := 0;
BEGIN
    -- Get opening quantity from last approved count
    -- (This would typically look at previous count snapshots or inventory_items)
    -- For now, we'll just calculate received from non-excluded invoices

    -- Sum received quantities from linked, non-excluded invoices
    SELECT COALESCE(SUM(vol.received_qty), 0)
    INTO v_received
    FROM inventory_count_invoices ici
    JOIN vendor_order_lines vol ON ici.vendor_order_id = vol.order_id
    WHERE ici.org_id = p_org_id
      AND ici.count_id = p_count_id
      AND ici.is_excluded = FALSE
      AND (vol.vendor_sku = p_item_code OR vol.gfs_code = p_item_code);

    v_theoretical := v_opening + v_received;

    RETURN v_theoretical;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: count_invoice_summary
-- Summary of invoices linked to each count
-- ============================================
CREATE OR REPLACE VIEW count_invoice_summary AS
SELECT
    ici.org_id,
    ici.count_id,
    COUNT(*) AS total_invoices,
    COUNT(*) FILTER (WHERE NOT ici.is_excluded) AS included_invoices,
    COUNT(*) FILTER (WHERE ici.is_excluded) AS excluded_invoices,
    SUM(ici.invoice_total_cents) FILTER (WHERE NOT ici.is_excluded) AS included_total_cents,
    SUM(ici.invoice_total_cents) FILTER (WHERE ici.is_excluded) AS excluded_total_cents,
    MIN(ici.invoice_order_date) AS earliest_invoice_date,
    MAX(ici.invoice_order_date) AS latest_invoice_date,
    array_agg(DISTINCT ici.invoice_vendor_name) AS vendors
FROM inventory_count_invoices ici
GROUP BY ici.org_id, ici.count_id;

-- ============================================
-- VIEW: invoice_linkable_to_counts
-- Shows invoices that could be linked to counts (received status)
-- ============================================
CREATE OR REPLACE VIEW invoice_linkable_to_counts AS
SELECT
    vo.id AS vendor_order_id,
    vo.org_id,
    vo.order_number,
    vo.order_date,
    vo.vendor_name,
    vo.vendor_id,
    vo.total_lines,
    vo.total_cents,
    vo.status,
    EXISTS (
        SELECT 1 FROM inventory_count_invoices ici
        WHERE ici.vendor_order_id = vo.id
    ) AS is_linked_to_any_count
FROM vendor_orders vo
WHERE vo.status IN ('received', 'parsed', 'approved')
  AND vo.deleted_at IS NULL
ORDER BY vo.order_date DESC;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('033_invoice_aware_counts.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 033_invoice_aware_counts.sql completed successfully' AS result;
