-- ============================================================================
-- NeuroPilot Inventory - Core Schema Migration
-- Version: 001 (Minimal Production Schema)
-- Run with: psql "$DATABASE_URL" -f migrations/001_schema.sql
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- Tables
-- ============================================================================

-- Users table (application-level authentication)
CREATE TABLE IF NOT EXISTS app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','manager','counter','viewer')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_user IS 'Application users with role-based access control';
COMMENT ON COLUMN app_user.role IS 'User role: admin (full access), manager (manage ops), counter (count inventory), viewer (read-only)';

-- Storage locations
CREATE TABLE IF NOT EXISTS location (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  temp_zone   text NOT NULL CHECK (temp_zone IN('dry','cooler','freezer')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE location IS 'Physical storage locations with temperature zones';

-- Inventory items
CREATE TABLE IF NOT EXISTS item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number   text UNIQUE NOT NULL,
  name          text NOT NULL,
  unit          text NOT NULL,
  category      text,
  min_qty       numeric(12,3) DEFAULT 0,
  max_qty       numeric(12,3) DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE item IS 'Master item catalog';
COMMENT ON COLUMN item.min_qty IS 'Minimum quantity threshold for low-stock alerts';
COMMENT ON COLUMN item.max_qty IS 'Maximum quantity threshold for overstock alerts';

-- Inventory counts (snapshots of on-hand quantity)
CREATE TABLE IF NOT EXISTS inventory_count (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  counted_by    uuid REFERENCES app_user(id),
  qty_on_hand   numeric(14,3) NOT NULL,
  counted_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_count IS 'Inventory count sessions recording on-hand quantities';

-- Stock movements
CREATE TABLE IF NOT EXISTS movement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  location_id   uuid REFERENCES location(id) ON DELETE SET NULL,
  type          text NOT NULL CHECK (type IN ('receive','use','adjust','transfer')),
  qty           numeric(14,3) NOT NULL,
  note          text,
  created_by    uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE movement IS 'Stock movements: receive (incoming), use (consumed), adjust (correction), transfer (between locations)';

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_order (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status        text NOT NULL CHECK (status IN ('draft','submitted','received','canceled')),
  created_by    uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE purchase_order IS 'Purchase orders for ordering inventory';

-- Purchase order line items
CREATE TABLE IF NOT EXISTS purchase_order_line (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES item(id),
  req_qty       numeric(14,3) NOT NULL,
  unit_price    numeric(14,4),
  note          text
);

COMMENT ON TABLE purchase_order_line IS 'Line items for purchase orders';

-- Audit log (immutable)
CREATE TABLE IF NOT EXISTS audit_log (
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

COMMENT ON TABLE audit_log IS 'Immutable audit log for all operations (see 003_rls for immutability rules)';

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_item_number ON item(item_number);
CREATE INDEX IF NOT EXISTS idx_inventory_count_item_time ON inventory_count(item_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_item_time ON movement(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_status_time ON purchase_order(status, created_at DESC);

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify tables were created
DO $$
DECLARE
  table_count int;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN (
      'app_user', 'location', 'item', 'inventory_count',
      'movement', 'purchase_order', 'purchase_order_line', 'audit_log'
    );

  IF table_count = 8 THEN
    RAISE NOTICE '✅ All 8 tables created successfully';
  ELSE
    RAISE EXCEPTION '❌ Expected 8 tables, found %', table_count;
  END IF;
END $$;
