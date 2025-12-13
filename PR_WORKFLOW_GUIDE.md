# PR Workflow Guide - Option 2

## Step-by-Step Process

### Step 1: Create Pull Request ✅

**PR URL:**
```
https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...feature/enterprise-hardening-20251213
```

**PR Details:**
- **Title**: `Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System`
- **Description**: Copy entire contents of `PR_ENTERPRISE_HARDENING.md`
- **Base branch**: `main`
- **Compare branch**: `feature/enterprise-hardening-20251213`
- **Labels**: `enhancement`, `enterprise`, `database`, `security`

**Action:**
1. Open the PR URL above
2. Click "Create Pull Request"
3. Fill in title and description
4. Add labels
5. Request reviewers (optional)
6. Click "Create Pull Request"

### Step 2: Railway Preview Deployment

**After PR Creation:**
- Railway will automatically create a preview deployment (if enabled)
- Preview URL will appear in PR comments or Railway dashboard
- Test endpoints on preview URL

**If Preview Not Enabled:**
- Go to Railway Dashboard → Settings → GitHub
- Enable "Preview Deployments"
- Or test manually on staging

### Step 3: Code Review

**Review Checklist:**
- [ ] Review all code changes
- [ ] Verify migration is safe and additive
- [ ] Check that existing routes still work
- [ ] Verify tenant isolation prevents cross-org access
- [ ] Review documentation

**Testing on Preview:**
- [ ] Test tenant resolution (header/subdomain/API key)
- [ ] Test enhanced routes (`/api/items-enterprise`, etc.)
- [ ] Verify balance table updates automatically
- [ ] Test authentication middleware
- [ ] Run migration validation: `npm run validate:migration`

### Step 4: Merge to Main

**After Approval:**
1. Click "Merge Pull Request" in GitHub
2. Choose merge type (Squash and merge recommended)
3. Confirm merge
4. Railway will automatically detect the merge
5. Railway will deploy from `main` branch

**Expected Timeline:**
- PR Creation: 5 minutes
- Review: 30-60 minutes (depends on reviewers)
- Merge: 1 minute
- Railway Deployment: 5-10 minutes
- **Total: ~1-2 hours**

### Step 5: Post-Merge Deployment

**Railway Auto-Deployment:**
- Railway detects merge to `main`
- Automatically starts build
- Deploys new code
- Health check passes
- Service is live

**Verify Deployment:**
```bash
# Check health
curl https://api.neuropilot.dev/health

# Check new routes (after migration)
curl -H "X-Org-Id: <org-id>" https://api.neuropilot.dev/api/items-enterprise
```

### Step 6: Database Migration (After Deployment)

**On Staging/Production:**
```bash
# 1. Run migration
psql $DATABASE_URL -f inventory-enterprise/backend/migrations/postgres/041_inventory_balance_table.sql

# 2. Backfill balances
cd inventory-enterprise/backend
npm run backfill:balances

# 3. Verify migration
npm run validate:migration

# 4. Generate Prisma client (if needed)
npm run prisma:generate
```

## Current Status

✅ **Ready for PR Creation**
- Branch: `feature/enterprise-hardening-20251213`
- Commits: 3 commits ahead of main
- Files: 26 files changed
- Documentation: Complete
- Testing: Syntax validated

## PR Description Template

The PR description is ready in `PR_ENTERPRISE_HARDENING.md`. It includes:
- Summary of changes
- Testing checklist
- Migration steps
- Breaking changes (none)
- Files changed

## After PR Merge

**Railway Will:**
1. Detect merge to `main`
2. Start build process
3. Deploy new code
4. Run health checks
5. Service goes live

**You Need To:**
1. Run database migration
2. Backfill balances
3. Verify functionality
4. Monitor for issues

## Troubleshooting

**If Railway Doesn't Deploy:**
- Check Railway dashboard for build errors
- Verify `main` branch has the merge commit
- Check Railway service settings
- Review build logs

**If Migration Fails:**
- Check database connection
- Verify migration file exists
- Check PostgreSQL version (14+)
- Review migration logs

---

**Next Action**: Create the PR using the URL above!

