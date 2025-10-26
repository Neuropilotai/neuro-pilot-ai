# NeuroPilot Inventory - Production Quick Start

**TL;DR:** Get to production in 3 weeks for <$50/month

---

## Choose Your Path

### 🚀 Fast Track (Recommended for MVP)
**Timeline:** 3 weeks | **Cost:** $22-46/month

```bash
# Week 1: Deploy
psql "$DATABASE_URL" -f backend/migrations/001_schema.sql
psql "$DATABASE_URL" -f backend/migrations/002_roles_and_grants.sql
psql "$DATABASE_URL" -f backend/migrations/003_rls_policies.sql

# Deploy to Railway
export DATABASE_URL="postgresql://..."
export JWT_SECRET=$(openssl rand -base64 32)
export ALLOW_ORIGIN="https://your-app.vercel.app"
node server.production-minimal.js

# Week 2: Backups
./scripts/backup-minimal.sh

# Week 3: Custom domain + Cloudflare
# (Follow PRODUCTION_DEPLOYMENT_PHASED.md)
```

**Read:** [`PRODUCTION_DEPLOYMENT_PHASED.md`](./PRODUCTION_DEPLOYMENT_PHASED.md)

---

### 🏢 Enterprise Track (For compliance/large teams)
**Timeline:** 2-3 months | **Cost:** $100-400/month

```bash
# Full security stack
psql "$DATABASE_URL" -f backend/migrations/production_001_init_schema.sql
node server.production.js

# Comprehensive backups with GPG
./backup/backup-database.sh
./backup/test-backup.sh

# Advanced monitoring
# (Follow PRODUCTION_DEPLOYMENT_COMPLETE.md)
```

**Read:** [`PRODUCTION_DEPLOYMENT_COMPLETE.md`](./PRODUCTION_DEPLOYMENT_COMPLETE.md)

---

## File Guide

### Fast/Minimal Files
```
backend/
├── server.production-minimal.js    ← Lean Express server (200 lines)
├── migrations/
│   ├── 001_schema.sql             ← Core tables
│   ├── 002_roles_and_grants.sql   ← DB roles
│   └── 003_rls_policies.sql       ← RLS policies
└── scripts/
    └── backup-minimal.sh          ← pg_dump + OneDrive

PRODUCTION_DEPLOYMENT_PHASED.md    ← 3-week deployment guide
```

### Comprehensive Files
```
backend/
├── server.production.js           ← Full middleware (600 lines)
├── migrations/
│   └── production_001_init_schema.sql  ← All-in-one
├── backup/
│   ├── backup-database.sh         ← GPG + verification
│   ├── restore-database.sh        ← Automated restore
│   ├── test-backup.sh             ← Integrity tests
│   ├── setup-cron.sh              ← Interactive setup
│   └── README.md                  ← Complete docs
└── cloudflare/
    └── cloudflare-config.md       ← WAF configuration

PRODUCTION_DEPLOYMENT_COMPLETE.md  ← Enterprise guide
```

### Decision Helper
```
DEPLOYMENT_COMPARISON.md           ← Choose the right approach
```

---

## Which Should I Use?

### Use **Fast/Minimal** if:
- ✅ Need to launch in 3 weeks
- ✅ Budget <$50/month
- ✅ Team size 1-5 people
- ✅ MVP or internal tool
- ✅ Non-critical data

### Use **Comprehensive** if:
- ✅ Enterprise customer
- ✅ Compliance required (HIPAA, SOC2)
- ✅ Sensitive data (PII, PHI, financial)
- ✅ 1,000+ users
- ✅ High availability SLA

**Can't decide?** Start with Fast, upgrade to Comprehensive later.

---

## One-Command Deploy (Fast Track)

```bash
# 1. Set up database
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# 2. Run migrations
for file in backend/migrations/00{1,2,3}_*.sql; do
  psql "$DATABASE_URL" -f "$file"
done

# 3. Generate secrets
export JWT_SECRET=$(openssl rand -base64 32)
export ALLOW_ORIGIN="https://your-app.vercel.app"

# 4. Start server
cd backend
node server.production-minimal.js
```

**Deploy to Railway:**
```bash
railway up
```

**Deploy frontend to Vercel:**
```bash
vercel --prod
```

---

## Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│ User Browser                                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Cloudflare (WAF/CDN)                                        │
│ - DDoS protection                                           │
│ - Rate limiting                                             │
│ - SSL/TLS termination                                       │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
┌────────────▼────────────┐  ┌───────────▼──────────────────┐
│ Vercel (Frontend)       │  │ Railway (Backend)            │
│ - Next.js/Vite          │  │ - Express + JWT + RLS        │
│ - Edge CDN              │  │ - Pino logging               │
│ - Auto-deploy           │  │ - Rate limiting              │
└─────────────────────────┘  └───────────┬──────────────────┘
                                         │
                            ┌────────────▼──────────────────┐
                            │ Neon Postgres                 │
                            │ - Serverless                  │
                            │ - Auto-scaling                │
                            │ - Row-Level Security          │
                            └────────────┬──────────────────┘
                                         │
                            ┌────────────▼──────────────────┐
                            │ OneDrive (Backups)            │
                            │ - Encrypted dumps             │
                            │ - 30-day retention            │
                            │ - rclone sync                 │
                            └───────────────────────────────┘
```

---

## Cost Calculator

### Minimal (MVP)
```
Neon (Free):        $0/month
Railway (Hobby):    $5/month
Vercel (Free):      $0/month
Cloudflare (Pro):  $20/month
OneDrive (100GB):   $2/month
────────────────────────────
Total:             $27/month
```

### Production (Fast Track)
```
Neon (Pro):        $19/month
Railway (Starter): $20/month
Vercel (Pro):      $20/month
Cloudflare (Pro):  $20/month
OneDrive (1TB):    $10/month
────────────────────────────
Total:             $89/month
```

### Enterprise (Comprehensive)
```
Neon (Scale):       $100/month
Railway (Pro):      $180/month
Vercel (Enterprise): $40/month
Cloudflare (Biz):   $200/month
OneDrive (1TB):      $10/month
Datadog:             $50/month
──────────────────────────────
Total:              $580/month
```

---

## Next Steps

1. **Read the guide for your track:**
   - Fast: [`PRODUCTION_DEPLOYMENT_PHASED.md`](./PRODUCTION_DEPLOYMENT_PHASED.md)
   - Comprehensive: [`PRODUCTION_DEPLOYMENT_COMPLETE.md`](./PRODUCTION_DEPLOYMENT_COMPLETE.md)
   - Unsure: [`DEPLOYMENT_COMPARISON.md`](./DEPLOYMENT_COMPARISON.md)

2. **Set up accounts:**
   - [Neon.tech](https://neon.tech) - Database
   - [Railway.app](https://railway.app) - Backend hosting
   - [Vercel.com](https://vercel.com) - Frontend hosting
   - [Cloudflare.com](https://cloudflare.com) - WAF/CDN

3. **Run migrations:**
   ```bash
   psql "$DATABASE_URL" -f backend/migrations/001_schema.sql
   ```

4. **Deploy:**
   ```bash
   railway up  # Backend
   vercel --prod  # Frontend
   ```

5. **Set up backups:**
   ```bash
   ./scripts/backup-minimal.sh
   ```

---

## Support

- **Fast Track Issues:** Open GitHub issue with `[fast]` tag
- **Enterprise Support:** Contact enterprise@neuropilot.ai
- **Security Issues:** security@neuropilot.ai

---

**Version:** 1.0.0
**Last Updated:** 2025-01-20
**Status:** Production-Ready ✅
