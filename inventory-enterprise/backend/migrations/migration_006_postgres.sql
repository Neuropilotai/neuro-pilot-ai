-- ============================================================================
-- PostgreSQL Migration 006 - v2.8.0 Schema Migration
-- NeuroInnovate Inventory Enterprise
--
-- This migration creates the complete PostgreSQL schema from SQLite
-- and adds new tables for v2.8.0 features (2FA, audit logging, forecasting)
-- ============================================================================

-- Set client encoding
SET client_encoding = 'UTF8';

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================================
-- Migration tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version, description)
VALUES ('006', 'v2.8.0 - PostgreSQL migration with 2FA, audit logging, and forecasting');

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Core Tenant & User Management (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    settings JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    CONSTRAINT fk_tenants_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);
CREATE INDEX IF NOT EXISTS idx_tenants_name_trgm ON tenants USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS roles (
    role_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(tenant_id, name);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    name VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(50) NOT NULL,
    permission_id VARCHAR(50) NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by VARCHAR(50),
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);

CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    role_id VARCHAR(50) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    invited_by VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
    PRIMARY KEY (tenant_id, user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
    FOREIGN KEY (invited_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON tenant_users(role_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_status ON tenant_users(tenant_id, status);

CREATE TABLE IF NOT EXISTS rbac_audit_log (
    audit_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    tenant_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    permission VARCHAR(100),
    result VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_tenant ON rbac_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_user ON rbac_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_created ON rbac_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_result ON rbac_audit_log(tenant_id, result);

-- ============================================================================
-- Inventory Core Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_master (
    item_id SERIAL PRIMARY KEY,
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_name_fr VARCHAR(255),
    category VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'each',
    barcode VARCHAR(100),
    par_level DECIMAL(10,2) DEFAULT 0,
    reorder_point DECIMAL(10,2) DEFAULT 0,
    unit_cost DECIMAL(10,2) DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    tenant_id VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    UNIQUE(tenant_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_item_master_tenant ON item_master(tenant_id);
CREATE INDEX IF NOT EXISTS idx_item_master_category ON item_master(category);
CREATE INDEX IF NOT EXISTS idx_item_master_barcode ON item_master(barcode);
CREATE INDEX IF NOT EXISTS idx_item_master_active ON item_master(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_item_master_name_trgm ON item_master USING GIN (item_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS processed_invoices (
    invoice_id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100) UNIQUE,
    supplier VARCHAR(255) DEFAULT 'GFS',
    invoice_date DATE,
    total_amount DECIMAL(10,2),
    tax_amount DECIMAL(10,2),
    subtotal DECIMAL(10,2),
    gst DECIMAL(10,2) DEFAULT 0,
    qst DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'processed',
    tenant_id VARCHAR(50) DEFAULT 'default',
    extraction_quality VARCHAR(20),
    is_credit_memo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON processed_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON processed_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON processed_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON processed_invoices(supplier, tenant_id);

CREATE TABLE IF NOT EXISTS invoice_items (
    invoice_item_id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(255),
    quantity DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'CS',
    unit_price DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) DEFAULT 0,
    barcode VARCHAR(100),
    line_number INTEGER,
    tenant_id VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    FOREIGN KEY (invoice_id) REFERENCES processed_invoices(invoice_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_code ON invoice_items(item_code);
CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant ON invoice_items(tenant_id);

CREATE TABLE IF NOT EXISTS storage_locations (
    location_id SERIAL PRIMARY KEY,
    location_code VARCHAR(50) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    location_type VARCHAR(50),
    capacity DECIMAL(10,2),
    current_occupancy DECIMAL(10,2) DEFAULT 0,
    zone VARCHAR(50),
    temp_min DECIMAL(5,2),
    temp_max DECIMAL(5,2),
    active BOOLEAN DEFAULT TRUE,
    tenant_id VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_locations_tenant ON storage_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_locations_code ON storage_locations(location_code);
CREATE INDEX IF NOT EXISTS idx_locations_active ON storage_locations(tenant_id, active);

CREATE TABLE IF NOT EXISTS inventory_count_items (
    count_item_id SERIAL PRIMARY KEY,
    count_id INTEGER,
    item_code VARCHAR(100) NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 0,
    location VARCHAR(50),
    counted_by VARCHAR(100),
    notes TEXT,
    tenant_id VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_code ON inventory_count_items(item_code);
CREATE INDEX IF NOT EXISTS idx_count_items_tenant ON inventory_count_items(tenant_id);

-- ============================================================================
-- AI Ops Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_anomaly_predictions (
    id SERIAL PRIMARY KEY,
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    anomaly_score DECIMAL(5,4) NOT NULL CHECK (anomaly_score >= 0 AND anomaly_score <= 1),
    predicted_timestamp TIMESTAMP NOT NULL,
    detected_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    occurred_timestamp TIMESTAMP,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    threshold_value DECIMAL(15,4),
    root_cause JSONB,
    current_metrics JSONB,
    confirmed BOOLEAN DEFAULT FALSE,
    false_positive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anomaly_predictions_type ON ai_anomaly_predictions(incident_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_predictions_severity ON ai_anomaly_predictions(severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_predictions_detected ON ai_anomaly_predictions(detected_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_predictions_predicted ON ai_anomaly_predictions(predicted_timestamp);
CREATE INDEX IF NOT EXISTS idx_anomaly_predictions_metric ON ai_anomaly_predictions(metric_name);

CREATE TABLE IF NOT EXISTS ai_remediation_log (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(50) NOT NULL,
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    remediation_action VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    response_time_ms INTEGER NOT NULL,
    actions_taken JSONB,
    error_message TEXT,
    validated BOOLEAN DEFAULT FALSE,
    validation_timestamp TIMESTAMP,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    executed_by VARCHAR(100) DEFAULT 'ai_ops_agent'
);

CREATE INDEX IF NOT EXISTS idx_remediation_log_incident_id ON ai_remediation_log(incident_id);
CREATE INDEX IF NOT EXISTS idx_remediation_log_type ON ai_remediation_log(incident_type);
CREATE INDEX IF NOT EXISTS idx_remediation_log_success ON ai_remediation_log(success);
CREATE INDEX IF NOT EXISTS idx_remediation_log_executed ON ai_remediation_log(executed_at DESC);

CREATE TABLE IF NOT EXISTS ai_ops_statistics (
    id SERIAL PRIMARY KEY,
    checks_performed INTEGER NOT NULL DEFAULT 0,
    incidents_predicted INTEGER NOT NULL DEFAULT 0,
    remediations_triggered INTEGER NOT NULL DEFAULT 0,
    remediations_succeeded INTEGER NOT NULL DEFAULT 0,
    remediations_failed INTEGER NOT NULL DEFAULT 0,
    false_positives INTEGER NOT NULL DEFAULT 0,
    true_positives INTEGER NOT NULL DEFAULT 0,
    mean_response_time_ms INTEGER NOT NULL DEFAULT 0,
    success_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0,
    accuracy_rate DECIMAL(5,4),
    uptime_ms BIGINT NOT NULL DEFAULT 0,
    period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    period_end TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ops_statistics_period ON ai_ops_statistics(period_start, period_end);

CREATE TABLE IF NOT EXISTS ai_model_metrics (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    trained_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    training_samples INTEGER NOT NULL,
    training_duration_ms INTEGER,
    accuracy DECIMAL(5,4),
    precision_score DECIMAL(5,4),
    recall DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    mse DECIMAL(15,8),
    mae DECIMAL(15,8),
    parameters JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_metrics_name ON ai_model_metrics(model_name);
CREATE INDEX IF NOT EXISTS idx_model_metrics_active ON ai_model_metrics(is_active, trained_at DESC);

CREATE TABLE IF NOT EXISTS ai_ops_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    category VARCHAR(50),
    min_value DECIMAL(15,4),
    max_value DECIMAL(15,4),
    allowed_values JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_ops_config_key ON ai_ops_config(config_key);
CREATE INDEX IF NOT EXISTS idx_ops_config_category ON ai_ops_config(category);

-- ============================================================================
-- Governance Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS governance_policies (
    policy_id VARCHAR(50) PRIMARY KEY,
    policy_name VARCHAR(255) NOT NULL,
    policy_type VARCHAR(100) NOT NULL,
    current_value DECIMAL(15,4) NOT NULL,
    default_value DECIMAL(15,4) NOT NULL,
    min_value DECIMAL(15,4),
    max_value DECIMAL(15,4),
    effectiveness_score DECIMAL(5,4) DEFAULT 0.0,
    false_positive_rate DECIMAL(5,4) DEFAULT 0.0,
    last_adapted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_governance_policies_name ON governance_policies(policy_name);
CREATE INDEX IF NOT EXISTS idx_governance_policies_type ON governance_policies(policy_type);

CREATE TABLE IF NOT EXISTS governance_adaptations (
    adaptation_id VARCHAR(50) PRIMARY KEY,
    policy_id VARCHAR(50) NOT NULL,
    adaptation_type VARCHAR(100) NOT NULL,
    previous_value DECIMAL(15,4),
    new_value DECIMAL(15,4),
    confidence DECIMAL(5,4) NOT NULL,
    expected_improvement DECIMAL(5,4),
    actual_improvement DECIMAL(5,4),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_adaptations_policy ON governance_adaptations(policy_id);
CREATE INDEX IF NOT EXISTS idx_governance_adaptations_status ON governance_adaptations(status);
CREATE INDEX IF NOT EXISTS idx_governance_adaptations_created ON governance_adaptations(created_at DESC);

CREATE TABLE IF NOT EXISTS governance_learning_history (
    learning_id VARCHAR(50) PRIMARY KEY,
    cycle_timestamp TIMESTAMP NOT NULL,
    performance_data JSONB,
    incident_patterns JSONB,
    policy_effectiveness JSONB,
    recommendations_count INTEGER DEFAULT 0,
    adaptations_applied INTEGER DEFAULT 0,
    duration_ms INTEGER,
    status VARCHAR(20) DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_governance_learning_timestamp ON governance_learning_history(cycle_timestamp);
CREATE INDEX IF NOT EXISTS idx_governance_learning_status ON governance_learning_history(status);

-- ============================================================================
-- Insights & LLM Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS insight_reports (
    report_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    language VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    bleu_score DECIMAL(5,4),
    quality_score DECIMAL(5,4),
    operational_data JSONB,
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    generation_duration_ms INTEGER,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_language ON insight_reports(language);
CREATE INDEX IF NOT EXISTS idx_insight_reports_generated ON insight_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_reports_quality ON insight_reports(quality_score DESC);

CREATE TABLE IF NOT EXISTS insight_llm_api_log (
    api_call_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    language VARCHAR(10),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    duration_ms INTEGER,
    status VARCHAR(20) NOT NULL,
    error_type VARCHAR(100),
    error_message TEXT,
    cost_usd DECIMAL(10,6),
    called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_api_log_provider ON insight_llm_api_log(provider);
CREATE INDEX IF NOT EXISTS idx_llm_api_log_status ON insight_llm_api_log(status);
CREATE INDEX IF NOT EXISTS idx_llm_api_log_called ON insight_llm_api_log(called_at DESC);

-- ============================================================================
-- Compliance Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_audit_log (
    audit_id VARCHAR(50) NOT NULL,
    framework VARCHAR(50) NOT NULL,
    compliance_score DECIMAL(5,4) NOT NULL,
    total_checks INTEGER NOT NULL,
    passed_checks INTEGER NOT NULL,
    failed_checks INTEGER NOT NULL,
    findings JSONB,
    audit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    audit_duration_ms INTEGER,
    PRIMARY KEY (audit_id, framework)
);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_framework ON compliance_audit_log(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_timestamp ON compliance_audit_log(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_score ON compliance_audit_log(compliance_score);

CREATE TABLE IF NOT EXISTS compliance_findings (
    finding_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    audit_id VARCHAR(50) NOT NULL,
    framework VARCHAR(50) NOT NULL,
    check_id VARCHAR(100) NOT NULL,
    control VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    current_state TEXT,
    required_state TEXT,
    recommendation TEXT,
    effort VARCHAR(20),
    status VARCHAR(20) DEFAULT 'open',
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_findings_audit ON compliance_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_framework ON compliance_findings(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_severity ON compliance_findings(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_status ON compliance_findings(status);

CREATE TABLE IF NOT EXISTS compliance_remediation (
    remediation_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    finding_id VARCHAR(50) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_description TEXT NOT NULL,
    assigned_to VARCHAR(100),
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    verified_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (finding_id) REFERENCES compliance_findings(finding_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_remediation_finding ON compliance_remediation(finding_id);
CREATE INDEX IF NOT EXISTS idx_compliance_remediation_status ON compliance_remediation(status);
CREATE INDEX IF NOT EXISTS idx_compliance_remediation_priority ON compliance_remediation(priority);

-- ============================================================================
-- Webhooks & SSO Tables (from existing schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    webhook_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    headers JSONB DEFAULT '{}'::JSONB,
    retry_count INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 30000,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    last_triggered_at TIMESTAMP,
    last_success_at TIMESTAMP,
    last_failure_at TIMESTAMP,
    failure_count INTEGER DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhook_endpoints(tenant_id, status);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    webhook_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhook_endpoints(webhook_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON webhook_deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS sso_providers (
    provider_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('saml', 'oauth2')),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    config JSONB NOT NULL,
    role_mappings JSONB DEFAULT '{}'::JSONB,
    enforce_2fa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sso_tenant ON sso_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sso_status ON sso_providers(tenant_id, status);

CREATE TABLE IF NOT EXISTS sso_audit_log (
    audit_id VARCHAR(50) PRIMARY KEY DEFAULT (lower(uuid_generate_v4()::TEXT)),
    tenant_id VARCHAR(50) NOT NULL,
    provider_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    result VARCHAR(20) NOT NULL,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES sso_providers(provider_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sso_audit_tenant ON sso_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sso_audit_provider ON sso_audit_log(provider_id);
CREATE INDEX IF NOT EXISTS idx_sso_audit_created ON sso_audit_log(created_at DESC);

-- ============================================================================
-- NEW v2.8.0 TABLES
-- ============================================================================

-- Two-Factor Authentication
CREATE TABLE IF NOT EXISTS two_factor_auth (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    secret_encrypted TEXT NOT NULL,
    backup_codes JSONB, -- Array of hashed backup codes
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_2fa_user ON two_factor_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_2fa_enabled ON two_factor_auth(enabled, user_id);

-- Enhanced Audit Logs (Partitioned by month)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL,
    event_type VARCHAR(50) NOT NULL,
    action VARCHAR(50),
    table_name VARCHAR(100),
    record_id VARCHAR(100),
    user_id VARCHAR(50),
    user_email VARCHAR(255),
    tenant_id VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    location JSONB,
    endpoint VARCHAR(255),
    request_body JSONB,
    response_status INTEGER,
    duration_ms INTEGER,
    before_state JSONB,
    after_state JSONB,
    success BOOLEAN,
    severity VARCHAR(20),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);

-- Create partitions for 12 months
CREATE TABLE audit_logs_2025_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE audit_logs_2025_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Forecast Results
CREATE TABLE IF NOT EXISTS forecast_results (
    forecast_id BIGSERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL,
    model_type VARCHAR(20) NOT NULL CHECK (model_type IN ('prophet', 'arima', 'hybrid')),
    forecast_period INTEGER NOT NULL, -- Days ahead
    predicted_date DATE NOT NULL,
    predicted_quantity DECIMAL(10,2) NOT NULL,
    confidence_lower DECIMAL(10,2),
    confidence_upper DECIMAL(10,2),
    confidence_level DECIMAL(5,4) DEFAULT 0.95,
    mape DECIMAL(5,4), -- Mean Absolute Percentage Error
    rmse DECIMAL(10,4), -- Root Mean Squared Error
    model_parameters JSONB,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'forecasting_service'
);

CREATE INDEX IF NOT EXISTS idx_forecast_results_item ON forecast_results(item_id);
CREATE INDEX IF NOT EXISTS idx_forecast_results_code ON forecast_results(item_code);
CREATE INDEX IF NOT EXISTS idx_forecast_results_tenant ON forecast_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_forecast_results_date ON forecast_results(predicted_date);
CREATE INDEX IF NOT EXISTS idx_forecast_results_model ON forecast_results(model_type);
CREATE INDEX IF NOT EXISTS idx_forecast_results_generated ON forecast_results(generated_at DESC);

-- Forecast Accuracy Tracking
CREATE TABLE IF NOT EXISTS forecast_accuracy (
    accuracy_id BIGSERIAL PRIMARY KEY,
    forecast_id BIGINT NOT NULL,
    actual_quantity DECIMAL(10,2) NOT NULL,
    predicted_quantity DECIMAL(10,2) NOT NULL,
    absolute_error DECIMAL(10,2),
    percentage_error DECIMAL(5,4),
    actual_date DATE NOT NULL,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (forecast_id) REFERENCES forecast_results(forecast_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_forecast ON forecast_accuracy(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_date ON forecast_accuracy(actual_date DESC);

-- ============================================================================
-- Views for v2.8.0
-- ============================================================================

CREATE OR REPLACE VIEW v_recent_predictions AS
SELECT
    p.id,
    p.incident_type,
    p.severity,
    p.confidence,
    p.anomaly_score,
    p.predicted_timestamp,
    p.detected_timestamp,
    p.confirmed,
    p.false_positive,
    r.success AS remediation_success,
    r.response_time_ms,
    r.executed_at AS remediation_executed_at
FROM ai_anomaly_predictions p
LEFT JOIN ai_remediation_log r ON r.incident_id = CAST(p.id AS TEXT)
WHERE p.detected_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY p.detected_timestamp DESC;

CREATE OR REPLACE VIEW v_aiops_performance AS
SELECT
    COUNT(*) AS total_predictions,
    SUM(CASE WHEN confirmed = TRUE THEN 1 ELSE 0 END) AS true_positives,
    SUM(CASE WHEN false_positive = TRUE THEN 1 ELSE 0 END) AS false_positives,
    ROUND(AVG(confidence) * 100, 2) AS avg_confidence_pct,
    ROUND(AVG(anomaly_score) * 100, 2) AS avg_anomaly_score_pct,
    (SELECT COUNT(*) FROM ai_remediation_log WHERE success = TRUE) AS successful_remediations,
    (SELECT COUNT(*) FROM ai_remediation_log WHERE success = FALSE) AS failed_remediations,
    (SELECT ROUND(AVG(response_time_ms), 0) FROM ai_remediation_log) AS avg_response_time_ms
FROM ai_anomaly_predictions
WHERE detected_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days';

CREATE OR REPLACE VIEW v_forecast_performance AS
SELECT
    fr.model_type,
    COUNT(*) as total_forecasts,
    AVG(fa.percentage_error) as avg_percentage_error,
    AVG(fa.absolute_error) as avg_absolute_error,
    MIN(fa.percentage_error) as min_error,
    MAX(fa.percentage_error) as max_error,
    COUNT(CASE WHEN fa.percentage_error < 0.10 THEN 1 END) as forecasts_within_10_pct
FROM forecast_results fr
LEFT JOIN forecast_accuracy fa ON fr.forecast_id = fa.forecast_id
WHERE fr.generated_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY fr.model_type;

CREATE OR REPLACE VIEW v_2fa_enrollment_stats AS
SELECT
    COUNT(*) as total_users,
    SUM(CASE WHEN enabled = TRUE THEN 1 ELSE 0 END) as enabled_users,
    ROUND(SUM(CASE WHEN enabled = TRUE THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as enrollment_percentage,
    COUNT(CASE WHEN last_used_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 END) as active_30_days
FROM two_factor_auth;

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_master_updated_at BEFORE UPDATE ON item_master
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON processed_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON storage_locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Initial Data Seed
-- ============================================================================

-- Insert default tenant if not exists
INSERT INTO tenants (tenant_id, name, status)
VALUES ('default', 'Default Tenant', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO inventory_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO inventory_admin;
GRANT USAGE ON SCHEMA public TO inventory_admin;

-- Analyze tables for query optimization
ANALYZE;

-- Log completion
INSERT INTO migration_history (migration_name)
VALUES ('migration_006_postgres - Complete schema migration for v2.8.0');

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PostgreSQL Migration 006 Complete!';
    RAISE NOTICE 'v2.8.0 Schema Ready';
    RAISE NOTICE '========================================';
END
$$;
