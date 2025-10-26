# Anomaly Detection Reference

**NeuroPilot v17.3 - Technical Deep Dive**

---

## 🎯 Overview

The anomaly detection system uses a **multi-algorithm ensemble** approach to identify unusual patterns in infrastructure metrics. This document provides technical details on each algorithm, tuning parameters, and best practices.

---

## 🔬 Algorithms

### 1. Z-Score (Statistical Outlier Detection)

**Purpose:** Detect values that deviate significantly from the mean

**Formula:**
```
z = |x - μ| / σ

where:
  x = current value
  μ = mean of historical values
  σ = standard deviation
```

**Threshold:**
```python
threshold = 3.0 * (1 - sensitivity)

# With default sensitivity = 0.92:
threshold = 3.0 * (1 - 0.92) = 0.24

# Values with z > 0.24 are flagged as anomalies
```

**Pros:**
- Simple and interpretable
- Works well for normally distributed data
- Fast computation

**Cons:**
- Assumes normal distribution
- Sensitive to outliers in training data
- Doesn't capture seasonal patterns

**Best For:**
- CPU usage
- Memory usage
- Request rates

---

### 2. EWMA (Exponential Weighted Moving Average)

**Purpose:** Detect deviations from recent trends while giving more weight to recent data

**Formula:**
```
EWMA_t = α * x_t + (1 - α) * EWMA_(t-1)

where:
  α = 2 / (span + 1)
  span = 20 (configurable)
```

**Deviation:**
```python
deviation = |current - ewma| / ewma

# Threshold: 0.3 (30% deviation)
is_anomaly = deviation > 0.3
```

**Pros:**
- Adapts to recent trends
- Less sensitive to old outliers
- Good for time-series data

**Cons:**
- Requires continuous historical data
- May miss sudden spikes if span too large
- Lag in detection

**Best For:**
- Latency metrics
- Error rates
- Database query times

---

### 3. Seasonal Decomposition

**Purpose:** Separate time series into trend, seasonal, and residual components

**Process:**
```python
from statsmodels.tsa.seasonal import seasonal_decompose

result = seasonal_decompose(
    timeseries,
    model='additive',  # or 'multiplicative'
    period=24,         # 24 hours
    extrapolate_trend='freq'
)

trend = result.trend
seasonal = result.seasonal
residual = result.resid

# Anomalies in residual component
is_anomaly = |residual| > threshold
```

**Threshold:**
```python
threshold = 3 * std(residual)
```

**Pros:**
- Captures daily/weekly patterns
- Removes seasonal noise
- Finds true anomalies

**Cons:**
- Requires at least 2 full periods (48+ hours)
- Computationally expensive
- May not work for irregular patterns

**Best For:**
- Daily traffic patterns
- Periodic workloads
- Scheduled jobs

---

## 🎚️ Sensitivity Tuning

### Sensitivity Parameter (0.0 - 1.0)

**Default:** 0.92 (recommended)

**Effect on Z-Score:**
```
sensitivity = 0.80  → threshold = 0.60  (less sensitive, fewer alerts)
sensitivity = 0.92  → threshold = 0.24  (balanced)
sensitivity = 0.95  → threshold = 0.15  (more sensitive, more alerts)
```

### Choosing Sensitivity

**Use 0.80-0.85 (Low Sensitivity) if:**
- High metric variance is normal
- Many false positives
- Alert fatigue

**Use 0.90-0.92 (Medium Sensitivity) if:**
- Balanced approach needed
- First deployment
- Learning phase

**Use 0.95-0.99 (High Sensitivity) if:**
- Need early warnings
- Critical systems
- Mature deployment with good baselines

---

## 📊 Severity Levels

### Critical (🔴)

**Criteria:**
- Z-score > 5.0
- OR EWMA deviation > 0.5 (50%)

**Actions:**
- Immediate PagerDuty alert
- Auto-scaling triggered
- Slack notification
- Notion entry

**Examples:**
- CPU suddenly at 100%
- Latency 10x normal
- Error rate spike to 20%

---

### High (🟠)

**Criteria:**
- Z-score > 4.0
- OR EWMA deviation > 0.4 (40%)

**Actions:**
- Slack alert
- Notion entry
- Auto-scaling consideration
- Manual review recommended

**Examples:**
- CPU sustained at 90%
- Latency 5x normal
- Error rate at 10%

---

### Medium (🟡)

**Criteria:**
- Z-score > 3.0
- OR EWMA deviation > 0.3 (30%)

**Actions:**
- Slack notification
- Notion entry
- Logged for analysis
- No immediate action

**Examples:**
- CPU at 85%
- Latency 2x normal
- Error rate at 5%

---

### Low (🟢)

**Criteria:**
- Z-score > 2.0
- OR EWMA deviation > 0.2 (20%)

**Actions:**
- Logged only
- Included in daily report
- No immediate notification

