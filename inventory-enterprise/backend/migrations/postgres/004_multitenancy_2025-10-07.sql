-- =====================================================================
-- Migration: 004 - Multi-Tenancy + RBAC (PostgreSQL)
-- Version: v2.4.0-2025-10-07
-- Description: Add multi-tenant architecture with row-level security
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: Create Core Multi-Tenancy Tables
-- =====================================================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);
CREATE INDEX idx_tenants_settings ON tenants USING GIN(settings);

-- =====================================================================
-- STEP 2: Create RBAC Tables
-- =====================================================================

-- Roles table (tenant-scoped)
CREATE TABLE IF NOT EXISTS roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_name ON roles(tenant_id, name);

-- Permissions table (global definitions)
CREATE TABLE IF NOT EXISTS permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_name ON permissions(name);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- Tenant-User association
CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    invited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(role_id);
CREATE INDEX idx_tenant_users_status ON tenant_users(tenant_id, status);

-- =====================================================================
-- STEP 3: Add tenant_id to Existing Tables
-- =====================================================================

DO $$
BEGIN
    -- Add tenant_id to users
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='tenant_id') THEN
        ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;

    -- Add tenant_id to inventory_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='inventory_items' AND column_name='tenant_id') THEN
        ALTER TABLE inventory_items ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;

    -- Add tenant_id to orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='orders' AND column_name='tenant_id') THEN
        ALTER TABLE orders ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;

    -- Add tenant_id to ai_forecasts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='ai_forecasts' AND column_name='tenant_id') THEN
        ALTER TABLE ai_forecasts ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;

    -- Add tenant_id to ai_policies
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='ai_policies' AND column_name='tenant_id') THEN
        ALTER TABLE ai_policies ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;

    -- Add tenant_id to ai_feedback
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='ai_feedback' AND column_name='tenant_id') THEN
        ALTER TABLE ai_feedback ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT;
    END IF;
END$$;

