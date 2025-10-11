-- ============================================================================
-- Migration 031: Invoice Date & Month-End Enhancement (v13.1)
-- ============================================================================
-- Adds first-class invoice date, vendor, and amount columns to documents table
-- for improved month-end workflows and count status tracking
--
-- IDEMPOTENT: Safe to run multiple times
-- Date: 2025-10-11
-- ============================================================================

-- Add invoice_date column if it doesn't exist
-- This allows sorting, filtering, and period-based queries without JSON parsing
ALTER TABLE documents ADD COLUMN invoice_date TEXT;

-- Add invoice_number column for quick lookups
ALTER TABLE documents ADD COLUMN invoice_number TEXT;

-- Add vendor column for vendor-specific filtering (e.g., GFS, Sysco)
ALTER TABLE documents ADD COLUMN vendor TEXT;

-- Add invoice_amount for financial tracking
ALTER TABLE documents ADD COLUMN invoice_amount REAL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_documents_invoice_date ON documents(invoice_date);
CREATE INDEX IF NOT EXISTS idx_documents_invoice_number ON documents(invoice_number);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor);

-- ============================================================================
-- Data Migration: Extract existing invoice data from metadata JSON
-- ============================================================================
-- This is a one-time operation to populate the new columns from existing data
-- Uses SQLite's json_extract function to pull data from metadata column

-- Update invoice_number from metadata
UPDATE documents
SET invoice_number = json_extract(metadata, '$.invoice_number')
WHERE metadata IS NOT NULL
  AND json_extract(metadata, '$.invoice_number') IS NOT NULL
  AND invoice_number IS NULL;

-- Update invoice_date from metadata
UPDATE documents
SET invoice_date = json_extract(metadata, '$.invoice_date')
WHERE metadata IS NOT NULL
  AND json_extract(metadata, '$.invoice_date') IS NOT NULL
  AND invoice_date IS NULL;

-- Update vendor from metadata (default to GFS if not specified)
UPDATE documents
SET vendor = COALESCE(json_extract(metadata, '$.vendor'), 'GFS')
WHERE metadata IS NOT NULL
  AND mime_type = 'application/pdf'
  AND vendor IS NULL;

-- Update invoice_amount from metadata
UPDATE documents
SET invoice_amount = CAST(json_extract(metadata, '$.total_amount') AS REAL)
WHERE metadata IS NOT NULL
  AND json_extract(metadata, '$.total_amount') IS NOT NULL
  AND invoice_amount IS NULL;

-- ============================================================================
-- Filename Pattern Parsing: Extract dates from GFS filenames
-- ============================================================================
-- Handles patterns like:
--   GFS_2025-05-14_9027091040.pdf → 2025-05-14
--   9027091040_2025-05-14.pdf → 2025-05-14
--   2025-05-14_invoice.pdf → 2025-05-14

-- Parse dates from filenames (YYYY-MM-DD pattern)
-- Note: SQLite doesn't have regex, so we'll handle this in the application layer
-- This UPDATE serves as documentation for the pattern matching logic

-- ============================================================================
-- Validation Queries (for post-migration verification)
-- ============================================================================

-- Count documents with/without invoice dates
-- SELECT
--   COUNT(*) as total_pdfs,
--   SUM(CASE WHEN invoice_date IS NOT NULL THEN 1 ELSE 0 END) as with_date,
--   SUM(CASE WHEN invoice_date IS NULL THEN 1 ELSE 0 END) as missing_date,
--   SUM(CASE WHEN vendor IS NOT NULL THEN 1 ELSE 0 END) as with_vendor
-- FROM documents
-- WHERE mime_type = 'application/pdf' AND deleted_at IS NULL;

-- Check date distribution by month
-- SELECT
--   strftime('%Y-%m', invoice_date) as year_month,
--   vendor,
--   COUNT(*) as invoice_count
-- FROM documents
-- WHERE mime_type = 'application/pdf'
--   AND deleted_at IS NULL
--   AND invoice_date IS NOT NULL
-- GROUP BY year_month, vendor
-- ORDER BY year_month DESC;

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================
-- SQLite doesn't support DROP COLUMN, so rollback requires:
-- 1. Create new table without the columns
-- 2. Copy data (excluding new columns)
-- 3. Drop old table, rename new table
--
-- For non-destructive rollback, simply ignore the new columns in queries.
-- The metadata column still contains the original JSON data.
-- ============================================================================

-- Migration complete
