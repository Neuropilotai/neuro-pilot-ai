-- ============================================
-- Migration 039: DriveWatch Finance Monitor
-- NeuroPilot AI Enterprise V23.6.0
-- ============================================
-- Extends Finance Brain with:
-- - DriveWatch layer for file monitoring
-- - Confidence scoring and process status tracking
-- - Human review queue (finance_questions table)
-- - Full observability for finance file ingestion
-- ============================================

-- ============================================
-- STEP 1: Extend finance_reports with DriveWatch columns
-- ============================================

-- Add first_seen_at for tracking when file was first discovered
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add last_processed_at for tracking processing history
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMPTZ;

-- Add process_attempts counter for retry tracking
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS process_attempts INTEGER DEFAULT 0;

-- Add process_status for DriveWatch workflow
-- Note: This is different from 'status' which is for business workflow
DO $$
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'finance_reports' AND column_name = 'process_status'
    ) THEN
        ALTER TABLE finance_reports
        ADD COLUMN process_status VARCHAR(30) DEFAULT 'pending';
    END IF;
END $$;

-- Add confidence score (0.0000 to 1.0000)
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4);

-- Add needs_human_review flag (separate from needs_review for parsing issues)
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN DEFAULT FALSE;

-- Add vendor detection field
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS detected_vendor VARCHAR(255);

-- Add file_type classification
ALTER TABLE finance_reports
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT 'unknown';

-- Add constraint for process_status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_process_status'
    ) THEN
        ALTER TABLE finance_reports
        ADD CONSTRAINT chk_fr_process_status
        CHECK (process_status IN (
            'pending', 'processing', 'parsed_ok', 'parsed_with_warnings',
            'parse_failed', 'skipped', 'needs_question'
        ));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add constraint for file_type values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_file_type'
    ) THEN
        ALTER TABLE finance_reports
        ADD CONSTRAINT chk_fr_file_type
        CHECK (file_type IN (
            'unknown', 'vendor_invoice', 'month_end_report', 'week_end_report',
            'purchase_order', 'credit_memo', 'statement', 'other'
        ));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Index for DriveWatch queries
