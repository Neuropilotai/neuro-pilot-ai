-- ============================================================================
-- NeuroPilot Inventory Management - Production Schema
-- PostgreSQL 17 with Row-Level Security (RLS)
-- ============================================================================
-- Version: 17.0.0
-- Author: NeuroInnovate AI Team
-- Created: 2025-10-20
--
-- This migration creates the production-ready schema with:
-- - UUID primary keys
-- - Row-Level Security (RLS)
-- - Proper indexes for performance
-- - Audit logging
-- - Security policies
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext"; -- Case-insensitive text

-- ============================================================================
-- Users & Authentication
-- ============================================================================

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','manager','counter','viewer')),
  password_hash text NOT NULL,
  last_login    timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_user_email ON app_user(email);
CREATE INDEX idx_app_user_role ON app_user(role);
CREATE INDEX idx_app_user_active ON app_user(active) WHERE active = true;

COMMENT ON TABLE app_user IS 'Application users with role-based access';
COMMENT ON COLUMN app_user.role IS 'Roles: admin (full access), manager (operations), counter (count only), viewer (read-only)';

-- ============================================================================
-- Locations (Storage Zones)
-- ============================================================================

CREATE TABLE location (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  temp_zone   text NOT NULL CHECK (temp_zone IN('dry','cooler','freezer')),
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_location_code ON location(code);
CREATE INDEX idx_location_temp_zone ON location(temp_zone);
CREATE INDEX idx_location_active ON location(active) WHERE active = true;

COMMENT ON TABLE location IS 'Physical storage locations with temperature zones';

-- ============================================================================
-- Items (Products)
-- ============================================================================

CREATE TABLE item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number   text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  unit          text NOT NULL,  -- kg, ea, case, lb, etc.
  category      text,
  min_qty       numeric(12,3) DEFAULT 0,
  max_qty       numeric(12,3) DEFAULT 0,
  reorder_point numeric(12,3) DEFAULT 0,
  unit_cost     numeric(14,4),
  supplier      text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_number ON item(item_number);
CREATE INDEX idx_item_name ON item(name);
CREATE INDEX idx_item_category ON item(category);
CREATE INDEX idx_item_active ON item(active) WHERE active = true;
CREATE INDEX idx_item_low_stock ON item(min_qty) WHERE min_qty > 0;

COMMENT ON TABLE item IS 'Inventory items (SKUs)';

-- ============================================================================
-- Inventory Counts (Snapshots)
-- ============================================================================

CREATE TABLE inventory_count (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  counted_by    uuid NOT NULL REFERENCES app_user(id),
  qty_on_hand   numeric(14,3) NOT NULL CHECK (qty_on_hand >= 0),
  note          text,
  counted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_count_item_time ON inventory_count(item_id, counted_at DESC);
CREATE INDEX idx_inventory_count_location ON inventory_count(location_id);
CREATE INDEX idx_inventory_count_user ON inventory_count(counted_by);
CREATE INDEX idx_inventory_count_date ON inventory_count(counted_at DESC);

COMMENT ON TABLE inventory_count IS 'Physical inventory count snapshots';

-- ============================================================================
-- Movements (Receipts, Usage, Adjustments)
-- ============================================================================

CREATE TABLE movement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  location_id   uuid REFERENCES location(id) ON DELETE SET NULL,
  type          text NOT NULL CHECK (type IN ('receive','use','adjust','transfer','waste')),
  qty           numeric(14,3) NOT NULL,  -- positive for receive, negative for use
  note          text,
  reference     text,  -- PO number, invoice number, etc.
  created_by    uuid NOT NULL REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_movement_item_time ON movement(item_id, created_at DESC);
CREATE INDEX idx_movement_type ON movement(type);
CREATE INDEX idx_movement_user ON movement(created_by);
CREATE INDEX idx_movement_reference ON movement(reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_movement_date ON movement(created_at DESC);

COMMENT ON TABLE movement IS 'Inventory movements (receipts, usage, adjustments)';

-- ============================================================================
-- Purchase Orders
-- ============================================================================

CREATE TABLE purchase_order (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     text UNIQUE NOT NULL,
  supplier      text NOT NULL,
  status        text NOT NULL CHECK (status IN ('draft','submitted','received','canceled')),
  total_cost    numeric(14,4),
  notes         text,
  submitted_at  timestamptz,
  received_at   timestamptz,
  created_by    uuid NOT NULL REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_number ON purchase_order(po_number);
CREATE INDEX idx_po_status_time ON purchase_order(status, created_at DESC);
CREATE INDEX idx_po_supplier ON purchase_order(supplier);
CREATE INDEX idx_po_user ON purchase_order(created_by);

COMMENT ON TABLE purchase_order IS 'Purchase orders to suppliers';

-- ============================================================================
-- Purchase Order Lines
-- ============================================================================

CREATE TABLE purchase_order_line (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES item(id),
  req_qty       numeric(14,3) NOT NULL CHECK (req_qty > 0),
  unit_price    numeric(14,4),
  received_qty  numeric(14,3) DEFAULT 0 CHECK (received_qty >= 0),
  note          text
);

CREATE INDEX idx_po_line_order ON purchase_order_line(order_id);
CREATE INDEX idx_po_line_item ON purchase_order_line(item_id);

COMMENT ON TABLE purchase_order_line IS 'Line items for purchase orders';

-- ============================================================================
-- Immutable Audit Log
-- ============================================================================

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES app_user(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  details     jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_date ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Immutable audit trail for all operations';

-- Prevent updates/deletes on audit log (immutable)
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Current inventory levels by location
CREATE OR REPLACE VIEW v_current_inventory AS
SELECT
  i.id as item_id,
  i.item_number,
  i.name as item_name,
  i.category,
  i.unit,
  l.id as location_id,
  l.code as location_code,
  l.name as location_name,
  l.temp_zone,
  COALESCE(last_count.qty_on_hand, 0) as qty_on_hand,
  last_count.counted_at,
  i.min_qty,
  i.max_qty,
  CASE
    WHEN COALESCE(last_count.qty_on_hand, 0) < i.min_qty THEN 'low'
    WHEN COALESCE(last_count.qty_on_hand, 0) > i.max_qty THEN 'high'
    ELSE 'ok'
  END as stock_status
FROM item i
CROSS JOIN location l
LEFT JOIN LATERAL (
  SELECT qty_on_hand, counted_at
  FROM inventory_count ic
  WHERE ic.item_id = i.id AND ic.location_id = l.id
  ORDER BY counted_at DESC
  LIMIT 1
) last_count ON true
WHERE i.active = true AND l.active = true;

COMMENT ON VIEW v_current_inventory IS 'Current inventory levels across all locations';

-- Low stock items
CREATE OR REPLACE VIEW v_low_stock AS
SELECT
  i.id,
  i.item_number,
  i.name,
  i.category,
  i.unit,
  i.min_qty,
  COALESCE(SUM(ic.qty_on_hand), 0) as total_qty,
  (i.min_qty - COALESCE(SUM(ic.qty_on_hand), 0)) as shortage
FROM item i
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (location_id) qty_on_hand
  FROM inventory_count
  WHERE item_id = i.id
  ORDER BY location_id, counted_at DESC
) ic ON true
WHERE i.active = true AND i.min_qty > 0
GROUP BY i.id
HAVING COALESCE(SUM(ic.qty_on_hand), 0) < i.min_qty
ORDER BY (i.min_qty - COALESCE(SUM(ic.qty_on_hand), 0)) DESC;

COMMENT ON VIEW v_low_stock IS 'Items below minimum stock level';

-- ============================================================================
-- Row-Level Security (RLS) Setup
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE item ENABLE ROW LEVEL SECURITY;
ALTER TABLE location ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: app_user
-- ============================================================================

-- Users can see themselves, admins see all
CREATE POLICY p_app_user_select ON app_user
  FOR SELECT
  USING (
    id = current_setting('app.user_id', true)::uuid OR
    current_setting('app.role', true) = 'admin'
  );

-- Only admins can insert users
CREATE POLICY p_app_user_insert ON app_user
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) = 'admin');

-- Users can update themselves (password, display name), admins can update all
CREATE POLICY p_app_user_update ON app_user
  FOR UPDATE
  USING (
    id = current_setting('app.user_id', true)::uuid OR
    current_setting('app.role', true) = 'admin'
  );

-- Only admins can delete users (soft delete by setting active=false preferred)
CREATE POLICY p_app_user_delete ON app_user
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: item
-- ============================================================================

-- Everyone can read items
CREATE POLICY p_item_select ON item
  FOR SELECT
  USING (true);

-- Managers+ can create/update items
CREATE POLICY p_item_insert ON item
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) IN ('admin', 'manager'));

