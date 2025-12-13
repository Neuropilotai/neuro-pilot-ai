# Quick Reference Guide

## Common Operations

### Database Migrations

```bash
# Run organization migration
npm run migrate:org

# Run balance table migration  
npm run migrate:balance

# Backfill balances from ledger
npm run backfill:balances
```

### Monitoring & Maintenance

```bash
# Reconcile balance table with ledger
npm run reconcile:balances

# Check backup status
npm run monitor:backups

# Verify backup manually
npm run verify:backup
```

### Database Queries

```sql
-- Check organization count
SELECT COUNT(*) FROM organizations;

-- Check orgId backfill status
SELECT 
  'users' as table_name,
  COUNT(*) as total,
  COUNT(org_id) as with_org_id,
  COUNT(*) - COUNT(org_id) as missing
FROM users
UNION ALL
SELECT 'items', COUNT(*), COUNT(org_id), COUNT(*) - COUNT(org_id) FROM items
UNION ALL
SELECT 'locations', COUNT(*), COUNT(org_id), COUNT(*) - COUNT(org_id) FROM locations;

-- Check balance table records
SELECT COUNT(*) FROM inventory_balances;

-- Find balance discrepancies
SELECT 
  l.org_id,
  l.item_id,
  l.location_id,
  SUM(l.qty_canonical) as ledger_sum,
  COALESCE(b.qty_canonical, 0) as balance_qty,
  ABS(SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0)) as diff
FROM inventory_ledger l
LEFT JOIN inventory_balances b ON (
  b.org_id = l.org_id
  AND b.item_id = l.item_id
  AND b.location_id = l.location_id
  AND (b.lot_id = l.lot_id OR (b.lot_id IS NULL AND l.lot_id IS NULL))
)
GROUP BY l.org_id, l.item_id, l.location_id, b.qty_canonical
HAVING ABS(SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0)) > 0.000001;
```

### API Usage Examples

#### With X-Org-Id Header
```bash
curl -H "X-Org-Id: org-123" \
     -H "Authorization: Bearer $TOKEN" \
     https://api.example.com/api/inventory/balance?itemId=item-1&locationId=loc-1
```

#### With Subdomain
```bash
curl -H "Authorization: Bearer $TOKEN" \
     https://org1.example.com/api/inventory/balance?itemId=item-1&locationId=loc-1
```

#### With API Key
```bash
curl -H "X-API-Key: api-key-123" \
     https://api.example.com/api/inventory/balance?itemId=item-1&locationId=loc-1
```

## Tenant Resolution Priority

1. **X-Org-Id header** (highest priority)
2. **Subdomain** (e.g., `org1.example.com`)
3. **API Key** (X-API-Key header)
4. **Default org** (if configured)

## File Locations

### Core Files
- Schema: `prisma/schema.prisma`
- Tenant Middleware: `apps/api/src/middleware/tenant.ts`
- Prisma Scoping: `apps/api/src/utils/prisma-scope.ts`

### Migrations
- Organization: `prisma/migrations/add_organization_support/migration.sql`
- Balance Trigger: `prisma/migrations/add_balance_table/trigger.sql`

### Scripts
- Balance Backfill: `prisma/scripts/backfill-balances.ts`
- Reconciliation: `apps/api/src/jobs/balance-reconciliation.ts`
- Backup Monitor: `apps/api/src/jobs/backup-monitor.ts`

### Documentation
- Migration Guide: `docs/MIGRATION_GUIDE.md`
- Backup & Recovery: `docs/BACKUP_RECOVERY.md`
- Disaster Recovery: `docs/DISASTER_RECOVERY.md`

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...

# Optional
DEFAULT_ORG_ID=org-123  # Default org for fallback
RAILWAY_TOKEN=...       # For backup monitoring
```

## Cron Schedule Examples

```bash
# Daily reconciliation at 2 AM
0 2 * * * cd /path/to/project && npm run reconcile:balances

# Daily backup monitoring at 3 AM
0 3 * * * cd /path/to/project && npm run monitor:backups
```

## Emergency Contacts

- Database Issues: [Contact]
- Railway Support: support@railway.app
- On-Call: [Contact]

## Common Issues

### Migration Fails
- Check database backup exists
- Verify PostgreSQL version (14+)
- Check for existing columns (use `IF NOT EXISTS`)

### Balance Table Not Updating
- Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'inventory_ledger_balance_trigger';`
- Recreate trigger: `psql $DATABASE_URL < prisma/migrations/add_balance_table/trigger.sql`

### Tenant Isolation Not Working
- Verify middleware is applied to routes
- Check orgId is set on request: `console.log(req.orgId)`
- Verify Prisma scoping is used: `createScopedPrisma(orgId, prisma)`

## Support

For detailed help, see:
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)

