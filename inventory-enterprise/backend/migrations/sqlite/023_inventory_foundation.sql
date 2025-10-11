-- =====================================================================
-- Migration 023: Inventory Foundation (Zero-Count Smart Mode)
-- =====================================================================
-- Purpose: Create core inventory schema with Zero-Count Smart Mode support
-- Version: v3.3.0
-- Date: 2025-10-10
--
-- Tables Created:
-- - inventory_items: Master SKU list with par levels
-- - item_locations: Storage location assignments
-- - documents: PDF/invoice document registry
-- - processed_invoices: Invoice line items
-- - count_headers: Physical count sessions
-- - count_items: Individual count entries
-- - fifo_cost_layers: Cost tracking by receipt
--
-- Views Created:
-- - v_current_inventory_estimate: Zero-Count smart estimates
-- - v_inventory_with_fifo: Normal mode with FIFO layers
-- - v_stockout_risk_detailed: Enhanced stock-out radar
--
-- =====================================================================

-- =====================================================================
-- TABLE: inventory_items (Master SKU List)
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'EA',              -- EA, LB, OZ, G, GAL, L
  category TEXT,                                -- BEVERAGE, BREAKFAST, MEAT, PRODUCE, etc.
  cost_code TEXT,                               -- For accounting
  par_level REAL DEFAULT 0,                     -- Target stock level
  reorder_point REAL DEFAULT 0,                 -- When to reorder
  current_quantity REAL DEFAULT 0,              -- Current stock (updated by counts)
  last_count_date DATE,                         -- When last physically counted
  last_invoice_date DATE,                       -- Last received via invoice
  last_invoice_no TEXT,                         -- Invoice reference
  is_active INTEGER DEFAULT 1,                  -- 0 = archived
  barcode TEXT,                                 -- Optional barcode
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON inventory_items(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active);

-- =====================================================================
-- TABLE: item_locations (Storage Locations)
-- =====================================================================

CREATE TABLE IF NOT EXISTS item_locations (
  location_id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_code TEXT NOT NULL UNIQUE,
  location_name TEXT NOT NULL,
  location_type TEXT DEFAULT 'STORAGE',         -- STORAGE, COOLER, FREEZER, DRY
  sequence INTEGER DEFAULT 0,                   -- Display order
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_item_locations_type ON item_locations(location_type);

-- Seed default locations
INSERT OR IGNORE INTO item_locations (location_code, location_name, location_type, sequence) VALUES
  ('COOLER-01', 'Walk-in Cooler #1', 'COOLER', 1),
  ('FREEZER-01', 'Walk-in Freezer #1', 'FREEZER', 2),
  ('DRY-STORAGE', 'Dry Storage Room', 'DRY', 3),
  ('PANTRY-01', 'Main Pantry', 'STORAGE', 4),
  ('RECEIVING', 'Receiving Area', 'STORAGE', 5);

-- =====================================================================
-- TABLE: item_location_assignments
-- =====================================================================

CREATE TABLE IF NOT EXISTS item_location_assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,                 -- 1 = primary location
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE CASCADE,
  FOREIGN KEY (location_code) REFERENCES item_locations(location_code) ON DELETE CASCADE,
  UNIQUE(item_code, location_code)
);

CREATE INDEX IF NOT EXISTS idx_item_location_item ON item_location_assignments(item_code);
CREATE INDEX IF NOT EXISTS idx_item_location_location ON item_location_assignments(location_code);

-- =====================================================================
-- TABLE: documents (PDF/Invoice Registry)
-- =====================================================================

