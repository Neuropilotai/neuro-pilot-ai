-- Migration 004: Vendor Pricing System
-- Enables multi-vendor price tracking, effective dating, and org preferences

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendors_active ON vendors(active);
CREATE INDEX idx_vendors_code ON vendors(code);

-- Vendor Items (vendor-specific SKU mapping)
CREATE TABLE IF NOT EXISTS vendor_items (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  item_sku TEXT NOT NULL,
  vendor_sku TEXT,
  pack_size TEXT,
  uom TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor_id, item_sku)
);

CREATE INDEX idx_vendor_items_vendor ON vendor_items(vendor_id);
CREATE INDEX idx_vendor_items_sku ON vendor_items(item_sku);

-- Vendor Prices (time-series pricing)
CREATE TABLE IF NOT EXISTS vendor_prices (
  id SERIAL PRIMARY KEY,
  vendor_item_id INTEGER NOT NULL REFERENCES vendor_items(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  effective_from DATE NOT NULL,
  effective_to DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendor_prices_item ON vendor_prices(vendor_item_id);
CREATE INDEX idx_vendor_prices_effective ON vendor_prices(vendor_item_id, effective_from DESC);
CREATE INDEX idx_vendor_prices_date_range ON vendor_prices(effective_from, effective_to);

-- Organization Vendor Defaults (preferred vendor per org)
CREATE TABLE IF NOT EXISTS org_vendor_defaults (
  org_id INTEGER NOT NULL,
  preferred_vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id)
);

CREATE INDEX idx_org_vendor_defaults_vendor ON org_vendor_defaults(preferred_vendor_id);

-- Seed default vendors
INSERT INTO vendors (name, code) VALUES
  ('Sysco', 'SYSCO'),
  ('US Foods', 'USFOODS'),
  ('Gordon Food Service', 'GFS'),
  ('Performance Food Group', 'PFG'),
  ('Local Supplier', 'LOCAL')
ON CONFLICT (code) DO NOTHING;
