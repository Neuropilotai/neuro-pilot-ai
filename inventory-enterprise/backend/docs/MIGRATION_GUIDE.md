# Enterprise Hardening Migration Guide

## Overview

This guide covers migrating to the enterprise hardening features, including the inventory balance table and enhanced tenant isolation.

## Prerequisites

- PostgreSQL 14+ database
- Access to production database (or staging for testing)
- Backup of current database
- Maintenance window scheduled (recommended: 1-2 hours)

## Migration Steps

### Step 1: Pre-Migration Backup

```bash
# Create backup before migration
# Railway: Use Railway dashboard to create backup
# Or: pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Balance Table Migration

```bash
cd inventory-enterprise/backend
psql $DATABASE_URL -f migrations/postgres/041_inventory_balance_table.sql
```

This migration:
- Creates `inventory_balances` table
- Creates PostgreSQL trigger for automatic updates
- Adds indexes for performance
- Is idempotent (safe to re-run)

### Step 3: Backfill Balances

```bash
npm run backfill:balances
```

This populates the balance table from existing ledger data.

### Step 4: Verify Migration

```bash
npm run validate:migration
```

Expected output:
```
✅ Organizations table exists
✅ Inventory balances table exists
✅ Balance trigger exists
✅ Balance table indexes exist

✅ All checks passed
```

### Step 5: Deploy Application Code

Deploy the updated code with:
- Enhanced middleware
- New routes
- Prisma schema

### Step 6: Verify Functionality

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test tenant resolution
curl -H "X-Org-Id: <org-id>" http://localhost:3000/api/items-enterprise

# Test balance query (if ledger exists)
# Balance should be fast (uses materialized table)
```

## Rollback Procedure

If issues occur:

1. **Restore Database Backup**:
   ```bash
   # Railway: Use Railway dashboard to restore
   # Or: psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

2. **Revert Code Deployment**:
   ```bash
   git revert <commit-sha>
   git push origin main
   ```

3. **Remove Balance Table** (if needed):
   ```sql
   DROP TRIGGER IF EXISTS inventory_ledger_balance_trigger ON inventory_ledger;
   DROP FUNCTION IF EXISTS update_inventory_balance();
   DROP TABLE IF EXISTS inventory_balances;
   ```

## Post-Migration

### Schedule Reconciliation Job

Add to cron or job scheduler:

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/backend && npm run reconcile:balances
```

### Monitor Backups

```bash
# Daily at 3 AM
0 3 * * * cd /path/to/backend && npm run monitor:backups
```

## Troubleshooting

### Balance Table Not Updating

Check trigger exists:
```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'inventory_ledger_balance_trigger';
```

If missing, re-run migration.

### Reconciliation Shows Discrepancies

Small discrepancies (< 0.01) are auto-corrected. Large discrepancies require manual review.

Check reconciliation logs for details.

### Tenant Resolution Not Working

Verify:
1. Organization exists in database
2. `X-Org-Id` header is correct
3. Subdomain matches organization slug
4. API key is valid (if using)

## Support

For issues, check:
- Server logs for errors
- Database logs for query issues
- Migration validation output

