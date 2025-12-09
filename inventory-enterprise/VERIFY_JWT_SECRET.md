# Verify JWT_SECRET Configuration

## 🔍 The Problem

Your token was signed with a **different `JWT_SECRET`** than what Railway is currently using. This causes "Invalid or expired token" errors.

## ✅ The Solution

You have **two options**:

### Option 1: Re-login (Recommended)

1. **Clear old token:**
   - Visit `/check-auth.html` or `/auth-debug.html`
   - Click **"Clear Auth Data"**

2. **Re-login:**
   - Go to `/quick_login.html`
   - Login with:
     - Email: `neuropilotai@gmail.com`
     - Password: Your password
     - Device ID: `owner-workstation-001`
   - This creates a **NEW token** signed with the current Railway `JWT_SECRET`

3. **Test:**
   - Visit `/check-auth.html`
   - Click "Test All Owner Endpoints"
   - Should return HTTP 200

### Option 2: Match Railway to Token Secret

If you know what secret was used to sign your current token:

1. **Find the old secret** (check previous Railway deployments, local `.env`, etc.)
2. **Set that value in Railway:**
   - Railway → Variables → `JWT_SECRET`
   - Update to match the old secret
3. **Wait for redeploy**
4. **Test** - your current token should work

## 🔧 Verification Steps

### Step 1: Check Railway Variables

Railway → Variables should have:
- ✅ `JWT_SECRET` = `f67249c6bf5d677d4ce2ce75605f6ecde651f8dc2766aacfcb0566b7ebefd4f59` (or your chosen value)
- ✅ `OWNER_DEVICE_ID` = `owner-workstation-001`

### Step 2: Verify Server is Reading Variables

Check Railway → Deploy Logs for:
- No errors about missing `JWT_SECRET`
- Server started successfully

### Step 3: Clear and Re-login

**This is the critical step!** Your current token was signed with a different secret.

1. Clear localStorage: `/check-auth.html` → "Clear Auth Data"
2. Re-login: `/quick_login.html`
3. New token will be signed with Railway's `JWT_SECRET`

### Step 4: Test Authentication

Visit `/check-auth.html` → "Test All Owner Endpoints"

Expected: All return **HTTP 200** ✅

## 🎯 Why This Happens

```
Old Token (in browser):
  Signed with: Secret A
  Stored in: localStorage

Railway Server:
  Using: Secret B (newly set)
  
Result: Token validation fails → 401 error
```

**Solution:** Get a new token signed with Secret B (re-login)

## 📋 Quick Checklist

- [ ] `JWT_SECRET` set in Railway
- [ ] `OWNER_DEVICE_ID` set in Railway  
- [ ] Railway redeployed successfully
- [ ] **Cleared old token from localStorage**
- [ ] **Re-logged in via `/quick_login.html`**
- [ ] Test endpoints return HTTP 200

## ⚠️ Important

**You MUST re-login after changing `JWT_SECRET` in Railway!**

Old tokens won't work with the new secret. This is by design for security.

