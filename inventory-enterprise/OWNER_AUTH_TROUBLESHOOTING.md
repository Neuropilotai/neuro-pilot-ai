# Owner Console Authentication Troubleshooting Guide

## ✅ Current Status

**All routes are correctly registered and working:**
- ✅ Health endpoint: Working
- ✅ quick_login.html: Accessible
- ✅ Auth endpoint: Working
- ✅ Owner reports endpoint: Registered (returns 401 without auth)
- ✅ Owner ops endpoint: Registered (returns 401 without auth)

**The 401 errors you're seeing are EXPECTED** - they mean the routes are working, but authentication is required.

## 🔍 Diagnostic Tools

### 1. Deployment Verification Script
```bash
./scripts/verify-railway-deployment.sh
```
This checks if all routes are registered correctly (should return 401, not 404).

### 2. Auth Debug Page
Visit: **`/auth-debug.html`**

This page will:
- Show your current localStorage authentication state
- Test authentication endpoints
- Test owner API endpoints
- Provide quick actions to login or clear auth

### 3. Automated Test Script
```bash
export OWNER_DEVICE_ID='your-device-id'
./scripts/test-owner-auth.sh
```

## 🚨 Common Issues & Solutions

### Issue: 401 Unauthorized on Owner Endpoints

**Cause:** Missing or invalid authentication headers.

**Solution:**
1. Visit `/quick_login.html`
2. Login with owner credentials
3. Verify localStorage contains:
   - `np_owner_jwt` (JWT token)
   - `np_owner_device` (device ID)
4. Hard refresh the owner console: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Issue: 404 Not Found on `/api/owner/reports/finance`

**Cause:** Route not registered in the server file Railway is using.

**Status:** ✅ **FIXED** - Route is now registered in `server-v21_1.js`

**Verification:**
- Run `./scripts/verify-railway-deployment.sh`
- Should see: "✅ Owner reports endpoint exists (HTTP 401 - auth required)"

### Issue: Authentication Not Persisting

**Possible Causes:**
1. Browser blocking localStorage
2. Incognito/private mode
3. localStorage cleared by browser

**Solution:**
1. Use a regular browser window (not incognito)
2. Check browser settings for localStorage permissions
3. Use `/auth-debug.html` to verify localStorage state

### Issue: Device ID Mismatch

**Cause:** `OWNER_DEVICE_ID` in Railway doesn't match what you enter in login.

**Solution:**
1. Check Railway dashboard → Settings → Variables
2. Verify `OWNER_DEVICE_ID` matches what you use in login
3. Re-login with the correct device ID

## 📋 Step-by-Step Verification

### Step 1: Verify Deployment
```bash
./scripts/verify-railway-deployment.sh
```
Expected: All endpoints return 401 (not 404).

### Step 2: Check Authentication State
1. Visit: `https://inventory-backend-production-3a2c.up.railway.app/auth-debug.html`
2. Review localStorage status
3. If missing, go to `/quick_login.html` and login

### Step 3: Test Authentication
1. In `/auth-debug.html`, click "Test Auth Endpoint"
2. Should see: "✅ Auth check passed!"

### Step 4: Test Owner Endpoints
1. In `/auth-debug.html`, click "Test All Owner Endpoints"
2. All should return HTTP 200

### Step 5: Use Owner Console
1. Visit `/owner-super-console-v15.html`
2. Open browser DevTools → Network tab
3. Verify API calls include:
   - `Authorization: Bearer <token>`
   - `X-Owner-Device: <device-id>`
4. All API calls should return 200 (not 401)

## 🔧 Railway Environment Variables

Ensure these are set in Railway dashboard:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ Yes | Secret key for JWT signing (64+ characters) |
| `OWNER_DEVICE_ID` | ✅ Yes | Device ID that matches login form |
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string (Railway provides) |

## 📞 Quick Reference

**Production URL:** `https://inventory-backend-production-3a2c.up.railway.app`

**Key Pages:**
- Login: `/quick_login.html`
- Owner Console: `/owner-super-console-v15.html`
- Auth Debug: `/auth-debug.html`

**Key Endpoints:**
- Health: `/health`
- Auth Check: `/api/owner/auth-check`
- Ops Status: `/api/owner/ops/status`
- Finance Report: `/api/owner/reports/finance`

## 🎯 Success Criteria

You'll know everything is working when:
1. ✅ `/verify-railway-deployment.sh` shows all routes registered
2. ✅ `/auth-debug.html` shows JWT and device ID present
3. ✅ `/auth-debug.html` test endpoints all return 200
4. ✅ Owner console loads without 401 errors in Network tab
5. ✅ All owner API calls include proper headers

## 🆘 Still Having Issues?

1. **Check Railway Logs:**
   - Railway dashboard → Deploy Logs
   - Look for: `[STARTUP] ✓ owner-reports loaded`
   - Look for: `[STARTUP] ✓ owner-ops loaded`

2. **Verify Code is Deployed:**
   - Check Railway → Deploy Logs for latest commit hash
   - Compare with your local `git log`

3. **Clear Browser State:**
   - Clear localStorage
   - Hard refresh: `Cmd+Shift+R`
   - Re-login via `/quick_login.html`

4. **Test with cURL:**
   ```bash
   # Get token from login
   TOKEN="your-jwt-token"
   DEVICE="your-device-id"
   
   curl -H "Authorization: Bearer $TOKEN" \
        -H "X-Owner-Device: $DEVICE" \
        https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status
   ```

