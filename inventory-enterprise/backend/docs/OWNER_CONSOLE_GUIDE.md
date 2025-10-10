# Owner Console Guide - NeuroInnovate v2.8.0

## 🎯 Overview

The Owner Console is a secure, full-access administrative interface exclusively for David Mikulis (system owner). It provides comprehensive monitoring, control, and management capabilities across the entire NeuroInnovate Inventory Enterprise platform.

**Access URL:** `http://localhost:8083/owner-console.html`

---

## 🔐 Security & Access Control

### Authentication Requirements
- **JWT Token:** Valid authentication token required
- **Admin Role:** Must have admin privileges
- **Owner Email:** Restricted to `neuro.pilot.ai@gmail.com`
- **2FA Verification:** Two-factor authentication must be enabled and verified

### Auto-Logout Protection
- **Inactivity Timer:** 30 minutes of no activity
- **Session Expiry:** Automatic logout after timeout
- **Activity Detection:** Mouse, keyboard, scroll, and touch events reset timer

---

## 📊 Dashboard Panels

### 1. System Status Panel (⚡)
Real-time system health metrics:
- **Status:** Overall system operational state
- **Version:** Current application version (v2.8.0)
- **Uptime:** Server running time in minutes
- **Memory Usage:** Heap memory consumption in MB

**Data Source:** `/api/owner/system-health`

### 2. AI Modules Panel (🤖)
Active AI module monitoring:
- **Forecasting:** ARIMA + Prophet hybrid models
- **Governance:** Autonomous policy adaptation
- **Insights:** Generative intelligence reports
- **Compliance:** Framework audit scanning (ISO27001, SOC2, OWASP)
- **AI Ops:** Predictive incident response

**Data Source:** `/api/owner/dashboard` → `aiModules`

### 3. Database Metrics Panel (💾)
Database statistics and performance:
- **Table Counts:** Records in users, item_master, processed_invoices, audit_logs, forecast_results
- **Database Size:** Total storage in MB (SQLite) or connection info (PostgreSQL)
- **Database Mode:** Active database type (SQLite or PostgreSQL)

**Data Source:** `/api/owner/dashboard` → `dbStats`

### 4. Recent Activity Panel (📋)
Last 10 audit log entries:
- **Event Type:** AUTHENTICATION, DATA_MUTATION, INVENTORY_OPERATION, etc.
- **Action:** HTTP method (GET, POST, PUT, DELETE)
- **Endpoint:** API route accessed
- **User:** Email of user who performed action
- **Timestamp:** When action occurred
- **Severity:** CRITICAL, WARNING, or INFO

**Data Source:** `/api/owner/audit-logs`

---

## ⚙️ Control Center Actions

### 🧠 Train Forecast Models
**Endpoint:** `POST /api/owner/train-forecast`

Initiates AI forecast model training for a specific item.

**Usage:**
1. Click "Train Forecast" button
2. Enter item code (e.g., `APPLE-001`)
3. Model training starts in background
4. Estimated completion: 2-5 minutes

**Payload:**
```json
{
  "itemCode": "APPLE-001",
  "horizon": 30
}
```

---

### 🔄 Reload AI Agents
**Endpoint:** `POST /api/owner/reload-ai`

Restarts all AI agents (governance, insights, compliance).

**Usage:**
1. Click "Reload AI" button
2. All AI modules restart
3. Configuration reloaded from environment variables

**Use Cases:**
- After changing AI settings in `.env`
- When AI modules become unresponsive
- To apply new policy configurations

---

### 🔐 Compliance Scan
**Endpoint:** `POST /api/owner/compliance-scan`

Runs comprehensive compliance audit across all frameworks.

**Usage:**
1. Click "Compliance Scan" button
2. Scan initiated across ISO27001, SOC2, OWASP
3. Results available in compliance dashboard
4. Estimated duration: 3-5 minutes

**Frameworks Checked:**
- ISO 27001: Information security management
- SOC 2: Service organization controls
- OWASP: Web application security

---

### 💾 Backup Database
**Endpoint:** `POST /api/owner/backup-database`

Creates full database backup (SQLite or PostgreSQL).

**Usage:**
1. Click "Backup DB" button
2. Backup file created with timestamp
3. Location displayed in toast notification

**SQLite Backup:**
- File: `/data/backups/backup-{timestamp}.db`
- Method: Direct file copy
- Instant completion

**PostgreSQL Backup:**
- Script: `scripts/postgres-backup.sh`
- File: `/tmp/postgres-backup-{timestamp}.sql`
- Includes all schemas and data

---

### 📈 Refresh Metrics
**Endpoint:** `GET /api/owner/dashboard`

Manually refreshes all dashboard data.

**Usage:**
1. Click "Refresh Metrics" button
2. All panels update with latest data
3. Last refresh time updated in footer

**Note:** Dashboard auto-refreshes every 30 seconds.

---

## 🚀 System Progress Tracking

### ✅ What's Working (v2.8.0)
Current active features:
- AI Forecasting (ARIMA + Prophet)
- Two-Factor Authentication (TOTP)
- Audit Logging with PII Scrubbing
- Redis Metrics Collection
- PostgreSQL Migration Support
- Multi-Tenancy + RBAC
- WebSocket Real-Time Updates
- Generative Intelligence (Governance, Insights, Compliance)

### 🔨 What's Next (v2.9.0 Roadmap)
Pending improvements:
- Integration Tests (85% coverage target)
- Additional Grafana Dashboards (Security, Forecasting)
- Docker Infrastructure Setup
- Advanced AI Model Training
- Automated Backup Scheduling
- Performance Optimization

