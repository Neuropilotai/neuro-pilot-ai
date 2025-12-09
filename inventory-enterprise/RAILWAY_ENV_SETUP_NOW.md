# Railway Environment Variables Setup - ACTION REQUIRED

## ⚠️ Missing Critical Variables

You need to add **2 critical environment variables** to Railway:

1. **`JWT_SECRET`** - Required for JWT token signing
2. **`OWNER_DEVICE_ID`** - Required for owner device binding

---

## Step-by-Step Instructions

### Step 1: Add JWT_SECRET

1. In Railway dashboard → Your Project → **Variables** tab
2. Click **"New Variable"** button
3. **Name:** `JWT_SECRET`
4. **Value:** Generate a secure random string (64+ characters)
   - You can use: `openssl rand -hex 32` (generates 64 character hex string)
   - Or use an online generator: https://randomkeygen.com/
   - Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
5. Click **"Add"**

### Step 2: Add OWNER_DEVICE_ID

1. Still in Railway → Variables tab
2. Click **"New Variable"** button again
3. **Name:** `OWNER_DEVICE_ID`
4. **Value:** Enter any secure string (this is your device identifier)
   - Examples:
     - `my-macbook-pro-2024`
     - `david-device-001`
     - `owner-workstation`
     - Or any string you prefer (no spaces recommended)
5. Click **"Add"**

### Step 3: Wait for Redeploy

- Railway will automatically redeploy when you add variables
- Wait for deployment to complete (check Deploy Logs)
- Usually takes 1-2 minutes

### Step 4: Test Login

1. Visit: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
2. Enter:
   - Email: `neuropilotai@gmail.com`
   - Password: Your password
   - Owner Device ID: **The exact value you set for `OWNER_DEVICE_ID`**
3. Click "Login & Go to Console"

---

## Quick Command to Generate JWT_SECRET

If you have `openssl` installed:

```bash
openssl rand -hex 32
```

This generates a 64-character hex string perfect for `JWT_SECRET`.

---

## Verification Checklist

After adding variables:

- [ ] `JWT_SECRET` is in Railway variables (hidden/masked)
- [ ] `OWNER_DEVICE_ID` is in Railway variables (visible)
- [ ] Railway has redeployed successfully
- [ ] You can login via `/quick_login.html`
- [ ] Owner console works without 401 errors

---

## Important Notes

⚠️ **JWT_SECRET:**
- Must be 64+ characters for security
- Keep it secret (never commit to git)
- If you change it, all existing tokens become invalid

⚠️ **OWNER_DEVICE_ID:**
- Can be any string you choose
- Must match what you enter in the login form
- If you change it, you'll need to re-login with the new value

---

## Current Status

**Missing Variables:**
- ❌ `JWT_SECRET` - **CRITICAL** - Add this first!
- ❌ `OWNER_DEVICE_ID` - **REQUIRED** - Add this second!

**Existing Variables (Good!):**
- ✅ `DATABASE_URL` - Already set
- ✅ `NODE_ENV` - Already set
- ✅ Various GDRIVE/GFS variables - Already set

---

## Need Help?

If you're not sure what value to use:

**JWT_SECRET:** Use this command:
```bash
openssl rand -hex 32
```

**OWNER_DEVICE_ID:** Use something simple like:
```
my-device-001
```

Then use that exact value in the login form!

