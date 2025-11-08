# Demand Forecast v1 + Safety Stock & Reorder Policy
## Technical Specification

**Document Version:** 1.0
**Author:** Platform + ML Architecture Team
**Date:** 2025-10-28
**Status:** APPROVED FOR IMPLEMENTATION

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Success Metrics](#success-metrics)
4. [System Architecture](#system-architecture)
5. [Data Schema](#data-schema)
6. [ML Pipeline](#ml-pipeline)
7. [Reorder Policy Engine](#reorder-policy-engine)
8. [API Contract](#api-contract)
9. [UI Specification](#ui-specification)
10. [Failure Modes & Fallbacks](#failure-modes--fallbacks)
11. [Security & Privacy](#security--privacy)
12. [Testing Strategy](#testing-strategy)
13. [Rollout Plan](#rollout-plan)

---

## 1. Executive Summary

**Objective:** Build an automated demand forecasting system that predicts inventory needs 1-12 weeks ahead and generates optimal reorder recommendations based on ABC inventory classification and service level targets.

**Business Impact:**
- Reduce stockouts by 30-50%
- Decrease excess inventory by 20-35%
- Automate 80% of reorder decisions
- Improve cash flow through optimized working capital

**Technical Approach:**
- Multi-model ensemble (Seasonal Naive → ETS → Prophet → LightGBM)
- Rolling backtest validation with walk-forward splits
- Service-level-driven safety stock calculation
- RESTful API with FastAPI microservice architecture

---

## 2. Problem Statement

### Current State
- Manual reorder decisions based on gut feel and ad-hoc spreadsheets
- Reactive purchasing leading to frequent stockouts or overstock
- No systematic approach to safety stock levels
- Inconsistent lead time management
- Poor visibility into future demand

### Target State
- Automated weekly demand forecasts with 70%+ accuracy (MAPE < 30%)
- Data-driven reorder point recommendations
- ABC classification with differentiated service levels
- Predictive alerts for potential stockouts 2-4 weeks in advance
- Audit trail of all forecast decisions

### Scope

**In Scope:**
- Demand forecasting for existing SKUs with 12+ weeks of history
- Safety stock and reorder point calculation
- Suggested order generation (quantity and timing)
- ABC inventory classification
- Forecast API and UI integration
- Model training pipeline and monitoring

**Out of Scope (Future Phases):**
- New product forecasting (cold start)
- Promotional lift modeling
- Multi-location inventory optimization
- Supplier lead time prediction
- Dynamic pricing integration

---

## 3. Success Metrics

### Primary KPIs

| Metric | Baseline | Target (3 months) | Measurement |
|--------|----------|-------------------|-------------|
| **MAPE (Mean Absolute Percentage Error)** | N/A | < 30% overall<br>< 20% for A items | Weekly evaluation on test set |
| **PI Coverage (Prediction Interval)** | N/A | 85-95% actual within 80% PI | Empirical coverage test |
| **Stockout Reduction** | Current rate | 40% reduction | Incidents per week |
| **Excess Inventory Reduction** | Current level | 25% reduction | Week-over-week avg |
| **Forecast Adoption Rate** | 0% | 80% of orders | % of orders using system recommendations |

### Secondary KPIs

- **Model Freshness:** Training runs complete within 4 hours, weekly
- **API Latency:** p95 < 500ms for forecast requests
- **Data Completeness:** < 5% missing usage data
- **User Trust:** > 4.0/5.0 satisfaction score (quarterly survey)

### Model Performance by ABC Class

| Class | % of SKUs | % of Value | Target MAPE | Target Service Level |
|-------|-----------|------------|-------------|---------------------|
| A | 20% | 80% | < 20% | 99% |
| B | 30% | 15% | < 30% | 95% |
| C | 50% | 5% | < 40% | 90% |

---

## 4. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Inventory UI │    │ Mobile App   │    │ API Clients  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                    │              │
│         └───────────────────┴────────────────────┘              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTPS/JSON
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    API Gateway (Node.js/Express)                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Auth       │  │ Rate Limit │  │ Validation │                │
│  │ Middleware │  │ Middleware │  │ (Zod)      │                │
│  └────────────┘  └────────────┘  └────────────┘                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
┌───────────────▼────────────┐  ┌──────────▼────────────────────┐
│   Core Inventory API       │  │   ML Forecast Service         │
│   (Node.js/Express)        │  │   (FastAPI/Python)            │
│                            │  │                               │
│  ┌──────────────────────┐  │  │  ┌─────────────────────────┐ │
│  │ Inventory Management │  │  │  │ Forecast API            │ │
│  │ Orders & Fulfillment │  │  │  │ /api/forecast/v1/*      │ │
│  │ Supplier Management  │  │  │  └─────────────────────────┘ │
│  └──────────────────────┘  │  │                               │
│                            │  │  ┌─────────────────────────┐ │
│  ┌──────────────────────┐  │  │  │ Model Inference Engine  │ │
│  │ PostgreSQL/SQLite    │  │  │  │ - Ensemble Router       │ │
│  │ - Inventory Data     │  │  │  │ - Feature Engineering   │ │
│  │ - Usage History      │  │  │  │ - Prediction Cache      │ │
│  │ - Order Records      │  │  │  └─────────────────────────┘ │
│  └──────────────────────┘  │  │                               │
└────────────────────────────┘  │  ┌─────────────────────────┐ │
                                │  │ Training Pipeline       │ │
                                │  │ - Data ETL              │ │
                                │  │ - Backtesting           │ │
                                │  │ - Model Selection       │ │
                                │  │ - Model Registry        │ │
                                │  └─────────────────────────┘ │
                                │                               │
                                │  ┌─────────────────────────┐ │
                                │  │ Model Storage           │ │
                                │  │ - MLflow / Local FS     │ │
                                │  │ - Model Artifacts       │ │
                                │  │ - Metadata DB           │ │
                                │  └─────────────────────────┘ │
                                └───────────────────────────────┘
```

### Component Responsibilities

**API Gateway (Node.js/Express)**
- Authentication/authorization (JWT)
- Rate limiting per user/API key
- Request validation (Zod schemas)
- Request routing
- Response caching (Redis optional)

**Core Inventory API**
- Inventory CRUD operations
- Usage data collection and aggregation
- Supplier and vendor management
- Integration point for forecast consumption

**ML Forecast Service (FastAPI/Python)**
- RESTful forecast API
- Model inference with ensemble logic
- Feature engineering pipeline
- Prediction caching
- Model versioning and A/B testing

**Training Pipeline (Scheduled)**
- Daily/weekly batch jobs (Apache Airflow or cron)
- Data extraction and preprocessing
- Model training (ETS, Prophet, LightGBM)
- Backtesting and validation
- Model promotion to production

---

## 5. Data Schema

### 5.1 Input Data Tables

#### `inventory_items` (Existing)
```sql
CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit_cost DECIMAL(10,2),
  unit_of_measure VARCHAR(20),
  supplier_id INTEGER,
  lead_time_days INTEGER DEFAULT 7,
  min_order_quantity INTEGER DEFAULT 1,
  lot_size INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
```

#### `usage_history` (New - Core Fact Table)
```sql
CREATE TABLE usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  usage_date DATE NOT NULL,
  quantity_used DECIMAL(10,2) NOT NULL,
  quantity_wasted DECIMAL(10,2) DEFAULT 0,
  is_special_event BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, usage_date)
);

CREATE INDEX idx_usage_history_sku_date ON usage_history(sku, usage_date);
CREATE INDEX idx_usage_history_date ON usage_history(usage_date);
```

#### `order_history` (Existing - Enhanced)
```sql
CREATE TABLE order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  order_date DATE NOT NULL,
  quantity_ordered DECIMAL(10,2) NOT NULL,
  quantity_received DECIMAL(10,2),
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  supplier_id INTEGER,
  unit_cost DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'pending', -- pending, received, cancelled

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
);

CREATE INDEX idx_order_history_sku ON order_history(sku);
CREATE INDEX idx_order_history_date ON order_history(order_date);
```

#### `special_events` (New - External Regressor)
```sql
CREATE TABLE special_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date DATE NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(50), -- holiday, promotion, closure, weather
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0, -- expected demand multiplier
  applies_to_category VARCHAR(100), -- NULL means all categories
  notes TEXT,

  UNIQUE (event_date, event_name)
);

CREATE INDEX idx_special_events_date ON special_events(event_date);
```

### 5.2 ML Feature Store

#### `forecast_features` (Computed Daily)
```sql
CREATE TABLE forecast_features (
  sku VARCHAR(100) NOT NULL,
  feature_date DATE NOT NULL,

  -- Lag features (trailing usage)
  usage_lag_1w DECIMAL(10,2),
  usage_lag_2w DECIMAL(10,2),
  usage_lag_4w DECIMAL(10,2),

  -- Rolling statistics
  usage_mean_4w DECIMAL(10,2),
  usage_std_4w DECIMAL(10,2),
  usage_mean_12w DECIMAL(10,2),
  usage_std_12w DECIMAL(10,2),

  -- Trend features
  usage_trend_4w DECIMAL(10,2), -- linear regression slope
  usage_pct_change_4w DECIMAL(5,2),

  -- Seasonality indicators
  day_of_week INTEGER, -- 0=Monday, 6=Sunday
  week_of_year INTEGER,
  month INTEGER,
  is_month_end BOOLEAN,
  is_holiday BOOLEAN,

  -- Inventory state
  current_stock DECIMAL(10,2),
  days_of_supply DECIMAL(5,1),
  stockout_flag BOOLEAN,

  -- External regressors
  event_multiplier DECIMAL(5,2) DEFAULT 1.0,

  PRIMARY KEY (sku, feature_date),
  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
);

CREATE INDEX idx_forecast_features_sku ON forecast_features(sku);
CREATE INDEX idx_forecast_features_date ON forecast_features(feature_date);
```

### 5.3 Forecast Output Tables

#### `forecasts` (Model Predictions)
```sql
CREATE TABLE forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  forecast_date DATE NOT NULL, -- when forecast was generated
  prediction_date DATE NOT NULL, -- date being predicted
  horizon_weeks INTEGER NOT NULL, -- 1-12 weeks ahead

  -- Point forecast
  predicted_quantity DECIMAL(10,2) NOT NULL,

  -- Prediction intervals
  predicted_quantity_lower_80 DECIMAL(10,2),
  predicted_quantity_upper_80 DECIMAL(10,2),
  predicted_quantity_lower_95 DECIMAL(10,2),
  predicted_quantity_upper_95 DECIMAL(10,2),

  -- Model metadata
  model_name VARCHAR(50) NOT NULL, -- seasonal_naive, ets, prophet, lightgbm, ensemble
  model_version VARCHAR(50) NOT NULL,
  confidence_score DECIMAL(5,4), -- 0-1, model-specific uncertainty

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, forecast_date, prediction_date, model_name)
);

CREATE INDEX idx_forecasts_sku_pred ON forecasts(sku, prediction_date);
CREATE INDEX idx_forecasts_date ON forecasts(forecast_date);
```

#### `reorder_recommendations` (Action Items)
```sql
CREATE TABLE reorder_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) NOT NULL,
  recommendation_date DATE NOT NULL,

  -- ABC classification
  abc_class VARCHAR(1) NOT NULL, -- A, B, C
  annual_usage_value DECIMAL(12,2),

  -- Demand forecast (next 4 weeks aggregated)
  forecasted_demand_4w DECIMAL(10,2) NOT NULL,
  forecasted_demand_std DECIMAL(10,2),

  -- Safety stock calculation
  avg_demand_per_day DECIMAL(10,2) NOT NULL,
  demand_std_per_day DECIMAL(10,2) NOT NULL,
  lead_time_days INTEGER NOT NULL,
  service_level_target DECIMAL(5,4) NOT NULL, -- 0.90, 0.95, 0.99
  z_score DECIMAL(5,2) NOT NULL, -- from service level
  safety_stock DECIMAL(10,2) NOT NULL,

  -- Reorder point
  reorder_point DECIMAL(10,2) NOT NULL,
  current_stock DECIMAL(10,2) NOT NULL,
  current_on_order DECIMAL(10,2) DEFAULT 0,

  -- Recommendation
  should_reorder BOOLEAN NOT NULL,
  recommended_order_quantity DECIMAL(10,2),
  recommended_order_date DATE,
  priority VARCHAR(20), -- urgent, high, medium, low

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, ordered
  approved_by INTEGER, -- user_id
  approved_at TIMESTAMP,
  actual_order_id INTEGER,

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  UNIQUE (sku, recommendation_date)
);

CREATE INDEX idx_reorder_sku_date ON reorder_recommendations(sku, recommendation_date);
CREATE INDEX idx_reorder_status ON reorder_recommendations(status);
CREATE INDEX idx_reorder_priority ON reorder_recommendations(priority);
```

### 5.4 Model Registry

#### `model_registry` (Trained Models)
```sql
CREATE TABLE model_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name VARCHAR(50) NOT NULL, -- seasonal_naive, ets, prophet, lightgbm
  model_version VARCHAR(50) NOT NULL,

  -- Training metadata
  training_date TIMESTAMP NOT NULL,
  training_data_start DATE NOT NULL,
  training_data_end DATE NOT NULL,
  training_rows INTEGER,
  training_duration_seconds INTEGER,

  -- Performance metrics
  backtest_mape DECIMAL(8,4),
  backtest_rmse DECIMAL(12,4),
  backtest_mae DECIMAL(12,4),
  pi_coverage_80 DECIMAL(5,4),
  pi_coverage_95 DECIMAL(5,4),

  -- Model artifacts
  artifact_path VARCHAR(500), -- file path or S3 URL
  artifact_size_mb DECIMAL(10,2),

  -- Deployment
  is_production BOOLEAN DEFAULT FALSE,
  deployed_at TIMESTAMP,
  decommissioned_at TIMESTAMP,

  hyperparameters JSON, -- store as JSON text in SQLite
  feature_importance JSON,
  metadata JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (model_name, model_version)
);

CREATE INDEX idx_model_registry_prod ON model_registry(is_production, model_name);
```

### 5.5 Null Handling & Edge Cases

**Missing Usage Data:**
- If `usage_date` is missing for a date: Impute with mean of surrounding 7 days
- If > 30% of last 12 weeks is missing: Flag SKU as "insufficient history"
- Exclude from automatic reorder recommendations until data quality improves

**Negative Values:**
- `quantity_used < 0`: Log warning, set to 0
- `quantity_wasted < 0`: Set to 0
- Invalid forecasts: Clip to [0, 10x historical max]

**Special Event Handling:**
- If `is_special_event = TRUE`, exclude from trend calculation but include in model training with external regressor
- If event not in `special_events` table, use `impact_multiplier = 1.0`

**Lead Time Variations:**
- If actual lead time deviates by > 50% from expected: Update `lead_time_days` with exponential smoothing (α = 0.3)
- Recalculate safety stock quarterly based on realized lead time variance

---

## 6. ML Pipeline

### 6.1 Model Hierarchy (Progressive Enhancement)

```
Level 0: Baseline (Always Available)
  └─ Seasonal Naive: "Same as last week/year"

Level 1: Statistical Models (12+ weeks history)
  └─ ETS (Error-Trend-Seasonality)

Level 2: Prophet (52+ weeks history or strong seasonality)
  └─ Facebook Prophet with holidays + custom regressors

Level 3: Gradient Boosting (High-value A items, 104+ weeks)
  └─ LightGBM with lagged features + external regressors

Level 4: Ensemble (Production Default)
  └─ Weighted average: 20% Seasonal Naive + 30% ETS + 30% Prophet + 20% LightGBM
```

### 6.2 Training Pipeline Architecture

```python
# Pseudo-code: Training orchestrator

class ForecastTrainingPipeline:
    def __init__(self, config):
        self.config = config
        self.db = DatabaseConnection(config.db_url)
        self.model_registry = ModelRegistry()

    def run_training(self, training_date=None):
        """
        Main training loop - runs weekly via cron/Airflow
        """
        training_date = training_date or date.today()

        # Step 1: Data extraction
        print("[1/6] Extracting training data...")
        data = self.extract_training_data(
            start_date=training_date - timedelta(weeks=104),  # 2 years
            end_date=training_date - timedelta(days=7)  # 1 week lag
        )

        # Step 2: Feature engineering
        print("[2/6] Engineering features...")
        features = self.engineer_features(data)

        # Step 3: ABC classification
        print("[3/6] Running ABC analysis...")
        abc_classes = self.classify_items_abc(data, training_date)

        # Step 4: Train models per SKU
        print("[4/6] Training models...")
        models = {}
        for sku in data['sku'].unique():
            sku_data = data[data['sku'] == sku]

            # Skip if insufficient history
            if len(sku_data) < 12:
                print(f"  ⚠ Skipping {sku}: insufficient history ({len(sku_data)} weeks)")
                continue

            print(f"  Training {sku}...")
            models[sku] = self.train_sku_models(sku, sku_data, features, abc_classes)

        # Step 5: Backtesting
        print("[5/6] Running backtests...")
        backtest_results = self.run_backtest(data, models, n_splits=4)

        # Step 6: Model selection & registration
        print("[6/6] Registering models...")
        for sku, sku_models in models.items():
            best_model = self.select_best_model(sku, sku_models, backtest_results)
            self.model_registry.register(
                sku=sku,
                model=best_model,
                metrics=backtest_results[sku],
                training_date=training_date
            )

        print(f"✅ Training complete: {len(models)} SKUs trained")
        return models

    def extract_training_data(self, start_date, end_date):
        """
        Extract usage history with joins to inventory items
        """
        query = """
        SELECT
            uh.sku,
            uh.usage_date,
            uh.quantity_used,
            uh.quantity_wasted,
            uh.is_special_event,
            ii.category,
            ii.unit_cost,
            ii.lead_time_days,
            COALESCE(se.impact_multiplier, 1.0) as event_multiplier,
            se.event_type
        FROM usage_history uh
        INNER JOIN inventory_items ii ON uh.sku = ii.sku
        LEFT JOIN special_events se ON uh.usage_date = se.event_date
            AND (se.applies_to_category IS NULL OR se.applies_to_category = ii.category)
        WHERE uh.usage_date BETWEEN ? AND ?
        ORDER BY uh.sku, uh.usage_date
        """
        return pd.read_sql(query, self.db, params=[start_date, end_date])

    def engineer_features(self, data):
        """
        Create lag features, rolling stats, seasonality indicators
        """
        features = data.copy()

        # Sort by SKU and date
        features = features.sort_values(['sku', 'usage_date'])

        # Lag features (by SKU group)
        for lag in [1, 2, 4]:
            features[f'usage_lag_{lag}w'] = features.groupby('sku')['quantity_used'].shift(lag)

        # Rolling statistics (4-week and 12-week windows)
        for window in [4, 12]:
            features[f'usage_mean_{window}w'] = (
                features.groupby('sku')['quantity_used']
                .transform(lambda x: x.rolling(window, min_periods=1).mean())
            )
            features[f'usage_std_{window}w'] = (
                features.groupby('sku')['quantity_used']
                .transform(lambda x: x.rolling(window, min_periods=1).std())
            )

        # Trend: linear regression slope over last 4 weeks
        features['usage_trend_4w'] = (
            features.groupby('sku')['quantity_used']
            .transform(lambda x: self._rolling_trend(x, window=4))
        )

        # Seasonality indicators
        features['day_of_week'] = pd.to_datetime(features['usage_date']).dt.dayofweek
        features['week_of_year'] = pd.to_datetime(features['usage_date']).dt.isocalendar().week
        features['month'] = pd.to_datetime(features['usage_date']).dt.month
        features['is_month_end'] = pd.to_datetime(features['usage_date']).dt.is_month_end

        return features

    def classify_items_abc(self, data, as_of_date):
        """
        ABC analysis: A=80% value, B=15% value, C=5% value
        """
        # Calculate annual usage value per SKU
        annual_usage = (
            data.groupby('sku')
            .agg({
                'quantity_used': 'sum',
                'unit_cost': 'first'
            })
        )
        annual_usage['annual_value'] = annual_usage['quantity_used'] * annual_usage['unit_cost']
        annual_usage = annual_usage.sort_values('annual_value', ascending=False)

        # Cumulative percentage
        annual_usage['cumulative_pct'] = (
            annual_usage['annual_value'].cumsum() / annual_usage['annual_value'].sum()
        )

        # Classify
        annual_usage['abc_class'] = 'C'
        annual_usage.loc[annual_usage['cumulative_pct'] <= 0.80, 'abc_class'] = 'A'
        annual_usage.loc[
            (annual_usage['cumulative_pct'] > 0.80) & (annual_usage['cumulative_pct'] <= 0.95),
            'abc_class'
        ] = 'B'

        return annual_usage[['abc_class', 'annual_value']].to_dict('index')

    def train_sku_models(self, sku, sku_data, features, abc_classes):
        """
        Train multiple models for a single SKU
        """
        models = {}

        # Always train baseline
        models['seasonal_naive'] = self.train_seasonal_naive(sku_data)

        # ETS if 12+ weeks
        if len(sku_data) >= 12:
            models['ets'] = self.train_ets(sku_data)

        # Prophet if 52+ weeks
        if len(sku_data) >= 52:
            models['prophet'] = self.train_prophet(sku_data, features)

        # LightGBM if 104+ weeks AND A-class item
        abc_class = abc_classes.get(sku, {}).get('abc_class', 'C')
        if len(sku_data) >= 104 and abc_class == 'A':
            models['lightgbm'] = self.train_lightgbm(sku, features)

        return models

    def train_seasonal_naive(self, sku_data):
        """
        Baseline: Forecast = last week's usage (with seasonality adjustment)
        """
        return {
            'type': 'seasonal_naive',
            'last_value': sku_data['quantity_used'].iloc[-1],
            'seasonal_period': 52,  # weekly data, annual seasonality
            'history': sku_data['quantity_used'].tail(52).values
        }

    def train_ets(self, sku_data):
        """
        Exponential Smoothing (statsmodels)
        """
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        # Determine seasonality
        seasonal_period = 52 if len(sku_data) >= 104 else None

        model = ExponentialSmoothing(
            sku_data['quantity_used'],
            trend='add',
            seasonal='add' if seasonal_period else None,
            seasonal_periods=seasonal_period
        ).fit()

        return {
            'type': 'ets',
            'model': model,
            'params': model.params
        }

    def train_prophet(self, sku_data, features):
        """
        Facebook Prophet with custom regressors
        """
        from prophet import Prophet

        # Prepare data in Prophet format
        df = pd.DataFrame({
            'ds': pd.to_datetime(sku_data['usage_date']),
            'y': sku_data['quantity_used']
        })

        # Add regressors
        sku_features = features[features['sku'] == sku_data['sku'].iloc[0]]
        df['event_multiplier'] = sku_features['event_multiplier'].values
        df['is_special_event'] = sku_features['is_special_event'].astype(int).values

        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            changepoint_prior_scale=0.05
        )
        model.add_regressor('event_multiplier')
        model.add_regressor('is_special_event')

        model.fit(df)

        return {
            'type': 'prophet',
            'model': model
        }

    def train_lightgbm(self, sku, features):
        """
        LightGBM with engineered features
        """
        import lightgbm as lgb

        sku_features = features[features['sku'] == sku].copy()

        # Target: next week's usage
        sku_features['target'] = sku_features['quantity_used'].shift(-1)
        sku_features = sku_features.dropna(subset=['target'])

        # Feature columns
        feature_cols = [
            'usage_lag_1w', 'usage_lag_2w', 'usage_lag_4w',
            'usage_mean_4w', 'usage_std_4w', 'usage_mean_12w', 'usage_std_12w',
            'usage_trend_4w', 'day_of_week', 'week_of_year', 'month',
            'is_month_end', 'event_multiplier'
        ]

        X = sku_features[feature_cols]
        y = sku_features['target']

        # Train/validation split (last 20% as validation)
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        model = lgb.LGBMRegressor(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            num_leaves=31,
            min_child_samples=20,
            random_state=42
        )

        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(10), lgb.log_evaluation(0)]
        )

        return {
            'type': 'lightgbm',
            'model': model,
            'feature_cols': feature_cols,
            'feature_importance': dict(zip(feature_cols, model.feature_importances_))
        }

    def run_backtest(self, data, models, n_splits=4):
        """
        Walk-forward backtesting with expanding window
        """
        results = {}

        for sku, sku_models in models.items():
            sku_data = data[data['sku'] == sku].sort_values('usage_date')

            # Create time-series splits
            splits = self._create_ts_splits(sku_data, n_splits)

            errors = {model_name: [] for model_name in sku_models.keys()}

            for train_data, test_data in splits:
                for model_name, model_def in sku_models.items():
                    # Make predictions
                    predictions = self._predict_with_model(model_def, test_data)
                    actuals = test_data['quantity_used'].values

                    # Calculate MAPE
                    mape = np.mean(np.abs((actuals - predictions) / (actuals + 1e-6))) * 100
                    errors[model_name].append(mape)

            # Average errors across splits
            results[sku] = {
                model_name: {
                    'mape': np.mean(error_list),
                    'mape_std': np.std(error_list)
                }
                for model_name, error_list in errors.items()
            }

        return results

    def select_best_model(self, sku, sku_models, backtest_results):
        """
        Select model with lowest MAPE from backtest
        """
        sku_results = backtest_results[sku]
        best_model_name = min(sku_results.keys(), key=lambda k: sku_results[k]['mape'])

        return {
            'sku': sku,
            'model_name': best_model_name,
            'model': sku_models[best_model_name],
            'mape': sku_results[best_model_name]['mape'],
            'version': f"v{datetime.now().strftime('%Y%m%d')}"
        }
```

### 6.3 Inference Engine

```python
class ForecastInferenceEngine:
    def __init__(self, model_registry):
        self.model_registry = model_registry
        self.cache = {}  # Simple in-memory cache

    def generate_forecast(self, sku, horizon_weeks=4, as_of_date=None):
        """
        Generate forecast for a single SKU

        Args:
            sku: SKU identifier
            horizon_weeks: Number of weeks to forecast (1-12)
            as_of_date: Date to forecast from (default: today)

        Returns:
            dict with point forecast, prediction intervals, metadata
        """
        as_of_date = as_of_date or date.today()

        # Check cache (TTL: 24 hours)
        cache_key = f"{sku}_{as_of_date}_{horizon_weeks}"
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            if (datetime.now() - cached['timestamp']).seconds < 86400:
                return cached['forecast']

        # Load production model
        model_def = self.model_registry.get_production_model(sku)

        if not model_def:
            # Fallback to seasonal naive
            model_def = self._create_fallback_model(sku)

        # Generate forecast
        if model_def['type'] == 'ensemble':
            forecast = self._forecast_ensemble(sku, model_def, horizon_weeks, as_of_date)
        else:
            forecast = self._forecast_single_model(sku, model_def, horizon_weeks, as_of_date)

        # Add metadata
        forecast['sku'] = sku
        forecast['forecast_date'] = as_of_date
        forecast['horizon_weeks'] = horizon_weeks
        forecast['model_name'] = model_def['model_name']
        forecast['model_version'] = model_def['version']

        # Cache result
        self.cache[cache_key] = {
            'forecast': forecast,
            'timestamp': datetime.now()
        }

        return forecast

    def _forecast_ensemble(self, sku, model_def, horizon_weeks, as_of_date):
        """
        Ensemble forecast: weighted average of multiple models
        """
        models = model_def['models']
        weights = model_def['weights']

        forecasts = []
        for model_name, model in models.items():
            f = self._forecast_single_model(sku, model, horizon_weeks, as_of_date)
            forecasts.append((weights[model_name], f))

        # Weighted average of point forecasts
        point_forecast = sum(w * f['point_forecast'] for w, f in forecasts)

        # Conservative PI: use widest intervals
        lower_80 = min(f['prediction_interval_80'][0] for _, f in forecasts)
        upper_80 = max(f['prediction_interval_80'][1] for _, f in forecasts)
        lower_95 = min(f['prediction_interval_95'][0] for _, f in forecasts)
        upper_95 = max(f['prediction_interval_95'][1] for _, f in forecasts)

        return {
            'point_forecast': point_forecast,
            'prediction_interval_80': (lower_80, upper_80),
            'prediction_interval_95': (lower_95, upper_95),
            'confidence_score': np.mean([f['confidence_score'] for _, f in forecasts])
        }
```

---

## 7. Reorder Policy Engine

### 7.1 Safety Stock Calculation

**Formula:**
```
Safety Stock = Z × σ_LT

Where:
  Z = Z-score for desired service level
  σ_LT = Standard deviation of demand during lead time

  σ_LT = √(L × σ_d² + d̄² × σ_L²)

  L = Average lead time (days)
  σ_d = Standard deviation of daily demand
  d̄ = Average daily demand
  σ_L = Standard deviation of lead time (assume 0 if unknown)
```

**Service Level Targets by ABC Class:**

| ABC Class | Service Level | Z-Score |
|-----------|---------------|---------|
| A | 99% | 2.33 |
| B | 95% | 1.65 |
| C | 90% | 1.28 |

### 7.2 Reorder Point (ROP)

```
ROP = (Average Daily Demand × Lead Time Days) + Safety Stock

If Current Stock + On Order < ROP:
    Recommended Order Quantity = (Target Stock Level - Current Stock - On Order)

Target Stock Level = (Average Daily Demand × Review Period) + Safety Stock
Review Period = 28 days (4 weeks) default
```

### 7.3 Lot Sizing

**Economic Order Quantity (EOQ) - Optional Enhancement:**
```
EOQ = √((2 × D × S) / H)

Where:
  D = Annual demand
  S = Ordering cost per order
  H = Holding cost per unit per year

For MVP: Use supplier minimum order quantity (MOQ) or round to case pack size
```

### 7.4 Pseudo-Code

```python
class ReorderPolicyEngine:
    def calculate_reorder_recommendation(self, sku, forecast, current_inventory, abc_class):
        """
        Calculate reorder recommendation based on forecast and policy

        Args:
            sku: SKU identifier
            forecast: Forecast object with point forecast and intervals
            current_inventory: Current stock on hand
            abc_class: 'A', 'B', or 'C'

        Returns:
            dict with reorder recommendation
        """
        # Get item details
        item = self.db.get_inventory_item(sku)
        lead_time_days = item['lead_time_days']
        min_order_qty = item['min_order_quantity']
        lot_size = item['lot_size']

        # Service level targets
        service_levels = {'A': 0.99, 'B': 0.95, 'C': 0.90}
        z_scores = {'A': 2.33, 'B': 1.65, 'C': 1.28}

        service_level = service_levels[abc_class]
        z_score = z_scores[abc_class]

        # Calculate average daily demand from 4-week forecast
        forecasted_demand_4w = forecast['point_forecast']  # total for 4 weeks
        avg_daily_demand = forecasted_demand_4w / 28

        # Standard deviation of daily demand (from forecast interval)
        # Conservative estimate: use 80% PI width as ~2.56 std devs
        pi_width = forecast['prediction_interval_80'][1] - forecast['prediction_interval_80'][0]
        std_daily_demand = (pi_width / 28) / 2.56

        # Safety stock calculation
        # Assume lead time is fixed (σ_L = 0) for MVP
        sigma_lt = np.sqrt(lead_time_days * std_daily_demand**2)
        safety_stock = z_score * sigma_lt

        # Reorder point
        reorder_point = (avg_daily_demand * lead_time_days) + safety_stock

        # Current stock position
        current_on_order = self.db.get_pending_orders_quantity(sku)
        stock_position = current_inventory + current_on_order

        # Should reorder?
        should_reorder = stock_position < reorder_point

        # Recommended order quantity
        if should_reorder:
            # Target stock level = 4 weeks demand + safety stock
            target_stock = forecasted_demand_4w + safety_stock
            order_quantity = max(target_stock - stock_position, 0)

            # Round up to lot size
            order_quantity = np.ceil(order_quantity / lot_size) * lot_size

            # Enforce minimum order quantity
            order_quantity = max(order_quantity, min_order_qty)
        else:
            order_quantity = 0

        # Priority level
        days_until_stockout = (stock_position - safety_stock) / (avg_daily_demand + 1e-6)
        if days_until_stockout < lead_time_days:
            priority = 'urgent'
        elif days_until_stockout < lead_time_days * 1.5:
            priority = 'high'
        elif should_reorder:
            priority = 'medium'
        else:
            priority = 'low'

        return {
            'sku': sku,
            'abc_class': abc_class,
            'forecasted_demand_4w': round(forecasted_demand_4w, 2),
            'avg_daily_demand': round(avg_daily_demand, 2),
            'std_daily_demand': round(std_daily_demand, 2),
            'lead_time_days': lead_time_days,
            'service_level': service_level,
            'z_score': z_score,
            'safety_stock': round(safety_stock, 2),
            'reorder_point': round(reorder_point, 2),
            'current_stock': current_inventory,
            'current_on_order': current_on_order,
            'stock_position': stock_position,
            'should_reorder': should_reorder,
            'recommended_order_quantity': round(order_quantity, 2),
            'priority': priority,
            'days_until_stockout': round(days_until_stockout, 1)
        }
```

---

## 8. API Contract

### 8.1 Base URL

```
Production: https://api.neuropilot.com/v1
Development: http://localhost:8000/v1
```

### 8.2 Authentication

All requests require JWT token:
```
Authorization: Bearer <JWT_TOKEN>
```

### 8.3 Endpoints

#### `POST /api/forecast/v1/generate`

Generate forecast for one or more SKUs.

**Request:**
```json
{
  "skus": ["SKU-001", "SKU-002"],
  "horizon_weeks": 4,
  "include_reorder_recommendation": true,
  "as_of_date": "2025-10-28"  // optional, defaults to today
}
```

**Response:**
```json
{
  "request_id": "req_abc123",
  "generated_at": "2025-10-28T14:32:10Z",
  "forecasts": [
    {
      "sku": "SKU-001",
      "sku_name": "Premium Olive Oil 1L",
      "category": "Oils & Vinegars",
      "forecast_date": "2025-10-28",
      "horizon_weeks": 4,

      "forecast": {
        "point_forecast": 45.5,
        "prediction_interval_80": {
          "lower": 38.2,
          "upper": 52.8
        },
        "prediction_interval_95": {
          "lower": 33.1,
          "upper": 57.9
        },
        "confidence_score": 0.87,
        "by_week": [
          {"week": 1, "forecast": 11.2},
          {"week": 2, "forecast": 11.8},
          {"week": 3, "forecast": 11.0},
          {"week": 4, "forecast": 11.5}
        ]
      },

      "model": {
        "name": "ensemble",
        "version": "v20251028",
        "components": ["seasonal_naive", "ets", "prophet"],
        "weights": [0.2, 0.4, 0.4]
      },

      "reorder_recommendation": {
        "abc_class": "A",
        "should_reorder": true,
        "recommended_order_quantity": 48.0,
        "recommended_order_date": "2025-11-01",
        "priority": "medium",

        "details": {
          "current_stock": 15.0,
          "current_on_order": 0.0,
          "safety_stock": 8.5,
          "reorder_point": 23.2,
          "lead_time_days": 7,
          "service_level_target": 0.99,
          "days_until_stockout": 12.3
        }
      }
    }
  ],
  "errors": [
    {
      "sku": "SKU-002",
      "error": "Insufficient history: only 8 weeks available, need 12+",
      "fallback": "manual_review_required"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing or invalid JWT
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

#### `GET /api/forecast/v1/recommendations`

Get all pending reorder recommendations.

**Query Parameters:**
- `priority` (optional): Filter by priority (urgent, high, medium, low)
- `abc_class` (optional): Filter by ABC class (A, B, C)
- `status` (optional): Filter by status (pending, approved, rejected)
- `page` (default: 1): Page number
- `per_page` (default: 50, max: 100): Items per page

**Response:**
```json
{
  "recommendations": [
    {
      "id": 123,
      "sku": "SKU-001",
      "sku_name": "Premium Olive Oil 1L",
      "recommendation_date": "2025-10-28",
      "abc_class": "A",
      "priority": "medium",
      "should_reorder": true,
      "recommended_order_quantity": 48.0,
      "recommended_order_date": "2025-11-01",
      "current_stock": 15.0,
      "days_until_stockout": 12.3,
      "status": "pending",
      "forecasted_demand_4w": 45.5
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total_items": 127,
    "total_pages": 3
  }
}
```

---

#### `POST /api/forecast/v1/recommendations/:id/approve`

Approve a reorder recommendation and optionally create order.

**Request:**
```json
{
  "approved_quantity": 48.0,  // can adjust from recommendation
  "create_order": true,
  "notes": "Approved for immediate order"
}
```

**Response:**
```json
{
  "recommendation_id": 123,
  "status": "approved",
  "approved_at": "2025-10-28T15:00:00Z",
  "approved_by": 42,
  "order_created": true,
  "order_id": 789
}
```

---

#### `GET /api/forecast/v1/history/:sku`

Get forecast history and actuals for a SKU (for UI charting).

**Query Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD

**Response:**
```json
{
  "sku": "SKU-001",
  "start_date": "2025-09-01",
  "end_date": "2025-10-28",
  "data": [
    {
      "date": "2025-09-01",
      "actual_usage": 10.5,
      "forecast": 11.2,
      "forecast_lower_80": 9.1,
      "forecast_upper_80": 13.3,
      "error_pct": 6.7
    }
  ],
  "summary": {
    "mape": 18.5,
    "rmse": 2.3,
    "bias": -0.5,  // negative = under-forecasting
    "forecast_accuracy": 81.5
  }
}
```

---

#### `POST /api/forecast/v1/retrain`

Trigger model retraining (admin only).

**Request:**
```json
{
  "skus": ["SKU-001"],  // optional, empty = all SKUs
  "force": false  // skip cache checks
}
```

**Response:**
```json
{
  "training_job_id": "job_abc123",
  "status": "queued",
  "estimated_duration_minutes": 45,
  "skus_queued": 156
}
```

---

## 9. UI Specification

### 9.1 Suggested Orders Screen

**Location:** Main Dashboard → Inventory → Suggested Orders

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Suggested Orders                                    [Refresh]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Filters:  [Priority: All ▼]  [ABC: All ▼]  [Status: Pending ▼] │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Summary Cards                                              │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │ │
│  │  │   Urgent    │  │    High     │  │   Medium    │       │ │
│  │  │     12      │  │     28      │  │     47      │       │ │
│  │  │   Items     │  │   Items     │  │   Items     │       │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Recommendations Table                                      │ │
│  ├─────┬───────────────┬──────┬────────┬─────────┬──────────┤ │
│  │ Pri │ Item          │ ABC  │ Stock  │ Order   │ Actions  │ │
│  ├─────┼───────────────┼──────┼────────┼─────────┼──────────┤ │
│  │ 🔴  │ Olive Oil 1L  │  A   │ 15 / 48│   48    │ [Approve]│ │
│  │     │ Days: 12.3    │      │ Need   │ units   │ [Adjust] │ │
│  ├─────┼───────────────┼──────┼────────┼─────────┼──────────┤ │
│  │ 🟠  │ Tomato Paste  │  A   │  8 / 35│   36    │ [Approve]│ │
│  │     │ Days: 8.5     │      │ Need   │ units   │ [Adjust] │ │
│  ├─────┼───────────────┼──────┼────────┼─────────┼──────────┤ │
│  │ 🟡  │ Garlic Powder │  B   │ 22 / 18│    0    │  --      │ │
│  │     │ Days: 28.1    │      │ OK     │         │          │ │
│  └─────┴───────────────┴──────┴────────┴─────────┴──────────┘ │
│                                                                   │
│  [◀ Prev]  Page 1 of 3  [Next ▶]                                │
└──────────────────────────────────────────────────────────────────┘
```

**Interactive Elements:**

1. **Approve Button:**
   - Single click: Approve with recommended quantity
   - Creates draft order in system
   - Shows confirmation toast
   - Moves item to "Approved" status

2. **Adjust Button:**
   - Opens modal with:
     - Forecast chart (last 12 weeks + next 4 weeks)
     - Editable order quantity input
     - Safety stock calculation breakdown
     - Notes field
   - Save creates adjusted order

3. **Row Click:**
   - Expands row to show:
     - 4-week forecast by week
     - Current stock level trend (sparkline)
     - Last order date and quantity
     - Supplier info and lead time

4. **Bulk Actions:**
   - Select multiple items (checkbox)
   - Bulk approve, bulk adjust, bulk export to CSV

### 9.2 Item Detail - Forecast Tab

**Location:** Inventory → Item Detail → Forecast Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  Premium Olive Oil 1L (SKU-001)                   ABC: A         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Forecast Model: Ensemble (ETS 40% + Prophet 40% + Naive 20%)   │
│  Last Updated: Oct 28, 2025 2:30 PM                              │
│  Accuracy (12 weeks): MAPE 18.5% | Bias -0.5 units/week         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Usage & Forecast Chart                                    │ │
│  │  60│                                                        │ │
│  │    │     Historical ──────┐  ┌──── Forecast               │ │
│  │  50│                      │  │     (80% PI)               │ │
│  │    │                      │  │                             │ │
│  │  40│  ●──●──●    ●──●   ●│  │ ○ ─ ○ ─ ○ ─ ○               │ │
│  │    │           ●  ●   ●   │  │                             │ │
│  │  30│        ●              │  │                             │ │
│  │    │                      │  │                             │ │
│  │  20│  ●                    │  │                             │ │
│  │    │                      │  │                             │ │
│  │  10│                       │  │                             │ │
│  │    └──┴──┴──┴──┴──┴──┴──┴─┴──┴──┴──┴──┴──                │ │
│  │     Sep  Sep  Oct  Oct  Oct│ Nov Nov Nov Nov              │ │
│  │      1   15   1   15   28 │  4  11  18  25               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────┬──────────────────────────────────────┐ │
│  │ Reorder Parameters  │  Next 4 Weeks Forecast              │ │
│  ├─────────────────────┼──────────────────────────────────────┤ │
│  │ Safety Stock: 8.5   │  Week 1 (Nov 4):  11.2 units       │ │
│  │ Reorder Point: 23.2 │  Week 2 (Nov 11): 11.8 units       │ │
│  │ Lead Time: 7 days   │  Week 3 (Nov 18): 11.0 units       │ │
│  │ Service Level: 99%  │  Week 4 (Nov 25): 11.5 units       │ │
│  │                     │  ────────────────────────────        │ │
│  │ Current Stock: 15   │  Total 4 Weeks:   45.5 units       │ │
│  │ On Order: 0         │  Confidence: 87%                    │ │
│  └─────────────────────┴──────────────────────────────────────┘ │
│                                                                   │
│  [Create Manual Order]  [Adjust Forecast Parameters]            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. Failure Modes & Fallbacks

### 10.1 Data Quality Issues

| Issue | Detection | Fallback | User Alert |
|-------|-----------|----------|------------|
| Missing usage data (> 30% of 12w) | Data validation in ETL | Skip SKU, flag for manual review | Dashboard warning badge |
| Negative usage values | Input validation | Clip to 0, log warning | Email to admin weekly digest |
| Duplicate date entries | Unique constraint violation | Keep latest, discard older | Silent fix + log entry |
| Extreme outliers (> 10x median) | Statistical outlier detection | Winsorize to 95th percentile | Flag in UI with "⚠ Adjusted" |

### 10.2 Model Failures

| Failure | Detection | Fallback | Recovery |
|---------|-----------|----------|----------|
| Model training timeout | Job timeout (4 hours) | Use last known good model | Retry next schedule + alert |
| Prediction NaN/Inf | Post-prediction validation | Seasonal naive baseline | Log error + use fallback |
| MAPE > 100% | Backtest validation | Exclude from auto-reorder | Flag for data investigation |
| Model artifact corrupted | Load failure | Re-train from scratch | Alert + emergency retrain |

### 10.3 External Dependencies

| Dependency | Failure Mode | Fallback | SLA Impact |
|------------|--------------|----------|------------|
| Database down | Connection timeout | Retry 3x with exponential backoff | Alert if > 5 min downtime |
| ML service unavailable | HTTP 503 | Serve cached predictions (24h TTL) | Degraded mode notice |
| Feature store stale | Last update > 48h | Use last available features | Warning in API response |
| Vendor holiday calendar missing | Event not in special_events table | Assume no event (multiplier = 1.0) | No alert (graceful degradation) |

### 10.4 Drift Detection

**Concept Drift:** When usage patterns change (e.g., menu change, new customer segment)

**Detection Method:**
- Monitor 4-week rolling MAPE
- If MAPE increases > 50% relative to baseline: Trigger alert
- If MAPE > 50% absolute: Flag for retraining

**Response:**
- Auto-retrain models weekly
- Dashboard shows "Model Performance Degraded" warning
- Option to force immediate retrain

**Seasonal Drift:** Annual seasonality changes

**Detection:**
- Year-over-year comparison of usage patterns
- If current year deviates > 20% from prior year: Adjust seasonality weights

---

## 11. Security & Privacy

### 11.1 Data Privacy

**PII Handling:**
- No PII stored in forecast data tables
- User IDs are integers (foreign keys to user table)
- Audit logs contain user_id, not email/name
- Forecast API responses contain no user information

**Data Retention:**
- Raw usage history: Retain indefinitely (business-critical)
- Forecast predictions: Retain 2 years for analysis
- Model artifacts: Retain last 5 versions per SKU
- Audit logs: Retain 7 years (compliance)

### 11.2 Authentication & Authorization

**JWT Authentication:**
- All API endpoints require valid JWT
- Token expiration: 1 hour (refresh token: 30 days)
- Token contains: user_id, role, permissions

**Authorization Levels:**

| Role | Permissions |
|------|-------------|
| admin | Full access: view forecasts, approve orders, trigger retraining, view all SKUs |
| manager | View forecasts, approve orders, view all SKUs |
| staff | View forecasts, adjust (not approve) orders, view assigned categories only |
| readonly | View forecasts only, no actions |

**Endpoint Authorization:**
- `POST /forecast/v1/generate`: Requires role: staff+
- `POST /forecast/v1/recommendations/:id/approve`: Requires role: manager+
- `POST /forecast/v1/retrain`: Requires role: admin
- `GET /forecast/v1/*`: Requires role: readonly+

### 11.3 Rate Limiting

**Per-User Limits:**
- Forecast generation: 100 requests/hour per user
- Recommendations list: 500 requests/hour per user
- Retrain endpoint: 5 requests/day per admin

**Per-IP Limits (unauthenticated):**
- 10 requests/minute across all endpoints
- Block IP if > 100 failed auth attempts in 1 hour

**Implementation:** Redis-backed rate limiter with sliding window

### 11.4 Input Validation

**Zod Schemas (Node.js):**

```typescript
import { z } from 'zod';

export const ForecastRequestSchema = z.object({
  skus: z.array(z.string().regex(/^[A-Z0-9\-]{3,50}$/)).min(1).max(100),
  horizon_weeks: z.number().int().min(1).max(12).default(4),
  include_reorder_recommendation: z.boolean().default(true),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const ApproveRecommendationSchema = z.object({
  approved_quantity: z.number().positive().max(1000000),
  create_order: z.boolean().default(true),
  notes: z.string().max(1000).optional()
});
```

**Python Pydantic (FastAPI):**

```python
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import date

class ForecastRequest(BaseModel):
    skus: List[str] = Field(..., min_items=1, max_items=100)
    horizon_weeks: int = Field(4, ge=1, le=12)
    include_reorder_recommendation: bool = True
    as_of_date: Optional[date] = None

    @validator('skus', each_item=True)
    def validate_sku(cls, v):
        if not re.match(r'^[A-Z0-9\-]{3,50}$', v):
            raise ValueError('Invalid SKU format')
        return v
```

### 11.5 Audit Trail

**Audit Log Schema:**

```sql
CREATE TABLE forecast_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL, -- forecast_generated, recommendation_approved, model_retrained
  resource_type VARCHAR(50), -- sku, model, recommendation
  resource_id VARCHAR(100),

  -- Request/response payload (sanitized)
  request_payload JSON,
  response_status INTEGER,

  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Hash chain for tamper detection
  previous_hash VARCHAR(64),
  current_hash VARCHAR(64) -- SHA256(id || timestamp || action || previous_hash)
);

CREATE INDEX idx_audit_log_user ON forecast_audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON forecast_audit_log(timestamp);
CREATE INDEX idx_audit_log_action ON forecast_audit_log(action);
```

**Hash Chain Verification Tool:**

```python
def verify_audit_chain(db_connection):
    """
    Verify integrity of audit log hash chain
    """
    logs = db_connection.execute("""
        SELECT id, timestamp, action, previous_hash, current_hash
        FROM forecast_audit_log
        ORDER BY id
    """).fetchall()

    for i, log in enumerate(logs):
        if i == 0:
            # First entry
            expected_hash = hashlib.sha256(
                f"{log['id']}{log['timestamp']}{log['action']}".encode()
            ).hexdigest()
        else:
            prev_hash = logs[i-1]['current_hash']
            expected_hash = hashlib.sha256(
                f"{log['id']}{log['timestamp']}{log['action']}{prev_hash}".encode()
            ).hexdigest()

        if log['current_hash'] != expected_hash:
            return False, f"Hash chain broken at record {log['id']}"

    return True, "Audit log integrity verified"
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

**Coverage Target:** 90%+ for core logic

**Python (ML Pipeline):**
```python
# tests/test_forecast_engine.py
import pytest
from forecast.engine import ForecastInferenceEngine

def test_seasonal_naive_forecast():
    # Arrange
    historical_data = [10, 12, 11, 13, 12, 14, 13, 15]

    # Act
    forecast = seasonal_naive_forecast(historical_data, horizon=4)

    # Assert
    assert len(forecast) == 4
    assert all(f > 0 for f in forecast)
    assert forecast[0] == pytest.approx(historical_data[-1], rel=0.1)

def test_safety_stock_calculation():
    # Arrange
    avg_daily_demand = 10
    std_daily_demand = 2
    lead_time_days = 7
    z_score = 1.65  # 95% service level

    # Act
    safety_stock = calculate_safety_stock(
        avg_daily_demand, std_daily_demand, lead_time_days, z_score
    )

    # Assert
    expected = 1.65 * (7 ** 0.5) * 2
    assert safety_stock == pytest.approx(expected, rel=0.01)

def test_reorder_recommendation_urgent_priority():
    # Arrange
    current_stock = 5
    reorder_point = 20
    avg_daily_demand = 3
    lead_time_days = 7

    # Act
    recommendation = calculate_reorder_recommendation(
        current_stock=current_stock,
        reorder_point=reorder_point,
        avg_daily_demand=avg_daily_demand,
        lead_time_days=lead_time_days
    )

    # Assert
    assert recommendation['should_reorder'] == True
    assert recommendation['priority'] == 'urgent'
    days_until_stockout = current_stock / avg_daily_demand
    assert days_until_stockout < lead_time_days
```

**Node.js (API Layer):**
```javascript
// tests/forecast-api.test.js
const request = require('supertest');
const app = require('../src/app');

describe('POST /api/forecast/v1/generate', () => {
  it('should generate forecast for valid SKU', async () => {
    const response = await request(app)
      .post('/api/forecast/v1/generate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        skus: ['SKU-001'],
        horizon_weeks: 4
      });

    expect(response.status).toBe(200);
    expect(response.body.forecasts).toHaveLength(1);
    expect(response.body.forecasts[0].sku).toBe('SKU-001');
    expect(response.body.forecasts[0].forecast.point_forecast).toBeGreaterThan(0);
  });

  it('should reject invalid SKU format', async () => {
    const response = await request(app)
      .post('/api/forecast/v1/generate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        skus: ['invalid sku!'],
        horizon_weeks: 4
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid SKU format');
  });

  it('should enforce rate limit', async () => {
    // Make 101 requests rapidly
    const requests = Array(101).fill().map(() =>
      request(app)
        .post('/api/forecast/v1/generate')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ skus: ['SKU-001'], horizon_weeks: 4 })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

### 12.2 Integration Tests

**Database Integration:**
```python
# tests/integration/test_full_pipeline.py
import pytest
from datetime import date, timedelta

@pytest.mark.integration
def test_end_to_end_forecast_generation(test_db):
    # Arrange: Seed test database with 52 weeks of usage data
    sku = 'TEST-SKU-001'
    for i in range(52):
        usage_date = date.today() - timedelta(weeks=52-i)
        quantity = 10 + (i % 4)  # Simple pattern
        test_db.insert_usage(sku, usage_date, quantity)

    # Act: Run full pipeline
    pipeline = ForecastTrainingPipeline(test_db)
    models = pipeline.run_training()

    # Assert: Model trained successfully
    assert sku in models
    assert models[sku]['model_name'] in ['ets', 'prophet']
    assert models[sku]['mape'] < 50  # Reasonable accuracy

    # Act: Generate forecast
    inference_engine = ForecastInferenceEngine(pipeline.model_registry)
    forecast = inference_engine.generate_forecast(sku, horizon_weeks=4)

    # Assert: Forecast looks reasonable
    assert forecast['point_forecast'] > 0
    assert forecast['point_forecast'] < 100
    assert forecast['prediction_interval_80'][0] < forecast['point_forecast']
    assert forecast['prediction_interval_80'][1] > forecast['point_forecast']
```

### 12.3 Backtest Validation

**Walk-Forward Backtesting:**

```python
def backtest_forecast_accuracy(sku, start_date, end_date, horizon_weeks=4):
    """
    Walk-forward backtest:
    - Train on data up to t
    - Predict t+1 to t+horizon
    - Compare to actuals
    - Step forward 1 week, repeat
    """
    results = []
    current_date = start_date

    while current_date < end_date - timedelta(weeks=horizon_weeks):
        # Train on data up to current_date
        train_data = get_usage_data(sku, end_date=current_date)

        if len(train_data) < 12:
            current_date += timedelta(weeks=1)
            continue

        # Train model
        model = train_forecast_model(train_data)

        # Generate forecast
        forecast = model.predict(horizon_weeks)

        # Get actuals
        actual_dates = [current_date + timedelta(weeks=i+1) for i in range(horizon_weeks)]
        actuals = get_usage_data(sku, dates=actual_dates)

        # Calculate errors
        mape = mean_absolute_percentage_error(actuals, forecast)
        mae = mean_absolute_error(actuals, forecast)

        results.append({
            'forecast_date': current_date,
            'mape': mape,
            'mae': mae,
            'forecast': forecast,
            'actuals': actuals
        })

        current_date += timedelta(weeks=1)

    return pd.DataFrame(results)

# Acceptance criteria
backtest_results = backtest_forecast_accuracy('SKU-001', start_date, end_date)
avg_mape = backtest_results['mape'].mean()

assert avg_mape < 30, f"MAPE {avg_mape:.2f}% exceeds 30% threshold"
```

**Backtest Gates (CI/CD):**

```yaml
# .github/workflows/ml-validation.yml
name: ML Model Validation

on:
  pull_request:
    paths:
      - 'ml/**'
      - 'tests/backtest/**'

jobs:
  backtest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run backtests
        run: |
          python -m pytest tests/backtest/ --junitxml=backtest-results.xml

      - name: Check MAPE threshold
        run: |
          python scripts/check_backtest_results.py \
            --results backtest-results.xml \
            --mape-threshold 30 \
            --min-coverage-80 0.85

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: backtest-results
          path: backtest-results.xml
```

### 12.4 Load Testing (k6)

```javascript
// tests/load/forecast-api-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 users
    { duration: '3m', target: 50 },   // Ramp to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const JWT_TOKEN = __ENV.JWT_TOKEN;

export default function () {
  const skus = ['SKU-001', 'SKU-002', 'SKU-003'];
  const randomSku = skus[Math.floor(Math.random() * skus.length)];

  const payload = JSON.stringify({
    skus: [randomSku],
    horizon_weeks: 4,
    include_reorder_recommendation: true
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/forecast/v1/generate`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has forecast': (r) => JSON.parse(r.body).forecasts.length > 0,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Run Load Test:**
```bash
k6 run tests/load/forecast-api-load.js \
  --env BASE_URL=https://api.neuropilot.com/v1 \
  --env JWT_TOKEN=$PROD_TEST_TOKEN
```

---

## 13. Rollout Plan

### 13.1 Phase 0: Shadow Mode (Week 1-2)

**Objective:** Generate forecasts in background, no user-facing changes

**Actions:**
- Deploy ML service to production
- Run forecast generation daily for all SKUs
- Store results in database
- NO UI changes
- Monitor model performance, latency, errors

**Success Criteria:**
- Training pipeline completes successfully 7 consecutive days
- Inference API p95 latency < 500ms
- Zero critical errors
- MAPE < 30% on backtest

**Rollback:** Delete forecasts table, decommission ML service

---

### 13.2 Phase 1: Read-Only UI (Week 3-4)

**Objective:** Show forecasts to users, no action buttons

**Actions:**
- Add "Forecast" tab to item detail page
- Show historical accuracy metrics
- Display 4-week forecast chart
- Add "Suggested Orders" page (read-only, no approve buttons)

**User Feedback:**
- In-app survey: "Is this forecast useful? Too high / Too low / Just right"
- Weekly stakeholder review meeting

**Success Criteria:**
- > 80% users access Forecast tab at least once
- User satisfaction score > 3.5/5
- Feedback indicates trust in forecasts

**Rollback:** Hide Forecast tab via feature flag

---

### 13.3 Phase 2: A/B Test with Approval (Week 5-8)

**Objective:** 20% of users can approve recommendations

**Actions:**
- Enable "Approve" button for 20% of users (A/B split by user_id hash)
- Track approval rate, adjustment rate, order accuracy
- Compare stockout rates: A/B test group vs. control group

**Metrics:**
- Approval rate (target: > 60% of recommendations approved)
- Adjustment rate (target: < 30% require manual adjustment)
- Stockout reduction (target: 20% reduction in A/B group vs. control)

**Success Criteria:**
- Approval rate > 60%
- No increase in excess inventory in A/B group
- Stockout rate decreases by > 15% in A/B group

**Rollback:** Disable approve button for A/B group, revert to manual orders

---

### 13.4 Phase 3: Full Rollout (Week 9+)

**Objective:** Enable for 100% of users

**Actions:**
- Remove A/B split, enable for all users
- Add bulk approval features
- Enable email alerts for urgent reorders
- Weekly forecast accuracy reports to stakeholders

**Ongoing Monitoring:**
- Weekly model retraining
- Monthly MAPE review per SKU
- Quarterly ABC reclassification
- Continuous feedback loop

**Success Criteria:**
- 80% of orders use system recommendations
- Stockout rate reduced by 40% vs. pre-launch baseline
- Excess inventory reduced by 25%
- User satisfaction > 4.0/5

---

### 13.5 Rollback Strategy

**Immediate Rollback (< 5 minutes):**
- Feature flag: Disable forecast UI components
- API: Return HTTP 503 for forecast endpoints
- Database: Keep data intact for analysis

**Partial Rollback:**
- Revert to previous model version via model_registry table
- Keep UI active but show warning banner

**Full Rollback:**
- Decommission ML service
- Hide all forecast-related UI
- Archive forecast data (do not delete)

**Trigger Conditions:**
- Critical bug affecting order accuracy
- MAPE increases > 100% for > 5% of SKUs
- User complaints about forecast quality exceed threshold
- Stockout rate increases vs. baseline

---

## 14. Appendices

### A. Glossary

- **ABC Analysis:** Inventory classification by value (A = high value, C = low value)
- **ETS:** Error-Trend-Seasonality (exponential smoothing model)
- **MAPE:** Mean Absolute Percentage Error (forecast accuracy metric)
- **PI:** Prediction Interval (range containing true value with X% probability)
- **ROP:** Reorder Point (stock level triggering reorder)
- **Safety Stock:** Buffer inventory to prevent stockouts
- **SKU:** Stock Keeping Unit (unique product identifier)

### B. References

- **Forecasting:** Hyndman & Athanasopoulos, "Forecasting: Principles and Practice" (3rd ed)
- **Inventory Management:** Silver, Pyke & Peterson, "Inventory and Production Management" (4th ed)
- **LightGBM:** https://lightgbm.readthedocs.io/
- **Prophet:** https://facebook.github.io/prophet/
- **FastAPI:** https://fastapi.tiangolo.com/

### C. Future Enhancements (v2.0+)

1. **Multi-Location Optimization:** Transfer recommendations between locations
2. **Supplier Lead Time Prediction:** ML model for dynamic lead times
3. **Promotional Lift Modeling:** Forecast impact of promotions
4. **Price Elasticity:** Dynamic pricing integration
5. **Supplier Reliability Scoring:** Rank suppliers by on-time delivery
6. **Carbon Footprint Optimization:** Include sustainability metrics

---

**Document Status:** APPROVED FOR IMPLEMENTATION
**Next Review:** After Phase 1 completion (Week 4)
**Document Owner:** Platform Engineering Team
**Stakeholders:** Product, Operations, Data Science

---

END OF TECHNICAL SPECIFICATION
