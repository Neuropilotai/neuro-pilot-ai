-- ============================================
-- Migration 023: Multi-Tenant Foundation
-- NeuroPilot AI Enterprise Phase 2
-- ============================================
-- Establishes org_id as the tenant isolation key
-- Adds organizations table and RLS policies
-- ============================================

-- ============================================
-- TABLE: organizations
-- Central tenant registry
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) UNIQUE NOT NULL,  -- URL-safe identifier (e.g., "acme-foods")
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),

    -- Contact
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(255),

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'CA',

    -- Billing
    stripe_customer_id VARCHAR(100) UNIQUE,
    stripe_subscription_id VARCHAR(100),
    billing_email VARCHAR(255),
    billing_plan VARCHAR(50) DEFAULT 'free',  -- free, starter, professional, enterprise
    billing_status VARCHAR(50) DEFAULT 'active',  -- active, past_due, canceled, trialing
    trial_ends_at TIMESTAMPTZ,

    -- Limits (based on plan)
    max_users INTEGER DEFAULT 3,
    max_items INTEGER DEFAULT 500,
    max_locations INTEGER DEFAULT 5,
    max_api_calls_per_day INTEGER DEFAULT 1000,
    features JSONB DEFAULT '{}',  -- Feature flags per org

    -- Settings
    timezone VARCHAR(50) DEFAULT 'America/Toronto',
    currency VARCHAR(3) DEFAULT 'CAD',
    fiscal_year_start INTEGER DEFAULT 1,  -- Month (1-12)
    settings JSONB DEFAULT '{}',

    -- Security
    sso_enabled BOOLEAN DEFAULT FALSE,
    sso_provider VARCHAR(50),  -- okta, azure_ad, google
    sso_config JSONB,
    mfa_required BOOLEAN DEFAULT FALSE,
    ip_allowlist TEXT[],

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_billing_plan CHECK (billing_plan IN ('free', 'starter', 'professional', 'enterprise')),
    CONSTRAINT valid_billing_status CHECK (billing_status IN ('active', 'past_due', 'canceled', 'trialing', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(billing_status) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: organization_members
-- User-to-org membership with roles
-- ============================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- References users table

    role VARCHAR(50) NOT NULL DEFAULT 'member',  -- owner, admin, manager, member, viewer
    permissions TEXT[] DEFAULT '{}',  -- Additional granular permissions

    -- Invitation
    invited_by UUID,
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    invitation_token VARCHAR(255),
    invitation_expires_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_org_member UNIQUE (org_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_active ON organization_members(org_id, is_active) WHERE is_active = TRUE;

-- ============================================
-- TABLE: sites
-- Physical locations within an organization
-- ============================================
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'restaurant',  -- restaurant, warehouse, commissary, office

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'CA',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Operations
    timezone VARCHAR(50),
    phone VARCHAR(50),
    manager_id UUID,

    -- Settings
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,

    CONSTRAINT unique_org_site_code UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(org_id);
CREATE INDEX IF NOT EXISTS idx_sites_active ON sites(org_id, is_active) WHERE is_active = TRUE;

-- ============================================
-- ADD org_id TO EXISTING TABLES
-- ============================================

-- Add org_id column to tables that need it
DO $$
DECLARE
    tables_to_update TEXT[] := ARRAY[
        'inventory_items',
        'vendors',
        'vendor_prices',
        'vendor_orders',
        'vendor_order_lines',
        'recipes',
        'recipe_ingredients',
        'menus',
        'menu_days',
        'menu_recipes',
        'orders',
        'order_items',
        'waste_log',
        'inventory_counts',
        'inventory_count_rows',
        'documents',
        'storage_locations',
        'invoices',
        'invoice_line_items'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables_to_update
    LOOP
        -- Check if table exists and column doesn't exist
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN org_id UUID', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_org ON %I(org_id)', t, t);
            RAISE NOTICE 'Added org_id to table: %', t;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- CREATE DEFAULT ORGANIZATION
-- Migrate existing data to default org
-- ============================================

-- Create default org for existing data
INSERT INTO organizations (id, slug, name, email, billing_plan, max_users, max_items, max_locations)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default Organization',
    'admin@neuropilot.dev',
    'enterprise',
    100,
    999999,
    999
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing records to default org where org_id is NULL
DO $$
DECLARE
    tables_to_update TEXT[] := ARRAY[
        'inventory_items',
        'vendors',
        'vendor_orders',
        'recipes',
        'menus',
        'orders',
        'waste_log',
        'inventory_counts',
        'documents',
        'storage_locations',
        'invoices'
    ];
    t TEXT;
    default_org_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Validate that default_org_id is not null before proceeding
    -- This prevents setting all org_id columns to NULL if default org doesn't exist
    IF default_org_id IS NULL THEN
        RAISE EXCEPTION 'default_org_id cannot be NULL. Cannot proceed with backfill.';
    END IF;
    
    -- Verify default org exists in database
    IF NOT EXISTS (
        SELECT 1 FROM organizations WHERE id = default_org_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Default organization % does not exist. Cannot proceed with backfill.', default_org_id;
    END IF;
    
    FOREACH t IN ARRAY tables_to_update
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
        ) THEN
            EXECUTE format('UPDATE %I SET org_id = $1 WHERE org_id IS NULL', t) USING default_org_id;
            RAISE NOTICE 'Updated org_id for table: %', t;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on key tables
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (using session variable for org_id)
-- Note: Application must SET app.current_org_id before queries

CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Example policy for inventory_items
DROP POLICY IF EXISTS inventory_items_org_isolation ON inventory_items;
CREATE POLICY inventory_items_org_isolation ON inventory_items
    FOR ALL
    USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get org_id from slug
CREATE OR REPLACE FUNCTION get_org_id_by_slug(p_slug VARCHAR)
RETURNS UUID AS $$
    SELECT id FROM organizations WHERE slug = p_slug AND deleted_at IS NULL LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Check if user is member of org
CREATE OR REPLACE FUNCTION is_org_member(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id
          AND org_id = p_org_id
          AND is_active = TRUE
    );
$$ LANGUAGE SQL STABLE;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('023_multi_tenant_foundation.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 023_multi_tenant_foundation.sql completed successfully' AS result;
