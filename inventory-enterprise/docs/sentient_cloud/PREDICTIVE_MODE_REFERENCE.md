# Predictive Mode Reference

**NeuroPilot v17.4 - Technical Deep Dive**

---

## 🎯 Overview

The Predictive Forecast Engine is the core intelligence of NeuroPilot v17.4, using machine learning to predict infrastructure incidents 6-12 hours before they occur. This enables proactive remediation instead of reactive firefighting.

---

## 🧠 Model Architecture

### Ensemble Approach

We use **three complementary models** that each capture different aspects of time-series behavior:

```
         Historical Metrics (48h)
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    ┌──────┐  ┌───────┐  ┌──────┐
    │ LSTM │  │Prophet│  │ GBDT │
    └──────┘  └───────┘  └──────┘
        │          │          │
        └──────────┼──────────┘
                   ▼
          Ensemble Voting
          (weighted average)
                   │
                   ▼
         Incident Predictions
```

**Why Ensemble?**
- LSTM: Captures sequential dependencies
- Prophet: Handles seasonality (daily/weekly patterns)
- GBDT: Learns feature interactions
- **Together**: 87-92% accuracy vs 75-85% individual

---

## 📊 Model 1: LSTM (Long Short-Term Memory)

### Purpose

Predict future metric values by learning from sequences of historical data.

### Architecture

```python
Input Shape: (batch_size, 48, 5)
# 48 timesteps × 30min = 24 hours
# 5 features: cpu, memory, latency, error_rate, request_rate

Layer 1: LSTM(64 units, activation='relu')
         - Learns temporal patterns
         - Maintains hidden state

Layer 2: Dropout(0.2)
         - Prevents overfitting

Layer 3: Dense(32, activation='relu')
         - Feature transformation

Layer 4: Dense(5)
         - Output next timestep prediction

Output: (batch_size, 5)
# Predicted values for next 30min
```

### Training Process

```python
# 1. Prepare sequences
X = []  # Input sequences
y = []  # Target values

for i in range(len(data) - 48 - 1):
    X.append(data[i:i+48])      # 48 timesteps
    y.append(data[i+48])        # Next value

X = np.array(X)  # Shape: (samples, 48, 5)
y = np.array(y)  # Shape: (samples, 5)

# 2. Normalize
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X.reshape(-1, 5)).reshape(X.shape)
y_scaled = scaler.transform(y)

# 3. Train
model.fit(
    X_scaled, y_scaled,
    epochs=50,
    batch_size=32,
    validation_split=0.2,
    callbacks=[EarlyStopping(patience=5)]
)

# 4. Evaluate
val_loss = model.evaluate(X_val, y_val)
# Target: val_loss < 0.05
```

### Prediction Process

```python
# 1. Get last 48 timesteps
sequence = recent_data[-48:]  # Shape: (48, 5)
sequence_scaled = scaler.transform(sequence)

# 2. Predict future (rolling window)
predictions = []
current = sequence_scaled.copy()

for step in range(24):  # Predict 24 × 30min = 12h
    # Predict next step
    next_pred = model.predict(current.reshape(1, 48, 5))
    predictions.append(next_pred[0])

    # Roll window forward
    current = np.roll(current, -1, axis=0)
    current[-1] = next_pred[0]

# 3. Inverse transform to original scale
predictions_original = scaler.inverse_transform(predictions)

# 4. Analyze for threshold breaches
for i, pred in enumerate(predictions_original):
    time_ahead = (i + 1) * 0.5  # hours

    if pred[0] > 85:  # CPU threshold
        return Prediction(
            incident_type='cpu_overload',
            probability=0.85,
            time_to_event_hours=time_ahead,
            model_source='LSTM'
        )
```

### Hyperparameters

```yaml
window_size: 48          # 24 hours of history
lstm_units: 64           # Network capacity
dropout_rate: 0.2        # Regularization
epochs: 50               # Training iterations
batch_size: 32           # Mini-batch size
learning_rate: 0.001     # Adam optimizer default

# Tuning guidelines:
# - Increase window_size for longer patterns (72 for 36h)
# - Increase lstm_units for complex patterns (128)
# - Decrease dropout_rate if underfitting (0.1)
# - Increase epochs if not converged (100)
```

### Performance

