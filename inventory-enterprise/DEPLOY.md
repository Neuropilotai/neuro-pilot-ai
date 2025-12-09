# DEPLOYMENT GUIDE (Railway Prod + Optional Fly Staging)

## Production (Railway)
- Prod API host: `https://inventory-backend-production-3a2c.up.railway.app`
- Branch to deploy: `feat/waste-inventory-sync` (or main once merged).
- Set env vars in Railway (Project → Variables):
  - `JWT_SECRET` (required)
  - `OWNER_DEVICE_ID` (required)
  - `DATABASE_URL` (required)
  - Optional: `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `REORDER_WEBHOOK_URL`
  - Any existing app vars already used by the service
- Deploy via Railway dashboard: trigger deploy for the backend service.
- Smoke tests (replace `$TOKEN`/`$DEVICE_ID`):
  ```bash
  # login
  TOKEN=$(curl -s -X POST https://inventory-backend-production-3a2c.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}' | jq -r '.accessToken')

  # owner ops
  curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/ops/status \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Owner-Device: $DEVICE_ID"

  # finance report
  curl -i https://inventory-backend-production-3a2c.up.railway.app/api/owner/reports/finance \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Owner-Device: $DEVICE_ID"
  ```
- Browser flow:
  1) Open `https://inventory-backend-production-3a2c.up.railway.app/quick_login.html`
  2) Login (email/password/device ID) → redirected to `owner-super-console-v15.html`
  3) In DevTools Network, confirm `/api/owner/ops/status` and `/api/owner/reports/finance` return 200 with Authorization + X-Owner-Device headers.

## Optional Staging (Fly.io)
- Treat Fly apps as staging/legacy only. Do **not** use for prod:
  - `neuro-pilot-inventory` (staging candidate)
  - `neuro-pilot-inventory-staging` (staging)
  - `backend-silent-mountain-3362` (legacy/old)
- If using Fly for staging, ensure separate DB and env vars (no prod secrets).
- Mark in dashboard/notes: “Fly = staging only; prod is Railway.”

## Env Templates
- `config/env.example` (base dev template)
- `config/env.prod.example` (Railway-oriented template)
- Critical required vars:
  - `JWT_SECRET`
  - `OWNER_DEVICE_ID`
  - `DATABASE_URL`

## Owner Console Notes
- Static served from `backend/public`; explicit route `/quick_login.html`.
- quick_login: posts to `/api/auth/login`, stores `np_owner_jwt` + `np_owner_device`, then redirects to owner console.
- owner console JS auto-attaches `Authorization` + `X-Owner-Device` to `/api/owner/*` requests; 401 triggers redirect to quick login.

## Health / Checks
- `/api/health` (general health)
- Owner endpoints (with JWT + device):
  - `/api/owner/ops/status`
  - `/api/owner/reports/finance`

