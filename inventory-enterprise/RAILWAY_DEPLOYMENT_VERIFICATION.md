# Railway Deployment Verification Guide

## Problem Identified

**Root Cause:** Railway was serving HTML file with `v=23.5.1` (old version) while local code had `v=23.6.10` (new version). This caused:
- Browser to load old JavaScript files
- 401 errors on `/api/owner/ops/status` (old JS doesn't include auth headers)
- Intermittent authentication failures

## Solution Applied

1. **Version Bump:** Updated to `v=23.6.11` to force Railway deployment
2. **Service Worker Unregister:** Added script to unregister any service workers
3. **Improved Version Check:** Enhanced error messages and auto-reload logic

## Verification Steps

### Step 1: Check Railway Deployment Status

1. Go to Railway dashboard
2. Check latest deployment commit hash
3. Verify it matches: `b5c92f9b81` (or later)

### Step 2: Verify HTML Version on Railway

```bash
curl -s "https://inventory-backend-production-3a2c.up.railway.app/owner-super-console-v15.html" | grep -E "v=23\.6\.11"
```

**Expected Output:**
```
<link rel="stylesheet" href="css/owner-super.css?v=23.6.11">
<script src="js/config.js?v=23.6.11"></script>
<script src="js/rbac-client.js?v=23.6.11"></script>
<script src="js/owner-console-core.js?v=23.6.11&_t=1733780000"></script>
<script src="js/owner-super-console.js?v=23.6.11&_t=1733780000"></script>
```

**If you see `v=23.5.1`:** Railway hasn't deployed yet. Wait 2-3 minutes and check again.

### Step 3: Clear Browser Cache

**Option A: Hard Refresh (Fastest)**
- **Mac:** `Cmd + Shift + R`
- **Windows/Linux:** `Ctrl + Shift + R`

**Option B: Use Cache Clear Page**
1. Visit: `/force-cache-clear.html`
2. Click "Nuclear Option"
3. Re-login via `/quick_login.html`

**Option C: Manual Console**
```javascript
// Clear everything
localStorage.clear();
sessionStorage.clear();
if('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
  });
}

// Force reload
window.location.href = '/owner-super-console-v15.html?_nocache=' + Date.now();
```

### Step 4: Verify Correct Version Loaded

1. Open browser console (F12)
2. Look for: `✅ Correct version loaded: 23.6.11`
3. If you see: `❌ WRONG VERSION` → The version check will auto-reload

### Step 5: Test API Endpoints

1. Open DevTools → Network tab
2. Check `/api/owner/ops/status` requests
3. **Expected:** All requests return `200` (no more 401 errors)
4. **Verify Headers:**
   - `Authorization: Bearer <token>`
   - `X-Owner-Device: <device-id>`

## Troubleshooting

### Still Seeing v23.5.1 After Hard Refresh

1. **Check Railway:** Verify latest commit is deployed
2. **Check Network Tab:** Look at actual HTTP response headers
3. **Try Incognito:** Bypasses all cache completely
4. **Clear All Site Data:**
   - DevTools → Application → Storage
   - Click "Clear site data"

### Still Getting 401 Errors

1. **Verify Token:** `localStorage.getItem('np_owner_jwt')`
2. **Verify Device ID:** `localStorage.getItem('np_owner_device')`
3. **Re-login:** Get fresh token via `/quick_login.html`
4. **Check Railway Env Vars:**
   - `JWT_SECRET` must match token signing
   - `OWNER_DEVICE_ID` must match device header

### Version Check Not Working

- Check browser console for errors
- Verify scripts are loading from Railway URL
- Check if service worker is still registered (DevTools → Application → Service Workers)

## Expected Behavior After Fix

✅ **Correct Version:**
- HTML references `v=23.6.11`
- JavaScript files load with `v=23.6.11`
- Console shows: `✅ Correct version loaded: 23.6.11`

✅ **No More 401 Errors:**
- `/api/owner/ops/status` → 200
- All owner API calls authenticated correctly
- Headers include `Authorization` and `X-Owner-Device`

✅ **Auto-Reload Working:**
- If wrong version detected, page auto-reloads
- Service workers unregistered
- Cache cleared automatically

## Summary

**Status:** ✅ Code fixes complete, ⚠️ Waiting for Railway deployment

**Latest Commit:** `b5c92f9b81` - Version bump to v23.6.11

**Next Action:** Wait for Railway to deploy, then hard refresh browser

---

**Last Updated:** After commit b5c92f9b81  
**Railway Deployment:** Check dashboard for latest commit hash

