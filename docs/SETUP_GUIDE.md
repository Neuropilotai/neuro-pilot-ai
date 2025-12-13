# Setup Guide: Enterprise Hardening Features

## Overview

This guide helps you set up and configure the enterprise hardening features that have been implemented.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Railway account (or other PostgreSQL hosting)
- Production database (or staging for testing)

## Step 1: Environment Configuration

1. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

2. **Configure required variables**
   ```bash
   # Database connection
   DATABASE_URL=postgresql://user:password@host:5432/database
   
   # Optional: Default org for fallback
   DEFAULT_ORG_ID=your-default-org-id
   ```

3. **Set up optional monitoring**
   ```bash
   # For backup monitoring (Railway)
   RAILWAY_TOKEN=your-railway-token
   
   # For alerts (choose one or more)
   PAGERDUTY_KEY=your-pagerduty-key
   SLACK_WEBHOOK_URL=your-slack-webhook
   ALERT_EMAIL=ops@example.com
   ```

## Step 2: Install Dependencies

```bash
npm install

# Generate Prisma client
npm run db:generate
```

## Step 3: Run Migrations

### On Staging First (Recommended)

1. **Backup staging database**
   ```bash
   railway backups create
   ```

2. **Run organization migration**
   ```bash
   npm run migrate:org
   ```

3. **Verify migration**
   ```bash
   # Check organizations table
   psql $DATABASE_URL -c "SELECT * FROM organizations;"
   
   # Verify orgId columns
   psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE column_name = 'org_id';"
   ```

4. **Run balance table migration**
   ```bash
   # First create table via Prisma
   npx prisma migrate dev --name add_balance_table
   
   # Then add trigger
   psql $DATABASE_URL < prisma/migrations/add_balance_table/trigger.sql
   ```

5. **Backfill balances**
   ```bash
   npm run backfill:balances
   ```

### On Production

After successful staging test:

1. **Schedule maintenance window**
2. **Create final backup**
3. **Run migrations** (same as staging)
4. **Verify application works**
5. **Monitor for errors**

## Step 4: Integrate Middleware

### Fastify Example

```typescript
import { tenantMiddlewareHook } from './middleware/tenant';
import { prisma } from './utils/prisma';

// Add tenant resolution hook
server.addHook('onRequest', tenantMiddlewareHook(prisma, process.env.DEFAULT_ORG_ID));
```

### Express Example

```typescript
import { tenantMiddleware } from './middleware/tenant';
import { prisma } from './utils/prisma';

// Add tenant middleware
app.use(tenantMiddleware(prisma, process.env.DEFAULT_ORG_ID));
```

## Step 5: Update Routes

Use scoped Prisma in all routes:

```typescript
import { createScopedPrisma } from './utils/prisma-scope';

// In route handler
const orgId = req.orgId; // Set by middleware
const scopedPrisma = createScopedPrisma(orgId, prisma);

// All queries automatically filtered by orgId
const items = await scopedPrisma.item.findMany();
```

See `apps/api/src/routes/inventory.example.ts` for complete examples.

## Step 6: Set Up Monitoring

### Schedule Reconciliation Job

Add to crontab or scheduler:

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/project && npm run reconcile:balances
```

### Schedule Backup Monitoring

```bash
# Daily at 3 AM (after backup window)
0 3 * * * cd /path/to/project && npm run monitor:backups
```

### Configure Alerts

Update alert configuration in:
- `apps/api/src/jobs/balance-reconciliation.ts`
- `apps/api/src/jobs/backup-monitor.ts`

## Step 7: Create Organizations

### Via SQL

```sql
INSERT INTO organizations (id, name, subdomain, is_active, created_at, updated_at)
VALUES (
  'org-123',
  'Acme Mining Camp',
  'acme',
  true,
  NOW(),
  NOW()
);
```

### Via Application (when API is ready)

```typescript
const org = await prisma.organization.create({
  data: {
    name: 'Acme Mining Camp',
    subdomain: 'acme',
    isActive: true,
  },
});
```

## Step 8: Assign Users to Organizations

```sql
-- Update existing users
UPDATE users SET org_id = 'org-123' WHERE email LIKE '%@acme.com';

-- Or via application
await prisma.user.update({
  where: { id: userId },
  data: { orgId: 'org-123' },
});
```

## Step 9: Test Tenant Isolation

1. **Create test organizations**
   ```sql
   INSERT INTO organizations (id, name, subdomain) VALUES
   ('test-org-1', 'Test Org 1', 'test1'),
   ('test-org-2', 'Test Org 2', 'test2');
   ```

2. **Create test data for each org**
   ```sql
   INSERT INTO items (id, org_id, item_number, name) VALUES
   ('item-1', 'test-org-1', 'ITEM-001', 'Test Item 1'),
   ('item-2', 'test-org-2', 'ITEM-001', 'Test Item 2');
   ```

3. **Test API with different org contexts**
   ```bash
   # Should only see test-org-1 items
   curl -H "X-Org-Id: test-org-1" http://localhost:3000/api/items
   
   # Should only see test-org-2 items
   curl -H "X-Org-Id: test-org-2" http://localhost:3000/api/items
   ```

4. **Verify no cross-org access**
   - Try accessing test-org-1 data with test-org-2 context
   - Should return 404 or empty results

## Step 10: Configure Railway Backups

1. **Navigate to Railway Dashboard**
   - Go to your PostgreSQL service
   - Click "Settings" → "Backups"

2. **Enable Automated Backups**
   - Toggle "Automated Backups" ON
   - Set retention: 14-30 days
   - Schedule: 2 AM UTC (low traffic)

3. **Verify Backup Created**
   ```bash
   npm run verify:backup
   ```

## Verification Checklist

- [ ] Migrations run successfully on staging
- [ ] All orgId columns populated
- [ ] Balance table created and populated
- [ ] Tenant middleware integrated
- [ ] Routes use scoped Prisma
- [ ] Organizations created
- [ ] Users assigned to organizations
- [ ] Tenant isolation tested
- [ ] Backups configured
- [ ] Monitoring jobs scheduled
- [ ] Alerts configured

## Troubleshooting

### Migration Issues

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed troubleshooting.

### Tenant Resolution Not Working

1. Check middleware is applied
2. Verify headers/subdomain/API key
3. Check organization exists in database
4. Review middleware logs

### Balance Table Not Updating

1. Verify trigger exists
2. Check trigger is enabled
3. Run backfill script
4. Check reconciliation job logs

## Next Steps

After setup is complete:

1. Monitor for errors in production
2. Review reconciliation reports daily
3. Test restore procedure quarterly
4. Update documentation as needed

## Related Documentation

- [Migration Guide](./MIGRATION_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [Backup & Recovery](./BACKUP_RECOVERY.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)

