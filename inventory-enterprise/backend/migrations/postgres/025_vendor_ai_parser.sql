-- ============================================
-- Migration 025: Vendor AI Parser
-- NeuroPilot AI Enterprise Phase 2
-- ============================================
-- AI-powered vendor invoice parsing with:
-- - Item code correction/matching
-- - Price drift detection
-- - OCR confidence tracking
-- - Learning from corrections
-- ============================================

-- ============================================
-- TABLE: vendor_item_mappings
-- Maps vendor-specific codes to our internal items
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    vendor_id INTEGER NOT NULL,
    vendor_code VARCHAR(100) NOT NULL,  -- Vendor's SKU/code
    vendor_description TEXT,  -- Vendor's description

    -- Mapping
    internal_item_id INTEGER,  -- Our inventory_items.item_id
    internal_item_code VARCHAR(100),  -- Our item_code

    -- AI matching
    match_confidence DECIMAL(5, 4),  -- 0-1 confidence score
    match_method VARCHAR(50),  -- exact, fuzzy, ai, manual
    match_features JSONB,  -- Features used for matching

    -- Learning
    confirmed_by UUID,
    confirmed_at TIMESTAMPTZ,
    correction_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    needs_review BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_vendor_mapping UNIQUE (org_id, vendor_id, vendor_code)
);

