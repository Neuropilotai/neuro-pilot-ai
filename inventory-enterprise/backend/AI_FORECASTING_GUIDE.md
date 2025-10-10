# 🤖 AI Forecasting & Intelligence Layer

## Overview

The AI Intelligence Layer provides demand forecasting, reorder optimization, and anomaly detection for your inventory system using state-of-the-art machine learning algorithms.

**Key Features:**
- 📈 **Demand Forecasting** - Prophet & ARIMA time-series forecasting
- 🎯 **Reorder Optimization** - ML-powered reorder point calculation
- 🚨 **Anomaly Detection** - Statistical outlier detection
- 📊 **Consumption Derivation** - Automated consumption tracking

---

## Quick Start

### 1. Install Python Dependencies

```bash
cd inventory-enterprise/backend/ai
chmod +x setup_python.sh
./setup_python.sh
```

This will:
- Create a Python virtual environment
- Install Prophet, statsmodels (ARIMA), scikit-learn, pandas
- Verify installations

### 2. Run Database Migrations

```bash
npm run migrate
```

This creates the AI tables:
- `ai_models` - Trained model metadata
- `ai_forecasts` - Forecast predictions
- `ai_consumption_derived` - Consumption history
- `ai_training_jobs` - Training job tracking

### 3. Derive Consumption Data

Before training models, you need historical consumption data:

```bash
curl -X POST http://localhost:8083/api/ai/consumption/derive \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  }'
```

This analyzes inventory snapshots and orders to calculate consumption.

### 4. Train Your First Model

```bash
curl -X POST http://localhost:8083/api/ai/forecast/train \
  -H "Content-Type: application/json" \
  -d '{
    "item_code": "APPLE-GALA",
    "model_type": "prophet",
    "options": {
      "trainingDays": 365,
      "forecastPeriods": 30
    }
  }'
```

### 5. Get Forecasts

