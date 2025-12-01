-- ============================================
-- Migration 027: SOC-2 Security Layer
-- NeuroPilot AI Enterprise Phase 2
-- ============================================
-- SOC-2 Type II compliance features:
-- - Comprehensive audit logging
-- - Session management with security controls
-- - API key management with rotation
-- - Data retention policies
-- - Security events and alerts
-- ============================================

-- ============================================
-- TABLE: audit_logs
-- Comprehensive activity logging for SOC-2
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    -- Actor
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    session_id UUID,

    -- Action
    action VARCHAR(100) NOT NULL,  -- create, read, update, delete, login, logout, export, etc.
    resource_type VARCHAR(100) NOT NULL,  -- user, item, order, invoice, settings, etc.
    resource_id VARCHAR(255),
    resource_name VARCHAR(255),

    -- Request context
    request_id UUID,
    request_method VARCHAR(10),
    request_path TEXT,
    request_query JSONB,
    request_body_hash VARCHAR(64),  -- SHA256 of request body (not the actual body)

    -- Response
    response_status INTEGER,
    response_time_ms INTEGER,

    -- Client info
    ip_address INET,
    user_agent TEXT,
    geo_country VARCHAR(2),
    geo_region VARCHAR(100),

    -- Changes (for update/delete)
    changes JSONB,  -- {"field": {"old": "x", "new": "y"}}

    -- Result
    success BOOLEAN DEFAULT TRUE,
    error_code VARCHAR(50),
    error_message TEXT,

    -- Classification
    sensitivity VARCHAR(20) DEFAULT 'normal',  -- normal, sensitive, critical
    is_admin_action BOOLEAN DEFAULT FALSE,
    requires_review BOOLEAN DEFAULT FALSE,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Partition key for efficient querying
    log_date DATE DEFAULT CURRENT_DATE
);

-- Partitioning hint: Consider partitioning by log_date for large deployments
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_review ON audit_logs(org_id, requires_review) WHERE requires_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(log_date);

-- ============================================
-- TABLE: user_sessions
-- Active session management
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Token management
    refresh_token_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 of refresh token
    access_token_jti VARCHAR(100),  -- JWT ID for current access token

    -- Session info
    device_fingerprint VARCHAR(64),
    device_type VARCHAR(50),  -- desktop, mobile, tablet
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Location
    ip_address INET,
    geo_country VARCHAR(2),
    geo_region VARCHAR(100),
    geo_city VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Security
    mfa_verified BOOLEAN DEFAULT FALSE,
    mfa_verified_at TIMESTAMPTZ,
    elevated_until TIMESTAMPTZ,  -- Temporary elevated permissions

    -- Expiry
    expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,  -- Hard limit regardless of activity

    -- Revocation
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revoke_reason VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_org ON user_sessions(org_id, is_active);

-- ============================================
-- TABLE: api_keys
-- API key management for integrations
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,

    -- Key identity
    name VARCHAR(255) NOT NULL,
    description TEXT,
    key_prefix VARCHAR(12) NOT NULL,  -- First 12 chars for identification (np_live_xxxx)
    key_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 of full key

    -- Permissions
    scopes TEXT[] DEFAULT '{}',  -- Array of allowed scopes
    -- e.g., ['inventory:read', 'orders:write', 'reports:read']

    -- Restrictions
    allowed_ips INET[],  -- IP allowlist (empty = all allowed)
    allowed_origins TEXT[],  -- CORS origins (empty = all allowed)
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    total_requests INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,

    -- Rotation
    rotated_from_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    rotated_at TIMESTAMPTZ,
    grace_period_until TIMESTAMPTZ,  -- Old key still works during grace period

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- ============================================
-- TABLE: security_events
-- Security-related events and alerts
-- ============================================
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    -- Event type
    event_type VARCHAR(100) NOT NULL,
    -- login_success, login_failure, password_change, mfa_enabled, mfa_disabled,
    -- api_key_created, api_key_revoked, permission_change, suspicious_activity,
    -- rate_limit_exceeded, ip_blocked, session_hijack_attempt

    severity VARCHAR(20) NOT NULL DEFAULT 'info',  -- info, low, medium, high, critical

    -- Actor
    user_id UUID,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,

    -- Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',

    -- Related entities
    session_id UUID,
    api_key_id UUID,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),

    -- Status
    status VARCHAR(20) DEFAULT 'new',  -- new, investigating, resolved, false_positive
    assigned_to UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_notes TEXT,

    -- Automation
    auto_action_taken VARCHAR(100),  -- session_revoked, account_locked, ip_blocked
    auto_action_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, severity);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(status, severity DESC) WHERE status = 'new';

