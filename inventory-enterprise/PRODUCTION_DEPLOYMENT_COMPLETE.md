# NeuroPilot Inventory Enterprise - Production Deployment Package

**Version:** 16.6.0 (Production-Ready)
**Date:** 2025-01-20
**Status:** ✅ Complete - Ready for Deployment

---

## 🎯 Executive Summary

This package provides a complete, production-ready deployment architecture for NeuroPilot Inventory Enterprise with enterprise-grade security, automated backups, and low operational cost.

**Target Stack:**
- **Frontend**: Vercel (Edge Network)
- **Backend**: Railway (Docker Container)
- **Database**: Neon Postgres (Serverless)
- **Backups**: OneDrive (Encrypted)
- **WAF/CDN**: Cloudflare (DDoS Protection)

**Total Cost:** $44-89/month (scales to $356/month at 100K users)

---

## 📦 Deliverables

### 1. Production Express Server
**File:** `backend/server.production.js`

**Features:**
- ✅ Helmet security headers with CSP
- ✅ Strict CORS with origin whitelist
- ✅ Rate limiting (300 req/10min general, 10 req/15min auth)
- ✅ JWT authentication (15-min access, 90-day refresh tokens)
- ✅ PostgreSQL connection pooling
- ✅ Row-Level Security (RLS) session propagation
- ✅ Request size limits (512KB)
- ✅ Compression enabled
- ✅ Audit logging
- ✅ Graceful shutdown

**Usage:**
```bash
# Configure environment
export DATABASE_URL="postgresql://user:pass@host/db"
export JWT_SECRET="your-secret-here"
export ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"

# Start server
node server.production.js
```

---

### 2. PostgreSQL Migration Schema
**File:** `backend/migrations/production_001_init_schema.sql`

**Features:**
- ✅ 8 core tables with UUID primary keys
- ✅ 24 Row-Level Security (RLS) policies
- ✅ 30+ performance indexes
- ✅ Immutable audit log (prevents updates/deletes)
- ✅ Utility functions and views
- ✅ Role-based data access

**Tables:**
- `app_user` - Users with bcrypt passwords
- `item` - Inventory items
- `location` - Storage locations
- `inventory_count` - Count sessions
- `movement` - Stock movements
- `purchase_order` - POs and invoices
- `purchase_order_line` - Line items
- `audit_log` - Immutable audit trail

**Deploy:**
```bash
# Create database users
psql -c "CREATE USER migrator_user WITH PASSWORD 'migrate_pw';"
psql -c "CREATE USER app_user WITH PASSWORD 'app_pw';"

# Run migration
psql -U migrator_user -f migrations/production_001_init_schema.sql

# Verify
psql -c "\dt"  # List tables
psql -c "SELECT COUNT(*) FROM pg_policies;"  # Check RLS
```

---

### 3. Cloudflare WAF Configuration
**File:** `backend/cloudflare/cloudflare-config.md`

**Features:**
- ✅ DDoS protection (unlimited on Pro+ plans)
- ✅ WAF with managed rulesets (OWASP Core)
- ✅ Rate limiting at edge
- ✅ SSL/TLS termination (Full Strict)
- ✅ Bot management
- ✅ Firewall rules (SQL injection, geo-blocking)
- ✅ Page rules for caching
- ✅ Security headers at edge
- ✅ Terraform configuration included

**Quick Setup:**
1. Add domain to Cloudflare
2. Point DNS to Railway backend (CNAME)
3. Enable "Proxy" (orange cloud)
4. Configure firewall rules from guide
5. Set up rate limiting
6. Enable managed WAF rulesets

**Cost:** $20/month (Pro plan recommended)

---

### 4. Automated Backup System
**Directory:** `backend/backup/`

**Files:**
- `backup-database.sh` - Automated pg_dump with GPG encryption
- `restore-database.sh` - One-command restore with rollback
- `test-backup.sh` - Verification and integrity testing
- `setup-cron.sh` - Interactive cron job configuration
- `README.md` - Complete documentation

**Features:**
- ✅ PostgreSQL pg_dump (compressed)
- ✅ GPG encryption (AES-256)
- ✅ OneDrive upload via rclone
- ✅ 30-day retention policy
- ✅ Checksum verification (SHA-256)
- ✅ Slack/Email notifications
- ✅ Pre-restore safety backups
- ✅ Disaster recovery procedures