CREATE POLICY p_item_update ON item
  FOR UPDATE
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

-- Only admins can delete items
CREATE POLICY p_item_delete ON item
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: location
-- ============================================================================

-- Everyone can read locations
CREATE POLICY p_location_select ON location
  FOR SELECT
  USING (true);

-- Managers+ can create/update locations
CREATE POLICY p_location_insert ON location
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) IN ('admin', 'manager'));

CREATE POLICY p_location_update ON location
  FOR UPDATE
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

-- Only admins can delete locations
CREATE POLICY p_location_delete ON location
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: inventory_count
-- ============================================================================

-- Everyone can read counts
CREATE POLICY p_inventory_count_select ON inventory_count
  FOR SELECT
  USING (true);

-- Counters+ can create counts
CREATE POLICY p_inventory_count_insert ON inventory_count
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('admin', 'manager', 'counter') AND
    counted_by = current_setting('app.user_id', true)::uuid
  );

-- Managers+ can update counts (corrections)
CREATE POLICY p_inventory_count_update ON inventory_count
  FOR UPDATE
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

-- Only admins can delete counts
CREATE POLICY p_inventory_count_delete ON inventory_count
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: movement
-- ============================================================================

-- Everyone can read movements
CREATE POLICY p_movement_select ON movement
  FOR SELECT
  USING (true);

