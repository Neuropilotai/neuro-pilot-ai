# 🏥 Health Audit System - v1.0.0

## 📋 Overview

The Health Audit System provides comprehensive monitoring and diagnostics for the inventory management platform using **integer-cent math** for financial accuracy and **service-level awareness** for demand forecasting.

## ✨ Key Features

### 1. **Invoice Integrity Checks**
- ✅ Automatic deduplication by (Vendor, Invoice #, Date)
- ✅ Balance validation (Σ line items = total invoice)
- ✅ Integer-cent precision (no floating-point errors)
- ✅ Automatic fiscal period normalization (FY25-P01 format)
- ✅ Micro-drift clamping (±2¢ tolerance)

### 2. **FIFO Layer Reconciliation**
- ✅ Negative quantity detection
- ✅ Zero/negative cost detection and auto-fix
- ✅ Automatic cost recovery from recent invoices
- ✅ Layer integrity validation

### 3. **Price Sanity Checks**
- ✅ Spike detection (35% deviation threshold)
- ✅ 60-day rolling price median
- ✅ Latest vs. median comparison
- ✅ Alerts for significant deviations

### 4. **Orphan SKU Detection**
- ✅ Identifies unknown SKUs in invoices
- ✅ Identifies unknown SKUs in FIFO layers
- ✅ Helps maintain data integrity

### 5. **Stockout Risk Assessment**
- ✅ Service-level aware (95% default)
- ✅ MAD-based demand variability
- ✅ Safety stock calculation
- ✅ Re-order point recommendation
- ✅ 14-day forecast horizon

### 6. **Intelligent Retrain Governance**
- ✅ Throttled retraining (minimum 20 new invoices)
- ✅ Cooldown period (24 hours between retrains)
- ✅ Prevents model thrashing
- ✅ Automatic trigger when needed

### 7. **Health Scoring (0-100 scale)**
- **90-100**: ✅ Healthy
- **75-89**:  ⚠️  Monitor
- **0-74**:   🚨 Needs Attention

## 🚀 Quick Start

### 1. API Endpoints

All endpoints require Owner authentication:

```bash
# Full health audit
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/summary

# Quick health score only
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/score

# Stockout risks only
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/stockouts

# Issues list only
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/issues

# Trigger manual audit
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/audit
```

### 2. Programmatic Usage

```javascript
const { runHealthAudit } = require('./health/health-audit.js');

async function checkSystemHealth() {
  const report = await runHealthAudit();

  console.log('Health Score:', report.summary.health_score);
  console.log('Status:', report.summary.status);
  console.log('Issues:', report.issues.length);
  console.log('Stockout Risks:', report.summary.stockout_risk_count);

  // Check if retraining is needed
  if (report.summary.should_retrain) {
    console.log('🧠 System recommends retraining forecast models');
  }
}
```

### 3. Scheduled Health Checks

Enable automatic health monitoring:

```javascript
const healthService = require('./health/scheduled-health-check.js');

// Start scheduled checks (default: every 6 hours)
healthService.start();

// Get service status
const status = healthService.getStatus();
console.log('Health service running:', status.running);
console.log('Last health score:', status.lastScore);

// Manually trigger a check
await healthService.triggerManual();

// Stop service
healthService.stop();
```

## 📊 Health Report Structure

### Summary Object

```javascript
{
  summary: {
    health_score: 95,              // 0-100 scale
    status: "Healthy",             // Healthy | Monitor | Needs Attention
    fixed_mutations: 12,           // Auto-fixes applied
    should_retrain: false,         // Retrain recommendation
    stockout_risk_count: 3,        // Items at risk
    total_items: 457,              // Total items in catalog
    total_invoices: 1234,          // Total invoices processed
    audit_date: "2025-10-15"       // Audit execution date
  },
  issues: [                        // Detected issues
    {
      type: "INVOICE_IMBALANCE",
      invoice_no: "INV-12345",
      cents_off: 5,
      reported: "123.45",
      calculated: "123.40"
    },
    {
      type: "PRICE_SPIKE",
      sku: "ITEM-001",
      latest: "15.99",
      median: "10.50",
      deviation: "52.3%"
    }
  ],
  stockoutRisks: [                 // Items at stockout risk
    {
      sku: "ITEM-002",
      name: "Premium Steak",
      onHand: 12,
      safetyStock: 25,
      reorderPoint: 45,
      next14dForecast: 30,
      projectedStock: -18          // Negative = stockout
    }
  ]
}
```

## 🔧 Configuration

Edit `backend/health/health-audit.js`:

```javascript
const CONFIG = {
  DATABASE_PATH: process.env.DATABASE_PATH || './data/enterprise_inventory.db',
  TARGET_SERVICE_LEVEL: 0.95,      // 95% service level
  LEAD_TIME_DAYS_DEFAULT: 10,      // Default lead time
  RETRAIN_MIN_NEW_INVOICES: 20,    // Min invoices before retrain
  MAX_PRICE_DEVIATION: 0.35,       // 35% price spike threshold
  LOOKBACK_DAYS_DEMAND: 56,        // 8 weeks demand history
  LOOKBACK_DAYS_PRICE: 60,         // 60 days price window
  FORECAST_HORIZON_DAYS: 14        // 2 weeks forecast horizon
};
```

Edit `backend/health/scheduled-health-check.js`:

```javascript
const CONFIG = {
  // Cron schedule (every 6 hours)
  SCHEDULE: '0 */6 * * *',

  // Alert thresholds
  ALERT_THRESHOLD_CRITICAL: 60,
  ALERT_THRESHOLD_WARNING: 75,

  // Retrain configuration
  ENABLE_AUTO_RETRAIN: true,
  RETRAIN_COOLDOWN_HOURS: 24,

  // Logging
  VERBOSE: false
};
```

## 📈 Health Score Calculation

Health scores start at 100 and deduct points for issues:

| Issue Type | Penalty | Max Deduction |
|------------|---------|---------------|
| Duplicate Invoices | 3 pts each | 30 pts |
| Invoice Imbalances | 5 pts each | 30 pts |
| Negative FIFO Qty | 4 pts each | 20 pts |
| Price Spikes | 2 pts each | 10 pts |
| Orphan SKUs | 2 pts each | 10 pts |
| Stockout Risks | 1 pt per 25 items | 15 pts |

**Final Score** = max(0, 100 - Σ(penalties))

## 🚨 Issue Types Reference

### Invoice Issues

#### `DUP_INVOICE`
**Description:** Duplicate invoice detected (same vendor, invoice #, date)
**Action:** Automatically skipped; only first occurrence kept
**Example:**
```json
{
  "type": "DUP_INVOICE",
  "invoice_no": "INV-12345",
  "vendor": "GFS",
  "date": "2025-10-15"
}
```

#### `INVOICE_IMBALANCE`
**Description:** Line item sum doesn't match total invoice amount (>2¢ difference)
**Action:** Flagged for manual review
**Example:**
```json
{
  "type": "INVOICE_IMBALANCE",
  "invoice_no": "INV-12345",
  "cents_off": 15,
  "reported": "1234.56",
  "calculated": "1234.41"
}
```

### FIFO Issues

#### `FIFO_BAD_COST`
**Description:** FIFO layer has negative or zero unit cost
**Action:** Auto-fix attempted using recent invoice cost
**Example:**
```json
{
  "type": "FIFO_BAD_COST",
  "sku": "ITEM-001",
  "lot": "LOT-456",
  "cost": "-5.00"
}
```

#### `FIFO_NEG_QTY`
**Description:** FIFO layer has negative quantity (data corruption)
**Action:** Flagged for manual review
**Example:**
```json
{
  "type": "FIFO_NEG_QTY",
  "sku": "ITEM-001",
  "lot": "LOT-456",
  "qty": -10
}
```

### Price Issues

#### `PRICE_SPIKE`
**Description:** Latest price deviates >35% from 60-day median
**Action:** Flagged for review (possible data error or market change)
**Example:**
```json
{
  "type": "PRICE_SPIKE",
  "sku": "ITEM-001",
  "latest": "15.99",
  "median": "10.50",
  "deviation": "52.3%"
}
```

### SKU Issues

#### `ORPHAN_SKU_INVOICE`
**Description:** Invoice line item references unknown SKU
**Action:** Flagged for item bank update
**Example:**
```json
{
  "type": "ORPHAN_SKU_INVOICE",
  "sku": "UNKNOWN-123",
  "invoice_no": "INV-789"
}
```

#### `ORPHAN_SKU_FIFO`
**Description:** FIFO layer references unknown SKU
**Action:** Flagged for item bank update or layer cleanup
**Example:**
```json
{
  "type": "ORPHAN_SKU_FIFO",
  "sku": "UNKNOWN-456",
  "lot": "LOT-789"
}
```

## 🎯 Best Practices

### 1. **Regular Monitoring**
- Enable scheduled health checks (every 6 hours recommended)
- Set up alerts for critical health scores (<60)
- Review issues weekly

### 2. **Data Quality**
- Keep item bank up to date (prevent orphan SKUs)
- Verify invoice imports (check balance before finalizing)
- Monitor price spikes (may indicate errors)

### 3. **Inventory Management**
- Act on stockout risks promptly
- Maintain adequate safety stock levels
- Review reorder points quarterly

### 4. **Model Maintenance**
- Allow automatic retraining when recommended
- Monitor forecast accuracy
- Adjust service level targets as needed

## 🔍 Troubleshooting

### Issue: "Health score dropping unexpectedly"

**Diagnosis:** Run detailed audit
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/summary | jq '.issues'
```

**Common Causes:**
- Recent bulk invoice import with errors
- Price data corruption
- FIFO layer issues after physical count

**Solution:**
1. Review issues list
2. Fix data at source
3. Re-run audit to verify

### Issue: "High stockout risk count"

**Diagnosis:** Check specific items
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8083/api/health/stockouts | jq '.data.risks'
```

**Solution:**
1. Review forecasted demand
2. Adjust safety stock levels
3. Place orders for at-risk items

### Issue: "Retrain not triggering"

**Diagnosis:** Check retrain status
```javascript
const healthService = require('./health/scheduled-health-check');
const status = healthService.getStatus();
console.log('Last retrain:', status.lastRetrain);
console.log('Auto-retrain enabled:', status.autoRetrainEnabled);
```

**Solution:**
1. Verify `ENABLE_AUTO_RETRAIN=true`
2. Check cooldown period (24h default)
3. Manually trigger if needed

## 📝 Integration Examples

### Example 1: Dashboard Widget

```javascript
async function refreshHealthWidget() {
  const response = await fetch('/api/health/score', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { data } = await response.json();

  document.getElementById('health-score').textContent = data.health_score + '%';
  document.getElementById('health-status').textContent = data.status;
  document.getElementById('health-status').className =
    data.status === 'Healthy' ? 'badge-success' :
    data.status === 'Monitor' ? 'badge-warning' : 'badge-danger';
}

// Update every 5 minutes
setInterval(refreshHealthWidget, 5 * 60 * 1000);
```

### Example 2: Slack Alerts

```javascript
async function sendHealthAlert(report) {
  if (report.summary.health_score < 75) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        text: `🚨 System Health Alert: ${report.summary.health_score}%`,
        attachments: [{
          color: report.summary.health_score < 60 ? 'danger' : 'warning',
          fields: [
            { title: 'Status', value: report.summary.status, short: true },
            { title: 'Issues', value: report.issues.length, short: true },
            { title: 'Stockouts', value: report.summary.stockout_risk_count, short: true }
          ]
        }]
      })
    });
  }
}
```

### Example 3: Automated Remediation

```javascript
const { runHealthAudit } = require('./health/health-audit');

async function autoRemediate() {
  const report = await runHealthAudit();

  // Handle orphan SKUs
  const orphans = report.issues.filter(i => i.type.startsWith('ORPHAN'));
  for (const orphan of orphans) {
    await createItemBankEntry(orphan.sku);
  }

  // Handle stockout risks
  for (const risk of report.stockoutRisks) {
    if (risk.projectedStock < 0) {
      await createPurchaseOrder(risk.sku, risk.reorderPoint - risk.onHand);
    }
  }
}
```

## 📚 Additional Resources

- **Fiscal Report Fix**: See `FY_REPORT_FIX_README.md` for integer-cent math details
- **Service Level Theory**: [Wikipedia - Safety Stock](https://en.wikipedia.org/wiki/Safety_stock)
- **MAD vs StdDev**: [Robust Statistics](https://en.wikipedia.org/wiki/Median_absolute_deviation)

## 🤝 Support

**System Owner:** David Mikulis
**Contact:** Neuro.Pilot.AI@gmail.com

---

**Version:** 1.0.0
**Created:** October 15, 2025
**License:** MIT
