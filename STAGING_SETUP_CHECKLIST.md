# Railway Staging Service Setup Checklist

## ✅ Pre-Deployment Verification
- [x] Repo sanity check PASSED
- [x] package.json has "start": "node server.js"
- [x] Health endpoint exists at /api/health/status
- [x] railway.json configured in inventory-enterprise/backend/

---

## 📋 Railway Service Creation Steps

### 1. Create New Service

**URL:** https://railway.app/dashboard

**Steps:**
1. Open your Railway project dashboard
2. Click **"+ New"** → **"GitHub Repo"**
3. Select repository: **`Neuropilotai/neuro-pilot-ai`**
4. **IMPORTANT:** Click **"Configure"** before deploying

### 2. Configure Service

**In Service Settings:**

| Setting | Value |
|---------|-------|
| Service Name | `inventory-backend-staging` |
| Root Directory | `inventory-enterprise/backend` |
| Branch | `main` |
| Build Command | (auto-detected from railway.json) |
| Start Command | `npm start` |

**Health Check:**
- Path: `/api/health/status`
- Timeout: 100 seconds

### 3. Add PostgreSQL Database

**Steps:**
1. In service view, click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway auto-creates:
   - New Postgres instance
   - `DATABASE_URL` environment variable
3. Verify: Click **"Variables"** tab, confirm `DATABASE_URL` exists

### 4. Set Environment Variables

**Click "Variables" → "Raw Editor" → Paste:**

```bash
# Core Configuration
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Scheduler & Automation
SCHEDULER_ENABLED=true
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true
MAX_HEALTH_FAILURES=6
MAPE_THRESHOLD=20

# Streaming & Performance
ENABLE_STREAMING_FORECAST=true
FORECAST_BATCH_SIZE=20
STREAMING_BATCH_DELAY_MS=300

# Caching
FORECAST_CACHE_PRELOAD=true
QUERY_CACHE_TTL=7200
FORECAST_CACHE_TTL=86400
ENABLE_ITEM_MAPE_MONITORING=true

# Database (AUTO-SET by Railway Postgres)
# DATABASE_URL=postgresql://... (already set by Railway)
```

**Click "Save Variables"**

### 5. Deploy Service

1. Click **"Deploy"** button
2. Monitor in **"Deployments"** tab
3. Watch **"Deploy Logs"** for startup confirmation

**Expected Deploy Logs:**
```
Starting Container
🚀 NeuroInnovate Inventory Enterprise System v16.5.0
📡 Server running on port 8080
✅ PostgreSQL connected
```

### 6. Get Staging URL

1. Click **"Settings"** tab
2. Under **"Domains"**, copy the generated URL
3. Format: `https://inventory-backend-staging-production.up.railway.app`

---

## ✅ Verification Steps

### Health Check
```bash
export STAGING_URL="https://your-staging-url.railway.app"

# Test health endpoint
curl -fsS "$STAGING_URL/api/health/status" | jq .
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "service": "health-api",
    "status": "operational",
    "version": "2.0.0"
  }
}
```

### Database Connection
```bash
# Check database is connected
curl -fsS "$STAGING_URL/api/health/status" | jq '.data.database'
```

---

## 🧪 Smoke Tests

### Test Data Files

**items_seed.csv:**
```csv
item_code,item_name,category,unit,par_level,unit_cost
BEEF001,Ground Beef 80/20,Meat,lb,200,4.99
CHICKEN001,Chicken Breast,Poultry,lb,150,3.49
LETTUCE001,Romaine Lettuce,Produce,head,50,1.99
TOMATO001,Roma Tomatoes,Produce,lb,100,2.49
CHEESE001,Cheddar Cheese Block,Dairy,lb,75,5.99
BUN001,Hamburger Buns,Bakery,pack,100,2.99
```

