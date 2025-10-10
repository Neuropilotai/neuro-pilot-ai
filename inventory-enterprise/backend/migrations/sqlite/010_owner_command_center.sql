-- Owner Command Center Schema
-- Version 3.1.0
-- Created: 2025-10-09

-- Inventory Counts (physical count sessions)
CREATE TABLE IF NOT EXISTS inventory_counts (
  count_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'closed', 'cancelled')),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  starting_location_id INTEGER,
  total_lines INTEGER DEFAULT 0,
  locations_touched INTEGER DEFAULT 0,
  notes TEXT,
  snapshot_data TEXT, -- JSON snapshot when closed
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (starting_location_id) REFERENCES storage_locations(location_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_counts_tenant ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_counts_owner ON inventory_counts(owner_id);
CREATE INDEX IF NOT EXISTS idx_counts_status ON inventory_counts(status);
CREATE INDEX IF NOT EXISTS idx_counts_started ON inventory_counts(started_at DESC);

-- Count Items (line items within a count session)
CREATE TABLE IF NOT EXISTS count_items (
  count_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit_cost REAL,
  barcode TEXT,
  notes TEXT,
  sequence INTEGER, -- Order within count
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES item_master(item_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES storage_locations(location_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_item ON count_items(item_id);
CREATE INDEX IF NOT EXISTS idx_count_items_location ON count_items(location_id);
CREATE INDEX IF NOT EXISTS idx_count_items_barcode ON count_items(barcode);

-- Count PDFs (attach invoices/orders to counts)
CREATE TABLE IF NOT EXISTS count_pdfs (
  count_pdf_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  document_id TEXT NOT NULL, -- SHA-256 from documents table
  invoice_number TEXT,
  attached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_by TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(count_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_count_pdfs_count ON count_pdfs(count_id);
CREATE INDEX IF NOT EXISTS idx_count_pdfs_document ON count_pdfs(document_id);
CREATE INDEX IF NOT EXISTS idx_count_pdfs_invoice ON count_pdfs(invoice_number);

-- Count Audit Trail (detailed action log)
CREATE TABLE IF NOT EXISTS count_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'started', 'item_added', 'item_updated', 'pdf_attached', 'closed'
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  details TEXT, -- JSON with action-specific data
  ip_address TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_count_audit_count ON count_audit(count_id);
CREATE INDEX IF NOT EXISTS idx_count_audit_timestamp ON count_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_count_audit_action ON count_audit(action);

-- Owner Session Tracking (for watchdog)
CREATE TABLE IF NOT EXISTS owner_sessions (
  session_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  device_fingerprint TEXT,
  token_issued_at TIMESTAMP NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ws_connected INTEGER DEFAULT 0,
  ws_last_reconnect TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_sessions_owner ON owner_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_expires ON owner_sessions(token_expires_at);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_activity ON owner_sessions(last_activity DESC);

-- Device Registration (optional single-device hardening)
CREATE TABLE IF NOT EXISTS owner_devices (
  device_id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL UNIQUE,
  device_name TEXT,
  trusted INTEGER DEFAULT 0,
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(owner_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_owner_devices_owner ON owner_devices(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_devices_fingerprint ON owner_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_owner_devices_trusted ON owner_devices(trusted);
