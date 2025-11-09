-- ============================================
-- Migration 011: POS Core Tables
-- Neuro.Pilot.AI Commissary Point of Sale System
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE pos_shift_status AS ENUM ('open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_order_status AS ENUM ('open', 'paid', 'void', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_line_kind AS ENUM ('item', 'recipe', 'misc');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_payment_method AS ENUM ('cash', 'external_card');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_payment_status AS ENUM ('captured', 'refunded', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_discount_type AS ENUM ('percent', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pos_tax_scope AS ENUM ('item', 'recipe', 'all');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. REGISTERS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_registers (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_registers_org_site ON pos_registers(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_registers_active ON pos_registers(is_active) WHERE is_active = true;

-- ============================================
-- 3. SHIFTS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_shifts (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  register_id INTEGER NOT NULL REFERENCES pos_registers(id) ON DELETE CASCADE,
  opened_by INTEGER,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_float_cents INTEGER NOT NULL DEFAULT 0,
  closed_by INTEGER,
  closed_at TIMESTAMPTZ,
  closing_cash_cents INTEGER,
  notes TEXT,
  status pos_shift_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_register ON pos_shifts(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_status ON pos_shifts(status);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_org_site ON pos_shifts(org_id, site_id);

-- Unique constraint: only one open shift per register
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_shifts_register_open
  ON pos_shifts(register_id)
  WHERE status = 'open';

-- ============================================
-- 4. ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_orders (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  shift_id INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
  order_no INTEGER NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status pos_order_status NOT NULL DEFAULT 'open',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  customer_note TEXT,
  cashier_id INTEGER,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, order_date, order_no)
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_shift ON pos_orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_org_site_date ON pos_orders(org_id, site_id, order_date);
CREATE INDEX IF NOT EXISTS idx_pos_orders_paid_at ON pos_orders(paid_at) WHERE paid_at IS NOT NULL;

-- ============================================
-- 5. ORDER LINES
-- ============================================

CREATE TABLE IF NOT EXISTS pos_order_lines (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  order_id INTEGER NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  kind pos_line_kind NOT NULL,
  sku_or_code VARCHAR(100) NOT NULL,
  name_snapshot VARCHAR(200) NOT NULL,
  qty DECIMAL(10,3) NOT NULL,
  uom VARCHAR(20) NOT NULL DEFAULT 'EA',
  unit_price_cents INTEGER NOT NULL,
  line_subtotal_cents INTEGER NOT NULL,
  tax_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_pos_order_lines_order ON pos_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_lines_sku ON pos_order_lines(sku_or_code);
CREATE INDEX IF NOT EXISTS idx_pos_order_lines_kind ON pos_order_lines(kind);
CREATE INDEX IF NOT EXISTS idx_pos_order_lines_org_site ON pos_order_lines(org_id, site_id);

-- ============================================
-- 6. PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_payments (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  order_id INTEGER NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  method pos_payment_method NOT NULL,
  amount_cents INTEGER NOT NULL,
  ref VARCHAR(100),
  status pos_payment_status NOT NULL DEFAULT 'captured',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_order ON pos_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_method ON pos_payments(method);
CREATE INDEX IF NOT EXISTS idx_pos_payments_status ON pos_payments(status);
CREATE INDEX IF NOT EXISTS idx_pos_payments_org_site ON pos_payments(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_paid_at ON pos_payments(paid_at);

-- ============================================
-- 7. TAXES
-- ============================================

CREATE TABLE IF NOT EXISTS pos_taxes (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  rate_pct DECIMAL(5,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  scope pos_tax_scope NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_taxes_org_site ON pos_taxes(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_taxes_active ON pos_taxes(active) WHERE active = true;

-- ============================================
-- 8. DISCOUNTS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_discounts (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  type pos_discount_type NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  code VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_discounts_org_site ON pos_discounts(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pos_discounts_active ON pos_discounts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_pos_discounts_code ON pos_discounts(code) WHERE code IS NOT NULL;

-- ============================================
-- 9. Z REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_z_reports (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  shift_id INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
  register_id INTEGER NOT NULL REFERENCES pos_registers(id) ON DELETE CASCADE,
  z_no INTEGER NOT NULL,
  totals JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, register_id, z_no)
);

CREATE INDEX IF NOT EXISTS idx_pos_z_reports_shift ON pos_z_reports(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_z_reports_register ON pos_z_reports(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_z_reports_org_site ON pos_z_reports(org_id, site_id);

-- ============================================
-- 10. SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_settings (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER NOT NULL DEFAULT 1,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, site_id, key)
);

CREATE INDEX IF NOT EXISTS idx_pos_settings_org_site ON pos_settings(org_id, site_id);

-- ============================================
-- 11. SEQUENCES & FUNCTIONS
-- ============================================

-- Function: Get next order number for a given date
CREATE OR REPLACE FUNCTION next_order_no(
  p_org INTEGER,
  p_site INTEGER,
  p_date DATE
) RETURNS INTEGER AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(order_no), 0) + 1 INTO v_max
  FROM pos_orders
  WHERE org_id = p_org
    AND site_id = p_site
    AND order_date = p_date;

  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

-- Function: Get next Z report number for a register
CREATE OR REPLACE FUNCTION next_z_no(
  p_org INTEGER,
  p_site INTEGER,
  p_register INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(z_no), 0) + 1 INTO v_max
  FROM pos_z_reports
  WHERE org_id = p_org
    AND site_id = p_site
    AND register_id = p_register;

  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 12. VIEWS
-- ============================================

-- Sales summary view (aggregated by day, SKU/code, kind)
CREATE OR REPLACE VIEW vw_pos_sales_summary AS
SELECT
  ol.org_id,
  ol.site_id,
  o.order_date,
  ol.kind,
  ol.sku_or_code,
  ol.name_snapshot,
  ol.uom,
  COUNT(DISTINCT o.id) as order_count,
  SUM(ol.qty) as total_qty,
  SUM(ol.line_subtotal_cents) as subtotal_cents,
  SUM(ol.tax_cents) as tax_cents,
  SUM(ol.discount_cents) as discount_cents,
  SUM(ol.line_total_cents) as total_cents
FROM pos_order_lines ol
JOIN pos_orders o ON o.id = ol.order_id
WHERE o.status = 'paid'
GROUP BY
  ol.org_id,
  ol.site_id,
  o.order_date,
  ol.kind,
  ol.sku_or_code,
  ol.name_snapshot,
  ol.uom;

-- ============================================
-- 13. TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pos_registers') THEN
    CREATE TRIGGER set_timestamp_pos_registers
      BEFORE UPDATE ON pos_registers
      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pos_shifts') THEN
    CREATE TRIGGER set_timestamp_pos_shifts
      BEFORE UPDATE ON pos_shifts
      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pos_orders') THEN
    CREATE TRIGGER set_timestamp_pos_orders
      BEFORE UPDATE ON pos_orders
      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pos_order_lines') THEN
    CREATE TRIGGER set_timestamp_pos_order_lines
      BEFORE UPDATE ON pos_order_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pos_payments') THEN
    CREATE TRIGGER set_timestamp_pos_payments
      BEFORE UPDATE ON pos_payments
      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

-- ============================================
-- 14. SEED DATA
-- ============================================

-- Insert default tax rate (if not exists)
INSERT INTO pos_taxes (org_id, site_id, name, rate_pct, active, scope)
VALUES (1, 1, 'Sales Tax', 8.50, true, 'all')
ON CONFLICT DO NOTHING;

-- Insert default setting for sale location
INSERT INTO pos_settings (org_id, site_id, key, value)
VALUES (1, 1, 'default_sale_location_id', '1')
ON CONFLICT (org_id, site_id, key) DO NOTHING;

-- Migration complete
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 011: POS Core Tables - COMPLETE';
END $$;