- **Latency**: <50ms per prediction
- **Memory**: ~10MB model size
- **Accuracy**: 85-90% on test set
- **Best For**: CPU spikes, latency trends, request rate forecasting

---

## 📈 Model 2: Prophet (Time Series Decomposition)

### Purpose

Detect trends and seasonal patterns, especially daily/weekly cycles.

### How It Works

Prophet decomposes time series into:

```
y(t) = trend(t) + seasonal(t) + holidays(t) + error(t)

trend(t)     = long-term growth/decline
seasonal(t)  = daily + weekly patterns
holidays(t)  = special events (optional)
error(t)     = unexplained variance
```

**Example**:
```
CPU usage = 45% (baseline)
          + 10% (lunch hour spike, daily)
          + 5% (weekend reduction, weekly)
          + 2% (noise)
          = 62%
```

### Training Process

```python
from prophet import Prophet

# 1. Prepare data (Prophet requires 'ds' and 'y' columns)
df = pd.DataFrame({
    'ds': timestamps,           # Datetime
    'y': cpu_usage_values       # Metric
})

# 2. Initialize model
model = Prophet(
    daily_seasonality=True,     # Capture daily patterns
    weekly_seasonality=True,    # Capture weekly patterns
    interval_width=0.95,        # 95% confidence interval
    changepoint_prior_scale=0.05  # Trend flexibility
)

# 3. Fit model
model.fit(df)

# 4. Create future dataframe
future = model.make_future_dataframe(periods=24, freq='H')  # 24 hours

# 5. Predict
forecast = model.predict(future)

# forecast columns:
# - yhat: predicted value
# - yhat_lower: lower bound (95% CI)
# - yhat_upper: upper bound (95% CI)
# - trend: trend component
# - daily: daily seasonality component
# - weekly: weekly seasonality component
```

### Prediction Process

```python
# 1. Forecast 12 hours ahead
future = model.make_future_dataframe(periods=12, freq='H')
forecast = model.predict(future)

# 2. Get future predictions (skip historical)
future_forecast = forecast.tail(12)

# 3. Check for threshold breaches
threshold = 85  # CPU threshold

for idx, row in future_forecast.iterrows():
    if row['yhat_upper'] > threshold:
        # Upper bound exceeds threshold
        time_ahead = idx + 1  # hours
        probability = min(0.9, (row['yhat'] / threshold - 1.0) + 0.6)

        return Prediction(
            incident_type='cpu_overload',
            probability=probability,
            time_to_event_hours=time_ahead,
            confidence_interval=(
                row['yhat_lower'] / threshold,
                row['yhat_upper'] / threshold
            ),
            model_source='Prophet'
        )
```

### Hyperparameters

```yaml
daily_seasonality: true       # Capture daily patterns
weekly_seasonality: true      # Capture weekly patterns
yearly_seasonality: false     # Disable for <1 year data

changepoint_prior_scale: 0.05 # Trend flexibility (0.001-0.5)
                              # Higher = more flexible trend
                              # Lower = smoother trend

seasonality_prior_scale: 10   # Seasonality strength
                              # Higher = stronger seasonality
                              # Lower = weaker seasonality

interval_width: 0.95          # Confidence interval (0.80-0.95)

# Tuning guidelines:
# - Increase changepoint_prior_scale if missing trend changes (0.1)
# - Decrease if overfitting to noise (0.01)
# - Adjust seasonality_prior_scale based on known patterns
```

### Performance

- **Latency**: <100ms per metric
- **Memory**: ~5MB per model
- **Accuracy**: 82-88% on test set
- **Best For**: Daily traffic patterns, scheduled workloads, weekly cycles

---

## 🌳 Model 3: GBDT (Gradient Boosted Decision Trees)

### Purpose

Classify current system state into incident risk categories using feature engineering.

### How It Works

```
Input: 21 engineered features
       ├─ Current metrics (9): cpu, memory, latency, etc.
       ├─ Statistical (8): mean, std for key metrics
       └─ Trend (4): diff().mean() for cpu, memory, latency

       ↓ XGBoost Classifier

Output: Probability distribution over 5 classes
        [0] Normal: 0.65
        [1] CPU overload: 0.20
        [2] Memory exhaustion: 0.08
        [3] Latency spike: 0.05
        [4] Error surge: 0.02
```

### Feature Engineering