**inventory_seed.csv:**
```csv
item_code,location,quantity,unit,counted_by,notes
BEEF001,Walk-in Cooler,150,lb,System,Initial import
CHICKEN001,Walk-in Cooler,120,lb,System,Initial import
LETTUCE001,Walk-in Cooler,35,head,System,Initial import
TOMATO001,Walk-in Cooler,75,lb,System,Initial import
CHEESE001,Walk-in Cooler,60,lb,System,Initial import
BUN001,Dry Storage,80,pack,System,Initial import
```

### Import Commands

```bash
# Create CSV files
cat > items_seed.csv << 'EOF'
item_code,item_name,category,unit,par_level,unit_cost
BEEF001,Ground Beef 80/20,Meat,lb,200,4.99
CHICKEN001,Chicken Breast,Poultry,lb,150,3.49
LETTUCE001,Romaine Lettuce,Produce,head,50,1.99
TOMATO001,Roma Tomatoes,Produce,lb,100,2.49
CHEESE001,Cheddar Cheese Block,Dairy,lb,75,5.99
BUN001,Hamburger Buns,Bakery,pack,100,2.99
EOF

cat > inventory_seed.csv << 'EOF'
item_code,location,quantity,unit,counted_by,notes
BEEF001,Walk-in Cooler,150,lb,System,Initial import
CHICKEN001,Walk-in Cooler,120,lb,System,Initial import
LETTUCE001,Walk-in Cooler,35,head,System,Initial import
TOMATO001,Walk-in Cooler,75,lb,System,Initial import
CHEESE001,Walk-in Cooler,60,lb,System,Initial import
BUN001,Dry Storage,80,pack,System,Initial import
EOF

# Import items (if endpoint exists)
curl -X POST "$STAGING_URL/api/items/import" \
  -H "Content-Type: text/csv" \
  --data-binary "@items_seed.csv"

# Import inventory (if endpoint exists)
curl -X POST "$STAGING_URL/api/inventory/import" \
  -H "Content-Type: text/csv" \
  --data-binary "@inventory_seed.csv"

# Verify items
curl -fsS "$STAGING_URL/api/items?active=true" | jq '.data | length'

# Check inventory summary
curl -fsS "$STAGING_URL/api/inventory/summary" | jq .
```

---

## 🔧 Scheduler Configuration

**For Staging (Prevent Daily Jobs):**

If you want staging to NOT run scheduled jobs:
1. Click **"Variables"** tab
2. Change: `SCHEDULER_ENABLED=false`
3. Click **"Redeploy"**

**For Production-Like Testing:**
- Leave `SCHEDULER_ENABLED=true`
- Jobs will run on schedule

---

## 📊 Monitoring & Rollback

### View Logs
- **Deploy Logs:** Real-time startup logs
- **HTTP Logs:** API request/response logs
- **Metrics:** Resource usage graphs

### Rollback
1. **"Deployments"** tab
2. Find working deployment
3. Click **"..."** → **"Rollback to this Deployment"**

---

## 🎯 Final Deliverables

**Staging URL:**
```
https://[your-url].railway.app
```

**Quick Test Commands:**
```bash
# Health
curl https://[url]/api/health/status | jq .

# Items count
curl https://[url]/api/items?active=true | jq '.data | length'

# Inventory summary
curl https://[url]/api/inventory/summary | jq .
```

---

## ✅ Success Criteria

- [ ] Service created: `inventory-backend-staging`
- [ ] PostgreSQL attached
- [ ] All environment variables set
- [ ] Deployment Active/Healthy
- [ ] Health endpoint returns 200
- [ ] Can query `/api/items` (even if empty)
- [ ] Production service unchanged

---

## 🚨 Troubleshooting

**Issue:** Build fails
- **Fix:** Check build logs for npm errors
- Clear build cache: Settings → Clear Build Cache

**Issue:** Health check fails
- **Fix:** Verify `/api/health/status` route exists
- Check deploy logs for startup errors

**Issue:** Database connection error
- **Fix:** Verify PostgreSQL plugin attached
- Check `DATABASE_URL` in variables

---

**Ready?** Follow the steps above and let me know your staging URL when it's deployed!