**Quick Start:**
```bash
cd backend/backup

# Install dependencies
brew install postgresql gnupg rclone  # macOS
apt install postgresql-client gnupg rclone  # Ubuntu

# Generate GPG key
gpg --full-generate-key

# Configure rclone
rclone config

# Edit configuration
nano .backup-config

# Test backup
./backup-database.sh --skip-upload

# Setup automated backups
./setup-cron.sh --schedule daily --time 02:00
```

**Cost:** $1.99-6.99/month (OneDrive storage)

---

## 🏗️ Architecture Overview

### 7-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Cloudflare WAF                                     │
│  - DDoS mitigation                                          │
│  - Rate limiting (edge)                                     │
│  - Bot management                                           │
│  - SQL injection blocking                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 2: Railway Network                                    │
│  - Private networking                                       │
│  - IP whitelisting                                          │
│  - Container isolation                                      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 3: Express Middleware                                 │
│  - Helmet headers (CSP, HSTS, X-Frame-Options)             │
│  - CORS (strict origin whitelist)                          │
│  - Rate limiting (IP + user-based)                         │
│  - Request size limits (512KB)                             │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 4: JWT Authentication                                 │
│  - Access tokens (15 min expiry)                           │
│  - Refresh tokens (90 day expiry)                          │
│  - Token rotation on refresh                               │
│  - httpOnly cookies                                         │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 5: Role-Based Access Control (RBAC)                  │
│  - Roles: admin, manager, counter, viewer                  │
│  - Route-level authorization                               │
│  - Resource-level permissions                              │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 6: Row-Level Security (RLS)                          │
│  - Database-enforced policies                              │
│  - Session variables (app.user_id, app.role)               │
│  - Postgres-native security                                │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Layer 7: Immutable Audit Log                               │
│  - All operations logged                                   │
│  - Cannot be modified or deleted                           │
│  - Compliance and forensics                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Steps

### Step 1: Database Setup (Neon Postgres)

1. **Create Neon Project:**
   - Go to https://neon.tech
   - Create new project: "neuropilot-inventory"
   - Select region: `us-east-2` (or closest to users)
   - Plan: Pro ($19/month recommended)

2. **Create Database Users:**
   ```sql
   CREATE USER migrator_user WITH PASSWORD 'strong_migrate_password';
   CREATE USER app_user WITH PASSWORD 'strong_app_password';

   GRANT ALL PRIVILEGES ON DATABASE neuropilot_inventory TO migrator_user;
   ```

3. **Run Migration:**
   ```bash
   psql "postgresql://migrator_user:password@ep-your-project.neon.tech/neuropilot_inventory?sslmode=require" \
     -f backend/migrations/production_001_init_schema.sql
   ```

4. **Verify Schema:**
   ```bash
   psql "postgresql://app_user:password@ep-your-project.neon.tech/neuropilot_inventory?sslmode=require" \
     -c "\dt"
   ```

---

### Step 2: Backend Deployment (Railway)

1. **Create Railway Project:**
   - Go to https://railway.app
   - Create new project: "neuropilot-backend"
   - Connect GitHub repo

2. **Configure Environment Variables:**
   ```bash
   # Database
   DATABASE_URL=postgresql://app_user:password@ep-your-project.neon.tech/neuropilot_inventory?sslmode=require

   # JWT Secrets
   JWT_SECRET=$(openssl rand -base64 32)
   REFRESH_TOKEN_SECRET=$(openssl rand -base64 32)

   # CORS
   ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

   # Node
   NODE_ENV=production
   PORT=8080

   # Optional: Google SSO
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_secret
   ```

3. **Deploy:**
   ```bash
   # Railway auto-deploys from GitHub
   # Or manual deployment:
   railway up
   ```

4. **Verify Health:**
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

---

### Step 3: Frontend Deployment (Vercel)

1. **Create Vercel Project:**
   - Go to https://vercel.com
   - Import GitHub repo
   - Root directory: `frontend`

2. **Configure Environment Variables:**
   ```bash
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```

3. **Deploy:**
   ```bash
   # Vercel auto-deploys from GitHub
   # Or manual:
   vercel --prod
   ```

---

### Step 4: Cloudflare Setup

1. **Add Domain:**
   - Go to https://dash.cloudflare.com
   - Add site: `yourdomain.com`
   - Update nameservers at registrar

