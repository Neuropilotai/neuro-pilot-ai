# Authentication System Migration Guide

**Version:** 1.0.0
**Status:** Ready to Deploy

---

## What Changed

Replaced scattered token management with centralized auth system:

**Before:**
```javascript
// Scattered throughout codebase
const token = sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken');
fetch('/api/endpoint', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**After:**
```javascript
// Centralized and automatic
import { get } from './lib/api.js';
const data = await get('/api/endpoint');
```

---

## Quick Start

### 1. Set Token on Login

```javascript
// In your login handler
import { setToken } from './lib/auth.js';

async function handleLogin(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const { token } = await response.json();
  setToken(token); // <-- Persist token

  // Redirect to dashboard
  window.location.href = '/owner-super-console.html';
}
```

### 2. Use API Wrapper for All Requests

```javascript
import { get, post, put, del } from './lib/api.js';

// GET request
const lowStock = await get('/inventory/low-stock');

// POST request
const newItem = await post('/items', {
  name: 'Widget',
  sku: 'WID-001',
  price: 9.99
});

// PUT request
const updated = await put('/items/123', { price: 10.99 });

// DELETE request
await del('/items/123');

// File upload
const formData = new FormData();
formData.append('file', fileInput.files[0]);
const result = await upload('/pdfs/import', formData);

// File download
const blob = await download('/pdfs/report.pdf');
const url = URL.createObjectURL(blob);
window.open(url);
```

### 3. Migrate Existing Fetch Calls

**Before:**
```javascript
function loadGFSInvoiceStats() {
  fetch('/api/owner/pdfs?vendor=GFS&period=FY26-P02', {
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
    }
  })
  .then(response => response.json())
  .then(data => {
    // Process data
  });
}
```

**After:**
```javascript
import { get } from './lib/api.js';

async function loadGFSInvoiceStats() {
  try {
    const data = await get('/api/owner/pdfs?vendor=GFS&period=FY26-P02');
    // Process data
  } catch (error) {
    console.error('Error loading GFS stats:', error);
  }
}
```

---

## API Reference

### Auth Module (`lib/auth.js`)

```javascript
import {
  setToken,
  getToken,
  getAuthHeader,
  isAuthenticated,
  getCurrentUser,
  logout
} from './lib/auth.js';

// Store token
setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

// Get token
const token = getToken(); // Returns string or null

// Get auth header
const headers = getAuthHeader(); // { Authorization: 'Bearer ...' } or {}

// Check authentication
if (isAuthenticated()) {
  console.log('User is logged in');
}

// Get current user
const user = getCurrentUser(); // { id, email, role } or null

// Logout
logout(); // Clears token and redirects to login
```

### API Module (`lib/api.js`)

```javascript
import { get, post, put, patch, del, upload, download } from './lib/api.js';

// All methods automatically include auth headers and handle errors

// GET
const data = await get('/endpoint');
const params = await get('/endpoint?foo=bar');

// POST
const created = await post('/endpoint', { name: 'Value' });

// PUT
const updated = await put('/endpoint/123', { name: 'New Value' });

// PATCH
const patched = await patch('/endpoint/123', { field: 'value' });

// DELETE
await del('/endpoint/123');

// File Upload (FormData)
const formData = new FormData();
formData.append('file', file);
const result = await upload('/upload', formData);

// File Download (Blob)
const blob = await download('/download/file.pdf');
const url = URL.createObjectURL(blob);
window.open(url);
```

---

## Migration Checklist

### Phase 1: Install New System (5 minutes)

- [x] Create `frontend/src/lib/auth.js`
- [x] Create `frontend/src/lib/api.js`
- [ ] Import modules in your main HTML or entry point:
  ```html
  <script type="module">
    import './src/lib/auth.js';
    import './src/lib/api.js';
  </script>
  ```

### Phase 2: Update Login Flow (10 minutes)

- [ ] Find login handler (e.g., `handleLogin` function)
- [ ] Add `import { setToken } from './lib/auth.js';`
- [ ] Call `setToken(responseToken)` after successful login
- [ ] Remove old `localStorage.setItem('ownerToken', ...)` calls

### Phase 3: Migrate Fetch Calls (30-60 minutes)

- [ ] Find all `fetch()` calls that need auth
- [ ] Replace with `import { get, post, ... } from './lib/api.js'`
- [ ] Remove manual `Authorization` header construction
- [ ] Test each migrated endpoint

**Quick Find Pattern:**
```bash
# Find all fetch calls with Authorization header
grep -r "Authorization.*Bearer" frontend/ | grep -v node_modules
```

### Phase 4: Testing (15 minutes)

- [ ] Test login flow - token should persist
- [ ] Test authenticated requests - should work automatically
- [ ] Test 401 handling - should logout and redirect
- [ ] Test 403 handling - should show error without logout
- [ ] Test expired token - should logout automatically

---

## One-Time Dev Setup (Manual Token)

For testing without going through login:

```javascript
// In browser console
localStorage.setItem('authToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
location.reload();
```

**Legacy token migration** (automatic):
```javascript
// If you have old token in 'ownerToken', it will auto-migrate on first load
// Old keys: sessionStorage.ownerToken, localStorage.ownerToken
// New key: localStorage.authToken
```

---

## Example: Complete Login Page

```html
<!DOCTYPE html>
<html>
<head>
  <title>Login</title>
</head>
<body>
  <form id="loginForm">
    <input type="email" id="email" placeholder="Email" required>
    <input type="password" id="password" placeholder="Password" required>
    <button type="submit">Login</button>
    <div id="error"></div>
  </form>

  <script type="module">
    import { setToken } from './src/lib/auth.js';
    import { post } from './src/lib/api.js';

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');

      try {
        // Login request (no auth header needed)
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
          throw new Error('Invalid credentials');
        }

        const { token } = await response.json();

        // Save token
        setToken(token);

        // Redirect to dashboard
        window.location.href = '/owner-super-console.html';
      } catch (error) {
        errorDiv.textContent = error.message;
      }
    });
  </script>
