-- ============================================
-- Migration 022: Missing AI Tables for V22.3
-- NeuroPilot AI Enterprise
-- PostgreSQL Version (Production-Ready)
-- ============================================
-- This migration creates all missing AI-related tables
-- that are referenced by the AI engine but may not exist.
-- ============================================

-- ============================================
-- TABLE: ai_learning_insights
-- Purpose: Store AI learning insights and discoveries
-- ============================================
CREATE TABLE IF NOT EXISTS ai_learning_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    insight_type VARCHAR(100) NOT NULL,
    insight_category VARCHAR(100),
    title VARCHAR(500),
    description TEXT,
    confidence DECIMAL(5,4) DEFAULT 0,
    impact_score DECIMAL(5,4) DEFAULT 0,
    data JSONB DEFAULT '{}'::jsonb,
    source_model VARCHAR(100),
    source_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_insights_org ON ai_learning_insights(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_insights_type ON ai_learning_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_learning_insights_created ON ai_learning_insights(created_at DESC);

-- ============================================
-- TABLE: ai_feedback_comments
-- Purpose: Store user feedback on AI predictions
-- ============================================
CREATE TABLE IF NOT EXISTS ai_feedback_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    prediction_id VARCHAR(255),
    feedback_type VARCHAR(50) CHECK (feedback_type IN ('positive', 'negative', 'correction', 'suggestion')),
    comment TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    item_code VARCHAR(100),
    original_value DECIMAL(12,4),
    corrected_value DECIMAL(12,4),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    applied_to_model BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_comments_org ON ai_feedback_comments(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_comments_type ON ai_feedback_comments(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_comments_item ON ai_feedback_comments(item_code);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_comments_created ON ai_feedback_comments(created_at DESC);

-- ============================================
-- TABLE: ai_daily_forecast_cache
-- Purpose: Cache daily AI forecasts for fast retrieval
-- ============================================
CREATE TABLE IF NOT EXISTS ai_daily_forecast_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    forecast_date DATE NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    forecast_qty DECIMAL(12,4) NOT NULL DEFAULT 0,
    confidence DECIMAL(5,4) DEFAULT 0,
    model_version VARCHAR(50),
    lower_bound DECIMAL(12,4),
    upper_bound DECIMAL(12,4),
    seasonality_factor DECIMAL(5,4),
    trend_direction VARCHAR(20),
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT ai_daily_forecast_cache_unique UNIQUE (org_id, forecast_date, item_code)
);

CREATE INDEX IF NOT EXISTS idx_ai_forecast_cache_org_date ON ai_daily_forecast_cache(org_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecast_cache_item ON ai_daily_forecast_cache(item_code);
CREATE INDEX IF NOT EXISTS idx_ai_forecast_cache_expires ON ai_daily_forecast_cache(expires_at);

-- ============================================
-- TABLE: ai_anomaly_log
-- Purpose: Log detected anomalies for review
-- ============================================
CREATE TABLE IF NOT EXISTS ai_anomaly_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    anomaly_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    score DECIMAL(5,4) DEFAULT 0,
    description TEXT,
    affected_entity VARCHAR(255),
    affected_entity_id VARCHAR(255),
    expected_value DECIMAL(12,4),
    actual_value DECIMAL(12,4),
    deviation_pct DECIMAL(8,4),
    root_cause TEXT,
    recommendation TEXT,
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    false_positive BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_anomaly_log_org ON ai_anomaly_log(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_log_type ON ai_anomaly_log(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_log_severity ON ai_anomaly_log(severity);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_log_detected ON ai_anomaly_log(detected_at DESC);

-- ============================================
-- TABLE: ai_ops_health_metrics
-- Purpose: Track AI operations health metrics
-- ============================================
CREATE TABLE IF NOT EXISTS ai_ops_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12,4) NOT NULL,
    metric_unit VARCHAR(50),
    component VARCHAR(100),
    status VARCHAR(20) CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    threshold_min DECIMAL(12,4),
    threshold_max DECIMAL(12,4),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_ops_health_org ON ai_ops_health_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_ops_health_name ON ai_ops_health_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_ai_ops_health_component ON ai_ops_health_metrics(component);
CREATE INDEX IF NOT EXISTS idx_ai_ops_health_recorded ON ai_ops_health_metrics(recorded_at DESC);

-- ============================================
-- TABLE: ai_forecast_accuracy
-- Purpose: Track forecast accuracy over time
-- ============================================
CREATE TABLE IF NOT EXISTS ai_forecast_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    item_code VARCHAR(100),
    forecast_date DATE NOT NULL,
    forecast_qty DECIMAL(12,4),
    actual_qty DECIMAL(12,4),
    variance DECIMAL(12,4),
    variance_pct DECIMAL(8,4),
    mape DECIMAL(8,4),
    model_version VARCHAR(50),
    evaluation_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_forecast_accuracy_org ON ai_forecast_accuracy(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_forecast_accuracy_item ON ai_forecast_accuracy(item_code);
CREATE INDEX IF NOT EXISTS idx_ai_forecast_accuracy_date ON ai_forecast_accuracy(forecast_date DESC);

-- ============================================
-- TABLE: ai_ops_breadcrumbs
-- Purpose: Track AI operations audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS ai_ops_breadcrumbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    operation_id VARCHAR(255),
    operation_type VARCHAR(100) NOT NULL,
    component VARCHAR(100),
    action VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'started',
    input_summary TEXT,
    output_summary TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    parent_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_ops_breadcrumbs_org ON ai_ops_breadcrumbs(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_ops_breadcrumbs_operation ON ai_ops_breadcrumbs(operation_id);
CREATE INDEX IF NOT EXISTS idx_ai_ops_breadcrumbs_type ON ai_ops_breadcrumbs(operation_type);
CREATE INDEX IF NOT EXISTS idx_ai_ops_breadcrumbs_created ON ai_ops_breadcrumbs(created_at DESC);

-- ============================================
-- TABLE: invoices (if not exists)
-- Purpose: Store parsed invoice headers
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    invoice_number VARCHAR(100),
    vendor_id INTEGER,
    vendor_name VARCHAR(255),
    invoice_date DATE,
    due_date DATE,
    subtotal_cents BIGINT DEFAULT 0,
    tax_cents BIGINT DEFAULT 0,
    total_cents BIGINT DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'CAD',
    status VARCHAR(50) DEFAULT 'pending',
    pdf_file_id VARCHAR(255),
    pdf_file_name VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

-- ============================================
-- TABLE: invoice_line_items (if not exists)
-- Purpose: Store parsed invoice line items
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    org_id INTEGER DEFAULT 1,
    line_number INTEGER NOT NULL,
    item_code VARCHAR(100),
    description TEXT NOT NULL,
    quantity DECIMAL(12,4) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'EACH',
    unit_price_cents BIGINT DEFAULT 0,
    extended_price_cents BIGINT DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    category_code VARCHAR(50),
    inventory_item_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_org ON invoice_line_items(org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_item ON invoice_line_items(item_code);

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('022_ai_missing_tables.sql')
ON CONFLICT (filename) DO NOTHING;

-- Done!
SELECT 'Migration 022_ai_missing_tables.sql completed successfully' AS result;
