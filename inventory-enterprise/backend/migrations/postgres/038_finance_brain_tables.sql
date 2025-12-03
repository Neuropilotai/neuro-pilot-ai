-- ============================================
-- Migration 038: Finance Brain Tables
-- NeuroPilot AI Enterprise v23.4.9
-- ============================================
-- Creates tables for Finance Report ingestion and template learning:
-- - finance_reports: Month-end/week-end finance reports from Google Drive
-- - finance_report_lines: Line items extracted from finance reports
-- - report_templates: Learned templates for different report formats
-- - invoice_reconciliation: Links between vendor_orders and finance_report_lines
-- ============================================

-- ============================================
-- STEP 1: finance_reports - Header table for finance reports
-- ============================================
CREATE TABLE IF NOT EXISTS finance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',
    site_id VARCHAR(255),

    -- Report identification
    report_type VARCHAR(50) NOT NULL DEFAULT 'month_end'
        CHECK (report_type IN ('month_end', 'week_end', 'quarter_end', 'year_end', 'custom')),
    report_name VARCHAR(255),
    period_start DATE,
    period_end DATE,
    fiscal_period VARCHAR(20),  -- e.g., "2025-01", "Q1-2025"

    -- Google Drive integration
    pdf_file_id VARCHAR(100),
    pdf_file_name VARCHAR(255),
    pdf_folder_id VARCHAR(100),
    pdf_preview_url TEXT,

    -- Parsing metadata
    total_lines INTEGER DEFAULT 0,
    total_amount_cents BIGINT DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Template reference (for learned templates)
    template_id UUID,
    template_confidence DECIMAL(5,4),  -- 0.0000 to 1.0000

    -- OCR/Parsing info
    ocr_confidence DECIMAL(5,4),
    ocr_engine VARCHAR(50),
    parse_duration_ms INTEGER,
    parsed_at TIMESTAMPTZ,
    parsed_by VARCHAR(255),

    -- Status workflow
    status VARCHAR(30) DEFAULT 'new'
        CHECK (status IN ('new', 'parsing', 'parsed', 'needs_review', 'validated', 'reconciled', 'archived', 'error')),
    needs_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    error_message TEXT,

    -- Audit fields
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    deleted_at TIMESTAMPTZ
);

-- Indexes for finance_reports
CREATE INDEX IF NOT EXISTS idx_fr_org ON finance_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_fr_site ON finance_reports(site_id);
CREATE INDEX IF NOT EXISTS idx_fr_type ON finance_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_fr_period ON finance_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_fr_status ON finance_reports(status);
CREATE INDEX IF NOT EXISTS idx_fr_pdf ON finance_reports(pdf_file_id);
CREATE INDEX IF NOT EXISTS idx_fr_template ON finance_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_fr_needs_review ON finance_reports(needs_review) WHERE needs_review = TRUE;

-- ============================================
-- STEP 2: finance_report_lines - Line items from finance reports
-- ============================================
CREATE TABLE IF NOT EXISTS finance_report_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES finance_reports(id) ON DELETE CASCADE,
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Line identification
    line_number INTEGER NOT NULL,
    section VARCHAR(100),  -- e.g., "Food Cost", "Labor", "Overhead"
    category VARCHAR(100),
    subcategory VARCHAR(100),

    -- Line content
    description TEXT NOT NULL DEFAULT 'Unknown Item',
    gl_account VARCHAR(50),  -- General Ledger account code
    cost_center VARCHAR(50),

    -- Amounts (all in cents for precision)
    budget_cents BIGINT DEFAULT 0,
    actual_cents BIGINT DEFAULT 0,
    variance_cents BIGINT DEFAULT 0,
    variance_pct DECIMAL(8,4),

    -- Vendor matching (for invoice reconciliation)
    vendor_name VARCHAR(255),
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100),
    invoice_date DATE,

    -- Parsing confidence
    line_confidence DECIMAL(5,4),
    needs_review BOOLEAN DEFAULT FALSE,
    review_notes TEXT,

    -- Raw extraction data
    raw_text TEXT,
    bounding_box JSONB,  -- {"x": 0, "y": 0, "width": 100, "height": 20}
    page_number INTEGER DEFAULT 1,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for finance_report_lines
