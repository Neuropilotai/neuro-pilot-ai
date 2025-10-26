# Quick Start: v14.x → v15.5.3 Upgrade Guide

**Current Version:** v14.x (migration 018)
**Target Version:** v15.5.3 (migration 025)
**Estimated Time:** 3-4 hours

---

## Pre-Upgrade Checklist

- [ ] Backup current database: `cp data/enterprise_inventory.db data/enterprise_inventory.db.backup_$(date +%Y%m%d)`
- [ ] Review validation report: `V15_5_3_POST_LAUNCH_VALIDATION_REPORT.md`
- [ ] Ensure server is stopped: `pkill node` or `pm2 stop neuropilot`
- [ ] Verify Node.js version: `node --version` (require v18+)

---

## Phase 1: Apply Missing Migrations (30 mins)

### Step 1: Check Current Migration Status

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# View current migrations
sqlite3 data/enterprise_inventory.db "SELECT * FROM migrations ORDER BY id;"
```

**Expected Output:**
```
1|001_add_versioning|2025-10-07 21:21:05
2|002_add_ai_tables|2025-10-07 21:21:05
3|015_restore_ai_learning_tables|2025-10-12 08:37:23
4|016_load_rotation_schedule_knowledge|2025-10-12 08:44:16
5|017_create_missing_forecast_views|2025-10-12 08:52:46
6|018_create_v_current_inventory_view|2025-10-12 08:57:20
```

### Step 2: Apply Missing Migrations

```bash
# Apply migrations 019-025 (skip if file doesn't exist)
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Migration 019 (there may be two versions - run the one that exists)
sqlite3 data/enterprise_inventory.db < migrations/019_inventory_reconciliation_h1_2025.sql 2>&1 || \
sqlite3 data/enterprise_inventory.db < migrations/019_create_ai_reconcile_history.sql 2>&1

# Migration 020 (there may be two versions)
sqlite3 data/enterprise_inventory.db < migrations/020_add_issue_unit_columns.sql 2>&1 || \
sqlite3 data/enterprise_inventory.db < migrations/020_finance_aggregates.sql 2>&1

# Migration 021
sqlite3 data/enterprise_inventory.db < migrations/021_finance_ai_audit.sql 2>&1

# Migration 022
sqlite3 data/enterprise_inventory.db < migrations/022_create_ai_forecast_tables.sql 2>&1

# Migration 023 (CRITICAL - RBAC tables)
sqlite3 data/enterprise_inventory.db < migrations/023_add_rbac_and_tenant_scopes.sql 2>&1

# Migration 024
sqlite3 data/enterprise_inventory.db < migrations/024_create_documents_and_mappings.sql 2>&1

# Migration 025 (CRITICAL - User invites)
sqlite3 data/enterprise_inventory.db < migrations/025_invites_and_controls.sql 2>&1
```

### Step 3: Verify Migrations Applied

```bash
# Check migrations table
sqlite3 data/enterprise_inventory.db "SELECT * FROM migrations ORDER BY id DESC LIMIT 10;"

# Expected: Migrations 1-7 (or more) listed, including 023 and 025

# Verify RBAC tables created
sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%user%' OR name LIKE '%role%' OR name LIKE '%invite%');"

# Expected output:
# user_roles
# user_invites
# (possibly others)
```

---

## Phase 2: Deploy v15.5.3 Code (45 mins)

### Step 1: Copy Missing Files from v15.5.3

**If you have v15.5.3 code in another directory:**

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Copy RBAC security module
cp /path/to/v15.5.3/backend/security/rbac.js security/

# Copy admin users routes
cp /path/to/v15.5.3/backend/routes/admin-users.js routes/

# Copy metrics exporter
cp /path/to/v15.5.3/backend/utils/metricsExporter.js utils/

# Copy frontend RBAC client
mkdir -p ../frontend/public/js
cp /path/to/v15.5.3/frontend/public/js/rbac-client.js ../frontend/public/js/
```

**If you don't have v15.5.3 code:** These files were created in previous sessions and should be in the repository at the paths mentioned in the production deployment guide.

### Step 2: Update Environment Configuration

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Copy production environment template
cp .env.production.template .env.production

# Edit with actual values
nano .env.production

# Required values:
# - JWT_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
# - SESSION_SECRET (generate new)
# - DATABASE_URL (sqlite://data/enterprise_inventory.db)
# - FORECAST_SHADOW_MODE=true
# - EXPORT_RATE_LIMIT_PER_MIN=5
```

### Step 3: Update Dependencies

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Install/update dependencies
npm install

# Check for security vulnerabilities
npm audit
```

---

## Phase 3: Configure RBAC (30 mins)

### Step 1: Create OWNER User

