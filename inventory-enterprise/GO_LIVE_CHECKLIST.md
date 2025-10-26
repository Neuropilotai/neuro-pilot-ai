# 🚀 NeuroPilot - GO LIVE CHECKLIST

**Time Required**: ~90 minutes
**Versions Deploying**: v17.4, v17.5, v17.6

---

## Before You Start

You'll need:
- ✅ Railway CLI installed
- ✅ Vercel CLI installed
- ✅ GitHub CLI installed
- ✅ backend/.env configured
- ⏳ Railway account (login required)
- ⏳ Vercel account (login required)
- ⏳ GitHub account (login required)

---

## STEP 1: Authenticate with Services (5 minutes)

Open terminal and run these commands:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Login to Railway
railway login

# Login to Vercel
vercel login

# Login to GitHub
gh auth login
```

**Checkpoint**: All three commands should succeed.

---

## STEP 2: Deploy Backend to Railway (30 minutes)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Initialize Railway project (if not already done)
railway init

# Link to Railway project
railway link

# Set environment variables from .env file
railway variables set DATABASE_URL="$(grep DATABASE_URL .env | cut -d '=' -f2-)"

# Deploy backend
railway up

# Get your backend URL
railway domain
```

**Save your Railway URL** - you'll need it for the frontend!

Example: `https://neuropilot-production.up.railway.app`

**Test it**:
```bash
# Replace with your actual URL
curl https://YOUR-RAILWAY-URL/health
```

Expected response:
```json
{"status":"healthy","uptime":99.99,"timestamp":"..."}
```

---

## STEP 3: Deploy Frontend to Vercel (20 minutes)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Deploy to Vercel (will prompt for project setup)
vercel --prod
```

**Follow the prompts**:
- Set up and deploy? **Yes**
- Which scope? **Your username/org**
- Link to existing project? **No**
- Project name? **neuropilot** (or your choice)
- Which directory? **./frontend** (current directory)
- Override settings? **No**

**Set environment variable**:
```bash
# Replace with your Railway URL from Step 2
vercel env add API_URL production
# Paste: https://YOUR-RAILWAY-URL
```

**Redeploy with environment variable**:
```bash
vercel --prod --force
```

**Save your Vercel URL** - this is your app!

Example: `https://neuropilot.vercel.app`

**Test it**:
Open your Vercel URL in a browser - you should see the login screen.

---

## STEP 4: Configure CORS (5 minutes)

The backend needs to allow requests from your frontend:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Replace with your Vercel URL
railway variables set ALLOWED_ORIGINS="https://YOUR-VERCEL-URL"

# Redeploy to apply changes
railway up
```

---

## STEP 5: Create Owner/Admin User (10 minutes)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Generate owner token
node generate_owner_token.js
```

**Save the token** - you'll use this to login!

The token will look like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZDg0NmJkZjIzMTlhYzRkYjA4NDE1MmJhNGIwNTI4YyIsImlkIjoiNWQ4NDZiZGYyMzE5YWM0ZGIwODQxNTJiYTRiMDUyOGMiLCJlbWFpbCI6Im5ldXJvcGlsb3RhaUBnbWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NjExMjI4NzMsImV4cCI6MTc2MTEyNDY3M30.bx1MfRzwG4aqin0WUnfd7_l7jt8HepTGhioQ0pyPfEQ
```

---

## STEP 6: Setup GitHub Actions (15 minutes)

```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Set GitHub secrets
gh secret set BACKEND_URL --body "https://YOUR-RAILWAY-URL"
gh secret set FRONTEND_URL --body "https://YOUR-VERCEL-URL"
gh secret set DATABASE_URL --body "YOUR-DATABASE-URL"

# Optional (for monitoring)
gh secret set SLACK_WEBHOOK_URL --body "YOUR-SLACK-WEBHOOK"
gh secret set GRAFANA_API_KEY --body "YOUR-GRAFANA-KEY"
gh secret set PROMETHEUS_URL --body "YOUR-PROMETHEUS-URL"

