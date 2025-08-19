# 🚀 Final Production Deployment Guide

## ✅ Pre-Flight Security Checklist

### 1. Secrets Generation & Validation
```bash
# Generate secure admin hash (cost 12+)
node -e "require('bcrypt').hash('YOUR-SECURE-ADMIN-PASSWORD', 12).then(h=>console.log('ADMIN_HASH=' + h))"

# Verify no secret fallbacks in code
grep -r "default.*secret\|fallback.*secret" backend/ || echo "✅ No secret fallbacks found"
```

### 2. Fly.io Infrastructure
```bash
# One-time volume creation
fly volumes create data --size 10 --region yul

# Set production secrets (paste your ADMIN_HASH)
fly secrets set \
  NODE_ENV=production \
  ALLOWED_ORIGINS="https://inventory.neuropilot.ai" \
  ADMIN_EMAIL="admin@secure-inventory.com" \
  ADMIN_HASH="$2b$12$YOUR_HASH_HERE" \
  JWT_SECRET="$(openssl rand -hex 64)" \
  REFRESH_SECRET="$(openssl rand -hex 64)" \
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

### 3. Domain & DNS Configuration
- [ ] `inventory.neuropilot.ai` CNAME → Fly.io app URL
- [ ] Cloudflare DNS orange-clouded (proxied)
- [ ] SSL/TLS mode: **Full (Strict)**
- [ ] HSTS enabled with preload

## 🚀 Deploy
```bash
fly deploy
```

## 🛡️ Cloudflare Edge Security

### Required Firewall Rules

**1. Block Foreign Origins**
```
Expression: (http.request.method in {"POST" "PUT" "DELETE" "PATCH"}) and (http.request.headers["origin"] != "https://inventory.neuropilot.ai") and (http.request.headers["origin"] != "")
Action: Block
```

**2. Rate Limit Login**
```
Expression: http.request.uri.path eq "/auth/login"
Action: Rate Limit (3 requests per 15 minutes per IP)
```

**3. Rate Limit Refresh**
```
Expression: http.request.uri.path eq "/auth/refresh"
Action: Rate Limit (20 requests per 15 minutes per IP) OR JS Challenge
```

**4. Bot Protection**
```
Expression: http.request.uri.path contains "/auth/" and not cf.client.bot
Action: JS Challenge
```

## 🧪 Post-Deploy Verification

### Automated Testing
```bash
# Run comprehensive security verification
./deploy-verify-enhanced.sh YOUR-ADMIN-PASSWORD

# Expected results:
# ✅ Secure authentication flow working
# ✅ Token rotation and reuse detection active
# ✅ Security headers present
# ✅ CORS/Origin validation functional
# ✅ Rate limiting configured
# ✅ HTTPS enforced
```

### Manual Security Verification

**A. Secure Login & Cookie**
```bash
curl -i -X POST https://inventory.neuropilot.ai/auth/login \
  -H 'Origin: https://inventory.neuropilot.ai' \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@secure-inventory.com","password":"YOUR-PASSWORD"}'
```
*Expected: `Set-Cookie: rt=...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh`*

**B. Origin Blocking**
```bash
curl -i -X POST https://inventory.neuropilot.ai/auth/login \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  --data '{"email":"x","password":"y"}'
```
*Expected: `403 Forbidden`*

**C. Security Headers**
```bash
curl -I https://inventory.neuropilot.ai | egrep 'strict-transport|content-security'
```
*Expected: HSTS and CSP headers present*

**D. Refresh Token Rotation Test**
1. Login → Save `rt=` cookie
2. Refresh with cookie → Get new token + new cookie
3. Reuse old cookie → Get `401 Unauthorized`

## 🔭 Production Observability

### Structured Logging Implementation
```javascript
// Add to your application
function logAuth(event, data) {
  console.log(JSON.stringify({
    evt: `auth.${event}`,
    userId: data.userId,
    deviceId: data.deviceId,
    ip: data.ip,
    userAgent: data.userAgent,
    at: new Date().toISOString()
  }));
}

