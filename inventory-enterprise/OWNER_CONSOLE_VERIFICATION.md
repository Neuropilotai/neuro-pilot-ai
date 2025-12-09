# Owner Console Verification Checklist

**Date:** 2025-12-08  
**Production:** Railway (`inventory-backend-production-3a2c.up.railway.app`)

---

## Pre-Deployment Checks

### Environment Variables (Railway Dashboard)
- [ ] `JWT_SECRET` is set (required)
- [ ] `OWNER_DEVICE_ID` is set (required) - use this value in quick_login.html
- [ ] `DATABASE_URL` is set (Railway auto-provides)
- [ ] `SMTP_SERVER` (optional, for email notifications)
- [ ] `SMTP_PORT` (optional)
- [ ] `SMTP_USERNAME` (optional)
- [ ] `SMTP_PASSWORD` (optional)
- [ ] `REORDER_WEBHOOK_URL` (optional)

### Code Verification
- [ ] `backend/server.js` has env validation (exits if critical vars missing)
- [ ] `backend/middleware/deviceBinding.js` checks `X-Owner-Device` header
- [ ] `backend/public/quick_login.html` exists and stores JWT + device ID
- [ ] `backend/public/js/owner-super-console.js` patches fetch for owner routes
- [ ] `backend/routes/owner-reports.js` has `/finance` endpoint
- [ ] All owner routes mounted with `authenticateToken + requireOwnerDevice`

---

## Post-Deployment Tests

### 1. Quick Login Page (Browser)
- [ ] Open: `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
- [ ] Page loads without 404
- [ ] Form displays: email, password, device ID fields
- [ ] Enter credentials:
  - Email: `neuropilotai@gmail.com`
  - Password: `Admin123!@#`
  - Device ID: `<your-OWNER_DEVICE_ID-value>`
- [ ] Click "Login & Go to Console"
- [ ] Success: Redirects to `owner-super-console-v15.html`
- [ ] Check localStorage:
  - `np_owner_jwt` exists
  - `np_owner_device` exists and matches entered value

### 2. Owner Console (Browser)
- [ ] Console page loads
- [ ] Open DevTools → Network tab
- [ ] Verify console makes API calls to `/api/owner/*`
- [ ] Check request headers include:
  - `Authorization: Bearer <token>`
  - `X-Owner-Device: <device-id>`
- [ ] Verify responses are 200 OK (not 401/403)

### 3. API Endpoint Tests (cURL)

#### Login
```bash
TOKEN=$(curl -s -X POST https://inventory-backend-production-3a2c.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

echo "Token: ${TOKEN:0:20}..."
```
- [ ] Token is received (not null/empty)

#### Owner Ops Status
```bash
DEVICE_ID="<your-OWNER_DEVICE_ID-value>"

curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID"
```
- [ ] Returns 200 OK
- [ ] Response includes `"success": true`
- [ ] Response includes status/health data

#### Finance Report
```bash
curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/reports/finance \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID"
```
- [ ] Returns 200 OK
- [ ] Response includes `"status": "ok"`
- [ ] Response includes `"range": "last_30_days"`

#### PDFs Endpoint
```bash
curl -i "https://inventory-backend-production-3a2c.up.railway.app/api/owner/pdfs?vendor=GFS&period=FY26-P02" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: $DEVICE_ID"
```
- [ ] Returns 200 OK (or appropriate response, not 401/403)

### 4. Error Handling Tests

#### Missing Device Header
```bash
curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
  -H "Authorization: Bearer $TOKEN"
```
- [ ] Returns 401 Unauthorized
- [ ] Error message mentions `X-Owner-Device` header required

#### Invalid Device ID
```bash
curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Owner-Device: wrong-device-id"
```
- [ ] Returns 403 Forbidden
- [ ] Error message mentions device ID mismatch

#### Missing/Invalid JWT
```bash
curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
  -H "X-Owner-Device: $DEVICE_ID"
```
- [ ] Returns 401 Unauthorized
- [ ] Error message mentions authentication required

---

## Success Criteria

✅ All pre-deployment checks pass  
✅ Quick login page works and redirects correctly  
✅ Owner console loads and makes authenticated API calls  
✅ All owner endpoints return 200 with proper headers  
✅ Error handling returns appropriate 401/403 responses  
✅ No 404 errors on owner routes or static files

---

## Troubleshooting

### Issue: 401 on all owner endpoints
**Solution:** Check `JWT_SECRET` is set in Railway and token is valid

### Issue: 403 on owner endpoints (device mismatch)
**Solution:** Verify `OWNER_DEVICE_ID` in Railway matches value used in `X-Owner-Device` header

### Issue: 404 on quick_login.html
**Solution:** Verify deployment includes `backend/public/quick_login.html` and static serving is configured

### Issue: Owner console shows 401 errors
**Solution:** Check localStorage has `np_owner_jwt` and `np_owner_device` set correctly

### Issue: Server crashes on startup
**Solution:** Check Railway logs for missing env vars (should show clear error message)

---

**Last Updated:** 2025-12-08

