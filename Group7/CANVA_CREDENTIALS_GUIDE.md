# Canva Credentials - Which Type Do You Need?

## You Just Created: Canva Apps Platform App ❌

```
CANVA_APP_ID=AAG3jTcKlEA
CANVA_APP_ORIGIN=https://app-aag3jtcklea.canva-apps.com
CANVA_ENABLE_HMR=TRUE
```

**This is for**: Interactive apps that run *inside* Canva's editor
**Not suitable for**: Group7's automated video rendering

---

## What Group7 Actually Needs: Design API / Connect API ✅

### Two Options:

### Option 1: Create Design API App (Recommended)

**If Canva offers "Design API" or "Connect API" access:**

1. **Go to**: https://www.canva.com/developers
2. **Look for**: "Create App" or "Design API" or "Connect API"
3. **Choose**: "Automation" or "API Integration" (NOT "Apps Platform")
4. **You'll get**:
   ```
   Client ID (App ID)      - Different format, no .canva-apps.com
   Client Secret           - For OAuth
   Access Token            - Via OAuth flow
   ```

---

### Option 2: Use Canva Connect API (Enterprise)

**If you have Canva Enterprise/Teams**:

1. **Go to**: https://www.canva.com/developers/connect
2. **Create API credentials**
3. **Get**: API key or OAuth credentials

---

### Option 3: Check if Apps Platform Has API Access

**Some Apps Platform apps might have REST API access:**

1. Go to: https://www.canva.com/developers/apps
2. Find your app: `AAG3jTcKlEA`
3. Check for:
   - "API Keys" tab
   - "Client Secret"
   - "OAuth" settings
   - "REST API" access

**If you see these**, you might be able to use this app for REST API calls.

---

## How to Tell Which Type You Have

### Apps Platform App (what you just created):
```
✅ Has: CANVA_APP_ORIGIN ending in .canva-apps.com
✅ Has: CANVA_ENABLE_HMR
✅ Created with: canva apps create
❌ For: Interactive UI apps, not automation
```

### Design API / Connect App (what Group7 needs):
```
✅ Has: Client ID and Client Secret
✅ Has: OAuth flow for access tokens
✅ Has: REST API endpoints (api.canva.com/rest/v1)
✅ For: Automated rendering, template autofill
```

---

## Quick Test: Can Your App Do REST API Calls?

```bash
# Try calling Canva REST API with your Apps Platform credentials
curl -X GET 'https://api.canva.com/rest/v1/autofills' \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# If this works → You're good to go
# If 401/403 → Wrong app type, need Design API app
```

---

## Recommended Next Steps

### Step 1: Check What You Have

Visit: https://www.canva.com/developers/apps

**Look for**:
1. Any existing apps with "REST API" or "Design API" access
2. Your Apps Platform app (`AAG3jTcKlEA`)
3. Options to enable API access

### Step 2: Determine App Type Needed

**For Group7's use case**:
- Automated template rendering (autofill API)
- Headless video generation
- Batch processing
- No user interaction

**You need**: Design API / Connect API / Automation app

### Step 3A: If Apps Platform App Has API Access

If your `AAG3jTcKlEA` app has REST API access:

```bash
# Add to .env
CANVA_APP_ID=AAG3jTcKlEA
CANVA_APP_SECRET=<find in dashboard>
# Then run OAuth:
node canva-oauth.mjs
```

### Step 3B: If You Need New Design API App

If Apps Platform app doesn't support REST API:

1. Go to: https://www.canva.com/developers
2. Look for: "Design API" or "Connect API" section (separate from Apps Platform)
3. Create: New API integration
4. Get: Client ID, Client Secret
5. Add to .env and run OAuth

---

## Current Canva Developer Portal Structure

As of 2024, Canva has:

1. **Apps Platform** (`apps.canva.com`)
   - Interactive UI apps
   - Run in Canva editor
   - Use Apps SDK

2. **Connect API / Design API** (`api.canva.com`)
   - REST API for automation
   - Headless rendering
   - Template autofill

**Group7 needs #2** (Connect/Design API)

---

## Troubleshooting

### "I only see Apps Platform, no Design API option"

**Possible reasons**:
1. Design API might be in beta (request access)
2. Might require Canva for Teams/Enterprise
3. Might be called something else ("Automation", "Integration")

**Solutions**:
- Contact Canva support: developers@canva.com
- Check Canva developer docs: https://www.canva.com/developers/docs
- Look for "Content Autofill API" or "Design API" specifically

### "My Apps Platform app has a Client Secret"

**Good news**: This might support REST API!

**Try**:
1. Add credentials to .env
2. Run `node canva-oauth.mjs`
3. Try rendering with `npm run canva:render`
4. If it works → you're good!

---

## What Credentials Group7 Needs (Final Answer)

```bash
# In .env:
CANVA_APP_ID=<your_client_id>          # From any Canva app with REST API access
CANVA_APP_SECRET=<client_secret>       # Must have this for OAuth
CANVA_ACCESS_TOKEN=<from_oauth>        # Get via: node canva-oauth.mjs
CANVA_TEMPLATE_ID=<your_template>      # Design template for videos
```

**How to get these**:
1. Go to Canva Developer Portal
2. Find or create an app with **REST API access**
3. Copy Client ID and Client Secret
4. Add to .env
5. Run OAuth flow
6. Test rendering

---

## Action Items

**Right now, do this**:

1. **Visit**: https://www.canva.com/developers/apps
2. **Find**: Your `AAG3jTcKlEA` app
3. **Check**: Does it have "Client Secret" or "API Keys"?
   - YES → Use it! Add credentials to .env
   - NO → Look for "Design API" or "Connect API" section

4. **If stuck**: Check these docs
   - https://www.canva.com/developers/docs/connect-api
   - https://www.canva.com/developers/docs/design-api

5. **Alternative**: Email developers@canva.com and ask:
   > "I need REST API access for automated template rendering (autofill API).
   > Which type of app should I create?"

---

**The goal**: Get `CANVA_APP_ID` and `CANVA_APP_SECRET` from an app that supports REST API calls to `api.canva.com/rest/v1/autofills`
