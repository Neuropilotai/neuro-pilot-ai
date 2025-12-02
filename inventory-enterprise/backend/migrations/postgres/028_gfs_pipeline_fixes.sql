-- ============================================
-- Migration 028: GFS Pipeline Fixes
-- NeuroPilot AI Enterprise V22.3
--
-- Fixes for GFS order processing pipeline:
-- 1. Add 'fifo_complete' to status CHECK constraint
-- 2. Add raw_ocr_text column for case extraction
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. FIX STATUS CHECK CONSTRAINT
-- ============================================

-- Drop existing constraint if it exists
DO $$
BEGIN
  ALTER TABLE vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add updated constraint with fifo_complete status
ALTER TABLE vendor_orders
  ADD CONSTRAINT vendor_orders_status_check
  CHECK (status IN ('new', 'parsed', 'validated', 'archived', 'error', 'fifo_complete'));

-- ============================================
-- 2. ADD RAW OCR TEXT COLUMN
-- ============================================

-- Add column for storing raw OCR text (needed for case extraction)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_orders'
    AND column_name = 'raw_ocr_text'
  ) THEN
    ALTER TABLE vendor_orders ADD COLUMN raw_ocr_text TEXT;
    COMMENT ON COLUMN vendor_orders.raw_ocr_text IS 'Raw OCR text from PDF, used for case/weight extraction';
  END IF;
END $$;

-- ============================================
-- 2B. ADD FIFO TRACKING COLUMNS
-- ============================================

-- Add fifo_populated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_orders'
    AND column_name = 'fifo_populated_at'
  ) THEN
    ALTER TABLE vendor_orders ADD COLUMN fifo_populated_at TIMESTAMP;
    COMMENT ON COLUMN vendor_orders.fifo_populated_at IS 'When FIFO layers were populated from this order';
  END IF;
END $$;

-- Add fifo_layers_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_orders'
    AND column_name = 'fifo_layers_count'
  ) THEN
    ALTER TABLE vendor_orders ADD COLUMN fifo_layers_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN vendor_orders.fifo_layers_count IS 'Number of FIFO layers created from this order';
  END IF;
END $$;

-- Add fifo_cases_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_orders'
    AND column_name = 'fifo_cases_count'
  ) THEN
    ALTER TABLE vendor_orders ADD COLUMN fifo_cases_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN vendor_orders.fifo_cases_count IS 'Number of meat cases extracted from this order';
  END IF;
END $$;

-- ============================================
-- 3. ADD ADDITIONAL SOURCE SYSTEM VALUES
-- ============================================

-- Drop existing source_system constraint if it exists
DO $$
BEGIN
  ALTER TABLE vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_source_system_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add updated constraint with more source systems
ALTER TABLE vendor_orders
  ADD CONSTRAINT vendor_orders_source_system_check
  CHECK (source_system IS NULL OR source_system IN ('sysco', 'gfs', 'usfoods', 'pfg', 'local', 'manual', 'other', 'gfs-watcher'));

-- ============================================
-- 4. COMMENTS
-- ============================================

COMMENT ON COLUMN vendor_orders.status IS 'Order status: new, parsed, validated, archived, error, fifo_complete';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 028: GFS Pipeline Fixes - COMPLETE';
END $$;
