# NeuroNexus v19.0 Environment Variables Reference
**Complete Configuration Matrix for Railway Deployment**

---

## 📋 **OVERVIEW**

This document lists all environment variables required for deploying NeuroNexus v19.0 to Railway.

**Services:**
- **Backend:** Node.js API + Autonomous Scheduler
- **ML Service:** Python FastAPI forecasting engine

**Priority Legend:**
- 🔴 **CRITICAL** - Required for deployment (service will fail without it)
- 🟡 **IMPORTANT** - Required for key features (scheduler, email, etc.)
- 🟢 **OPTIONAL** - Has safe defaults, can be customized

**Security:**
- ⚠️ **SECRET** - Sensitive value, never commit to git

---

## 🖥️ **BACKEND SERVICE ENVIRONMENT VARIABLES**

### **Core Configuration**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `NODE_ENV` | 🔴 | `development` | Node.js environment mode | `production` |
| `PORT` | 🟢 | `3001` | Server port (Railway overrides with $PORT) | `3001` |
| `LOG_LEVEL` | 🟢 | `info` | Logging verbosity | `debug`, `info`, `warn`, `error` |

**Deployment Notes:**
- `NODE_ENV=production` enables production optimizations
- `PORT` is automatically set by Railway (uses $PORT), but fallback to 3001 is safe
- `LOG_LEVEL=debug` increases verbosity (use for troubleshooting only)

---

### **ML Service Communication**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `ML_URL` | 🔴 | — | Internal Railway URL for ML service | `http://ml-service.railway.internal:8000` |

**Deployment Notes:**
- **CRITICAL:** Must use `.railway.internal` domain for service-to-service communication
- Do NOT use external/public URLs (slower and may incur egress charges)
- Railway DNS automatically resolves this to the correct internal IP

---

### **Database Configuration**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `DATABASE_URL` | 🟡 | — | Database connection string | `sqlite://backend/database.db` or `postgresql://user:pass@host:5432/db` |

**Deployment Notes:**
- For SQLite: `sqlite://backend/database.db` (relative path)
- For PostgreSQL: `postgresql://username:password@hostname:5432/database_name`
- Railway provides PostgreSQL plugin with automatic `DATABASE_URL` injection

**SQLite Considerations:**
- ✅ Simple, no external dependencies
- ⚠️ Single-file database (may need persistent volume for Railway)
- ⚠️ Not recommended for high-traffic production (use PostgreSQL)

---

### **Authentication & Security**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `JWT_SECRET` ⚠️ | 🔴 | — | JWT token signing secret (64-char random) | `a7f2b9e4c6d1...` |
| `JWT_REFRESH_SECRET` ⚠️ | 🔴 | — | JWT refresh token secret | `d3e8a1f7c2b5...` |
| `SVC_JWT` ⚠️ | 🟡 | — | Service JWT for scheduler authentication | `eyJhbGciOiJIUzI1NiIs...` |

**Deployment Notes:**
- Generate secrets locally (NEVER commit to git):
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SVC_JWT` is required for scheduler to call protected APIs
- Generate `SVC_JWT` by:
  1. Create a service account user in the system
  2. Login and copy the JWT token
  3. Set `SVC_JWT` to that token value

---

### **Email Notifications**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `ADMIN_EMAIL` | 🟡 | — | Admin email for reports and alerts | `neuropilotai@gmail.com` |
| `SMTP_HOST` | 🟡 | — | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | 🟡 | `587` | SMTP server port | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` ⚠️ | 🟡 | — | SMTP username | `neuropilotai@gmail.com` |
| `SMTP_PASS` ⚠️ | 🟡 | — | SMTP password (Gmail app password) | `abcd efgh ijkl mnop` |

**Deployment Notes:**
- Gmail requires **App-Specific Password** (not regular password):
  1. Go to: https://myaccount.google.com/apppasswords
  2. Generate password for "Mail" app
  3. Copy 16-character password (e.g., `abcd efgh ijkl mnop`)
  4. Paste into `SMTP_PASS` (spaces are OK)
- Port 587 = TLS (recommended), Port 465 = SSL
- If emails fail, check "Less secure app access" in Gmail settings

---

### **Autonomous Scheduler Configuration**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `SCHEDULER_ENABLED` | 🟡 | `false` | Enable autonomous scheduler | `true` |
| `AUTO_RETRAIN_ENABLED` | 🟢 | `true` | Enable weekly auto-retrain | `true` |
| `AUTO_ROLLBACK_ENABLED` | 🟢 | `true` | Enable auto-rollback on failures | `true` |

**Deployment Notes:**
- `SCHEDULER_ENABLED=true` activates:
  - Daily intelligence report (02:15 UTC)
  - Weekly model retraining (Sunday 03:00 UTC)
