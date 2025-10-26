# NeuroPilot Inventory - Phased Production Deployment

**Goal:** Get to production in 3 weeks with minimal complexity
**Strategy:** Start simple, add hardening incrementally
**Cost:** <$50/month to start, scales as needed

---

## Phase 1: Core Deployment (This Week)

**Goal:** Get the app running in production with secure basics

### 1.1 Database Setup (Neon Postgres)

**Create Neon Project:**
```bash
# Go to https://neon.tech
# Create project: "neuropilot-inventory"
# Region: us-east-2 (or closest to users)
# Plan: Free tier to start, upgrade to Pro ($19/mo) when ready
```

**Run Migrations:**
```bash
# Export your Neon connection string
export DATABASE_URL="postgresql://neondb_owner:***@ep-***.neon.tech/neondb?sslmode=require"

# Run migrations in order
psql "$DATABASE_URL" -f backend/migrations/001_schema.sql
psql "$DATABASE_URL" -f backend/migrations/002_roles_and_grants.sql
psql "$DATABASE_URL" -f backend/migrations/003_rls_policies.sql
```

**Update Passwords:**
```sql
-- Connect to Neon SQL console and update passwords
ALTER ROLE migrator_user PASSWORD 'your_strong_migrator_password_here';
ALTER ROLE app_user_login PASSWORD 'your_strong_app_password_here';
```

**Verify:**
```bash
# Test connection
psql "$DATABASE_URL" -c "\dt"

# Check RLS is enabled
psql "$DATABASE_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"

# Should show 5 tables with rowsecurity = true
```

---

### 1.2 Backend Deployment (Railway)

**Create Railway Project:**
```bash
# Go to https://railway.app
# Connect GitHub repo
# Select backend directory
```

**Environment Variables:**
```bash
# Database (use app_user_login credentials from 002_roles_and_grants.sql)
DATABASE_URL=postgresql://app_user_login:YOUR_PASSWORD@ep-***.neon.tech/neondb?sslmode=require

# JWT (generate strong secrets)
JWT_SECRET=$(openssl rand -base64 32)

# CORS (your frontend domain - use Railway URL for now)
ALLOW_ORIGIN=https://your-frontend.vercel.app

# Node
NODE_ENV=production
PORT=8080
```

**Deploy:**
```bash
# Railway Settings:
# - Start command: node server.production-minimal.js
# - Health check: /health
# - Auto-deploy: on (connected to GitHub)

# Or manual deploy:
railway up
```

**Smoke Test:**
```bash
# Get your Railway URL
export API_URL="https://your-app.up.railway.app"

# Test health
curl $API_URL/health
# Expected: {"status":"ok","time":"2025-01-20T..."}

# Test auth (should fail without token)
curl $API_URL/inventory/low-stock
# Expected: {"error":"unauthorized"}

# Generate JWT for testing (in Node.js console)
# const jwt = require('jsonwebtoken');
# const token = jwt.sign(
#   { sub: '00000000-0000-0000-0000-000000000001', role: 'admin', email: 'test@example.com' },
#   process.env.JWT_SECRET,
#   { expiresIn: '1h' }
# );
# console.log(token);

# Test with token
curl -H "Authorization: Bearer YOUR_TOKEN" $API_URL/inventory/low-stock
# Expected: [] (empty array if no data yet)
```

---

### 1.3 Frontend Deployment (Vercel)

**Create Vercel Project:**
```bash
# Go to https://vercel.com
# Import GitHub repo
# Root directory: frontend (if separate) or leave default
```

**Environment Variables:**
```bash
# Point to Railway backend
VITE_API_URL=https://your-app.up.railway.app

# Or Next.js:
NEXT_PUBLIC_API_URL=https://your-app.up.railway.app
```

**Deploy:**
```bash
# Vercel auto-deploys from GitHub
# Or manual:
vercel --prod
```

**Test:**
```bash
# Visit: https://your-app.vercel.app
# Try login/register
# Check browser console for CORS errors (should be none)
```

---

### 1.4 Week 1 Checklist

- [ ] Database schema created (8 tables)
- [ ] RLS policies enabled (5 tables)
- [ ] Database roles created (migrator, app_user)
- [ ] Backend deployed to Railway
- [ ] Environment variables configured
- [ ] Health check returns 200 OK
- [ ] Frontend deployed to Vercel
- [ ] Login/authentication works
- [ ] No CORS errors in browser console
- [ ] JWT tokens generated and verified

**Cost at end of Week 1:** $0-5/month (using free tiers)

---

## Phase 2: Data Migration & Backups (Next Week)

**Goal:** Migrate existing data and set up automated backups

### 2.1 SQLite to Neon Migration

