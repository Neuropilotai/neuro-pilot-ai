# Enterprise Hardening Deployment Notes

## Railway Preview Deployment

### Status Check

Railway preview deployments for pull requests need to be verified:

1. **Check Railway Settings**:
   - Go to Railway Dashboard → Project Settings → GitHub
   - Verify "Preview Deployments" is enabled
   - If not enabled, enable it for PR testing

2. **If Preview Deployments Enabled**:
   - This PR should automatically trigger a preview deployment
   - Preview URL will be available in PR comments
   - Test all endpoints on preview before merging

3. **If Preview Deployments Not Enabled**:
   - Test manually on staging environment
   - Or enable preview deployments for safer testing

### Preview Deployment Testing

Once preview is available:

```bash
# Test health endpoint
curl https://<preview-url>/health

# Test tenant resolution
curl -H "X-Org-Id: <org-id>" https://<preview-url>/api/items-enterprise

# Test authentication
curl -H "Authorization: Bearer <token>" https://<preview-url>/api/items-enterprise
```

## Production Deployment Checklist

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] Migration tested on staging
- [ ] Backup created
- [ ] Maintenance window scheduled
- [ ] Team notified

### Deployment
- [ ] Run migration: `psql $DATABASE_URL -f migrations/postgres/041_inventory_balance_table.sql`
- [ ] Backfill balances: `npm run backfill:balances`
- [ ] Verify migration: `npm run validate:migration`
- [ ] Deploy code
- [ ] Generate Prisma client: `npm run prisma:generate`
- [ ] Restart services

### Post-Deployment
- [ ] Verify health endpoints
- [ ] Test tenant resolution
- [ ] Test enhanced routes
- [ ] Monitor logs for errors
- [ ] Schedule reconciliation job
- [ ] Schedule backup monitoring

## Rollback Plan

If issues occur:

1. **Restore Database** (if migration caused issues):
   ```bash
   # Use Railway backup restore or:
   psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

2. **Revert Code**:
   ```bash
   git revert <merge-commit-sha>
   git push origin main
   ```

3. **Remove Balance Table** (if needed):
   ```sql
   DROP TRIGGER IF EXISTS inventory_ledger_balance_trigger ON inventory_ledger;
   DROP FUNCTION IF EXISTS update_inventory_balance();
   DROP TABLE IF EXISTS inventory_balances;
   ```

## Monitoring

After deployment, monitor:
- Server logs for errors
- Database performance (balance queries should be fast)
- Reconciliation job results
- Backup monitoring alerts

