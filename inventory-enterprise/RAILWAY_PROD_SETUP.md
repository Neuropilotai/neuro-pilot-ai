# Railway Production Setup - Owner Console

**Production Backend:** `https://inventory-backend-production-3a2c.up.railway.app`  
**Status:** ✅ Railway is the ONLY production backend

---

## Required Environment Variables

Set these in Railway dashboard → Your Service → Variables:

### Critical (Required)
- `JWT_SECRET` - Secret for JWT token signing (generate: `openssl rand -hex 64`)
- `OWNER_DEVICE_ID` - Device ID for owner console access (set a secure random string)
- `DATABASE_URL` - PostgreSQL connection string (Railway provides this automatically)

### Optional (Recommended)
- `SMTP_SERVER` - SMTP hostname (e.g., `smtp.gmail.com`)
- `SMTP_PORT` - SMTP port (e.g., `587`)
- `SMTP_USERNAME` - SMTP username
- `SMTP_PASSWORD` - SMTP app password
- `REORDER_WEBHOOK_URL` - Webhook URL for reorder alerts

---

## Deployment Steps

1. **Push latest code to branch:**
   ```bash
   git push origin feat/waste-inventory-sync
   ```

2. **In Railway Dashboard:**
   - Go to your backend service
   - Set branch to `feat/waste-inventory-sync` (or `main` if merged)
   - Click "Deploy" or wait for auto-deploy

3. **Verify env vars are set:**
   - Railway Dashboard → Service → Variables
   - Ensure all critical vars are present

4. **Check deployment logs:**
   - Railway Dashboard → Service → Deployments → Latest
   - Verify build succeeds and server starts

---

## Owner Console Access

### Quick Login Page
- URL: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
- Login with owner credentials
- Enter `OWNER_DEVICE_ID` value in "Owner Device ID" field
- On success, redirects to owner console

### Owner Console
- URL: `https://inventory-backend-production-3a2c.up.railway.app/owner-super-console-v15.html`
- Automatically uses JWT + device ID from localStorage
- All `/api/owner/*` calls include:
  - `Authorization: Bearer <token>`
  - `X-Owner-Device: <device_id>`

---

## Smoke Tests

### 1. Login (Get JWT)
```bash
TOKEN=$(curl -s -X POST https://inventory-backend-production-3a2c.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

echo "Token: ${TOKEN:0:20}..."
```

### 2. Owner Ops Status
```bash
DEVICE_ID="<your-OWNER_DEVICE_ID-value>"

curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID"
```

**Expected:** 200 OK with status JSON

### 3. Finance Report
```bash
curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/reports/finance \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID"
```

**Expected:** 200 OK with finance data (stub if DB schema not finalized)

### 4. Browser Test
1. Open: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
2. Enter email, password, and device ID
3. Click "Login & Go to Console"
4. Should redirect to owner console
5. Open DevTools → Network tab
6. Verify `/api/owner/ops/status` and `/api/owner/reports/finance` return 200
7. Check request headers include `Authorization` and `X-Owner-Device`

---

## Troubleshooting

### 401 Unauthorized
- Check `JWT_SECRET` is set in Railway
- Verify token is valid (not expired)
- Ensure `X-Owner-Device` header matches `OWNER_DEVICE_ID` env var

### 403 Forbidden (Device ID Mismatch)
- Verify `OWNER_DEVICE_ID` is set in Railway
- Ensure `X-Owner-Device` header value matches exactly
- Check quick_login.html stored the correct device ID in localStorage

### 404 Not Found (quick_login.html)
- Verify deployment includes `backend/public/quick_login.html`
- Check Railway build logs for file inclusion
- Ensure static serving is configured in `server.js`

### 500 Server Error
- Check Railway logs for startup errors
- Verify all required env vars are set
- Ensure database connection is working

---

## Fly.io Status (Staging/Legacy Only)

**⚠️ IMPORTANT:** Fly.io apps are for staging/testing only. Do NOT use for production.

- `neuro-pilot-inventory` - Staging app (if configured)
- `neuro-pilot-inventory-staging` - Staging app (if configured)
- `backend-silent-mountain-3362` - Legacy/old backend (deprecated)

**Production is ONLY on Railway.**

---

## Security Notes

- Owner routes require both JWT authentication AND device ID verification
- Device ID is checked against `OWNER_DEVICE_ID` env var
- All owner API calls must include `X-Owner-Device` header
- Missing or invalid device ID results in 403 Forbidden

---

**Last Updated:** 2025-12-08  
**Branch:** `feat/waste-inventory-sync`

