# Vercel Frontend Deployment Guide

**Version**: 16.6.0
**Status**: Ready for Deployment
**Deployment Type**: Static Site (No Build Required)

---

## 📋 Prerequisites

Before deploying to Vercel, ensure:

1. ✅ **Backend deployed to Railway** (see `backend/STAGING_DEPLOYMENT_GUIDE.md`)
2. ✅ **Railway URL available** (e.g., `https://your-app.up.railway.app`)
3. ✅ **Vercel CLI installed** (optional but recommended)
   ```bash
   npm install -g vercel
   ```

---

## 🚀 Quick Deployment

### Option 1: Vercel CLI (Recommended)

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend

# Login to Vercel (if not already)
vercel login

# Deploy to production
vercel --prod
```

**Follow the prompts**:
- Set up and deploy? `Y`
- Which scope? Select your account
- Link to existing project? `N` (first time) or `Y` (subsequent)
- Project name? `neuropilot-inventory`
- Directory? `.` (current directory)

### Option 2: Vercel Dashboard (Web UI)

1. **Go to**: https://vercel.com/david-mikulis-projects-73b27c6d
2. **Click**: "Add New" → "Project"
3. **Import Git Repository**:
   - Select your GitHub/GitLab repo
   - OR upload frontend directory via drag-and-drop
4. **Configure Project**:
   - Framework Preset: **Other** (static site)
   - Root Directory: `frontend`
   - Build Command: *leave empty*
   - Output Directory: `.` (dot - current directory)
   - Install Command: *leave empty*
5. **Add Environment Variables** (CRITICAL):
   - Key: `VITE_API_URL`
   - Value: `https://your-railway-app.up.railway.app`
6. **Click**: "Deploy"

---

## ⚙️ Environment Variables

Set these in Vercel dashboard or via CLI:

### Required Variables

```bash
# Backend API URL (Railway)
VITE_API_URL=https://your-railway-app.up.railway.app
```

### Optional Variables

```bash
# For development
VITE_DEBUG=false

# Custom auth timeout (minutes)
VITE_AUTH_TIMEOUT=30
```

### Setting via CLI

```bash
vercel env add VITE_API_URL production
# Paste: https://your-railway-app.up.railway.app
```

---

## 🔐 CORS Configuration

Ensure your Railway backend has the correct CORS origin set:

```bash
# On Railway, set this environment variable:
ALLOW_ORIGIN=https://your-vercel-app.vercel.app
```

**CRITICAL**: The origin must match EXACTLY (no trailing slash):
- ✅ `https://neuropilot-inventory.vercel.app`
- ❌ `https://neuropilot-inventory.vercel.app/`
- ❌ `http://neuropilot-inventory.vercel.app`

---

## 📁 Project Structure

```
frontend/
├── vercel.json              ← Vercel configuration (NEW)
├── .vercelignore           ← Files to exclude (NEW)
├── index.html              ← Landing page
├── owner-super-console.html ← Main app
├── src/
│   └── lib/
│       ├── auth.js         ← Auth module with refreshIfNeeded()
│       └── api.js          ← API wrapper with auto-refresh
├── public/
│   ├── css/
│   └── js/
└── ... (other HTML/JS/CSS files)
```

---

## 🧪 Post-Deployment Verification

### 1. Check Deployment Status

```bash
vercel ls
```

### 2. Test Frontend Loading

```bash
# Get your Vercel URL
VERCEL_URL=$(vercel inspect --json | jq -r '.url')
echo "Frontend URL: https://$VERCEL_URL"

# Test health (should load HTML)
curl -I https://$VERCEL_URL
```

### 3. Test Authentication Flow

1. **Open frontend** in browser: `https://your-app.vercel.app`
2. **Navigate to login**: `/owner-super-console.html`
3. **Open browser console** (F12)
4. **Login with test credentials**:
   - Email: `neuropilotai@gmail.com`
   - Password: `TestPassword123!`
5. **Verify**:
   - ✅ No CORS errors in console
   - ✅ Token appears in localStorage
   - ✅ API calls succeed
   - ✅ Dashboard loads

### 4. Test Token Refresh

1. **Set token expiry to 1 minute** (backend dev only)
2. **Wait 61 seconds**
3. **Make an API call** (e.g., load dashboard)
4. **Verify**: Token auto-refreshes silently
5. **Check console**: Should see `console.log('Token refreshed')`

---

## 🔧 Vercel Configuration Explained

### `vercel.json`

```json
{
  "version": 2,
  "name": "neuropilot-inventory",
  "builds": [
    { "src": "**/*.html", "use": "@vercel/static" },
    { "src": "**/*.js", "use": "@vercel/static" },
    { "src": "**/*.css", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/", "dest": "/index.html" },
    { "src": "/(.*)", "dest": "/$1" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

**Features**:
- Static file serving (no build step)
- Security headers on all responses
- Clean URLs
- Proper MIME types for JS modules

---

## 🚨 Troubleshooting

### Issue: CORS Errors in Browser Console

**Error**: `Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy`

**Solution**:
1. Check Railway `ALLOW_ORIGIN` environment variable
2. Ensure it matches your Vercel URL exactly
3. Restart Railway app: `railway restart`

### Issue: API Calls Return 404

**Error**: `GET https://undefined/api/auth/me 404`

