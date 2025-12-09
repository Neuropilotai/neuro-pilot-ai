# Cache-Busting Fix for Console Not Updating

## Problem

Railway has deployed the latest code, but the browser console is still loading old JavaScript files (`v=23.5.1` instead of `v=23.6.10`). This is a browser cache issue.

## Solution Applied

### 1. Server-Side Cache Headers ✅
- **Updated:** `backend/server-v21_1.js`
- **Change:** Disabled caching for ALL JavaScript files (not just `owner-console-core.js`)
- **Result:** Server tells browser not to cache any JS files

### 2. Version Updates ✅
- **Updated:** `backend/public/owner-super-console-v15.html`
- **Change:** Updated `owner-super-console.js` to `v=23.6.10` (was `v=23.6.9`)
- **Result:** Consistent version numbers across all scripts

### 3. Automatic Version Check ✅
- **Added:** Version check script in HTML
- **Function:** Automatically detects if wrong version is loaded and forces reload
- **Behavior:** Clears localStorage/sessionStorage and reloads page if wrong version detected

## How the Version Check Works

The version check script:
1. Checks all loaded scripts for version numbers
2. If it finds `v=23.5.1` or any version other than `v=23.6.10`, it:
   - Logs a warning to console
   - Clears browser cache (caches API)
   - Clears localStorage and sessionStorage
   - Forces a hard reload (`window.location.reload(true)`)

## Immediate Actions

### Option 1: Hard Refresh (Fastest)
1. Open browser DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
   - OR use keyboard: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Option 2: Use Force Cache Clear Page
1. Visit: `https://inventory-backend-production-3a2c.up.railway.app/force-cache-clear.html`
2. Click "Nuclear Option" button
3. This will clear everything and redirect to login

### Option 3: Manual Console Commands
Open browser console (F12) and run:
```javascript
localStorage.clear();
sessionStorage.clear();
if('caches' in window) caches.keys().then(n => n.forEach(c => caches.delete(c)));
location.reload(true);
```

### Option 4: Incognito/Private Mode
1. Open incognito/private window
2. Visit: `/owner-super-console-v15.html`
3. Login (fresh cache, no old version)

## After Clearing Cache

1. **Re-login:**
   - Visit: `/quick_login.html`
   - Enter credentials
   - Enter device ID (must match Railway's `OWNER_DEVICE_ID`)

2. **Verify:**
   - Check Network tab for `owner-super-console.js?v=23.6.10`
   - Check console for version check messages
   - Test `/api/owner/ops/status` - should return 200

## Expected Results

✅ **Correct Version Loaded:**
- `owner-console-core.js?v=23.6.10`
- `owner-super-console.js?v=23.6.10`

✅ **No More 401 Errors:**
- `/api/owner/ops/status` → 200
- All owner API calls authenticated correctly

✅ **Version Check Working:**
- If wrong version detected, page auto-reloads
- Console shows version check warnings if needed

## Troubleshooting

### Still Seeing v23.5.1 After Hard Refresh
- **Check Railway:** Verify latest commit `ebb520a292` is deployed
- **Check Network Tab:** Look at actual HTTP response headers
- **Try Incognito:** Bypasses all cache completely

### Version Check Not Working
- **Check Console:** Look for version check warnings
- **Check Scripts:** Verify scripts are loading from Railway URL
- **Manual Reload:** Use Option 3 (console commands) above

### Still Getting 401 Errors
- **Verify Token:** `localStorage.getItem('np_owner_jwt')`
- **Verify Device ID:** `localStorage.getItem('np_owner_device')`
- **Re-login:** Get fresh token via `/quick_login.html`

## Commit

**Commit:** `ebb520a292`  
**Message:** `fix: aggressive cache-busting for console JS files`  
**Status:** ✅ Committed and pushed

---

**Last Updated:** After cache-busting fixes  
**Status:** ✅ Fixes applied, waiting for Railway deployment and browser cache clear

