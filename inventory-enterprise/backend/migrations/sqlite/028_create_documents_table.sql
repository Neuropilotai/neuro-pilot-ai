-- Migration 028: Create Documents Table (SQLite)
-- Version: 21.1.1
-- Description: Creates the documents table for PDF/Invoice registry
-- Mirrors PostgreSQL migration 019

CREATE TABLE IF NOT EXISTS documents (
  document_id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  document_type TEXT DEFAULT 'INVOICE',
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed INTEGER DEFAULT 0,
  processed_date TIMESTAMP,
  notes TEXT,
  id TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  mime_type TEXT DEFAULT 'application/pdf',
  deleted_at TIMESTAMP,
  vendor TEXT,
  invoice_date DATE,
  invoice_amount REAL
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor);
CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date DESC);