-- Managers+ can create movements
CREATE POLICY p_movement_insert ON movement
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('admin', 'manager') AND
    created_by = current_setting('app.user_id', true)::uuid
  );

-- Managers+ can update movements (within 24 hours)
CREATE POLICY p_movement_update ON movement
  FOR UPDATE
  USING (
    current_setting('app.role', true) IN ('admin', 'manager') AND
    created_at > NOW() - INTERVAL '24 hours'
  );

-- Only admins can delete movements
CREATE POLICY p_movement_delete ON movement
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: purchase_order
-- ============================================================================

-- Managers+ can read POs
CREATE POLICY p_po_select ON purchase_order
  FOR SELECT
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

-- Managers+ can create POs
CREATE POLICY p_po_insert ON purchase_order
  FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('admin', 'manager') AND
    created_by = current_setting('app.user_id', true)::uuid
  );

-- Managers+ can update POs (if not received/canceled)
CREATE POLICY p_po_update ON purchase_order
  FOR UPDATE
  USING (
    current_setting('app.role', true) IN ('admin', 'manager') AND
    status NOT IN ('received', 'canceled')
  );

-- Only admins can delete POs
CREATE POLICY p_po_delete ON purchase_order
  FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

-- ============================================================================
-- RLS Policies: purchase_order_line
-- ============================================================================

-- Inherit policies from purchase_order
CREATE POLICY p_po_line_select ON purchase_order_line
  FOR SELECT
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

CREATE POLICY p_po_line_insert ON purchase_order_line
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) IN ('admin', 'manager'));

CREATE POLICY p_po_line_update ON purchase_order_line
  FOR UPDATE
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

CREATE POLICY p_po_line_delete ON purchase_order_line
  FOR DELETE
  USING (current_setting('app.role', true) IN ('admin', 'manager'));

-- ============================================================================
-- RLS Policies: audit_log
-- ============================================================================

-- Only admins can read audit logs
CREATE POLICY p_audit_log_select ON audit_log
  FOR SELECT
  USING (current_setting('app.role', true) = 'admin');

-- No restrictions on insert (system logs everything)
CREATE POLICY p_audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (true);

-- No updates/deletes allowed (handled by rules above)

-- ============================================================================
-- Database Users (create manually with appropriate passwords)
-- ============================================================================

/*
-- Create database users (run these manually with strong passwords)

-- Migrator user (DDL operations)
CREATE USER migrator_user WITH PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE neondb TO migrator_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrator_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrator_user;

-- Application user (DML operations only)
CREATE USER app_user WITH PASSWORD 'strong_password_here';
GRANT CONNECT ON DATABASE neondb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO app_user;
*/

-- ============================================================================
-- Seed Data (Optional - for testing)
-- ============================================================================

/*
-- Create admin user (password: admin123 - CHANGE THIS!)
INSERT INTO app_user (email, display_name, role, password_hash)
VALUES (
  'admin@neuropilot.ai',
  'System Administrator',
  'admin',
  '$2b$10$example_bcrypt_hash_here'  -- Generate with bcrypt
);

-- Create sample locations
INSERT INTO location (code, name, temp_zone) VALUES
  ('DRY-01', 'Dry Storage 1', 'dry'),
  ('COOL-01', 'Walk-in Cooler', 'cooler'),
  ('FRZE-01', 'Freezer Unit 1', 'freezer');

-- Create sample items
INSERT INTO item (item_number, name, unit, category, min_qty, max_qty) VALUES
  ('MILK-2%', '2% Milk', 'gallon', 'Dairy', 10, 50),
  ('FLOUR-AP', 'All-Purpose Flour', 'lb', 'Baking', 25, 100),
  ('BEEF-GRD', 'Ground Beef 80/20', 'lb', 'Meat', 50, 200);
*/

-- ============================================================================
-- Utility Functions
-- ============================================================================

-- Get current inventory for an item across all locations
CREATE OR REPLACE FUNCTION get_item_inventory(p_item_id uuid)
RETURNS TABLE (
  location_code text,
  location_name text,
  qty_on_hand numeric,
  counted_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.code,
    l.name,
    ic.qty_on_hand,
    ic.counted_at
  FROM location l
  LEFT JOIN LATERAL (
    SELECT qty_on_hand, counted_at
    FROM inventory_count
    WHERE item_id = p_item_id AND location_id = l.id
    ORDER BY counted_at DESC
    LIMIT 1
  ) ic ON true
  WHERE l.active = true
  ORDER BY l.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_item_inventory(uuid) IS 'Get current inventory for an item across all locations';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Production schema migration 001 completed successfully';
  RAISE NOTICE '📊 Tables created: 8';
  RAISE NOTICE '🔐 RLS policies applied: 24';
  RAISE NOTICE '🔍 Indexes created: 30+';
  RAISE NOTICE '👁️ Views created: 2';
  RAISE NOTICE '⚙️ Functions created: 1';
END $$;
