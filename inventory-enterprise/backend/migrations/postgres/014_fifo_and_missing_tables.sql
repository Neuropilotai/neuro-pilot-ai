-- Migration 014: Add missing tables for inventory routes
-- Fixes: relation "fifo_cost_layers" does not exist

-- FIFO Cost Layers table for cost tracking
CREATE TABLE IF NOT EXISTS fifo_cost_layers (
  layer_id SERIAL PRIMARY KEY,
  item_code TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  received_date DATE NOT NULL,
  quantity_received REAL NOT NULL,
  quantity_remaining REAL NOT NULL,
  unit_cost REAL NOT NULL,
  unit TEXT NOT NULL,
  location_code TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fifo_item ON fifo_cost_layers(item_code);
CREATE INDEX IF NOT EXISTS idx_fifo_date ON fifo_cost_layers(received_date);
CREATE INDEX IF NOT EXISTS idx_fifo_invoice ON fifo_cost_layers(invoice_number);

-- User roles table (if not exists)
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id INTEGER DEFAULT 1,
  site_id TEXT,
  role TEXT DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(org_id);

-- Fix audit_log to allow NULL actor_id (for unauthenticated requests like login)
ALTER TABLE audit_log ALTER COLUMN actor_id DROP NOT NULL;
