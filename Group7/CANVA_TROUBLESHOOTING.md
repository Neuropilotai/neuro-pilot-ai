# Canva OAuth 400 Error - Troubleshooting

## Current Status

**You're on**: https://www.canva.com/developers/integrations/connect-api

This is the main integrations page. You need to navigate to your specific app.

---

## Step 1: Find Your App

On the page you're on now (https://www.canva.com/developers/integrations/connect-api):

**Look for**:
- A list of your integrations/apps
- An app with Client ID: `OC-AZpE6CfUcTc-`
- Might be listed by name (whatever name you gave it)

**Click** on that app to open its configuration.

---

## Step 2: Check App Configuration

Once you click on your app, you should see:

### Configuration URL (should look like):
```
https://www.canva.com/developers/integrations/connect-api/OC-AZpE6CfUcTc-/configuration
```

### On the configuration page, verify:

1. **Authorized Redirects Section**:
   ```
   URL 1: http://127.0.0.1:3001/oauth/callback  ✓
   ```
   - If still shows `https://example.com/redirect-url` → Save didn't work
   - Delete example URL, add correct one, click Save

2. **Scopes/Permissions**:
   - Check what scopes are listed
   - Need at least: `asset:read`, `asset:write`
   - For full functionality: `design:content:read`, `design:content:write`

3. **App Status**:
   - Look for status indicator
   - Should be "Active" or "Published"
   - If "Draft" or "Pending" → May need approval

4. **Authentication Status**:
   - Check if OAuth is enabled
   - Any warnings about setup incomplete?

---

## Common Issues & Solutions

### Issue 1: Redirect URI Not Saved

**Symptoms**: Still getting 400 error after saving redirect URI

**Solution**:
1. Go to configuration page
2. In "Authorized redirects" section:
   - First, **delete** `https://example.com/redirect-url`
   - Then **add** `http://127.0.0.1:3001/oauth/callback`
   - Click **Save** button at bottom of ENTIRE page (not just URL section)
3. Refresh page to confirm it's saved

---

### Issue 2: App in Draft/Sandbox Mode

**Symptoms**: App exists but OAuth doesn't work

**Solution**:
1. Check app status on configuration page
2. If "Draft" → May need to publish/activate
3. Look for "Publish" or "Activate" button
4. Some apps require Canva approval before OAuth works

---

### Issue 3: Scopes Not Configured

**Symptoms**: 400 error during authorization

**Solution**:
1. On configuration page, find "Scopes" or "Permissions" section
2. Enable these scopes:
   - `asset:read`
   - `asset:write`
   - `design:content:read` (if available)
   - `design:content:write` (if available)
3. Save changes

---

### Issue 4: OAuth Not Enabled for App Type

**Symptoms**: Persistent 400 errors despite correct config

**Possible causes**:
- Your app type might not support user OAuth
- Might be server-to-server only
- Might need API key instead of OAuth

**Solution**:
Check if there's an "API Keys" or "Access Tokens" section where you can generate a token directly without OAuth.

---

## Alternative: Generate Token Directly

If OAuth continues to fail, look for direct token generation:

### On your app's configuration page:

**Look for tabs/sections like**:
- "API Keys"
- "Access Tokens"
- "Authentication"
- "Credentials"

**If you find "Generate Token" or similar**:
1. Click to generate an access token
2. Copy the token
3. Add directly to `.env`:
   ```bash
   CANVA_ACCESS_TOKEN=your_generated_token
   ```
4. Skip OAuth entirely!

This is often simpler for server-to-server apps.

---

## What to Check Right Now

1. **Go to**: https://www.canva.com/developers/integrations/connect-api
2. **Find**: Your app in the list (Client ID: `OC-AZpE6CfUcTc-`)
3. **Click**: On the app to open configuration
4. **Report back**:
   - What's the app status? (Active/Draft/etc)
   - Does redirect URI show correctly?
   - Are there any warnings or errors?
   - Is there an "API Keys" or "Generate Token" option?

---

## If Nothing Works: Alternative Approach

If Canva Connect API OAuth is too restrictive, we have options:

### Option A: Use API Key (if available)
- Simpler than OAuth
- Direct access token
- No redirect URI needed

### Option B: Use Canva Design API (different product)
- Separate from Connect API
- Might have different auth requirements
- Check: https://www.canva.com/developers/docs/design-api/

### Option C: Use Canva Enterprise API
- Requires enterprise account
- More robust for automation
- Different pricing tier

---

## Next Steps

**Please check on the main integrations page**:
1. How many apps/integrations do you see listed?
2. Can you find the one with Client ID `OC-AZpE6CfUcTc-`?
3. What's its name/status?

Then click on it to open the configuration page and let me know what you see!
