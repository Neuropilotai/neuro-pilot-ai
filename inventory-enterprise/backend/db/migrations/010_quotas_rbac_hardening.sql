-- Migration 010: Quotas, RBAC Hardening, and Rate Limiting
-- Idempotent: Safe to re-run
-- Purpose: Enhanced security, quota management, and rate limiting

-- ============================================
-- ENHANCED RBAC
-- ============================================

-- User roles with detailed permissions
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer', 'auditor')),
  site_id INTEGER,
  scope TEXT DEFAULT 'all' CHECK (scope IN ('all', 'site', 'department')),
  department TEXT,
  active BOOLEAN DEFAULT true,
  granted_by TEXT,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  notes TEXT,

  CONSTRAINT user_roles_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE,
  UNIQUE(org_id, user_id, role, site_id, department)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_org_user ON user_roles(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(org_id, user_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Role permissions matrix
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer', 'auditor')),
  resource TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'execute', 'export', 'admin')),
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(role, resource, action)
);

-- Pre-populate role permissions
INSERT INTO role_permissions (role, resource, action, allowed) VALUES
  -- Owner: Full access
  ('owner', '*', 'create', true),
  ('owner', '*', 'read', true),
  ('owner', '*', 'update', true),
  ('owner', '*', 'delete', true),
  ('owner', '*', 'execute', true),
  ('owner', '*', 'export', true),
  ('owner', '*', 'admin', true),

  -- Admin: Full access except admin functions
  ('admin', '*', 'create', true),
  ('admin', '*', 'read', true),
  ('admin', '*', 'update', true),
  ('admin', '*', 'delete', true),
  ('admin', '*', 'execute', true),
  ('admin', '*', 'export', true),
  ('admin', 'users', 'admin', false),
  ('admin', 'billing', 'admin', false),

  -- Manager: CRUD but limited delete/export
  ('manager', '*', 'create', true),
  ('manager', '*', 'read', true),
  ('manager', '*', 'update', true),
  ('manager', 'items', 'delete', true),
  ('manager', 'recipes', 'delete', true),
  ('manager', '*', 'execute', true),
  ('manager', '*', 'export', true),

  -- Staff: Create/Read/Update
  ('staff', '*', 'create', true),
  ('staff', '*', 'read', true),
  ('staff', '*', 'update', true),
  ('staff', 'forecasts', 'execute', true),
  ('staff', 'reports', 'export', true),

  -- Viewer: Read-only
  ('viewer', '*', 'read', true),

  -- Auditor: Read + Export governance logs
  ('auditor', '*', 'read', true),
  ('auditor', 'audit', 'export', true),
  ('auditor', 'governance', 'export', true)
ON CONFLICT (role, resource, action) DO NOTHING;

-- ============================================
-- QUOTAS & RATE LIMITING
-- ============================================

