-- ============================================
-- Migration 026: Stripe Billing Integration
-- NeuroPilot AI Enterprise Phase 2
-- ============================================
-- Stripe subscription management with:
-- - Customer synchronization
-- - Subscription lifecycle tracking
-- - Usage metering for API calls
-- - Invoice and payment history
-- ============================================

-- ============================================
-- TABLE: billing_customers
-- Stripe customer records
-- ============================================
CREATE TABLE IF NOT EXISTS billing_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Stripe IDs
    stripe_customer_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_default_payment_method_id VARCHAR(100),

    -- Customer info (synced from Stripe)
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'CA',

    -- Tax
    tax_id VARCHAR(100),
    tax_exempt VARCHAR(20) DEFAULT 'none',  -- none, exempt, reverse

    -- Balance
    balance_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Sync status
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_org_customer UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_org ON billing_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe ON billing_customers(stripe_customer_id);

-- ============================================
-- TABLE: billing_subscriptions
-- Stripe subscription lifecycle
-- ============================================
CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,

    -- Stripe IDs
    stripe_subscription_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(100) NOT NULL,
    stripe_product_id VARCHAR(100),

    -- Plan info
    plan_name VARCHAR(50) NOT NULL,  -- free, starter, professional, enterprise
    plan_interval VARCHAR(20) DEFAULT 'month',  -- month, year
    quantity INTEGER DEFAULT 1,

    -- Status
    status VARCHAR(30) NOT NULL,
    -- active, past_due, unpaid, canceled, incomplete, incomplete_expired, trialing, paused
    cancel_at_period_end BOOLEAN DEFAULT FALSE,

    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    billing_cycle_anchor TIMESTAMPTZ,

    -- Trial
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,

    -- Cancellation
    canceled_at TIMESTAMPTZ,
    cancel_reason VARCHAR(100),
    cancel_feedback TEXT,

    -- Pause
    pause_collection JSONB,
    paused_at TIMESTAMPTZ,

    -- Discounts
    stripe_discount_id VARCHAR(100),
    discount_percent_off DECIMAL(5, 2),
    discount_amount_off_cents INTEGER,
    discount_ends_at TIMESTAMPTZ,

    -- Pricing
    unit_amount_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Usage limits (from plan)
    included_users INTEGER,
    included_items INTEGER,
    included_locations INTEGER,
    included_api_calls INTEGER,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Sync
    last_synced_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_status CHECK (status IN (
        'active', 'past_due', 'unpaid', 'canceled',
        'incomplete', 'incomplete_expired', 'trialing', 'paused'
    ))
);

CREATE INDEX IF NOT EXISTS idx_billing_subs_org ON billing_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_customer ON billing_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_stripe ON billing_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_status ON billing_subscriptions(status);