**Export from SQLite:**
```bash
cd backend

# Export items
sqlite3 inventory.sqlite << EOF
.headers on
.mode csv
.output items.csv
SELECT id, item_number, name, unit, category, min_qty, max_qty, created_at FROM item;
EOF

# Export locations
sqlite3 inventory.sqlite << EOF
.headers on
.mode csv
.output locations.csv
SELECT id, code, name, temp_zone, created_at FROM location;
EOF

# Export users
sqlite3 inventory.sqlite << EOF
.headers on
.mode csv
.output users.csv
SELECT id, email, display_name, role, created_at FROM app_user;
EOF

# Export counts
sqlite3 inventory.sqlite << EOF
.headers on
.mode csv
.output counts.csv
SELECT id, item_id, location_id, counted_by, qty_on_hand, counted_at FROM inventory_count;
EOF

# Export movements
sqlite3 inventory.sqlite << EOF
.headers on
.mode csv
.output movements.csv
SELECT id, item_id, location_id, type, qty, note, created_by, created_at FROM movement;
EOF
```

**Import to Neon:**
```bash
# Use direct (non-pooled) connection for faster COPY
export PGURL="postgresql://app_user_login:***@ep-***.neon.tech/neondb?sslmode=require"

# Temporarily disable RLS for import
psql "$PGURL" << EOF
ALTER TABLE app_user DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count DISABLE ROW LEVEL SECURITY;
ALTER TABLE movement DISABLE ROW LEVEL SECURITY;
EOF

# Import data
psql "$PGURL" -c "\copy item(id,item_number,name,unit,category,min_qty,max_qty,created_at) FROM 'items.csv' CSV HEADER"
psql "$PGURL" -c "\copy location(id,code,name,temp_zone,created_at) FROM 'locations.csv' CSV HEADER"
psql "$PGURL" -c "\copy app_user(id,email,display_name,role,created_at) FROM 'users.csv' CSV HEADER"
psql "$PGURL" -c "\copy inventory_count(id,item_id,location_id,counted_by,qty_on_hand,counted_at) FROM 'counts.csv' CSV HEADER"
psql "$PGURL" -c "\copy movement(id,item_id,location_id,type,qty,note,created_by,created_at) FROM 'movements.csv' CSV HEADER"

# Re-enable RLS
psql "$PGURL" << EOF
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement ENABLE ROW LEVEL SECURITY;
EOF

# Cleanup
rm -f *.csv
```

**Verify:**
```bash
# Check row counts
psql "$PGURL" << EOF
SELECT 'items' AS table, COUNT(*) FROM item
UNION ALL
SELECT 'locations', COUNT(*) FROM location
UNION ALL
SELECT 'users', COUNT(*) FROM app_user
UNION ALL
SELECT 'counts', COUNT(*) FROM inventory_count
UNION ALL
SELECT 'movements', COUNT(*) FROM movement;
EOF
```

---

### 2.2 Automated Backups

**Install Dependencies:**
```bash
# On your backup server (can be local machine)
brew install postgresql rclone  # macOS
# OR
apt install postgresql-client rclone  # Linux
```

**Configure rclone for OneDrive:**
```bash
rclone config

# Steps:
# 1. Choose: n (New remote)
# 2. Name: onedrive
# 3. Storage: onedrive
# 4. Client ID: (leave blank)
# 5. Client Secret: (leave blank)
# 6. Region: 1 (Microsoft Cloud Global)
# 7. Edit advanced config? n
# 8. Use web browser to authorize? y
# 9. Follow browser auth flow
# 10. Drive: 0 (default)
# 11. Confirm: y
```

**Test Backup:**
```bash
cd backend

# Create .env with DATABASE_URL
echo "DATABASE_URL=postgresql://app_user_login:***@ep-***.neon.tech/neondb?sslmode=require" > .env

# Run backup
./scripts/backup-minimal.sh

# Verify in OneDrive
rclone ls onedrive:NeuroPilot/backups/db/
```

**Schedule with Cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/backend && ./scripts/backup-minimal.sh >> /var/log/neuropilot-backup.log 2>&1

# Or use Railway Cron (if available on your plan)
```

**Test Restore:**
```bash
# Download latest backup
rclone copy onedrive:NeuroPilot/backups/db/inventory_2025-01-20_02-00-00.dump ./

# Restore to test database
createdb neuropilot_test
pg_restore -d neuropilot_test -c inventory_2025-01-20_02-00-00.dump

