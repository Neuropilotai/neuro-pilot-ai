-- ENTERPRISE INVENTORY MANAGEMENT SYSTEM
-- Phase 1: Core Schema
-- Database: SQLite (can be migrated to PostgreSQL/MySQL later)

-- ============================================================================
-- 1. PHYSICAL INVENTORY COUNTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_counts (
  count_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_date TEXT NOT NULL,                    -- When count was performed
  cut_off_date TEXT NOT NULL,                  -- Last invoice included in count
  performed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS, COMPLETED, APPROVED
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  approved_at TEXT,
  approved_by TEXT,

  -- Summary statistics
  total_items_counted INTEGER DEFAULT 0,
  total_locations INTEGER DEFAULT 0,
  total_variance_value REAL DEFAULT 0,

  CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'APPROVED'))
);

-- ============================================================================
-- 2. INVENTORY SNAPSHOTS (Physical Count Results)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  barcode TEXT,
  description TEXT NOT NULL,
  location_id INTEGER NOT NULL,

  -- Physical count data
  counted_quantity REAL NOT NULL,
  counted_unit TEXT NOT NULL,

  -- System calculated data (from invoices)
  system_quantity REAL NOT NULL DEFAULT 0,

  -- Variance analysis
  variance_quantity REAL,                      -- counted - system
  variance_value REAL,                         -- variance * unit_price
  variance_percent REAL,                       -- (variance / system) * 100

  -- Metadata
  counted_by TEXT,
  counted_at TEXT,
  notes TEXT,
  requires_recount INTEGER DEFAULT 0,          -- Flag for high variance

  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id),
  FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);

CREATE INDEX idx_snapshots_count ON inventory_snapshots(count_id);
CREATE INDEX idx_snapshots_item ON inventory_snapshots(item_code);
CREATE INDEX idx_snapshots_location ON inventory_snapshots(location_id);

-- ============================================================================
-- 3. INVOICE ITEMS (Enhanced with Status Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  item_code TEXT NOT NULL,
  barcode TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,

  -- Inventory management status
  status TEXT NOT NULL DEFAULT 'PENDING_PLACEMENT',  -- PENDING_PLACEMENT, PLACED, COUNTED, CONSUMED
  location_id INTEGER,
  assigned_by TEXT,
  assigned_at TEXT,

  -- Count tracking
  last_counted_in INTEGER,                     -- Links to inventory_counts.count_id

  -- FIFO tracking
  batch_number TEXT,                           -- Auto-generated batch ID
  expiry_date TEXT,                            -- If applicable

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (location_id) REFERENCES storage_locations(id),
  FOREIGN KEY (last_counted_in) REFERENCES inventory_counts(count_id),

  CHECK (status IN ('PENDING_PLACEMENT', 'PLACED', 'COUNTED', 'CONSUMED'))
);

CREATE INDEX idx_invoice_items_status ON invoice_items(status);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_number);
CREATE INDEX idx_invoice_items_item_code ON invoice_items(item_code);
CREATE INDEX idx_invoice_items_location ON invoice_items(location_id);
CREATE INDEX idx_invoice_items_date ON invoice_items(invoice_date);

-- ============================================================================
-- 4. LOCATION ASSIGNMENT WORKFLOW
-- ============================================================================
CREATE TABLE IF NOT EXISTS location_assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  from_location_id INTEGER,                    -- NULL for new receipts
  to_location_id INTEGER NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  reason TEXT,                                 -- RECEIPT, TRANSFER, ADJUSTMENT
  status TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING, COMPLETED, CANCELLED
  notes TEXT,

  FOREIGN KEY (from_location_id) REFERENCES storage_locations(id),
  FOREIGN KEY (to_location_id) REFERENCES storage_locations(id),

  CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  CHECK (reason IN ('RECEIPT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'))
);

CREATE INDEX idx_assignments_invoice ON location_assignments(invoice_number);
CREATE INDEX idx_assignments_status ON location_assignments(status);
CREATE INDEX idx_assignments_to_location ON location_assignments(to_location_id);