```bash
curl http://localhost:8083/api/ai/forecast/APPLE-GALA?periods=30
```

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   AI Intelligence Layer                 │
├────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Prophet        │  │  ARIMA          │             │
│  │  Forecaster     │  │  Forecaster     │             │
│  │  (seasonal)     │  │  (fallback)     │             │
│  └────────┬────────┘  └────────┬────────┘             │
│           │                     │                       │
│           └──────────┬──────────┘                       │
│                      │                                  │
│              ┌───────▼────────┐                         │
│              │  BaseForecaster │                         │
│              │  (Python Bridge)│                         │
│              └───────┬────────┘                         │
│                      │                                  │
│           ┌──────────┴──────────┐                       │
│           │                     │                       │
│    ┌──────▼──────┐     ┌───────▼────────┐             │
│    │ train_      │     │ train_          │             │
│    │ prophet.py  │     │ arima.py        │             │
│    └─────────────┘     └─────────────────┘             │
│                                                          │
├────────────────────────────────────────────────────────┤
│                   Data Pipeline                          │
│                                                          │
│      ┌──────────────────────────────────┐              │
│      │  ConsumptionDerivation           │              │
│      │  (FIFO-based calculation)        │              │
│      └───────────┬──────────────────────┘              │
│                  │                                       │
│      ┌───────────▼──────────────────────┐              │
│      │  ai_consumption_derived          │              │
│      │  (Training data source)          │              │
│      └──────────────────────────────────┘              │
└────────────────────────────────────────────────────────┘
```

---

## API Reference

### Consumption Derivation

#### `POST /api/ai/consumption/derive`

Derive consumption from inventory snapshots and orders.

**Request:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Response:**
```json
{
  "success": true,
  "items_processed": 150,
  "records_derived": 45000,
  "errors": 0
}
```

#### `POST /api/ai/consumption/detect-anomalies`

Detect consumption anomalies using IQR method.

**Response:**
```json
{
  "success": true,
  "anomalies_detected": 23
}
```

---

### Forecasting

#### `POST /api/ai/forecast/train`

Train a forecasting model.

**Request:**
```json
{
  "item_code": "APPLE-GALA",
  "model_type": "prophet",  // or "arima"
  "options": {
    "trainingDays": 365,
    "forecastPeriods": 30,
    "seasonalityMode": "multiplicative",
    "changepointPriorScale": 0.05
  }
}
```

**Response:**
```json
{
  "success": true,
  "model_id": 42,
  "model_type": "prophet",
  "accuracy_metrics": {
    "mape": 8.5,
    "rmse": 2.3,
    "mae": 1.8,
    "r2": 0.92
  },
  "forecast_count": 30,
  "training_data_range": {
    "start_date": "2023-01-01",
    "end_date": "2024-01-01",
    "num_records": 365
  }
}
```

#### `GET /api/ai/forecast/:itemCode`

Get forecast for an item.

**Query Params:**
- `periods` (default: 30) - Days to forecast
- `model_type` (default: prophet) - "prophet" or "arima"

**Response:**
```json
{
  "success": true,
  "model_id": 42,
  "model_type": "prophet",
  "trained_at": "2024-01-15T10:30:00Z",
  "forecast": [
    {
      "date": "2024-01-16",
      "predicted_value": 125.3,
      "confidence_lower": 110.5,
      "confidence_upper": 140.1,
      "trend": 120.0,
      "weekly_effect": 3.2,
      "yearly_effect": 2.1
    }
  ],
  "accuracy_metrics": {
    "mape": 8.5
  }
}
```

#### `POST /api/ai/forecast/batch-train`

Train models for multiple items at once.

**Request:**
```json
{
  "item_codes": ["APPLE-GALA", "ORANGE-NAVEL", "BANANA-ORGANIC"],
  "model_type": "prophet",
  "options": {
    "trainingDays": 365,
    "forecastPeriods": 30
  }
}
```

**Response:**
```json
{
  "success": true,
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [...]
}
```

#### `GET /api/ai/forecast/evaluate/:itemCode`

Backtest model accuracy.

**Query Params:**
- `backtest_days` (default: 30)
- `model_type` (default: prophet)

**Response:**
```json
{
  "success": true,
  "model_id": 42,
  "backtest_period": {
    "start": "2023-12-15",
    "days": 30
  },
  "sample_count": 28,
  "mape": 10.2
}
```

---

### Reorder Optimization

#### `POST /api/ai/reorder/recommend`

Get AI-powered reorder recommendations.

**Request:**
```json
{
  "item_codes": ["APPLE-GALA", "ORANGE-NAVEL"],
  "lead_time_days": 7,
  "service_level": 0.95
}
```

**Response:**
```json
{
  "success": true,
  "recommendations": [
    {
      "item_code": "APPLE-GALA",
      "success": true,
      "current_inventory": 85,
      "expected_consumption": 120.5,
      "safety_stock": 15.3,
      "reorder_point": 135.8,
      "reorder_quantity": 241,
      "should_reorder": true,
      "days_until_stockout": 5,
      "confidence": 0.91
    }
  ],
  "parameters": {
    "lead_time_days": 7,
    "service_level": 0.95
  }
}
```

**Algorithm:**
- Reorder Point = Expected Consumption (lead time) + Safety Stock
- Safety Stock = (Upper Confidence - Predicted) × Lead Time × Service Level
- Reorder Quantity = Expected Consumption × 2 (EOQ proxy)

#### `GET /api/ai/reorder/summary`

Get summary of items needing reorder.

**Response:**
```json
{
  "success": true,
  "total_items": 150,
  "items_need_reorder": 23,
  "items": [...]
}
```

---

### Anomaly Detection

#### `GET /api/ai/anomaly/list`

List detected consumption anomalies.

**Query Params:**
- `days` (default: 30)
- `item_code` (optional)

**Response:**
```json
{
  "success": true,
  "count": 5,
  "anomalies": [
    {
      "consumption_id": 12345,
      "item_code": "APPLE-GALA",
      "item_name": "Apple Gala",
      "date": "2024-01-10",
      "consumption_qty": 350,
      "anomaly_score": 2.8,
      "confidence_score": 0.95
    }
  ]
}
```

---

### Model Management

#### `GET /api/ai/models/list`

List all trained models.

**Query Params:**
- `model_type` (optional) - "prophet" or "arima"
- `entity_type` (optional) - "item" or "global"
- `limit` (default: 50)

**Response:**
```json
{
  "success": true,
  "count": 42,
  "models": [
    {
      "model_id": 42,
      "model_type": "prophet",
      "entity_type": "item",
      "entity_id": "APPLE-GALA",
      "model_path": "/app/ai/models/prophet_item_APPLE-GALA_20240115.pkl",
      "hyperparameters": {...},
      "training_data_range": {...},
      "accuracy_metrics": {...},
      "trained_at": "2024-01-15T10:30:00Z",
      "status": "active"
    }
  ]
}
```

---

## Model Selection Guide

### When to use Prophet

✅ **Best for:**
- Items with strong seasonal patterns (weekly, monthly, yearly)
- Long historical data (6+ months)
- Holiday effects
- Trends with changepoints
- High volume items

**Example:** Fresh produce (seasonal), bakery items (weekly patterns)

### When to use ARIMA

✅ **Best for:**
- Stationary or near-stationary series
- Short-term forecasts
- Limited historical data (1-3 months)
- Fallback when Prophet fails
- Low volume items

**Example:** Specialty items, new products, stable commodities

### Accuracy Targets

- **MAPE < 10%** - Excellent (reliable for automated reorder)
- **MAPE 10-20%** - Good (use with safety stock)
- **MAPE 20-30%** - Fair (manual review recommended)
- **MAPE > 30%** - Poor (retrain or use different model)

---

## Workflow Examples

### Daily Forecasting Workflow

```bash
#!/bin/bash
# daily_forecast_update.sh