```bash
# Connect to database
sqlite3 data/enterprise_inventory.db

# Create OWNER user (replace with your email)
INSERT INTO users (email, role, tenant_id, created_at)
VALUES ('owner@yourdomain.com', 'OWNER', 'default', datetime('now'));

# Get user_id
SELECT user_id FROM users WHERE email='owner@yourdomain.com';

# Insert role mapping (use user_id from above)
INSERT INTO user_roles (user_id, role, tenant_id, created_at)
VALUES (1, 'OWNER', 'default', datetime('now'));

# Verify
SELECT * FROM user_roles;

.quit
```

### Step 2: Generate OWNER JWT Token

Create `generate_owner_token.js`:

```javascript
const jwt = require('jsonwebtoken');

const payload = {
  user_id: 1,  // From database insert above
  email: 'owner@yourdomain.com',
  role: 'OWNER',
  tenant_id: 'default'
};

const secret = process.env.JWT_SECRET || 'your-jwt-secret-from-env';
const token = jwt.sign(payload, secret, { expiresIn: '365d' });

console.log('\n=== OWNER JWT TOKEN ===');
console.log(token);
console.log('\nSave this token securely!');
console.log('Export as: export OWNER_TOKEN="' + token + '"');
```

Run:

```bash
export JWT_SECRET="your-jwt-secret-from-.env.production"
node generate_owner_token.js

# Copy the generated token
export OWNER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Phase 4: Start Application & Test (30 mins)

### Step 1: Start Application

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Option 1: Direct start
export NODE_ENV=production
npm start

# Option 2: PM2 (recommended)
pm2 start server.js --name neuropilot --env production

# Option 3: Background
nohup npm start > neuropilot.log 2>&1 &
```

### Step 2: Verify Health

```bash
# Health check
curl http://127.0.0.1:8083/health

# Expected response:
# {"status":"ok","version":"15.5.3","timestamp":"2025-10-14T..."}

# Test capabilities endpoint
curl -X GET http://127.0.0.1:8083/api/auth/capabilities \
  -H "Authorization: Bearer $OWNER_TOKEN"

# Expected response:
# {"success":true,"capabilities":{...},"user":{...}}
```

### Step 3: Run Verification

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Run production verification
bash scripts/verify_v15_5_1_production.sh

# Expected: 41/41 checks passed (or close to it)
```

---

## Phase 5: Invite First FINANCE User (15 mins)

### Step 1: Test Invite Endpoint

```bash
# Ensure OWNER_TOKEN is set
echo $OWNER_TOKEN

# Send invite
curl -X POST http://127.0.0.1:8083/api/admin/users/invite \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "finance1@yourdomain.com",
    "role": "FINANCE",
    "tenant_id": "default"
  }'

# Expected response:
# {"success":true,"inviteToken":"...","inviteLink":"..."}
```

### Step 2: Verify User Created

```bash
# Check users table
sqlite3 data/enterprise_inventory.db "SELECT * FROM users WHERE email LIKE '%finance%';"

# Check user_invites table
sqlite3 data/enterprise_inventory.db "SELECT * FROM user_invites WHERE email LIKE '%finance%';"

# Check audit log
sqlite3 data/enterprise_inventory.db "SELECT * FROM ai_audit_log WHERE action='USER_INVITE' ORDER BY timestamp DESC LIMIT 5;"
```

---

## Phase 6: Configure Backups (30 mins)

### Step 1: Create Backup Directory

```bash
# Create backup directory (adjust path as needed)
mkdir -p /mnt/finance_share/backups
# OR for local testing:
mkdir -p ~/neuropilot_backups

# Set permissions
chmod 750 ~/neuropilot_backups
```

### Step 2: Update Environment

```bash
# Edit .env.production
nano .env.production

# Add/update:
BACKUP_PATH=/path/to/your/backup/directory
BACKUP_RETENTION_DAYS=30
```

### Step 3: Test Backup

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Run backup script
bash scripts/backup_db.sh

# Verify backup created
ls -lh $BACKUP_PATH/*.sql.gz

# Verify checksum
cd $BACKUP_PATH
sha256sum -c neuropilot_backup_*.sha256  # Linux
# OR
shasum -a 256 -c neuropilot_backup_*.sha256  # macOS
```

### Step 4: Schedule Cron Job

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend/scripts/backup_db.sh >> /var/log/neuropilot_backup.log 2>&1

# Save and verify
crontab -l | grep backup
```

---

## Phase 7: Final Validation (30 mins)

### Run System Snapshot

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Generate system snapshot
bash scripts/system_snapshot.sh

# Review snapshot
cat system_snapshot_*.txt
```

### Verify All Components

