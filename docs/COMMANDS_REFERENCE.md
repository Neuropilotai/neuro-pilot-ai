# Commands Reference

Complete reference of all npm scripts and commands for enterprise features.

## Migration Commands

### `npm run migrate:org`
Run organization migration to add multi-tenant support.

**What it does:**
- Creates `organizations` table
- Adds `orgId` columns to all tenant-scoped tables
- Backfills existing data with default organization
- Adds foreign key constraints

**Usage:**
```bash
npm run migrate:org
```

**See also:** [Migration Guide](./MIGRATION_GUIDE.md)

---

### `npm run migrate:balance`
Run balance table migration.

**What it does:**
- Creates `inventory_balances` table (via Prisma)
- Creates PostgreSQL trigger for automatic updates

**Usage:**
```bash
# First create table
npx prisma migrate dev --name add_balance_table

# Then add trigger
npm run migrate:balance
```

---

### `npm run migrate:all`
Run all migrations in sequence.

**Usage:**
```bash
npm run migrate:all
```

---

## Maintenance Commands

### `npm run backfill:balances`
Backfill inventory balances from existing ledger data.

**What it does:**
- Calculates current balances from `inventory_ledger`
- Populates `inventory_balances` table
- Verifies balances match ledger

**Usage:**
```bash
npm run backfill:balances
```

**When to use:**
- After creating balance table
- If balances get out of sync
- After restoring from backup

---

### `npm run reconcile:balances`
Reconcile balance table with ledger (daily maintenance).

**What it does:**
- Compares balances with ledger calculations
- Auto-corrects small discrepancies (< 0.01)
- Alerts on large discrepancies
- Detects orphaned balance records

**Usage:**
```bash
npm run reconcile:balances
```

**Schedule:** Daily at 2 AM (via cron)

---

### `npm run monitor:backups`
Check backup status and alert if issues.

**What it does:**
- Verifies backups exist
- Checks backup age (< 25 hours for daily)
- Alerts if backup missing or too old

**Usage:**
```bash
npm run monitor:backups
```

**Schedule:** Daily at 3 AM (via cron)

---

### `npm run verify:backup`
Manually verify backup status.

**Usage:**
```bash
npm run verify:backup
```

---

## Validation Commands

### `npm run validate:migration`
Validate that migrations were applied correctly.

**What it checks:**
- Organizations table exists
- orgId columns exist on all tables
- Foreign key constraints exist
- Data is backfilled (no NULL orgIds)
- Unique constraints updated
- Balance table and trigger (if applicable)

**Usage:**
```bash
npm run validate:migration
```

**When to use:**
- After running migrations
- Before deploying to production
- To troubleshoot issues

---

## Organization Management

### `npm run org:create`
Create a new organization.

**Usage:**
```bash
# Basic
npm run org:create -- --name "Acme Mining"

# With subdomain
npm run org:create -- --name "Acme Mining" --subdomain acme

# With custom API key
npm run org:create -- --name "Test Org" --subdomain test --api-key test-key-123
```

---

### `npm run org:list`
List all organizations.

**Usage:**
```bash
# List all
npm run org:list

# Active only
npm run org:list -- --active-only

# JSON format
npm run org:list -- --format json
```

---

### `npm run users:assign`
Assign users to an organization.

**Usage:**
```bash
# By user ID
npm run users:assign -- --org-id org-123 --user-id user-456

# By email pattern
npm run users:assign -- --org-id org-123 --email-pattern "@acme.com"

# All unassigned users
npm run users:assign -- --org-id org-123 --all

# Dry run (preview)
npm run users:assign -- --org-id org-123 --email-pattern "@acme.com" --dry-run
```

**Usage:**
```bash
# Basic
npm run org:create -- --name "Acme Mining"

# With subdomain
npm run org:create -- --name "Acme Mining" --subdomain acme

# With custom API key
npm run org:create -- --name "Test Org" --subdomain test --api-key test-key-123

# Inactive organization
npm run org:create -- --name "Inactive Org" --inactive
```

**Options:**
- `--name, -n <name>` - Organization name (required)
- `--subdomain, -s <domain>` - Subdomain for routing
- `--api-key, -k <key>` - API key (auto-generated if not provided)
- `--inactive` - Create as inactive

---

## Database Commands

### `npm run db:generate`
Generate Prisma client from schema.

**Usage:**
```bash
npm run db:generate
```

**When to use:**
- After schema changes
- After pulling latest code
- Before running migrations

---

### `npm run db:migrate`
Run Prisma migrations.

**Usage:**
```bash
npm run db:migrate
```

---

### `npm run db:studio`
Open Prisma Studio (database GUI).

**Usage:**
```bash
npm run db:studio
```

---

## Quick Command Reference

| Command | Purpose | Frequency |
|---------|---------|-----------|
| `npm run migrate:org` | Add multi-tenant support | Once (migration) |
| `npm run migrate:balance` | Add balance table | Once (migration) |
| `npm run backfill:balances` | Populate balance table | After migration |
| `npm run reconcile:balances` | Verify balance accuracy | Daily (cron) |
| `npm run monitor:backups` | Check backup status | Daily (cron) |
| `npm run validate:migration` | Verify migration | After migration |
| `npm run org:create` | Create organization | As needed |
| `npm run org:list` | List organizations | As needed |
| `npm run users:assign` | Assign users to org | After migration |
| `npm run verify:backup` | Check backups | Manual |

## Common Workflows

### Initial Setup
```bash
# 1. Generate Prisma client
npm run db:generate

# 2. Run organization migration
npm run migrate:org

# 3. Validate migration
npm run validate:migration

# 4. Run balance migration
npx prisma migrate dev --name add_balance_table
npm run migrate:balance

# 5. Backfill balances
npm run backfill:balances

# 6. Create organizations
npm run org:create -- --name "My Organization" --subdomain myorg
```

### Daily Maintenance
```bash
# Run reconciliation (scheduled via cron)
npm run reconcile:balances

# Check backups (scheduled via cron)
npm run monitor:backups
```

### Troubleshooting
```bash
# Validate migration status
npm run validate:migration

# Re-backfill if balances are off
npm run backfill:balances

# Reconcile to find discrepancies
npm run reconcile:balances
```

## Related Documentation

- [Quick Reference](./QUICK_REFERENCE.md) - Common operations
- [Setup Guide](./SETUP_GUIDE.md) - Complete setup
- [Migration Guide](./MIGRATION_GUIDE.md) - Migration procedures

