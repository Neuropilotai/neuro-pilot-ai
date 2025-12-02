-- ============================================
-- Migration 027: Vendor Order Cases (FIFO Case Tracking)
-- NeuroPilot AI Enterprise v22.3
-- ============================================
-- Stores individual case-level data extracted from GFS invoices.
-- Enables per-case meat weight tracking and box ID management.
-- Supports FIFO cost layer integration for accurate costing.
-- ============================================

-- ============================================
-- TABLE: vendor_order_cases
-- Individual case tracking for FIFO meat products
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_order_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,
    line_id UUID REFERENCES vendor_order_lines(id) ON DELETE SET NULL,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Product identification
    item_code VARCHAR(100) NOT NULL,

    -- Case identification (from GFS invoice OCR)
    case_number VARCHAR(50) NOT NULL,       -- e.g., "410143069783"
    box_id VARCHAR(50),                      -- Optional physical box label

    -- Weight tracking (critical for meat products)
    weight_kg DECIMAL(10, 4),               -- Individual case weight in KG
    weight_lb DECIMAL(10, 4),               -- Converted to LB for reference
    weight_unit VARCHAR(10) DEFAULT 'KG',

    -- Sequence and status
    sequence_number INTEGER NOT NULL,        -- 1, 2, 3... within this line item
    status VARCHAR(20) DEFAULT 'available', -- available, consumed, transferred
    consumed_at TIMESTAMPTZ,
    consumed_by VARCHAR(255),

    -- FIFO linkage
    fifo_layer_id INTEGER REFERENCES fifo_cost_layers(layer_id) ON DELETE SET NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Idempotency: unique case per order per item
    CONSTRAINT unique_case_per_order UNIQUE (order_id, item_code, case_number)
);

-- Indexes for vendor_order_cases
CREATE INDEX IF NOT EXISTS idx_voc_order ON vendor_order_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_voc_item ON vendor_order_cases(item_code);
CREATE INDEX IF NOT EXISTS idx_voc_status ON vendor_order_cases(status);
CREATE INDEX IF NOT EXISTS idx_voc_case_number ON vendor_order_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_voc_fifo_layer ON vendor_order_cases(fifo_layer_id);

-- ============================================
-- ALTER: fifo_cost_layers
-- Add vendor_order_id for idempotent FIFO population
-- ============================================
DO $$
BEGIN
    -- Add vendor_order_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fifo_cost_layers' AND column_name = 'vendor_order_id'
    ) THEN
        ALTER TABLE fifo_cost_layers
            ADD COLUMN vendor_order_id UUID REFERENCES vendor_orders(id) ON DELETE SET NULL;
    END IF;

    -- Add org_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fifo_cost_layers' AND column_name = 'org_id'
    ) THEN
        ALTER TABLE fifo_cost_layers
            ADD COLUMN org_id VARCHAR(255) DEFAULT 'default-org';
    END IF;
END $$;

-- Unique constraint for idempotent FIFO population
-- Allows only one FIFO layer per order+item combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_order_item
    ON fifo_cost_layers(vendor_order_id, item_code)
    WHERE vendor_order_id IS NOT NULL;

-- ============================================
-- ALTER: vendor_orders
-- Add FIFO status tracking columns
-- ============================================
DO $$
BEGIN
    -- Add fifo_populated_at column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vendor_orders' AND column_name = 'fifo_populated_at'
    ) THEN
        ALTER TABLE vendor_orders ADD COLUMN fifo_populated_at TIMESTAMPTZ;
    END IF;

    -- Add fifo_layers_count column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vendor_orders' AND column_name = 'fifo_layers_count'
    ) THEN
        ALTER TABLE vendor_orders ADD COLUMN fifo_layers_count INTEGER DEFAULT 0;
    END IF;

    -- Add fifo_cases_count column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vendor_orders' AND column_name = 'fifo_cases_count'
    ) THEN
        ALTER TABLE vendor_orders ADD COLUMN fifo_cases_count INTEGER DEFAULT 0;
    END IF;

    -- Add raw_ocr_text column if not exists (for case extraction)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vendor_orders' AND column_name = 'raw_ocr_text'
    ) THEN
        ALTER TABLE vendor_orders ADD COLUMN raw_ocr_text TEXT;
    END IF;
END $$;

-- Document valid status values
COMMENT ON COLUMN vendor_orders.status IS
    'Order status: new, parsed, fifo_complete, error, archived';

-- ============================================
-- Record migration in schema_migrations
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('027_vendor_order_cases.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 027_vendor_order_cases.sql completed successfully' AS result;