CREATE INDEX IF NOT EXISTS idx_fr_process_status ON finance_reports(process_status);
CREATE INDEX IF NOT EXISTS idx_fr_confidence ON finance_reports(confidence);
CREATE INDEX IF NOT EXISTS idx_fr_needs_human_review ON finance_reports(needs_human_review) WHERE needs_human_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_fr_first_seen ON finance_reports(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_fr_detected_vendor ON finance_reports(detected_vendor);
CREATE INDEX IF NOT EXISTS idx_fr_file_type ON finance_reports(file_type);

-- ============================================
-- STEP 2: Create drive_files_watch table
-- ============================================
-- Dedicated table for tracking all files in watched Drive folders
-- Enables tracking files that aren't yet linked to finance_reports

CREATE TABLE IF NOT EXISTS drive_files_watch (
    id SERIAL PRIMARY KEY,

    -- Google Drive identification
    google_file_id VARCHAR(100) NOT NULL,
    google_file_name VARCHAR(500) NOT NULL,
    google_folder_id VARCHAR(100) NOT NULL,
    google_folder_name VARCHAR(255),
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    file_size_bytes BIGINT,

    -- Classification
    file_type VARCHAR(50) DEFAULT 'unknown'
        CHECK (file_type IN (
            'unknown', 'vendor_invoice', 'month_end_report', 'week_end_report',
            'purchase_order', 'credit_memo', 'statement', 'other'
        )),
    detected_vendor VARCHAR(255),
    period_hint VARCHAR(50),  -- e.g., "FY26-P02", "2025-01"

    -- Timestamps
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_processed_at TIMESTAMPTZ,
    file_modified_at TIMESTAMPTZ,

    -- Processing state
    process_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (process_status IN (
            'pending', 'processing', 'parsed_ok', 'parsed_with_warnings',
            'parse_failed', 'skipped', 'needs_question', 'ignored'
        )),
    process_attempts INTEGER DEFAULT 0,
    confidence NUMERIC(5,4),

    -- Link to finance_reports
    finance_report_id UUID REFERENCES finance_reports(id) ON DELETE SET NULL,

    -- Multi-tenancy
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Metadata
    extra_metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,

    -- Constraints
    CONSTRAINT uq_dfw_google_file UNIQUE (google_file_id, org_id)
);

-- Indexes for drive_files_watch
CREATE INDEX IF NOT EXISTS idx_dfw_org ON drive_files_watch(org_id);
CREATE INDEX IF NOT EXISTS idx_dfw_folder ON drive_files_watch(google_folder_id);
CREATE INDEX IF NOT EXISTS idx_dfw_status ON drive_files_watch(process_status);
CREATE INDEX IF NOT EXISTS idx_dfw_vendor ON drive_files_watch(detected_vendor);
CREATE INDEX IF NOT EXISTS idx_dfw_period ON drive_files_watch(period_hint);
CREATE INDEX IF NOT EXISTS idx_dfw_first_seen ON drive_files_watch(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_dfw_finance_report ON drive_files_watch(finance_report_id);
CREATE INDEX IF NOT EXISTS idx_dfw_file_type ON drive_files_watch(file_type);

-- ============================================
-- STEP 3: Create finance_questions table
-- ============================================
-- Human review queue for when the system is uncertain

CREATE TABLE IF NOT EXISTS finance_questions (
    question_id SERIAL PRIMARY KEY,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    -- Status workflow
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'answered', 'dismissed', 'expired', 'auto_resolved')),
    priority VARCHAR(10) DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Linked entities
    google_file_id VARCHAR(100),
    finance_report_id UUID REFERENCES finance_reports(id) ON DELETE SET NULL,
    drive_watch_id INTEGER REFERENCES drive_files_watch(id) ON DELETE SET NULL,

    -- Context
    vendor VARCHAR(255),
    period VARCHAR(50),
    file_name VARCHAR(500),

    -- Question details
    question_type VARCHAR(50) NOT NULL
        CHECK (question_type IN (
            'unknown_template', 'unknown_vendor', 'unknown_period',
            'low_confidence', 'bad_totals', 'misclassified_file_type',
            'duplicate_detection', 'missing_data', 'parse_error',
            'reconciliation_mismatch', 'other'
        )),
    question_text TEXT NOT NULL,
    question_context JSONB DEFAULT '{}'::jsonb,

    -- System's analysis
    system_guess TEXT,
    system_confidence NUMERIC(5,4),
    options JSONB,  -- Array of possible choices for UI dropdown/radio

    -- Owner's response
    owner_answer TEXT,
    answer_payload JSONB,  -- Structured answer for machine consumption

    -- Audit
    created_by VARCHAR(255) DEFAULT 'FinanceReportAgent',
    answered_by VARCHAR(255),
    org_id VARCHAR(255) NOT NULL DEFAULT 'default-org',

    -- Notes
    notes TEXT
);

-- Indexes for finance_questions
CREATE INDEX IF NOT EXISTS idx_fq_status ON finance_questions(status);
CREATE INDEX IF NOT EXISTS idx_fq_org ON finance_questions(org_id);
CREATE INDEX IF NOT EXISTS idx_fq_type ON finance_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_fq_priority ON finance_questions(priority);
CREATE INDEX IF NOT EXISTS idx_fq_vendor ON finance_questions(vendor);
CREATE INDEX IF NOT EXISTS idx_fq_period ON finance_questions(period);
CREATE INDEX IF NOT EXISTS idx_fq_finance_report ON finance_questions(finance_report_id);
CREATE INDEX IF NOT EXISTS idx_fq_drive_watch ON finance_questions(drive_watch_id);
CREATE INDEX IF NOT EXISTS idx_fq_created ON finance_questions(created_at);
CREATE INDEX IF NOT EXISTS idx_fq_open ON finance_questions(status) WHERE status = 'open';

-- ============================================
-- STEP 4: Create finance_question_history table
-- ============================================
-- Audit trail for all question interactions