# 1. Derive yesterday's consumption
curl -X POST http://localhost:8083/api/ai/consumption/derive \
  -H "Content-Type: application/json" \
  -d "{
    \"start_date\": \"$(date -d 'yesterday' +%Y-%m-%d)\",
    \"end_date\": \"$(date +%Y-%m-%d)\"
  }"

# 2. Detect anomalies
curl -X POST http://localhost:8083/api/ai/consumption/detect-anomalies

# 3. Retrain models (weekly, on Sundays)
if [ $(date +%u) -eq 7 ]; then
  curl -X POST http://localhost:8083/api/ai/forecast/batch-train \
    -H "Content-Type: application/json" \
    -d '{
      "item_codes": ["APPLE-GALA", "ORANGE-NAVEL"],
      "model_type": "prophet"
    }'
fi

# 4. Get reorder recommendations
curl -X POST http://localhost:8083/api/ai/reorder/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "item_codes": ["APPLE-GALA", "ORANGE-NAVEL"],
    "lead_time_days": 7
  }' | jq '.recommendations[] | select(.should_reorder)'
```

### Initial Setup Workflow

```bash
# 1. Derive historical consumption (1 year)
curl -X POST http://localhost:8083/api/ai/consumption/derive \
  -d '{"start_date": "2023-01-01", "end_date": "2024-01-01"}'

# 2. Detect and flag anomalies
curl -X POST http://localhost:8083/api/ai/consumption/detect-anomalies

# 3. Train models for top 100 items
# (Get item codes from /api/inventory/items?limit=100)
curl -X POST http://localhost:8083/api/ai/forecast/batch-train \
  -d '{"item_codes": [...], "model_type": "prophet"}'

# 4. Evaluate model accuracy
for item in APPLE-GALA ORANGE-NAVEL BANANA-ORGANIC; do
  curl "http://localhost:8083/api/ai/forecast/evaluate/$item?backtest_days=30"
done
```

---

## Troubleshooting

### "No trained model found"

**Solution:** Train a model first:
```bash
curl -X POST http://localhost:8083/api/ai/forecast/train \
  -d '{"item_code": "YOUR-ITEM", "model_type": "prophet"}'
```

### "Insufficient training data"

**Solution:** Ensure you have:
1. At least 10 days of consumption data
2. Derived consumption using `/api/ai/consumption/derive`

```bash
# Check consumption data
SELECT COUNT(*) FROM ai_consumption_derived WHERE item_code = 'YOUR-ITEM';
```

### "Python script failed"

**Solution:**
1. Verify Python installation: `python3 --version`
2. Check virtual environment: `source venv/bin/activate`
3. Reinstall dependencies: `cd ai && ./setup_python.sh`
4. Check logs: `tail -f logs/application-*.log`

### Prophet training is slow

**Solution:**
- Reduce `trainingDays` to 180-365 days
- Use ARIMA for faster training
- Train models in batches during off-hours

### Poor forecast accuracy (high MAPE)

**Solutions:**
1. More training data (at least 6 months for Prophet)
2. Adjust hyperparameters:
   ```json
   {
     "changepointPriorScale": 0.5,  // More flexible (default: 0.05)
     "seasonalityMode": "additive"   // For stable seasonality
   }
   ```
3. Try ARIMA for short-term forecasts
4. Check for data quality issues (anomalies, gaps)

---

## Performance Optimization

### Training Performance

- **Batch training:** Train multiple models overnight
- **Incremental updates:** Retrain only changed items
- **Caching:** Use Redis to cache forecast results (PASS C)

### Query Performance

```sql
-- Index for fast forecast lookup
CREATE INDEX idx_forecasts_item_date
ON ai_forecasts(entity_id, forecast_date);

-- Index for consumption queries
CREATE INDEX idx_consumption_item_date
ON ai_consumption_derived(item_code, date DESC);
```

---

## Next Steps

1. **PASS C:** Redis caching for forecast results
2. **PASS D:** Grafana dashboards for forecast visualization
3. **Future:** LSTM deep learning models, multi-location forecasting

---

## References

- [Facebook Prophet Documentation](https://facebook.github.io/prophet/)
- [ARIMA Models (statsmodels)](https://www.statsmodels.org/stable/tsa.html)
- [Scikit-learn Anomaly Detection](https://scikit-learn.org/stable/modules/outlier_detection.html)

---

**For support:** ai-team@your-company.com
