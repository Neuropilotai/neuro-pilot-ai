-- Create missing audit_log table for Railway v21.1
-- This table is referenced by middleware/audit.js but was never created

-- ============================================================================
-- AUDIT_LOG TABLE (primary audit log for all operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor_id VARCHAR(255) NOT NULL,
  actor_type VARCHAR(50) DEFAULT 'user',
  org_id INTEGER NOT NULL DEFAULT 1,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  resource_id VARCHAR(255),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  session_id VARCHAR(255)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_org ON audit_log(actor_id, org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_success ON audit_log(success, created_at DESC);

-- GIN index for JSONB details column for fast searches
CREATE INDEX IF NOT EXISTS idx_audit_log_details ON audit_log USING GIN(details);

-- Composite index for common admin queries
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON audit_log(org_id, created_at DESC);

COMMENT ON TABLE audit_log IS 'V21.1 Security: Primary audit log for all API operations';
COMMENT ON COLUMN audit_log.actor_id IS 'User ID, service name, or system identifier';
COMMENT ON COLUMN audit_log.actor_type IS 'Type of actor: user, service, system, anonymous';
COMMENT ON COLUMN audit_log.action IS 'Action performed: login, create, read, update, delete, etc.';
COMMENT ON COLUMN audit_log.resource IS 'Resource type: inventory, user, role, forecast, etc.';
COMMENT ON COLUMN audit_log.resource_id IS 'ID of the specific resource affected';
COMMENT ON COLUMN audit_log.details IS 'Additional context in JSONB format';
COMMENT ON COLUMN audit_log.success IS 'Whether the operation succeeded';
COMMENT ON COLUMN audit_log.latency_ms IS 'Request processing time in milliseconds';