CREATE INDEX IF NOT EXISTS idx_frl_report ON finance_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_frl_org ON finance_report_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_frl_section ON finance_report_lines(section);
CREATE INDEX IF NOT EXISTS idx_frl_category ON finance_report_lines(category);
CREATE INDEX IF NOT EXISTS idx_frl_vendor ON finance_report_lines(vendor_id);
CREATE INDEX IF NOT EXISTS idx_frl_invoice ON finance_report_lines(invoice_number);
CREATE INDEX IF NOT EXISTS idx_frl_needs_review ON finance_report_lines(needs_review) WHERE needs_review = TRUE;

-- ============================================
-- STEP 3: report_templates - Learned templates for report parsing
-- ============================================
CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Template identification
    template_name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL DEFAULT 'finance_report',
    vendor_name VARCHAR(255),  -- If vendor-specific template

    -- Template matching
    signature_hash VARCHAR(64),  -- SHA256 of column headers for matching
    header_pattern TEXT[],  -- Array of column header strings
    page_pattern JSONB,  -- Layout detection info

    -- Column mappings (which columns map to which fields)
    column_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* Example:
    {
        "description": {"column": 0, "header": "Description"},
        "gl_account": {"column": 1, "header": "GL Code"},
        "budget": {"column": 2, "header": "Budget"},
        "actual": {"column": 3, "header": "Actual"},
        "variance": {"column": 4, "header": "Variance"}
    }
    */

    -- Section detection
    section_markers JSONB DEFAULT '[]'::jsonb,
    /* Example:
    [
        {"text": "FOOD COSTS", "section": "Food Cost"},
        {"text": "LABOR", "section": "Labor"},
        {"text": "OVERHEAD", "section": "Overhead"}
    ]
    */

    -- Template performance
    times_used INTEGER DEFAULT 0,
    avg_confidence DECIMAL(5,4) DEFAULT 0.0,
    last_used_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

-- Indexes for report_templates
CREATE INDEX IF NOT EXISTS idx_rt_org ON report_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_rt_type ON report_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_rt_vendor ON report_templates(vendor_name);
CREATE INDEX IF NOT EXISTS idx_rt_signature ON report_templates(signature_hash);
CREATE INDEX IF NOT EXISTS idx_rt_active ON report_templates(is_active) WHERE is_active = TRUE;

-- Unique constraint: one default template per org+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_rt_default_unique
    ON report_templates(org_id, template_type) WHERE is_default = TRUE;

-- ============================================
-- STEP 4: invoice_reconciliation - Links vendor_orders to finance_report_lines
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- The finance report line being reconciled
    report_line_id UUID NOT NULL REFERENCES finance_report_lines(id) ON DELETE CASCADE,

    -- The vendor order being matched
    vendor_order_id UUID REFERENCES vendor_orders(id) ON DELETE SET NULL,
    vendor_order_line_id UUID REFERENCES vendor_order_lines(id) ON DELETE SET NULL,

    -- Match details
    match_type VARCHAR(30) DEFAULT 'auto'
        CHECK (match_type IN ('auto', 'manual', 'suggested', 'confirmed', 'rejected')),
    match_confidence DECIMAL(5,4),
    match_method VARCHAR(50),  -- e.g., 'invoice_number', 'amount_date', 'description_fuzzy'

    -- Amount comparison (all in cents)
    report_amount_cents BIGINT DEFAULT 0,
    order_amount_cents BIGINT DEFAULT 0,
    difference_cents BIGINT DEFAULT 0,
    difference_pct DECIMAL(8,4),

    -- Status
    status VARCHAR(30) DEFAULT 'pending'
        CHECK (status IN ('pending', 'matched', 'partial', 'unmatched', 'disputed', 'resolved')),
    resolution_notes TEXT,

    -- Audit
    matched_at TIMESTAMPTZ,
    matched_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for invoice_reconciliation
