# How to Find or Set Your Owner Device ID

## Quick Answer

The **Owner Device ID** is an environment variable in Railway that you need to:
1. **Find** in Railway dashboard (if it already exists)
2. **Set** in Railway dashboard (if it doesn't exist)
3. **Enter** in the login form (must match exactly)

---

## Step-by-Step Instructions

### Option 1: Find Existing Device ID in Railway

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project: **inventory-backend** (or similar)
3. Click on **Settings** (gear icon)
4. Click on **Variables** tab
5. Look for `OWNER_DEVICE_ID` in the list
6. Copy the value (it might be hidden - click to reveal)
7. Paste it into the login form

### Option 2: Set a New Device ID in Railway

If `OWNER_DEVICE_ID` doesn't exist:

1. Go to Railway Dashboard → Your Project → Settings → Variables
2. Click **+ New Variable**
3. Name: `OWNER_DEVICE_ID`
4. Value: Enter any secure string, for example:
   - `my-macbook-pro-2024`
   - `david-device-001`
   - `owner-workstation`
   - Or any string you prefer (no spaces recommended)
5. Click **Add**
6. **Important:** Railway will redeploy automatically
7. Wait for deployment to complete
8. Use that exact value in the login form

---

## Important Notes

⚠️ **The Device ID you enter in the login form MUST exactly match the `OWNER_DEVICE_ID` value in Railway.**

- ✅ Match = Owner API calls work (200 responses)
- ❌ Mismatch = Owner API calls fail (403 Forbidden)

---

## Example

**In Railway:**
```
OWNER_DEVICE_ID = my-macbook-pro-2024
```

**In Login Form:**
```
Owner Device ID: my-macbook-pro-2024
```

✅ These match → Authentication works!

---

## Troubleshooting

### "403 Forbidden" on Owner Endpoints

**Cause:** Device ID mismatch

**Solution:**
1. Check Railway → Settings → Variables → `OWNER_DEVICE_ID`
2. Verify the value matches what you entered in login
3. Re-login with the correct device ID
4. Hard refresh the owner console: `Cmd+Shift+R`

### Device ID Not Found in Railway

**Solution:**
1. Create it following "Option 2" above
2. Wait for Railway to redeploy
3. Use the new device ID in login form

### Can't Remember Your Device ID

**Solution:**
1. Check Railway dashboard (see Option 1 above)
2. Or create a new one and update it in Railway
3. Re-login with the new device ID

---

## Security Note

The Device ID is a security measure to ensure only authorized devices can access owner endpoints. It's not a secret (unlike `JWT_SECRET`), but it should be:
- Unique to your setup
- Not shared publicly
- Consistent across your deployments

---

## Quick Reference

**Railway Location:**
```
Project → Settings → Variables → OWNER_DEVICE_ID
```

**Login Form Location:**
```
/quick_login.html → "Owner Device ID" field
```

**Must Match:** ✅ Yes, exactly