</body>
</html>
```

---

## Example: Updated GFS Invoice Stats

```javascript
// Before (owner-super-console.js line 9313)
function loadGFSInvoiceStats() {
  fetch('/api/owner/pdfs?vendor=GFS&period=FY26-P02', {
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
    }
  })
  .then(response => response.json())
  .then(data => {
    const docs = data.docs || [];
    // ... process data
  });
}

// After
import { get } from './lib/api.js';

async function loadGFSInvoiceStats() {
  try {
    const data = await get('/api/owner/pdfs?vendor=GFS&period=FY26-P02');
    const docs = data.data || []; // Note: API returns { success, data }

    const count = docs.length;
    const total = docs.reduce((sum, doc) => sum + (doc.amount || 0), 0);
    const lastUpload = docs.length > 0
      ? new Date(Math.max(...docs.map(d => new Date(d.createdAt)))).toLocaleString()
      : '--';

    document.getElementById('gfsCurrentPeriodCount').textContent = count;
    document.getElementById('gfsTotalAmount').textContent = `$${total.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    document.getElementById('gfsLastUpload').textContent = lastUpload;
  } catch (error) {
    console.error('Error loading GFS stats:', error);
    document.getElementById('gfsCurrentPeriodCount').textContent = '--';
    document.getElementById('gfsTotalAmount').textContent = '--';
    document.getElementById('gfsLastUpload').textContent = '--';
  }
}
```

---

## Troubleshooting

### "401 Unauthorized" on every request

**Cause:** Token not set or expired

**Fix:**
```javascript
// Check if token exists
console.log(localStorage.getItem('authToken'));

// If missing, set it manually (dev only)
localStorage.setItem('authToken', 'YOUR_TOKEN_HERE');

// Or login again
```

### "403 Forbidden" on specific endpoints

**Cause:** User role doesn't have permission

**Fix:**
- Check user role: `console.log(getCurrentUser())`
- Verify backend RBAC policies
- Ensure endpoint allows your role

### Token not persisting after login

**Cause:** Not calling `setToken()` after login

**Fix:**
```javascript
// After successful login
const { token } = await response.json();
setToken(token); // <-- Add this line
```

### Network errors

**Cause:** API server not running or wrong base URL

**Fix:**
```javascript
// Check API base URL
console.log(window.__api.baseUrl);

// Override if needed (vite.config.js or .env)
// VITE_API_URL=http://localhost:8083
```

---

## Future: Cookie-Based Auth (Optional)

For maximum security against XSS attacks, migrate to HttpOnly cookies:

### Backend Changes:

```javascript
// After login
res.cookie('access_token', jwt, {
  httpOnly: true,
  secure: true, // HTTPS only
  sameSite: 'lax',
  maxAge: 30 * 60 * 1000 // 30 minutes
});
res.json({ success: true });
```

### Frontend Changes:

```javascript
// Remove all token management from auth.js
// Keep only logout() function
// API wrapper automatically sends cookies with credentials: 'include'
```

**Benefits:**
- Token not accessible to JavaScript (XSS protection)
- Auto-expires server-side
- Works with refresh token pattern

---

## Support

- **Questions:** Open GitHub issue with `[auth]` tag
- **Bugs:** Report with browser console errors
- **Security:** Email security@neuropilot.ai

---

**Version:** 1.0.0
**Last Updated:** 2025-01-20
**Status:** Production-Ready ✅