CREATE TABLE IF NOT EXISTS documents (
  document_id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',
  invoice_number TEXT,
  invoice_date DATE,
  vendor_name TEXT,
  total_amount REAL,
  is_processed INTEGER DEFAULT 0,               -- 0 = pending, 1 = included in count
  processed_at TIMESTAMP,
  notes TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_invoice ON documents(invoice_number);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(is_processed);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(invoice_date DESC);

-- =====================================================================
-- TABLE: processed_invoices (Invoice Line Items)
-- =====================================================================

CREATE TABLE IF NOT EXISTS processed_invoices (
  line_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  line_number INTEGER,
  item_code TEXT,
  item_description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_cost REAL,
  extended_cost REAL,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_invoices_doc ON processed_invoices(document_id);
CREATE INDEX IF NOT EXISTS idx_processed_invoices_item ON processed_invoices(item_code);
CREATE INDEX IF NOT EXISTS idx_processed_invoices_date ON processed_invoices(received_date DESC);

-- =====================================================================
-- TABLE: count_headers (Physical Count Sessions)
-- =====================================================================

CREATE TABLE IF NOT EXISTS count_headers (
  count_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_date DATE NOT NULL,
  count_type TEXT DEFAULT 'MONTHLY',            -- MONTHLY, SPOT, CYCLE, OPENING
  status TEXT DEFAULT 'OPEN',                   -- OPEN, CLOSED, CANCELLED
  started_by TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  total_lines INTEGER DEFAULT 0,
  locations_touched INTEGER DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_count_headers_date ON count_headers(count_date DESC);
CREATE INDEX IF NOT EXISTS idx_count_headers_status ON count_headers(status);

-- =====================================================================
-- TABLE: count_items (Individual Count Entries)
-- =====================================================================

CREATE TABLE IF NOT EXISTS count_items (
  count_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  location_code TEXT,
  counted_quantity REAL NOT NULL,
  system_quantity REAL,                         -- Qty before count
  variance REAL,                                -- counted - system
  unit TEXT NOT NULL,
  counted_by TEXT,
  notes TEXT,
  counted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (count_id) REFERENCES count_headers(count_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE RESTRICT,
  FOREIGN KEY (location_code) REFERENCES item_locations(location_code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_item ON count_items(item_code);

-- =====================================================================
-- TABLE: fifo_cost_layers (Cost Tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS fifo_cost_layers (
  layer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  received_date DATE NOT NULL,
  quantity_received REAL NOT NULL,
  quantity_remaining REAL NOT NULL,
  unit_cost REAL NOT NULL,
  unit TEXT NOT NULL,
  location_code TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_code) REFERENCES inventory_items(item_code) ON DELETE CASCADE,
  FOREIGN KEY (location_code) REFERENCES item_locations(location_code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fifo_item ON fifo_cost_layers(item_code);
CREATE INDEX IF NOT EXISTS idx_fifo_date ON fifo_cost_layers(received_date);
CREATE INDEX IF NOT EXISTS idx_fifo_invoice ON fifo_cost_layers(invoice_number);

-- =====================================================================
-- VIEW: v_current_inventory_estimate (Zero-Count Smart Mode)
-- =====================================================================
-- Computes inferred quantities when no physical count exists
-- Uses: par levels + recent invoices - forecast consumption

CREATE VIEW IF NOT EXISTS v_current_inventory_estimate AS
SELECT
  ii.item_code,
  ii.item_name,
  ii.unit,
  ii.category,
  ii.par_level,

  -- Inferred quantity logic
  CASE
    -- If we have a recent count, use it
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN ii.current_quantity

    -- If we have recent invoice + forecast, estimate consumption
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') AND fcache.predicted_qty IS NOT NULL THEN
      MAX(0,
        COALESCE(
          (SELECT SUM(quantity_received)
           FROM processed_invoices
           WHERE item_code = ii.item_code
           AND received_date >= DATE('now', '-7 days')
          ), ii.par_level
        ) - (fcache.predicted_qty * (JULIANDAY('now') - JULIANDAY(ii.last_invoice_date)))
      )

    -- Fallback to par level
    ELSE ii.par_level
  END as inferred_qty,

  -- Confidence scoring (0.0 - 1.0)
  CASE
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN 1.0
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') AND fcache.predicted_qty IS NOT NULL THEN 0.7
    WHEN ii.last_invoice_date >= DATE('now', '-30 days') THEN 0.4
    ELSE 0.2
  END as confidence,

  -- Source indicator
  CASE
    WHEN ii.last_count_date >= DATE('now', '-30 days') THEN 'recent_count'
    WHEN ii.last_invoice_date >= DATE('now', '-7 days') THEN 'invoice_forecast'
    ELSE 'par_level'
  END as source,

  ii.last_invoice_date,
  ii.last_invoice_no,
  ii.last_count_date,

  -- Check if item appears in forecast
  CASE WHEN fcache.predicted_qty IS NOT NULL THEN 1 ELSE 0 END as has_forecast

FROM inventory_items ii
LEFT JOIN (
  SELECT
    item_code,
    SUM(total_predicted_qty) as predicted_qty
  FROM v_predicted_usage_today_v2
  GROUP BY item_code
) fcache ON ii.item_code = fcache.item_code
WHERE ii.is_active = 1;

-- =====================================================================
-- VIEW: v_inventory_with_fifo (Normal Mode with FIFO)
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_inventory_with_fifo AS
SELECT
  ii.item_code,
  ii.item_name,
  ii.unit,
  ii.category,
  ii.current_quantity,
  ii.par_level,
  ii.reorder_point,
  ii.last_count_date,

  -- FIFO layer details (JSON aggregate)
  (
    SELECT json_group_array(
      json_object(
        'invoice_no', invoice_number,
        'received_date', received_date,
        'qty_remaining', quantity_remaining,
        'unit_cost', unit_cost,
        'location', location_code
      )
    )
    FROM fifo_cost_layers
    WHERE item_code = ii.item_code
    AND quantity_remaining > 0
    ORDER BY received_date ASC
  ) as fifo_layers,

  -- Weighted average cost
  COALESCE(
    (SELECT SUM(quantity_remaining * unit_cost) / NULLIF(SUM(quantity_remaining), 0)
     FROM fifo_cost_layers
     WHERE item_code = ii.item_code AND quantity_remaining > 0
    ), 0
  ) as avg_unit_cost,

  -- Number of active layers
  COALESCE(
    (SELECT COUNT(*)
     FROM fifo_cost_layers
     WHERE item_code = ii.item_code AND quantity_remaining > 0
    ), 0
  ) as layer_count

FROM inventory_items ii
WHERE ii.is_active = 1;

-- =====================================================================
-- VIEW: v_stockout_risk_detailed (Enhanced Stock-out Radar)
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_stockout_risk_detailed AS
SELECT
  est.item_code,
  est.item_name,
  est.unit,
  est.inferred_qty as available_qty,
  COALESCE(pred.total_predicted_qty, 0) as predicted_24h,
  COALESCE(pred.total_predicted_qty, 0) - est.inferred_qty as shortage_qty,

  -- Risk level
  CASE
    WHEN est.inferred_qty <= 0 THEN 'CRITICAL'
    WHEN est.inferred_qty < (COALESCE(pred.total_predicted_qty, 0) * 0.5) THEN 'HIGH'
    WHEN est.inferred_qty < COALESCE(pred.total_predicted_qty, 0) THEN 'MEDIUM'
    ELSE 'LOW'
  END as risk_level,

  -- Reason string
  CASE
    WHEN est.inferred_qty <= 0 THEN 'OUT OF STOCK - Immediate replenishment required'
    WHEN est.inferred_qty < (COALESCE(pred.total_predicted_qty, 0) * 0.5) THEN
      est.item_name || ': ' || CAST(COALESCE(pred.total_predicted_qty, 0) as TEXT) || est.unit || ' needed; ' ||
      CAST(est.inferred_qty as TEXT) || est.unit || ' available (50% short)'
    WHEN est.inferred_qty < COALESCE(pred.total_predicted_qty, 0) THEN
      'Below predicted usage - monitor closely'
    ELSE 'Adequate stock'
  END as reason,

  est.confidence,
  est.source as estimate_source,
  pred.forecast_sources,
  est.last_invoice_date,
  est.last_count_date

FROM v_current_inventory_estimate est
LEFT JOIN v_predicted_usage_today_v2 pred
  ON est.item_code = pred.item_code
WHERE
  COALESCE(pred.total_predicted_qty, 0) > 0
  AND est.inferred_qty < COALESCE(pred.total_predicted_qty, 0)
ORDER BY
  CASE
    WHEN est.inferred_qty <= 0 THEN 1
    WHEN est.inferred_qty < (COALESCE(pred.total_predicted_qty, 0) * 0.5) THEN 2
    WHEN est.inferred_qty < COALESCE(pred.total_predicted_qty, 0) THEN 3
    ELSE 4
  END,
  COALESCE(pred.total_predicted_qty, 0) DESC;

-- =====================================================================
-- Seed Sample Data (commented out - uncomment to populate demo data)
-- =====================================================================

-- Sample inventory items (leveraging existing item_alias_map)
INSERT OR IGNORE INTO inventory_items (item_code, item_name, unit, category, par_level, reorder_point, current_quantity)
SELECT
  item_code,
  UPPER(alias_name) as item_name,
  conversion_unit as unit,
  UPPER(category) as category,
  CASE category
    WHEN 'beverage' THEN 1000
    WHEN 'breakfast' THEN 500
    ELSE 100
  END as par_level,
  CASE category
    WHEN 'beverage' THEN 300
    WHEN 'breakfast' THEN 150
    ELSE 30
  END as reorder_point,
  0 as current_quantity
FROM item_alias_map;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Version: 023
-- Tables Created: 7 (inventory_items, item_locations, item_location_assignments,
--                    documents, processed_invoices, count_headers, count_items, fifo_cost_layers)
-- Views Created: 3 (v_current_inventory_estimate, v_inventory_with_fifo, v_stockout_risk_detailed)
-- Indexes Created: 17
-- Seed Data: 5 default locations, items from item_alias_map
-- =====================================================================
