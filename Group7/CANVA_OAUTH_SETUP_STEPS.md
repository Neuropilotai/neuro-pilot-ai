# Canva OAuth - Redirect URI Configuration

**You're on**: https://www.canva.com/developers/integrations/connect-api/OC-AZpE6CfUcTc-/configuration

---

## What to Do on This Page:

### Step 1: Find Redirect URIs Section

On the configuration page, look for a section labeled:
- **"Redirect URIs"**
- **"OAuth redirect URIs"**
- **"Authorized redirect URIs"**
- **"Callback URLs"**

It's usually in the middle or bottom of the page.

---

### Step 2: Add the Redirect URI

1. **Click** the "Add" or "+" button next to Redirect URIs
2. **Enter this exact URL**:
   ```
   http://localhost:3001/oauth/callback
   ```
3. **Click** "Save" or "Add"

**Important**: Make sure it's exactly `http://localhost:3001/oauth/callback` (no trailing slash)

---

### Step 3: Save Configuration

- Look for a "Save" or "Update" button at the bottom of the page
- Click it to save your changes
- Wait for confirmation that changes were saved

---

### Step 4: Verify Redirect URI is Listed

After saving, you should see:
```
Redirect URIs:
  http://localhost:3001/oauth/callback  ✓
```

---

## Then Run OAuth Flow

Once the redirect URI is saved:

```bash
cd ~/neuro-pilot-ai/Group7
node canva-oauth.mjs
```

The browser will open to `http://localhost:3001/auth`, then:
1. Redirect to Canva for authorization
2. You approve access
3. Canva redirects back to `http://localhost:3001/oauth/callback` ✓ (now allowed!)
4. Token displays on success page

---

## Troubleshooting

### "Redirect URI must be HTTPS"
- For localhost, HTTP is usually allowed
- If not, we'll need to set up HTTPS (ngrok or similar)

### "Invalid redirect URI format"
- Double-check: `http://localhost:3001/oauth/callback`
- No trailing slash
- No extra spaces
- Port must be 3001

### Can't Find Redirect URI Section
- Try scrolling down on the configuration page
- Look under "OAuth Settings" or "Security" sections
- Check if there's a "Configure OAuth" button to click first

---

## Alternative: If Page Has "Scopes" Section

While you're on the configuration page, also verify these **scopes** are enabled:
- ✅ `design:content:read`
- ✅ `design:content:write`
- ✅ `asset:read`
- ✅ `asset:write`

These are needed for Group7 to render videos from templates.

---

**After adding redirect URI and saving, come back and run:**
```bash
node canva-oauth.mjs
```
