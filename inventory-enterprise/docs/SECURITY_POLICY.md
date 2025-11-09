# Security Policy
**Neuro.Pilot.AI V21.1 - Enterprise Inventory + POS System**

Last Updated: November 8, 2024
Version: 21.1 (Security Hardening Release)

---

## Overview

This document defines the security controls, policies, and compliance standards for the Neuro.Pilot.AI enterprise inventory and point-of-sale system. All security measures are production-deployed and actively enforced.

---

## 1. Authentication & Access Control

### 1.1 JWT Authentication

- **Algorithm**: HS256 (symmetric signing with `JWT_SECRET`)
- **Token Expiry**: 24 hours
- **Refresh Tokens**: 30-day expiry with automatic rotation
- **Device Binding**: Sessions tied to device fingerprint + IP address
- **Secure Storage**: Refresh tokens stored in `user_sessions` table with revocation support

### 1.2 Account Lockout

- **Threshold**: 5 failed login attempts
- **Lockout Duration**: 15 minutes
- **Tracking**: IP address + user ID logged in `account_lockouts` table
- **Notification**: Security event logged for `LOGIN_FAILED` events

### 1.3 Password Requirements

- **Minimum Length**: 12 characters
- **Complexity**: Must include uppercase, lowercase, number, and special character
- **Hashing**: bcrypt with 12 rounds
- **Storage**: Salted hashes only (never plaintext)
- **Rotation**: Recommended every 90 days for admin/owner roles

---

## 2. Transport Security (HTTPS)

### 2.1 TLS Configuration

- **Minimum Version**: TLS 1.2
- **Preferred Version**: TLS 1.3
- **Cipher Suites**: AES-256-GCM, ChaCha20-Poly1305
- **Certificate Authority**: Let's Encrypt (Railway auto-provisioned)
- **HSTS**: Enabled with 1-year max-age, includeSubDomains