-- =====================================================================
-- STEP 4: Create Indexes for Tenant Scoping
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory_items(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_tenant ON ai_forecasts(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_policies_tenant ON ai_policies(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_feedback_tenant ON ai_feedback(tenant_id) WHERE tenant_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_item ON inventory_items(tenant_id, item_code) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON orders(tenant_id, order_date) WHERE tenant_id IS NOT NULL;

-- =====================================================================
-- STEP 5: Backfill Default Tenant
-- =====================================================================

-- Create default tenant for existing data
INSERT INTO tenants (tenant_id, name, status, settings, created_at)
VALUES (
    'default'::UUID,
    'Default Organization',
    'active',
    '{"is_default": true, "created_by_migration": true}'::JSONB,
    NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Backfill tenant_id for existing data
UPDATE users SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;
UPDATE inventory_items SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;
UPDATE orders SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;
UPDATE ai_forecasts SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;
UPDATE ai_policies SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;
UPDATE ai_feedback SET tenant_id = 'default'::UUID WHERE tenant_id IS NULL;

-- =====================================================================
-- STEP 6: Create Default Permissions
-- =====================================================================

INSERT INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-inv-read'::UUID, 'inventory:read', 'inventory', 'read', 'View inventory items and stock levels'),
('perm-inv-write'::UUID, 'inventory:write', 'inventory', 'write', 'Create and update inventory items'),
('perm-inv-delete'::UUID, 'inventory:delete', 'inventory', 'delete', 'Delete inventory items'),
('perm-inv-admin'::UUID, 'inventory:admin', 'inventory', 'admin', 'Full inventory administration'),
('perm-ord-read'::UUID, 'orders:read', 'orders', 'read', 'View orders and order history'),
('perm-ord-write'::UUID, 'orders:write', 'orders', 'write', 'Create and update orders'),
('perm-ord-delete'::UUID, 'orders:delete', 'orders', 'delete', 'Delete orders'),
('perm-ord-admin'::UUID, 'orders:admin', 'orders', 'admin', 'Full order administration'),
('perm-usr-read'::UUID, 'users:read', 'users', 'read', 'View users and user profiles'),
('perm-usr-write'::UUID, 'users:write', 'users', 'write', 'Create and update users'),
('perm-usr-delete'::UUID, 'users:delete', 'users', 'delete', 'Delete users'),
('perm-usr-admin'::UUID, 'users:admin', 'users', 'admin', 'Full user administration'),
('perm-ai-read'::UUID, 'ai:read', 'ai', 'read', 'View AI forecasts and policies'),
('perm-ai-write'::UUID, 'ai:write', 'ai', 'write', 'Trigger AI training and updates'),
('perm-ai-admin'::UUID, 'ai:admin', 'ai', 'admin', 'Full AI system administration'),
('perm-rpt-read'::UUID, 'reports:read', 'reports', 'read', 'View reports and analytics'),
('perm-rpt-write'::UUID, 'reports:write', 'reports', 'write', 'Create custom reports'),
('perm-rpt-export'::UUID, 'reports:export', 'reports', 'export', 'Export reports and data'),
('perm-ten-read'::UUID, 'tenants:read', 'tenants', 'read', 'View tenant information'),
('perm-ten-write'::UUID, 'tenants:write', 'tenants', 'write', 'Manage tenant settings'),
('perm-ten-admin'::UUID, 'tenants:admin', 'tenants', 'admin', 'Full tenant administration'),
('perm-wh-read'::UUID, 'webhooks:read', 'webhooks', 'read', 'View webhook configurations'),
('perm-wh-write'::UUID, 'webhooks:write', 'webhooks', 'write', 'Create and update webhooks'),
('perm-wh-delete'::UUID, 'webhooks:delete', 'webhooks', 'delete', 'Delete webhooks')
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- STEP 7: Create Default Roles for Default Tenant
-- =====================================================================

INSERT INTO roles (role_id, tenant_id, name, description, is_system) VALUES
('role-default-admin'::UUID, 'default'::UUID, 'Admin', 'Full system administrator', TRUE),
('role-default-manager'::UUID, 'default'::UUID, 'Manager', 'Operational manager with read/write access', TRUE),
('role-default-analyst'::UUID, 'default'::UUID, 'Analyst', 'Read-only access with reporting capabilities', TRUE),
('role-default-auditor'::UUID, 'default'::UUID, 'Auditor', 'Read-only access for compliance auditing', TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- =====================================================================
-- STEP 8: Assign Permissions to Default Roles
-- =====================================================================

-- Admin role: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-default-admin'::UUID, permission_id FROM permissions
ON CONFLICT DO NOTHING;

-- Manager role
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role-default-manager'::UUID, 'perm-inv-read'::UUID),
('role-default-manager'::UUID, 'perm-inv-write'::UUID),
('role-default-manager'::UUID, 'perm-ord-read'::UUID),
('role-default-manager'::UUID, 'perm-ord-write'::UUID),
('role-default-manager'::UUID, 'perm-ai-read'::UUID),
('role-default-manager'::UUID, 'perm-rpt-read'::UUID),
('role-default-manager'::UUID, 'perm-rpt-write'::UUID),
('role-default-manager'::UUID, 'perm-rpt-export'::UUID)
ON CONFLICT DO NOTHING;

-- Analyst role
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role-default-analyst'::UUID, 'perm-inv-read'::UUID),
('role-default-analyst'::UUID, 'perm-ord-read'::UUID),
('role-default-analyst'::UUID, 'perm-ai-read'::UUID),
('role-default-analyst'::UUID, 'perm-rpt-read'::UUID),
('role-default-analyst'::UUID, 'perm-rpt-write'::UUID),
('role-default-analyst'::UUID, 'perm-rpt-export'::UUID)
ON CONFLICT DO NOTHING;

-- Auditor role
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role-default-auditor'::UUID, 'perm-inv-read'::UUID),
('role-default-auditor'::UUID, 'perm-ord-read'::UUID),
('role-default-auditor'::UUID, 'perm-usr-read'::UUID),
('role-default-auditor'::UUID, 'perm-ai-read'::UUID),
('role-default-auditor'::UUID, 'perm-rpt-read'::UUID),
('role-default-auditor'::UUID, 'perm-ten-read'::UUID),
('role-default-auditor'::UUID, 'perm-wh-read'::UUID)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- STEP 9: Assign Existing Users to Default Tenant
-- =====================================================================

INSERT INTO tenant_users (tenant_id, user_id, role_id, joined_at, status)
SELECT 'default'::UUID, user_id,
       CASE
           WHEN role = 'admin' THEN 'role-default-admin'::UUID
           ELSE 'role-default-manager'::UUID
       END,
       NOW(), 'active'
FROM users
WHERE tenant_id = 'default'::UUID
ON CONFLICT DO NOTHING;

-- =====================================================================
-- STEP 10: Create Audit Log Table for RBAC Events
-- =====================================================================

CREATE TABLE IF NOT EXISTS rbac_audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    permission VARCHAR(100),
    result VARCHAR(20) NOT NULL CHECK (result IN ('allowed', 'denied')),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rbac_audit_tenant ON rbac_audit_log(tenant_id);
CREATE INDEX idx_rbac_audit_user ON rbac_audit_log(user_id);
CREATE INDEX idx_rbac_audit_created ON rbac_audit_log(created_at);
CREATE INDEX idx_rbac_audit_result ON rbac_audit_log(tenant_id, result);
CREATE INDEX idx_rbac_audit_metadata ON rbac_audit_log USING GIN(metadata);

-- =====================================================================
-- STEP 11: Create Webhooks Tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
    headers JSONB DEFAULT '{}',
    retry_count INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 30000,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    last_triggered_at TIMESTAMP,
    last_success_at TIMESTAMP,
    last_failure_at TIMESTAMP,
    failure_count INTEGER DEFAULT 0
);

CREATE INDEX idx_webhooks_tenant ON webhook_endpoints(tenant_id);
CREATE INDEX idx_webhooks_status ON webhook_endpoints(tenant_id, status);
CREATE INDEX idx_webhooks_events ON webhook_endpoints USING GIN(events);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhook_endpoints(webhook_id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dlq')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    next_retry_at TIMESTAMP
);

CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_deliveries_retry ON webhook_deliveries(status, next_retry_at);
CREATE INDEX idx_deliveries_created ON webhook_deliveries(created_at);

-- =====================================================================
-- STEP 12: Create SSO Configuration Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS sso_providers (
    provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('saml', 'oauth2')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    config JSONB NOT NULL,
    role_mappings JSONB DEFAULT '{}',
    enforce_2fa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_sso_tenant ON sso_providers(tenant_id);
CREATE INDEX idx_sso_status ON sso_providers(tenant_id, status);

CREATE TABLE IF NOT EXISTS sso_audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES sso_providers(provider_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failed', 'rejected')),
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sso_audit_tenant ON sso_audit_log(tenant_id);
CREATE INDEX idx_sso_audit_provider ON sso_audit_log(provider_id);
CREATE INDEX idx_sso_audit_created ON sso_audit_log(created_at);

-- =====================================================================
-- STEP 13: Enable Row-Level Security (Optional)
-- =====================================================================

-- Enable RLS on tenant-scoped tables (optional, can be enabled per deployment)
-- ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_forecasts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_policies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (commented out, enable if needed):
-- CREATE POLICY tenant_isolation_policy ON inventory_items
--     USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

INSERT INTO schema_migrations (version, applied_at)
VALUES ('004_multitenancy_2025-10-07', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =====================================================================
-- ROLLBACK SCRIPT
-- =====================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS sso_audit_log CASCADE;
-- DROP TABLE IF EXISTS sso_providers CASCADE;
-- DROP TABLE IF EXISTS webhook_deliveries CASCADE;
-- DROP TABLE IF EXISTS webhook_endpoints CASCADE;
-- DROP TABLE IF EXISTS rbac_audit_log CASCADE;
-- DROP TABLE IF EXISTS tenant_users CASCADE;
-- DROP TABLE IF EXISTS role_permissions CASCADE;
-- DROP TABLE IF EXISTS permissions CASCADE;
-- DROP TABLE IF EXISTS roles CASCADE;
-- DROP TABLE IF EXISTS tenants CASCADE;
-- ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE inventory_items DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE ai_forecasts DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE ai_policies DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE ai_feedback DROP COLUMN IF EXISTS tenant_id;
-- DELETE FROM schema_migrations WHERE version = '004_multitenancy_2025-10-07';
-- COMMIT;
-- =====================================================================
