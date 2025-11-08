# Minimal First Commit Plan (2-3 Days)
## "Start Now" - Ship Fast, Iterate Weekly

**Goal:** Get a working, end-to-end forecast system into production within 2-3 days, then iterate weekly with improvements.

**Philosophy:** Ship a simple baseline that provides value immediately, rather than waiting weeks for a perfect system.

---

## Overview

**What We'll Build (MVP):**
1. `/ml` FastAPI service scaffold with seasonal naive forecasting
2. `/api/forecast/v1` stub returning baseline forecasts
3. Suggested Order UI (read-only table)
4. Basic security: rate limiting + zod validation + helmet

**What We'll Skip (For Now):**
- Complex ML models (ETS, Prophet, LightGBM)
- Model training pipeline
- Automated retraining
- Advanced safety stock calculations
- Prediction intervals
- A/B testing infrastructure

**Timeline:**
- **Day 1:** Backend API + Database schema
- **Day 2:** ML service scaffold + Seasonal naive model
- **Day 3:** Frontend UI + Security hardening
- **Deploy:** Friday EOD

---

## Day 1: Backend Foundation

### 1.1 Database Schema (30 minutes)

```bash
# Run migration
cd inventory-enterprise
sqlite3 backend/database.db < migrations/001_forecast_schema_v1.sql

# Verify tables created
sqlite3 backend/database.db "SELECT name FROM sqlite_master WHERE type='table';"
```

**Expected output:**
```
usage_history
forecasts
reorder_recommendations
model_registry
...
```

### 1.2 Seed Test Data (30 minutes)

```javascript
// backend/scripts/seed_usage_data.js

const db = require('../database');
const { addDays, subDays, format } = require('date-fns');

async function seedUsageData() {
  console.log('Seeding usage data for last 26 weeks...');

  const skus = await db.all('SELECT sku FROM inventory_items LIMIT 10');

  for (const { sku } of skus) {
    for (let week = 0; week < 26; week++) {
      const usageDate = format(subDays(new Date(), week * 7), 'yyyy-MM-dd');

      // Simple pattern: base usage + random variation
      const baseUsage = 10 + (week % 4) * 2;
      const quantityUsed = baseUsage + Math.random() * 5;

      await db.run(
        `INSERT OR IGNORE INTO usage_history (sku, usage_date, quantity_used)
         VALUES (?, ?, ?)`,
        [sku, usageDate, quantityUsed]
      );
    }
  }

  console.log('✅ Seeded usage data for 10 SKUs');
}

seedUsageData();
```

```bash
# Run seed script
node backend/scripts/seed_usage_data.js
```

### 1.3 Forecast API Stub (1 hour)

```javascript
// backend/routes/forecast.js

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../database');

// Request validation schema
const ForecastRequestSchema = z.object({
  skus: z.array(z.string()).min(1).max(100),
  horizon_weeks: z.number().int().min(1).max(12).default(4),
  include_reorder_recommendation: z.boolean().default(true)
});

/**
 * POST /api/forecast/v1/generate
 * Generate forecast using seasonal naive baseline
 */
router.post('/v1/generate', async (req, res) => {
  try {
    // Validate request
    const validated = ForecastRequestSchema.parse(req.body);
    const { skus, horizon_weeks, include_reorder_recommendation } = validated;

    const forecasts = [];
    const errors = [];

    for (const sku of skus) {
      try {
        // Get last 12 weeks of usage
        const history = await db.all(`
          SELECT quantity_used
          FROM usage_history
          WHERE sku = ?
          ORDER BY usage_date DESC
          LIMIT 12
        `, [sku]);

        if (history.length < 4) {
          errors.push({
            sku,
            error: `Insufficient history: only ${history.length} weeks available, need 4+`,
            fallback: 'manual_review_required'
          });
          continue;
        }

        // Seasonal naive forecast: average of last 4 weeks
        const recentUsage = history.slice(0, 4).map(r => r.quantity_used);
        const avgWeeklyUsage = recentUsage.reduce((a, b) => a + b, 0) / recentUsage.length;

        // Point forecast for horizon
        const pointForecast = avgWeeklyUsage * horizon_weeks;

        // Get item details
        const item = await db.get('SELECT * FROM inventory_items WHERE sku = ?', [sku]);

        forecasts.push({
          sku,
          sku_name: item.name,
          category: item.category,
          forecast_date: new Date().toISOString().split('T')[0],
          horizon_weeks,
          forecast: {
            point_forecast: Math.round(pointForecast * 100) / 100,
            confidence_score: 0.6, // Low confidence for baseline
            by_week: Array(horizon_weeks).fill(null).map((_, i) => ({
              week: i + 1,
              forecast: Math.round(avgWeeklyUsage * 100) / 100
            }))
          },
          model: {
            name: 'seasonal_naive',
            version: 'v1.0.0',
            components: ['seasonal_naive'],
            weights: [1.0]
          },
          reorder_recommendation: include_reorder_recommendation
            ? generateSimpleReorder(sku, pointForecast, item)
            : null
        });

      } catch (error) {
        errors.push({
          sku,
          error: error.message,
          fallback: 'manual_review_required'
        });
      }
    }

    res.json({
      request_id: `req_${Date.now()}`,
      generated_at: new Date().toISOString(),
      forecasts,
      errors
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.errors
      });
    }

    console.error('[Forecast] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate forecast'
    });
  }
});

/**
 * Simple reorder logic (improved in future iterations)
 */
function generateSimpleReorder(sku, forecasted_demand_4w, item) {
  const currentStock = item.current_stock || 0;
  const leadTimeDays = item.lead_time_days || 7;

  // Simple heuristic: reorder if stock < 2x weekly demand
  const avgWeeklyDemand = forecasted_demand_4w / 4;
  const shouldReorder = currentStock < (avgWeeklyDemand * 2);

  return {
    abc_class: 'B', // Default for MVP
    should_reorder: shouldReorder,
    recommended_order_quantity: shouldReorder ? Math.ceil(forecasted_demand_4w) : 0,
    recommended_order_date: shouldReorder
      ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
      : null,
    priority: shouldReorder ? 'medium' : 'low',
    details: {
      current_stock: currentStock,
      current_on_order: 0,
      safety_stock: Math.ceil(avgWeeklyDemand), // 1 week buffer
      lead_time_days: leadTimeDays,
      days_until_stockout: currentStock / (avgWeeklyDemand / 7)
    }
  };
}

module.exports = router;
```