**Solution**:
1. Check Vercel environment variable: `VITE_API_URL`
2. Ensure it's set to your Railway URL
3. Redeploy: `vercel --prod --force`

### Issue: Token Refresh Fails

**Error**: `Token refresh failed: no_refresh_token`

**Solution**:
1. Check if `refreshToken` is in localStorage
2. Verify backend `/api/auth/refresh` endpoint works
3. Check Railway logs: `railway logs -f`

### Issue: Modules Not Loading (auth.js, api.js)

**Error**: `Failed to load module script: Expected a JavaScript module script`

**Solution**:
1. Ensure files have `.js` extension
2. Check `vercel.json` has correct headers for JS files
3. Use `type="module"` in HTML:
   ```html
   <script type="module">
     import { getToken } from './src/lib/auth.js';
   </script>
   ```

---

## 📊 Deployment Checklist

Before deploying:

- [ ] Backend deployed to Railway
- [ ] Railway URL confirmed and accessible
- [ ] Backend `ALLOW_ORIGIN` set to Vercel URL
- [ ] `vercel.json` created in frontend directory
- [ ] `.vercelignore` created
- [ ] Vercel CLI installed (optional)

After deploying:

- [ ] Frontend accessible at Vercel URL
- [ ] No CORS errors in browser console
- [ ] Login works successfully
- [ ] Token stored in localStorage
- [ ] Protected routes accessible
- [ ] Token auto-refresh works (wait 30+ min)
- [ ] Logout works
- [ ] No console errors

---

## 🔄 Redeployment

To redeploy after changes:

```bash
cd frontend

# Deploy with force rebuild
vercel --prod --force

# Or just deploy
vercel --prod
```

Vercel will:
1. Upload changed files
2. Update environment variables (if changed)
3. Deploy new version
4. Provide new URL

---

## 🌐 Custom Domain (Optional)

To add a custom domain:

### Via Dashboard

1. Go to Vercel project → Settings → Domains
2. Add domain (e.g., `app.neuropilot.com`)
3. Configure DNS (Vercel provides instructions)
4. Update Railway `ALLOW_ORIGIN` to match new domain

### Via CLI

```bash
vercel domains add app.neuropilot.com
```

---

## 📈 Monitoring & Analytics

### Vercel Analytics

Enable in dashboard:
1. Project → Analytics tab
2. Enable Web Analytics
3. View real-time metrics

### Railway Logs

Monitor backend logs:
```bash
railway logs -f
```

Look for:
- CORS errors
- Auth failures
- Token refresh requests

---

## 🔐 Security Checklist

Frontend security is configured via `vercel.json`:

- ✅ **X-Content-Type-Options**: `nosniff` - Prevents MIME sniffing
- ✅ **X-Frame-Options**: `DENY` - Prevents clickjacking
- ✅ **X-XSS-Protection**: `1; mode=block` - XSS protection
- ✅ **Referrer-Policy**: `strict-origin-when-cross-origin` - Limits referrer leakage
- ✅ **Permissions-Policy**: Restricts camera, mic, geolocation

Backend CORS ensures:
- ✅ Only your Vercel domain can make API calls
- ✅ Credentials included in requests
- ✅ Preflight requests handled

---

## 📋 Complete Deployment Flow

### Step 1: Deploy Backend (if not done)

```bash
cd backend
export FRONTEND_ORIGIN="https://your-app.vercel.app"
export DATABASE_URL="postgresql://..."
./scripts/stage-deploy.sh
```

### Step 2: Get Railway URL

```bash
RAILWAY_URL=$(railway domain | head -n1 | tr -d '[:space:]')
echo "Backend URL: $RAILWAY_URL"
```

### Step 3: Deploy Frontend

```bash
cd ../frontend

# Set API URL
vercel env add VITE_API_URL production
# Paste: $RAILWAY_URL

# Deploy
vercel --prod
```

### Step 4: Update Backend CORS

```bash
# Get Vercel URL from deployment output
VERCEL_URL="https://neuropilot-inventory-abc123.vercel.app"

# Update Railway
cd ../backend
railway variables set ALLOW_ORIGIN="$VERCEL_URL"
```

### Step 5: Verify Everything Works

```bash
# Test smoke tests from backend
cd backend
RAILWAY_URL="$RAILWAY_URL" ./scripts/smoke-test.sh

# Open frontend in browser
open "$VERCEL_URL/owner-super-console.html"
```

---

## ✅ Success Criteria

Deployment successful when:

- ✅ Frontend loads at Vercel URL
- ✅ Login works without errors
- ✅ Token stored in localStorage
- ✅ API calls succeed (no 401/403)
- ✅ No CORS errors in console
- ✅ Token auto-refresh works
- ✅ All pages accessible
- ✅ No console errors

---

## 📞 Support

**Documentation**:
- Backend Guide: `../backend/STAGING_DEPLOYMENT_GUIDE.md`
- Security Report: `../backend/SECURITY_HARDENING_v16.6.md`
- Auth Migration: `AUTH_MIGRATION_GUIDE.md`

**Vercel Dashboard**: https://vercel.com/dashboard
**Railway Dashboard**: https://railway.app/dashboard

---

**Deployment Time**: ~5 minutes
**Zero Downtime**: ✅ Supported
**Rollback**: ✅ One-click in Vercel dashboard