-- ============================================
-- TABLE: billing_invoices
-- Stripe invoice history
-- ============================================
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES billing_customers(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,

    -- Stripe IDs
    stripe_invoice_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_payment_intent_id VARCHAR(100),
    stripe_charge_id VARCHAR(100),

    -- Invoice info
    number VARCHAR(100),
    status VARCHAR(30) NOT NULL,  -- draft, open, paid, uncollectible, void
    collection_method VARCHAR(30) DEFAULT 'charge_automatically',

    -- Amounts
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER DEFAULT 0,
    discount_cents INTEGER DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    amount_paid_cents INTEGER DEFAULT 0,
    amount_due_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Dates
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,

    -- Billing reason
    billing_reason VARCHAR(50),
    -- subscription_create, subscription_cycle, subscription_update,
    -- upcoming, manual, subscription_threshold

    -- PDF
    invoice_pdf_url TEXT,
    hosted_invoice_url TEXT,

    -- Payment
    attempted BOOLEAN DEFAULT FALSE,
    attempt_count INTEGER DEFAULT 0,
    next_payment_attempt TIMESTAMPTZ,
    last_payment_error JSONB,

    -- Line items
    line_items JSONB DEFAULT '[]',

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Sync
    last_synced_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON billing_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_customer ON billing_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe ON billing_invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_date ON billing_invoices(org_id, created_at DESC);

-- ============================================
-- TABLE: billing_payment_methods
-- Stored payment methods
-- ============================================
CREATE TABLE IF NOT EXISTS billing_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,

    -- Stripe ID
    stripe_payment_method_id VARCHAR(100) UNIQUE NOT NULL,

    -- Type
    type VARCHAR(30) NOT NULL,  -- card, bank_account, sepa_debit, etc.

    -- Card details (if type = card)
    card_brand VARCHAR(30),  -- visa, mastercard, amex, etc.
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    card_funding VARCHAR(20),  -- credit, debit, prepaid

    -- Bank details (if type = bank_account)
    bank_name VARCHAR(255),
    bank_last4 VARCHAR(4),
    bank_routing_number VARCHAR(20),

    -- Status
    is_default BOOLEAN DEFAULT FALSE,
    is_valid BOOLEAN DEFAULT TRUE,

    -- Billing address
    billing_name VARCHAR(255),
    billing_email VARCHAR(255),
    billing_phone VARCHAR(50),
    billing_address JSONB,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON billing_payment_methods(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_customer ON billing_payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON billing_payment_methods(customer_id, is_default) WHERE is_default = TRUE;

-- ============================================
-- TABLE: billing_usage_records
-- Metered usage tracking for API calls
-- ============================================
CREATE TABLE IF NOT EXISTS billing_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,

    -- Usage period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Metrics
    metric_name VARCHAR(100) NOT NULL,  -- api_calls, items_count, users_count
    quantity INTEGER NOT NULL DEFAULT 0,
    included_quantity INTEGER DEFAULT 0,
    overage_quantity INTEGER DEFAULT 0,

    -- Pricing
    unit_price_cents INTEGER DEFAULT 0,
    overage_amount_cents INTEGER DEFAULT 0,

    -- Stripe sync
    stripe_usage_record_id VARCHAR(100),
    reported_to_stripe BOOLEAN DEFAULT FALSE,
    reported_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_usage_period UNIQUE (org_id, metric_name, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_org ON billing_usage_records(org_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric ON billing_usage_records(metric_name, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_unreported ON billing_usage_records(reported_to_stripe) WHERE reported_to_stripe = FALSE;

-- ============================================
-- TABLE: billing_events
-- Stripe webhook event log
-- ============================================
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stripe event
    stripe_event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    api_version VARCHAR(20),

    -- Related objects
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    stripe_invoice_id VARCHAR(100),

    -- Payload
    payload JSONB NOT NULL,

    -- Processing
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    process_attempts INTEGER DEFAULT 0,
    process_error TEXT,

    -- Audit
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed ON billing_events(processed, received_at) WHERE processed = FALSE;

-- ============================================
-- TABLE: billing_plans
-- Plan configuration (admin-managed)
-- ============================================
CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan identity
    name VARCHAR(50) UNIQUE NOT NULL,  -- free, starter, professional, enterprise
    display_name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Stripe IDs
    stripe_product_id VARCHAR(100),
    stripe_price_id_monthly VARCHAR(100),
    stripe_price_id_yearly VARCHAR(100),

    -- Pricing
    price_monthly_cents INTEGER DEFAULT 0,
    price_yearly_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'CAD',

    -- Limits
    max_users INTEGER DEFAULT 3,
    max_items INTEGER DEFAULT 500,
    max_locations INTEGER DEFAULT 5,
    max_api_calls_per_day INTEGER DEFAULT 1000,
    max_storage_mb INTEGER DEFAULT 1000,

    -- Features
    features JSONB DEFAULT '{}',
    -- Example: {"ai_forecasting": true, "vendor_parser": true, "api_access": false}

    -- Metadata
    is_public BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    badge_text VARCHAR(50),  -- "Popular", "Best Value"
    badge_color VARCHAR(20),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Seed default plans
INSERT INTO billing_plans (name, display_name, description, max_users, max_items, max_locations, max_api_calls_per_day, price_monthly_cents, price_yearly_cents, features, sort_order)
VALUES
    ('free', 'Free', 'Perfect for trying NeuroPilot', 2, 100, 1, 100, 0, 0,
     '{"ai_forecasting": false, "vendor_parser": false, "api_access": false, "priority_support": false}', 1),
    ('starter', 'Starter', 'For small restaurants getting started', 5, 500, 3, 1000, 4900, 49900,
     '{"ai_forecasting": false, "vendor_parser": true, "api_access": false, "priority_support": false}', 2),
    ('professional', 'Professional', 'For growing multi-location operations', 15, 2000, 10, 10000, 14900, 149900,
     '{"ai_forecasting": true, "vendor_parser": true, "api_access": true, "priority_support": false}', 3),
    ('enterprise', 'Enterprise', 'Custom solutions for large organizations', 999, 999999, 999, 999999, 0, 0,
     '{"ai_forecasting": true, "vendor_parser": true, "api_access": true, "priority_support": true, "custom_integrations": true, "dedicated_support": true}', 4)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    max_users = EXCLUDED.max_users,
    max_items = EXCLUDED.max_items,
    max_locations = EXCLUDED.max_locations,
    max_api_calls_per_day = EXCLUDED.max_api_calls_per_day,
    price_monthly_cents = EXCLUDED.price_monthly_cents,
    price_yearly_cents = EXCLUDED.price_yearly_cents,
    features = EXCLUDED.features,
    sort_order = EXCLUDED.sort_order,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- FUNCTIONS: Billing Helpers
-- ============================================

-- Get current subscription for org
CREATE OR REPLACE FUNCTION get_org_subscription(p_org_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    plan_name VARCHAR(50),
    status VARCHAR(30),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        bs.id,
        bs.plan_name,
        bs.status,
        bs.current_period_end,
        bs.cancel_at_period_end
    FROM billing_subscriptions bs
    WHERE bs.org_id = p_org_id
      AND bs.status IN ('active', 'trialing', 'past_due')
    ORDER BY bs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if org has feature access
CREATE OR REPLACE FUNCTION org_has_feature(p_org_id UUID, p_feature VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_plan_name VARCHAR(50);
    v_has_feature BOOLEAN;
BEGIN
    -- Get current plan
    SELECT bs.plan_name INTO v_plan_name
    FROM billing_subscriptions bs
    WHERE bs.org_id = p_org_id
      AND bs.status IN ('active', 'trialing')
    ORDER BY bs.created_at DESC
    LIMIT 1;

    IF v_plan_name IS NULL THEN
        v_plan_name := 'free';
    END IF;

    -- Check feature in plan
    SELECT (bp.features->>p_feature)::BOOLEAN INTO v_has_feature
    FROM billing_plans bp
    WHERE bp.name = v_plan_name
      AND bp.is_active = TRUE;

    RETURN COALESCE(v_has_feature, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- Record API usage
CREATE OR REPLACE FUNCTION record_api_usage(
    p_org_id UUID,
    p_increment INTEGER DEFAULT 1
) RETURNS VOID AS $$
DECLARE
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    -- Current day period
    v_period_start := date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
    v_period_end := v_period_start + INTERVAL '1 day';

    INSERT INTO billing_usage_records (org_id, period_start, period_end, metric_name, quantity)
    VALUES (p_org_id, v_period_start, v_period_end, 'api_calls', p_increment)
    ON CONFLICT (org_id, metric_name, period_start)
    DO UPDATE SET
        quantity = billing_usage_records.quantity + p_increment;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('026_stripe_billing.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 026_stripe_billing.sql completed successfully' AS result;
