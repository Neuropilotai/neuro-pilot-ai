-- Migration 029: DriveWatch Finance Monitor with Zero-Duplicate Support
-- V23.6.2: File hashing, duplicate detection, clarification prompts
--
-- This migration creates or updates tables for:
-- - drive_files_watch: Tracks all Google Drive finance files
-- - finance_questions: Human review queue for uncertain parses
-- - file_duplicates: Tracks potential duplicates for resolution

-- ============================================================================
-- DRIVE FILES WATCH TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS drive_files_watch (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL DEFAULT 'default-org',

    -- Google Drive metadata
    google_file_id VARCHAR(255) NOT NULL,
    google_file_name VARCHAR(500),
    google_folder_id VARCHAR(255),
    google_folder_name VARCHAR(255),
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    file_size_bytes BIGINT,

    -- Content fingerprinting for duplicate detection
    content_hash VARCHAR(64),  -- SHA-256 hash of file content
    content_hash_short VARCHAR(16),  -- First 16 chars for quick lookup
    text_fingerprint VARCHAR(64),  -- Hash of extracted text (ignores formatting)
    page_count INTEGER,

    -- Detection results
    file_type VARCHAR(50) DEFAULT 'unknown',
    detected_vendor VARCHAR(100),
    period_hint VARCHAR(50),

    -- Processing status
    process_status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, parsed_ok, parsed_with_warnings, parse_failed, needs_question, duplicate
    confidence DECIMAL(5,4),
    process_attempts INTEGER DEFAULT 0,
    error_message TEXT,

    -- Timestamps
    file_created_at TIMESTAMPTZ,
    file_modified_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_processed_at TIMESTAMPTZ,

    -- Links
    finance_report_id UUID,
    duplicate_of_id INTEGER,  -- Points to canonical file if this is a duplicate

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_drive_watch_file UNIQUE (org_id, google_file_id)
);

-- Add columns if they don't exist (for existing installations)
DO $$
BEGIN
    -- Content hashing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'content_hash') THEN
        ALTER TABLE drive_files_watch ADD COLUMN content_hash VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'content_hash_short') THEN
        ALTER TABLE drive_files_watch ADD COLUMN content_hash_short VARCHAR(16);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'text_fingerprint') THEN
        ALTER TABLE drive_files_watch ADD COLUMN text_fingerprint VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'page_count') THEN
        ALTER TABLE drive_files_watch ADD COLUMN page_count INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'file_size_bytes') THEN
        ALTER TABLE drive_files_watch ADD COLUMN file_size_bytes BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drive_files_watch' AND column_name = 'duplicate_of_id') THEN
        ALTER TABLE drive_files_watch ADD COLUMN duplicate_of_id INTEGER;
    END IF;
END $$;

-- Indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_drive_watch_content_hash ON drive_files_watch(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_watch_content_hash_short ON drive_files_watch(content_hash_short) WHERE content_hash_short IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_watch_text_fingerprint ON drive_files_watch(text_fingerprint) WHERE text_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_watch_status ON drive_files_watch(org_id, process_status);
CREATE INDEX IF NOT EXISTS idx_drive_watch_vendor_period ON drive_files_watch(org_id, detected_vendor, period_hint);

-- ============================================================================
-- FINANCE QUESTIONS TABLE (Human Review Queue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_questions (
    question_id SERIAL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL DEFAULT 'default-org',

    -- Question details
    question_type VARCHAR(50) NOT NULL,  -- unknown_vendor, unknown_period, unknown_template, low_confidence, bad_totals, potential_duplicate, misclassified_file_type, other
    question_text TEXT NOT NULL,

    -- Related entities
    google_file_id VARCHAR(255),
    finance_report_id UUID,
    drive_watch_id INTEGER,

    -- Context for the question
    vendor VARCHAR(100),
    period VARCHAR(50),
    file_name VARCHAR(500),

    -- System's guess and confidence
    system_guess TEXT,
    system_confidence DECIMAL(5,4),
    options JSONB,  -- Array of possible answers

    -- For duplicate questions
    potential_duplicate_ids INTEGER[],  -- Array of drive_files_watch IDs

    -- Owner response
    status VARCHAR(20) DEFAULT 'open',  -- open, answered, skipped, auto_resolved
    owner_answer TEXT,
    answer_payload JSONB,  -- Structured answer data
    answered_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,

    -- Metadata
    priority VARCHAR(20) DEFAULT 'normal',  -- low, normal, high, urgent
    question_context JSONB,
    created_by VARCHAR(255) DEFAULT 'system',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add potential_duplicate_ids column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_questions' AND column_name = 'potential_duplicate_ids') THEN
        ALTER TABLE finance_questions ADD COLUMN potential_duplicate_ids INTEGER[];
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_questions_status ON finance_questions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_questions_type ON finance_questions(org_id, question_type, status);
CREATE INDEX IF NOT EXISTS idx_finance_questions_report ON finance_questions(finance_report_id) WHERE finance_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_questions_watch ON finance_questions(drive_watch_id) WHERE drive_watch_id IS NOT NULL;

-- ============================================================================
-- FINANCE QUESTION HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_question_history (
    history_id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES finance_questions(question_id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,  -- created, answered, skipped, auto_resolved, reopened
    actor VARCHAR(255),
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fq_history_question ON finance_question_history(question_id);

-- ============================================================================
-- FILE DUPLICATES TABLE (Tracks duplicate resolution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_duplicates (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL DEFAULT 'default-org',

    -- Duplicate group
    canonical_file_id INTEGER NOT NULL,  -- drive_files_watch.id of the "master" file
    duplicate_file_id INTEGER NOT NULL,  -- drive_files_watch.id of the duplicate

    -- How the duplicate was detected
    match_type VARCHAR(50) NOT NULL,  -- exact_hash, text_fingerprint, filename_match, vendor_period_date
    match_confidence DECIMAL(5,4),

    -- Resolution
    resolution_status VARCHAR(20) DEFAULT 'pending',  -- pending, confirmed, rejected, auto_merged
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_file_duplicate UNIQUE (canonical_file_id, duplicate_file_id)
);

CREATE INDEX IF NOT EXISTS idx_file_duplicates_canonical ON file_duplicates(canonical_file_id);
CREATE INDEX IF NOT EXISTS idx_file_duplicates_duplicate ON file_duplicates(duplicate_file_id);
CREATE INDEX IF NOT EXISTS idx_file_duplicates_status ON file_duplicates(org_id, resolution_status);

-- ============================================================================
-- HELPER FUNCTION: Find potential duplicates
-- ============================================================================
CREATE OR REPLACE FUNCTION find_file_duplicates(p_org_id VARCHAR, p_watch_id INTEGER)
RETURNS TABLE (
    duplicate_id INTEGER,
    file_name VARCHAR,
    match_type VARCHAR,
    match_confidence DECIMAL
) AS $$
DECLARE
    v_content_hash VARCHAR;
    v_text_fingerprint VARCHAR;
    v_file_name VARCHAR;
    v_vendor VARCHAR;
    v_period VARCHAR;
    v_file_size BIGINT;
BEGIN
    -- Get the reference file details
    SELECT content_hash, text_fingerprint, google_file_name, detected_vendor, period_hint, file_size_bytes
    INTO v_content_hash, v_text_fingerprint, v_file_name, v_vendor, v_period, v_file_size
    FROM drive_files_watch
    WHERE id = p_watch_id AND org_id = p_org_id;

    -- Find exact content hash matches
    IF v_content_hash IS NOT NULL THEN
        RETURN QUERY
        SELECT
            dfw.id,
            dfw.google_file_name::VARCHAR,
            'exact_hash'::VARCHAR,
            1.0::DECIMAL
        FROM drive_files_watch dfw
        WHERE dfw.org_id = p_org_id
          AND dfw.id != p_watch_id
          AND dfw.content_hash = v_content_hash
          AND dfw.process_status != 'duplicate';
    END IF;

    -- Find text fingerprint matches (same content, different formatting)
    IF v_text_fingerprint IS NOT NULL THEN
        RETURN QUERY
        SELECT
            dfw.id,
            dfw.google_file_name::VARCHAR,
            'text_fingerprint'::VARCHAR,
            0.95::DECIMAL
        FROM drive_files_watch dfw
        WHERE dfw.org_id = p_org_id
          AND dfw.id != p_watch_id
          AND dfw.text_fingerprint = v_text_fingerprint
          AND dfw.content_hash IS DISTINCT FROM v_content_hash  -- Not already matched by exact hash
          AND dfw.process_status != 'duplicate';
    END IF;

    -- Find same vendor + period + similar file size (likely duplicate with different name)
    IF v_vendor IS NOT NULL AND v_period IS NOT NULL AND v_file_size IS NOT NULL THEN
        RETURN QUERY
        SELECT
            dfw.id,
            dfw.google_file_name::VARCHAR,
            'vendor_period_match'::VARCHAR,
            0.75::DECIMAL
        FROM drive_files_watch dfw
        WHERE dfw.org_id = p_org_id
          AND dfw.id != p_watch_id
          AND dfw.detected_vendor = v_vendor
          AND dfw.period_hint = v_period
          AND dfw.file_size_bytes IS NOT NULL
          AND ABS(dfw.file_size_bytes - v_file_size) < (v_file_size * 0.05)  -- Within 5% file size
          AND dfw.content_hash IS DISTINCT FROM v_content_hash
          AND dfw.text_fingerprint IS DISTINCT FROM v_text_fingerprint
          AND dfw.process_status != 'duplicate';
    END IF;

    -- Find filename similarity matches
    RETURN QUERY
    SELECT
        dfw.id,
        dfw.google_file_name::VARCHAR,
        'filename_similar'::VARCHAR,
        0.6::DECIMAL
    FROM drive_files_watch dfw
    WHERE dfw.org_id = p_org_id
      AND dfw.id != p_watch_id
      AND similarity(dfw.google_file_name, v_file_name) > 0.7
      AND dfw.content_hash IS DISTINCT FROM v_content_hash
      AND dfw.text_fingerprint IS DISTINCT FROM v_text_fingerprint
      AND dfw.process_status != 'duplicate';

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Mark file as duplicate
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_as_duplicate(
    p_org_id VARCHAR,
    p_duplicate_id INTEGER,
    p_canonical_id INTEGER,
    p_match_type VARCHAR,
    p_resolved_by VARCHAR DEFAULT 'system'
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Record the duplicate relationship
    INSERT INTO file_duplicates (org_id, canonical_file_id, duplicate_file_id, match_type, match_confidence, resolution_status, resolved_by, resolved_at)
    VALUES (p_org_id, p_canonical_id, p_duplicate_id, p_match_type,
            CASE p_match_type
                WHEN 'exact_hash' THEN 1.0
                WHEN 'text_fingerprint' THEN 0.95
                WHEN 'vendor_period_match' THEN 0.75
                ELSE 0.6
            END,
            'confirmed', p_resolved_by, CURRENT_TIMESTAMP)
    ON CONFLICT (canonical_file_id, duplicate_file_id)
    DO UPDATE SET resolution_status = 'confirmed', resolved_by = p_resolved_by, resolved_at = CURRENT_TIMESTAMP;

    -- Update the duplicate file's status
    UPDATE drive_files_watch
    SET process_status = 'duplicate',
        duplicate_of_id = p_canonical_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_duplicate_id AND org_id = p_org_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Enable pg_trgm extension for similarity() function (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Add finance_reports columns if missing
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_reports' AND column_name = 'content_hash') THEN
        ALTER TABLE finance_reports ADD COLUMN content_hash VARCHAR(64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_reports' AND column_name = 'needs_human_review') THEN
        ALTER TABLE finance_reports ADD COLUMN needs_human_review BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_reports' AND column_name = 'process_status') THEN
        ALTER TABLE finance_reports ADD COLUMN process_status VARCHAR(50) DEFAULT 'pending';
    END IF;
END $$;

COMMENT ON TABLE drive_files_watch IS 'V23.6.2: Tracks Google Drive finance files with content hashing for zero-duplicate support';
COMMENT ON TABLE finance_questions IS 'V23.6.2: Human review queue for uncertain parses and duplicate resolution';
COMMENT ON TABLE file_duplicates IS 'V23.6.2: Tracks duplicate file relationships and resolution status';
COMMENT ON FUNCTION find_file_duplicates IS 'Find potential duplicates using content hash, text fingerprint, and metadata matching';
COMMENT ON FUNCTION mark_as_duplicate IS 'Mark a file as duplicate of another and update statuses';
