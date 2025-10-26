# Vercel Git-Based Deployment Guide

**Repository:** https://github.com/Neuropilotai/neuro-pilot-ai.git
**Current Branch:** `fix/broken-links-guard-v15`
**Backend:** ✅ LIVE at https://resourceful-achievement-production.up.railway.app

---

## Option 1: Deploy via Vercel Git Integration (Recommended)

This method automatically deploys whenever you push to GitHub.

### Step 1: Commit Current Changes (If Needed)

```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Check what needs to be committed
git status

# Add all new deployment files
git add \
  inventory-enterprise/DEPLOYMENT_NEXT_STEPS.md \
  inventory-enterprise/VERCEL_GIT_DEPLOYMENT.md \
  inventory-enterprise/GO_LIVE_CHECKLIST.md \
  inventory-enterprise/validation_summary.md \
  inventory-enterprise/telemetry_results.json

# Commit the changes
git commit -m "docs: add deployment guides and validation framework

- Add step-by-step deployment next steps guide
- Add Vercel Git deployment guide
- Add GO LIVE checklist
- Add validation summary and telemetry framework
- Backend deployed to Railway: resourceful-achievement-production.up.railway.app
- Frontend ready for Vercel deployment

Includes:
- v17.4-v17.6 deployment documentation
- 60-day validation telemetry framework
- JSON Schema v17.7.1 for metrics collection
- Decision matrix (GO/ADJUST/REBUILD)
- 73+ autonomous AI agents ready to activate
"

# Push to GitHub
git push origin fix/broken-links-guard-v15
```

### Step 2: Connect Vercel to GitHub (Browser)

1. Visit: https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select **"Neuropilotai/neuro-pilot-ai"**
4. Configure the project:

**Framework Preset:** Other
**Root Directory:** `inventory-enterprise/frontend`
**Build Command:** Leave empty (static site)
**Output Directory:** `.` (current directory)
**Install Command:** Leave empty

### Step 3: Configure Environment Variables in Vercel

In the Vercel project settings, add:

**Name:** `API_URL`
**Value:** `https://resourceful-achievement-production.up.railway.app`
**Environment:** Production

### Step 4: Deploy

Click **"Deploy"** - Vercel will:
1. Clone your repository
2. Build the frontend from `inventory-enterprise/frontend`
3. Deploy to their edge network
4. Provide you with a production URL

### Step 5: Configure Branch Deployment

By default, Vercel deploys from:
- **main** branch → Production
- **Other branches** → Preview deployments

To deploy from `fix/broken-links-guard-v15`:

**Option A: Merge to main first (Recommended)**
```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge your feature branch
git merge fix/broken-links-guard-v15

# Push to trigger production deployment
git push origin main
```

**Option B: Deploy from feature branch**
In Vercel dashboard:
1. Go to **Settings** → **Git**
2. Change **Production Branch** to `fix/broken-links-guard-v15`

---

## Option 2: Deploy via Vercel CLI (Manual)

If you prefer CLI deployment without Git integration:

### Step 1: Authenticate

```bash
vercel login
```

### Step 2: Deploy

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Deploy to production
vercel --prod

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your username/org
# - Link to existing project? No
# - Project name? neuropilot-inventory
# - Directory? . (current directory)
# - Override settings? No
```

### Step 3: Set Environment Variable

```bash
vercel env add API_URL production
# Paste: https://resourceful-achievement-production.up.railway.app

# Redeploy with environment variable
vercel --prod --force
```

---

## After Deployment (Both Options)

### 1. Update Backend CORS

Once you have your Vercel URL (e.g., `https://neuropilot-inventory.vercel.app`):

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Set allowed origin
railway variables set FRONTEND_ORIGIN="https://YOUR-VERCEL-URL"

# Redeploy backend
railway up
```

### 2. Generate Owner Token

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

node generate_owner_token.js
```

Save the token for login!

### 3. Test the System

```bash
# Test frontend loads
open https://YOUR-VERCEL-URL

# Test backend health
curl https://resourceful-achievement-production.up.railway.app/api/health

# Test authentication
curl -H "Authorization: Bearer YOUR-TOKEN" \
     https://resourceful-achievement-production.up.railway.app/api/owner/dashboard
```

---

## Recommendation: Git-Based Deployment

**Why Git-based is better:**
- ✅ Automatic deployments on git push
- ✅ Preview deployments for every branch
- ✅ Easy rollbacks to previous commits
- ✅ CI/CD integration
- ✅ Deployment history tracking
- ✅ Environment variables managed in Vercel dashboard

**Why CLI deployment might be preferred:**
- Manual control over when deployments happen
- No need to commit/push for every change
- Faster iteration during development

---

## Current Status

**Repository Info:**
- GitHub: https://github.com/Neuropilotai/neuro-pilot-ai.git
- Branch: `fix/broken-links-guard-v15`
- Main branch: `main`

**Modified/Untracked Files:**
```
Modified:
- backend/server.js (PORT config for Railway)
- backend/Dockerfile (production deployment)
- frontend/vercel.json (Vercel config)
- Various documentation files

Untracked (new):
- Deployment guides
- Validation framework files
- GitHub Actions workflows
- Migration scripts
- 70+ new documentation and script files
```

**Backend:**
- Status: ✅ DEPLOYED
- URL: https://resourceful-achievement-production.up.railway.app
- Platform: Railway
- Agents: 73+ ready to activate

**Frontend:**
- Status: ⏳ READY FOR DEPLOYMENT
- Vercel config: ✅ Ready (vercel.json configured)
- Target: Vercel Edge Network

---

## Next Steps

**Choose your deployment method:**

**Git-Based (Recommended):**
1. Commit deployment files
2. Push to GitHub
3. Visit https://vercel.com/new
4. Import `Neuropilotai/neuro-pilot-ai`
5. Set root directory to `inventory-enterprise/frontend`
6. Add `API_URL` environment variable
7. Deploy

**CLI-Based:**
1. Run `vercel login`
2. Run `vercel --prod` from frontend directory
3. Configure environment variables
4. Test deployment

---

**Ready to deploy?** Choose your method and proceed!