-- ============================================
-- TABLE: data_retention_policies
-- Configurable data retention rules
-- ============================================
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Policy definition
    name VARCHAR(100) NOT NULL,
    description TEXT,
    data_type VARCHAR(100) NOT NULL,  -- audit_logs, security_events, sessions, etc.
    table_name VARCHAR(100) NOT NULL,

    -- Retention
    retention_days INTEGER NOT NULL,
    archive_before_delete BOOLEAN DEFAULT TRUE,
    archive_location VARCHAR(255),  -- S3 bucket, GCS bucket, etc.

    -- Schedule
    run_schedule VARCHAR(50) DEFAULT '0 3 * * *',  -- Cron expression (3 AM daily)
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,

    -- Stats
    last_deleted_count INTEGER,
    last_archived_count INTEGER,
    total_deleted_count BIGINT DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,

    CONSTRAINT unique_policy UNIQUE (org_id, data_type)
);

-- Default retention policies
INSERT INTO data_retention_policies (org_id, name, data_type, table_name, retention_days, archive_before_delete)
VALUES
    (NULL, 'Audit Logs', 'audit_logs', 'audit_logs', 365, TRUE),
    (NULL, 'Security Events', 'security_events', 'security_events', 730, TRUE),
    (NULL, 'User Sessions', 'user_sessions', 'user_sessions', 90, FALSE),
    (NULL, 'API Usage', 'billing_usage_records', 'billing_usage_records', 365, TRUE),
    (NULL, 'Billing Events', 'billing_events', 'billing_events', 730, TRUE)
ON CONFLICT DO NOTHING;

-- ============================================
-- TABLE: ip_blocklist
-- Blocked IP addresses
-- ============================================
CREATE TABLE IF NOT EXISTS ip_blocklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global block

    -- IP
    ip_address INET NOT NULL,
    ip_range CIDR,  -- For blocking ranges

    -- Reason
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    source VARCHAR(50) DEFAULT 'manual',  -- manual, auto, threat_feed

    -- Duration
    blocked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,  -- NULL = permanent
    is_permanent BOOLEAN DEFAULT FALSE,

    -- Stats
    block_count INTEGER DEFAULT 0,
    last_blocked_at TIMESTAMPTZ,

    -- Audit
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocklist_ip ON ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocklist_org ON ip_blocklist(org_id);
CREATE INDEX IF NOT EXISTS idx_blocklist_active ON ip_blocklist(expires_at) WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP;

-- ============================================
-- TABLE: password_history
-- Prevent password reuse
-- ============================================
CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, created_at DESC);

