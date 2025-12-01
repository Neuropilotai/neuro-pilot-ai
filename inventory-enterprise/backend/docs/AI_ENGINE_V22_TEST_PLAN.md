# NeuroPilot AI Engine V22.1 - Test Plan

## Overview
This document provides test commands for the AI Engine API endpoints.
All endpoints are RBAC-protected and require authentication.

## Prerequisites

### 1. Get Authentication Token
```bash
# Login to get JWT token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "neuro.pilot.ai@gmail.com", "password": "Admin123!@#"}'
```

Save the token from the response:
```bash
export TOKEN="<your-jwt-token>"
```

### 2. Production URLs
- **Local**: `http://localhost:3001`
- **Production**: `https://inventory-backend-production-3a2c.up.railway.app`

```bash
# Set base URL (local or production)
export BASE_URL="http://localhost:3001"
# export BASE_URL="https://inventory-backend-production-3a2c.up.railway.app"
```

---

## Test Commands

### 1. Health Check (No Auth Required)
```bash
# Check AI Engine health status
curl -s "$BASE_URL/api/ai/health" | jq .
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "V22.1",
  "features": {
    "demandForecasting": true,
    "reorderSuggestions": true,
    "anomalyDetection": true,
    "populationScaling": true
  },
  "database": {
    "connected": true,
    "breadcrumbsTable": true
  },
  "recentOperations": {
    "last24Hours": 0,
    "successful": 0,
    "failed": 0
  }
}
```

---

### 2. Demand Forecasting

#### Get All Forecasts
```bash
curl -s "$BASE_URL/api/ai/forecast" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Forecasts with Options
```bash
# Specific item
curl -s "$BASE_URL/api/ai/forecast?item_code=MILK-2PCT" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Specific site with 30-day horizon
curl -s "$BASE_URL/api/ai/forecast?site_id=SITE001&horizon=30" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Single Item Forecast
```bash
curl -s "$BASE_URL/api/ai/forecast/MILK-2PCT" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "forecasts": [
    {
      "itemCode": "MILK-2PCT",
      "method": "moving_average",
      "horizon": 14,
      "predictions": [
        {
          "date": "2025-12-01",
          "predictedValue": 25.5,
          "confidenceLower": 18.2,
          "confidenceUpper": 32.8
        }
      ],
      "confidence": 0.78,
      "dataPoints": 45,
      "avgDailyConsumption": 25.5
    }
  ],
  "metadata": {
    "orgId": "default",
    "method": "moving_average",
    "generatedAt": "2025-11-30T..."
  }
}
```

---

### 3. Reorder Suggestions

#### Get All Reorder Suggestions
```bash
curl -s "$BASE_URL/api/ai/reorder" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Top N Suggestions
```bash
curl -s "$BASE_URL/api/ai/reorder?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Urgent Items Only
```bash
curl -s "$BASE_URL/api/ai/reorder/urgent" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "suggestions": [
    {
      "itemCode": "FLOUR-AP-50LB",
      "itemName": "All Purpose Flour 50lb",
      "currentStock": 12,
      "safetyStock": 20,
      "reorderPoint": 35,
      "suggestedOrderQty": 50,
      "daysOfStockRemaining": 4.5,
      "leadTimeDays": 7,
      "preferredVendor": "Sysco Foods",
      "urgency": "critical",
      "avgDailyDemand": 2.67,
      "confidence": 0.82,
      "drivers": ["stockout_risk_before_delivery", "below_safety_stock"]
    }
  ],
  "metadata": {
    "orgId": "default",
    "analyzedItems": 150,
    "needsReorder": 23,
    "generatedAt": "2025-11-30T..."
  }
}
```

---

### 4. Anomaly Detection

#### Get Recent Anomalies
```bash
curl -s "$BASE_URL/api/ai/anomalies" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Anomalies for Last 30 Days
```bash
curl -s "$BASE_URL/api/ai/anomalies?window=30" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Anomalies for Specific Item
```bash
curl -s "$BASE_URL/api/ai/anomalies?item_code=MILK-2PCT" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Anomaly Summary
```bash
curl -s "$BASE_URL/api/ai/anomalies/summary" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "anomalies": [
    {
      "itemCode": "BUTTER-1LB",
      "date": "2025-11-28",
      "actualQty": 45,
      "expectedQty": 12.5,
      "zScore": 3.2,
      "deviationPercent": 260,
      "type": "spike",
      "severity": "high",
      "suggestedActions": ["investigate_immediately", "verify_physical_count", "review_recent_transactions"]
    }
  ],
  "metadata": {
    "orgId": "default",
    "windowDays": 7,
    "method": "z_score",
    "threshold": 2.5,
    "generatedAt": "2025-11-30T..."
  }
}
```

---

### 5. Population Factors

#### Get Population Statistics
```bash
curl -s "$BASE_URL/api/ai/population" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Get Population for Specific Site
```bash
curl -s "$BASE_URL/api/ai/population?site_id=SITE001&days=60" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "populationFactors": {
    "avgBreakfast": 120,
    "avgLunch": 250,
    "avgDinner": 180,
    "avgTotal": 550,
    "maxTotal": 680,
    "minTotal": 420,
    "daysLogged": 30
  },
  "metadata": {
    "orgId": "default",
    "siteId": null,
    "periodDays": 30
  }
}
```

