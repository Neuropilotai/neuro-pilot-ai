-- ============================================
-- Migration 035: Equipment/Furniture Item Bank Support
-- NeuroPilot AI Enterprise v23.4
-- ============================================
-- Extends Item Bank to support non-food items (furniture, equipment, smallwares)
-- Adds vendor_type to distinguish food vs equipment suppliers
-- ============================================

-- ============================================
-- ALTER: vendors - Add vendor_type classification
-- ============================================
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS vendor_type VARCHAR(50) DEFAULT 'food';

COMMENT ON COLUMN vendors.vendor_type IS 'Vendor classification: food, equipment, smallwares, janitorial, etc.';

-- Update existing food vendors
UPDATE vendors SET vendor_type = 'food' WHERE vendor_type IS NULL;

-- ============================================
-- ALTER: master_items - Add item_type classification
-- ============================================
ALTER TABLE master_items
ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'food';

COMMENT ON COLUMN master_items.item_type IS 'Item classification: food, equipment, smallwares, janitorial, etc.';

-- Add additional equipment-specific columns
ALTER TABLE master_items
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255),
ADD COLUMN IF NOT EXISTS model_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS warranty_months INTEGER,
ADD COLUMN IF NOT EXISTS is_capital_asset BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS asset_life_years INTEGER,
ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(50);

-- ============================================
-- ALTER: supplier_items - Add item_type for filtering
-- ============================================
ALTER TABLE supplier_items
ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'food',
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255),
ADD COLUMN IF NOT EXISTS model_number VARCHAR(100);

-- ============================================
-- INSERT: Add Hubert vendor
-- ============================================
INSERT INTO vendors (org_id, name, vendor_type, contact_email, website)
VALUES (
  'default-org',
  'Hubert',
  'equipment',
  NULL,
  'https://www.hubert.com'
)
ON CONFLICT DO NOTHING;

-- ============================================
-- INSERT: Add other common equipment vendors
-- ============================================
INSERT INTO vendors (org_id, name, vendor_type, contact_email, website)
VALUES
  ('default-org', 'Nella Cutlery', 'equipment', NULL, 'https://www.nellacutlery.com'),
  ('default-org', 'Welbilt Canada', 'equipment', NULL, NULL),
  ('default-org', 'True Manufacturing', 'equipment', NULL, NULL),
  ('default-org', 'Cambro', 'equipment', NULL, 'https://www.cambro.com')
ON CONFLICT DO NOTHING;

-- ============================================
-- INDEX: Add indexes for new columns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(vendor_type);
CREATE INDEX IF NOT EXISTS idx_mi_item_type ON master_items(item_type);
CREATE INDEX IF NOT EXISTS idx_si_item_type ON supplier_items(item_type);

-- ============================================
-- VIEW: item_bank_equipment
-- Equipment-specific view of Item Bank
-- ============================================
CREATE OR REPLACE VIEW item_bank_equipment AS
SELECT
    'supplier' AS item_type,
    si.id,
    si.org_id,
    v.name AS supplier_name,
    v.vendor_type,
    si.supplier_item_code AS item_code,
    si.supplier_description AS description,
    si.manufacturer,
    si.model_number,
    si.pack_size,
    si.supplier_category AS category,
    sip.unit_price_cents,
    sip.effective_date AS price_date,
    si.master_item_id,
    mi.item_code AS master_code,
    mi.is_capital_asset,
    mi.warranty_months
FROM supplier_items si
JOIN vendors v ON si.vendor_id = v.id
LEFT JOIN master_items mi ON si.master_item_id = mi.id
LEFT JOIN LATERAL (
    SELECT unit_price_cents, effective_date
    FROM supplier_item_prices
    WHERE supplier_item_id = si.id
    ORDER BY effective_date DESC
    LIMIT 1
) sip ON true
WHERE si.is_active = TRUE
  AND si.item_type != 'food';

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('035_equipment_item_bank.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 035_equipment_item_bank.sql completed successfully' AS result;