-- Org quotas
CREATE TABLE IF NOT EXISTS org_quotas (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  quota_type TEXT NOT NULL CHECK (quota_type IN (
    'api_requests_daily',
    'api_requests_monthly',
    'forecast_runs_daily',
    'pdf_exports_daily',
    'csv_imports_daily',
    'storage_mb',
    'users_max',
    'sites_max'
  )),
  limit_value INTEGER NOT NULL CHECK (limit_value >= 0),
  current_usage INTEGER DEFAULT 0,
  reset_at TIMESTAMP,
  period TEXT DEFAULT 'daily' CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never')),
  hard_limit BOOLEAN DEFAULT false,
  warning_threshold NUMERIC(3,2) DEFAULT 0.8 CHECK (warning_threshold >= 0 AND warning_threshold <= 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT org_quotas_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(org_id, quota_type)
);

CREATE INDEX IF NOT EXISTS idx_org_quotas_org_type ON org_quotas(org_id, quota_type);
CREATE INDEX IF NOT EXISTS idx_org_quotas_reset_at ON org_quotas(reset_at) WHERE reset_at IS NOT NULL;

-- Quota usage log
CREATE TABLE IF NOT EXISTS quota_usage_log (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  quota_type TEXT NOT NULL,
  increment INTEGER DEFAULT 1,
  current_total INTEGER,
  limit_value INTEGER,
  exceeded BOOLEAN DEFAULT false,
  user_id TEXT,
  ip_address TEXT,
  endpoint TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT quota_usage_log_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quota_usage_log_org ON quota_usage_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_usage_log_exceeded ON quota_usage_log(exceeded) WHERE exceeded = true;

-- Rate limit buckets (token bucket algorithm)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  user_id TEXT,
  ip_address TEXT,
  bucket_key TEXT NOT NULL,
  tokens INTEGER NOT NULL CHECK (tokens >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  refill_rate INTEGER NOT NULL CHECK (refill_rate > 0),
  last_refill TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT rate_limit_buckets_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(bucket_key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_org ON rate_limit_buckets(org_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_key ON rate_limit_buckets(bucket_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_last_refill ON rate_limit_buckets(last_refill);

-- ============================================
-- SESSION MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,

  CONSTRAINT user_sessions_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_org_user ON user_sessions(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(org_id, user_id, last_active DESC) WHERE revoked = false;

-- ============================================
-- API KEYS
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  rate_limit INTEGER DEFAULT 1000,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP,
  expires_at TIMESTAMP,
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,

  CONSTRAINT api_keys_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE revoked = false;

-- ============================================
-- SECURITY EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login_success',
    'login_failure',
    'logout',
    'password_change',
    'password_reset',
    'mfa_enabled',
    'mfa_disabled',
    'api_key_created',
    'api_key_revoked',
    'permission_denied',
    'quota_exceeded',
    'rate_limit_exceeded',
    'session_expired',
    'suspicious_activity',
    'account_locked',
    'account_unlocked'
  )),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  ip_address TEXT,
  user_agent TEXT,
  endpoint TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT security_events_org_fk FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC) WHERE severity IN ('error', 'critical');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check and increment quota
CREATE OR REPLACE FUNCTION check_quota(
  p_org_id INTEGER,
  p_quota_type TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
  v_quota RECORD;
  v_exceeded BOOLEAN := false;
BEGIN
  -- Get current quota
  SELECT * INTO v_quota
  FROM org_quotas
  WHERE org_id = p_org_id AND quota_type = p_quota_type;

  IF NOT FOUND THEN
    RETURN true; -- No quota set, allow
  END IF;

  -- Check if would exceed
  IF v_quota.current_usage + p_increment > v_quota.limit_value THEN
    v_exceeded := true;

    IF v_quota.hard_limit THEN
      -- Log and reject
      INSERT INTO quota_usage_log (org_id, quota_type, increment, current_total, limit_value, exceeded)
      VALUES (p_org_id, p_quota_type, p_increment, v_quota.current_usage, v_quota.limit_value, true);

      RETURN false;
    END IF;
  END IF;

  -- Increment quota
  UPDATE org_quotas
  SET current_usage = current_usage + p_increment,
      updated_at = CURRENT_TIMESTAMP
  WHERE org_id = p_org_id AND quota_type = p_quota_type;

  -- Log usage
  INSERT INTO quota_usage_log (org_id, quota_type, increment, current_total, limit_value, exceeded)
  VALUES (p_org_id, p_quota_type, p_increment, v_quota.current_usage + p_increment, v_quota.limit_value, v_exceeded);

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Reset quotas (called by cron)
CREATE OR REPLACE FUNCTION reset_quotas()
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER := 0;
BEGIN
  UPDATE org_quotas
  SET current_usage = 0,
      reset_at = CASE
        WHEN period = 'hourly' THEN CURRENT_TIMESTAMP + INTERVAL '1 hour'
        WHEN period = 'daily' THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
        WHEN period = 'weekly' THEN CURRENT_TIMESTAMP + INTERVAL '1 week'
        WHEN period = 'monthly' THEN CURRENT_TIMESTAMP + INTERVAL '1 month'
        WHEN period = 'yearly' THEN CURRENT_TIMESTAMP + INTERVAL '1 year'
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE reset_at IS NOT NULL AND reset_at <= CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

-- Clean expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < CURRENT_TIMESTAMP AND revoked = false;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Also mark as revoked
  UPDATE user_sessions
  SET revoked = true,
      revoked_at = CURRENT_TIMESTAMP,
      revoked_reason = 'expired'
  WHERE expires_at < CURRENT_TIMESTAMP AND revoked = false;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Token bucket rate limiting
CREATE OR REPLACE FUNCTION consume_tokens(
  p_bucket_key TEXT,
  p_tokens INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
  v_bucket RECORD;
  v_elapsed NUMERIC;
  v_tokens_to_add INTEGER;
BEGIN
  -- Get bucket
  SELECT * INTO v_bucket
  FROM rate_limit_buckets
  WHERE bucket_key = p_bucket_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN true; -- No rate limit configured
  END IF;

  -- Calculate token refill
  v_elapsed := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_bucket.last_refill));
  v_tokens_to_add := FLOOR(v_elapsed * v_bucket.refill_rate / 60.0)::INTEGER;

  -- Refill tokens
  IF v_tokens_to_add > 0 THEN
    UPDATE rate_limit_buckets
    SET tokens = LEAST(capacity, tokens + v_tokens_to_add),
        last_refill = CURRENT_TIMESTAMP
    WHERE bucket_key = p_bucket_key;

    v_bucket.tokens := LEAST(v_bucket.capacity, v_bucket.tokens + v_tokens_to_add);
  END IF;

  -- Check and consume
  IF v_bucket.tokens >= p_tokens THEN
    UPDATE rate_limit_buckets
    SET tokens = tokens - p_tokens
    WHERE bucket_key = p_bucket_key;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Audit trigger for role changes
CREATE OR REPLACE FUNCTION audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO security_events (org_id, user_id, event_type, severity, details)
    VALUES (NEW.org_id, NEW.user_id, 'role_assigned', 'info',
            jsonb_build_object('role', NEW.role, 'granted_by', NEW.granted_by));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO security_events (org_id, user_id, event_type, severity, details)
    VALUES (OLD.org_id, OLD.user_id, 'role_revoked', 'info',
            jsonb_build_object('role', OLD.role));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_roles_audit AFTER INSERT OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION audit_role_changes();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE user_roles IS 'V21.1: Enhanced RBAC with site/department scoping';
COMMENT ON TABLE role_permissions IS 'V21.1: Fine-grained permission matrix';
COMMENT ON TABLE org_quotas IS 'V21.1: Organization usage quotas';
COMMENT ON TABLE quota_usage_log IS 'V21.1: Quota consumption audit trail';
COMMENT ON TABLE rate_limit_buckets IS 'V21.1: Token bucket rate limiting';
COMMENT ON TABLE user_sessions IS 'V21.1: Active user session management';
COMMENT ON TABLE api_keys IS 'V21.1: API key authentication';
COMMENT ON TABLE security_events IS 'V21.1: Security event audit log';
