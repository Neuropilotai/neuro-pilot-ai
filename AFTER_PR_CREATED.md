# After PR is Created - Next Steps

## ✅ PR Created - What's Next?

### Step 1: Verify Railway Preview Deployment

**Check PR Comments:**
- Railway bot should comment with preview URL
- Or check Railway Dashboard → Deployments
- Look for deployment with PR number

**If Preview URL Available:**
```bash
# Test health endpoint
curl https://<preview-url>/health

# Test new routes (after migration)
curl -H "X-Org-Id: <org-id>" https://<preview-url>/api/items-enterprise
```

**If Preview Not Available:**
- Check Railway Settings → GitHub → Preview Deployments
- Enable if not enabled
- Wait 5-10 minutes for deployment

### Step 2: Test on Preview

**Test Checklist:**
- [ ] Health endpoint works: `/health`
- [ ] Tenant resolution works (header/subdomain/API key)
- [ ] Enhanced routes respond: `/api/items-enterprise`, etc.
- [ ] Authentication middleware works
- [ ] Validation schemas work
- [ ] No errors in Railway logs

### Step 3: Code Review

**Request Reviewers:**
- Add team members as reviewers in PR
- Share PR link with team
- Wait for feedback

**Address Feedback:**
- Make requested changes
- Push updates to feature branch
- PR updates automatically

### Step 4: Merge to Main

**When Approved:**
1. Click "Merge Pull Request" in GitHub
2. Choose merge type (Squash and merge recommended)
3. Confirm merge
4. Railway auto-detects merge
5. Railway starts deployment (5-10 minutes)

**Monitor Deployment:**
- Check Railway Dashboard → Deployments
- Watch build logs
- Verify health checks pass
- Check service is live

### Step 5: Database Migration

**After Railway Deployment:**
```bash
# 1. Connect to production database
# 2. Run migration
psql $DATABASE_URL -f inventory-enterprise/backend/migrations/postgres/041_inventory_balance_table.sql

# 3. Backfill balances
cd inventory-enterprise/backend
npm run backfill:balances

# 4. Verify migration
npm run validate:migration

# 5. Generate Prisma client (if needed)
npm run prisma:generate
```

### Step 6: Verify Production

**Test Endpoints:**
```bash
# Health check
curl https://api.neuropilot.dev/health

# New routes
curl -H "X-Org-Id: <org-id>" https://api.neuropilot.dev/api/items-enterprise
curl -H "X-Org-Id: <org-id>" https://api.neuropilot.dev/api/locations-enterprise
curl -H "X-Org-Id: <org-id>" https://api.neuropilot.dev/api/counts-enterprise
```

**Monitor:**
- Check Railway logs for errors
- Monitor health endpoints
- Verify balance table updates
- Check database performance

## Quick Commands

**Check PR Status:**
```bash
./check-pr-status.sh
```

**Check Railway Deployment:**
- Railway Dashboard → Deployments
- Look for latest deployment
- Check build logs

**Test Preview:**
```bash
# Replace <preview-url> with actual URL
curl https://<preview-url>/health
```

## Timeline

**After PR Creation:**
- Railway Preview: 5-10 minutes
- Testing: 15-30 minutes
- Review: 30-60 minutes
- Merge: 1 minute
- Railway Deploy: 5-10 minutes
- Migration: 10-15 minutes
- **Total: ~1-2 hours**

## Troubleshooting

**Preview Not Appearing:**
- Check Railway Settings → Preview Deployments
- Verify PR is open (not draft)
- Wait a few more minutes
- Check Railway logs

**Deployment Fails:**
- Check build logs in Railway
- Verify all dependencies installed
- Check for syntax errors
- Review error messages

**Migration Fails:**
- Check database connection
- Verify PostgreSQL version (14+)
- Check for existing tables
- Review migration logs

---

**Current Status**: PR created → Waiting for Railway preview → Test → Review → Merge → Deploy

