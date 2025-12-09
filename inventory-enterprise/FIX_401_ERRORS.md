# Fix 401 "Invalid or expired token" Errors

## 🔴 Problem

You're getting 401 errors with message: **"Invalid or expired token"**

This means the JWT token in your browser was signed with a **different `JWT_SECRET`** than what Railway is currently using.

## ✅ Solution

### Step 1: Set JWT_SECRET in Railway

1. Go to Railway Dashboard → Your Project → **Variables**
2. Click **"New Variable"**
3. **Name:** `JWT_SECRET`
4. **Value:** `f67249c6bf5d677d4ce2ce75605f6ecde651f8dc2766aacfcb0566b7ebefd4f59`
5. Click **"Add"**

### Step 2: Set OWNER_DEVICE_ID in Railway

1. Still in Variables tab → Click **"New Variable"** again
2. **Name:** `OWNER_DEVICE_ID`
3. **Value:** `owner-workstation-001` (must match what you have in localStorage)
4. Click **"Add"**

### Step 3: Wait for Railway Redeploy

- Railway will automatically redeploy (usually 1-2 minutes)
- Check Railway → Deploy Logs to confirm deployment completed
- Look for: "Starting Container" and "✓ Connected to database"

### Step 4: Clear Old Token and Re-Login

1. Visit: `/check-auth.html` or `/auth-debug.html`
2. Click **"Clear Auth Data"** button
3. This removes the old token from localStorage
4. Go to `/quick_login.html`
5. Login again with:
   - Email: `neuropilotai@gmail.com`
   - Password: Your password
   - Owner Device ID: `owner-workstation-001`
6. This creates a NEW token signed with the correct `JWT_SECRET`

### Step 5: Verify It Works

1. Visit `/check-auth.html`
2. Click **"Test All Owner Endpoints"**
3. All should return **HTTP 200** (not 401)

## 🎯 Why This Happens

- Your current JWT token was signed with a different `JWT_SECRET`
- Railway needs the **exact same secret** to validate tokens
- When `JWT_SECRET` doesn't match → Token validation fails → 401 error

## 📋 Checklist

- [ ] `JWT_SECRET` added to Railway (value: `f67249c6bf5d677d4ce2ce75605f6ecde651f8dc2766aacfcb0566b7ebefd4f59`)
- [ ] `OWNER_DEVICE_ID` added to Railway (value: `owner-workstation-001`)
- [ ] Railway redeployed successfully
- [ ] Cleared old auth data from localStorage
- [ ] Re-logged in via `/quick_login.html`
- [ ] Test endpoints return HTTP 200

## ⚠️ Important Notes

1. **JWT_SECRET must match exactly** - If you change it, all existing tokens become invalid
2. **OWNER_DEVICE_ID must match** - The value in Railway must match what you enter in login form
3. **Re-login required** - After setting `JWT_SECRET`, you MUST re-login to get a new token

## 🚨 Still Getting 401?

If you still get 401 after following all steps:

1. **Check Railway Logs:**
   - Railway → Deploy Logs
   - Look for errors about `JWT_SECRET` or `OWNER_DEVICE_ID`
   - Verify environment variables are loaded

2. **Verify Variables:**
   - Railway → Variables
   - Confirm both `JWT_SECRET` and `OWNER_DEVICE_ID` are present
   - Check for typos or extra spaces

3. **Test with cURL:**
   ```bash
   # Get new token from login
   TOKEN="your-new-token-from-login"
   DEVICE="owner-workstation-001"
   
   curl -H "Authorization: Bearer $TOKEN" \
        -H "X-Owner-Device: $DEVICE" \
        https://inventory-backend-production-3a2c.up.railway.app/api/owner/auth-check
   ```

