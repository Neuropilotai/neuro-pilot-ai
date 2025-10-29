# NeuroNexus v19.0 - Environment Variables Matrix

**Version:** v19.0
**Last Updated:** 2025-10-29
**Platform:** Railway (Backend + ML Service)

---

## 📋 Quick Reference

| Variable | Service | Required | Secret | Default | Description |
|----------|---------|----------|--------|---------|-------------|
| `NODE_ENV` | Backend | ✅ Yes | ❌ No | `production` | Node environment |
| `PORT` | Both | ⚠️ Auto | ❌ No | Backend: `3001`, ML: `8000` | HTTP port (Railway sets automatically) |
| `SCHEDULER_ENABLED` | Backend | ✅ Yes | ❌ No | `true` | Enable autonomous cron scheduler |
| `AUTO_RETRAIN_ENABLED` | Backend | ✅ Yes | ❌ No | `true` | Enable weekly ML retraining |
| `AUTO_ROLLBACK_ENABLED` | Backend | ✅ Yes | ❌ No | `true` | Enable auto-rollback on failures |
| `MAX_HEALTH_FAILURES` | Backend | ✅ Yes | ❌ No | `3` | Max failures before rollback |
| `MAPE_THRESHOLD` | Backend | ✅ Yes | ❌ No | `30` | Forecast accuracy threshold |
| `BACKEND_URL` | Backend | ✅ Yes | ❌ No | - | Public backend URL |
| `ML_URL` | Backend | ✅ Yes | ❌ No | `http://ml-service.railway.internal:8000` | Internal ML service URL |
| `SMTP_HOST` | Backend | ✅ Yes | ❌ No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | Backend | ✅ Yes | ❌ No | `587` | SMTP port |
| `SMTP_USER` | Backend | ✅ Yes | ❌ No | `neuropilotai@gmail.com` | SMTP username |
| `SMTP_PASS` | Backend | ✅ Yes | ⚠️ **SECRET** | - | SMTP password (Gmail App Password) |
| `JWT_SECRET` | Backend | ✅ Yes | ⚠️ **SECRET** | - | JWT signing key (32+ bytes hex) |
| `DATA_KEY` | Backend | ✅ Yes | ⚠️ **SECRET** | - | Data encryption key (64-char hex) |
| `ADMIN_EMAIL` | Backend | ✅ Yes | ❌ No | `neuropilotai@gmail.com` | Admin email |
| `ADMIN_PASSWORD` | Backend | ✅ Yes | ⚠️ **SECRET** | `SecurePass123!` | Admin password |
| `DATABASE_PATH` | Backend | ✅ Yes | ❌ No | `backend/database.db` | SQLite DB path |
| `LOG_LEVEL` | Both | ❌ No | ❌ No | Backend: `info`, ML: `INFO` | Logging verbosity |
| `PYTHONUNBUFFERED` | ML Service | ❌ No | ❌ No | `1` | Disable Python buffering |
| `MODEL_STORE` | ML Service | ❌ No | ❌ No | `/data/models` | Model storage path |
| `FORECAST_HORIZON` | ML Service | ❌ No | ❌ No | `28` | Forecast days ahead |

---

## 🔧 Backend (Node.js) Environment Variables

### Core Configuration

```bash
# Node.js runtime
NODE_ENV=production

# Port binding (Railway injects $PORT automatically)
# Your code: const PORT = process.env.PORT || 3001;
PORT=3000

# Admin credentials
ADMIN_EMAIL=neuropilotai@gmail.com
ADMIN_PASSWORD=SecurePass123!  # ⚠️ CHANGE IN PRODUCTION

# Data encryption key (64-char hex)
# Generate: openssl rand -hex 64
DATA_KEY=f021d529b92313359f211a280f83d2d97fa9c551aa09c4f9f0272b4eaa4b077c
```

**Sanity test:**
```bash
railway run --service backend node -e "console.log('NODE_ENV:', process.env.NODE_ENV)"
# Expected: NODE_ENV: production
```

---

### Autonomous Foundation Configuration

