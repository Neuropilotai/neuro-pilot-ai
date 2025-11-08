-- Migration 006: Waste Tracking System
-- Captures waste events with cost analysis

-- Waste Events table
CREATE TABLE IF NOT EXISTS waste_events (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  item_sku TEXT,
  recipe_code TEXT,
  qty DECIMAL(10,3) NOT NULL,
  uom TEXT NOT NULL,
  reason TEXT NOT NULL,
  subreason TEXT,
  photo_url TEXT,
  user_id INTEGER,
  notes TEXT,
  cost_at_event DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (item_sku IS NOT NULL OR recipe_code IS NOT NULL)
);

CREATE INDEX idx_waste_events_org ON waste_events(org_id);
CREATE INDEX idx_waste_events_site ON waste_events(site_id);
CREATE INDEX idx_waste_events_ts ON waste_events(ts DESC);
CREATE INDEX idx_waste_events_org_ts ON waste_events(org_id, ts DESC);
CREATE INDEX idx_waste_events_reason ON waste_events(reason);
CREATE INDEX idx_waste_events_item ON waste_events(item_sku);
CREATE INDEX idx_waste_events_recipe ON waste_events(recipe_code);

-- Waste Reasons reference (enum-like)
CREATE TABLE IF NOT EXISTS waste_reasons (
  reason TEXT PRIMARY KEY,
  subreasons JSONB DEFAULT '[]'::jsonb,
  description TEXT
);

-- Seed waste reasons
INSERT INTO waste_reasons (reason, subreasons, description) VALUES
  ('spoilage', '["expired", "mold", "temperature_abuse", "other"]'::jsonb, 'Food spoiled before use'),
  ('overprep', '["excess_batch", "overestimate", "event_cancelled"]'::jsonb, 'Prepared too much'),
  ('trim', '["fat_trim", "bones", "peels", "stems"]'::jsonb, 'Normal prep waste'),
  ('plate_return', '["customer_complaint", "quality_issue", "wrong_order"]'::jsonb, 'Food returned from service'),
  ('expired', '["past_date", "recalled", "quality_decline"]'::jsonb, 'Expired inventory'),
  ('damage', '["broken_package", "spill", "contamination"]'::jsonb, 'Physical damage'),
  ('mispick', '["wrong_item", "wrong_quantity", "receiving_error"]'::jsonb, 'Picking/receiving errors'),
  ('other', '["unknown", "misc"]'::jsonb, 'Other reasons')
ON CONFLICT (reason) DO NOTHING;
