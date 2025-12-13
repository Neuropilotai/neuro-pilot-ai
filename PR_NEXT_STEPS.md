# PR Next Steps - After PR Creation

## ✅ If PR is Created

### Step 1: Verify PR Exists
- Go to: https://github.com/Neuropilotai/neuro-pilot-ai/pulls
- Look for PR: "Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System"
- Status should show: "Open" or "Draft"

### Step 2: Check Railway Preview Deployment

**If Preview Deployments Enabled:**
- Preview URL will appear in PR comments (from Railway bot)
- Or check Railway Dashboard → Deployments
- Look for deployment with PR number or branch name

**If Preview Not Enabled:**
- Go to Railway Dashboard → Settings → GitHub
- Enable "Preview Deployments"
- Railway will create preview on next PR

**Test Preview:**
```bash
# Replace <preview-url> with actual preview URL
curl https://<preview-url>/health
curl -H "X-Org-Id: <org-id>" https://<preview-url>/api/items-enterprise
```

### Step 3: Code Review Process

**Review Checklist:**
- [ ] Review all code changes in PR
- [ ] Verify migration is safe and additive
- [ ] Check that existing routes still work
- [ ] Verify tenant isolation prevents cross-org access
- [ ] Review documentation

**Testing on Preview:**
- [ ] Test tenant resolution (header/subdomain/API key)
- [ ] Test enhanced routes (`/api/items-enterprise`, etc.)
- [ ] Verify balance table updates automatically
- [ ] Test authentication middleware
- [ ] Run migration validation (if preview DB available)

**Request Reviewers:**
- Add team members as reviewers
- Wait for approval
- Address any feedback

### Step 4: Merge to Main

**After Approval:**
1. Click "Merge Pull Request" in GitHub
2. Choose merge type:
   - **Squash and merge** (recommended) - Combines all commits into one
   - **Merge commit** - Preserves commit history
   - **Rebase and merge** - Linear history
3. Confirm merge
4. Delete feature branch (optional, recommended)

**Railway Auto-Deployment:**
- Railway detects merge to `main` automatically
- Starts build process (5-10 minutes)
- Deploys new code
- Health check passes
- Service goes live

### Step 5: Post-Merge Actions

**Verify Deployment:**
```bash
# Check health
curl https://api.neuropilot.dev/health

# Check deployment status in Railway dashboard
# Verify new routes are available
```

**Database Migration (Required):**
```bash
# Connect to production database
# Run migration
psql $DATABASE_URL -f inventory-enterprise/backend/migrations/postgres/041_inventory_balance_table.sql

# Backfill balances
cd inventory-enterprise/backend
npm run backfill:balances

# Verify migration
npm run validate:migration

# Generate Prisma client (if needed)
npm run prisma:generate
```

**Monitor:**
- Check Railway logs for errors
- Monitor health endpoints
- Verify new routes work
- Check database performance

## ⏳ If PR Not Created Yet

**Create PR Now:**
1. Open: https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...feature/enterprise-hardening-20251213
2. Fill in title and description
3. Add labels
4. Click "Create Pull Request"

## 📊 Current Status

**Feature Branch:**
- Branch: `feature/enterprise-hardening-20251213`
- Commits: 3 commits ahead of main
- Files: 26 files changed
- Status: Ready for PR

**Railway:**
- Current branch: `main`
- Last deployment: Dec 13, 6:03 AM
- Will auto-deploy after PR merge

## 🎯 Timeline

**Estimated:**
- PR Creation: 5 minutes ✅
- Railway Preview: 5-10 minutes (if enabled)
- Code Review: 30-60 minutes
- Merge: 1 minute
- Railway Deployment: 5-10 minutes
- Database Migration: 10-15 minutes
- **Total: ~1-2 hours**

## 🔍 Troubleshooting

**If Railway Preview Doesn't Appear:**
- Check Railway Settings → GitHub → Preview Deployments
- Verify PR is open (not draft)
- Check Railway logs for errors
- Wait a few minutes (deployment takes time)

**If Railway Doesn't Deploy After Merge:**
- Check Railway dashboard for build errors
- Verify `main` branch has the merge commit
- Check Railway service settings
- Review build logs

**If Migration Fails:**
- Check database connection
- Verify migration file exists
- Check PostgreSQL version (14+)
- Review migration logs
- Check for existing tables

## 📁 Reference Files

- `PR_WORKFLOW_GUIDE.md` - Complete workflow
- `PR_ENTERPRISE_HARDENING.md` - PR description
- `RAILWAY_UPDATE_SOLUTION.md` - Deployment guide
- `inventory-enterprise/backend/docs/MIGRATION_GUIDE.md` - Migration steps

---

**Next Action**: Verify PR is created, then wait for Railway preview deployment!