```bash
# Enable autonomous scheduler (cron jobs)
SCHEDULER_ENABLED=true

# Enable weekly ML model retraining
AUTO_RETRAIN_ENABLED=true

# Enable auto-rollback on health failures
AUTO_ROLLBACK_ENABLED=true

# Max consecutive health failures before rollback
MAX_HEALTH_FAILURES=3

# Mean Absolute Percentage Error threshold (%)
MAPE_THRESHOLD=30

# Forecast timeout (milliseconds)
FORECAST_TIMEOUT_MS=600000
```

**Sanity test:**
```bash
railway run --service backend node -e "console.log({
  scheduler: process.env.SCHEDULER_ENABLED,
  retrain: process.env.AUTO_RETRAIN_ENABLED,
  rollback: process.env.AUTO_ROLLBACK_ENABLED,
  maxFailures: process.env.MAX_HEALTH_FAILURES,
  mape: process.env.MAPE_THRESHOLD
})"
# Expected: { scheduler: 'true', retrain: 'true', ... }
```

---

### Service URLs

```bash
# Public backend URL (set to your Railway domain)
BACKEND_URL=https://resourceful-achievement-production.up.railway.app

# Internal ML service URL (Railway private networking)
# Format: http://<service-name>.railway.internal:<port>
ML_URL=http://ml-service.railway.internal:8000
ML_SERVICE_URL=http://ml-service.railway.internal:8000
```

**CRITICAL:**
- Use Railway's internal networking for service-to-service calls
- Do NOT use public URLs for backend → ML communication
- Format: `http://<service-name>.railway.internal:<port>`

**Sanity test:**
```bash
railway run --service backend curl -f http://ml-service.railway.internal:8000/status
# Expected: {"status":"healthy",...}
```

---

### Email Notifications

```bash
# SMTP server configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com

# SMTP password (use Gmail App Password, not account password)
# ⚠️ SECRET - Set in Railway UI, not in code
# Generate at: https://myaccount.google.com/apppasswords
SMTP_PASS=<16-char-app-password>
```

**How to get Gmail App Password:**
1. Go to https://myaccount.google.com/apppasswords
2. Select app: "Mail"
3. Select device: "Other (Custom name)" → "Railway Backend"
4. Click "Generate"
5. Copy 16-character password
6. Set in Railway Dashboard → Variables → `SMTP_PASS`

**Sanity test:**
```bash
railway run --service backend node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
transport.verify()
  .then(() => console.log('✓ SMTP connection successful'))
  .catch(err => console.error('✗ SMTP error:', err.message));
"
```

---

### JWT Authentication

```bash
# JWT signing secret (32+ bytes hex)
# ⚠️ SECRET - Generate fresh key for production
# Generate: openssl rand -hex 32
JWT_SECRET=<64-char-hex-string>
```

**Generate new secret:**
```bash
openssl rand -hex 32
# Example output: a1b2c3d4e5f6...
```

**Sanity test:**
```bash
railway run --service backend node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({ test: true }, process.env.JWT_SECRET);
console.log('✓ JWT_SECRET is set and valid');
console.log('Token length:', token.length);
"
```

---

### Database Configuration

```bash
# SQLite database file path (relative to backend/)
DATABASE_PATH=backend/database.db

# Database URL (for ORM compatibility)
DATABASE_URL=sqlite://backend/database.db
```

**Sanity test:**
```bash
railway run --service backend sqlite3 $DATABASE_PATH ".tables"
# Expected: forecasts, usage_history, reorder_recommendations, ...
```

---

### Logging

```bash
# Logging level (debug, info, warn, error)
LOG_LEVEL=info
```

**Sanity test:**
```bash
railway run --service backend node -e "console.log('LOG_LEVEL:', process.env.LOG_LEVEL)"
```

---

## 🐍 ML Service (Python FastAPI) Environment Variables

### Core Configuration

```bash
# Python logging level
LOG_LEVEL=INFO

# Disable Python output buffering (required for Railway logs)
PYTHONUNBUFFERED=1
```