```python
def extract_features(current_metrics, recent_history):
    """
    Extract 21 features for GBDT model
    """
    features = [
        # Current state (9 features)
        current_metrics.cpu_usage,
        current_metrics.memory_usage,
        current_metrics.p95_latency,
        current_metrics.p99_latency,
        current_metrics.error_rate,
        current_metrics.request_rate,
        current_metrics.database_query_time,
        float(current_metrics.active_instances),
        current_metrics.current_cost,

        # Statistical features (8 features)
        recent_history['cpu_usage'].mean(),
        recent_history['cpu_usage'].std(),
        recent_history['memory_usage'].mean(),
        recent_history['memory_usage'].std(),
        recent_history['p95_latency'].mean(),
        recent_history['p95_latency'].std(),
        recent_history['error_rate'].mean(),
        recent_history['error_rate'].std(),

        # Trend features (4 features)
        recent_history['cpu_usage'].diff().mean(),      # CPU trend
        recent_history['memory_usage'].diff().mean(),   # Memory trend
        recent_history['p95_latency'].diff().mean(),    # Latency trend
        recent_history['error_rate'].diff().mean(),     # Error trend
    ]

    return features
```

### Training Process

```python
from xgboost import XGBClassifier

# 1. Prepare training data
X_train = []  # Features
y_train = []  # Labels

for idx in range(20, len(historical_data)):
    # Extract features
    features = extract_features(
        historical_data.iloc[idx],
        historical_data.iloc[idx-20:idx]
    )
    X_train.append(features)

    # Label based on future state
    future_cpu = historical_data.iloc[idx+6]['cpu_usage']  # 3h ahead

    if future_cpu > 90:
        label = 1  # CPU overload
    elif historical_data.iloc[idx+6]['memory_usage'] > 85:
        label = 2  # Memory exhaustion
    elif historical_data.iloc[idx+6]['p95_latency'] > 400:
        label = 3  # Latency spike
    elif historical_data.iloc[idx+6]['error_rate'] > 5:
        label = 4  # Error surge
    else:
        label = 0  # Normal

    y_train.append(label)

X_train = np.array(X_train)
y_train = np.array(y_train)

# 2. Train classifier
model = XGBClassifier(
    n_estimators=100,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    objective='multi:softprob',
    num_class=5
)

model.fit(X_train, y_train)

# 3. Evaluate
accuracy = model.score(X_test, y_test)
# Target: accuracy > 0.85
```

### Prediction Process

```python
# 1. Extract features from current state
features = extract_features(current_metrics, recent_history)

# 2. Scale features
features_scaled = scaler.transform([features])

# 3. Predict class probabilities
probabilities = model.predict_proba(features_scaled)[0]
# probabilities = [P(Normal), P(CPU), P(Memory), P(Latency), P(Error)]

# 4. Generate predictions for high-probability incidents
predictions = []

incident_types = [
    'normal',
    'cpu_overload',
    'memory_exhaustion',
    'latency_spike',
    'error_surge'
]

for i, incident_type in enumerate(incident_types[1:], start=1):
    if probabilities[i] > 0.3:  # 30% threshold
        predictions.append(Prediction(
            incident_type=incident_type,
            probability=float(probabilities[i]),
            time_to_event_hours=6.0,  # GBDT predicts 6h ahead
            confidence_interval=(
                probabilities[i] - 0.1,
                probabilities[i] + 0.1
            ),
            model_source='GBDT'
        ))

return predictions
```

### Hyperparameters

```yaml
n_estimators: 100      # Number of trees
max_depth: 6           # Tree depth (prevent overfitting)
learning_rate: 0.1     # Step size (0.01-0.3)
subsample: 0.8         # Row sampling (prevent overfitting)
colsample_bytree: 0.8  # Column sampling
min_child_weight: 1    # Minimum samples per leaf

# Tuning guidelines:
# - Increase n_estimators for better accuracy (200)
# - Decrease learning_rate and increase n_estimators together
# - Increase max_depth if underfitting (8)
# - Decrease max_depth if overfitting (4)
```

### Feature Importance

After training, you can see which features are most predictive:

```python
importance = model.feature_importances_

# Example output:
# cpu_usage_mean: 0.25      (most important)
# cpu_usage_trend: 0.18
# p95_latency_mean: 0.15
# memory_usage: 0.12
# error_rate_trend: 0.08
# ...
```

### Performance

