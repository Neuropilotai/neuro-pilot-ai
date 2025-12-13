# Quick Start: Running Migrations

## Prerequisites

1. **Backup your database first!**
   ```bash
   railway backups create
   # or
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Test on staging first** (highly recommended)

## Running Migrations

### Option 1: Using Helper Script (Recommended)

```bash
# Run organization migration
npm run migrate:org

# Run balance table migration
npm run migrate:balance

# Run all migrations
npm run migrate:all
```

### Option 2: Manual SQL Execution

```bash
# Organization migration
psql $DATABASE_URL < prisma/migrations/add_organization_support/migration.sql

# Balance table trigger
psql $DATABASE_URL < prisma/migrations/add_balance_table/trigger.sql
```

### Option 3: Prisma Migrate (for balance table)

```bash
# Generate Prisma client first
npm run db:generate

# Create and apply migration
npx prisma migrate dev --name add_balance_table
```

## Post-Migration Steps

1. **Backfill balances** (after balance table migration):
   ```bash
   npm run backfill:balances
   ```

2. **Verify migration**:
   ```bash
   # Check organizations table
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM organizations;"
   
   # Check orgId columns
   psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE column_name = 'org_id' AND table_schema = 'public';"
   ```

3. **Run reconciliation** (optional, to verify):
   ```bash
   npm run reconcile:balances
   ```

## Maintenance Scripts

```bash
# Daily reconciliation (schedule with cron)
npm run reconcile:balances

# Backup monitoring (schedule with cron)
npm run monitor:backups

# Verify backups manually
npm run verify:backup
```

## Troubleshooting

See [MIGRATION_GUIDE.md](./docs/MIGRATION_GUIDE.md) for detailed troubleshooting.

## Full Documentation

- [Migration Guide](./docs/MIGRATION_GUIDE.md) - Complete migration procedures
- [Backup & Recovery](./docs/BACKUP_RECOVERY.md) - Backup procedures
- [Disaster Recovery](./docs/DISASTER_RECOVERY.md) - Disaster recovery plan
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - What was implemented