### 1.4 Wire Up Routes (15 minutes)

```javascript
// backend/server.js

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Body parsing
app.use(express.json());

// Routes
app.use('/api/forecast', require('./routes/forecast'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

### 1.5 Test Backend API (15 minutes)

```bash
# Start server
npm run dev

# Test health endpoint
curl http://localhost:8000/health

# Test forecast endpoint
curl -X POST http://localhost:8000/api/forecast/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "skus": ["SKU-001", "SKU-002"],
    "horizon_weeks": 4
  }'
```

**Expected response:** JSON with forecasts array

---

## Day 2: ML Service Scaffold (Optional for MVP)

### 2.1 FastAPI Service Structure (1 hour)

```bash
# Create ML service directory
mkdir -p ml-service/app
cd ml-service

# Create requirements.txt
cat > requirements.txt <<EOF
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
numpy==1.26.2
pandas==2.1.3
python-dateutil==2.8.2
EOF

# Install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2.2 FastAPI App (1 hour)

```python
# ml-service/app/main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date
import numpy as np

app = FastAPI(title="NeuroPilot ML Forecast Service", version="1.0.0")

class ForecastRequest(BaseModel):
    skus: List[str] = Field(..., min_items=1, max_items=100)
    horizon_weeks: int = Field(4, ge=1, le=12)
    as_of_date: Optional[date] = None

class ForecastResponse(BaseModel):
    sku: str
    point_forecast: float
    confidence_score: float
    by_week: List[dict]

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ml-forecast"}

@app.post("/predict", response_model=List[ForecastResponse])
def predict(request: ForecastRequest):
    """
    Generate forecasts using seasonal naive model
    """
    forecasts = []

    for sku in request.skus:
        # TODO: Load actual historical data from database
        # For now, use dummy data
        mock_history = np.random.uniform(8, 12, size=12)  # 12 weeks of history

        # Seasonal naive: average of last 4 weeks
        avg_weekly = np.mean(mock_history[-4:])

        forecasts.append(ForecastResponse(
            sku=sku,
            point_forecast=float(avg_weekly * request.horizon_weeks),
            confidence_score=0.6,
            by_week=[
                {"week": i + 1, "forecast": float(avg_weekly)}
                for i in range(request.horizon_weeks)
            ]
        ))

    return forecasts

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### 2.3 Dockerfile (30 minutes)

```dockerfile
# ml-service/Dockerfile

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### 2.4 Test ML Service (15 minutes)

```bash
# Run locally
python ml-service/app/main.py

# Test in another terminal
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "skus": ["SKU-001"],
    "horizon_weeks": 4
  }'
```

---

## Day 3: Frontend UI + Security

### 3.1 Suggested Orders UI Component (2 hours)

