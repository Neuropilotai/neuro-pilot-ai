# Owner Console AI Operational Intelligence Addon - v2.8.0

## 🎯 Overview

The Owner Console AI Addon enhances the base Owner Console with AI-driven operational recommendations, anomaly detection, and system optimization advice. This Phase 2 enhancement provides actionable intelligence with one-click actions for inventory management optimization.

**Base Documentation:** [OWNER_CONSOLE_GUIDE.md](./OWNER_CONSOLE_GUIDE.md)

---

## 🚀 New Features

### 1. **Reorder Recommendations Widget**
AI-powered inventory reorder suggestions based on demand forecasting, current stock levels, and lead times.

### 2. **Anomaly Watchlist Widget**
Real-time detection and triage of consumption spikes, shrinkage, and data quality issues.

### 3. **System Upgrade Advisor Widget**
Performance analysis and optimization recommendations based on live metrics.

---

## 📡 API Endpoints

### Base URL
```
http://localhost:8083/api/owner/ai
```

### Authentication
All endpoints require:
- JWT token (Bearer authentication)
- Owner email: `neuro.pilot.ai@gmail.com`
- Admin role

---

## 1. Reorder Recommendations

### GET `/reorder/top`
Returns top-N SKUs predicted to need reorder based on AI forecasting.

**Query Parameters:**
- `n` (optional): Number of recommendations (default: 20)

**Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/owner/ai/reorder/top?n=5"
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "recommendations": [
    {
      "itemCode": "APPLE-GALA",
      "name": "Gala Apples 5lb",
      "horizonDays": 30,
      "predictedDemand": 420,
      "currentStock": 210,
      "projectedStockoutDate": "2025-10-21",
      "recommendedReorderQty": 300,
      "safetyStock": 120,
      "leadTimeDays": 7,
      "confidence": 0.88,
      "drivers": [
        "seasonality(+)",
        "trend(+)",
        "promotion(+)",
        "variance(-)"
      ]
    },
    {
      "itemCode": "MILK-2%",
      "name": "Milk 2% 1gal",
      "horizonDays": 7,
      "predictedDemand": 180,
      "currentStock": 95,
      "projectedStockoutDate": "2025-10-11",
      "recommendedReorderQty": 120,
      "safetyStock": 60,
      "leadTimeDays": 3,
      "confidence": 0.79,
      "drivers": [
        "spike(+)",
        "weekday_pattern(+)",
        "promo(-)"
      ]
    }
  ],
  "generatedAt": "2025-10-08T22:15:30.123Z",
  "latency": 142
}
```

**Driver Explanations:**
- `urgency(+)`: Stockout imminent (< 7 days)
- `below_safety_stock(+)`: Current stock below safety threshold
- `high_confidence(+)`: Forecast confidence > 0.8
- `demand_spike(+)`: Predicted demand 1.5x+ current stock
- `long_lead_time(-)`: Lead time > 5 days (risk factor)
- `seasonality(+)`: Seasonal demand pattern detected
- `trend(+)`: Upward demand trend
- `promotion(+)`: Promotional event expected
- `variance(-)`: High forecast variance (uncertainty)

---

### POST `/reorder/create-draft`
Creates draft purchase orders (non-destructive, no vendor submission).

**Rate Limit:** 1 request per minute

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"itemCode": "APPLE-GALA", "qty": 300, "rationale": "Projected stockout 2025-10-21"},
      {"itemCode": "MILK-2%", "qty": 120, "rationale": "Below safety stock"}
    ]
  }' \
  http://localhost:8083/api/owner/ai/reorder/create-draft
```

**Response:**
```json
{
  "success": true,
  "draftId": "DRAFT_PO_1759962130456",
  "lineCount": 2,
  "message": "Draft PO created successfully",
  "latency": 45
}
```

**Audit Log Entry:**
- Event: `OWNER_AI_ACTION`
- Action: `CREATE_DRAFT_PO`
- Payload: MD5 hash of items
- Result: Draft PO ID

---

## 2. Anomaly Detection

### GET `/anomalies/recent`
Returns recent consumption/ops anomalies with triage suggestions.

**Query Parameters:**
- `window` (optional): Time window (`7d` or `30d`, default: `7d`)

**Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/owner/ai/anomalies/recent?window=7d"
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "window": "7d",
  "anomalies": [
    {
      "id": "anom_7812",
      "itemCode": "MILK-2%",
      "type": "consumption_spike",
      "severity": "high",
      "when": "2025-10-08T11:24:00Z",
      "explanation": "Consumption 3.2x baseline, z-score=3.1",
      "suggestedActions": [
        "open_spot_check",
        "freeze_reorder",
        "notify_ops"
      ],
      "confidence": 0.81
    },
    {
      "id": "anom_7813",
      "itemCode": "BREAD-WHITE",
      "type": "shrinkage",
      "severity": "medium",
      "when": "2025-10-07T16:45:00Z",
      "explanation": "Inventory loss 12% over 3 days",
      "suggestedActions": [
        "open_spot_check",
        "freeze_reorder"
      ],
      "confidence": 0.74
    },
    {
      "id": "anom_7814",
      "itemCode": "EGGS-DOZEN",
      "type": "data_quality",
      "severity": "low",
      "when": "2025-10-06T09:15:00Z",
      "explanation": "Inconsistent quantity updates detected",
      "suggestedActions": [
        "ignore_once",
        "notify_ops"
      ],
      "confidence": 0.68
    }
  ],
  "generatedAt": "2025-10-08T22:20:15.789Z",
  "latency": 89
}
```

**Anomaly Types:**
- `consumption_spike`: Unexpected demand increase
- `shrinkage`: Inventory loss/waste
- `data_quality`: Data inconsistency issues

**Severity Levels:**
- `critical`: Immediate action required
- `high`: Urgent attention needed
- `medium`: Should investigate
- `low`: Monitor situation

---

### POST `/anomalies/triage`
Execute triage action on anomaly.

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "anom_7812",
    "action": "freeze_reorder"
  }' \
  http://localhost:8083/api/owner/ai/anomalies/triage
```

**Valid Actions:**
- `open_spot_check`: Create physical count task
- `freeze_reorder`: Temporarily halt reorders (7 days)
- `ignore_once`: Mark as reviewed, no action

**Response:**
```json
{
  "success": true,
  "id": "anom_7812",
  "action": "freeze_reorder",
  "result": {
    "status": "executed",
    "severity": "high",
    "action": "freeze_reorder",
    "message": "Reorder frozen for 7 days"
  },
  "latency": 34
}
```

**Metrics Recorded:**
- `owner_ai_anomaly_triage_total{action="freeze_reorder",severity="high"}`: 1

---

## 3. System Upgrade Advisor

### GET `/upgrade/advice`
Analyzes system metrics and provides optimization recommendations.

**Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/upgrade/advice
```

**Response:**
```json
{
  "success": true,
  "advice": {
    "cache": {
      "hitRate": 0.71,
      "advice": "Low cache efficiency. Consider raising TTL to 180s"
    },
    "forecast": {
      "mape30": 0.12,
      "advice": "Forecast accuracy acceptable. Continue monitoring"
    },
    "db": {
      "primary": "sqlite",
      "advice": "Enable PostgreSQL dual-write for production scalability"
    },
    "security": {
      "twoFAAdmins": "1/1",
      "advice": "Enforce 2FA for all users with edit permissions"
    },
    "overallScore": 0.86,
    "nextBestActions": [
      {
        "id": "nba_cache_ttl",
        "title": "Increase cache TTL for inventory lists",
        "etaMin": 5,
        "impact": "high"
      },
      {
        "id": "nba_enable_postgres",
        "title": "Enable PostgreSQL dual-write mode",
        "etaMin": 10,
        "impact": "high"
      }
    ]
  },
  "generatedAt": "2025-10-08T22:25:45.321Z",
  "latency": 67
}
```

---

### POST `/upgrade/apply`
Apply safe system optimization.

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actionId": "nba_cache_ttl"}' \
  http://localhost:8083/api/owner/ai/upgrade/apply
```

**Response (Safe Action):**
```json
{
  "success": true,
  "actionId": "nba_cache_ttl",
  "result": {
    "status": "requires-confirmation",
    "mode": "safe",
    "actionId": "nba_cache_ttl",
    "message": "Cache TTL change requires server restart",
    "diff": {
      "before": "CACHE_TTL=120",
      "after": "CACHE_TTL=300"
    }
  },
  "latency": 12
}
```

**Response (Risky Action):**
```json
{
  "success": true,
  "actionId": "nba_enable_postgres",
  "result": {
    "status": "requires-confirmation",
    "mode": "risky",
    "message": "PostgreSQL migration requires planning and testing"
  },
  "latency": 8
}
```

**Action Modes:**
- `safe`: Non-destructive, reversible
- `risky`: Requires planning, testing, or may cause downtime

---

## 🔒 Security Features

### Access Control
```javascript
// Middleware enforcement
function requireOwner(req, res, next) {
  if (req.user.email !== 'neuro.pilot.ai@gmail.com') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'AI operational intelligence is restricted to system owner'
    });
  }
  next();
}
```