---

### 6. AI Dashboard (Combined View)

```bash
curl -s "$BASE_URL/api/ai/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "dashboard": {
    "forecasts": {
      "count": 45,
      "method": "moving_average",
      "topItems": [...]
    },
    "reorder": {
      "urgentCount": 5,
      "totalCount": 15,
      "topSuggestions": [...]
    },
    "anomalies": {
      "count": 3,
      "critical": 1,
      "recent": [...]
    },
    "population": {
      "avgTotal": 550,
      "daysLogged": 30
    }
  },
  "metadata": {
    "orgId": "default",
    "generatedAt": "2025-11-30T..."
  }
}
```

---

### 7. AI Operations Log (Breadcrumbs)

```bash
# Get recent AI operations
curl -s "$BASE_URL/api/ai/breadcrumbs" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Filter by job type
curl -s "$BASE_URL/api/ai/breadcrumbs?job=forecast&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "count": 15,
  "breadcrumbs": [
    {
      "id": 123,
      "job": "forecast",
      "action": "generate_demand",
      "ranAt": "2025-11-30T12:00:00.000Z",
      "durationMs": 245,
      "metadata": {"orgId": "default", "itemCount": 45, "method": "moving_average"},
      "success": true
    }
  ]
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

### 403 Permission Denied
```json
{
  "success": false,
  "error": "Permission denied",
  "code": "PERMISSION_DENIED"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": "Tenant context required",
  "code": "TENANT_REQUIRED"
}
```

### 500 Internal Error
```json
{
  "success": false,
  "error": "Database query failed",
  "code": "FORECAST_ERROR"
}
```

---

## Smoke Test Script

Run all endpoints in sequence:

```bash
#!/bin/bash
# smoke-test-ai-engine.sh

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "=== NeuroPilot AI Engine V22.1 Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Health Check (no auth)
echo "1. Health Check..."
HEALTH=$(curl -s "$BASE_URL/api/ai/health")
echo "$HEALTH" | jq -r '.status'

# Get token (you need to set this)
if [ -z "$TOKEN" ]; then
  echo "ERROR: Set TOKEN environment variable first"
  echo "Run: export TOKEN=\$(curl -s $BASE_URL/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"neuro.pilot.ai@gmail.com\",\"password\":\"Admin123!@#\"}' | jq -r '.token')"
  exit 1
fi

# 2. Forecast
echo "2. Demand Forecast..."
curl -s "$BASE_URL/api/ai/forecast?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

# 3. Reorder
echo "3. Reorder Suggestions..."
curl -s "$BASE_URL/api/ai/reorder?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

# 4. Anomalies
echo "4. Anomaly Detection..."
curl -s "$BASE_URL/api/ai/anomalies?window=7" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

# 5. Population
echo "5. Population Factors..."
curl -s "$BASE_URL/api/ai/population" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

# 6. Dashboard
echo "6. Dashboard..."
curl -s "$BASE_URL/api/ai/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

# 7. Breadcrumbs
echo "7. Operations Log..."
curl -s "$BASE_URL/api/ai/breadcrumbs?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.success'

echo ""
echo "=== Smoke Test Complete ==="
```

---

## Performance Benchmarks

Expected latencies:
- Health Check: < 50ms
- Forecast (single item): < 200ms
- Forecast (all items): < 2000ms
- Reorder Suggestions: < 500ms
- Anomaly Detection: < 500ms
- Dashboard: < 1000ms (parallel queries)

---

## Database Tables Used

| Table | Purpose |
|-------|---------|
| `ai_consumption_derived` | Historical consumption data, anomaly flags |
| `ai_ops_breadcrumbs` | Operation logging/observability |
| `inventory_movements` | Fallback consumption data |
| `item_locations` | Current stock levels |
| `inventory_items` | Item metadata |
| `vendors` | Lead times, preferred vendor |
| `population` | Daily headcount data |

---

## Deployment Checklist

- [ ] Ensure `global.db` is available (db.js loaded)
- [ ] Ensure `ai_ops_breadcrumbs` table exists (migration 012)
- [ ] Verify RBAC permissions include `inventory:read`, `reports:read`
- [ ] Test health endpoint returns `healthy` status
- [ ] Run smoke test script
- [ ] Monitor `ai_ops_breadcrumbs` for operation logs
