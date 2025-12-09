# Fixing 403 Errors on Owner Routes

## Current Issue

After deploying the authentication fixes, `/api/owner/pdfs` is returning **403 (Forbidden)** instead of 401.

**What this means:**
- ✅ Authentication is working (JWT token is valid)
- ❌ Device binding check is failing (X-Owner-Device header mismatch)

## Root Cause

The `requireOwnerDevice` middleware checks that the `X-Owner-Device` header matches the `OWNER_DEVICE_ID` environment variable in Railway.

**403 Error = Device ID Mismatch:**
- The device ID in your browser's localStorage doesn't match Railway's `OWNER_DEVICE_ID`
- Or the `X-Owner-Device` header is not being sent

## Solution

### Step 1: Check Railway Environment Variables

1. Go to Railway Dashboard → Your Project → Variables
2. Find `OWNER_DEVICE_ID`
3. Note the exact value (e.g., `owner-workstation-001`)

### Step 2: Check Browser localStorage

1. Open browser DevTools (F12)
2. Go to **Application** tab → **Local Storage**
3. Check `np_owner_device` value
4. It must **exactly match** Railway's `OWNER_DEVICE_ID`

### Step 3: Fix Device ID Mismatch

**Option A: Update localStorage to match Railway**
1. In DevTools Console, run:
   ```javascript
   localStorage.setItem('np_owner_device', 'YOUR_RAILWAY_DEVICE_ID');
   ```
2. Replace `YOUR_RAILWAY_DEVICE_ID` with the exact value from Railway
3. Reload the page

**Option B: Update Railway to match localStorage**
1. Check your browser's localStorage `np_owner_device` value
2. Go to Railway Dashboard → Variables
3. Update `OWNER_DEVICE_ID` to match localStorage value
4. Wait for Railway to redeploy

**Option C: Re-login via quick_login.html**
1. Visit: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
2. Enter your credentials
3. Enter the device ID that matches Railway's `OWNER_DEVICE_ID`
4. This will update localStorage with the correct device ID

### Step 4: Verify Headers Are Sent

1. Open DevTools → Network tab
2. Make a request to `/api/owner/pdfs`
3. Click on the request
4. Check **Headers** tab → **Request Headers**
5. Verify both headers are present:
   - `Authorization: Bearer <token>`
   - `X-Owner-Device: <device-id>`

## Troubleshooting

### Still Getting 403 After Fixing Device ID

1. **Clear browser cache completely:**
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Or clear all browser data

2. **Check Railway logs:**
   - Railway Dashboard → Deploy Logs
   - Look for warnings about device ID mismatch
   - Verify `OWNER_DEVICE_ID` is set correctly

3. **Verify JavaScript is loading:**
   - Check Network tab for `owner-console-core.js?v=23.6.8`
   - If still loading `v=23.5.1`, Railway hasn't deployed yet
   - Wait for Railway deployment, then clear cache

### Device ID Not in localStorage

If `np_owner_device` is missing from localStorage:

1. **Re-login via quick_login.html:**
   - This will set both `np_owner_jwt` and `np_owner_device`

2. **Or set manually:**
   ```javascript
   localStorage.setItem('np_owner_device', 'YOUR_DEVICE_ID');
   ```

### OWNER_DEVICE_ID Not Set in Railway

If Railway doesn't have `OWNER_DEVICE_ID`:

1. Go to Railway Dashboard → Variables
2. Add new variable:
   - Key: `OWNER_DEVICE_ID`
   - Value: Any string (e.g., `owner-workstation-001`)
3. Save and wait for redeploy
4. Use the same value when logging in via `quick_login.html`

## Expected Behavior After Fix

✅ **200 OK:** Device ID matches, authentication successful
❌ **401 Unauthorized:** JWT token missing or invalid
❌ **403 Forbidden:** Device ID mismatch or missing

## Quick Checklist

- [ ] Check Railway `OWNER_DEVICE_ID` value
- [ ] Check browser localStorage `np_owner_device` value
- [ ] Ensure they match exactly (case-sensitive)
- [ ] Verify `X-Owner-Device` header is sent in requests
- [ ] Clear browser cache if needed
- [ ] Re-login via `quick_login.html` if device ID changed

---

**Note:** The 403 error is actually a good sign - it means authentication is working, but device binding is enforcing security. Just need to ensure the device IDs match.