### Rate Limiting
- **Bulk actions** (create-draft PO): 1 per minute
- **Individual actions**: No limit
- **429 Response** when exceeded:
```json
{
  "error": "Rate limit exceeded",
  "message": "Bulk actions limited to 1 per minute",
  "retryAfter": 45
}
```

### Audit Logging
All POST actions logged with:
- User ID and email
- IP address
- Action type
- Payload hash (MD5, no PII)
- Result summary
- Timestamp

Query audit logs:
```sql
SELECT * FROM audit_logs
WHERE event_type = 'OWNER_AI_ACTION'
  AND user_email = 'neuro.pilot.ai@gmail.com'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 📊 Prometheus Metrics

### New Metrics Added

**Reorder Requests:**
```
owner_ai_reorder_requests_total{actor="user123",tenant="default"} 15
```

**Anomaly Triage:**
```
owner_ai_anomaly_triage_total{action="freeze_reorder",severity="high"} 3
owner_ai_anomaly_triage_total{action="open_spot_check",severity="critical"} 2
```

**Upgrade Actions:**
```
owner_ai_upgrade_actions_total{action="nba_cache_ttl",mode="safe"} 1
owner_ai_upgrade_actions_total{action="nba_enable_postgres",mode="risky"} 0
```

**Widget Latency:**
```
owner_ai_widget_latency_seconds_bucket{widget="reorder",le="0.5"} 42
owner_ai_widget_latency_seconds_bucket{widget="anomalies",le="0.5"} 38
owner_ai_widget_latency_seconds_bucket{widget="advisor",le="0.5"} 35
```

### Query Metrics
```bash
# Get total reorder requests
curl http://localhost:8083/metrics | grep owner_ai_reorder

# Get anomaly triage by action
curl http://localhost:8083/metrics | grep owner_ai_anomaly_triage

# Get widget performance
curl http://localhost:8083/metrics | grep owner_ai_widget_latency
```

---

## 🖥️ Frontend Integration (HTML/JavaScript)

### Example: Reorder Recommendations Widget

```html
<!-- Reorder Widget Container -->
<div id="reorderWidget" class="widget glass-effect p-6 rounded-xl">
  <h3 class="text-xl font-bold mb-4">🔄 Reorder Recommendations</h3>
  <div id="reorderTable"></div>
  <button onclick="createDraftPO()" class="btn-primary mt-4">
    Create Draft PO
  </button>
</div>

