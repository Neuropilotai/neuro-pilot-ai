# 🔐 Security Guidelines

## Overview

This document outlines the security measures and best practices implemented in the Enterprise Inventory Management System.

## 🛡️ Security Features

### Authentication & Authorization
- **JWT-based Authentication** with short-lived access tokens (15min) and longer refresh tokens (7 days)
- **Role-Based Access Control (RBAC)** with four distinct roles:
  - `admin`: Full system access
  - `manager`: Management operations
  - `staff`: Day-to-day operations
  - `viewer`: Read-only access
- **Permission-based Authorization** for granular access control
- **Account Lockout** after 5 failed login attempts (30min lockout)
- **Password Requirements**: 8+ chars, uppercase, lowercase, numbers, special chars

### API Security
- **Rate Limiting**: 100 requests per 15min per IP
- **Auth Rate Limiting**: 5 auth attempts per 15min per IP  
- **CORS Protection** with whitelist of allowed origins
- **Security Headers** via Helmet.js:
  - Content Security Policy (CSP)
  - HTTP Strict Transport Security (HSTS)
  - X-Frame-Options
  - X-Content-Type-Options
  - Referrer Policy
- **Input Validation** on all endpoints using Joi/express-validator
- **SQL Injection Prevention** through parameterized queries
- **XSS Protection** via input sanitization

### Data Protection
- **Password Hashing** using bcrypt with 12 rounds
- **JWT Secret Management** via environment variables
- **Sensitive Data Filtering** in API responses
- **Audit Logging** of all critical operations
- **Request/Response Logging** for security monitoring

### Infrastructure Security
- **Environment Variable Protection** for secrets
- **Docker Security** best practices
- **SSL/TLS Encryption** in production
- **Process Isolation** and resource limits
- **Health Check Endpoints** for monitoring

## 🔒 Production Deployment Security

### Required Environment Variables

```bash
# Critical Security Settings
JWT_SECRET=minimum-32-character-secret-key
JWT_REFRESH_SECRET=different-32-character-secret
BCRYPT_ROUNDS=12
NODE_ENV=production

# Database Security
DATABASE_URL=encrypted-connection-string
DATABASE_SSL=require

# CORS & Networking
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
FORCE_HTTPS=true

# SSL Configuration
SSL_CERT_PATH=/etc/ssl/certs/inventory.crt  
SSL_KEY_PATH=/etc/ssl/private/inventory.key
```

### Security Headers Configuration

The system automatically applies these security headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### Rate Limiting Rules

| Endpoint Category | Limit | Window |
|------------------|--------|---------|
| General API | 100 req/15min | Per IP |
| Authentication | 5 req/15min | Per IP |
| Password Changes | 3 req/hour | Per User |
| Admin Operations | 50 req/15min | Per IP |

## 👤 User Roles & Permissions

### Admin Role
```json
{
  "permissions": [
    "inventory:read", "inventory:write", "inventory:delete",
    "orders:read", "orders:write", "orders:delete", 
    "users:read", "users:write", "users:delete",
    "reports:read", "audit:read", "settings:write"
  ]
}
```

### Manager Role  
```json
{
  "permissions": [
    "inventory:read", "inventory:write",
    "orders:read", "orders:write",
    "users:read", "reports:read"
  ]
}
```

### Staff Role
```json
{
  "permissions": [
    "inventory:read", "inventory:write", 
    "orders:read", "orders:write"
  ]
}
```

### Viewer Role
```json
{
  "permissions": [
    "inventory:read", "orders:read"
  ]
}
```

## 📊 Audit Logging

All security-relevant events are logged with the following information:

### Logged Events
- User authentication (login/logout)
- Failed login attempts  
- Account lockouts/unlocks
- Password changes/resets
- User creation/modification/deletion
- Inventory modifications
- Order processing
- Permission changes
- API access violations

### Log Format
```json
{
  "timestamp": "2025-08-19T12:00:00Z",
  "event": "login_attempt",
  "userId": "user_123",
  "ip": "192.168.1.100", 
  "userAgent": "Mozilla/5.0...",
  "success": true,
  "details": {...}
}
```

## 🚨 Security Incident Response

### Detection
- Failed authentication monitoring
- Unusual API usage patterns
- Privilege escalation attempts
- Data access anomalies

### Response Procedures
1. **Immediate**: Automatic account lockout for suspicious activity
2. **Investigation**: Review audit logs for incident scope
3. **Containment**: Disable compromised accounts
4. **Recovery**: Reset credentials, update security measures
5. **Documentation**: Log incident details and response actions

## 🔍 Security Monitoring

### Health Checks
- `GET /health` - System health status
- `GET /api` - API documentation and status

### Key Metrics to Monitor
- Failed authentication rate
- API response times
- Error rates by endpoint
- Active user sessions
- Database connection health
- Memory/CPU usage

### Alerting Thresholds
- > 10 failed logins from single IP in 5min
- > 50% increase in 4xx/5xx errors  
- > 2sec average response time
- > 80% memory/CPU utilization
- Database connection failures

## 🛠️ Security Testing

### Automated Security Scans
```bash
# Dependency vulnerability scanning
npm audit --audit-level high

# Static code analysis
npm run lint --security

# Container security scanning
docker scan inventory-enterprise:latest
```

### Manual Security Testing
- [ ] Authentication bypass attempts
- [ ] Authorization escalation tests
- [ ] Input validation testing
- [ ] SQL injection testing
- [ ] XSS vulnerability testing
- [ ] CSRF protection verification
- [ ] Rate limiting validation

## 📋 Security Checklist

### Pre-Production
- [ ] Change all default passwords
- [ ] Generate secure JWT secrets (32+ chars)
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS with valid certificates
- [ ] Set up database encryption
- [ ] Configure audit logging
- [ ] Test backup/restore procedures
- [ ] Validate rate limiting
- [ ] Review user permissions
- [ ] Security scan results clean

### Production Maintenance  
- [ ] Regular security updates
- [ ] Log monitoring and alerts
- [ ] Backup verification
- [ ] Access review (quarterly)
- [ ] Penetration testing (annually)
- [ ] Incident response plan updates

## 🆘 Emergency Contacts

| Role | Contact | Priority |
|------|---------|----------|
| Security Officer | security@neuro-pilot.ai | High |
| System Administrator | admin@neuro-pilot.ai | High |
| Development Team | dev@neuro-pilot.ai | Medium |
| Legal/Compliance | legal@neuro-pilot.ai | Low |

## 📞 Reporting Security Issues

To report security vulnerabilities:

1. **Email**: security@neuro-pilot.ai
2. **Subject**: [SECURITY] Brief description
3. **Include**: Detailed steps to reproduce
4. **Response Time**: 24 hours acknowledgment
5. **Resolution**: 7-14 days for critical issues

**Do not** report security issues through public channels like GitHub issues.

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security Guide](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Security Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)

---

**Last Updated**: August 19, 2025  
**Version**: 1.0  
**Next Review**: November 19, 2025