**Sanity test:**
```bash
railway run --service ml-service python -c "import os; print('LOG_LEVEL:', os.environ.get('LOG_LEVEL'))"
```

---

### Model Configuration

```bash
# Model storage path (if using persistent volume)
MODEL_STORE=/data/models

# Forecast horizon in days
FORECAST_HORIZON=28
```

**Sanity test:**
```bash
railway run --service ml-service python -c "import os; print('FORECAST_HORIZON:', os.environ.get('FORECAST_HORIZON', 28))"
```

---

### Port Binding

```bash
# PORT is set automatically by Railway
# Your code should use: port = int(os.environ.get("PORT", 8000))
# Do NOT hardcode port 8000
```

**Verify main.py handles $PORT:**
```bash
grep -n "PORT" inventory-enterprise/ml-service/main.py
# Expected: port = int(os.environ.get("PORT", 8000))
```

---

## 🔐 Secret Management

### Secrets Summary

| Secret | How to Generate | Where to Set |
|--------|----------------|--------------|
| `JWT_SECRET` | `openssl rand -hex 32` | Railway Dashboard → backend → Variables |
| `SMTP_PASS` | Gmail App Password | Railway Dashboard → backend → Variables |
| `DATA_KEY` | `openssl rand -hex 64` | Railway Dashboard → backend → Variables |
| `ADMIN_PASSWORD` | Choose strong password | Railway Dashboard → backend → Variables |

### Setting Secrets in Railway

1. Navigate to Railway Dashboard
2. Select project: "Inventory Systems"
3. Click service: "backend"
4. Go to **Variables** tab
5. Click **New Variable**
6. Enter name (e.g., `JWT_SECRET`)
7. Enter value (paste generated secret)
8. Click **Add**
9. Railway will redeploy automatically

**NEVER:**
- ❌ Commit secrets to `.env` files
- ❌ Share secrets in Slack/email
- ❌ Use production secrets in development
- ❌ Log secret values

**ALWAYS:**
- ✅ Use Railway Variables UI (encrypted at rest)
- ✅ Rotate secrets every 90 days
- ✅ Use different secrets per environment
- ✅ Document secret rotation procedures

---

## 🔄 PostgreSQL Migration (Optional)

If migrating from SQLite to PostgreSQL:

```bash
# Backend - PostgreSQL configuration
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Railway provides $DATABASE_URL automatically if you add Postgres plugin
# Your code should check for DATABASE_URL first:
# const dbUrl = process.env.DATABASE_URL || 'sqlite://backend/database.db';
```

**Migration steps:**
1. Railway Dashboard → Add Postgres plugin
2. Copy `DATABASE_URL` from plugin variables
3. Update backend code to use `DATABASE_URL` if present
4. Run migrations: `railway run npm run migrate`

---

## ✅ Environment Variables Checklist

### Pre-Deployment Checklist

- [ ] All secrets generated (JWT_SECRET, SMTP_PASS, DATA_KEY)
- [ ] SMTP credentials tested (send test email)
- [ ] Backend URL matches Railway domain
- [ ] ML_URL uses internal Railway networking
- [ ] SCHEDULER_ENABLED=true
- [ ] AUTO_RETRAIN_ENABLED=true
- [ ] No secrets in .env files
- [ ] All variables set in Railway UI

### Post-Deployment Verification

```bash
# Test all critical env vars are set
railway run --service backend node -e "
const critical = [
  'SCHEDULER_ENABLED',
  'ML_URL',
  'SMTP_HOST',
  'SMTP_PASS',
  'JWT_SECRET',
  'BACKEND_URL'
];
critical.forEach(key => {
  if (!process.env[key]) {
    console.error('✗ Missing:', key);
  } else {
    console.log('✓ Set:', key);
  }
});
"
```

---

## 📚 References

- Railway Docs: https://docs.railway.app/reference/variables
- Gmail App Passwords: https://support.google.com/accounts/answer/185833
- JWT Best Practices: https://jwt.io/introduction

**END OF ENVIRONMENT VARIABLES MATRIX**
