# Railway Staging Deployment Guide
## Deploy inventory-enterprise/backend as a new Railway service

**Goal:** Create `inventory-backend-staging` service without touching production.

---

## ✅ Pre-Flight Checklist

- [x] `inventory-enterprise/backend/package.json` has `"start": "node server.js"`
- [x] Health endpoint exists at `/api/health/status` in `routes/health-v2.js:192`
- [x] `railway.json` created in `inventory-enterprise/backend/`
- [x] Production service at `resourceful-achievement-7-agent-build.up.railway.app` is **Active**

---

## 📋 Step-by-Step Deployment

### **Step 1: Create New Railway Service**

1. Go to **Railway Dashboard**: https://railway.app/dashboard
2. Select your project (same project as production)
3. Click **"+ New"** → **"Service"** → **"Deploy from GitHub Repo"**
4. Select repository: `Neuropilotai/neuro-pilot-ai`
5. **IMPORTANT**: Click **"Configure"** before deploying

### **Step 2: Configure Service Settings**

In the service configuration:

**Service Name:**
```
inventory-backend-staging
```

**Root Directory:**
```
inventory-enterprise/backend
```

**Branch:**
```
main
```

### **Step 3: Add Database (PostgreSQL)**

1. In the service view, click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway will automatically:
   - Create a new Postgres instance
   - Add `DATABASE_URL` to your service environment variables
3. Verify: Click **"Variables"** tab, confirm `DATABASE_URL` exists

### **Step 4: Set Environment Variables**

Click **"Variables"** tab → **"Raw Editor"** → Paste this:

```bash
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Scheduler & AI Features
SCHEDULER_ENABLED=false
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true
MAX_HEALTH_FAILURES=6
MAPE_THRESHOLD=20

# Streaming & Caching
ENABLE_STREAMING_FORECAST=true
FORECAST_BATCH_SIZE=20
STREAMING_BATCH_DELAY_MS=300
FORECAST_CACHE_PRELOAD=true
QUERY_CACHE_TTL=7200
FORECAST_CACHE_TTL=86400
ENABLE_ITEM_MAPE_MONITORING=true

# Database (AUTO-SET by Railway Postgres)
# DATABASE_URL=postgresql://... (already set)

# Optional: AI/LLM APIs (if you have keys)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
```

**Note:** Set `SCHEDULER_ENABLED=false` for staging to prevent daily jobs from running.

### **Step 5: Deploy**

1. Click **"Deploy"** button (bottom right)
2. Wait 2-3 minutes for build to complete
3. Watch the **"Deploy Logs"** tab

**Expected output:**
```
Starting Container
🚀 NeuroInnovate Inventory Enterprise System v16.5.0
📡 Server running on port 8080
✅ PostgreSQL connected
```

### **Step 6: Get Staging URL**

1. Click **"Settings"** tab
2. Under **"Domains"**, you'll see: `inventory-backend-staging-production.up.railway.app`
3. Copy this URL

### **Step 7: Verify Health Endpoint**

```bash
export STAGING_URL="https://your-staging-url.up.railway.app"

# Test health endpoint
curl -fsS "$STAGING_URL/api/health/status" | jq .
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "service": "health-api",
    "status": "operational",
    "version": "2.0.0",
    "timestamp": "2025-11-05T..."
  }
}
```

---

## 🧪 Smoke Tests

### Test 1: Items API

```bash
# List items (should be empty initially)
curl -fsS "$STAGING_URL/api/items?active=true" | jq .
```

### Test 2: Import Items (if endpoint exists)

Create a test CSV:
```bash
cat > test-items.csv << 'EOF'
item_code,item_name,category,unit,par_level,unit_cost
TEST001,Test Item 1,Dry Goods,each,100,2.50
TEST002,Test Item 2,Produce,kg,50,3.75
EOF

# Import
curl -X POST "$STAGING_URL/api/items/import" \
  -F "file=@test-items.csv" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 3: Database Connection

```bash
# Check if database is connected
curl -fsS "$STAGING_URL/api/health/status" | jq '.data.database'
```

---

## 🗄️ Database Migrations

The backend needs database schema initialization. Two options:

### **Option A: Auto-run on startup** (Recommended)

Update `package.json` start script:
```json
"start": "node scripts/init-database.js && node server.js"
```

Then redeploy from Railway dashboard.

### **Option B: Manual migration**

1. Railway dashboard → staging service → **"Deploy Logs"**
2. Find the database URL in logs or variables
3. Run migrations locally:

```bash
DATABASE_URL="postgresql://..." npm run migrate
```

---

## 📊 Monitoring & Rollback

### View Logs
```bash
# In Railway dashboard:
# Service → "Deploy Logs" tab → Real-time logs
# Service → "HTTP Logs" tab → Request logs
```

### Rollback to Previous Deployment
1. Service → **"Deployments"** tab
2. Find working deployment
3. Click **"..."** → **"Rollback to this Deployment"**

### Health Monitoring
```bash
# Set up a cron job or monitoring service
*/5 * * * * curl -fsS "$STAGING_URL/api/health/status" || echo "Health check failed!"
```

---

## 🎯 Final Checklist

- [ ] Staging service created: `inventory-backend-staging`
- [ ] PostgreSQL attached and `DATABASE_URL` set
- [ ] Environment variables configured
- [ ] Deployment successful and **Active**
- [ ] Health endpoint returns 200: `/api/health/status`
- [ ] Database migrations run successfully
- [ ] Can query `/api/items` (even if empty)
- [ ] Staging URL documented
- [ ] Production service still working: `resourceful-achievement-7-agent-build.up.railway.app`

---

## 📦 Deliverables

**Staging URL:** `https://[your-url].up.railway.app`

**Health Check:**
```bash
curl https://[your-url].up.railway.app/api/health/status
```

**Items API:**
```bash
# List items
curl https://[your-url].up.railway.app/api/items?active=true

# Import items (requires auth)
curl -X POST https://[your-url].up.railway.app/api/items/import \
  -F "file=@items.csv"
```

**Import Inventory:**
```bash
curl -X POST https://[your-url].up.railway.app/api/inventory/import \
  -F "file=@inventory.csv"
```

---

## 🚨 Troubleshooting

### Issue: "Application not found" / 404

**Cause:** Healthcheck failing
**Fix:** Check deploy logs for errors, verify `/api/health/status` exists

### Issue: Database connection errors

**Cause:** Missing DATABASE_URL or migrations not run
**Fix:** Verify PostgreSQL plugin attached, run migrations

### Issue: Build fails with "npm ERR!"

**Cause:** Missing dependencies or incompatible Node version
**Fix:** Check `package.json` engines field, use Node 20

### Issue: Server starts but crashes after 30s

**Cause:** Uncaught exceptions or missing environment variables
**Fix:** Check deploy logs for error stack traces

---

## 📝 Next Steps

1. **Import seed data**: Use CSV import endpoints
2. **Set up authentication**: Configure JWT secrets, admin users
3. **Test forecasting**: Run a test forecast job
4. **Monitor performance**: Set up metrics/alerts
5. **Production migration**: Once stable, migrate production traffic

---

**Questions?** Check Railway docs: https://docs.railway.app/

**Need help?** Share your Railway deploy logs and I'll debug!
