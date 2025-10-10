# 📘 RUN BOOK: Inventory Enterprise System v2.7.0
## Complete Setup & Verification Guide - Port 8083

---

## 🎯 Objective

Set up and start the complete Inventory Enterprise System on **port 8083** with one command, and verify it's operational end-to-end.

---

## 📋 Prerequisites

- **Node.js**: 18+ (`node --version`)
- **npm**: 9+ (`npm --version`)
- **SQLite3**: For database (installed by default on macOS)
- **Optional**: PostgreSQL 14+, Redis 6+ (for production profile)

---

## 🚀 QUICK START (Copy & Paste)

### Backend Setup & Start

```bash
# Navigate to backend
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Install dependencies
npm ci

# Setup environment (creates .env with PORT=8083)
npm run setup

# Run all database migrations
npm run migrate:all

# Seed default roles and admin user
npm run seed:roles

# Start all systems on port 8083
PORT=8083 npm run start:all
```

### Frontend Dashboard (In New Terminal)

```bash
# Navigate to dashboard
cd ~/neuro-pilot-ai/inventory-enterprise/frontend/dashboard

# Install dependencies
npm ci

# Configure API URL
cp .env.local.example .env.local

# Start dashboard
npm run dev
```

---

## ✅ VERIFICATION STEPS

### 1. Health Check

```bash
curl http://localhost:8083/health
```

**Expected Output:**
```json
{
  "status": "ok",
  "app": "inventory-enterprise-v2.7.0",
  "version": "2.7.0",
  "features": {
    "multiTenancy": true,
    "rbac": true,
    "webhooks": true,
    "realtime": true,
    "aiOps": true,
    "governance": true,
    "insights": true,
    "compliance": true
  }
}
```

### 2. Metrics Endpoint

```bash
curl http://localhost:8083/metrics
```

**Expected**: Prometheus-formatted metrics including:
```
# TYPE governance_policy_adaptations_total counter
# TYPE insight_reports_generated_total counter
# TYPE compliance_audits_total counter
# TYPE aiops_incidents_predicted_total counter
```

### 3. WebSocket Connection

**Using wscat** (install: `npm install -g wscat`):
```bash
wscat -c ws://localhost:8083/ai/realtime
```

**Expected**: Connection established, receives ping/pong messages

**Alternative using curl**:
```bash
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     http://localhost:8083/ai/realtime
```

**Expected**: HTTP 101 Switching Protocols or 426 Upgrade Required

### 4. AI Forecasting Smoke Test

**Derive Consumption Data**:
```bash
curl -X POST http://localhost:8083/api/ai/consumption/derive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start_date": "2025-07-01",
    "end_date": "2025-10-07"
  }'
```

**Train Forecast Model**:
```bash
curl -X POST http://localhost:8083/api/ai/forecast/train \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "item_code": "APPLE-GALA",
    "model_type": "prophet"
  }'
```

**Get Forecast**:
```bash
curl http://localhost:8083/api/ai/forecast/APPLE-GALA?horizon=30 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: JSON response with forecast values and confidence intervals

### 5. Automated Validation

Run the complete validation script:
```bash
cd ~/neuro-pilot-ai/inventory-enterprise/backend
npm run validate:go-live
```

**Expected Output:**
```
═══════════════════════════════════════════════════════════════
🔍 Go-Live Validation - Inventory Enterprise v2.7.0
═══════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────────
📡 Core API Endpoints
─────────────────────────────────────────────────────────────────
  [1] Health check... ✅ PASS
  [2] Metrics endpoint... ✅ PASS

─────────────────────────────────────────────────────────────────
🔌 Real-Time Features
─────────────────────────────────────────────────────────────────
  [3] WebSocket handshake... ✅ PASS

─────────────────────────────────────────────────────────────────
⚙️  Environment Configuration
─────────────────────────────────────────────────────────────────
  [4] PORT configuration... ✅ PASS
  [5] AI Ops enabled... ✅ PASS
  [6] Governance enabled... ✅ PASS
  [7] Insight enabled... ✅ PASS
  [8] Compliance enabled... ✅ PASS

═══════════════════════════════════════════════════════════════
📊 VALIDATION SUMMARY
═══════════════════════════════════════════════════════════════

Total Checks:  12
Passed:        12
Failed:        0

