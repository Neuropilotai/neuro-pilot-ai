# Security Test Script

## A. Create Admin Hash

```bash
node -e "require('bcrypt').hash(process.argv[1], 12).then(h=>console.log(h))" 'YOUR-ADMIN-PASSWORD'
```

## B. Run Locally

```bash
export ALLOWED_ORIGINS="http://localhost:3000"
export ADMIN_EMAIL="admin@secure-inventory.com"
export ADMIN_HASH="<paste_bcrypt_hash_from_above>"
export JWT_SECRET=$(openssl rand -hex 64)
export REFRESH_SECRET=$(openssl rand -hex 64)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
node backend/enterprise-secure-server.js
```

## C. Exercise Flows

### 1. Login (expect accessToken + refresh cookie)

```bash
curl -i -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  --data '{"email":"admin@secure-inventory.com","password":"YOUR-ADMIN-PASSWORD"}'
```

### 2. Refresh (expect new accessToken and rotated refresh cookie)

```bash
# Copy the Set-Cookie: rt=... value from step 1, then:
curl -i -X POST http://localhost:3000/auth/refresh \
  -H 'Origin: http://localhost:3000' \
  --cookie "rt=<paste_refresh_cookie_value>"
```

### 3. Reuse OLD refresh (should revoke family and return 401)

```bash
curl -i -X POST http://localhost:3000/auth/refresh \
  -H 'Origin: http://localhost:3000' \
  --cookie "rt=<old_refresh_value>"
```

## Expected Results

- **Login**: 200 OK with accessToken and Set-Cookie header
- **Fresh Refresh**: 200 OK with new accessToken and rotated cookie
- **Reused Refresh**: 401 Unauthorized (family revoked)