<script>
// Fetch reorder recommendations
async function loadReorderRecommendations() {
  const startTime = Date.now();

  try {
    const response = await fetch('/api/owner/ai/reorder/top?n=10', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    // Render table
    renderReorderTable(data.recommendations);

    // Record latency metric (client-side)
    const latency = (Date.now() - startTime) / 1000;
    console.log(`Reorder widget loaded in ${latency}s`);

  } catch (error) {
    console.error('Failed to load reorder recommendations:', error);
  }
}

// Render recommendations table
function renderReorderTable(items) {
  const html = `
    <table class="w-full">
      <thead>
        <tr>
          <th>Item</th>
          <th>Stock</th>
          <th>Predicted Demand</th>
          <th>Stockout Date</th>
          <th>Rec. Qty</th>
          <th>Confidence</th>
          <th>Drivers</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr class="${getUrgencyClass(item.projectedStockoutDate)}">
            <td>${item.name}</td>
            <td>${item.currentStock}</td>
            <td>${item.predictedDemand}</td>
            <td>${item.projectedStockoutDate}</td>
            <td>${item.recommendedReorderQty}</td>
            <td>
              <span class="confidence-badge">${(item.confidence * 100).toFixed(0)}%</span>
            </td>
            <td>
              <div class="drivers-tooltip" data-drivers='${JSON.stringify(item.drivers)}'>
                ${item.drivers.length} factors
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('reorderTable').innerHTML = html;
}

// Get urgency CSS class based on stockout date
function getUrgencyClass(stockoutDate) {
  const days = Math.floor((new Date(stockoutDate) - new Date()) / 86400000);
  if (days < 7) return 'bg-red-50 border-red-300';
  if (days < 14) return 'bg-yellow-50 border-yellow-300';
  return 'bg-green-50 border-green-300';
}

// Auto-refresh every 60 seconds
setInterval(loadReorderRecommendations, 60000);
</script>
```

---

## 🔄 WebSocket Integration

### Real-Time Updates

**Connect to WebSocket:**
```javascript
const ws = new WebSocket('ws://localhost:8083/ai/realtime');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'forecast:update':
      // Invalidate reorder cache and reload
      loadReorderRecommendations();
      break;

    case 'anomaly:alert':
      // Toast notification + highlight row
      showToast(`New anomaly detected: ${message.itemCode}`, 'warning');
      highlightAnomaly(message.id, 10000); // 10s highlight
      loadAnomalies();
      break;

    case 'system:metric_update':
      // Refresh advisor widget
      loadUpgradeAdvice();
      break;
  }
};
```

**Polling Cadence (with WebSocket as primary):**
- Reorder: 60s (fallback if WS disconnected)
- Anomalies: 30s
- Advisor: 120s
- Exponential backoff on failure (2x, max 5 min)

---

## 🧪 Testing Examples

### Test Reorder Recommendations
```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.token')

# Get top 5 reorder recommendations
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/owner/ai/reorder/top?n=5" | jq

# Create draft PO
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"itemCode":"APPLE-GALA","qty":300,"rationale":"Stockout 2025-10-21"}
    ]
  }' \
  http://localhost:8083/api/owner/ai/reorder/create-draft | jq
```

### Test Anomaly Detection
```bash
# Get recent anomalies
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/owner/ai/anomalies/recent?window=7d" | jq

# Triage anomaly
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"anom_7812","action":"freeze_reorder"}' \
  http://localhost:8083/api/owner/ai/anomalies/triage | jq
```

### Test System Advisor
```bash
# Get upgrade advice
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/upgrade/advice | jq

# Apply upgrade action
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actionId":"nba_cache_ttl"}' \
  http://localhost:8083/api/owner/ai/upgrade/apply | jq
```

---

## 📋 Database Schema Additions

### Draft Purchase Orders Table
```sql
CREATE TABLE draft_purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  rationale TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_draft_id (draft_id),
  INDEX idx_created_at (created_at)
);
```

### Anomaly Predictions Table (extends existing)
```sql
ALTER TABLE ai_anomaly_predictions ADD COLUMN triage_action TEXT;
ALTER TABLE ai_anomaly_predictions ADD COLUMN triage_by TEXT;
ALTER TABLE ai_anomaly_predictions ADD COLUMN triage_at TIMESTAMP;
```

### Item Master Extensions (if needed)
```sql
ALTER TABLE item_master ADD COLUMN reorder_frozen INTEGER DEFAULT 0;
ALTER TABLE item_master ADD COLUMN reorder_freeze_until TIMESTAMP;
```

---

## 🚨 Error Handling

### Common Errors

**403 Forbidden (Non-Owner Access):**
```json
{
  "error": "Access denied",
  "message": "AI operational intelligence is restricted to system owner"
}
```

**429 Rate Limit:**
```json
{
  "error": "Rate limit exceeded",
  "message": "Bulk actions limited to 1 per minute",
  "retryAfter": 45
}
```

**400 Bad Request (Invalid Action):**
```json
{
  "error": "Invalid action",
  "validActions": ["open_spot_check", "freeze_reorder", "ignore_once"]
}
```

**500 Server Error:**
```json
{
  "error": "Database query failed: SQLITE_ERROR"
}
```

---

## 🔄 Graceful Degradation

### SQLite Fallback
When PostgreSQL unavailable:
- Uses SQLite for all queries
- Forecast data from `forecast_results` table
- Anomalies from `ai_anomaly_predictions` table
- No performance impact for small datasets

### Redis Fallback
When Redis unavailable:
- Metrics still available (in-memory)
- No caching, direct DB queries
- Slightly higher latency (~100ms)

---

## 📈 Performance Benchmarks

**Widget Load Times:**
- Reorder (20 items): ~150ms
- Anomalies (50 items): ~90ms
- Advisor: ~70ms

**API Response Times:**
- GET /reorder/top: 100-200ms
- GET /anomalies/recent: 50-100ms
- GET /upgrade/advice: 40-80ms
- POST /reorder/create-draft: 30-60ms
- POST /anomalies/triage: 20-50ms
- POST /upgrade/apply: 10-30ms

**Database Queries:**
- Reorder recommendations: 1-2 queries
- Anomaly detection: 1 query
- Upgrade advice: 0 queries (metrics parsing)

---

## 📞 Support

**Owner:** David Mikulis
**Email:** neuro.pilot.ai@gmail.com
**Documentation:**
- Base Console: `/docs/OWNER_CONSOLE_GUIDE.md`
- AI Addon: `/docs/OWNER_CONSOLE_AI_ADDON.md`
- Implementation: `/OWNER_CONSOLE_IMPLEMENTATION.md`

---

© 2025 NeuroInnovate · Proprietary System · AI Operational Intelligence v2.8.0
