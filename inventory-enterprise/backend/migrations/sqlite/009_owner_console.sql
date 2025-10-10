-- Migration 009: Owner Mission Control Console
-- Version: 3.0.0
-- Description: Documents, GPS locations, item assignments, and owner console enhancements

-- Documents table for PDF management
CREATE TABLE IF NOT EXISTS documents (
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
  metadata TEXT -- JSON string for additional metadata
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);

-- Count Documents junction table (attach PDFs to counts)
CREATE TABLE IF NOT EXISTS count_documents (
  count_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  attached_by TEXT NOT NULL,
  attached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  PRIMARY KEY (count_id, document_id),
  FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_count_documents_count_id ON count_documents(count_id);
CREATE INDEX IF NOT EXISTS idx_count_documents_document_id ON count_documents(document_id);

-- Item Locations table (assign items to locations with sequence)
CREATE TABLE IF NOT EXISTS item_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE CASCADE,
  UNIQUE(location_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_item_locations_tenant ON item_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_item_locations_location ON item_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_item_locations_item_code ON item_locations(item_code);
CREATE INDEX IF NOT EXISTS idx_item_locations_sequence ON item_locations(location_id, sequence);

-- Add GPS and sequence fields to storage_locations (if not already present)
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, so this will fail silently if columns exist
-- Note: SQLite doesn't allow non-constant defaults in ALTER TABLE, so updated_at will be NULL initially
ALTER TABLE storage_locations ADD COLUMN latitude REAL;
ALTER TABLE storage_locations ADD COLUMN longitude REAL;
ALTER TABLE storage_locations ADD COLUMN sequence INTEGER DEFAULT 0;
ALTER TABLE storage_locations ADD COLUMN updated_at TIMESTAMP;

-- Add additional fields to inventory_counts for owner console
ALTER TABLE inventory_counts ADD COLUMN closed_at TIMESTAMP;
ALTER TABLE inventory_counts ADD COLUMN closed_by TEXT;

-- Owner Console Events table (for activity feed)
CREATE TABLE IF NOT EXISTS owner_console_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'pdf', 'count', 'location', 'ai_command'
  entity_id TEXT,
  actor_email TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT, -- JSON string
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_console_events_created_at ON owner_console_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_console_events_entity ON owner_console_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_owner_console_events_tenant ON owner_console_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_console_events_actor ON owner_console_events(actor_email);

-- AI Command Results table (store results from AI commands)
CREATE TABLE IF NOT EXISTS ai_command_results (
  id TEXT PRIMARY KEY,
  command_type TEXT NOT NULL, -- 'tuner', 'health', 'governance', 'security'
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  started_by TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  result_data TEXT, -- JSON string
  error_message TEXT,
  tenant_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_command_results_tenant ON ai_command_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_command_results_command_type ON ai_command_results(command_type);
CREATE INDEX IF NOT EXISTS idx_ai_command_results_status ON ai_command_results(status);
CREATE INDEX IF NOT EXISTS idx_ai_command_results_started_at ON ai_command_results(started_at DESC);
