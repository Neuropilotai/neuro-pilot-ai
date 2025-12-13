# Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System

## Type
`feat(enterprise)` - Enterprise hardening features

## Summary

This PR adds comprehensive enterprise hardening features including multi-tenant database isolation, materialized inventory balance table, enhanced authentication/validation, and backup/recovery systems.

## Changes

### Database
- ✅ Prisma schema with Organization and InventoryBalance models
- ✅ Migration 041: Inventory balance table with PostgreSQL trigger
- ✅ Automatic balance updates on ledger INSERT
- ✅ Zero-downtime compatible migrations

### Middleware
- ✅ Enhanced tenant resolution (header/subdomain/API key)
- ✅ Enhanced authentication (JWT + user context)
- ✅ Request validation with Zod schemas
- ✅ RBAC helpers (requireAdmin, requireEditor, requireCounter)

### Routes
- ✅ Enhanced items routes (`/api/items-enterprise`)
- ✅ Enhanced locations routes (`/api/locations-enterprise`)
- ✅ Enhanced counts routes (`/api/counts-enterprise`)
- ✅ All routes use tenant isolation and validation

### Utilities
- ✅ Query scoping utilities for automatic orgId filtering
- ✅ Prisma client wrapper
- ✅ Organization management CLI scripts
- ✅ Migration validation scripts

### Jobs
- ✅ Balance reconciliation job (daily)
- ✅ Backup monitoring job (daily)

### Documentation
- ✅ Enterprise hardening guide
- ✅ Migration guide

## Testing Checklist

### Pre-Merge
- [ ] Review code changes
- [ ] Verify migration is safe and additive
- [ ] Check that existing routes still work
- [ ] Verify tenant isolation prevents cross-org access

### Post-Merge (Staging)
- [ ] Run migration on staging database
- [ ] Backfill balances
- [ ] Test tenant resolution (header/subdomain/API key)
- [ ] Test enhanced routes
- [ ] Verify balance table updates automatically
- [ ] Run reconciliation job
- [ ] Test backup monitoring

### Production Deployment
- [ ] Schedule maintenance window
- [ ] Create database backup
- [ ] Run migration
- [ ] Backfill balances
- [ ] Deploy code
- [ ] Verify functionality
- [ ] Monitor for issues

## Migration Steps

1. **Run Migration**:
   ```bash
   psql $DATABASE_URL -f inventory-enterprise/backend/migrations/postgres/041_inventory_balance_table.sql
   ```

2. **Backfill Balances**:
   ```bash
   npm run backfill:balances
   ```

3. **Verify**:
   ```bash
   npm run validate:migration
   ```

## Breaking Changes

**None** - All changes are additive and work alongside existing functionality.

## Railway Preview Deployment

**Note**: Railway preview deployments need to be verified. If preview deployments are enabled, this PR should trigger a preview deployment for testing.

If preview deployments are not enabled:
- Test manually on staging before merging
- Or enable preview deployments in Railway Dashboard → Settings → GitHub → Preview Deployments

## Files Changed

- `inventory-enterprise/backend/prisma/schema.prisma` (new)
- `inventory-enterprise/backend/migrations/postgres/041_inventory_balance_table.sql` (new)
- `inventory-enterprise/backend/src/middleware/*` (new)
- `inventory-enterprise/backend/src/routes/*-enterprise.js` (new)
- `inventory-enterprise/backend/src/schemas/*.js` (new)
- `inventory-enterprise/backend/src/utils/*.js` (new)
- `inventory-enterprise/backend/src/jobs/*.js` (new)
- `inventory-enterprise/backend/scripts/*.js` (new)
- `inventory-enterprise/backend/server-v21_1.js` (modified - middleware and route registration)
- `inventory-enterprise/backend/package.json` (modified - dependencies and scripts)
- `inventory-enterprise/backend/docs/*.md` (new)

## Related Issues

- Enterprise hardening implementation
- Multi-tenant isolation
- Performance optimization (balance queries)

## Deployment Notes

- Migration is safe and additive (no destructive changes)
- Works alongside existing routes (non-breaking)
- Requires Prisma client generation: `npm run prisma:generate`
- Balance table will be empty until backfill is run