# Verify
psql neuropilot_test -c "\dt"
```

---

### 2.3 Week 2 Checklist

- [ ] Data exported from SQLite
- [ ] Data imported to Neon Postgres
- [ ] Row counts verified
- [ ] RLS re-enabled after import
- [ ] rclone configured for OneDrive
- [ ] First backup completed successfully
- [ ] Backup appears in OneDrive
- [ ] Restore tested on test database
- [ ] Cron job scheduled for daily backups
- [ ] Backup log file created and readable

**Cost at end of Week 2:** $2-25/month (OneDrive $2, Neon $0-19, Railway $0-5)

---

## Phase 3: DNS & WAF (Week 3)

**Goal:** Add custom domain and Cloudflare protection

### 3.1 Custom Domain Setup

**Vercel Frontend:**
```bash
# Vercel Dashboard → Project → Settings → Domains
# Add: app.neuropilot.ai
# Follow DNS instructions from Vercel
```

**Railway Backend:**
```bash
# Railway Dashboard → Project → Settings → Domains
# Add: api.neuropilot.ai
# Note the CNAME target (e.g., your-app.up.railway.app)
```

---

### 3.2 Cloudflare Configuration

**Add Domain to Cloudflare:**
```bash
# Go to https://dash.cloudflare.com
# Add site: neuropilot.ai
# Update nameservers at your registrar
# Wait for propagation (5-60 minutes)
```

**DNS Records:**
```
Type    Name    Content                          Proxy Status
CNAME   api     your-app.up.railway.app          Proxied (orange cloud)
CNAME   app     cname.vercel-dns.com             Proxied (orange cloud)
A       @       76.76.21.21 (Vercel IP)          Proxied (optional)
```

**Basic WAF Rules:**

1. **SSL/TLS Settings:**
   - SSL/TLS encryption mode: Full (strict)
   - Always Use HTTPS: On
   - Minimum TLS Version: 1.2

2. **Firewall Rules:**
   ```
   # Rule 1: Block non-API traffic to backend
   (http.host eq "api.neuropilot.ai" and not http.request.uri.path starts with "/")
   → Action: Allow

   # Rule 2: Rate limit login
   (http.host eq "api.neuropilot.ai" and http.request.uri.path eq "/auth/login")
   → Rate limit: 10 requests/15 minutes
   ```

3. **Security Settings:**
   - Bot Fight Mode: On
   - Security Level: Medium
   - Challenge Passage: 30 minutes

**Page Rules:**
```
# Rule 1: Cache frontend static assets
URL: app.neuropilot.ai/assets/*
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 month

# Rule 2: Bypass cache for API
URL: api.neuropilot.ai/*
Settings:
  - Cache Level: Bypass
```

---

### 3.3 Update Environment Variables

**Railway:**
```bash
# Update ALLOW_ORIGIN to use custom domain
ALLOW_ORIGIN=https://app.neuropilot.ai,https://www.neuropilot.ai
```

**Vercel:**
```bash
# Update API URL to use custom domain
VITE_API_URL=https://api.neuropilot.ai
```

---

### 3.4 Week 3 Checklist

- [ ] Custom domain added to Vercel
- [ ] Custom domain added to Railway
- [ ] Domain added to Cloudflare
- [ ] Nameservers updated at registrar
- [ ] DNS records configured
- [ ] SSL/TLS Full (strict) enabled
- [ ] WAF firewall rules created
- [ ] Page rules for caching configured
- [ ] Environment variables updated
- [ ] App accessible at custom domain
- [ ] No SSL warnings in browser
- [ ] API requests work through Cloudflare

**Cost at end of Week 3:** $22-45/month
```
OneDrive:   $2/month (100GB)
Neon:       $0-19/month (Free or Pro)
Railway:    $0-5/month (Hobby or Starter)
Cloudflare: $20/month (Pro plan)
---
Total:      $22-46/month
```

---

## Success Criteria

Your production deployment is complete when:

✅ **Week 1:**
- Backend health check returns 200 OK
- Frontend loads without errors
- User can login successfully
- No CORS errors

✅ **Week 2:**
- All data migrated from SQLite
- Daily backups running
- Restore tested successfully
- RLS policies enforced

✅ **Week 3:**
- App accessible at custom domain (https://app.neuropilot.ai)
- API accessible at custom domain (https://api.neuropilot.ai)
- SSL certificate valid (A+ rating)
- WAF blocking malicious requests
- Cloudflare analytics showing traffic

---

## Future Enhancements (Week 4+)

**Monitoring:**
- Datadog or Grafana Cloud
- Custom dashboards
- Alert rules for errors/downtime

**Advanced Security:**
- GPG-encrypted backups
- IP whitelisting for admin routes
- 2FA for admin accounts
- Security audit logs

**Performance:**
- Redis caching layer
- Database connection pooling tuning
- CDN for static assets
- Image optimization

**Scalability:**
- Horizontal scaling (multiple Railway instances)
- Read replicas for Neon
- Load balancer
- Auto-scaling policies

---

## Comparison: Fast vs. Comprehensive

| Aspect | Fast (This Guide) | Comprehensive |
|--------|------------------|---------------|
| **Timeline** | 3 weeks | 2-3 months |
| **Server** | `server.production-minimal.js` | Full middleware stack |
| **Backups** | pg_dump + OneDrive | GPG encryption + verification |
| **Infra** | Railway + Vercel + Neon | + Redis, Datadog, WAF rules |
| **Cost** | $22-46/month | $100-400/month |
| **Use Case** | MVP, small teams | Enterprise, compliance |

**Recommendation:** Start with Fast (this guide), add Comprehensive features as needed.

---

## Support Resources

- **Railway Docs:** https://docs.railway.app
- **Neon Docs:** https://neon.tech/docs
- **Cloudflare Docs:** https://developers.cloudflare.com
- **Vercel Docs:** https://vercel.com/docs

---

**Version:** 1.0.0 (Minimal/Fast Track)
**Last Updated:** 2025-01-20
**Status:** Production-Ready