2. **Configure DNS:**
   ```
   Type    Name    Content                              Proxy
   CNAME   api     your-app.up.railway.app              Yes ☁️
   CNAME   www     cname.vercel-dns.com                 Yes ☁️
   ```

3. **Apply Configuration:**
   - Follow `backend/cloudflare/cloudflare-config.md`
   - Enable WAF managed rulesets
   - Configure rate limiting
   - Set up firewall rules

4. **Verify:**
   ```bash
   curl -I https://api.yourdomain.com/api/health | grep cf-
   ```

---

### Step 5: Backup System Setup

1. **Install Dependencies:**
   ```bash
   # On your backup server or local machine
   brew install postgresql gnupg rclone  # macOS
   ```

2. **Generate GPG Key:**
   ```bash
   gpg --full-generate-key
   # Name: NeuroPilot Backup
   # Email: backup@yourcompany.com
   # Key size: 4096
   ```

3. **Configure rclone:**
   ```bash
   rclone config
   # Remote: onedrive
   # Type: onedrive
   # Follow authentication flow
   ```

4. **Setup Automated Backups:**
   ```bash
   cd backend/backup

   # Edit configuration
   nano .backup-config

   # Test backup
   ./backup-database.sh --skip-upload

   # Setup daily backups at 2 AM
   ./setup-cron.sh --schedule daily --time 02:00
   ```

5. **Test Restore:**
   ```bash
   ./restore-database.sh --from-onedrive --latest
   ```

---

## 📊 Cost Breakdown

### Minimal Configuration (~$50/month)
```
Service              Plan            Cost/Month   Justification
───────────────────────────────────────────────────────────────
Vercel (Frontend)    Hobby           $0           Free tier OK for start
Railway (Backend)    Hobby           $5           Sufficient for low traffic
Neon Postgres        Pro             $19          Needed for backups & RLS
Cloudflare (WAF)     Pro             $20          Required for advanced WAF
OneDrive (Backup)    100GB Personal  $1.99        ~50GB for 30-day backups
───────────────────────────────────────────────────────────────
Total                                $45.99/month
```

### Production Configuration (~$90/month)
```
Service              Plan            Cost/Month   Justification
───────────────────────────────────────────────────────────────
Vercel (Frontend)    Pro             $20          Better DDoS, analytics
Railway (Backend)    Starter         $20          More resources, uptime SLA
Neon Postgres        Pro             $19          Production workload
Cloudflare (WAF)     Pro             $20          Advanced security
OneDrive (Backup)    1TB Business    $10          90-day retention
───────────────────────────────────────────────────────────────
Total                                $89/month
```

### Enterprise Scale (100K users, $356/month)
```
Service              Plan            Cost/Month   Justification
───────────────────────────────────────────────────────────────
Vercel (Frontend)    Enterprise      $Custom      High availability
Railway (Backend)    Pro             $180         Auto-scaling, 99.9% uptime
Neon Postgres        Scale           $100         Dedicated CPU, more storage
Cloudflare (WAF)     Business        $200         Custom SSL, 50 page rules
OneDrive (Backup)    1TB Business    $10          Long-term retention
Monitoring           Datadog/Grafana $50-200      Full observability
───────────────────────────────────────────────────────────────
Total                                $540-740/month
```

---

## 🔒 Security Checklist

### Pre-Launch
- [ ] Run SQL migration with RLS policies
- [ ] Generate strong JWT secrets (32+ bytes)
- [ ] Configure CORS allowed origins
- [ ] Enable Helmet security headers
- [ ] Test rate limiting thresholds
- [ ] Verify GPG encryption for backups
- [ ] Set up Cloudflare WAF rules
- [ ] Enable SSL/TLS (Full Strict mode)
- [ ] Configure content security policy
- [ ] Test authentication flows (login, refresh, logout)

### Post-Launch
- [ ] Verify RLS policies are enforced
- [ ] Test backup and restore procedures
- [ ] Monitor rate limit effectiveness
- [ ] Review WAF blocked requests
- [ ] Check audit log completeness
- [ ] Verify SSL certificate validity
- [ ] Test disaster recovery procedure
- [ ] Review Cloudflare analytics weekly
- [ ] Rotate JWT secrets quarterly
- [ ] Update dependencies monthly

---