### 2.2 Header Configuration

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
Referrer-Policy: strict-origin-when-cross-origin
```

Enforced via Helmet.js middleware (backend/middleware/privacy.js)

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Role Hierarchy

| Role     | Permissions                                                                 |
|----------|-----------------------------------------------------------------------------|
| **Owner**    | Full access (wildcard `*`)                                                  |
| **Admin**    | All CRUD operations, user management, reports, audit logs                    |
| **Manager**  | Items, recipes, menu, population, forecast, orders, POS, reports (no delete) |
| **Staff**    | Read items/recipes/menu, create/update orders and POS transactions          |
| **Viewer**   | Read-only access to items, recipes, menu, population, forecast, orders       |
| **Auditor**  | Audit logs, reports export, read-only system data                            |

### 3.2 Permission Matrix

Permissions use the format `resource:action` (e.g., `items:create`, `orders:delete`).

- Enforced in `backend/middleware/authorize.js`
- Permission matrix seeded in `backend/db/migrations/013_rbac_enforcement.sql`
- Database-backed: `user_roles` and `role_permissions` tables

### 3.3 Enforcement

- **Route Protection**: `authGuard(['admin', 'manager'])` on all sensitive endpoints
- **Fine-Grained Control**: `requirePermissions('items:delete')` for specific actions
- **Prometheus Metrics**: `permission_denials_total` counter tracks all denials

---

## 4. Audit Logging & Retention

### 4.1 What We Log

- All authentication attempts (success & failure)
- All data mutations (POST, PUT, PATCH, DELETE)
- All permission denials
- Privacy requests (GDPR/CCPA)
- PCI violations (card data detection)
- Rate limit violations

### 4.2 Audit Trail Schema

Table: `audit_log`

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  org_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER REFERENCES users(id),
  ip_address INET,
  metadata JSONB,
  success BOOLEAN DEFAULT TRUE,
  latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.3 Retention Policy

- **Standard Logs**: 7 years (2,555 days) from creation
- **PCI Compliance**: Payment transaction logs retained indefinitely
- **GDPR Anonymization**: After 90 days, PII in audit logs is anonymized (email masked)
- **Partitioning**: Monthly partitions recommended for high-volume (TBD)

### 4.4 Secret Redaction

All audit logs automatically redact:
- Passwords, tokens, API keys, JWTs
- Authorization headers
- Session IDs, secrets

Implemented in `backend/middleware/audit.js:redactSecrets()`

---

## 5. Privacy & Data Protection (GDPR/CCPA)

### 5.1 GDPR Rights

| Right                     | Implementation                                                                 |
|---------------------------|--------------------------------------------------------------------------------|
| **Right to Access**       | `/api/privacy/export` - JSON export of all user data                           |
| **Right to Erasure**      | `/api/privacy/delete` - Soft delete + 30-day hard delete                       |
| **Right to Portability**  | `/api/privacy/export` - Structured JSON with orders, audit trail, profile      |
| **Right to Rectification**| Standard user profile update endpoints                                         |

### 5.2 CCPA Compliance

- **Do Not Sell**: `/api/privacy/do-not-sell` endpoint to set preference
- **Privacy Preferences**: Stored in `privacy_preferences` table
- **Third-Party Sharing**: Currently NONE (no data sold to third parties)

### 5.3 Data Deletion Workflow

1. User requests deletion via `/api/privacy/delete`
2. Account marked `deleted_at = NOW()`
3. 30-day grace period for account recovery
4. After 30 days: Cron job hard-deletes user, anonymizes orders, removes sessions
5. Audit logs: PII masked, but records retained for compliance (7 years)

---

## 6. Payment Card Industry (PCI DSS)

### 6.1 Compliance Level

**PCI DSS SAQ A** (Card-not-present, third-party processor)

- Merchant Category: Restaurant/Food Service
- Card Data Scope: **ZERO** - No card data stored, processed, or transmitted
- Terminal Integration: External payment terminals only (Square, Stripe Terminal, etc.)

### 6.2 Prohibited Data

The following data **MUST NEVER** be transmitted or stored:

- Card numbers (PAN)
- CVV/CVV2/CVC2
- PIN codes
- Magnetic stripe data
- Expiration dates

### 6.3 Enforcement

- **Middleware**: `backend/middleware/payments.validate.js`
- **Detection**: Regex patterns scan all payment requests for forbidden card data
- **Rejection**: HTTP 400 with error code `FORBIDDEN_CARD_DATA`
- **Logging**: PCI violations logged to `security_events` table (severity: `critical`)
- **Metrics**: `pci_violations_total` Prometheus counter

### 6.4 Allowed Payment Flow

**Cash Payment:**
```json
{
  "method": "cash",
  "amount": 45.67,
  "tendered": 50.00,
  "reference": "CASH-1699564820"
}
```

**Card Payment:**
```json
{
  "method": "card",
  "amount": 45.67,
  "reference": "TERM-AUTH-XYZ123" // Terminal authorization code ONLY
}
```

Server validates:
- Amount > 0
- No duplicate references (last 24 hours)
- Server recomputes totals (client values ignored)

---

## 7. Rate Limiting & DoS Protection

### 7.1 Token Bucket Algorithm

- **Implementation**: PostgreSQL PL/pgSQL function `consume_tokens()`
- **Buckets**: Per (org_id, site_id, user_id, route)
- **Default Capacity**: 100 tokens
- **Refill Rate**: 10 tokens/minute
- **Burst**: 1 token per request

### 7.2 Route-Specific Limits

| Route                | Capacity | Refill/min | Notes                          |
|----------------------|----------|------------|--------------------------------|
| `/api/auth/login`    | 5        | 1          | Prevents brute force           |
| `/api/auth/refresh`  | 20       | 5          | Token refresh limit            |
| `/api/items`         | 100      | 10         | Standard CRUD                  |
| `/api/orders`        | 200      | 20         | High-volume POS operations     |
| `/api/reports/pdf`   | 10       | 2          | CPU-intensive operations       |

### 7.3 Response

When rate-limited:
```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many requests. Try again in 60 seconds.",
  "retryAfter": 60
}
```

HTTP Status: `429 Too Many Requests`

---

## 8. Security Monitoring & Metrics

### 8.1 Prometheus Endpoints

**Metrics Endpoint**: `https://inventory-backend-7-agent-build.up.railway.app/metrics`

Key Metrics:
- `auth_attempts_total{result, role}` - Login success/failure by role
- `permission_denials_total{role, permission, route}` - RBAC denials
- `audit_events_total{action, success}` - All audit events
- `pci_violations_total{type}` - Card data detection attempts
- `payment_validations_total{method, result}` - Payment validation outcomes
- `security_events_total` - High-severity security events

### 8.2 Security Events Table

Table: `security_events`