-- ============================================================================
-- 5. MIN/MAX INVENTORY LEVELS (Post First Count)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_min_max (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL UNIQUE,
  barcode TEXT,
  description TEXT NOT NULL,

  -- Min/Max levels
  min_quantity REAL NOT NULL DEFAULT 0,        -- Reorder point
  max_quantity REAL NOT NULL DEFAULT 0,        -- Maximum stock level
  reorder_quantity REAL NOT NULL DEFAULT 0,    -- How much to order
  unit TEXT NOT NULL,

  -- Calculated from historical data
  avg_weekly_usage REAL DEFAULT 0,
  lead_time_days INTEGER DEFAULT 7,            -- Supplier lead time
  safety_stock REAL DEFAULT 0,                 -- Buffer stock

  -- Status
  active INTEGER DEFAULT 1,
  auto_calculate INTEGER DEFAULT 1,            -- Auto-calculate from usage

  -- Tracking
  last_updated TEXT,
  updated_by TEXT,
  notes TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_min_max_item ON inventory_min_max(item_code);
CREATE INDEX idx_min_max_active ON inventory_min_max(active);

-- ============================================================================
-- 6. INVENTORY USAGE/CONSUMPTION TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_consumption (
  consumption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  location_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  consumption_date TEXT NOT NULL,
  consumed_by TEXT,
  reason TEXT,                                 -- PRODUCTION, WASTE, SALE, TRANSFER, ADJUSTMENT
  notes TEXT,

  -- Link to original receipt (FIFO)
  source_invoice_number TEXT,
  source_batch_number TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (location_id) REFERENCES storage_locations(id),

  CHECK (reason IN ('PRODUCTION', 'WASTE', 'SALE', 'TRANSFER', 'ADJUSTMENT', 'DAMAGED'))
);

CREATE INDEX idx_consumption_item ON inventory_consumption(item_code);
CREATE INDEX idx_consumption_date ON inventory_consumption(consumption_date);
CREATE INDEX idx_consumption_location ON inventory_consumption(location_id);

-- ============================================================================
-- 7. REORDER ALERTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reorder_alerts (
  alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  description TEXT NOT NULL,
  current_quantity REAL NOT NULL,
  min_quantity REAL NOT NULL,
  reorder_quantity REAL NOT NULL,
  alert_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',       -- ACTIVE, ORDERED, RECEIVED, DISMISSED
  ordered_at TEXT,
  ordered_by TEXT,
  dismissed_at TEXT,
  dismissed_by TEXT,
  notes TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  CHECK (status IN ('ACTIVE', 'ORDERED', 'RECEIVED', 'DISMISSED'))
);

CREATE INDEX idx_alerts_status ON reorder_alerts(status);
CREATE INDEX idx_alerts_item ON reorder_alerts(item_code);
CREATE INDEX idx_alerts_date ON reorder_alerts(alert_date);

-- ============================================================================
-- 8. SYSTEM CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Insert default configuration
INSERT OR IGNORE INTO inventory_config (config_key, config_value, description) VALUES
  ('last_count_date', '', 'Date of last completed physical count'),
  ('last_cut_off_date', '', 'Cut-off date for last count'),
  ('variance_threshold_percent', '5', 'Variance % that requires recount'),
  ('auto_reorder_enabled', '0', 'Enable automatic reorder alerts'),
  ('default_lead_time_days', '7', 'Default supplier lead time'),
  ('safety_stock_percent', '20', 'Safety stock as % of avg weekly usage'),
  ('min_max_calculation_weeks', '12', 'Weeks of data to calculate min/max');

-- ============================================================================
-- 9. AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_audit_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,                        -- COUNT_CREATED, LOCATION_ASSIGNED, STATUS_CHANGED, etc.
  entity_type TEXT NOT NULL,                   -- INVOICE_ITEM, COUNT, SNAPSHOT, etc.
  entity_id INTEGER NOT NULL,
  old_value TEXT,
  new_value TEXT,
  performed_by TEXT NOT NULL,
  performed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  notes TEXT
);

CREATE INDEX idx_audit_date ON inventory_audit_log(performed_at);
CREATE INDEX idx_audit_entity ON inventory_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON inventory_audit_log(performed_by);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Current Inventory by Location
CREATE VIEW IF NOT EXISTS v_current_inventory AS
SELECT
  ii.item_code,
  ii.barcode,
  ii.description,
  ii.location_id,
  sl.name as location_name,
  SUM(ii.quantity) as total_quantity,
  ii.unit,
  MAX(ii.invoice_date) as last_received,
  COUNT(DISTINCT ii.invoice_number) as receipt_count,
  ii.status