CREATE INDEX IF NOT EXISTS idx_ir_org ON invoice_reconciliation(org_id);
CREATE INDEX IF NOT EXISTS idx_ir_report_line ON invoice_reconciliation(report_line_id);
CREATE INDEX IF NOT EXISTS idx_ir_vendor_order ON invoice_reconciliation(vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_ir_status ON invoice_reconciliation(status);
CREATE INDEX IF NOT EXISTS idx_ir_match_type ON invoice_reconciliation(match_type);

-- ============================================
-- STEP 5: Helper function to find matching template
-- ============================================
CREATE OR REPLACE FUNCTION find_matching_template(
    p_org_id VARCHAR,
    p_header_pattern TEXT[],
    p_vendor_name VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_template_id UUID;
BEGIN
    -- Try to find vendor-specific template first
    IF p_vendor_name IS NOT NULL THEN
        SELECT id INTO v_template_id
        FROM report_templates
        WHERE org_id = p_org_id
          AND is_active = TRUE
          AND vendor_name ILIKE p_vendor_name
          AND header_pattern && p_header_pattern  -- Array overlap
        ORDER BY times_used DESC
        LIMIT 1;

        IF v_template_id IS NOT NULL THEN
            RETURN v_template_id;
        END IF;
    END IF;

    -- Fall back to org-wide template
    SELECT id INTO v_template_id
    FROM report_templates
    WHERE org_id = p_org_id
      AND is_active = TRUE
      AND vendor_name IS NULL
      AND header_pattern && p_header_pattern
    ORDER BY is_default DESC, times_used DESC
    LIMIT 1;

    RETURN v_template_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: Helper function to auto-reconcile by invoice number
-- ============================================
CREATE OR REPLACE FUNCTION auto_reconcile_by_invoice(
    p_report_line_id UUID,
    p_org_id VARCHAR,
    p_invoice_number VARCHAR,
    p_amount_cents BIGINT
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_reconciliation_id UUID;
    v_order_amount BIGINT;
    v_diff BIGINT;
BEGIN
    -- Find matching vendor order by invoice number
    SELECT id, total_cents INTO v_order_id, v_order_amount
    FROM vendor_orders
    WHERE org_id = p_org_id
      AND order_number = p_invoice_number
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate difference
    v_diff := ABS(p_amount_cents - COALESCE(v_order_amount, 0));

    -- Create reconciliation record
    INSERT INTO invoice_reconciliation (
        org_id, report_line_id, vendor_order_id,
        match_type, match_confidence, match_method,
        report_amount_cents, order_amount_cents, difference_cents,
        status, matched_at
    ) VALUES (
        p_org_id, p_report_line_id, v_order_id,
        'auto',
        CASE WHEN v_diff = 0 THEN 1.0
             WHEN v_diff < 100 THEN 0.95  -- Within $1
             WHEN v_diff < 1000 THEN 0.8  -- Within $10
             ELSE 0.5 END,
        'invoice_number',
        p_amount_cents, v_order_amount, v_diff,
        CASE WHEN v_diff = 0 THEN 'matched' ELSE 'partial' END,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_reconciliation_id;

    RETURN v_reconciliation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 7: View for finance reports with summary
-- ============================================
CREATE OR REPLACE VIEW finance_reports_summary AS
SELECT
    fr.id,
    fr.org_id,
    fr.site_id,
    fr.report_type,
    fr.report_name,
    fr.period_start,
    fr.period_end,
    fr.fiscal_period,
    fr.status,
    fr.needs_review,
    fr.total_lines,
    fr.total_amount_cents / 100.0 AS total_amount,
    fr.currency,
    fr.template_id,
    rt.template_name,
    fr.template_confidence,
    fr.ocr_confidence,
    fr.parsed_at,
    fr.created_at,
    COUNT(DISTINCT ir.id) AS reconciled_lines,
    COUNT(DISTINCT CASE WHEN ir.status = 'matched' THEN ir.id END) AS matched_lines,
    COUNT(DISTINCT CASE WHEN ir.status = 'unmatched' THEN ir.id END) AS unmatched_lines
FROM finance_reports fr
LEFT JOIN report_templates rt ON fr.template_id = rt.id
LEFT JOIN finance_report_lines frl ON frl.report_id = fr.id
LEFT JOIN invoice_reconciliation ir ON ir.report_line_id = frl.id
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, rt.template_name;

-- ============================================
-- STEP 8: Add FK from finance_reports to report_templates
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_fr_template'
    ) THEN
        ALTER TABLE finance_reports
        ADD CONSTRAINT fk_fr_template
        FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('038_finance_brain_tables.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 038_finance_brain_tables.sql completed successfully' AS result;
