-- ============================================
-- Migration 034: Vendor Orders with Google Drive PDF Integration
-- NeuroPilot AI Enterprise V22.2
-- ============================================
-- This migration creates the vendor_orders and vendor_order_lines tables
-- for tracking vendor purchase orders with Google Drive PDF links.
--
-- Features:
-- - Deduplication by pdf_file_id OR (vendor_id + order_number + order_date)
-- - Google Drive preview URLs for AI traceability
-- - Integration with AI engine for consumption learning
-- ============================================

-- ============================================
-- TABLE: vendor_orders (Order Headers)
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    org_id INTEGER NOT NULL DEFAULT 1,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,

    -- Vendor reference
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    vendor_name VARCHAR(255), -- Denormalized for quick access

    -- Order identification
    order_number VARCHAR(100),
    order_date DATE,
    delivery_date DATE,

    -- Totals
    total_lines INTEGER DEFAULT 0,
    subtotal_cents BIGINT DEFAULT 0, -- Money in cents for precision
    tax_cents BIGINT DEFAULT 0,
    total_cents BIGINT DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'CAD',

    -- Google Drive PDF Integration (THE KEY FEATURE)
    pdf_file_id VARCHAR(255),          -- Google Drive file ID
    pdf_file_name VARCHAR(500),        -- Original filename
    pdf_folder_id VARCHAR(255),        -- Parent folder ID (optional)
    pdf_preview_url TEXT,              -- https://drive.google.com/file/d/<FILE_ID>/preview

    -- Status tracking
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'parsed', 'validated', 'archived', 'error')),
    source_system VARCHAR(50), -- 'sysco', 'gfs', 'usfoods', 'manual', etc.

    -- OCR/Parsing metadata
    ocr_confidence DECIMAL(5,4) DEFAULT 0,
    ocr_engine VARCHAR(50),
    parse_duration_ms INTEGER,
    parsed_at TIMESTAMPTZ,
    parsed_by VARCHAR(255),

    -- Error tracking
    error_message TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    deleted_at TIMESTAMPTZ,

    -- Metadata for AI engine
    metadata JSONB DEFAULT '{}'::jsonb,

    -- DEDUPLICATION CONSTRAINTS
    -- Option 1: Same PDF file ID within an org should be unique
    CONSTRAINT vendor_orders_unique_pdf_file UNIQUE (org_id, pdf_file_id),

    -- Option 2: Same vendor + order_number + order_date should be unique
    CONSTRAINT vendor_orders_unique_order UNIQUE (org_id, vendor_id, order_number, order_date)
);

