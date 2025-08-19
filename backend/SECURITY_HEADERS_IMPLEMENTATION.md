# Security Headers Implementation

## Overview

This document describes the security headers and middleware implemented in the Neuro Pilot AI backend server to protect against bots, DDoS attacks, and other security threats.

## Implemented Security Features

### 1. Content Security Policy (CSP)

```javascript
Content-Security-Policy:
  default-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  img-src 'self' data: https:;
  connect-src 'self' ws: wss:;
  frame-src 'none';
  object-src 'none';
```

**Purpose**: Prevents XSS attacks and unauthorized resource loading
**Google Fonts Support**: Allows Inter font from Google Fonts CDN

### 2. Rate Limiting (DDoS Protection)

- **General Rate Limit**: 100 requests per 15 minutes per IP
- **Auth Rate Limit**: 5 authentication attempts per 15 minutes per IP
- **Standards Compliant**: Uses `RateLimit-*` headers

### 3. Security Headers

- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Strict-Transport-Security` - Enforces HTTPS (production only)
- `X-Robots-Tag: noindex, nofollow` - Bot protection

### 4. Auth Endpoint Protection

Special middleware for `/auth/` endpoints to complement Cloudflare JS Challenge:

- `X-Auth-Protected: true`
- `X-Challenge-Required: js`
- `X-Bot-Protection: active`

### 5. Cache Control

Aggressive cache control to prevent sensitive data caching:

```
Cache-Control: no-cache, no-store, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

## Cloudflare Integration

The implementation works with the following Cloudflare rule:

```
http.request.uri.path contains "/auth/" and not cf.client.bot
Action: JS Challenge
```

## Incident Response Procedures

### Refresh Reuse Detection

- Revoke `familyId`
- Clear authentication cookies
- Notify user of security event
- Force re-authentication

### Secret Rotation

- Rotate `JWT_SECRET` and `REFRESH_SECRET`
- Use rolling deployment strategy
- Revoke all family tokens if compromise suspected

### Audit & Monitoring

- Ship authentication events to SIEM
- Alert on login failures
- Monitor for refresh token reuse spikes
- Track rate limit violations

## File Locations

- Main implementation: `backend/server.js` (lines 34-106)
- Security config: Applied at Express app level
- Rate limiting: Express middleware with in-memory store

## Testing

Security headers can be tested using:

```bash
curl -I http://localhost:8000/test
```

Expected headers include CSP, HSTS, X-Frame-Options, and custom auth protection headers.
