# Backup & Recovery Documentation

## Overview

This document describes the backup and recovery procedures for the Enterprise Inventory System database hosted on Railway PostgreSQL.

## Backup Configuration

### Automated Backups

Railway PostgreSQL provides automated daily backups with the following configuration:

- **Frequency**: Daily
- **Retention**: 7-30 days (configurable)
- **Schedule**: Low-traffic hours (2:00 AM UTC recommended)
- **Encryption**: Enabled by default
- **Storage**: Railway-managed S3-compatible storage

### Backup Configuration Steps

1. **Access Railway Dashboard**
   - Navigate to your PostgreSQL service
   - Go to "Settings" → "Backups"

2. **Enable Automated Backups**
   - Toggle "Automated Backups" to ON
   - Set retention period (recommended: 14 days minimum)
   - Configure backup schedule

3. **Verify Backup Settings**
   - Confirm encryption is enabled
   - Verify backup storage location
   - Test backup creation manually

### Manual Backup

To create a manual backup:

```bash
# Via Railway CLI
railway backups create

# Or via Railway Dashboard
# Navigate to PostgreSQL service → Backups → Create Backup
```

## Backup Verification

### Check Backup Status

```bash
# List all backups
railway backups list

# Check latest backup
railway backups list --limit 1
```

### Verify Backup Integrity

Run the backup verification script:

```bash
npm run verify-backup
# or
tsx scripts/verify-backup.ts
```

## Recovery Procedures

### Full Database Restore

**Scenario**: Complete database failure or data corruption

**Steps**:

1. **Identify Latest Good Backup**
   ```bash
   railway backups list
   # Note the backup ID and timestamp
   ```

2. **Create New Database Instance** (if needed)
   - If original database is unrecoverable, create new PostgreSQL service
   - Note the new `DATABASE_URL`

3. **Restore from Backup**
   ```bash
   # Via Railway CLI
   railway backups restore <backup-id> --service <postgres-service-id>
   
   # Or via Railway Dashboard
   # Navigate to Backups → Select backup → Restore
   ```

4. **Verify Data Integrity**
   ```bash
   # Connect to restored database
   psql $DATABASE_URL
   
   # Check record counts
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM items;
   SELECT COUNT(*) FROM inventory_ledger;
   
   # Verify recent data exists
   SELECT MAX(created_at) FROM inventory_ledger;
   ```

5. **Update Application Connection**
   - Update `DATABASE_URL` environment variable
   - Restart application services
   - Verify application connects successfully

6. **Test Application Functionality**
   - Test critical endpoints
   - Verify tenant isolation
   - Check inventory balances

7. **Switch Traffic** (if using new database)
   - Update production `DATABASE_URL`
   - Monitor application logs
   - Verify no errors

### Point-in-Time Recovery (PITR)

**Scenario**: Need to restore to specific timestamp (e.g., before accidental data deletion)

**Note**: PITR requires WAL archiving to be enabled. Check Railway documentation for PITR availability.

**Steps**:

1. **Identify Target Timestamp**
   - Determine exact time before issue occurred
   - Format: `YYYY-MM-DD HH:MM:SS UTC`

2. **Initiate PITR**
   ```bash
   # Via Railway (if supported)
   railway backups restore --timestamp "2024-01-15 14:30:00"
   ```

3. **Follow steps 4-7 from Full Database Restore**

### Partial Table Restore

**Scenario**: Restore specific table(s) without affecting entire database

**Steps**:

1. **Export table from backup**
   ```bash
   # Create temporary database from backup
   railway backups restore <backup-id> --service <temp-service>
   
   # Export specific table
   pg_dump $TEMP_DATABASE_URL -t users > users_backup.sql
   ```

2. **Restore to production** (with caution)
   ```bash
   # Backup current table first
   pg_dump $DATABASE_URL -t users > users_current.sql
   
   # Restore from backup
   psql $DATABASE_URL < users_backup.sql
   ```

## Recovery Time Objectives (RTO)

- **Target RTO**: < 1 hour
- **Maximum RTO**: < 4 hours

## Recovery Point Objectives (RPO)

- **Target RPO**: < 24 hours (daily backups)
- **Maximum RPO**: < 24 hours

## Testing Recovery

### Quarterly Recovery Test

Perform full recovery test every quarter:

1. **Schedule test during maintenance window**
2. **Create test database from latest backup**
3. **Verify data integrity**
4. **Test application against restored database**
5. **Document any issues**
6. **Update procedures if needed**

### Test Checklist

- [ ] Backup exists and is accessible
- [ ] Restore completes successfully
- [ ] All tables restored with correct row counts
- [ ] Application connects to restored database
- [ ] Critical endpoints function correctly
- [ ] Tenant isolation verified
- [ ] Inventory balances accurate
- [ ] No data corruption detected

## Monitoring

### Backup Monitoring

The system includes automated backup monitoring (see `apps/api/src/jobs/backup-monitor.ts`):

- Checks for recent backups daily
- Alerts if backup is missing or too old
- Verifies backup integrity

### Alert Thresholds

- **Critical**: No backup in last 25 hours
- **Warning**: No backup in last 23 hours
- **Info**: Backup verification failed

## Emergency Contacts

- **Database Issues**: [Database Admin Contact]
- **Railway Support**: support@railway.app
- **On-Call Engineer**: [On-Call Contact]

## Related Documentation

- [Disaster Recovery Plan](./DISASTER_RECOVERY.md)
- [Backup Monitoring Job](../apps/api/src/jobs/backup-monitor.ts)

