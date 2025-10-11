-- Migration 026: PDF Text Extraction for Order Intelligence
-- Adds columns to documents table to store extracted text and parsed metadata
-- Required for NeuroPilot v10.1 Order-Aware Intelligence

-- Add extracted_text column to documents table
ALTER TABLE documents ADD COLUMN extracted_text TEXT;

-- Add extraction metadata
ALTER TABLE documents ADD COLUMN extraction_date TIMESTAMP;
ALTER TABLE documents ADD COLUMN extraction_quality TEXT; -- 'PERFECT', 'GOOD', 'ACCEPTABLE', 'POOR', 'FAILED'

-- Add order intelligence metadata (JSON strings)
ALTER TABLE documents ADD COLUMN order_signals TEXT; -- JSON: week tags, delivery ETA, credit notes, lead times, constraints
ALTER TABLE documents ADD COLUMN invoice_metadata TEXT; -- JSON: invoice number, date, totals, customer info

-- Create index on extraction quality for monitoring
CREATE INDEX IF NOT EXISTS idx_documents_extraction_quality
ON documents(extraction_quality)
WHERE extraction_quality IS NOT NULL;

-- Create index on extraction date
CREATE INDEX IF NOT EXISTS idx_documents_extraction_date
ON documents(extraction_date);

-- Comments for documentation
-- extracted_text: Full text content extracted from PDF
-- extraction_date: When text extraction was performed
-- extraction_quality: Quality score for extraction (PERFECT/GOOD/ACCEPTABLE/POOR/FAILED)
-- order_signals: JSON object containing parsed order intelligence:
--   {
--     "week_tags": ["week 1", "week 2"],
--     "delivery_eta": "Thursday/Friday",
--     "credit_notes": ["CN#12345"],
--     "lead_time_days": 10,
--     "constraints": ["backorder", "limited supply"]
--   }
-- invoice_metadata: JSON object containing parsed invoice data:
--   {
--     "invoice_number": "9027353363",
--     "invoice_date": "2025-10-08",
--     "due_date": "2025-10-22",
--     "total_amount": 1234.56,
--     "customer_name": "RAGLAN MINE"
--   }