CREATE INDEX IF NOT EXISTS idx_vendor_mappings_org ON vendor_item_mappings(org_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_mappings_vendor_code ON vendor_item_mappings(vendor_id, vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendor_mappings_internal ON vendor_item_mappings(internal_item_id);
CREATE INDEX IF NOT EXISTS idx_vendor_mappings_review ON vendor_item_mappings(org_id, needs_review) WHERE needs_review = TRUE;

-- ============================================
-- TABLE: vendor_price_history
-- Track price changes over time
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    vendor_id INTEGER NOT NULL,
    item_id INTEGER,
    vendor_code VARCHAR(100),

    -- Price info
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'CAD',
    unit VARCHAR(50),
    pack_size VARCHAR(100),
    price_per_unit_cents INTEGER,

    -- Source
    source_type VARCHAR(50),  -- invoice, quote, catalog, manual
    source_document_id UUID,
    effective_date DATE NOT NULL,

    -- Audit
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    recorded_by UUID
);

CREATE INDEX IF NOT EXISTS idx_price_history_org ON vendor_price_history(org_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_price_history_item ON vendor_price_history(item_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON vendor_price_history(org_id, effective_date DESC);

-- ============================================
-- TABLE: vendor_price_alerts
-- Price drift detection alerts
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    vendor_id INTEGER NOT NULL,
    item_id INTEGER,
    vendor_code VARCHAR(100),
    item_description TEXT,

    -- Price comparison
    previous_price_cents INTEGER,
    current_price_cents INTEGER,
    price_change_cents INTEGER,
    price_change_pct DECIMAL(8, 4),

    -- Context
    previous_date DATE,
    current_date DATE,
    comparison_period_days INTEGER,

    -- Analysis
    alert_type VARCHAR(50) NOT NULL,  -- increase, decrease, anomaly, missing
    severity VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    is_anomaly BOOLEAN DEFAULT FALSE,
    expected_range_low_cents INTEGER,
    expected_range_high_cents INTEGER,

    -- Market context (if available)
    market_price_cents INTEGER,
    market_variance_pct DECIMAL(8, 4),

    -- Actions
    status VARCHAR(20) DEFAULT 'pending',  -- pending, acknowledged, escalated, resolved
    action_taken VARCHAR(100),
    action_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_org ON vendor_price_alerts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_price_alerts_vendor ON vendor_price_alerts(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_pending ON vendor_price_alerts(org_id, severity DESC) WHERE status = 'pending';

-- ============================================
-- TABLE: vendor_invoice_parse_jobs
-- Track invoice parsing jobs
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_invoice_parse_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    -- Source
    source_type VARCHAR(50) NOT NULL,  -- gdrive, email, upload, api
    source_file_id VARCHAR(255),
    source_file_name VARCHAR(500),
    source_folder_id VARCHAR(100),
    source_url TEXT,

    -- Vendor detection
    detected_vendor_id INTEGER,
    detected_vendor_name VARCHAR(255),
    vendor_confidence DECIMAL(5, 4),

    -- Status
    status VARCHAR(30) DEFAULT 'pending',
    -- pending, downloading, processing, parsed, review, completed, failed
    stage VARCHAR(50),  -- download, ocr, parse, match, validate
    progress_pct INTEGER DEFAULT 0,

    -- OCR results
    ocr_engine VARCHAR(50),  -- tesseract, google_vision, textract, claude
    ocr_confidence DECIMAL(5, 4),
    ocr_text TEXT,
    ocr_duration_ms INTEGER,

    -- Parse results
    parsed_at TIMESTAMPTZ,
    parse_duration_ms INTEGER,
    parsed_data JSONB,  -- Structured invoice data

    -- Results
    total_lines INTEGER,
    matched_lines INTEGER,
    unmatched_lines INTEGER,
    new_items INTEGER,
    price_alerts INTEGER,

    -- Output
    vendor_order_id UUID,  -- Created vendor_order

    -- Error handling
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_parse_jobs_org ON vendor_invoice_parse_jobs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_parse_jobs_status ON vendor_invoice_parse_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parse_jobs_source ON vendor_invoice_parse_jobs(source_file_id);

-- ============================================
-- TABLE: vendor_invoice_line_matches
-- Detailed line-item matching results
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_invoice_line_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parse_job_id UUID NOT NULL REFERENCES vendor_invoice_parse_jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,

    line_number INTEGER NOT NULL,

    -- Raw OCR data
    raw_text TEXT,
    raw_code VARCHAR(255),
    raw_description TEXT,
    raw_quantity VARCHAR(100),
    raw_unit VARCHAR(100),
    raw_price VARCHAR(100),

    -- Parsed values
    parsed_vendor_code VARCHAR(100),
    parsed_description TEXT,
    parsed_quantity DECIMAL(12, 4),
    parsed_unit VARCHAR(50),
    parsed_unit_price_cents INTEGER,
    parsed_extended_cents INTEGER,

    -- Matching
    match_status VARCHAR(30) DEFAULT 'pending',
    -- pending, matched, partial, new_item, unmatched, skipped
    matched_item_id INTEGER,
    matched_item_code VARCHAR(100),
    match_confidence DECIMAL(5, 4),
    match_method VARCHAR(50),

    -- Candidates (for review)
    match_candidates JSONB,  -- Array of potential matches

    -- Price analysis
    last_price_cents INTEGER,
    price_change_pct DECIMAL(8, 4),
    price_alert_id UUID,

    -- Review
    needs_review BOOLEAN DEFAULT FALSE,
    review_reason VARCHAR(100),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    corrected_item_id INTEGER,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_line_matches_job ON vendor_invoice_line_matches(parse_job_id);
CREATE INDEX IF NOT EXISTS idx_line_matches_status ON vendor_invoice_line_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_line_matches_review ON vendor_invoice_line_matches(org_id, needs_review) WHERE needs_review = TRUE;

-- ============================================
-- TABLE: vendor_parser_feedback
-- Learning from user corrections
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_parser_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    -- Source
    parse_job_id UUID,
    line_match_id UUID,

    -- Feedback type
    feedback_type VARCHAR(50) NOT NULL,
    -- item_mapping, vendor_detection, ocr_correction, price_correction

    -- Original vs Corrected
    original_value JSONB,
    corrected_value JSONB,

    -- Context
    vendor_id INTEGER,
    vendor_code VARCHAR(100),
    item_id INTEGER,

    -- Learning status
    applied_to_model BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,

    -- Audit
    submitted_by UUID NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parser_feedback_org ON vendor_parser_feedback(org_id, feedback_type);
CREATE INDEX IF NOT EXISTS idx_parser_feedback_pending ON vendor_parser_feedback(applied_to_model) WHERE applied_to_model = FALSE;

-- ============================================
-- FUNCTIONS: Vendor Parser Helpers
-- ============================================

-- Find best item match for vendor code
CREATE OR REPLACE FUNCTION find_item_match(
    p_org_id UUID,
    p_vendor_id INTEGER,
    p_vendor_code VARCHAR(100),
    p_description TEXT DEFAULT NULL
) RETURNS TABLE (
    item_id INTEGER,
    item_code VARCHAR(100),
    confidence DECIMAL(5, 4),
    match_method VARCHAR(50)
) AS $$
BEGIN
    -- First try exact mapping
    RETURN QUERY
    SELECT
        vm.internal_item_id,
        vm.internal_item_code,
        vm.match_confidence,
        vm.match_method
    FROM vendor_item_mappings vm
    WHERE vm.org_id = p_org_id
      AND vm.vendor_id = p_vendor_id
      AND vm.vendor_code = p_vendor_code
      AND vm.is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    -- Try fuzzy match on item_code
    RETURN QUERY
    SELECT
        ii.item_id,
        ii.item_code,
        0.7::DECIMAL(5, 4) AS confidence,
        'fuzzy'::VARCHAR(50) AS match_method
    FROM inventory_items ii
    WHERE ii.org_id = p_org_id
      AND ii.is_active = 1
      AND (
          ii.item_code ILIKE '%' || p_vendor_code || '%'
          OR p_vendor_code ILIKE '%' || ii.item_code || '%'
          OR (p_description IS NOT NULL AND ii.item_name ILIKE '%' || substring(p_description, 1, 20) || '%')
      )
    LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate price change percentage
CREATE OR REPLACE FUNCTION calculate_price_change(
    p_org_id UUID,
    p_vendor_id INTEGER,
    p_item_id INTEGER,
    p_new_price_cents INTEGER
) RETURNS TABLE (
    previous_price_cents INTEGER,
    change_pct DECIMAL(8, 4),
    is_significant BOOLEAN
) AS $$
DECLARE
    v_prev_price INTEGER;
    v_change_pct DECIMAL(8, 4);
BEGIN
    -- Get most recent price
    SELECT vph.price_cents
    INTO v_prev_price
    FROM vendor_price_history vph
    WHERE vph.org_id = p_org_id
      AND vph.vendor_id = p_vendor_id
      AND vph.item_id = p_item_id
    ORDER BY vph.effective_date DESC
    LIMIT 1;

    IF v_prev_price IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::DECIMAL(8, 4), FALSE;
        RETURN;
    END IF;

    v_change_pct := ((p_new_price_cents - v_prev_price)::DECIMAL / v_prev_price) * 100;

    RETURN QUERY SELECT
        v_prev_price,
        v_change_pct,
        ABS(v_change_pct) > 5;  -- Significant if > 5% change
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('025_vendor_ai_parser.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 025_vendor_ai_parser.sql completed successfully' AS result;
