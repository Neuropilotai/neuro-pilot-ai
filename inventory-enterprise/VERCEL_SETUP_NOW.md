# Vercel Setup - Next Steps

✅ **Completed:**
- Backend deployed to Railway: https://resourceful-achievement-production.up.railway.app
- All deployment files committed (428 files, 153,983 lines)
- Changes pushed to GitHub: https://github.com/Neuropilotai/neuro-pilot-ai

**Branch:** fix/broken-links-guard-v15
**Commit:** 30be5a0fd7

---

## STEP 1: Connect Vercel to GitHub (5 minutes)

### Option A: Via Browser (Recommended - Easiest)

1. **Open Vercel New Project Page:**
   ```
   https://vercel.com/new
   ```

2. **Authorize GitHub** (if not already authorized)
   - Click "Continue with GitHub"
   - Authorize Vercel to access your repositories

3. **Import Repository:**
   - Find "Neuropilotai/neuro-pilot-ai" in the list
   - Click **"Import"**

4. **Configure Project:**
   ```
   Project Name:          neuropilot-inventory
   Framework Preset:      Other
   Root Directory:        inventory-enterprise/frontend
   Build Command:         (leave empty)
   Output Directory:      .
   Install Command:       (leave empty)
   ```

5. **Add Environment Variable:**
   ```
   Name:  API_URL
   Value: https://resourceful-achievement-production.up.railway.app
   Environment: Production
   ```

6. **Click "Deploy"**

7. **Wait for deployment** (1-2 minutes)

8. **Save your Vercel URL!**
   Example: `https://neuropilot-inventory.vercel.app` or `https://neuropilot-inventory-abc123.vercel.app`

---

### Option B: Via Vercel CLI (Alternative)

If you prefer CLI, you can still use `vercel login` + `vercel --prod`, but Git integration is recommended for automatic deployments.

**CLI Quick Deploy:**
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Login first
vercel login

# Deploy
vercel --prod

# Add environment variable
vercel env add API_URL production
# Paste: https://resourceful-achievement-production.up.railway.app

# Redeploy with environment variable
vercel --prod --force
```

---

## STEP 2: Update Backend CORS (2 minutes)

Once you have your Vercel URL (from Step 1), run:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Replace YOUR-VERCEL-URL with actual URL from Step 1
railway variables set FRONTEND_ORIGIN="https://YOUR-VERCEL-URL"

# Example:
# railway variables set FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app"

# Redeploy backend to apply CORS changes
railway up
```

---

## STEP 3: Generate Owner Token (2 minutes)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

node generate_owner_token.js
```

**Save the token!** You'll use it to login to the owner dashboard.

Expected output:
```
✅ Owner token generated successfully!

Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Email: neuropilotai@gmail.com
Role: owner
Expires: 2025-11-02 (7 days from now)

Use this token to login to the owner console.
```

---

## STEP 4: Test Your Deployment (5 minutes)

### Test 1: Frontend Loads
Open your Vercel URL in a browser:
```
https://YOUR-VERCEL-URL
```

**Expected:** Login screen visible with NeuroPilot branding

### Test 2: Backend Health Check
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health
```

**Expected:**
```json
{"status":"healthy","uptime":99.99,"timestamp":"..."}
```

### Test 3: Login Flow
1. Open frontend in browser
2. Enter email: `neuropilotai@gmail.com`
3. Paste the owner token from Step 3 as password
4. Click **Sign In**

**Expected:** Redirect to owner dashboard showing all systems operational

### Test 4: Agent Status Check
```bash
# Replace YOUR-TOKEN with token from Step 3
curl -H "Authorization: Bearer YOUR-TOKEN" \
     https://resourceful-achievement-production.up.railway.app/api/agents/status/all
```

**Expected:** JSON response with status of all 73+ agents

---

## Deployment Architecture Overview

```
┌─────────────────────────────────────────┐
│         Production Deployment           │
└─────────────────────────────────────────┘

┌─────────────────┐         ┌──────────────────┐
│   GitHub Repo   │───────▶│  Vercel Frontend │
│ Neuropilotai/   │  Auto   │   Edge Network   │
│ neuro-pilot-ai  │  Deploy │                  │
└─────────────────┘         └──────────────────┘
                                      │
                                      │ API Calls
                                      ▼
                            ┌──────────────────┐
                            │ Railway Backend  │
                            │   Node.js API    │
                            │  73+ AI Agents   │
                            └──────────────────┘
                                      │
                                      │ SQLite
                                      ▼
                            ┌──────────────────┐
                            │    Database      │
                            │  (Railway Vol)   │
                            └──────────────────┘
```