Logged events:
- `LOGIN_FAILED` - Failed authentication (severity: warning)
- `PERMISSION_DENIED` - RBAC denial (severity: warning)
- `PCI_VIOLATION` - Card data detected (severity: critical)
- `ACCOUNT_LOCKED` - Lockout triggered (severity: warning)
- `SESSION_EXPIRED` - Token expiry (severity: info)
- `RATE_LIMIT_EXCEEDED` - Quota exhausted (severity: warning)

### 8.3 Alerting (Recommended)

- **Critical Events**: Alert on `severity = 'critical'` within 5 minutes
- **Failed Logins**: Alert on >10 failures from same IP in 10 minutes
- **PCI Violations**: Immediate alert (zero tolerance)

---

## 9. Incident Response

### 9.1 Contact List

| Role                  | Contact                          | Responsibility                     |
|-----------------------|----------------------------------|------------------------------------|
| **Security Lead**     | security@neuropilot.ai           | Incident triage, coordination      |
| **CTO**               | cto@neuropilot.ai                | Strategic decisions, escalation    |
| **Data Protection Officer** | dpo@neuropilot.ai          | GDPR/CCPA violations               |
| **External Auditor**  | auditor@example.com              | Compliance reviews, pen testing    |

### 9.2 Incident Severity

| Level | Description                                      | Response Time |
|-------|--------------------------------------------------|---------------|
| **P0** | Data breach, PCI violation, system compromise   | < 15 minutes  |
| **P1** | Authentication bypass, privilege escalation     | < 1 hour      |
| **P2** | DoS attack, mass account lockout                | < 4 hours     |
| **P3** | Security misconfig, non-critical vulnerability  | < 24 hours    |

### 9.3 Response Workflow

1. **Detection**: Prometheus alert → Slack/PagerDuty
2. **Triage**: Security Lead assesses severity
3. **Containment**: Disable affected accounts/routes
4. **Investigation**: Query `audit_log` and `security_events`
5. **Remediation**: Patch, rotate secrets, notify users
6. **Post-Mortem**: Document in incident log, update runbooks

---

## 10. Secure Development Practices

### 10.1 Code Review

- All code changes reviewed by ≥1 senior engineer
- Security-sensitive changes (auth, RBAC, PCI) require ≥2 reviews
- Automated checks: ESLint, dependency vulnerability scanning

### 10.2 Dependency Management

- `npm audit` run weekly
- Critical vulnerabilities patched within 48 hours
- Dependencies pinned in `package-lock.json`

### 10.3 Secrets Management

- **Environment Variables**: All secrets in Railway environment variables
- **NO HARDCODING**: Zero secrets in codebase
- **Rotation**: JWT_SECRET rotated every 180 days
- **Access Control**: Only owner/CTO have Railway production access

---

## 11. Vulnerability Disclosure

### 11.1 Reporting

Email security vulnerabilities to: **security@neuropilot.ai**

Include:
- Vulnerability description
- Steps to reproduce
- Impact assessment
- Suggested fix (optional)

### 11.2 Response SLA

- **Acknowledgment**: Within 24 hours
- **Triage**: Within 3 business days
- **Fix**: Within 30 days (critical), 90 days (non-critical)

### 11.3 Bug Bounty (Future)

Currently no formal bug bounty program. Good-faith security researchers acknowledged in SECURITY.md.

---

## 12. Compliance Summary

| Standard     | Status       | Evidence                                               |
|--------------|--------------|--------------------------------------------------------|
| **GDPR**     | ✅ Compliant | Privacy endpoints, 30-day deletion, audit retention    |
| **CCPA**     | ✅ Compliant | Do-not-sell support, data export, user rights          |
| **PCI DSS**  | ✅ SAQ A     | Zero card data storage, server-side validation         |
| **SOC 2**    | 🔄 In Progress | Audit logging, RBAC, encryption at rest/transit        |
| **HIPAA**    | ❌ N/A       | No PHI processed                                       |

---

## 13. Security Roadmap (V22.0)

- [ ] Multi-Factor Authentication (TOTP, SMS backup)
- [ ] IP Allowlisting for owner/admin roles
- [ ] Automated penetration testing (quarterly)
- [ ] SOC 2 Type II certification
- [ ] Encryption at rest for database (Railway native encryption)
- [ ] Hardware security module (HSM) for JWT signing keys

---

## Approval

**Approved by:**
David Mikulis, Owner
November 8, 2024

**Next Review:** February 8, 2025 (Quarterly)

---

*For questions, contact security@neuropilot.ai*
