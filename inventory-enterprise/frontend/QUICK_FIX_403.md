# Quick Fix: 403 Forbidden Error

**Problem:** GFS Invoice Stats shows 403 Forbidden
**Cause:** Token not in browser storage
**Time to Fix:** 30 seconds

---

## Immediate Fix (Browser Console)

### Option 1: Set Token Manually

1. Open browser console (`Cmd+Option+J` on Mac, `F12` on Windows)
2. Paste this code:

```javascript
// Set owner token in localStorage
localStorage.setItem('ownerToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLTEiLCJlbWFpbCI6Im5ldXJvcGlsb3RhaUBnbWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NjA4OTc5MDIsImV4cCI6MTc5MjQzMzkwMn0.0FLDfmMFhT9hFYZRhCPTIZWF1w9btghdhfh6vaOIby4');

// Reload GFS stats
if (typeof loadGFSInvoiceStats === 'function') {
  loadGFSInvoiceStats();
} else {
  location.reload();
}

console.log('✅ Token set - refresh the page');
```

3. The 403 error should disappear immediately

---

### Option 2: Use New Auth System (Recommended)

1. Open browser console
2. Paste this code:

```javascript
// Load auth module and set token
import('./src/lib/auth.js').then(auth => {
  auth.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLTEiLCJlbWFpbCI6Im5ldXJvcGlsb3RhaUBnbWFpbC5jb20iLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NjA4OTc5MDIsImV4cCI6MTc5MjQzMzkwMn0.0FLDfmMFhT9hFYZRhCPTIZWF1w9btghdhfh6vaOIby4');
  console.log('✅ Token set with new auth system');
  console.log('👤 Current user:', auth.getCurrentUser());
  location.reload();
});
```

---

## Verify Fix

After setting the token, verify it works:

```javascript
// Check token is stored
console.log('Token:', localStorage.getItem('ownerToken') || localStorage.getItem('authToken'));

// Test the API call
fetch('/api/owner/pdfs?vendor=GFS&period=FY26-P02', {
  headers: {
    'Authorization': 'Bearer ' + (localStorage.getItem('ownerToken') || localStorage.getItem('authToken'))
  }
})
.then(r => r.json())
.then(data => console.log('✅ API works:', data))
.catch(err => console.error('❌ Still broken:', err));
```

**Expected output:**
```
✅ API works: { success: true, data: [...] }
```

---

## Why This Happened

The frontend code on **line 9317** of `owner-super-console.js` reads:

```javascript
'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
```

But the token was never stored in `localStorage` or `sessionStorage`, so the header was:

```
Authorization: Bearer null
```

Which the backend correctly rejects as 403 Forbidden.

---

## Permanent Fix

Migrate to the new centralized auth system:

1. Read [`AUTH_MIGRATION_GUIDE.md`](./AUTH_MIGRATION_GUIDE.md)
2. Update login flow to call `setToken()` after successful login
3. Migrate all fetch calls to use `import { get, post } from './lib/api.js'`
4. Tokens will persist automatically

---

## Quick Commands Reference

```javascript
// Check authentication status
console.log('Authenticated:', !!localStorage.getItem('ownerToken'));

// View token payload (decoded)
function decodeJWT(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}
console.log(decodeJWT(localStorage.getItem('ownerToken')));

// Clear token (logout)
localStorage.removeItem('ownerToken');
localStorage.removeItem('authToken');
location.reload();
```

---

**Status:** Fixed ✅
**Next Step:** Migrate to [`AUTH_MIGRATION_GUIDE.md`](./AUTH_MIGRATION_GUIDE.md)