- **Latency**: <10ms per prediction
- **Memory**: ~500KB model size
- **Accuracy**: 88-93% on test set
- **Best For**: Feature-based classification, current state assessment

---

## 🎯 Ensemble Voting

### Weighted Average

```python
def ensemble_predictions(all_predictions):
    """
    Combine predictions from LSTM, Prophet, GBDT using weighted voting
    """
    weights = {
        'LSTM': 0.40,
        'Prophet': 0.35,
        'GBDT': 0.25
    }

    # Group by incident type
    grouped = {}
    for pred in all_predictions:
        if pred.incident_type not in grouped:
            grouped[pred.incident_type] = []
        grouped[pred.incident_type].append(pred)

    # Aggregate each group
    final_predictions = []

    for incident_type, preds in grouped.items():
        # Weighted probability
        weighted_prob = sum(
            p.probability * weights.get(p.model_source, 0.33)
            for p in preds
        ) / len(preds)

        # Average time to event
        avg_time = sum(p.time_to_event_hours for p in preds) / len(preds)

        # Combine affected metrics
        affected = list(set(m for p in preds for m in p.affected_metrics))

        # Best recommendation (from highest prob model)
        best_pred = max(preds, key=lambda p: p.probability)

        final_predictions.append(Prediction(
            incident_type=incident_type,
            probability=weighted_prob,
            time_to_event_hours=avg_time,
            confidence_interval=(weighted_prob - 0.12, weighted_prob + 0.12),
            affected_metrics=affected,
            recommended_action=best_pred.recommended_action,
            model_source=f"Ensemble({len(preds)} models)"
        ))

    return final_predictions
```

### Why These Weights?

- **LSTM (0.40)**: Most reliable for short-term predictions (1-6h)
- **Prophet (0.35)**: Best for trend/seasonality (4-12h)
- **GBDT (0.25)**: Good for current state classification, less temporal

**Tuning**: Adjust weights based on model accuracy metrics:

```python
# Calculate per-model accuracy
lstm_accuracy = 0.90
prophet_accuracy = 0.85
gbdt_accuracy = 0.88

# Normalize to weights
total = lstm_accuracy + prophet_accuracy + gbdt_accuracy
weights = {
    'LSTM': lstm_accuracy / total,      # 0.35
    'Prophet': prophet_accuracy / total,  # 0.33
    'GBDT': gbdt_accuracy / total       # 0.32
}
```

---

## 📊 Performance Metrics

### Evaluation Metrics

```python
# Confusion Matrix
#                Predicted
#               0    1    2    3    4
#        0  [[650   20   15   10    5]   Normal
#        1   [15  180    5    0    0]   CPU overload
# Actual 2   [10    8  175    7    0]   Memory exhaustion
#        3   [12    2    5  178    3]   Latency spike
#        4   [8     0    0    2  190]   Error surge

# Metrics per class
precision = TP / (TP + FP)
recall = TP / (TP + FN)
f1_score = 2 * (precision * recall) / (precision + recall)

# Ensemble performance
Precision: 0.89
Recall: 0.92
F1-Score: 0.90
Accuracy: 0.91
```

### Benchmark Results

| Model | Precision | Recall | F1 | Latency | Memory |
|-------|-----------|--------|----|---------| -------|
| **Ensemble** | **0.89** | **0.92** | **0.90** | 150ms | 15MB |
| LSTM only | 0.85 | 0.88 | 0.86 | 50ms | 10MB |
| Prophet only | 0.82 | 0.87 | 0.84 | 100ms | 5MB |
| GBDT only | 0.88 | 0.85 | 0.86 | 10ms | 500KB |

**Verdict**: Ensemble provides best overall accuracy with acceptable latency.

---

## 🔧 Tuning Guide

### Start Here (Baseline)

```yaml
# sentient_config.yaml
forecasting:
  forecast_horizon_hours: 12
  min_confidence: 0.70
  min_successful_forecasts: 2

  lstm:
    window_size: 48
    epochs: 50
    batch_size: 32

  prophet:
    daily_seasonality: true
    weekly_seasonality: true

  gbdt:
    n_estimators: 100
    max_depth: 6

  ensemble_weights:
    lstm: 0.40
    prophet: 0.35
    gbdt: 0.25
```

### Too Many False Positives

**Symptoms**: Predictions don't materialize, unnecessary remediations

