# Fix "jwt malformed" Error

## Current Issue

Railway logs show:
```
Invalid token attempt {
  "error": "jwt malformed"
}
```

**Symptoms:**
- Browser still loading `owner-super-console.js?v=23.5.1` (old version)
- `/api/owner/ops/status` → 401 (Unauthorized)
- `/api/owner/pdfs` → 403 (Forbidden)
- JWT token is malformed

## Root Cause

The JWT token in localStorage is corrupted or in the wrong format. This can happen if:
1. Token was stored incorrectly
2. Token was partially overwritten
3. Old token format is being used
4. Browser cache is serving old JavaScript that reads token incorrectly

## Solution

### Step 1: Clear All Auth Data

**In Browser DevTools Console, run:**
```javascript
// Clear all auth-related localStorage
localStorage.removeItem('np_owner_jwt');
localStorage.removeItem('np_owner_device');
localStorage.removeItem('NP_TOKEN');
localStorage.removeItem('authToken');
localStorage.removeItem('ownerToken');
sessionStorage.removeItem('ownerToken');

console.log('✅ All auth data cleared');
console.log('Now re-login via /quick_login.html');
```

### Step 2: Clear Browser Cache

1. **Hard Refresh:**
   - Mac: `Cmd + Shift + R`
   - Windows: `Ctrl + Shift + R`

2. **Or Clear All Site Data:**
   - DevTools → Application → Storage → Clear site data
   - Check all boxes
   - Click "Clear site data"

### Step 3: Re-Login

1. Visit: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
2. Enter your credentials:
   - Email: `neuropilotai@gmail.com`
   - Password: (your password)
   - Owner Device ID: (must match Railway's `OWNER_DEVICE_ID`)
3. Click "Login"
4. This will set:
   - `localStorage.setItem('np_owner_jwt', <valid-token>)`
   - `localStorage.setItem('np_owner_device', <device-id>)`

### Step 4: Verify Token Format

**In Browser DevTools Console, run:**
```javascript
const token = localStorage.getItem('np_owner_jwt');
if (!token) {
  console.error('❌ No token found - re-login required');
} else {
  // Check if token is valid JWT format (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('❌ Invalid JWT format - token should have 3 parts');
    console.log('Token preview:', token.substring(0, 50));
  } else {
    console.log('✅ Token format looks valid');
    try {
      // Try to decode payload
      const payload = JSON.parse(atob(parts[1]));
      console.log('Token payload:', payload);
      console.log('Expires:', new Date(payload.exp * 1000));
    } catch (e) {
      console.error('❌ Cannot decode token payload:', e.message);
    }
  }
}
```

## Why Browser Still Shows v23.5.1

Even though Railway deployed V23.6.8, the browser is still loading old JavaScript because:

1. **Browser Cache:** Very aggressive caching
2. **CDN Cache:** If using Cloudflare or similar
3. **Service Worker:** May be caching old files

**Fix:**
1. Clear browser cache completely
2. Use incognito/private mode
3. Wait 5-10 minutes for CDN cache to expire
4. Check Network tab to see what version is actually being served

## Quick Diagnostic Script

**Copy and paste this into Browser DevTools Console:**

```javascript
(async function() {
  console.log('=== JWT MALFORMED DIAGNOSTIC ===\n');
  
  // 1. Check token
  const token = localStorage.getItem('np_owner_jwt');
  console.log('1. JWT Token:');
  if (!token) {
    console.log('   ❌ MISSING - Re-login required');
  } else {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('   ❌ MALFORMED - Token should have 3 parts');
      console.log('   Token preview:', token.substring(0, 50));
      console.log('   Parts found:', parts.length);
    } else {
      console.log('   ✅ Format looks valid');
      try {
        const payload = JSON.parse(atob(parts[1]));
        console.log('   User:', payload.email || payload.id);
        console.log('   Expires:', new Date(payload.exp * 1000).toLocaleString());
      } catch (e) {
        console.log('   ❌ Cannot decode:', e.message);
      }
    }
  }
  console.log('');
  
  // 2. Check device ID
  const device = localStorage.getItem('np_owner_device');
  console.log('2. Device ID:');
  console.log('   Value:', device || 'MISSING');
  console.log('');
  
  // 3. Check loaded scripts
  const scripts = Array.from(document.querySelectorAll('script[src*="owner-super-console"]'));
  console.log('3. Loaded Scripts:');
  scripts.forEach(s => {
    const version = s.src.match(/v=(\d+\.\d+\.\d+)/);
    console.log('   ', s.src.split('/').pop(), version ? `(${version[1]})` : '(no version)');
  });
  console.log('');
  
  // 4. Test token
  if (token && device) {
    try {
      const response = await fetch('/api/owner/auth-check', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Owner-Device': device,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      console.log('4. Auth Test:');
      console.log('   Status:', response.status);
      console.log('   Response:', data);
    } catch (e) {
      console.log('4. Auth Test: ERROR -', e.message);
    }
  } else {
    console.log('4. Auth Test: SKIPPED (missing token or device)');
  }
  console.log('');
  
  // 5. Recommendations
  console.log('5. Recommendations:');
  if (!token || token.split('.').length !== 3) {
    console.log('   ⚠️  Token is missing or malformed');
    console.log('   → Clear localStorage and re-login');
  }
  if (!device) {
    console.log('   ⚠️  Device ID missing');
    console.log('   → Re-login via /quick_login.html');
  }
  const hasOldVersion = scripts.some(s => s.src.includes('v=23.5.1'));
  if (hasOldVersion) {
    console.log('   ⚠️  Old JavaScript version loaded');
    console.log('   → Clear browser cache completely');
    console.log('   → Use incognito mode to test');
  }
})();
```

## Expected Fix Steps

1. **Clear localStorage** (run the clear script above)
2. **Clear browser cache** (hard refresh or clear all data)
3. **Re-login** via `/quick_login.html`
4. **Verify** token is valid (run diagnostic script)
5. **Test** owner console - should work now

## After Fix

**Expected Results:**
- ✅ Browser loads `owner-super-console.js?v=23.6.9`
- ✅ Token is valid JWT format (3 parts)
- ✅ `/api/owner/ops/status` → 200
- ✅ `/api/owner/pdfs` → 200 (if device ID matches)

---

**The "jwt malformed" error means the token in localStorage is corrupted. Clear it and re-login to get a fresh, valid token.**