## 🧪 Testing Procedures

### 1. Security Testing

```bash
# Test rate limiting
for i in {1..350}; do
  curl -s https://api.yourdomain.com/api/health
done
# Should block after 300 requests

# Test SQL injection (should be blocked)
curl "https://api.yourdomain.com/api/items?id=1' OR '1'='1"

# Test CORS
curl -H "Origin: https://evil.com" https://api.yourdomain.com/api/health
# Should return CORS error

# Test CSP headers
curl -I https://api.yourdomain.com/api/health | grep -i content-security
```

### 2. Backup Testing

```bash
# Verify backup integrity
cd backend/backup
./test-backup.sh

# Test restore to staging
PGDATABASE=neuropilot_staging ./restore-database.sh --from-onedrive --latest
```

### 3. Load Testing

```bash
# Install k6
brew install k6

# Run load test
k6 run --vus 100 --duration 30s load-test.js
```

---

## 📈 Monitoring & Alerts

### Recommended Metrics

**Application:**
- Request rate (req/min)
- Error rate (4xx, 5xx)
- Response time (p50, p95, p99)
- Active connections
- Database pool usage

**Security:**
- WAF blocks (per hour)
- Rate limit triggers
- Failed login attempts
- JWT token errors
- CORS violations

**Infrastructure:**
- CPU usage (%)
- Memory usage (%)
- Database connections
- Disk space
- Backup success/failure

### Alert Thresholds

```yaml
alerts:
  - name: High Error Rate
    condition: error_rate > 5%
    duration: 5m
    severity: critical

  - name: Backup Failed
    condition: backup_last_success > 36h
    severity: critical

  - name: High WAF Blocks
    condition: waf_blocks > 1000/hour
    severity: warning

  - name: Database Connection Pool Full
    condition: db_pool_usage > 90%
    severity: warning
```

---

## 🆘 Disaster Recovery

### Scenario 1: Database Failure

**RTO:** 10 minutes | **RPO:** 24 hours

```bash
# Restore latest backup
cd backend/backup
./restore-database.sh --from-onedrive --latest

# Verify application
curl https://api.yourdomain.com/api/health
```

### Scenario 2: Backend Failure

**RTO:** 5 minutes | **RPO:** 0 (stateless)

```bash
# Railway auto-restarts on crash
# Manual restart:
railway restart

# Or redeploy:
git push origin main
```

### Scenario 3: Complete Infrastructure Loss

**RTO:** 60 minutes | **RPO:** 24 hours

1. Provision new Neon database
2. Deploy new Railway backend
3. Restore database from OneDrive backup
4. Update DNS to point to new infrastructure
5. Verify application functionality

---

## 📚 Additional Resources

### Documentation
- [Production Deployment Architecture](./PRODUCTION_DEPLOYMENT_ARCHITECTURE.md)
- [Backup System README](./backend/backup/README.md)
- [Cloudflare Configuration](./backend/cloudflare/cloudflare-config.md)
- [Adaptive Intelligence API](./backend/ADAPTIVE_INTELLIGENCE_API_v16_6.md)

### External Links
- [Neon Postgres Docs](https://neon.tech/docs)
- [Railway Docs](https://docs.railway.app)
- [Cloudflare WAF](https://developers.cloudflare.com/waf/)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

## 🎉 Success Criteria

Your deployment is successful when:

- ✅ Application accessible at `https://yourdomain.com`
- ✅ API health endpoint returns 200 OK
- ✅ User can register, login, and access dashboard
- ✅ Database queries execute with RLS policies enforced
- ✅ WAF blocks malicious requests (test SQL injection)
- ✅ Rate limiting works (test with 350+ rapid requests)
- ✅ Backup completes successfully and appears in OneDrive
- ✅ Restore from backup works to test database
- ✅ SSL certificate is valid (A+ rating on SSL Labs)
- ✅ No console errors in browser (CSP compliant)
- ✅ Audit log records all operations
- ✅ Monitoring shows green status for all services

---

## 🤝 Support

For issues or questions:
- **Documentation:** `/docs/`
- **Issues:** Create GitHub issue
- **Security:** security@yourcompany.com (for vulnerabilities)

---

**Version:** 16.6.0
**Last Updated:** 2025-01-20
**Status:** ✅ Production-Ready
**Maintained By:** NeuroPilot AI Team