**URLs:**
- Frontend: `https://YOUR-VERCEL-URL` (from Vercel deployment)
- Backend: `https://resourceful-achievement-production.up.railway.app`
- GitHub: `https://github.com/Neuropilotai/neuro-pilot-ai`

---

## Automatic Deployment Workflow

Once Vercel is connected to GitHub:

**Any push to `fix/broken-links-guard-v15` will:**
1. Trigger automatic Vercel deployment
2. Build from `inventory-enterprise/frontend` directory
3. Apply environment variables (API_URL)
4. Deploy to production edge network
5. Complete in ~1-2 minutes

**Example:**
```bash
# Make changes to frontend
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend
# Edit files...

# Commit and push
git add .
git commit -m "feat: improve dashboard UI"
git push origin fix/broken-links-guard-v15

# Vercel automatically deploys!
```

---

## Monitoring & Verification

### Check Vercel Deployment Status
1. Go to https://vercel.com/dashboard
2. Select "neuropilot-inventory" project
3. View deployment logs

### Check Railway Backend Logs
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

railway logs --follow
```

### Health Monitoring
```bash
# Create a monitoring loop
watch -n 30 'curl -s https://resourceful-achievement-production.up.railway.app/api/health | jq .'
```

---

## Troubleshooting

### Vercel deployment fails
**Issue:** "No package.json found"
**Fix:** Ensure Root Directory is set to `inventory-enterprise/frontend`

### Frontend shows blank page
**Issue:** API connection failing
**Fix:**
1. Check API_URL environment variable in Vercel
2. Check browser console (F12) for errors
3. Verify CORS is configured on backend

### CORS errors in browser
**Issue:** Backend rejecting frontend requests
**Fix:**
```bash
railway variables set FRONTEND_ORIGIN="https://YOUR-VERCEL-URL"
railway up
```

### 401 Unauthorized on login
**Issue:** Token expired or invalid
**Fix:** Generate new token: `node generate_owner_token.js`

---

## Security Checklist

Before going fully live, verify:

- [ ] **HTTPS enforced** on both frontend and backend ✅ (automatic)
- [ ] **CORS configured** with specific frontend URL (do in Step 2)
- [ ] **JWT_SECRET** is strong (check Railway variables)
- [ ] **Environment variables** not exposed in frontend
- [ ] **Security headers** configured ✅ (in vercel.json)
- [ ] **No sensitive data** in git ✅ (.env in .gitignore)
- [ ] **Owner token** saved securely (generated in Step 3)

---

## Next Steps After Deployment

1. ✅ Verify frontend loads and login works
2. ✅ Test all 73+ agents are responsive
3. ⏳ Configure GitHub Actions for validation workflows
4. ⏳ Enable daily validation automation (2 AM UTC)
5. ⏳ Begin 60-day telemetry collection
6. ⏳ Set up monitoring alerts

---

## Quick Reference

**Backend URL:**
```
https://resourceful-achievement-production.up.railway.app
```

**GitHub Repository:**
```
https://github.com/Neuropilotai/neuro-pilot-ai
```

**Current Branch:**
```
fix/broken-links-guard-v15
```

**Latest Commit:**
```
30be5a0fd7 - feat(v17.6): complete production deployment - ready for Vercel
```

**Railway Project ID:**
```
081be493-34d8-4232-9e3f-ecf1b85cc4ad
```

---

## Ready to Deploy?

**👉 Start here:** https://vercel.com/new

**Import:** Neuropilotai/neuro-pilot-ai

**Configure:**
- Root: `inventory-enterprise/frontend`
- Env: `API_URL = https://resourceful-achievement-production.up.railway.app`

**Deploy and verify!** 🚀

---

**Estimated Time Remaining:** 10-15 minutes

**Current Status:**
- ✅ Backend: LIVE
- ✅ Code: Committed and pushed
- ⏳ Frontend: Ready for Vercel deployment (next step)
