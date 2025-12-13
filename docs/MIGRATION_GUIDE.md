# Migration Guide: Multi-Tenant Isolation & Balance Table

## Overview

This guide walks through applying the critical enterprise hardening migrations to your production database.

## Prerequisites

- PostgreSQL 14+ database
- Database backup (REQUIRED before migration)
- Access to Railway dashboard or database directly
- Low-traffic maintenance window (recommended)

## Pre-Migration Checklist

- [ ] **Backup database** (critical - do not skip)
- [ ] Test migration on staging database first
- [ ] Verify staging data integrity after migration
- [ ] Schedule maintenance window (1-2 hours recommended)
- [ ] Notify users of potential brief downtime
- [ ] Have rollback plan ready

## Migration Steps

### Step 1: Backup Database

**CRITICAL**: Always backup before migration.

```bash
# Via Railway CLI
railway backups create

# Or via Railway Dashboard
# Navigate to PostgreSQL service → Backups → Create Backup

# Or via pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Test on Staging

1. **Copy production database to staging**
   ```bash
   # Restore production backup to staging database
   psql $STAGING_DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

2. **Run migration on staging**
   ```bash
   # Connect to staging database
   psql $STAGING_DATABASE_URL
   
   # Run migration script
   \i prisma/migrations/add_organization_support/migration.sql
   ```

3. **Verify staging migration**
   ```bash
   # Check organizations table exists
   SELECT COUNT(*) FROM organizations;
   
   # Check orgId columns added
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name = 'org_id';
   
   # Verify default org created
   SELECT id, name FROM organizations WHERE name = 'Default Organization';
   
   # Check data backfilled
   SELECT COUNT(*) FROM users WHERE org_id IS NOT NULL;
   ```

4. **Test application against staging**
   - Verify tenant isolation works
   - Test inventory queries
   - Verify no cross-org data access

### Step 3: Apply to Production

**During maintenance window:**

1. **Create final backup**
   ```bash
   railway backups create
   ```

2. **Run migration**
   ```bash
   # Option A: Via psql
   psql $DATABASE_URL < prisma/migrations/add_organization_support/migration.sql
   
   # Option B: Via Railway SQL console
   # Copy migration.sql content and run in Railway SQL console
   ```

3. **Monitor migration progress**
   - Watch for errors
   - Monitor database CPU/memory
   - Check application logs

4. **Verify migration success**
   ```sql
   -- Check organizations table
   SELECT COUNT(*) FROM organizations;
   
   -- Verify orgId columns are NOT NULL
   SELECT 
     table_name,
     column_name,
     is_nullable
   FROM information_schema.columns
   WHERE column_name = 'org_id'
   AND table_schema = 'public';
   -- All should show 'NO' for is_nullable
   
   -- Verify all records have orgId
   SELECT 
     'users' as table_name, COUNT(*) as total, COUNT(org_id) as with_org_id
   FROM users
   UNION ALL
   SELECT 'items', COUNT(*), COUNT(org_id) FROM items
   UNION ALL
   SELECT 'locations', COUNT(*), COUNT(org_id) FROM locations
   UNION ALL
   SELECT 'inventory_ledger', COUNT(*), COUNT(org_id) FROM inventory_ledger;
   -- All counts should match (total = with_org_id)
   ```

### Step 4: Add Balance Table

After organization migration is complete:

1. **Run Prisma migration for balance table**
   ```bash
   npx prisma migrate dev --name add_balance_table
   ```

2. **Apply trigger**
   ```bash
   psql $DATABASE_URL < prisma/migrations/add_balance_table/trigger.sql
   ```

3. **Backfill initial balances**
   ```bash
   tsx prisma/scripts/backfill-balances.ts
   ```

4. **Verify balances**
   ```sql
   -- Check balance records created
   SELECT COUNT(*) FROM inventory_balances;
   
   -- Compare with ledger
   SELECT 
     COUNT(DISTINCT (org_id, item_id, location_id, lot_id)) as ledger_combinations,
     COUNT(*) as balance_records
   FROM inventory_ledger
   CROSS JOIN (SELECT COUNT(*) FROM inventory_balances) b;
   ```

### Step 5: Update Application Code

1. **Deploy updated code** with:
   - Tenant middleware
   - Scoped Prisma queries
   - Balance table queries

2. **Restart application services**

3. **Verify application works**
   - Test authentication
   - Test inventory queries
   - Verify tenant isolation

