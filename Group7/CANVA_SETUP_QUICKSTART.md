# Canva OAuth Setup - Quick Start

## Current Status

```
✅ CANVA_APP_ID        - Set in .env
✅ CANVA_TEMPLATE_ID   - Set in .env
❌ CANVA_APP_SECRET    - MISSING (need this first!)
❌ CANVA_ACCESS_TOKEN  - MISSING (OAuth flow gets this)
```

---

## Step 1: Get CANVA_APP_SECRET (5 minutes)

### Option A: Existing App (Recommended)

If you already created a Canva app:

1. **Go to**: https://www.canva.com/developers/apps
2. **Find your app** (the one with the App ID you already have)
3. **Click** on the app name
4. **Copy** the "Client Secret" (might be labeled "App Secret")
5. **Add to .env**:
   ```bash
   nano .env
   # Find CANVA_APP_SECRET= and paste the secret
   # Save: Ctrl+O, Enter, Ctrl+X
   ```

### Option B: Create New App (if needed)

If you don't have an app yet:

1. **Go to**: https://www.canva.com/developers
2. **Click**: "Create an app"
3. **Fill in**:
   - App name: "Group7 Video Factory"
   - App type: "Automation"
   - Redirect URIs: `http://localhost:3001/oauth/callback`
4. **Select scopes**:
   - ✅ `design:content:read`
   - ✅ `design:content:write`
   - ✅ `asset:read`
   - ✅ `asset:write`
5. **Click**: "Create app"
6. **Copy** both:
   - Client ID (App ID) - update CANVA_APP_ID if different
   - Client Secret - add to CANVA_APP_SECRET
7. **Update .env**:
   ```bash
   nano .env
   # Update:
   CANVA_APP_ID=your_client_id
   CANVA_APP_SECRET=your_client_secret
   # Save: Ctrl+O, Enter, Ctrl+X
   ```

---

## Step 2: Run OAuth Flow (2 minutes)

Once you have CANVA_APP_SECRET in .env:

```bash
# Start OAuth server
node canva-oauth.mjs

# You'll see:
# 🎨 Canva OAuth Helper Running
# Server: http://localhost:3001
#
# To authorize Canva:
# 1. Open: http://localhost:3001/auth
```

**Then**:
1. Open http://localhost:3001/auth in your browser
2. Sign in to Canva (if not already)
3. Click "Authorize" to grant access
4. Copy the access token shown on the success page
5. Add to .env:
   ```bash
   CANVA_ACCESS_TOKEN=paste_token_here
   ```

---

## Step 3: Verify Setup

```bash
# Re-run environment check
npm run env:check

# Should now show:
# ✅ CANVA_APP_ID
# ✅ CANVA_APP_SECRET
# ✅ CANVA_ACCESS_TOKEN
# ✅ CANVA_TEMPLATE_ID
```

---

## Troubleshooting

### "Missing Canva credentials" when running OAuth
- **Cause**: CANVA_APP_SECRET not in .env
- **Fix**: Complete Step 1 first

### "Invalid client credentials" during OAuth
- **Cause**: Wrong CANVA_APP_SECRET
- **Fix**: Double-check secret from Canva dashboard

### "Redirect URI mismatch"
- **Cause**: Redirect URI not configured in Canva app settings
- **Fix**: Add `http://localhost:3001/oauth/callback` to allowed redirect URIs in Canva app settings

### Token expires
- **Duration**: Canva tokens typically last 3600 seconds (1 hour)
- **Solution**: Use CANVA_REFRESH_TOKEN to get new access token (will be saved during OAuth flow)

---

## Quick Commands

```bash
# Edit .env to add CANVA_APP_SECRET
nano .env

# Run OAuth flow
node canva-oauth.mjs

# Test Canva API
npm run canva:render

# Full system check
npm run selftest
```

---

## What You'll Get

After OAuth completes successfully, you'll receive:

```
CANVA_ACCESS_TOKEN=eyJhbGc...  (required for API calls)
CANVA_REFRESH_TOKEN=def123...  (optional, for renewing access)
```

**Note**: Access tokens expire! If you get 401 errors later, re-run the OAuth flow.

---

## Next Steps

Once Canva is configured:
1. ✅ Complete Google Drive setup (see ENV_SETUP_GUIDE.md)
2. ✅ Fix Notion token (regenerate at notion.so/my-integrations)
3. ✅ Add Metricool credentials
4. ✅ Run `npm run selftest` until all pass
5. 🚀 System ready for autonomous operation

---

**Need help?** Check `ENV_SETUP_GUIDE.md` for complete credential setup instructions.