```javascript
// frontend/src/components/SuggestedOrders.jsx

import React, { useState, useEffect } from 'react';

function SuggestedOrders() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  async function fetchRecommendations() {
    try {
      setLoading(true);

      // Generate forecasts for all SKUs
      const inventoryRes = await fetch('/api/inventory');
      const inventory = await inventoryRes.json();

      const skus = inventory.items.slice(0, 20).map(item => item.sku); // First 20 for MVP

      const forecastRes = await fetch('/api/forecast/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          skus,
          horizon_weeks: 4,
          include_reorder_recommendation: true
        })
      });

      const data = await forecastRes.json();

      // Filter to only items that should reorder
      const shouldReorder = data.forecasts.filter(
        f => f.reorder_recommendation?.should_reorder
      );

      setRecommendations(shouldReorder);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-4">Loading recommendations...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Suggested Orders</h1>
        <button
          onClick={fetchRecommendations}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {recommendations.length === 0 ? (
        <div className="text-gray-600">No reorder recommendations at this time.</div>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">Priority</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Item</th>
              <th className="border border-gray-300 px-4 py-2 text-right">Current Stock</th>
              <th className="border border-gray-300 px-4 py-2 text-right">Forecasted Demand (4w)</th>
              <th className="border border-gray-300 px-4 py-2 text-right">Recommended Qty</th>
              <th className="border border-gray-300 px-4 py-2 text-right">Days Until Stockout</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec) => {
              const { reorder_recommendation, forecast } = rec;
              const priority = reorder_recommendation.priority;

              const priorityColors = {
                urgent: 'text-red-600 font-bold',
                high: 'text-orange-600 font-semibold',
                medium: 'text-yellow-600',
                low: 'text-gray-600'
              };

              return (
                <tr key={rec.sku} className="hover:bg-gray-50">
                  <td className={`border border-gray-300 px-4 py-2 ${priorityColors[priority]}`}>
                    {priority.toUpperCase()}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <div className="font-medium">{rec.sku_name}</div>
                    <div className="text-sm text-gray-600">{rec.sku}</div>
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right">
                    {reorder_recommendation.details.current_stock}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right">
                    {forecast.point_forecast.toFixed(1)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                    {reorder_recommendation.recommended_order_quantity}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right">
                    {reorder_recommendation.details.days_until_stockout.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SuggestedOrders;
```

### 3.2 Add Route to Dashboard (15 minutes)

```javascript
// frontend/src/App.jsx

import SuggestedOrders from './components/SuggestedOrders';

// Add route
<Route path="/suggested-orders" element={<SuggestedOrders />} />

// Add navigation item
<nav>
  <Link to="/suggested-orders">Suggested Orders</Link>
</nav>
```

### 3.3 Security Hardening (1 hour)

#### Add Helmet (already done in Day 1)

#### Add Zod Validation to All Routes

```javascript
// backend/middleware/validation.js

const { z } = require('zod');

function validateRequest(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
}

module.exports = { validateRequest };
```

#### Apply to Forecast Route

```javascript
// backend/routes/forecast.js

const { validateRequest } = require('../middleware/validation');

router.post('/v1/generate',
  validateRequest(ForecastRequestSchema),
  async (req, res) => {
    // Handler code...
  }
);
```

---

## Deployment Checklist

### Pre-Deployment (30 minutes)

```bash
# 1. Run database migration in production
railway run sqlite3 backend/database.db < migrations/001_forecast_schema_v1.sql

# 2. Seed production data (if needed)
railway run node backend/scripts/seed_usage_data.js

# 3. Set environment variables
railway variables set NODE_ENV=production
railway variables set ALLOWED_ORIGINS=https://your-frontend-url.vercel.app

# 4. Test locally one more time
npm run test
npm run build

# 5. Commit and push
git add .
git commit -m "feat: add demand forecast MVP with seasonal naive baseline"
git push origin main
```

### Deploy Backend (Railway)

```bash
# Railway auto-deploys on push to main
# Monitor deployment
railway logs

# Test production endpoint
curl https://your-api.railway.app/health
```

### Deploy Frontend (Vercel)

```bash
cd frontend

# Build and deploy
vercel --prod

# Test UI
open https://your-frontend.vercel.app/suggested-orders
```

### Post-Deployment Verification (15 minutes)

1. **Test forecast generation:**
   ```bash
   curl -X POST https://your-api.railway.app/api/forecast/v1/generate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $PROD_TOKEN" \
     -d '{"skus": ["SKU-001"], "horizon_weeks": 4}'
   ```

