-- Migration 019: Create Documents Table
-- Version: 21.1.1
-- Description: Creates the documents table for PDF/Invoice registry if it doesn't exist
-- Fixes: error: relation "documents" does not exist

-- Documents (PDF/Invoice Registry)
CREATE TABLE IF NOT EXISTS documents (
  document_id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  document_type TEXT DEFAULT 'INVOICE',
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  processed_date TIMESTAMP,
  notes TEXT,
  -- Additional columns for owner console (from migration 018)
  id TEXT DEFAULT gen_random_uuid()::text,
  mime_type TEXT DEFAULT 'application/pdf',
  deleted_at TIMESTAMP,
  vendor TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC(12,2)
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor);
CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date DESC);
