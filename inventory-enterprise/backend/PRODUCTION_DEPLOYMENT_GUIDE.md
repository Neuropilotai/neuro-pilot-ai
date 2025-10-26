# NeuroPilot Enterprise v15.5.2 - Production Deployment Guide

**Version:** 15.5.2
**Date:** October 2025
**Target Environment:** Local + NAS Hybrid Deployment
**Max Users:** 10 (2-3 concurrent)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Final Validation](#phase-1-final-validation)
3. [Phase 2: Security & TLS Configuration](#phase-2-security--tls-configuration)
4. [Phase 3: Backup & Monitoring Setup](#phase-3-backup--monitoring-setup)
5. [Phase 4: First User Onboarding](#phase-4-first-user-onboarding)
6. [Phase 5: System Health Check](#phase-5-system-health-check)
7. [Phase 6: Launch Confirmation](#phase-6-launch-confirmation)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Hardware Requirements
- **Application Server:** 8GB RAM minimum, 16GB recommended
- **Storage:** UGREEN NAS DH4300 (120TB RAID 5)
- **Network:** Gigabit Ethernet, static IP recommended

### Software Requirements
- **Node.js:** v18.x or v20.x LTS
- **PostgreSQL:** v14.x or v15.x
- **Nginx:** v1.22+ (for TLS reverse proxy)
- **OS:** macOS 12+ or Ubuntu 22.04+

### Access Requirements
- Database superuser credentials
- SSL/TLS certificates (or ability to generate self-signed)
- OWNER JWT token for initial setup
- SSO OAuth2 credentials (Google and/or Microsoft)

---

## Phase 1: Final Validation

### Step 1.1: Run Production Verification Script

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Run comprehensive verification
bash backend/scripts/verify_v15_5_1_production.sh

# Expected output:
# ✅ Tests passed: 41 checks
# ⚠️  Warnings: 3 checks (non-blocking)
```

**Expected Results:**
- All 41 critical checks PASS
- 3 non-blocking warnings acceptable:
  - Finance route rate limiting (RBAC mitigates risk)
  - 117 inline event handlers (legacy, scheduled for v15.6)
  - Backend README.md missing (operational docs present)

### Step 1.2: Verify RBAC Coverage

```bash
# Count RBAC gates in routes
grep -R "requireRole(" backend/routes | wc -l

# Expected: ≥50 instances across route files
```

**Validation:**
- Forecast routes: RBAC-gated (FINANCE, OPS, OWNER)
- Inventory reconcile: RBAC-gated (FINANCE, OWNER)
- Admin users: OWNER-only
- Finance routes: FINANCE/OWNER-only

### Step 1.3: Run Security Audit

```bash
cd backend

# Run npm audit
npm audit --production

# Expected: 3 moderate vulnerabilities (nodemailer, validator)
# Action: Document but do not block production (fixes scheduled for v15.6)
```

**Known Issues:**
1. `nodemailer <7.0.7` - Moderate severity (email domain interpretation)
2. `validator` - Moderate severity (URL validation bypass)
3. `express-validator` - Depends on vulnerable validator

**Risk Assessment:** LOW
- Nodemailer only used for invite emails (internal, trusted recipients)
- Validator used for input validation (additional server-side checks present)

### Step 1.4: Integration Tests (Optional)

```bash
# If test suite exists
npm run test:integration

# Expected: All tests pass or skip this step if no tests defined
```

---

## Phase 2: Security & TLS Configuration

### Step 2.1: Create Production Environment File

```bash
cd backend
cp .env.example .env.production
```

Edit `.env.production`:

```env
# ============================================================================
# NeuroPilot Enterprise v15.5.2 - Production Environment
# ============================================================================

# Environment
NODE_ENV=production

# Server
PORT=8083
HOST=127.0.0.1

# Database
DATABASE_URL=postgresql://neuropilot_user:STRONG_PASSWORD@localhost:5432/neuropilot_prod
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000

# Security
JWT_SECRET=GENERATE_STRONG_SECRET_HERE_MIN_64_CHARS
JWT_EXPIRY=24h
SESSION_SECRET=GENERATE_ANOTHER_STRONG_SECRET_HERE

# RBAC & Forecast
FORECAST_SHADOW_MODE=true
EXPORT_RATE_LIMIT_PER_MIN=5
DUAL_CONTROL_ENABLED=true

# Backup
BACKUP_PATH=/mnt/finance_share/backups
BACKUP_RETENTION_DAYS=30

# Monitoring
PROMETHEUS_ENABLED=true
METRICS_PORT=9090

# TLS/HTTPS (if using Node.js native HTTPS)
TLS_ENABLED=false  # Set to true if not using Nginx reverse proxy
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem

# SSO OAuth2
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

MICROSOFT_CLIENT_ID=your-azure-app-id
MICROSOFT_CLIENT_SECRET=your-azure-secret
MICROSOFT_REDIRECT_URI=https://yourdomain.com/auth/microsoft/callback

# Email (for invites)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-app-password
SMTP_FROM=NeuroPilot <noreply@yourdomain.com>

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/neuropilot
```

### Step 2.2: Generate Strong Secrets

```bash
# Generate JWT secret (64+ characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 2.3: TLS/HTTPS Setup with Nginx

#### Option A: Self-Signed Certificate (for LAN deployment)

```bash
# Generate self-signed certificate (valid for 365 days)
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/neuropilot.key \
  -out /etc/nginx/ssl/neuropilot.crt \
  -subj "/C=US/ST=State/L=City/O=NeuroPilot/CN=neuropilot.local"
```

#### Option B: Let's Encrypt Certificate (for public domain)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

#### Nginx Configuration

Create `/etc/nginx/sites-available/neuropilot`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name neuropilot.local;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name neuropilot.local;

    # SSL configuration
    ssl_certificate /etc/nginx/ssl/neuropilot.crt;
    ssl_certificate_key /etc/nginx/ssl/neuropilot.key;

    # Strong SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Content Security Policy (permissive for v15.5, strict in v15.6)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;

    # Client body size (for PDF uploads)
    client_max_body_size 50M;

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Metrics endpoint (restrict to localhost)
    location /metrics {
        proxy_pass http://127.0.0.1:8083/metrics;
        allow 127.0.0.1;
        deny all;
    }

    # Static files (optional optimization)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:8083;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Access logs
    access_log /var/log/nginx/neuropilot_access.log;
    error_log /var/log/nginx/neuropilot_error.log;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/neuropilot /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

### Step 2.4: Verify TLS Configuration

```bash
# Test HTTPS endpoint
curl -k https://127.0.0.1/health

# Check certificate details
openssl s_client -connect 127.0.0.1:443 -servername neuropilot.local

# Test metrics endpoint (should work from localhost)
curl -k https://127.0.0.1/metrics | grep user_login_total
```

---

## Phase 3: Backup & Monitoring Setup

### Step 3.1: Configure Backup Path

```bash
# Create backup directory on NAS
sudo mkdir -p /mnt/finance_share/backups
sudo chown $USER:$USER /mnt/finance_share/backups
sudo chmod 750 /mnt/finance_share/backups

# Test write access
touch /mnt/finance_share/backups/test.txt
rm /mnt/finance_share/backups/test.txt
```

### Step 3.2: Run Manual Backup

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Set backup path
export BACKUP_PATH=/mnt/finance_share/backups

# Run backup
bash scripts/backup_db.sh

# Expected output:
# ✅ Database backup completed
# ✅ Checksum generated: neuropilot_backup_20251014_120000.sql.gz.sha256
```

### Step 3.3: Verify Backup Integrity

```bash
cd /mnt/finance_share/backups

# List backups
ls -lh *.sql.gz

# Verify checksum
sha256sum -c neuropilot_backup_20251014_120000.sql.gz.sha256

# Expected output:
# neuropilot_backup_20251014_120000.sql.gz: OK
```

### Step 3.4: Schedule Automated Backups

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 02:00)
0 2 * * * /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend/scripts/backup_db.sh >> /var/log/neuropilot_backup.log 2>&1

# Verify cron entry
crontab -l | grep backup_db
```

### Step 3.5: Configure Backup Retention

Edit `scripts/backup_db.sh` to ensure 30-day retention:

```bash
# Find backups older than 30 days and delete
find $BACKUP_PATH -name "neuropilot_backup_*.sql.gz" -mtime +30 -delete
find $BACKUP_PATH -name "*.sha256" -mtime +30 -delete
```

### Step 3.6: Verify Prometheus Metrics

```bash
# Check if metrics are exposed
curl -k https://127.0.0.1/metrics

# Check specific metrics
curl -k https://127.0.0.1/metrics | grep -E "user_login_total|forecast_run_total|backup_success_total|audit_events_total"

# Expected output:
# user_login_total 0
# backup_success_total 1
# forecast_run_total 0
# audit_events_total 0
```

### Step 3.7: Configure Prometheus Scraping (Optional)

Create `/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'neuropilot'
    static_configs:
      - targets: ['127.0.0.1:8083']
    metrics_path: '/metrics'
    scheme: https
    tls_config:
      insecure_skip_verify: true
```

Reload Prometheus:

```bash
sudo systemctl reload prometheus
```

---

## Phase 4: First User Onboarding

### Step 4.1: Generate OWNER Token

**Option A: Manual Database Insert + Token Generation**

```sql
-- Connect to database
psql -U postgres -d neuropilot_prod

-- Insert OWNER user
INSERT INTO users (email, role, tenant_id, created_at)
VALUES ('owner@yourdomain.com', 'OWNER', 'default', NOW())
RETURNING user_id;

-- Insert role mapping
INSERT INTO user_roles (user_id, role, tenant_id, created_at)
VALUES (
  (SELECT user_id FROM users WHERE email='owner@yourdomain.com'),
  'OWNER',
  'default',
  NOW()
);
```

Generate JWT token using Node.js:

```javascript
// generate_owner_token.js
const jwt = require('jsonwebtoken');

const payload = {
  user_id: 1,  // From database insert above
  email: 'owner@yourdomain.com',
  role: 'OWNER',
  tenant_id: 'default'
};

const token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: '365d'  // Long-lived for initial setup
});

console.log('OWNER Token:', token);
```

Run:

```bash
export JWT_SECRET="your-jwt-secret-from-env"
node generate_owner_token.js
```

**Option B: Use Existing Admin Script (if available)**

```bash
# If admin CLI tool exists
npm run admin:create-owner -- owner@yourdomain.com
```

### Step 4.2: Export OWNER Token

```bash
# Set as environment variable
export OWNER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-token-here"

# Verify token works
curl -X GET https://127.0.0.1/api/auth/capabilities \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -k

# Expected: {"success": true, "capabilities": {...}}
```

### Step 4.3: Invite First FINANCE User

```bash
# Run invite test script
bash backend/scripts/test_first_user_invite.sh

# Or manual API call:
curl -X POST https://127.0.0.1/api/admin/users/invite \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -k \
  -d '{
    "email": "finance1@yourdomain.com",
    "role": "FINANCE",
    "tenant_id": "default"
  }'

# Expected response:
# {
#   "success": true,
#   "inviteToken": "abc123...",
#   "inviteLink": "https://neuropilot.local/invite?token=abc123..."
# }
```

### Step 4.4: Send Invite to User

1. Copy invite link from response
2. Send to user via secure channel (encrypted email, password manager)
3. Instruct user to click link and complete SSO login

### Step 4.5: User Accepts Invite

**User Steps:**
1. Click invite link
2. Redirected to SSO provider (Google or Microsoft)
3. Complete authentication
4. Redirected to NeuroPilot owner console
5. RBAC UI gating applied (Finance tab visible, Settings tab hidden)

### Step 4.6: Verify First Login

```bash
# Check audit log
psql -U postgres -d neuropilot_prod -c "SELECT * FROM ai_audit_log WHERE action='USER_LOGIN' ORDER BY timestamp DESC LIMIT 5;"

# Check user status
psql -U postgres -d neuropilot_prod -c "SELECT user_id, email, role, last_login FROM users WHERE email='finance1@yourdomain.com';"

# Check Prometheus metrics
curl -k https://127.0.0.1/metrics | grep user_login_total

# Expected: user_login_total 1 (or higher)
```

---

## Phase 5: System Health Check

### Step 5.1: Verify All Services Running

```bash
# Check Node.js application
ps aux | grep node

# Check Nginx
sudo systemctl status nginx

# Check PostgreSQL
sudo systemctl status postgresql

# Check Prometheus (if configured)
sudo systemctl status prometheus
```

### Step 5.2: Test Core Functionality

```bash
# Test health endpoint
curl -k https://127.0.0.1/health

# Test authentication
curl -k https://127.0.0.1/api/auth/capabilities \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Test RBAC endpoint
curl -k https://127.0.0.1/api/admin/users \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### Step 5.3: Monitor Metrics

```bash
# Live metrics monitoring
watch -n 5 'curl -sk https://127.0.0.1/metrics | grep -E "user_login|forecast_|backup_|audit_"'

# Expected counters:
# - user_login_total: incrementing on logins
# - backup_success_total: ≥1 (from manual backup)
# - audit_events_total: incrementing on actions
```

### Step 5.4: Check Logs

```bash
# Application logs
tail -f /var/log/neuropilot/app.log

# Nginx access logs
tail -f /var/log/nginx/neuropilot_access.log

# Nginx error logs
tail -f /var/log/nginx/neuropilot_error.log

# Backup logs
tail -f /var/log/neuropilot_backup.log
```

---

## Phase 6: Launch Confirmation

### Production Readiness Checklist

#### Security
- [x] TLS/HTTPS enabled via Nginx
- [x] HSTS header configured
- [x] Security headers (X-Frame-Options, CSP, etc.)
- [x] JWT secrets generated (64+ characters)
- [x] SSO OAuth2 configured (Google/Microsoft)
- [x] RBAC enforced on all critical routes (51+ requireRole gates)

#### Data Protection
- [x] Database backups automated (daily at 02:00)
- [x] Backup checksum verification enabled
- [x] 30-day backup retention configured
- [x] Offsite backup location accessible (/mnt/finance_share)

#### Monitoring
- [x] Prometheus metrics exposed at /metrics
- [x] Key metrics tracked (login, forecast, backup, audit)
- [x] Logs configured and accessible

#### Role-Based Access Control
- [x] OWNER role created and tested
- [x] FINANCE role invited and verified
- [x] Frontend RBAC UI gating functional
- [x] Shadow mode enabled (FORECAST_SHADOW_MODE=true)
- [x] Dual-control enforcement active

#### Operational
- [x] Production environment file created (.env.production)
- [x] Verification script passed (41/41 checks)
- [x] First user onboarded successfully
- [x] Audit logging operational
- [x] Export rate limiting active (5/min)

---

## Launch Declaration

**System:** NeuroPilot Enterprise v15.5.2
**Mode:** Multi-User Production
**Status:** ✅ **LIVE**

**Deployment Configuration:**
- **Users:** Up to 10 (2-3 concurrent)
- **Storage:** UGREEN NAS DH4300 (120TB RAID 5)
- **Offsite Sync:** Google Drive (encrypted)
- **Security:** TLS + HSTS + RBAC + Dual-Control
- **Uptime Target:** 99.9%
- **Backup Retention:** 30 days
- **Monitoring:** Prometheus + optional Grafana
- **Audit Compliance:** SOC 2 / ISO 27001 aligned

---

## Troubleshooting

### Issue: "Cannot connect to database"

**Symptoms:** Application fails to start, database connection errors

**Solution:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify database exists
psql -U postgres -l | grep neuropilot

# Test connection with credentials from .env.production
psql -U neuropilot_user -d neuropilot_prod -h localhost

# Check DATABASE_URL in .env.production
cat backend/.env.production | grep DATABASE_URL
```

### Issue: "401 Unauthorized" on all API calls

**Symptoms:** All authenticated endpoints return 401

**Solution:**
```bash
# Verify JWT_SECRET matches between token generation and .env.production
echo $JWT_SECRET

# Re-generate token with correct secret
node generate_owner_token.js

# Test with new token
export OWNER_TOKEN="new-token-here"
curl -k https://127.0.0.1/api/auth/capabilities -H "Authorization: Bearer $OWNER_TOKEN"
```

### Issue: "Backup script fails"

**Symptoms:** Backup script exits with error, no .sql.gz file created

**Solution:**
```bash
# Check backup path exists and is writable
ls -ld /mnt/finance_share/backups
touch /mnt/finance_share/backups/test.txt

# Check PostgreSQL credentials
psql -U postgres -d neuropilot_prod -c "SELECT 1;"

# Run backup script with verbose output
bash -x backend/scripts/backup_db.sh
```

### Issue: "Metrics endpoint returns 404"

**Symptoms:** /metrics returns 404 Not Found

**Solution:**
```bash
# Check if metrics are enabled in server.js
grep "/metrics" backend/server.js

# Verify Nginx config allows /metrics
cat /etc/nginx/sites-available/neuropilot | grep metrics

# Test direct connection (bypass Nginx)
curl http://127.0.0.1:8083/metrics
```

### Issue: "User cannot login (SSO fails)"

**Symptoms:** User redirected to SSO but gets error after authentication

**Solution:**
```bash
# Check SSO credentials in .env.production
cat backend/.env.production | grep -E "GOOGLE_CLIENT|MICROSOFT_CLIENT"

# Verify redirect URIs match OAuth2 app configuration
# - Google Console: https://console.cloud.google.com/apis/credentials
# - Azure Portal: https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps

# Check user has role assigned
psql -U postgres -d neuropilot_prod -c "SELECT * FROM user_roles WHERE user_id = (SELECT user_id FROM users WHERE email='user@domain.com');"
```

---

## Rollback Procedures

### Emergency Rollback to Previous Version

```bash
# Stop application
pm2 stop neuropilot  # or: kill $(cat backend/neuropilot.pid)

# Restore previous backup
cd /mnt/finance_share/backups
gunzip -c neuropilot_backup_20251013_120000.sql.gz | psql -U postgres -d neuropilot_prod

# Checkout previous git commit
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise
git log --oneline | head -10
git checkout <previous-commit-hash>

# Reinstall dependencies
cd backend && npm install

# Restart application
npm start
```

### Partial Rollback (Database Only)

```bash
# List available backups
ls -lh /mnt/finance_share/backups/*.sql.gz

# Verify backup integrity
sha256sum -c neuropilot_backup_20251013_120000.sql.gz.sha256

# Create pre-restore backup
bash backend/scripts/backup_db.sh

# Restore specific backup
gunzip -c /mnt/finance_share/backups/neuropilot_backup_20251013_120000.sql.gz | psql -U postgres -d neuropilot_prod
```

---

## Support & Escalation

**Technical Issues:**
- Review logs: `/var/log/neuropilot/`, `/var/log/nginx/`
- Check metrics: `curl -k https://127.0.0.1/metrics`
- Run verification: `bash backend/scripts/verify_v15_5_1_production.sh`

**RBAC Questions:**
- See: `FINANCE_WORKSPACE_README.md`

**Backup Issues:**
- Run: `bash backend/scripts/backup_db.sh`
- Verify: `sha256sum -c backup.sql.gz.sha256`

**Performance Issues:**
- Monitor: Prometheus + Grafana dashboards
- Check database connections: `SELECT count(*) FROM pg_stat_activity;`

---

**Document Version:** 15.5.2
**Last Updated:** October 14, 2025
**Next Review:** January 2026 (v15.6 release)