- `AUTO_RETRAIN_ENABLED=false` disables automatic retraining (manual only)
- `AUTO_ROLLBACK_ENABLED=false` disables automatic rollback on health failures

**Scheduler Jobs:**
| Job | Schedule | Description |
|-----|----------|-------------|
| Daily Intelligence Report | `15 2 * * *` | 02:15 UTC daily |
| Weekly Auto-Retrain | `0 3 * * 0` | 03:00 UTC Sunday |

---

### **Thresholds & Timeouts**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `MAX_HEALTH_FAILURES` | 🟢 | `3` | Max consecutive health check failures before rollback | `3` |
| `MAPE_THRESHOLD` | 🟢 | `30` | Model accuracy threshold (MAPE %) for auto-rollback | `30` |
| `FORECAST_TIMEOUT_MS` | 🟢 | `600000` | ML service timeout in milliseconds | `600000` (10 minutes) |

**Deployment Notes:**
- `MAX_HEALTH_FAILURES=3`: After 3 failed health checks, trigger auto-rollback
- `MAPE_THRESHOLD=30`: If model MAPE > 30%, rollback to previous model
- `FORECAST_TIMEOUT_MS=600000`: 10-minute timeout for ML forecasting (large datasets)

**Tuning Recommendations:**
- Increase `FORECAST_TIMEOUT_MS` if forecasting > 1000 SKUs
- Lower `MAPE_THRESHOLD` for stricter accuracy requirements
- Increase `MAX_HEALTH_FAILURES` for more tolerance during restarts

---

### **Feature Flags**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `AIOPS_ENABLED` | 🟢 | `true` | Enable AI Operations features | `true` |
| `GOVERNANCE_ENABLED` | 🟢 | `true` | Enable governance scoring | `true` |
| `INSIGHT_ENABLED` | 🟢 | `true` | Enable AI-powered insights | `true` |
| `COMPLIANCE_ENABLED` | 🟢 | `true` | Enable compliance scanning | `true` |

**Deployment Notes:**
- Set to `false` to disable specific features
- Useful for staged rollouts or troubleshooting
- No impact on core inventory functionality

---

## 🤖 **ML SERVICE ENVIRONMENT VARIABLES**

### **Core Configuration**

| Variable | Priority | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `LOG_LEVEL` | 🟢 | `INFO` | Python logging level | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `DB_PATH` | 🟡 | `../backend/database.db` | Relative path to SQLite database | `../backend/database.db` |

**Deployment Notes:**
- `DB_PATH` is relative to ML service root directory
- Railway mounts both services in same volume, so `../backend/database.db` works
- If using PostgreSQL, backend passes connection string via API calls (no env var needed)

---

## 📝 **QUICK REFERENCE: MINIMAL REQUIRED VARIABLES**

### **Backend (Minimal Deployment)**
```bash
NODE_ENV=production
ML_URL=http://ml-service.railway.internal:8000
DATABASE_URL=sqlite://backend/database.db
JWT_SECRET=[your-secret]
JWT_REFRESH_SECRET=[your-secret]
```

### **Backend (Full Autonomous Deployment)**
```bash
# Core
NODE_ENV=production
ML_URL=http://ml-service.railway.internal:8000
DATABASE_URL=sqlite://backend/database.db

# Auth
JWT_SECRET=[your-secret]
JWT_REFRESH_SECRET=[your-secret]
SVC_JWT=[your-service-jwt]

# Email
ADMIN_EMAIL=neuropilotai@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=[gmail-app-password]

# Scheduler
SCHEDULER_ENABLED=true
AUTO_RETRAIN_ENABLED=true
AUTO_ROLLBACK_ENABLED=true

# Feature Flags
AIOPS_ENABLED=true
GOVERNANCE_ENABLED=true
INSIGHT_ENABLED=true
COMPLIANCE_ENABLED=true
```

### **ML Service**
```bash
LOG_LEVEL=info
DB_PATH=../backend/database.db
```

---

## 🔒 **SECURITY BEST PRACTICES**

### **Secret Management**

1. **Never commit secrets to git:**
   ```bash
   # .gitignore should include:
   .env
   .env.*
   !.env.example
   ```

2. **Use Railway's secret management:**
   - Add secrets via Railway Dashboard → Variables tab
   - Secrets are encrypted at rest
   - Access logged for compliance

3. **Rotate secrets periodically:**
   ```bash
   # Every 90 days, generate new:
   - JWT_SECRET
   - JWT_REFRESH_SECRET
   - SMTP_PASS (Gmail app password)
   ```

4. **Limit service JWT scope:**
   - `SVC_JWT` should have minimal permissions
   - Create dedicated service account user
   - Only grant access to required APIs

---

**Last Updated:** 2025-10-30
**Version:** v19.0
**Maintainer:** DevOps Team