// Usage
logAuth("login.success", { userId, deviceId, ip: req.ip });
logAuth("login.failure", { email, reason: "invalid_password", ip: req.ip });
logAuth("refresh.rotate", { userId, deviceId, familyId });
logAuth("refresh.reuse", { userId, deviceId, familyId, ip: req.ip });
```

### Critical Alerts Configuration
```yaml
# Better Stack / Grafana Cloud Loki alerts
alerts:
  - name: "High Login Failures"
    query: 'count by (ip) (rate(auth_login_failure[10m])) > 5'
    action: "immediate_notification"
    
  - name: "Refresh Token Reuse"
    query: 'increase(auth_refresh_reuse[1m]) > 0'
    action: "critical_alert"
    
  - name: "High Error Rate"
    query: 'rate(http_5xx[5m]) / rate(http_total[5m]) > 0.01'
    action: "notification"
```

### Backup & Disaster Recovery
```bash
#!/bin/bash
# backup-production.sh - Run nightly via cron

BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="backup-${BACKUP_DATE}.tar.gz"

# Backup Fly volume
fly ssh console -C "tar -czf - /data" > "$BACKUP_FILE"

# Upload to Google Drive (requires rclone configuration)
rclone copy "$BACKUP_FILE" gdrive:backups/neuro-pilot-inventory/

# Cleanup local backup
rm "$BACKUP_FILE"

# Cleanup old backups (keep 7 days)
rclone delete gdrive:backups/neuro-pilot-inventory/ --min-age 7d

echo "Backup completed: $BACKUP_FILE"
```

## 📈 Scaling Considerations

### Multi-Instance Deployment (Optional)
When scaling beyond single VM, migrate refresh tokens to Postgres:

```bash
# Add Postgres addon
fly postgres create --name neuro-pilot-db --region yul

# Run migration
psql $DATABASE_URL < POSTGRES_MIGRATION.sql

# Update secrets
fly secrets set DATABASE_URL="postgres://..."
```

### Canary Deployment Strategy
```bash
# Scale to 2 instances for canary testing
fly scale count 2

# Deploy with health check monitoring
fly deploy --strategy canary

# Monitor metrics for 10 minutes
fly logs -a neuro-pilot-inventory | grep -E "(ERROR|5[0-9]{2})"

# Rollback if needed
fly deploy --strategy immediate --image <previous_image>
```

## ✅ Production Readiness Checklist

### Security
- [ ] All secrets set via environment (no fallbacks)
- [ ] HTTPS enforced with HSTS
- [ ] CSP headers prevent XSS
- [ ] CORS restricted to production origin only
- [ ] Rate limiting active on auth endpoints
- [ ] Refresh token rotation working
- [ ] Token reuse detection functional

### Infrastructure  
- [ ] Health checks passing
- [ ] Volume mounted and persistent
- [ ] Cloudflare edge protection active
- [ ] DNS properly configured
- [ ] SSL/TLS Full (Strict) mode

### Monitoring
- [ ] Structured logging implemented
- [ ] Critical alerts configured
- [ ] Log shipping to observability platform
- [ ] Backup automation in place
- [ ] Error rate monitoring active

### Operational
- [ ] Incident response procedures documented
- [ ] Rollback strategy tested
- [ ] Scaling plan prepared
- [ ] Disaster recovery tested

## 🎯 Success Criteria

Your production deployment is secure and ready when:

1. **All verification tests pass** (`deploy-verify-enhanced.sh`)
2. **Security headers present** (CSP, HSTS, X-Frame-Options)
3. **Authentication flow secure** (HttpOnly cookies, token rotation)
4. **Rate limiting functional** (429 responses after limits)
5. **Origin validation working** (403 for foreign origins)
6. **Monitoring active** (alerts configured and tested)

## 🚨 Post-Launch Monitoring

### First 24 Hours
- Monitor authentication success/failure rates
- Watch for any refresh token reuse incidents
- Verify rate limiting is working effectively
- Check error rates and response times

### Ongoing Security
- Weekly security header checks
- Monthly penetration testing
- Quarterly security review
- Regular dependency updates

**🛡️ Your production deployment is now enterprise-grade secure!**