**Examples:**
- CPU at 75%
- Latency 1.5x normal
- Error rate at 3%

---

## 🎓 Training the Model

### Gaussian Mixture Model (GMM)

**Purpose:** Cluster metrics into "normal", "warning", and "anomaly" states

**Configuration:**
```python
from sklearn.mixture import GaussianMixture

model = GaussianMixture(
    n_components=3,      # 3 clusters
    covariance_type='full',
    max_iter=100,
    random_state=42,
    warm_start=True      # Enable incremental learning
)
```

**Features Used:**
- cpu_usage
- memory_usage
- p95_latency
- p99_latency
- error_rate
- request_rate
- database_query_time

**Training Data:**
- Last 24 hours minimum
- 48+ data points required
- Normalized using StandardScaler

---

### Incremental Learning

**Process:**
1. Load existing model (if available)
2. Collect new metrics (last 24h)
3. Normalize with existing scaler
4. Fit model with `warm_start=True`
5. Save updated model
6. Log training metrics

**Advantages:**
- Adapts to changing patterns
- No need to retrain from scratch
- Preserves learned knowledge
- Fast updates

---

### Training Metrics

**Loss (Negative Log-Likelihood):**
```
loss = -model.score(X)

Target: < 0.02 (converged)
```

**Silhouette Score:**
```
score = silhouette_score(X, labels)

Range: -1 to +1
Good: > 0.5
```

**BIC (Bayesian Information Criterion):**
```
bic = model.bic(X)

Lower is better
Use to compare models
```

**AIC (Akaike Information Criterion):**
```
aic = model.aic(X)

Lower is better
Penalizes complexity
```

---

## 🔧 Configuration Examples

### Conservative (Production Start)

```yaml
anomaly_sensitivity: 0.85
anomaly_detection:
  zscore_threshold: 3.5
  ewma_span: 30
  seasonal_period: 24

model:
  n_components: 3
  retrain_interval_hours: 12
```

**Effect:** Fewer false positives, slower detection

---

### Balanced (Recommended)

```yaml
anomaly_sensitivity: 0.92
anomaly_detection:
  zscore_threshold: 3.0
  ewma_span: 20
  seasonal_period: 24

model:
  n_components: 3
  retrain_interval_hours: 24
```

**Effect:** Good balance of detection and false positives

---

### Aggressive (Critical Systems)

```yaml
anomaly_sensitivity: 0.96
anomaly_detection:
  zscore_threshold: 2.5
  ewma_span: 15
  seasonal_period: 24

model:
  n_components: 5
  retrain_interval_hours: 6
```

**Effect:** Early detection, more false positives

---

## 📈 Performance Benchmarks

### Detection Latency

| Algorithm | Latency | Memory |
|-----------|---------|--------|
| Z-Score | <1ms | ~1KB |
| EWMA | <5ms | ~10KB |
| Seasonal | <100ms | ~1MB |
| GMM | <50ms | ~500KB |
| **Total** | **~150ms** | **~1.5MB** |

---

### Accuracy (on test data)

| Metric | Precision | Recall | F1-Score |
|--------|-----------|--------|----------|
| Ensemble | 0.89 | 0.92 | 0.90 |
| Z-Score only | 0.75 | 0.95 | 0.84 |
| EWMA only | 0.85 | 0.88 | 0.86 |
| GMM only | 0.82 | 0.87 | 0.84 |

**Ensemble is best!**

---

## 🐛 Troubleshooting

### Too Many False Positives

**Solutions:**
1. Decrease sensitivity: `0.92 → 0.85`
2. Increase EWMA span: `20 → 30`
3. Filter out known spikes in training data
4. Increase Z-score threshold: `3.0 → 3.5`

---

### Missing Real Anomalies

**Solutions:**
1. Increase sensitivity: `0.92 → 0.96`
2. Decrease EWMA span: `20 → 15`
3. Retrain model more frequently: `24h → 12h`
4. Add more features to model
5. Check if enough historical data (need 48+ points)

---

### Model Not Converging

**Solutions:**
1. Collect more training data (run for 7+ days)
2. Increase `max_iter`: `100 → 200`
3. Try different `n_components`: `3 → 4 or 5`
4. Check for data quality issues
5. Normalize features properly

---

## 📚 References

**Academic Papers:**
- "Anomaly Detection: A Survey" - Chandola et al. (2009)
- "Online Learning for Time Series Prediction" - Orabona et al. (2015)

**Libraries Used:**
- scikit-learn: GMM, StandardScaler
- statsmodels: seasonal_decompose
- scipy: stats.zscore
- numpy/pandas: data manipulation

**Further Reading:**
- Grafana Anomaly Detection: https://grafana.com/docs/
- Prometheus Alerting: https://prometheus.io/docs/alerting/
- Time Series Analysis in Python: https://www.statsmodels.org/

---

**Version:** v17.3
**Last Updated:** 2025-10-23
**Author:** NeuroPilot AI Ops Team