-- ============================================
-- TABLE: consent_records
-- GDPR/Privacy consent tracking
-- ============================================
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Consent type
    consent_type VARCHAR(100) NOT NULL,
    -- terms_of_service, privacy_policy, marketing_emails, data_processing, third_party_sharing

    -- Version
    document_version VARCHAR(50) NOT NULL,
    document_url TEXT,

    -- Consent
    consented BOOLEAN NOT NULL,
    consent_method VARCHAR(50) DEFAULT 'web_form',  -- web_form, api, email, verbal

    -- Context
    ip_address INET,
    user_agent TEXT,

    -- Withdrawal
    withdrawn_at TIMESTAMPTZ,
    withdrawal_reason TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records(user_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_org ON consent_records(org_id, consent_type);

-- ============================================
-- FUNCTIONS: Security Helpers
-- ============================================

-- Log an audit event
CREATE OR REPLACE FUNCTION log_audit_event(
    p_org_id UUID,
    p_user_id UUID,
    p_action VARCHAR(100),
    p_resource_type VARCHAR(100),
    p_resource_id VARCHAR(255) DEFAULT NULL,
    p_changes JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        org_id, user_id, action, resource_type, resource_id,
        changes, ip_address, success, log_date
    )
    VALUES (
        p_org_id, p_user_id, p_action, p_resource_type, p_resource_id,
        p_changes, p_ip_address, p_success, CURRENT_DATE
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(
    p_ip_address INET,
    p_org_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM ip_blocklist
        WHERE (ip_address = p_ip_address OR p_ip_address <<= ip_range)
          AND (org_id IS NULL OR org_id = p_org_id)
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Revoke all sessions for user
CREATE OR REPLACE FUNCTION revoke_user_sessions(
    p_user_id UUID,
    p_reason VARCHAR(100) DEFAULT 'manual_revocation',
    p_revoked_by UUID DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET is_active = FALSE,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_by = p_revoked_by,
        revoke_reason = p_reason
    WHERE user_id = p_user_id
      AND is_active = TRUE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET is_active = FALSE,
        revoke_reason = 'expired'
    WHERE is_active = TRUE
      AND (expires_at < CURRENT_TIMESTAMP OR absolute_expires_at < CURRENT_TIMESTAMP);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Log security event
CREATE OR REPLACE FUNCTION log_security_event(
    p_org_id UUID,
    p_event_type VARCHAR(100),
    p_severity VARCHAR(20),
    p_title VARCHAR(255),
    p_user_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO security_events (
        org_id, event_type, severity, title,
        user_id, ip_address, details
    )
    VALUES (
        p_org_id, p_event_type, p_severity, p_title,
        p_user_id, p_ip_address, p_details
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Check password history (returns TRUE if password was used before)
CREATE OR REPLACE FUNCTION password_was_used(
    p_user_id UUID,
    p_password_hash VARCHAR(255),
    p_history_count INTEGER DEFAULT 12
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM password_history
        WHERE user_id = p_user_id
          AND password_hash = p_password_hash
        ORDER BY created_at DESC
        LIMIT p_history_count
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRIGGERS: Automatic audit logging
-- ============================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_changes JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old_data := to_jsonb(OLD);
        v_changes := jsonb_build_object('deleted', v_old_data);

        INSERT INTO audit_logs (org_id, action, resource_type, resource_id, changes)
        VALUES (
            OLD.org_id,
            'delete',
            TG_TABLE_NAME,
            OLD.id::TEXT,
            v_changes
        );

        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);

        -- Only log if data actually changed
        IF v_old_data != v_new_data THEN
            v_changes := jsonb_build_object('before', v_old_data, 'after', v_new_data);

            INSERT INTO audit_logs (org_id, action, resource_type, resource_id, changes)
            VALUES (
                NEW.org_id,
                'update',
                TG_TABLE_NAME,
                NEW.id::TEXT,
                v_changes
            );
        END IF;

        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        v_new_data := to_jsonb(NEW);
        v_changes := jsonb_build_object('created', v_new_data);

        INSERT INTO audit_logs (org_id, action, resource_type, resource_id, changes)
        VALUES (
            NEW.org_id,
            'create',
            TG_TABLE_NAME,
            NEW.id::TEXT,
            v_changes
        );

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Note: Enable triggers on specific tables as needed:
-- CREATE TRIGGER audit_inventory_items AFTER INSERT OR UPDATE OR DELETE ON inventory_items
--     FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('027_soc2_security.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 027_soc2_security.sql completed successfully' AS result;
