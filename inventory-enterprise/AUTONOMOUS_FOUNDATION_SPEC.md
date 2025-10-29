# Phase 1: Autonomous Foundation
## NeuroNexus Inventory System v19.0

**Document Version:** 1.0
**Author:** Enterprise AI Architecture Team
**Owner:** David Mikulis
**Date:** 2025-10-29
**Status:** APPROVED FOR IMPLEMENTATION

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Automated Forecast Pipeline](#automated-forecast-pipeline)
4. [Intelligent Reorder Engine](#intelligent-reorder-engine)
5. [Auto-Ops & Self-Monitoring](#auto-ops--self-monitoring)
6. [Continuous Learning Framework](#continuous-learning-framework)
7. [Security Automation](#security-automation)
8. [Implementation Guide](#implementation-guide)
9. [Deployment Strategy](#deployment-strategy)
10. [Success Metrics & KPIs](#success-metrics--kpis)

---

## 1. Executive Summary

### 1.1 Vision

Transform NeuroPilot Inventory v18.0-Enterprise into **NeuroNexus v19.0**, a fully autonomous inventory management system that operates with minimal human intervention while maintaining enterprise-grade security and observability.

### 1.2 Current State (v18.0)

**Strengths:**
- ✅ OWASP Top 10 compliant security
- ✅ CORS-hardened with Railway backend + Vercel frontend
- ✅ JWT authentication with audit logging
- ✅ Manual forecast generation capability
- ✅ Database schema supporting ML features

**Limitations:**
- ❌ Manual forecast triggering required
- ❌ No automated retraining pipeline
- ❌ No self-healing capabilities
- ❌ Limited continuous learning
- ❌ Manual deployment validation

### 1.3 Target State (v19.0 - Autonomous)

**Capabilities:**
- ✅ **Self-Learning:** Auto-trains models weekly using live data
- ✅ **Self-Operating:** Generates forecasts & reorders without human trigger
- ✅ **Self-Healing:** Auto-detects issues and rolls back bad deployments
- ✅ **Self-Monitoring:** Continuous health checks with anomaly detection
- ✅ **Self-Securing:** Nightly security scans with auto-remediation

### 1.4 Business Impact

| Metric | Current (v18.0) | Target (v19.0) | Improvement |
|--------|-----------------|----------------|-------------|
| Manual Intervention Required | 8 hours/week | 1 hour/week | **87.5% reduction** |
| Forecast Generation Time | Manual (30 min) | Automated (5 min) | **83% faster** |
| Stockout Detection | Reactive | Proactive (2 weeks ahead) | **Predictive** |
| Model Staleness | Weeks/months | Max 7 days | **Continuous** |
| Security Vulnerability Response | Manual review | Auto-detected nightly | **24hr SLA** |
| System Downtime (deployments) | 5-10 min | < 1 min (auto-rollback) | **80% reduction** |

### 1.5 Technology Stack

**Backend Automation:**
- Node.js cron jobs (node-cron)
- Railway cron triggers
- FastAPI ML microservice

**ML Pipeline:**
- Python 3.11+
- pandas, numpy, scikit-learn
- statsmodels (ETS)
- prophet
- lightgbm

**Monitoring & Observability:**
- OpenTelemetry
- Structured JSON logging
- Health check endpoints
- Email/Slack notifications

**Security:**
- Snyk (dependency scanning)
- OWASP ZAP (dynamic analysis)
- Gitleaks (secret scanning)
- GitHub Actions workflows

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     NeuroNexus v19.0                             │
│                  Autonomous Foundation                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: AUTOMATION ORCHESTRATOR                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Forecast       │  │  Training       │  │  Health         │ │
│  │  Scheduler      │  │  Pipeline       │  │  Monitor        │ │
│  │                 │  │                 │  │                 │ │
│  │  • Daily 2am    │  │  • Weekly       │  │  • Every 5 min  │ │
│  │  • Generate     │  │  • Retrain      │  │  • Check status │ │
│  │  • Notify       │  │  • Evaluate     │  │  • Auto-rollback│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                   │
└───────────────────────────┬───────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│  Layer 2: INTELLIGENCE CORE                                       │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐│
│  │  ML Engine       │  │  Reorder Policy  │  │  Feedback Loop  ││
│  │                  │  │                  │  │                 ││
│  │  • ETS           │  │  • ABC Class     │  │  • Error Store  ││
│  │  • Prophet       │  │  • Safety Stock  │  │  • Adapt Weights││
│  │  • LightGBM      │  │  • ROP Calc      │  │  • Drift Detect ││
│  │  • Ensemble      │  │  • Auto-PO       │  │                 ││
│  └──────────────────┘  └──────────────────┘  └─────────────────┘│
│                                                                    │
└───────────────────────────┬────────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────────┐
│  Layer 3: DATA & OBSERVABILITY                                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  PostgreSQL  │  │  Audit Log   │  │  Metrics     │            │
│  │              │  │              │  │              │            │
│  │  • Usage     │  │  • Hash Chain│  │  • MAPE      │            │
│  │  • Forecasts │  │  • Actions   │  │  • Latency   │            │
│  │  • Orders    │  │  • Decisions │  │  • Coverage  │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Layer 4: SECURITY & COMPLIANCE                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  Nightly Scan  │  │  Secret Rotate │  │  Audit Export  │    │
│  │                │  │                │  │                │    │
│  │  • Snyk        │  │  • JWT Rotate  │  │  • Compliance  │    │
│  │  • ZAP         │  │  • API Keys    │  │  • SOC2 Ready  │    │
│  │  • Gitleaks    │  │  • DB Encrypt  │  │                │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Automation Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     DAILY AUTOMATION CYCLE                        │
└──────────────────────────────────────────────────────────────────┘

   02:00 UTC  │  Forecast Scheduler Triggered
              ▼
   ┌──────────────────────┐
   │ Extract Usage Data   │  Query last 104 weeks
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Load Production      │  Retrieve model from registry
   │ Models               │
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Generate Forecasts   │  All active SKUs (parallel)
   │ (4-week horizon)     │
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Calculate Reorder    │  ABC classification
   │ Recommendations      │  Safety stock + ROP
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Store to Database    │  forecasts + reorder_recommendations
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Notify Approver      │  Email: "15 urgent orders need review"
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Log Audit Trail      │  Forecast generation event + hash chain
   └──────────────────────┘

   02:15 UTC  │  Forecast Complete
              ▼

┌──────────────────────────────────────────────────────────────────┐
│                    WEEKLY RETRAINING CYCLE                        │
└──────────────────────────────────────────────────────────────────┘

   Sunday 03:00 UTC  │  Training Scheduler Triggered
                     ▼
   ┌──────────────────────┐
   │ Check Error Metrics  │  Evaluate MAPE from past week
   └──────────┬───────────┘
              ▼
         [MAPE > 30%?]
              ├─ No ──> Skip training (log decision)
              │
              └─ Yes
                 ▼
   ┌──────────────────────┐
   │ Extract Training     │  104 weeks of usage history
   │ Data                 │
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Engineer Features    │  Lags, rolling stats, seasonality
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Train Models         │  ETS, Prophet, LightGBM per SKU
   │ (Parallel)           │
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Run Backtests        │  Walk-forward validation
   └──────────┬───────────┘
              ▼
         [MAPE improved?]
              ├─ No ──> Keep old model (log decision)
              │
              └─ Yes
                 ▼
   ┌──────────────────────┐
   │ Register New Models  │  Update model_registry table
   │ to Production        │  Set is_production = TRUE
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Notify Admin         │  Email: "Retraining complete, 12 models updated"
   └──────────────────────┘

   05:00 UTC  │  Training Complete
              ▼

┌──────────────────────────────────────────────────────────────────┐
│                  CONTINUOUS HEALTH MONITORING                     │
└──────────────────────────────────────────────────────────────────┘

   Every 5 min  │  Health Check Loop
                ▼
   ┌──────────────────────┐
   │ Ping /health         │  HTTP GET
   └──────────┬───────────┘
              ▼
         [Status 200?]
              ├─ Yes ──> Log success, continue
              │
              └─ No
                 ▼
   ┌──────────────────────┐
   │ Increment Fail Count │  fail_count++
   └──────────┬───────────┘
              ▼
         [fail_count >= 3?]
              ├─ No ──> Continue monitoring
              │
              └─ Yes
                 ▼
   ┌──────────────────────┐
   │ TRIGGER ROLLBACK     │  railway rollback
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Alert Admin          │  PagerDuty/Email: "Auto-rolled back due to health failures"
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │ Create Incident      │  GitHub Issue auto-created
   │ Ticket               │
   └──────────────────────┘
```

### 2.3 Component Responsibilities

| Component | Responsibility | Trigger | Output |
|-----------|---------------|---------|--------|
| **Forecast Scheduler** | Orchestrate daily forecast generation | Cron: Daily 2am UTC | Forecasts in DB + Email notification |
| **Training Pipeline** | Retrain ML models weekly | Cron: Sunday 3am UTC OR MAPE > 35% | Updated model_registry + Performance report |
| **Reorder Engine** | Calculate safety stock & ROP | Post-forecast (automatic) | reorder_recommendations table |
| **Health Monitor** | Check system health every 5 min | Cron: */5 * * * * | Metrics + Auto-rollback on failure |
| **Security Scanner** | Run Snyk + ZAP nightly | Cron: Daily 1am UTC | Vulnerability report + GitHub Issues |
| **Feedback Loop** | Collect approval/rejection data | On order decision | forecast_accuracy table + Weight adjustment |
| **Anomaly Detector** | Detect drift, latency spikes | Continuous (per-request) | Alerts via email/Slack |

---

## 3. Automated Forecast Pipeline

### 3.1 Pipeline Architecture

**Trigger:** Cron job (Railway cron or node-cron)
**Schedule:** Daily at 2:00 AM UTC
**Execution Time:** 5-10 minutes (for 500 SKUs)
**Concurrency:** Process SKUs in batches of 50 (parallel)

### 3.2 Pipeline Steps

```javascript
// Pseudo-code: Forecast Pipeline

async function runDailyForecastPipeline() {
  const startTime = Date.now();

  try {
    // Step 1: Extract active SKUs
    const activeSKUs = await db.query(`
      SELECT sku FROM inventory_items
      WHERE is_active = TRUE
      ORDER BY sku
    `);

    console.log(`[Forecast] Processing ${activeSKUs.length} SKUs`);

    // Step 2: Batch process (50 SKUs at a time)
    const batches = chunkArray(activeSKUs, 50);

    const results = {
      forecasts: [],
      recommendations: [],
      errors: []
    };

    for (const batch of batches) {
      // Parallel processing within batch
      const batchResults = await Promise.all(
        batch.map(({ sku }) => generateForecastForSKU(sku))
      );

      // Collect results
      batchResults.forEach(result => {
        if (result.success) {
          results.forecasts.push(result.forecast);
          results.recommendations.push(result.recommendation);
        } else {
          results.errors.push({ sku: result.sku, error: result.error });
        }
      });
    }

    // Step 3: Store forecasts to database
    await saveForecastsToDatabase(results.forecasts);
    await saveRecommendationsToDatabase(results.recommendations);

    // Step 4: Calculate statistics
    const stats = {
      totalProcessed: activeSKUs.length,
      successCount: results.forecasts.length,
      errorCount: results.errors.length,
      urgentOrders: results.recommendations.filter(r => r.priority === 'urgent').length,
      highOrders: results.recommendations.filter(r => r.priority === 'high').length,
      duration: Date.now() - startTime
    };

    // Step 5: Send notification
    await sendForecastNotification(stats, results.recommendations);

    // Step 6: Log audit event
    await auditLogger.log({
      action: 'daily_forecast_pipeline',
      stats,
      timestamp: new Date().toISOString()
    });

    console.log(`[Forecast] Pipeline complete in ${stats.duration}ms`);

  } catch (error) {
    console.error('[Forecast] Pipeline failed:', error);

    // Alert admin
    await sendAlert({
      severity: 'critical',
      message: `Forecast pipeline failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}
```

### 3.3 Forecast Generation Logic

```javascript
async function generateForecastForSKU(sku) {
  try {
    // 1. Fetch usage history (104 weeks)
    const history = await db.query(`
      SELECT usage_date, quantity_used
      FROM usage_history
      WHERE sku = ?
      ORDER BY usage_date DESC
      LIMIT 104
    `, [sku]);

    if (history.length < 12) {
      return {
        success: false,
        sku,
        error: 'Insufficient history'
      };
    }

    // 2. Load production model from registry
    const model = await loadProductionModel(sku);

    // 3. Generate forecast via ML service
    const forecast = await mlService.predict({
      sku,
      history: history.reverse(), // chronological order
      horizon_weeks: 4,
      model: model.name
    });

    // 4. Calculate reorder recommendation
    const item = await db.get('SELECT * FROM inventory_items WHERE sku = ?', [sku]);
    const recommendation = calculateReorderRecommendation(sku, forecast, item);

    return {
      success: true,
      forecast: {
        sku,
        forecast_date: new Date().toISOString().split('T')[0],
        point_forecast: forecast.point_forecast,
        confidence_score: forecast.confidence_score,
        model_name: model.name,
        model_version: model.version
      },
      recommendation
    };

  } catch (error) {
    return {
      success: false,
      sku,
      error: error.message
    };
  }
}
```

### 3.4 Notification Template

```javascript
async function sendForecastNotification(stats, recommendations) {
  const urgentItems = recommendations.filter(r => r.priority === 'urgent');
  const highItems = recommendations.filter(r => r.priority === 'high');

  const emailBody = `
    <h2>NeuroNexus Daily Forecast Report</h2>
    <p><strong>Generated:</strong> ${new Date().toISOString()}</p>

    <h3>Summary</h3>
    <ul>
      <li>SKUs Processed: ${stats.totalProcessed}</li>
      <li>Forecasts Generated: ${stats.successCount}</li>
      <li>Errors: ${stats.errorCount}</li>
      <li>Pipeline Duration: ${(stats.duration / 1000).toFixed(1)}s</li>
    </ul>

    <h3>Action Required</h3>
    <p><strong style="color: red;">Urgent Orders (${urgentItems.length}):</strong></p>
    <ul>
      ${urgentItems.map(item => `
        <li>${item.sku_name} - ${item.recommended_order_quantity} units
            (${item.days_until_stockout.toFixed(0)} days until stockout)</li>
      `).join('')}
    </ul>

    <p><strong style="color: orange;">High Priority Orders (${highItems.length}):</strong></p>
    <ul>
      ${highItems.map(item => `
        <li>${item.sku_name} - ${item.recommended_order_quantity} units</li>
      `).join('')}
    </ul>

    <p>
      <a href="${process.env.FRONTEND_URL}/suggested-orders">
        View Full Recommendations →
      </a>
    </p>
  `;

  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `[NeuroNexus] Daily Forecast: ${urgentItems.length} Urgent, ${highItems.length} High`,
    html: emailBody
  });
}
```

---

## 4. Intelligent Reorder Engine

### 4.1 ABC Classification Algorithm

```python
# Python implementation for ABC classification

def classify_skus_abc(usage_data: pd.DataFrame) -> pd.DataFrame:
    """
    Classify SKUs into A/B/C classes based on annual consumption value

    A-class: Top 80% of value (typically 20% of SKUs)
    B-class: Next 15% of value (typically 30% of SKUs)
    C-class: Bottom 5% of value (typically 50% of SKUs)
    """
    # Calculate annual usage value per SKU
    annual_value = usage_data.groupby('sku').agg({
        'quantity_used': 'sum',
        'unit_cost': 'first'
    })
    annual_value['annual_value'] = (
        annual_value['quantity_used'] * annual_value['unit_cost']
    )

    # Sort by value descending
    annual_value = annual_value.sort_values('annual_value', ascending=False)

    # Calculate cumulative percentage
    total_value = annual_value['annual_value'].sum()
    annual_value['cumulative_value'] = annual_value['annual_value'].cumsum()
    annual_value['cumulative_pct'] = (
        annual_value['cumulative_value'] / total_value
    )

    # Assign ABC classes
    annual_value['abc_class'] = 'C'
    annual_value.loc[annual_value['cumulative_pct'] <= 0.80, 'abc_class'] = 'A'
    annual_value.loc[
        (annual_value['cumulative_pct'] > 0.80) &
        (annual_value['cumulative_pct'] <= 0.95),
        'abc_class'
    ] = 'B'

    # Assign usage rank
    annual_value['usage_rank'] = range(1, len(annual_value) + 1)

    return annual_value[['abc_class', 'annual_value', 'usage_rank']]
```

### 4.2 Safety Stock & ROP Calculation

```python
import numpy as np
from scipy import stats

# Service level targets by ABC class
SERVICE_LEVELS = {
    'A': 0.99,  # 99% service level (z = 2.33)
    'B': 0.95,  # 95% service level (z = 1.65)
    'C': 0.90   # 90% service level (z = 1.28)
}

Z_SCORES = {
    'A': 2.33,
    'B': 1.65,
    'C': 1.28
}

def calculate_reorder_point(
    sku: str,
    forecasted_demand_4w: float,
    forecast_std: float,
    current_stock: float,
    lead_time_days: int,
    abc_class: str,
    min_order_qty: float = 1.0,
    lot_size: float = 1.0
) -> dict:
    """
    Calculate reorder recommendation with service-level-based safety stock
    """
    # Average daily demand from 4-week forecast
    avg_daily_demand = forecasted_demand_4w / 28

    # Estimate standard deviation of daily demand
    # Conservative: use forecast std / 28
    std_daily_demand = forecast_std / 28 if forecast_std > 0 else avg_daily_demand * 0.15

    # Service level and z-score
    service_level = SERVICE_LEVELS.get(abc_class, 0.95)
    z_score = Z_SCORES.get(abc_class, 1.65)

    # Safety stock formula: SS = z × σ_LT
    # where σ_LT = √(L × σ_d²)  (assuming fixed lead time)
    sigma_lt = np.sqrt(lead_time_days * std_daily_demand**2)
    safety_stock = z_score * sigma_lt

    # Reorder point: ROP = (μ_d × L) + SS
    reorder_point = (avg_daily_demand * lead_time_days) + safety_stock

    # Current on-order quantity (query from database)
    current_on_order = 0  # TODO: Fetch from order_history

    # Stock position = current stock + on order
    stock_position = current_stock + current_on_order

    # Should reorder?
    should_reorder = stock_position < reorder_point

    # Recommended order quantity
    if should_reorder:
        # Target stock = 4 weeks demand + safety stock
        target_stock = forecasted_demand_4w + safety_stock
        order_quantity = max(target_stock - stock_position, 0)

        # Round up to lot size
        order_quantity = np.ceil(order_quantity / lot_size) * lot_size

        # Enforce minimum order quantity
        order_quantity = max(order_quantity, min_order_qty)
    else:
        order_quantity = 0

    # Calculate priority based on days until stockout
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
        'service_level_target': service_level,
        'z_score': z_score,
        'safety_stock': round(safety_stock, 2),
        'reorder_point': round(reorder_point, 2),
        'current_stock': current_stock,
        'current_on_order': current_on_order,
        'stock_position': stock_position,
        'should_reorder': should_reorder,
        'recommended_order_quantity': round(order_quantity, 2),
        'priority': priority,
        'days_until_stockout': round(days_until_stockout, 1)
    }
```

### 4.3 Auto-PO Draft Generation

```javascript
async function generateAutoPODraft(recommendation) {
  if (!recommendation.should_reorder) {
    return null;
  }

  // Get supplier information
  const item = await db.get(
    'SELECT * FROM inventory_items WHERE sku = ?',
    [recommendation.sku]
  );

  const supplier = await db.get(
    'SELECT * FROM suppliers WHERE id = ?',
    [item.supplier_id]
  );

  // Calculate costs
  const unitCost = item.unit_cost;
  const orderQuantity = recommendation.recommended_order_quantity;
  const totalCost = unitCost * orderQuantity;

  // Create draft PO
  const po = {
    po_number: `AUTO-${Date.now()}-${recommendation.sku}`,
    sku: recommendation.sku,
    sku_name: item.name,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    quantity_ordered: orderQuantity,
    unit_cost: unitCost,
    total_cost: totalCost,
    expected_delivery_date: addDays(new Date(), item.lead_time_days),
    status: 'pending_approval',
    generated_by: 'auto_reorder_engine',
    generated_at: new Date().toISOString(),
    recommendation_id: recommendation.id,
    notes: `Auto-generated based on ${recommendation.abc_class}-class reorder policy. ` +
           `Priority: ${recommendation.priority}. ` +
           `Days until stockout: ${recommendation.days_until_stockout}`
  };

  // Save to database
  await db.run(
    `INSERT INTO purchase_orders
     (po_number, sku, supplier_id, quantity_ordered, unit_cost, total_cost,
      expected_delivery_date, status, generated_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [po.po_number, po.sku, po.supplier_id, po.quantity_ordered, po.unit_cost,
     po.total_cost, po.expected_delivery_date, po.status, po.generated_by, po.notes]
  );

  return po;
}
```

---

## 5. Auto-Ops & Self-Monitoring

### 5.1 Health Check System

```bash
#!/bin/bash
# ops_guard.sh - Health check and auto-rollback script

set -euo pipefail

# Configuration
HEALTH_URL="${HEALTH_URL:-https://api.neuropilot.com/health}"
MAX_FAILURES=3
FAILURE_COUNT=0
CHECK_INTERVAL=300  # 5 minutes

LOG_FILE="/var/log/neuronexus/health_check.log"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_health() {
  local response_code
  response_code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10)

  if [ "$response_code" -eq 200 ]; then
    log "✅ Health check PASSED (HTTP $response_code)"
    FAILURE_COUNT=0
    return 0
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    log "❌ Health check FAILED (HTTP $response_code) - Failure $FAILURE_COUNT/$MAX_FAILURES"
    return 1
  fi
}

trigger_rollback() {
  log "🚨 CRITICAL: Max failures reached. Triggering automatic rollback..."

  # Rollback on Railway
  if command -v railway &> /dev/null; then
    railway rollback --yes
    log "✅ Railway rollback initiated"
  else
    log "⚠️ Railway CLI not found, skipping rollback"
  fi

  # Send alert
  send_alert "CRITICAL: Auto-rollback triggered due to health check failures" "urgent"

  # Create GitHub issue
  create_incident_issue "Health check failures - auto-rollback triggered"
}

send_alert() {
  local message=$1
  local severity=${2:-"warning"}

  # Email alert
  if [ -n "${ADMIN_EMAIL:-}" ]; then
    echo "$message" | mail -s "[NeuroNexus] $severity Alert" "$ADMIN_EMAIL"
  fi

  # Slack webhook (if configured)
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"$message\", \"username\": \"NeuroNexus Ops Guard\"}"
  fi
}

create_incident_issue() {
  local title=$1

  if command -v gh &> /dev/null && [ -n "${GITHUB_REPO:-}" ]; then
    gh issue create \
      --repo "$GITHUB_REPO" \
      --title "$title" \
      --body "Automated incident report generated by ops_guard.sh" \
      --label "incident,auto-generated"

    log "✅ GitHub issue created"
  fi
}

# Main monitoring loop
main() {
  log "🚀 Starting NeuroNexus Ops Guard"

  while true; do
    if ! check_health; then
      if [ "$FAILURE_COUNT" -ge "$MAX_FAILURES" ]; then
        trigger_rollback
        break  # Exit after rollback
      fi
    fi

    sleep "$CHECK_INTERVAL"
  done
}

main "$@"
```

### 5.2 Anomaly Detection

```javascript
// Anomaly detector for API latency and error rates

class AnomalyDetector {
  constructor() {
    this.latencyWindow = []; // Last 100 requests
    this.errorRateWindow = []; // Last 100 requests
    this.windowSize = 100;

    // Thresholds
    this.latencyThreshold = 1000; // ms
    this.errorRateThreshold = 0.05; // 5%
  }

  recordRequest(latency, isError) {
    // Add to windows
    this.latencyWindow.push(latency);
    this.errorRateWindow.push(isError ? 1 : 0);

    // Maintain window size
    if (this.latencyWindow.length > this.windowSize) {
      this.latencyWindow.shift();
    }
    if (this.errorRateWindow.length > this.windowSize) {
      this.errorRateWindow.shift();
    }

    // Check for anomalies
    this.detectLatencyAnomaly();
    this.detectErrorRateAnomaly();
  }

  detectLatencyAnomaly() {
    if (this.latencyWindow.length < 50) return; // Need minimum data

    const recentLatency = this.latencyWindow.slice(-10); // Last 10 requests
    const avgRecent = recentLatency.reduce((a, b) => a + b, 0) / recentLatency.length;

    const historical = this.latencyWindow.slice(0, -10);
    const avgHistorical = historical.reduce((a, b) => a + b, 0) / historical.length;
    const stdHistorical = this.calculateStd(historical, avgHistorical);

    // Anomaly if recent avg > historical avg + 3σ
    if (avgRecent > avgHistorical + (3 * stdHistorical)) {
      this.alertAnomaly('latency_spike', {
        avgRecent,
        avgHistorical,
        stdHistorical,
        spike: avgRecent - avgHistorical
      });
    }
  }

  detectErrorRateAnomaly() {
    if (this.errorRateWindow.length < 50) return;

    const recentErrors = this.errorRateWindow.slice(-20).reduce((a, b) => a + b, 0);
    const recentErrorRate = recentErrors / 20;

    if (recentErrorRate > this.errorRateThreshold) {
      this.alertAnomaly('error_rate_spike', {
        recentErrorRate,
        threshold: this.errorRateThreshold
      });
    }
  }

  calculateStd(values, mean) {
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  async alertAnomaly(type, data) {
    console.warn(`[Anomaly] Detected ${type}:`, data);

    await sendAlert({
      severity: 'warning',
      type,
      data,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton
module.exports = new AnomalyDetector();
```

### 5.3 Metrics Collection

```javascript
// OpenTelemetry metrics integration

const { MeterProvider } = require('@opentelemetry/metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

// Setup Prometheus exporter
const exporter = new PrometheusExporter(
  {
    port: 9464,
    startServer: true
  },
  () => {
    console.log('Prometheus exporter running on :9464');
  }
);

const meterProvider = new MeterProvider({ exporter });
const meter = meterProvider.getMeter('neuronexus');

// Metrics
const forecastGenerationCounter = meter.createCounter('forecast_generation_total', {
  description: 'Total number of forecasts generated'
});

const forecastLatencyHistogram = meter.createHistogram('forecast_generation_duration_ms', {
  description: 'Forecast generation latency in milliseconds'
});

const reorderRecommendationCounter = meter.createCounter('reorder_recommendations_total', {
  description: 'Total reorder recommendations generated'
});

const modelAccuracyGauge = meter.createObservableGauge('model_mape', {
  description: 'Current MAPE for active models'
});

module.exports = {
  forecastGenerationCounter,
  forecastLatencyHistogram,
  reorderRecommendationCounter,
  modelAccuracyGauge
};
```

---

## 6. Continuous Learning Framework

### 6.1 Feedback Loop Architecture

```javascript
// Collect feedback from order approvals/rejections

async function recordOrderDecision(recommendationId, decision, adjustedQuantity, userId) {
  const timestamp = new Date();

  // Store decision
  await db.run(`
    UPDATE reorder_recommendations
    SET status = ?,
        approved_by = ?,
        approved_at = ?,
        approved_quantity = ?,
        notes = ?
    WHERE id = ?
  `, [
    decision, // 'approved', 'rejected', 'adjusted'
    userId,
    timestamp.toISOString(),
    adjustedQuantity,
    null,
    recommendationId
  ]);

  // Calculate error if adjusted
  if (decision === 'adjusted') {
    const recommendation = await db.get(
      'SELECT * FROM reorder_recommendations WHERE id = ?',
      [recommendationId]
    );

    const error = Math.abs(adjustedQuantity - recommendation.recommended_order_quantity);
    const errorPct = (error / recommendation.recommended_order_quantity) * 100;

    // Store feedback for model retraining
    await db.run(`
      INSERT INTO forecast_feedback
      (recommendation_id, sku, abc_class, predicted_quantity, actual_quantity, error, error_pct, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      recommendationId,
      recommendation.sku,
      recommendation.abc_class,
      recommendation.recommended_order_quantity,
      adjustedQuantity,
      error,
      errorPct,
      timestamp.toISOString()
    ]);

    // Trigger retraining if error > 25%
    if (errorPct > 25) {
      await triggerRetrainingForSKU(recommendation.sku, 'high_error');
    }
  }
}
```

### 6.2 Adaptive Weight Adjustment

```python
# Adjust ensemble weights based on SKU-level feedback

def adapt_ensemble_weights(sku: str, feedback_data: pd.DataFrame) -> dict:
    """
    Adjust model weights based on historical accuracy

    Args:
        sku: SKU identifier
        feedback_data: DataFrame with columns [model_name, error_pct]

    Returns:
        dict with updated weights per model
    """
    # Calculate inverse error as weight (lower error = higher weight)
    feedback_data['inverse_error'] = 1 / (feedback_data['error_pct'] + 1)

    # Normalize to sum to 1.0
    total = feedback_data['inverse_error'].sum()
    feedback_data['weight'] = feedback_data['inverse_error'] / total

    # Ensure minimum weight of 0.1 for diversity
    feedback_data['weight'] = feedback_data['weight'].clip(lower=0.1)

    # Renormalize
    feedback_data['weight'] = feedback_data['weight'] / feedback_data['weight'].sum()

    weights = feedback_data.set_index('model_name')['weight'].to_dict()

    # Store updated weights
    store_model_weights(sku, weights)

    return weights
```

### 6.3 Drift Detection

```python
import numpy as np
from scipy import stats

def detect_forecast_drift(sku: str, lookback_weeks: int = 4) -> dict:
    """
    Detect if forecast accuracy has degraded significantly

    Returns:
        dict with drift_detected (bool) and metrics
    """
    # Get recent forecast errors
    recent_errors = db.query(f"""
        SELECT error_pct
        FROM forecast_feedback
        WHERE sku = '{sku}'
          AND created_at > datetime('now', '-{lookback_weeks} weeks')
        ORDER BY created_at DESC
    """)

    if len(recent_errors) < 5:
        return {'drift_detected': False, 'reason': 'insufficient_data'}

    # Get historical baseline (weeks 5-16)
    historical_errors = db.query(f"""
        SELECT error_pct
        FROM forecast_feedback
        WHERE sku = '{sku}'
          AND created_at BETWEEN datetime('now', '-16 weeks') AND datetime('now', '-{lookback_weeks} weeks')
        ORDER BY created_at DESC
    """)

    if len(historical_errors) < 5:
        return {'drift_detected': False, 'reason': 'insufficient_baseline'}

    # Perform t-test
    recent_mean = np.mean(recent_errors)
    historical_mean = np.mean(historical_errors)

    t_stat, p_value = stats.ttest_ind(recent_errors, historical_errors)

    # Drift detected if recent errors significantly higher (p < 0.05)
    drift_detected = (p_value < 0.05) and (recent_mean > historical_mean)

    return {
        'drift_detected': drift_detected,
        'recent_mape': recent_mean,
        'historical_mape': historical_mean,
        'p_value': p_value,
        't_statistic': t_stat,
        'recommendation': 'retrain' if drift_detected else 'continue'
    }
```

---

## 7. Security Automation

### 7.1 Nightly Security Scan Workflow

```yaml
# .github/workflows/nightly-security-scan.yml

name: Nightly Security Scan

on:
  schedule:
    - cron: '0 1 * * *'  # 1 AM UTC daily
  workflow_dispatch:  # Manual trigger

jobs:
  dependency-scan:
    name: Snyk Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run Snyk test
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --json-file-output=snyk-results.json

      - name: Parse Snyk results
        id: snyk-parse
        run: |
          VULN_COUNT=$(jq '.vulnerabilities | length' snyk-results.json)
          echo "vuln_count=$VULN_COUNT" >> $GITHUB_OUTPUT

          if [ "$VULN_COUNT" -gt 0 ]; then
            echo "❌ Found $VULN_COUNT high-severity vulnerabilities"
            exit 1
          fi

      - name: Create GitHub issue on failure
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[Security] Snyk found ${{ steps.snyk-parse.outputs.vuln_count }} vulnerabilities`,
              body: `Nightly security scan detected vulnerabilities. See workflow run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              labels: ['security', 'auto-generated']
            })

  zap-scan:
    name: OWASP ZAP Dynamic Scan
    runs-on: ubuntu-latest
    needs: dependency-scan
    steps:
      - uses: actions/checkout@v3

      - name: Start test environment
        run: |
          docker-compose -f docker-compose.test.yml up -d
          sleep 30  # Wait for services to start

      - name: Run ZAP baseline scan
        uses: zaproxy/action-baseline@v0.7.0
        with:
          target: 'http://localhost:8000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j'

      - name: Upload ZAP report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: zap-scan-report
          path: zap-report.html

  secret-scan:
    name: Gitleaks Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  send-summary:
    name: Send Security Summary
    runs-on: ubuntu-latest
    needs: [dependency-scan, zap-scan, secret-scan]
    if: always()
    steps:
      - name: Send email report
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: ${{ secrets.SMTP_SERVER }}
          server_port: 587
          username: ${{ secrets.SMTP_USERNAME }}
          password: ${{ secrets.SMTP_PASSWORD }}
          subject: "[NeuroNexus] Nightly Security Scan Results"
          to: ${{ secrets.ADMIN_EMAIL }}
          from: security@neuropilot.com
          body: |
            Security Scan Summary

            Dependency Scan: ${{ needs.dependency-scan.result }}
            ZAP Scan: ${{ needs.zap-scan.result }}
            Secret Scan: ${{ needs.secret-scan.result }}

            View full report: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

### 7.2 JWT Secret Rotation

```yaml
# .github/workflows/rotate-jwt-secret.yml

name: Rotate JWT Secret (Monthly)

on:
  schedule:
    - cron: '0 0 1 * *'  # 1st of each month at midnight UTC
  workflow_dispatch:

jobs:
  rotate-secret:
    name: Rotate JWT Secret
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Generate new JWT secret
        id: generate
        run: |
          NEW_SECRET=$(openssl rand -hex 64)
          echo "::add-mask::$NEW_SECRET"
          echo "new_secret=$NEW_SECRET" >> $GITHUB_OUTPUT

      - name: Update Railway secret
        run: |
          railway variables set JWT_SECRET="${{ steps.generate.outputs.new_secret }}" --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Wait for deployment
        run: sleep 60

      - name: Verify health after rotation
        run: |
          HEALTH_URL="https://api.neuropilot.com/health"
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

          if [ "$STATUS" -ne 200 ]; then
            echo "❌ Health check failed after secret rotation"
            exit 1
          fi

          echo "✅ Health check passed"

      - name: Send notification
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: ${{ secrets.SMTP_SERVER }}
          server_port: 587
          username: ${{ secrets.SMTP_USERNAME }}
          password: ${{ secrets.SMTP_PASSWORD }}
          subject: "[NeuroNexus] JWT Secret Rotated Successfully"
          to: ${{ secrets.ADMIN_EMAIL }}
          from: security@neuropilot.com
          body: |
            JWT secret has been rotated successfully on $(date).

            Old secret has been invalidated.
            All users will need to re-authenticate on next login.
```

---

## 8. Implementation Guide

### 8.1 Prerequisites

**Required:**
- Node.js 18+
- Python 3.11+
- PostgreSQL or SQLite
- Railway CLI
- GitHub account with Actions enabled

**Environment Variables:**
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/neuronexus

# ML Service
ML_SERVICE_URL=http://localhost:8001

# Email notifications
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=app-specific-password
ADMIN_EMAIL=admin@neuropilot.com

# Slack (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Security
SNYK_TOKEN=your-snyk-token
GITHUB_TOKEN=your-github-pat

# Railway
RAILWAY_TOKEN=your-railway-token
```

### 8.2 Installation Steps

**Step 1: Install Dependencies**

```bash
# Backend dependencies
cd inventory-enterprise
npm install node-cron nodemailer @opentelemetry/metrics

# ML service dependencies
cd ml-service
pip install -r requirements.txt
```

**Step 2: Deploy Scheduler**

```bash
# Copy scheduler to backend
cp ../scheduler.js backend/scheduler.js

# Add to package.json scripts
"scripts": {
  "scheduler": "node backend/scheduler.js"
}
```

**Step 3: Configure Railway Cron**

```toml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run start:production"

[[services]]
name = "api"
command = "node backend/server.js"

[[services]]
name = "scheduler"
command = "node backend/scheduler.js"
cron = "0 2 * * *"  # Daily at 2 AM UTC
```

**Step 4: Deploy ML Service**

```bash
cd ml-service
railway up
```

**Step 5: Configure GitHub Actions**

```bash
# Set secrets in GitHub repo
gh secret set SNYK_TOKEN
gh secret set RAILWAY_TOKEN
gh secret set SMTP_PASSWORD
gh secret set ADMIN_EMAIL

# Copy workflows
mkdir -p .github/workflows
cp ci_cd_autoguard.yml .github/workflows/
```

**Step 6: Enable Health Monitoring**

```bash
# Deploy ops_guard.sh to monitoring server
scp ops_guard.sh user@monitor-server:/opt/neuronexus/
ssh user@monitor-server "chmod +x /opt/neuronexus/ops_guard.sh"

# Add to crontab
*/5 * * * * /opt/neuronexus/ops_guard.sh
```

---

## 9. Deployment Strategy

### 9.1 Phased Rollout

**Week 1: Shadow Mode**
- Deploy automation scripts
- Run forecasts but DON'T send notifications
- Collect metrics, validate accuracy
- **Success Criteria:** 90% forecast completion rate, MAPE < 35%

**Week 2: Notification Only**
- Enable email notifications
- No auto-PO generation yet
- Monitor user feedback
- **Success Criteria:** User review 80%+ of recommendations

**Week 3: Auto-PO Draft**
- Enable auto-PO generation for Medium/Low priority
- Require manual approval for High/Urgent
- **Success Criteria:** 60% approval rate

**Week 4: Full Automation**
- Auto-approve Low priority orders
- Full feedback loop enabled
- Adaptive learning active
- **Success Criteria:** 80% orders automated

### 9.2 Rollback Procedures

**Scenario 1: Forecast Pipeline Failure**
```bash
# Disable scheduler
railway variables set SCHEDULER_ENABLED=false

# Rollback code
git revert HEAD
git push origin main

# Re-enable after fix
railway variables set SCHEDULER_ENABLED=true
```

**Scenario 2: High Error Rate (MAPE > 50%)**
```bash
# Revert to baseline model
psql $DATABASE_URL -c "
  UPDATE model_registry
  SET is_production = FALSE
  WHERE model_name != 'seasonal_naive';

  UPDATE model_registry
  SET is_production = TRUE
  WHERE model_name = 'seasonal_naive';
"
```

**Scenario 3: Security Vulnerability Detected**
```bash
# Immediate: Disable affected endpoint
railway variables set FEATURE_FORECAST_API=false

# Fix vulnerability
npm audit fix --force

# Deploy patch
git commit -am "security: fix critical vulnerability"
git push origin main

# Re-enable
railway variables set FEATURE_FORECAST_API=true
```

---

## 10. Success Metrics & KPIs

### 10.1 Operational Metrics

| Metric | Target | Measurement | Alert Threshold |
|--------|--------|-------------|-----------------|
| **Forecast Generation Success Rate** | > 95% | Daily | < 90% |
| **Forecast Latency** | < 10 min | Per run | > 15 min |
| **Model MAPE (Overall)** | < 30% | Weekly | > 35% |
| **Model MAPE (A-class items)** | < 20% | Weekly | > 25% |
| **Retraining Success Rate** | > 90% | Per run | < 80% |
| **Health Check Uptime** | > 99.5% | Continuous | < 99% |
| **Auto-Rollback Response Time** | < 3 min | Per incident | > 5 min |
| **Security Scan Pass Rate** | 100% (no High vulns) | Nightly | Any High vuln |

### 10.2 Business Impact Metrics

| Metric | Baseline (v18) | Target (v19) | Actual (Track) |
|--------|---------------|--------------|----------------|
| **Manual Intervention Hours/Week** | 8 hours | 1 hour | ___ |
| **Stockout Incidents/Month** | 12 | 5 | ___ |
| **Excess Inventory Value** | $50,000 | $35,000 | ___ |
| **Order Approval Time** | 24 hours | 2 hours | ___ |
| **Forecast-to-Order Conversion** | N/A | 80% | ___ |
| **Cost Savings (Annual)** | - | $100,000 | ___ |

### 10.3 Learning Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| **Feedback Loop Completeness** | > 70% | % of recommendations with approval/rejection data |
| **Model Weight Adaptation Frequency** | Weekly | How often weights are adjusted per SKU |
| **Drift Detection Rate** | < 5% SKUs/month | % of SKUs requiring emergency retraining |
| **Ensemble Improvement vs Baseline** | 15% MAPE reduction | Ensemble MAPE vs Seasonal Naive |

---

## Appendix A: Troubleshooting

### Common Issues

**Issue 1: Forecast Pipeline Hangs**
- **Symptom:** Scheduler runs but never completes
- **Cause:** Database connection timeout or ML service unreachable
- **Fix:**
  ```bash
  # Check ML service health
  curl http://localhost:8001/health

  # Restart ML service
  railway restart ml-service

  # Check database connections
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
  ```

**Issue 2: Email Notifications Not Sending**
- **Symptom:** Pipeline completes but no emails received
- **Cause:** SMTP credentials invalid or Gmail blocking
- **Fix:**
  ```bash
  # Test SMTP connection
  node -e "
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: 587,
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD }
    });
    transport.verify().then(console.log).catch(console.error);
  "

  # Generate Gmail app-specific password
  # https://myaccount.google.com/apppasswords
  ```

**Issue 3: High MAPE After Retraining**
- **Symptom:** Model accuracy degrades after automatic retraining
- **Cause:** Overfitting or data quality issues
- **Fix:**
  ```python
  # Rollback to previous model
  rollback_model(sku, target_version='previous')

  # Investigate data quality
  check_data_quality(sku, lookback_weeks=12)

  # Adjust hyperparameters
  retrain_with_conservative_params(sku)
  ```

---

## Appendix B: Architecture Diagram (ASCII)

```
                    ┌─────────────────────────────────────┐
                    │     NEURONEXUS v19.0 AUTONOMOUS     │
                    └─────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ORCHESTRATION LAYER (Node.js Cron)                               │
│                                                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │   Daily      │───>│   Weekly     │───>│  Continuous  │        │
│  │   Forecast   │    │   Retrain    │    │   Monitor    │        │
│  │   2am UTC    │    │   Sun 3am    │    │   Every 5min │        │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘        │
│         │                   │                   │                 │
└─────────┼───────────────────┼───────────────────┼─────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  INTELLIGENCE CORE (Python/FastAPI)                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ML Pipeline                                                ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       ││
│  │  │   ETS   │  │ Prophet │  │ LightGBM│  │Ensemble │       ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Reorder Policy Engine                                      ││
│  │  ABC Class → Service Level → Safety Stock → ROP            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  DATA LAYER (PostgreSQL)                                         │
│                                                                   │
│  [usage_history] ─> [forecasts] ─> [reorder_recommendations]   │
│                                                                   │
│  [model_registry] ─> [forecast_accuracy] ─> [feedback_loop]    │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  OBSERVABILITY (OpenTelemetry + Prometheus)                      │
│                                                                   │
│  Metrics: MAPE, Latency, Error Rate, Uptime                     │
│  Logs: Structured JSON with trace IDs                           │
│  Alerts: Email, Slack, PagerDuty                                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

**END OF AUTONOMOUS FOUNDATION SPECIFICATION**

**Document Status:** APPROVED FOR IMPLEMENTATION
**Next Review:** Post Phase 1 Deployment (Week 5)
**Document Owner:** Enterprise AI Architecture Team
**Approver:** David Mikulis

---

## Next Phase Roadmap (v20.0 - Multi-Agent Orchestration)

After Phase 1 is stable (Week 5+), consider:

1. **Multi-Location Optimization:** Transfer recommendations between warehouses
2. **Supplier Reliability Agent:** Auto-score suppliers based on lead time variance
3. **Price Elasticity Agent:** Dynamic pricing based on demand forecasts
4. **Sustainability Agent:** Carbon footprint optimization in ordering decisions
5. **Voice Interface:** Alexa/Google Home integration for verbal approvals
6. **Blockchain Audit Trail:** Immutable compliance logging for SOC2

**Target:** v20.0 launch Q2 2026