✅ ALL SYSTEMS OPERATIONAL
```

### 6. Dashboard Access

1. Open browser: http://localhost:3000
2. Login credentials:
   - Email: `admin@neuro-pilot.ai`
   - Password: `Admin123!@#`
3. Verify you can see:
   - Dashboard home page
   - Inventory list
   - AI Forecasting page
   - Executive Insights
   - Compliance status

---

## 🔧 TWO PROFILES

### Profile 1: SQLite Only (Default)

**No additional setup required.** Works out of the box.

```bash
# .env configuration
PORT=8083
DATABASE_URL=./database.db
POSTGRES_ENABLED=false
REDIS_ENABLED=false
```

### Profile 2: PostgreSQL + Redis (Production)

**Step-by-Step Setup:**

#### 1. Install Dependencies (macOS)

```bash
brew install postgresql@14 redis
brew services start postgresql@14
brew services start redis
```

#### 2. Create Database

```bash
createdb inventory_enterprise

# Verify
psql -l | grep inventory_enterprise
```

#### 3. Update .env

```bash
# PostgreSQL
POSTGRES_ENABLED=true
POSTGRES_URL=postgresql://localhost:5432/inventory_enterprise
POSTGRES_DUAL_WRITE=true
POSTGRES_PRIMARY=false

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

#### 4. Migrate Schema

```bash
# Run PostgreSQL migration
npm run migrate:postgres

# Verify counts match
npm run verify:db-sync
```

Expected output:
```
SQLite count:    150 rows
Postgres count:  150 rows
✅ Counts match!
```

#### 5. Switch Primary Database

```bash
# Update .env
POSTGRES_PRIMARY=true

# Restart
PORT=8083 npm run start:all
```

#### 6. Verify Postgres is Primary

```bash
curl http://localhost:8083/health | grep database
```

Expected: `"database": "postgres"`

#### Rollback to SQLite

If needed:

```bash
# Update .env
POSTGRES_ENABLED=false
REDIS_ENABLED=false

# Restart
PORT=8083 npm run start:all
```

---

## 🧯 TROUBLESHOOTING

### Issue 1: Port 8083 Already in Use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::8083
```

**Solution:**
```bash
# Find process using port 8083
lsof -i :8083

# Kill it
kill -9 <PID>

# Or use different port
PORT=8084 npm run start:all
```

### Issue 2: CORS or API URL Mismatch

**Symptoms:**
- Dashboard shows "Cannot connect to server"
- Browser console: `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution:**

```bash
# backend/.env - ensure CORS includes frontend URL
CORS_ORIGIN=http://localhost:3000,http://localhost:8083
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8083

# frontend/dashboard/.env.local - ensure API URL matches backend port
VITE_API_URL=http://localhost:8083
VITE_WS_URL=ws://localhost:8083

# Restart both backend and frontend
```

### Issue 3: Redis/Postgres Unavailable

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
Error: connection to server failed
```

**Solution:**

```bash
# Option 1: Start services
brew services start redis
brew services start postgresql@14

# Option 2: Disable in .env (graceful fallback)
REDIS_ENABLED=false
POSTGRES_ENABLED=false

# Restart
PORT=8083 npm run start:all
```

### Issue 4: Migrations Fail

**Symptoms:**
```
Error: SQLITE_ERROR: table already exists
```

**Solution:**

```bash
# Option 1: Clean and re-run
rm database.db
npm run migrate:all
npm run seed:roles

# Option 2: Reset specific migration
sqlite3 database.db "DROP TABLE IF EXISTS governance_policies;"
npm run migrate:generative

# Option 3: Check migration history
sqlite3 database.db "SELECT * FROM migration_history;"
```

### Issue 5: Metrics Empty

**Symptoms:**
```
curl http://localhost:8083/metrics
# Returns only default Node.js metrics, no AI Ops metrics
```

**Solution:**

```bash
# Wait for first collection cycle (60 seconds)
sleep 60
curl http://localhost:8083/metrics | grep governance

# Check if features are enabled
cat .env | grep -E "AIOPS_ENABLED|GOVERNANCE_ENABLED"

# Should be:
AIOPS_ENABLED=true
GOVERNANCE_ENABLED=true
INSIGHT_ENABLED=true
COMPLIANCE_ENABLED=true

# Restart if needed
PORT=8083 npm run start:all
```