---

## 🔄 Database Mode Toggle

### View Current Mode
**Endpoint:** `GET /api/owner/database-mode`

Returns current database configuration:
```json
{
  "success": true,
  "database": "PostgreSQL",
  "redis": true,
  "config": {
    "PG_ENABLED": "true",
    "REDIS_ENABLED": "true",
    "AI_FORECAST_ENABLED": "true",
    "REQUIRE_2FA_FOR_ADMINS": "true"
  }
}
```

### Toggle Database (Requires Restart)
**Endpoint:** `POST /api/owner/toggle-database`

**Manual Process:**
1. Update `.env` file:
   - For PostgreSQL: `PG_ENABLED=true`
   - For SQLite: `PG_ENABLED=false`
2. Restart server:
   ```bash
   PORT=8083 PG_ENABLED=true npm run start:all
   ```

---

## 📡 API Reference

### Authentication Header
All requests require JWT token:
```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/owner/dashboard` | Complete dashboard data |
| GET | `/api/owner/system-health` | System health metrics |
| GET | `/api/owner/metrics` | Prometheus metrics (JSON) |
| GET | `/api/owner/audit-logs` | Recent audit entries |
| POST | `/api/owner/train-forecast` | Trigger forecast training |
| POST | `/api/owner/reload-ai` | Restart AI agents |
| POST | `/api/owner/compliance-scan` | Run compliance audit |
| POST | `/api/owner/backup-database` | Create database backup |
| GET | `/api/owner/database-mode` | Get current DB mode |
| POST | `/api/owner/toggle-database` | Toggle DB mode (restart required) |

---

## 🛡️ Security Best Practices

### Production Deployment Recommendations

1. **HTTPS Only**
   ```nginx
   server {
       listen 443 ssl;
       server_name owner.neuroinnovate.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location /owner {
           proxy_pass http://localhost:8083;
       }
   }
   ```

2. **IP Whitelist** (Recommended)
   ```javascript
   // Add to routes/owner.js middleware
   const ALLOWED_IPS = ['192.168.1.100', '10.0.0.50'];

   function ipWhitelist(req, res, next) {
       const clientIP = req.ip || req.connection.remoteAddress;
       if (!ALLOWED_IPS.includes(clientIP)) {
           return res.status(403).json({ error: 'IP not authorized' });
       }
       next();
   }
   ```

3. **Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');

   const ownerLimiter = rateLimit({
       windowMs: 15 * 60 * 1000, // 15 minutes
       max: 100 // limit each IP to 100 requests per windowMs
   });

   app.use('/api/owner', ownerLimiter, ownerRoutes);
   ```

4. **Audit All Actions**
   - All owner actions are automatically logged
   - Check `audit_logs` table for activity history
   - Filter by `user_email = 'neuro.pilot.ai@gmail.com'`

5. **Environment Variables**
   ```bash
   # Add to .env for additional security
   OWNER_CONSOLE_ENABLED=true
   OWNER_IP_WHITELIST=192.168.1.100,10.0.0.50
   OWNER_SESSION_TIMEOUT=1800000  # 30 minutes in ms
   ```

---

## 📱 Usage Examples

### JavaScript API Calls

```javascript
// Get dashboard data
const response = await fetch('http://localhost:8083/api/owner/dashboard', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
const data = await response.json();

// Train forecast model
await fetch('http://localhost:8083/api/owner/train-forecast', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        itemCode: 'APPLE-001',
        horizon: 30
    })
});

// Backup database
const backup = await fetch('http://localhost:8083/api/owner/backup-database', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'sqlite' })
});
```

### cURL Examples

```bash
# Get system health
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8083/api/owner/system-health

# Run compliance scan
curl -X POST \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     http://localhost:8083/api/owner/compliance-scan

# Backup database
curl -X POST \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"type":"sqlite"}' \
     http://localhost:8083/api/owner/backup-database
```

---

## 🐛 Troubleshooting

### Issue: 403 Forbidden
**Cause:** Non-owner email attempting access
**Solution:** Only `neuro.pilot.ai@gmail.com` can access owner console

### Issue: 401 Unauthorized
**Cause:** Missing or invalid JWT token
**Solution:** Login again at `/login.html` to get fresh token

### Issue: Dashboard not loading
**Cause:** API endpoints not responding
**Solution:** Check server logs, ensure all services running

### Issue: Auto-logout too frequent
**Cause:** Inactivity timer triggering
**Solution:** Interact with page to reset 30-minute timer

### Issue: Backup fails
**Cause:** Insufficient disk space or permissions
**Solution:** Check `/data/backups/` directory permissions and disk space

---

## 📞 Support

For issues or questions:
- **Documentation:** `/docs/OWNER_CONSOLE_GUIDE.md`
- **API Docs:** `/docs/API_REFERENCE.md`
- **System Logs:** Check console output for detailed errors
- **Audit Trail:** Query `audit_logs` table for owner activity

---

## 🔄 Version History

### v2.8.0 (Current)
- ✅ Initial Owner Console implementation
- ✅ Full dashboard with 4 panels
- ✅ 5 control center actions
- ✅ Auto-refresh every 30 seconds
- ✅ Inactivity auto-logout (30 min)
- ✅ Real-time WebSocket integration
- ✅ Comprehensive audit logging

### v2.9.0 (Planned)
- 🔨 Advanced AI model management UI
- 🔨 Database query builder
- 🔨 User management interface
- 🔨 Custom alert configuration
- 🔨 Export/import functionality

---

© 2025 NeuroInnovate · Proprietary System · Owned and operated by David Mikulis
