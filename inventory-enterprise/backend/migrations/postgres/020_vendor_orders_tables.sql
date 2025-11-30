-- ============================================
-- Migration 020: Vendor Orders Tables
-- NeuroPilot AI Enterprise V22.2
--
-- Required for /api/vendor-orders route
-- Google Drive PDF integration support
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. VENDOR ORDERS TABLE (main header)
-- ============================================

CREATE TABLE IF NOT EXISTS vendor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
  site_id VARCHAR(255),

  -- Vendor reference
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name VARCHAR(255),

  -- Order identification
  order_number VARCHAR(100),
  order_date DATE,
  delivery_date DATE,

  -- Line summary
  total_lines INTEGER DEFAULT 0,

  -- Financial (in cents for precision)
  subtotal_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'CAD',

  -- Google Drive PDF integration
  pdf_file_id VARCHAR(100),
  pdf_file_name VARCHAR(255),
  pdf_folder_id VARCHAR(100),
  pdf_preview_url TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'parsed', 'validated', 'archived', 'error')),
  source_system VARCHAR(50) CHECK (source_system IN ('sysco', 'gfs', 'usfoods', 'pfg', 'local', 'manual', 'other')),

  -- OCR/Parsing metadata
  ocr_confidence DECIMAL(5,4),
  ocr_engine VARCHAR(50),
  parse_duration_ms INTEGER,
  parsed_at TIMESTAMP,
  parsed_by VARCHAR(255),
  error_message TEXT,

  -- Extensible metadata
  metadata JSONB DEFAULT '{}',

  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255),
  deleted_at TIMESTAMP
);

-- Indexes for vendor_orders
CREATE INDEX IF NOT EXISTS idx_vendor_orders_org ON vendor_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_vendor ON vendor_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_status ON vendor_orders(status);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_date ON vendor_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_orders_pdf ON vendor_orders(pdf_file_id) WHERE pdf_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_orders_deleted ON vendor_orders(deleted_at) WHERE deleted_at IS NULL;

-- Unique constraint for deduplication: pdf_file_id OR (vendor_id + order_number + order_date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_orders_dedup_pdf
  ON vendor_orders(org_id, pdf_file_id)
  WHERE pdf_file_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_orders_dedup_order
  ON vendor_orders(org_id, vendor_id, order_number, order_date)
  WHERE vendor_id IS NOT NULL AND order_number IS NOT NULL AND order_date IS NOT NULL AND deleted_at IS NULL;

-- ============================================
-- 2. VENDOR ORDER LINES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS vendor_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES vendor_orders(id) ON DELETE CASCADE,
  org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

  -- Line identification
  line_number INTEGER NOT NULL,

  -- Product codes (vendor-specific)
  vendor_sku VARCHAR(100),
  sysco_code VARCHAR(50),
  gfs_code VARCHAR(50),
  upc_barcode VARCHAR(50),

  -- Product info
  description TEXT NOT NULL DEFAULT 'Unknown Item',
  brand VARCHAR(100),
  pack_size VARCHAR(100),

  -- Quantities
  ordered_qty DECIMAL(10,4) NOT NULL DEFAULT 0,
  received_qty DECIMAL(10,4),
  unit VARCHAR(50) DEFAULT 'EACH',

  -- Pricing (in cents)
  unit_price_cents INTEGER DEFAULT 0,
  extended_price_cents INTEGER DEFAULT 0,

  -- Inventory mapping
  inventory_item_id INTEGER,
  mapping_confidence DECIMAL(5,4),
  mapping_status VARCHAR(20) DEFAULT 'unmapped' CHECK (mapping_status IN ('unmapped', 'auto_mapped', 'manual_mapped', 'verified', 'ignored')),

  -- Category
  category_code VARCHAR(50),

  -- Raw text from OCR (for debugging/reprocessing)
  raw_text TEXT,

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vendor_order_lines
CREATE INDEX IF NOT EXISTS idx_vol_order ON vendor_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_vol_org ON vendor_order_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_vol_vendor_sku ON vendor_order_lines(vendor_sku);
CREATE INDEX IF NOT EXISTS idx_vol_sysco ON vendor_order_lines(sysco_code) WHERE sysco_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vol_gfs ON vendor_order_lines(gfs_code) WHERE gfs_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vol_inventory ON vendor_order_lines(inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vol_mapping ON vendor_order_lines(mapping_status);

-- Unique constraint: line number within order
CREATE UNIQUE INDEX IF NOT EXISTS idx_vol_order_line ON vendor_order_lines(order_id, line_number);

-- ============================================
-- 3. DEDUPLICATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION check_vendor_order_exists(
  p_org_id VARCHAR,
  p_pdf_file_id VARCHAR,
  p_vendor_id INTEGER,
  p_order_number VARCHAR,
  p_order_date DATE
) RETURNS UUID AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  -- Check by PDF file ID first (most reliable)
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

  -- Check by vendor + order number + date
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
-- 4. TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_vendor_orders_updated') THEN
    CREATE TRIGGER tr_vendor_orders_updated
      BEFORE UPDATE ON vendor_orders
      FOR EACH ROW EXECUTE FUNCTION trigger_update_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_vol_updated') THEN
    CREATE TRIGGER tr_vol_updated
      BEFORE UPDATE ON vendor_order_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_update_timestamp();
  END IF;
END $$;

-- ============================================
-- 5. COMMENTS
-- ============================================

COMMENT ON TABLE vendor_orders IS 'V22.2 Vendor purchase orders with Google Drive PDF integration';
COMMENT ON COLUMN vendor_orders.pdf_file_id IS 'Google Drive file ID for PDF document';
COMMENT ON COLUMN vendor_orders.source_system IS 'Vendor system source: sysco, gfs, usfoods, pfg, local, manual, other';
COMMENT ON COLUMN vendor_orders.ocr_confidence IS 'OCR confidence score 0.0-1.0';

COMMENT ON TABLE vendor_order_lines IS 'V22.2 Vendor order line items with inventory mapping';
COMMENT ON COLUMN vendor_order_lines.mapping_confidence IS 'AI mapping confidence 0.0-1.0';
COMMENT ON COLUMN vendor_order_lines.mapping_status IS 'Status: unmapped, auto_mapped, manual_mapped, verified, ignored';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 020: Vendor Orders Tables - COMPLETE';
END $$;