# Enable workflows
gh workflow enable .github/workflows/sentient-cycle.yml
gh workflow enable .github/workflows/engineering-cycle.yml
gh workflow enable .github/workflows/genesis-cycle.yml
gh workflow enable .github/workflows/validation-automation.yml
```

---

## STEP 7: Test Your System (5 minutes)

### Test 1: Backend Health
```bash
curl https://YOUR-RAILWAY-URL/health
```

Expected: `{"status":"healthy"...}`

### Test 2: Frontend Access
Open `https://YOUR-VERCEL-URL` in browser

Expected: Login screen visible

### Test 3: Authentication
```bash
# Use your owner token from Step 5
curl -H "Authorization: Bearer YOUR-OWNER-TOKEN" \
     https://YOUR-RAILWAY-URL/api/owner/dashboard
```

Expected: Dashboard data (not "unauthorized")

---

## STEP 8: Invite Users (Optional)

Once logged in as owner, you can invite team members:

```bash
curl -X POST https://YOUR-RAILWAY-URL/api/invites \
  -H "Authorization: Bearer YOUR-OWNER-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "role": "manager"
  }'
```

Or use the frontend UI: **Settings → Users → Invite**

---

## ✅ SUCCESS CHECKLIST

After deployment, verify:

- [ ] Backend health endpoint returns `200 OK`
- [ ] Frontend loads in browser
- [ ] Owner token authentication works
- [ ] GitHub workflows are enabled
- [ ] Daily validation workflow scheduled (will run tomorrow at 2 AM UTC)

---

## 🎉 YOU'RE LIVE!

Your NeuroPilot system is now running in production:

**URLs**:
- Frontend: `https://YOUR-VERCEL-URL`
- Backend: `https://YOUR-RAILWAY-URL`

**Login**:
- Use your owner token in the login screen

**Workflows** (running automatically):
- **Sentient Cycle**: Every 4 hours (forecasting + remediation)
- **Engineering Cycle**: Every 24 hours (code improvements)
- **Genesis Cycle**: Every 6 hours (agent creation)
- **Validation**: Daily at 2 AM UTC (collect telemetry)

**Monitoring**:
```bash
# View workflow runs
gh run list

# View validation reports (after first run)
ls -la validation_reports/

# Generate summary (after 30 days)
python3 scripts/generate_validation_summary.py --days 30
```

---

## Next Steps

### Week 1-4: Monitor & Validate
- Check workflows daily: `gh run list`
- Monitor backend logs: `railway logs`
- Ensure no errors

### Week 5-8: Collect Data
- Validation workflow runs daily
- Reports saved to `validation_reports/`
- System learns and adapts

### Week 9-12: Analyze & Decide
- Generate 30-day summary
- Review telemetry data
- Decide on v17.7 scope

### Week 13+: v17.7 Implementation (If Justified)
- Refine blueprint based on data
- Implement multi-region (if needed)
- Deploy distributed systems (if needed)

---

## Troubleshooting

### Backend won't deploy
```bash
# Check Railway logs
railway logs

# Verify environment variables
railway variables

# Try redeploying
railway up --force
```

### Frontend shows 500 errors
- Check that `API_URL` environment variable is set in Vercel
- Verify CORS is configured on backend
- Check browser console for errors

### Authentication fails
- Verify token hasn't expired (7 days)
- Generate new token: `node generate_owner_token.js`
- Check JWT_SECRET matches between local and Railway

### Workflows not running
- Verify secrets are set: `gh secret list`
- Check workflow status: `gh workflow list`
- View logs: `gh run list --workflow=sentient-cycle.yml`

---

## Support

- **Deployment Guide**: `DEPLOYMENT_GUIDE_V17_4_TO_V17_6.md`
- **Validation Template**: `SENTIENT_VALIDATION_REPORT_TEMPLATE.md`
- **v17.7 Blueprint**: `NEUROPILOT_V17_7_BLUEPRINT.md`
- **Issues**: Create a GitHub issue if you encounter problems

---

**Ready to deploy?** Start with Step 1!

🚀 **Let's go live!**