FROM invoice_items ii
LEFT JOIN storage_locations sl ON ii.location_id = sl.id
WHERE ii.status IN ('PLACED', 'COUNTED')
GROUP BY ii.item_code, ii.location_id
ORDER BY sl.name, ii.description;

-- Pending Location Assignments
CREATE VIEW IF NOT EXISTS v_pending_placements AS
SELECT
  ii.invoice_number,
  ii.invoice_date,
  ii.item_code,
  ii.barcode,
  ii.description,
  ii.quantity,
  ii.unit,
  ii.line_total,
  ii.created_at
FROM invoice_items ii
WHERE ii.status = 'PENDING_PLACEMENT'
ORDER BY ii.invoice_date DESC, ii.invoice_number, ii.item_code;

-- Items Below Min Level (Reorder Needed)
CREATE VIEW IF NOT EXISTS v_reorder_needed AS
SELECT
  imm.item_code,
  imm.description,
  imm.min_quantity,
  imm.max_quantity,
  imm.reorder_quantity,
  COALESCE(ci.total_quantity, 0) as current_quantity,
  (imm.min_quantity - COALESCE(ci.total_quantity, 0)) as shortage,
  imm.unit
FROM inventory_min_max imm
LEFT JOIN v_current_inventory ci ON imm.item_code = ci.item_code
WHERE imm.active = 1
  AND COALESCE(ci.total_quantity, 0) < imm.min_quantity
ORDER BY (imm.min_quantity - COALESCE(ci.total_quantity, 0)) DESC;

-- Latest Physical Count Summary
CREATE VIEW IF NOT EXISTS v_latest_count_summary AS
SELECT
  ic.count_id,
  ic.count_date,
  ic.cut_off_date,
  ic.status,
  ic.total_items_counted,
  ic.total_locations,
  ic.total_variance_value,
  ic.performed_by,
  COUNT(DISTINCT is2.snapshot_id) as items_with_variance,
  SUM(CASE WHEN is2.requires_recount = 1 THEN 1 ELSE 0 END) as items_need_recount
FROM inventory_counts ic
LEFT JOIN inventory_snapshots is2 ON ic.count_id = is2.count_id
WHERE ic.count_id = (SELECT MAX(count_id) FROM inventory_counts)
GROUP BY ic.count_id;

-- ============================================================================
-- TRIGGERS FOR AUDIT LOGGING
-- ============================================================================

-- Log status changes on invoice items
CREATE TRIGGER IF NOT EXISTS tr_invoice_item_status_change
AFTER UPDATE OF status ON invoice_items
WHEN old.status != new.status
BEGIN
  INSERT INTO inventory_audit_log (action, entity_type, entity_id, old_value, new_value, performed_by)
  VALUES ('STATUS_CHANGED', 'INVOICE_ITEM', new.item_id, old.status, new.status, new.assigned_by);
END;

-- Log location assignments
CREATE TRIGGER IF NOT EXISTS tr_location_assignment
AFTER UPDATE OF location_id ON invoice_items
WHEN new.location_id IS NOT NULL AND old.location_id IS NULL
BEGIN
  INSERT INTO inventory_audit_log (action, entity_type, entity_id, old_value, new_value, performed_by)
  VALUES ('LOCATION_ASSIGNED', 'INVOICE_ITEM', new.item_id,
          'NONE',
          (SELECT name FROM storage_locations WHERE id = new.location_id),
          new.assigned_by);
END;

-- Update timestamps
CREATE TRIGGER IF NOT EXISTS tr_invoice_item_updated
AFTER UPDATE ON invoice_items
BEGIN
  UPDATE invoice_items SET updated_at = CURRENT_TIMESTAMP WHERE item_id = new.item_id;
END;

-- ============================================================================
-- MIGRATION FROM EXISTING DATA
-- ============================================================================

-- This will be run to migrate existing invoice data to new schema
-- (Separate migration script will be created)