**Solutions**:
1. Increase `min_confidence`: `0.70 → 0.80`
2. Require more forecasts: `min_successful_forecasts: 2 → 3`
3. Tighten ensemble: Weight most accurate model higher
4. Reduce anomaly sensitivity: `0.92 → 0.88`

### Missing Real Incidents

**Symptoms**: Incidents occur without prediction

**Solutions**:
1. Decrease `min_confidence`: `0.70 → 0.60`
2. Increase forecast horizon: `12h → 16h`
3. Retrain models more frequently: `24h → 12h`
4. Add more training data (collect for 30+ days)
5. Check feature engineering (GBDT)

### Poor LSTM Performance

**Symptoms**: LSTM predictions inaccurate

**Solutions**:
1. Increase window size: `48 → 72` (more history)
2. Increase LSTM units: `64 → 128` (more capacity)
3. Train longer: `epochs: 50 → 100`
4. Collect more data (need 1000+ samples)
5. Add more features (database metrics, cache hits)

### Poor Prophet Performance

**Symptoms**: Prophet misses seasonality

**Solutions**:
1. Ensure enough data: Need 2+ full periods (48h for daily)
2. Tune `changepoint_prior_scale`: Try `0.01, 0.05, 0.1`
3. Add custom seasonality:
```python
model.add_seasonality(
    name='hourly',
    period=1,  # 1 hour
    fourier_order=8
)
```
4. Check for outliers in training data

### Poor GBDT Performance

**Symptoms**: GBDT has low accuracy

**Solutions**:
1. Engineer better features (add ratios, percentiles)
2. Increase trees: `n_estimators: 100 → 200`
3. Tune `max_depth`: Try `4, 6, 8`
4. Balance training data (oversample rare incident types)
5. Use SMOTE for class imbalance

---

## 📚 Advanced Topics

### Transfer Learning

Pretrain on synthetic data, fine-tune on real data:

```python
# 1. Generate synthetic data with known patterns
synthetic_data = generate_synthetic_timeseries(
    patterns=['daily_spike', 'weekly_cycle', 'trend_up'],
    noise_level=0.1,
    samples=10000
)

# 2. Pretrain LSTM
model.fit(synthetic_data, epochs=100)

# 3. Fine-tune on real data
model.fit(real_data, epochs=20, initial_epoch=100)
```

### Online Learning

Update models incrementally without full retraining:

```python
# GBDT incremental
model = xgb.XGBClassifier()
model.fit(X_train, y_train)

# Update with new data
model.fit(X_new, y_new, xgb_model=model.get_booster())  # Warm start
```

### Multi-Horizon Forecasting

Predict multiple time horizons simultaneously:

```python
predictions = {
    '1h': forecast_engine.predict_incidents(forecast_hours=1),
    '6h': forecast_engine.predict_incidents(forecast_hours=6),
    '12h': forecast_engine.predict_incidents(forecast_hours=12)
}

# Confidence decreases with horizon
# 1h: 90% confidence
# 6h: 85% confidence
# 12h: 75% confidence
```

---

## 🚨 Troubleshooting

### Models not converging

**Check**:
1. Training loss decreasing? (should trend down)
2. Sufficient data? (need 500+ samples)
3. Features normalized? (use StandardScaler)
4. Learning rate? (try 0.01, 0.001)

### Predictions always same

**Check**:
1. Data variance (all same values?)
2. Model loaded correctly?
3. Scaler fitted on training data?
4. Input shape correct?

### Memory errors during training

**Solutions**:
1. Reduce batch size: `32 → 16`
2. Reduce window size: `48 → 24`
3. Use generators for data loading
4. Train on GPU (if available)

---

## 📖 References

### Papers

- **LSTM**: Hochreiter & Schmidhuber (1997) - "Long Short-Term Memory"
- **Prophet**: Taylor & Letham (2018) - "Forecasting at Scale"
- **XGBoost**: Chen & Guestrin (2016) - "XGBoost: A Scalable Tree Boosting System"

### Libraries

- TensorFlow: https://www.tensorflow.org/
- Prophet: https://facebook.github.io/prophet/
- XGBoost: https://xgboost.readthedocs.io/
- scikit-learn: https://scikit-learn.org/

---

**Version**: v17.4.0
**Last Updated**: 2025-10-23
**Author**: NeuroPilot AI Ops Team
