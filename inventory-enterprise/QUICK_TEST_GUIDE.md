# Quick Test Guide - Owner Authentication

## Automated Test Script

Run the test script to verify authentication:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Set your device ID (must match Railway OWNER_DEVICE_ID)
export OWNER_DEVICE_ID="your-device-id-here"

# Run test
./scripts/test-owner-auth.sh
```

Or with explicit parameters:
```bash
./scripts/test-owner-auth.sh neuropilotai@gmail.com Admin123!@# your-device-id
```

## Manual Browser Test

1. **Clear cache:** Hard refresh (`Cmd+Shift+R` or `Ctrl+Shift+R`)

2. **Login:**
   - Visit: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
   - Email: `neuropilotai@gmail.com`
   - Password: `Admin123!@#`
   - Device ID: (must match Railway `OWNER_DEVICE_ID`)

3. **Verify localStorage:**
   - Open DevTools → Application → Local Storage
   - Check for:
     - `np_owner_jwt` (should be a long JWT token)
     - `np_owner_device` (should match your device ID)

4. **Test endpoints in browser console:**
```javascript
// Get token and device from localStorage
const token = localStorage.getItem('np_owner_jwt');
const device = localStorage.getItem('np_owner_device');

// Test auth-check
fetch('/api/owner/auth-check', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Owner-Device': device
  }
}).then(r => r.json()).then(console.log);

// Test finance endpoint
fetch('/api/owner/reports/finance', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Owner-Device': device
  }
}).then(r => r.json()).then(console.log);
```

## Expected Results

### Auth-Check Response
```json
{
  "success": true,
  "authenticated": true,
  "user": {
    "id": "admin-1",
    "email": "neuropilotai@gmail.com",
    "role": "owner",
    "org_id": "default-org"
  },
  "headers": {
    "hasAuth": true,
    "hasDevice": true
  }
}
```

### Finance Endpoint Response
```json
{
  "success": true,
  "report": {
    "timestamp": "...",
    "reportType": "finance",
    "period": { "month": 12, "year": 2025 },
    "countsThisMonth": { ... },
    "pdfsInCounts": { ... },
    "currentInventoryValue": { ... },
    "varianceIndicators": { ... },
    "recentClosedCounts": [ ... ]
  }
}
```

## Troubleshooting

### 401 Unauthorized
- **Token missing:** Re-login via `/quick_login.html`
- **Token expired:** Tokens expire after 15 minutes, re-login
- **Wrong device ID:** Must match Railway `OWNER_DEVICE_ID` exactly
- **Token doesn't have owner role:** Verify JWT at jwt.io, should have `role: "owner"`

### 404 Not Found
- **Route not deployed:** Check Railway logs for `[STARTUP] ✓ owner-reports loaded`
- **Wrong server file:** Railway uses `server-v21_1.js`, not `server.js`
- **Cache issue:** Hard refresh browser

### Headers Not Sent
- **Fetch patch not loaded:** Hard refresh to get latest JS
- **Absolute URL issue:** Fetch patch should handle both relative and absolute URLs
- **Check Network tab:** Verify `Authorization` and `X-Owner-Device` headers are present