---

## 📊 ALL SYSTEMS OPERATIONAL CHECKLIST

Once everything is running, verify this checklist:

```
✅ Backend Components
   ✅ Express API responding on port 8083
   ✅ Health endpoint returns 200 OK
   ✅ Metrics endpoint returns Prometheus format
   ✅ WebSocket accepts connections
   ✅ Database accessible (SQLite or Postgres)

✅ AI Ops Features (v2.6.0)
   ✅ AI Ops Agent running
   ✅ Metrics collector active
   ✅ Anomaly predictor initialized
   ✅ Remediation engine loaded
   ✅ Alert manager configured

✅ Generative Intelligence (v2.7.0)
   ✅ Governance Agent running (learning cycles)
   ✅ Insight Generator active (weekly reports)
   ✅ Compliance Audit running (daily scans)
   ✅ LLM integration configured (or mock mode)

✅ Real-Time Features (v2.3.0)
   ✅ WebSocket server operational
   ✅ Feedback stream processing
   ✅ Forecast worker active
   ✅ Hot-reload enabled

✅ Security & Access Control
   ✅ Multi-tenancy enabled
   ✅ RBAC configured
   ✅ Roles seeded (Viewer/Analyst/Manager/Admin)
   ✅ Admin user created

✅ Frontend Dashboard
   ✅ Dashboard accessible on port 3000
   ✅ Login successful
   ✅ Real-time updates working
   ✅ API requests succeeding
   ✅ WebSocket connected

✅ Database
   ✅ Migrations applied
   ✅ Tables created
   ✅ Roles and admin seeded
   ✅ Data accessible

✅ Monitoring
   ✅ Logs being written
   ✅ Metrics being collected
   ✅ Health checks passing
   ✅ Error handling working
```

---

## 🎉 SUCCESS INDICATORS

Your system is **FULLY OPERATIONAL** when:

1. **Health Check**: `curl http://localhost:8083/health` returns `"status":"ok"`
2. **Validation**: `npm run validate:go-live` shows 0 failures
3. **Dashboard**: http://localhost:3000 loads and accepts login
4. **Features**: All 7 feature flags show `true` in health check:
   - `aiOps: true`
   - `governance: true`
   - `insights: true`
   - `compliance: true`
   - `realtime: true`
   - `multiTenancy: true`
   - `webhooks: true`
5. **Logs**: No error messages in console output
6. **WebSocket**: Connection indicator green in dashboard

---

## 📞 Quick Reference

### URLs

- **Backend API**: http://localhost:8083
- **Health Check**: http://localhost:8083/health
- **Metrics**: http://localhost:8083/metrics
- **WebSocket**: ws://localhost:8083/ai/realtime
- **Frontend Dashboard**: http://localhost:3000

### Credentials

- **Email**: admin@neuro-pilot.ai
- **Password**: Admin123!@#

### Commands

```bash
# Setup
npm ci && npm run setup && npm run migrate:all && npm run seed:roles

# Start
PORT=8083 npm run start:all

# Verify
npm run validate:go-live

# Stop
Ctrl+C
```

### File Locations

- **Backend**: `~/neuro-pilot-ai/inventory-enterprise/backend`
- **Frontend**: `~/neuro-pilot-ai/inventory-enterprise/frontend/dashboard`
- **Database**: `~/neuro-pilot-ai/inventory-enterprise/backend/database.db`
- **Logs**: `~/neuro-pilot-ai/inventory-enterprise/backend/logs/`
- **Config**: `~/neuro-pilot-ai/inventory-enterprise/backend/.env`

---

## 📚 Documentation

- **Quick Start**: `backend/ONE_COMMAND_STARTUP_8083.md`
- **Full Guide**: `backend/QUICK_START.md`
- **Dashboard**: `frontend/dashboard/README_DASHBOARD_QUICKSTART.md`
- **AI Ops**: `backend/aiops/README.md`
- **PASS L Report**: `docs/PASS_L_COMPLETION_REPORT_2025-10-07.md`
- **PASS M Report**: `docs/PASS_M_COMPLETION_REPORT_2025-10-07.md`

---

**Version**: v2.7.0
**Port**: 8083
**Status**: ✅ Production Ready
**Last Updated**: October 7, 2025
