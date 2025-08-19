# 🚀 Pre-Deploy Checklist

## ✅ Prerequisites

### 1. Generate Admin Password Hash
```bash
# Replace 'YOUR-SECURE-ADMIN-PASSWORD' with your actual password
node -e "require('bcrypt').hash('YOUR-SECURE-ADMIN-PASSWORD', 12).then(h=>console.log('ADMIN_HASH=' + h))"
```
**Copy the output hash for step 3**

### 2. Create Fly Volume (One-Time)
```bash
fly volumes create data --size 10 --region yul
```

### 3. Set Production Secrets
```bash
# Paste your ADMIN_HASH from step 1
fly secrets set \
  NODE_ENV=production \
  ALLOWED_ORIGINS="https://inventory.neuropilot.ai" \
  ADMIN_EMAIL="admin@secure-inventory.com" \
  ADMIN_HASH="$2b$12$PASTE_YOUR_HASH_HERE" \
  JWT_SECRET="$(openssl rand -hex 64)" \
  REFRESH_SECRET="$(openssl rand -hex 64)" \
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

### 4. Verify Domain Configuration
- [ ] `inventory.neuropilot.ai` CNAME points to Fly.io
- [ ] Cloudflare DNS is orange-clouded (proxied)
- [ ] SSL/TLS mode: Full (Strict)

## 🚀 Deploy
```bash
fly deploy
```

## 🧪 Post-Deploy Verification

Run each test and verify expected results:

### A. Secure Login (Expect: 200 + HttpOnly Cookie)
```bash
curl -i -X POST https://inventory.neuropilot.ai/auth/login \
  -H 'Origin: https://inventory.neuropilot.ai' \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@secure-inventory.com","password":"YOUR-ADMIN-PASSWORD"}'
```
**Expected**: `Set-Cookie: rt=...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh`

### B. Origin Blocking (Expect: 403 Forbidden)
```bash
curl -i -X POST https://inventory.neuropilot.ai/auth/login \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  --data '{"email":"x","password":"y"}'
```

### C. Security Headers (Expect: CSP + HSTS)
```bash
curl -I https://inventory.neuropilot.ai | egrep 'strict-transport|content-security'
```

### D. Rate Limiting (Expect: 429 after 3 attempts)
```bash
for i in {1..5}; do 
  echo "Attempt $i:"
  curl -w "Status: %{http_code}\n" -X POST https://inventory.neuropilot.ai/auth/login \
    -H 'Origin: https://inventory.neuropilot.ai' \
    -H 'Content-Type: application/json' \
    --data '{"email":"admin@secure-inventory.com","password":"wrong"}'
  echo "---"
done
```

### E. Refresh Token Rotation Test
1. **Login** → Copy `rt=` cookie value
2. **First Refresh** → Should return new token + new cookie
3. **Reuse Old Token** → Should return 401 + revoke family

```bash
# Step 1: Login and save cookie
REFRESH_TOKEN=$(curl -s -X POST https://inventory.neuropilot.ai/auth/login \
  -H 'Origin: https://inventory.neuropilot.ai' \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@secure-inventory.com","password":"YOUR-ADMIN-PASSWORD"}' \
  | grep -o 'rt=[^;]*' | cut -d= -f2)

# Step 2: First refresh (should work)
curl -i -X POST https://inventory.neuropilot.ai/auth/refresh \
  -H 'Origin: https://inventory.neuropilot.ai' \
  --cookie "rt=$REFRESH_TOKEN"

# Step 3: Reuse old token (should fail with 401)
curl -i -X POST https://inventory.neuropilot.ai/auth/refresh \
  -H 'Origin: https://inventory.neuropilot.ai' \
  --cookie "rt=$REFRESH_TOKEN"
```

## 🔭 Observability Setup

### 1. Enable Structured Logging
Add to your application:
```javascript
function logAuth(event, data) {
  console.log(JSON.stringify({
    evt: `auth.${event}`,
    ...data,
    at: new Date().toISOString()
  }));
}
```

### 2. Monitor Critical Events
- Login failures > 5 per 10 minutes
- Any refresh token reuse
- 5xx error rate > 1%

### 3. Backup Setup
```bash
# Weekly volume backup
fly ssh console -C "tar -czf - /data" > backup-$(date +%Y%m%d).tar.gz
rclone copy backup-*.tar.gz gdrive:backups/neuro-pilot-inventory/
```

## 🛡️ Cloudflare Edge Hardening

### Security Rules to Add:
1. **Block Non-Allowed Origins**
   - Expression: `(http.request.method in {"POST" "PUT" "DELETE"}) and (http.request.headers["origin"] != "https://inventory.neuropilot.ai")`
   - Action: Block

2. **Rate Limit Login**
   - Path: `/auth/login`
   - Limit: 3 requests per 15 minutes per IP

3. **Rate Limit Refresh**  
   - Path: `/auth/refresh`
   - Limit: 20 requests per 15 minutes per IP

4. **Bot Protection**
   - Expression: `http.request.uri.path contains "/auth/" and not cf.client.bot`
   - Action: JS Challenge

### SSL/TLS Settings:
- [ ] SSL Mode: Full (Strict)
- [ ] HSTS: Enabled with preload
- [ ] Min TLS: 1.2
- [ ] TLS 1.3: Enabled

## ✅ Success Criteria

- [ ] Login returns secure cookie with proper flags
- [ ] Refresh token rotation works correctly
- [ ] Old token reuse is detected and blocked (401)
- [ ] Rate limiting activates after 3 failed attempts
- [ ] Security headers (CSP, HSTS) are present
- [ ] Origin validation blocks unauthorized domains
- [ ] Health check endpoint responds

**🎯 When all tests pass, your production deployment is secure and ready!**