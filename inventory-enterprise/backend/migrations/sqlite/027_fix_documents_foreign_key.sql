-- Migration 027: Fix documents table foreign key constraint
-- The documents table incorrectly references tenants(id) instead of tenants(tenant_id)

-- Since documents table is empty, we can safely drop and recreate it

BEGIN TRANSACTION;

-- Drop the old documents table
DROP TABLE IF EXISTS documents;

-- Recreate documents table with correct foreign key
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  metadata TEXT,
  extracted_text TEXT,
  extraction_date TIMESTAMP,
  extraction_quality TEXT,
  order_signals TEXT,
  invoice_metadata TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_extraction_quality ON documents(extraction_quality) WHERE extraction_quality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_extraction_date ON documents(extraction_date);

COMMIT;