```bash
# 1. Database migrations
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM migrations;"
# Expected: ≥7

# 2. RBAC tables
sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_roles', 'user_invites');"
# Expected: user_roles, user_invites

# 3. Application running
curl http://127.0.0.1:8083/health
# Expected: {"status":"ok"}

# 4. Metrics endpoint (if configured)
curl http://127.0.0.1:8083/metrics | grep user_login_total
# Expected: user_login_total metric present

# 5. Backup files
ls -lh $BACKUP_PATH/*.sql.gz
# Expected: At least 1 backup file

# 6. OWNER user
sqlite3 data/enterprise_inventory.db "SELECT email, role FROM users WHERE role='OWNER';"
# Expected: Your OWNER email

# 7. Verification script
bash scripts/verify_v15_5_1_production.sh
# Expected: 41/41 checks passed (or close)
```

---

## Common Issues & Fixes

### Issue: Migration fails with "table already exists"

**Solution:**
```bash
# Check which tables exist
sqlite3 data/enterprise_inventory.db ".tables"

# Skip migration or manually create missing tables
# Continue with next migration
```

### Issue: "no such table: user_roles"

**Solution:**
```bash
# Migration 023 failed or wasn't run
sqlite3 data/enterprise_inventory.db < migrations/023_add_rbac_and_tenant_scopes.sql

# Verify
sqlite3 data/enterprise_inventory.db "SELECT name FROM sqlite_master WHERE name='user_roles';"
```

### Issue: JWT token doesn't work (401 Unauthorized)

**Solution:**
```bash
# Verify JWT_SECRET matches between generation and .env
echo $JWT_SECRET

# Check .env.production
grep JWT_SECRET .env.production

# Regenerate token with correct secret
```

### Issue: Backup script fails

**Solution:**
```bash
# Check backup directory exists
ls -ld $BACKUP_PATH

# Check permissions
chmod 750 $BACKUP_PATH

# Run with verbose output
bash -x scripts/backup_db.sh
```

### Issue: Metrics endpoint returns 404

**Solution:**
```bash
# Check if metrics exporter exists
ls -l utils/metricsExporter.js

# Check server.js for /metrics route
grep "/metrics" server.js

# Restart application
pm2 restart neuropilot
```

---

## Success Criteria

After completing the upgrade, verify these conditions:

- ✅ Database has 7+ migrations applied
- ✅ `user_roles` and `user_invites` tables exist
- ✅ OWNER user created with valid JWT token
- ✅ Application starts without errors
- ✅ Health endpoint responds with HTTP 200
- ✅ Capabilities endpoint returns OWNER permissions
- ✅ Backup script runs successfully
- ✅ System snapshot generated
- ✅ Verification script passes 35+ checks (out of 41)

---

## Next Steps After Upgrade

1. **Configure SSO:**
   - Set up Google OAuth2 credentials
   - Set up Microsoft OAuth2 credentials
   - Test SSO login flows

2. **Configure TLS/HTTPS:**
   - Install Nginx
   - Generate SSL certificates
   - Configure reverse proxy

3. **Onboard Users:**
   - Invite FINANCE users
   - Invite OPS users
   - Test role-based access

4. **Monitor System:**
   - Configure Prometheus (optional)
   - Set up Grafana dashboards (optional)
   - Review audit logs regularly

5. **Documentation:**
   - Update team documentation
   - Train users on new RBAC features
   - Document operational procedures

---

## Support Resources

- **Production Deployment Guide:** `backend/PRODUCTION_DEPLOYMENT_GUIDE.md`
- **Post-Launch Validation:** `V15_5_3_POST_LAUNCH_VALIDATION_REPORT.md`
- **Production Readiness Report:** `V15_5_1_PRODUCTION_READINESS_REPORT.md`
- **Production Launch Report:** `V15_5_2_PRODUCTION_LAUNCH_REPORT.md`
- **Verification Script:** `backend/scripts/verify_v15_5_1_production.sh`
- **System Snapshot:** `backend/scripts/system_snapshot.sh`

---

## Rollback Procedure

If the upgrade fails and you need to rollback:

```bash
# Stop application
pm2 stop neuropilot
# OR: pkill node

# Restore backup database
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
cp data/enterprise_inventory.db data/enterprise_inventory.db.failed
cp data/enterprise_inventory.db.backup_20251014 data/enterprise_inventory.db

# Restart with old version
npm start

# Verify rollback
sqlite3 data/enterprise_inventory.db "SELECT * FROM migrations ORDER BY id DESC LIMIT 1;"
# Should show migration 018 (v14.x)
```

---

**Quick Start Version:** 15.5.3
**Last Updated:** October 14, 2025
**Estimated Total Time:** 3-4 hours
