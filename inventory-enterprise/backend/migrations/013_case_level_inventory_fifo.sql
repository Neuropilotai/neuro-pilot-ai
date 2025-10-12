-- ============================================================================
-- NeuroPilot v13.1 - Case-Level Inventory Tracking (FIFO)
-- ============================================================================
-- Migration: 013
-- Purpose: Enable case-level tracking for variable-weight items (meat, cheese, etc.)
-- Critical for: FIFO inventory management and accurate pricing
-- ============================================================================

-- Table: invoice_line_items
-- Stores detailed line items from invoices with full extraction data
CREATE TABLE IF NOT EXISTS invoice_line_items (
    line_item_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    product_code TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    description TEXT,
    category TEXT,
    unit_price REAL,
    line_total REAL,
    unit TEXT, -- CS, EA, KG, LB, etc.
    quantity_shipped INTEGER,
    pack_size TEXT, -- e.g. "2x6.5 KGA"
    brand TEXT,
    barcode TEXT,
    total_weight REAL, -- For variable-weight items
    has_case_tracking BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL,

    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_document ON invoice_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_product ON invoice_line_items(product_code);

-- Table: invoice_line_item_cases
-- Stores individual case numbers and weights for FIFO tracking
-- Critical for: tracking which specific cases are in inventory
CREATE TABLE IF NOT EXISTS invoice_line_item_cases (
    case_id TEXT PRIMARY KEY,
    line_item_id TEXT NOT NULL,
    case_number TEXT NOT NULL, -- Barcode/serial number (e.g. 410147424516)
    weight REAL NOT NULL, -- Case weight in KG
    weight_unit TEXT DEFAULT 'KG',
    sequence_number INTEGER NOT NULL, -- 1, 2, 3, 4 (for FIFO ordering)

    -- FIFO tracking
    status TEXT DEFAULT 'IN_STOCK', -- IN_STOCK, ALLOCATED, USED, WASTED
    allocated_to_count_id TEXT, -- Linked to inventory count if used
    allocated_at TEXT,
    used_at TEXT,

    created_at TEXT NOT NULL,

    FOREIGN KEY (line_item_id) REFERENCES invoice_line_items(line_item_id) ON DELETE CASCADE,
    UNIQUE(case_number) -- Each case barcode is unique
);

CREATE INDEX IF NOT EXISTS idx_cases_line_item ON invoice_line_item_cases(line_item_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON invoice_line_item_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON invoice_line_item_cases(case_number);

-- Table: inventory_fifo_queue
-- FIFO queue for managing which cases should be used next
-- Ensures oldest inventory is used first
CREATE TABLE IF NOT EXISTS inventory_fifo_queue (
    queue_id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL,
    case_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    case_number TEXT NOT NULL,
    weight REAL NOT NULL,
    priority_score INTEGER NOT NULL, -- Lower = use first (calculated from date)

    status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, RESERVED, CONSUMED
    reserved_at TEXT,
    reserved_by TEXT, -- User who reserved
    consumed_at TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (case_id) REFERENCES invoice_line_item_cases(case_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fifo_queue_product ON inventory_fifo_queue(product_code, priority_score);
CREATE INDEX IF NOT EXISTS idx_fifo_queue_status ON inventory_fifo_queue(status);

-- Table: price_per_kg_history
-- Tracks price per KG for variable-weight items over time
-- Enables accurate cost calculation based on actual case weights
CREATE TABLE IF NOT EXISTS price_per_kg_history (
    history_id TEXT PRIMARY KEY,
    product_code TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    price_per_kg REAL NOT NULL,
    total_weight REAL NOT NULL,
    line_total REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_per_kg_history(product_code, invoice_date DESC);

-- ============================================================================
-- VIEWS: Convenience queries for FIFO inventory
-- ============================================================================

-- View: v_available_cases_fifo
-- Shows all available cases ordered by FIFO (oldest first)
CREATE VIEW IF NOT EXISTS v_available_cases_fifo AS
SELECT
    q.queue_id,
    q.product_code,
    q.case_number,
    q.weight,
    q.invoice_number,
    q.invoice_date,
    q.priority_score,
    li.description as product_description,
    li.brand,
    li.unit,
    c.status as case_status
FROM inventory_fifo_queue q
JOIN invoice_line_item_cases c ON q.case_id = c.case_id
JOIN invoice_line_items li ON c.line_item_id = li.line_item_id
WHERE q.status = 'AVAILABLE'
  AND c.status = 'IN_STOCK'
ORDER BY q.product_code, q.priority_score ASC;

-- View: v_inventory_summary_by_product
-- Aggregates available inventory by product with FIFO awareness
CREATE VIEW IF NOT EXISTS v_inventory_summary_by_product AS
SELECT
    li.product_code,
    li.description as product_name,
    li.brand,
    COUNT(DISTINCT c.case_id) as total_cases_in_stock,
    SUM(c.weight) as total_weight_kg,
    MIN(ili.invoice_date) as oldest_invoice_date,
    MAX(ili.invoice_date) as newest_invoice_date,
    AVG(ph.price_per_kg) as avg_price_per_kg,
    SUM(c.weight * ph.price_per_kg) as estimated_inventory_value
FROM invoice_line_items li
JOIN invoice_line_item_cases c ON li.line_item_id = c.line_item_id
LEFT JOIN (
    SELECT invoice_number, invoice_date
    FROM documents
    WHERE mime_type = 'application/pdf'
) ili ON li.invoice_number = ili.invoice_number
LEFT JOIN price_per_kg_history ph ON li.product_code = ph.product_code
    AND ph.invoice_date = (
        SELECT MAX(invoice_date)
        FROM price_per_kg_history
        WHERE product_code = li.product_code
    )
WHERE c.status = 'IN_STOCK'
GROUP BY li.product_code, li.description, li.brand
ORDER BY total_cases_in_stock DESC;

-- ============================================================================
-- SUCCESS
-- ============================================================================
-- Migration 013 complete: Case-level inventory tracking enabled
-- Features:
--   ✅ Line item extraction from invoices
--   ✅ Individual case tracking with barcodes and weights
--   ✅ FIFO queue management
--   ✅ Price per KG history for accurate costing
--   ✅ Inventory summary views
-- ============================================================================
