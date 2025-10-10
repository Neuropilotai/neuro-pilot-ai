-- =====================================================================
-- Migration: 004 - Multi-Tenancy + RBAC
-- Version: v2.4.0-2025-10-07
-- Description: Add multi-tenant architecture with row-level security
-- =====================================================================

-- =====================================================================
-- STEP 1: Create Core Multi-Tenancy Tables
-- =====================================================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    settings TEXT DEFAULT '{}', -- JSON: branding, limits, features
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);

-- =====================================================================
-- STEP 2: Create RBAC Tables
-- =====================================================================

-- Roles table (tenant-scoped)
CREATE TABLE IF NOT EXISTS roles (
    role_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT 0, -- System roles cannot be deleted
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_name ON roles(tenant_id, name);

-- Permissions table (global definitions)
CREATE TABLE IF NOT EXISTS permissions (
    permission_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    resource TEXT NOT NULL, -- inventory, orders, users, reports, etc.
    action TEXT NOT NULL, -- read, write, delete, admin
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_name ON permissions(name);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    granted_by TEXT,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- Tenant-User association
CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    invited_by TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
    PRIMARY KEY (tenant_id, user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
    FOREIGN KEY (invited_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(role_id);
CREATE INDEX idx_tenant_users_status ON tenant_users(tenant_id, status);

-- =====================================================================
-- STEP 3: Add tenant_id to Existing Tables
-- =====================================================================

-- Add tenant_id to users (if not exists)
ALTER TABLE users ADD COLUMN tenant_id TEXT;

-- Add tenant_id to inventory items
ALTER TABLE inventory_items ADD COLUMN tenant_id TEXT;

-- Add tenant_id to orders
ALTER TABLE orders ADD COLUMN tenant_id TEXT;

-- Add tenant_id to ai_forecasts
ALTER TABLE ai_forecasts ADD COLUMN tenant_id TEXT;

-- Add tenant_id to ai_policies
ALTER TABLE ai_policies ADD COLUMN tenant_id TEXT;

-- Add tenant_id to ai_feedback
ALTER TABLE ai_feedback ADD COLUMN tenant_id TEXT;

-- =====================================================================
-- STEP 4: Create Indexes for Tenant Scoping
-- =====================================================================

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_inventory_tenant ON inventory_items(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_orders_tenant ON orders(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_ai_forecasts_tenant ON ai_forecasts(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_ai_policies_tenant ON ai_policies(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_ai_feedback_tenant ON ai_feedback(tenant_id) WHERE tenant_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_inventory_tenant_item ON inventory_items(tenant_id, item_code) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_orders_tenant_date ON orders(tenant_id, order_date) WHERE tenant_id IS NOT NULL;

-- =====================================================================
-- STEP 5: Backfill Default Tenant
-- =====================================================================

-- Create default tenant for existing data
INSERT OR IGNORE INTO tenants (tenant_id, name, status, settings, created_at)
VALUES (
    'default',
    'Default Organization',
    'active',
    '{"is_default": true, "created_by_migration": true}',
    datetime('now')
);

-- Backfill tenant_id for existing users
UPDATE users
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- Backfill tenant_id for existing inventory
UPDATE inventory_items
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- Backfill tenant_id for existing orders
UPDATE orders
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- Backfill tenant_id for existing forecasts
UPDATE ai_forecasts
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- Backfill tenant_id for existing policies
UPDATE ai_policies
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- Backfill tenant_id for existing feedback
UPDATE ai_feedback
SET tenant_id = 'default'
WHERE tenant_id IS NULL;

-- =====================================================================
-- STEP 6: Create Default Permissions
-- =====================================================================

-- Inventory permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-inv-read', 'inventory:read', 'inventory', 'read', 'View inventory items and stock levels'),
('perm-inv-write', 'inventory:write', 'inventory', 'write', 'Create and update inventory items'),
('perm-inv-delete', 'inventory:delete', 'inventory', 'delete', 'Delete inventory items'),
('perm-inv-admin', 'inventory:admin', 'inventory', 'admin', 'Full inventory administration');

-- Order permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-ord-read', 'orders:read', 'orders', 'read', 'View orders and order history'),
('perm-ord-write', 'orders:write', 'orders', 'write', 'Create and update orders'),
('perm-ord-delete', 'orders:delete', 'orders', 'delete', 'Delete orders'),
('perm-ord-admin', 'orders:admin', 'orders', 'admin', 'Full order administration');

-- User permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-usr-read', 'users:read', 'users', 'read', 'View users and user profiles'),
('perm-usr-write', 'users:write', 'users', 'write', 'Create and update users'),
('perm-usr-delete', 'users:delete', 'users', 'delete', 'Delete users'),
('perm-usr-admin', 'users:admin', 'users', 'admin', 'Full user administration');

-- AI permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-ai-read', 'ai:read', 'ai', 'read', 'View AI forecasts and policies'),
('perm-ai-write', 'ai:write', 'ai', 'write', 'Trigger AI training and updates'),
('perm-ai-admin', 'ai:admin', 'ai', 'admin', 'Full AI system administration');

-- Report permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-rpt-read', 'reports:read', 'reports', 'read', 'View reports and analytics'),
('perm-rpt-write', 'reports:write', 'reports', 'write', 'Create custom reports'),
('perm-rpt-export', 'reports:export', 'reports', 'export', 'Export reports and data');

-- Tenant permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-ten-read', 'tenants:read', 'tenants', 'read', 'View tenant information'),
('perm-ten-write', 'tenants:write', 'tenants', 'write', 'Manage tenant settings'),
('perm-ten-admin', 'tenants:admin', 'tenants', 'admin', 'Full tenant administration');

-- Webhook permissions
INSERT OR IGNORE INTO permissions (permission_id, name, resource, action, description) VALUES
('perm-wh-read', 'webhooks:read', 'webhooks', 'read', 'View webhook configurations'),
('perm-wh-write', 'webhooks:write', 'webhooks', 'write', 'Create and update webhooks'),
('perm-wh-delete', 'webhooks:delete', 'webhooks', 'delete', 'Delete webhooks');

-- =====================================================================
-- STEP 7: Create Default Roles for Default Tenant
-- =====================================================================

-- Admin role (full access)
INSERT OR IGNORE INTO roles (role_id, tenant_id, name, description, is_system) VALUES
('role-default-admin', 'default', 'Admin', 'Full system administrator', 1);

-- Manager role (read/write, no delete)
INSERT OR IGNORE INTO roles (role_id, tenant_id, name, description, is_system) VALUES
('role-default-manager', 'default', 'Manager', 'Operational manager with read/write access', 1);

-- Analyst role (read-only + reports)
INSERT OR IGNORE INTO roles (role_id, tenant_id, name, description, is_system) VALUES
('role-default-analyst', 'default', 'Analyst', 'Read-only access with reporting capabilities', 1);

-- Auditor role (read-only, all resources)
INSERT OR IGNORE INTO roles (role_id, tenant_id, name, description, is_system) VALUES
('role-default-auditor', 'default', 'Auditor', 'Read-only access for compliance auditing', 1);

-- =====================================================================
-- STEP 8: Assign Permissions to Default Roles
-- =====================================================================

-- Admin role: all permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-default-admin', permission_id FROM permissions;

-- Manager role: read/write on inventory, orders, reports
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role-default-manager', 'perm-inv-read'),
('role-default-manager', 'perm-inv-write'),
('role-default-manager', 'perm-ord-read'),
('role-default-manager', 'perm-ord-write'),
('role-default-manager', 'perm-ai-read'),
('role-default-manager', 'perm-rpt-read'),
('role-default-manager', 'perm-rpt-write'),
('role-default-manager', 'perm-rpt-export');

-- Analyst role: read + reports
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role-default-analyst', 'perm-inv-read'),
('role-default-analyst', 'perm-ord-read'),
('role-default-analyst', 'perm-ai-read'),
('role-default-analyst', 'perm-rpt-read'),
('role-default-analyst', 'perm-rpt-write'),
('role-default-analyst', 'perm-rpt-export');

-- Auditor role: read-only all
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role-default-auditor', 'perm-inv-read'),
('role-default-auditor', 'perm-ord-read'),
('role-default-auditor', 'perm-usr-read'),
('role-default-auditor', 'perm-ai-read'),
('role-default-auditor', 'perm-rpt-read'),
('role-default-auditor', 'perm-ten-read'),
('role-default-auditor', 'perm-wh-read');

-- =====================================================================
-- STEP 9: Assign Existing Users to Default Tenant
-- =====================================================================

-- Assign all existing admin users to admin role
INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, role_id, joined_at, status)
SELECT 'default', user_id, 'role-default-admin', datetime('now'), 'active'
FROM users
WHERE role = 'admin' AND tenant_id = 'default';

-- Assign all existing non-admin users to manager role
INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, role_id, joined_at, status)
SELECT 'default', user_id, 'role-default-manager', datetime('now'), 'active'
FROM users
WHERE role != 'admin' AND tenant_id = 'default';

-- =====================================================================
-- STEP 10: Create Audit Log Table for RBAC Events
-- =====================================================================

CREATE TABLE IF NOT EXISTS rbac_audit_log (
    audit_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'permission_check', 'role_change', 'access_denied'
    resource TEXT NOT NULL,
    permission TEXT,
    result TEXT NOT NULL, -- 'allowed', 'denied'
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT, -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_rbac_audit_tenant ON rbac_audit_log(tenant_id);
CREATE INDEX idx_rbac_audit_user ON rbac_audit_log(user_id);
CREATE INDEX idx_rbac_audit_created ON rbac_audit_log(created_at);
CREATE INDEX idx_rbac_audit_result ON rbac_audit_log(tenant_id, result);

-- =====================================================================
-- STEP 11: Create Webhooks Tables
-- =====================================================================

-- Webhook endpoints
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    webhook_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL, -- HMAC secret
    events TEXT NOT NULL, -- JSON array: ['inventory.updated', 'forecast.updated']
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
    headers TEXT DEFAULT '{}', -- JSON: custom headers
    retry_count INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 30000,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    last_triggered_at TEXT,
    last_success_at TEXT,
    last_failure_at TEXT,
    failure_count INTEGER DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_webhooks_tenant ON webhook_endpoints(tenant_id);
CREATE INDEX idx_webhooks_status ON webhook_endpoints(tenant_id, status);
CREATE INDEX idx_webhooks_events ON webhook_endpoints(tenant_id, status, events);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    webhook_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON
    signature TEXT NOT NULL, -- HMAC-SHA256
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dlq')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    completed_at TEXT,
    next_retry_at TEXT,
    FOREIGN KEY (webhook_id) REFERENCES webhook_endpoints(webhook_id) ON DELETE CASCADE
);

CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_deliveries_retry ON webhook_deliveries(status, next_retry_at);
CREATE INDEX idx_deliveries_created ON webhook_deliveries(created_at);

-- =====================================================================
-- STEP 12: Create SSO Configuration Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS sso_providers (
    provider_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL, -- 'okta', 'azure-ad', 'google'
    type TEXT NOT NULL CHECK (type IN ('saml', 'oauth2')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    config TEXT NOT NULL, -- JSON: provider-specific config
    role_mappings TEXT DEFAULT '{}', -- JSON: SSO group -> role_id mappings
    enforce_2fa BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_sso_tenant ON sso_providers(tenant_id);
CREATE INDEX idx_sso_status ON sso_providers(tenant_id, status);

-- SSO login audit
CREATE TABLE IF NOT EXISTS sso_audit_log (
    audit_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    tenant_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT,
    email TEXT NOT NULL,
    result TEXT NOT NULL, -- 'success', 'failed', 'rejected'
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES sso_providers(provider_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_sso_audit_tenant ON sso_audit_log(tenant_id);
CREATE INDEX idx_sso_audit_provider ON sso_audit_log(provider_id);
CREATE INDEX idx_sso_audit_created ON sso_audit_log(created_at);

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Record migration
INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES ('004_multitenancy_2025-10-07', datetime('now'));

-- =====================================================================
-- ROLLBACK NOTES
-- =====================================================================
-- To rollback this migration:
-- 1. DROP TABLE sso_audit_log;
-- 2. DROP TABLE sso_providers;
-- 3. DROP TABLE webhook_deliveries;
-- 4. DROP TABLE webhook_endpoints;
-- 5. DROP TABLE rbac_audit_log;
-- 6. DROP TABLE tenant_users;
-- 7. DROP TABLE role_permissions;
-- 8. DROP TABLE permissions;
-- 9. DROP TABLE roles;
-- 10. DROP TABLE tenants;
-- 11. ALTER TABLE users DROP COLUMN tenant_id;
-- 12. ALTER TABLE inventory_items DROP COLUMN tenant_id;
-- 13. ALTER TABLE orders DROP COLUMN tenant_id;
-- 14. ALTER TABLE ai_forecasts DROP COLUMN tenant_id;
-- 15. ALTER TABLE ai_policies DROP COLUMN tenant_id;
-- 16. ALTER TABLE ai_feedback DROP COLUMN tenant_id;
-- 17. DELETE FROM schema_migrations WHERE version = '004_multitenancy_2025-10-07';
-- =====================================================================
