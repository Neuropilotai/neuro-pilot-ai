# Deployment Checklist

Use this checklist when deploying the enterprise hardening features to production.

## Pre-Deployment

### Planning
- [ ] Schedule maintenance window (1-2 hours recommended)
- [ ] Notify users of potential brief downtime
- [ ] Coordinate with team members
- [ ] Prepare rollback plan
- [ ] Review migration scripts

### Environment Setup
- [ ] Copy `.env.example` to `.env` (if not exists)
- [ ] Configure `DATABASE_URL`
- [ ] Set `DEFAULT_ORG_ID` (optional)
- [ ] Configure monitoring (PagerDuty, Slack, etc.)
- [ ] Set `RAILWAY_TOKEN` for backup monitoring

### Testing
- [ ] Test on staging database first
- [ ] Verify tenant isolation works
- [ ] Test balance table queries
- [ ] Verify backup/restore procedures
- [ ] Test reconciliation job
- [ ] Test backup monitoring

## Deployment Steps

### Step 1: Final Backup
- [ ] Create production database backup
- [ ] Verify backup is accessible
- [ ] Note backup ID/timestamp
- [ ] Store backup location

### Step 2: Run Organization Migration
- [ ] Run `npm run migrate:org` or manual SQL
- [ ] Monitor for errors
- [ ] Verify organizations table created
- [ ] Verify orgId columns added
- [ ] Verify data backfilled
- [ ] Verify foreign keys created

### Step 3: Run Balance Table Migration
- [ ] Run Prisma migration: `npx prisma migrate dev --name add_balance_table`
- [ ] Apply trigger: `psql $DATABASE_URL < prisma/migrations/add_balance_table/trigger.sql`
- [ ] Verify trigger created
- [ ] Run backfill: `npm run backfill:balances`
- [ ] Verify balances populated

### Step 4: Deploy Application Code
- [ ] Deploy updated code with middleware
- [ ] Verify tenant middleware integrated
- [ ] Verify routes use scoped Prisma
- [ ] Restart application services
- [ ] Verify application starts successfully

### Step 5: Verify Functionality
- [ ] Test health endpoints (`/healthz`, `/readyz`)
- [ ] Test authentication
- [ ] Test inventory queries
- [ ] Test tenant isolation (try cross-org access)
- [ ] Test balance queries
- [ ] Verify no errors in logs

### Step 6: Configure Monitoring
- [ ] Set up reconciliation cron job (daily at 2 AM)
- [ ] Set up backup monitoring cron job (daily at 3 AM)
- [ ] Configure alerting (PagerDuty, Slack, email)
- [ ] Test alert delivery

### Step 7: Configure Backups
- [ ] Enable Railway automated backups
- [ ] Set retention period (14+ days)
- [ ] Configure backup schedule
- [ ] Verify first backup created
- [ ] Run `npm run verify:backup`

## Post-Deployment

### Immediate (0-24 hours)
- [ ] Monitor application logs for errors
- [ ] Monitor database performance
- [ ] Check reconciliation job ran successfully
- [ ] Verify backup monitoring works
- [ ] Review any alerts
- [ ] Document any issues

### Short-term (1-7 days)
- [ ] Review reconciliation reports daily
- [ ] Monitor balance table performance
- [ ] Check for any tenant isolation issues
- [ ] Verify backup age stays < 25 hours
- [ ] Review user feedback
- [ ] Update documentation if needed

### Long-term (1-4 weeks)
- [ ] Test restore procedure on staging
- [ ] Review reconciliation trends
- [ ] Optimize if needed
- [ ] Schedule quarterly restore test
- [ ] Update runbooks based on learnings

## Rollback Plan

If issues occur:

### Immediate Rollback
- [ ] Stop application services
- [ ] Assess issue severity
- [ ] Decide: fix forward or rollback

### Database Rollback
- [ ] Restore from backup (if needed)
- [ ] See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for rollback SQL
- [ ] Verify data integrity
- [ ] Restart with previous code version

### Code Rollback
- [ ] Revert to previous deployment
- [ ] Restart services
- [ ] Verify application works
- [ ] Investigate root cause

## Success Criteria

- [ ] All migrations completed successfully
- [ ] Zero data loss
- [ ] Application functioning normally
- [ ] Tenant isolation verified
- [ ] Balance queries working
- [ ] Monitoring configured
- [ ] Backups automated
- [ ] No critical errors in logs

## Emergency Contacts

- **On-Call Engineer**: [Contact]
- **Database Admin**: [Contact]
- **Railway Support**: support@railway.app

## Related Documentation

- [Migration Guide](./MIGRATION_GUIDE.md)
- [Setup Guide](./SETUP_GUIDE.md)
- [Backup & Recovery](./BACKUP_RECOVERY.md)
- [Disaster Recovery](./DISASTER_RECOVERY.md)

---

**Last Updated**: $(date)
**Version**: 1.0

