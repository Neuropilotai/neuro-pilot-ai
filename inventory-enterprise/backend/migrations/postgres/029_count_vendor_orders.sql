-- ============================================
-- Migration 029: Count-Vendor Orders Join Table
-- NeuroPilot AI Enterprise v23.0
-- ============================================
-- Links physical inventory counts with vendor orders (invoices).
-- Allows users to specify which invoices are included in a count.
-- Supports excluding invoices from theoretical inventory calculations.
-- ============================================

-- ============================================
-- TABLE: count_vendor_orders
-- Join table linking counts to vendor orders
-- ============================================
CREATE TABLE IF NOT EXISTS count_vendor_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    count_id VARCHAR(255) NOT NULL,
    vendor_order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,

    -- Inclusion flag for theoretical calculation
    included BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    -- Unique constraint: one link per count-order pair
    CONSTRAINT unique_count_order UNIQUE (count_id, vendor_order_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cvo_count ON count_vendor_orders(count_id);
CREATE INDEX IF NOT EXISTS idx_cvo_vendor_order ON count_vendor_orders(vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_cvo_included ON count_vendor_orders(included);

-- ============================================
-- ALTER: inventory_counts
-- Add columns for closed status and better tracking
-- ============================================
DO $$
BEGIN
    -- Add closed_at column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_counts' AND column_name = 'closed_at'
    ) THEN
        ALTER TABLE inventory_counts ADD COLUMN closed_at TIMESTAMPTZ;
    END IF;

    -- Add closed_by column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_counts' AND column_name = 'closed_by'
    ) THEN
        ALTER TABLE inventory_counts ADD COLUMN closed_by VARCHAR(255);
    END IF;

    -- Add org_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_counts' AND column_name = 'org_id'
    ) THEN
        ALTER TABLE inventory_counts ADD COLUMN org_id VARCHAR(255) DEFAULT 'default-org';
    END IF;

    -- Add reference_date column for count period
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_counts' AND column_name = 'reference_date'
    ) THEN
        ALTER TABLE inventory_counts ADD COLUMN reference_date DATE;
    END IF;

    -- Update status CHECK to include 'closed'
    -- First drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'inventory_counts' AND column_name = 'status'
    ) THEN
        ALTER TABLE inventory_counts DROP CONSTRAINT IF EXISTS inventory_counts_status_check;
    END IF;

    -- Add new check constraint with 'closed' status
    ALTER TABLE inventory_counts
        ADD CONSTRAINT inventory_counts_status_check
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'closed'));
END $$;

-- ============================================
-- TABLE: vendor_order_cases (if not exists)
-- For case-level tracking of meat products
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_order_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,
    line_id UUID REFERENCES vendor_order_lines(id) ON DELETE SET NULL,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Product identification
    item_code VARCHAR(100) NOT NULL,

    -- Case identification
    case_number VARCHAR(50) NOT NULL,
    box_id VARCHAR(50),

    -- Weight tracking
    weight_kg DECIMAL(10, 4),
    weight_lb DECIMAL(10, 4),
    weight_unit VARCHAR(10) DEFAULT 'KG',

    -- Sequence and status
    sequence_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'available',
    consumed_at TIMESTAMPTZ,
    consumed_by VARCHAR(255),

    -- FIFO linkage
    fifo_layer_id INTEGER REFERENCES fifo_cost_layers(layer_id) ON DELETE SET NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Idempotency
    CONSTRAINT unique_case_per_order UNIQUE (order_id, item_code, case_number)
);

-- Indexes for vendor_order_cases
CREATE INDEX IF NOT EXISTS idx_voc_order ON vendor_order_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_voc_item ON vendor_order_cases(item_code);
CREATE INDEX IF NOT EXISTS idx_voc_status ON vendor_order_cases(status);

-- ============================================
-- ALTER: fifo_cost_layers
-- Add vendor_order_id for FIFO linkage
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

-- Unique index for idempotent FIFO population
CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_order_item
    ON fifo_cost_layers(vendor_order_id, item_code)
    WHERE vendor_order_id IS NOT NULL;

-- ============================================
-- ALTER: storage_locations
-- Add sequence column for ordering
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'storage_locations' AND column_name = 'sequence'
    ) THEN
        ALTER TABLE storage_locations ADD COLUMN sequence INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('029_count_vendor_orders.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 029_count_vendor_orders.sql completed successfully' AS result;