## Rollback Procedure

If migration fails or causes issues:

### Rollback Organization Migration

```sql
-- WARNING: This will remove orgId columns and organization data
-- Only use if absolutely necessary

-- 1. Drop foreign key constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_orgId_fkey;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_orgId_fkey;
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_orgId_fkey;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_orgId_fkey;
ALTER TABLE count_sheets DROP CONSTRAINT IF EXISTS count_sheets_orgId_fkey;
ALTER TABLE count_lines DROP CONSTRAINT IF EXISTS count_lines_orgId_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_orgId_fkey;
ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS feature_flags_orgId_fkey;

-- 2. Drop unique constraints
DROP INDEX IF EXISTS users_orgId_email_key;
DROP INDEX IF EXISTS items_orgId_itemNumber_key;
DROP INDEX IF EXISTS locations_orgId_site_name_key;
DROP INDEX IF EXISTS count_sheets_orgId_countNumber_key;
DROP INDEX IF EXISTS feature_flags_orgId_key_key;

-- 3. Restore original unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS items_itemNumber_key ON items(item_number);
CREATE UNIQUE INDEX IF NOT EXISTS locations_site_name_key ON locations(site, name);
CREATE UNIQUE INDEX IF NOT EXISTS count_sheets_countNumber_key ON count_sheets(count_number);
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_key_key ON feature_flags(key);

-- 4. Drop orgId columns
ALTER TABLE users DROP COLUMN IF EXISTS org_id;
ALTER TABLE items DROP COLUMN IF EXISTS org_id;
ALTER TABLE locations DROP COLUMN IF EXISTS org_id;
ALTER TABLE inventory_ledger DROP COLUMN IF EXISTS org_id;
ALTER TABLE count_sheets DROP COLUMN IF EXISTS org_id;
ALTER TABLE count_lines DROP COLUMN IF EXISTS org_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS org_id;
ALTER TABLE feature_flags DROP COLUMN IF EXISTS org_id;

-- 5. Drop organizations table
DROP TABLE IF EXISTS organizations;
```

### Rollback Balance Table

```sql
-- 1. Drop trigger
DROP TRIGGER IF EXISTS inventory_ledger_balance_trigger ON inventory_ledger;

-- 2. Drop function
DROP FUNCTION IF EXISTS update_inventory_balance();

-- 3. Drop table (via Prisma)
-- npx prisma migrate dev --name remove_balance_table
```

## Troubleshooting

### Migration Fails with "column already exists"

**Cause**: Migration partially ran before.

**Solution**:
```sql
-- Check which columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name LIKE '%org%';

-- If org_id exists but is nullable, continue migration from backfill step
```

### Migration Takes Too Long

**Cause**: Large dataset, slow database.

**Solution**:
- Run during off-peak hours
- Increase database resources temporarily
- Consider batching backfill (modify migration script)

### Foreign Key Constraint Errors

**Cause**: Data integrity issues or migration order.

**Solution**:
```sql
-- Check for orphaned records
SELECT COUNT(*) FROM users WHERE org_id NOT IN (SELECT id FROM organizations);

-- Fix orphaned records
UPDATE users SET org_id = (SELECT id FROM organizations LIMIT 1) 
WHERE org_id NOT IN (SELECT id FROM organizations);
```

### Balance Table Not Updating

**Cause**: Trigger not created or disabled.

**Solution**:
```sql
-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'inventory_ledger_balance_trigger';

-- Recreate trigger
\i prisma/migrations/add_balance_table/trigger.sql
```

## Post-Migration Tasks

1. **Update Environment Variables**
   - Set `DEFAULT_ORG_ID` if using default org fallback
   - Verify `DATABASE_URL` is correct

2. **Configure Monitoring**
   - Set up backup monitoring job
   - Set up reconciliation job
   - Configure alerts

3. **Test Tenant Isolation**
   - Create test organizations
   - Verify no cross-org data access
   - Test all API endpoints

4. **Update Documentation**
   - Update API documentation
   - Document new tenant requirements
   - Update onboarding guides

## Support

If you encounter issues:

1. Check application logs
2. Check database logs
3. Review migration script output
4. Consult disaster recovery plan
5. Contact database administrator

## Related Documentation

- [Backup & Recovery Guide](./BACKUP_RECOVERY.md)
- [Disaster Recovery Plan](./DISASTER_RECOVERY.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)

