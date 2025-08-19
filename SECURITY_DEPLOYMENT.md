# Enterprise Security Deployment Guide

## 🔒 Production Security Checklist

### 1. Secrets Management (CRITICAL)

**Never store secrets in code or .env files committed to git!**

```bash
# Generate secure secrets
openssl rand -hex 64  # For JWT_SECRET
openssl rand -hex 64  # For REFRESH_SECRET  
openssl rand -hex 32  # For ENCRYPTION_KEY

# Set in Fly.io
fly secrets set JWT_SECRET=<your-secret>
fly secrets set REFRESH_SECRET=<your-secret>
fly secrets set ENCRYPTION_KEY=<your-secret>

# Or use environment variables in other platforms
export JWT_SECRET=$(openssl rand -hex 64)
export REFRESH_SECRET=$(openssl rand -hex 64)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 2. Cloudflare Setup (DDoS Protection)

1. **Add your domain to Cloudflare**
   - Change nameservers to Cloudflare's
   - Enable "Always Use HTTPS"
   - Set SSL/TLS to "Full (strict)"

2. **Configure WAF Rules**
```
# Rate limiting rule
(http.request.uri.path contains "/api/auth/login") 
  -> Rate limit: 5 requests per 15 minutes per IP

# Block suspicious patterns
(http.user_agent contains "scanner" or 
 http.user_agent contains "bot" and not 
 http.user_agent contains "googlebot")
  -> Block

# Geo-blocking (if needed)
(ip.geoip.country ne "US" and 
 ip.geoip.country ne "CA")
  -> Challenge
```

3. **Enable Security Features**
   - Bot Fight Mode: ON
   - Browser Integrity Check: ON
   - Challenge Passage: 30 minutes
   - Security Level: High

### 3. Database Security

```javascript
// Use connection pooling with SSL
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca-certificate.crt')
  },
  max: 20, // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

### 4. Redis for Token Storage

```javascript
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: true
  }
});

// Store refresh tokens with TTL
await client.setEx(`refresh:${tokenId}`, 604800, JSON.stringify({
  userId,
  deviceId,
  family,
  createdAt: Date.now()
}));

// Blacklist revoked tokens
await client.setEx(`blacklist:${accessToken}`, 900, '1'); // 15 min TTL
```

### 5. Monitoring & Alerts

```javascript
// Integrate with monitoring service
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    // Scrub sensitive data
    delete event.request?.cookies;
    delete event.request?.headers?.authorization;
    return event;
  }
});

// Log security events
function logSecurityEvent(event, details) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
    // Send to SIEM
  }));
}
```

### 6. Deployment Commands

```bash
# Build for production
npm run build

# Deploy to Fly.io
fly deploy --strategy immediate

# Scale for high availability
fly scale count 3 --region iad,ord,sea

# Set up health checks
fly checks add \
  --type http \
  --path /health \
  --interval 30s \
  --timeout 5s
```

### 7. Security Headers Verification

Test your deployment:
- https://securityheaders.com
- https://observatory.mozilla.org

Expected grade: A+

### 8. Backup & Recovery

```bash
# Automated backups (add to cron)
0 2 * * * pg_dump $DATABASE_URL | \
  openssl enc -aes-256-cbc -salt -k $BACKUP_KEY | \
  aws s3 cp - s3://backups/$(date +%Y%m%d).sql.enc

# Test restore procedure regularly
```

### 9. Incident Response Plan

1. **Detection**: Monitor logs for:
   - Multiple failed login attempts
   - Refresh token reuse
   - Unusual traffic patterns

2. **Response**:
   - Immediate: Block IP/User
   - Investigate: Check logs
   - Remediate: Rotate secrets if compromised

3. **Recovery**:
   - Reset affected accounts
   - Force re-authentication
   - Update security measures

### 10. Compliance Considerations

- **GDPR**: Implement data export/deletion endpoints
- **CCPA**: Privacy policy and opt-out mechanisms
- **SOC2**: Audit logging and access controls
- **PCI DSS**: If handling payments, use tokenization

## 🚀 Production Launch Checklist

- [ ] All secrets in environment variables/secret manager
- [ ] HTTPS enforced everywhere
- [ ] Cloudflare WAF configured
- [ ] Database using SSL connections
- [ ] Redis for session/token storage
- [ ] Monitoring and alerts set up
- [ ] Backup strategy implemented
- [ ] Security headers scoring A+
- [ ] Rate limiting tested under load
- [ ] Incident response plan documented
- [ ] First admin account created securely (no defaults)
- [ ] Audit logging enabled
- [ ] Penetration testing completed