CREATE TABLE IF NOT EXISTS finance_question_history (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES finance_questions(question_id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,  -- 'created', 'viewed', 'answered', 'dismissed', 'reopened'
    actor VARCHAR(255),
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fqh_question ON finance_question_history(question_id);
CREATE INDEX IF NOT EXISTS idx_fqh_action ON finance_question_history(action);
CREATE INDEX IF NOT EXISTS idx_fqh_created ON finance_question_history(created_at);

-- ============================================
-- STEP 5: Create view for DriveWatch summary
-- ============================================

CREATE OR REPLACE VIEW drivewatch_summary AS
SELECT
    dfw.org_id,
    dfw.process_status,
    dfw.file_type,
    dfw.detected_vendor,
    COUNT(*) as file_count,
    COUNT(DISTINCT dfw.google_folder_id) as folder_count,
    AVG(dfw.confidence) as avg_confidence,
    MIN(dfw.first_seen_at) as earliest_file,
    MAX(dfw.last_seen_at) as latest_file,
    COUNT(*) FILTER (WHERE dfw.confidence < 0.5) as low_confidence_count,
    COUNT(*) FILTER (WHERE dfw.process_status = 'needs_question') as needs_question_count
FROM drive_files_watch dfw
GROUP BY dfw.org_id, dfw.process_status, dfw.file_type, dfw.detected_vendor;

-- ============================================
-- STEP 6: Create view for open questions
-- ============================================

CREATE OR REPLACE VIEW finance_questions_open AS
SELECT
    fq.*,
    dfw.google_file_name as file_name_from_watch,
    dfw.detected_vendor as vendor_from_watch,
    fr.report_name,
    fr.fiscal_period,
    fr.total_amount_cents / 100.0 as total_amount
FROM finance_questions fq
LEFT JOIN drive_files_watch dfw ON fq.drive_watch_id = dfw.id
LEFT JOIN finance_reports fr ON fq.finance_report_id = fr.id
WHERE fq.status = 'open'
ORDER BY
    CASE fq.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        ELSE 4
    END,
    fq.created_at ASC;

-- ============================================
-- STEP 7: Helper function to compute confidence
-- ============================================

CREATE OR REPLACE FUNCTION compute_parse_confidence(
    p_line_count INTEGER,
    p_parsed_lines INTEGER,
    p_has_known_template BOOLEAN,
    p_vendor_known BOOLEAN,
    p_header_totals_ok BOOLEAN
)
RETURNS NUMERIC AS $$
DECLARE
    v_score NUMERIC := 0.0;
    v_line_ratio NUMERIC;
BEGIN
    -- Template match: +0.30
    IF p_has_known_template THEN
        v_score := v_score + 0.30;
    END IF;

    -- Vendor known: +0.20
    IF p_vendor_known THEN
        v_score := v_score + 0.20;
    END IF;

    -- Header totals match: +0.30
    IF p_header_totals_ok THEN
        v_score := v_score + 0.30;
    END IF;

    -- Line parsing ratio: +0.20 * ratio
    IF p_line_count > 0 AND p_parsed_lines > 0 THEN
        v_line_ratio := LEAST(p_parsed_lines::NUMERIC / p_line_count::NUMERIC, 1.0);
        v_score := v_score + (0.20 * v_line_ratio);
    END IF;

    RETURN GREATEST(0.0, LEAST(v_score, 1.0));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 8: Helper function to create a question
-- ============================================

CREATE OR REPLACE FUNCTION create_finance_question(
    p_org_id VARCHAR,
    p_question_type VARCHAR,
    p_question_text TEXT,
    p_google_file_id VARCHAR DEFAULT NULL,
    p_finance_report_id UUID DEFAULT NULL,
    p_drive_watch_id INTEGER DEFAULT NULL,
    p_vendor VARCHAR DEFAULT NULL,
    p_period VARCHAR DEFAULT NULL,
    p_file_name VARCHAR DEFAULT NULL,
    p_system_guess TEXT DEFAULT NULL,
    p_system_confidence NUMERIC DEFAULT NULL,
    p_options JSONB DEFAULT NULL,
    p_priority VARCHAR DEFAULT 'normal',
    p_created_by VARCHAR DEFAULT 'FinanceReportAgent'
)
RETURNS INTEGER AS $$
DECLARE
    v_question_id INTEGER;
BEGIN
    INSERT INTO finance_questions (
        org_id, question_type, question_text,
        google_file_id, finance_report_id, drive_watch_id,
        vendor, period, file_name,
        system_guess, system_confidence, options,
        priority, created_by
    ) VALUES (
        p_org_id, p_question_type, p_question_text,
        p_google_file_id, p_finance_report_id, p_drive_watch_id,
        p_vendor, p_period, p_file_name,
        p_system_guess, p_system_confidence, p_options,
        p_priority, p_created_by
    )
    RETURNING question_id INTO v_question_id;

    -- Record in history
    INSERT INTO finance_question_history (
        question_id, action, actor, new_status, payload
    ) VALUES (
        v_question_id, 'created', p_created_by, 'open',
        jsonb_build_object(
            'question_type', p_question_type,
            'file_name', p_file_name,
            'vendor', p_vendor
        )
    );

    RETURN v_question_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 9: Helper function to answer a question
-- ============================================

CREATE OR REPLACE FUNCTION answer_finance_question(
    p_question_id INTEGER,
    p_answer TEXT,
    p_answer_payload JSONB,
    p_answered_by VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
    v_old_status VARCHAR;
BEGIN
    -- Get current status
    SELECT status INTO v_old_status
    FROM finance_questions
    WHERE question_id = p_question_id;

    IF v_old_status IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Update question
    UPDATE finance_questions
    SET
        status = 'answered',
        owner_answer = p_answer,
        answer_payload = p_answer_payload,
        answered_by = p_answered_by,
        resolved_at = CURRENT_TIMESTAMP
    WHERE question_id = p_question_id;

    -- Record in history
    INSERT INTO finance_question_history (
        question_id, action, actor, old_status, new_status, payload
    ) VALUES (
        p_question_id, 'answered', p_answered_by, v_old_status, 'answered',
        jsonb_build_object('answer', p_answer, 'payload', p_answer_payload)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 10: Vendor detection helper
-- ============================================

CREATE OR REPLACE FUNCTION detect_vendor_from_filename(p_filename VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_upper_name VARCHAR;
BEGIN
    v_upper_name := UPPER(p_filename);

    -- Common vendors
    IF v_upper_name LIKE '%GFS%' OR v_upper_name LIKE '%GORDON%FOOD%' THEN
        RETURN 'GFS';
    ELSIF v_upper_name LIKE '%SYSCO%' THEN
        RETURN 'Sysco';
    ELSIF v_upper_name LIKE '%US FOODS%' OR v_upper_name LIKE '%USFOODS%' THEN
        RETURN 'US Foods';
    ELSIF v_upper_name LIKE '%COSTCO%' THEN
        RETURN 'Costco';
    ELSIF v_upper_name LIKE '%WALMART%' THEN
        RETURN 'Walmart';
    ELSIF v_upper_name LIKE '%AMAZON%' THEN
        RETURN 'Amazon';
    ELSIF v_upper_name LIKE '%STAPLES%' THEN
        RETURN 'Staples';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 11: Period detection helper
-- ============================================

CREATE OR REPLACE FUNCTION detect_period_from_filename(p_filename VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_upper_name VARCHAR;
    v_match TEXT[];
BEGIN
    v_upper_name := UPPER(p_filename);

    -- Try FY26-P02 format
    v_match := regexp_match(p_filename, 'FY(\d{2})-?P(\d{2})', 'i');
    IF v_match IS NOT NULL THEN
        RETURN 'FY' || v_match[1] || '-P' || v_match[2];
    END IF;

    -- Try 2025-01 format
    v_match := regexp_match(p_filename, '(20\d{2})-(\d{2})', 'i');
    IF v_match IS NOT NULL THEN
        RETURN v_match[1] || '-' || v_match[2];
    END IF;

    -- Try January 2025 format
    v_match := regexp_match(p_filename, '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s_]*(20\d{2})', 'i');
    IF v_match IS NOT NULL THEN
        RETURN v_match[2] || '-' ||
            CASE UPPER(SUBSTRING(v_match[1], 1, 3))
                WHEN 'JAN' THEN '01'
                WHEN 'FEB' THEN '02'
                WHEN 'MAR' THEN '03'
                WHEN 'APR' THEN '04'
                WHEN 'MAY' THEN '05'
                WHEN 'JUN' THEN '06'
                WHEN 'JUL' THEN '07'
                WHEN 'AUG' THEN '08'
                WHEN 'SEP' THEN '09'
                WHEN 'OCT' THEN '10'
                WHEN 'NOV' THEN '11'
                WHEN 'DEC' THEN '12'
            END;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 12: Trigger to auto-detect vendor/period on insert
-- ============================================

CREATE OR REPLACE FUNCTION trg_dfw_auto_detect()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-detect vendor if not set
    IF NEW.detected_vendor IS NULL THEN
        NEW.detected_vendor := detect_vendor_from_filename(NEW.google_file_name);
    END IF;

    -- Auto-detect period if not set
    IF NEW.period_hint IS NULL THEN
        NEW.period_hint := detect_period_from_filename(NEW.google_file_name);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dfw_auto_detect_insert ON drive_files_watch;
CREATE TRIGGER trg_dfw_auto_detect_insert
    BEFORE INSERT ON drive_files_watch
    FOR EACH ROW
    EXECUTE FUNCTION trg_dfw_auto_detect();

-- ============================================
-- Record migration
-- ============================================

INSERT INTO schema_migrations (filename)
VALUES ('039_drivewatch_finance_monitor.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 039_drivewatch_finance_monitor.sql completed successfully' AS result;