-- Partial unique index for pdf_file_id (ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_orders_pdf_file_id
ON vendor_orders (org_id, pdf_file_id)
WHERE pdf_file_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================
-- TABLE: vendor_order_lines (Line Items)
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent reference
    order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,

    -- Tenant isolation (denormalized for query performance)
    org_id INTEGER NOT NULL DEFAULT 1,

    -- Line identification
    line_number INTEGER NOT NULL,

    -- Vendor product codes
    vendor_sku VARCHAR(100),       -- Vendor's item code (e.g., Sysco item #)
    sysco_code VARCHAR(100),       -- Sysco-specific code
    gfs_code VARCHAR(100),         -- GFS-specific code
    upc_barcode VARCHAR(50),       -- UPC barcode if available

    -- Item details
    description TEXT NOT NULL,
    brand VARCHAR(255),
    pack_size VARCHAR(100),        -- e.g., "6x2kg", "12/1lb"

    -- Quantities
    ordered_qty DECIMAL(12,4) NOT NULL DEFAULT 0,
    received_qty DECIMAL(12,4),    -- NULL until received
    unit VARCHAR(50) DEFAULT 'EACH', -- EACH, CASE, LB, KG, etc.

    -- Pricing (in cents for precision)
    unit_price_cents BIGINT DEFAULT 0,
    extended_price_cents BIGINT DEFAULT 0,

    -- Inventory linking
    inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
    mapping_confidence DECIMAL(5,4) DEFAULT 0, -- 0-1 confidence of auto-mapping
    mapping_status VARCHAR(50) DEFAULT 'unmapped' CHECK (mapping_status IN ('unmapped', 'auto_mapped', 'manual_mapped', 'confirmed')),
    mapped_by VARCHAR(255),
    mapped_at TIMESTAMPTZ,

    -- Category for AI
    category_code VARCHAR(50),

    -- Raw data preservation (for AI learning)
    raw_text TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Unique line per order
    CONSTRAINT vendor_order_lines_unique_line UNIQUE (order_id, line_number)
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- vendor_orders indexes
CREATE INDEX IF NOT EXISTS idx_vendor_orders_org ON vendor_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_vendor ON vendor_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_status ON vendor_orders(status);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_order_date ON vendor_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_created ON vendor_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_source ON vendor_orders(source_system);

-- Compound index for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_orders_org_date ON vendor_orders(org_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_org_vendor ON vendor_orders(org_id, vendor_id);

-- vendor_order_lines indexes
CREATE INDEX IF NOT EXISTS idx_vendor_order_lines_order ON vendor_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_order_lines_org ON vendor_order_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_vendor_order_lines_inventory ON vendor_order_lines(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_vendor_order_lines_vendor_sku ON vendor_order_lines(vendor_sku);
CREATE INDEX IF NOT EXISTS idx_vendor_order_lines_mapping ON vendor_order_lines(mapping_status);

-- ============================================
-- FUNCTIONS for Deduplication Check
-- ============================================

-- Function to check if an order already exists (returns existing ID or NULL)
CREATE OR REPLACE FUNCTION check_vendor_order_exists(
    p_org_id INTEGER,
    p_pdf_file_id VARCHAR(255) DEFAULT NULL,
    p_vendor_id INTEGER DEFAULT NULL,
    p_order_number VARCHAR(100) DEFAULT NULL,
    p_order_date DATE DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_existing_id UUID;
BEGIN
    -- First, check by PDF file ID (most reliable)
    IF p_pdf_file_id IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM vendor_orders
        WHERE org_id = p_org_id
          AND pdf_file_id = p_pdf_file_id
          AND deleted_at IS NULL
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;
    END IF;

    -- Second, check by vendor + order_number + order_date
    IF p_vendor_id IS NOT NULL AND p_order_number IS NOT NULL AND p_order_date IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM vendor_orders
        WHERE org_id = p_org_id
          AND vendor_id = p_vendor_id
          AND order_number = p_order_number
          AND order_date = p_order_date
          AND deleted_at IS NULL
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Auto-update timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_vendor_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_orders_updated ON vendor_orders;
CREATE TRIGGER vendor_orders_updated
    BEFORE UPDATE ON vendor_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_orders_timestamp();

DROP TRIGGER IF EXISTS vendor_order_lines_updated ON vendor_order_lines;
CREATE TRIGGER vendor_order_lines_updated
    BEFORE UPDATE ON vendor_order_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_orders_timestamp();

-- ============================================
-- VIEW: Vendor Orders Summary (for dashboard)
-- ============================================

CREATE OR REPLACE VIEW v_vendor_orders_summary AS
SELECT
    vo.org_id,
    vo.vendor_id,
    v.name AS vendor_name,
    vo.source_system,
    COUNT(DISTINCT vo.id) AS order_count,
    SUM(vo.total_cents) / 100.0 AS total_amount,
    COUNT(DISTINCT vol.id) AS line_count,
    MIN(vo.order_date) AS first_order_date,
    MAX(vo.order_date) AS last_order_date,
    COUNT(CASE WHEN vo.status = 'validated' THEN 1 END) AS validated_count,
    COUNT(CASE WHEN vo.status = 'error' THEN 1 END) AS error_count
FROM vendor_orders vo
LEFT JOIN vendors v ON vo.vendor_id = v.id
LEFT JOIN vendor_order_lines vol ON vol.order_id = vo.id
WHERE vo.deleted_at IS NULL
GROUP BY vo.org_id, vo.vendor_id, v.name, vo.source_system;

-- ============================================
-- COMMENTS for Documentation
-- ============================================

COMMENT ON TABLE vendor_orders IS 'Vendor purchase orders with Google Drive PDF links for AI traceability';
COMMENT ON COLUMN vendor_orders.pdf_file_id IS 'Google Drive file ID - primary deduplication key';
COMMENT ON COLUMN vendor_orders.pdf_preview_url IS 'Direct Google Drive preview URL for viewing in browser';
COMMENT ON COLUMN vendor_orders.status IS 'Order status: new -> parsed -> validated -> archived';
COMMENT ON TABLE vendor_order_lines IS 'Line items from vendor orders, linked to inventory for AI learning';
COMMENT ON COLUMN vendor_order_lines.inventory_item_id IS 'Link to canonical inventory item for consumption tracking';

-- ============================================
-- Record migration
-- ============================================

INSERT INTO schema_migrations (migration_name, applied_at)
VALUES ('034_vendor_orders_google_drive.sql', NOW())
ON CONFLICT (migration_name) DO NOTHING;

-- Done!
SELECT 'Migration 034_vendor_orders_google_drive.sql completed successfully' AS result;