## 📊 Performance Optimization

```nginx
# Nginx config for reverse proxy
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    
    location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:3000;
    }
    
    location /api {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
    }
}
```

## Cloudflare WAF & Edge Security (Finalized)

### DNS/TLS
- Orange-cloud the app CNAME -> Fly.
- TLS mode: **Full (strict)**.
- HSTS: `max-age=63072000; includeSubDomains; preload`.

### Firewall Rules

1) **Block state-changing requests from foreign Origins**
```
(http.request.method in {"POST" "PUT" "PATCH" "DELETE"} and 
 http.request.uri.path matches "^/auth/" and 
 not http.referer contains "yourdomain.com")
-> Block
```

2) **Rate limit login attempts**
```
(http.request.uri.path eq "/auth/login")
-> Rate limit: 3 requests per 15 minutes per IP
```

3) **Block suspicious User-Agents**
```
(http.user_agent contains "scanner" or 
 http.user_agent contains "sqlmap" or 
 http.user_agent contains "nikto" or
 http.user_agent eq "")
-> Block
```

4) **Geographic restrictions (if needed)**
```
(ip.geoip.country not in {"US" "CA" "GB"})
-> Challenge
```

5) **API rate limiting**
```
(http.request.uri.path matches "^/api/")
-> Rate limit: 100 requests per 15 minutes per IP
```

### WAF Managed Rules
- **OWASP Core Rule Set**: Enable with sensitivity "High"
- **Cloudflare Managed Ruleset**: Enable all rules
- **Cloudflare OWASP**: Enable with score threshold 40

### Bot Management
- **Bot Fight Mode**: ON
- **Super Bot Fight Mode**: ON (if available)
- **Challenge Passage**: 30 minutes
- **Browser Integrity Check**: ON

### Custom Rules for Token Security
```
# Block requests with malformed Authorization headers
(http.request.headers["authorization"][0] matches "Bearer [^A-Za-z0-9._-]")
-> Block

# Block requests with suspicious cookie patterns
(http.request.headers["cookie"][0] contains "javascript:" or
 http.request.headers["cookie"][0] contains "<script")
-> Block

# Rate limit refresh token endpoint specifically
(http.request.uri.path eq "/auth/refresh")
-> Rate limit: 20 requests per 15 minutes per IP
```

### Page Rules
1. **Cache static assets**:
   - URL: `yourdomain.com/*.css`, `yourdomain.com/*.js`, `yourdomain.com/*.png`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 month

2. **No cache for API**:
   - URL: `yourdomain.com/api/*`, `yourdomain.com/auth/*`
   - Cache Level: Bypass

### Security Headers (via Page Rules)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### DDoS Protection
- **HTTP DDoS Attack Protection**: ON
- **Network-layer DDoS Attack Protection**: ON
- **Adaptive DDoS Protection**: ON

### Access Control (if using Cloudflare Access)
```
# Protect admin endpoints
Policy: Require email domain "@yourcompany.com"
Application: yourdomain.com/admin/*

# Geographic access control
Policy: Require country in US, CA, GB
Application: yourdomain.com/auth/*
```

### Monitoring & Alerts
1. **Security Events**:
   - Alert on > 100 blocked requests per minute
   - Alert on > 10 failed login attempts per IP

2. **Performance**:
   - Alert on origin response time > 5 seconds
   - Alert on error rate > 1%

3. **WAF Alerts**:
   - Alert on OWASP score > 40
   - Alert on new attack patterns

### Emergency Response
```bash
# Emergency: Block all traffic except from your IP
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/rules" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filter": {"expression": "ip.src ne $YOUR_IP"},
    "action": "block",
    "description": "Emergency lockdown"
  }'

# Emergency: Enable Under Attack Mode
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/security_level" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value": "under_attack"}'
```

### Validation Checklist
- [ ] SSL Labs grade A+ (https://www.ssllabs.com/ssltest/)
- [ ] Security Headers grade A+ (https://securityheaders.com)
- [ ] No sensitive data in CF logs
- [ ] Rate limits tested under load
- [ ] WAF rules tested with attack simulations
- [ ] Emergency procedures documented and tested

## 🔐 Remember

1. **Security is ongoing**: Regular updates, audits, and training
2. **Defense in depth**: Multiple layers of security
3. **Least privilege**: Users and services get minimum required access
4. **Zero trust**: Verify everything, trust nothing
5. **Incident ready**: Have a plan before you need it