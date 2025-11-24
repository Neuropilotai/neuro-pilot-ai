-- Migration 018: Owner Console Required Tables
-- Version: 21.1.0
-- Description: Creates all tables required for owner console functionality

-- Inventory Counts table (physical count sessions)
CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT '1',
  location_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'draft', 'pending_approval', 'approved', 'rejected', 'closed')),
  count_type TEXT DEFAULT 'MONTHLY',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  approved_at TIMESTAMP,
  closed_at TIMESTAMP,
  notes TEXT,
  approval_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_created_at ON inventory_counts(created_at DESC);

-- Inventory Count Rows (line items in a count)
CREATE TABLE IF NOT EXISTS inventory_count_rows (
  id SERIAL PRIMARY KEY,
  count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  expected_qty NUMERIC(10,2) DEFAULT 0,
  counted_qty NUMERIC(10,2) DEFAULT 0,
  variance NUMERIC(10,2) DEFAULT 0,
  unit TEXT,
  notes TEXT,
  counted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  counted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_count_rows_count_id ON inventory_count_rows(count_id);
CREATE INDEX IF NOT EXISTS idx_count_rows_item_code ON inventory_count_rows(item_code);

-- Count Documents (PDFs attached to counts)
CREATE TABLE IF NOT EXISTS count_documents (
  id SERIAL PRIMARY KEY,
  count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  attached_by TEXT,
  attached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(count_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_count_documents_count ON count_documents(count_id);
CREATE INDEX IF NOT EXISTS idx_count_documents_document ON count_documents(document_id);

-- Ensure documents table has necessary columns
DO $$
BEGIN
  -- Add id column if missing (for compatibility)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'id'
  ) THEN
    ALTER TABLE documents ADD COLUMN id TEXT DEFAULT gen_random_uuid()::text;
  END IF;

  -- Add mime_type column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE documents ADD COLUMN mime_type TEXT DEFAULT 'application/pdf';
  END IF;

  -- Add deleted_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMP;
  END IF;

  -- Add vendor column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'vendor'
  ) THEN
    ALTER TABLE documents ADD COLUMN vendor TEXT;
  END IF;

  -- Add invoice_date column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE documents ADD COLUMN invoice_date DATE;
  END IF;

  -- Add invoice_amount column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'invoice_amount'
  ) THEN
    ALTER TABLE documents ADD COLUMN invoice_amount NUMERIC(12,2);
  END IF;
END $$;

-- Count Workspaces (month-end count sessions)
CREATE TABLE IF NOT EXISTS count_workspaces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_count_workspaces_status ON count_workspaces(status);

-- Workspace Items
CREATE TABLE IF NOT EXISTS workspace_items (
  workspace_id TEXT NOT NULL REFERENCES count_workspaces(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, item_code)
);

-- Workspace Invoices (PDFs attached to workspaces)
CREATE TABLE IF NOT EXISTS workspace_invoices (
  workspace_id TEXT NOT NULL REFERENCES count_workspaces(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  attached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, document_id)
);

-- Workspace Counts (per-location item counts)
CREATE TABLE IF NOT EXISTS workspace_counts (
  workspace_id TEXT NOT NULL REFERENCES count_workspaces(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  qty NUMERIC(10,2) DEFAULT 0,
  counted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  counted_by TEXT,
  PRIMARY KEY (workspace_id, location_id, item_code)
);

-- Add sample inventory count for testing
INSERT INTO inventory_counts (id, tenant_id, location_id, status, created_by, count_type)
SELECT 'CNT-001', '1', id, 'closed', 'system', 'MONTHLY'
FROM storage_locations
WHERE is_active = true
LIMIT 1
ON CONFLICT (id) DO NOTHING;
