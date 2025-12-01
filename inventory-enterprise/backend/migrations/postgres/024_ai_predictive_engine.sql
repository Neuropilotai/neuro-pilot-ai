-- ============================================
-- Migration 024: AI Predictive Engine
-- NeuroPilot AI Enterprise Phase 2
-- ============================================
-- Adds tables for demand forecasting, reorder optimization,
-- and consumption pattern learning
-- ============================================

-- ============================================
-- TABLE: ai_demand_forecasts
-- Daily/weekly demand predictions per item per site
-- ============================================
CREATE TABLE IF NOT EXISTS ai_demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    site_id UUID,

    item_id INTEGER NOT NULL,
    item_code VARCHAR(100),

    -- Forecast period
    forecast_date DATE NOT NULL,
    forecast_type VARCHAR(20) DEFAULT 'daily',  -- daily, weekly, monthly
    horizon_days INTEGER DEFAULT 7,

    -- Predictions
    predicted_demand DECIMAL(12, 4) NOT NULL,
    confidence_lower DECIMAL(12, 4),
    confidence_upper DECIMAL(12, 4),
    confidence_pct DECIMAL(5, 4) DEFAULT 0.95,

    -- Factors
    seasonality_index DECIMAL(8, 4),
    trend_coefficient DECIMAL(8, 4),
    event_multiplier DECIMAL(8, 4) DEFAULT 1.0,  -- Holidays, events, etc.
    weather_impact DECIMAL(8, 4) DEFAULT 0,

    -- Model info
    model_name VARCHAR(100) DEFAULT 'prophet',
    model_version VARCHAR(50),
    feature_importance JSONB,
    training_data_points INTEGER,

    -- Audit
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT unique_forecast UNIQUE (org_id, site_id, item_id, forecast_date, forecast_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_org_date ON ai_demand_forecasts(org_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_item ON ai_demand_forecasts(item_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_active ON ai_demand_forecasts(org_id, is_active, forecast_date) WHERE is_active = TRUE;

-- ============================================
-- TABLE: ai_reorder_recommendations
-- Smart reorder point and quantity suggestions
-- ============================================
CREATE TABLE IF NOT EXISTS ai_reorder_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    site_id UUID,

    item_id INTEGER NOT NULL,
    item_code VARCHAR(100),
    vendor_id INTEGER,

    -- Current state
    current_stock DECIMAL(12, 4),
    par_level DECIMAL(12, 4),
    current_reorder_point DECIMAL(12, 4),

    -- AI recommendations
    recommended_reorder_point DECIMAL(12, 4) NOT NULL,
    recommended_order_qty DECIMAL(12, 4) NOT NULL,
    recommended_safety_stock DECIMAL(12, 4),
    recommended_par_level DECIMAL(12, 4),

    -- Economic order quantity (EOQ) factors
    holding_cost_per_unit DECIMAL(10, 4),
    ordering_cost DECIMAL(10, 4),
    annual_demand DECIMAL(12, 4),
    lead_time_days DECIMAL(6, 2),
    lead_time_variability DECIMAL(6, 2),

    -- Urgency
    urgency_score DECIMAL(5, 4),  -- 0-1, higher = more urgent
    days_until_stockout INTEGER,
    stockout_probability DECIMAL(5, 4),

    -- Reasoning
    recommendation_reason TEXT,
    confidence DECIMAL(5, 4),
    factors JSONB,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, applied
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'applied'))
);

CREATE INDEX IF NOT EXISTS idx_ai_reorder_org ON ai_reorder_recommendations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_reorder_item ON ai_reorder_recommendations(item_id);
CREATE INDEX IF NOT EXISTS idx_ai_reorder_urgent ON ai_reorder_recommendations(org_id, urgency_score DESC) WHERE status = 'pending';

