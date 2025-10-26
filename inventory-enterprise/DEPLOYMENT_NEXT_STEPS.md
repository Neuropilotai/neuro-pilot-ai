# NeuroPilot Deployment - Next Steps

**Current Status:**
- ✅ Backend: LIVE at https://resourceful-achievement-production.up.railway.app
- ⏳ Frontend: Ready to deploy (authentication needed)

---

## STEP 1: Authenticate with Vercel (Required Now)

Open your terminal and run:

```bash
vercel login
```

This will:
1. Provide a URL like: `https://vercel.com/oauth/device?user_code=XXXX-XXXX`
2. Open your browser automatically (or you can visit the URL manually)
3. Confirm the authentication in your browser
4. Return to terminal when complete

**Expected output:**
```
✔ Success! Email address verified.
```

---

## STEP 2: Deploy Frontend to Vercel

Once authenticated, run these commands:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Deploy to production
vercel --prod
```

**Follow the prompts:**
- Set up and deploy? → **Yes**
- Which scope? → **Your username/org**
- Link to existing project? → **No**
- Project name? → **neuropilot-inventory** (or your choice)
- Which directory is your code located? → **.** (current directory)
- Override settings? → **No**

**Save your Vercel URL** - you'll need it for the next steps!

Example: `https://neuropilot-inventory-xyz123.vercel.app`

---

## STEP 3: Configure Frontend Environment Variable

Replace `YOUR-VERCEL-PROJECT-NAME` with your actual project name:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Set the backend API URL
vercel env add API_URL production

# When prompted, paste this URL:
https://resourceful-achievement-production.up.railway.app
```

**Redeploy with the new environment variable:**

```bash
vercel --prod --force
```

---

## STEP 4: Update Backend CORS Settings

Replace `YOUR-VERCEL-URL` with your actual Vercel deployment URL:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Set allowed frontend origin
railway variables set FRONTEND_ORIGIN="https://YOUR-VERCEL-URL"

# Redeploy backend to apply CORS changes
railway up
```

---

## STEP 5: Generate Owner Token

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Generate owner token for admin access
node generate_owner_token.js
```

**Save the token!** You'll use it to login.

The output will look like:
```
✅ Owner token generated successfully!

Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Use this token to login to the owner console.
Token expires in 7 days.
```

---

## STEP 6: Test Your Deployment

### Test 1: Frontend Loads
Open your Vercel URL in a browser:
```
https://YOUR-VERCEL-URL
```

**Expected:** Login screen visible

### Test 2: Backend Health
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health
```

**Expected:** `{"status":"healthy",...}`

### Test 3: Authentication Works
```bash
# Replace YOUR-TOKEN with the token from Step 5
curl -H "Authorization: Bearer YOUR-TOKEN" \
     https://resourceful-achievement-production.up.railway.app/api/owner/dashboard
```

**Expected:** Dashboard data (not "unauthorized")

---

## STEP 7: Configure GitHub Actions (Optional for now)

```bash
cd /Users/davidmikulis/neuro-pilot-ai

# Set GitHub secrets for validation workflows
gh secret set BACKEND_URL --body "https://resourceful-achievement-production.up.railway.app"
gh secret set FRONTEND_URL --body "https://YOUR-VERCEL-URL"
```

---

## Quick Command Reference

**Where to run commands:**

```bash
# Frontend commands (deployment, env vars)
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Backend commands (Railway, token generation)
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# GitHub commands (anywhere in repo)
cd /Users/davidmikulis/neuro-pilot-ai
```

---

## Troubleshooting

### Vercel login fails
- Make sure you have a Vercel account at https://vercel.com
- Check that your browser isn't blocking the authentication popup
- Try running `vercel logout` then `vercel login` again

### Frontend shows 500 errors
- Verify `API_URL` is set: `vercel env ls`
- Check browser console for CORS errors
- Verify backend CORS is configured with your Vercel URL

### Authentication fails
- Verify token hasn't expired (7 days)
- Generate new token: `node generate_owner_token.js`
- Check that JWT_SECRET matches between local and Railway

---

## Current Deployment Info

**Backend:**
- URL: https://resourceful-achievement-production.up.railway.app
- Railway Project ID: 081be493-34d8-4232-9e3f-ecf1b85cc4ad
- Status: ✅ LIVE and healthy

**Frontend:**
- Status: ⏳ Awaiting deployment
- Vercel project: Not yet created
- Configuration: vercel.json ready

**Agents:**
- Total: 73+ autonomous AI agents
- Status: Ready to activate once frontend is deployed

---

**Next Action:** Run `vercel login` in your terminal to continue the deployment!
