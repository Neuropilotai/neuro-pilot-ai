-- ============================================
-- Migration 031: Item Bank / Master Catalog
-- NeuroPilot AI Enterprise v23.x
-- ============================================
-- Multi-supplier item catalog with price tracking:
-- master_items → supplier_items → supplier_item_prices
-- ============================================

-- ============================================
-- TABLE: master_items
-- Single source of truth for all items
-- ============================================
CREATE TABLE IF NOT EXISTS master_items (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Universal identifier
    item_code VARCHAR(100) NOT NULL,

    -- Description
    description TEXT NOT NULL,
    short_description VARCHAR(255),

    -- Classification
    category VARCHAR(100),
    subcategory VARCHAR(100),
    brand VARCHAR(100),

    -- Pack/Size
    pack_size VARCHAR(100),
    unit_of_measure VARCHAR(50) DEFAULT 'EACH',
    units_per_case DECIMAL(10,2),

    -- Identifiers
    upc VARCHAR(50),
    gtin VARCHAR(50),

    -- Flags
    is_active BOOLEAN DEFAULT TRUE,
    is_perishable BOOLEAN DEFAULT FALSE,
    requires_temperature_control BOOLEAN DEFAULT FALSE,
    storage_temp_min DECIMAL(5,2),
    storage_temp_max DECIMAL(5,2),

    -- FIFO tracking category
    fifo_category VARCHAR(50), -- 'meat', 'dairy', 'dry', 'frozen', etc.

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    CONSTRAINT unique_master_item_code UNIQUE (org_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_mi_org ON master_items(org_id);
CREATE INDEX IF NOT EXISTS idx_mi_code ON master_items(item_code);
CREATE INDEX IF NOT EXISTS idx_mi_category ON master_items(category);
CREATE INDEX IF NOT EXISTS idx_mi_description ON master_items USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_mi_upc ON master_items(upc);
CREATE INDEX IF NOT EXISTS idx_mi_active ON master_items(is_active);

-- ============================================
-- TABLE: supplier_items
-- Maps supplier-specific codes to master items
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_items (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Master item link (optional - can exist without master match)
    master_item_id INTEGER REFERENCES master_items(id) ON DELETE SET NULL,

    -- Supplier reference
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
    supplier_name VARCHAR(100), -- denormalized for quick display

    -- Supplier's codes
    supplier_item_code VARCHAR(100) NOT NULL, -- Sysco SUPC, GFS code, etc.
    supplier_sku VARCHAR(100),

    -- Supplier's description (may differ from master)
    supplier_description TEXT,

    -- Supplier's pack info
    pack_size VARCHAR(100),
    case_pack VARCHAR(50),
    unit_of_measure VARCHAR(50),

    -- Category from supplier
    supplier_category VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_preferred BOOLEAN DEFAULT FALSE, -- preferred supplier for this master item

    -- PDF source tracking
    source_pdf_file_id VARCHAR(100),
    source_pdf_page INTEGER,
    first_seen_date DATE,
    last_seen_date DATE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_supplier_item UNIQUE (org_id, vendor_id, supplier_item_code)
);

CREATE INDEX IF NOT EXISTS idx_si_org ON supplier_items(org_id);
CREATE INDEX IF NOT EXISTS idx_si_vendor ON supplier_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_si_master ON supplier_items(master_item_id);
CREATE INDEX IF NOT EXISTS idx_si_code ON supplier_items(supplier_item_code);
CREATE INDEX IF NOT EXISTS idx_si_desc ON supplier_items USING gin(to_tsvector('english', supplier_description));
CREATE INDEX IF NOT EXISTS idx_si_active ON supplier_items(is_active);

-- ============================================
-- TABLE: supplier_item_prices
-- Price history for supplier items
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_item_prices (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- References
    supplier_item_id INTEGER NOT NULL REFERENCES supplier_items(id) ON DELETE CASCADE,

    -- Price data
    unit_price_cents INTEGER NOT NULL,
    case_price_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Date effective
    effective_date DATE NOT NULL,
    expiry_date DATE,

    -- Source
    source_type VARCHAR(50), -- 'invoice', 'catalog', 'manual'
    source_document_id VARCHAR(100),
    source_pdf_file_id VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_sip_supplier ON supplier_item_prices(supplier_item_id);
CREATE INDEX IF NOT EXISTS idx_sip_date ON supplier_item_prices(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_sip_org ON supplier_item_prices(org_id);
CREATE INDEX IF NOT EXISTS idx_sip_source ON supplier_item_prices(source_type);

-- ============================================
-- VIEW: supplier_items_latest_price
-- Get supplier items with their latest price
-- ============================================
CREATE OR REPLACE VIEW supplier_items_latest_price AS
SELECT
    si.id AS supplier_item_id,
    si.org_id,
    si.vendor_id,
    si.supplier_name,
    si.supplier_item_code,
    si.supplier_description,
    si.pack_size,
    si.case_pack,
    si.supplier_category,
    si.master_item_id,
    si.is_preferred,
    si.first_seen_date,
    si.last_seen_date,
    mi.item_code AS master_item_code,
    mi.description AS master_description,
    mi.category AS master_category,
    mi.fifo_category,
    sip.unit_price_cents,
    sip.case_price_cents,
    sip.effective_date AS price_date,
    sip.source_type AS price_source
FROM supplier_items si
LEFT JOIN master_items mi ON si.master_item_id = mi.id
LEFT JOIN LATERAL (
    SELECT unit_price_cents, case_price_cents, effective_date, source_type
    FROM supplier_item_prices
    WHERE supplier_item_id = si.id
    ORDER BY effective_date DESC
    LIMIT 1
) sip ON true
WHERE si.is_active = TRUE;

-- ============================================
-- VIEW: item_bank_search
-- Unified search across all supplier items
-- ============================================
CREATE OR REPLACE VIEW item_bank_search AS
SELECT
    'supplier' AS item_type,
    si.id,
    si.org_id,
    v.name AS supplier_name,
    si.supplier_item_code AS item_code,
    si.supplier_description AS description,
    si.pack_size,
    si.supplier_category AS category,
    sip.unit_price_cents,
    sip.effective_date AS price_date,
    si.master_item_id,
    mi.item_code AS master_code,
    mi.fifo_category
FROM supplier_items si
JOIN vendors v ON si.vendor_id = v.id
LEFT JOIN master_items mi ON si.master_item_id = mi.id
LEFT JOIN LATERAL (
    SELECT unit_price_cents, effective_date
    FROM supplier_item_prices
    WHERE supplier_item_id = si.id
    ORDER BY effective_date DESC
    LIMIT 1
) sip ON true
WHERE si.is_active = TRUE;

-- ============================================
-- VIEW: master_items_with_suppliers
-- Master items with all their supplier mappings
-- ============================================
CREATE OR REPLACE VIEW master_items_with_suppliers AS
SELECT
    mi.id AS master_item_id,
    mi.org_id,
    mi.item_code,
    mi.description,
    mi.category,
    mi.pack_size,
    mi.fifo_category,
    mi.is_perishable,
    COUNT(si.id) AS supplier_count,
    ARRAY_AGG(DISTINCT si.supplier_name) FILTER (WHERE si.supplier_name IS NOT NULL) AS suppliers,
    MIN(sip.unit_price_cents) AS min_price_cents,
    MAX(sip.unit_price_cents) AS max_price_cents
FROM master_items mi
LEFT JOIN supplier_items si ON mi.id = si.master_item_id AND si.is_active = TRUE
LEFT JOIN LATERAL (
    SELECT unit_price_cents
    FROM supplier_item_prices
    WHERE supplier_item_id = si.id
    ORDER BY effective_date DESC
    LIMIT 1
) sip ON true
WHERE mi.is_active = TRUE
GROUP BY mi.id, mi.org_id, mi.item_code, mi.description, mi.category,
         mi.pack_size, mi.fifo_category, mi.is_perishable;

-- ============================================
-- FUNCTION: upsert_supplier_item
-- Idempotent insert/update for supplier items
-- ============================================
CREATE OR REPLACE FUNCTION upsert_supplier_item(
    p_org_id VARCHAR,
    p_vendor_id INTEGER,
    p_supplier_name VARCHAR,
    p_supplier_item_code VARCHAR,
    p_supplier_description TEXT,
    p_pack_size VARCHAR,
    p_supplier_category VARCHAR,
    p_source_pdf_file_id VARCHAR DEFAULT NULL,
    p_source_pdf_page INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_item_id INTEGER;
BEGIN
    INSERT INTO supplier_items (
        org_id, vendor_id, supplier_name, supplier_item_code,
        supplier_description, pack_size, supplier_category,
        source_pdf_file_id, source_pdf_page, first_seen_date, last_seen_date
    )
    VALUES (
        p_org_id, p_vendor_id, p_supplier_name, p_supplier_item_code,
        p_supplier_description, p_pack_size, p_supplier_category,
        p_source_pdf_file_id, p_source_pdf_page, CURRENT_DATE, CURRENT_DATE
    )
    ON CONFLICT (org_id, vendor_id, supplier_item_code)
    DO UPDATE SET
        supplier_description = COALESCE(EXCLUDED.supplier_description, supplier_items.supplier_description),
        pack_size = COALESCE(EXCLUDED.pack_size, supplier_items.pack_size),
        supplier_category = COALESCE(EXCLUDED.supplier_category, supplier_items.supplier_category),
        last_seen_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: record_supplier_price
-- Add price record if different from latest
-- ============================================
CREATE OR REPLACE FUNCTION record_supplier_price(
    p_org_id VARCHAR,
    p_supplier_item_id INTEGER,
    p_unit_price_cents INTEGER,
    p_case_price_cents INTEGER DEFAULT NULL,
    p_source_type VARCHAR DEFAULT 'invoice',
    p_source_document_id VARCHAR DEFAULT NULL,
    p_effective_date DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER AS $$
DECLARE
    v_latest_price INTEGER;
    v_price_id INTEGER;
BEGIN
    -- Get latest price for this item
    SELECT unit_price_cents INTO v_latest_price
    FROM supplier_item_prices
    WHERE supplier_item_id = p_supplier_item_id
    ORDER BY effective_date DESC
    LIMIT 1;

    -- Only insert if price is different or no previous price
    IF v_latest_price IS NULL OR v_latest_price != p_unit_price_cents THEN
        INSERT INTO supplier_item_prices (
            org_id, supplier_item_id, unit_price_cents, case_price_cents,
            source_type, source_document_id, effective_date
        )
        VALUES (
            p_org_id, p_supplier_item_id, p_unit_price_cents, p_case_price_cents,
            p_source_type, p_source_document_id, p_effective_date
        )
        RETURNING id INTO v_price_id;

        RETURN v_price_id;
    END IF;

    RETURN NULL; -- No new price recorded (same as before)
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('031_item_bank_master.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 031_item_bank_master.sql completed successfully' AS result;