-- ============================================
-- TABLE: ai_consumption_patterns
-- Learned usage patterns for items
-- ============================================
CREATE TABLE IF NOT EXISTS ai_consumption_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    site_id UUID,

    item_id INTEGER NOT NULL,
    item_code VARCHAR(100),

    -- Pattern type
    pattern_type VARCHAR(50) NOT NULL,  -- daily, weekly, seasonal, event

    -- Daily patterns (indexed by day of week 0-6)
    dow_pattern DECIMAL(8, 4)[] DEFAULT ARRAY[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],

    -- Hourly patterns (indexed by hour 0-23)
    hourly_pattern DECIMAL(8, 4)[],

    -- Monthly seasonality (indexed by month 1-12)
    monthly_pattern DECIMAL(8, 4)[] DEFAULT ARRAY[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],

    -- Statistics
    avg_daily_usage DECIMAL(12, 4),
    std_daily_usage DECIMAL(12, 4),
    max_daily_usage DECIMAL(12, 4),
    min_daily_usage DECIMAL(12, 4),
    usage_trend DECIMAL(8, 4),  -- Positive = increasing

    -- Correlation
    correlated_items INTEGER[],  -- Items frequently used together
    correlation_scores DECIMAL(5, 4)[],

    -- Waste analysis
    waste_rate DECIMAL(5, 4) DEFAULT 0,
    spoilage_rate DECIMAL(5, 4) DEFAULT 0,
    overorder_rate DECIMAL(5, 4) DEFAULT 0,

    -- Model
    last_trained_at TIMESTAMPTZ,
    training_samples INTEGER,
    model_accuracy DECIMAL(5, 4),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_pattern UNIQUE (org_id, site_id, item_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_patterns_org ON ai_consumption_patterns(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_patterns_item ON ai_consumption_patterns(item_id);

-- ============================================
-- TABLE: ai_training_runs
-- Track model training executions
-- ============================================
CREATE TABLE IF NOT EXISTS ai_training_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,  -- NULL = system-wide model

    -- Training info
    model_type VARCHAR(100) NOT NULL,  -- demand_forecast, reorder_optimizer, pattern_learner
    model_name VARCHAR(100),
    model_version VARCHAR(50),

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, running, completed, failed
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Data
    training_samples INTEGER,
    validation_samples INTEGER,
    test_samples INTEGER,
    feature_columns TEXT[],

    -- Metrics
    metrics JSONB,  -- MAE, RMSE, MAPE, R2, etc.
    validation_metrics JSONB,

    -- Hyperparameters
    hyperparameters JSONB,

    -- Output
    model_artifact_path TEXT,
    model_size_bytes INTEGER,

    -- Error handling
    error_message TEXT,
    error_stack TEXT,

    -- Audit
    triggered_by VARCHAR(100),  -- cron, manual, webhook
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_org ON ai_training_runs(org_id, model_type);
CREATE INDEX IF NOT EXISTS idx_ai_training_status ON ai_training_runs(status, created_at DESC);

-- ============================================
-- TABLE: ai_prediction_actuals
-- Store actual values for prediction validation
-- ============================================
CREATE TABLE IF NOT EXISTS ai_prediction_actuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    site_id UUID,

    -- Reference
    forecast_id UUID REFERENCES ai_demand_forecasts(id) ON DELETE SET NULL,
    item_id INTEGER NOT NULL,
    item_code VARCHAR(100),
    actual_date DATE NOT NULL,

    -- Values
    actual_demand DECIMAL(12, 4) NOT NULL,
    predicted_demand DECIMAL(12, 4),

    -- Error metrics
    absolute_error DECIMAL(12, 4),
    percentage_error DECIMAL(8, 4),
    squared_error DECIMAL(16, 4),

    -- Context
    context JSONB,  -- Weather, events, promotions, etc.

    -- Audit
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_actual UNIQUE (org_id, site_id, item_id, actual_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_actuals_org ON ai_prediction_actuals(org_id, actual_date);
CREATE INDEX IF NOT EXISTS idx_ai_actuals_item ON ai_prediction_actuals(item_id, actual_date);
CREATE INDEX IF NOT EXISTS idx_ai_actuals_forecast ON ai_prediction_actuals(forecast_id);

-- ============================================
-- TABLE: ai_alerts
-- Proactive AI-generated alerts
-- ============================================
CREATE TABLE IF NOT EXISTS ai_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    site_id UUID,

    -- Alert info
    alert_type VARCHAR(100) NOT NULL,  -- stockout_risk, demand_spike, price_increase, waste_pattern
    severity VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Related entities
    item_id INTEGER,
    vendor_id INTEGER,
    reference_type VARCHAR(50),
    reference_id VARCHAR(255),

    -- AI confidence
    confidence DECIMAL(5, 4),
    model_version VARCHAR(50),

    -- Actions
    suggested_actions JSONB,
    action_taken VARCHAR(100),
    action_taken_at TIMESTAMPTZ,
    action_taken_by UUID,

    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- active, acknowledged, resolved, dismissed
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,

    -- Timing
    alert_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_org ON ai_alerts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_type ON ai_alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_active ON ai_alerts(org_id, status, alert_time DESC) WHERE status = 'active';

-- ============================================
-- FUNCTIONS: AI Engine Helpers
-- ============================================

-- Calculate MAPE for an item over a period
CREATE OR REPLACE FUNCTION calculate_item_mape(
    p_org_id UUID,
    p_item_id INTEGER,
    p_start_date DATE,
    p_end_date DATE
) RETURNS DECIMAL(8, 4) AS $$
DECLARE
    v_mape DECIMAL(8, 4);
BEGIN
    SELECT AVG(ABS(percentage_error))
    INTO v_mape
    FROM ai_prediction_actuals
    WHERE org_id = p_org_id
      AND item_id = p_item_id
      AND actual_date BETWEEN p_start_date AND p_end_date
      AND actual_demand > 0;

    RETURN COALESCE(v_mape, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Get items needing reorder
CREATE OR REPLACE FUNCTION get_items_needing_reorder(
    p_org_id UUID,
    p_site_id UUID DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 7
) RETURNS TABLE (
    item_id INTEGER,
    item_code VARCHAR(100),
    current_stock DECIMAL(12, 4),
    predicted_demand DECIMAL(12, 4),
    days_of_stock DECIMAL(8, 2),
    urgency_score DECIMAL(5, 4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ii.item_id,
        ii.item_code,
        ii.current_quantity AS current_stock,
        COALESCE(SUM(df.predicted_demand), 0) AS predicted_demand,
        CASE
            WHEN COALESCE(SUM(df.predicted_demand), 0) > 0
            THEN ii.current_quantity / (COALESCE(SUM(df.predicted_demand), 0) / p_days_ahead)
            ELSE 999
        END AS days_of_stock,
        CASE
            WHEN ii.current_quantity <= ii.reorder_point THEN 1.0
            WHEN ii.current_quantity <= ii.par_level THEN 0.7
            ELSE 0.3
        END AS urgency_score
    FROM inventory_items ii
    LEFT JOIN ai_demand_forecasts df ON df.item_id = ii.item_id
        AND df.org_id = p_org_id
        AND df.forecast_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead
        AND df.is_active = TRUE
    WHERE ii.org_id = p_org_id
      AND (p_site_id IS NULL OR ii.site_id = p_site_id)
      AND ii.is_active = 1
    GROUP BY ii.item_id, ii.item_code, ii.current_quantity, ii.reorder_point, ii.par_level
    HAVING ii.current_quantity <= ii.par_level
       OR ii.current_quantity < COALESCE(SUM(df.predicted_demand), 0)
    ORDER BY urgency_score DESC, days_of_stock ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Record migration
-- ============================================
INSERT INTO schema_migrations (filename)
VALUES ('024_ai_predictive_engine.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT 'Migration 024_ai_predictive_engine.sql completed successfully' AS result;
