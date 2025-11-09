-- Migration 013: RBAC Enforcement & Security Hardening
-- Neuro.Pilot.AI V21.1
-- Idempotent, production-safe, rollback-friendly

-- ============================================================
-- PART 1: RBAC Tables
-- ============================================================

-- User roles (per org/site assignment)
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  assigned_by INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- Optional role expiration
  UNIQUE(user_id, org_id, site_id),
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer', 'auditor'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_site ON user_roles(org_id, site_id);

-- Role permissions (seeded permission matrix)
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- Seed default permissions (idempotent)
INSERT INTO role_permissions (role, permission) VALUES
  ('owner', '*'),
  ('admin', 'items:read'), ('admin', 'items:create'), ('admin', 'items:update'), ('admin', 'items:delete'),
  ('admin', 'vendors:read'), ('admin', 'vendors:create'), ('admin', 'vendors:update'), ('admin', 'vendors:delete'),
  ('admin', 'recipes:read'), ('admin', 'recipes:create'), ('admin', 'recipes:update'), ('admin', 'recipes:delete'),
  ('admin', 'menu:read'), ('admin', 'menu:create'), ('admin', 'menu:update'), ('admin', 'menu:delete'),
  ('admin', 'population:read'), ('admin', 'population:create'), ('admin', 'population:update'), ('admin', 'population:delete'),
  ('admin', 'forecast:read'), ('admin', 'forecast:create'), ('admin', 'forecast:update'),
  ('admin', 'orders:read'), ('admin', 'orders:create'), ('admin', 'orders:update'), ('admin', 'orders:delete'),
  ('admin', 'pos:read'), ('admin', 'pos:create'), ('admin', 'pos:update'), ('admin', 'pos:delete'),
  ('admin', 'reports:read'), ('admin', 'reports:create'), ('admin', 'reports:export'),
  ('admin', 'users:read'), ('admin', 'users:create'), ('admin', 'users:update'),
  ('admin', 'sites:read'), ('admin', 'sites:create'), ('admin', 'sites:update'),
  ('admin', 'audit:read'), ('admin', 'privacy:read'),
  ('manager', 'items:read'), ('manager', 'items:create'), ('manager', 'items:update'),
  ('manager', 'vendors:read'), ('manager', 'vendors:create'), ('manager', 'vendors:update'),
  ('manager', 'recipes:read'), ('manager', 'recipes:create'), ('manager', 'recipes:update'),
  ('manager', 'menu:read'), ('manager', 'menu:update'),
  ('manager', 'population:read'), ('manager', 'population:update'),
  ('manager', 'forecast:read'), ('manager', 'forecast:update'),
  ('manager', 'orders:read'), ('manager', 'orders:create'), ('manager', 'orders:update'),
  ('manager', 'pos:read'), ('manager', 'pos:create'), ('manager', 'pos:update'),
  ('manager', 'reports:read'), ('manager', 'reports:create'), ('manager', 'reports:export'),
  ('manager', 'users:read'), ('manager', 'sites:read'),
  ('staff', 'items:read'), ('staff', 'vendors:read'), ('staff', 'recipes:read'), ('staff', 'menu:read'),
  ('staff', 'orders:read'), ('staff', 'orders:create'), ('staff', 'orders:update'),
  ('staff', 'pos:read'), ('staff', 'pos:create'), ('staff', 'pos:update'),
  ('staff', 'reports:read'), ('staff', 'forecast:read'),
  ('viewer', 'items:read'), ('viewer', 'vendors:read'), ('viewer', 'recipes:read'), ('viewer', 'menu:read'),
  ('viewer', 'population:read'), ('viewer', 'forecast:read'), ('viewer', 'orders:read'), ('viewer', 'reports:read'),
  ('auditor', 'audit:read'), ('auditor', 'audit:export'),
  ('auditor', 'reports:read'), ('auditor', 'reports:export'),
  ('auditor', 'items:read'), ('auditor', 'vendors:read'), ('auditor', 'recipes:read'),
  ('auditor', 'orders:read'), ('auditor', 'pos:read'),
  ('auditor', 'users:read'), ('auditor', 'sites:read'), ('auditor', 'privacy:read')
ON CONFLICT (role, permission) DO NOTHING;

-- ============================================================
-- PART 2: Authentication Hardening
-- ============================================================

-- Refresh tokens (rotation-based session management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  device_fingerprint VARCHAR(200),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP,
  CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, revoked_at) WHERE revoked_at IS NULL;

-- Account lockout (5 failed attempts)
CREATE TABLE IF NOT EXISTS account_lockouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  last_attempt_at TIMESTAMP DEFAULT NOW(),
  last_attempt_ip INET,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_lockouts_user ON account_lockouts(user_id);

-- Security events (login attempts, permission denials, etc.)
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL, -- 'login_failed', 'permission_denied', 'session_expired', etc.
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  org_id INTEGER DEFAULT 1,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'critical'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity) WHERE severity IN ('warning', 'critical');

-- ============================================================
-- PART 3: Audit Log Enhancement
-- ============================================================

-- Add constraints to existing audit_log if not present
DO $$
BEGIN
  -- Add org_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN org_id INTEGER DEFAULT 1;
  END IF;

  -- Add success column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'success'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN success BOOLEAN DEFAULT TRUE;
  END IF;

  -- Add latency_ms column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN latency_ms INTEGER;
  END IF;
END $$;

-- Create index on audit_log for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_org ON audit_log(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ============================================================
-- PART 4: Privacy & GDPR Compliance
-- ============================================================

-- Privacy requests (GDPR/CCPA deletion, export)
CREATE TABLE IF NOT EXISTS privacy_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL, -- 'deletion', 'export', 'do_not_sell'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB,
  CHECK (request_type IN ('deletion', 'export', 'do_not_sell'))
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status);