2. **Test UI:**
   - Navigate to Suggested Orders page
   - Verify table loads with recommendations
   - Check for console errors

3. **Monitor logs:**
   ```bash
   railway logs --tail
   ```

---

## What We've Shipped (MVP Feature Set)

✅ **Working Forecast API** (`POST /api/forecast/v1/generate`)
- Seasonal naive baseline model
- 4-week forecast horizon
- Simple reorder recommendations

✅ **Suggested Orders UI**
- Read-only table of recommendations
- Priority indicators (urgent/high/medium/low)
- Days until stockout calculation

✅ **Security Baseline**
- Helmet security headers
- Rate limiting (100 req/15 min)
- Zod input validation
- CORS configured

✅ **Database Schema**
- `usage_history` table
- `forecasts` table
- `reorder_recommendations` table

---

## Week 2-4: Iteration Plan

### Week 2: Improved Forecasting
- Add ETS model
- Implement prediction intervals
- Store forecasts in database
- Add forecast accuracy tracking

### Week 3: Reorder Policy Enhancements
- ABC classification
- Service level-based safety stock
- Lead time variability handling
- Approve/reject workflow in UI

### Week 4: Advanced ML
- Add Prophet model
- Ensemble forecasting
- Automated weekly retraining
- Model performance monitoring

---

## Success Metrics (First Week)

**Adoption:**
- [ ] 5+ users access Suggested Orders page
- [ ] 10+ forecasts generated via API

**Quality:**
- [ ] Zero critical bugs reported
- [ ] API p95 latency < 1s
- [ ] No security incidents

**Business Value:**
- [ ] 1+ order placed based on recommendation
- [ ] Feedback collected from 3+ users

---

## Rollback Plan

If something goes wrong:

```bash
# 1. Revert git commit
git revert HEAD
git push origin main

# 2. Rollback database (if needed)
railway run sqlite3 backend/database.db < migrations/001_forecast_schema_v1_rollback.sql

# 3. Disable feature flag (if using LaunchDarkly/similar)
# Feature flag: forecast_suggestions_enabled = false

# 4. Monitor for errors clearing
railway logs --tail
```

---

## Communication Plan

### Launch Announcement (Friday 5pm)

**Slack Message:**
```
🚀 New Feature: AI-Powered Suggested Orders (Beta)

We've launched a new "Suggested Orders" feature that uses ML to forecast demand and recommend reorder quantities.

📊 What it does:
- Analyzes last 26 weeks of usage data
- Forecasts demand for next 4 weeks
- Recommends reorder quantities and timing

🧪 This is a BETA feature - forecasts are baseline quality and will improve weekly.

📍 Where: Dashboard → Suggested Orders
📖 Docs: [Link to internal wiki]

Questions? #inventory-team
```

### Weekly Updates
- **Monday:** Feature usage stats email
- **Friday:** Accuracy metrics + next week's improvements

---

## Files to Create

### Day 1
1. `backend/routes/forecast.js` - API routes
2. `backend/scripts/seed_usage_data.js` - Data seeding
3. `backend/middleware/validation.js` - Request validation

### Day 2 (Optional)
4. `ml-service/app/main.py` - FastAPI service
5. `ml-service/requirements.txt` - Python dependencies
6. `ml-service/Dockerfile` - Container definition

### Day 3
7. `frontend/src/components/SuggestedOrders.jsx` - UI component
8. Update `frontend/src/App.jsx` - Add route

### Deployment
9. `.github/workflows/deploy-forecast.yml` - CI/CD (optional)
10. `README_FORECAST_MVP.md` - Feature documentation

---

## Total Time Estimate

| Day | Task | Hours |
|-----|------|-------|
| 1 | Database + Backend API | 3.5 |
| 2 | ML Service (Optional) | 3.0 |
| 3 | Frontend + Security | 3.5 |
| Deploy | Testing + Deployment | 1.5 |
| **Total** | | **11.5 hours** |

**Compressed timeline:** 2-3 working days or one focused weekend

---

## Next Steps After MVP

1. **Collect Feedback** (Week 1)
   - User interviews
   - Accuracy vs. actual orders
   - Pain points

2. **Improve Models** (Week 2-3)
   - Add ETS and Prophet
   - Backtest on historical data
   - Tune hyperparameters

3. **Add Workflows** (Week 4)
   - Approve/reject recommendations
   - Bulk actions
   - Email alerts

4. **Scale Up** (Week 5+)
   - Redis caching
   - Background job queue
   - More SKUs (100+)

---

**Remember:** Ship fast, iterate weekly. A simple working system beats a perfect plan.

✅ **Let's build this!**
