# Owner Console - Quick Reference Card

## 🚀 Production URLs

- **Base URL:** `https://inventory-backend-production-3a2c.up.railway.app`
- **Login:** `/quick_login.html`
- **Owner Console:** `/owner-super-console-v15.html`
- **Auth Debug:** `/auth-debug.html`

## 🔑 Required Railway Env Vars

```
JWT_SECRET          (64+ characters)
OWNER_DEVICE_ID     (must match login form)
DATABASE_URL        (Railway provides)
```

## ✅ Quick Verification

```bash
# 1. Check deployment
./scripts/verify-railway-deployment.sh

# 2. Test authentication
export OWNER_DEVICE_ID='your-device-id'
./scripts/test-owner-auth.sh
```

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 errors | Login via `/quick_login.html` |
| 404 errors | Run `./scripts/verify-railway-deployment.sh` |
| Headers missing | Hard refresh: `Cmd+Shift+R` |
| Session expired | Re-login via `/quick_login.html` |

## 📋 Test Flow

1. Visit `/quick_login.html`
2. Login with owner credentials
3. Verify localStorage has `np_owner_jwt` and `np_owner_device`
4. Visit `/owner-super-console-v15.html`
5. Check DevTools → Network tab for 200 responses

## 🎯 Success Indicators

- ✅ `/auth-debug.html` shows JWT + device present
- ✅ All owner endpoints return 200 (not 401)
- ✅ Owner console loads without errors
- ✅ API calls include `Authorization` and `X-Owner-Device` headers

---

**Full Documentation:** See `OWNER_CONSOLE_FINAL_STATUS.md` and `OWNER_AUTH_TROUBLESHOOTING.md`