-- Privacy preferences (CCPA do-not-sell)
CREATE TABLE IF NOT EXISTS privacy_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  do_not_sell BOOLEAN DEFAULT FALSE,
  marketing_consent BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add soft delete support to users table if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
    ALTER TABLE users ADD COLUMN deletion_reason TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- PART 5: Rate Limiting & Quotas
-- ============================================================

-- Rate limit buckets (token bucket algorithm)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  route VARCHAR(200) NOT NULL, -- '/api/items', '/api/orders', etc.
  tokens INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 100,
  refill_per_minute INTEGER NOT NULL DEFAULT 10,
  last_refill_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, site_id, user_id, route)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_user_route ON rate_limit_buckets(user_id, route);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_org_route ON rate_limit_buckets(org_id, route);

-- Quota usage log (historical consumption)
CREATE TABLE IF NOT EXISTS quota_usage_log (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1,
  site_id INTEGER,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  route VARCHAR(200) NOT NULL,
  consumed INTEGER DEFAULT 1,
  remaining INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quota_usage_log_created ON quota_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_usage_log_org_route ON quota_usage_log(org_id, route);

-- Token bucket consumption function (PL/pgSQL)
CREATE OR REPLACE FUNCTION consume_tokens(
  p_org_id INTEGER,
  p_site_id INTEGER,
  p_user_id INTEGER,
  p_route VARCHAR(200),
  p_capacity INTEGER,
  p_refill_per_min INTEGER,
  p_burst INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_bucket RECORD;
  v_elapsed_seconds NUMERIC;
  v_refill_amount INTEGER;
  v_new_tokens INTEGER;
  v_allowed BOOLEAN;
BEGIN
  -- Get or create bucket
  SELECT * INTO v_bucket
  FROM rate_limit_buckets
  WHERE org_id = p_org_id
    AND (site_id = p_site_id OR (site_id IS NULL AND p_site_id IS NULL))
    AND (user_id = p_user_id OR (user_id IS NULL AND p_user_id IS NULL))
    AND route = p_route
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create new bucket
    INSERT INTO rate_limit_buckets (
      org_id, site_id, user_id, route, tokens, capacity, refill_per_minute
    ) VALUES (
      p_org_id, p_site_id, p_user_id, p_route, p_capacity, p_capacity, p_refill_per_min
    );

    v_allowed := TRUE;
  ELSE
    -- Calculate refill
    v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_bucket.last_refill_at));
    v_refill_amount := FLOOR(v_elapsed_seconds / 60.0 * p_refill_per_min)::INTEGER;

    -- Add refill tokens (cap at capacity)
    v_new_tokens := LEAST(v_bucket.tokens + v_refill_amount, p_capacity);

    -- Check if enough tokens
    IF v_new_tokens >= p_burst THEN
      v_allowed := TRUE;
      v_new_tokens := v_new_tokens - p_burst;
    ELSE
      v_allowed := FALSE;
    END IF;

    -- Update bucket
    UPDATE rate_limit_buckets
    SET
      tokens = v_new_tokens,
      last_refill_at = CASE
        WHEN v_refill_amount > 0 THEN NOW()
        ELSE last_refill_at
      END,
      updated_at = NOW()
    WHERE id = v_bucket.id;
  END IF;

  -- Log usage
  INSERT INTO quota_usage_log (org_id, site_id, user_id, route, consumed, remaining)
  VALUES (p_org_id, p_site_id, p_user_id, p_route, p_burst, v_new_tokens);

  RETURN v_allowed;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 6: Payment Transactions Log (PCI Compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method VARCHAR(50) NOT NULL, -- 'cash', 'card'
  amount NUMERIC(10, 2) NOT NULL,
  reference VARCHAR(200), -- Terminal reference ONLY (no card data)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (method IN ('cash', 'card'))
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON payment_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);

-- ============================================================
-- PART 7: Seed Owner User with Admin Role
-- ============================================================

-- Ensure owner@neuropilot.ai has admin role
INSERT INTO user_roles (user_id, org_id, site_id, role, assigned_by)
SELECT
  u.id,
  u.org_id,
  NULL,
  'owner',
  u.id
FROM users u
WHERE u.email = 'owner@neuropilot.ai'
ON CONFLICT (user_id, org_id, site_id) DO UPDATE
SET role = 'owner', assigned_at = NOW();

-- ============================================================
-- PART 8: Comments & Documentation
-- ============================================================

COMMENT ON TABLE user_roles IS 'V21.1 RBAC: User role assignments per org/site';
COMMENT ON TABLE role_permissions IS 'V21.1 RBAC: Permission matrix for all roles';
COMMENT ON TABLE user_sessions IS 'V21.1 Auth: Refresh token rotation with device binding';
COMMENT ON TABLE account_lockouts IS 'V21.1 Auth: Account lockout after 5 failed attempts';
COMMENT ON TABLE security_events IS 'V21.1 Audit: Security-specific event log';
COMMENT ON TABLE privacy_requests IS 'V21.1 GDPR: Privacy deletion/export requests';
COMMENT ON TABLE privacy_preferences IS 'V21.1 CCPA: User privacy preferences';
COMMENT ON TABLE rate_limit_buckets IS 'V21.1 Security: Token bucket rate limiting state';
COMMENT ON TABLE quota_usage_log IS 'V21.1 Security: Historical quota consumption';
COMMENT ON TABLE payment_transactions IS 'V21.1 PCI: Payment transaction log (NO card data)';
COMMENT ON FUNCTION consume_tokens IS 'V21.1 Security: Token bucket rate limiter with automatic refill';

-- ============================================================
-- Migration Complete
-- ============================================================
